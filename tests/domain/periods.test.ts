import { describe, expect, it } from 'vitest';
import {
  EVENT_PERIODS,
  periodById,
  resolve,
  resolveRule,
  type WeekStart,
} from '../../src/domain/periods.js';
import type { EventPeriodId } from '../../src/schemas/events.js';

/**
 * The period date table (AC 10). The expectations are enumerated per cycle
 * month by hand - read off a calendar, never derived with the resolver's own
 * arithmetic - so a changed rule fails here instead of agreeing with itself.
 *
 * The model is ordinal (member-registrations-event-periods.md, "Named periods").
 * A week belongs to the month its Sunday falls in, so:
 * - Communion Week is week 1 of the cycle month: the week containing that
 *   month's first Sunday.
 * - Gospel Week is the last week of the month before: the week containing that
 *   month's last Sunday, which is always the Sunday before Communion Sunday.
 * - Home Cells is the Monday of week 1 of the cycle month.
 *
 * `weekStartsOn` is a field on each period and moves only the seven-day span.
 * The seeded calendar is Monday-start, so `CASES` is a Monday-start table: week
 * 1 runs Monday to Sunday and the Communion Sunday is its last day. `SUNDAY_START`
 * is the same three rules with the convention flipped, where the Communion
 * Sunday is the first day of the span - the same Sunday either way.
 *
 * A cycle can cross a month and a year boundary. The cases cover a month that
 * begins on a Sunday (November 2026, whose Monday-start week 1 lies entirely in
 * October), a month that begins mid-week, months with five Sundays resolved
 * through `last`, both leap Februaries, and the December 2026 / January 2027
 * year boundary.
 */
interface PeriodCase {
  cycle: string;
  communionWeek: string[];
  gospelWeek: string[];
  homeCells: string[];
}

// Monday-start rows: the seeded convention.
const CASES: readonly PeriodCase[] = [
  // November 2026 begins on a Sunday (Sun 1 Nov; Sundays 1, 8, 15, 22, 29).
  // Its week 1 is the Monday-to-Sunday week ending on the 1st, so 26 Oct - 1 Nov
  // inside the month. October's last Sunday is the 25th, so Gospel is 19-25 Oct.
  {
    cycle: '2026-11',
    communionWeek: [
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ],
    gospelWeek: [
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ],
    homeCells: ['2026-10-26'],
  },
  // June 2026 begins on a Monday (Sundays 7, 14, 21, 28), so week 1 is 1-7 June;
  // May 2026 has five Sundays (3, 10, 17, 24, 31), so `last` is the 31st.
  {
    cycle: '2026-06',
    communionWeek: [
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
    ],
    gospelWeek: [
      '2026-05-25',
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
      '2026-05-31',
    ],
    homeCells: ['2026-06-01'],
  },
  // August 2026 begins on a Saturday and has five Sundays (2, 9, 16, 23, 30);
  // week 1 is the week ending on the first Sunday, the 2nd: 27 Jul - 2 Aug.
  {
    cycle: '2026-08',
    communionWeek: [
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ],
    gospelWeek: [
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ],
    homeCells: ['2026-07-27'],
  },
  // December 2026 begins on a Tuesday (Sundays 6, 13, 20, 27). The first Sunday
  // is the 6th, so Communion Week is 30 Nov - 6 Dec and Home Cells the 30th;
  // November 2026's last Sunday is the 29th, so Gospel is 23-29 Nov.
  {
    cycle: '2026-12',
    communionWeek: [
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ],
    gospelWeek: [
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ],
    homeCells: ['2026-11-30'],
  },
  // The year boundary: January 2027 begins on a Friday, its first Sunday is the
  // 3rd, so Communion Week is 28 Dec 2026 - 3 Jan 2027 and Home Cells 28 Dec;
  // Gospel Week is the last week of December 2026 (21-27 Dec).
  {
    cycle: '2027-01',
    communionWeek: [
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ],
    gospelWeek: [
      '2026-12-21',
      '2026-12-22',
      '2026-12-23',
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
      '2026-12-27',
    ],
    homeCells: ['2026-12-28'],
  },
  // December 2027 begins on a Wednesday (Sundays 5, 12, 19, 26); November 2027's
  // Sundays are 7, 14, 21, 28, so `last` is 28 Nov and week 1 opens 29 Nov.
  {
    cycle: '2027-12',
    communionWeek: [
      '2027-11-29',
      '2027-11-30',
      '2027-12-01',
      '2027-12-02',
      '2027-12-03',
      '2027-12-04',
      '2027-12-05',
    ],
    gospelWeek: [
      '2027-11-22',
      '2027-11-23',
      '2027-11-24',
      '2027-11-25',
      '2027-11-26',
      '2027-11-27',
      '2027-11-28',
    ],
    homeCells: ['2027-11-29'],
  },
  // A leap February as the cycle month: 1 Feb 2024 is a Thursday, first Sunday
  // the 4th, so week 1 is 29 Jan - 4 Feb; January 2024's last Sunday is the 28th.
  {
    cycle: '2024-02',
    communionWeek: [
      '2024-01-29',
      '2024-01-30',
      '2024-01-31',
      '2024-02-01',
      '2024-02-02',
      '2024-02-03',
      '2024-02-04',
    ],
    gospelWeek: [
      '2024-01-22',
      '2024-01-23',
      '2024-01-24',
      '2024-01-25',
      '2024-01-26',
      '2024-01-27',
      '2024-01-28',
    ],
    homeCells: ['2024-01-29'],
  },
  // A leap day inside Communion Week: February 2024's last Sunday is the 25th, so
  // week 1 of March is 26 Feb - 3 Mar 2024 and carries Thursday 29 February.
  {
    cycle: '2024-03',
    communionWeek: [
      '2024-02-26',
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
      '2024-03-02',
      '2024-03-03',
    ],
    gospelWeek: [
      '2024-02-19',
      '2024-02-20',
      '2024-02-21',
      '2024-02-22',
      '2024-02-23',
      '2024-02-24',
      '2024-02-25',
    ],
    homeCells: ['2024-02-26'],
  },
  // The second leap February: March 2028 begins on a Wednesday, first Sunday the
  // 5th, so week 1 is 28 Feb - 5 Mar 2028; February 2028's last Sunday is the 27th.
  {
    cycle: '2028-03',
    communionWeek: [
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
      '2028-03-02',
      '2028-03-03',
      '2028-03-04',
      '2028-03-05',
    ],
    gospelWeek: [
      '2028-02-21',
      '2028-02-22',
      '2028-02-23',
      '2028-02-24',
      '2028-02-25',
      '2028-02-26',
      '2028-02-27',
    ],
    homeCells: ['2028-02-28'],
  },
];

// The same three rules with `weekStartsOn: 'sunday'`: the Communion Sunday is the
// first day of the span, and Home Cells the Monday after it.
const SUNDAY_START: readonly PeriodCase[] = [
  // November 2026 begins on a Sunday: week 1 is 1-7 Nov, October's last Sunday is
  // the 25th, and Monday falls on the 2nd.
  {
    cycle: '2026-11',
    communionWeek: [
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ],
    gospelWeek: [
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ],
    homeCells: ['2026-11-02'],
  },
  // December 2026: first Sunday 6 Dec, so 6-12 Dec and Home Cells 7 Dec;
  // November 2026's last Sunday is 29 Nov.
  {
    cycle: '2026-12',
    communionWeek: [
      '2026-12-06',
      '2026-12-07',
      '2026-12-08',
      '2026-12-09',
      '2026-12-10',
      '2026-12-11',
      '2026-12-12',
    ],
    gospelWeek: [
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
    ],
    homeCells: ['2026-12-07'],
  },
  // January 2027: first Sunday 3 Jan, so 3-9 Jan and Home Cells 4 Jan; December
  // 2026's last Sunday is 27 Dec.
  {
    cycle: '2027-01',
    communionWeek: [
      '2027-01-03',
      '2027-01-04',
      '2027-01-05',
      '2027-01-06',
      '2027-01-07',
      '2027-01-08',
      '2027-01-09',
    ],
    gospelWeek: [
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ],
    homeCells: ['2027-01-04'],
  },
];

/** The seeded rule with its convention flipped - the same period, another span. */
function withWeekStart(id: EventPeriodId, weekStartsOn: WeekStart) {
  return { ...periodById(id).rule, weekStartsOn };
}

describe('named periods', () => {
  it('declares the three wire periods in catalogue order', () => {
    expect(EVENT_PERIODS.map((period) => period.id)).toEqual([
      'communion-week',
      'gospel-week',
      'home-cells',
    ]);
    expect(periodById('home-cells')).toMatchObject({
      name: 'Home Cells',
      definition:
        'The Monday of week 1 of the cycle month - the Monday of Communion Week, one date.',
    });
    // The wire shape is the three contract fields; the rule stays server-side.
    expect(Object.keys(EVENT_PERIODS[0]!).sort()).toEqual(['definition', 'id', 'name']);
  });

  it('declares each period as an ordinal position on a Monday-start calendar', () => {
    expect(periodById('communion-week').rule).toEqual({
      cadence: 'monthly',
      monthOffset: 0,
      week: 1,
      weekStartsOn: 'monday',
      weekday: 0,
      kind: 'week',
    });
    expect(periodById('gospel-week').rule).toEqual({
      cadence: 'monthly',
      monthOffset: -1,
      week: 'last',
      weekStartsOn: 'monday',
      weekday: 0,
      kind: 'week',
    });
    expect(periodById('home-cells').rule).toEqual({
      cadence: 'monthly',
      monthOffset: 0,
      week: 1,
      weekStartsOn: 'monday',
      weekday: 1,
      kind: 'date',
    });
  });

  it.each(CASES)('resolves cycle $cycle to its enumerated dates', (testCase) => {
    expect(resolve('communion-week', testCase.cycle)).toEqual(testCase.communionWeek);
    expect(resolve('gospel-week', testCase.cycle)).toEqual(testCase.gospelWeek);
    expect(resolve('home-cells', testCase.cycle)).toEqual(testCase.homeCells);
  });

  it('returns seven days for a week period, in order, and one for Home Cells', () => {
    for (const testCase of CASES) {
      for (const dates of [testCase.communionWeek, testCase.gospelWeek]) {
        expect(dates).toHaveLength(7);
        expect([...dates].sort()).toEqual(dates);
      }
      expect(testCase.homeCells).toHaveLength(1);
      expect(resolve('home-cells', testCase.cycle)).toHaveLength(1);
    }
  });

  it('anchors week 1 to the Sunday, so the month that owns the Sunday owns the week', () => {
    // Sun 1 Nov 2026: week 1 is the week whose Sunday is 1 November. Under the
    // seeded Monday start that span lies in October (26 Oct - 1 Nov), but the
    // Sunday - not the span's first day - is what places it.
    const communion = resolve('communion-week', '2026-11');
    expect(communion[6]).toBe('2026-11-01');
    expect(resolve('gospel-week', '2026-11').at(-1)).toBe('2026-10-25');
  });

  it('keeps Gospel Week one week before Communion Week', () => {
    for (const testCase of CASES) {
      const gospel = resolve('gospel-week', testCase.cycle);
      const communion = resolve('communion-week', testCase.cycle);
      const dayAfterGospel = new Date(Date.parse(`${gospel[6]}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect(dayAfterGospel).toBe(communion[0]);
    }
  });

  it('places Home Cells on the Monday of Communion Week', () => {
    for (const testCase of CASES) {
      const communion = resolve('communion-week', testCase.cycle);
      const homeCells = resolve('home-cells', testCase.cycle);
      expect(communion).toContain(homeCells[0]);
      expect(new Date(`${homeCells[0]}T00:00:00Z`).getUTCDay()).toBe(1); // Monday
    }
  });

  it('takes no clock: the same cycle resolves to the same dates', () => {
    expect(resolve('communion-week', '2027-01')).toEqual(resolve('communion-week', '2027-01'));
  });

  it('refuses a cycle that is not a calendar month', () => {
    expect(() => resolve('communion-week', '2027-13')).toThrow(RangeError);
    expect(() => resolve('communion-week', 'January 2027')).toThrow(RangeError);
    expect(() => resolveRule(periodById('home-cells').rule, '2027-00')).toThrow(RangeError);
  });

  it('resolves a quarterly rule only in the quarter month it names', () => {
    const quarterly = {
      cadence: 'quarterly',
      monthInQuarter: 2,
      monthOffset: 0,
      week: 1,
      weekStartsOn: 'monday',
      weekday: 0,
      kind: 'week',
    } as const;

    // February, May, August and November are the second month of a quarter.
    expect(resolveRule(quarterly, '2027-02')[0]).toBe('2027-02-01');
    expect(resolveRule(quarterly, '2027-08')[0]).toBe('2027-07-26');
    expect(resolveRule(quarterly, '2027-01')).toEqual([]);
    expect(resolveRule(quarterly, '2027-03')).toEqual([]);
  });
});

describe('the week-start convention', () => {
  it.each(SUNDAY_START)(
    'resolves cycle $cycle under a Sunday start to its enumerated dates',
    (testCase) => {
      expect(resolveRule(withWeekStart('communion-week', 'sunday'), testCase.cycle)).toEqual(
        testCase.communionWeek,
      );
      expect(resolveRule(withWeekStart('gospel-week', 'sunday'), testCase.cycle)).toEqual(
        testCase.gospelWeek,
      );
      expect(resolveRule(withWeekStart('home-cells', 'sunday'), testCase.cycle)).toEqual(
        testCase.homeCells,
      );
    },
  );

  it('keeps the Communion Sunday and moves only the seven-day span', () => {
    for (const testCase of SUNDAY_START) {
      const monday = resolveRule(withWeekStart('communion-week', 'monday'), testCase.cycle);
      const sunday = resolveRule(withWeekStart('communion-week', 'sunday'), testCase.cycle);

      // The month's first Sunday: the last day under Monday start, the first
      // under Sunday start.
      expect(monday[6]).toBe(testCase.communionWeek[0]);
      expect(sunday[0]).toBe(testCase.communionWeek[0]);
      expect(monday).not.toEqual(sunday);
      // Monday start opens the span six days before that Sunday.
      expect(monday[0]).toBe(
        new Date(Date.parse(`${sunday[0]}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10),
      );
    }
  });

  it('follows each row’s own convention for Home Cells', () => {
    for (const testCase of SUNDAY_START) {
      const mondayWeek = resolveRule(withWeekStart('communion-week', 'monday'), testCase.cycle);
      const sundayWeek = resolveRule(withWeekStart('communion-week', 'sunday'), testCase.cycle);
      const mondayStart = resolveRule(withWeekStart('home-cells', 'monday'), testCase.cycle);
      const sundayStart = resolveRule(withWeekStart('home-cells', 'sunday'), testCase.cycle);

      // A Monday opens a Monday-start week; in a Sunday-start week it is the
      // second day. Both are the Monday inside that row's Communion Week.
      expect(mondayStart[0]).toBe(mondayWeek[0]);
      expect(sundayStart[0]).toBe(sundayWeek[1]);
      expect(mondayStart[0]).not.toBe(sundayStart[0]);
      expect(sundayStart[0]).toBe(testCase.homeCells[0]);
    }
  });

  it('moves December 2026 by the convention, as the spec states', () => {
    // Communion Sunday is 6 Dec 2026 either way: 30 Nov - 6 Dec on Monday start,
    // 6-12 Dec on Sunday start, with Home Cells on the 30th and the 7th.
    expect(resolve('communion-week', '2026-12')).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ]);
    expect(resolve('home-cells', '2026-12')).toEqual(['2026-11-30']);
    expect(resolveRule(withWeekStart('communion-week', 'sunday'), '2026-12')).toEqual([
      '2026-12-06',
      '2026-12-07',
      '2026-12-08',
      '2026-12-09',
      '2026-12-10',
      '2026-12-11',
      '2026-12-12',
    ]);
    expect(resolveRule(withWeekStart('home-cells', 'sunday'), '2026-12')).toEqual(['2026-12-07']);
  });
});
