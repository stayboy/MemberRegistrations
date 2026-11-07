import { ApiError } from './errors';
import { eventDetailPath } from './events';
import { gatewayRequest } from './gateway';

/**
 * The USSD portal surfaces. Every read and write here is an existing route:
 * codes (`src/routes/attendance-codes.ts`), registration requests
 * (`src/routes/registration-requests.ts`), headcounts and delegations
 * (`src/routes/events.ts`), and the dev-only simulator entry
 * (`src/routes/dev-ussd.ts`). Nothing in this module invents an endpoint.
 */

export const CODE_PURPOSES = ['attendance_punch', 'registration'] as const;
export type CodePurpose = (typeof CODE_PURPOSES)[number];

export const CODE_STATUSES = ['active', 'used', 'expired', 'voided'] as const;
export type CodeStatus = (typeof CODE_STATUSES)[number];

export interface IssuedCode {
  readonly id: string;
  readonly code: string;
  readonly purpose: CodePurpose;
  readonly sessionDate: string;
  readonly expiresAt: string;
}

export interface CodeItem {
  readonly id: string;
  readonly purpose: CodePurpose;
  readonly sessionDate: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly status: CodeStatus;
  readonly usedAt: string | null;
  readonly usedByMemberNo: string | null;
  readonly voidedAt: string | null;
}

interface CodeListResponse {
  readonly items: readonly CodeItem[];
}

export function codesPath(eventId: string, sessionDate: string, status?: CodeStatus): string {
  const params = new URLSearchParams({ sessionDate });
  if (status) params.set('status', status);
  return `${eventDetailPath(eventId)}/codes?${params.toString()}`;
}

export function issueCodePath(eventId: string): string {
  return `${eventDetailPath(eventId)}/codes`;
}

export function voidCodePath(codeId: string): string {
  return `/gateway/v1/codes/${encodeURIComponent(codeId)}/void`;
}

/** `GET /v1/events/:eventId/codes?sessionDate[&status]`. */
export async function listCodes(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  sessionDate: string,
  status?: CodeStatus,
  signal?: AbortSignal,
): Promise<CodeItem[]> {
  const page = await gatewayRequest<CodeListResponse>(
    baseUrl,
    codesPath(eventId, sessionDate, status),
    { sessionToken, signal },
  );
  if (!page) throw new ApiError(500, 'The code list response was empty.');
  return [...(page.items ?? [])];
}

/** `POST /v1/events/:eventId/codes`; the plain code is returned once. */
export async function issueCode(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: { readonly purpose: CodePurpose; readonly sessionDate: string },
): Promise<IssuedCode> {
  const issued = await gatewayRequest<IssuedCode>(baseUrl, issueCodePath(eventId), {
    method: 'POST',
    body: input,
    sessionToken,
  });
  if (!issued) throw new ApiError(500, 'The issued code response was empty.');
  return issued;
}

/** `POST /v1/codes/:id/void`; the reason is optional in the API, offered here. */
export async function voidCode(
  baseUrl: string,
  sessionToken: string,
  codeId: string,
  reason: string,
): Promise<CodeItem> {
  const voided = await gatewayRequest<CodeItem>(baseUrl, voidCodePath(codeId), {
    method: 'POST',
    body: { reason: reason.trim() || null },
    sessionToken,
  });
  if (!voided) throw new ApiError(500, 'The voided code response was empty.');
  return voided;
}

export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export interface RegistrationRequest {
  readonly id: string;
  readonly reference: string;
  readonly firstName: string;
  readonly lastName: string;
  /** One-way phone hash; the raw phone is never returned. */
  readonly phoneHash: string;
  readonly eventId: string;
  readonly sessionDate: string;
  readonly status: RegistrationStatus;
  readonly createdAt: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly memberNo: string | null;
}

interface RegistrationListResponse {
  readonly items: readonly RegistrationRequest[];
}

export function registrationRequestsPath(
  query: {
    readonly status?: RegistrationStatus;
    readonly eventId?: string;
    readonly sessionDate?: string;
  } = {},
): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.eventId) params.set('eventId', query.eventId);
  if (query.sessionDate) params.set('sessionDate', query.sessionDate);
  const suffix = params.toString();
  return `/gateway/v1/registration-requests${suffix ? `?${suffix}` : ''}`;
}

export function registrationDecisionPath(id: string, decision: 'approve' | 'reject'): string {
  return `/gateway/v1/registration-requests/${encodeURIComponent(id)}/${decision}`;
}

/** `GET /v1/registration-requests?status=…`. */
export async function listRegistrationRequests(
  baseUrl: string,
  sessionToken: string,
  query: {
    readonly status?: RegistrationStatus;
    readonly eventId?: string;
    readonly sessionDate?: string;
  } = {},
  signal?: AbortSignal,
): Promise<RegistrationRequest[]> {
  const page = await gatewayRequest<RegistrationListResponse>(
    baseUrl,
    registrationRequestsPath(query),
    { sessionToken, signal },
  );
  if (!page) throw new ApiError(500, 'The registration request list response was empty.');
  return [...(page.items ?? [])];
}

/** `POST /v1/registration-requests/:id/approve` with the immutable member number. */
export async function approveRegistrationRequest(
  baseUrl: string,
  sessionToken: string,
  id: string,
  memberNo: string,
): Promise<RegistrationRequest> {
  const item = await gatewayRequest<RegistrationRequest>(
    baseUrl,
    registrationDecisionPath(id, 'approve'),
    { method: 'POST', body: { memberNo: memberNo.trim() }, sessionToken },
  );
  if (!item) throw new ApiError(500, 'The approved registration response was empty.');
  return item;
}

/** `POST /v1/registration-requests/:id/reject` with the required reason. */
export async function rejectRegistrationRequest(
  baseUrl: string,
  sessionToken: string,
  id: string,
  reason: string,
): Promise<RegistrationRequest> {
  const item = await gatewayRequest<RegistrationRequest>(
    baseUrl,
    registrationDecisionPath(id, 'reject'),
    { method: 'POST', body: { reason: reason.trim() }, sessionToken },
  );
  if (!item) throw new ApiError(500, 'The rejected registration response was empty.');
  return item;
}

export const HEADCOUNT_MODES = ['adults', 'children', 'mixed'] as const;
export type HeadcountMode = (typeof HEADCOUNT_MODES)[number];

export interface Headcount {
  readonly id: string;
  readonly eventId: string;
  readonly sessionDate: string;
  readonly asOf: string;
  readonly mode: HeadcountMode;
  readonly adultMale: number;
  readonly adultFemale: number;
  readonly adultUnspecified: number;
  readonly childMale: number;
  readonly childFemale: number;
  readonly childUnspecified: number;
  readonly total: number;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly supersedesId: string | null;
  readonly supersededBy: string | null;
}

export interface HeadcountPage {
  readonly sessionDate: string;
  readonly current: Headcount | null;
  readonly observations: readonly Headcount[];
}

export interface HeadcountInput {
  readonly sessionDate: string;
  readonly mode: HeadcountMode;
  readonly adultMale: number;
  readonly adultFemale: number;
  readonly adultUnspecified: number;
  readonly childMale: number;
  readonly childFemale: number;
  readonly childUnspecified: number;
  readonly asOf?: string;
  readonly supersedesId?: string;
}

export function headcountsPath(eventId: string, sessionDate: string): string {
  return `${eventDetailPath(eventId)}/headcounts?sessionDate=${encodeURIComponent(sessionDate)}`;
}

/** `GET /v1/events/:eventId/headcounts?sessionDate`: current and observations. */
export async function getHeadcounts(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  sessionDate: string,
  signal?: AbortSignal,
): Promise<HeadcountPage> {
  const page = await gatewayRequest<HeadcountPage>(baseUrl, headcountsPath(eventId, sessionDate), {
    sessionToken,
    signal,
  });
  if (!page) throw new ApiError(500, 'The headcount response was empty.');
  return page;
}

/** `POST /v1/events/:eventId/headcounts`; a correction carries `supersedesId`. */
export async function recordHeadcount(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  input: HeadcountInput,
): Promise<Headcount> {
  const row = await gatewayRequest<Headcount>(baseUrl, `${eventDetailPath(eventId)}/headcounts`, {
    method: 'POST',
    body: input,
    sessionToken,
  });
  if (!row) throw new ApiError(500, 'The recorded headcount response was empty.');
  return row;
}

export interface Delegation {
  readonly id: string;
  readonly fromMemberNo: string;
  readonly fromName: string;
  readonly toMemberNo: string;
  readonly toName: string;
  readonly reason: string;
  readonly createdAt: string;
}

interface DelegationListResponse {
  readonly items: readonly Delegation[];
}

export function delegationsPath(eventId: string, sessionDate: string): string {
  return `${eventDetailPath(eventId)}/delegations?sessionDate=${encodeURIComponent(sessionDate)}`;
}

/** `GET /v1/events/:eventId/delegations?sessionDate`. */
export async function listDelegations(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  sessionDate: string,
  signal?: AbortSignal,
): Promise<Delegation[]> {
  const page = await gatewayRequest<DelegationListResponse>(
    baseUrl,
    delegationsPath(eventId, sessionDate),
    { sessionToken, signal },
  );
  if (!page) throw new ApiError(500, 'The delegation list response was empty.');
  return [...(page.items ?? [])];
}

/** `POST /v1/events/:eventId/delegations?sessionDate`. */
export async function recordDelegation(
  baseUrl: string,
  sessionToken: string,
  eventId: string,
  sessionDate: string,
  input: { readonly fromMemberNo: string; readonly toMemberNo: string; readonly reason: string },
): Promise<Delegation> {
  const delegation = await gatewayRequest<Delegation>(
    baseUrl,
    delegationsPath(eventId, sessionDate),
    { method: 'POST', body: input, sessionToken },
  );
  if (!delegation) throw new ApiError(500, 'The recorded delegation response was empty.');
  return delegation;
}

export const USSD_PROVIDERS = ['nalo', 'hmac'] as const;
export type UssdProvider = (typeof USSD_PROVIDERS)[number];

export interface UssdSimulatorRequest {
  readonly provider: UssdProvider;
  readonly phone: string;
  readonly sessionId?: string;
  readonly input: string;
  readonly seq?: number;
}

export interface UssdSimulatorResponse {
  readonly provider: UssdProvider;
  readonly sessionId: string;
  readonly text: string;
  readonly done: boolean;
  readonly state: string;
  readonly wire: unknown;
}

/**
 * `POST /dev/ussd/session`: the dev-only gateway player. Deliberately outside
 * `/gateway/v1` — it is a development tool that refuses in production, and no
 * session credential or gateway secret is sent with it.
 */
export async function sendUssdSession(
  baseUrl: string,
  input: UssdSimulatorRequest,
  signal?: AbortSignal,
): Promise<UssdSimulatorResponse> {
  const response = await gatewayRequest<UssdSimulatorResponse>(baseUrl, '/dev/ussd/session', {
    method: 'POST',
    body: input,
    signal,
  });
  if (!response) throw new ApiError(500, 'The simulator response was empty.');
  return response;
}
