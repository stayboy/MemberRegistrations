import { and, eq, isNull, sql } from 'drizzle-orm';
import { eventSeries, ministries, seriesExceptions, seriesSchedules } from '../db/schema.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { assertDate } from '../domain/contacts.js';
import { validateRrule, todayIn } from '../domain/series.js';
import type { Db } from '../db/sql.js';
import { sqlState } from '../errors/sqlstate.js';
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
    const date = assertDate(input.date, 'date');
    await this.db.orm
      .insert(seriesExceptions)
      .values({
        seriesId: id,
        occursOn: date,
        kind: input.kind,
        note: input.note ?? null,
        createdBy: actor,
      })
      .onConflictDoUpdate({
        target: [seriesExceptions.seriesId, seriesExceptions.occursOn],
        set: { kind: input.kind, note: input.note ?? null },
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
