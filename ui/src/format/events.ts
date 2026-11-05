import type {
  EventSessionItem,
  EventSessionStatus,
  EventStatus,
  EventVenueType,
  SessionSource,
} from '../api/events';

/**
 * Pure event labels and formatters (events FR-1/FR-2/FR-4/FR-10/FR-15). They
 * render the API's own values; no attendance count or status is derived here.
 */

export const VENUE_LABELS: Record<EventVenueType, string> = {
  auditorium: 'Auditorium',
  virtual: 'Virtual',
  hybrid: 'Hybrid',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  held: 'Held',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

export const SESSION_STATUS_LABELS: Record<EventSessionStatus, string> = {
  scheduled: 'Scheduled',
  held: 'Held',
  cancelled: 'Cancelled',
};

export const SESSION_SOURCE_LABELS: Record<SessionSource, string> = {
  import: 'Import',
  manual: 'Manual',
  mixed: 'Mixed',
  none: 'None',
};

export function venueLabel(venueType: EventVenueType): string {
  return VENUE_LABELS[venueType];
}

export function eventStatusLabel(status: EventStatus): string {
  return EVENT_STATUS_LABELS[status];
}

export function sessionStatusLabel(status: EventSessionStatus): string {
  return SESSION_STATUS_LABELS[status];
}

export function sessionSourceLabel(source: SessionSource): string {
  return SESSION_SOURCE_LABELS[source];
}

/** `86/120`, exactly the API's two counts. */
export function formatPresentExpected(counts: {
  readonly present: number;
  readonly expected: number;
}): string {
  return `${counts.present}/${counts.expected}`;
}

/**
 * A series-generated event inherits the series name, and the event DTO carries
 * no separate `seriesName`; the inherited name is the series label. An event
 * with no `seriesId` is standalone (FR-2/FR-16).
 */
export function seriesLabel(event: {
  readonly name: string;
  readonly seriesId: string | null;
}): string {
  return event.seriesId ? event.name : 'Standalone';
}

/**
 * The list column. The DTO has no `seriesName`, so `seriesLabel` falls back to
 * the inherited event name; when that would repeat the Event column, the cell
 * says "Series" instead. A standalone event stays explicit.
 */
export function seriesColumnLabel(event: {
  readonly name: string;
  readonly seriesId: string | null;
}): string {
  if (!event.seriesId) return 'Standalone';
  return seriesLabel(event) === event.name ? 'Series' : seriesLabel(event);
}

/** `CHOIR — Choir`, or a dash when the event carries no ministry (FR-2). */
export function ministryLabel(
  ministry: { readonly code: string; readonly name: string } | null,
): string {
  return ministry ? `${ministry.code} — ${ministry.name}` : '—';
}

/** `1 offering` / `3 offerings`; the count is the API's array length. */
export function offeringsLabel(count: number): string {
  return count === 1 ? '1 offering' : `${count} offerings`;
}

/** The per-session attendance cell: pairs in session order, never summed. */
export function sessionAttendanceLabels(sessions: readonly EventSessionItem[]): string {
  return sessions.map((session) => formatPresentExpected(session)).join(' · ');
}
