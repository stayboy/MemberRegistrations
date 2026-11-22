import { describe, expect, it } from 'vitest';
import {
  EVENT_VENUE_OPTIONS,
  createEmptyEventForm,
  sessionErrorKey,
  toCreateEventPayload,
  validateEventForm,
  type EventFormValues,
} from './event-form';

const VALID: EventFormValues = {
  eventNo: 'EVT-2026-031',
  name: 'Strategic Conference',
  startDate: '2026-01-15',
  endDate: '2026-01-16',
  startTime: '09:00',
  endTime: '17:00',
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  description: 'Annual leadership conference.',
  tracksMembers: true,
  presbyterOnly: false,
  sessions: [{ date: '2026-01-15', startTime: '', endTime: '' }],
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

  it('requires an event number and enforces its 64-character limit', () => {
    expect(validateEventForm({ ...VALID, eventNo: '  ' }).eventNo).toBe(
      'Event number is required.',
    );
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

  it('requires real calendar dates and an end date on or after the start', () => {
    expect(validateEventForm({ ...VALID, startDate: '' }).startDate).toBe('Choose the start date.');
    expect(validateEventForm({ ...VALID, startDate: '2026-02-31' }).startDate).toBe(
      'Start date must be a real date in YYYY-MM-DD form.',
    );
    expect(validateEventForm({ ...VALID, endDate: '' }).endDate).toBe('Choose the end date.');
    expect(validateEventForm({ ...VALID, endDate: '2026-13-40' }).endDate).toBe(
      'End date must be a real date in YYYY-MM-DD form.',
    );
    expect(
      validateEventForm({ ...VALID, startDate: '2026-01-16', endDate: '2026-01-15' }).endDate,
    ).toBe('The end date must not be before the start date.');
    expect(
      validateEventForm({ ...VALID, startDate: '2026-01-15', endDate: '2026-01-15' }).endDate,
    ).toBeUndefined();
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
    // A blank end time leaves the session open-ended.
    expect(validateEventForm({ ...VALID, endTime: '' })).toEqual({});
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

  it('requires at least one session', () => {
    expect(validateEventForm({ ...VALID, sessions: [] }).sessions).toBe(
      'Add at least one session.',
    );
  });

  it('requires a real session date inside the event range', () => {
    expect(
      validateEventForm({
        ...VALID,
        sessions: [{ date: '', startTime: '', endTime: '' }],
      })[sessionErrorKey(0, 'date')],
    ).toBe('Choose the session date.');

    expect(
      validateEventForm({
        ...VALID,
        sessions: [{ date: '2026-02-31', startTime: '', endTime: '' }],
      })[sessionErrorKey(0, 'date')],
    ).toBe('The session date must be a real date in YYYY-MM-DD form.');

    expect(
      validateEventForm({
        ...VALID,
        sessions: [{ date: '2026-01-14', startTime: '', endTime: '' }],
      })[sessionErrorKey(0, 'date')],
    ).toBe('The session date must fall inside the event range.');

    expect(
      validateEventForm({
        ...VALID,
        sessions: [{ date: '2026-01-17', startTime: '', endTime: '' }],
      })[sessionErrorKey(0, 'date')],
    ).toBe('The session date must fall inside the event range.');

    expect(
      validateEventForm({
        ...VALID,
        sessions: [{ date: '2026-01-16', startTime: '', endTime: '' }],
      }),
    ).toEqual({});
  });

  it('rejects a duplicate session date on the later row', () => {
    const errors = validateEventForm({
      ...VALID,
      sessions: [
        { date: '2026-01-15', startTime: '', endTime: '' },
        { date: '2026-01-15', startTime: '', endTime: '' },
      ],
    });

    expect(errors[sessionErrorKey(0, 'date')]).toBeUndefined();
    expect(errors[sessionErrorKey(1, 'date')]).toBe('Each session date must be unique.');
  });

  it('accepts a blank session time and rejects a malformed one', () => {
    expect(
      validateEventForm({
        ...VALID,
        sessions: [{ date: '2026-01-15', startTime: '', endTime: '' }],
      }),
    ).toEqual({});

    const errors = validateEventForm({
      ...VALID,
      sessions: [{ date: '2026-01-15', startTime: '9:00', endTime: '5:30 PM' }],
    });
    expect(errors[sessionErrorKey(0, 'startTime')]).toBe(
      'The session start time must be a 24-hour time (HH:MM).',
    );
    expect(errors[sessionErrorKey(0, 'endTime')]).toBe(
      'The session end time must be a 24-hour time (HH:MM).',
    );
  });

  it('requires a session end after its start when both are present', () => {
    const errors = validateEventForm({
      ...VALID,
      sessions: [
        { date: '2026-01-15', startTime: '11:00', endTime: '11:00' },
        { date: '2026-01-16', startTime: '12:00', endTime: '11:00' },
      ],
    });

    expect(errors[sessionErrorKey(0, 'endTime')]).toBe(
      'The session end time must be after the start time.',
    );
    expect(errors[sessionErrorKey(1, 'endTime')]).toBe(
      'The session end time must be after the start time.',
    );
  });

  it('addresses every session error by row and field', () => {
    expect(sessionErrorKey(0, 'date')).toBe('session-0-date');
    expect(sessionErrorKey(1, 'startTime')).toBe('session-1-start');
    expect(sessionErrorKey(2, 'endTime')).toBe('session-2-end');
  });
});

describe('createEmptyEventForm', () => {
  it('starts today in UTC with one session and the signed-target defaults', () => {
    expect(createEmptyEventForm('2026-11-22')).toEqual({
      eventNo: '',
      name: '',
      startDate: '2026-11-22',
      endDate: '2026-11-22',
      startTime: '09:00',
      endTime: '',
      venueType: 'auditorium',
      venueName: '',
      description: '',
      tracksMembers: true,
      presbyterOnly: false,
      sessions: [{ date: '2026-11-22', startTime: '', endTime: '' }],
    });
  });
});

describe('toCreateEventPayload', () => {
  it('trims the fields, omits the timezone and keeps the tracking toggles', () => {
    expect(
      toCreateEventPayload({
        ...VALID,
        eventNo: '  EVT-2026-031  ',
        name: '  Strategic Conference  ',
        venueName: '  Main Auditorium  ',
        description: '  Annual leadership conference.  ',
        presbyterOnly: true,
      }),
    ).toEqual({
      eventNo: 'EVT-2026-031',
      name: 'Strategic Conference',
      startDate: '2026-01-15',
      endDate: '2026-01-16',
      startTime: '09:00',
      endTime: '17:00',
      venueType: 'auditorium',
      venueName: 'Main Auditorium',
      description: 'Annual leadership conference.',
      tracksMembers: true,
      presbyterOnly: true,
      sessions: [{ date: '2026-01-15' }],
    });
  });

  it('omits blank optional fields and blank session times so they inherit', () => {
    const payload = toCreateEventPayload({
      ...VALID,
      endTime: ' ',
      venueName: ' ',
      description: ' ',
      sessions: [
        { date: '2026-01-15', startTime: '', endTime: '' },
        { date: '2026-01-16', startTime: '10:00', endTime: '' },
      ],
    });

    expect(payload).not.toHaveProperty('timezone');
    expect(payload).not.toHaveProperty('endTime');
    expect(payload).not.toHaveProperty('venueName');
    expect(payload).not.toHaveProperty('description');
    expect(payload.sessions).toEqual([
      { date: '2026-01-15' },
      { date: '2026-01-16', startTime: '10:00' },
    ]);
  });

  it('sends a session end time when the row names one', () => {
    const payload = toCreateEventPayload({
      ...VALID,
      sessions: [{ date: '2026-01-15', startTime: '10:00', endTime: '12:00' }],
    });

    expect(payload.sessions).toEqual([
      { date: '2026-01-15', startTime: '10:00', endTime: '12:00' },
    ]);
  });

  it('never sends status, source or a whitespace-only event number', () => {
    const payload = toCreateEventPayload({ ...VALID, eventNo: '   ' });

    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('source');
    expect(payload).not.toHaveProperty('eventNo');
  });
});
