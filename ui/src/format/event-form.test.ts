import { describe, expect, it } from 'vitest';
import type { EventParentItem } from '../api/events';
import {
  EVENT_VENUE_OPTIONS,
  createEmptyEventForm,
  fromEventParent,
  latestSchedule,
  occurrenceErrorKey,
  toCreateEventPayload,
  toUpdateEventPayload,
  validateEventForm,
  type EventFormValues,
} from './event-form';

const VALID: EventFormValues = {
  eventNo: 'EVT-2026-031',
  name: 'Strategic Conference',
  audienceId: 'aud-everyone',
  description: 'Annual leadership conference.',
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  startTime: '09:00',
  endTime: '17:00',
  tracksMembers: true,
  repeats: false,
  cadence: 'weekly',
  effectiveFrom: '2026-01-15',
  endsOn: '',
  occurrences: [{ date: '2026-01-15', startTime: '', endTime: '' }],
};

const PARENT: EventParentItem = {
  id: 'event-parent-1',
  eventNo: 'EVT-2026-023',
  name: 'Sunday Celebration',
  audienceId: 'aud-choir',
  audience: {
    id: 'aud-choir',
    name: 'Choir',
    system: true,
    summary: 'Choir - all of ministry CHR',
  },
  ministry: { code: 'CHR', name: 'Choir' },
  presbyterOnly: false,
  timezone: 'Africa/Lagos',
  description: 'Weekly worship',
  venueType: 'hybrid',
  venueName: 'Main Auditorium',
  startDate: '2026-01-04',
  endDate: null,
  startTime: '09:00',
  endTime: '11:00',
  tracksMembers: true,
  status: 'active',
  recurrence: {
    schedules: [
      { effectiveFrom: '2025-01-05', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null },
      { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU', endsOn: null },
    ],
    exceptions: [],
  },
  occurrences: [],
  offerings: [],
  stats: {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  },
  summary: {
    from: '2026-01-01',
    to: '2026-01-31',
    nextOccurrence: null,
    attendance: {
      memberSessions: { held: 0, expected: 0, present: 0, rate: null },
      lastHeld: null,
      headcountSessions: { held: 0 },
      cancelled: 0,
      upcoming: 0,
    },
    offerings: {
      attachedCount: 0,
      currency: 'GHS',
      paidMinor: 0,
      pledgedMinor: 0,
      outstandingMinor: 0,
      countedMinor: 0,
      visitors: { count: 0, paidMinor: 0 },
    },
  },
};

describe('event form choices', () => {
  it('offers every venue type', () => {
    expect(EVENT_VENUE_OPTIONS).toEqual([
      { value: 'auditorium', label: 'Auditorium' },
      { value: 'virtual', label: 'Virtual' },
      { value: 'hybrid', label: 'Hybrid' },
    ]);
  });
});

describe('validateEventForm', () => {
  it('accepts a complete create form', () => {
    expect(validateEventForm(VALID)).toEqual({});
  });

  it('treats the event number as optional and caps its 64 characters', () => {
    expect(validateEventForm({ ...VALID, eventNo: '' })).toEqual({});
    expect(validateEventForm({ ...VALID, eventNo: '   ' })).toEqual({});
    expect(validateEventForm({ ...VALID, eventNo: 'x'.repeat(65) }).eventNo).toBe(
      'Event number must be 64 characters or fewer.',
    );
    expect(validateEventForm({ ...VALID, eventNo: 'x'.repeat(64) })).toEqual({});
  });

  it('requires a name and enforces its 200-character limit', () => {
    expect(validateEventForm({ ...VALID, name: ' ' }).name).toBe('Name is required.');
    expect(validateEventForm({ ...VALID, name: 'x'.repeat(201) }).name).toBe(
      'Name must be 200 characters or fewer.',
    );
    expect(validateEventForm({ ...VALID, name: 'x'.repeat(200) })).toEqual({});
  });

  it('requires the audience picker to hold a selection', () => {
    expect(validateEventForm({ ...VALID, audienceId: '' }).audienceId).toBe('Choose the audience.');
  });

  it('requires a 24-hour start time and validates an optional end time', () => {
    expect(validateEventForm({ ...VALID, startTime: '' }).startTime).toBe(
      'Start time is required.',
    );
    expect(validateEventForm({ ...VALID, startTime: '9:00' }).startTime).toBe(
      'Start time must be a 24-hour time (HH:MM).',
    );
    expect(validateEventForm({ ...VALID, endTime: '5:30 PM' }).endTime).toBe(
      'End time must be a 24-hour time (HH:MM).',
    );
    expect(validateEventForm({ ...VALID, endTime: '' })).toEqual({});
    expect(validateEventForm({ ...VALID, endTime: '09:00' }).endTime).toBe(
      'The end time must be after the start time.',
    );
  });

  it('caps the venue name and the description', () => {
    expect(validateEventForm({ ...VALID, venueName: 'x'.repeat(201) }).venueName).toBe(
      'Venue name must be 200 characters or fewer.',
    );
    expect(validateEventForm({ ...VALID, venueName: 'x'.repeat(200) })).toEqual({});
    expect(validateEventForm({ ...VALID, description: 'x'.repeat(2001) }).description).toBe(
      'Description must be 2000 characters or fewer.',
    );
    expect(validateEventForm({ ...VALID, description: 'x'.repeat(2000) })).toEqual({});
  });

  it('requires at least one date when the event does not repeat', () => {
    expect(validateEventForm({ ...VALID, occurrences: [] }).occurrences).toBe(
      'Add at least one date.',
    );
  });

  it('requires a real, unique date on every row', () => {
    expect(
      validateEventForm({ ...VALID, occurrences: [{ date: '', startTime: '', endTime: '' }] })[
        occurrenceErrorKey(0, 'date')
      ],
    ).toBe('Choose the date.');

    expect(
      validateEventForm({
        ...VALID,
        occurrences: [{ date: '2026-02-31', startTime: '', endTime: '' }],
      })[occurrenceErrorKey(0, 'date')],
    ).toBe('The date must be a real date in YYYY-MM-DD form.');

    const duplicate = validateEventForm({
      ...VALID,
      occurrences: [
        { date: '2026-01-15', startTime: '', endTime: '' },
        { date: '2026-01-15', startTime: '', endTime: '' },
      ],
    });
    expect(duplicate[occurrenceErrorKey(0, 'date')]).toBeUndefined();
    expect(duplicate[occurrenceErrorKey(1, 'date')]).toBe('Each date must be unique.');
  });

  it('accepts a blank row time and rejects a malformed or reversed one', () => {
    expect(
      validateEventForm({
        ...VALID,
        occurrences: [{ date: '2026-01-15', startTime: '', endTime: '' }],
      }),
    ).toEqual({});

    const malformed = validateEventForm({
      ...VALID,
      occurrences: [{ date: '2026-01-15', startTime: '9:00', endTime: '5:30 PM' }],
    });
    expect(malformed[occurrenceErrorKey(0, 'startTime')]).toBe(
      'The start time must be a 24-hour time (HH:MM).',
    );
    expect(malformed[occurrenceErrorKey(0, 'endTime')]).toBe(
      'The end time must be a 24-hour time (HH:MM).',
    );

    const reversed = validateEventForm({
      ...VALID,
      occurrences: [{ date: '2026-01-15', startTime: '11:00', endTime: '11:00' }],
    });
    expect(reversed[occurrenceErrorKey(0, 'endTime')]).toBe(
      'The end time must be after the start time.',
    );
  });

  it('validates the recurrence fields instead of the date rows when Repeats is on', () => {
    expect(
      validateEventForm({
        ...VALID,
        repeats: true,
        occurrences: [],
        effectiveFrom: '2026-01-15',
      }),
    ).toEqual({});

    expect(validateEventForm({ ...VALID, repeats: true, effectiveFrom: '' }).effectiveFrom).toBe(
      'Choose the date the recurrence starts.',
    );
    expect(
      validateEventForm({ ...VALID, repeats: true, effectiveFrom: '2026-13-40' }).effectiveFrom,
    ).toBe('The start date must be a real date in YYYY-MM-DD form.');
    expect(
      validateEventForm({
        ...VALID,
        repeats: true,
        effectiveFrom: '2026-01-15',
        endsOn: '2025-12-31',
      }).endsOn,
    ).toBe('The end date must not be before the start date.');
  });

  it('addresses every row error by row and field', () => {
    expect(occurrenceErrorKey(0, 'date')).toBe('occurrence-0-date');
    expect(occurrenceErrorKey(1, 'startTime')).toBe('occurrence-1-start');
    expect(occurrenceErrorKey(2, 'endTime')).toBe('occurrence-2-end');
  });
});

describe('createEmptyEventForm', () => {
  it('starts today in UTC with one date, no audience and members tracked', () => {
    expect(createEmptyEventForm('2026-11-22')).toEqual({
      eventNo: '',
      name: '',
      audienceId: '',
      description: '',
      venueType: 'auditorium',
      venueName: '',
      startTime: '09:00',
      endTime: '',
      tracksMembers: true,
      repeats: false,
      cadence: 'weekly',
      effectiveFrom: '2026-11-22',
      endsOn: '',
      occurrences: [{ date: '2026-11-22', startTime: '', endTime: '' }],
    });
  });
});

describe('toCreateEventPayload', () => {
  it('trims the fields and sends the parent shape with its date rows', () => {
    expect(
      toCreateEventPayload({
        ...VALID,
        eventNo: '  EVT-2026-031  ',
        name: '  Strategic Conference  ',
        venueName: '  Main Auditorium  ',
        description: '  Annual leadership conference.  ',
      }),
    ).toEqual({
      eventNo: 'EVT-2026-031',
      name: 'Strategic Conference',
      audienceId: 'aud-everyone',
      description: 'Annual leadership conference.',
      venueType: 'auditorium',
      venueName: 'Main Auditorium',
      startTime: '09:00',
      endTime: '17:00',
      tracksMembers: true,
      occurrences: [{ date: '2026-01-15' }],
    });
  });

  it('omits blank optional fields and never sends the retired or derived fields', () => {
    const payload = toCreateEventPayload({
      ...VALID,
      eventNo: '   ',
      endTime: ' ',
      venueName: ' ',
      description: ' ',
    });

    expect(payload).not.toHaveProperty('eventNo');
    expect(payload).not.toHaveProperty('endTime');
    expect(payload).not.toHaveProperty('venueName');
    expect(payload).not.toHaveProperty('description');
    for (const key of [
      'sessions',
      'startDate',
      'endDate',
      'ministry',
      'presbyterOnly',
      'status',
      'source',
      'timezone',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('carries a row start and end time when the row names them', () => {
    const payload = toCreateEventPayload({
      ...VALID,
      occurrences: [
        { date: '2026-01-15', startTime: '10:00', endTime: '12:00' },
        { date: '2026-01-16', startTime: '', endTime: '' },
      ],
    });

    expect(payload.occurrences).toEqual([
      { date: '2026-01-15', startTime: '10:00', endTime: '12:00' },
      { date: '2026-01-16' },
    ]);
  });

  it('maps each cadence to its rrule and the effective date to the weekday/day', () => {
    const base = { ...VALID, repeats: true, occurrences: [] };

    expect(
      toCreateEventPayload({ ...base, cadence: 'weekly', effectiveFrom: '2026-01-15' }).recurrence,
    ).toEqual({
      schedules: [{ effectiveFrom: '2026-01-15', rrule: 'FREQ=WEEKLY;BYDAY=TH' }],
    });
    expect(
      toCreateEventPayload({ ...base, cadence: 'fortnightly', effectiveFrom: '2026-01-15' })
        .recurrence,
    ).toEqual({
      schedules: [{ effectiveFrom: '2026-01-15', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH' }],
    });
    expect(
      toCreateEventPayload({ ...base, cadence: 'monthly', effectiveFrom: '2026-01-15' }).recurrence,
    ).toEqual({
      schedules: [{ effectiveFrom: '2026-01-15', rrule: 'FREQ=MONTHLY;BYMONTHDAY=15' }],
    });
    expect(
      toCreateEventPayload({
        ...base,
        cadence: 'weekly',
        effectiveFrom: '2026-01-15',
        endsOn: '2026-12-31',
      }).recurrence,
    ).toEqual({
      schedules: [
        { effectiveFrom: '2026-01-15', rrule: 'FREQ=WEEKLY;BYDAY=TH', endsOn: '2026-12-31' },
      ],
    });
  });

  it('never sends both a recurrence and date rows', () => {
    const payload = toCreateEventPayload({ ...VALID, repeats: true });
    expect(payload).toHaveProperty('recurrence');
    expect(payload).not.toHaveProperty('occurrences');
  });

  it('refuses to build a recurrence from a date that has no weekday', () => {
    expect(() =>
      toCreateEventPayload({ ...VALID, repeats: true, effectiveFrom: '2026-02-31' }),
    ).toThrowError('The recurrence start date is invalid.');
  });
});

describe('toUpdateEventPayload', () => {
  it('sends the identity fields and neither the event number nor members tracking', () => {
    const payload = toUpdateEventPayload({
      ...VALID,
      name: '  Strategic Conference  ',
      audienceId: 'aud-presbyters',
    });

    expect(payload).toEqual({
      name: 'Strategic Conference',
      audienceId: 'aud-presbyters',
      venueType: 'auditorium',
      startTime: '09:00',
      endTime: '17:00',
      venueName: 'Main Auditorium',
      description: 'Annual leadership conference.',
    });
    expect(payload).not.toHaveProperty('eventNo');
    expect(payload).not.toHaveProperty('tracksMembers');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('recurrence');
    expect(payload).not.toHaveProperty('occurrences');
  });

  it('clears a blank optional value with null rather than omitting it', () => {
    expect(
      toUpdateEventPayload({ ...VALID, endTime: ' ', venueName: ' ', description: ' ' }),
    ).toMatchObject({ endTime: null, venueName: null, description: null });
  });
});

describe('fromEventParent', () => {
  it('seeds the form from the parent and its latest schedule', () => {
    expect(fromEventParent(PARENT, '2026-11-22')).toEqual({
      eventNo: 'EVT-2026-023',
      name: 'Sunday Celebration',
      audienceId: 'aud-choir',
      description: 'Weekly worship',
      venueType: 'hybrid',
      venueName: 'Main Auditorium',
      startTime: '09:00',
      endTime: '11:00',
      tracksMembers: true,
      repeats: true,
      cadence: 'fortnightly',
      effectiveFrom: '2026-01-04',
      endsOn: '',
      occurrences: [{ date: '2026-11-22', startTime: '', endTime: '' }],
    });
  });

  it('leaves the cadence at weekly for a rule outside the vocabulary', () => {
    const values = fromEventParent({
      ...PARENT,
      recurrence: {
        schedules: [{ effectiveFrom: '2026-01-04', rrule: 'FREQ=DAILY', endsOn: null }],
        exceptions: [],
      },
    });

    expect(values.repeats).toBe(true);
    expect(values.cadence).toBe('weekly');
    expect(values.effectiveFrom).toBe('2026-01-04');
  });

  it('turns a standalone parent into a one-row form with no recurrence', () => {
    const values = fromEventParent({ ...PARENT, recurrence: null }, '2026-11-22');

    expect(values.repeats).toBe(false);
    expect(values.occurrences).toEqual([{ date: '2026-11-22', startTime: '', endTime: '' }]);
  });
});

describe('latestSchedule', () => {
  it('picks the version in force, not the first listed', () => {
    expect(latestSchedule(PARENT)?.effectiveFrom).toBe('2026-01-04');
    expect(latestSchedule({ recurrence: null })).toBeNull();
  });
});
