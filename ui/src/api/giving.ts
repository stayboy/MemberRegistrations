import { ApiError } from './errors';
import { gatewayRequest } from './gateway';
import type { PledgeItem } from './offerings';

/**
 * The MVP member-announced giving forms reuse the existing contribution and
 * pledge routes. Nothing here is cash-count money: the operator records an
 * announced gift (`channel: manual`) or a member pledge, and both keep the
 * existing wire contracts. The browser sends a member number only, never a
 * contact value.
 */

export const CONTRIBUTIONS_PATH = '/gateway/v1/contributions';
export const PLEDGES_PATH = '/gateway/v1/pledges';

export interface ContributionItem {
  readonly id: string;
  readonly memberNo: string | null;
  readonly visitorName: string | null;
  readonly offeringId: string;
  readonly eventId: string;
  readonly sessionDate: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly channel: 'app' | 'ussd' | 'manual';
  readonly status: 'initiated' | 'paid' | 'failed';
  readonly reference: string;
  readonly idempotencyKey: string;
  readonly termsVersion: number;
  readonly createdAt: string;
}

export interface ManualContributionInput {
  readonly memberNo: string;
  readonly offeringId: string;
  readonly eventId: string;
  readonly sessionDate: string;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
}

/** `POST /v1/contributions` with `channel: manual`; a paid gift by default. */
export async function recordManualContribution(
  baseUrl: string,
  sessionToken: string,
  input: ManualContributionInput,
): Promise<ContributionItem> {
  const row = await gatewayRequest<ContributionItem>(baseUrl, CONTRIBUTIONS_PATH, {
    method: 'POST',
    body: { ...input, channel: 'manual' },
    sessionToken,
  });
  if (!row) throw new ApiError(500, 'The recorded contribution response was empty.');
  return row;
}

export interface PledgeInput {
  readonly memberNo: string;
  readonly offeringId: string;
  readonly eventId: string;
  readonly sessionDate?: string;
  readonly amountMinor: number;
  readonly expectedOn: string;
  readonly followUpOfficerMemberNo?: string;
  readonly idempotencyKey: string;
}

/** `GET /v1/contributions` scoped to one event, offering and session date. */
export interface ContributionListOptions {
  readonly eventId: string;
  readonly offeringId: string;
  readonly from: string;
  readonly to: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export function contributionsPath(options: ContributionListOptions): string {
  const params = new URLSearchParams({
    eventId: options.eventId,
    offeringId: options.offeringId,
    from: options.from,
    to: options.to,
  });
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  return `${CONTRIBUTIONS_PATH}?${params.toString()}`;
}

/** The session-scoped offertories list; the route is no-store and newest first. */
export async function listContributions(
  baseUrl: string,
  sessionToken: string,
  options: ContributionListOptions,
): Promise<ContributionItem[]> {
  const page = await gatewayRequest<{ items: ContributionItem[] }>(
    baseUrl,
    contributionsPath(options),
    { sessionToken, signal: options.signal },
  );
  if (!page) throw new ApiError(500, 'The contribution list response was empty.');
  return [...(page.items ?? [])];
}

/** `POST /v1/pledges`; the follow-up officer defaults to the shepherd. */
export async function recordPledge(
  baseUrl: string,
  sessionToken: string,
  input: PledgeInput,
): Promise<PledgeItem> {
  const row = await gatewayRequest<PledgeItem>(baseUrl, PLEDGES_PATH, {
    method: 'POST',
    body: input,
    sessionToken,
  });
  if (!row) throw new ApiError(500, 'The recorded pledge response was empty.');
  return row;
}
