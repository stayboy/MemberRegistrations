import { ApiError } from './errors';
import { gatewayRequest, gatewayRequestWithMeta } from './gateway';

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

export interface MinistryRef {
  readonly code: string;
  readonly name: string;
}

/** Mirrors `MinistryDto`; the reference list is used by the Ministries tab. */
export interface Ministry extends MinistryRef {
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
  readonly placeOfResidence: string | null;
  readonly joinedOn: string | null;
  readonly isPresbyter: boolean;
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
  readonly status: 'active' | 'ended';
  readonly reference: string | null;
  readonly startedOn: string;
  readonly endedOn: string | null;
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
  readonly assignedOn: string;
  readonly endedOn: string | null;
  readonly reason: string | null;
  readonly endedReason: string | null;
}

/** Mirrors `MemberShepherdingDto` in `src/repos/shepherding.ts`. */
export interface MemberShepherding {
  readonly memberNo: string;
  readonly name: string;
  readonly shepherd: {
    readonly assignmentId: string;
    readonly memberNo: string;
    readonly name: string;
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

export interface AttendanceEntry {
  readonly id: string;
  readonly date: string;
  readonly source: 'import' | 'manual';
}

export interface MemberAttendanceSeries {
  readonly seriesId: string;
  readonly seriesName: string;
  readonly ministry: string | null;
  readonly attended: number;
  readonly expected: number;
  readonly remaining: number;
  readonly status: AttendanceStatus;
  readonly entries: readonly AttendanceEntry[];
}

export interface MemberDetail extends Omit<MemberSummary, 'attendance' | 'subscriptions'> {
  readonly id: string;
  readonly maidenName: string | null;
  readonly alias: string | null;
  readonly dob: string | null;
  readonly addressLine: string | null;
  readonly purgedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contacts: readonly MemberContact[];
  readonly subscriptions: readonly MemberSubscription[];
  readonly relationships: readonly MemberRelationship[];
  readonly attendance: readonly MemberAttendanceSeries[];
}

export interface MemberListPage {
  readonly items: readonly MemberSummary[];
  readonly nextCursor?: string;
}

/** Mirrors `createMemberSchema`, minus the contacts and ministries collections. */
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
  readonly isPresbyter?: boolean;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

/** `memberNo` is immutable, so the update body cannot carry it. */
export type MemberUpdateInput = Partial<Mutable<Omit<MemberInput, 'memberNo'>>>;

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

/** `GET /v1/ministries`; the Ministries tab filters the reference list. */
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
