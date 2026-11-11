import { describe, expect, it } from 'vitest';
import type { EventItem, EventSessionItem } from '../api/events';
import type { Headcount } from '../api/ussd';
import {
  activitiesFromEvents,
  activitiesOn,
  activitiesThisWeek,
  activityPageSize,
  codesRemainingLabel,
  emptyHeadcountForm,
  headcountBucketSummary,
  headcountFields,
  headcountPayload,
  fromDateTimeLocal,
  nextActivities,
  nextActivitiesLine,
  toDateTimeLocal,
  type ActivityViewer,
} from './ussd';

const SESSION: EventSessionItem = {
  date: '2026-11-08',
  startTime: '09:00',
  endTime: null,
  status: 'scheduled',
  note: null,
  present: 0,
  expected: 0,
  importedRows: 0,
  source: 'none',
};

function event(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: 'event-1',
    eventNo: 'E-1',
    name: 'Sunday service',
    seriesId: null,
    ministry: null,
    timezone: 'UTC',
    startDate: '2026-11-08',
    endDate: '2026-11-08',
    startTime: '09:00',
    endTime: null,
    venueType: 'auditorium',
    venueName: null,
    description: null,
    status: 'scheduled',
    source: 'manual',
    tracksMembers: true,
    presbyterOnly: false,
    sessions: [SESSION],
    offerings: [],
    stats: {
      attachedEvents: 0,
      pledgedMinor: 0,
      paidMinor: 0,
      pendingMinor: 0,
      honorRate: 0,
      contributionCount: 0,
    },
    ...overrides,
  };
}

const VIEWER: ActivityViewer = { isPresbyter: true, ministries: ['CHOIR'] };

describe('activity eligibility', () => {
  it('shows general events to everyone, ministry events only to members of that ministry', () => {
    const general = event({ id: 'general', ministry: null });
    const choir = event({
      id: 'choir',
      ministry: { code: 'CHOIR', name: 'Choir' },
    });
    const ushering = event({
      id: 'ushering',
      ministry: { code: 'USHER', name: 'Ushering' },
    });

    const anonymous = activitiesFromEvents([general, choir, ushering], null);
    expect(anonymous.map((row) => row.eventId)).toEqual(['general']);

    const member = activitiesFromEvents([general, choir, ushering], VIEWER);
    expect(member.map((row) => row.eventId)).toEqual(['choir', 'general']);
  });

  it('hides presbyter-only events from non-presbyters', () => {
    const presbyterOnly = event({ id: 'presbyter', presbyterOnly: true });
    expect(activitiesFromEvents([presbyterOnly], null)).toEqual([]);
    expect(activitiesFromEvents([presbyterOnly], { isPresbyter: false, ministries: [] })).toEqual(
      [],
    );
    expect(activitiesFromEvents([presbyterOnly], VIEWER)).toHaveLength(1);
  });

  it('drops cancelled events and cancelled sessions', () => {
    const cancelledEvent = event({ id: 'cancelled', status: 'cancelled' });
    const cancelledSession = event({
      id: 'session-cancelled',
      sessions: [{ ...SESSION, status: 'cancelled' }],
    });
    expect(activitiesFromEvents([cancelledEvent, cancelledSession], null)).toEqual([]);
  });
});

describe('activity ordering and pages', () => {
  it('orders by date, priority tier, start time, then event number', () => {
    const general = event({
      id: 'general',
      eventNo: 'E-2',
      startTime: '10:00',
      sessions: [{ ...SESSION, date: '2026-11-08', startTime: '10:00' }],
    });
    const ministry = event({
      id: 'ministry',
      eventNo: 'E-3',
      ministry: { code: 'CHOIR', name: 'Choir' },
      sessions: [{ ...SESSION, date: '2026-11-08', startTime: '12:00' }],
    });
    const presbyter = event({
      id: 'presbyter',
      eventNo: 'E-1',
      presbyterOnly: true,
      sessions: [{ ...SESSION, date: '2026-11-08', startTime: '12:00' }],
    });
    const earlier = event({
      id: 'earlier',
      eventNo: 'E-9',
      sessions: [{ ...SESSION, date: '2026-11-07', startTime: '08:00' }],
    });
    const sameDaySameTierLate = event({
      id: 'late',
      eventNo: 'E-4',
      startTime: '11:00',
      sessions: [{ ...SESSION, date: '2026-11-08', startTime: '11:00' }],
    });

    const rows = activitiesFromEvents(
      [general, ministry, presbyter, earlier, sameDaySameTierLate],
      VIEWER,
    );

    expect(rows.map((row) => row.eventId)).toEqual([
      'earlier',
      'ministry',
      'presbyter',
      'general',
      'late',
    ]);
  });

  it('uses the channel page size: three for the reference, two at 120', () => {
    expect(activityPageSize('hmac')).toBe(3);
    expect(activityPageSize('nalo')).toBe(2);
  });

  it('splits the day and the week lists', () => {
    const today = event({
      id: 'today',
      sessions: [{ ...SESSION, date: '2026-11-08' }],
    });
    const later = event({
      id: 'later',
      sessions: [{ ...SESSION, date: '2026-11-12' }],
    });
    const all = activitiesFromEvents([today, later], null);

    expect(activitiesOn(all, '2026-11-08').map((row) => row.eventId)).toEqual(['today']);
    expect(activitiesThisWeek(all, '2026-11-08').map((row) => row.eventId)).toEqual([
      'today',
      'later',
    ]);
  });

  it('names the next applicable day within two weeks and says none beyond', () => {
    const soon = event({ id: 'soon', sessions: [{ ...SESSION, date: '2026-11-10' }] });
    const day = activitiesOn([], '2026-11-08');

    expect(day).toEqual([]);
    const next = nextActivities(activitiesFromEvents([soon], null), '2026-11-08');
    expect(next).toEqual({ date: '2026-11-10', count: 1, days: 2 });
    expect(nextActivitiesLine(next!)).toBe('1 event in 2 days');

    const far = event({ id: 'far', sessions: [{ ...SESSION, date: '2026-12-20' }] });
    expect(nextActivities(activitiesFromEvents([far], null), '2026-11-08')).toBeNull();
  });

  it('uses tomorrow for a one-day gap', () => {
    const tomorrow = event({ id: 'tomorrow', sessions: [{ ...SESSION, date: '2026-11-09' }] });
    const next = nextActivities(activitiesFromEvents([tomorrow], null), '2026-11-08');
    expect(nextActivitiesLine(next!)).toBe('1 event tomorrow');
  });
});

describe('headcount entry', () => {
  it('offers three numbers in Adult and Children service and four in Mixed', () => {
    expect(headcountFields('adults').map((field) => field.key)).toEqual([
      'adultMale',
      'adultFemale',
      'childUnspecified',
    ]);
    expect(headcountFields('children').map((field) => field.key)).toEqual([
      'adultUnspecified',
      'childMale',
      'childFemale',
    ]);
    expect(headcountFields('mixed').map((field) => field.key)).toEqual([
      'adultMale',
      'adultFemale',
      'childMale',
      'childFemale',
    ]);
  });

  it('zeroes the buckets the selected mode does not use', () => {
    const values = {
      ...emptyHeadcountForm(),
      adultMale: '10',
      adultFemale: '8',
      childUnspecified: '3',
    };
    expect(headcountPayload('adults', values)).toEqual({
      payload: {
        adultMale: 10,
        adultFemale: 8,
        adultUnspecified: 0,
        childMale: 0,
        childFemale: 0,
        childUnspecified: 3,
      },
    });
  });

  it('rejects a non-numeric or oversized entry without a request', () => {
    expect(headcountPayload('adults', { ...emptyHeadcountForm(), adultMale: 'ten' })).toEqual({
      error: 'Adult men must be a whole number.',
    });
    expect(headcountPayload('mixed', { ...emptyHeadcountForm(), adultMale: '10001' })).toEqual({
      error: 'Adult men must be 10,000 or fewer.',
    });
  });

  it('allows an all-zero observation', () => {
    expect(headcountPayload('children', emptyHeadcountForm())).toEqual({
      payload: {
        adultMale: 0,
        adultFemale: 0,
        adultUnspecified: 0,
        childMale: 0,
        childFemale: 0,
        childUnspecified: 0,
      },
    });
  });

  it('summarises only the non-zero buckets in one line', () => {
    const row: Headcount = {
      id: 'headcount-1',
      eventId: 'event-1',
      sessionDate: '2026-11-08',
      asOf: '2026-11-08T10:42:00.000Z',
      mode: 'adults',
      adultMale: 62,
      adultFemale: 71,
      adultUnspecified: 0,
      childMale: 0,
      childFemale: 0,
      childUnspecified: 9,
      total: 142,
      recordedBy: 'demo.officer',
      recordedAt: '2026-11-08T10:44:00.000Z',
      supersedesId: null,
      supersededBy: null,
    };

    expect(headcountBucketSummary(row)).toBe('AM 62 · AF 71 · C? 9');
    expect(
      headcountBucketSummary({ ...row, adultMale: 0, adultFemale: 0, childUnspecified: 0 }),
    ).toBe('All zero');
  });
});

describe('datetime-local helpers', () => {
  it('round-trips a local wall-clock value to the ISO instant', () => {
    const local = new Date(2026, 10, 6, 9, 5);
    const value = toDateTimeLocal(local);
    expect(value).toBe('2026-11-06T09:05');
    expect(fromDateTimeLocal(value)).toBe(local.toISOString());
  });

  it('returns an empty string for invalid input', () => {
    expect(fromDateTimeLocal('not-a-date')).toBe('');
  });
});

describe('code TTL label', () => {
  it('reports the remaining minutes and the expired state', () => {
    const now = new Date('2026-11-06T10:00:00Z');
    expect(codesRemainingLabel('2026-11-06T10:12:00Z', now)).toBe('12 min left of 15');
    expect(codesRemainingLabel('2026-11-06T09:59:00Z', now)).toBe('Expired');
  });
});
