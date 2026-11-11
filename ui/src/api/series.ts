import { ApiError } from './errors';
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

export interface AddScheduleVersionInput {
  readonly effectiveFrom: string;
  readonly rrule: string;
  readonly endsOn?: string | null;
}

/** Mirrors `scheduleInputSchema`; the create series body carries this object. */
export interface SeriesScheduleInput {
  readonly effectiveFrom: string;
  readonly rrule: string;
  readonly endsOn?: string | null;
}

/** Mirrors `createSeriesSchema` (FR-42). */
export interface CreateSeriesInput {
  readonly name: string;
  readonly ministryCode?: string | null;
  readonly timezone?: string;
  readonly description?: string | null;
  readonly schedule: SeriesScheduleInput;
}

/** Mirrors `updateSeriesSchema`; schedule versions are appended, never edited here. */
export interface UpdateSeriesInput {
  readonly name?: string;
  readonly ministryCode?: string | null;
  readonly timezone?: string;
  readonly description?: string | null;
  readonly archived?: boolean;
}

export interface SetSeriesExceptionInput {
  readonly date: string;
  readonly kind: SeriesExceptionKind;
  readonly note?: string | null;
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
 * `POST /v1/series`: creates the series and its first schedule version in one
 * transaction. The API answers `201` with the new detail DTO (FR-42).
 */
export async function createSeries(
  baseUrl: string,
  sessionToken: string,
  input: CreateSeriesInput,
): Promise<SeriesDto> {
  const result = await gatewayRequest<SeriesDto>(baseUrl, SERIES_PATH, {
    method: 'POST',
    sessionToken,
    body: {
      name: input.name,
      ministryCode: input.ministryCode ?? null,
      timezone: input.timezone,
      description: input.description ?? null,
      schedule: {
        effectiveFrom: input.schedule.effectiveFrom,
        rrule: input.schedule.rrule,
        endsOn: input.schedule.endsOn ?? null,
      },
    },
  });
  if (!result) throw new ApiError(500, 'The created series response was empty.');
  return result;
}

/**
 * `PUT /v1/series/:id`: identity fields and the archive flag. Schedule versions
 * and exceptions have their own append-only routes (FR-42).
 */
export async function updateSeries(
  baseUrl: string,
  sessionToken: string,
  seriesId: string,
  input: UpdateSeriesInput,
): Promise<SeriesDto> {
  const result = await gatewayRequest<SeriesDto>(baseUrl, seriesDetailPath(seriesId), {
    method: 'PUT',
    sessionToken,
    body: {
      name: input.name,
      ministryCode: input.ministryCode,
      timezone: input.timezone,
      description: input.description,
      archived: input.archived,
    },
  });
  if (!result) throw new ApiError(500, 'The updated series response was empty.');
  return result;
}

export function seriesSchedulePath(seriesId: string): string {
  return `${seriesDetailPath(seriesId)}/schedule`;
}

/** `POST /v1/series/:id/schedule`: appends a version and returns the series. */
export async function addScheduleVersion(
  baseUrl: string,
  sessionToken: string,
  seriesId: string,
  input: AddScheduleVersionInput,
): Promise<SeriesDto> {
  const result = await gatewayRequest<SeriesDto>(baseUrl, seriesSchedulePath(seriesId), {
    method: 'POST',
    sessionToken,
    body: {
      effectiveFrom: input.effectiveFrom,
      rrule: input.rrule,
      endsOn: input.endsOn ?? null,
    },
  });
  if (!result) throw new ApiError(500, 'The schedule version response was empty.');
  return result;
}

export function seriesExceptionsPath(seriesId: string): string {
  return `${seriesDetailPath(seriesId)}/exceptions`;
}

/** The remove path; the date is a UTC calendar date, encoded as one segment. */
export function seriesExceptionPath(seriesId: string, date: string): string {
  return `${seriesExceptionsPath(seriesId)}/${encodeURIComponent(date)}`;
}

/** `POST /v1/series/:id/exceptions`: sets one date's cancelled/extra exception. */
export async function setSeriesException(
  baseUrl: string,
  sessionToken: string,
  seriesId: string,
  input: SetSeriesExceptionInput,
): Promise<SeriesDto> {
  const result = await gatewayRequest<SeriesDto>(baseUrl, seriesExceptionsPath(seriesId), {
    method: 'POST',
    sessionToken,
    body: {
      date: input.date,
      kind: input.kind,
      note: input.note ?? null,
    },
  });
  if (!result) throw new ApiError(500, 'The series exception response was empty.');
  return result;
}

/** `DELETE /v1/series/:id/exceptions/:date`: 204 with no body. */
export async function removeSeriesException(
  baseUrl: string,
  sessionToken: string,
  seriesId: string,
  date: string,
): Promise<void> {
  await gatewayRequest(baseUrl, seriesExceptionPath(seriesId, date), {
    method: 'DELETE',
    sessionToken,
  });
}

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
