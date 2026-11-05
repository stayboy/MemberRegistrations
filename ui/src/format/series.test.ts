import { describe, expect, it } from 'vitest';
import {
  EXCEPTION_KIND_LABELS,
  exceptionKindLabel,
  nextOccurrenceLabel,
  scheduleLabel,
  seriesStatusLabel,
} from './series';

describe('scheduleLabel', () => {
  it('names the daily form', () => {
    expect(scheduleLabel('FREQ=DAILY')).toBe('Daily');
    expect(scheduleLabel('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days');
  });

  it('names a weekly form with one day and with several days', () => {
    expect(scheduleLabel('FREQ=WEEKLY;BYDAY=SU')).toBe('Weekly on Sunday');
    expect(scheduleLabel('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe(
      'Weekly on Monday, Wednesday and Friday',
    );
  });

  it('names a weekly interval before the day list', () => {
    expect(scheduleLabel('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')).toBe(
      'Every 2 weeks on Monday and Wednesday',
    );
    expect(scheduleLabel('FREQ=WEEKLY;BYDAY=SU;INTERVAL=2')).toBe('Every 2 weeks on Sunday');
  });

  it('names the monthly day-of-month form', () => {
    expect(scheduleLabel('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('Monthly on day 15');
    expect(scheduleLabel('FREQ=MONTHLY;BYMONTHDAY=1,15')).toBe('Monthly on days 1 and 15');
    expect(scheduleLabel('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1')).toBe('Every 2 months on day 1');
  });

  it('accepts lower-case input, because the API normalises before storage', () => {
    expect(scheduleLabel('freq=weekly;byday=su')).toBe('Weekly on Sunday');
  });

  it('falls back to the raw RRULE for unsupported shapes', () => {
    expect(scheduleLabel('FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25')).toBe(
      'FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25',
    );
    expect(scheduleLabel('FREQ=WEEKLY;COUNT=5')).toBe('FREQ=WEEKLY;COUNT=5');
    expect(scheduleLabel('FREQ=WEEKLY')).toBe('FREQ=WEEKLY');
    expect(scheduleLabel('FREQ=MONTHLY;BYDAY=1MO')).toBe('FREQ=MONTHLY;BYDAY=1MO');
    expect(scheduleLabel('not-an-rrule')).toBe('not-an-rrule');
    expect(scheduleLabel('FREQ=DAILY;INTERVAL=0')).toBe('FREQ=DAILY;INTERVAL=0');
  });

  it('trims the raw fallback without rewriting it', () => {
    expect(scheduleLabel('  FREQ=YEARLY  ')).toBe('FREQ=YEARLY');
  });
});

describe('nextOccurrenceLabel', () => {
  it('formats the API-supplied first occurrence as a UTC calendar date', () => {
    expect(nextOccurrenceLabel('2026-11-05', 90)).toBe('5 November 2026');
  });

  it('names the requested window instead of inventing a date', () => {
    expect(nextOccurrenceLabel(null, 90)).toBe('None in 90 days');
    expect(nextOccurrenceLabel(null, 30)).toBe('None in 30 days');
  });
});

describe('exception labels', () => {
  it('names both exception kinds', () => {
    expect(EXCEPTION_KIND_LABELS).toEqual({ cancelled: 'Cancelled', extra: 'Extra' });
    expect(exceptionKindLabel('cancelled')).toBe('Cancelled');
    expect(exceptionKindLabel('extra')).toBe('Extra');
  });
});

describe('seriesStatusLabel', () => {
  it('is active until the API supplies an archive timestamp', () => {
    expect(seriesStatusLabel(null)).toBe('Active');
    expect(seriesStatusLabel('2026-11-05T10:00:00.000Z')).toBe('Archived');
  });
});
