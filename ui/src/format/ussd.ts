import type { EventItem } from '../api/events';
import type { CodePurpose, CodeStatus, Headcount, HeadcountMode } from '../api/ussd';
import { shiftUtcDate } from './date-window';

/**
 * Pure helpers for the USSD operator pages. The activity rules mirror the USSD
 * machine (`src/ussd/services.ts#activitiesBetween`): only applicable events,
 * ordered date → priority tier → start time → event number, with the same
 * zero-events-today and two-week next-events states.
 */

export interface ActivityViewer {
  readonly isPresbyter: boolean;
  /** The member's active ministry codes, as the member detail returns them. */
  readonly ministries: readonly string[];
}

export interface Activity {
  readonly eventId: string;
  readonly eventNo: string | null;
  readonly name: string;
  readonly sessionDate: string;
  readonly startTime: string;
  /** 0 = the viewer's ministry, 1 = presbyter-only, 2 = general. */
  readonly priority: number;
  readonly presbyterOnly: boolean;
  readonly ministryName: string | null;
}

const DAY_MS = 86_400_000;
export const ACTIVITY_HORIZON_DAYS = 14;
export const ACTIVITY_WEEK_DAYS = 6;

export function activityPageSize(provider: 'nalo' | 'hmac'): number {
  return provider === 'nalo' ? 2 : 3;
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function isEligible(event: EventItem, viewer: ActivityViewer | null): boolean {
  if (event.presbyterOnly && !viewer?.isPresbyter) return false;
  if (event.ministry) {
    if (!viewer) return false;
    return viewer.ministries.includes(event.ministry.code);
  }
  return true;
}

function priorityOf(event: EventItem, viewer: ActivityViewer | null): number {
  if (event.ministry && viewer?.ministries.includes(event.ministry.code)) return 0;
  if (event.presbyterOnly) return 1;
  return 2;
}

function compareActivities(left: Activity, right: Activity): number {
  if (left.sessionDate !== right.sessionDate) {
    return left.sessionDate < right.sessionDate ? -1 : 1;
  }
  if (left.priority !== right.priority) return left.priority - right.priority;
  if (left.startTime !== right.startTime) return left.startTime < right.startTime ? -1 : 1;
  if (left.eventNo !== right.eventNo) {
    if (left.eventNo === null) return 1;
    if (right.eventNo === null) return -1;
    return left.eventNo.localeCompare(right.eventNo, undefined, { numeric: true });
  }
  return left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0;
}

/**
 * Expands the event list into one row per applicable session. The event list
 * already overlaps the requested window; a cancelled event or session is never
 * offered, and ministry/presbyter-only eligibility is the same rule the USSD
 * machine applies.
 */
export function activitiesFromEvents(
  events: readonly EventItem[],
  viewer: ActivityViewer | null,
): Activity[] {
  const rows: Activity[] = [];
  for (const event of events) {
    if (event.status === 'cancelled' || event.status === 'archived') continue;
    if (!isEligible(event, viewer)) continue;
    for (const session of event.sessions) {
      if (session.status === 'cancelled') continue;
      rows.push({
        eventId: event.id,
        eventNo: event.eventNo,
        name: event.name,
        sessionDate: session.date,
        startTime: session.startTime,
        priority: priorityOf(event, viewer),
        presbyterOnly: event.presbyterOnly,
        ministryName: event.ministry?.name ?? null,
      });
    }
  }
  return rows.sort(compareActivities);
}

export function activitiesOn(all: readonly Activity[], date: string): Activity[] {
  return all.filter((activity) => activity.sessionDate === date);
}

/** The week list opened by `2 This week`: the selected day plus six. */
export function activitiesThisWeek(all: readonly Activity[], date: string): Activity[] {
  const to = shiftUtcDate(date, ACTIVITY_WEEK_DAYS) ?? date;
  return all.filter((activity) => activity.sessionDate >= date && activity.sessionDate <= to);
}

export interface NextActivities {
  readonly date: string;
  readonly count: number;
  readonly days: number;
}

/**
 * The next applicable day within the two-week horizon, used by the
 * zero-events-today prompt. `null` means `No upcoming events`.
 */
export function nextActivities(
  all: readonly Activity[],
  date: string,
  horizonDays = ACTIVITY_HORIZON_DAYS,
): NextActivities | null {
  const limit = shiftUtcDate(date, horizonDays) ?? date;
  const within = all.filter(
    (activity) => activity.sessionDate > date && activity.sessionDate <= limit,
  );
  const first = within[0];
  if (!first) return null;
  return {
    date: first.sessionDate,
    count: within.filter((activity) => activity.sessionDate === first.sessionDate).length,
    days: dayDiff(date, first.sessionDate),
  };
}

/** `1 event tomorrow`, `2 events in 2 days`: the USSD zero-state line. */
export function nextActivitiesLine(next: NextActivities): string {
  const noun = next.count === 1 ? 'event' : 'events';
  const when = next.days === 1 ? 'tomorrow' : `in ${next.days} days`;
  return `${next.count} ${noun} ${when}`;
}

export function activityCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'event' : 'events'}`;
}

export const HEADCOUNT_MODE_OPTIONS: readonly {
  readonly value: HeadcountMode;
  readonly label: string;
}[] = [
  { value: 'adults', label: 'Adult service' },
  { value: 'children', label: 'Children service' },
  { value: 'mixed', label: 'Mixed service' },
];

export function headcountModeLabel(mode: HeadcountMode): string {
  return HEADCOUNT_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

export type HeadcountFieldKey =
  | 'adultMale'
  | 'adultFemale'
  | 'adultUnspecified'
  | 'childMale'
  | 'childFemale'
  | 'childUnspecified';

export interface HeadcountField {
  readonly key: HeadcountFieldKey;
  readonly label: string;
}

const ADULT_MALE: HeadcountField = { key: 'adultMale', label: 'Adult men' };
const ADULT_FEMALE: HeadcountField = { key: 'adultFemale', label: 'Adult women' };
const ADULTS: HeadcountField = { key: 'adultUnspecified', label: 'Adults' };
const CHILD_MALE: HeadcountField = { key: 'childMale', label: 'Boys' };
const CHILD_FEMALE: HeadcountField = { key: 'childFemale', label: 'Girls' };
const CHILDREN: HeadcountField = { key: 'childUnspecified', label: 'Children' };

/**
 * The three-number entry, four in Mixed. Adult service counts Adult men, Adult
 * women and Children; children service counts Boys, Girls and Adults in that
 * order. Mixed splits both and never shows an "(unspecified)" bucket.
 */
export function headcountFields(mode: HeadcountMode): readonly HeadcountField[] {
  if (mode === 'adults') return [ADULT_MALE, ADULT_FEMALE, CHILDREN];
  if (mode === 'children') return [CHILD_MALE, CHILD_FEMALE, ADULTS];
  return [ADULT_MALE, ADULT_FEMALE, CHILD_MALE, CHILD_FEMALE];
}

export type HeadcountFormValues = Record<HeadcountFieldKey, string>;

export function emptyHeadcountForm(): HeadcountFormValues {
  return {
    adultMale: '',
    adultFemale: '',
    adultUnspecified: '',
    childMale: '',
    childFemale: '',
    childUnspecified: '',
  };
}

export function headcountFormFrom(row: Headcount): HeadcountFormValues {
  return {
    adultMale: String(row.adultMale),
    adultFemale: String(row.adultFemale),
    adultUnspecified: String(row.adultUnspecified),
    childMale: String(row.childMale),
    childFemale: String(row.childFemale),
    childUnspecified: String(row.childUnspecified),
  };
}

/** The bucket line for one observation, for example `AM 62 · AF 71 · C? 9`. */
export function headcountBucketSummary(row: Headcount): string {
  const parts: string[] = [];
  if (row.adultMale) parts.push(`AM ${row.adultMale}`);
  if (row.adultFemale) parts.push(`AF ${row.adultFemale}`);
  if (row.adultUnspecified) parts.push(`A? ${row.adultUnspecified}`);
  if (row.childMale) parts.push(`CM ${row.childMale}`);
  if (row.childFemale) parts.push(`CF ${row.childFemale}`);
  if (row.childUnspecified) parts.push(`C? ${row.childUnspecified}`);
  return parts.length === 0 ? 'All zero' : parts.join(' · ');
}

export interface HeadcountPayload {
  readonly adultMale: number;
  readonly adultFemale: number;
  readonly adultUnspecified: number;
  readonly childMale: number;
  readonly childFemale: number;
  readonly childUnspecified: number;
}

/**
 * Converts the visible fields into the six-bucket body, zeroing the buckets the
 * selected mode does not use. Invalid input returns the message the caller
 * shows inline instead of sending a request the API would reject.
 */
export function headcountPayload(
  mode: HeadcountMode,
  values: HeadcountFormValues,
): { readonly payload: HeadcountPayload } | { readonly error: string } {
  const payload: Record<HeadcountFieldKey, number> = {
    adultMale: 0,
    adultFemale: 0,
    adultUnspecified: 0,
    childMale: 0,
    childFemale: 0,
    childUnspecified: 0,
  };

  for (const field of headcountFields(mode)) {
    const raw = values[field.key].trim();
    if (raw === '') continue;
    if (!/^\d+$/.test(raw)) return { error: `${field.label} must be a whole number.` };
    const parsed = Number(raw);
    if (parsed > 10_000) return { error: `${field.label} must be 10,000 or fewer.` };
    payload[field.key] = parsed;
  }

  const total = Object.values(payload).reduce((sum, value) => sum + value, 0);
  if (total > 30_000) return { error: 'The six buckets must not exceed 30,000.' };
  return { payload };
}

/** A local `datetime-local` value for an instant; the API receives the ISO instant. */
export function toDateTimeLocal(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Converts a `datetime-local` value to an ISO instant, or `''` when invalid. */
export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function codePurposeLabel(purpose: CodePurpose): string {
  return purpose === 'attendance_punch' ? 'Attendance punch' : 'Registration';
}

export function codeStatusLabel(status: CodeStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'used') return 'Used';
  if (status === 'expired') return 'Expired';
  return 'Voided';
}

/** The API issues a code with a 15-minute TTL (`attendance-codes.ts`). */
export const CODE_TTL_MINUTES = 15;

export function codesRemainingLabel(expiresAt: string, now: Date = new Date()): string {
  const remaining = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Expired';
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  return `${minutes} min left of ${CODE_TTL_MINUTES}`;
}
