import type { SeriesExceptionKind } from '../api/series';
import { formatDateLong } from './member';

/**
 * Pure series labels for FR-5/FR-6. The formatter understands the common
 * schedule shapes the API accepts; anything else falls back to the raw RRULE so
 * the screen never invents a schedule or an occurrence (FR-43, EC-1).
 */

const DAY_LABELS: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

const RECOGNIZED_KEYS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'WKST']);

export const EXCEPTION_KIND_LABELS: Record<SeriesExceptionKind, string> = {
  cancelled: 'Cancelled',
  extra: 'Extra',
};

function joinList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

function parseRule(rrule: string): Map<string, string> | null {
  const normalized = rrule.trim().toUpperCase();
  if (!normalized) return null;

  const parts = new Map<string, string>();
  for (const segment of normalized.split(';')) {
    const separator = segment.indexOf('=');
    if (separator <= 0 || separator === segment.length - 1) return null;

    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (!RECOGNIZED_KEYS.has(key) || !value) return null;
    parts.set(key, value);
  }

  return parts.has('FREQ') ? parts : null;
}

function intervalOf(parts: Map<string, string>): number | null {
  const interval = parts.get('INTERVAL');
  if (interval === undefined) return 1;
  if (!/^\d+$/.test(interval)) return null;

  const value = Number(interval);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function byDayLabels(value: string | undefined): string[] | null {
  if (!value) return null;

  const labels: string[] = [];
  for (const token of value.split(',')) {
    const label = DAY_LABELS[token.trim()];
    if (!label) return null;
    labels.push(label);
  }

  // Keep the RRULE's own order, but reject a duplicate day: it is malformed.
  if (new Set(labels).size !== labels.length) return null;
  return labels;
}

function byMonthDayValues(value: string | undefined): string[] | null {
  if (!value) return null;

  const days = value.split(',').map((token) => token.trim());
  if (days.some((day) => !/^\d{1,2}$/.test(day))) return null;

  const numbers = days.map(Number);
  if (numbers.some((day) => !Number.isInteger(day) || day < 1 || day > 31)) return null;
  return days.map((day) => String(Number(day)));
}

/**
 * `FREQ=WEEKLY;BYDAY=SU` -> `Weekly on Sunday`,
 * `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE` -> `Every 2 weeks on Monday and Wednesday`,
 * `FREQ=MONTHLY;BYMONTHDAY=15` -> `Monthly on day 15`.
 * Unsupported or malformed rules return the raw RRULE unchanged.
 */
export function scheduleLabel(rrule: string): string {
  const raw = rrule.trim();
  const parts = parseRule(raw);
  if (!parts) return raw;

  const frequency = parts.get('FREQ');
  const interval = intervalOf(parts);
  if (interval === null) return raw;

  if (frequency === 'DAILY') {
    if (parts.has('BYDAY') || parts.has('BYMONTHDAY')) return raw;
    return interval === 1 ? 'Daily' : `Every ${interval} days`;
  }

  if (frequency === 'WEEKLY') {
    if (parts.has('BYMONTHDAY')) return raw;
    const days = byDayLabels(parts.get('BYDAY'));
    if (!days) return raw;

    const prefix = interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
    return `${prefix} on ${joinList(days)}`;
  }

  if (frequency === 'MONTHLY') {
    if (parts.has('BYDAY')) return raw;
    const days = byMonthDayValues(parts.get('BYMONTHDAY'));
    if (!days) return raw;

    const prefix = interval === 1 ? 'Monthly' : `Every ${interval} months`;
    return `${prefix} on ${days.length === 1 ? 'day' : 'days'} ${joinList(days)}`;
  }

  return raw;
}

/**
 * The list cell: the first API-supplied occurrence, never a locally computed
 * one. `windowDays` is the same length the page requested, so the empty text
 * cannot claim a different window from the request.
 */
export function nextOccurrenceLabel(date: string | null, windowDays: number): string {
  if (!date) return `None in ${windowDays} days`;
  return formatDateLong(date);
}

export function exceptionKindLabel(kind: SeriesExceptionKind): string {
  return EXCEPTION_KIND_LABELS[kind];
}

/** A series is active until the API gives it an archive timestamp. */
export function seriesStatusLabel(archivedAt: string | null): 'Active' | 'Archived' {
  return archivedAt ? 'Archived' : 'Active';
}
