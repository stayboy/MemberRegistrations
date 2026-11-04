import { ApiError } from './errors';
import { gatewayRequest } from './gateway';

/**
 * The subset of the event list contract the attendance import picker needs. The
 * API returns the full event DTO (offerings, stats, venue); the picker reads only
 * these fields and never issues a second request for sessions (FR-36a).
 */

export type EventStatus = 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
export type EventSessionStatus = 'scheduled' | 'held' | 'cancelled';
export type EventVenueType = 'auditorium' | 'virtual' | 'hybrid';

export interface EventSessionSummary {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly status: EventSessionStatus;
  readonly venueType?: EventVenueType;
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

interface EventListResponse {
  readonly items: readonly EventListItem[];
}

export interface ListEventsOptions {
  readonly from: string;
  readonly to: string;
  /** The API caps the window at 100; the picker asks for the whole window. */
  readonly limit?: number;
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
  return `${EVENTS_PATH}?${params.toString()}`;
}

/** `GET /v1/events?from&to&limit`: the date-window list, sessions included. */
export async function listEvents(
  baseUrl: string,
  sessionToken: string,
  options: ListEventsOptions,
): Promise<EventListItem[]> {
  const result = await gatewayRequest<EventListResponse>(baseUrl, eventsListPath(options), {
    sessionToken,
    signal: options.signal,
  });
  if (!result) throw new ApiError(500, 'The event list response was empty.');
  return [...(result.items ?? [])];
}
