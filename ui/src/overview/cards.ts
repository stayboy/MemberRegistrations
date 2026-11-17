import type { MemberAttendanceSeries, MemberCalls, MemberDetail } from '../api/members';

/**
 * The overview's four cards (FR-29, AC-12), as pure data. The component renders
 * this model; every count, tie-break and empty copy is decided here so the
 * behaviour can be tested without a DOM. All calendar arithmetic is UTC.
 */

const UTC_MONTHS = [
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

export type OverviewCardKey = 'attended' | 'last-attended' | 'shepherd-calls' | 'most-attended';

export interface OverviewCard {
  readonly key: OverviewCardKey;
  readonly label: string;
  /** One entry per visible value line. */
  readonly lines: readonly string[];
  readonly caption: string;
  /** The whole card as one sentence - `Label: value` - and the card's accessible name. */
  readonly copy: string;
  /** True when the card shows its stated empty copy instead of a value. */
  readonly empty: boolean;
}

export interface OverviewCardOptions {
  readonly formatDate: (value: string | null | undefined) => string;
  /** Defaults to now; tests pass a fixed instant. */
  readonly now?: Date;
}

export interface QuarterMonthCounts {
  readonly quarterLabel: string;
  readonly quarterCount: number;
  readonly monthLabel: string;
  readonly monthCount: number;
  /** The number of attendance rows the counts were read from, series and standalone. */
  readonly seriesRows: number;
}

interface CalendarDate {
  readonly year: number;
  readonly month: number;
}

function parseUtcDate(value: string | null | undefined): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month };
}

function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

function* entriesOf(
  attendance: readonly MemberAttendanceSeries[],
): Generator<{ entry: MemberAttendanceSeries['entries'][number]; series: MemberAttendanceSeries }> {
  for (const series of attendance) {
    for (const entry of series.entries) yield { entry, series };
  }
}

/**
 * The first card's two counts: entries whose UTC calendar date falls in the
 * current UTC quarter and in the current UTC month. A date outside the current
 * year cannot match either count.
 */
export function quarterMonthCounts(
  attendance: readonly MemberAttendanceSeries[],
  now: Date = new Date(),
): QuarterMonthCounts {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const quarter = quarterOf(month);

  let quarterCount = 0;
  let monthCount = 0;
  for (const { entry } of entriesOf(attendance)) {
    const date = parseUtcDate(entry.date);
    if (!date || date.year !== year) continue;
    if (quarterOf(date.month) === quarter) quarterCount += 1;
    if (date.month === month) monthCount += 1;
  }

  return {
    quarterLabel: `Q${quarter} ${year}`,
    quarterCount,
    monthLabel: UTC_MONTHS[month - 1]!,
    monthCount,
    seriesRows: attendance.length,
  };
}

export interface LastAttendedEntry {
  readonly eventName: string;
  readonly date: string;
}

/**
 * The latest entry across every series and standalone row. An equal date breaks
 * by `eventName` ascending, so the card is stable whatever order the API uses.
 */
export function lastAttended(
  attendance: readonly MemberAttendanceSeries[],
): LastAttendedEntry | null {
  let latest: LastAttendedEntry | null = null;

  for (const { entry } of entriesOf(attendance)) {
    if (!latest || entry.date > latest.date) {
      latest = { eventName: entry.eventName, date: entry.date };
      continue;
    }
    if (entry.date === latest.date && entry.eventName < latest.eventName) {
      latest = { eventName: entry.eventName, date: entry.date };
    }
  }

  return latest;
}

export interface MostAttendedGroup {
  /** The recurring series name, or the standalone event's name. */
  readonly label: string;
  readonly count: number;
  /** The group's latest attended UTC date, the first tie-break. */
  readonly latestDate: string;
}

/**
 * Group entries by `seriesId` for recurring rows and by `eventId` for standalone
 * rows (`seriesId: null`). A recurring group is labelled by its row's
 * `seriesName`; a standalone group by its entries' `eventName`. Sorting is count
 * descending, then latest attended date descending, then label ascending.
 */
export function mostAttended(
  attendance: readonly MemberAttendanceSeries[],
): MostAttendedGroup | null {
  const groups = new Map<string, MostAttendedGroup>();

  for (const { entry, series } of entriesOf(attendance)) {
    const key = series.seriesId ?? entry.eventId;
    const label =
      series.seriesId !== null ? (series.seriesName ?? series.seriesId) : entry.eventName;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { label, count: 1, latestDate: entry.date });
      continue;
    }

    groups.set(key, {
      label: existing.label,
      count: existing.count + 1,
      latestDate: entry.date > existing.latestDate ? entry.date : existing.latestDate,
    });
  }

  const ranked = [...groups.values()].sort(
    (left, right) =>
      right.count - left.count ||
      (left.latestDate === right.latestDate ? 0 : left.latestDate < right.latestDate ? 1 : -1) ||
      (left.label === right.label ? 0 : left.label < right.label ? -1 : 1),
  );

  return ranked[0] ?? null;
}

export interface ShepherdCallsCard {
  readonly label: 'Shepherd calls';
  /** The visible value: the drawing's `<n> · last reached <date>` branch. */
  readonly value: string;
  /** `Label: value`; the prefix stays in every branch (FR-29). */
  readonly copy: string;
  readonly empty: boolean;
}

/**
 * `calls` is the current assignment's all-time projection. The `Shepherd calls:`
 * prefix is part of every branch - `No calls logged`, `<n> attempts · no one
 * reached`, or `<n> · last reached <date>` (FR-29).
 */
export function shepherdCallsCard(
  calls: MemberCalls,
  formatDate: (value: string | null | undefined) => string,
): ShepherdCallsCard {
  const attempts = Number.isFinite(calls.attempts) ? Math.max(0, Math.trunc(calls.attempts)) : 0;

  if (attempts === 0)
    return {
      label: 'Shepherd calls',
      value: 'No calls logged',
      copy: 'Shepherd calls: No calls logged',
      empty: true,
    };
  if (!calls.lastReachedOn) {
    return {
      label: 'Shepherd calls',
      value: `${attempts} attempts · no one reached`,
      copy: `Shepherd calls: ${attempts} attempts · no one reached`,
      empty: false,
    };
  }

  const reached = formatDate(calls.lastReachedOn);
  return {
    label: 'Shepherd calls',
    value: `${attempts} · last reached ${reached}`,
    copy: `Shepherd calls: ${attempts} · last reached ${reached}`,
    empty: false,
  };
}

/** The four cards in the drawing's order. */
export function overviewCards(
  member: Pick<MemberDetail, 'attendance' | 'calls'>,
  { formatDate, now = new Date() }: OverviewCardOptions,
): readonly OverviewCard[] {
  const counts = quarterMonthCounts(member.attendance, now);
  const last = lastAttended(member.attendance);
  const most = mostAttended(member.attendance);
  const calls = shepherdCallsCard(member.calls, formatDate);

  return [
    {
      key: 'attended',
      label: 'Attended',
      lines: [
        `${counts.quarterLabel} · ${counts.quarterCount}`,
        `${counts.monthLabel} · ${counts.monthCount}`,
      ],
      caption: `UTC calendar dates across ${counts.seriesRows} series rows`,
      copy: `Attended: ${counts.quarterLabel} · ${counts.quarterCount} · ${counts.monthLabel} · ${counts.monthCount}`,
      empty: false,
    },
    {
      key: 'last-attended',
      label: 'Last attended',
      lines: last ? [last.eventName, formatDate(last.date)] : ['No attendance recorded'],
      caption: 'Latest entry; ties by event name',
      copy: last
        ? `Last attended: ${last.eventName} · ${formatDate(last.date)}`
        : 'Last attended: No attendance recorded',
      empty: last === null,
    },
    {
      key: 'shepherd-calls',
      label: calls.label,
      lines: [calls.value],
      caption: 'Current assignment, all-time',
      copy: calls.copy,
      empty: calls.empty,
    },
    {
      key: 'most-attended',
      label: 'Most attended',
      lines: most
        ? [`${most.label} · ${most.count} ${most.count === 1 ? 'time' : 'times'}`]
        : ['No attendance recorded'],
      caption: 'Grouped by series; standalone by event',
      copy: most
        ? `Most attended: ${most.label} · ${most.count} ${most.count === 1 ? 'time' : 'times'}`
        : 'Most attended: No attendance recorded',
      empty: most === null,
    },
  ];
}

export interface ContactsAction {
  readonly label: string;
  readonly show: boolean;
}

/**
 * The tab row's contacts control (FR-29): `n` is the detail's `contactCount`
 * (owned and linked rows), never the length of the values array, which is the
 * count the operator may not see. Zero renders plain `No contacts`.
 */
export function contactsAction(contactCount: number): ContactsAction {
  const count = Number.isFinite(contactCount) ? Math.max(0, Math.trunc(contactCount)) : 0;
  return count > 0
    ? { label: `View Contacts (${count})`, show: true }
    : { label: 'No contacts', show: false };
}
