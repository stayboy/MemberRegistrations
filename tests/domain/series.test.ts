import { describe, expect, it } from 'vitest';
import {
  expandSchedule,
  occurrenceWindow,
  resolveOccurrences,
  validateRrule,
} from '../../src/domain/series.js';
import { summariseAttendance } from '../../src/domain/attendance.js';
import { ValidationError } from '../../src/errors/domain-errors.js';

const weekly = {
  effectiveFrom: '2026-01-04',
  rrule: 'FREQ=WEEKLY;BYDAY=SU',
  endsOn: '2026-02-01',
};

describe('rrule validation', () => {
  it('accepts a plain RRULE body and normalises it', () => {
    expect(validateRrule('freq=weekly;byday=su')).toBe('FREQ=WEEKLY;BYDAY=SU');
  });

  it('rejects COUNT and UNTIL, which would compete with endsOn', () => {
    expect(() => validateRrule('FREQ=WEEKLY;COUNT=5')).toThrow(ValidationError);
    expect(() => validateRrule('FREQ=WEEKLY;UNTIL=20260101T000000Z')).toThrow(ValidationError);
  });

  it('rejects a body that is not a recurrence rule', () => {
    expect(() => validateRrule('every sunday')).toThrow(ValidationError);
  });
});

describe('schedule expansion', () => {
  it('produces the Sundays inside the window', () => {
    expect(expandSchedule(weekly, '2026-01-01', '2026-03-01')).toEqual([
      '2026-01-04',
      '2026-01-11',
      '2026-01-18',
      '2026-01-25',
      '2026-02-01',
    ]);
  });

  it('respects the series start date', () => {
    expect(expandSchedule(weekly, '2026-01-15', '2026-02-01')).toEqual([
      '2026-01-18',
      '2026-01-25',
      '2026-02-01',
    ]);
  });
});

describe('occurrence resolution', () => {
  it('removes cancelled dates and adds one-off extras', () => {
    const dates = resolveOccurrences({
      schedules: [weekly],
      from: '2026-01-01',
      to: '2026-02-10',
      exceptions: [
        { date: '2026-01-11', kind: 'cancelled' },
        { date: '2026-01-07', kind: 'extra' },
      ],
      importedDates: [],
    });

    expect(dates).toEqual(['2026-01-04', '2026-01-07', '2026-01-18', '2026-01-25', '2026-02-01']);
  });

  it('lets an imported event list be authoritative across its covered range', () => {
    const dates = resolveOccurrences({
      schedules: [weekly],
      from: '2026-01-01',
      to: '2026-02-10',
      exceptions: [],
      // The 11th was not held; the 7th was an extra midweek service.
      importedDates: ['2026-01-04', '2026-01-07', '2026-01-18', '2026-01-25', '2026-02-01'],
    });

    expect(dates).toEqual(['2026-01-04', '2026-01-07', '2026-01-18', '2026-01-25', '2026-02-01']);
  });

  it('switches rules at the schedule version boundary', () => {
    const dates = resolveOccurrences({
      schedules: [
        { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null },
        { effectiveFrom: '2026-02-01', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU', endsOn: null },
      ],
      from: '2026-01-01',
      to: '2026-03-01',
      exceptions: [],
      importedDates: [],
    });

    expect(dates).toEqual([
      '2026-01-04',
      '2026-01-11',
      '2026-01-18',
      '2026-01-25',
      '2026-02-01',
      '2026-02-15',
      '2026-03-01',
    ]);
  });
});

describe('attendance window', () => {
  it('starts at the later of series start and the member join date', () => {
    expect(
      occurrenceWindow({
        seriesStart: '2026-01-04',
        joinedOn: '2026-01-18',
        endsOn: '2026-02-01',
        today: '2026-11-02',
      }),
    ).toEqual({ from: '2026-01-18', to: '2026-02-01' });
  });

  it('counts an open-ended series to today, not to an imaginary future', () => {
    expect(
      occurrenceWindow({
        seriesStart: '2026-01-04',
        joinedOn: null,
        endsOn: null,
        today: '2026-02-01',
      }),
    ).toEqual({ from: '2026-01-04', to: '2026-02-01' });
  });
});

describe('attendance summary', () => {
  it('counts only dates inside the occurrence set', () => {
    const counts = summariseAttendance({
      occurrences: ['2026-01-04', '2026-01-11', '2026-01-18'],
      attendedDates: ['2026-01-04', '2026-01-18', '2026-01-25'],
      endsOn: '2026-02-01',
      today: '2026-11-02',
    });

    expect(counts).toEqual({ attended: 2, expected: 3, remaining: 1, status: 'completed' });
  });
});
