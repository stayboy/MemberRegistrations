import { ApiError } from './errors';
import { gatewayRequest } from './gateway';

/** Wire types mirror the UI spec's §9.2 DTOs and the ticket-13a list contract. */

export type Gender = 'male' | 'female' | 'other' | 'undisclosed';
export type ContactKind = 'phone' | 'email' | 'whatsapp';
export type RelationshipType = 'spouse' | 'parent' | 'child' | 'guardian' | 'other';
export type SubscriptionKind = 'life_insurance' | 'credit_union';
export type AttendanceStatus = 'ongoing' | 'completed' | 'in_progress';
export type MemberStatus = 'active' | 'archived';

export interface MinistryRef {
  readonly code: string;
  readonly name: string;
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

export interface ListMembersOptions {
  readonly q?: string;
  readonly status?: MemberStatus;
  /** Adds the page-level attendance aggregate; requires `seriesId`. */
  readonly includeAttendance?: boolean;
  readonly seriesId?: string;
  /** Adds the page-level subscriptions aggregate. Defaults to true. */
  readonly includeSubscriptions?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface SeriesOption {
  readonly id: string;
  readonly name: string;
}

interface SeriesListResponse {
  readonly items: readonly { readonly id: string; readonly name: string }[];
}

const MEMBERS_PATH = '/gateway/v1/members';
const SERIES_PATH = '/gateway/v1/series';

/** Builds the members list query in the order the API documents it. */
export function membersListPath(options: ListMembersOptions = {}): string {
  const params = new URLSearchParams();

  if (options.status) params.set('status', options.status);

  const include: string[] = [];
  if (options.includeAttendance && options.seriesId) include.push('attendance');
  if (options.includeSubscriptions !== false) include.push('subscriptions');
  if (include.length > 0) params.set('include', include.join(','));
  if (options.includeAttendance && options.seriesId) params.set('seriesId', options.seriesId);

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

export function memberDetailPath(memberNo: string): string {
  return `${MEMBERS_PATH}/${encodeURIComponent(memberNo)}?includeArchived=true`;
}

export async function getMember(
  baseUrl: string,
  sessionToken: string,
  memberNo: string,
  signal?: AbortSignal,
): Promise<MemberDetail> {
  // The archived view also opens this dialog, so the detail request widens the
  // set; the flag is harmless for an active member.
  const member = await gatewayRequest<MemberDetail>(baseUrl, memberDetailPath(memberNo), {
    sessionToken,
    signal,
  });
  if (!member) throw new ApiError(500, 'The member response was empty.');
  return member;
}

export async function listSeries(
  baseUrl: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<SeriesOption[]> {
  const result = await gatewayRequest<SeriesListResponse>(baseUrl, SERIES_PATH, {
    sessionToken,
    signal,
  });
  return (result?.items ?? []).map((series) => ({ id: series.id, name: series.name }));
}
