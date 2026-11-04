import { ApiError } from './errors';
import { gatewayRequest, gatewayRequestWithMeta } from './gateway';

/**
 * Wire types mirror `src/schemas/events.ts` and the event DTOs in
 * `src/repos/events.ts`. The event list is used by the attendance import picker
 * and the events screen, so the base `EventListItem` keeps the picker's subset
 * and `EventItem` adds the fields the list and detail render.
 */

export type EventStatus = 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
export type EventSessionStatus = 'scheduled' | 'held' | 'cancelled';
export type EventVenueType = 'auditorium' | 'virtual' | 'hybrid';
export type EventSource = 'series' | 'manual' | 'import';
export type SessionSource = 'import' | 'manual' | 'mixed' | 'none';

/** The subset of a session the attendance import picker needs. */
export interface EventSessionSummary {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly status: EventSessionStatus;
  readonly venueType?: EventVenueType;
}

/** Mirrors `EventSessionItem`: one dated session and its attendance summary. */
export interface EventSessionItem extends EventSessionSummary {
  readonly present: number;
  readonly expected: number;
  readonly importedRows: number;
  readonly source: SessionSource;
}

export interface EventOfferingStatsItem {
  readonly attachedEvents: number;
  readonly pledgedMinor: number;
  readonly paidMinor: number;
  readonly pendingMinor: number;
  readonly honorRate: number;
  readonly contributionCount: number;
}

export interface EventOfferingItem {
  readonly offeringId: string;
  readonly name: string;
  readonly kind: 'freewill' | 'tithe' | 'pledge' | 'building' | 'missions' | 'other';
  readonly currency: string;
  readonly availableUntil: string | null;
  readonly exceptions: readonly {
    readonly date: string;
    readonly kind: 'skip' | 'opt_in';
    readonly note: string | null;
  }[];
  readonly stats: EventOfferingStatsItem;
}

/** Mirrors `EventItem`; `offerings` is empty until the offerings tickets land. */
export interface EventItem extends EventListItem {
  readonly seriesId: string | null;
  readonly ministry: { readonly code: string; readonly name: string } | null;
  readonly timezone: string;
  readonly endDate: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly venueType: EventVenueType;
  readonly venueName: string | null;
  readonly description: string | null;
  readonly source: EventSource;
  readonly sessions: readonly EventSessionItem[];
  readonly offerings: readonly EventOfferingItem[];
  readonly stats: EventOfferingStatsItem;
}

export interface EventListItem {
  readonly id: string;
  /** Null for a series-minted instance that has not been numbered yet. */
  readonly eventNo: string | null;
  readonly name: string;
  readonly startDate: string;
  readonly status: EventStatus;
  readonly sessions: readonly EventSessionSummary[];
}

/** The detail body plus the `ETag` header; the API sends the event itself. */
export interface EventDetail {
  readonly event: EventItem;
  readonly etag: string | null;
}

/** Mirrors `EventAttendanceRow`; there is no absence record. */
export interface EventAttendanceRow {
  readonly memberNo: string;
  readonly name: string;
  readonly status: 'present';
  readonly source: 'import' | 'manual';
  /** Wall-clock time the register carried, `HH:MM`; null for a date-only row. */
  readonly sessionTime: string | null;
}

/** Mirrors `EventAttendance`. */
export interface EventAttendance {
  readonly eventId: string;
  readonly sessionDate: string;
  readonly present: number;
  readonly expected: number;
  readonly importedRows: number;
  readonly rows: readonly EventAttendanceRow[];
}

interface EventListResponse {
  readonly items: readonly EventItem[];
}

export interface ListEventsOptions {
  readonly from: string;
  readonly to: string;
  /** The API caps the window at 100; the screens ask for one page of that size. */
  readonly limit?: number;
  /** The stable `(start_date, id)` page offset; omitted on the first page. */
  readonly offset?: number;
  readonly signal?: AbortSignal;
}

export const EVENTS_PATH = '/gateway/v1/events';
export const DEFAULT_EVENT_LIMIT = 100;

/** Builds the events list query in the order the API documents it. */
export function eventsListPath(options: ListEventsOptions): string {
  const params = new URLSearchParams();
  params.set('from', options.from);
  params.set('to', options.to);
  params.set('limit', String(options.limit ?? DEFAULT_EVENT_LIMIT));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  return `${EVENTS_PATH}?${params.toString()}`;
}

/** `GET /v1/events?from&to&limit`: the date-window list, sessions included. */
export async function listEvents(
  baseUrl: string,
  sessionToken: string,
  options: ListEventsOptions,
): Promise<EventItem[]> {
  const result = await gatewayRequest<EventListResponse>(baseUrl, eventsListPath(options), {
    sessionToken,
    signal: options.signal,
  });
  if (!result) throw new ApiError(500, 'The event list response was empty.');
  return [...(result.items ?? [])];
}

/** `GET /v1/events/:id`; the id is encoded for the path segment. */
export function eventDetailPath(eventId: string): string {
  return `${EVENTS_PATH}/${encodeURIComponent(eventId)}`;
}

export async function getEvent(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<EventDetail> {
  const result = await gatewayRequestWithMeta<EventItem>(baseUrl, eventDetailPath(eventId), {
    sessionToken,
    signal,
  });
  if (!result.data) throw new ApiError(500, 'The event response was empty.');
  return { event: result.data, etag: result.headers.get('ETag') };
}

/** `GET /v1/events/:id/attendance?date=YYYY-MM-DD`. */
export function eventAttendancePath(eventId: string, date: string): string {
  return `${eventDetailPath(eventId)}/attendance?date=${encodeURIComponent(date)}`;
}

export async function getEventAttendance(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  date: string,
  signal?: AbortSignal,
): Promise<EventAttendance> {
  const result = await gatewayRequest<EventAttendance>(
    baseUrl,
    eventAttendancePath(eventId, date),
    { sessionToken, signal },
  );
  if (!result) throw new ApiError(500, 'The event attendance response was empty.');
  return result;
}
