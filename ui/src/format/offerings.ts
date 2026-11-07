import type { EventItem } from '../api/events';
import type { DateWindow } from './date-window';
import { utcToday } from './member-form';

/**
 * Pure helpers for the offerings landing (FR-30, FR-40). The USSD preview
 * mirrors the reference menu's 20-character offering row, five rows plus
 * `0 More`; the window default is the current UTC calendar year to date.
 */

export const USSD_OFFERING_PAGE_SIZE = 5;
export const USSD_OFFERING_WIDTH = 20;
export const DEFAULT_WORKLIST_LIMIT = 50;

/** The default landing window: 1 January of the current UTC year to today. */
export function yearToDateWindow(today: string = utcToday()): DateWindow {
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

/** The reference USSD row truncation: a longer value ends with `…`. */
export function truncateUssd(value: string, width = USSD_OFFERING_WIDTH): string {
  if (value.length <= width) return value;
  return `${value.slice(0, width - 1)}…`;
}

export interface UssdPreview {
  readonly eventId: string;
  readonly eventName: string;
  readonly sessionDate: string;
  /** The screen as the reference USSD menu composes it, one line per row. */
  readonly lines: readonly string[];
}

interface Candidate {
  readonly event: EventItem;
  readonly date: string;
  readonly startTime: string;
}

/**
 * Composes the offerings screen from the events list (R8): the current or next
 * non-cancelled session, then at most five attached offerings plus `0 More`.
 * Returns null when the list has no upcoming session.
 */
export function ussdPreviewFromEvents(
  events: readonly EventItem[],
  today: string = utcToday(),
): UssdPreview | null {
  const candidates: Candidate[] = [];
  for (const event of events) {
    if (event.status === 'cancelled' || event.status === 'archived') continue;
    for (const session of event.sessions) {
      if (session.status === 'cancelled' || session.date < today) continue;
      candidates.push({ event, date: session.date, startTime: session.startTime });
    }
  }
  candidates.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.startTime.localeCompare(right.startTime) ||
      left.event.name.localeCompare(right.event.name) ||
      left.event.id.localeCompare(right.event.id),
  );

  const first = candidates[0];
  if (!first) return null;

  const visible = first.event.offerings.slice(0, USSD_OFFERING_PAGE_SIZE);
  const lines: string[] = ['Choose offering(s)'];
  visible.forEach((offering, index) => {
    lines.push(`${index + 1} ${truncateUssd(offering.name)}`);
  });
  if (first.event.offerings.length > USSD_OFFERING_PAGE_SIZE) lines.push('0 More');

  return {
    eventId: first.event.id,
    eventName: first.event.name,
    sessionDate: first.date,
    lines,
  };
}

/** The worklist caption states its unwindowed scope, never the landing window. */
export function worklistScopeLabel(shown: number, limit = DEFAULT_WORKLIST_LIMIT): string {
  return `Newest first, unwindowed · first ${shown} of up to ${limit}`;
}
