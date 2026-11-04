/**
 * Formatting helpers for the members grid. Dates are UTC calendar dates from the
 * API (`YYYY-MM-DD`); parsing them as UTC avoids a local-time day shift (FR-76).
 */

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** `2026-10-26` -> `26-Oct-26`, or an empty string when the value is not a date. */
export function formatDateShort(value: string | null | undefined): string {
  const date = parseCalendarDate(value);
  if (!date) return '';
  const year = String(date.year % 100).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${day}-${MONTHS_SHORT[date.month - 1]}-${year}`;
}

/** `2026-10-26` -> `26 October 2026`, for tooltips and detail copy. */
export function formatDateLong(value: string | null | undefined): string {
  const date = parseCalendarDate(value);
  if (!date) return '';
  return `${date.day} ${MONTHS_LONG[date.month - 1]} ${date.year}`;
}

export interface AttendanceLike {
  readonly seriesName?: string;
  readonly attended: number;
  readonly expected: number;
  readonly lastAttendedOn?: string | null;
}

/**
 * The single attendance line: `4/5 (26-Oct-26)`, `4/5` when there is no last
 * date, or `No attendance yet` when the aggregate is absent. Never a second
 * date line (FR-76).
 */
export function formatAttendance(summary: AttendanceLike | null | undefined): string {
  if (!summary) return 'No attendance yet';

  const counts = `${summary.attended}/${summary.expected}`;
  const last = formatDateShort(summary.lastAttendedOn);
  return last ? `${counts} (${last})` : counts;
}

/** The accessible tooltip content for the attendance cell (FR-76/FR-77). */
export function attendanceDescription(summary: AttendanceLike | null | undefined): string {
  if (!summary) return 'No attendance yet';

  const series = summary.seriesName?.trim();
  const prefix = series ? `${series} · ` : '';
  const last = formatDateLong(summary.lastAttendedOn);
  const counts = `${summary.attended} of ${summary.expected} attended`;
  return last
    ? `${prefix}${counts} · last attended ${last}`
    : `${prefix}${counts} · no attendance recorded`;
}

/** `Contacts · n`; the count is a label, so it never changes the noun. */
export function contactLabel(count: number): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return `Contacts · ${safe}`;
}

export interface MemberNameParts {
  readonly firstName: string;
  readonly lastName: string;
  readonly otherNames?: string | null;
}

/** First and last name, with `otherNames` used only when both are empty. */
export function memberName(member: MemberNameParts): string {
  const parts = [member.firstName.trim(), member.lastName.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return member.otherNames?.trim() ?? '';
}

/** Avatar initials from the first and last name, e.g. `KA`. */
export function memberInitials(member: MemberNameParts): string {
  const first = member.firstName.trim().charAt(0);
  const last = member.lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || '?';
}

export type SubscriptionKind = 'life_insurance' | 'credit_union';

export interface SubscriptionLike {
  readonly kind: SubscriptionKind;
  readonly scope: 'individual' | 'household';
  readonly status: 'active' | 'ended';
  readonly role: 'policyholder' | 'covered';
  readonly coveredCount: number;
}

/** The compact pill label: only the kind (FR-77). */
export function subscriptionLabel(kind: SubscriptionKind): string {
  return kind === 'life_insurance' ? 'Life' : 'Credit union';
}

/** The full subscription description, available from the pill's tooltip. */
export function subscriptionDescription(subscription: SubscriptionLike): string {
  const scope = subscription.scope === 'household' ? 'Household' : 'Individual';
  const role = subscription.role === 'policyholder' ? 'Policyholder' : 'Covered';
  const coverage =
    subscription.coveredCount === 0
      ? 'No coverage'
      : subscription.coveredCount === 1
        ? '1 covered member'
        : `${subscription.coveredCount} covered members`;
  const status = subscription.status === 'active' ? 'Active' : 'Ended';
  return `${subscriptionLabel(subscription.kind)} · ${scope} · ${role} · ${coverage} · ${status}`;
}
