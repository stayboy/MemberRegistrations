import { createHash } from 'node:crypto';
import type { Db, DbClient } from '../db/sql.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import { ageInYears } from '../domain/age.js';
import { assertDate } from '../domain/contacts.js';
import { todayIn } from '../domain/series.js';
import { resolveSeriesOccurrences } from './occurrences.js';
import type { Gender } from './members.js';
import {
  emptyOfferingStats,
  eventOfferingsFor,
  type EventOfferingItem,
  type OfferingStatsItem,
} from './offerings.js';
import type { CreateEventInput, EventListQuery, UpdateEventInput } from '../schemas/events.js';

export type VenueType = 'auditorium' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
export type EventSessionStatus = 'scheduled' | 'held' | 'cancelled';
export type EventSource = 'series' | 'manual' | 'import';
export type SessionSource = 'import' | 'manual' | 'mixed' | 'none';

export interface EventSessionItem {
  date: string;
  startTime: string;
  endTime: string | null;
  status: EventSessionStatus;
  venueType?: VenueType;
  present: number;
  /** The register at this session date: joined on or before it, not archived or purged. */
  expected: number;
  importedRows: number;
  source: SessionSource;
}

export interface EventItem {
  id: string;
  /** Null while a series-minted instance has not been assigned an event number yet. */
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
  startTime?: string | null;
  endTime?: string | null;
  status?: string;
  venueType?: string;
}

interface WrittenSession {
  date: string;
  startTime?: string;
  endTime?: string | null;
  status?: EventSessionStatus;
  venueType?: VenueType;
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
  series_id: string | null;
  timezone: string;
  start_date: unknown;
  end_date: unknown;
  start_time: string | null;
  end_time: string | null;
  venue_type: string;
  venue_name: string | null;
  description: string | null;
  status: string;
  source: string;
  tracks_members: boolean;
  presbyter_only: boolean;
  sessions: unknown;
  ministry_code: string | null;
  ministry_name: string | null;
  session_counts: unknown;
  session_expected: unknown;
};

/** The event_instances row without the joined ministry or attendance aggregate. */
type EventRowCore = Omit<
  EventRow,
  'session_counts' | 'session_expected' | 'ministry_code' | 'ministry_name'
>;

const EVENT_COLUMNS = `
  e.id,
  e.event_no,
  e.name,
  e.series_id,
  e.timezone,
  e.start_date,
  e.end_date,
  e.start_time,
  e.end_time,
  e.venue_type,
  e.venue_name,
  e.description,
  e.status,
  e.source,
  e.tracks_members,
  e.presbyter_only,
  e.sessions,
  m.code as ministry_code,
  m.name as ministry_name`;

const EVENT_FROM = `
  from event_instances e
  left join event_series s on s.id = e.series_id
  left join ministries m on m.id = s.ministry_id`;

/**
 * Attendance per session for the rows in scope. Correlated on the event id so
 * neither the list nor the detail issues a query per event or per session.
 */
function sessionCounts(alias: string): string {
  return `
  left join lateral (
    select
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'date', c.session_date,
                   'present', c.present,
                   'importedRows', c.imported_rows
                 )
                 order by c.session_date
               )
        from (
          select a.session_date,
                 count(*)::int as present,
                 count(*) filter (where a.source = 'import')::int as imported_rows
          from attendance a
          where a.event_instance_id = ${alias}.id
          group by a.session_date
        ) c
      ), '[]'::jsonb) as session_counts,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object('date', d.session_date, 'expected', d.expected)
                 order by d.session_date
               )
        from (
          select (session->>'date')::date as session_date,
                 count(m.id) filter (
                   where not ${alias}.presbyter_only or m.is_presbyter
                 )::int as expected
          from jsonb_array_elements(${alias}.sessions) session
          left join members m
            on coalesce(m.joined_on, m.created_at::date) <= (session->>'date')::date
           and m.archived_at is null
           and m.purged_at is null
          group by (session->>'date')::date
        ) d
      ), '[]'::jsonb) as session_expected
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
  where ($1::date is null or e.end_date >= $1::date)
    and ($2::date is null or e.start_date <= $2::date)
    and ($3::uuid is null or e.series_id = $3::uuid)
    and (
      $4::text is null
      or lower(m.code) = lower($4::text)
      or lower(m.name) = lower($4::text)
    )
    and ($5::text is null or e.venue_type = $5::text)
  order by e.start_date, e.id
  limit $6::int offset $7::int
)
select p.*,
       coalesce(counts.session_counts, '[]'::jsonb) as session_counts,
       coalesce(counts.session_expected, '[]'::jsonb) as session_expected
from page p
${sessionCounts('p')}
order by p.start_date, p.id
`;

const DETAIL_SQL = `
select ${EVENT_COLUMNS},
       coalesce(counts.session_counts, '[]'::jsonb) as session_counts,
       coalesce(counts.session_expected, '[]'::jsonb) as session_expected
${EVENT_FROM}
${sessionCounts('e')}
where e.id = $1
`;

const ROW_SQL = `
select e.id,
       e.event_no,
       e.name,
       e.series_id,
       e.timezone,
       e.start_date,
       e.end_date,
       e.start_time,
       e.end_time,
       e.venue_type,
       e.venue_name,
       e.description,
       e.status,
       e.source,
       e.tracks_members,
       e.presbyter_only,
       e.sessions
from event_instances e
where e.id = $1
`;

const INSERT_SQL = `
insert into event_instances (
  event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
  venue_type, venue_name, description, status, source, tracks_members, presbyter_only, sessions
) values (
  $1, null, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', 'manual',
  $11::boolean, $12::boolean, $13::jsonb
)
returning id
`;

const GENERATE_INSERT_SQL = `
insert into event_instances (
  event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
  venue_type, venue_name, description, status, source, tracks_members, presbyter_only, sessions
) values (
  $1, $2, $3, $4, $5, $5, '00:00', null,
  'auditorium', null, null, 'scheduled', 'series', true, $6::boolean,
  jsonb_build_array(jsonb_build_object(
    'date', $5::date,
    'startTime', '00:00',
    'endTime', null,
    'status', 'scheduled'
  ))
)
on conflict (series_id, start_date) do nothing
returning id
`;

const NEXT_EVENT_NO_SQL = `
insert into event_no_counters (year, last_value)
values ($1::int, 1)
on conflict (year) do update set last_value = event_no_counters.last_value + 1
returning last_value
`;

const UPDATE_SQL = `
update event_instances
set name = $2,
    timezone = $3,
    start_date = $4,
    end_date = $5,
    start_time = $6,
    end_time = $7,
    venue_type = $8,
    venue_name = $9,
    description = $10,
    tracks_members = $11::boolean,
    presbyter_only = $12::boolean,
    sessions = $13::jsonb
where id = $1
`;

const VENUE_TYPES: readonly VenueType[] = ['auditorium', 'virtual', 'hybrid'];
const EVENT_STATUSES: readonly EventStatus[] = [
  'draft',
  'scheduled',
  'held',
  'cancelled',
  'archived',
];
const SESSION_STATUSES: readonly EventSessionStatus[] = ['scheduled', 'held', 'cancelled'];

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoOptionalDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return isoDate(value);
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

function deriveStatus(
  stored: EventStatus,
  startDate: string,
  endDate: string,
  today: string,
): EventStatus {
  if (stored === 'draft' || stored === 'cancelled' || stored === 'archived') return stored;
  if (endDate < today) return 'held';
  if (startDate > today) return 'scheduled';
  return 'held';
}

function sessionSource(present: number, importedRows: number): SessionSource {
  if (present === 0) return 'none';
  if (importedRows === 0) return 'manual';
  if (importedRows === present) return 'import';
  return 'mixed';
}

function asStatus(value: string): EventStatus {
  return EVENT_STATUSES.includes(value as EventStatus) ? (value as EventStatus) : 'scheduled';
}

function asSessionStatus(value: string | undefined): EventSessionStatus {
  return SESSION_STATUSES.includes(value as EventSessionStatus)
    ? (value as EventSessionStatus)
    : 'scheduled';
}

function findSession(
  sessions: unknown,
  date: string,
): { date: string; status: EventSessionStatus } | null {
  for (const entry of parseJsonArray(sessions)) {
    const session = entry as StoredSession;
    if (isoDate(session.date) === date) {
      return { date, status: asSessionStatus(session.status) };
    }
  }
  return null;
}

function asVenueType(value: string): VenueType {
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
  return sessions.map((session) => ({
    date: session.date,
    startTime: session.startTime ?? startTime,
    endTime: session.endTime === undefined ? endTime : session.endTime,
    status: session.status ?? 'scheduled',
    ...(session.venueType ? { venueType: session.venueType } : {}),
  }));
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
    isoDate(row.start_date),
    isoDate(row.end_date),
    row.start_time,
    row.end_time,
    row.venue_type,
    row.venue_name,
    row.description,
    row.status,
    row.source,
    row.tracks_members,
    row.presbyter_only,
    parseJsonArray(row.sessions),
  ]);
  return `"e${createHash('sha256').update(payload).digest('hex').slice(0, 24)}"`;
}

export class EventRepository {
  constructor(private readonly db: Db) {}

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

    let id: string;
    try {
      const [row] = await this.db.query<{ id: string }>(INSERT_SQL, [
        eventNo,
        name,
        timezone,
        startDate,
        endDate,
        input.startTime,
        input.endTime ?? null,
        input.venueType,
        input.venueName ?? null,
        input.description ?? null,
        input.tracksMembers,
        input.presbyterOnly,
        JSON.stringify(sessions),
      ]);
      id = row!.id;
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`Event number ${eventNo} is already in use`);
      }
      throw error;
    }

    return (await this.get(id))!;
  }

  /**
   * Mint one event per resolved series occurrence in [from, to]. Existing
   * (series, date) pairs are skipped and never rewritten, so re-running is a
   * no-op.
   */
  async generate(from: string, to: string, actor: string): Promise<GenerateEventsResult> {
    // event_instances has no created_by column, so the actor is accepted for
    // route consistency and deliberately not persisted.
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
        'select id, name, timezone, presbyter_only from event_series where archived_at is null order by id',
      );

      const eventIds: string[] = [];
      let created = 0;
      let skipped = 0;

      for (const row of series) {
        const occurrences = await resolveSeriesOccurrences(tx, row.id, from, to);
        const existingRows = await tx.query<{
          id: string;
          start_date: unknown;
          event_no: string | null;
        }>(
          `select id, start_date, event_no from event_instances
           where series_id = $1 and start_date between $2::date and $3::date`,
          [row.id, from, to],
        );
        const existing = new Map(existingRows.map((event) => [isoDate(event.start_date), event]));

        for (const date of occurrences) {
          const current = existing.get(date);
          if (current) {
            // A manual attendance entry can create the instance before generation
            // runs; backfill its number so an attendance import can target it.
            if (current.event_no == null) {
              const eventNo = await this.mintEventNo(tx, date);
              await tx.query(
                'update event_instances set event_no = $2 where id = $1 and event_no is null',
                [current.id, eventNo],
              );
            }
            skipped += 1;
            continue;
          }

          const eventNo = await this.mintEventNo(tx, date);
          const [inserted] = await tx.query<{ id: string }>(GENERATE_INSERT_SQL, [
            eventNo,
            row.id,
            row.name,
            row.timezone,
            date,
            row.presbyter_only,
          ]);

          if (inserted) {
            created += 1;
            eventIds.push(inserted.id);
          } else {
            skipped += 1;
          }
        }
      }

      return { created, skipped, eventIds };
    });
  }

  /** Mint `EVT-<year>-<NNN>` from the per-year counter, skipping manual numbers. */
  private async mintEventNo(tx: DbClient, date: string): Promise<string> {
    const year = Number(date.slice(0, 4));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const [counter] = await tx.query<{ last_value: number | string }>(NEXT_EVENT_NO_SQL, [year]);
      const eventNo = `EVT-${year}-${String(Number(counter!.last_value)).padStart(3, '0')}`;
      // A manually assigned EVT-YYYY-NNN can outrun the counter; try the next number.
      const [taken] = await tx.query('select 1 from event_instances where event_no = $1', [
        eventNo,
      ]);
      if (!taken) return eventNo;
    }
    throw new ConflictError(`Could not mint a unique event number for ${date}`);
  }

  async update(
    id: string,
    input: UpdateEventInput,
    expectedEtag: string | null,
  ): Promise<EventDetail> {
    const current = await this.loadRow(id);
    if (!current) throw new NotFoundError(`Event ${id} was not found`);
    if (current.status === 'cancelled' || current.status === 'archived') {
      throw new ConflictError('A cancelled or archived event is read-only');
    }
    if (expectedEtag && expectedEtag !== etagFor(current)) {
      throw new ConflictError('The event has changed since it was read; refetch it and retry');
    }

    const timezone = input.timezone ?? current.timezone;
    if (input.timezone !== undefined) todayIn(input.timezone);

    const startDate = input.startDate ?? isoDate(current.start_date);
    const endDate = input.endDate ?? isoDate(current.end_date);
    const startTime = input.startTime ?? current.start_time ?? '';
    const endTime = input.endTime === undefined ? current.end_time : input.endTime;
    const sessions: Array<{ date?: unknown }> = input.sessions
      ? normalizeSessions(input.sessions, startTime, endTime)
      : (parseJsonArray(current.sessions) as Array<{ date?: unknown }>);
    validateEventShape({ startDate, endDate, sessions });

    const name = input.name !== undefined ? input.name.trim() : current.name;
    if (!name) throw new ValidationError('name is required');

    await this.db.query(UPDATE_SQL, [
      id,
      name,
      timezone,
      startDate,
      endDate,
      startTime,
      endTime,
      input.venueType ?? asVenueType(current.venue_type),
      input.venueName !== undefined ? input.venueName : current.venue_name,
      input.description !== undefined ? input.description : current.description,
      input.tracksMembers ?? current.tracks_members,
      input.presbyterOnly ?? current.presbyter_only,
      JSON.stringify(sessions),
    ]);

    return (await this.get(id))!;
  }

  async getAttendance(eventId: string, date: string): Promise<EventAttendance> {
    const sessionDate = assertDate(date);

    const [event] = await this.db.query<{
      id: string;
      sessions: unknown;
      presbyter_only: boolean;
    }>('select id, sessions, presbyter_only from event_instances where id = $1', [eventId]);
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    if (!findSession(event.sessions, sessionDate)) {
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
       where a.event_instance_id = $1 and a.session_date = $2
       order by lower(concat_ws(' ', m.first_name, m.last_name)), m.member_no`,
      [eventId, sessionDate],
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
        sessions: unknown;
      }>(
        'select status, tracks_members, presbyter_only, sessions from event_instances where id = $1',
        [eventId],
      );
      if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
      if (event.status === 'cancelled' || event.status === 'archived') {
        throw new ConflictError('A cancelled or archived event is read-only');
      }

      const session = findSession(event.sessions, sessionDate);
      if (!session) {
        throw new ValidationError(`Event ${eventId} has no session on ${sessionDate}`);
      }
      if (session.status === 'cancelled') {
        throw new ValidationError(`The session on ${sessionDate} is cancelled and read-only`);
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
         where event_instance_id = $1 and session_date = $2 and member_id = $3`,
        [eventId, sessionDate, member.id],
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
            `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
             values ($1,$2,$3,'manual',$4)
             returning id, source`,
            [member.id, eventId, sessionDate, actor],
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
      const [event] = await tx.query<{
        status: string;
        sessions: unknown;
      }>('select status, sessions from event_instances where id = $1', [eventId]);
      if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
      if (event.status === 'cancelled' || event.status === 'archived') {
        throw new ConflictError('A cancelled or archived event is read-only');
      }

      const [entry] = await tx.query<{
        member_id: string;
        session_date: unknown;
        source: 'import' | 'manual';
      }>(
        `select member_id, session_date, source
         from attendance
         where id = $1 and event_instance_id = $2`,
        [attendanceId, eventId],
      );
      if (!entry) throw new NotFoundError(`Attendance ${attendanceId} was not found`);

      const sessionDate = isoDate(entry.session_date);
      const session = findSession(event.sessions, sessionDate);
      if (session?.status === 'cancelled') {
        throw new ValidationError(`The session on ${sessionDate} is cancelled and read-only`);
      }

      await tx.query('delete from attendance where id = $1', [attendanceId]);
      if (entry.source === 'import') {
        await tx.query(
          `insert into attendance_suppressions (member_id, event_instance_id, session_date, suppressed_by)
           values ($1,$2,$3,$4)
           on conflict do nothing`,
          [entry.member_id, eventId, isoDate(entry.session_date), actor],
        );
      }
    });
  }

  private async loadRow(id: string): Promise<EventRowCore | null> {
    const [row] = await this.db.query<EventRowCore>(ROW_SQL, [id]);
    return row ?? null;
  }

  private toItem(row: EventRow, today: string, offerings: EventOfferingItem[]): EventItem {
    const startDate = isoDate(row.start_date);
    const endDate = isoDate(row.end_date);
    const status = deriveStatus(asStatus(row.status), startDate, endDate, today);
    const startTime = row.start_time ?? '';

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

    const sessions: EventSessionItem[] = parseJsonArray(row.sessions).map((entry) => {
      const session = entry as StoredSession;
      const date = isoDate(session.date);
      const count = counts.get(date) ?? { present: 0, importedRows: 0 };
      const sessionVenueType =
        session.venueType && VENUE_TYPES.includes(session.venueType as VenueType)
          ? (session.venueType as VenueType)
          : undefined;

      return {
        date,
        startTime: session.startTime ?? startTime,
        endTime: session.endTime ?? null,
        status: asSessionStatus(session.status),
        ...(sessionVenueType ? { venueType: sessionVenueType } : {}),
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
      seriesId: row.series_id,
      ministry:
        row.ministry_code && row.ministry_name
          ? { code: row.ministry_code, name: row.ministry_name }
          : null,
      timezone: row.timezone,
      startDate,
      endDate,
      startTime,
      endTime: row.end_time,
      venueType: asVenueType(row.venue_type),
      venueName: row.venue_name,
      description: row.description,
      status,
      source: row.source as EventSource,
      tracksMembers: row.tracks_members,
      presbyterOnly: row.presbyter_only,
      sessions,
      offerings,
      stats: { ...emptyOfferingStats(), attachedEvents: offerings.length },
    };
  }
}
