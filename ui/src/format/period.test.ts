import { describe, expect, it } from 'vitest';
import type { EventPeriodProvenance } from '../api/events';
import { PERIOD_DAY_LABELS, PERIOD_DAYS, isPeriodDay, periodProvenanceLine } from './period';
import { WEEKDAYS, WEEKDAY_LABELS, parseSchedule, toRrule } from './rrule';

/**
 * FR-42f: the period's `day` is its own vocabulary (`MON`-`SUN`), and the
 * schedule builder's rrule vocabulary (`MO`-`SU`) is untouched. The two are
 * kept apart on purpose - a stored period day must never be readable as an
 * rrule fragment - so the guard here is that no code crosses them.
 */
describe('the period day vocabulary', () => {
  it('lists the seven days in week order, with its own labels', () => {
    expect(PERIOD_DAYS).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
    expect(PERIOD_DAYS.map((day) => PERIOD_DAY_LABELS[day])).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });

  it('is disjoint from the rrule codes, which still emit MO-SU', () => {
    for (const day of PERIOD_DAYS) {
      expect(WEEKDAYS as readonly string[]).not.toContain(day);
      expect(Object.keys(WEEKDAY_LABELS)).not.toContain(day);
    }

    expect(
      toRrule({
        cadence: 'weekly',
        effectiveFrom: '2027-03-04',
        weekdays: ['MO', 'SU'],
        interval: 1,
      }),
    ).toBe('FREQ=WEEKLY;BYDAY=MO,SU');
    expect(parseSchedule('FREQ=WEEKLY;BYDAY=SU')?.weekdays).toEqual(['SU']);
  });

  it('narrows only the period codes', () => {
    expect(isPeriodDay('MON')).toBe(true);
    expect(isPeriodDay('MO')).toBe(false);
    expect(isPeriodDay(undefined)).toBe(false);
  });
});

/**
 * The detail's provenance line (spec: named periods). The shapes are the spec's
 * own four, and the ambiguous one - `day: null` for both a whole week and a
 * single date - is settled by the read's `dates` (the resolver's kind, projected
 * from the catalogue), never by the name.
 */
describe('the period provenance line', () => {
  const oneOff: EventPeriodProvenance = {
    id: 'communion-week',
    name: 'Communion Week',
    cycle: '2026-12',
    frequency: null,
    day: null,
  };

  const monthly = (day: EventPeriodProvenance['day']): EventPeriodProvenance => ({
    id: 'communion-week',
    name: 'Communion Week',
    cycle: null,
    frequency: 'monthly',
    day,
  });

  it('names a one-off period from the range it resolved to', () => {
    expect(periodProvenanceLine(oneOff, 'Nov 29, 2026 – Dec 5, 2026', null)).toBe(
      'Communion Week · Nov 29, 2026 – Dec 5, 2026',
    );
  });

  it('names the day inside a monthly period in the period vocabulary', () => {
    expect(periodProvenanceLine(monthly('SUN'), '', 'week')).toBe(
      'Communion Week · Sundays · monthly',
    );
  });

  it('says whole week for a monthly week period with no day chosen', () => {
    expect(periodProvenanceLine(monthly(null), '', 'week')).toBe(
      'Communion Week · whole week · monthly',
    );
  });

  it('names only the period and the frequency for a single-date period', () => {
    expect(periodProvenanceLine({ ...monthly(null), name: 'Home Cells' }, '', 'date')).toBe(
      'Home Cells · monthly',
    );
  });

  it('makes no span claim when the shape is unknown', () => {
    expect(periodProvenanceLine(monthly(null), '', null)).toBe('Communion Week · monthly');
  });
});
