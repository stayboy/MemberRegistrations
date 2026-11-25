import { describe, expect, it } from 'vitest';
import {
  CADENCE_OPTIONS,
  cadenceLabel,
  fromRrule,
  parseSchedule,
  toRrule,
  type RecurrenceCadence,
} from './rrule';

/**
 * FR-42f/AC-63: one module produces the API's `rrule` from the closed vocabulary
 * and parses it back, so a schedule version read from the API renders as the
 * label that authored it. A rule outside the vocabulary parses to null and is
 * rendered from the stored string instead of guessed at.
 */
describe('toRrule', () => {
  it('takes the weekday from the effective date when no set is chosen', () => {
    // 2026-11-01 is a Sunday; 2026-11-07 a Saturday.
    expect(toRrule({ cadence: 'weekly', effectiveFrom: '2026-11-01' })).toBe(
      'FREQ=WEEKLY;BYDAY=SU',
    );
    expect(toRrule({ cadence: 'weekly', effectiveFrom: '2026-11-07' })).toBe(
      'FREQ=WEEKLY;BYDAY=SA',
    );
    expect(toRrule({ cadence: 'weekly', effectiveFrom: '2026-11-04' })).toBe(
      'FREQ=WEEKLY;BYDAY=WE',
    );
  });

  it('maps weekly to a weekday set in week order', () => {
    expect(
      toRrule({
        cadence: 'weekly',
        effectiveFrom: '2026-11-01',
        weekdays: ['FR', 'MO', 'TH'],
      }),
    ).toBe('FREQ=WEEKLY;BYDAY=MO,TH,FR');
  });

  it('emits INTERVAL and WKST=SU on an interval-bearing weekly rule', () => {
    expect(
      toRrule({
        cadence: 'weekly',
        effectiveFrom: '2026-11-01',
        weekdays: ['SU'],
        interval: 2,
      }),
    ).toBe('FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU');
    expect(
      toRrule({ cadence: 'weekly', effectiveFrom: '2026-11-01', weekdays: ['MO'], interval: 4 }),
    ).toBe('FREQ=WEEKLY;INTERVAL=4;WKST=SU;BYDAY=MO');
  });

  it('maps fortnightly to a two-week weekly interval', () => {
    expect(toRrule({ cadence: 'fortnightly', effectiveFrom: '2026-11-01' })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU',
    );
  });

  it('authors daily with a 1-7 interval and no weekday key', () => {
    expect(toRrule({ cadence: 'daily', effectiveFrom: '2026-11-01' })).toBe('FREQ=DAILY');
    expect(toRrule({ cadence: 'daily', effectiveFrom: '2026-11-01', interval: 1 })).toBe(
      'FREQ=DAILY',
    );
    expect(toRrule({ cadence: 'daily', effectiveFrom: '2026-11-01', interval: 3 })).toBe(
      'FREQ=DAILY;INTERVAL=3',
    );
    expect(toRrule({ cadence: 'daily', effectiveFrom: '2026-11-01', interval: 8 })).toBeNull();
    expect(toRrule({ cadence: 'daily', effectiveFrom: '2026-11-01', interval: 0 })).toBeNull();
  });

  it('takes the day of the month from the effective date', () => {
    expect(toRrule({ cadence: 'monthly', effectiveFrom: '2026-11-15' })).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=15',
    );
    expect(toRrule({ cadence: 'monthly', effectiveFrom: '2026-01-05' })).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=5',
    );
    expect(toRrule({ cadence: 'monthly', effectiveFrom: '2026-01-31' })).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=31',
    );
  });

  it('authors a monthly positional rule as BYSETPOS with one weekday', () => {
    expect(
      toRrule({
        cadence: 'monthly',
        effectiveFrom: '2026-11-01',
        monthlyMode: 'position',
        position: 'last',
        positionWeekday: 'SA',
      }),
    ).toBe('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA');
    expect(
      toRrule({
        cadence: 'monthly',
        effectiveFrom: '2026-11-01',
        monthlyMode: 'position',
        position: 'first',
        positionWeekday: 'MO',
      }),
    ).toBe('FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO');
  });

  it('produces no rule for a date that is not a real calendar date', () => {
    expect(toRrule({ cadence: 'weekly', effectiveFrom: '2026-02-31' })).toBeNull();
    expect(toRrule({ cadence: 'monthly', effectiveFrom: '' })).toBeNull();
  });
});

describe('fromRrule', () => {
  it('parses each vocabulary rule back to its cadence', () => {
    expect(fromRrule('FREQ=DAILY')).toBe('daily');
    expect(fromRrule('FREQ=DAILY;INTERVAL=3')).toBe('daily');
    expect(fromRrule('FREQ=WEEKLY;BYDAY=SU')).toBe('weekly');
    expect(fromRrule('FREQ=WEEKLY;BYDAY=MO,TH,FR')).toBe('weekly');
    expect(fromRrule('FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO')).toBe('fortnightly');
    expect(fromRrule('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('monthly');
    expect(fromRrule('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA')).toBe('monthly');
  });

  it('tolerates surrounding whitespace and lower case', () => {
    expect(fromRrule('  freq=weekly;byday=su  ')).toBe('weekly');
  });

  it('returns null for a rule outside the vocabulary', () => {
    expect(fromRrule('FREQ=YEARLY;BYMONTH=12')).toBeNull();
    expect(fromRrule('FREQ=DAILY;INTERVAL=8')).toBeNull();
    expect(fromRrule('FREQ=DAILY;BYDAY=MO')).toBeNull();
    expect(fromRrule('FREQ=WEEKLY;INTERVAL=5;BYDAY=SU')).toBeNull();
    expect(fromRrule('FREQ=WEEKLY;BYDAY=SU;WKST=MO')).toBeNull();
    expect(fromRrule('FREQ=MONTHLY;BYDAY=1MO')).toBeNull();
    expect(fromRrule('FREQ=MONTHLY;BYMONTHDAY=32')).toBeNull();
    expect(fromRrule('FREQ=MONTHLY;BYSETPOS=2;BYDAY=SA')).toBeNull();
    expect(fromRrule('')).toBeNull();
    expect(fromRrule('FREQ=WEEKLY')).toBeNull();
  });

  it('round-trips every cadence in both directions', () => {
    const dates = ['2026-11-01', '2026-11-04', '2026-01-31', '2026-02-28'];
    for (const cadence of ['daily', 'weekly', 'fortnightly', 'monthly'] as const) {
      for (const effectiveFrom of dates) {
        const rrule = toRrule({ cadence, effectiveFrom });
        expect(rrule).not.toBeNull();
        expect(fromRrule(rrule ?? '')).toBe(cadence);
      }
    }
  });

  it('round-trips the positional monthly rule', () => {
    const original = 'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA';
    const parsed = parseSchedule(original);
    expect(parsed?.monthlyMode).toBe('position');
    expect(parsed?.position).toBe('last');
    expect(parsed?.positionWeekday).toBe('SA');
    expect(
      toRrule({
        cadence: 'monthly',
        effectiveFrom: '2026-11-01',
        monthlyMode: parsed?.monthlyMode,
        position: parsed?.position,
        positionWeekday: parsed?.positionWeekday ?? undefined,
      }),
    ).toBe(original);
  });
});

describe('parseSchedule', () => {
  it('returns the builder values that authored the rule', () => {
    expect(parseSchedule('FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=TH')).toEqual({
      cadence: 'fortnightly',
      weekdays: ['TH'],
      interval: 2,
      monthlyMode: 'day',
      dayOfMonth: '',
      position: 'first',
      positionWeekday: null,
    });
    expect(parseSchedule('FREQ=DAILY;INTERVAL=3')?.interval).toBe(3);
    expect(parseSchedule('FREQ=MONTHLY;BYMONTHDAY=28')?.dayOfMonth).toBe('28');
  });
});

describe('cadence labels', () => {
  it('names the four choices in the picker order', () => {
    expect(CADENCE_OPTIONS.map((option) => option.value)).toEqual([
      'daily',
      'weekly',
      'fortnightly',
      'monthly',
    ]);
    expect(cadenceLabel('daily')).toBe('Daily');
    expect(cadenceLabel('weekly')).toBe('Weekly');
    expect(cadenceLabel('fortnightly')).toBe('Fortnightly');
    expect(cadenceLabel('monthly')).toBe('Monthly on the day');
    // A stored interval of 3 is still a weekly rule in the closed vocabulary.
    expect(fromRrule('FREQ=WEEKLY;INTERVAL=3;WKST=SU;BYDAY=SU') as RecurrenceCadence).toBe(
      'weekly',
    );
  });
});
