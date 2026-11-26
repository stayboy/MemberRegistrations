import type { EventScheduleLockCode, EventScheduleLockReason } from '../api/events';

/**
 * The edit guard's causes in the operator's words (FR-42h, AC-66). The API
 * answers closed codes and an optional occurrence date, never a sentence, so the
 * copy lives here - one place for the read-only summary and the `409` banner
 * alike. `date` is null only for an offering attached to the event itself.
 */
export type LockDateFormatter = (value: string | null | undefined) => string;

const LOCK_CODES: readonly EventScheduleLockCode[] = [
  'occurrence_started',
  'offering_attached',
  'offering_counted',
  'attendance_recorded',
  'import_suppressed',
];

function isLockCode(value: string): value is EventScheduleLockCode {
  return (LOCK_CODES as readonly string[]).includes(value);
}

function cause(reason: EventScheduleLockReason, formatDate: LockDateFormatter): string {
  if (reason.code === 'offering_attached') {
    return reason.date
      ? `an offering is attached to the occurrence on ${formatDate(reason.date)}`
      : 'an offering is attached to the event';
  }

  const when = reason.date ? ` on ${formatDate(reason.date)}` : '';
  switch (reason.code) {
    case 'occurrence_started':
      return `an occurrence started${when}`;
    case 'offering_counted':
      return `an offering count was recorded${when}`;
    case 'attendance_recorded':
      return `attendance was recorded${when}`;
    case 'import_suppressed':
      return `an import suppressed a row${when}`;
    default:
      return `the event has history${when}`;
  }
}

/** Each cause as its own sentence fragment, in the API's order. */
export function scheduleLockCauses(
  reasons: readonly EventScheduleLockReason[],
  formatDate: LockDateFormatter,
): string[] {
  return reasons.map((reason) => cause(reason, formatDate));
}

function joinCauses(causes: readonly string[]): string {
  if (causes.length <= 1) return causes[0] ?? '';
  if (causes.length === 2) return `${causes[0]} and ${causes[1]}`;
  return `${causes.slice(0, -1).join(', ')} and ${causes[causes.length - 1]}`;
}

/**
 * The causes as one capitalised sentence, or null when the read reported none.
 * The locked summary and the banner both use it, so they can never disagree.
 */
export function scheduleLockSentence(
  reasons: readonly EventScheduleLockReason[],
  formatDate: LockDateFormatter,
): string | null {
  const causes = scheduleLockCauses(reasons, formatDate);
  if (causes.length === 0) return null;
  const sentence = joinCauses(causes);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** The reasons a `409 recurrence_locked` body carried, read from the problem. */
export function lockReasonsFromProblem(problem: unknown): EventScheduleLockReason[] {
  if (typeof problem !== 'object' || problem === null) return [];
  const reasons = (problem as { reasons?: unknown }).reasons;
  if (!Array.isArray(reasons)) return [];

  return reasons.flatMap((entry): EventScheduleLockReason[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const code = (entry as { code?: unknown }).code;
    const date = (entry as { date?: unknown }).date;
    if (typeof code !== 'string' || !isLockCode(code)) return [];
    return [{ code, date: typeof date === 'string' ? date : null }];
  });
}
