// `rrule` ships a CommonJS UMD build whose ESM entry is not reachable through
// Node's resolver (no exports map, no "type": "module"), so the default import
// is the only shape that works at runtime. Destructure the named exports.
import rrule from 'rrule';
import { ValidationError } from '../errors/domain-errors.js';
import { assertDate } from './contacts.js';

const { rrulestr } = rrule;

export interface ScheduleVersion {
  effectiveFrom: string;
  rrule: string;
  endsOn?: string | null;
}

export interface SeriesException {
  date: string;
  kind: 'cancelled' | 'extra';
}

const DAY_MS = 86_400_000;

function toUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shift(date: string, days: number): string {
  return format(new Date(toUtc(date).getTime() + days * DAY_MS));
}

function assertTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
  } catch {
    throw new ValidationError(`"${timeZone}" is not a valid IANA timezone`);
  }
  return timeZone;
}

/** Today's calendar date in the series timezone, not the server's. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: assertTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Accepts an RRULE body only (`FREQ=WEEKLY;BYDAY=SU`). `COUNT` and `UNTIL` are
 * rejected: the series end date is the `endsOn` column, and two sources of
 * truth for "when does this stop" is one too many.
 */
export function validateRrule(body: string): string {
  const normalized = body.trim().toUpperCase();
  if (!normalized.startsWith('FREQ=')) {
    throw new ValidationError('rrule must be an RFC 5545 body such as FREQ=WEEKLY;BYDAY=SU');
  }
  if (/\b(COUNT|UNTIL)=/.test(normalized)) {
    throw new ValidationError('rrule must not contain COUNT or UNTIL; use endsOn instead');
  }

  try {
    const rule = rrulestr(`DTSTART:20260101T000000Z\nRRULE:${normalized}`);
    rule.between(toUtc('2026-01-01'), toUtc('2026-12-31'), true);
  } catch {
    throw new ValidationError(`rrule is not valid: ${body}`);
  }

  return normalized;
}

/** Dates the schedule produces inside [from, to], bounded by its own start/end. */
export function expandSchedule(schedule: ScheduleVersion, from: string, to: string): string[] {
  const start = from > schedule.effectiveFrom ? from : schedule.effectiveFrom;
  const end = schedule.endsOn && schedule.endsOn < to ? schedule.endsOn : to;
  if (start > end) return [];

  const dtstart = schedule.effectiveFrom.replaceAll('-', '');
  const rule = rrulestr(`DTSTART:${dtstart}T000000Z\nRRULE:${schedule.rrule}`, { cache: true });

  return rule.between(toUtc(start), toUtc(end), true).map(format);
}

export interface ResolveOccurrencesInput {
  schedules: ScheduleVersion[];
  from: string;
  to: string;
  exceptions: SeriesException[];
  /** Dates present in imported event lists. Empty when no import covers the series. */
  importedDates: string[];
}

/**
 * The set of dates the series actually met.
 *
 * 1. Each schedule version owns the range from its effective date until the next
 *    version (or its end date).
 * 2. Cancelled dates are removed, one-off extra dates are added.
 * 3. Where an import covers a range, its dates win: a scheduled date the import
 *    omits was not held, and an imported date off-schedule was.
 */
export function resolveOccurrences(input: ResolveOccurrencesInput): string[] {
  const schedules = [...input.schedules].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
  if (schedules.length === 0) return [];

  const scheduled = new Set<string>();
  schedules.forEach((schedule, index) => {
    const next = schedules[index + 1];
    const segmentEnd = next ? shift(next.effectiveFrom, -1) : input.to;
    const end = segmentEnd < input.to ? segmentEnd : input.to;
    for (const date of expandSchedule(schedule, input.from, end)) scheduled.add(date);
  });

  const cancelled = new Set(
    input.exceptions.filter((item) => item.kind === 'cancelled').map((item) => item.date),
  );
  const extras = new Set(
    input.exceptions
      .filter((item) => item.kind === 'extra')
      .map((item) => item.date)
      .filter((date) => date >= input.from && date <= input.to),
  );

  for (const date of cancelled) scheduled.delete(date);
  for (const date of extras) scheduled.add(date);

  if (input.importedDates.length === 0) {
    return [...scheduled].sort();
  }

  const imported = input.importedDates.filter((date) => date >= input.from && date <= input.to);
  if (imported.length === 0) return [...scheduled].sort();

  const coverageStart = input.importedDates.reduce((min, date) => (date < min ? date : min));
  const coverageEnd = input.importedDates.reduce((max, date) => (date > max ? date : max));

  const held = new Set<string>();
  for (const date of scheduled) {
    if (date >= coverageStart && date <= coverageEnd && !extras.has(date)) continue;
    held.add(date);
  }
  for (const date of imported) held.add(date);
  for (const date of extras) held.add(date);

  return [...held].sort();
}

export interface OccurrenceWindowInput {
  seriesStart: string;
  joinedOn?: string | null;
  endsOn?: string | null;
  today: string;
}

/**
 * A member is not penalised for services held before they joined, and a series
 * without an end date is counted to today rather than to an imaginary future.
 */
export function occurrenceWindow(input: OccurrenceWindowInput): { from: string; to: string } {
  const from =
    input.joinedOn && input.joinedOn > input.seriesStart ? input.joinedOn : input.seriesStart;
  const to = input.endsOn && input.endsOn < input.today ? input.endsOn : input.today;
  return { from, to };
}

export function seriesStart(schedules: ScheduleVersion[]): string | null {
  if (schedules.length === 0) return null;
  return schedules.reduce(
    (min, schedule) => (schedule.effectiveFrom < min ? schedule.effectiveFrom : min),
    schedules[0].effectiveFrom,
  );
}

export function assertDateRange(from: string, to: string): void {
  assertDate(from, 'from');
  assertDate(to, 'to');
  if (from > to) throw new ValidationError('from must not be after to');
}
