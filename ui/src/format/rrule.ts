/**
 * The closed recurrence vocabulary (FR-42f, AC-63). The event form never accepts
 * a raw `rrule`: it offers daily (interval 1-7), weekly (a weekday set, interval
 * 1-4), fortnightly and monthly — on the day, or positionally on the first/last
 * named weekday. This module is the one place that produces the API's string
 * from that choice and parses a stored string back to it (AC-63).
 *
 * `WKST=SU` is emitted on every interval-bearing weekly rule because RFC 5545
 * counts `INTERVAL` weeks from `WKST` (Monday by default) while the church week
 * runs Sunday to Saturday. A daily rule carries no `WKST`, where it would be
 * meaningless. Stored rules without `WKST` keep their Monday meaning and are
 * never rewritten; a string outside the vocabulary parses to `null`, and the
 * caller renders the stored string read-only rather than guess at it.
 */

export const RECURRENCE_CADENCES = ['daily', 'weekly', 'fortnightly', 'monthly'] as const;

export type RecurrenceCadence = (typeof RECURRENCE_CADENCES)[number];

/** The operator-facing label of each cadence, in the order the picker lists them. */
export const CADENCE_OPTIONS: readonly {
  readonly value: RecurrenceCadence;
  readonly label: string;
}[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly on the day' },
];

/** The RFC 5545 day codes, in week order (Monday first) for the day picker. */
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export type WeekdayCode = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Readonly<Record<WeekdayCode, string>> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

export const MONTH_POSITIONS = ['first', 'last'] as const;

export type MonthPosition = (typeof MONTH_POSITIONS)[number];

/** How a monthly schedule picks its date: a day of the month, or a position. */
export type MonthlyMode = 'day' | 'position';

export interface RecurrenceChoice {
  readonly cadence: RecurrenceCadence;
  /** A UTC calendar date; its weekday (or day of month) is the rule's default. */
  readonly effectiveFrom: string;
  /** Weekly: the chosen weekdays. Empty falls back to `effectiveFrom`'s weekday. */
  readonly weekdays?: readonly WeekdayCode[];
  /** Daily 1-7; weekly and fortnightly 1-4. Defaults to 1. */
  readonly interval?: number;
  /** Monthly only; `day` is the default. */
  readonly monthlyMode?: MonthlyMode;
  /** Monthly on the day: 1-31. Empty falls back to `effectiveFrom`'s day. */
  readonly dayOfMonth?: string;
  /** Monthly positional: first or last. */
  readonly position?: MonthPosition;
  /** Monthly positional: the one weekday, taken from `effectiveFrom` when absent. */
  readonly positionWeekday?: WeekdayCode;
}

/** The `Date#getUTCDay()` order, which the RFC codes index. */
const WEEKDAY_BY_INDEX = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAY_PATTERN = /^(?:[1-9]|[12]\d|3[01])$/;

/** A parsed calendar date, or `null` when the text is not a real UTC date. */
export function parseIsoDate(
  value: string,
): { readonly year: number; readonly month: number; readonly day: number } | null {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** The weekday of a UTC calendar date, or `null` when the date is malformed. */
export function weekdayOf(value: string): WeekdayCode | null {
  const parsed = parseIsoDate(value);
  if (!parsed) return null;
  return WEEKDAY_BY_INDEX[
    new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay()
  ];
}

/** The ISO day-of-month of a date, or `null` when the date is malformed. */
export function dayOfMonthOf(value: string): string | null {
  const parsed = parseIsoDate(value);
  return parsed ? String(parsed.day) : null;
}

/** A weekday set in week order, deduplicated; the builder's canonical string order. */
function sortedWeekdays(days: readonly WeekdayCode[]): WeekdayCode[] {
  const unique = new Set(days);
  return WEEKDAYS.filter((day) => unique.has(day));
}

function positiveInteger(value: number | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

/**
 * `{ daily, 3 }` -> `FREQ=DAILY;INTERVAL=3`,
 * `{ weekly, [MO, TH] }` -> `FREQ=WEEKLY;BYDAY=MO,TH`,
 * `{ weekly, [MO, TH], interval: 2 }` -> `FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO,TH`,
 * `{ monthly, 15 }` -> `FREQ=MONTHLY;BYMONTHDAY=15`,
 * `{ monthly, position: last, SA }` -> `FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA`.
 * A malformed date or an out-of-vocabulary interval/day produces no rule (null);
 * the form validates before it builds a payload.
 */
export function toRrule(choice: RecurrenceChoice): string | null {
  const start = parseIsoDate(choice.effectiveFrom);
  if (!start) return null;

  const startWeekday =
    WEEKDAY_BY_INDEX[new Date(Date.UTC(start.year, start.month - 1, start.day)).getUTCDay()];

  if (choice.cadence === 'daily') {
    const interval = positiveInteger(choice.interval, 1);
    if (interval === null || interval > 7) return null;
    return interval === 1 ? 'FREQ=DAILY' : `FREQ=DAILY;INTERVAL=${interval}`;
  }

  if (choice.cadence === 'weekly' || choice.cadence === 'fortnightly') {
    // Fortnightly is the weekly rule at an interval of two.
    const interval = positiveInteger(choice.interval, choice.cadence === 'fortnightly' ? 2 : 1);
    if (interval === null || interval > 4) return null;

    const days = sortedWeekdays(
      choice.weekdays && choice.weekdays.length > 0 ? choice.weekdays : [startWeekday],
    );
    if (days.length === 0) return null;

    const byDay = days.join(',');
    if (interval === 1) return `FREQ=WEEKLY;BYDAY=${byDay}`;
    return `FREQ=WEEKLY;INTERVAL=${interval};WKST=SU;BYDAY=${byDay}`;
  }

  if (choice.monthlyMode === 'position') {
    const weekday = choice.positionWeekday ?? startWeekday;
    const position = choice.position === 'first' ? 1 : -1;
    return `FREQ=MONTHLY;BYSETPOS=${position};BYDAY=${weekday}`;
  }

  const rawDay = (choice.dayOfMonth ?? '').trim() || String(start.day);
  if (!MONTH_DAY_PATTERN.test(rawDay)) return null;
  return `FREQ=MONTHLY;BYMONTHDAY=${Number(rawDay)}`;
}

/** The exact key sets the vocabulary produces, and nothing else. */
function partsOf(rrule: string): Map<string, string> | null {
  const normalized = rrule.trim().toUpperCase();
  if (!normalized) return null;

  const parts = new Map<string, string>();
  for (const segment of normalized.split(';')) {
    const separator = segment.indexOf('=');
    if (separator <= 0 || separator === segment.length - 1) return null;

    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (!key || !value || parts.has(key)) return null;
    parts.set(key, value);
  }

  return parts;
}

function hasExactKeys(parts: Map<string, string>, keys: readonly string[]): boolean {
  if (parts.size !== keys.length) return false;
  return keys.every((key) => parts.has(key));
}

function isWeekdayCode(value: string): value is WeekdayCode {
  return (WEEKDAYS as readonly string[]).includes(value);
}

/** A positive integer in range, or `null`. */
function intervalInRange(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined) return 1;
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

/**
 * Parses a stored `rrule` back to the cadence that authored it (AC-63). Anything
 * outside the vocabulary — another frequency, an interval above the bound,
 * several monthly keys, a `WKST` other than Sunday — returns `null`, and the
 * screen shows the stored string untouched. A daily rule is part of the
 * vocabulary (owner, 2026-11-24) and no longer renders read-only.
 */
export function fromRrule(rrule: string): RecurrenceCadence | null {
  const parsed = parseSchedule(rrule);
  return parsed?.cadence ?? null;
}

/**
 * Parses a stored rule into the builder's own values, so a version read from the
 * API renders as the choices that authored it. `null` when the rule sits outside
 * the vocabulary; the caller then renders the stored string read-only.
 */
export interface ParsedSchedule {
  readonly cadence: RecurrenceCadence;
  readonly weekdays: readonly WeekdayCode[];
  readonly interval: number;
  readonly monthlyMode: MonthlyMode;
  readonly dayOfMonth: string;
  readonly position: MonthPosition;
  readonly positionWeekday: WeekdayCode | null;
}

export function parseSchedule(rrule: string): ParsedSchedule | null {
  const parts = partsOf(rrule);
  if (!parts) return null;

  const frequency = parts.get('FREQ');
  const byDay = parts.get('BYDAY');
  const byMonthDay = parts.get('BYMONTHDAY');
  const bySetPos = parts.get('BYSETPOS');
  const weekStart = parts.get('WKST');

  if (frequency === 'DAILY') {
    if (byDay || byMonthDay || bySetPos || weekStart) return null;
    const interval = intervalInRange(parts.get('INTERVAL'), 1, 7);
    if (interval === null) return null;
    return {
      cadence: 'daily',
      weekdays: [],
      interval,
      monthlyMode: 'day',
      dayOfMonth: '',
      position: 'first',
      positionWeekday: null,
    };
  }

  if (frequency === 'WEEKLY') {
    if (byMonthDay || bySetPos) return null;
    if (weekStart !== undefined && weekStart !== 'SU') return null;

    const interval = intervalInRange(parts.get('INTERVAL'), 1, 4);
    if (interval === null || !byDay) return null;

    const days = byDay.split(',');
    if (days.length === 0 || days.some((day) => !isWeekdayCode(day))) return null;
    if (new Set(days).size !== days.length) return null;

    const expectedKeys =
      interval === 1
        ? weekStart === undefined
          ? ['FREQ', 'BYDAY']
          : ['FREQ', 'BYDAY', 'WKST']
        : weekStart === undefined
          ? ['FREQ', 'INTERVAL', 'BYDAY']
          : ['FREQ', 'INTERVAL', 'WKST', 'BYDAY'];
    if (!hasExactKeys(parts, expectedKeys)) return null;

    return {
      cadence: interval === 2 ? 'fortnightly' : 'weekly',
      weekdays: sortedWeekdays(days as WeekdayCode[]),
      interval,
      monthlyMode: 'day',
      dayOfMonth: '',
      position: 'first',
      positionWeekday: null,
    };
  }

  if (frequency === 'MONTHLY') {
    if (weekStart) return null;

    if (byMonthDay) {
      if (byDay || bySetPos) return null;
      if (!MONTH_DAY_PATTERN.test(byMonthDay)) return null;
      if (!hasExactKeys(parts, ['FREQ', 'BYMONTHDAY'])) return null;
      return {
        cadence: 'monthly',
        weekdays: [],
        interval: 1,
        monthlyMode: 'day',
        dayOfMonth: byMonthDay,
        position: 'first',
        positionWeekday: null,
      };
    }

    if (bySetPos && byDay) {
      if (!hasExactKeys(parts, ['FREQ', 'BYSETPOS', 'BYDAY'])) return null;
      if (bySetPos !== '1' && bySetPos !== '-1') return null;
      if (!isWeekdayCode(byDay)) return null;
      return {
        cadence: 'monthly',
        weekdays: [],
        interval: 1,
        monthlyMode: 'position',
        dayOfMonth: '',
        position: bySetPos === '1' ? 'first' : 'last',
        positionWeekday: byDay,
      };
    }

    return null;
  }

  return null;
}

/** The cadence's label, for a form or a read-only schedule line. */
export function cadenceLabel(cadence: RecurrenceCadence): string {
  return CADENCE_OPTIONS.find((option) => option.value === cadence)?.label ?? cadence;
}
