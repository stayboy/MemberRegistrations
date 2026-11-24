import { EVENT_PERIOD_IDS, type EventPeriodId } from '../schemas/events.js';

/**
 * The three named periods (member-registrations-event-periods.md, "Named
 * periods"). They are declared in code because a fourth period - or a
 * definition that must change without a deploy - is the trigger to move this
 * into a catalogue table, not before.
 *
 * The catalogue is keyed by the wire ids the schema fixes, so a fourth id added
 * to `EVENT_PERIOD_IDS` fails the build here until its rule is written.
 *
 * A period is a **position in the calendar, and the position is ordinal**: its
 * rule names a cadence, which month it lands in, which week of that month and
 * which weekday (owner, 2026-11-24, the pentecostal basis). A week belongs to
 * the month its Sunday falls in, so week 1 is the week containing the month's
 * first Sunday and `last` is the final such week - a month with five Sundays
 * does not make a fifth week.
 *
 * **The week-start convention is a field on each period** (owner, 2026-11-24),
 * and it moves only the span: the Communion Sunday is the month's first Sunday
 * either way. Under a Monday start that Sunday closes the week, so week 1 is
 * Monday to Sunday (December 2026's first Sunday, the 6th, closes a week 1 that
 * begins on Monday 30 November); under a Sunday start it opens the week, so week
 * 1 is Sunday to Saturday (6-12 December). The seeded calendar is Monday-start.
 *
 * The names are the parish's own vocabulary, not system jargon - a reader who
 * does not know the calendar cannot infer them, so each carries a `definition`
 * in the parish's words:
 * - Communion Week is the week of the monthly communion service: week 1 of the
 *   cycle month, the seven days ending on its first Sunday.
 * - Gospel Week is the week before it, when ministries hold their meetings: the
 *   last week of the month before.
 * - Home Cells is that cycle's Monday, when the small groups meet - one date.
 * The system never reinterprets a name; the rule is what the resolver evaluates,
 * and a name that stops describing its rule is renamed with it.
 */

/** 0 = Sunday ... 6 = Saturday, as `Date#getUTCDay` counts them. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Which week of the month the position sits in. Ordinal, never a week count. */
export type PeriodWeek = 1 | 2 | 3 | 4 | 'last';

/** The weekday a week begins on; a field on each period, not a global setting. */
export type WeekStart = 'monday' | 'sunday';

interface PeriodRuleBase {
  /** `0` is the cycle month itself; `-1` is the month before it. */
  monthOffset: 0 | -1;
  week: PeriodWeek;
  /**
   * The week-start convention. It moves only the seven-day span: the Sunday
   * that places the week is the month's first (or last) Sunday under either.
   */
  weekStartsOn: WeekStart;
  /**
   * The weekday the parish's name refers to. A `week` rule always returns its
   * week's seven dates whatever this names; a `date` rule returns this weekday
   * inside that week.
   */
  weekday: Weekday;
  /** A `week` rule returns its seven dates; a `date` rule returns one of them. */
  kind: 'week' | 'date';
}

/**
 * One period's rule. `monthInQuarter` exists only on a quarterly cadence, so
 * the two shapes cannot be confused: a monthly rule carries no quarter position
 * and a quarterly one always does.
 */
export type PeriodRule =
  | ({ cadence: 'monthly' } & PeriodRuleBase)
  | ({ cadence: 'quarterly'; monthInQuarter: 1 | 2 | 3 } & PeriodRuleBase);

export interface NamedPeriod {
  id: EventPeriodId;
  name: string;
  /** The rule in words; the form shows it beside the choice. */
  definition: string;
  /** The rule the resolver evaluates. This, not the name, is the authority. */
  rule: PeriodRule;
}

const CATALOGUE: Record<EventPeriodId, NamedPeriod> = {
  'communion-week': {
    id: 'communion-week',
    name: 'Communion Week',
    definition:
      'The week of the monthly communion service: week 1 of the cycle month, the seven days ending on that month’s first Sunday.',
    rule: {
      cadence: 'monthly',
      monthOffset: 0,
      week: 1,
      weekStartsOn: 'monday',
      weekday: 0,
      kind: 'week',
    },
  },
  'gospel-week': {
    id: 'gospel-week',
    name: 'Gospel Week',
    definition:
      'The last week of the month before, when ministries hold their meetings: the week before Communion Week.',
    rule: {
      cadence: 'monthly',
      monthOffset: -1,
      week: 'last',
      weekStartsOn: 'monday',
      weekday: 0,
      kind: 'week',
    },
  },
  'home-cells': {
    id: 'home-cells',
    name: 'Home Cells',
    definition: 'The Monday of week 1 of the cycle month - the Monday of Communion Week, one date.',
    rule: {
      cadence: 'monthly',
      monthOffset: 0,
      week: 1,
      weekStartsOn: 'monday',
      weekday: 1,
      kind: 'date',
    },
  },
};

/** The catalogue in wire order, each period with its rule. */
export const PERIOD_CATALOGUE: readonly NamedPeriod[] = EVENT_PERIOD_IDS.map((id) => CATALOGUE[id]);

/** The catalogue as the contract carries it, served by `GET /v1/events/periods`. */
export const EVENT_PERIODS: readonly Pick<NamedPeriod, 'id' | 'name' | 'definition'>[] =
  PERIOD_CATALOGUE.map(({ id, name, definition }) => ({ id, name, definition }));

export function periodById(id: EventPeriodId): NamedPeriod {
  return CATALOGUE[id];
}

const DAY_MS = 86_400_000;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseCycle(cycle: string): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(cycle);
  if (!match) {
    throw new RangeError(`cycle must be a calendar month (YYYY-MM), received "${cycle}"`);
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** The month a position lands in, after `monthOffset` across a year boundary. */
function shiftedMonth(
  { year, month }: { year: number; month: number },
  offset: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The UTC instant of the month's first Sunday - the Sunday that places week 1. */
function firstSundayOf({ year, month }: { year: number; month: number }): number {
  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const weekdayOfFirst = new Date(firstOfMonth).getUTCDay();
  return firstOfMonth + ((7 - weekdayOfFirst) % 7) * DAY_MS;
}

/** The UTC instant of the month's last Sunday - the Sunday that places `last`. */
function lastSundayOf({ year, month }: { year: number; month: number }): number {
  const lastOfMonth = Date.UTC(year, month, 0); // day 0 of the next month
  return lastOfMonth - new Date(lastOfMonth).getUTCDay() * DAY_MS;
}

/** `Date#getUTCDay` of the weekday a period's weeks begin on. */
const WEEK_START_WEEKDAY: Record<WeekStart, Weekday> = { sunday: 0, monday: 1 };

/**
 * The instant the week placed by `sunday` begins: the Sunday itself under a
 * Sunday start, the Monday six days before it under a Monday start. Only the
 * span moves; the Sunday that places the week never does.
 */
function weekStartOfSunday(sunday: number, weekStartsOn: WeekStart): number {
  const daysBeforeSunday = (7 - WEEK_START_WEEKDAY[weekStartsOn]) % 7;
  return sunday - daysBeforeSunday * DAY_MS;
}

/** The first date of week 1, 2, 3, 4 or the last week of the month. */
function weekStart(
  month: { year: number; month: number },
  week: PeriodWeek,
  weekStartsOn: WeekStart,
): number {
  const sunday =
    week === 'last' ? lastSundayOf(month) : firstSundayOf(month) + (week - 1) * 7 * DAY_MS;
  return weekStartOfSunday(sunday, weekStartsOn);
}

/**
 * Resolves one rule against a cycle month to UTC calendar dates, in ascending
 * order. Pure: no clock, no timezone, so a cycle always resolves to the same
 * dates.
 *
 * A quarterly rule resolves only in the quarter month it names - `monthInQuarter`
 * is tested against the **cycle** month, before `monthOffset` moves it - and
 * every other cycle month resolves to no dates. Every seeded period is monthly.
 */
export function resolveRule(rule: PeriodRule, cycle: string): string[] {
  const month = parseCycle(cycle);
  if (rule.cadence === 'quarterly' && ((month.month - 1) % 3) + 1 !== rule.monthInQuarter) {
    return [];
  }

  const start = weekStart(shiftedMonth(month, rule.monthOffset), rule.week, rule.weekStartsOn);
  if (rule.kind === 'date') {
    const offset = (rule.weekday - WEEK_START_WEEKDAY[rule.weekStartsOn] + 7) % 7;
    return [iso(new Date(start + offset * DAY_MS))];
  }
  return Array.from({ length: 7 }, (_, offset) => iso(new Date(start + offset * DAY_MS)));
}

/**
 * Resolves one named period against a cycle month to UTC calendar dates, in
 * ascending order. There is no clock and no event timezone: the resolver is
 * pure, so a cycle always resolves to the same dates, and clients format (never
 * shift) them (AGENTS.md §4).
 *
 * The cycle is the calendar month the period resolves in, written `YYYY-MM`:
 * cycle `2027-01` resolves Communion Week to 28 Dec 2026 - 3 Jan 2027 under the
 * seeded Monday start, and Gospel Week to the last week of December 2026, so a
 * cycle can cross a month and a year boundary.
 */
export function resolve(period: EventPeriodId, cycle: string): string[] {
  return resolveRule(CATALOGUE[period].rule, cycle);
}
