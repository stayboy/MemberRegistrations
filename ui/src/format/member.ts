/**
 * Formatting helpers for the members grid. Most API dates use the shared
 * preference formatter, but the attendance annotation is the one documented
 * exception: FR-76/AC-41 and the date/time spec keep it compact and fixed.
 */

import type { Gender } from '../api/members';
import { genderLabel } from './member-form';

const ATTENDANCE_MONTHS_SHORT = [
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

const ATTENDANCE_MONTHS_LONG = [
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

interface AttendanceDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parseAttendanceDate(value: string | null | undefined): AttendanceDate | null {
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

/**
 * FR-76/AC-41 and the date/time spec's documented exception: the members-grid
 * attendance annotation stays `DD-Mon-YY` and deliberately ignores the display
 * preference. This helper is private to the two attendance formatters.
 */
function formatAttendanceCompactDate(value: string | null | undefined): string {
  const date = parseAttendanceDate(value);
  if (!date) return '';
  const year = String(date.year % 100).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${day}-${ATTENDANCE_MONTHS_SHORT[date.month - 1]}-${year}`;
}

/** The tooltip keeps a fixed full date, as FR-76 requires, not the preference. */
function formatAttendanceLongDate(value: string | null | undefined): string {
  const date = parseAttendanceDate(value);
  if (!date) return '';
  return `${date.day} ${ATTENDANCE_MONTHS_LONG[date.month - 1]} ${date.year}`;
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
 * date line (FR-76/AC-41).
 */
export function formatAttendance(summary: AttendanceLike | null | undefined): string {
  if (!summary) return 'No attendance yet';

  const counts = `${summary.attended}/${summary.expected}`;
  const last = formatAttendanceCompactDate(summary.lastAttendedOn);
  return last ? `${counts} (${last})` : counts;
}

/** The accessible tooltip content for the attendance cell (FR-76/FR-77). */
export function attendanceDescription(summary: AttendanceLike | null | undefined): string {
  if (!summary) return 'No attendance yet';

  const series = summary.seriesName?.trim();
  const prefix = series ? `${series} · ` : '';
  const last = formatAttendanceLongDate(summary.lastAttendedOn);
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

export interface MemberLabelParts extends MemberNameParts {
  readonly gender?: Gender;
  readonly age?: number | null;
}

/**
 * The shared identity label (FR-22a): `FullName (Gender, Ny)`. An undisclosed
 * or missing gender is omitted, a null age is omitted, and both missing leaves
 * the plain name. `otherNames`, `alias` and `maidenName` never enter the label.
 */
export function memberLabel(member: MemberLabelParts): string {
  const name = memberName(member);
  if (!name) return '';

  const parts: string[] = [];
  if (member.gender && member.gender !== 'undisclosed') parts.push(genderLabel(member.gender));
  if (member.age !== null && member.age !== undefined) parts.push(`${member.age}y`);
  return parts.length > 0 ? `${name} (${parts.join(', ')})` : name;
}

/**
 * The label for DTOs that carry a composed `name` (relationships, officers,
 * roster rows, shepherding history) rather than the name parts.
 */
export function memberLabelFromName(
  name: string,
  gender?: Gender,
  age?: number | null,
): string {
  return memberLabel({ firstName: name, lastName: '', gender, age });
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
