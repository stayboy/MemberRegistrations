import { createHash } from 'node:crypto';
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ValidationError,
} from '../errors/domain-errors.js';
import {
  assertSlots,
  type PlanEventFacts,
  type PlanSlotInput,
  type ResolvedSlotInstant,
} from '../domain/notifications/plan.js';
import {
  assertTriggerCanHonourStarts,
  futureInstances,
  withinHorizon,
} from '../domain/notifications/instances.js';
import { applySendPolicy, type SendMode } from '../domain/notifications/send-policy.js';
import type { NotificationChannel } from '../schemas/notifications.js';
import type {
  NotificationCancelResult,
  NotificationChangeInput,
  NotificationChangeResult,
  NotificationInstance,
  NotificationPublishResult,
} from '../schemas/notifications.js';
import type { Queue } from '../queue/port.js';
import type { Db, DbClient, Row } from '../db/sql.js';
import { recipientsAt, resolveRecipients } from './notification-recipients.js';

/**
 * Instances, publication and cancellation (N-1, N-3, N-14; FR-5, FR-17,
 * FR-18, FR-19).
 *
 * Public materialises one instance per slot and occurrence over the 90-day
 * horizon, pins the published revision and applies the send-time policy to
 * `delivery_at`. A republish of the same published revision returns the same
 * rows and creates nothing. Cancel stops future instances; it deletes no job
 * and no history.
 */

export interface PublishDependencies {
  queue?: Queue;
  /** The deployed cadence in minutes; `0` is continuous. */
  triggerMinutes?: number;
}

interface EventRow extends Row {
  id: string;
  name: string;
  status: string;
  timezone: string;
  period_id: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string;
  end_date: string;
}

interface PlanRow extends Row {
  id: string;
  next_revision: number;
}

interface RevisionRow extends Row {
  revision: number;
  status: 'draft' | 'published' | 'superseded' | 'cancelled';
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
}

interface InstanceRow extends Row {
  id: string;
  plan_id: string;
  kind: NotificationInstance['kind'];
  revision: number;
  occurrence_date: string | null;
  send_at: Date | string;
  delivery_at: Date | string | null;
  status: NotificationInstance['status'];
  recipient_count: number;
  sent_count: number;
  skipped_count: number;
  failed_count: number;
}

interface SendDefaults {
  sendMode: SendMode;
  sendFrom: string;
  sendTo: string;
  sendHour: string;
  churchTimezone: string;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toInstance(row: InstanceRow): NotificationInstance {
  return {
    id: row.id,
    planId: row.plan_id,
    kind: row.kind,
    revision: row.revision,
    occurrenceDate: row.occurrence_date,
    sendAt: iso(row.send_at)!,
    deliveryAt: iso(row.delivery_at),
    status: row.status,
    recipientCount: Number(row.recipient_count),
    sentCount: Number(row.sent_count),
    skippedCount: Number(row.skipped_count),
    failedCount: Number(row.failed_count),
  };
}

function contentToken(
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

export class NotificationInstanceRepository {
  constructor(
    private readonly db: Db,
    private readonly dependencies: PublishDependencies = {},
  ) {}

  private async eventContext(client: DbClient, eventId: string): Promise<EventRow> {
    const [event] = await client.query<EventRow>(
      `select e.id, e.name, e.status, e.timezone, e.period_id, e.start_time, e.end_time,
              coalesce(
                (select min(o.date) from event_occurrences o where o.event_id = e.id),
                (e.created_at at time zone e.timezone)::date
              )::text as start_date,
              coalesce(
                (select max(o.date) from event_occurrences o where o.event_id = e.id),
                (e.created_at at time zone e.timezone)::date
              )::text as end_date
         from events e
        where e.id = $1`,
      [eventId],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    return event;
  }

  private async facts(client: DbClient, event: EventRow): Promise<PlanEventFacts> {
    const occurrences = await client.query<{
      date: string;
      start_time: string | null;
      end_time: string | null;
      status: string;
      id: string;
    }>(
      `select id, date::text as date, start_time, end_time, status
         from event_occurrences
        where event_id = $1
        order by date`,
      [event.id],
    );
    return {
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
    return client.query<TemplateRow>(
      `select channel from notification_templates where plan_id = $1 and revision = $2`,
      [planId, revision],
    );
  }

  private async flierToken(
    client: DbClient,
    planId: string,
    revision: number,
  ): Promise<string | null> {
    const [row] = await client.query<{ token: string }>(
      'select token from event_fliers where plan_id = $1 and revision = $2',
      [planId, revision],
    );
    return row?.token ?? null;
  }

  private async sendDefaults(client: DbClient): Promise<SendDefaults> {
    const [row] = await client.query<{
      send_mode: SendMode;
      send_from: string;
      send_to: string;
      send_hour: string;
      church_timezone: string;
    }>(
      `select send_mode, send_from::text as send_from, send_to::text as send_to,
              send_hour::text as send_hour, church_timezone
         from notification_defaults where id = 'church'`,
    );
    return {
      sendMode: row?.send_mode ?? 'window',
      sendFrom: (row?.send_from ?? '08:00').slice(0, 5),
      sendTo: (row?.send_to ?? '20:00').slice(0, 5),
      sendHour: (row?.send_hour ?? '14:00').slice(0, 5),
      churchTimezone: row?.church_timezone ?? 'Africa/Lagos',
    };
  }

  private async instancesFor(
    client: DbClient,
    planId: string,
    revision?: number,
  ): Promise<InstanceRow[]> {
    return client.query<InstanceRow>(
      `select id, plan_id, kind, revision, occurrence_date::text as occurrence_date,
              send_at, delivery_at, status, recipient_count, sent_count,
              skipped_count, failed_count
         from notification_slot_instances
        where plan_id = $1 ${revision === undefined ? '' : 'and revision = $2'}
        order by send_at, id`,
      revision === undefined ? [planId] : [planId, revision],
    );
  }

  private async cloneRevision(
    client: DbClient,
    plan: PlanRow,
    from: number,
    to: number,
    actor: string,
  ): Promise<void> {
    await client.query(
      `insert into notification_plan_revisions (plan_id, revision, status, created_by, updated_by)
       values ($1,$2,'draft',$3,$3)`,
      [plan.id, to, actor],
    );
    await client.query(
      `insert into notification_plan_slots
         (plan_id, revision, kind, anchor, offset_minutes, sort_order)
       select plan_id, $3, kind, anchor, offset_minutes, sort_order
         from notification_plan_slots where plan_id = $1 and revision = $2`,
      [plan.id, from, to],
    );
    await client.query(
      `insert into notification_templates
         (plan_id, revision, channel, subject, body_json, body_text, template_name, parameter_map, created_by)
       select plan_id, $3, channel, subject, body_json, body_text, template_name, parameter_map, $4
         from notification_templates where plan_id = $1 and revision = $2`,
      [plan.id, from, to, actor],
    );
  }

  /** Inserts each resolved instant, skipping a live duplicate (AC-12, AC-9). */
  private async insertInstances(
    client: DbClient,
    planId: string,
    revision: number,
    entries: readonly ResolvedSlotInstant[],
    slots: readonly SlotRow[],
    facts: PlanEventFacts,
    occurrences: ReadonlyMap<string, string>,
    defaults: SendDefaults,
  ): Promise<number> {
    const slotIdByOrder = new Map(slots.map((slot) => [slot.sort_order, slot.id]));
    let created = 0;
    for (const entry of entries) {
      const [inserted] = await client.query<{ id: string }>(
        `insert into notification_slot_instances
           (plan_id, slot_id, kind, revision, occurrence_id, occurrence_date, send_at,
            delivery_at, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled')
         on conflict do nothing
         returning id`,
        [
          planId,
          slotIdByOrder.get(entry.sortOrder) ?? null,
          entry.kind,
          revision,
          entry.occurrenceDate ? (occurrences.get(entry.occurrenceDate) ?? null) : null,
          entry.occurrenceDate,
          entry.instant,
          applySendPolicy(entry.instant, entry.kind, defaults.sendMode, defaults),
        ],
      );
      if (inserted) created += 1;
    }
    return created;
  }

  async publish(
    eventId: string,
    actor: string,
    ifMatch: string | undefined,
    now: Date = new Date(),
  ): Promise<NotificationPublishResult> {
    const event = await this.eventContext(this.db, eventId);
    if (event.status !== 'active') {
      throw new ConflictError(
        'Only an active event can publish a notification plan',
        'event_not_active',
      );
    }

    return this.db.transaction(async (tx) => {
      const plan = await this.planRow(tx, eventId);
      if (!plan) {
        throw new ValidationError('Save the plan before publishing it', 'plan_not_saved');
      }
      const facts = await this.facts(tx, event);
      const occurrences = new Map(
        (
          await tx.query<{ id: string; date: string }>(
            'select id, date::text as date from event_occurrences where event_id = $1',
            [eventId],
          )
        ).map((row) => [row.date, row.id]),
      );

      let revisions = await this.revisions(tx, plan.id);
      if (revisions.length === 0) {
        throw new ValidationError('Save the plan before publishing it', 'plan_not_saved');
      }
      let latest = revisions.find(
        (revision) => revision.revision === Math.max(...revisions.map((entry) => entry.revision)),
      )!;

      // A republish of the revision that is already published is idempotent.
      if (latest.status === 'published') {
        const slots = await this.slots(tx, plan.id, latest.revision);
        const templates = await this.templates(tx, plan.id, latest.revision);
        const etag = contentToken(
          slots,
          templates,
          await this.flierToken(tx, plan.id, latest.revision),
        );
        this.assertIfMatch(ifMatch, etag);
        const instances = await this.instancesFor(tx, plan.id, latest.revision);
        return {
          planId: plan.id,
          revision: latest.revision,
          status: 'published',
          contentEtag: etag,
          created: 0,
          instances: instances.map(toInstance),
        };
      }

      if (latest.status === 'cancelled') {
        const next = Math.max(...revisions.map((entry) => entry.revision)) + 1;
        await this.cloneRevision(tx, plan, latest.revision, next, actor);
        revisions = await this.revisions(tx, plan.id);
        latest = revisions.find((revision) => revision.revision === next)!;
      }

      if (latest.status !== 'draft') {
        throw new ConflictError(
          'Only a draft revision can be published',
          'plan_revision_not_draft',
        );
      }

      const slots = await this.slots(tx, plan.id, latest.revision);
      const templates = await this.templates(tx, plan.id, latest.revision);
      const etag = contentToken(
        slots,
        templates,
        await this.flierToken(tx, plan.id, latest.revision),
      );
      this.assertIfMatch(ifMatch, etag);

      const slotInputs = slots.map((slot) => ({
        kind: slot.kind,
        anchor: slot.anchor,
        offsetMinutes: slot.offset_minutes,
      }));

      assertTriggerCanHonourStarts(slotInputs, this.dependencies.triggerMinutes ?? 0);
      const resolved = assertSlots(slotInputs, facts, now);
      const materialised = withinHorizon(futureInstances(resolved, now), now);

      // FR-12/AC-43: every channel with recipients needs a template, and the
      // ussd inbox template is always required.
      const at = facts.startDate;
      const recipients = await resolveRecipients(tx, await this.audienceIds(tx, eventId, at), now);
      const channels = new Set<NotificationChannel>(['ussd']);
      for (const perChannel of recipients.destinations.values()) {
        for (const channel of perChannel.keys()) channels.add(channel);
      }
      const provided = new Set(templates.map((template) => template.channel));
      for (const channel of channels) {
        if (!provided.has(channel)) {
          throw new ValidationError(
            `templates: a published revision needs the ${channel} template`,
            'template_required',
          );
        }
      }

      // One published revision at a time; an existing instance keeps its pin.
      await tx.query(
        `update notification_plan_revisions
            set status = 'superseded', updated_by = $2, updated_at = now()
          where plan_id = $1 and status = 'published'`,
        [plan.id, actor],
      );
      await tx.query(
        `update notification_plan_revisions
            set status = 'published', published_by = $3, published_at = $4,
                updated_by = $3, updated_at = now()
          where plan_id = $1 and revision = $2`,
        [plan.id, latest.revision, actor, now],
      );

      const defaults = await this.sendDefaults(tx);
      const created = await this.insertInstances(
        tx,
        plan.id,
        latest.revision,
        materialised,
        slots,
        facts,
        occurrences,
        defaults,
      );

      await tx.query(
        `update notification_plans set next_revision = $2, updated_by = $3, updated_at = now()
          where id = $1`,
        [plan.id, latest.revision + 1, actor],
      );

      const instances = await this.instancesFor(tx, plan.id, latest.revision);
      await this.enqueueInstances(instances);
      return {
        planId: plan.id,
        revision: latest.revision,
        status: 'published',
        contentEtag: etag,
        created,
        instances: instances.map(toInstance),
      };
    });
  }

  private async audienceIds(client: DbClient, eventId: string, at: string): Promise<string[]> {
    return (await recipientsAt(client, eventId, at)).map((member) => member.id);
  }

  private assertIfMatch(ifMatch: string | undefined, etag: string): void {
    const value = ifMatch?.trim();
    if (!value || value === '*') return;
    if (value !== etag) {
      throw new PreconditionFailedError(
        'If-Match: the plan content has moved on; preview again before publishing',
        'plan_content_stale',
      );
    }
  }

  private async enqueueInstances(instances: readonly InstanceRow[]): Promise<void> {
    const queue = this.dependencies.queue;
    if (!queue) return;
    for (const instance of instances) {
      if (instance.status !== 'scheduled') continue;
      await queue.enqueue(
        'notification.fanout',
        { instanceId: instance.id },
        {
          singletonKey: `instance:${instance.id}`,
          startAfter: instance.delivery_at
            ? new Date(instance.delivery_at)
            : new Date(instance.send_at),
        },
      );
    }
  }

  async cancel(
    eventId: string,
    actor: string,
    now: Date = new Date(),
  ): Promise<NotificationCancelResult> {
    return this.db.transaction(async (tx) => {
      await this.eventContext(tx, eventId);
      const plan = await this.planRow(tx, eventId);
      if (!plan) throw new NotFoundError('The event has no notification plan');
      const revisions = await this.revisions(tx, plan.id);
      const published = revisions.find((revision) => revision.status === 'published');
      if (!published) {
        throw new ConflictError(
          'The plan has no published revision to cancel',
          'plan_not_published',
        );
      }
      await tx.query(
        `update notification_plan_revisions
            set status = 'cancelled', cancelled_by = $3, cancelled_at = $4,
                updated_by = $3, updated_at = now()
          where plan_id = $1 and revision = $2`,
        [plan.id, published.revision, actor, now],
      );
      const cancelled = await tx.query<{ id: string }>(
        `update notification_slot_instances
            set status = 'cancelled', finished_at = $3
          where plan_id = $1 and revision = $2 and status = 'scheduled'
          returning id`,
        [plan.id, published.revision, now],
      );
      return {
        planId: plan.id,
        revision: published.revision,
        status: 'cancelled',
        cancelledAt: now.toISOString(),
        cancelledInstances: cancelled.length,
      };
    });
  }

  async change(
    eventId: string,
    input: NotificationChangeInput,
    actor: string,
    now: Date = new Date(),
  ): Promise<NotificationChangeResult> {
    return this.db.transaction(async (tx) => {
      const event = await this.eventContext(tx, eventId);
      if (event.status !== 'active') {
        throw new ConflictError(
          'Only an active event can publish a change notice',
          'event_not_active',
        );
      }
      const plan = await this.planRow(tx, eventId);
      if (!plan) throw new NotFoundError('The event has no notification plan');
      const revisions = await this.revisions(tx, plan.id);
      const published = [...revisions]
        .reverse()
        .find((revision) => revision.status === 'published');
      if (!published) {
        throw new ConflictError('The plan has no published revision', 'plan_not_published');
      }

      const [notice] = await tx.query<{ id: string }>(
        `insert into notification_change_notices
           (plan_id, title, body_text, whatsapp_template, whatsapp_parameters,
            email_subject, email_body_text, published_by, published_at)
         values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
         returning id`,
        [
          plan.id,
          input.title,
          input.bodyText,
          input.whatsappTemplate ?? null,
          JSON.stringify(input.whatsappParameters ?? []),
          input.emailSubject ?? null,
          input.emailBodyText ?? null,
          actor,
          now,
        ],
      );

      const defaults = await this.sendDefaults(tx);
      const [instance] = await tx.query<InstanceRow>(
        `insert into notification_slot_instances
           (plan_id, slot_id, change_notice_id, kind, revision, occurrence_id, occurrence_date,
            send_at, delivery_at, status)
         values ($1, null, $2, 'change', $3, null, null, $4, $5, 'scheduled')
         returning id, plan_id, kind, revision, occurrence_date::text as occurrence_date,
                   send_at, delivery_at, status, recipient_count, sent_count,
                   skipped_count, failed_count`,
        [
          plan.id,
          notice!.id,
          published.revision,
          now,
          applySendPolicy(now, 'change', defaults.sendMode, defaults),
        ],
      );

      const changeInstance = instance!;
      await this.enqueueInstances([changeInstance]);
      return { noticeId: notice!.id, instance: toInstance(changeInstance) };
    });
  }

  async listInstances(eventId: string): Promise<NotificationInstance[]> {
    const plan = await this.planRow(this.db, eventId);
    if (!plan) return [];
    return (await this.instancesFor(this.db, plan.id)).map(toInstance);
  }

  /** The tick sweep's input: scheduled instances whose resolved instant is due. */
  async dueInstances(now: Date): Promise<NotificationInstance[]> {
    const rows = await this.db.query<InstanceRow>(
      `select id, plan_id, kind, revision, occurrence_date::text as occurrence_date,
              send_at, delivery_at, status, recipient_count, sent_count,
              skipped_count, failed_count
         from notification_slot_instances
        where status = 'scheduled' and send_at <= $1
        order by send_at, id`,
      [now],
    );
    return rows.map(toInstance);
  }

  /**
   * The daily maintenance path: materialise any occurrence the published plan
   * has none for, without creating a revision or rewriting a pinned instance
   * (N-2, AC-44).
   */
  async materialisePublished(now: Date = new Date()): Promise<void> {
    const plans = await this.db.query<{ plan_id: string; event_id: string; revision: number }>(
      `select p.id as plan_id, p.event_id, r.revision
         from notification_plans p
         join notification_plan_revisions r
           on r.plan_id = p.id and r.status = 'published'`,
    );
    for (const plan of plans) {
      const event = await this.eventContext(this.db, plan.event_id);
      if (event.status !== 'active') continue;
      const facts = await this.facts(this.db, event);
      const slots = await this.slots(this.db, plan.plan_id, plan.revision);
      let resolved: ResolvedSlotInstant[];
      try {
        resolved = withinHorizon(
          assertSlots(
            slots.map((slot) => ({
              kind: slot.kind,
              anchor: slot.anchor,
              offsetMinutes: slot.offset_minutes,
            })),
            facts,
            now,
          ),
          now,
        );
      } catch {
        continue;
      }
      const occurrences = new Map(
        (
          await this.db.query<{ id: string; date: string }>(
            'select id, date::text as date from event_occurrences where event_id = $1',
            [event.id],
          )
        ).map((row) => [row.date, row.id]),
      );
      const defaults = await this.sendDefaults(this.db);
      await this.db.transaction(async (tx) => {
        await this.insertInstances(
          tx,
          plan.plan_id,
          plan.revision,
          resolved,
          slots,
          facts,
          occurrences,
          defaults,
        );
      });
    }
  }
}
