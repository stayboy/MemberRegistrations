import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  expandSchedule,
  occurrenceWindow,
  resolveOccurrences,
  todayIn,
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

describe('the authored schedule vocabulary', () => {
  it('accepts a weekday set, a monthly day and a monthly positional rule', () => {
    expect(validateRrule('FREQ=WEEKLY;BYDAY=MO,TH,FR')).toBe('FREQ=WEEKLY;BYDAY=MO,TH,FR');
    expect(validateRrule('FREQ=WEEKLY;BYDAY=SU;INTERVAL=4')).toBe(
      'FREQ=WEEKLY;BYDAY=SU;INTERVAL=4;WKST=SU',
    );
    expect(validateRrule('FREQ=MONTHLY;BYMONTHDAY=31')).toBe('FREQ=MONTHLY;BYMONTHDAY=31');
    expect(validateRrule('FREQ=MONTHLY;BYSETPOS=1;BYDAY=SA')).toBe(
      'FREQ=MONTHLY;BYSETPOS=1;BYDAY=SA',
    );
    expect(validateRrule('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA')).toBe(
      'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA',
    );
  });

  it('emits WKST=SU on a weekly rule carrying an interval', () => {
    expect(validateRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU')).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU',
    );
    // A rule that already carries it round-trips unchanged.
    expect(validateRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU')).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU',
    );
    expect(validateRrule('freq=weekly;interval=2;byday=su;wkst=su')).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU',
    );
  });

  it('leaves a rule without an interval alone, because WKST changes nothing there', () => {
    expect(validateRrule('FREQ=WEEKLY;BYDAY=MO,TH,FR')).toBe('FREQ=WEEKLY;BYDAY=MO,TH,FR');
    expect(validateRrule('FREQ=MONTHLY;BYMONTHDAY=15;INTERVAL=2')).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=15;INTERVAL=2',
    );
  });

  it('refuses a rule outside the closed vocabulary', () => {
    for (const body of [
      'FREQ=DAILY',
      'FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25',
      'FREQ=WEEKLY',
      'FREQ=WEEKLY;BYDAY=SU;INTERVAL=5',
      'FREQ=WEEKLY;BYDAY=SU;INTERVAL=x',
      'FREQ=WEEKLY;BYDAY=1SU',
      'FREQ=WEEKLY;BYDAY=SU;BYMONTH=12',
      'FREQ=WEEKLY;BYDAY=SU;BYSETPOS=1',
      'FREQ=MONTHLY',
      'FREQ=MONTHLY;BYSETPOS=2;BYDAY=SA',
      'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA,SU',
      'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA;BYMONTHDAY=1',
      'FREQ=MONTHLY;BYMONTHDAY=0',
      'FREQ=MONTHLY;BYMONTHDAY=32',
    ]) {
      expect(() => validateRrule(body), body).toThrow(ValidationError);
    }
  });

  it('still expands a stored rule the vocabulary cannot express, so a read never refuses it', () => {
    expect(
      expandSchedule(
        { effectiveFrom: '2026-01-04', rrule: 'FREQ=DAILY' },
        '2026-01-04',
        '2026-01-06',
      ),
    ).toEqual(['2026-01-04', '2026-01-05', '2026-01-06']);
  });

  it('keeps the Monday week of a stored rule without WKST and honours WKST=SU', () => {
    // Stored without WKST: RFC 5545 counts INTERVAL weeks from Monday, so the
    // Monday after a Sunday start belongs to the skipped week.
    expect(
      expandSchedule(
        { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO' },
        '2026-01-01',
        '2026-02-10',
      ),
    ).toEqual(['2026-01-04', '2026-01-12', '2026-01-18', '2026-01-26', '2026-02-01', '2026-02-09']);

    // With WKST=SU the Sunday-to-Saturday week is the unit, so Sunday and
    // Monday are in the same active week.
    expect(
      expandSchedule(
        { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU' },
        '2026-01-01',
        '2026-02-10',
      ),
    ).toEqual(['2026-01-04', '2026-01-05', '2026-01-18', '2026-01-19', '2026-02-01', '2026-02-02']);
  });
});

describe('the event timezone calendar day', () => {
  it('resolves two zones to different dates at the same instant', () => {
    const instant = new Date('2026-06-15T12:00:00Z');
    // UTC+14 is already the next calendar day; UTC-11 is still the same day.
    expect(todayIn('Pacific/Kiritimati', instant)).toBe('2026-06-16');
    expect(todayIn('Pacific/Pago_Pago', instant)).toBe('2026-06-15');
  });
});

describe('rrule runtime interop', () => {
  // Vitest resolves `rrule` through its `module` field, which Node does not.
  // This runs the same import in a real Node process so the packaging trap
  // cannot come back unnoticed.
  it('exposes rrulestr through the CommonJS default export', () => {
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import rrule from 'rrule'; if (typeof rrule.rrulestr !== 'function') process.exit(1);",
      ],
      { cwd: process.cwd(), stdio: 'pipe' },
    );
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

  it('resolves a monthly positional rule to the first or last named weekday', () => {
    const first = validateRrule('FREQ=MONTHLY;BYSETPOS=1;BYDAY=SA');
    const last = validateRrule('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA');

    expect(
      expandSchedule({ effectiveFrom: '2026-01-01', rrule: first }, '2026-01-01', '2026-03-31'),
    ).toEqual(['2026-01-03', '2026-02-07', '2026-03-07']);
    expect(
      expandSchedule({ effectiveFrom: '2026-01-01', rrule: last }, '2026-01-01', '2026-03-31'),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-28']);
  });

  it('skips short months for a monthly day-of-month of 31', () => {
    const rule = validateRrule('FREQ=MONTHLY;BYMONTHDAY=31');

    expect(
      expandSchedule({ effectiveFrom: '2026-01-01', rrule: rule }, '2026-01-01', '2026-04-30'),
    ).toEqual(['2026-01-31', '2026-03-31']);
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
