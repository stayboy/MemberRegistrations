import { describe, expect, it } from 'vitest';
import {
  SERIES_TIMEZONE_OTHER,
  createEmptySeriesForm,
  fromSeriesDetail,
  toCreateSeriesPayload,
  toUpdateSeriesPayload,
  validateSeriesForm,
  type SeriesFormValues,
} from './series-form';
import type { SeriesDto } from '../api/series';

const VALID: SeriesFormValues = {
  name: 'Sunday service',
  ministryCode: 'CHOIR',
  timezone: 'Africa/Lagos',
  timezoneSelection: 'Africa/Lagos',
  description: 'Weekly worship',
  effectiveFrom: '2026-11-08',
  rrule: 'FREQ=WEEKLY;BYDAY=SU',
  endsOn: '2027-11-08',
};

const SERIES: SeriesDto = {
  id: 'series-1',
  name: 'Sunday service',
  ministry: { code: 'CHOIR', name: 'Choir' },
  timezone: 'Africa/Lagos',
  description: 'Weekly worship',
  archivedAt: null,
  schedules: [{ effectiveFrom: '2026-11-08', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null }],
  exceptions: [],
};

describe('validateSeriesForm', () => {
  it('accepts a complete create form', () => {
    expect(validateSeriesForm(VALID)).toEqual({});
  });

  it('requires a name and enforces the 120-character limit', () => {
    expect(validateSeriesForm({ ...VALID, name: '  ' }).name).toBe('Name is required.');
    expect(validateSeriesForm({ ...VALID, name: 'x'.repeat(121) }).name).toBe(
      'Name must be 120 characters or fewer.',
    );
    expect(validateSeriesForm({ ...VALID, name: 'x'.repeat(120) })).toEqual({});
  });

  it('requires a real effective date', () => {
    expect(validateSeriesForm({ ...VALID, effectiveFrom: '' }).effectiveFrom).toBe(
      'Choose the first date this series applies to.',
    );
    expect(validateSeriesForm({ ...VALID, effectiveFrom: '2026-02-31' }).effectiveFrom).toBe(
      'Effective from must be a real date in YYYY-MM-DD form.',
    );
  });

  it('requires at least six characters of RRULE', () => {
    expect(validateSeriesForm({ ...VALID, rrule: '' }).rrule).toBe(
      'Enter an RRULE body such as FREQ=WEEKLY;BYDAY=SU.',
    );
    expect(validateSeriesForm({ ...VALID, rrule: 'FREQ' }).rrule).toBe(
      'The recurrence rule must be at least 6 characters.',
    );
    expect(validateSeriesForm({ ...VALID, rrule: 'FREQ=' }).rrule).toBe(
      'The recurrence rule must be at least 6 characters.',
    );
    expect(validateSeriesForm({ ...VALID, rrule: 'FREQ=D' }).rrule).toBe(
      'The recurrence rule must start with FREQ= and a supported frequency, for example FREQ=WEEKLY;BYDAY=SU.',
    );
    expect(validateSeriesForm({ ...VALID, rrule: 'FREQ=WEEKLY;BYDAY=SU' })).toEqual({});
  });

  it('rejects an RRULE without FREQ= or with COUNT/UNTIL', () => {
    expect(validateSeriesForm({ ...VALID, rrule: 'BYDAY=SU' }).rrule).toBe(
      'The recurrence rule must start with FREQ= and a supported frequency, for example FREQ=WEEKLY;BYDAY=SU.',
    );
    expect(validateSeriesForm({ ...VALID, rrule: 'FREQ=WEEKLY;COUNT=5' }).rrule).toBe(
      'The recurrence rule must not contain COUNT or UNTIL; use Ends on instead.',
    );
    expect(
      validateSeriesForm({ ...VALID, rrule: 'FREQ=WEEKLY;UNTIL=20270101T000000Z' }).rrule,
    ).toBe('The recurrence rule must not contain COUNT or UNTIL; use Ends on instead.');
  });

  it('rejects a malformed end date', () => {
    expect(validateSeriesForm({ ...VALID, endsOn: '2026-13-40' }).endsOn).toBe(
      'Ends on must be a real date in YYYY-MM-DD form.',
    );
  });

  it('rejects an end date before the effective date', () => {
    expect(
      validateSeriesForm({ ...VALID, effectiveFrom: '2027-01-01', endsOn: '2026-12-31' }).endsOn,
    ).toBe('The end date must not be before the effective date.');
    expect(
      validateSeriesForm({ ...VALID, effectiveFrom: '2027-01-01', endsOn: '2027-01-01' }).endsOn,
    ).toBeUndefined();
  });

  it('requires a timezone within the 64-character limit', () => {
    expect(validateSeriesForm({ ...VALID, timezone: ' ' }).timezone).toBe('Timezone is required.');
    expect(validateSeriesForm({ ...VALID, timezone: 'x'.repeat(65) }).timezone).toBe(
      'Timezone must be 64 characters or fewer.',
    );
  });

  it('caps the description at 500 characters', () => {
    expect(validateSeriesForm({ ...VALID, description: 'x'.repeat(501) }).description).toBe(
      'Description must be 500 characters or fewer.',
    );
    expect(
      validateSeriesForm({ ...VALID, description: 'x'.repeat(500) }).description,
    ).toBeUndefined();
  });

  it('ignores the schedule fields in edit mode', () => {
    expect(
      validateSeriesForm(
        { ...VALID, effectiveFrom: '', rrule: 'X', endsOn: '2020-01-01' },
        { requireSchedule: false },
      ),
    ).toEqual({});
  });
});

describe('series form defaults', () => {
  it('defaults a new series to Africa/Lagos and today in UTC', () => {
    expect(createEmptySeriesForm('2026-11-05')).toMatchObject({
      name: '',
      ministryCode: '',
      timezone: 'Africa/Lagos',
      timezoneSelection: 'Africa/Lagos',
      effectiveFrom: '2026-11-05',
      rrule: '',
      endsOn: '',
    });
  });

  it('prefills identity from the detail and marks an unknown timezone as Other', () => {
    expect(fromSeriesDetail(SERIES)).toMatchObject({
      name: 'Sunday service',
      ministryCode: 'CHOIR',
      timezone: 'Africa/Lagos',
      timezoneSelection: 'Africa/Lagos',
      description: 'Weekly worship',
    });

    const custom = fromSeriesDetail({ ...SERIES, timezone: 'Asia/Tokyo', description: null });
    expect(custom.timezone).toBe('Asia/Tokyo');
    expect(custom.timezoneSelection).toBe(SERIES_TIMEZONE_OTHER);
    expect(custom.description).toBe('');
  });
});

describe('series payload builders', () => {
  it('includes the first schedule version on create', () => {
    expect(toCreateSeriesPayload(VALID)).toEqual({
      name: 'Sunday service',
      ministryCode: 'CHOIR',
      timezone: 'Africa/Lagos',
      description: 'Weekly worship',
      schedule: {
        effectiveFrom: '2026-11-08',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2027-11-08',
      },
    });
  });

  it('turns blank optional fields into null and trims the rest', () => {
    expect(
      toCreateSeriesPayload({
        ...VALID,
        name: '  Sunday service  ',
        ministryCode: ' ',
        description: ' ',
        endsOn: '',
      }),
    ).toEqual({
      name: 'Sunday service',
      ministryCode: null,
      timezone: 'Africa/Lagos',
      description: null,
      schedule: {
        effectiveFrom: '2026-11-08',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: null,
      },
    });
  });

  it('omits the schedule on edit', () => {
    const payload = toUpdateSeriesPayload(VALID);

    expect(payload).toEqual({
      name: 'Sunday service',
      ministryCode: 'CHOIR',
      timezone: 'Africa/Lagos',
      description: 'Weekly worship',
    });
    expect(payload).not.toHaveProperty('schedule');
  });

  it('trims the identity fields and turns blanks into null on edit', () => {
    expect(
      toUpdateSeriesPayload({
        ...VALID,
        name: '  Sunday service  ',
        ministryCode: ' ',
        timezone: ' Africa/Lagos ',
        description: ' ',
      }),
    ).toEqual({
      name: 'Sunday service',
      ministryCode: null,
      timezone: 'Africa/Lagos',
      description: null,
    });
  });
});
