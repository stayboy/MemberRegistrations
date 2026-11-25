import { describe, expect, it } from 'vitest';
import { PERIOD_DAY_LABELS, PERIOD_DAYS, isPeriodDay } from './period';
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
