import { ApiError } from './errors';
import type { EventParentItem } from './events';
import { gatewayRequest } from './gateway';

/**
 * Wire types mirror `src/schemas/reference.ts` and the DTOs in
 * `src/repos/series.ts`. The detail response carries every schedule version and
 * exception; the UI never derives one from an RRULE locally (FR-43).
 */

export type SeriesExceptionKind = 'cancelled' | 'extra';

export interface ScheduleDto {
  readonly effectiveFrom: string;
  readonly rrule: string;
  readonly endsOn: string | null;
}

export interface SeriesExceptionDto {
  readonly date: string;
  readonly kind: SeriesExceptionKind;
  readonly note: string | null;
}

export interface SeriesDto {
  readonly id: string;
  readonly name: string;
  readonly ministry: { readonly code: string; readonly name: string } | null;
  readonly timezone: string;
  readonly description: string | null;
  readonly archivedAt: string | null;
  /** Presbyter-only series are hidden on member-facing surfaces and roster the presbyters. */
  readonly presbyterOnly: boolean;
  readonly schedules: readonly ScheduleDto[];
  readonly exceptions: readonly SeriesExceptionDto[];
}

export interface OccurrenceListDto {
  readonly seriesId: string;
  readonly from: string;
  readonly to: string;
  readonly dates: readonly string[];
}

/** Mirrors `seriesSummarySchema` (FR-6). */
export interface SeriesSummaryDto {
  readonly from: string;
  readonly to: string;
  readonly nextOccurrence: string | null;
  readonly attendance: {
    readonly memberSessions: {
      readonly held: number;
      readonly expected: number;
      readonly present: number;
      readonly rate: number | null;
    };
    readonly lastHeld: {
      readonly date: string;
      readonly expected: number;
      readonly present: number;
    } | null;
    readonly headcountSessions: { readonly held: number };
    readonly cancelled: number;
    readonly upcoming: number;
  };
  readonly offerings: {
    readonly attachedCount: number;
    readonly currency: string;
    readonly paidMinor: number;
    readonly pledgedMinor: number;
    readonly outstandingMinor: number;
    readonly countedMinor: number;
    readonly visitors: { readonly count: number; readonly paidMinor: number };
  };
}

export interface ListSeriesOptions {
  /** `GET /v1/series?includeArchived=true`; the API defaults to active only. */
  readonly includeArchived?: boolean;
  readonly signal?: AbortSignal;
}

export const SERIES_PATH = '/gateway/v1/series';

interface SeriesListResponse {
  readonly items: readonly SeriesDto[];
}

/** Builds the series list query in the order the API documents it. */
export function seriesListPath(options: Pick<ListSeriesOptions, 'includeArchived'> = {}): string {
  return options.includeArchived ? `${SERIES_PATH}?includeArchived=true` : SERIES_PATH;
}

/** `GET /v1/series`: every visible series, with its schedule versions and exceptions. */
export async function listSeries(
  baseUrl: string,
  sessionToken: string,
  options: ListSeriesOptions = {},
): Promise<SeriesDto[]> {
  const result = await gatewayRequest<SeriesListResponse>(baseUrl, seriesListPath(options), {
    sessionToken,
    signal: options.signal,
  });
  if (!result) throw new ApiError(500, 'The series list response was empty.');
  return [...(result.items ?? [])];
}

/** The detail path; the id is encoded as one path segment. */
export function seriesDetailPath(seriesId: string): string {
  return `${SERIES_PATH}/${encodeURIComponent(seriesId)}`;
}

/** The parent read's query; the series id is the event-parent id (FR-1/FR-6). */
export interface SeriesParentDetailQuery {
  readonly view: 'parent';
  readonly from: string;
  readonly to: string;
}

export function seriesParentPath(seriesId: string, query: SeriesParentDetailQuery): string {
  const params = new URLSearchParams();
  params.set('view', query.view);
  params.set('from', query.from);
  params.set('to', query.to);
  return `${seriesDetailPath(seriesId)}?${params.toString()}`;
}

/**
 * `GET /v1/series/:id?view=parent&from&to`: the same parent body the event
 * detail reads, served behind the series alias (FR-1: a series is the event
 * parent). The window is required; the response is `no-store`.
 */
export async function getSeriesParent(
  baseUrl: string,
  sessionToken: string,
  seriesId: string,
  options: { readonly from: string; readonly to: string; readonly signal?: AbortSignal },
): Promise<EventParentItem> {
  const result = await gatewayRequest<EventParentItem>(
    baseUrl,
    seriesParentPath(seriesId, { view: 'parent', from: options.from, to: options.to }),
    { sessionToken, signal: options.signal },
  );
  if (!result) throw new ApiError(500, 'The series parent response was empty.');
  return result;
}

export function seriesSummaryPath(seriesId: string, from: string, to: string): string {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  return `${seriesDetailPath(seriesId)}/summary?${params.toString()}`;
}

/**
 * `GET /v1/series/:id/summary?from&to`: one request for the window's attendance,
 * offering money and next occurrence (FR-6a). The UI never sums the events list.
 */
export async function getSeriesSummary(
  baseUrl: string,
  sessionToken: string,
  seriesId: string,
  options: { readonly from: string; readonly to: string; readonly signal?: AbortSignal },
): Promise<SeriesSummaryDto> {
  const result = await gatewayRequest<SeriesSummaryDto>(
    baseUrl,
    seriesSummaryPath(seriesId, options.from, options.to),
    { sessionToken, signal: options.signal },
  );
  if (!result) throw new ApiError(500, 'The series summary response was empty.');
  return result;
}

/** `GET /v1/series/:id`: the series with all schedule versions and exceptions. */
export async function getSeries(
  baseUrl: string,
  sessionToken: string,
  seriesId: string,
  signal?: AbortSignal,
): Promise<SeriesDto> {
  const result = await gatewayRequest<SeriesDto>(baseUrl, seriesDetailPath(seriesId), {
    sessionToken,
    signal,
  });
  if (!result) throw new ApiError(500, 'The series response was empty.');
  return result;
}

/**
 * The `/v1/series` routes retire: an event is the parent now and its recurrence
 * is read and written under the event. This module keeps only the reads the API
 * still serves during the transition; the UI makes no `/v1/series` write
 * (AC-65), so the create, update, schedule and exception writers are gone.
 */

export function seriesOccurrencesPath(seriesId: string, from: string, to: string): string {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  return `${seriesDetailPath(seriesId)}/occurrences?${params.toString()}`;
}

/**
 * `GET /v1/series/:id/occurrences?from&to`: the dates the series actually met.
 * The UI never expands the RRULE itself (FR-43).
 */
export async function getSeriesOccurrences(
  baseUrl: string,
  sessionToken: string,
  seriesId: string,
  options: { readonly from: string; readonly to: string; readonly signal?: AbortSignal },
): Promise<OccurrenceListDto> {
  const result = await gatewayRequest<OccurrenceListDto>(
    baseUrl,
    seriesOccurrencesPath(seriesId, options.from, options.to),
    { sessionToken, signal: options.signal },
  );
  if (!result) throw new ApiError(500, 'The occurrence list response was empty.');
  return result;
}
