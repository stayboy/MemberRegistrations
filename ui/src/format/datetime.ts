/**
 * The one formatter for API date and time values (UI spec FR-76 and the
 * date/time formatting spec, ticket 18c). Callers choose by the kind of value
 * they hold, never by guesswork:
 *
 * - `formatInstant` converts a UTC instant to the browser's zone (or an
 *   explicit zone for tests) and carries the chosen date and clock style.
 * - `formatCalendarDate` formats a `YYYY-MM-DD` day at noon UTC and can never
 *   shift a birthday or a session date.
 * - `formatWallClockTime` formats an `HH:MM[:SS]` string without converting it.
 * - `formatDateRange` formats two calendar dates.
 *
 * No other module may call `Intl` or `toLocaleString` for a displayed date.
 */

export type DateStyle = 'locale' | 'dmy' | 'mdy' | 'iso';
export type TimeCycle = 'locale' | 'h12' | 'h24';

export interface DateTimePreference {
  readonly dateStyle: DateStyle;
  readonly timeCycle: TimeCycle;
}

export const DEFAULT_DATE_TIME_PREFERENCE: DateTimePreference = {
  dateStyle: 'locale',
  timeCycle: 'locale',
};

export const DATE_STYLE_LABELS: Record<DateStyle, string> = {
  locale: 'Locale default',
  dmy: 'Day Month Year',
  mdy: 'Month Day, Year',
  iso: 'ISO 8601',
};

export const TIME_CYCLE_LABELS: Record<TimeCycle, string> = {
  locale: 'Locale default',
  h12: '12-hour',
  h24: '24-hour',
};

export const DATE_STYLES: readonly DateStyle[] = ['locale', 'dmy', 'mdy', 'iso'];
export const TIME_CYCLES: readonly TimeCycle[] = ['locale', 'h12', 'h24'];

export const DATE_STYLE_OPTIONS = DATE_STYLES.map((value) => ({
  value,
  label: DATE_STYLE_LABELS[value],
})) as readonly { readonly value: DateStyle; readonly label: string }[];

export const TIME_CYCLE_OPTIONS = TIME_CYCLES.map((value) => ({
  value,
  label: TIME_CYCLE_LABELS[value],
})) as readonly { readonly value: TimeCycle; readonly label: string }[];

export interface InstantFormatOptions {
  /** Pins the locale in tests; the browser locale is used when omitted. */
  readonly locale?: string;
  /** Pins the zone in tests; the browser zone is used when omitted. */
  readonly timeZone?: string;
}

/** An absolute style pins its own order, so "Day Month Year" is never reversed. */
const DATE_STYLE_LOCALES: Record<'dmy' | 'mdy', string> = {
  dmy: 'en-GB',
  mdy: 'en-US',
};

const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;
const WALL_CLOCK_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseInstant(value: string | null | undefined): Date | null {
  if (typeof value !== 'string' || !INSTANT_PATTERN.test(value)) return null;
  if (!parseCalendarDate(value.slice(0, 10))) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCalendarDate(
  value: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null;
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function dateOptions(style: DateStyle): Intl.DateTimeFormatOptions {
  switch (style) {
    case 'dmy':
      return { day: 'numeric', month: 'long', year: 'numeric' };
    case 'mdy':
      return { month: 'long', day: 'numeric', year: 'numeric' };
    case 'iso':
      throw new Error('ISO 8601 dates are formatted explicitly, not through Intl dateStyle.');
    case 'locale':
    default:
      return { dateStyle: 'medium' };
  }
}

function timeOptions(cycle: TimeCycle, withSeconds: boolean): Intl.DateTimeFormatOptions {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  };
  if (cycle === 'h24') options.hour12 = false;
  if (cycle === 'h12') options.hour12 = true;
  return options;
}

function isoDateInZone(date: Date, timeZone: string | undefined): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * An ISO instant, converted to the browser zone (or `options.timeZone`).
 * Invalid input returns an empty string. The date style and clock cycle are the
 * officer's preference; the two parts are joined with a comma.
 */
export function formatInstant(
  value: string | null | undefined,
  preference: DateTimePreference,
  options: InstantFormatOptions = {},
): string {
  const date = parseInstant(value);
  if (!date) return '';

  try {
    const { dateStyle, timeCycle } = preference;
    const dateText =
      dateStyle === 'iso'
        ? isoDateInZone(date, options.timeZone)
        : new Intl.DateTimeFormat(
            dateStyle === 'locale' ? options.locale : DATE_STYLE_LOCALES[dateStyle],
            { ...dateOptions(dateStyle), timeZone: options.timeZone },
          ).format(date);
    const timeText = new Intl.DateTimeFormat(options.locale, {
      ...timeOptions(timeCycle, false),
      timeZone: options.timeZone,
    }).format(date);
    return `${dateText}, ${timeText}`;
  } catch {
    return '';
  }
}

/**
 * A calendar date (`YYYY-MM-DD`, or the date part of a full ISO string) built at
 * noon UTC and formatted in UTC. It deliberately takes no time zone: a birthday
 * or a session date never moves because the reader is west of UTC.
 */
export function formatCalendarDate(
  value: string | null | undefined,
  preference: DateTimePreference,
): string {
  const date = parseCalendarDate(value);
  if (!date) return '';

  if (preference.dateStyle === 'iso') {
    return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  }

  try {
    return new Intl.DateTimeFormat(
      preference.dateStyle === 'locale' ? undefined : DATE_STYLE_LOCALES[preference.dateStyle],
      { ...dateOptions(preference.dateStyle), timeZone: 'UTC' },
    ).format(new Date(Date.UTC(date.year, date.month - 1, date.day, 12)));
  } catch {
    return '';
  }
}

/**
 * A wall-clock time (`HH:MM` or `HH:MM:SS`) formatted through the clock cycle
 * without a zone conversion. `24:00` is not a valid wall-clock time.
 */
export function formatWallClockTime(
  value: string | null | undefined,
  preference: DateTimePreference,
): string {
  if (typeof value !== 'string') return '';
  const match = WALL_CLOCK_PATTERN.exec(value);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? undefined : Number(match[3]);
  if (hour > 23 || minute > 59 || (second !== undefined && second > 59)) return '';

  try {
    const date = new Date(Date.UTC(2000, 0, 1, hour, minute, second ?? 0));
    return new Intl.DateTimeFormat(undefined, {
      ...timeOptions(preference.timeCycle, second !== undefined),
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return '';
  }
}

/** Two calendar dates as one range, or one date when the endpoints are equal. */
export function formatDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
  preference: DateTimePreference,
): string {
  if (from === to) return formatCalendarDate(from, preference);
  return `${formatCalendarDate(from, preference)} – ${formatCalendarDate(to, preference)}`;
}

/**
 * The exact UTC instant for a `title` attribute, so the stored value stays
 * recoverable under any display preference. Invalid input returns `undefined`.
 */
export function formatInstantTitle(value: string | null | undefined): string | undefined {
  return parseInstant(value)?.toISOString();
}

export function isDateStyle(value: unknown): value is DateStyle {
  return typeof value === 'string' && (DATE_STYLES as readonly string[]).includes(value);
}

export function isTimeCycle(value: unknown): value is TimeCycle {
  return typeof value === 'string' && (TIME_CYCLES as readonly string[]).includes(value);
}

export function isDateTimePreference(value: unknown): value is DateTimePreference {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { dateStyle?: unknown; timeCycle?: unknown };
  return isDateStyle(candidate.dateStyle) && isTimeCycle(candidate.timeCycle);
}

/**
 * Reads the stored preference. Missing, unknown, malformed or partial input
 * falls back to the locale default, exactly like the theme preference.
 */
export function parseDateTimePreference(raw: string | null | undefined): DateTimePreference {
  if (!raw) return DEFAULT_DATE_TIME_PREFERENCE;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isDateTimePreference(parsed) ? parsed : DEFAULT_DATE_TIME_PREFERENCE;
  } catch {
    return DEFAULT_DATE_TIME_PREFERENCE;
  }
}
