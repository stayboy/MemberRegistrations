import type { EventItem } from '../api/events';
import type {
  CodePurpose,
  CodeStatus,
  Headcount,
  HeadcountLineInput,
  HeadcountReadMode,
} from '../api/ussd';
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

export type HeadcountEntryMode = 'adults' | 'children';

export const HEADCOUNT_MODE_OPTIONS: readonly {
  readonly value: HeadcountEntryMode;
  readonly label: string;
}[] = [
  { value: 'adults', label: 'Adult service' },
  { value: 'children', label: 'Children service' },
];

const HEADCOUNT_MODE_LABELS: Record<HeadcountReadMode, string> = {
  adults: 'Adult service',
  children: 'Children service',
  visitors: 'Visitors',
  presbyters: 'Presbyters',
  mixed: 'Mixed (retired)',
};

export function headcountModeLabel(mode: HeadcountReadMode): string {
  return HEADCOUNT_MODE_LABELS[mode] ?? mode;
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

/** The bucket code behind each entry field, as the mode's reference rows declare it. */
const BUCKET_CODES: Record<HeadcountFieldKey, string> = {
  adultMale: 'adult-male',
  adultFemale: 'adult-female',
  adultUnspecified: 'adult-unspecified',
  childMale: 'child-male',
  childFemale: 'child-female',
  childUnspecified: 'child-unspecified',
};

/**
 * The three-number entry. Adult service counts Adult men, Adult women and
 * Children; children service counts Boys, Girls and Adults in that order. The
 * visitors and presbyters lanes are entry surfaces for the next round.
 */
export function headcountFields(mode: HeadcountEntryMode): readonly HeadcountField[] {
  return mode === 'children' ? [CHILD_MALE, CHILD_FEMALE, ADULTS] : [ADULT_MALE, ADULT_FEMALE, CHILDREN];
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

/** Fills the form from the observation's lines; other lanes' buckets are ignored. */
export function headcountFormFrom(row: Headcount): HeadcountFormValues {
  const values = emptyHeadcountForm();
  for (const line of row.lines) {
    const key = (Object.keys(BUCKET_CODES) as HeadcountFieldKey[]).find(
      (candidate) => BUCKET_CODES[candidate] === line.code,
    );
    if (key) values[key] = String(line.count);
  }
  return values;
}

/** The bucket line for one observation, from the reference labels it carries. */
export function headcountBucketSummary(row: Headcount): string {
  return row.lines.length === 0
    ? 'All zero'
    : row.lines.map((line) => `${line.label} ${line.count}`).join(' · ');
}

/** The body of a record or correction: the lines the API validates against the mode. */
export function headcountPayload(
  mode: HeadcountEntryMode,
  values: HeadcountFormValues,
): { readonly payload: { readonly lines: HeadcountLineInput[] } } | { readonly error: string } {
  const lines: HeadcountLineInput[] = [];
  for (const field of headcountFields(mode)) {
    const raw = values[field.key].trim();
    if (raw === '') continue;
    if (!/^\d+$/.test(raw)) return { error: `${field.label} must be a whole number.` };
    const count = Number(raw);
    if (count > 10_000) return { error: `${field.label} must be 10,000 or fewer.` };
    lines.push({ code: BUCKET_CODES[field.key], count });
  }

  const total = lines.reduce((sum, line) => sum + line.count, 0);
  if (total > 30_000) return { error: 'The lines must not exceed 30,000.' };
  return { payload: { lines } };
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
