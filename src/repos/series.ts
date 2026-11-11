import { and, eq, isNull, sql } from 'drizzle-orm';
import { eventSeries, ministries, seriesExceptions, seriesSchedules } from '../db/schema.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { assertDate } from '../domain/contacts.js';
import { shiftDate, todayIn, validateRrule } from '../domain/series.js';
import type { SeriesSummary } from '../schemas/reference.js';
import type { Db, Row } from '../db/sql.js';
import { sqlState } from '../errors/sqlstate.js';
import { resolveSeriesOccurrences } from './occurrences.js';

const NEXT_OCCURRENCE_DAYS = 90;

export interface ScheduleDto {
  effectiveFrom: string;
  rrule: string;
  endsOn: string | null;
}

export interface SeriesExceptionDto {
  date: string;
  kind: 'cancelled' | 'extra';
  note: string | null;
}

export interface SeriesDto {
  id: string;
  name: string;
  ministry: { code: string; name: string } | null;
  presbyterOnly: boolean;
  timezone: string;
  description: string | null;
  archivedAt: string | null;
  schedules: ScheduleDto[];
  exceptions: SeriesExceptionDto[];
}

export interface CreateSeriesInput {
  name: string;
  ministryCode?: string | null;
  presbyterOnly?: boolean;
  timezone?: string;
  description?: string | null;
  effectiveFrom: string;
  rrule: string;
  endsOn?: string | null;
}

export interface UpdateSeriesInput {
  name?: string;
  ministryCode?: string | null;
  presbyterOnly?: boolean;
  timezone?: string;
  description?: string | null;
  archived?: boolean;
}

function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type SummaryAttendanceRow = Row & {
  cancelled: number | string;
  upcoming: number | string;
  headcount_held: number | string;
  member_held: number | string;
  expected: number | string;
  present: number | string;
  last_held_date: string | Date | null;
  last_held_expected: number | string;
  last_held_present: number | string;
};

type SummaryMoneyRow = Row & {
  currency: string;
  paid_minor: number | string;
  visitor_count: number | string;
  visitor_paid: number | string;
  counted_minor: number | string;
  attached_count: number | string;
};

type SummaryPledgeRow = Row & {
  pledged_minor: number | string;
  outstanding_minor: number | string;
};

/**
 * Series window attendance (FR-6b, FR-6c). Held is date-derived in the series
 * timezone: a session on or before today whose session and event are not
 * cancelled or archived. Only held member-tracking sessions enter the ratio;
 * `expected` reuses the event detail's register rule.
 */
const SERIES_SUMMARY_ATTENDANCE_SQL = `
with bounds as (
  select $2::date as from_date, $3::date as to_date, $4::date as today
),
sessions as (
  select e.id as event_id,
         e.tracks_members,
         e.presbyter_only,
         (s->>'date')::date as session_date,
         coalesce(s->>'status', 'scheduled') = 'cancelled' as session_cancelled,
         e.status in ('cancelled', 'archived') as event_cancelled
    from event_instances e
    cross join lateral jsonb_array_elements(e.sessions) as s
    cross join bounds b
   where e.series_id = $1
     and (s->>'date')::date between b.from_date and b.to_date
),
classified as (
  select s.*,
         case
           when s.session_cancelled or s.event_cancelled then 'cancelled'
           when s.session_date <= (select today from bounds) then 'held'
           else 'upcoming'
         end as bucket
    from sessions s
),
attendance_counts as (
  select a.event_instance_id, a.session_date, count(*)::int as present
    from attendance a
   where a.event_instance_id in (select event_id from sessions)
     and a.session_date between (select from_date from bounds) and (select to_date from bounds)
   group by a.event_instance_id, a.session_date
),
held_member as (
  select c.event_id, c.session_date, c.presbyter_only,
         coalesce(ac.present, 0) as present
    from classified c
    left join attendance_counts ac
      on ac.event_instance_id = c.event_id and ac.session_date = c.session_date
   where c.bucket = 'held' and c.tracks_members
),
expected_by_session as (
  select h.event_id, h.session_date,
         (select count(*)
            from members m
           where coalesce(m.joined_on, m.created_at::date) <= h.session_date
             and m.archived_at is null
             and m.purged_at is null
             and (not h.presbyter_only or m.is_presbyter))::int as expected
    from held_member h
),
last_held as (
  select max(session_date) as session_date from held_member
)
select
  (select count(*) from classified where bucket = 'cancelled')::int as cancelled,
  (select count(*) from classified where bucket = 'upcoming')::int as upcoming,
  (select count(*) from classified where bucket = 'held' and not tracks_members)::int
    as headcount_held,
  (select count(*) from held_member)::int as member_held,
  coalesce((select sum(expected) from expected_by_session), 0)::int as expected,
  coalesce((select sum(present) from held_member), 0)::int as present,
  (select session_date from last_held) as last_held_date,
  coalesce((
    select sum(e.expected) from expected_by_session e, last_held l
     where e.session_date = l.session_date
  ), 0)::int as last_held_expected,
  coalesce((
    select sum(h.present) from held_member h, last_held l
     where h.session_date = l.session_date
  ), 0)::int as last_held_present
`;

/**
 * Series window money (FR-6d), the church summary's rules scoped by series:
 * the largest paid currency in the window wins, counted cash is reported
 * beside the gifts, and visitors are separate. Attached count is the active
 * attachments made to the series itself.
 */
const SERIES_SUMMARY_MONEY_SQL = `
with bounds as (
  select $2::date as from_date, $3::date as to_date
),
series_events as (
  select id from event_instances where series_id = $1
),
chosen as (
  select coalesce((
    select c.currency
      from contributions c, bounds b
     where c.status = 'paid'
       and c.event_instance_id in (select id from series_events)
       and c.session_date between b.from_date and b.to_date
     group by c.currency
     order by sum(c.amount_minor) desc, c.currency asc
     limit 1
  ), 'GHS') as currency
),
paid as (
  select c.member_id, c.amount_minor
    from contributions c, bounds b, chosen ch
   where c.status = 'paid'
     and c.event_instance_id in (select id from series_events)
     and c.session_date between b.from_date and b.to_date
     and c.currency = ch.currency
),
current_counts as (
  select distinct on (c.event_instance_id, c.offering_id, c.session_date) c.id
    from event_session_offering_counts c, bounds b, chosen ch
   where c.event_instance_id in (select id from series_events)
     and c.currency = ch.currency
     and c.session_date between b.from_date and b.to_date
     and not exists (
       select 1 from event_session_offering_counts s where s.supersedes_id = c.id
     )
   order by c.event_instance_id, c.offering_id, c.session_date,
            c.as_of desc, c.recorded_at desc, c.id desc
),
counted as (
  select sum(l.denomination_minor * l.pieces)::bigint as amount
    from current_counts c
    join event_session_offering_count_lines l on l.count_id = c.id
)
select ch.currency,
       coalesce((select sum(amount_minor) from paid where member_id is not null), 0)::bigint
         as paid_minor,
       (select count(*) from paid where member_id is null)::int as visitor_count,
       coalesce((select sum(amount_minor) from paid where member_id is null), 0)::bigint
         as visitor_paid,
       coalesce((select amount from counted), 0)::bigint as counted_minor,
       (select count(*) from event_instance_offerings a
         where a.series_id = $1 and a.detached_on is null)::int as attached_count
  from chosen ch
`;

/** Series window pledges, the church summary's relevance rule scoped by series. */
const SERIES_SUMMARY_PLEDGES_SQL = `
with bounds as (
  select $2::date as from_date,
         $3::date as to_date,
         least($3::date, $4::date) as report_date
),
series_pledges as (
  select p.*
    from pledges p
   where p.event_instance_id in (select id from event_instances where series_id = $1)
     and p.currency = $5
),
bounded as (
  select pe.pledge_id,
         max(pe.at) filter (where pe.kind = 'honored') as honored_at,
         max(pe.at) filter (where pe.kind = 'dishonored') as dishonored_at
    from pledge_events pe, bounds b
   where (pe.at at time zone 'UTC') < (b.report_date + 1)::timestamp
   group by pe.pledge_id
),
staged as (
  select p.*,
         case
           when b.dishonored_at is not null
                and (b.honored_at is null or b.dishonored_at > b.honored_at) then 'dishonored'
           when b.honored_at is not null then 'honored'
           else 'pending'
         end as as_of_status
    from series_pledges p
    left join bounded b on b.pledge_id = p.id
),
in_scope as (
  select s.*
    from staged s, bounds b
   where s.expected_on between b.from_date and b.to_date
      or (s.expected_on < b.from_date and s.as_of_status = 'pending')
)
select coalesce((
         select sum(amount_minor) from in_scope where as_of_status <> 'dishonored'
       ), 0)::bigint as pledged_minor,
       coalesce((
         select sum(amount_minor) from in_scope where as_of_status = 'pending'
       ), 0)::bigint as outstanding_minor
`;

type Statement = ReturnType<typeof sql>;

type SeriesUpdate = Partial<Omit<typeof eventSeries.$inferInsert, 'archivedAt' | 'updatedAt'>> & {
  archivedAt?: Statement | null;
  updatedAt: Statement;
};

export class SeriesRepository {
  constructor(private readonly db: Db) {}

  async list(includeArchived = false): Promise<SeriesDto[]> {
    let query = this.db.orm.select({ id: eventSeries.id }).from(eventSeries).$dynamic();
    if (!includeArchived) query = query.where(isNull(eventSeries.archivedAt));
    const rows = await query.orderBy(sql`lower(${eventSeries.name})`);
    const result: SeriesDto[] = [];
    for (const row of rows) {
      const series = await this.load(row.id);
      if (series) result.push(series);
    }
    return result;
  }

  async get(id: string): Promise<SeriesDto | null> {
    return this.load(id);
  }

  async require(id: string): Promise<SeriesDto> {
    const series = await this.load(id);
    if (!series) throw new NotFoundError(`Series ${id} was not found`);
    return series;
  }

  async create(input: CreateSeriesInput, actor: string): Promise<SeriesDto> {
    const name = input.name.trim();
    if (!name) throw new ValidationError('name is required');
    const timezone = input.timezone ?? 'UTC';
    todayIn(timezone);

    const effectiveFrom = assertDate(input.effectiveFrom, 'effectiveFrom');
    const endsOn = input.endsOn ? assertDate(input.endsOn, 'endsOn') : null;
    if (endsOn && endsOn < effectiveFrom) {
      throw new ValidationError('endsOn must not be before effectiveFrom');
    }
    const rrule = validateRrule(input.rrule);
    const ministryId = await this.resolveMinistry(input.ministryCode ?? null);

    try {
      const id = await this.db.transaction(async (tx) => {
        const [series] = await tx.orm
          .insert(eventSeries)
          .values({
            name,
            ministryId,
            presbyterOnly: input.presbyterOnly ?? false,
            timezone,
            description: input.description ?? null,
            createdBy: actor,
            updatedBy: actor,
          })
          .returning({ id: eventSeries.id });
        await tx.orm.insert(seriesSchedules).values({
          seriesId: series!.id,
          effectiveFrom,
          rrule,
          endsOn,
          createdBy: actor,
        });
        return series!.id;
      });

      return (await this.load(id))!;
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError('A series with this name already exists for that ministry');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateSeriesInput, actor: string): Promise<SeriesDto> {
    await this.require(id);
    const set: SeriesUpdate = { updatedAt: sql`now()`, updatedBy: actor };
    let changed = false;

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError('name is required');
      set.name = name;
      changed = true;
    }
    if (input.ministryCode !== undefined) {
      set.ministryId = await this.resolveMinistry(input.ministryCode);
      changed = true;
    }
    if (input.presbyterOnly !== undefined) {
      set.presbyterOnly = input.presbyterOnly;
      changed = true;
    }
    if (input.timezone !== undefined) {
      todayIn(input.timezone);
      set.timezone = input.timezone;
      changed = true;
    }
    if (input.description !== undefined) {
      set.description = input.description;
      changed = true;
    }
    if (input.archived !== undefined) {
      set.archivedAt = input.archived ? sql`now()` : null;
      changed = true;
    }

    if (!changed) throw new ValidationError('No fields to update');

    try {
      await this.db.orm.update(eventSeries).set(set).where(eq(eventSeries.id, id));
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError('A series with this name already exists for that ministry');
      }
      throw error;
    }

    return this.require(id);
  }

  async addSchedule(
    id: string,
    input: { effectiveFrom: string; rrule: string; endsOn?: string | null },
    actor: string,
  ): Promise<SeriesDto> {
    await this.require(id);
    const effectiveFrom = assertDate(input.effectiveFrom, 'effectiveFrom');
    const endsOn = input.endsOn ? assertDate(input.endsOn, 'endsOn') : null;
    if (endsOn && endsOn < effectiveFrom) {
      throw new ValidationError('endsOn must not be before effectiveFrom');
    }
    const rrule = validateRrule(input.rrule);

    try {
      await this.db.orm.insert(seriesSchedules).values({
        seriesId: id,
        effectiveFrom,
        rrule,
        endsOn,
        createdBy: actor,
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError(`A schedule already starts on ${effectiveFrom}`);
      }
      throw error;
    }

    return this.require(id);
  }

  async setException(
    id: string,
    input: { date: string; kind: 'cancelled' | 'extra'; note?: string | null },
    actor: string,
  ): Promise<SeriesDto> {
    await this.require(id);
    const note = input.note?.trim() || null;
    if (input.kind === 'cancelled' && note === null) {
      throw new ValidationError('A cancelled exception needs a reason', 'reason_required');
    }
    const date = assertDate(input.date, 'date');
    await this.db.orm
      .insert(seriesExceptions)
      .values({
        seriesId: id,
        occursOn: date,
        kind: input.kind,
        note,
        createdBy: actor,
      })
      .onConflictDoUpdate({
        target: [seriesExceptions.seriesId, seriesExceptions.occursOn],
        set: { kind: input.kind, note },
      });
    return this.require(id);
  }

  async removeException(id: string, date: string): Promise<void> {
    const deleted = await this.db.orm
      .delete(seriesExceptions)
      .where(
        and(eq(seriesExceptions.seriesId, id), eq(seriesExceptions.occursOn, assertDate(date))),
      )
      .returning({ occursOn: seriesExceptions.occursOn });
    if (deleted.length === 0) throw new NotFoundError(`No exception on ${date}`);
  }

  async occurrences(id: string, from: string, to: string): Promise<string[]> {
    await this.require(id);
    return resolveSeriesOccurrences(this.db, id, from, to);
  }

  /**
   * One request's series window figures (FR-6a–FR-6d). Attendance and money are
   * bounded by the window; held/upcoming are date-derived in the series
   * timezone; the next occurrence looks forward 90 days from today.
   */
  async summary(id: string, from: string, to: string): Promise<SeriesSummary> {
    const series = await this.require(id);
    const today = todayIn(series.timezone);

    const [attendance] = await this.db.query<SummaryAttendanceRow>(SERIES_SUMMARY_ATTENDANCE_SQL, [
      id,
      from,
      to,
      today,
    ]);
    const [money] = await this.db.query<SummaryMoneyRow>(SERIES_SUMMARY_MONEY_SQL, [id, from, to]);
    const currency = money?.currency ?? 'GHS';
    const [pledges] = await this.db.query<SummaryPledgeRow>(SERIES_SUMMARY_PLEDGES_SQL, [
      id,
      from,
      to,
      today,
      currency,
    ]);

    const expected = Number(attendance?.expected ?? 0);
    const present = Number(attendance?.present ?? 0);
    const lastHeldDate = attendance?.last_held_date ? isoDate(attendance.last_held_date) : null;
    const nextDates = await resolveSeriesOccurrences(
      this.db,
      id,
      today,
      shiftDate(today, NEXT_OCCURRENCE_DAYS),
    );

    return {
      from,
      to,
      nextOccurrence: nextDates[0] ?? null,
      attendance: {
        memberSessions: {
          held: Number(attendance?.member_held ?? 0),
          expected,
          present,
          rate: expected > 0 ? present / expected : null,
        },
        lastHeld: lastHeldDate
          ? {
              date: lastHeldDate,
              expected: Number(attendance?.last_held_expected ?? 0),
              present: Number(attendance?.last_held_present ?? 0),
            }
          : null,
        headcountSessions: { held: Number(attendance?.headcount_held ?? 0) },
        cancelled: Number(attendance?.cancelled ?? 0),
        upcoming: Number(attendance?.upcoming ?? 0),
      },
      offerings: {
        attachedCount: Number(money?.attached_count ?? 0),
        currency,
        paidMinor: Number(money?.paid_minor ?? 0),
        pledgedMinor: Number(pledges?.pledged_minor ?? 0),
        outstandingMinor: Number(pledges?.outstanding_minor ?? 0),
        countedMinor: Number(money?.counted_minor ?? 0),
        visitors: {
          count: Number(money?.visitor_count ?? 0),
          paidMinor: Number(money?.visitor_paid ?? 0),
        },
      },
    };
  }

  private async load(id: string): Promise<SeriesDto | null> {
    const [row] = await this.db.orm
      .select({
        id: eventSeries.id,
        name: eventSeries.name,
        presbyterOnly: eventSeries.presbyterOnly,
        timezone: eventSeries.timezone,
        description: eventSeries.description,
        archivedAt: eventSeries.archivedAt,
        ministryCode: ministries.code,
        ministryName: ministries.name,
      })
      .from(eventSeries)
      .leftJoin(ministries, eq(ministries.id, eventSeries.ministryId))
      .where(eq(eventSeries.id, id))
      .limit(1);
    if (!row) return null;

    const schedules = await this.db.orm
      .select({
        effectiveFrom: seriesSchedules.effectiveFrom,
        rrule: seriesSchedules.rrule,
        endsOn: seriesSchedules.endsOn,
      })
      .from(seriesSchedules)
      .where(eq(seriesSchedules.seriesId, id))
      .orderBy(seriesSchedules.effectiveFrom);
    const exceptions = await this.db.orm
      .select({
        occursOn: seriesExceptions.occursOn,
        kind: seriesExceptions.kind,
        note: seriesExceptions.note,
      })
      .from(seriesExceptions)
      .where(eq(seriesExceptions.seriesId, id))
      .orderBy(seriesExceptions.occursOn);

    return {
      id: row.id,
      name: row.name,
      ministry:
        row.ministryCode && row.ministryName
          ? { code: row.ministryCode, name: row.ministryName }
          : null,
      presbyterOnly: row.presbyterOnly,
      timezone: row.timezone,
      description: row.description,
      archivedAt: isoTimestamp(row.archivedAt),
      schedules: schedules.map((schedule) => ({
        effectiveFrom: isoDate(schedule.effectiveFrom)!,
        rrule: schedule.rrule,
        endsOn: isoDate(schedule.endsOn),
      })),
      exceptions: exceptions.map((exception) => ({
        date: isoDate(exception.occursOn)!,
        kind: exception.kind as 'cancelled' | 'extra',
        note: exception.note,
      })),
    };
  }

  private async resolveMinistry(code: string | null): Promise<string | null> {
    if (!code) return null;
    const [ministry] = await this.db.orm
      .select({ id: ministries.id })
      .from(ministries)
      .where(sql`lower(${ministries.code}) = lower(${code})`)
      .limit(1);
    if (!ministry) throw new NotFoundError(`Ministry ${code} was not found`);
    return ministry.id;
  }
}
