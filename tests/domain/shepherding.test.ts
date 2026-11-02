import { describe, expect, it } from 'vitest';
import {
  latestKnownStatus,
  summariseCalls,
  type CallReport,
} from '../../src/domain/shepherding.js';

function report(
  calledOn: string,
  stillInChurch: CallReport['stillInChurch'],
  outcome: CallReport['outcome'] = 'reached',
  createdAt = `${calledOn}T10:00:00.000Z`,
): CallReport {
  return { calledOn, createdAt, outcome, stillInChurch };
}

describe('latest known status', () => {
  it('ignores unknown reports, even when they are later', () => {
    expect(
      latestKnownStatus([
        report('2026-01-04', 'yes'),
        report('2026-01-11', 'unknown', 'no_answer'),
      ]),
    ).toBe('yes');
  });

  it('picks the latest definite report across days', () => {
    expect(
      latestKnownStatus([
        report('2026-01-04', 'yes'),
        report('2026-01-18', 'no'),
        report('2026-01-11', 'yes'),
      ]),
    ).toBe('no');
  });

  it('breaks same-day ties with createdAt', () => {
    expect(
      latestKnownStatus([
        report('2026-01-04', 'yes', 'reached', '2026-01-04T09:00:00.000Z'),
        report('2026-01-04', 'no', 'reached', '2026-01-04T15:00:00.000Z'),
      ]),
    ).toBe('no');
  });

  it('returns null until the first definite report', () => {
    expect(latestKnownStatus([])).toBeNull();
    expect(latestKnownStatus([report('2026-01-04', 'unknown', 'no_answer')])).toBeNull();
  });
});

describe('call summary', () => {
  it('counts every attempt and only reached conversations', () => {
    const summary = summariseCalls([
      report('2026-01-04', 'yes'),
      report('2026-01-11', 'unknown', 'no_answer'),
      report('2026-01-18', 'yes', 'reached'),
      report('2026-01-25', 'unknown', 'wrong_number'),
    ]);

    expect(summary).toEqual({
      attempts: 4,
      conversations: 2,
      lastCalledOn: '2026-01-25',
    });
  });

  it('returns zeroes for an untouched list', () => {
    expect(summariseCalls([])).toEqual({
      attempts: 0,
      conversations: 0,
      lastCalledOn: null,
    });
  });
});
