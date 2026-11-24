import { describe, expect, it } from 'vitest';
import { EVENT_PERIODS, periodById, resolve } from '../../src/domain/periods.js';

/**
 * The period date table (AC 10). The expectations are enumerated per cycle
 * month, never derived with the resolver's own arithmetic, so a changed rule
 * fails here instead of agreeing with itself.
 *
 * The cycle is the month of the Communion Sunday the week precedes, so a cycle
 * can cross a month boundary and a year boundary.
 */
interface PeriodCase {
  cycle: string;
  communionWeek: string[];
  gospelWeek: string[];
  homeCells: string[];
}

const CASES: readonly PeriodCase[] = [
  // The cycle month starts on a Sunday, so its week is entirely in the month
  // before it.
  {
    cycle: '2026-11',
    communionWeek: [
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ],
    gospelWeek: [
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ],
    homeCells: ['2026-10-26'],
  },
  // A non-leap February at the end of the window; the week spans two months.
  {
    cycle: '2026-03',
    communionWeek: [
      '2026-02-22',
      '2026-02-23',
      '2026-02-24',
      '2026-02-25',
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
    ],
    gospelWeek: [
      '2026-02-15',
      '2026-02-16',
      '2026-02-17',
      '2026-02-18',
      '2026-02-19',
      '2026-02-20',
      '2026-02-21',
    ],
    homeCells: ['2026-02-23'],
  },
  {
    cycle: '2026-12',
    communionWeek: [
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
    ],
    gospelWeek: [
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
    ],
    homeCells: ['2026-11-30'],
  },
  // The year boundary: December 2026 into January 2027.
  {
    cycle: '2027-01',
    communionWeek: [
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ],
    gospelWeek: [
      '2026-12-20',
      '2026-12-21',
      '2026-12-22',
      '2026-12-23',
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
    ],
    homeCells: ['2026-12-28'],
  },
  {
    cycle: '2027-12',
    communionWeek: [
      '2027-11-28',
      '2027-11-29',
      '2027-11-30',
      '2027-12-01',
      '2027-12-02',
      '2027-12-03',
      '2027-12-04',
    ],
    gospelWeek: [
      '2027-11-21',
      '2027-11-22',
      '2027-11-23',
      '2027-11-24',
      '2027-11-25',
      '2027-11-26',
      '2027-11-27',
    ],
    homeCells: ['2027-11-29'],
  },
  // A leap year's year boundary.
  {
    cycle: '2028-01',
    communionWeek: [
      '2027-12-26',
      '2027-12-27',
      '2027-12-28',
      '2027-12-29',
      '2027-12-30',
      '2027-12-31',
      '2028-01-01',
    ],
    gospelWeek: [
      '2027-12-19',
      '2027-12-20',
      '2027-12-21',
      '2027-12-22',
      '2027-12-23',
      '2027-12-24',
      '2027-12-25',
    ],
    homeCells: ['2027-12-27'],
  },
  // A leap February inside the window: the Thursday is 29 February.
  {
    cycle: '2024-03',
    communionWeek: [
      '2024-02-25',
      '2024-02-26',
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
      '2024-03-02',
    ],
    gospelWeek: [
      '2024-02-18',
      '2024-02-19',
      '2024-02-20',
      '2024-02-21',
      '2024-02-22',
      '2024-02-23',
      '2024-02-24',
    ],
    homeCells: ['2024-02-26'],
  },
  {
    cycle: '2028-03',
    communionWeek: [
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
      '2028-03-02',
      '2028-03-03',
      '2028-03-04',
    ],
    gospelWeek: [
      '2028-02-20',
      '2028-02-21',
      '2028-02-22',
      '2028-02-23',
      '2028-02-24',
      '2028-02-25',
      '2028-02-26',
    ],
    homeCells: ['2028-02-28'],
  },
];

describe('named periods', () => {
  it('declares the three wire periods in catalogue order', () => {
    expect(EVENT_PERIODS.map((period) => period.id)).toEqual([
      'communion-week',
      'gospel-week',
      'home-cells',
    ]);
    expect(periodById('home-cells')).toMatchObject({
      name: 'Home Cells',
      definition: 'The Monday of Communion Week.',
    });
  });

  it.each(CASES)('resolves cycle $cycle to its enumerated dates', (testCase) => {
    expect(resolve('communion-week', testCase.cycle)).toEqual(testCase.communionWeek);
    expect(resolve('gospel-week', testCase.cycle)).toEqual(testCase.gospelWeek);
    expect(resolve('home-cells', testCase.cycle)).toEqual(testCase.homeCells);
  });

  it('returns seven days for a week period and one for Home Cells', () => {
    for (const testCase of CASES) {
      expect(resolve('communion-week', testCase.cycle)).toHaveLength(7);
      expect(resolve('gospel-week', testCase.cycle)).toHaveLength(7);
      expect(resolve('home-cells', testCase.cycle)).toHaveLength(1);
      expect([...resolve('communion-week', testCase.cycle)].sort()).toEqual(testCase.communionWeek);
    }
  });

  it('takes no clock: the same cycle resolves to the same dates', () => {
    expect(resolve('communion-week', '2027-01')).toEqual(resolve('communion-week', '2027-01'));
  });

  it('refuses a cycle that is not a calendar month', () => {
    expect(() => resolve('communion-week', '2027-13')).toThrow(RangeError);
    expect(() => resolve('communion-week', 'January 2027')).toThrow(RangeError);
  });
});
