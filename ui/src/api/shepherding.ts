import { ApiError } from './errors';
import { gatewayRequest } from './gateway';
import type { CallOutcome, Gender, ShepherdingCall, StillInChurch } from './members';

/**
 * Wire types mirror `src/schemas/shepherding.ts` and the shepherding DTOs in
 * `src/repos/shepherding.ts`. Everything here goes through the session gateway;
 * browser traffic never carries the API bearer (FR-16).
 */

export interface ShepherdingWindow {
  readonly from: string;
  readonly to: string;
}

export interface OfficerSummary {
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly assignedMembers: number;
  readonly attempts: number;
  readonly conversations: number;
  readonly lastCalledOn: string | null;
  readonly membersNeverCalled: number;
}

export interface RosterEntry {
  readonly assignmentId: string;
  readonly assignedOn: string;
  readonly memberNo: string;
  readonly name: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly placeOfResidence: string | null;
  /** Owned plus linked contacts; the roster renders the count, never their values (Q5). */
  readonly contactCount: number;
  readonly attempts: number;
  readonly conversations: number;
  readonly lastCalledOn: string | null;
  readonly lastOutcome: CallOutcome | null;
  readonly stillInChurch: StillInChurch | null;
  readonly latestFeedback: string | null;
  readonly latestIssue: string | null;
}

export interface Roster {
  readonly officerMemberNo: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly items: readonly RosterEntry[];
}

export interface ChurchReport {
  readonly from: string | null;
  readonly to: string | null;
  readonly totals: {
    readonly officers: number;
    readonly activeMembers: number;
    readonly assignedMembers: number;
    readonly unassignedMembers: number;
    readonly attempts: number;
    readonly conversations: number;
    readonly membersNeverCalled: number;
    readonly stillInChurch: {
      readonly yes: number;
      readonly no: number;
      readonly unknown: number;
      readonly neverReported: number;
    };
  };
  readonly officers: readonly OfficerSummary[];
}

/** Mirrors `assignmentInputSchema`; `reason` is required by the UI on reassignment. */
export interface AssignmentInput {
  readonly officerMemberNo: string;
  readonly memberNo: string;
  readonly assignedOn?: string;
  readonly replaceAssignmentId?: string;
  readonly reason?: string | null;
}

/** Mirrors `assignmentSchema`. */
export interface ShepherdingAssignment {
  readonly id: string;
  readonly officerMemberNo: string;
  readonly officerName: string;
  readonly officerGender: Gender;
  readonly officerAge: number | null;
  readonly memberNo: string;
  readonly memberName: string;
  readonly memberGender: Gender;
  readonly memberAge: number | null;
  readonly assignedOn: string;
  readonly endedOn: string | null;
  readonly reason: string | null;
  readonly endedReason: string | null;
}

/** Mirrors `callInputSchema`. */
export interface CallInput {
  readonly calledOn?: string;
  readonly outcome: CallOutcome;
  readonly stillInChurch?: StillInChurch;
  readonly feedback?: string | null;
  readonly issue?: string | null;
}

interface OfficerListResponse {
  readonly items: readonly OfficerSummary[];
}

export const SHEPHERDING_PATH = '/gateway/v1/shepherding';

/** Builds the shared `from`/`to` query in the API's documented order. */
export function shepherdingWindowQuery(window?: Partial<ShepherdingWindow>): string {
  const params = new URLSearchParams();
  if (window?.from) params.set('from', window.from);
  if (window?.to) params.set('to', window.to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function officersPath(window?: Partial<ShepherdingWindow>): string {
  return `${SHEPHERDING_PATH}/officers${shepherdingWindowQuery(window)}`;
}

export function rosterPath(officerMemberNo: string, window?: Partial<ShepherdingWindow>): string {
  return `${SHEPHERDING_PATH}/officers/${encodeURIComponent(
    officerMemberNo,
  )}/members${shepherdingWindowQuery(window)}`;
}

export function reportPath(window?: Partial<ShepherdingWindow>): string {
  return `${SHEPHERDING_PATH}/report${shepherdingWindowQuery(window)}`;
}

export function assignmentPath(assignmentId: string): string {
  return `${SHEPHERDING_PATH}/assignments/${encodeURIComponent(assignmentId)}`;
}

export function assignmentCallsPath(assignmentId: string): string {
  return `${assignmentPath(assignmentId)}/calls`;
}

/** `GET /v1/shepherding/officers?from&to`. */
export async function listOfficers(
  baseUrl: string,
  sessionToken: string,
  window: ShepherdingWindow,
  signal?: AbortSignal,
): Promise<OfficerSummary[]> {
  const result = await gatewayRequest<OfficerListResponse>(baseUrl, officersPath(window), {
    sessionToken,
    signal,
  });
  return [...(result?.items ?? [])];
}

/** `GET /v1/shepherding/officers/:memberNo/members?from&to`. */
export async function getRoster(
  baseUrl: string,
  sessionToken: string,
  officerMemberNo: string,
  window: ShepherdingWindow,
  signal?: AbortSignal,
): Promise<Roster> {
  const result = await gatewayRequest<Roster>(baseUrl, rosterPath(officerMemberNo, window), {
    sessionToken,
    signal,
  });
  if (!result) throw new ApiError(500, 'The shepherding roster response was empty.');
  return result;
}

/** `GET /v1/shepherding/report?from&to`. */
export async function getReport(
  baseUrl: string,
  sessionToken: string,
  window: ShepherdingWindow,
  signal?: AbortSignal,
): Promise<ChurchReport> {
  const result = await gatewayRequest<ChurchReport>(baseUrl, reportPath(window), {
    sessionToken,
    signal,
  });
  if (!result) throw new ApiError(500, 'The shepherding report response was empty.');
  return result;
}

/** `POST /v1/shepherding/assignments`; reassignment carries `replaceAssignmentId`. */
export async function assignMember(
  baseUrl: string,
  sessionToken: string,
  input: AssignmentInput,
): Promise<ShepherdingAssignment> {
  const result = await gatewayRequest<ShepherdingAssignment>(
    baseUrl,
    `${SHEPHERDING_PATH}/assignments`,
    {
      method: 'POST',
      body: input,
      sessionToken,
    },
  );
  if (!result) throw new ApiError(500, 'The assignment response was empty.');
  return result;
}

/** `DELETE /v1/shepherding/assignments/:assignmentId`; ends, never deletes (FR-64). */
export async function endAssignment(
  baseUrl: string,
  sessionToken: string,
  assignmentId: string,
): Promise<void> {
  await gatewayRequest(baseUrl, assignmentPath(assignmentId), {
    method: 'DELETE',
    sessionToken,
  });
}

/** `POST /v1/shepherding/assignments/:assignmentId/calls`; append-only (FR-62). */
export async function logCall(
  baseUrl: string,
  sessionToken: string,
  assignmentId: string,
  input: CallInput,
): Promise<ShepherdingCall> {
  const result = await gatewayRequest<ShepherdingCall>(baseUrl, assignmentCallsPath(assignmentId), {
    method: 'POST',
    body: input,
    sessionToken,
  });
  if (!result) throw new ApiError(500, 'The logged call response was empty.');
  return result;
}
