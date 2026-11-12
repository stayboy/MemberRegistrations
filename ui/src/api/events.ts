import { ApiError } from './errors';
import { gatewayRequest, gatewayRequestWithMeta } from './gateway';
import type { Gender } from './members';

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
  /**
   * The latest capture of either channel, with the session's shared close state
   * (FR-4b). Null when the session has no capture.
   */
  readonly capture: { readonly asOf: string; readonly ended: boolean } | null;
  /** A non-empty reason when the session is cancelled; null on a legacy cancellation (FR-4a). */
  readonly note: string | null;
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

export interface OfferingTermsItem {
  readonly version: number;
  readonly name: string | null;
  readonly purpose: string;
  readonly kind: 'freewill' | 'tithe' | 'building' | 'missions' | 'other';
  readonly currency: string;
  readonly targetMinor: number | null;
  readonly defaultAmountMinor: number | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly availableUntil: string | null;
  readonly scripture: string | null;
  readonly gatewayAccount: string | null;
  readonly gatewayMetadata: Readonly<Record<string, string>> | null;
  /** Audit (NFR-3): who published this version, when, and why. */
  readonly createdAt: string;
  readonly createdBy: string;
  /** Null for version 1; required on every later version. */
  readonly reason: string | null;
}

export interface EventOfferingItem {
  readonly offeringId: string;
  /** Resolved by the API; the UI must not compose the display name. */
  readonly name: string;
  /** The effective expiry: attachment date, else terms date, else event end. */
  readonly availableUntil: string | null;
  readonly expired: boolean;
  readonly terms: OfferingTermsItem;
  readonly exceptions: readonly {
    readonly date: string;
    readonly kind: 'skip' | 'opt_in';
    readonly note: string | null;
  }[];
  readonly stats: EventOfferingStatsItem;
}

/** Mirrors `EventItem`; offerings are resolved in the same request. */
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
  /** False = headcount-only; per-member attendance does not apply. */
  readonly tracksMembers: boolean;
  /** Presbyter-only events are hidden from non-presbyters and roster the presbyters. */
  readonly presbyterOnly: boolean;
  readonly sessions: readonly EventSessionItem[];
  readonly offerings: readonly EventOfferingItem[];
  readonly stats: EventOfferingStatsItem;
}

export interface EventListItem {
  readonly id: string;
  /** Null for a series-minted instance that has not been numbered yet. */
  readonly eventNo: string | null;
  readonly name: string;
  /** Null for a standalone event; attendance imports require a series-backed event. */
  readonly seriesId: string | null;
  readonly startDate: string;
  /** The event's IANA zone: the session window and capture times use it. */
  readonly timezone: string;
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
  /** The `attendance.id` the row delete accepts, not the member id. */
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
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
  /** Limits the list to one series; the series occurrence link seeds it (FR-43). */
  readonly seriesId?: string;
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
  if (options.seriesId) params.set('seriesId', options.seriesId);
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

/** `DELETE /v1/events/:id/attendance/:attendanceId`; 204 on success. */
export function eventAttendanceRowPath(eventId: string, attendanceId: string): string {
  return `${eventDetailPath(eventId)}/attendance/${encodeURIComponent(attendanceId)}`;
}

export async function deleteEventAttendance(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  attendanceId: string,
): Promise<void> {
  await gatewayRequest(baseUrl, eventAttendanceRowPath(eventId, attendanceId), {
    method: 'DELETE',
    sessionToken,
  });
}

/** Mirrors `EventAttendanceEntry`; a manual clock-in creates one row. */
export interface EventAttendanceEntry {
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly sessionDate: string;
  readonly source: 'import' | 'manual';
}

/** `POST /v1/events/:id/attendance` with a member number and the session date. */
export async function addEventAttendance(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: { readonly memberNo: string; readonly date: string },
): Promise<EventAttendanceEntry> {
  const entry = await gatewayRequest<EventAttendanceEntry>(
    baseUrl,
    `${eventDetailPath(eventId)}/attendance`,
    { method: 'POST', body: input, sessionToken },
  );
  if (!entry) throw new ApiError(500, 'The attendance entry response was empty.');
  return entry;
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
