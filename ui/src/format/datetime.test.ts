import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DATE_TIME_PREFERENCE,
  formatCalendarDate,
  formatDateRange,
  formatInstant,
  formatInstantTitle,
  formatWallClockTime,
  isDateTimePreference,
  parseDateTimePreference,
  type DateTimePreference,
} from './datetime';

const LOCALE_H24: DateTimePreference = { dateStyle: 'locale', timeCycle: 'h24' };
const DMY_H24: DateTimePreference = { dateStyle: 'dmy', timeCycle: 'h24' };

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('formatInstant', () => {
  it('converts one instant into the browser zone under the locale date style', () => {
    const value = '2026-11-04T23:30:00Z';
    expect(formatInstant(value, LOCALE_H24, { locale: 'en-GB', timeZone: 'UTC' })).toBe(
      '4 Nov 2026, 23:30',
    );
    expect(formatInstant(value, LOCALE_H24, { locale: 'en-GB', timeZone: 'Africa/Lagos' })).toBe(
      '5 Nov 2026, 00:30',
    );
    expect(
      formatInstant(value, LOCALE_H24, { locale: 'en-GB', timeZone: 'America/New_York' }),
    ).toBe('4 Nov 2026, 18:30');
  });

  it('uses the same zones under the Day Month Year style', () => {
    const value = '2026-11-04T23:30:00Z';
    expect(formatInstant(value, DMY_H24, { locale: 'en-GB', timeZone: 'UTC' })).toBe(
      '4 November 2026, 23:30',
    );
    expect(formatInstant(value, DMY_H24, { locale: 'en-GB', timeZone: 'Africa/Lagos' })).toBe(
      '5 November 2026, 00:30',
    );
    expect(formatInstant(value, DMY_H24, { locale: 'en-GB', timeZone: 'America/New_York' })).toBe(
      '4 November 2026, 18:30',
    );
  });

  it('honours each date style', () => {
    const value = '2026-11-04T23:30:00Z';
    const options = { locale: 'en-GB', timeZone: 'UTC' };
    expect(formatInstant(value, { dateStyle: 'locale', timeCycle: 'h24' }, options)).toBe(
      '4 Nov 2026, 23:30',
    );
    expect(formatInstant(value, { dateStyle: 'dmy', timeCycle: 'h24' }, options)).toBe(
      '4 November 2026, 23:30',
    );
    expect(formatInstant(value, { dateStyle: 'mdy', timeCycle: 'h24' }, options)).toBe(
      'November 4, 2026, 23:30',
    );
    expect(formatInstant(value, { dateStyle: 'iso', timeCycle: 'h24' }, options)).toBe(
      '2026-11-04, 23:30',
    );
  });

  it('honours each clock cycle', () => {
    const value = '2026-11-04T23:30:00Z';
    const options = { locale: 'en-US', timeZone: 'UTC' };
    expect(formatInstant(value, { dateStyle: 'dmy', timeCycle: 'locale' }, options)).toBe(
      '4 November 2026, 11:30 PM',
    );
    expect(formatInstant(value, { dateStyle: 'dmy', timeCycle: 'h12' }, options)).toBe(
      '4 November 2026, 11:30 PM',
    );
    expect(formatInstant(value, { dateStyle: 'dmy', timeCycle: 'h24' }, options)).toBe(
      '4 November 2026, 23:30',
    );
  });

  it('returns an empty string for missing or invalid instants', () => {
    expect(formatInstant(null, LOCALE_H24)).toBe('');
    expect(formatInstant(undefined, LOCALE_H24)).toBe('');
    expect(formatInstant('', LOCALE_H24)).toBe('');
    expect(formatInstant('not-a-date', LOCALE_H24)).toBe('');
    expect(formatInstant('2026-11-04', LOCALE_H24)).toBe('');
    expect(formatInstant('2026-02-30T10:00:00Z', LOCALE_H24)).toBe('');
  });
});

describe('formatCalendarDate', () => {
  it('keeps the stored day in every zone and every date style', () => {
    for (const timeZone of ['UTC', 'Africa/Lagos', 'America/New_York']) {
      process.env.TZ = timeZone;
      expect(formatCalendarDate('1990-05-14', DMY_H24)).toBe('14 May 1990');
      expect(formatCalendarDate('1990-05-14', { dateStyle: 'mdy', timeCycle: 'h24' })).toBe(
        'May 14, 1990',
      );
      expect(formatCalendarDate('1990-05-14', { dateStyle: 'iso', timeCycle: 'h24' })).toBe(
        '1990-05-14',
      );
    }
  });

  it('accepts the date part of a full ISO string and rejects invalid days', () => {
    expect(formatCalendarDate('1990-05-14T23:30:00Z', DMY_H24)).toBe('14 May 1990');
    expect(formatCalendarDate('1990-05-14', { dateStyle: 'locale', timeCycle: 'h24' })).toBe(
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(1990, 4, 14, 12))),
    );
    expect(formatCalendarDate('2026-02-30', DMY_H24)).toBe('');
    expect(formatCalendarDate('2026-13-01', DMY_H24)).toBe('');
    expect(formatCalendarDate('not-a-date', DMY_H24)).toBe('');
    expect(formatCalendarDate(null, DMY_H24)).toBe('');
  });
});

describe('formatWallClockTime', () => {
  it('never converts the scheduled time', () => {
    for (const timeZone of ['UTC', 'Africa/Lagos', 'America/New_York']) {
      process.env.TZ = timeZone;
      expect(formatWallClockTime('09:00', DMY_H24)).toBe('09:00');
      expect(formatWallClockTime('23:30', DMY_H24)).toBe('23:30');
      expect(formatWallClockTime('09:00:05', DMY_H24)).toBe('09:00:05');
    }
  });

  it('uses the chosen clock cycle without a zone conversion', () => {
    expect(formatWallClockTime('13:05', { dateStyle: 'dmy', timeCycle: 'h24' })).toBe('13:05');
    expect(formatWallClockTime('13:05', { dateStyle: 'dmy', timeCycle: 'h12' })).toMatch(
      /0?1:05\s?[ap]\.?m\.?/i,
    );
    expect(formatWallClockTime('13:05', { dateStyle: 'dmy', timeCycle: 'locale' })).toBe(
      new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(2000, 0, 1, 13, 5))),
    );
  });

  it('rejects 24:00 and malformed clock strings', () => {
    expect(formatWallClockTime('24:00', DMY_H24)).toBe('');
    expect(formatWallClockTime('09:60', DMY_H24)).toBe('');
    expect(formatWallClockTime('09:00:60', DMY_H24)).toBe('');
    expect(formatWallClockTime('9:00', DMY_H24)).toBe('');
    expect(formatWallClockTime(null, DMY_H24)).toBe('');
  });
});

describe('formatDateRange', () => {
  it('renders one date when equal and a range otherwise', () => {
    expect(formatDateRange('2026-11-02', '2026-11-02', DMY_H24)).toBe('2 November 2026');
    expect(formatDateRange('2026-10-13', '2026-10-15', DMY_H24)).toBe(
      '13 October 2026 – 15 October 2026',
    );
    expect(formatDateRange('bad', 'bad', DMY_H24)).toBe('');
  });
});

describe('formatInstantTitle', () => {
  it('returns the exact UTC instant, or undefined when the value is invalid', () => {
    expect(formatInstantTitle('2026-11-04T23:30:00Z')).toBe('2026-11-04T23:30:00.000Z');
    expect(formatInstantTitle('2026-11-04T23:30:00+01:00')).toBe('2026-11-04T22:30:00.000Z');
    expect(formatInstantTitle('nope')).toBeUndefined();
    expect(formatInstantTitle(null)).toBeUndefined();
  });
});

describe('parseDateTimePreference', () => {
  it('accepts only a complete known preference', () => {
    expect(parseDateTimePreference(JSON.stringify({ dateStyle: 'dmy', timeCycle: 'h24' }))).toEqual(
      { dateStyle: 'dmy', timeCycle: 'h24' },
    );
    expect(isDateTimePreference({ dateStyle: 'iso', timeCycle: 'h12' })).toBe(true);
    expect(isDateTimePreference({ dateStyle: 'iso' })).toBe(false);
    expect(isDateTimePreference(null)).toBe(false);
  });

  it('defaults missing, malformed, unknown and partial input', () => {
    expect(parseDateTimePreference(null)).toEqual(DEFAULT_DATE_TIME_PREFERENCE);
    expect(parseDateTimePreference(undefined)).toEqual(DEFAULT_DATE_TIME_PREFERENCE);
    expect(parseDateTimePreference('')).toEqual(DEFAULT_DATE_TIME_PREFERENCE);
    expect(parseDateTimePreference('{')).toEqual(DEFAULT_DATE_TIME_PREFERENCE);
    expect(parseDateTimePreference('[]')).toEqual(DEFAULT_DATE_TIME_PREFERENCE);
    expect(parseDateTimePreference(JSON.stringify({ dateStyle: 'ymd', timeCycle: 'h24' }))).toEqual(
      DEFAULT_DATE_TIME_PREFERENCE,
    );
    expect(
      parseDateTimePreference(JSON.stringify({ dateStyle: 'dmy', timeCycle: 'military' })),
    ).toEqual(DEFAULT_DATE_TIME_PREFERENCE);
    expect(parseDateTimePreference(JSON.stringify({ dateStyle: 'dmy' }))).toEqual(
      DEFAULT_DATE_TIME_PREFERENCE,
    );
  });
});
