import { ApiError, toApiError } from './errors';
import { gatewayRequest, gatewayRequestRaw, gatewayRequestWithMeta } from './gateway';

/** Wire types mirror the UI spec's §9.2 DTOs and the ticket-13a list contract. */

export type Gender = 'male' | 'female' | 'other' | 'undisclosed';
export type ContactKind = 'phone' | 'email' | 'whatsapp';
/** Mirrors `RELATIONSHIP_TYPES` in `src/repos/members.ts`. */
export const RELATIONSHIP_TYPES = ['spouse', 'parent', 'child', 'guardian', 'other'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export type SubscriptionKind = 'life_insurance' | 'credit_union';
export type AttendanceStatus = 'ongoing' | 'completed' | 'in_progress';
export type MemberStatus = 'active' | 'archived';
export type CallOutcome = 'reached' | 'no_answer' | 'wrong_number';
export type StillInChurch = 'yes' | 'no' | 'unknown';

/** The duty a member carries inside one ministry (FR-29, 2026-11-17). */
export interface MinistryPosition {
  readonly code: string;
  readonly label: string;
}

/**
 * One ministry the member serves in, mirroring `MinistryDto`: the reference
 * entry plus the member's role there. The summary and detail both carry it.
 */
export interface MinistryRef {
  readonly code: string;
  readonly name: string;
  readonly position: MinistryPosition | null;
}

/** The global reference entry from `GET /v1/ministries`. It carries no role. */
export interface Ministry {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly active: boolean;
}

export interface AttendanceSummary {
  readonly seriesId: string;
  readonly seriesName: string;
  readonly attended: number;
  readonly expected: number;
  readonly remaining: number;
  readonly status: AttendanceStatus;
  /** Latest attended date in the same series window, or null. */
  readonly lastAttendedOn: string | null;
}

export interface SubscriptionSummary {
  readonly id: string;
  readonly kind: SubscriptionKind;
  readonly scope: 'individual' | 'household';
  readonly status: 'active' | 'ended';
  readonly role: 'policyholder' | 'covered';
  readonly policyholderMemberNo: string;
  readonly coveredCount: number;
}

export interface MemberSummary {
  readonly memberNo: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly otherNames: string | null;
  readonly gender: Gender;
  /** Derived current age, or null when the date of birth is unknown or in the future. */
  readonly age: number | null;
  /** The same derivation in completed months; the picker says `8m` rather than `0y`. */
  readonly ageMonths: number | null;
  readonly placeOfResidence: string | null;
  readonly joinedOn: string | null;
  readonly isPresbyter: boolean;
  /** The instant the profile photo was stored, or null when there is none (MR-18). */
  readonly photoUpdatedAt: string | null;
  readonly archivedAt: string | null;
  /** Count only; the list never returns contact values (FR-78). */
  readonly contactCount: number;
  readonly ministries: readonly MinistryRef[];
  /** Present only when the list is requested with include=attendance&seriesId=. */
  readonly attendance?: AttendanceSummary | null;
  /** Present only when the list is requested with include=subscriptions. */
  readonly subscriptions?: readonly SubscriptionSummary[];
}

export interface MemberContact {
  readonly id: string;
  readonly kind: ContactKind;
  readonly value: string;
  readonly displayOrder: number;
  readonly ownerMemberNo: string;
  readonly linked: boolean;
}

export interface MemberSubscription {
  readonly id: string;
  readonly kind: SubscriptionKind;
  readonly scope: 'individual' | 'household';
  /** The API's three states; a legacy ended row keeps `ended` (FR-29). */
  readonly status: 'active' | 'ended' | 'expired';
  readonly reference: string | null;
  readonly startedOn: string;
  readonly endedOn: string | null;
  /**
   * The paid period end, present on the richer member-subscription read. The
   * detail projection does not carry it yet, so it is optional here and the
   * overview's "next ends" line appears only when the payload has it.
   */
  readonly periodEnd?: string | null;
  readonly role: 'policyholder' | 'covered';
  readonly policyholderMemberNo: string;
  readonly coveredMemberNos: readonly string[];
}

export interface MemberRelationship {
  readonly id: string;
  readonly type: RelationshipType;
  readonly isDependent: boolean;
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly archived: boolean;
}

/** Mirrors `relationshipInputSchema`. */
export interface RelationshipInput {
  readonly relatedMemberNo: string;
  readonly type: RelationshipType;
  readonly isDependent?: boolean;
}

export interface ShepherdingCall {
  readonly id: string;
  readonly assignmentId: string;
  readonly calledOn: string;
  readonly outcome: CallOutcome;
  readonly stillInChurch: StillInChurch;
  readonly feedback: string | null;
  readonly issue: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

export interface ShepherdingAssignmentHistory {
  readonly assignmentId: string;
  readonly officerMemberNo: string;
  readonly officerName: string;
  readonly officerGender: Gender;
  readonly officerAge: number | null;
  readonly assignedOn: string;
  readonly endedOn: string | null;
  readonly reason: string | null;
  readonly endedReason: string | null;
}

/** Mirrors `MemberShepherdingDto` in `src/repos/shepherding.ts`. */
export interface MemberShepherding {
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly shepherd: {
    readonly assignmentId: string;
    readonly memberNo: string;
    readonly name: string;
    readonly gender: Gender;
    readonly age: number | null;
    readonly assignedOn: string;
  } | null;
  readonly history: readonly ShepherdingAssignmentHistory[];
  readonly calls: {
    readonly attempts: number;
    readonly conversations: number;
    readonly lastCalledOn: string | null;
  };
  readonly stillInChurch: StillInChurch | null;
  readonly latestFeedback: string | null;
  readonly latestIssue: string | null;
  readonly recentCalls: readonly (ShepherdingCall & { readonly officerMemberNo: string })[];
}

/** The current shepherd the detail projects (FR-29): no assignment id, no history. */
export interface MemberShepherd {
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly assignedOn: string;
}

/** All-time call counts for the member's shepherding history; a null date means no such call. */
export interface MemberCalls {
  readonly attempts: number;
  readonly conversations: number;
  readonly lastCalledOn: string | null;
  readonly lastReachedOn: string | null;
}

export interface AttendanceEntry {
  readonly id: string;
  readonly date: string;
  readonly source: 'import' | 'manual';
  /** The event instance the row belongs to, on both series and standalone rows. */
  readonly eventId: string;
  readonly eventName: string;
}

export interface MemberAttendanceSeries {
  /** Null on a standalone event row, whose entries share one `eventId`. */
  readonly seriesId: string | null;
  readonly seriesName: string | null;
  readonly ministry: string | null;
  readonly attended: number;
  readonly expected: number;
  readonly remaining: number;
  readonly status: AttendanceStatus;
  readonly entries: readonly AttendanceEntry[];
}

/** The immediate guardian a member's chain starts at, with the contact it resolves to (MR-41). */
export interface MemberGuardian {
  readonly memberNo: string;
  readonly name: string;
  readonly contactMasked: string;
  readonly via: readonly string[];
}

/** A row of `GET /v1/presbyter-titles` (MR-12). */
export interface PresbyterTitleOption {
  readonly code: string;
  readonly label: string;
  readonly genderRestriction: 'male' | 'female' | null;
  readonly active: boolean;
}

export interface MemberDetail extends Omit<MemberSummary, 'attendance' | 'subscriptions'> {
  readonly id: string;
  /** The presbyter title, when the member holds one (FR-25a). */
  readonly title: {
    readonly code: string;
    readonly label: string;
    readonly titledOn: string | null;
  } | null;
  readonly membershipCardNo: string | null;
  /** The proven own contacts, each with its masked value and proof instant (MR-34). */
  readonly verifiedContacts: readonly VerifiedContact[];
  /** The latest non-withdrawn officer confirmation; null when none (MR-52). */
  readonly confirmedAt: string | null;
  readonly maidenName: string | null;
  readonly alias: string | null;
  readonly dob: string | null;
  readonly addressLine: string | null;
  /** UTC date the member joined this assembly; distinct from `joinedOn`. */
  readonly assemblyJoinedOn: string | null;
  readonly cameFrom: string | null;
  /** UTC date the member moved out; null while they are still here. */
  readonly movedOutOn: string | null;
  readonly movedToAssembly: string | null;
  readonly shepherd: MemberShepherd | null;
  /** The active guardian and the contact its chain resolves to (MR-41). */
  readonly guardian: MemberGuardian | null;
  readonly calls: MemberCalls;
  readonly purgedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contacts: readonly MemberContact[];
  readonly subscriptions: readonly MemberSubscription[];
  readonly relationships: readonly MemberRelationship[];
  readonly attendance: readonly MemberAttendanceSeries[];
}

export interface VerifiedContact {
  readonly id: string;
  readonly channel: 'phone' | 'whatsapp' | 'email';
  readonly masked: string;
  readonly verifiedAt: string;
}

export interface MemberListPage {
  readonly items: readonly MemberSummary[];
  readonly nextCursor?: string;
}

/** The create body's shape: the fields `createMemberSchema` accepts that this form collects. */
export interface MemberInput {
  readonly memberNo: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly otherNames?: string | null;
  readonly maidenName?: string | null;
  readonly alias?: string | null;
  readonly dob?: string | null;
  readonly gender?: Gender;
  readonly placeOfResidence?: string | null;
  readonly addressLine?: string | null;
  readonly joinedOn?: string | null;
  /** The four membership facts (FR-29, API 2026-11-17); blank submits `null`. */
  readonly assemblyJoinedOn?: string | null;
  readonly cameFrom?: string | null;
  readonly movedOutOn?: string | null;
  readonly movedToAssembly?: string | null;
  readonly isPresbyter?: boolean;
  /** Entered on both forms (MR-6); a blank field sends `null`. */
  readonly membershipCardNo?: string | null;
  /** The presbyter office and its date (MR-11, MR-12); blank becomes `null`. */
  readonly titleCode?: string | null;
  readonly titledOn?: string | null;
  /** Create only: the guardian linked atomically with the member (MR-38). */
  readonly guardianMemberNo?: string | null;
  /** Entered on the create form (FR-29a); a blank field sends no row. */
  readonly contacts?: readonly ContactInput[];
  /** Ministry codes chosen on the create form (FR-71); absent when none is chosen. */
  readonly ministries?: readonly string[];
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

/** `memberNo` is immutable; contacts and ministries have their own endpoints (FR-29a, FR-71). */
export type MemberUpdateInput = Partial<
  Mutable<Omit<MemberInput, 'memberNo' | 'contacts' | 'ministries'>>
>;

/** Mirrors `contactInputSchema`; the API normalises the value by kind. */
export interface ContactInput {
  readonly kind: ContactKind;
  readonly value: string;
  readonly displayOrder?: number;
}

/** Mirrors `subscriptionInputSchema`; coverage is optional and household-only. */
export interface SubscriptionInput {
  readonly kind: SubscriptionKind;
  readonly scope: 'individual' | 'household';
  readonly reference?: string | null;
  readonly startedOn?: string;
  readonly coveredMemberNos?: readonly string[];
}

/** Mirrors `subscribeProductSchema`; the create form's one optional subscription (FR-29a). */
export interface SubscribeProductInput {
  readonly productCode: string;
  /** Required only for a product whose payment mode is `either`; resolved server-side otherwise. */
  readonly paidBy?: 'member' | 'church';
  readonly coveredMemberNos?: readonly string[];
}

/** The product-backed row `POST …/subscriptions` returns (`memberSubscriptionSchema`). */
export interface ProductSubscription {
  readonly id: string;
  readonly status: 'active' | 'expired' | 'ended';
  readonly productCode: string | null;
  readonly productName: string | null;
  readonly scope: 'individual' | 'household';
  readonly paidBy: 'member' | 'church' | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
}

export interface MemberDetailResult {
  readonly member: MemberDetail;
  /** Wire value such as `"v7"`; `null` only when the gateway did not expose it. */
  readonly etag: string | null;
}

export interface ListMembersOptions {
  readonly q?: string;
  /** Explicit contact lookup (FR-79); the main search never sets it. */
  readonly contact?: string;
  readonly status?: MemberStatus;
  /** Active members with no active shepherding assignment (FR-8a). */
  readonly unassigned?: boolean;
  /** Adds the page-level attendance aggregate; requires `seriesId`. */
  readonly includeAttendance?: boolean;
  readonly seriesId?: string;
  /** Adds the page-level subscriptions aggregate. Defaults to true. */
  readonly includeSubscriptions?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

const MEMBERS_PATH = '/gateway/v1/members';
const SUBSCRIPTIONS_PATH = '/gateway/v1/subscriptions';
const MINISTRIES_PATH = '/gateway/v1/ministries';
const PRESBYTER_TITLES_PATH = '/gateway/v1/presbyter-titles';

/** `GET /v1/presbyter-titles`: the active reference titles, ordered by label (MR-12). */
export async function listPresbyterTitles(
  baseUrl: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PresbyterTitleOption[]> {
  const result = await gatewayRequest<{ readonly items: readonly PresbyterTitleOption[] }>(
    baseUrl,
    PRESBYTER_TITLES_PATH,
    { sessionToken, signal },
  );
  return [...(result?.items ?? [])];
}

/**
 * `GET /v1/members?guardianEligible=true&forMemberNo=…` (MR-40): the adults who
 * may become this member's guardian, with the contact each resolves to. On the
 * create form the member does not exist yet, so the typed number excludes
 * nothing and the server answers with the eligible adults alone.
 */
export function guardianCandidatesPath(forMemberNo?: string): string {
  const params = new URLSearchParams({ guardianEligible: 'true' });
  if (forMemberNo?.trim()) params.set('forMemberNo', forMemberNo.trim());
  return `${MEMBERS_PATH}?${params.toString()}`;
}

export async function listGuardianCandidates(
  baseUrl: string,
  sessionToken: string,
  forMemberNo: string | undefined,
  signal?: AbortSignal,
): Promise<MemberGuardian[]> {
  const result = await gatewayRequest<{ readonly items: readonly MemberGuardian[] }>(
    baseUrl,
    guardianCandidatesPath(forMemberNo),
    { sessionToken, signal },
  );
  return [...(result?.items ?? [])];
}

/** Builds the members list query in the order the API documents it. */
export function membersListPath(options: ListMembersOptions = {}): string {
  const params = new URLSearchParams();

  if (options.status) params.set('status', options.status);
  if (options.unassigned) params.set('unassigned', 'true');

  const include: string[] = [];
  if (options.includeAttendance && options.seriesId) include.push('attendance');
  if (options.includeSubscriptions !== false) include.push('subscriptions');
  if (include.length > 0) params.set('include', include.join(','));
  if (options.includeAttendance && options.seriesId) params.set('seriesId', options.seriesId);

  if (options.contact?.trim()) params.set('contact', options.contact.trim());
  if (options.q?.trim()) params.set('q', options.q.trim());
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', options.cursor);

  const query = params.toString();
  return query ? `${MEMBERS_PATH}?${query}` : MEMBERS_PATH;
}

export async function listMembers(
  baseUrl: string,
  sessionToken: string,
  options: ListMembersOptions = {},
): Promise<MemberListPage> {
  const page = await gatewayRequest<MemberListPage>(baseUrl, membersListPath(options), {
    sessionToken,
    signal: options.signal,
  });
  if (!page) throw new ApiError(500, 'The member list response was empty.');
  return page;
}

/** The picker never asks for more rows than this. */
export const MEMBER_PICKER_LIMIT = 10;

/**
 * `GET /v1/members?q=…&limit=10` with no aggregates: the picker only needs the
 * number and the name. An empty query is not fetched by the component, but the
 * builder stays total.
 */
export function memberPickerPath(query: string): string {
  const trimmed = query.trim();
  return membersListPath({
    q: trimmed || undefined,
    limit: MEMBER_PICKER_LIMIT,
    includeSubscriptions: false,
  });
}

/** The debounced member search behind `MemberPicker` (Q156). */
export async function searchMembers(
  baseUrl: string,
  sessionToken: string,
  query: string,
  signal?: AbortSignal,
): Promise<MemberListPage> {
  const page = await gatewayRequest<MemberListPage>(baseUrl, memberPickerPath(query), {
    sessionToken,
    signal,
  });
  if (!page) throw new ApiError(500, 'The member search response was empty.');
  return page;
}

export function memberDetailPath(memberNo: string): string {
  return `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}?includeArchived=true`;
}

export async function fetchMemberDetail(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  signal?: AbortSignal,
): Promise<MemberDetailResult> {
  // The archived view also opens this dialog, so the detail request widens the
  // set; the flag is harmless for an active member.
  const result = await gatewayRequestWithMeta<MemberDetail>(baseUrl, memberDetailPath(memberNo), {
    sessionToken,
    signal,
  });
  if (!result.data) throw new ApiError(500, 'The member response was empty.');
  return { member: result.data, etag: result.headers.get('ETag') };
}

export async function getMember(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  signal?: AbortSignal,
): Promise<MemberDetail> {
  return (await fetchMemberDetail(baseUrl, sessionToken, memberNo, signal)).member;
}

/** The one photo path; the browser builds it from `photoUpdatedAt`, never a URL (MR-18). */
export function memberPhotoPath(memberNo: string): string {
  return `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/photo`;
}

/** The `PUT` response: the instant the new bytes were stored. */
export interface MemberPhotoUpload {
  readonly photoUpdatedAt: string;
}

/**
 * `GET /v1/members/:memberNo/photo` as an authenticated blob. The session rides
 * the header, so an `<img src>` cannot be used; the caller owns the object URL
 * and must revoke it (MR-18).
 */
export async function fetchMemberPhoto(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await gatewayRequestRaw(baseUrl, memberPhotoPath(memberNo), {
    sessionToken,
    signal,
    accept: 'image/webp,image/jpeg,image/png',
  });
  return response.blob();
}

/** `PUT /v1/members/:memberNo/photo` with the already re-encoded square (MR-15). */
export async function uploadMemberPhoto(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  photo: Blob,
): Promise<MemberPhotoUpload> {
  const response = await gatewayRequestRaw(baseUrl, memberPhotoPath(memberNo), {
    method: 'PUT',
    body: photo,
    contentType: photo.type,
    sessionToken,
    accept: 'application/json',
  });
  return (await response.json()) as MemberPhotoUpload;
}

/** `DELETE /v1/members/:memberNo/photo`; initials return on every avatar. */
export async function deleteMemberPhoto(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
): Promise<void> {
  await gatewayRequestRaw(baseUrl, memberPhotoPath(memberNo), {
    method: 'DELETE',
    sessionToken,
  });
}

/** Parses the member number out of the API's `Location` header. */
export function memberNoFromLocation(location: string | null): string | null {
  if (!location) return null;
  const match = /\/v1\/members\/([^/?#]+)/.exec(location);
  return match ? decodeURIComponent(match[1]!) : null;
}

export async function createMember(
  baseUrl: string,
  sessionToken: string,
  input: MemberInput,
): Promise<MemberDetail> {
  const result = await gatewayRequestWithMeta<MemberDetail>(baseUrl, MEMBERS_PATH, {
    method: 'POST',
    body: input,
    sessionToken,
  });
  if (result.data) return result.data;

  // Defensive: the API returns the full DTO with 201. If a proxy strips the
  // body, the Location header still names the new member.
  const createdNo = memberNoFromLocation(result.headers.get('Location'));
  if (createdNo) {
    return (await fetchMemberDetail(baseUrl, sessionToken, createdNo)).member;
  }
  throw new ApiError(500, 'The created member response was empty.');
}

export async function updateMember(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  input: MemberUpdateInput,
  etag: string | null,
): Promise<MemberDetail> {
  if (!etag) {
    throw new ApiError(428, 'Reload the member before saving: the server version is unknown.');
  }

  const result = await gatewayRequestWithMeta<MemberDetail>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}`,
    { method: 'PUT', body: input, sessionToken, headers: { 'If-Match': etag } },
  );
  if (!result.data) throw new ApiError(500, 'The updated member response was empty.');
  return result.data;
}

export async function archiveMember(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
): Promise<void> {
  await gatewayRequest(baseUrl, `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}`, {
    method: 'DELETE',
    sessionToken,
  });
}

export async function restoreMember(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
): Promise<MemberDetail> {
  const member = await gatewayRequest<MemberDetail>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/restore`,
    { method: 'POST', sessionToken },
  );
  if (!member) throw new ApiError(500, 'The restored member response was empty.');
  return member;
}

/** Purge is PII erasure; the body must repeat the member number exactly (FR-28). */
export async function purgeMember(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
): Promise<void> {
  await gatewayRequest(baseUrl, `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/purge`, {
    method: 'POST',
    body: { confirm: memberNo },
    sessionToken,
  });
}

/** `POST /v1/members/:memberNo/verification/otp` (MR-29): a masked destination, never a code. */
export interface MemberVerificationIssue {
  readonly destination: {
    readonly channel: 'email' | 'whatsapp' | 'phone';
    readonly masked: string;
  };
  readonly expiresAt: string;
}

/** The one verification path; there is no channel choice (MR-23). */
export function memberVerificationPath(memberNo: string): string {
  return `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/verification`;
}

/**
 * Starts a code. The response names the masked destination, the completion entry
 * and the expiry; the code itself never reaches the browser (MR-29).
 */
export async function requestMemberVerification(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
): Promise<MemberVerificationIssue> {
  const issued = await gatewayRequest<MemberVerificationIssue>(
    baseUrl,
    `${memberVerificationPath(memberNo)}/otp`,
    { method: 'POST', body: {}, sessionToken },
  );
  if (!issued) throw new ApiError(500, 'The verification response was empty.');
  return issued;
}

/** `DELETE /v1/members/:memberNo/verification`: withdraw proofs and confirmation (MR-31). */
export async function revokeMemberVerification(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
): Promise<void> {
  await gatewayRequest(baseUrl, memberVerificationPath(memberNo), {
    method: 'DELETE',
    sessionToken,
  });
}

/** `POST /v1/members/:memberNo/confirmation`: the audited officer attestation (MR-52). */
export async function confirmMember(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  reason: string,
): Promise<{ readonly confirmedAt: string }> {
  const result = await gatewayRequest<{ readonly confirmedAt: string }>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/confirmation`,
    { method: 'POST', body: { reason: reason.trim() }, sessionToken },
  );
  if (!result) throw new ApiError(500, 'The confirmation response was empty.');
  return result;
}

/** `DELETE /v1/members/:memberNo/confirmation`: withdraw the attestation alone (MR-52). */
export async function withdrawConfirmationRequest(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
): Promise<void> {
  await gatewayRequest(baseUrl, `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/confirmation`, {
    method: 'DELETE',
    sessionToken,
  });
}

/**
 * The public acceptance page's answer (MR-51). The page has no session: the
 * single-use token and the six-digit code are its credential, so this is a raw
 * `fetch` with no `Authorization` header and no session helper.
 */
export interface MemberAcceptance {
  readonly channel: 'phone' | 'whatsapp' | 'email';
  readonly masked: string;
}

export async function acceptMemberVerification(
  baseUrl: string,
  token: string,
  code: string,
): Promise<MemberAcceptance> {
  const response = await fetch(`${baseUrl}/portal/verification/accept`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.trim(), code: code.trim() }),
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as MemberAcceptance;
}

export async function addContact(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  input: ContactInput,
): Promise<MemberContact> {
  const contact = await gatewayRequest<MemberContact>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/contacts`,
    { method: 'POST', body: input, sessionToken },
  );
  if (!contact) throw new ApiError(500, 'The created contact response was empty.');
  return contact;
}

/**
 * `contactInputSchema.partial()`: this cycle edits the value and nothing else
 * (FR-78), so kind and `displayOrder` cannot ride the request.
 */
export interface ContactUpdateInput {
  readonly value: string;
}

/** `PUT /v1/members/:memberNo/contacts/:contactId` with `{ value }` only (FR-78). */
export async function updateContact(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  contactId: string,
  input: ContactUpdateInput,
): Promise<MemberContact> {
  const contact = await gatewayRequest<MemberContact>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/contacts/${encodeURIComponent(contactId)}`,
    { method: 'PUT', body: input, sessionToken },
  );
  if (!contact) throw new ApiError(500, 'The updated contact response was empty.');
  return contact;
}

/** `POST /v1/members/:memberNo/contacts/link` with `{ contactId }` (FR-78, AC-54). */
export async function linkContact(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  contactId: string,
): Promise<MemberContact> {
  const contact = await gatewayRequest<MemberContact>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/contacts/link`,
    { method: 'POST', body: { contactId }, sessionToken },
  );
  if (!contact) throw new ApiError(500, 'The linked contact response was empty.');
  return contact;
}

/** `DELETE /v1/members/:memberNo/contacts/link/:contactId`; 204, the value stays with its owner. */
export async function unlinkContact(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  contactId: string,
): Promise<void> {
  await gatewayRequest(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/contacts/link/${encodeURIComponent(contactId)}`,
    { method: 'DELETE', sessionToken },
  );
}

export async function removeContact(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  contactId: string,
): Promise<void> {
  await gatewayRequest(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/contacts/${encodeURIComponent(contactId)}`,
    { method: 'DELETE', sessionToken },
  );
}

export async function addSubscription(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  input: SubscriptionInput,
): Promise<MemberSubscription> {
  const subscription = await gatewayRequest<MemberSubscription>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/subscriptions`,
    { method: 'POST', body: input, sessionToken },
  );
  if (!subscription) throw new ApiError(500, 'The created subscription response was empty.');
  return subscription;
}

/**
 * `POST /v1/members/:memberNo/subscriptions` with the product body
 * `subscribeProductSchema` parses (FR-29a). The route branches on `productCode`,
 * so this is the product form of the same path `addSubscription` uses for the
 * legacy `kind`/`scope` body.
 */
export async function subscribeMemberProduct(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  input: SubscribeProductInput,
): Promise<ProductSubscription> {
  const subscription = await gatewayRequest<ProductSubscription>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/subscriptions`,
    { method: 'POST', body: input, sessionToken },
  );
  if (!subscription) throw new ApiError(500, 'The created subscription response was empty.');
  return subscription;
}

export async function endSubscription(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  subscriptionId: string,
): Promise<void> {
  await gatewayRequest(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/subscriptions/${encodeURIComponent(
      subscriptionId,
    )}`,
    { method: 'DELETE', sessionToken },
  );
}

/** Coverage lives at the subscription, not under the policyholder's member path. */
export async function addCoverage(
  baseUrl: string,
  sessionToken: string,
  subscriptionId: string,
  memberNo: string,
): Promise<void> {
  await gatewayRequest(
    baseUrl,
    `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(subscriptionId)}/coverage`,
    { method: 'POST', body: { memberNo }, sessionToken },
  );
}

export async function removeCoverage(
  baseUrl: string,
  sessionToken: string,
  subscriptionId: string,
  memberNo: string,
): Promise<void> {
  await gatewayRequest(
    baseUrl,
    `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(subscriptionId)}/coverage/${encodeURIComponent(
      memberNo,
    )}`,
    { method: 'DELETE', sessionToken },
  );
}

/** `GET /v1/ministries`; the overview's add control filters the reference list. */
export async function listMinistries(
  baseUrl: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<Ministry[]> {
  const result = await gatewayRequest<{ readonly items: readonly Ministry[] }>(
    baseUrl,
    MINISTRIES_PATH,
    { sessionToken, signal },
  );
  return [...(result?.items ?? [])];
}

/** `POST /v1/members/:memberNo/ministries` with `{ code }`. */
export async function addMemberMinistry(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  code: string,
): Promise<MinistryRef> {
  const ministry = await gatewayRequest<MinistryRef>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/ministries`,
    { method: 'POST', body: { code }, sessionToken },
  );
  if (!ministry) throw new ApiError(500, 'The assigned ministry response was empty.');
  return ministry;
}

/** `DELETE /v1/members/:memberNo/ministries/:code`; unassigns, never deletes. */
export async function removeMemberMinistry(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  code: string,
): Promise<void> {
  await gatewayRequest(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/ministries/${encodeURIComponent(code)}`,
    { method: 'DELETE', sessionToken },
  );
}

/** `POST /v1/members/:memberNo/relationships`. */
export async function addMemberRelationship(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  input: RelationshipInput,
): Promise<MemberRelationship> {
  const relationship = await gatewayRequest<MemberRelationship>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/relationships`,
    { method: 'POST', body: input, sessionToken },
  );
  if (!relationship) throw new ApiError(500, 'The created relationship response was empty.');
  return relationship;
}

/** `DELETE /v1/members/:memberNo/relationships/:relationshipId`. */
export async function removeMemberRelationship(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  relationshipId: string,
): Promise<void> {
  await gatewayRequest(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/relationships/${encodeURIComponent(
      relationshipId,
    )}`,
    { method: 'DELETE', sessionToken },
  );
}

/** `GET /v1/members/:memberNo/shepherding`; read-only on the member detail (FR-66). */
export async function getMemberShepherding(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  signal?: AbortSignal,
): Promise<MemberShepherding> {
  const result = await gatewayRequest<MemberShepherding>(
    baseUrl,
    `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}/shepherding`,
    { sessionToken, signal },
  );
  if (!result) throw new ApiError(500, 'The shepherding response was empty.');
  return result;
}
