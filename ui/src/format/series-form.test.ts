import { describe, expect, it } from 'vitest';
import {
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
  presbyterOnly: false,
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
  presbyterOnly: false,
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
  it('defaults a new series to today in UTC', () => {
    expect(createEmptySeriesForm('2026-11-05')).toMatchObject({
      name: '',
      ministryCode: '',
      presbyterOnly: false,
      effectiveFrom: '2026-11-05',
      rrule: '',
      endsOn: '',
    });
  });

  it('prefills identity from the detail', () => {
    expect(fromSeriesDetail(SERIES)).toMatchObject({
      name: 'Sunday service',
      ministryCode: 'CHOIR',
      presbyterOnly: false,
      description: 'Weekly worship',
    });

    const custom = fromSeriesDetail({ ...SERIES, description: null });
    expect(custom.description).toBe('');
  });

  it('carries the presbyter-only flag from the detail into the edit form', () => {
    expect(fromSeriesDetail({ ...SERIES, presbyterOnly: true }).presbyterOnly).toBe(true);
  });
});

describe('series payload builders', () => {
  it('includes the first schedule version on create', () => {
    const payload = toCreateSeriesPayload(VALID);

    expect(payload).toEqual({
      name: 'Sunday service',
      ministryCode: 'CHOIR',
      presbyterOnly: false,
      description: 'Weekly worship',
      schedule: {
        effectiveFrom: '2026-11-08',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2027-11-08',
      },
    });
    expect(payload).not.toHaveProperty('timezone');
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
      presbyterOnly: false,
      description: null,
      schedule: {
        effectiveFrom: '2026-11-08',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: null,
      },
    });
  });

  it('sends the presbyter-only flag on create and edit', () => {
    expect(toCreateSeriesPayload({ ...VALID, presbyterOnly: true }).presbyterOnly).toBe(true);
    expect(toUpdateSeriesPayload({ ...VALID, presbyterOnly: true }).presbyterOnly).toBe(true);
  });

  it('omits the schedule and timezone on edit', () => {
    const payload = toUpdateSeriesPayload(VALID);

    expect(payload).toEqual({
      name: 'Sunday service',
      ministryCode: 'CHOIR',
      presbyterOnly: false,
      description: 'Weekly worship',
    });
    expect(payload).not.toHaveProperty('schedule');
    expect(payload).not.toHaveProperty('timezone');
  });

  it('trims the identity fields and turns blanks into null on edit', () => {
    expect(
      toUpdateSeriesPayload({
        ...VALID,
        name: '  Sunday service  ',
        ministryCode: ' ',
        description: ' ',
      }),
    ).toEqual({
      name: 'Sunday service',
      ministryCode: null,
      presbyterOnly: false,
      description: null,
    });
  });
});
