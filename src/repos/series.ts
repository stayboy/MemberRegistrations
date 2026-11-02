import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { assertDate } from '../domain/contacts.js';
import { validateRrule, todayIn } from '../domain/series.js';
import type { Db } from '../db/sql.js';
import { resolveSeriesOccurrences } from './occurrences.js';

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
  timezone: string;
  description: string | null;
  archivedAt: string | null;
  schedules: ScheduleDto[];
  exceptions: SeriesExceptionDto[];
}

export interface CreateSeriesInput {
  name: string;
  ministryCode?: string | null;
  timezone?: string;
  description?: string | null;
  effectiveFrom: string;
  rrule: string;
  endsOn?: string | null;
}

export interface UpdateSeriesInput {
  name?: string;
  ministryCode?: string | null;
  timezone?: string;
  description?: string | null;
  archived?: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
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

export class SeriesRepository {
  constructor(private readonly db: Db) {}

  async list(includeArchived = false): Promise<SeriesDto[]> {
    const rows = await this.db.query<{ id: string }>(
      `select id from event_series
       ${includeArchived ? '' : 'where archived_at is null'}
       order by lower(name)`,
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
    const timezone = input.timezone ?? 'Africa/Lagos';
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
        const [series] = await tx.query<{ id: string }>(
          `insert into event_series (name, ministry_id, timezone, description, created_by, updated_by)
           values ($1,$2,$3,$4,$5,$5) returning id`,
          [name, ministryId, timezone, input.description ?? null, actor],
        );
        await tx.query(
          `insert into series_schedules (series_id, effective_from, rrule, ends_on, created_by)
           values ($1,$2,$3,$4,$5)`,
          [series!.id, effectiveFrom, rrule, endsOn, actor],
        );
        return series!.id;
      });

      return (await this.load(id))!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('A series with this name already exists for that ministry');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateSeriesInput, actor: string): Promise<SeriesDto> {
    const existing = await this.require(id);
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError('name is required');
      params.push(name);
      sets.push(`name = $${params.length}`);
    }
    if (input.ministryCode !== undefined) {
      params.push(await this.resolveMinistry(input.ministryCode));
      sets.push(`ministry_id = $${params.length}`);
    }
    if (input.timezone !== undefined) {
      todayIn(input.timezone);
      params.push(input.timezone);
      sets.push(`timezone = $${params.length}`);
    }
    if (input.description !== undefined) {
      params.push(input.description);
      sets.push(`description = $${params.length}`);
    }
    if (input.archived !== undefined) {
      params.push(input.archived);
      sets.push(`archived_at = case when $${params.length} then now() else null end`);
    }

    if (sets.length === 0) throw new ValidationError('No fields to update');

    params.push(id, actor);
    try {
      await this.db.query(
        `update event_series set ${sets.join(', ')}, updated_at = now(), updated_by = $${params.length}
         where id = $${params.length - 1}`,
        params,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('A series with this name already exists for that ministry');
      }
      throw error;
    }

    void existing;
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
        `insert into series_schedules (series_id, effective_from, rrule, ends_on, created_by)
         values ($1,$2,$3,$4,$5)`,
        [id, effectiveFrom, rrule, endsOn, actor],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
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
    const date = assertDate(input.date, 'date');
    await this.db.query(
      `insert into series_exceptions (series_id, occurs_on, kind, note, created_by)
       values ($1,$2,$3,$4,$5)
       on conflict (series_id, occurs_on) do update set kind = excluded.kind, note = excluded.note`,
      [id, date, input.kind, input.note ?? null, actor],
    );
    return this.require(id);
  }

  async removeException(id: string, date: string): Promise<void> {
    const deleted = await this.db.query(
      'delete from series_exceptions where series_id = $1 and occurs_on = $2 returning occurs_on',
      [id, assertDate(date)],
    );
    if (deleted.length === 0) throw new NotFoundError(`No exception on ${date}`);
  }

  async occurrences(id: string, from: string, to: string): Promise<string[]> {
    await this.require(id);
    return resolveSeriesOccurrences(this.db, id, from, to);
  }

  private async load(id: string): Promise<SeriesDto | null> {
    const [row] = await this.db.query<{
      id: string;
      name: string;
      timezone: string;
      description: string | null;
      archived_at: Date | string | null;
      ministry_code: string | null;
      ministry_name: string | null;
    }>(
      `select s.id, s.name, s.timezone, s.description, s.archived_at,
              mi.code as ministry_code, mi.name as ministry_name
       from event_series s
       left join ministries mi on mi.id = s.ministry_id
       where s.id = $1`,
      [id],
    );
    if (!row) return null;

    const schedules = await this.db.query<{
      effective_from: string;
      rrule: string;
      ends_on: string | null;
    }>(
      'select effective_from, rrule, ends_on from series_schedules where series_id = $1 order by effective_from',
      [id],
    );
    const exceptions = await this.db.query<{
      occurs_on: string;
      kind: 'cancelled' | 'extra';
      note: string | null;
    }>(
      'select occurs_on, kind, note from series_exceptions where series_id = $1 order by occurs_on',
      [id],
    );

    return {
      id: row.id,
      name: row.name,
      ministry:
        row.ministry_code && row.ministry_name
          ? { code: row.ministry_code, name: row.ministry_name }
          : null,
      timezone: row.timezone,
      description: row.description,
      archivedAt: isoTimestamp(row.archived_at),
      schedules: schedules.map((schedule) => ({
        effectiveFrom: isoDate(schedule.effective_from)!,
        rrule: schedule.rrule,
        endsOn: isoDate(schedule.ends_on),
      })),
      exceptions: exceptions.map((exception) => ({
        date: isoDate(exception.occurs_on)!,
        kind: exception.kind,
        note: exception.note,
      })),
    };
  }

  private async resolveMinistry(code: string | null): Promise<string | null> {
    if (!code) return null;
    const [ministry] = await this.db.query<{ id: string }>(
      'select id from ministries where lower(code) = lower($1)',
      [code],
    );
    if (!ministry) throw new NotFoundError(`Ministry ${code} was not found`);
    return ministry.id;
  }
}
