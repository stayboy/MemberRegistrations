import type { EventListItem, EventSessionSummary } from '../api/events';
import { isCalendarDate } from './import-file';

/**
 * Pure selection rules for the attendance import (FR-36a, owner decision Q149):
 * only a held-or-scheduled event and a non-cancelled session may receive rows.
 */

export interface OccurrenceRef {
  readonly eventId: string;
  readonly sessionDate: string;
}

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

const RANGE_DAYS_BEFORE = 30;
const RANGE_DAYS_AFTER = 30;

function shiftUtcDate(date: Date, offsetDays: number): string {
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
}

/** Drops `cancelled` and `archived` events from the picker. */
export function importableEvents(events: readonly EventListItem[]): EventListItem[] {
  return events.filter((event) => event.status !== 'cancelled' && event.status !== 'archived');
}

/** Drops `cancelled` sessions; a cancelled session is read-only. */
export function importableSessions(event: EventListItem | undefined): EventSessionSummary[] {
  return (event?.sessions ?? []).filter((session) => session.status !== 'cancelled');
}

/**
 * Resolves a `?event=<id>&date=<YYYY-MM-DD>` deep link against the loaded
 * events. Returns null when either parameter is missing, the event is unknown
 * or not importable, or the date is not one of its importable sessions.
 */
export function resolveOccurrence(
  searchParams: Pick<URLSearchParams, 'get'>,
  events: readonly EventListItem[],
): OccurrenceRef | null {
  const eventId = searchParams.get('event');
  const date = searchParams.get('date');
  if (!eventId || !date) return null;

  const event = importableEvents(events).find((candidate) => candidate.id === eventId);
  if (!event) return null;

  const session = importableSessions(event).find((candidate) => candidate.date === date);
  return session ? { eventId, sessionDate: date } : null;
}

/**
 * The first list window. A deep link centres it ±30 days on the linked session
 * date, so a session outside the default window still resolves on first load. A
 * missing or malformed date falls back to today ±30, always in UTC.
 */
export function initialRange(searchParams: Pick<URLSearchParams, 'get'>): DateRange {
  const date = searchParams.get('date');
  if (date && isCalendarDate(date)) {
    const linked = new Date(`${date}T00:00:00.000Z`);
    return {
      from: shiftUtcDate(linked, -RANGE_DAYS_BEFORE),
      to: shiftUtcDate(linked, RANGE_DAYS_AFTER),
    };
  }

  const today = new Date();
  return {
    from: shiftUtcDate(today, -RANGE_DAYS_BEFORE),
    to: shiftUtcDate(today, RANGE_DAYS_AFTER),
  };
}
