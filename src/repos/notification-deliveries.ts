import { ConflictError, NotFoundError } from '../errors/domain-errors.js';
import {
  NotificationSendError,
  type NotificationSenders,
} from '../messaging/notification-sender.js';
import {
  DEFAULT_USSD_BUDGET,
  renderUssd,
  renderWhatsApp,
  type FlierReference,
} from '../domain/notifications/render.js';
import { resolvedValues, type NotificationValues } from '../domain/notifications/variables.js';
import {
  cadenceAllows,
  evaluateSkip,
  type Cadence,
  type SkipKind,
} from '../domain/notifications/skip.js';
import {
  DELIVERY_CHANNELS,
  type DeliveryChannel,
  type Destination,
} from '../domain/notifications/recipients.js';
import type { NotificationDelivery } from '../schemas/notifications.js';
import type { Queue } from '../queue/port.js';
import type { Db, DbClient, Row } from '../db/sql.js';
import {
  eventPeriodId,
  preferenceStates,
  recipientsAt,
  resolveRecipients,
} from './notification-recipients.js';

/**
 * Fan-out and the send path (N-4, N-5, N-6, N-8; FR-7..FR-11, FR-21).
 *
 * Fan-out writes every inbox message first, in 500-row batches with one
 * transaction per batch, then one delivery per recipient and channel. The
 * skip decision is taken by the send path against live state, so a block set
 * after fan-out still applies; a skipped delivery is never retried.
 */

const FANOUT_BATCH_SIZE = 500;
const MAX_ATTEMPTS = 5;

interface InstanceRow extends Row {
  id: string;
  plan_id: string;
  event_id: string;
  kind: SkipKind;
  revision: number;
  occurrence_date: string | null;
  status: string;
  event_name: string;
  event_timezone: string;
  venue_name: string | null;
  period_name: string | null;
  period_id: string | null;
  start_time: string | null;
  end_time: string | null;
  change_notice_id: string | null;
}

interface NoticeRow extends Row {
  id: string;
  title: string;
  body_text: string;
  whatsapp_template: string | null;
  whatsapp_parameters: unknown;
  email_subject: string | null;
  email_body_text: string | null;
}

interface DeliveryRow extends Row {
  id: string;
  instance_id: string;
  member_id: string;
  member_no: string;
  message_id: string | null;
  channel: DeliveryChannel;
  routed_via: 'own' | 'guardian';
  contact_id: string | null;
  destination_masked: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  skip_reason: NotificationDelivery['skipReason'];
  attempts: number;
  last_error_code: NotificationDelivery['lastErrorCode'];
  sent_at: Date | string | null;
  created_at: Date | string;
}

interface MemberRow extends Row {
  id: string;
  member_no: string;
  first_name: string | null;
  last_name: string | null;
  other_names: string | null;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDelivery(row: DeliveryRow): NotificationDelivery {
  return {
    id: row.id,
    instanceId: row.instance_id,
    memberId: row.member_id,
    memberNo: row.member_no,
    channel: row.channel,
    routedVia: row.routed_via,
    contactId: row.contact_id,
    destinationMasked: row.destination_masked,
    status: row.status,
    skipReason: row.skip_reason,
    attempts: Number(row.attempts),
    lastErrorCode: row.last_error_code,
    sentAt: iso(row.sent_at),
    createdAt: iso(row.created_at)!,
  };
}

const INSTANCE_SQL = `
  select i.id, i.plan_id, i.kind, i.revision, i.occurrence_date::text as occurrence_date,
         i.status, i.change_notice_id,
         p.event_id,
         e.name as event_name, e.timezone as event_timezone, e.venue_name,
         e.period_name, e.period_id, e.start_time, e.end_time
    from notification_slot_instances i
    join notification_plans p on p.id = i.plan_id
    join events e on e.id = p.event_id`;

async function loadInstance(client: DbClient, instanceId: string): Promise<InstanceRow | null> {
  const [row] = await client.query<InstanceRow>(`${INSTANCE_SQL} where i.id = $1`, [instanceId]);
  return row ?? null;
}

async function loadNotice(client: DbClient, id: string): Promise<NoticeRow | null> {
  const [row] = await client.query<NoticeRow>(
    `select id, title, body_text, whatsapp_template, whatsapp_parameters,
            email_subject, email_body_text
       from notification_change_notices where id = $1`,
    [id],
  );
  return row ?? null;
}

async function member(client: DbClient, memberId: string): Promise<MemberRow | null> {
  const [row] = await client.query<MemberRow>(
    `select id, member_no, first_name, last_name, other_names from members where id = $1`,
    [memberId],
  );
  return row ?? null;
}

interface BodyContext {
  title: string;
  body: string;
  flier: FlierReference | null;
  /** The event date for the variables; the instance's snapshot when it has one. */
  date: string | null;
  startTime: string | null;
  endTime: string | null;
}

async function bodyContext(
  client: DbClient,
  instance: InstanceRow,
  _now: Date,
): Promise<BodyContext> {
  const [flier] = await client.query<{ token: string; content_type: string }>(
    `select token, content_type from event_fliers where plan_id = $1 and revision = $2`,
    [instance.plan_id, instance.revision],
  );
  const flierRef: FlierReference | null = flier
    ? {
        token: flier.token,
        contentType: flier.content_type as FlierReference['contentType'],
        url: `/fliers/${flier.token}`,
      }
    : null;

  if (instance.kind === 'change' && instance.change_notice_id) {
    const notice = await loadNotice(client, instance.change_notice_id);
    if (!notice) throw new NotFoundError('The change notice was not found');
    return {
      title: notice.title,
      body: notice.body_text,
      flier: flierRef,
      date: instance.occurrence_date,
      startTime: instance.start_time,
      endTime: instance.end_time,
    };
  }

  const [template] = await client.query<{ body_text: string | null }>(
    `select body_text from notification_templates
      where plan_id = $1 and revision = $2 and channel = 'ussd'`,
    [instance.plan_id, instance.revision],
  );
  const [occurrence] = instance.occurrence_date
    ? await client.query<{ start_time: string | null; end_time: string | null }>(
        `select start_time, end_time from event_occurrences
          where event_id = $1 and date = $2`,
        [instance.event_id, instance.occurrence_date],
      )
    : [];
  return {
    title: `${instance.event_name} (${instance.kind})`,
    body: template?.body_text ?? instance.event_name,
    flier: flierRef,
    date: instance.occurrence_date,
    startTime: occurrence?.start_time ?? instance.start_time,
    endTime: occurrence?.end_time ?? instance.end_time,
  };
}

interface RenderMember {
  memberNo: string;
  firstName: string | null;
  lastName: string | null;
  otherNames: string | null;
}

function renderBody(
  template: string,
  memberRow: RenderMember,
  instance: InstanceRow,
  context: BodyContext,
): string {
  const values = resolvedValues({
    firstName: memberRow.firstName,
    fullName: [memberRow.firstName, memberRow.lastName, memberRow.otherNames]
      .filter(Boolean)
      .join(' '),
    eventName: instance.event_name,
    eventDate: context.date,
    startTime: context.startTime,
    endTime: context.endTime,
    venue: instance.venue_name,
    periodName: instance.period_name,
    memberNo: memberRow.memberNo,
    churchName: 'The Church',
    flierUrl: context.flier?.url ?? null,
  });
  return renderUssd(template, values, DEFAULT_USSD_BUDGET).body;
}

interface FanOutDependencies {
  queue?: Queue;
  /**
   * Rows per insert batch. The production value is 500; a test lowers it so the
   * multi-batch path and its per-batch transaction are exercised rather than assumed.
   */
  batchSize?: number;
}

/**
 * One instance's fan-out. The claim is the cancel race: a cancellation that
 * lands after the enqueue leaves a `cancelled` row, so this update matches
 * nothing and the job drains as a no-op (AC-9).
 */
export async function fanOutInstance(
  db: Db,
  instanceId: string,
  dependencies: FanOutDependencies = {},
  now: Date = new Date(),
): Promise<void> {
  const claimed = await db.query<{ id: string }>(
    `update notification_slot_instances
        set status = 'fanning_out', started_at = coalesce(started_at, $2)
      where id = $1 and status in ('scheduled', 'fanning_out')
      returning id`,
    [instanceId, now],
  );
  if (claimed.length === 0) return;

  const instance = await loadInstance(db, instanceId);
  if (!instance) return;

  const members = await recipientsAt(
    db,
    instance.event_id,
    instance.occurrence_date ?? (await eventStartDate(db, instance.event_id)),
  );
  const resolved = await resolveRecipients(
    db,
    members.map((entry) => entry.id),
    now,
  );
  const context = await bodyContext(db, instance, now);
  const [flier] = await db.query<{ id: string }>(
    `select id from event_fliers where plan_id = $1 and revision = $2`,
    [instance.plan_id, instance.revision],
  );

  // Inbox first, in 500-row batches, one transaction per batch (N-8). This
  // runs before any delivery and before any provider call (FR-7, FR-40).
  const messageIds = new Map<string, string>();
  const inbox = members.filter((entry) => resolved.inboxEligible.has(entry.id));
  const batchSize = dependencies.batchSize ?? FANOUT_BATCH_SIZE;
  for (let start = 0; start < inbox.length; start += batchSize) {
    const batch = inbox.slice(start, start + batchSize);
    await db.transaction(async (tx) => {
      for (const entry of batch) {
        const [inserted] = await tx.query<{ id: string }>(
          `insert into notification_messages
             (kind, instance_id, event_id, member_id, title, body_text, flier_id)
           values ('event',$1,$2,$3,$4,$5,$6)
           on conflict do nothing
           returning id`,
          [
            instance.id,
            instance.event_id,
            entry.id,
            context.title,
            renderBody(
              context.body,
              {
                memberNo: entry.memberNo,
                firstName: entry.firstName,
                lastName: entry.lastName,
                otherNames: entry.otherNames,
              },
              instance,
              context,
            ),
            flier?.id ?? null,
          ],
        );
        if (inserted) {
          messageIds.set(entry.id, inserted.id);
        } else {
          const [existing] = await tx.query<{ id: string }>(
            `select id from notification_messages where instance_id = $1 and member_id = $2`,
            [instance.id, entry.id],
          );
          if (existing) messageIds.set(entry.id, existing.id);
        }
      }
    });
  }

  // Then one delivery per recipient and channel. A member reachable only
  // through a guardian has no message and `routed_via = 'guardian'` (FR-47).
  const pending: string[] = [];
  for (const entry of members) {
    const messageId = messageIds.get(entry.id) ?? null;
    const destinations = resolved.destinations.get(entry.id) ?? new Map();
    for (const channel of DELIVERY_CHANNELS) {
      const destination = destinations.get(channel) as Destination | undefined;
      const routedVia = destination?.routedVia ?? (messageId ? 'own' : 'guardian');
      const [inserted] = await db.query<{ id: string }>(
        `insert into notification_deliveries
           (instance_id, member_id, message_id, channel, routed_via, contact_id,
            destination_masked, status)
         values ($1,$2,$3,$4,$5,$6,$7,'pending')
         on conflict (instance_id, member_id, channel) do nothing
         returning id`,
        [
          instance.id,
          entry.id,
          messageId,
          channel,
          routedVia,
          destination?.contactId ?? null,
          destination?.masked ?? null,
        ],
      );
      if (inserted) pending.push(inserted.id);
    }
  }

  await db.query(
    `update notification_slot_instances
        set status = 'sent', finished_at = $2, recipient_count = $3
      where id = $1`,
    [instance.id, now, members.length],
  );

  const queue = dependencies.queue;
  if (queue) {
    for (const deliveryId of pending) {
      await queue.enqueue(
        'notification.send',
        { deliveryId },
        { singletonKey: `delivery:${deliveryId}` },
      );
    }
  }
}

async function eventStartDate(db: DbClient, eventId: string): Promise<string> {
  const [row] = await db.query<{ date: string }>(
    `select coalesce(
       (select min(o.date) from event_occurrences o where o.event_id = e.id),
       (e.created_at at time zone e.timezone)::date
     )::text as date
       from events e where e.id = $1`,
    [eventId],
  );
  return row?.date ?? new Date().toISOString().slice(0, 10);
}

async function loadDelivery(client: DbClient, deliveryId: string): Promise<DeliveryRow | null> {
  const [row] = await client.query<DeliveryRow>(
    `select d.id, d.instance_id, d.member_id, m.member_no, d.message_id, d.channel,
            d.routed_via, d.contact_id, d.destination_masked, d.status, d.skip_reason,
            d.attempts, d.last_error_code, d.sent_at, d.created_at
       from notification_deliveries d
       join members m on m.id = d.member_id
      where d.id = $1`,
    [deliveryId],
  );
  return row ?? null;
}

interface CadenceContext {
  hasStarts: boolean;
  hasLast: boolean;
  isFirst: boolean;
  isLast: boolean;
}

async function cadenceContext(
  client: DbClient,
  instance: InstanceRow,
  deliveryInstanceRowId: string,
): Promise<CadenceContext> {
  // An event-anchored instance has no occurrence date; it is judged against
  // the whole revision so a publish-anchored `announce` is still filtered by a
  // `minimal` member when the plan has a `starts` or `last`.
  const siblings = await client.query<{ id: string; kind: string }>(
    `select id, kind from notification_slot_instances
      where plan_id = $1 and status <> 'cancelled'
        and ($2::date is null or coalesce(occurrence_date, '0001-01-01'::date) = $2::date)
      order by send_at, id`,
    [instance.plan_id, instance.occurrence_date],
  );
  const kinds = new Set(siblings.map((row) => row.kind));
  return {
    hasStarts: kinds.has('starts'),
    hasLast: kinds.has('last'),
    isFirst: siblings[0]?.id === deliveryInstanceRowId,
    isLast: siblings[siblings.length - 1]?.id === deliveryInstanceRowId,
  };
}

async function memberFor(client: DbClient, memberId: string): Promise<MemberRow> {
  const row = await member(client, memberId);
  if (!row) throw new NotFoundError('The delivery member was not found');
  return row;
}

function whatsappParameters(parameterMap: unknown): Record<string, number> {
  return (parameterMap as Record<string, number> | null) ?? {};
}

/**
 * One delivery attempt. Skip is decided against live state here, not at
 * fan-out. `channel_unconfigured` and `provider_rejected` are terminal;
 * `transport_unavailable` is stored and thrown so pg-boss backs off.
 */
export async function deliverNotification(
  db: Db,
  senders: NotificationSenders,
  deliveryId: string,
  now: Date = new Date(),
): Promise<void> {
  const current = await loadDelivery(db, deliveryId);
  if (!current) return;
  // Only a pending row is claimable. `failed` is terminal under FR-21: a `provider_rejected` or a
  // dead-lettered row must not be re-sent because pg-boss redelivered the job at least once, which
  // it does after a crash between the commit and the ack. `sending` is another worker's claim.
  if (current.status !== 'pending') return;

  // The claim re-checks the instance, in the same statement, so a cancelled instance matches
  // nothing. Answer 5 promises the handler re-checks status, and the closed skip set has no code
  // for "withdrawn", so writing one here would be a lie: the row stays pending and the officer
  // sees it, rather than a fabricated reason.
  const claimed = await db.query<{ id: string }>(
    `update notification_deliveries d
        set status = 'sending'
       from notification_slot_instances i
      where d.id = $1 and d.status = 'pending'
        and i.id = d.instance_id and i.status <> 'cancelled'
      returning d.id`,
    [deliveryId],
  );
  if (claimed.length === 0) return;

  const instance = await loadInstance(db, current.instance_id);
  if (!instance) {
    await db.query(
      `update notification_deliveries set status = 'skipped', skip_reason = 'no_contact' where id = $1`,
      [deliveryId],
    );
    return;
  }

  const resolved = await resolveRecipients(db, [current.member_id], now);
  const destination = resolved.destinations.get(current.member_id)?.get(current.channel) ?? null;
  const periodId = instance.period_id ?? (await eventPeriodId(db, instance.event_id));
  const states = await preferenceStates(db, [current.member_id], instance.event_id, periodId, now);
  const state = states.get(current.member_id)!;
  const cadence = state.cadence as Cadence;
  const occurrence = await cadenceContext(db, instance, instance.id);
  const allowed = cadenceAllows(cadence, instance.kind, occurrence);

  const skip = evaluateSkip({
    channelBlocked: state.blocked.has(current.channel),
    eventMuted: state.eventMuted,
    periodMuted: state.periodMuted,
    cadenceAllowed: allowed,
    hasDestination: destination !== null,
  });

  if (skip) {
    await db.query(
      `update notification_deliveries
          set status = 'skipped', skip_reason = $2, contact_id = null,
              destination_masked = null
        where id = $1`,
      [deliveryId, skip],
    );
    return;
  }

  // `destination` is non-null: `evaluateSkip` returned no `no_contact`.
  const target = destination!;
  const sender = senders[current.channel];
  if (!sender) {
    await db.query(
      `update notification_deliveries
          set status = 'failed', last_error_code = 'channel_unconfigured',
              attempts = attempts + 1
        where id = $1`,
      [deliveryId],
    );
    return;
  }

  const memberRow = await memberFor(db, current.member_id);
  const context = await bodyContext(db, instance, now);
  const message = current.message_id
    ? (
        await db.query<{ body_text: string }>(
          'select body_text from notification_messages where id = $1',
          [current.message_id],
        )
      )[0]
    : undefined;
  const body =
    message?.body_text ??
    renderBody(
      context.body,
      {
        memberNo: memberRow.member_no,
        firstName: memberRow.first_name,
        lastName: memberRow.last_name,
        otherNames: memberRow.other_names,
      },
      instance,
      context,
    );

  const payload = await payloadFor(db, instance, current.channel, body, context, memberRow);

  try {
    await sender.send(target.value, payload);
    await db.query(
      `update notification_deliveries
          set status = 'sent', sent_at = $2, attempts = attempts + 1,
              contact_id = $3, destination_masked = $4, last_error_code = null
        where id = $1`,
      [deliveryId, now, target.contactId, target.masked],
    );
  } catch (error) {
    const code = error instanceof NotificationSendError ? error.code : 'transport_unavailable';
    const attempts = Number(current.attempts) + 1;
    const terminal = code === 'provider_rejected' || attempts >= MAX_ATTEMPTS;
    await db.query(
      `update notification_deliveries
          set status = $2, last_error_code = $3, attempts = attempts + 1
        where id = $1`,
      [deliveryId, terminal ? 'failed' : 'pending', code],
    );
    if (code === 'transport_unavailable') throw error;
  }
}

async function payloadFor(
  db: DbClient,
  instance: InstanceRow,
  channel: DeliveryChannel,
  body: string,
  context: BodyContext,
  memberRow: MemberRow,
): Promise<{
  subject?: string;
  html?: string;
  text?: string;
  mediaUrl?: string;
  template?: { name: string; parameters: string[] };
  attachments?: Array<{ filename: string; contentType: string; url: string; inline?: boolean }>;
}> {
  if (instance.kind === 'change' && instance.change_notice_id) {
    const notice = await loadNotice(db, instance.change_notice_id);
    if (channel === 'email') {
      return {
        subject: notice?.email_subject ?? notice?.title ?? context.title,
        text: notice?.email_body_text ?? body,
        html: `<p>${escapeHtml(notice?.email_body_text ?? body)}</p>`,
      };
    }
    if (channel === 'whatsapp') {
      return {
        template: {
          name: notice?.whatsapp_template ?? '',
          parameters: Array.isArray(notice?.whatsapp_parameters)
            ? (notice?.whatsapp_parameters as string[])
            : [],
        },
        mediaUrl: context.flier?.url ?? undefined,
      };
    }
    return { text: body };
  }

  const [template] = await db.query<{
    subject: string | null;
    body_text: string | null;
    template_name: string | null;
    parameter_map: unknown;
  }>(
    `select subject, body_text, template_name, parameter_map
       from notification_templates
      where plan_id = $1 and revision = $2 and channel = $3`,
    [instance.plan_id, instance.revision, channel],
  );

  if (channel === 'email') {
    const values = resolvedValues({
      firstName: memberRow.first_name,
      fullName: [memberRow.first_name, memberRow.last_name, memberRow.other_names]
        .filter(Boolean)
        .join(' '),
      eventName: instance.event_name,
      eventDate: context.date,
      startTime: context.startTime,
      endTime: context.endTime,
      venue: instance.venue_name,
      periodName: instance.period_name,
      memberNo: memberRow.member_no,
      churchName: 'The Church',
      flierUrl: context.flier?.url ?? null,
    });
    const subject = interpolate(template?.subject ?? context.title, values);
    return {
      subject,
      text: body,
      html: `<p>${escapeHtml(body)}</p>`,
      ...(context.flier
        ? {
            attachments: [
              {
                filename: `flier-${context.flier.token.slice(0, 8)}`,
                contentType: context.flier.contentType,
                url: context.flier.url,
                inline: true,
              },
            ],
          }
        : {}),
    };
  }

  if (channel === 'whatsapp') {
    const rendered = renderWhatsApp(
      {
        templateName: template?.template_name ?? '',
        parameterMap: whatsappParameters(template?.parameter_map),
      },
      resolvedValues({
        firstName: memberRow.first_name,
        fullName: [memberRow.first_name, memberRow.last_name, memberRow.other_names]
          .filter(Boolean)
          .join(' '),
        eventName: instance.event_name,
        eventDate: context.date,
        startTime: context.startTime,
        endTime: context.endTime,
        venue: instance.venue_name,
        periodName: instance.period_name,
        memberNo: memberRow.member_no,
        churchName: 'The Church',
        flierUrl: context.flier?.url ?? null,
      }),
      context.flier,
    );
    return {
      template: {
        name: rendered.templateName,
        parameters: rendered.parameters.sort((a, b) => a.slot - b.slot).map((entry) => entry.value),
      },
      mediaUrl: context.flier?.url ?? undefined,
    };
  }

  return { text: body };
}

function interpolate(template: string, values: NotificationValues): string {
  return template.replace(
    /\{\{([a-zA-Z]+)\}\}/g,
    (_match, name: string) => (values as unknown as Record<string, string | null>)[name] ?? '',
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * One audited retry (FR-45). Only a `failed` row is accepted; the retry is
 * re-enqueued, and the send path re-checks live mutes and blocks, so a retry
 * may end `skipped`.
 */
export async function retryDelivery(
  db: Db,
  deliveryId: string,
  actor: string,
  queue: Queue | undefined,
  now: Date = new Date(),
): Promise<NotificationDelivery> {
  const current = await loadDelivery(db, deliveryId);
  if (!current) throw new NotFoundError(`Delivery ${deliveryId} was not found`);
  if (current.status !== 'failed') {
    throw new ConflictError(
      `Only a failed delivery can be retried (it is ${current.status})`,
      'delivery_not_failed',
    );
  }

  await db.transaction(async (tx) => {
    // A manual retry grants a fresh budget. Without the reset, a dead-lettered row at
    // MAX_ATTEMPTS would be claimed once, increment to six, and terminate immediately - the
    // officer's click would never send.
    await tx.query(
      `update notification_deliveries
          set status = 'pending', last_error_code = null, sent_at = null, attempts = 0
        where id = $1`,
      [deliveryId],
    );
    await tx.query(
      `insert into notification_preference_events
         (member_id, field, from_value, to_value, source, actor, at)
       values ($1, 'delivery_retry', $2, 'pending', 'admin', $3, $4)`,
      [current.member_id, current.status, actor, now],
    );
  });

  if (queue) {
    // A manual retry is a new unit, so it must not share the fan-out's singleton key: `exclusive`
    // dedupes against a completed `delivery:<id>` job, and a second retry of a delivery that failed
    // again would be swallowed. The row's own state machine is the real guard (only `pending`
    // claims), and the timestamp keeps a deliberate retry from being dropped as a duplicate.
    await queue.enqueue(
      'notification.send',
      { deliveryId },
      { singletonKey: `delivery:${deliveryId}:retry:${now.getTime()}` },
    );
  }

  const updated = await loadDelivery(db, deliveryId);
  return toDelivery(updated ?? current);
}

/** The tick's delivery repair: a pending delivery whose instance has fanned out. */
export async function pendingDeliveries(db: Db, now: Date): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `select d.id
       from notification_deliveries d
       join notification_slot_instances i on i.id = d.instance_id
      where d.status = 'pending' and i.status = 'sent'
      order by d.created_at, d.id
      limit 500`,
    [],
  );
  void now;
  return rows.map((row) => row.id);
}

/** The route's seam: the retry and the fan-out/send handlers share one repository. */
export class NotificationDeliveryRepository {
  constructor(
    private readonly db: Db,
    private readonly queue?: Queue,
  ) {}

  retry(id: string, actor: string, now: Date = new Date()): Promise<NotificationDelivery> {
    return retryDelivery(this.db, id, actor, this.queue, now);
  }

  fanOut(instanceId: string, now: Date = new Date()): Promise<void> {
    return fanOutInstance(this.db, instanceId, { queue: this.queue }, now);
  }

  deliver(senders: NotificationSenders, deliveryId: string, now: Date = new Date()): Promise<void> {
    return deliverNotification(this.db, senders, deliveryId, now);
  }
}
