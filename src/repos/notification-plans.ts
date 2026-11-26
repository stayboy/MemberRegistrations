import { createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import {
  ConflictError,
  FlierTooLargeError,
  NotFoundError,
  UnsupportedFlierError,
  ValidationError,
} from '../errors/domain-errors.js';
import {
  EMAIL_TEXT_VARIABLES,
  NOTIFICATION_BODY_VARIABLES,
  assertKnownVariables,
  resolvedValues,
  type NotificationValues,
} from '../domain/notifications/variables.js';
import {
  DEFAULT_USSD_BUDGET,
  renderEmail,
  renderSms,
  renderUssd,
  renderWhatsApp,
  validateEmailDocument,
  type EmailNode,
  type FlierReference,
  type RenderedEmail,
  type RenderedSms,
  type RenderedUssd,
  type RenderedWhatsApp,
} from '../domain/notifications/render.js';
import {
  assertIfMatch,
  assertSlotAnchors,
  assertSlots,
  planEtag,
  revisionToWrite,
  type PlanEventFacts,
  type PlanRevisionFact,
  type PlanSlotInput,
} from '../domain/notifications/plan.js';
import { memberMatchesEventAudiences } from '../domain/event-audiences.js';
import { PHOTO_MAX_BYTES, mediaTypeOf, sniffPhotoType } from '../domain/photos.js';
import {
  notificationDefaultsSchema,
  notificationPlanSchema,
  type NotificationChannel,
  type NotificationDefaultsWrite,
  type NotificationPlanWrite,
  type NotificationSlotInput,
} from '../schemas/notifications.js';
import type { Db, DbClient, Row } from '../db/sql.js';
import { audienceRegister, type RegisterMember } from './audience-members.js';
import { audienceRules, eventAudiences } from './event-audiences.js';
import { cadenceAllows } from '../domain/notifications/skip.js';
import { eventPeriodId, preferenceStates, resolveRecipients } from './notification-recipients.js';
import { flierStorageKey, type FlierLocator, type FlierStore } from '../storage/flier-store.js';

export type NotificationPlanDetail = z.infer<typeof notificationPlanSchema>;
export type NotificationPlan = NotificationPlanDetail;
export type NotificationDefaults = z.infer<typeof notificationDefaultsSchema>;

export interface FlierMeta {
  token: string;
  contentType: 'image/webp' | 'image/jpeg' | 'image/png';
  byteSize: number;
  sha256: string;
  url: string;
  uploadedAt: string;
}

export interface NotificationPreview {
  revision: number;
  at: string;
  renders: {
    email: RenderedEmail;
    whatsapp: RenderedWhatsApp;
    sms: RenderedSms;
    ussd: RenderedUssd;
  };
  counts: { audience: number; email: number; whatsapp: number; sms: number; ussd: number };
  sample: { memberNo: string; displayName: string } | null;
  excluded: {
    counts: {
      channel_blocked: number;
      event_muted: number;
      period_muted: number;
      cadence_filtered: number;
      no_contact: number;
    };
    sample: Array<{ memberNo: string; displayName: string }>;
  };
}

/** The standard slot template every new plan starts from (FR-31, AC-40). */
export const DEFAULT_SLOT_TEMPLATE: NotificationSlotInput[] = [
  { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
  { kind: 'reminder', anchor: 'event_start', offsetMinutes: -1440 },
  { kind: 'starts', anchor: 'occurrence_start', offsetMinutes: 0 },
  { kind: 'last', anchor: 'occurrence_end', offsetMinutes: -1440 },
];

export const DEFAULT_CHURCH_NAME = 'The Church';

const PUBLISH_UNAVAILABLE = {
  enabled: true,
  reason: 'Publishing materialises instances and fans them out to the audience.',
};

/**
 * The content token publish pins (N-3, FR-17). It hashes the revision's slots,
 * templates and flier, because a draft edits in place and the revision number
 * cannot tell two drafts apart.
 */
function planContentEtag(
  slots: readonly SlotRow[],
  templates: readonly TemplateRow[],
  flierToken: string | null,
): string {
  const payload = JSON.stringify({
    slots: slots.map((slot) => ({
      kind: slot.kind,
      anchor: slot.anchor,
      offsetMinutes: slot.offset_minutes,
    })),
    templates: templates.map((template) => template.channel).sort(),
    flier: flierToken,
  });
  return `"c${createHash('sha256').update(payload).digest('hex').slice(0, 16)}"`;
}

function isoTimestamp(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function flierUrl(token: string): string {
  return `/fliers/${token}`;
}

export function displayName(
  firstName: string | null,
  lastName: string | null,
  otherNames: string | null,
): string {
  return [firstName, lastName, otherNames].filter((part) => part && part.trim()).join(' ');
}

interface EventRow extends Row {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  venue_name: string | null;
  period_name: string | null;
}

interface OccurrenceRow extends Row {
  date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
}

interface PlanRow extends Row {
  id: string;
  next_revision: number;
}

interface RevisionRow extends Row {
  revision: number;
  status: PlanRevisionFact['status'];
  published_at: Date | string | null;
  cancelled_at: Date | string | null;
}

interface SlotRow extends Row {
  id: string;
  kind: PlanSlotInput['kind'];
  anchor: PlanSlotInput['anchor'];
  offset_minutes: number;
  sort_order: number;
}

interface TemplateRow extends Row {
  channel: NotificationChannel;
  subject: string | null;
  body_json: unknown;
  body_text: string | null;
  template_name: string | null;
  parameter_map: unknown;
}

interface FlierRow extends Row {
  token: string;
  storage: 's3' | 'db';
  storage_key: string | null;
  bytes: Uint8Array | null;
  content_type: 'image/webp' | 'image/jpeg' | 'image/png';
  byte_size: number;
  sha256: string;
  uploaded_at: Date | string;
}

interface EventContext {
  event: EventRow;
  facts: PlanEventFacts;
}

/**
 * The authoring and preview surface of a notification plan
 * (member-registrations-event-notifications.md N-2, N-3, N-5, N-7, N-9, N-12).
 *
 * There is no publish path in this round: the repository honours a revision the
 * database already marks published (it is frozen), but nothing here sets that
 * status, and `publish.enabled` is false with its reason on every read.
 */
export class NotificationPlanRepository {
  constructor(
    private readonly db: Db,
    private readonly flierStore: FlierStore,
    /** The deployed trigger cadence (N-8, FR-41); `0` is continuous. */
    private readonly triggerMinutes: number = 0,
  ) {}

  private async eventContext(client: DbClient, eventId: string): Promise<EventContext> {
    const [event] = await client.query<EventRow>(
      `select e.id,
              e.name,
              coalesce(
                (select min(o.date) from event_occurrences o where o.event_id = e.id),
                (e.created_at at time zone e.timezone)::date
              )::text as start_date,
              coalesce(
                (select max(o.date) from event_occurrences o where o.event_id = e.id),
                (e.created_at at time zone e.timezone)::date
              )::text as end_date,
              e.start_time, e.end_time, e.timezone, e.venue_name, e.period_name
         from events e
        where e.id = $1`,
      [eventId],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    const occurrences = await client.query<OccurrenceRow>(
      `select date::text as date, start_time, end_time, status
         from event_occurrences
        where event_id = $1
        order by date`,
      [eventId],
    );
    return {
      event,
      facts: {
        startDate: event.start_date,
        endDate: event.end_date,
        startTime: event.start_time,
        endTime: event.end_time,
        timezone: event.timezone,
        occurrences: occurrences.map((occurrence) => ({
          date: occurrence.date,
          startTime: occurrence.start_time,
          endTime: occurrence.end_time,
          status: occurrence.status,
        })),
      },
    };
  }

  private async planRow(client: DbClient, eventId: string): Promise<PlanRow | null> {
    const [plan] = await client.query<PlanRow>(
      'select id, next_revision from notification_plans where event_id = $1',
      [eventId],
    );
    return plan ?? null;
  }

  private async revisions(client: DbClient, planId: string): Promise<RevisionRow[]> {
    return client.query<RevisionRow>(
      `select revision, status, published_at, cancelled_at
         from notification_plan_revisions
        where plan_id = $1
        order by revision`,
      [planId],
    );
  }

  private async slots(client: DbClient, planId: string, revision: number): Promise<SlotRow[]> {
    return client.query<SlotRow>(
      `select id, kind, anchor, offset_minutes, sort_order
         from notification_plan_slots
        where plan_id = $1 and revision = $2
        order by sort_order`,
      [planId, revision],
    );
  }

  private async templates(
    client: DbClient,
    planId: string,
    revision: number,
  ): Promise<TemplateRow[]> {
    const channelOrder: Record<string, number> = { email: 0, whatsapp: 1, sms: 2, ussd: 3 };
    const rows = await client.query<TemplateRow>(
      `select channel, subject, body_json, body_text, template_name, parameter_map
         from notification_templates
        where plan_id = $1 and revision = $2`,
      [planId, revision],
    );
    return rows.sort(
      (left, right) => (channelOrder[left.channel] ?? 9) - (channelOrder[right.channel] ?? 9),
    );
  }

  private async flierRow(
    client: DbClient,
    planId: string,
    revision: number,
  ): Promise<FlierRow | null> {
    const [row] = await client.query<FlierRow>(
      `select token, storage, storage_key, bytes, content_type, byte_size, sha256, uploaded_at
         from event_fliers
        where plan_id = $1 and revision = $2`,
      [planId, revision],
    );
    return row ?? null;
  }

  private toFlierMeta(row: FlierRow | null): FlierMeta | null {
    if (!row) return null;
    return {
      token: row.token,
      contentType: row.content_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      url: flierUrl(row.token),
      uploadedAt: isoTimestamp(row.uploaded_at)!,
    };
  }

  private async highestRevision(client: DbClient, planId: string): Promise<number> {
    const revisions = await this.revisions(client, planId);
    return revisions.length > 0 ? Math.max(...revisions.map((row) => row.revision)) : 0;
  }

  private async detail(
    client: DbClient,
    eventId: string,
    plan: PlanRow | null,
  ): Promise<NotificationPlanDetail> {
    if (!plan) {
      return {
        planId: null,
        eventId,
        revision: 1,
        status: 'draft',
        etag: planEtag(0),
        contentEtag: planContentEtag([], [], null),
        slots: [],
        templates: [],
        flier: null,
        revisions: [],
        publish: PUBLISH_UNAVAILABLE,
      };
    }
    const revisions = await this.revisions(client, plan.id);
    const highest = revisions.length > 0 ? Math.max(...revisions.map((row) => row.revision)) : 0;
    const current = revisions.find((row) => row.revision === highest);
    const slots = highest > 0 ? await this.slots(client, plan.id, highest) : [];
    const templates = highest > 0 ? await this.templates(client, plan.id, highest) : [];
    const flier = highest > 0 ? await this.flierRow(client, plan.id, highest) : null;

    return {
      planId: plan.id,
      eventId,
      revision: highest > 0 ? highest : 1,
      status: current?.status ?? 'draft',
      etag: planEtag(highest),
      contentEtag: planContentEtag(slots, templates, flier?.token ?? null),
      slots: slots.map((slot) => ({
        id: slot.id,
        kind: slot.kind,
        anchor: slot.anchor,
        offsetMinutes: slot.offset_minutes,
        sortOrder: slot.sort_order,
      })),
      templates: templates.map((template) => ({
        channel: template.channel,
        subject: template.subject,
        body: (template.body_json as Record<string, unknown> | null) ?? null,
        bodyText: template.body_text,
        templateName: template.template_name,
        parameterMap: (template.parameter_map as Record<string, number> | null) ?? null,
      })),
      flier: this.toFlierMeta(flier),
      revisions: revisions.map((row) => ({
        revision: row.revision,
        status: row.status,
        publishedAt: isoTimestamp(row.published_at),
        cancelledAt: isoTimestamp(row.cancelled_at),
      })),
      publish: PUBLISH_UNAVAILABLE,
    };
  }

  /** The plan an event has or would have; an event with no plan reads empty. */
  async read(eventId: string): Promise<NotificationPlanDetail> {
    const context = await this.eventContext(this.db, eventId);
    const plan = await this.planRow(this.db, eventId);
    return this.detail(this.db, context.event.id, plan);
  }

  private assertTemplateVariables(templates: NotificationPlanWrite['templates']): void {
    const channels = new Set<string>();
    for (const template of templates) {
      if (channels.has(template.channel)) {
        throw new ValidationError(
          `templates: ${template.channel} appears more than once`,
          'duplicate_template',
        );
      }
      channels.add(template.channel);
      switch (template.channel) {
        case 'email': {
          validateEmailDocument(template.body);
          assertKnownVariables(template.subject);
          for (const text of emailTexts(template.body as unknown as EmailNode)) {
            assertKnownVariables(text);
          }
          assertKnownVariables(template.bodyText, EMAIL_TEXT_VARIABLES);
          break;
        }
        case 'whatsapp': {
          for (const name of Object.keys(template.parameterMap)) {
            if (!(NOTIFICATION_BODY_VARIABLES as readonly string[]).includes(name)) {
              throw new ValidationError(
                `templates.whatsapp.parameterMap.${name}: unknown variable {{${name}}}`,
                'unknown_variable',
              );
            }
          }
          break;
        }
        case 'sms':
        case 'ussd':
          assertKnownVariables(template.bodyText);
          break;
      }
    }
  }

  /** The defaults' standard slot template, copied into a plan that has none (AC-40). */
  private async defaultSlots(client: DbClient): Promise<NotificationSlotInput[]> {
    const [row] = await client.query<{ slots: unknown }>(
      "select slots from notification_defaults where id = 'church'",
    );
    if (!row) return DEFAULT_SLOT_TEMPLATE;
    const parsed = notificationDefaultsSchema.shape.slots.safeParse(row.slots);
    return parsed.success ? parsed.data : DEFAULT_SLOT_TEMPLATE;
  }

  /**
   * One PUT writes the whole revision (round grill 5). A draft edits in place; a
   * published or cancelled revision is frozen, so the write lands on revision + 1
   * with its own slots and templates and the old one keeps its own (N-3).
   */
  async write(
    eventId: string,
    input: NotificationPlanWrite,
    actor: string,
    ifMatch?: string,
  ): Promise<NotificationPlanDetail> {
    const context = await this.eventContext(this.db, eventId);
    const now = new Date();

    return this.db.transaction(async (tx) => {
      let plan = await this.planRow(tx, eventId);
      if (!plan) {
        const [created] = await tx.query<PlanRow>(
          `insert into notification_plans (event_id, created_by, updated_by)
           values ($1, $2, $2)
           on conflict (event_id) do nothing
           returning id, next_revision`,
          [eventId, actor],
        );
        plan = created ?? (await this.planRow(tx, eventId));
      }
      if (!plan) throw new ConflictError('The plan could not be created', 'plan_conflict');

      const revisions = await this.revisions(tx, plan.id);
      const highest = revisions.length > 0 ? Math.max(...revisions.map((row) => row.revision)) : 0;
      assertIfMatch(ifMatch, highest);

      const target = revisionToWrite(revisions);
      const sourceSlots = highest > 0 ? await this.slots(tx, plan.id, highest) : [];
      const slots =
        input.slots ??
        (sourceSlots.length > 0
          ? sourceSlots.map((slot) => ({
              kind: slot.kind,
              anchor: slot.anchor,
              offsetMinutes: slot.offset_minutes,
            }))
          : await this.defaultSlots(tx));

      this.assertTemplateVariables(input.templates);
      // The duplicate-instant rule is checked against the event's own facts.
      assertSlots(slots, context.facts, now);

      if (target.createsRevision) {
        await tx.query(
          `insert into notification_plan_revisions
             (plan_id, revision, status, created_by, updated_by)
           values ($1, $2, 'draft', $3, $3)`,
          [plan.id, target.revision, actor],
        );
      } else {
        await tx.query(
          `update notification_plan_revisions
              set updated_by = $3, updated_at = now()
            where plan_id = $1 and revision = $2`,
          [plan.id, target.revision, actor],
        );
      }

      await tx.query('delete from notification_plan_slots where plan_id = $1 and revision = $2', [
        plan.id,
        target.revision,
      ]);
      for (const [index, slot] of slots.entries()) {
        await tx.query(
          `insert into notification_plan_slots
             (plan_id, revision, kind, anchor, offset_minutes, sort_order)
           values ($1,$2,$3,$4,$5,$6)`,
          [plan.id, target.revision, slot.kind, slot.anchor, slot.offsetMinutes, index],
        );
      }

      await tx.query('delete from notification_templates where plan_id = $1 and revision = $2', [
        plan.id,
        target.revision,
      ]);
      for (const template of input.templates) {
        await insertTemplate(tx, plan.id, target.revision, template, actor);
      }

      await tx.query(
        `update notification_plans
            set next_revision = $2, updated_by = $3, updated_at = now()
          where id = $1`,
        [plan.id, target.revision + 1, actor],
      );

      return this.detail(tx, eventId, plan);
    });
  }

  /**
   * The preview renders the body it is given, or the stored revision when the
   * body is omitted, and writes nothing (FR-16). The exclusion sample is R3's:
   * it needs the preference tables (round grill 2).
   */
  async preview(eventId: string, input?: NotificationPlanWrite): Promise<NotificationPreview> {
    const context = await this.eventContext(this.db, eventId);
    const plan = await this.planRow(this.db, eventId);
    const highest = plan ? await this.highestRevision(this.db, plan.id) : 0;
    const storedSlots = plan && highest > 0 ? await this.slots(this.db, plan.id, highest) : [];
    const storedTemplates =
      plan && highest > 0 ? await this.templates(this.db, plan.id, highest) : [];

    const slots =
      input?.slots ??
      storedSlots.map((slot) => ({
        kind: slot.kind,
        anchor: slot.anchor,
        offsetMinutes: slot.offset_minutes,
      }));
    const templates = input?.templates ?? storedTemplates.map(toTemplateInput);

    if (slots.length === 0 || templates.length === 0) {
      throw new ValidationError(
        'A preview needs at least one slot and one template',
        'template_required',
      );
    }
    const now = new Date();
    this.assertTemplateVariables(templates);
    const resolved = assertSlots(slots, context.facts, now);

    const occurrenceDates = resolved
      .map((entry) => entry.occurrenceDate)
      .filter((date): date is string => date !== null)
      .sort();
    const at = occurrenceDates[0] ?? context.facts.startDate;

    const rules = audienceRules(await eventAudiences(this.db, eventId));
    const register = await audienceRegister(this.db, at);
    const matched = register.filter((member) => memberMatchesEventAudiences(rules, member, at));
    const memberIds = matched.map((member) => member.id);
    // The preview and the fan-out share one resolver, so their counts cannot
    // disagree (N-5).
    const resolvedRecipients = await resolveRecipients(this.db, memberIds, now);
    const periodId = await eventPeriodId(this.db, eventId);
    const states = await preferenceStates(this.db, memberIds, eventId, periodId, now);

    const defaults = await this.defaults();
    const sample = [...matched].sort((left, right) =>
      left.memberNo.localeCompare(right.memberNo),
    )[0];
    const flier = plan && highest > 0 ? await this.flierRow(this.db, plan.id, highest) : null;
    const flierRef: FlierReference | null = flier
      ? {
          url: flierUrl(flier.token),
          contentType: flier.content_type,
          token: flier.token,
        }
      : null;

    const values = resolvedValues(this.renderValues(context, sample, at, defaults, flierRef));
    const counts = {
      audience: matched.length,
      email: matched.filter((member) =>
        resolvedRecipients.destinations.get(member.id)?.has('email'),
      ).length,
      whatsapp: matched.filter((member) =>
        resolvedRecipients.destinations.get(member.id)?.has('whatsapp'),
      ).length,
      sms: matched.filter((member) => resolvedRecipients.destinations.get(member.id)?.has('sms'))
        .length,
      ussd: matched.filter((member) => resolvedRecipients.inboxEligible.has(member.id)).length,
    };

    // FR-16/FR-44: aggregate excluded counts by reason and a named sample only
    // of the `no_contact` exclusions; the muted and blocked are never named.
    const slotKinds = new Set(slots.map((slot) => slot.kind));
    const cadenceOccurrence = {
      hasStarts: slotKinds.has('starts'),
      hasLast: slotKinds.has('last'),
      isFirst: true,
      isLast: true,
    };
    const excludedCounts = {
      channel_blocked: 0,
      event_muted: 0,
      period_muted: 0,
      cadence_filtered: 0,
      no_contact: 0,
    };
    const noContact: Array<{ memberNo: string; displayName: string }> = [];
    for (const member of matched) {
      const destinations = resolvedRecipients.destinations.get(member.id) ?? new Map();
      const state = states.get(member.id)!;
      const reachableChannels = [...destinations.keys()];
      const everyReachableBlocked =
        reachableChannels.length > 0 &&
        reachableChannels.every((channel) => state.blocked.has(channel));
      const anySlotAllowed = [...slotKinds].some((kind) =>
        cadenceAllows(state.cadence, kind, cadenceOccurrence),
      );
      const reason = everyReachableBlocked
        ? 'channel_blocked'
        : state.eventMuted
          ? 'event_muted'
          : state.periodMuted
            ? 'period_muted'
            : !anySlotAllowed
              ? 'cadence_filtered'
              : reachableChannels.length === 0
                ? 'no_contact'
                : null;
      if (!reason) continue;
      excludedCounts[reason] += 1;
      if (reason === 'no_contact') {
        noContact.push({
          memberNo: member.memberNo,
          displayName: displayName(member.firstName, member.lastName, member.otherNames),
        });
      }
    }
    const excludedSample = noContact
      .sort((left, right) => left.memberNo.localeCompare(right.memberNo))
      .slice(0, 5);

    const byChannel = new Map(templates.map((template) => [template.channel, template]));
    const email = byChannel.get('email');
    const whatsapp = byChannel.get('whatsapp');
    const sms = byChannel.get('sms');
    const ussd = byChannel.get('ussd');

    return {
      revision: highest > 0 ? highest : 1,
      at,
      renders: {
        email:
          email && email.channel === 'email'
            ? renderEmail(
                {
                  subject: email.subject!,
                  body: email.body as unknown as EmailNode,
                  bodyText: email.bodyText!,
                },
                values,
                flierRef,
                defaults.emailReplyTo,
              )
            : { subject: '', html: '', text: '', attachments: [] },
        whatsapp:
          whatsapp && whatsapp.channel === 'whatsapp'
            ? renderWhatsApp(
                {
                  templateName: whatsapp.templateName!,
                  parameterMap: whatsapp.parameterMap ?? {},
                },
                values,
                flierRef,
              )
            : { templateName: '', parameters: [], body: '', headerMediaUrl: null },
        sms:
          sms && sms.channel === 'sms'
            ? renderSms(sms.bodyText!, values)
            : { body: '', encoding: 'gsm7', length: 0, segments: 0 },
        ussd:
          ussd && ussd.channel === 'ussd'
            ? renderUssd(ussd.bodyText!, values, DEFAULT_USSD_BUDGET)
            : { body: '', screens: [''], budget: DEFAULT_USSD_BUDGET },
      },
      counts,
      sample: sample
        ? {
            memberNo: sample.memberNo,
            displayName: displayName(sample.firstName, sample.lastName, sample.otherNames),
          }
        : null,
      excluded: { counts: excludedCounts, sample: excludedSample },
    };
  }

  private renderValues(
    context: EventContext,
    sample: RegisterMember | undefined,
    at: string,
    defaults: NotificationDefaults,
    flier: FlierReference | null,
  ): NotificationValues {
    const occurrence = context.facts.occurrences.find(
      (entry) => entry.date === at && entry.status !== 'cancelled',
    );
    return {
      firstName: sample?.firstName ?? null,
      fullName: sample ? displayName(sample.firstName, sample.lastName, sample.otherNames) : null,
      eventName: context.event.name,
      eventDate: at,
      startTime: occurrence?.startTime ?? context.facts.startTime,
      endTime: occurrence?.endTime ?? context.facts.endTime,
      venue: context.event.venue_name,
      periodName: context.event.period_name,
      memberNo: sample?.memberNo ?? null,
      churchName: defaults.churchName,
      flierUrl: flier?.url ?? null,
    };
  }

  /**
   * The preview's exclusions used to read reachability here; the fan-out and
   * the preview now share `resolveRecipients` (N-5) so they cannot disagree.
   */

  // -- flier (N-9) -----------------------------------------------------------

  /**
   * The revision a flier write lands on: the draft, creating one when the plan's
   * latest revision is frozen. A new revision inherits the slots and templates
   * and gets a new token, so a sent URL keeps resolving to the image it was sent
   * with (N-9, EC-15).
   */
  private async writableRevision(
    client: DbClient,
    eventId: string,
    actor: string,
  ): Promise<{ planId: string; revision: number }> {
    const [event] = await client.query<{ id: string }>('select id from events where id = $1', [
      eventId,
    ]);
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    const plan = await this.planRow(client, eventId);
    if (!plan) {
      throw new ConflictError('Save the plan before attaching a flier', 'plan_not_started');
    }
    const revisions = await this.revisions(client, plan.id);
    const highest = revisions.length > 0 ? Math.max(...revisions.map((row) => row.revision)) : 0;
    const current = revisions.find((row) => row.revision === highest);
    if (highest > 0 && current?.status === 'draft') {
      return { planId: plan.id, revision: highest };
    }

    const revision = highest + 1;
    const previousSlots = highest > 0 ? await this.slots(client, plan.id, highest) : [];
    const previousTemplates = highest > 0 ? await this.templates(client, plan.id, highest) : [];
    await client.query(
      `insert into notification_plan_revisions (plan_id, revision, status, created_by, updated_by)
       values ($1,$2,'draft',$3,$3)`,
      [plan.id, revision, actor],
    );
    for (const [index, slot] of previousSlots.entries()) {
      await client.query(
        `insert into notification_plan_slots
           (plan_id, revision, kind, anchor, offset_minutes, sort_order)
         values ($1,$2,$3,$4,$5,$6)`,
        [plan.id, revision, slot.kind, slot.anchor, slot.offset_minutes, index],
      );
    }
    for (const template of previousTemplates) {
      await insertTemplate(client, plan.id, revision, toTemplateInput(template), actor);
    }
    await client.query(
      `update notification_plans set next_revision = $2, updated_by = $3, updated_at = now()
        where id = $1`,
      [plan.id, revision + 1, actor],
    );
    return { planId: plan.id, revision };
  }

  async readFlier(eventId: string): Promise<FlierMeta | null> {
    await this.eventContext(this.db, eventId);
    const plan = await this.planRow(this.db, eventId);
    if (!plan) return null;
    const highest = await this.highestRevision(this.db, plan.id);
    if (highest === 0) return null;
    return this.toFlierMeta(await this.flierRow(this.db, plan.id, highest));
  }

  /**
   * Uploads one flier to the draft revision (FR-22): 2 MiB, magic-byte sniffed,
   * sha256 recorded, held in the store the deployment configured. The store write
   * and the row write are one transaction, so a failed upload leaves no row and
   * a failed row leaves no promise nothing can serve.
   */
  async writeFlier(
    eventId: string,
    bytes: Uint8Array,
    contentType: string,
    actor: string,
  ): Promise<FlierMeta> {
    if (bytes.length === 0) throw new UnsupportedFlierError('The flier body is empty');
    if (bytes.length > PHOTO_MAX_BYTES) throw new FlierTooLargeError();

    const sniffed = sniffPhotoType(bytes);
    if (!sniffed || sniffed !== mediaTypeOf(contentType)) {
      throw new UnsupportedFlierError();
    }

    const token = randomBytes(32).toString('hex');
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    return this.db.transaction(async (tx) => {
      const { planId, revision } = await this.writableRevision(tx, eventId, actor);
      const write = await this.flierStore.save(token, bytes);
      const previous = await this.flierRow(tx, planId, revision);
      if (previous) await this.flierStore.discard(locatorOf(previous));
      await tx.query('delete from event_fliers where plan_id = $1 and revision = $2', [
        planId,
        revision,
      ]);
      await tx.query(
        `insert into event_fliers
           (plan_id, revision, token, storage, storage_key, bytes, content_type, byte_size,
            sha256, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          planId,
          revision,
          token,
          this.flierStore.storage,
          write.storageKey,
          write.inlineBytes,
          sniffed,
          bytes.length,
          sha256,
          actor,
        ],
      );
      const row = await this.flierRow(tx, planId, revision);
      return this.toFlierMeta(row)!;
    });
  }

  /**
   * Removes the flier from the writable revision. A published revision is frozen
   * (N-3), so on a published plan the removal lands on revision + 1 in the same
   * way an upload would: the sent URL keeps resolving to the image it was sent
   * with, and the officer's draft is the one that loses its attachment.
   */
  async deleteFlier(eventId: string, actor: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { planId, revision } = await this.writableRevision(tx, eventId, actor);
      const row = await this.flierRow(tx, planId, revision);
      if (!row) return;
      await this.flierStore.discard(locatorOf(row));
      await tx.query('delete from event_fliers where plan_id = $1 and revision = $2', [
        planId,
        revision,
      ]);
    });
  }

  /** The public read: the row names the store, the store returns the bytes. */
  async loadFlier(
    token: string,
  ): Promise<{ bytes: Uint8Array; contentType: string; byteSize: number } | null> {
    const [row] = await this.db.query<FlierRow>(
      `select token, storage, storage_key, bytes, content_type, byte_size, sha256, uploaded_at
         from event_fliers
        where token = $1`,
      [token],
    );
    if (!row) return null;
    const bytes = await this.flierStore.load(locatorOf(row));
    if (!bytes) return null;
    return { bytes, contentType: row.content_type, byteSize: bytes.length };
  }

  // -- defaults (N-12, FR-31) ------------------------------------------------

  async defaults(): Promise<NotificationDefaults> {
    const [row] = await this.db.query<{
      slots: unknown;
      church_name: string;
      email_signature: string;
      email_reply_to: string | null;
      sms_confirm_threshold: number;
      whatsapp_templates: unknown;
      send_mode: 'always' | 'window' | 'daily';
      send_from: string;
      send_to: string;
      send_hour: string;
      church_timezone: string;
      digest_hour: string;
      failure_digest_to: string | null;
      failure_digest_enabled: boolean;
      updated_at: Date | string | null;
      updated_by: string | null;
    }>("select * from notification_defaults where id = 'church'");
    if (!row) {
      return {
        slots: DEFAULT_SLOT_TEMPLATE,
        churchName: DEFAULT_CHURCH_NAME,
        emailSignature: '',
        emailReplyTo: null,
        smsConfirmThreshold: 250,
        whatsappTemplates: {},
        sendMode: 'window',
        sendFrom: '08:00',
        sendTo: '20:00',
        sendHour: '14:00',
        churchTimezone: 'Africa/Lagos',
        digestHour: '09:00',
        failureDigestTo: null,
        failureDigestEnabled: true,
        trigger:
          this.triggerMinutes > 0
            ? { kind: 'interval' as const, minutes: this.triggerMinutes }
            : { kind: 'continuous' as const },
        updatedAt: null,
        updatedBy: null,
      };
    }
    const slots = notificationDefaultsSchema.shape.slots.safeParse(row.slots);
    const templates = notificationDefaultsSchema.shape.whatsappTemplates.safeParse(
      row.whatsapp_templates,
    );
    return {
      slots: slots.success ? slots.data : DEFAULT_SLOT_TEMPLATE,
      churchName: row.church_name,
      emailSignature: row.email_signature,
      emailReplyTo: row.email_reply_to,
      smsConfirmThreshold: row.sms_confirm_threshold,
      whatsappTemplates: templates.success ? templates.data : {},
      sendMode: row.send_mode,
      sendFrom: row.send_from.slice(0, 5),
      sendTo: row.send_to.slice(0, 5),
      sendHour: row.send_hour.slice(0, 5),
      churchTimezone: row.church_timezone,
      digestHour: row.digest_hour.slice(0, 5),
      failureDigestTo: row.failure_digest_to,
      failureDigestEnabled: row.failure_digest_enabled,
      trigger:
        this.triggerMinutes > 0
          ? { kind: 'interval' as const, minutes: this.triggerMinutes }
          : { kind: 'continuous' as const },
      updatedAt: isoTimestamp(row.updated_at),
      updatedBy: row.updated_by,
    };
  }

  async writeDefaults(
    input: NotificationDefaultsWrite,
    actor: string,
  ): Promise<NotificationDefaults> {
    const current = await this.defaults();
    if (input.slots) assertSlotAnchors(input.slots);
    const next = {
      ...current,
      ...input,
      slots: input.slots ?? current.slots,
      whatsappTemplates: input.whatsappTemplates ?? current.whatsappTemplates,
    };
    await this.db.query(
      `insert into notification_defaults
         (id, slots, church_name, email_signature, email_reply_to, sms_confirm_threshold,
          whatsapp_templates, send_mode, send_from, send_to, send_hour, church_timezone,
          digest_hour, failure_digest_to, failure_digest_enabled, updated_at, updated_by)
       values ('church',$1::jsonb,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14, now(), $15)
       on conflict (id) do update set
         slots = excluded.slots,
         church_name = excluded.church_name,
         email_signature = excluded.email_signature,
         email_reply_to = excluded.email_reply_to,
         sms_confirm_threshold = excluded.sms_confirm_threshold,
         whatsapp_templates = excluded.whatsapp_templates,
         send_mode = excluded.send_mode,
         send_from = excluded.send_from,
         send_to = excluded.send_to,
         send_hour = excluded.send_hour,
         church_timezone = excluded.church_timezone,
         digest_hour = excluded.digest_hour,
         failure_digest_to = excluded.failure_digest_to,
         failure_digest_enabled = excluded.failure_digest_enabled,
         updated_at = now(),
         updated_by = excluded.updated_by`,
      [
        JSON.stringify(next.slots),
        next.churchName,
        next.emailSignature,
        next.emailReplyTo,
        next.smsConfirmThreshold,
        JSON.stringify(next.whatsappTemplates),
        next.sendMode,
        next.sendFrom,
        next.sendTo,
        next.sendHour,
        next.churchTimezone,
        next.digestHour,
        next.failureDigestTo,
        next.failureDigestEnabled,
        actor,
      ],
    );
    return this.defaults();
  }
}

function locatorOf(row: FlierRow): FlierLocator {
  return {
    token: row.token,
    storageKey: row.storage_key ?? (row.storage === 's3' ? flierStorageKey(row.token) : null),
    inlineBytes: row.bytes ?? null,
  };
}

function emailTexts(node: EmailNode): string[] {
  const texts: string[] = [];
  const visit = (current: EmailNode): void => {
    if (typeof current.text === 'string') texts.push(current.text);
    for (const child of current.content ?? []) visit(child);
  };
  visit(node);
  return texts;
}

function toTemplateInput(row: TemplateRow): NotificationPlanWrite['templates'][number] {
  switch (row.channel) {
    case 'email':
      return {
        channel: 'email',
        subject: row.subject ?? '',
        body: (row.body_json as Record<string, unknown> | null) ?? { type: 'doc', content: [] },
        bodyText: row.body_text ?? '',
      };
    case 'whatsapp':
      return {
        channel: 'whatsapp',
        templateName: row.template_name ?? '',
        parameterMap: (row.parameter_map as Record<string, number> | null) ?? {},
      };
    case 'sms':
      return { channel: 'sms', bodyText: row.body_text ?? '' };
    case 'ussd':
      return { channel: 'ussd', bodyText: row.body_text ?? '' };
  }
}

async function insertTemplate(
  client: DbClient,
  planId: string,
  revision: number,
  template: NotificationPlanWrite['templates'][number],
  actor: string,
): Promise<void> {
  switch (template.channel) {
    case 'email':
      await client.query(
        `insert into notification_templates
           (plan_id, revision, channel, subject, body_json, body_text, created_by)
         values ($1,$2,'email',$3,$4::jsonb,$5,$6)`,
        [
          planId,
          revision,
          template.subject,
          JSON.stringify(template.body),
          template.bodyText,
          actor,
        ],
      );
      return;
    case 'whatsapp':
      await client.query(
        `insert into notification_templates
           (plan_id, revision, channel, template_name, parameter_map, created_by)
         values ($1,$2,'whatsapp',$3,$4::jsonb,$5)`,
        [planId, revision, template.templateName, JSON.stringify(template.parameterMap), actor],
      );
      return;
    case 'sms':
    case 'ussd':
      await client.query(
        `insert into notification_templates (plan_id, revision, channel, body_text, created_by)
         values ($1,$2,$3,$4,$5)`,
        [planId, revision, template.channel, template.bodyText, actor],
      );
      return;
  }
}
