import { ApiError } from './errors';
import { eventDetailPath } from './events';
import { gatewayRequest } from './gateway';

/**
 * Wire types mirror `src/schemas/offering-counts.ts`. A count is one event +
 * offering + session observation of denomination lines; a correction supersedes
 * the current row and keeps its `asOf`. The list is the only read target.
 */

export interface OfferingCountLine {
  readonly denominationMinor: number;
  readonly pieces: number;
}

export interface OfferingCount {
  readonly id: string;
  readonly eventId: string;
  readonly offeringId: string;
  readonly sessionDate: string;
  readonly asOf: string;
  readonly currency: string;
  readonly termsVersion: number;
  readonly lines: readonly OfferingCountLine[];
  readonly totalMinor: number;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly supersedesId: string | null;
  readonly supersededBy: string | null;
}

export interface OfferingCountList {
  readonly current: OfferingCount | null;
  /** Newest first; includes the current row and the superseded history. */
  readonly observations: readonly OfferingCount[];
}

export interface OfferingCountInput {
  readonly sessionDate: string;
  readonly offeringId: string;
  readonly currency?: string;
  readonly lines: readonly OfferingCountLine[];
  readonly asOf?: string;
  readonly supersedesId?: string;
}

export function offeringCountsPath(
  eventId: string,
  sessionDate: string,
  offeringId: string,
): string {
  const params = new URLSearchParams({ sessionDate, offeringId });
  return `${eventDetailPath(eventId)}/offering-counts?${params.toString()}`;
}

/** `GET /v1/events/:eventId/offering-counts?sessionDate&offeringId`. */
export async function getOfferingCounts(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  sessionDate: string,
  offeringId: string,
  signal?: AbortSignal,
): Promise<OfferingCountList> {
  const page = await gatewayRequest<OfferingCountList>(
    baseUrl,
    offeringCountsPath(eventId, sessionDate, offeringId),
    { sessionToken, signal },
  );
  if (!page) throw new ApiError(500, 'The offering count response was empty.');
  return page;
}

/** `POST /v1/events/:eventId/offering-counts`; a correction carries `supersedesId`. */
export async function recordOfferingCount(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: OfferingCountInput,
): Promise<OfferingCount> {
  const row = await gatewayRequest<OfferingCount>(
    baseUrl,
    `${eventDetailPath(eventId)}/offering-counts`,
    { method: 'POST', body: input, sessionToken },
  );
  if (!row) throw new ApiError(500, 'The recorded offering count response was empty.');
  return row;
}
