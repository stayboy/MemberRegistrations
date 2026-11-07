import { ApiError } from './errors';
import { gatewayRequest } from './gateway';
import type { Gender } from './members';

/**
 * Welfare products, member subscriptions and claims. Wire types mirror
 * `src/schemas/subscription-products.ts` and `src/schemas/subscriptions.ts`;
 * every function maps to a route that already exists.
 */

export const PAYMENT_MODES = ['member', 'church', 'either'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const COVERS = ['individual', 'household'] as const;
export type Covers = (typeof COVERS)[number];

export const PERIOD_MONTHS = [1, 2, 3, 6, 12] as const;
export type PeriodMonths = (typeof PERIOD_MONTHS)[number];

export const RELATIONSHIP_TYPES = ['spouse', 'child', 'parent', 'guardian', 'other'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export interface WelfareProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly premiumMinor: number;
  readonly currency: string;
  readonly active: boolean;
  readonly paymentMode: PaymentMode;
  readonly periodMonths: PeriodMonths;
  readonly covers: Covers;
  readonly maxDependents: number;
  readonly allowedRelationships: readonly RelationshipType[];
  readonly minMembershipDays: number;
  readonly requiresCard: boolean;
  readonly requiresVerified: boolean;
  readonly gender: Gender | null;
  readonly minAge: number | null;
  readonly maxAge: number | null;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly updatedAt: string | null;
  readonly createdAt: string;
}

export interface CreateWelfareProductInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly premiumMinor: number;
  readonly currency: string;
  readonly active?: boolean;
  readonly minMembershipDays?: number;
  readonly requiresCard?: boolean;
  readonly requiresVerified?: boolean;
  readonly gender?: Gender | null;
  readonly minAge?: number | null;
  readonly maxAge?: number | null;
  readonly paymentMode: PaymentMode;
  readonly periodMonths: PeriodMonths;
  readonly covers: Covers;
  readonly maxDependents?: number;
  readonly allowedRelationships?: readonly RelationshipType[];
}

interface ProductListResponse {
  readonly items: readonly WelfareProduct[];
}

export async function listWelfareProducts(
  baseUrl: string,
  sessionToken: string,
  includeInactive = true,
  signal?: AbortSignal,
): Promise<WelfareProduct[]> {
  const page = await gatewayRequest<ProductListResponse>(
    baseUrl,
    `/gateway/v1/subscription-products?includeInactive=${includeInactive ? 'true' : 'false'}`,
    { sessionToken, signal },
  );
  if (!page) throw new ApiError(500, 'The welfare product list response was empty.');
  return [...(page.items ?? [])];
}

/** `POST /v1/subscription-products`; pricing and eligibility are create-only. */
export async function createWelfareProduct(
  baseUrl: string,
  sessionToken: string,
  input: CreateWelfareProductInput,
): Promise<WelfareProduct> {
  const product = await gatewayRequest<WelfareProduct>(
    baseUrl,
    '/gateway/v1/subscription-products',
    {
      method: 'POST',
      body: input,
      sessionToken,
    },
  );
  if (!product) throw new ApiError(500, 'The created welfare product response was empty.');
  return product;
}

/** `PUT /v1/subscription-products/:code`; the only mutable field is `active`. */
export async function setWelfareProductActive(
  baseUrl: string,
  sessionToken: string,
  code: string,
  active: boolean,
): Promise<WelfareProduct> {
  const product = await gatewayRequest<WelfareProduct>(
    baseUrl,
    `/gateway/v1/subscription-products/${encodeURIComponent(code)}`,
    { method: 'PUT', body: { active }, sessionToken },
  );
  if (!product) throw new ApiError(500, 'The updated welfare product response was empty.');
  return product;
}

export const CLAIM_STATUSES = ['pending', 'approved', 'rejected', 'paid'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_DECISIONS = ['approved', 'rejected', 'paid'] as const;
export type ClaimDecision = (typeof CLAIM_DECISIONS)[number];

export interface WelfareClaim {
  readonly id: string;
  readonly subscriptionId: string;
  readonly memberNo: string;
  readonly memberName: string;
  readonly amountMinor: number;
  readonly reason: string;
  readonly status: ClaimStatus;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly decisionNote: string | null;
  readonly createdAt: string;
}

/** The owned + inherited row from `GET /v1/members/:memberNo/subscriptions`. */
export interface WelfareSubscription {
  readonly id: string;
  readonly source: 'owned' | 'inherited';
  readonly role: 'policyholder' | 'covered';
  readonly status: 'active' | 'expired' | 'ended';
  readonly kind: string | null;
  readonly productCode: string | null;
  readonly productName: string | null;
  readonly paidBy: 'member' | 'church' | null;
  readonly premiumMinor: number | null;
  readonly currency: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly startedOn: string;
  readonly endedOn: string | null;
  readonly scope: Covers;
  readonly coveredMemberNos: readonly string[];
  readonly claimedTotalMinor: number;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly updatedAt: string;
  readonly policyholder: {
    readonly memberNo: string;
    readonly name: string;
    readonly gender: Gender;
    readonly age: number | null;
  } | null;
  readonly relationship: RelationshipType | null;
}

interface SubscriptionListResponse {
  readonly items: readonly WelfareSubscription[];
}

export async function listMemberWelfareSubscriptions(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  signal?: AbortSignal,
): Promise<WelfareSubscription[]> {
  const page = await gatewayRequest<SubscriptionListResponse>(
    baseUrl,
    `/gateway/v1/members/${encodeURIComponent(memberNo)}/subscriptions`,
    { sessionToken, signal },
  );
  if (!page) throw new ApiError(500, 'The subscription list response was empty.');
  return [...(page.items ?? [])];
}

interface ClaimListResponse {
  readonly items: readonly WelfareClaim[];
}

export function claimsPath(subscriptionId: string): string {
  return `/gateway/v1/subscriptions/${encodeURIComponent(subscriptionId)}/claims`;
}

/** `GET /v1/subscriptions/:subscriptionId/claims`. */
export async function listClaims(
  baseUrl: string,
  sessionToken: string,
  subscriptionId: string,
  signal?: AbortSignal,
): Promise<WelfareClaim[]> {
  const page = await gatewayRequest<ClaimListResponse>(baseUrl, claimsPath(subscriptionId), {
    sessionToken,
    signal,
  });
  if (!page) throw new ApiError(500, 'The claim list response was empty.');
  return [...(page.items ?? [])];
}

/** `POST /v1/subscriptions/:subscriptionId/claims` with an amount and reason. */
export async function recordClaim(
  baseUrl: string,
  sessionToken: string,
  subscriptionId: string,
  input: { readonly memberNo: string; readonly amountMinor: number; readonly reason: string },
): Promise<WelfareClaim> {
  const claim = await gatewayRequest<WelfareClaim>(baseUrl, claimsPath(subscriptionId), {
    method: 'POST',
    body: input,
    sessionToken,
  });
  if (!claim) throw new ApiError(500, 'The recorded claim response was empty.');
  return claim;
}

/** `POST /v1/subscriptions/:subscriptionId/claims/:claimId/decide`. */
export async function decideClaim(
  baseUrl: string,
  sessionToken: string,
  subscriptionId: string,
  claimId: string,
  input: { readonly status: ClaimDecision; readonly note?: string },
): Promise<WelfareClaim> {
  const claim = await gatewayRequest<WelfareClaim>(
    baseUrl,
    `${claimsPath(subscriptionId)}/${encodeURIComponent(claimId)}/decide`,
    { method: 'POST', body: input, sessionToken },
  );
  if (!claim) throw new ApiError(500, 'The decided claim response was empty.');
  return claim;
}
