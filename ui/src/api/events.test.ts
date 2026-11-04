import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EVENT_LIMIT, eventsListPath, listEvents, type EventListItem } from './events';

const BASE = 'https://gateway.test';
const TOKEN = 'session-token';

const EVENT: EventListItem = {
  id: 'event-1',
  eventNo: 'E-1',
  name: 'Sunday service',
  startDate: '2026-11-01',
  status: 'scheduled',
  sessions: [
    {
      date: '2026-11-01',
      startTime: '09:00',
      endTime: null,
      status: 'held',
    },
    {
      date: '2026-11-08',
      startTime: '09:00',
      endTime: null,
      status: 'cancelled',
    },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestOptions(call: number): RequestInit {
  return (fetchMock.mock.calls[call]?.[1] ?? {}) as RequestInit;
}

describe('eventsListPath', () => {
  it('orders from, to and the default limit as the API documents them', () => {
    expect(eventsListPath({ from: '2026-10-02', to: '2026-12-02' })).toBe(
      `/gateway/v1/events?from=2026-10-02&to=2026-12-02&limit=${DEFAULT_EVENT_LIMIT}`,
    );
  });

  it('honours a caller-supplied limit', () => {
    expect(eventsListPath({ from: '2026-10-02', to: '2026-12-02', limit: 25 })).toBe(
      '/gateway/v1/events?from=2026-10-02&to=2026-12-02&limit=25',
    );
  });
});

describe('listEvents', () => {
  it('GETs the date window through the gateway with the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [EVENT] }));

    const events = await listEvents(BASE, TOKEN, { from: '2026-10-02', to: '2026-12-02' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/events?from=2026-10-02&to=2026-12-02&limit=100`,
    );
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(events).toEqual([EVENT]);
  });

  it('keeps each item’s sessions so the picker needs no second request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [EVENT] }));

    const [event] = await listEvents(BASE, TOKEN, { from: '2026-10-02', to: '2026-12-02' });

    expect(
      event?.sessions.map((session) => [session.date, session.startTime, session.status]),
    ).toEqual([
      ['2026-11-01', '09:00', 'held'],
      ['2026-11-08', '09:00', 'cancelled'],
    ]);
  });

  it('rejects an empty response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));

    await expect(
      listEvents(BASE, TOKEN, { from: '2026-10-02', to: '2026-12-02' }),
    ).rejects.toMatchObject({ status: 500, message: 'The event list response was empty.' });
  });
});
