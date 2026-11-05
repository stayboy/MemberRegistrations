import type { Db, DbClient } from '../db/sql.js';
import { assertDate } from '../domain/contacts.js';
import {
  EventNotActiveError,
  InvalidExceptionDateError,
  NotFoundError,
  OfferingAlreadyAttachedError,
  TermsVersionConflictError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import { isHeldOccurrence } from './occurrences.js';
import type {
  AttachInput,
  ExceptionInput,
  ExceptionRowItem,
  OfferingKind,
  OfferingsListQuery,
  SeriesAttachInput,
  TermsInput,
  TermsPublishInput,
} from '../schemas/offerings.js';

export interface OfferingTermsItem {
  version: number;
  name: string | null;
  purpose: string;
  kind: OfferingKind;
  currency: string;
  targetMinor: number | null;
  defaultAmountMinor: number | null;
  startsOn: string | null;
  endsOn: string | null;
  availableUntil: string | null;
  scripture: string | null;
  gatewayAccount: string | null;
  gatewayMetadata: Record<string, string> | null;
  /** Audit (NFR-3): who published this version, when, and why. */
  createdAt: string;
  createdBy: string;
  /** Null for version 1; required on every later version. */
  reason: string | null;
}

export interface OfferingStatsItem {
  attachedEvents: number;
  pledgedMinor: number;
  paidMinor: number;
  pendingMinor: number;
  honorRate: number;
  contributionCount: number;
}

export interface OfferingItem {
  id: string;
  active: boolean;
  terms: OfferingTermsItem;
  createdAt: string;
}

export interface EventOfferingItem {
  offeringId: string;
  /** Resolved by the API: the custom name, or `${event.name} · ${kindLabel}`. */
  name: string;
  availableUntil: string | null;
  expired: boolean;
  terms: OfferingTermsItem;
  exceptions: Array<{ date: string; kind: 'skip' | 'opt_in'; note: string | null }>;
  stats: OfferingStatsItem;
}

export interface OfferingAttachmentItem {
  attachmentId: string;
  offeringId: string;
  availableUntil: string | null;
  terms: OfferingTermsItem;
}

export type ExceptionKind = 'event' | 'series';

const KIND_LABELS: Record<OfferingKind, string> = {
  freewill: 'Freewill',
  tithe: 'Tithe',
  pledge: 'Pledge',
  building: 'Building',
  missions: 'Missions',
  other: 'Other',
};

const TERMS_COLUMNS = `
  t.version,
  t.name,
  t.purpose,
  t.kind,
  t.currency,
  t.target_minor,
  t.default_amount_minor,
  t.starts_on,
  t.ends_on,
  t.available_until,
  t.scripture,
  t.gateway_account,
  t.gateway_metadata,
  t.reason,
  t.created_at as terms_created_at,
  t.created_by as terms_created_by`;

const CURRENT_TERMS_JOIN = `
  join lateral (
    select *
    from offering_terms t
    where t.offering_id = o.id
    order by t.version desc
    limit 1
  ) t on true`;

const INSERT_TERMS_SQL = `
insert into offering_terms (
  offering_id, version, name, purpose, kind, currency,
  target_minor, default_amount_minor, starts_on, ends_on, available_until,
  scripture, gateway_account, gateway_metadata, reason, created_by
) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
returning version, name, purpose, kind, currency,
          target_minor, default_amount_minor, starts_on, ends_on, available_until,
          scripture, gateway_account, gateway_metadata, reason,
          created_at as terms_created_at, created_by as terms_created_by
`;

type TermsRow = {
  version: number | string;
  name: string | null;
  purpose: string;
  kind: string;
  currency: string;
  target_minor: number | string | null;
  default_amount_minor: number | string | null;
  starts_on: unknown;
  ends_on: unknown;
  available_until: unknown;
  scripture: string | null;
  gateway_account: string | null;
  gateway_metadata: unknown;
  reason: string | null;
  terms_created_at: unknown;
  terms_created_by: string;
};

type OfferingRow = TermsRow & {
  id: string;
  active: boolean;
  created_at: unknown;
};

type AttachmentRow = TermsRow & {
  attachment_id: string;
  offering_id: string;
  event_instance_id: string | null;
  series_id: string | null;
  /** The attachment's own date, aliased away from the terms date. */
  attachment_available_until: unknown;
};

type EventContextRow = {
  id: string;
  name: string;
  end_date: unknown;
  series_id: string | null;
  sessions: unknown;
};

type EventGuardRow = {
  id: string;
  status: string;
  end_date: unknown;
  sessions: unknown;
};

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function requiredDate(value: unknown): string {
  return isoDate(value)!;
}

function isoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numberOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseMetadata(value: unknown): Record<string, string> | null {
  if (value === null || value === undefined) return null;
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, string>;
}

function termsFromRow(row: TermsRow): OfferingTermsItem {
  return {
    version: Number(row.version),
    name: row.name,
    purpose: row.purpose,
    kind: row.kind as OfferingKind,
    currency: row.currency,
    targetMinor: numberOrNull(row.target_minor),
    defaultAmountMinor: numberOrNull(row.default_amount_minor),
    startsOn: isoDate(row.starts_on),
    endsOn: isoDate(row.ends_on),
    availableUntil: isoDate(row.available_until),
    scripture: row.scripture,
    gatewayAccount: row.gateway_account,
    gatewayMetadata: parseMetadata(row.gateway_metadata),
    createdAt: isoTimestamp(row.terms_created_at),
    createdBy: row.terms_created_by,
    reason: row.reason,
  };
}

function offeringFromRow(row: OfferingRow): OfferingItem {
  return {
    id: row.id,
    active: row.active,
    terms: termsFromRow(row),
    createdAt: isoTimestamp(row.created_at),
  };
}

type TermsValues = Omit<OfferingTermsItem, 'version' | 'createdAt' | 'createdBy' | 'reason'>;

function normalizeTerms(input: TermsInput): TermsValues {
  const name = input.name?.trim() ? input.name.trim() : null;
  return {
    name,
    purpose: input.purpose.trim(),
    kind: input.kind,
    currency: input.currency,
    targetMinor: input.targetMinor ?? null,
    defaultAmountMinor: input.defaultAmountMinor ?? null,
    startsOn: input.startsOn ? assertDate(input.startsOn, 'startsOn') : null,
    endsOn: input.endsOn ? assertDate(input.endsOn, 'endsOn') : null,
    availableUntil: input.availableUntil
      ? assertDate(input.availableUntil, 'availableUntil')
      : null,
    scripture: input.scripture ?? null,
    gatewayAccount: input.gatewayAccount ?? null,
    gatewayMetadata: input.gatewayMetadata ?? null,
  };
}

function termsParams(
  offeringId: string,
  version: number,
  terms: TermsValues,
  reason: string | null,
  actor: string,
): unknown[] {
  return [
    offeringId,
    version,
    terms.name,
    terms.purpose,
    terms.kind,
    terms.currency,
    terms.targetMinor,
    terms.defaultAmountMinor,
    terms.startsOn,
    terms.endsOn,
    terms.availableUntil,
    terms.scripture,
    terms.gatewayAccount,
    terms.gatewayMetadata === null ? null : JSON.stringify(terms.gatewayMetadata),
    reason,
    actor,
  ];
}

export function emptyOfferingStats(): OfferingStatsItem {
  return {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  };
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The effective expiry of an attachment: its own date, else the offering's
 * terms date, else the event (or occurrence) end date.
 */
export function effectiveAvailableUntil(input: {
  attachmentAvailableUntil: string | null;
  termsAvailableUntil: string | null;
  eventEndDate: string | null;
}): string | null {
  return input.attachmentAvailableUntil ?? input.termsAvailableUntil ?? input.eventEndDate ?? null;
}

/** After `availableUntil` a new gift is rejected; a pending pledge still survives. */
export function isExpired(availableUntil: string | null, todayUtc: string): boolean {
  return availableUntil !== null && todayUtc > availableUntil;
}

async function currentTerms(db: DbClient, offeringId: string): Promise<OfferingTermsItem> {
  const [row] = await db.query<TermsRow>(
    `select ${TERMS_COLUMNS}
       from offering_terms t
      where t.offering_id = $1
      order by t.version desc
      limit 1`,
    [offeringId],
  );
  if (!row) throw new NotFoundError(`Offering ${offeringId} has no published terms`);
  return termsFromRow(row);
}

async function assertActiveOffering(db: DbClient, offeringId: string): Promise<void> {
  const [offering] = await db.query<{ active: boolean }>(
    'select active from offerings where id = $1',
    [offeringId],
  );
  if (!offering) throw new NotFoundError(`Offering ${offeringId} was not found`);
  if (!offering.active) {
    throw new ValidationError(`Offering ${offeringId} is archived and cannot be attached`);
  }
}

async function assertNotAttached(
  db: DbClient,
  offeringId: string,
  target: { eventId?: string; seriesId?: string },
): Promise<void> {
  const [existing] = target.eventId
    ? await db.query<{ id: string }>(
        `select id from event_instance_offerings
          where offering_id = $1 and event_instance_id = $2 and detached_on is null`,
        [offeringId, target.eventId],
      )
    : await db.query<{ id: string }>(
        `select id from event_instance_offerings
          where offering_id = $1 and series_id = $2 and detached_on is null`,
        [offeringId, target.seriesId],
      );
  if (existing) {
    throw new OfferingAlreadyAttachedError(
      `Offering ${offeringId} is already attached to this ${target.eventId ? 'event' : 'series'}`,
    );
  }
}

async function activeAttachmentId(
  db: DbClient,
  kind: ExceptionKind,
  targetId: string,
  offeringId: string,
): Promise<string> {
  const [row] =
    kind === 'event'
      ? await db.query<{ id: string }>(
          `select id from event_instance_offerings
            where event_instance_id = $1 and offering_id = $2 and detached_on is null`,
          [targetId, offeringId],
        )
      : await db.query<{ id: string }>(
          `select id from event_instance_offerings
            where series_id = $1 and offering_id = $2 and detached_on is null`,
          [targetId, offeringId],
        );
  if (!row) {
    throw new NotFoundError(
      `Offering ${offeringId} has no active attachment on this ${kind === 'event' ? 'event' : 'series'}`,
    );
  }
  return row.id;
}

function exceptionRow(row: {
  id: string;
  date: unknown;
  kind: string;
  note: string | null;
  created_at: unknown;
  created_by: string;
}): ExceptionRowItem {
  return {
    id: row.id,
    date: requiredDate(row.date),
    kind: row.kind as 'skip' | 'opt_in',
    note: row.note,
    createdAt: isoTimestamp(row.created_at),
    createdBy: row.created_by,
  };
}

export class OfferingRepository {
  constructor(private readonly db: Db) {}

  async create(input: TermsInput, actor: string): Promise<OfferingItem> {
    const terms = normalizeTerms(input);

    const id = await this.db.transaction(async (tx) => {
      const [offering] = await tx.query<{ id: string }>(
        'insert into offerings default values returning id',
      );
      await tx.query(INSERT_TERMS_SQL, termsParams(offering!.id, 1, terms, null, actor));
      return offering!.id;
    });

    return this.get(id);
  }

  async get(id: string): Promise<OfferingItem> {
    const [row] = await this.db.query<OfferingRow>(
      `select o.id, o.active, o.created_at, ${TERMS_COLUMNS}
         from offerings o
         ${CURRENT_TERMS_JOIN}
        where o.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundError(`Offering ${id} was not found`);
    return offeringFromRow(row);
  }

  /**
   * Default: active only. `active=false`: archived only. `includeArchived=true`:
   * both. Newest first; the catalogue is small enough not to page.
   */
  async list(query: OfferingsListQuery): Promise<OfferingItem[]> {
    const activeFilter =
      query.includeArchived === 'true' ? null : query.active === 'false' ? false : true;
    const rows = await this.db.query<OfferingRow>(
      `select o.id, o.active, o.created_at, ${TERMS_COLUMNS}
         from offerings o
         ${CURRENT_TERMS_JOIN}
        where ($1::boolean is null or o.active = $1::boolean)
        order by o.created_at desc, o.id desc`,
      [activeFilter],
    );
    return rows.map(offeringFromRow);
  }

  async listTerms(id: string): Promise<OfferingTermsItem[]> {
    const [offering] = await this.db.query('select 1 from offerings where id = $1', [id]);
    if (!offering) throw new NotFoundError(`Offering ${id} was not found`);

    const rows = await this.db.query<TermsRow>(
      `select ${TERMS_COLUMNS}
         from offering_terms t
        where t.offering_id = $1
        order by t.version desc`,
      [id],
    );
    return rows.map(termsFromRow);
  }

  /** A stale `baseVersion` is a conflict; a published version is never edited. */
  async publishTerms(
    id: string,
    input: TermsPublishInput,
    actor: string,
  ): Promise<OfferingTermsItem> {
    const terms = normalizeTerms(input);

    return this.db.transaction(async (tx) => {
      const [offering] = await tx.query<{ id: string }>(
        'select id from offerings where id = $1 for update',
        [id],
      );
      if (!offering) throw new NotFoundError(`Offering ${id} was not found`);

      const [current] = await tx.query<{ version: number | string | null }>(
        'select max(version) as version from offering_terms where offering_id = $1',
        [id],
      );
      const currentVersion = Number(current?.version ?? 0);
      if (currentVersion !== input.baseVersion) {
        throw new TermsVersionConflictError(
          `Terms version ${input.baseVersion} is not current (latest is ${currentVersion})`,
        );
      }

      const version = currentVersion + 1;
      const [inserted] = await tx.query<TermsRow>(
        INSERT_TERMS_SQL,
        termsParams(id, version, terms, input.reason, actor),
      );
      return termsFromRow(inserted!);
    });
  }

  async setActive(id: string, active: boolean, actor: string): Promise<OfferingItem> {
    const [updated] = await this.db.query<{ id: string }>(
      `update offerings
          set active = $2, updated_at = now(), updated_by = $3
        where id = $1
        returning id`,
      [id, active, actor],
    );
    if (!updated) throw new NotFoundError(`Offering ${id} was not found`);
    return this.get(id);
  }

  async attachToEvent(
    eventId: string,
    input: AttachInput,
    actor: string,
  ): Promise<OfferingAttachmentItem> {
    return this.db.transaction(async (tx) => {
      const [event] = await tx.query<EventGuardRow>(
        'select id, status, end_date, sessions from event_instances where id = $1',
        [eventId],
      );
      if (!event) throw new NotFoundError(`Event ${eventId} was not found`);

      const endDate = requiredDate(event.end_date);
      if (event.status === 'cancelled' || event.status === 'archived') {
        throw new EventNotActiveError(
          `Event ${eventId} is ${event.status} and cannot take offerings`,
        );
      }
      if (endDate < todayUtcDate()) {
        throw new EventNotActiveError(`Event ${eventId} has already ended`);
      }

      await assertActiveOffering(tx, input.offeringId);

      const availableUntil = input.availableUntil
        ? assertDate(input.availableUntil, 'availableUntil')
        : null;
      if (availableUntil !== null && availableUntil < endDate) {
        throw new ValidationError(
          `availableUntil ${availableUntil} must be on or after the event end ${endDate}`,
        );
      }

      await assertNotAttached(tx, input.offeringId, { eventId });

      try {
        const [inserted] = await tx.query<{ id: string }>(
          `insert into event_instance_offerings
             (event_instance_id, series_id, offering_id, available_until, attached_by)
           values ($1, null, $2, $3, $4)
           returning id`,
          [eventId, input.offeringId, availableUntil, actor],
        );
        return {
          attachmentId: inserted!.id,
          offeringId: input.offeringId,
          availableUntil,
          terms: await currentTerms(tx, input.offeringId),
        };
      } catch (error) {
        if (sqlState(error) === '23505') {
          throw new OfferingAlreadyAttachedError(
            `Offering ${input.offeringId} is already attached to event ${eventId}`,
          );
        }
        throw error;
      }
    });
  }

  async attachToSeries(
    seriesId: string,
    input: SeriesAttachInput,
    actor: string,
  ): Promise<OfferingAttachmentItem> {
    return this.db.transaction(async (tx) => {
      const [series] = await tx.query<{ id: string; archived_at: unknown }>(
        'select id, archived_at from event_series where id = $1',
        [seriesId],
      );
      if (!series) throw new NotFoundError(`Series ${seriesId} was not found`);
      if (series.archived_at !== null && series.archived_at !== undefined) {
        throw new EventNotActiveError(`Series ${seriesId} is archived and cannot take offerings`);
      }

      await assertActiveOffering(tx, input.offeringId);
      await assertNotAttached(tx, input.offeringId, { seriesId });

      try {
        const [inserted] = await tx.query<{ id: string }>(
          `insert into event_instance_offerings
             (event_instance_id, series_id, offering_id, available_until, attached_by)
           values (null, $1, $2, null, $3)
           returning id`,
          [seriesId, input.offeringId, actor],
        );
        return {
          attachmentId: inserted!.id,
          offeringId: input.offeringId,
          availableUntil: null,
          terms: await currentTerms(tx, input.offeringId),
        };
      } catch (error) {
        if (sqlState(error) === '23505') {
          throw new OfferingAlreadyAttachedError(
            `Offering ${input.offeringId} is already attached to series ${seriesId}`,
          );
        }
        throw error;
      }
    });
  }

  async detachFromEvent(eventId: string, offeringId: string, actor: string): Promise<void> {
    const [detached] = await this.db.query<{ id: string }>(
      `update event_instance_offerings
          set detached_on = now(), detached_by = $3
        where event_instance_id = $1 and offering_id = $2 and detached_on is null
        returning id`,
      [eventId, offeringId, actor],
    );
    if (!detached) {
      throw new NotFoundError(
        `Offering ${offeringId} has no active attachment on event ${eventId}`,
      );
    }
  }

  async detachFromSeries(seriesId: string, offeringId: string, actor: string): Promise<void> {
    const [detached] = await this.db.query<{ id: string }>(
      `update event_instance_offerings
          set detached_on = now(), detached_by = $3
        where series_id = $1 and offering_id = $2 and detached_on is null
        returning id`,
      [seriesId, offeringId, actor],
    );
    if (!detached) {
      throw new NotFoundError(
        `Offering ${offeringId} has no active attachment on series ${seriesId}`,
      );
    }
  }

  async listEventAttachments(eventId: string): Promise<OfferingAttachmentItem[]> {
    const [event] = await this.db.query('select 1 from event_instances where id = $1', [eventId]);
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    return this.listAttachments('event_instance_id', eventId);
  }

  async listSeriesAttachments(seriesId: string): Promise<OfferingAttachmentItem[]> {
    const [series] = await this.db.query('select 1 from event_series where id = $1', [seriesId]);
    if (!series) throw new NotFoundError(`Series ${seriesId} was not found`);
    return this.listAttachments('series_id', seriesId);
  }

  private async listAttachments(
    column: 'event_instance_id' | 'series_id',
    targetId: string,
  ): Promise<OfferingAttachmentItem[]> {
    const rows = await this.db.query<AttachmentRow>(
      `select a.id as attachment_id, a.offering_id, a.event_instance_id, a.series_id,
              a.available_until as attachment_available_until, ${TERMS_COLUMNS}
         from event_instance_offerings a
         join offerings o on o.id = a.offering_id
         ${CURRENT_TERMS_JOIN}
        where a.${column} = $1 and a.detached_on is null
        order by a.attached_on, a.id`,
      [targetId],
    );
    return rows.map((row) => ({
      attachmentId: row.attachment_id,
      offeringId: row.offering_id,
      availableUntil: isoDate(row.attachment_available_until),
      terms: termsFromRow(row),
    }));
  }

  /**
   * Append a skip/opt-in. An event accepts `skip` on one of its session dates;
   * a series accepts `skip` on a date it meets and `opt_in` on an extra date.
   */
  async addException(
    kind: ExceptionKind,
    targetId: string,
    offeringId: string,
    input: ExceptionInput,
    actor: string,
  ): Promise<ExceptionRowItem> {
    const date = assertDate(input.date);
    const note = input.note ?? null;

    return this.db.transaction(async (tx) => {
      const attachmentId = await activeAttachmentId(tx, kind, targetId, offeringId);

      if (kind === 'event') {
        const [event] = await tx.query<{ sessions: unknown }>(
          'select sessions from event_instances where id = $1',
          [targetId],
        );
        const sessionDates = new Set(
          parseJsonArray(event!.sessions).map((session) =>
            requiredDate((session as { date?: unknown }).date),
          ),
        );
        if (input.kind !== 'skip') {
          throw new InvalidExceptionDateError('An event attachment accepts only a skip exception');
        }
        if (!sessionDates.has(date)) {
          throw new InvalidExceptionDateError(`${date} is not a session date of event ${targetId}`);
        }
      } else if (input.kind === 'skip') {
        if (!(await isHeldOccurrence(tx, targetId, date))) {
          throw new InvalidExceptionDateError(`${date} is not a date the series meets`);
        }
      } else {
        const [extra] = await tx.query<{ occurs_on: unknown }>(
          `select occurs_on from series_exceptions
            where series_id = $1 and occurs_on = $2 and kind = 'extra'`,
          [targetId, date],
        );
        if (!extra) {
          throw new InvalidExceptionDateError(`${date} is not an extra date of the series`);
        }
      }

      const [inserted] = await tx.query<{
        id: string;
        date: unknown;
        kind: string;
        note: string | null;
        created_at: unknown;
        created_by: string;
      }>(
        `insert into offering_exceptions (attachment_id, date, kind, note, created_by)
         values ($1, $2, $3, $4, $5)
         returning id, date, kind, note, created_at, created_by`,
        [attachmentId, date, input.kind, note, actor],
      );
      return exceptionRow(inserted!);
    });
  }

  async listExceptions(
    kind: ExceptionKind,
    targetId: string,
    offeringId: string,
  ): Promise<ExceptionRowItem[]> {
    const attachmentId = await activeAttachmentId(this.db, kind, targetId, offeringId);
    const rows = await this.db.query<{
      id: string;
      date: unknown;
      kind: string;
      note: string | null;
      created_at: unknown;
      created_by: string;
    }>(
      `select id, date, kind, note, created_at, created_by
         from offering_exceptions
        where attachment_id = $1
        order by created_at desc, id desc`,
      [attachmentId],
    );
    return rows.map(exceptionRow);
  }
}

/**
 * One batched read for the event aggregate: active event and series
 * attachments, their current terms, effective exceptions and active-attachment
 * counts. No query runs per event.
 */
export async function eventOfferingsFor(
  db: DbClient,
  eventIds: string[],
  todayUtc: string,
): Promise<Map<string, EventOfferingItem[]>> {
  const result = new Map<string, EventOfferingItem[]>();
  for (const id of eventIds) result.set(id, []);
  if (eventIds.length === 0) return result;

  const events = await db.query<EventContextRow>(
    `select id, name, end_date, series_id, sessions
       from event_instances
      where id = any($1::uuid[])`,
    [eventIds],
  );
  if (events.length === 0) return result;

  const seriesIds = [
    ...new Set(events.map((event) => event.series_id).filter((id): id is string => id !== null)),
  ];

  const attachments = await db.query<AttachmentRow>(
    `select a.id as attachment_id, a.offering_id, a.event_instance_id, a.series_id,
            a.available_until as attachment_available_until, ${TERMS_COLUMNS}
       from event_instance_offerings a
       join lateral (
         select *
         from offering_terms t
         where t.offering_id = a.offering_id
         order by t.version desc
         limit 1
       ) t on true
      where a.detached_on is null
        and (a.event_instance_id = any($1::uuid[]) or a.series_id = any($2::uuid[]))
      order by a.attached_on, a.id`,
    [eventIds, seriesIds],
  );

  const attachmentIds = attachments.map((attachment) => attachment.attachment_id);
  const exceptionRows =
    attachmentIds.length === 0
      ? []
      : await db.query<{
          attachment_id: string;
          date: unknown;
          kind: string;
          note: string | null;
        }>(
          `select attachment_id, date, kind, note
             from offering_exceptions
            where attachment_id = any($1::uuid[])
            order by created_at desc, id desc`,
          [attachmentIds],
        );

  // Newest first, so the first row seen for a date is the effective exception.
  const effective = new Map<
    string,
    Map<string, { date: string; kind: 'skip' | 'opt_in'; note: string | null }>
  >();
  for (const row of exceptionRows) {
    const byDate = effective.get(row.attachment_id) ?? new Map();
    const date = requiredDate(row.date);
    if (!byDate.has(date)) {
      byDate.set(date, { date, kind: row.kind as 'skip' | 'opt_in', note: row.note });
    }
    effective.set(row.attachment_id, byDate);
  }

  const offeredIds = [...new Set(attachments.map((attachment) => attachment.offering_id))];
  const counts =
    offeredIds.length === 0
      ? []
      : await db.query<{ offering_id: string; attached_events: number | string }>(
          `select offering_id, count(*)::int as attached_events
             from event_instance_offerings
            where detached_on is null
              and event_instance_id is not null
              and offering_id = any($1::uuid[])
            group by offering_id`,
          [offeredIds],
        );
  const countsByOffering = new Map(
    counts.map((row) => [row.offering_id, Number(row.attached_events)]),
  );

  for (const event of events) {
    const sessionDates = new Set(
      parseJsonArray(event.sessions).map((session) =>
        requiredDate((session as { date?: unknown }).date),
      ),
    );
    const items = result.get(event.id)!;

    for (const attachment of attachments) {
      const appliesToEvent =
        attachment.event_instance_id === event.id ||
        (event.series_id !== null && attachment.series_id === event.series_id);
      if (!appliesToEvent) continue;

      const terms = termsFromRow(attachment);
      const availableUntil = effectiveAvailableUntil({
        attachmentAvailableUntil: isoDate(attachment.attachment_available_until),
        termsAvailableUntil: terms.availableUntil,
        eventEndDate: requiredDate(event.end_date),
      });
      const exceptions = [...(effective.get(attachment.attachment_id)?.values() ?? [])]
        .filter((exception) => sessionDates.has(exception.date))
        .sort((a, b) => a.date.localeCompare(b.date));

      items.push({
        offeringId: attachment.offering_id,
        name: terms.name?.trim() ? terms.name.trim() : `${event.name} · ${KIND_LABELS[terms.kind]}`,
        availableUntil,
        expired: isExpired(availableUntil, todayUtc),
        terms,
        exceptions,
        stats: {
          attachedEvents: countsByOffering.get(attachment.offering_id) ?? 0,
          pledgedMinor: 0,
          paidMinor: 0,
          pendingMinor: 0,
          honorRate: 0,
          contributionCount: 0,
        },
      });
    }
  }

  return result;
}
