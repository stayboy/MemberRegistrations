/**
 * The closed recurrence vocabulary (FR-42f). The event form never accepts a raw
 * `rrule`: it offers weekly, fortnightly and monthly-on-the-day, and this module
 * is the one place that produces the API's string from that choice and parses a
 * stored string back to it. The weekday and the day of the month are taken from
 * the chosen `effectiveFrom`, so a version read from the API renders as the
 * label that authored it.
 *
 * A string outside this vocabulary parses to `null`; the caller must render the
 * stored string read-only rather than guess at it (AC-63).
 */

export const RECURRENCE_CADENCES = ['weekly', 'fortnightly', 'monthly'] as const;

export type RecurrenceCadence = (typeof RECURRENCE_CADENCES)[number];

/** The operator-facing label of each cadence, in the order the picker lists them. */
export const CADENCE_OPTIONS: readonly {
  readonly value: RecurrenceCadence;
  readonly label: string;
}[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly on the day' },
];

export interface RecurrenceChoice {
  readonly cadence: RecurrenceCadence;
  /** A UTC calendar date; its weekday (or day of month) is what the rule repeats. */
  readonly effectiveFrom: string;
}

/** `Date.getUTCDay()` index order, so one lookup names the weekday. */
const WEEKDAYS: readonly string[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAY_PATTERN = /^(?:[1-9]|[12]\d|3[01])$/;

function dayCodeOf(effectiveFrom: string): string | null {
  const match = ISO_DATE_PATTERN.exec(effectiveFrom.trim());
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

  return WEEKDAYS[date.getUTCDay()] ?? null;
}

/**
 * `{ weekly, 2026-11-01 }` -> `FREQ=WEEKLY;BYDAY=SU`,
 * `{ fortnightly, 2026-11-01 }` -> `FREQ=WEEKLY;INTERVAL=2;BYDAY=SU`,
 * `{ monthly, 2026-11-15 }` -> `FREQ=MONTHLY;BYMONTHDAY=15`.
 * A malformed date has no day to repeat, so it produces no rule (null); the form
 * validates the date before it builds a payload.
 */
export function toRrule({ cadence, effectiveFrom }: RecurrenceChoice): string | null {
  const dayCode = dayCodeOf(effectiveFrom);
  if (!dayCode) return null;

  if (cadence === 'weekly') return `FREQ=WEEKLY;BYDAY=${dayCode}`;
  if (cadence === 'fortnightly') return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dayCode}`;

  const dayOfMonth = Number(effectiveFrom.trim().slice(8, 10));
  if (!MONTH_DAY_PATTERN.test(String(dayOfMonth))) return null;
  return `FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}`;
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

/**
 * Parses a stored `rrule` back to the cadence that authored it. Anything outside
 * the vocabulary — another frequency, an interval, several weekdays, a monthly
 * rule keyed on a weekday — returns `null`, and the screen shows the stored
 * string untouched.
 */
export function fromRrule(rrule: string): RecurrenceCadence | null {
  const parts = partsOf(rrule);
  if (!parts) return null;

  const frequency = parts.get('FREQ');
  const byDay = parts.get('BYDAY');
  const byMonthDay = parts.get('BYMONTHDAY');

  if (frequency === 'WEEKLY') {
    if (!byDay || !WEEKDAYS.includes(byDay)) return null;
    if (byMonthDay) return null;
    if (hasExactKeys(parts, ['FREQ', 'BYDAY'])) return 'weekly';
    if (hasExactKeys(parts, ['FREQ', 'INTERVAL', 'BYDAY']) && parts.get('INTERVAL') === '2') {
      return 'fortnightly';
    }
    return null;
  }

  if (frequency === 'MONTHLY') {
    if (!byMonthDay || !MONTH_DAY_PATTERN.test(byMonthDay)) return null;
    if (byDay) return null;
    return hasExactKeys(parts, ['FREQ', 'BYMONTHDAY']) ? 'monthly' : null;
  }

  return null;
}

/** The cadence's label, for a form or a read-only schedule line. */
export function cadenceLabel(cadence: RecurrenceCadence): string {
  return CADENCE_OPTIONS.find((option) => option.value === cadence)?.label ?? cadence;
}
