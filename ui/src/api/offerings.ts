import { ApiError } from './errors';
import { gatewayRequest } from './gateway';
import type { OfferingTermsItem } from './events';

/**
 * Wire types mirror `src/schemas/offerings.ts` and `src/schemas/pledges.ts`.
 * The landing makes one summary request and reuses the pledges list for the
 * worklist; the terms dialog reads the existing terms route.
 */

export const OFFERINGS_PATH = '/gateway/v1/offerings';
export const PLEDGES_PATH = '/gateway/v1/pledges';

/** `ChurchOfferingSummary`; money is integer minor units in `currency`. */
export interface OfferingSummaryMember {
  readonly memberNo: string;
  readonly name: string;
  readonly paidMinor: number;
  readonly pledgedMinor: number;
  readonly outstandingMinor: number;
  readonly lastGivenOn: string | null;
}

export interface OfferingSummaryGroup {
  readonly offeringId: string;
  readonly name: string;
  readonly paidMinor: number;
  readonly pledgedMinor: number;
  readonly outstandingMinor: number;
  readonly countedMinor: number;
}

export interface OfferingSummaryEvent {
  readonly eventId: string;
  readonly name: string;
  readonly paidMinor: number;
  readonly pledgedMinor: number;
  readonly outstandingMinor: number;
  readonly countedMinor: number;
}

export interface OfferingSummaryPledgeCounts {
  readonly pending: number;
  readonly honored: number;
  readonly dishonored: number;
  readonly overdue: number;
}

export interface ChurchOfferingSummary {
  readonly from: string;
  readonly to: string;
  readonly currency: string;
  readonly totalPaidMinor: number;
  readonly totalPledgedMinor: number;
  readonly totalOutstandingMinor: number;
  /** Counted cash in the window (phase 5), reporting currency only. */
  readonly countedMinor: number;
  /** countedMinor − (totalPaidMinor + visitors.paidMinor); never added to the gifts. */
  readonly varianceMinor: number;
  readonly visitors: {
    readonly count: number;
    readonly paidMinor: number;
  };
  readonly members: readonly OfferingSummaryMember[];
  readonly offerings: readonly OfferingSummaryGroup[];
  readonly events: readonly OfferingSummaryEvent[];
  readonly pledges: OfferingSummaryPledgeCounts;
}

export type PledgeStatus = 'pending' | 'honored' | 'dishonored' | 'overdue';

/** The pledge worklist row; names are resolved by the API (R5). */
export interface PledgeItem {
  readonly id: string;
  readonly memberNo: string;
  readonly memberName: string;
  readonly offeringId: string;
  readonly offeringName: string;
  readonly eventId: string;
  readonly sessionDate: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly expectedOn: string;
  readonly followUpOfficerMemberNo: string;
  readonly officerName: string;
  readonly status: PledgeStatus;
  readonly reason: string | null;
  readonly nextReminder: string | null;
  readonly settledContributionId: string | null;
  readonly termsVersion: number;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

interface PledgeListResponse {
  readonly items: readonly PledgeItem[];
  readonly nextCursor?: string;
}

interface OfferingTermsListResponse {
  readonly items: readonly OfferingTermsItem[];
}

export interface ListPledgesOptions {
  /** Newest first; the route caps the page at 200 and defaults to 50. */
  readonly limit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export function offeringsSummaryPath(from: string, to: string): string {
  const params = new URLSearchParams({ from, to });
  return `${OFFERINGS_PATH}/summary?${params.toString()}`;
}

/** `GET /v1/offerings/summary?from&to`: the landing's one aggregate. */
export async function getOfferingsSummary(
  baseUrl: string,
  sessionToken: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<ChurchOfferingSummary> {
  const summary = await gatewayRequest<ChurchOfferingSummary>(
    baseUrl,
    offeringsSummaryPath(from, to),
    { sessionToken, signal },
  );
  if (!summary) throw new ApiError(500, 'The offerings summary response was empty.');
  return summary;
}

export function pledgesPath(options: ListPledgesOptions = {}): string {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', options.cursor);
  const query = params.toString();
  return query ? `${PLEDGES_PATH}?${query}` : PLEDGES_PATH;
}

/** `GET /v1/pledges`: unwindowed, newest first, limit-bounded (R3). */
export async function listPledges(
  baseUrl: string,
  sessionToken: string,
  options: ListPledgesOptions = {},
): Promise<PledgeItem[]> {
  const page = await gatewayRequest<PledgeListResponse>(baseUrl, pledgesPath(options), {
    sessionToken,
    signal: options.signal,
  });
  if (!page) throw new ApiError(500, 'The pledge list response was empty.');
  return [...(page.items ?? [])];
}

/** `POST /v1/pledges/:id/reassign` with the existing officer and a reason. */
export async function reassignPledge(
  baseUrl: string,
  sessionToken: string,
  pledgeId: string,
  officerMemberNo: string,
  reason: string,
): Promise<PledgeItem> {
  const pledge = await gatewayRequest<PledgeItem>(
    baseUrl,
    `${PLEDGES_PATH}/${encodeURIComponent(pledgeId)}/reassign`,
    {
      method: 'POST',
      body: { officerMemberNo, reason: reason.trim() },
      sessionToken,
    },
  );
  if (!pledge) throw new ApiError(500, 'The pledge reassignment response was empty.');
  return pledge;
}

/** `GET /v1/offerings/:id/terms`: newest version first. */
export async function listOfferingTerms(
  baseUrl: string,
  sessionToken: string,
  offeringId: string,
  signal?: AbortSignal,
): Promise<OfferingTermsItem[]> {
  const page = await gatewayRequest<OfferingTermsListResponse>(
    baseUrl,
    `${OFFERINGS_PATH}/${encodeURIComponent(offeringId)}/terms`,
    { sessionToken, signal },
  );
  if (!page) throw new ApiError(500, 'The offering terms response was empty.');
  return [...(page.items ?? [])];
}
