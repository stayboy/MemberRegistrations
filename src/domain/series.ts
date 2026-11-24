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

/** UTC calendar-date arithmetic on an ISO date string. */
export function shiftDate(date: string, days: number): string {
  return shift(date, days);
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
/**
 * The UTC calendar date in the event's timezone. The optional `at` is the
 * clock seam: production callers use now, while a test can pin an instant.
 */
export function todayIn(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: assertTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

const WEEKDAYS: readonly string[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const AUTHORED_KEYS = new Set(['FREQ', 'BYDAY', 'INTERVAL', 'BYMONTHDAY', 'BYSETPOS', 'WKST']);

function parseBody(normalized: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const chunk of normalized.split(';')) {
    const separator = chunk.indexOf('=');
    if (separator <= 0) {
      throw new ValidationError(
        `rrule must be semicolon-separated KEY=VALUE pairs, such as FREQ=WEEKLY;BYDAY=SU: ${normalized}`,
      );
    }
    const key = chunk.slice(0, separator);
    const value = chunk.slice(separator + 1);
    if (!value) {
      throw new ValidationError(`rrule: ${key} has no value`);
    }
    if (!AUTHORED_KEYS.has(key)) {
      throw new ValidationError(
        `rrule: ${key} is outside the authored vocabulary (FREQ, BYDAY, INTERVAL, BYMONTHDAY, BYSETPOS, WKST)`,
      );
    }
    if (parts.has(key)) {
      throw new ValidationError(`rrule: ${key} appears more than once`);
    }
    parts.set(key, value);
  }
  return parts;
}

/**
 * The authored schedule vocabulary is closed (member-registrations-event-periods.md,
 * "Schedules"): a weekly rule with a weekday set and an interval of 1-4, a
 * monthly rule on a day-of-month, or a monthly positional rule
 * (`BYSETPOS=±1` with exactly one weekday). Anything else - `FREQ=DAILY`,
 * `COUNT`, `BYMONTH`, positional weekly days, a second `BYSETPOS` - is refused
 * on a **write**; a stored rule outside it still expands and reads (a read
 * never calls this function), which is why the scheduler keeps working on
 * legacy rows.
 */
function assertVocabulary(normalized: string): Map<string, string> {
  const parts = parseBody(normalized);
  const freq = parts.get('FREQ');
  if (freq !== 'WEEKLY' && freq !== 'MONTHLY') {
    throw new ValidationError(
      `rrule: FREQ must be WEEKLY or MONTHLY; the schedule vocabulary has no other cadence`,
    );
  }

  const interval = parts.get('INTERVAL');
  if (interval !== undefined && !/^[1-4]$/.test(interval)) {
    throw new ValidationError('rrule: INTERVAL must be 1, 2, 3 or 4');
  }

  const weekStart = parts.get('WKST');
  if (weekStart !== undefined && !WEEKDAYS.includes(weekStart)) {
    throw new ValidationError(`rrule: WKST must be one of ${WEEKDAYS.join(', ')}`);
  }

  const byDay = parts.get('BYDAY');
  const byMonthDay = parts.get('BYMONTHDAY');
  const bySetPos = parts.get('BYSETPOS');

  if (freq === 'WEEKLY') {
    if (byMonthDay || bySetPos) {
      throw new ValidationError(
        'rrule: a weekly rule takes BYDAY only; BYMONTHDAY and BYSETPOS belong to a monthly rule',
      );
    }
    if (!byDay) {
      throw new ValidationError(
        'rrule: a weekly rule needs BYDAY (a weekday set such as MO,TH,FR)',
      );
    }
    for (const day of byDay.split(',')) {
      if (!WEEKDAYS.includes(day)) {
        throw new ValidationError(
          `rrule: BYDAY must be plain weekdays (${WEEKDAYS.join(', ')}); positional days belong in a monthly BYSETPOS rule`,
        );
      }
    }
    return parts;
  }

  if (bySetPos !== undefined) {
    if (bySetPos !== '1' && bySetPos !== '-1') {
      throw new ValidationError('rrule: BYSETPOS must be 1 or -1');
    }
    if (!byDay) {
      throw new ValidationError(
        'rrule: a monthly positional rule needs BYDAY naming exactly one weekday',
      );
    }
    const days = byDay.split(',');
    if (days.length !== 1 || !WEEKDAYS.includes(days[0]!)) {
      throw new ValidationError(
        'rrule: a monthly positional rule takes exactly one plain weekday in BYDAY',
      );
    }
    if (byMonthDay !== undefined) {
      throw new ValidationError('rrule: a monthly rule takes BYMONTHDAY or BYSETPOS, not both');
    }
    return parts;
  }

  if (byMonthDay !== undefined) {
    if (byDay !== undefined) {
      throw new ValidationError(
        'rrule: monthly on a day-of-month takes BYMONTHDAY alone; a weekday needs BYSETPOS',
      );
    }
    if (!/^(?:[1-9]|[12]\d|3[01])$/.test(byMonthDay)) {
      throw new ValidationError('rrule: BYMONTHDAY must be a single day of the month, 1-31');
    }
    return parts;
  }

  throw new ValidationError(
    'rrule: a monthly rule needs BYMONTHDAY or BYSETPOS with exactly one BYDAY',
  );
}

/**
 * RFC 5545 counts `INTERVAL` weeks from `WKST` (Monday by default), while the
 * church week is Sunday-to-Saturday, so every weekly rule carrying an interval
 * is stored with `WKST=SU`. A rule without `INTERVAL` is untouched: the week
 * start changes nothing there. Stored rules are never rewritten on read, so a
 * legacy rule without `WKST` keeps its Monday meaning.
 */
function withWeekStart(parts: Map<string, string>, normalized: string): string {
  if (parts.get('FREQ') !== 'WEEKLY') return normalized;
  if (!parts.has('INTERVAL') || parts.has('WKST')) return normalized;
  return `${normalized};WKST=SU`;
}

/**
 * Accepts an RRULE body only (`FREQ=WEEKLY;BYDAY=SU`), inside the closed
 * authored vocabulary, and normalises it to upper case. `COUNT` and `UNTIL` are
 * rejected: the series end date is the `endsOn` column, and two sources of
 * truth for "when does this stop" is one too many. A weekly rule with an
 * interval gains `WKST=SU`; an accepted `WKST` round-trips unchanged.
 */
export function validateRrule(body: string): string {
  const normalized = body.trim().toUpperCase();
  if (!normalized.startsWith('FREQ=')) {
    throw new ValidationError('rrule must be an RFC 5545 body such as FREQ=WEEKLY;BYDAY=SU');
  }
  if (/\b(COUNT|UNTIL)=/.test(normalized)) {
    throw new ValidationError('rrule must not contain COUNT or UNTIL; use endsOn instead');
  }

  const stored = withWeekStart(assertVocabulary(normalized), normalized);
  try {
    const rule = rrulestr(`DTSTART:20260101T000000Z\nRRULE:${stored}`);
    rule.between(toUtc('2026-01-01'), toUtc('2026-12-31'), true);
  } catch {
    throw new ValidationError(`rrule is not valid: ${body}`);
  }

  return stored;
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
 * 3. When `importedDates` is non-empty, its dates win inside the covered range:
 *    a scheduled date the import omits was not held, and an imported date
 *    off-schedule was. V2 passes an empty list; the branch is kept for a future
 *    event-list import.
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
