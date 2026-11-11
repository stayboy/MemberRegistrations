import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventListItem } from '../api/events';
import {
  importableEvents,
  importableSessions,
  initialRange,
  resolveOccurrence,
} from './occurrence';

function event(overrides: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'event-1',
    eventNo: 'E-1',
    name: 'Sunday service',
    seriesId: 'series-1',
    startDate: '2026-11-01',
    timezone: 'UTC',
    status: 'scheduled',
    sessions: [
      { date: '2026-11-01', startTime: '09:00', endTime: null, status: 'held', note: null },
      {
        date: '2026-11-08',
        startTime: '09:00',
        endTime: null,
        status: 'scheduled',
        note: null,
      },
      {
        date: '2026-11-15',
        startTime: '09:00',
        endTime: null,
        status: 'cancelled',
        note: 'Snow',
      },
    ],
    ...overrides,
  };
}

function params(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values);
}

describe('importableEvents', () => {
  it('drops cancelled, archived and standalone events and keeps the rest', () => {
    const events = [
      event({ id: 'scheduled' }),
      event({ id: 'held', status: 'held' }),
      event({ id: 'draft', status: 'draft' }),
      event({ id: 'cancelled', status: 'cancelled' }),
      event({ id: 'archived', status: 'archived' }),
      event({ id: 'standalone', seriesId: null }),
    ];

    expect(importableEvents(events).map((candidate) => candidate.id)).toEqual([
      'scheduled',
      'held',
      'draft',
    ]);
  });
});

describe('importableSessions', () => {
  it('drops cancelled sessions and keeps scheduled and held ones', () => {
    const sessions = importableSessions(event());

    expect(sessions.map((session) => [session.date, session.status])).toEqual([
      ['2026-11-01', 'held'],
      ['2026-11-08', 'scheduled'],
    ]);
  });

  it('returns an empty list for a missing event', () => {
    expect(importableSessions(undefined)).toEqual([]);
  });
});

describe('initialRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to today ±30 days in UTC when there is no deep link', () => {
    expect(initialRange(params({}))).toEqual({ from: '2026-10-05', to: '2026-12-04' });
  });

  it('centres the window on a deep-linked date outside the default window', () => {
    const range = initialRange(params({ date: '2027-06-15' }));

    expect(range).toEqual({ from: '2027-05-16', to: '2027-07-15' });
    expect(range.from <= '2027-06-15' && '2027-06-15' <= range.to).toBe(true);
  });

  it('falls back to the default window for a malformed date', () => {
    const fallback = { from: '2026-10-05', to: '2026-12-04' };

    expect(initialRange(params({ date: '15/06/2027' }))).toEqual(fallback);
    expect(initialRange(params({ date: '2027-02-30' }))).toEqual(fallback);
  });
});

describe('resolveOccurrence', () => {
  it('resolves a valid deep link to the event and session date', () => {
    expect(resolveOccurrence(params({ event: 'event-1', date: '2026-11-08' }), [event()])).toEqual({
      eventId: 'event-1',
      sessionDate: '2026-11-08',
    });
  });

  it('returns null when a parameter is missing', () => {
    expect(resolveOccurrence(params({}), [event()])).toBeNull();
    expect(resolveOccurrence(params({ event: 'event-1' }), [event()])).toBeNull();
    expect(resolveOccurrence(params({ date: '2026-11-01' }), [event()])).toBeNull();
  });

  it('returns null for an unknown event id', () => {
    expect(
      resolveOccurrence(params({ event: 'event-unknown', date: '2026-11-01' }), [event()]),
    ).toBeNull();
  });

  it('returns null for a date that is not one of the event sessions', () => {
    expect(
      resolveOccurrence(params({ event: 'event-1', date: '2026-11-02' }), [event()]),
    ).toBeNull();
  });

  it('returns null for a cancelled session and for a cancelled or archived event', () => {
    expect(
      resolveOccurrence(params({ event: 'event-1', date: '2026-11-15' }), [event()]),
    ).toBeNull();

    const cancelled = event({ id: 'cancelled', status: 'cancelled' });
    expect(
      resolveOccurrence(params({ event: 'cancelled', date: '2026-11-01' }), [cancelled]),
    ).toBeNull();

    const archived = event({ id: 'archived', status: 'archived' });
    expect(
      resolveOccurrence(params({ event: 'archived', date: '2026-11-01' }), [archived]),
    ).toBeNull();
  });
});
