import { createHash } from 'node:crypto';
import type { Db, DbClient } from '../db/sql.js';
import {
  ConflictError,
  NotFoundError,
  SessionClosedError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import { ageInYears } from '../domain/age.js';
import { assertDate } from '../domain/contacts.js';
import { todayIn } from '../domain/series.js';
import { resolveSeriesOccurrences } from './occurrences.js';
import { sessionIsClosed } from './captures.js';
import type { Gender } from './members.js';
import {
  emptyOfferingStats,
  eventOfferingsFor,
  type EventOfferingItem,
  type OfferingStatsItem,
} from './offerings.js';
import { parentWindowSummary } from './series.js';
import { renderAudienceSummary } from '../domain/audiences.js';
import type { AudienceRule } from '../schemas/audiences.js';
import type { SeriesSummary } from '../schemas/reference.js';
import type { CreateEventInput, EventListQuery, UpdateEventInput } from '../schemas/events.js';

export type VenueType = 'auditorium' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'active' | 'archived';
export type EventSessionStatus = 'scheduled' | 'held' | 'cancelled';
export type EventSource = 'series' | 'manual' | 'import';
export type SessionSource = 'import' | 'manual' | 'mixed' | 'none';

export interface EventSessionItem {
  date: string;
  startTime: string;
  endTime: string | null;
  status: EventSessionStatus;
  venueType?: VenueType;
  /**
   * The session's latest capture of either channel (later `asOf`, then recorded
   * time, then id), with the shared close state. Null when the session has no
   * capture; the detail computes live/past from the window (FR-4b).
   */
  capture: { asOf: string; ended: boolean } | null;
  /** A non-empty reason when the session is cancelled; null on a legacy cancellation. */
  note: string | null;
  present: number;
  /** The register at this session date: joined on or before it, not archived or purged. */
  expected: number;
  importedRows: number;
  source: SessionSource;
}

export interface EventItem {
  id: string;
  /** Null while a series-minted event has not been assigned an event number yet. */
  eventNo: string | null;
  name: string;
  seriesId: string | null;
  ministry: { code: string; name: string } | null;
  timezone: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string | null;
  venueType: VenueType;
  venueName: string | null;
  description: string | null;
  status: EventStatus;
  source: EventSource;
  /** False = headcount-only; per-member attendance does not apply. */
  tracksMembers: boolean;
  /** Presbyter-only events are hidden on member-facing surfaces and roster the presbyters. */
  presbyterOnly: boolean;
  sessions: EventSessionItem[];
  offerings: EventOfferingItem[];
  stats: OfferingStatsItem;
}

export interface EventDetail {
  event: EventItem;
  /** Content-derived validator; quoted on the wire. */
  etag: string;
}

export interface GenerateEventsResult {
  created: number;
  skipped: number;
  eventIds: string[];
}

interface StoredSession {
  date?: unknown;
  start_time?: string | null;
  end_time?: string | null;
  status?: string;
  venue_type?: string | null;
  note?: string | null;
}

interface WrittenSession {
  date: string;
  startTime?: string;
  endTime?: string | null;
  status?: EventSessionStatus;
  venueType?: VenueType;
  note?: string | null;
}

interface SessionCount {
  date: unknown;
  present: number | string;
  importedRows: number | string;
}

interface SessionExpected {
  date: unknown;
  expected: number | string;
}

interface SessionCaptureRow {
  date: unknown;
  asOf: unknown;
  ended: unknown;
}

export interface EventAttendanceRow {
  /** The `attendance.id` the row delete accepts; never the member id. */
  id: string;
  memberNo: string;
  name: string;
  /** Current identity label parts; age is null when dob is unknown or in the future. */
  gender: Gender;
  age: number | null;
  status: 'present';
  source: 'import' | 'manual';
  /** Wall-clock time the register carried, `HH:MM`; null for a date-only row. */
  sessionTime: string | null;
}

export interface EventAttendance {
  eventId: string;
  sessionDate: string;
  present: number;
  expected: number;
  importedRows: number;
  rows: EventAttendanceRow[];
}

export interface EventAttendanceEntry {
  id: string;
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  sessionDate: string;
  source: 'import' | 'manual';
}

type EventRow = {
  id: string;
  event_no: string | null;
  name: string;
  is_series: boolean;
  timezone: string;
  start_date: unknown;
  end_date: unknown;
  start_time: string | null;
  end_time: string | null;
  venue_type: string;
  venue_name: string | null;
  description: string | null;
  status: string;
  tracks_members: boolean;
  presbyter_only: boolean;
  sessions: unknown;
  occurrence_count: number | string;
  cancelled_count: number | string;
  ministry_code: string | null;
  ministry_name: string | null;
  session_counts: unknown;
  session_expected: unknown;
  session_captures: unknown;
};

/** The events row without the joined ministry or attendance aggregate. */
type EventRowCore = Omit<
  EventRow,
  'session_counts' | 'session_expected' | 'session_captures' | 'ministry_code' | 'ministry_name'
>;

const EVENT_COLUMNS = `
  e.id,
  e.event_no,
  e.name,
  occ.is_series,
  e.timezone,
  occ.start_date,
  occ.end_date,
  e.start_time,
  e.end_time,
  e.venue_type,
  e.venue_name,
  e.description,
  e.status,
  e.tracks_members,
  e.presbyter_only,
  occ.sessions,
  occ.occurrence_count,
  occ.cancelled_count,
  m.code as ministry_code,
  m.name as ministry_name`;

const EVENT_FROM = `
  from events e
  left join ministries m on m.id = e.ministry_id
  left join lateral (
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'date', o.date,
                 'start_time', o.start_time,
                 'end_time', o.end_time,
                 'status', o.status,
                 'venue_type', o.venue_type,
                 'note', o.note
               )
               order by o.date
             ),
             '[]'::jsonb
           ) as sessions,
           count(*) as occurrence_count,
           count(*) filter (where o.status = 'cancelled') as cancelled_count,
           min(o.date) as start_date,
           max(o.date) as end_date,
           exists (
             select 1 from event_recurrence_versions rv where rv.event_id = e.id
           ) as is_series
      from event_occurrences o
     where o.event_id = e.id
  ) occ on true`;

/**
 * Attendance per occurrence for the rows in scope. Correlated on the event id
 * so neither the list nor the detail issues a query per event or per session.
 */
function sessionCounts(alias: string): string {
  return `
  left join lateral (
    select
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'date', c.date,
                   'present', c.present,
                   'importedRows', c.imported_rows
                 )
                 order by c.date
               )
        from (
          select o.date,
                 count(a.id)::int as present,
                 count(a.id) filter (where a.source = 'import')::int as imported_rows
          from event_occurrences o
          left join attendance a on a.occurrence_id = o.id
          where o.event_id = ${alias}.id
          group by o.date
        ) c
      ), '[]'::jsonb) as session_counts,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object('date', d.date, 'expected', d.expected)
                 order by d.date
               )
        from (
          select o.date,
                 count(m.id) filter (
                   where not ${alias}.presbyter_only or m.is_presbyter
                 )::int as expected
          from event_occurrences o
          left join members m
            on coalesce(m.joined_on, m.created_at::date) <= o.date
           and m.archived_at is null
           and m.purged_at is null
          where o.event_id = ${alias}.id
          group by o.date
        ) d
      ), '[]'::jsonb) as session_expected,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object('date', g.session_date, 'asOf', g.as_of, 'ended', g.ended)
                 order by g.session_date
               )
        from (
          -- The time is the later of the two channels' latest captures, and
          -- only the current (non-superseded) headcount observation counts;
          -- ended is the session's shared close, so it unions every capture
          -- including a superseded row. A full tie resolves to the import.
          select c.session_date,
                 (array_agg(c.as_of order by c.as_of desc, c.recorded_at desc, c.channel asc, c.id desc)
                    filter (where c.is_current))[1] as as_of,
                 bool_or(c.ended) as ended
          from (
            select o.date as session_date, b.as_of, b.created_at as recorded_at, b.id,
                   0 as channel, true as is_current, b.ended
            from import_batches b
            join event_occurrences o on o.id = b.occurrence_id
            where b.kind = 'attendance'
              and o.event_id = ${alias}.id
            union all
            select o.date, h.as_of, h.recorded_at, h.id,
                   1 as channel,
                   not exists (
                     select 1 from event_session_headcounts s where s.supersedes_id = h.id
                   ) as is_current,
                   h.ended
            from event_session_headcounts h
            join event_occurrences o on o.id = h.occurrence_id
            where o.event_id = ${alias}.id
          ) c
          group by c.session_date
        ) g
      ), '[]'::jsonb) as session_captures
  ) counts on true`;
}

/**
 * One page query: the page CTE applies the filters, stable order and limit, then
 * a lateral aggregate counts attendance per session for just those rows.
 */
const LIST_SQL = `
with page as (
  select ${EVENT_COLUMNS}
  ${EVENT_FROM}
  where (
      $1::date is null
      or (select max(o.date) from event_occurrences o where o.event_id = e.id) >= $1::date
    )
    and (
      $2::date is null
      or (select min(o.date) from event_occurrences o where o.event_id = e.id) <= $2::date
    )
    and ($3::uuid is null or e.id = $3::uuid)
    and (
      $4::text is null
      or lower(m.code) = lower($4::text)
      or lower(m.name) = lower($4::text)
    )
    and ($5::text is null or e.venue_type = $5::text)
  order by occ.start_date nulls last, e.id
  limit $6::int offset $7::int
)
select p.*,
       coalesce(counts.session_counts, '[]'::jsonb) as session_counts,
       coalesce(counts.session_expected, '[]'::jsonb) as session_expected,
       coalesce(counts.session_captures, '[]'::jsonb) as session_captures
from page p
${sessionCounts('p')}
order by p.start_date nulls last, p.id
`;

const DETAIL_SQL = `
select ${EVENT_COLUMNS},
       coalesce(counts.session_counts, '[]'::jsonb) as session_counts,
       coalesce(counts.session_expected, '[]'::jsonb) as session_expected,
       coalesce(counts.session_captures, '[]'::jsonb) as session_captures
${EVENT_FROM}
${sessionCounts('e')}
where e.id = $1
`;

const ROW_SQL = `
select ${EVENT_COLUMNS}
${EVENT_FROM}
where e.id = $1
`;

const INSERT_SQL = `
insert into events (
  event_no, name, audience_id, ministry_id, presbyter_only, timezone, description,
  venue_type, venue_name, start_time, end_time, tracks_members, status
) values (
  $1, $2, $3, null, $4, $5, $6, $7, $8, $9, $10, $11, 'active'
)
returning id
`;

const UPDATE_SQL = `
update events
set name = $2,
    audience_id = $3,
    presbyter_only = $4,
    timezone = $5,
    start_time = $6,
    end_time = $7,
    venue_type = $8,
    venue_name = $9,
    description = $10,
    tracks_members = $11,
    updated_at = now()
where id = $1
`;

const INSERT_OCCURRENCE_SQL = `
insert into event_occurrences (
  event_id, date, start_time, end_time, status, note, venue_type
) values ($1,$2,$3,$4,$5,$6,$7)
on conflict (event_id, date) do update
  set start_time = excluded.start_time,
      end_time = excluded.end_time,
      status = excluded.status,
      note = excluded.note,
      venue_type = excluded.venue_type,
      updated_at = now()
`;

const VENUE_TYPES: readonly VenueType[] = ['auditorium', 'virtual', 'hybrid'];
const EVENT_STATUSES: readonly EventStatus[] = ['draft', 'active', 'archived'];
const SESSION_STATUSES: readonly EventSessionStatus[] = ['scheduled', 'held', 'cancelled'];

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoOptionalDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return isoDate(value);
}

function isoInstant(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
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

function parseCapture(value: unknown): { asOf: string; ended: boolean } | null {
  if (value === null || value === undefined) return null;
  const parsed =
    typeof value === 'string'
      ? (JSON.parse(value) as { asOf?: unknown; ended?: unknown })
      : (value as { asOf?: unknown; ended?: unknown });
  if (parsed.asOf === null || parsed.asOf === undefined) return null;
  return { asOf: isoInstant(parsed.asOf), ended: parsed.ended === true };
}

function asStatus(value: string): EventStatus {
  return EVENT_STATUSES.includes(value as EventStatus) ? (value as EventStatus) : 'active';
}

function sessionSource(present: number, importedRows: number): SessionSource {
  if (present === 0) return 'none';
  if (importedRows === 0) return 'manual';
  if (importedRows === present) return 'import';
  return 'mixed';
}

function asSessionStatus(value: string | undefined): EventSessionStatus {
  return SESSION_STATUSES.includes(value as EventSessionStatus)
    ? (value as EventSessionStatus)
    : 'scheduled';
}

function asVenueType(value: string | null | undefined): VenueType {
  return VENUE_TYPES.includes(value as VenueType) ? (value as VenueType) : 'auditorium';
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A written session inherits the event's start and end time unless it overrides
 * them; a session is scheduled until an attendance flow marks it otherwise.
 */
function normalizeSessions(
  sessions: WrittenSession[],
  startTime: string,
  endTime: string | null,
): StoredSession[] {
  return sessions.map((session) => {
    const note = session.note?.trim();
    return {
      date: session.date,
      start_time: session.startTime ?? startTime,
      end_time: session.endTime === undefined ? endTime : session.endTime,
      status: session.status ?? 'scheduled',
      venue_type: session.venueType ?? null,
      note: note ? note : null,
    };
  });
}

/**
 * A cancelled session carries a reason (FR-4a). Checked on the written set only:
 * a legacy cancellation may have no note and must not block an unrelated edit.
 */
function validateSessionReasons(sessions: StoredSession[]): void {
  for (const session of sessions) {
    if (session.status !== 'cancelled') continue;
    if (typeof session.note === 'string' && session.note.trim().length > 0) continue;
    throw new ValidationError(
      `A cancelled session on ${String(session.date)} needs a reason`,
      'reason_required',
    );
  }
}

/** Cross-field rules that need the merged event, so Zod cannot own them alone. */
function validateEventShape(input: {
  startDate: string;
  endDate: string;
  sessions: Array<{ date?: unknown }>;
}): void {
  assertDate(input.startDate, 'startDate');
  assertDate(input.endDate, 'endDate');
  if (input.endDate < input.startDate) {
    throw new ValidationError('endDate must not be before startDate');
  }
  if (input.sessions.length === 0) {
    throw new ValidationError('sessions must not be empty');
  }

  const seen = new Set<string>();
  for (const session of input.sessions) {
    const date = assertDate(isoDate(session.date), 'session.date');
    if (date < input.startDate || date > input.endDate) {
      throw new ValidationError(
        `Session date ${date} is outside the event range ${input.startDate}..${input.endDate}`,
      );
    }
    if (seen.has(date)) {
      throw new ValidationError(`Duplicate session date ${date}`);
    }
    seen.add(date);
  }
}

/**
 * Event rows have no version column, so the validator is a digest of the
 * mutable content. Any edit changes it; a stale If-Match therefore fails.
 */
function etagFor(row: EventRowCore): string {
  const payload = JSON.stringify([
    row.event_no,
    row.name,
    row.timezone,
    isoOptionalDate(row.start_date),
    isoOptionalDate(row.end_date),
    row.start_time,
    row.end_time,
    row.venue_type,
    row.venue_name,
    row.description,
    row.status,
    row.tracks_members,
    row.presbyter_only,
    parseJsonArray(row.sessions),
  ]);
  return `"e${createHash('sha256').update(payload).digest('hex').slice(0, 24)}"`;
}

async function audienceIdFor(db: DbClient, presbyterOnly: boolean): Promise<string> {
  const systemKey = presbyterOnly ? 'presbyters' : 'everyone';
  const [audience] = await db.query<{ id: string }>(
    'select id from audiences where system_key = $1',
    [systemKey],
  );
  if (!audience) throw new Error(`The ${systemKey} audience is missing`);
  return audience.id;
}

export interface EventOccurrenceItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  status: EventSessionStatus;
  venueType?: VenueType;
  capture: { asOf: string; ended: boolean } | null;
  note: string | null;
  present: number;
  expected: number;
  importedRows: number;
  source: SessionSource;
  legacyEventNo: string | null;
}

export interface EventParentItem {
  id: string;
  eventNo: string;
  name: string;
  audienceId: string;
  audience: { id: string; name: string; system: boolean; summary: string };
  ministry: { code: string; name: string } | null;
  presbyterOnly: boolean;
  timezone: string;
  description: string | null;
  venueType: VenueType;
  venueName: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string;
  endTime: string | null;
  tracksMembers: boolean;
  status: EventStatus;
  recurrence: {
    schedules: Array<{ effectiveFrom: string; rrule: string; endsOn: string | null }>;
    exceptions: Array<{ date: string; kind: 'cancelled' | 'extra'; note: string | null }>;
  } | null;
  occurrences: EventOccurrenceItem[];
  offerings: EventOfferingItem[];
  stats: OfferingStatsItem;
  summary: SeriesSummary;
}

export interface EventParentListQuery {
  from: string;
  to: string;
  seriesId?: string;
  ministry?: string;
  venueType?: string;
  limit: number;
  offset: number;
}

type ParentRow = {
  id: string;
  event_no: string | null;
  name: string;
  audience_id: string;
  audience_name: string;
  audience_system: boolean;
  audience_rule: unknown;
  ministry_code: string | null;
  ministry_name: string | null;
  presbyter_only: boolean;
  timezone: string;
  description: string | null;
  venue_type: string;
  venue_name: string | null;
  start_time: string | null;
  end_time: string | null;
  tracks_members: boolean;
  status: string;
};

type OccurrenceRow = {
  id: string;
  date: unknown;
  start_time: string | null;
  end_time: string | null;
  status: string;
  note: string | null;
  venue_type: string | null;
  legacy_event_no: string | null;
  present: number | string;
  imported_rows: number | string;
  expected: number | string;
  capture: unknown;
};

const PARENT_COLUMNS = `
  e.id,
  e.event_no,
  e.name,
  e.audience_id,
  a.name as audience_name,
  a.system as audience_system,
  a.rule as audience_rule,
  m.code as ministry_code,
  m.name as ministry_name,
  e.presbyter_only,
  e.timezone,
  e.description,
  e.venue_type,
  e.venue_name,
  e.start_time,
  e.end_time,
  e.tracks_members,
  e.status`;

const PARENT_FROM = `
  from events e
  join audiences a on a.id = e.audience_id
  left join ministries m on m.id = e.ministry_id`;

/** The parent ids whose derived range overlaps the requested window. */
const PARENT_IDS_SQL = `
with derived as (
  select e.id,
         coalesce(
           least(
             (select min(o.date) from event_occurrences o where o.event_id = e.id),
             (select min(rv.effective_from) from event_recurrence_versions rv where rv.event_id = e.id)
           ),
           (now() at time zone e.timezone)::date
         ) as start_date,
         case
           when exists (
             select 1 from event_recurrence_versions rv
              where rv.event_id = e.id and rv.ends_on is null
           ) then null
           else greatest(
             (select max(o.date) from event_occurrences o where o.event_id = e.id),
             (select max(rv.ends_on) from event_recurrence_versions rv where rv.event_id = e.id)
           )
         end as end_date
    from events e
)
select d.id
  from derived d
  join events e on e.id = d.id
  left join ministries m on m.id = e.ministry_id
 where ($1::date is null or d.end_date is null or d.end_date >= $1::date)
   and ($2::date is null or d.start_date <= $2::date)
   and ($3::uuid is null or e.id = $3::uuid)
   and (
     $4::text is null
     or lower(m.code) = lower($4::text)
     or lower(m.name) = lower($4::text)
   )
   and ($5::text is null or e.venue_type = $5::text)
 order by d.start_date, d.id
 limit $6::int offset $7::int`;

function parseAudienceRule(value: unknown): AudienceRule {
  if (typeof value === 'string') return JSON.parse(value) as AudienceRule;
  return value as AudienceRule;
}

function occurrenceStatus(
  parentStatus: string,
  storedStatus: string,
  date: string,
  today: string,
): EventSessionStatus {
  if (parentStatus === 'draft') return 'scheduled';
  if (storedStatus === 'cancelled' || parentStatus === 'archived') return 'cancelled';
  return date <= today ? 'held' : 'scheduled';
}

export class EventRepository {
  constructor(private readonly db: Db) {}

  /** One row per event parent, with its window occurrences and figures. */
  async listParents(query: EventParentListQuery): Promise<EventParentItem[]> {
    const rows = await this.db.query<{ id: string }>(PARENT_IDS_SQL, [
      query.from,
      query.to,
      query.seriesId ?? null,
      query.ministry ?? null,
      query.venueType ?? null,
      query.limit,
      query.offset,
    ]);
    const items = await Promise.all(
      rows.map((row) => this.getParent(row.id, query.from, query.to)),
    );
    return items.filter((item): item is EventParentItem => item !== null);
  }

  /** The parent detail for the window; null when the event does not exist. */
  async getParent(id: string, from: string, to: string): Promise<EventParentItem | null> {
    const [row] = await this.db.query<ParentRow>(
      `select ${PARENT_COLUMNS} ${PARENT_FROM} where e.id = $1`,
      [id],
    );
    if (!row) return null;

    const today = todayIn(row.timezone);
    const range = await this.parentRange(row.id);
    const recurrence = await this.parentRecurrence(row.id, range.isRecurring);
    const occurrences = await this.parentOccurrences(row, from, to, today);
    const summary = await parentWindowSummary(
      this.db,
      { id: row.id, timezone: row.timezone },
      from,
      to,
    );
    const offeringsByEvent = await eventOfferingsFor(this.db, [row.id], todayUtc());
    const rule = parseAudienceRule(row.audience_rule);

    return {
      id: row.id,
      eventNo: row.event_no ?? '',
      name: row.name,
      audienceId: row.audience_id,
      audience: {
        id: row.audience_id,
        name: row.audience_name,
        system: row.audience_system,
        summary: renderAudienceSummary(row.audience_name, rule),
      },
      ministry:
        row.ministry_code && row.ministry_name
          ? { code: row.ministry_code, name: row.ministry_name }
          : null,
      presbyterOnly: row.presbyter_only,
      timezone: row.timezone,
      description: row.description,
      venueType: asVenueType(row.venue_type),
      venueName: row.venue_name,
      startDate: range.startDate,
      endDate: range.endDate,
      startTime: row.start_time ?? '',
      endTime: row.end_time,
      tracksMembers: row.tracks_members,
      status: asStatus(row.status),
      recurrence,
      occurrences,
      offerings: offeringsByEvent.get(row.id) ?? [],
      stats: {
        ...emptyOfferingStats(),
        attachedEvents: summary.offerings.attachedCount,
        pledgedMinor: summary.offerings.pledgedMinor,
        paidMinor: summary.offerings.paidMinor,
        pendingMinor: summary.offerings.outstandingMinor,
      },
      summary,
    };
  }

  private async parentRange(id: string): Promise<{
    startDate: string;
    endDate: string | null;
    isRecurring: boolean;
  }> {
    const [row] = await this.db.query<{
      first_occ: unknown;
      last_occ: unknown;
      first_sch: unknown;
      last_sch: unknown;
      unbounded: boolean;
      is_recurring: boolean;
    }>(
      `select
         (select min(o.date) from event_occurrences o where o.event_id = $1) as first_occ,
         (select max(o.date) from event_occurrences o where o.event_id = $1) as last_occ,
         (select min(rv.effective_from) from event_recurrence_versions rv where rv.event_id = $1)
           as first_sch,
         (select max(rv.ends_on) from event_recurrence_versions rv where rv.event_id = $1)
           as last_sch,
         coalesce(
           (select bool_or(rv.ends_on is null) from event_recurrence_versions rv where rv.event_id = $1),
           false
         ) as unbounded,
         exists (
           select 1 from event_recurrence_versions rv where rv.event_id = $1
         ) as is_recurring`,
      [id],
    );
    const starts = [isoOptionalDate(row?.first_occ), isoOptionalDate(row?.first_sch)]
      .filter((value): value is string => value !== null)
      .sort();
    const startDate = starts[0] ?? todayUtc();
    if (row?.unbounded) return { startDate, endDate: null, isRecurring: true };
    const ends = [isoOptionalDate(row?.last_occ), isoOptionalDate(row?.last_sch)]
      .filter((value): value is string => value !== null)
      .sort();
    return {
      startDate,
      endDate: ends.length > 0 ? ends[ends.length - 1]! : null,
      isRecurring: row?.is_recurring === true,
    };
  }

  private async parentRecurrence(
    id: string,
    isRecurring: boolean,
  ): Promise<EventParentItem['recurrence']> {
    if (!isRecurring) return null;
    const schedules = await this.db.query<{
      effective_from: unknown;
      rrule: string;
      ends_on: unknown;
    }>(
      `select effective_from, rrule, ends_on
         from event_recurrence_versions
        where event_id = $1
        order by effective_from`,
      [id],
    );
    const exceptions = await this.db.query<{ date: unknown; kind: string; note: string | null }>(
      `select distinct on (date) date, kind, note
         from event_recurrence_exceptions
        where event_id = $1
        order by date, created_at desc, id desc`,
      [id],
    );
    return {
      schedules: schedules.map((schedule) => ({
        effectiveFrom: isoDate(schedule.effective_from),
        rrule: schedule.rrule,
        endsOn: isoOptionalDate(schedule.ends_on),
      })),
      exceptions: exceptions.map((exception) => ({
        date: isoDate(exception.date),
        kind: exception.kind as 'cancelled' | 'extra',
        note: exception.note,
      })),
    };
  }

  private async parentOccurrences(
    parent: ParentRow,
    from: string,
    to: string,
    today: string,
  ): Promise<EventOccurrenceItem[]> {
    const rows = await this.db.query<OccurrenceRow>(
      `select o.id, o.date, o.start_time, o.end_time, o.status, o.note, o.venue_type,
              o.legacy_event_no,
              (select count(*)::int from attendance a where a.occurrence_id = o.id) as present,
              (select count(*)::int from attendance a
                where a.occurrence_id = o.id and a.source = 'import') as imported_rows,
              (select count(*)::int from members m
                where coalesce(m.joined_on, m.created_at::date) <= o.date
                  and m.archived_at is null
                  and m.purged_at is null
                  and (not $4::boolean or m.is_presbyter)) as expected,
              (select jsonb_build_object(
                        'asOf', coalesce(g.as_of, g.any_as_of),
                        'ended', coalesce(g.ended, false)
                      )
                 from (
                   select
                     (array_agg(c.as_of order by c.as_of desc, c.recorded_at desc,
                                c.channel asc, c.id desc)
                        filter (where c.is_current))[1] as as_of,
                     max(c.as_of) as any_as_of,
                     bool_or(c.ended) as ended,
                     count(*) as n
                     from (
                       select b.as_of, b.created_at as recorded_at, b.id,
                              0 as channel, true as is_current, b.ended
                         from import_batches b
                        where b.kind = 'attendance' and b.occurrence_id = o.id
                       union all
                       select h.as_of, h.recorded_at, h.id,
                              1 as channel,
                              not exists (
                                select 1 from event_session_headcounts s
                                 where s.supersedes_id = h.id
                              ) as is_current,
                              h.ended
                         from event_session_headcounts h
                        where h.occurrence_id = o.id
                     ) c
                 ) g
                where g.n > 0) as capture
         from event_occurrences o
        where o.event_id = $1
          and o.date between $2::date and $3::date
        order by o.date`,
      [parent.id, from, to, parent.presbyter_only],
    );

    return rows.map((row) => {
      const date = isoDate(row.date);
      const present = Number(row.present);
      const importedRows = Number(row.imported_rows);
      const capture = parseCapture(row.capture);
      return {
        id: row.id,
        date,
        startTime: row.start_time ?? parent.start_time ?? '',
        endTime: row.end_time ?? parent.end_time,
        status: occurrenceStatus(parent.status, row.status, date, today),
        ...(row.venue_type && VENUE_TYPES.includes(row.venue_type as VenueType)
          ? { venueType: row.venue_type as VenueType }
          : {}),
        capture,
        note: row.note,
        present,
        expected: Number(row.expected),
        importedRows,
        source: sessionSource(present, importedRows),
        legacyEventNo: row.legacy_event_no,
      };
    });
  }

  async list(query: EventListQuery): Promise<EventItem[]> {
    const rows = await this.db.query<EventRow>(LIST_SQL, [
      query.from ?? null,
      query.to ?? null,
      query.seriesId ?? null,
      query.ministry ?? null,
      query.venueType ?? null,
      query.limit,
      query.offset,
    ]);
    const today = todayUtc();
    const offeringsByEvent = await eventOfferingsFor(
      this.db,
      rows.map((row) => row.id),
      today,
    );

    return rows.map((row) => this.toItem(row, today, offeringsByEvent.get(row.id) ?? []));
  }

  async get(id: string): Promise<EventDetail | null> {
    const [row] = await this.db.query<EventRow>(DETAIL_SQL, [id]);
    if (!row) return null;
    const today = todayUtc();
    const offeringsByEvent = await eventOfferingsFor(this.db, [id], today);
    return {
      event: this.toItem(row, today, offeringsByEvent.get(id) ?? []),
      etag: etagFor(row),
    };
  }

  async create(input: CreateEventInput): Promise<EventDetail> {
    const eventNo = input.eventNo.trim();
    if (!eventNo) throw new ValidationError('eventNo is required');
    const name = input.name.trim();
    if (!name) throw new ValidationError('name is required');
    const timezone = input.timezone ?? 'UTC';
    todayIn(timezone);

    const startDate = assertDate(input.startDate, 'startDate');
    const endDate = assertDate(input.endDate, 'endDate');
    const sessions = normalizeSessions(input.sessions, input.startTime, input.endTime ?? null);
    validateEventShape({ startDate, endDate, sessions });
    validateSessionReasons(sessions);
    const audienceId = await audienceIdFor(this.db, input.presbyterOnly);

    let id: string;
    try {
      id = await this.db.transaction(async (tx) => {
        const [row] = await tx.query<{ id: string }>(INSERT_SQL, [
          eventNo,
          name,
          audienceId,
          input.presbyterOnly,
          timezone,
          input.description ?? null,
          input.venueType,
          input.venueName ?? null,
          input.startTime,
          input.endTime ?? null,
          input.tracksMembers,
        ]);
        for (const session of sessions) {
          await tx.query(INSERT_OCCURRENCE_SQL, [
            row!.id,
            isoDate(session.date),
            session.start_time ?? input.startTime,
            session.end_time ?? null,
            asSessionStatus(session.status),
            session.note ?? null,
            session.venue_type ?? null,
          ]);
        }
        return row!.id;
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Event number ${eventNo} is already in use`);
      }
      throw error;
    }

    return (await this.get(id))!;
  }

  /**
   * Generate occurrences for every active series parent in [from, to]. An
   * existing (event, date) pair is skipped and never rewritten, so re-running
   * is a no-op.
   */
  async generate(from: string, to: string, actor: string): Promise<GenerateEventsResult> {
    // events has no created_by column, so the actor is accepted for route
    // consistency and deliberately not persisted.
    void actor;

    assertDate(from, 'from');
    assertDate(to, 'to');
    if (from > to) throw new ValidationError('from must not be after to');

    return this.db.transaction(async (tx) => {
      const series = await tx.query<{
        id: string;
        name: string;
        timezone: string;
        presbyter_only: boolean;
      }>(
        `select e.id, e.name, e.timezone, e.presbyter_only
           from events e
          where e.status = 'active'
            and exists (
              select 1 from event_recurrence_versions rv where rv.event_id = e.id
            )
          order by e.id`,
      );

      const eventIds: string[] = [];
      let created = 0;
      let skipped = 0;

      for (const row of series) {
        const occurrences = await resolveSeriesOccurrences(tx, row.id, from, to);
        const existingRows = await tx.query<{ date: unknown }>(
          `select o.date
             from event_occurrences o
            where o.event_id = $1
              and o.date between $2::date and $3::date`,
          [row.id, from, to],
        );
        const existing = new Set(existingRows.map((event) => isoDate(event.date)));

        let added = 0;
        for (const date of occurrences) {
          if (existing.has(date)) {
            skipped += 1;
            continue;
          }
          const [inserted] = await tx.query<{ id: string }>(
            `insert into event_occurrences (
               event_id, date, start_time, end_time, status
             ) values ($1,$2,'00:00',null,'scheduled')
             on conflict (event_id, date) do nothing
             returning id`,
            [row.id, date],
          );
          if (inserted) {
            created += 1;
            added += 1;
          } else {
            skipped += 1;
          }
        }
        if (added > 0) eventIds.push(row.id);
      }

      return { created, skipped, eventIds };
    });
  }

  async update(
    id: string,
    input: UpdateEventInput,
    expectedEtag: string | null,
  ): Promise<EventDetail> {
    const current = await this.loadRow(id);
    if (!current) throw new NotFoundError(`Event ${id} was not found`);
    if (current.status === 'archived') {
      throw new ConflictError('An archived event is read-only');
    }
    if (
      Number(current.occurrence_count ?? 0) > 0 &&
      Number(current.cancelled_count ?? 0) === Number(current.occurrence_count ?? 0)
    ) {
      throw new ConflictError('A cancelled event is read-only');
    }
    if (expectedEtag && expectedEtag !== etagFor(current)) {
      throw new ConflictError('The event has changed since it was read; refetch it and retry');
    }

    const timezone = input.timezone ?? current.timezone;
    if (input.timezone !== undefined) todayIn(input.timezone);

    const startDate = input.startDate ?? isoOptionalDate(current.start_date) ?? todayUtc();
    const endDate = input.endDate ?? isoOptionalDate(current.end_date) ?? startDate;
    const startTime = input.startTime ?? current.start_time ?? '';
    const endTime = input.endTime === undefined ? current.end_time : input.endTime;
    const sessions: StoredSession[] = input.sessions
      ? normalizeSessions(input.sessions, startTime, endTime)
      : (parseJsonArray(current.sessions) as StoredSession[]);
    validateEventShape({ startDate, endDate, sessions });
    if (input.sessions) validateSessionReasons(sessions);

    const name = input.name !== undefined ? input.name.trim() : current.name;
    if (!name) throw new ValidationError('name is required');
    const presbyterOnly = input.presbyterOnly ?? current.presbyter_only;
    const audienceId = await audienceIdFor(this.db, presbyterOnly);

    await this.db.transaction(async (tx) => {
      await tx.query(UPDATE_SQL, [
        id,
        name,
        audienceId,
        presbyterOnly,
        timezone,
        startTime,
        endTime,
        input.venueType ?? asVenueType(current.venue_type),
        input.venueName !== undefined ? input.venueName : current.venue_name,
        input.description !== undefined ? input.description : current.description,
        input.tracksMembers ?? current.tracks_members,
      ]);

      const existingRows = await tx.query<{ id: string; date: unknown }>(
        'select id, date from event_occurrences where event_id = $1',
        [id],
      );
      const wanted = new Set(sessions.map((session) => isoDate(session.date)));
      for (const session of sessions) {
        const date = isoDate(session.date);
        await tx.query(INSERT_OCCURRENCE_SQL, [
          id,
          date,
          session.start_time ?? startTime,
          session.end_time ?? null,
          asSessionStatus(session.status),
          session.note ?? null,
          session.venue_type ?? null,
        ]);
      }
      for (const occurrence of existingRows) {
        const date = isoDate(occurrence.date);
        if (wanted.has(date)) continue;
        const [child] = await tx.query<{ exists: boolean }>(
          `select exists (select 1 from attendance where occurrence_id = $1)
               or exists (select 1 from event_session_headcounts where occurrence_id = $1)
               or exists (select 1 from event_session_offering_counts where occurrence_id = $1)
               or exists (select 1 from registration_requests where occurrence_id = $1)
               or exists (select 1 from attendance_codes where occurrence_id = $1)
               or exists (select 1 from clocking_delegations where occurrence_id = $1)
               or exists (select 1 from import_batches where occurrence_id = $1)
               or exists (select 1 from event_offerings where occurrence_id = $1) as exists`,
          [occurrence.id],
        );
        if (child?.exists) {
          throw new ValidationError(
            `The occurrence on ${date} cannot be removed while rows reference it`,
          );
        }
        await tx.query('delete from event_occurrences where id = $1', [occurrence.id]);
      }
    });

    return (await this.get(id))!;
  }

  async getAttendance(eventId: string, date: string): Promise<EventAttendance> {
    const sessionDate = assertDate(date);

    const [event] = await this.db.query<{
      id: string;
      presbyter_only: boolean;
      occurrence_id: string | null;
    }>(
      `select e.id, e.presbyter_only, o.id as occurrence_id
         from events e
         left join event_occurrences o on o.event_id = e.id and o.date = $2
        where e.id = $1`,
      [eventId, sessionDate],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    if (!event.occurrence_id) {
      throw new ValidationError(`Event ${eventId} has no session on ${sessionDate}`);
    }

    const rows = await this.db.query<{
      id: string;
      member_no: string;
      first_name: string | null;
      last_name: string | null;
      gender: Gender;
      dob: string | Date | null;
      source: 'import' | 'manual';
      session_time: string | null;
    }>(
      `select a.id, m.member_no, m.first_name, m.last_name, m.gender, m.dob, a.source,
              to_char(a.session_time, 'HH24:MI') as session_time
       from attendance a
       join members m on m.id = a.member_id
       where a.occurrence_id = $1
       order by lower(concat_ws(' ', m.first_name, m.last_name)), m.member_no`,
      [event.occurrence_id],
    );

    const [register] = await this.db.query<{ count: number | string }>(
      `select count(*)::int as count
       from members
       where coalesce(joined_on, created_at::date) <= $1::date
         and archived_at is null
         and purged_at is null
         and ($2::boolean = false or is_presbyter)`,
      [sessionDate, event.presbyter_only],
    );

    return {
      eventId,
      sessionDate,
      present: rows.length,
      expected: Number(register?.count ?? 0),
      importedRows: rows.filter((row) => row.source === 'import').length,
      rows: rows.map((row) => ({
        id: row.id,
        memberNo: row.member_no,
        name: [row.first_name, row.last_name].filter(Boolean).join(' '),
        gender: row.gender,
        age: ageInYears(isoOptionalDate(row.dob)),
        status: 'present' as const,
        source: row.source,
        sessionTime: row.session_time,
      })),
    };
  }

  async addManualAttendance(
    eventId: string,
    memberNo: string,
    date: string,
    actor: string,
  ): Promise<EventAttendanceEntry> {
    const sessionDate = assertDate(date);

    return this.db.transaction(async (tx) => {
      const [event] = await tx.query<{
        status: string;
        tracks_members: boolean;
        presbyter_only: boolean;
        timezone: string;
        occurrence_id: string | null;
        occurrence_status: string | null;
        occurrence_count: number | string;
        cancelled_count: number | string;
      }>(
        `select e.status, e.tracks_members, e.presbyter_only, e.timezone,
                o.id as occurrence_id, o.status as occurrence_status,
                (select count(*) from event_occurrences x where x.event_id = e.id)
                  as occurrence_count,
                (select count(*) from event_occurrences x
                  where x.event_id = e.id and x.status = 'cancelled')
                  as cancelled_count
           from events e
           left join event_occurrences o on o.event_id = e.id and o.date = $2
          where e.id = $1`,
        [eventId, sessionDate],
      );
      if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
      if (
        event.status === 'archived' ||
        (Number(event.occurrence_count) > 0 &&
          Number(event.cancelled_count) === Number(event.occurrence_count))
      ) {
        throw new ConflictError('A cancelled or archived event is read-only');
      }
      if (!event.occurrence_id) {
        throw new ValidationError(`Event ${eventId} has no session on ${sessionDate}`);
      }
      if (event.occurrence_status === 'cancelled') {
        throw new ValidationError(`The session on ${sessionDate} is cancelled and read-only`);
      }
      if (await sessionIsClosed(tx, eventId, sessionDate)) {
        throw new SessionClosedError(
          `The session on ${sessionDate} is closed; no further per-member write is accepted`,
        );
      }
      // A manual or USSD row is accepted only for a session dated today in the
      // event timezone; the session's time window does not gate it.
      if (sessionDate !== todayIn(event.timezone)) {
        throw new ValidationError(
          `Per-member attendance is accepted only for a session dated today in ${event.timezone}`,
        );
      }
      if (!event.tracks_members) {
        throw new ValidationError(
          'This event is headcount-only; per-member attendance is not recorded',
          'headcount_only',
        );
      }

      const [member] = await tx.query<{
        id: string;
        member_no: string;
        first_name: string | null;
        last_name: string | null;
        gender: Gender;
        dob: string | Date | null;
        is_presbyter: boolean;
      }>(
        `select id, member_no, first_name, last_name, gender, dob, is_presbyter
         from members
         where lower(member_no) = lower($1) and purged_at is null and archived_at is null`,
        [memberNo],
      );
      if (!member) throw new NotFoundError(`Member ${memberNo} was not found`);
      if (event.presbyter_only && !member.is_presbyter) {
        throw new ValidationError('A presbyter-only session accepts only presbyters');
      }

      const [existing] = await tx.query<{ id: string; source: 'import' | 'manual' }>(
        `select id, source
         from attendance
         where occurrence_id = $1 and member_id = $2`,
        [event.occurrence_id, member.id],
      );

      let row: { id: string; source: 'import' | 'manual' };
      if (existing?.source === 'manual') {
        throw new ConflictError(
          `Attendance for ${member.member_no} on ${sessionDate} is already recorded`,
        );
      }
      if (existing) {
        const [updated] = await tx.query<{ id: string; source: 'import' | 'manual' }>(
          `update attendance set source = 'manual', created_by = $2
           where id = $1
           returning id, source`,
          [existing.id, actor],
        );
        row = updated!;
      } else {
        try {
          const [inserted] = await tx.query<{ id: string; source: 'import' | 'manual' }>(
            `insert into attendance (member_id, occurrence_id, source, created_by)
             values ($1,$2,'manual',$3)
             returning id, source`,
            [member.id, event.occurrence_id, actor],
          );
          row = inserted!;
        } catch (error) {
          if (sqlState(error) === '23505') {
            throw new ConflictError(
              `Attendance for ${member.member_no} on ${sessionDate} is already recorded`,
            );
          }
          throw error;
        }
      }

      return {
        id: row.id,
        memberNo: member.member_no,
        name: [member.first_name, member.last_name].filter(Boolean).join(' '),
        gender: member.gender,
        age: ageInYears(isoOptionalDate(member.dob)),
        sessionDate,
        source: row.source,
      };
    });
  }

  async deleteAttendance(eventId: string, attendanceId: string, actor: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [event] = await tx.query<{ status: string }>(
        'select status from events where id = $1',
        [eventId],
      );
      if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
      if (event.status === 'archived') {
        throw new ConflictError('An archived event is read-only');
      }

      const [entry] = await tx.query<{
        member_id: string;
        occurrence_id: string;
        occurrence_status: string;
        session_date: unknown;
        source: 'import' | 'manual';
      }>(
        `select a.member_id, a.occurrence_id, o.status as occurrence_status,
                o.date as session_date, a.source
           from attendance a
           join event_occurrences o on o.id = a.occurrence_id
          where a.id = $1 and o.event_id = $2`,
        [attendanceId, eventId],
      );
      if (!entry) throw new NotFoundError(`Attendance ${attendanceId} was not found`);

      const sessionDate = isoDate(entry.session_date);
      if (entry.occurrence_status === 'cancelled') {
        throw new ValidationError(`The session on ${sessionDate} is cancelled and read-only`);
      }
      if (await sessionIsClosed(tx, eventId, sessionDate)) {
        throw new SessionClosedError(
          `The session on ${sessionDate} is closed; no further per-member write is accepted`,
        );
      }

      await tx.query('delete from attendance where id = $1', [attendanceId]);
      if (entry.source === 'import') {
        await tx.query(
          `insert into attendance_suppressions (member_id, occurrence_id, suppressed_by)
           values ($1,$2,$3)
           on conflict do nothing`,
          [entry.member_id, entry.occurrence_id, actor],
        );
      }
    });
  }

  private async loadRow(id: string): Promise<EventRowCore | null> {
    const [row] = await this.db.query<EventRowCore>(ROW_SQL, [id]);
    return row ?? null;
  }

  private toItem(row: EventRow, _today: string, offerings: EventOfferingItem[]): EventItem {
    const startDate = isoOptionalDate(row.start_date);
    const endDate = isoOptionalDate(row.end_date);
    const status = asStatus(row.status);
    const startTime = row.start_time ?? '';
    const endTime = row.end_time ?? null;

    const counts = new Map(
      parseJsonArray(row.session_counts).map((entry) => {
        const count = entry as SessionCount;
        return [
          isoDate(count.date),
          {
            present: Number(count.present),
            importedRows: Number(count.importedRows),
          },
        ] as const;
      }),
    );

    const expectedByDate = new Map(
      parseJsonArray(row.session_expected).map((entry) => {
        const count = entry as SessionExpected;
        return [isoDate(count.date), Number(count.expected)] as const;
      }),
    );

    const capturesByDate = new Map(
      parseJsonArray(row.session_captures).map((entry) => {
        const capture = entry as SessionCaptureRow;
        return [
          isoDate(capture.date),
          { asOf: isoInstant(capture.asOf), ended: capture.ended === true },
        ] as const;
      }),
    );

    const sessions: EventSessionItem[] = parseJsonArray(row.sessions).map((entry) => {
      const session = entry as StoredSession;
      const date = isoDate(session.date);
      const count = counts.get(date) ?? { present: 0, importedRows: 0 };
      const sessionVenueType =
        session.venue_type && VENUE_TYPES.includes(session.venue_type as VenueType)
          ? (session.venue_type as VenueType)
          : undefined;

      return {
        date,
        startTime: session.start_time ?? startTime,
        endTime: session.end_time ?? endTime,
        status: asSessionStatus(session.status),
        ...(sessionVenueType ? { venueType: sessionVenueType } : {}),
        capture: capturesByDate.get(date) ?? null,
        note: typeof session.note === 'string' && session.note.trim() ? session.note : null,
        present: count.present,
        expected: expectedByDate.get(date) ?? 0,
        importedRows: count.importedRows,
        source: sessionSource(count.present, count.importedRows),
      };
    });

    return {
      id: row.id,
      eventNo: row.event_no,
      name: row.name,
      seriesId: row.is_series ? row.id : null,
      ministry:
        row.ministry_code && row.ministry_name
          ? { code: row.ministry_code, name: row.ministry_name }
          : null,
      timezone: row.timezone,
      startDate: startDate ?? '',
      endDate: endDate ?? '',
      startTime,
      endTime: row.end_time,
      venueType: asVenueType(row.venue_type),
      venueName: row.venue_name,
      description: row.description,
      status,
      source: row.is_series ? 'series' : 'manual',
      tracksMembers: row.tracks_members,
      presbyterOnly: row.presbyter_only,
      sessions,
      offerings,
      stats: { ...emptyOfferingStats(), attachedEvents: offerings.length },
    };
  }
}
