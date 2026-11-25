import { describe, expect, it } from 'vitest';
import type { EventParentItem } from '../api/events';
import {
  EVENT_VENUE_OPTIONS,
  audienceIdsOf,
  createEmptyEventForm,
  createEmptySchedule,
  defaultCycleMonth,
  fromEventParent,
  latestSchedule,
  occurrenceErrorKey,
  toCreateEventPayload,
  toPeriodInput,
  toPreviewInput,
  toScheduleRrule,
  toUpdateEventPayload,
  validateEventForm,
  type EventFormValues,
} from './event-form';

const VALID: EventFormValues = {
  eventNo: 'EVT-2026-031',
  name: 'Strategic Conference',
  audienceIds: ['aud-everyone'],
  description: 'Annual leadership conference.',
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  startTime: '09:00',
  endTime: '17:00',
  tracksMembers: true,
  repeats: false,
  schedule: {
    ...createEmptySchedule('2026-01-15'),
    weekdays: ['TH'],
  },
  effectiveFrom: '2026-01-15',
  endsOn: '',
  occurrences: [{ date: '2026-01-15', startTime: '', endTime: '' }],
};

const PARENT: EventParentItem = {
  id: 'event-parent-1',
  eventNo: 'EVT-2026-023',
  name: 'Sunday Celebration',
  audienceIds: ['aud-choir', 'aud-youth'],
  audiences: [
    { id: 'aud-choir', name: 'Choir', system: true, summary: 'Choir - all of ministry CHR' },
    {
      id: 'aud-youth',
      name: 'Youth 13-17',
      system: true,
      summary: 'Youth 13-17 - all of age 13-17',
    },
  ],
  audienceId: 'aud-choir',
  audience: {
    id: 'aud-choir',
    name: 'Choir',
    system: true,
    summary: 'Choir - all of ministry CHR',
  },
  period: null,
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
      {
        effectiveFrom: '2026-01-04',
        rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU',
        endsOn: null,
      },
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

  it('has no event-number constraint at all', () => {
    // The field is a read-only edit seed and never a create control (AC 8).
    expect(validateEventForm({ ...VALID, eventNo: 'x'.repeat(400) })).toEqual({});
  });

  it('requires a name and enforces its 200-character limit', () => {
    expect(validateEventForm({ ...VALID, name: ' ' }).name).toBe('Name is required.');
    expect(validateEventForm({ ...VALID, name: 'x'.repeat(201) }).name).toBe(
      'Name must be 200 characters or fewer.',
    );
    expect(validateEventForm({ ...VALID, name: 'x'.repeat(200) })).toEqual({});
  });

  it('requires at least one audience in the ordered set', () => {
    expect(validateEventForm({ ...VALID, audienceIds: [] }).audienceIds).toBe(
      'Choose at least one audience.',
    );
    expect(validateEventForm({ ...VALID, audienceIds: [' ', ''] }).audienceIds).toBe(
      'Choose at least one audience.',
    );
    expect(validateEventForm({ ...VALID, audienceIds: ['a', 'b'] })).toEqual({});
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

  it('validates the rule instead of the date rows when Repeats is on', () => {
    const base = { ...VALID, repeats: true, occurrences: [] };

    expect(validateEventForm(base)).toEqual({});
    expect(validateEventForm({ ...base, effectiveFrom: '' }).effectiveFrom).toBe(
      'Choose the date the recurrence starts.',
    );
    expect(validateEventForm({ ...base, effectiveFrom: '2026-13-40' }).effectiveFrom).toBe(
      'The start date must be a real date in YYYY-MM-DD form.',
    );
    expect(validateEventForm({ ...base, endsOn: '2025-12-31' }).endsOn).toBe(
      'The end date must not be before the start date.',
    );
  });

  it('bounds the daily and weekly intervals and requires a weekday', () => {
    const daily = {
      ...VALID,
      repeats: true,
      occurrences: [],
      schedule: { ...VALID.schedule, cadence: 'daily' as const, interval: '8' },
    };
    expect(validateEventForm(daily).interval).toBe('The interval must be between 1 and 7 days.');
    expect(
      validateEventForm({
        ...daily,
        schedule: { ...daily.schedule, interval: '7' },
      }),
    ).toEqual({});

    const weekly = {
      ...VALID,
      repeats: true,
      occurrences: [],
      schedule: { ...VALID.schedule, cadence: 'weekly' as const, weekdays: [], interval: '1' },
    };
    expect(validateEventForm(weekly).weekdays).toBe('Choose at least one day.');
    expect(
      validateEventForm({ ...weekly, schedule: { ...weekly.schedule, interval: '5' } }).interval,
    ).toBe('The interval must be between 1 and 4 weeks.');
  });

  it('bounds the monthly day and accepts a blank one', () => {
    const monthly = {
      ...VALID,
      repeats: true,
      occurrences: [],
      schedule: { ...VALID.schedule, cadence: 'monthly' as const, monthlyMode: 'day' as const },
    };
    expect(validateEventForm(monthly)).toEqual({});
    expect(
      validateEventForm({ ...monthly, schedule: { ...monthly.schedule, dayOfMonth: '32' } })
        .dayOfMonth,
    ).toBe('The day of the month must be between 1 and 31.');
    expect(
      validateEventForm({ ...monthly, schedule: { ...monthly.schedule, dayOfMonth: '0' } })
        .dayOfMonth,
    ).toBe('The day of the month must be between 1 and 31.');
  });

  it('validates the period mode: an id, a cycle, and a day only on a week period', () => {
    const period = {
      ...VALID,
      repeats: true,
      occurrences: [],
      schedule: {
        ...VALID.schedule,
        mode: 'period' as const,
        periodId: 'communion-week',
        cycleMonth: '2026-12',
        periodFrequency: 'one-cycle' as const,
      },
    };
    expect(validateEventForm(period)).toEqual({});
    expect(
      validateEventForm({ ...period, schedule: { ...period.schedule, periodId: '' } }).period,
    ).toBe('Choose a period.');
    expect(
      validateEventForm({ ...period, schedule: { ...period.schedule, cycleMonth: '2026-13' } })
        .cycleMonth,
    ).toBe('Choose the cycle month.');

    expect(
      validateEventForm({
        ...period,
        effectiveFrom: '',
        schedule: { ...period.schedule, periodFrequency: 'monthly' },
      }).effectiveFrom,
    ).toBe('Choose the date the period starts.');

    expect(
      validateEventForm({
        ...period,
        schedule: {
          ...period.schedule,
          periodFrequency: 'monthly',
          periodKind: 'date',
          periodDay: 'MO',
        },
      }).periodDay,
    ).toBe('This period is a single date, so it takes no day inside it.');
  });

  it('addresses every row error by row and field', () => {
    expect(occurrenceErrorKey(0, 'date')).toBe('occurrence-0-date');
    expect(occurrenceErrorKey(1, 'startTime')).toBe('occurrence-1-start');
    expect(occurrenceErrorKey(2, 'endTime')).toBe('occurrence-2-end');
  });
});

describe('createEmptyEventForm and the period cycle default', () => {
  it('starts today in UTC with one date, no audience and members tracked', () => {
    expect(createEmptyEventForm('2026-11-22')).toEqual({
      eventNo: '',
      name: '',
      audienceIds: [],
      description: '',
      venueType: 'auditorium',
      venueName: '',
      startTime: '09:00',
      endTime: '',
      tracksMembers: true,
      repeats: false,
      schedule: createEmptySchedule('2026-11-22'),
      effectiveFrom: '2026-11-22',
      endsOn: '',
      occurrences: [{ date: '2026-11-22', startTime: '', endTime: '' }],
    });
  });

  it('prefers the start date’s month only when it is still ahead, else the next month', () => {
    // Opening on 24 November offers December: November's cycle has run.
    expect(defaultCycleMonth('2026-11-24', '2026-11-24')).toBe('2026-12');
    // A start date next year keeps its own month.
    expect(defaultCycleMonth('2027-02-01', '2026-11-24')).toBe('2027-02');
    // The year boundary rolls over.
    expect(defaultCycleMonth('2026-12-24', '2026-12-24')).toBe('2027-01');
  });
});

describe('toCreateEventPayload', () => {
  it('trims the fields and sends the parent shape with its date rows', () => {
    expect(
      toCreateEventPayload({
        ...VALID,
        name: '  Strategic Conference  ',
        venueName: '  Main Auditorium  ',
        description: '  Annual leadership conference.  ',
      }),
    ).toEqual({
      name: 'Strategic Conference',
      audienceIds: ['aud-everyone'],
      description: 'Annual leadership conference.',
      venueType: 'auditorium',
      venueName: 'Main Auditorium',
      startTime: '09:00',
      endTime: '17:00',
      tracksMembers: true,
      occurrences: [{ date: '2026-01-15' }],
    });
  });

  it('never sends an event number, and never the retired or derived fields', () => {
    const payload = toCreateEventPayload({
      ...VALID,
      eventNo: 'EVT-2026-031',
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

  it('sends the audience set in order', () => {
    const payload = toCreateEventPayload({ ...VALID, audienceIds: ['aud-choir', 'aud-youth'] });
    expect(payload.audienceIds).toEqual(['aud-choir', 'aud-youth']);
    expect(payload).not.toHaveProperty('audienceId');
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

  it('maps each cadence to its rrule', () => {
    const base = { ...VALID, repeats: true, occurrences: [] };

    expect(
      toCreateEventPayload({
        ...base,
        schedule: { ...base.schedule, cadence: 'daily', interval: '3' },
      }).recurrence,
    ).toEqual({ schedules: [{ effectiveFrom: '2026-01-15', rrule: 'FREQ=DAILY;INTERVAL=3' }] });

    expect(
      toCreateEventPayload({
        ...base,
        schedule: { ...base.schedule, cadence: 'weekly', weekdays: ['MO', 'TH'], interval: '1' },
      }).recurrence,
    ).toEqual({
      schedules: [{ effectiveFrom: '2026-01-15', rrule: 'FREQ=WEEKLY;BYDAY=MO,TH' }],
    });

    expect(
      toCreateEventPayload({
        ...base,
        schedule: { ...base.schedule, cadence: 'weekly', weekdays: ['MO', 'TH'], interval: '2' },
      }).recurrence,
    ).toEqual({
      schedules: [
        { effectiveFrom: '2026-01-15', rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO,TH' },
      ],
    });

    // Fortnightly is the interval-of-two preset on the start date's weekday.
    expect(
      toCreateEventPayload({
        ...base,
        schedule: { ...base.schedule, cadence: 'fortnightly', weekdays: [], interval: '2' },
      }).recurrence,
    ).toEqual({
      schedules: [
        { effectiveFrom: '2026-01-15', rrule: 'FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=TH' },
      ],
    });

    expect(
      toCreateEventPayload({
        ...base,
        schedule: { ...base.schedule, cadence: 'monthly', monthlyMode: 'day', dayOfMonth: '28' },
      }).recurrence,
    ).toEqual({
      schedules: [{ effectiveFrom: '2026-01-15', rrule: 'FREQ=MONTHLY;BYMONTHDAY=28' }],
    });

    expect(
      toCreateEventPayload({
        ...base,
        schedule: {
          ...base.schedule,
          cadence: 'monthly',
          monthlyMode: 'position',
          position: 'last',
          positionWeekday: 'SA',
        },
      }).recurrence,
    ).toEqual({
      schedules: [{ effectiveFrom: '2026-01-15', rrule: 'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=SA' }],
    });
  });

  it('carries the end date when one is chosen', () => {
    const payload = toCreateEventPayload({
      ...VALID,
      repeats: true,
      occurrences: [],
      endsOn: '2026-12-31',
    });
    expect(payload.recurrence?.schedules[0]?.endsOn).toBe('2026-12-31');
  });

  it('sends a named period instead of an rrule', () => {
    const base = { ...VALID, repeats: true, occurrences: [] };

    expect(
      toCreateEventPayload({
        ...base,
        schedule: {
          ...base.schedule,
          mode: 'period',
          periodId: 'communion-week',
          periodFrequency: 'one-cycle',
          cycleMonth: '2026-12',
        },
      }),
    ).toMatchObject({ period: { id: 'communion-week', cycleMonth: '2026-12' } });

    const monthly = toCreateEventPayload({
      ...base,
      schedule: {
        ...base.schedule,
        mode: 'period',
        periodId: 'communion-week',
        periodFrequency: 'monthly',
        periodDay: 'SU',
      },
    });
    expect(monthly).toMatchObject({
      period: {
        id: 'communion-week',
        frequency: 'monthly',
        day: 'SU',
        effectiveFrom: '2026-01-15',
      },
    });
    expect(monthly).not.toHaveProperty('recurrence');
    expect(monthly).not.toHaveProperty('occurrences');
  });

  it('never sends both a recurrence and date rows', () => {
    const payload = toCreateEventPayload({ ...VALID, repeats: true });
    expect(payload).toHaveProperty('recurrence');
    expect(payload).not.toHaveProperty('occurrences');
  });
});

describe('toPeriodInput', () => {
  it('omits the anchor from the one-cycle arm and carries it on the monthly arm', () => {
    const schedule = {
      ...createEmptySchedule('2026-11-24'),
      mode: 'period' as const,
      periodId: 'communion-week',
    };
    expect(
      toPeriodInput(
        { ...schedule, periodFrequency: 'one-cycle', cycleMonth: '2026-12' },
        '2026-11-24',
      ),
    ).toEqual({ id: 'communion-week', cycleMonth: '2026-12' });
    expect(
      toPeriodInput({ ...schedule, periodFrequency: 'monthly', periodDay: '' }, '2026-11-24'),
    ).toEqual({
      id: 'communion-week',
      frequency: 'monthly',
      effectiveFrom: '2026-11-24',
    });
  });
});

describe('toPreviewInput', () => {
  it('has nothing to preview for a standalone event', () => {
    expect(toPreviewInput(VALID)).toBeNull();
  });

  it('sends the same recurrence the create would send, with the audience set', () => {
    expect(
      toPreviewInput({
        ...VALID,
        repeats: true,
        audienceIds: ['aud-choir', 'aud-youth'],
        endsOn: '2026-12-31',
      }),
    ).toEqual({
      audienceIds: ['aud-choir', 'aud-youth'],
      recurrence: {
        schedules: [
          {
            effectiveFrom: '2026-01-15',
            rrule: 'FREQ=WEEKLY;BYDAY=TH',
            endsOn: '2026-12-31',
          },
        ],
      },
    });
  });

  it('sends the period shape when the period arm is live', () => {
    expect(
      toPreviewInput({
        ...VALID,
        repeats: true,
        schedule: {
          ...VALID.schedule,
          mode: 'period',
          periodId: 'communion-week',
          periodFrequency: 'monthly',
          periodDay: 'SU',
        },
      }),
    ).toEqual({
      audienceIds: ['aud-everyone'],
      period: {
        id: 'communion-week',
        frequency: 'monthly',
        day: 'SU',
        effectiveFrom: '2026-01-15',
      },
    });
  });

  it('is null until the rule is buildable', () => {
    expect(
      toPreviewInput({ ...VALID, repeats: true, schedule: { ...VALID.schedule, interval: '9' } }),
    ).toBeNull();
  });
});

describe('toScheduleRrule', () => {
  it('is null for an unbuildable rule and a string for a buildable one', () => {
    expect(toScheduleRrule({ ...VALID.schedule, interval: '' }, '2026-01-15')).toBeNull();
    expect(toScheduleRrule(VALID.schedule, '2026-01-15')).toBe('FREQ=WEEKLY;BYDAY=TH');
  });
});

describe('toUpdateEventPayload', () => {
  it('sends the identity fields as an audience set, and neither the number nor tracking', () => {
    const payload = toUpdateEventPayload({
      ...VALID,
      name: '  Strategic Conference  ',
      audienceIds: ['aud-choir', 'aud-presbyters'],
    });

    expect(payload).toEqual({
      name: 'Strategic Conference',
      audienceIds: ['aud-choir', 'aud-presbyters'],
      venueType: 'auditorium',
      startTime: '09:00',
      endTime: '17:00',
      venueName: 'Main Auditorium',
      description: 'Annual leadership conference.',
    });
    expect(payload).not.toHaveProperty('eventNo');
    expect(payload).not.toHaveProperty('audienceId');
    expect(payload).not.toHaveProperty('tracksMembers');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('recurrence');
    expect(payload).not.toHaveProperty('period');
    expect(payload).not.toHaveProperty('occurrences');
  });

  it('clears a blank optional value with null rather than omitting it', () => {
    expect(
      toUpdateEventPayload({ ...VALID, endTime: ' ', venueName: ' ', description: ' ' }),
    ).toMatchObject({ endTime: null, venueName: null, description: null });
  });
});

describe('audienceIdsOf', () => {
  it('prefers the ordered set and honours the one-round alias on read', () => {
    expect(audienceIdsOf(PARENT)).toEqual(['aud-choir', 'aud-youth']);
    expect(audienceIdsOf({ audienceIds: [], audienceId: 'aud-legacy' })).toEqual(['aud-legacy']);
    expect(audienceIdsOf({ audienceId: 'aud-legacy' })).toEqual(['aud-legacy']);
  });
});

describe('fromEventParent', () => {
  it('seeds the form from the parent, its audience set and its latest schedule', () => {
    expect(fromEventParent(PARENT, '2026-11-22')).toEqual({
      eventNo: 'EVT-2026-023',
      name: 'Sunday Celebration',
      audienceIds: ['aud-choir', 'aud-youth'],
      description: 'Weekly worship',
      venueType: 'hybrid',
      venueName: 'Main Auditorium',
      startTime: '09:00',
      endTime: '11:00',
      tracksMembers: true,
      repeats: true,
      schedule: {
        ...createEmptySchedule('2026-11-22'),
        cadence: 'fortnightly',
        weekdays: ['SU'],
        interval: '2',
        dayOfMonth: '',
      },
      effectiveFrom: '2026-01-04',
      endsOn: '',
      occurrences: [{ date: '2026-11-22', startTime: '', endTime: '' }],
    });
  });

  it('seeds the period arm from the event’s provenance', () => {
    const values = fromEventParent(
      {
        ...PARENT,
        recurrence: null,
        period: {
          id: 'communion-week',
          name: 'Communion Week',
          cycle: null,
          frequency: 'monthly',
          day: 'SU',
        },
      },
      '2026-11-22',
    );

    expect(values.repeats).toBe(true);
    expect(values.schedule.mode).toBe('period');
    expect(values.schedule.periodId).toBe('communion-week');
    expect(values.schedule.periodFrequency).toBe('monthly');
    expect(values.schedule.periodDay).toBe('SU');
  });

  it('leaves the builder at its default for a rule outside the vocabulary', () => {
    const values = fromEventParent({
      ...PARENT,
      recurrence: {
        schedules: [{ effectiveFrom: '2026-01-04', rrule: 'FREQ=YEARLY', endsOn: null }],
        exceptions: [],
      },
    });

    expect(values.repeats).toBe(true);
    expect(values.schedule.cadence).toBe('weekly');
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
