import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { assertDate } from '../domain/contacts.js';
import { evaluateAudienceDates } from '../domain/audience-evaluator.js';
import { shiftDate, todayIn, validateRrule } from '../domain/series.js';
import type { SeriesSummary } from '../schemas/reference.js';
import type { Db, DbClient, Row } from '../db/sql.js';
import { sqlState } from '../errors/sqlstate.js';
import { audienceMembers } from './audience-members.js';
import { resolveSeriesOccurrences } from './occurrences.js';
import { parseAudienceRule, parseTextArray } from './row-values.js';

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
  held_dates: unknown;
  present: number | string;
  last_held_date: string | Date | null;
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

/** Series window attendance (FR-6b, FR-6c) on the parented occurrence model. */
const SERIES_SUMMARY_ATTENDANCE_SQL = `
with bounds as (
  select $2::date as from_date, $3::date as to_date, $4::date as today
),
sessions as (
  select e.id as event_id,
         o.id as occurrence_id,
         e.tracks_members,
         e.presbyter_only,
         o.date as session_date,
         o.status = 'cancelled' as session_cancelled,
         e.status = 'archived' as event_cancelled
    from events e
    join event_occurrences o on o.event_id = e.id
    cross join bounds b
   where e.id = $1
     and e.status <> 'draft'
     and o.date between b.from_date and b.to_date
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
  select a.occurrence_id, count(*)::int as present
    from attendance a
    join event_occurrences o on o.id = a.occurrence_id
   where o.event_id = $1
     and o.date between (select from_date from bounds) and (select to_date from bounds)
   group by a.occurrence_id
),
held_member as (
  select c.event_id, c.occurrence_id, c.session_date,
         coalesce(ac.present, 0) as present
    from classified c
    left join attendance_counts ac on ac.occurrence_id = c.occurrence_id
   where c.bucket = 'held' and c.tracks_members
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
  coalesce((
    select array_agg(to_char(session_date, 'YYYY-MM-DD') order by session_date)
      from held_member
  ), '{}'::text[]) as held_dates,
  coalesce((select sum(present) from held_member), 0)::int as present,
  (select session_date from last_held) as last_held_date,
  coalesce((
    select sum(h.present) from held_member h, last_held l
     where h.session_date = l.session_date
  ), 0)::int as last_held_present
`;

const SERIES_SUMMARY_MONEY_SQL = `
with bounds as (
  select $2::date as from_date, $3::date as to_date
),
chosen as (
  select coalesce((
    select c.currency
      from contributions c, bounds b
     where c.status = 'paid'
       and c.event_id = $1
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
     and c.event_id = $1
     and c.session_date between b.from_date and b.to_date
     and c.currency = ch.currency
),
current_counts as (
  select distinct on (c.offering_id, c.session_date) c.id
    from event_session_offering_counts c
    join event_occurrences o on o.id = c.occurrence_id
    cross join bounds b, chosen ch
   where o.event_id = $1
     and c.currency = ch.currency
     and c.session_date between b.from_date and b.to_date
     and not exists (
       select 1 from event_session_offering_counts s where s.supersedes_id = c.id
     )
   order by c.offering_id, c.session_date,
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
       (select count(*) from event_offerings a
         where a.event_id = $1 and a.detached_on is null)::int as attached_count
  from chosen ch
`;

const SERIES_SUMMARY_PLEDGES_SQL = `
with bounds as (
  select $2::date as from_date,
         $3::date as to_date,
         least($3::date, $4::date) as report_date
),
series_pledges as (
  select p.*
    from pledges p
   where p.event_id = $1
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

/**
 * The window figures for one event parent (FR-6b–FR-6d): the same three reads
 * the legacy series summary uses, scoped by the event id. A standalone event
 * has no recurrence, so its next occurrence is read from its own rows.
 */
export async function parentWindowSummary(
  db: Db,
  event: { id: string; timezone: string },
  from: string,
  to: string,
): Promise<SeriesSummary> {
  const today = todayIn(event.timezone);
  const [attendance] = await db.query<SummaryAttendanceRow>(SERIES_SUMMARY_ATTENDANCE_SQL, [
    event.id,
    from,
    to,
    today,
  ]);
  const [money] = await db.query<SummaryMoneyRow>(SERIES_SUMMARY_MONEY_SQL, [event.id, from, to]);
  const currency = money?.currency ?? 'GHS';
  const [pledges] = await db.query<SummaryPledgeRow>(SERIES_SUMMARY_PLEDGES_SQL, [
    event.id,
    from,
    to,
    today,
    currency,
  ]);

  const recurrenceDates = await resolveSeriesOccurrences(
    db,
    event.id,
    today,
    shiftDate(today, NEXT_OCCURRENCE_DAYS),
  );
  let nextOccurrence: string | null = recurrenceDates[0] ?? null;
  if (nextOccurrence === null) {
    const [next] = await db.query<{ date: unknown }>(
      `select date from event_occurrences
        where event_id = $1 and date >= $2::date and date <= $3::date
        order by date limit 1`,
      [event.id, today, shiftDate(today, NEXT_OCCURRENCE_DAYS)],
    );
    nextOccurrence = next ? isoDate(next.date) : null;
  }

  const [scope] = await db.query<{ tracks_members: boolean; rule: unknown }>(
    `select e.tracks_members, a.rule
       from events e
       join audiences a on a.id = e.audience_id
      where e.id = $1`,
    [event.id],
  );
  const heldDates = parseTextArray(attendance?.held_dates);
  const expectedByDate =
    scope?.tracks_members && heldDates.length > 0
      ? evaluateAudienceDates(
          parseAudienceRule(scope.rule),
          await audienceMembers(db, heldDates[heldDates.length - 1]),
          heldDates,
        )
      : new Map<string, number>();
  const expected = heldDates.reduce((total, date) => total + (expectedByDate.get(date) ?? 0), 0);
  const present = Number(attendance?.present ?? 0);
  const lastHeldDate = attendance?.last_held_date ? isoDate(attendance.last_held_date) : null;

  return {
    from,
    to,
    nextOccurrence,
    attendance: {
      memberSessions: {
        held: heldDates.length,
        expected,
        present,
        rate: expected > 0 ? present / expected : null,
      },
      lastHeld: lastHeldDate
        ? {
            date: lastHeldDate,
            expected: expectedByDate.get(lastHeldDate) ?? 0,
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

export class SeriesRepository {
  constructor(private readonly db: Db) {}

  async list(includeArchived = false): Promise<SeriesDto[]> {
    const rows = await this.db.query<{ id: string }>(
      `select e.id
         from events e
        where exists (
                select 1 from event_recurrence_versions rv where rv.event_id = e.id
              )
          and ($1::boolean or e.archived_at is null)
        order by lower(e.name)`,
      [includeArchived],
    );
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

    try {
      const id = await this.db.transaction(async (tx) => {
        const audienceId = await resolveAudience(
          tx,
          input.ministryCode ?? null,
          input.presbyterOnly ?? false,
          actor,
        );
        const ministryId = await resolveMinistry(tx, input.ministryCode ?? null);
        const [conflict] = await tx.query<{ id: string }>(
          `select e.id
             from events e
            where lower(e.name) = lower($1)
              and e.audience_id = $2
              and e.archived_at is null
              and exists (
                select 1 from event_recurrence_versions rv where rv.event_id = e.id
              )
            limit 1`,
          [name, audienceId],
        );
        if (conflict) {
          throw new ConflictError('A series with this name already exists for that audience');
        }

        const [event] = await tx.query<{ id: string }>(
          `insert into events (
             event_no, name, audience_id, ministry_id, presbyter_only, timezone,
             description, venue_type, venue_name, start_time, end_time, tracks_members, status
           ) values ($1,$2,$3,$4,$5,$6,$7,'auditorium',null,'00:00',null,true,'active')
           returning id`,
          [
            await mintEventNo(tx, effectiveFrom),
            name,
            audienceId,
            ministryId,
            input.presbyterOnly ?? false,
            timezone,
            input.description ?? null,
          ],
        );
        await tx.query(
          `insert into event_recurrence_versions (
             event_id, effective_from, rrule, ends_on, created_by
           ) values ($1,$2,$3,$4,$5)`,
          [event!.id, effectiveFrom, rrule, endsOn, actor],
        );
        return event!.id;
      });

      return (await this.load(id))!;
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError('A series with this name already exists for that audience');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateSeriesInput, actor: string): Promise<SeriesDto> {
    const current = await this.require(id);
    const sets: string[] = [];
    const params: unknown[] = [id];
    let changed = false;

    const push = (fragment: string, value: unknown) => {
      params.push(value);
      sets.push(`${fragment} = $${params.length}`);
    };

    let name = current.name;
    if (input.name !== undefined) {
      name = input.name.trim();
      if (!name) throw new ValidationError('name is required');
      push('name', name);
      changed = true;
    }
    let ministryCode = current.ministry?.code ?? null;
    if (input.ministryCode !== undefined) {
      ministryCode = input.ministryCode;
      changed = true;
    }
    let presbyterOnly = current.presbyterOnly;
    if (input.presbyterOnly !== undefined) {
      presbyterOnly = input.presbyterOnly;
      changed = true;
    }
    if (changed) {
      const audienceId = await resolveAudience(this.db, ministryCode, presbyterOnly, actor);
      const ministryId = await resolveMinistry(this.db, ministryCode);
      push('audience_id', audienceId);
      push('ministry_id', ministryId);
      push('presbyter_only', presbyterOnly);

      const [conflict] = await this.db.query<{ id: string }>(
        `select e.id
           from events e
          where lower(e.name) = lower($1)
            and e.audience_id = $2
            and e.archived_at is null
            and e.id <> $3
            and exists (
              select 1 from event_recurrence_versions rv where rv.event_id = e.id
            )
          limit 1`,
        [name, audienceId, id],
      );
      if (conflict) {
        throw new ConflictError('A series with this name already exists for that audience');
      }
    }
    if (input.timezone !== undefined) {
      todayIn(input.timezone);
      push('timezone', input.timezone);
      changed = true;
    }
    if (input.description !== undefined) {
      push('description', input.description);
      changed = true;
    }
    if (input.archived !== undefined) {
      if (input.archived) {
        sets.push('archived_at = now()', "status = 'archived'");
      } else {
        sets.push('archived_at = null', "status = 'active'");
      }
      changed = true;
    }

    if (!changed) throw new ValidationError('No fields to update');

    try {
      await this.db.query(
        `update events set ${sets.join(', ')}, updated_at = now() where id = $1`,
        params,
      );
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ConflictError('A series with this name already exists for that audience');
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
      await this.db.query(
        `insert into event_recurrence_versions (
           event_id, effective_from, rrule, ends_on, created_by
         ) values ($1,$2,$3,$4,$5)`,
        [id, effectiveFrom, rrule, endsOn, actor],
      );
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
    await this.db.query(
      `insert into event_recurrence_exceptions (event_id, date, kind, note, created_by)
       values ($1,$2,$3,$4,$5)`,
      [id, date, input.kind, note, actor],
    );
    return this.require(id);
  }

  async removeException(id: string, date: string): Promise<void> {
    const deleted = await this.db.query<{ id: string }>(
      `delete from event_recurrence_exceptions
        where event_id = $1 and date = $2
        returning id`,
      [id, assertDate(date)],
    );
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
    return parentWindowSummary(this.db, { id, timezone: series.timezone }, from, to);
  }

  private async load(id: string): Promise<SeriesDto | null> {
    const [row] = await this.db.query<{
      id: string;
      name: string;
      presbyter_only: boolean;
      timezone: string;
      description: string | null;
      archived_at: Date | string | null;
      ministry_code: string | null;
      ministry_name: string | null;
    }>(
      `select e.id, e.name, e.presbyter_only, e.timezone, e.description, e.archived_at,
              m.code as ministry_code, m.name as ministry_name
         from events e
         left join ministries m on m.id = e.ministry_id
        where e.id = $1
          and exists (
            select 1 from event_recurrence_versions rv where rv.event_id = e.id
          )`,
      [id],
    );
    if (!row) return null;

    const schedules = await this.db.query<{
      effective_from: string;
      rrule: string;
      ends_on: string | null;
    }>(
      `select effective_from, rrule, ends_on
         from event_recurrence_versions
        where event_id = $1
        order by effective_from`,
      [id],
    );
    const exceptions = await this.db.query<{
      date: string;
      kind: 'cancelled' | 'extra';
      note: string | null;
    }>(
      `select distinct on (date) date, kind, note
         from event_recurrence_exceptions
        where event_id = $1
        order by date, created_at desc, id desc`,
      [id],
    );

    return {
      id: row.id,
      name: row.name,
      ministry:
        row.ministry_code && row.ministry_name
          ? { code: row.ministry_code, name: row.ministry_name }
          : null,
      presbyterOnly: row.presbyter_only,
      timezone: row.timezone,
      description: row.description,
      archivedAt: isoTimestamp(row.archived_at),
      schedules: schedules.map((schedule) => ({
        effectiveFrom: isoDate(schedule.effective_from)!,
        rrule: schedule.rrule,
        endsOn: isoDate(schedule.ends_on),
      })),
      exceptions: exceptions.map((exception) => ({
        date: isoDate(exception.date)!,
        kind: exception.kind,
        note: exception.note,
      })),
    };
  }
}

async function resolveMinistry(db: DbClient, code: string | null): Promise<string | null> {
  if (!code) return null;
  const [ministry] = await db.query<{ id: string }>(
    'select id from ministries where lower(code) = lower($1)',
    [code],
  );
  if (!ministry) throw new NotFoundError(`Ministry ${code} was not found`);
  return ministry.id;
}

async function resolveAudience(
  db: DbClient,
  ministryCode: string | null,
  presbyterOnly: boolean,
  actor: string,
): Promise<string> {
  if (!ministryCode) {
    const systemKey = presbyterOnly ? 'presbyters' : 'everyone';
    const [audience] = await db.query<{ id: string }>(
      'select id from audiences where system_key = $1',
      [systemKey],
    );
    if (!audience) throw new Error(`The ${systemKey} audience is missing`);
    return audience.id;
  }

  const [ministry] = await db.query<{ id: string; code: string; name: string }>(
    'select id, code, name from ministries where lower(code) = lower($1)',
    [ministryCode],
  );
  if (!ministry) throw new NotFoundError(`Ministry ${ministryCode} was not found`);

  const systemKey = presbyterOnly
    ? `legacy:${ministry.code}:presbyters`
    : `ministry:${ministry.code}`;
  const [existing] = await db.query<{ id: string }>(
    'select id from audiences where system_key = $1',
    [systemKey],
  );
  if (existing) return existing.id;

  const rule = presbyterOnly
    ? {
        operator: 'allOf',
        clauses: [
          { attribute: 'ministry', ministryCode: ministry.code },
          { attribute: 'presbyter', value: true },
        ],
      }
    : {
        operator: 'allOf',
        clauses: [{ attribute: 'ministry', ministryCode: ministry.code }],
      };
  const [created] = await db.query<{ id: string }>(
    `insert into audiences (name, system, system_key, active, rule, created_by, updated_by)
     values ($1,$2,$3,true,$4::jsonb,$5,$5)
     returning id`,
    [
      presbyterOnly ? `${ministry.name} · Presbyters` : ministry.name,
      !presbyterOnly,
      systemKey,
      JSON.stringify(rule),
      actor,
    ],
  );
  return created!.id;
}

/** Mint `EVT-<year>-<NNN>` from the per-year counter, skipping manual numbers. */
async function mintEventNo(db: DbClient, date: string): Promise<string> {
  const year = Number(date.slice(0, 4));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const [counter] = await db.query<{ last_value: number | string }>(
      `insert into event_no_counters (year, last_value)
       values ($1::int, 1)
       on conflict (year) do update set last_value = event_no_counters.last_value + 1
       returning last_value`,
      [year],
    );
    const eventNo = `EVT-${year}-${String(Number(counter!.last_value)).padStart(3, '0')}`;
    const [taken] = await db.query('select 1 from events where event_no = $1', [eventNo]);
    if (!taken) return eventNo;
  }
  throw new ConflictError(`Could not mint a unique event number for ${date}`);
}
