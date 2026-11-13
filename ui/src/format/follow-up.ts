import { ApiError } from '../api/errors';

/**
 * FR-26a: the pledge's follow-up default is the member's **active shepherd**, using the same
 * predicate the API applies when it resolves the officer (`src/repos/pledges.ts`, the shepherding
 * branch): the assignment's member is a presbyter, not archived and not purged. The shepherding
 * summary names the current assignment without filtering its officer, so the UI has to apply the
 * predicate itself — naming a shepherd the API will refuse is the failure this exists to prevent.
 */
export interface FollowUpCandidate {
  readonly isPresbyter: boolean;
  readonly archivedAt: string | null;
  /** The API's third condition. Required: an optional field would let a caller that forgets it
   * pass a purged member through a three-condition predicate. `MemberDetail` carries it. */
  readonly purgedAt: string | null;
}

export function isFollowUpEligible(member: FollowUpCandidate): boolean {
  return member.isPresbyter && member.archivedAt === null && member.purgedAt === null;
}

/** Used when the API's problem detail is empty but the code still names the officer. */
const OFFICER_REQUIRED_FALLBACK = 'The pledge needs an active presbyter as its follow-up officer.';

/** One zod issue, or one API sentence, about the officer field family. */
const OFFICER_DETAIL_PATTERN = /officer|presbyter|note/i;

/**
 * FR-26a: the officer failures belong on the officer field, not in the dialog's generic error bar.
 * The API has three shapes for them, and all three land here:
 *
 * - `422 officer_required` when the member has no shepherd and none was supplied
 *   (`OfficerRequiredError`).
 * - `422 validation_error` whose joined detail names the officer fields
 *   (`followUpOfficerMemberNo`, `officerReason`).
 * - `422 validation_error` with the API's own sentence `Member M-1007 is not an active presbyter`
 *   (`src/repos/pledges.ts:713`, a `ValidationError` that never mentions "officer").
 *
 * **The rule: a `validation_error` is claimed only when every `'; '`-separated issue in its detail
 * names the officer, the presbyter or the note; a single unrelated issue (`expectedOn`, say) leaves
 * the whole detail in the bar.** The API joins zod issues with `'; '` (`src/errors/problem.ts:79`),
 * so a mixed detail describes more than the officer field and the bar has to keep it whole.
 */
export function officerProblemMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const code = typeof error.problem?.code === 'string' ? error.problem.code : '';
  if (code === 'officer_required') return error.message.trim() || OFFICER_REQUIRED_FALLBACK;
  if (code !== 'validation_error') return null;
  const detail = error.message.trim();
  if (detail === '') return null;
  const issues = detail
    .split(';')
    .map((issue) => issue.trim())
    .filter((issue) => issue !== '');
  return issues.length > 0 && issues.every((issue) => OFFICER_DETAIL_PATTERN.test(issue))
    ? detail
    : null;
}

/** The API's cap on the follow-up note, counted after trimming (`createPledgeSchema.officerReason`). */
export const OFFICER_NOTE_MAX_LENGTH = 500;

/**
 * The note for the follow-up officer is **optional** (spec 2026-11-13): it may accompany an
 * explicit officer, sit on a pledge that falls back to the member's shepherd, or be left empty.
 * Only the API's maximum survives as a client-side rule — 500 characters **after trimming** — so a
 * submit is never blocked for an empty or a short note. Returns the field-level message, or null
 * when the value passes.
 */
export function officerNoteProblem(value: string): string | null {
  if (value.trim().length <= OFFICER_NOTE_MAX_LENGTH) return null;
  return `The note for the follow-up officer must be ${OFFICER_NOTE_MAX_LENGTH} characters or fewer.`;
}
