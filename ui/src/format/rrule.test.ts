import { describe, expect, it } from 'vitest';
import { CADENCE_OPTIONS, cadenceLabel, fromRrule, toRrule, type RecurrenceCadence } from './rrule';

/**
 * FR-42f/AC-63: one module produces the API's `rrule` from the closed vocabulary
 * and parses it back, so a schedule version read from the API renders as the
 * label that authored it. A rule outside the vocabulary parses to null and is
 * rendered from the stored string instead of guessed at.
 */
describe('toRrule', () => {
  it('takes the weekday from the effective date', () => {
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

  it('maps fortnightly to a two-week weekly interval', () => {
    expect(toRrule({ cadence: 'fortnightly', effectiveFrom: '2026-11-01' })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU',
    );
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

  it('produces no rule for a date that is not a real calendar date', () => {
    expect(toRrule({ cadence: 'weekly', effectiveFrom: '2026-02-31' })).toBeNull();
    expect(toRrule({ cadence: 'monthly', effectiveFrom: '' })).toBeNull();
  });
});

describe('fromRrule', () => {
  it('parses each vocabulary rule back to its cadence', () => {
    expect(fromRrule('FREQ=WEEKLY;BYDAY=SU')).toBe('weekly');
    expect(fromRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe('fortnightly');
    expect(fromRrule('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('monthly');
  });

  it('tolerates surrounding whitespace and lower case', () => {
    expect(fromRrule('  freq=weekly;byday=su  ')).toBe('weekly');
  });

  it('returns null for a rule outside the vocabulary', () => {
    expect(fromRrule('FREQ=DAILY')).toBeNull();
    expect(fromRrule('FREQ=WEEKLY;BYDAY=MO,WE')).toBeNull();
    expect(fromRrule('FREQ=WEEKLY;INTERVAL=3;BYDAY=SU')).toBeNull();
    expect(fromRrule('FREQ=MONTHLY;BYDAY=1MO')).toBeNull();
    expect(fromRrule('FREQ=MONTHLY;BYMONTHDAY=32')).toBeNull();
    expect(fromRrule('FREQ=WEEKLY;BYDAY=SU;WKST=MO')).toBeNull();
    expect(fromRrule('')).toBeNull();
    expect(fromRrule('FREQ=WEEKLY')).toBeNull();
  });

  it('round-trips every cadence in both directions', () => {
    const dates = ['2026-11-01', '2026-11-04', '2026-01-31', '2026-02-28'];
    for (const cadence of ['weekly', 'fortnightly', 'monthly'] as const) {
      for (const effectiveFrom of dates) {
        const rrule = toRrule({ cadence, effectiveFrom });
        expect(rrule).not.toBeNull();
        expect(fromRrule(rrule ?? '')).toBe(cadence);
      }
    }
  });

  it('round-trips a parsed cadence back to the same rule', () => {
    const original = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH';
    const cadence = fromRrule(original) as RecurrenceCadence;
    expect(toRrule({ cadence, effectiveFrom: '2026-11-05' })).toBe(original);
  });
});

describe('cadence labels', () => {
  it('names the three choices in the picker order', () => {
    expect(CADENCE_OPTIONS.map((option) => option.value)).toEqual([
      'weekly',
      'fortnightly',
      'monthly',
    ]);
    expect(cadenceLabel('weekly')).toBe('Weekly');
    expect(cadenceLabel('fortnightly')).toBe('Fortnightly');
    expect(cadenceLabel('monthly')).toBe('Monthly on the day');
  });
});
