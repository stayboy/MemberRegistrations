import { describe, expect, it } from 'vitest';
import type { EventItem, EventOfferingItem } from '../api/events';
import {
  truncateUssd,
  ussdPreviewFromEvents,
  USSD_OFFERING_PAGE_SIZE,
  worklistScopeLabel,
  yearToDateWindow,
} from './offerings';

const EMPTY_STATS = {
  attachedEvents: 0,
  pledgedMinor: 0,
  paidMinor: 0,
  pendingMinor: 0,
  honorRate: 0,
  contributionCount: 0,
};

function offering(name: string): EventOfferingItem {
  return {
    offeringId: `offering-${name}`,
    name,
    availableUntil: null,
    expired: false,
    terms: {
      version: 1,
      name,
      purpose: name,
      kind: 'freewill',
      currency: 'GHS',
      targetMinor: null,
      defaultAmountMinor: null,
      startsOn: null,
      endsOn: null,
      availableUntil: null,
      scripture: null,
      gatewayAccount: null,
      gatewayMetadata: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'officer',
      reason: null,
    },
    exceptions: [],
    stats: EMPTY_STATS,
  };
}

function event(overrides: Partial<EventItem> & { id: string; name: string }): EventItem {
  return {
    eventNo: 'E-1',
    seriesId: null,
    ministry: null,
    timezone: 'UTC',
    startDate: '2026-01-04',
    endDate: '2026-01-04',
    startTime: '09:00',
    endTime: null,
    venueType: 'auditorium',
    venueName: null,
    description: null,
    status: 'scheduled',
    source: 'manual',
    tracksMembers: true,
    presbyterOnly: false,
    sessions: [
      {
        date: '2026-01-04',
        startTime: '09:00',
        endTime: null,
        status: 'scheduled',
        note: null,
        present: 0,
        expected: 0,
        importedRows: 0,
        source: 'none',
      },
    ],
    offerings: [],
    stats: EMPTY_STATS,
    ...overrides,
  };
}

describe('yearToDateWindow', () => {
  it('starts on 1 January of the UTC year', () => {
    expect(yearToDateWindow('2026-11-07')).toEqual({ from: '2026-01-01', to: '2026-11-07' });
    expect(yearToDateWindow('2027-01-01')).toEqual({ from: '2027-01-01', to: '2027-01-01' });
  });
});

describe('truncateUssd', () => {
  it('keeps short values and truncates long ones with an ellipsis', () => {
    expect(truncateUssd('Tithe')).toBe('Tithe');
    expect(truncateUssd('A very long offering name')).toBe('A very long offerin…');
    expect(truncateUssd('A very long offering name', 10)).toBe('A very lo…');
  });
});

describe('ussdPreviewFromEvents', () => {
  it('uses the current or next non-cancelled session', () => {
    const past = event({ id: 'past', name: 'Past service' });
    const today = event({
      id: 'today',
      name: 'Today service',
      sessions: [
        {
          date: '2026-11-07',
          startTime: '09:00',
          endTime: null,
          status: 'scheduled',
          note: null,
          present: 0,
          expected: 0,
          importedRows: 0,
          source: 'none',
        },
      ],
    });
    const later = event({
      id: 'later',
      name: 'Later service',
      sessions: [
        {
          date: '2026-11-14',
          startTime: '09:00',
          endTime: null,
          status: 'scheduled',
          note: null,
          present: 0,
          expected: 0,
          importedRows: 0,
          source: 'none',
        },
      ],
    });

    const preview = ussdPreviewFromEvents([past, later, today], '2026-11-07');
    expect(preview?.eventId).toBe('today');
    expect(preview?.sessionDate).toBe('2026-11-07');
  });

  it('shows at most five offerings and then 0 More', () => {
    const names = ['Tithe', 'Missions', 'Building', 'Freewill', 'Youth', 'Welfare'];
    const preview = ussdPreviewFromEvents(
      [
        event({
          id: 'event-1',
          name: 'Foundation service',
          sessions: [
            {
              date: '2999-01-10',
              startTime: '09:00',
              endTime: null,
              status: 'scheduled',
              note: null,
              present: 0,
              expected: 0,
              importedRows: 0,
              source: 'none',
            },
          ],
          offerings: names.map(offering),
        }),
      ],
      '2026-11-07',
    );

    expect(preview?.eventName).toBe('Foundation service');
    expect(preview?.lines).toEqual([
      'Choose offering(s)',
      '1 Tithe',
      '2 Missions',
      '3 Building',
      '4 Freewill',
      '5 Youth',
      '0 More',
    ]);
    expect(preview?.lines).toHaveLength(1 + USSD_OFFERING_PAGE_SIZE + 1);
    expect(preview?.lines).not.toContain('6 Welfare');
  });

  it('omits 0 More when every offering fits, and skips cancelled or archived events', () => {
    const preview = ussdPreviewFromEvents(
      [
        event({
          id: 'cancelled',
          name: 'Cancelled service',
          status: 'cancelled',
          sessions: [
            {
              date: '2999-01-10',
              startTime: '09:00',
              endTime: null,
              status: 'scheduled',
              note: null,
              present: 0,
              expected: 0,
              importedRows: 0,
              source: 'none',
            },
          ],
        }),
        event({
          id: 'event-2',
          name: 'Two offerings',
          sessions: [
            {
              date: '2999-01-11',
              startTime: '09:00',
              endTime: null,
              status: 'scheduled',
              note: null,
              present: 0,
              expected: 0,
              importedRows: 0,
              source: 'none',
            },
          ],
          offerings: [offering('Tithe'), offering('Missions')],
        }),
      ],
      '2026-11-07',
    );

    expect(preview?.eventName).toBe('Two offerings');
    expect(preview?.lines).toEqual(['Choose offering(s)', '1 Tithe', '2 Missions']);
  });

  it('returns null when nothing is upcoming', () => {
    expect(ussdPreviewFromEvents([event({ id: 'past', name: 'Past' })], '2026-11-07')).toBeNull();
  });
});

describe('worklistScopeLabel', () => {
  it('states the unwindowed, limit-bounded scope', () => {
    expect(worklistScopeLabel(3, 50)).toBe('Newest first, unwindowed · first 3 of up to 50');
  });
});
