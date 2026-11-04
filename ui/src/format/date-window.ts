import { utcToday } from './member-form';

/**
 * The shared UTC date window used by the shepherding screens and the events
 * list (FR-58/FR-67, events FR-2). A window is two inclusive UTC calendar
 * dates; the helpers never shift a value into local time.
 */

export interface DateWindow {
  readonly from: string;
  readonly to: string;
}

export const DEFAULT_WINDOW_DAYS = 90;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseUtcDate(value: string | null | undefined): Date | null {
  const trimmed = value?.trim() ?? '';
  if (!ISO_DATE_PATTERN.test(trimmed)) return null;

  const [year, month, day] = trimmed.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Shifts a UTC calendar date by whole days; an invalid input returns `null`. */
export function shiftUtcDate(value: string, days: number): string | null {
  const date = parseUtcDate(value);
  if (!date) return null;
  return formatUtcDate(new Date(date.getTime() + days * DAY_MS));
}

/** The default window: the last 90 UTC calendar days, inclusive of today. */
export function defaultDateWindow(today: string = utcToday()): DateWindow {
  const from = shiftUtcDate(today, -DEFAULT_WINDOW_DAYS);
  return { from: from ?? today, to: today };
}

/**
 * Resolves URL-backed `from`/`to`. Missing or invalid values fall back to the
 * defaults; a reversed range also falls back rather than querying the API with
 * a window it would reject (FR-67).
 */
export function resolveDateWindow(
  from: string | null | undefined,
  to: string | null | undefined,
  today: string = utcToday(),
): DateWindow {
  const fallback = defaultDateWindow(today);
  const resolvedFrom = parseUtcDate(from) ? from!.trim() : fallback.from;
  const resolvedTo = parseUtcDate(to) ? to!.trim() : fallback.to;
  return resolvedFrom <= resolvedTo ? { from: resolvedFrom, to: resolvedTo } : fallback;
}
