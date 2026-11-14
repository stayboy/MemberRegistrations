import type { CallOutcome, StillInChurch } from '../api/members';
import { ApiError } from '../api/errors';
import { utcToday } from './member-form';

/**
 * Pure shepherding helpers: labels, the follow-up predicate (FR-60), call
 * validation (FR-61/FR-67) and reassignment conflict detection (FR-63). The
 * browser rejects the same input the API would reject. The shared UTC date
 * window moved to `format/date-window.ts` at its second call site.
 */

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  reached: 'Reached',
  no_answer: 'No answer',
  wrong_number: 'Wrong number',
};

export const STILL_IN_CHURCH_LABELS: Record<StillInChurch, string> = {
  yes: 'Still in church',
  no: 'No longer in church',
  unknown: 'Unknown',
};

export const CALL_OUTCOME_OPTIONS: readonly {
  readonly value: CallOutcome;
  readonly label: string;
}[] = [
  { value: 'reached', label: OUTCOME_LABELS.reached },
  { value: 'no_answer', label: OUTCOME_LABELS.no_answer },
  { value: 'wrong_number', label: OUTCOME_LABELS.wrong_number },
];

export const STILL_IN_CHURCH_OPTIONS: readonly {
  readonly value: StillInChurch;
  readonly label: string;
}[] = [
  { value: 'yes', label: STILL_IN_CHURCH_LABELS.yes },
  { value: 'no', label: STILL_IN_CHURCH_LABELS.no },
  { value: 'unknown', label: STILL_IN_CHURCH_LABELS.unknown },
];

export function outcomeLabel(outcome: CallOutcome | null | undefined): string {
  return outcome ? OUTCOME_LABELS[outcome] : '—';
}

export function stillInChurchLabel(status: StillInChurch | null | undefined): string {
  return status ? STILL_IN_CHURCH_LABELS[status] : 'Never reported';
}

export const FOLLOW_UP_DAYS = 30;
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;
export const TEXT_MAX_LENGTH = 2000;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseUtcDate(value: string | null | undefined): Date | null {
  const trimmed = value?.trim() ?? '';
  if (!ISO_DATE_PATTERN.test(trimmed)) return null;

  const [year, month, day] = trimmed.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/**
 * Whole UTC days since `lastCalledOn`, or `null` when the row was never called
 * (or the stored value is not a real UTC date). The one day difference behind
 * `isFollowUp` (FR-60) and the roster's `Quiet {n}d` badge (FR-59a), so the
 * badge and the filter cannot disagree.
 */
export function daysSinceLastCall(
  entry: { readonly lastCalledOn: string | null },
  today: string = utcToday(),
): number | null {
  if (!entry.lastCalledOn) return null;

  const last = parseUtcDate(entry.lastCalledOn);
  const now = parseUtcDate(today);
  if (!last || !now) return null;

  return Math.floor((now.getTime() - last.getTime()) / DAY_MS);
}

/**
 * Follow-up means never called, or last called more than 30 UTC days ago.
 * Exactly 30 days is not a follow-up; 31 is (FR-60).
 */
export function isFollowUp(
  entry: { readonly lastCalledOn: string | null },
  today: string = utcToday(),
): boolean {
  if (!entry.lastCalledOn) return true;

  const days = daysSinceLastCall(entry, today);
  return days === null ? true : days > FOLLOW_UP_DAYS;
}

/**
 * The roster row's last-call badge (FR-59a): "Never called" when the row has no
 * call, `Quiet {n}d` when FR-60's follow-up condition holds, and `null` when the
 * plain date stands alone — including the exactly-30-days case. The API's date
 * schema guarantees a real UTC date, so a stored value that cannot be parsed
 * never reaches a badge (the filter still treats it as a follow-up).
 */
export function lastCallBadge(
  entry: { readonly lastCalledOn: string | null },
  today: string = utcToday(),
): string | null {
  if (!entry.lastCalledOn) return 'Never called';
  if (!isFollowUp(entry, today)) return null;

  const days = daysSinceLastCall(entry, today);
  return days === null ? null : `Quiet ${days}d`;
}

export interface CallFormValues {
  readonly calledOn: string;
  readonly outcome: CallOutcome | '';
  readonly stillInChurch: StillInChurch | '';
  readonly feedback: string;
  readonly issue: string;
}

export type CallFormField = 'calledOn' | 'outcome' | 'stillInChurch' | 'feedback' | 'issue';

export type CallFormErrors = Partial<Record<CallFormField, string>>;

/** A fresh log-call form; `calledOn` defaults to today in UTC (FR-67). */
export function createEmptyCallForm(calledOn: string = utcToday()): CallFormValues {
  return {
    calledOn,
    outcome: '',
    stillInChurch: '',
    feedback: '',
    issue: '',
  };
}

/**
 * Mirrors `callInputSchema` plus the API's date rules: `calledOn` must be a real
 * UTC date, not in the future, and not before the assignment's `assignedOn`;
 * `stillInChurch` is required when the outcome is `reached`.
 */
export function validateCall(
  values: CallFormValues,
  assignedOn: string,
  today: string = utcToday(),
): CallFormErrors {
  const errors: CallFormErrors = {};
  const calledOn = values.calledOn.trim();

  if (calledOn.length === 0) {
    errors.calledOn = 'Called on is required.';
  } else if (!parseUtcDate(calledOn)) {
    errors.calledOn = 'Called on must be a real date in YYYY-MM-DD form.';
  } else if (calledOn > today) {
    errors.calledOn = 'Called on must not be in the future.';
  } else if (calledOn < assignedOn) {
    errors.calledOn = 'Called on must not be before the assignment started.';
  }

  if (!values.outcome) errors.outcome = 'Outcome is required.';

  if (values.outcome === 'reached' && !values.stillInChurch) {
    errors.stillInChurch = 'Still in church is required when the outcome is reached.';
  }

  if (values.feedback.trim().length > TEXT_MAX_LENGTH) {
    errors.feedback = `Feedback must be ${TEXT_MAX_LENGTH} characters or fewer.`;
  }
  if (values.issue.trim().length > TEXT_MAX_LENGTH) {
    errors.issue = `Issue must be ${TEXT_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
}

/** Mirrors the API's 3–500 character reason rule for assignments (FR-63). */
export function validateReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return 'Reason is required.';
  if (trimmed.length < REASON_MIN_LENGTH || trimmed.length > REASON_MAX_LENGTH) {
    return `Reason must be ${REASON_MIN_LENGTH}–${REASON_MAX_LENGTH} characters.`;
  }
  return null;
}

/** The `currentAssignment` extension on a reassignment `409` (FR-63). */
export interface CurrentAssignment {
  readonly id: string;
  readonly officerMemberNo: string;
  readonly assignedOn: string;
}

/**
 * Reads the `currentAssignment` extension off a `409`. Only a well-formed
 * extension counts; any other conflict keeps the inline error path.
 */
export function currentAssignmentOf(error: unknown): CurrentAssignment | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;

  const raw = error.problem?.currentAssignment;
  if (typeof raw !== 'object' || raw === null) return null;

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.officerMemberNo !== 'string' ||
    typeof candidate.assignedOn !== 'string'
  ) {
    return null;
  }

  return {
    id: candidate.id,
    officerMemberNo: candidate.officerMemberNo,
    assignedOn: candidate.assignedOn,
  };
}

/** True only for the reassignment-consent `409`, not every conflict. */
export function isStaleAssignment(error: unknown): boolean {
  return currentAssignmentOf(error) !== null;
}
