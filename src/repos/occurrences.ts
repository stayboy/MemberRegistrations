import {
  resolveOccurrences,
  type ScheduleVersion,
  type SeriesException,
} from '../domain/series.js';
import type { DbClient, Row } from '../db/sql.js';

export interface SeriesCalendar {
  schedules: ScheduleVersion[];
  exceptions: SeriesException[];
  importedDates: string[];
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function loadCalendar(db: DbClient, seriesId: string): Promise<SeriesCalendar> {
  const schedules = await db.query<{
    effective_from: string;
    rrule: string;
    ends_on: string | null;
  }>(
    `select effective_from, rrule, ends_on
       from event_recurrence_versions
      where event_id = $1
      order by effective_from`,
    [seriesId],
  );
  const exceptions = await db.query<{ date: string; kind: 'cancelled' | 'extra' }>(
    `select distinct on (date) date, kind
       from event_recurrence_exceptions
      where event_id = $1
      order by date, created_at desc, id desc`,
    [seriesId],
  );

  return {
    schedules: schedules.map((row) => ({
      effectiveFrom: isoDate(row.effective_from),
      rrule: row.rrule,
      endsOn: row.ends_on ? isoDate(row.ends_on) : null,
    })),
    exceptions: exceptions.map((row) => ({
      date: isoDate(row.date),
      kind: row.kind,
    })),
    // The event-list import is retired; occurrences come from schedules and exceptions only.
    importedDates: [],
  };
}

export function resolveCalendarOccurrences(
  calendar: SeriesCalendar,
  from: string,
  to: string,
): string[] {
  return resolveOccurrences({
    schedules: calendar.schedules,
    from,
    to,
    exceptions: calendar.exceptions,
    importedDates: calendar.importedDates,
  });
}

export async function resolveSeriesOccurrences(
  db: DbClient,
  seriesId: string,
  from: string,
  to: string,
): Promise<string[]> {
  const calendar = await loadCalendar(db, seriesId);
  return resolveCalendarOccurrences(calendar, from, to);
}

/** True when the series actually met on that date. */
export async function isHeldOccurrence(
  db: DbClient,
  seriesId: string,
  date: string,
): Promise<boolean> {
  return (await resolveSeriesOccurrences(db, seriesId, date, date)).includes(date);
}

export type SeriesRow = Row & {
  id: string;
  name: string;
  timezone: string;
  description: string | null;
  ministry_id: string | null;
  ministry_code: string | null;
  ministry_name: string | null;
  archived_at: Date | string | null;
};
