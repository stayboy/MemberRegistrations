import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EVENT_LIMIT,
  deleteEventAttendance,
  eventAttendancePath,
  eventAttendanceRowPath,
  eventDetailPath,
  eventsListPath,
  getEvent,
  getEventAttendance,
  listEvents,
  type EventAttendance,
  type EventItem,
} from './events';

const BASE = 'https://gateway.test';
const TOKEN = 'session-token';

const EVENT: EventItem = {
  id: 'event-1',
  eventNo: 'E-1',
  name: 'Sunday service',
  seriesId: 'series-1',
  ministry: { code: 'CHOIR', name: 'Choir' },
  timezone: 'UTC',
  startDate: '2026-11-01',
  endDate: '2026-11-01',
  startTime: '09:00',
  endTime: null,
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  description: null,
  status: 'scheduled',
  source: 'series',
  tracksMembers: true,
  presbyterOnly: false,
  sessions: [
    {
      date: '2026-11-01',
      startTime: '09:00',
      endTime: null,
      status: 'held',
      present: 4,
      expected: 5,
      importedRows: 4,
      source: 'import',
    },
    {
      date: '2026-11-08',
      startTime: '09:00',
      endTime: null,
      status: 'cancelled',
      present: 0,
      expected: 5,
      importedRows: 0,
      source: 'none',
    },
  ],
  offerings: [],
  stats: {
    attachedEvents: 0,
    pledgedMinor: 0,
    paidMinor: 0,
    pendingMinor: 0,
    honorRate: 0,
    contributionCount: 0,
  },
};

const ATTENDANCE: EventAttendance = {
  eventId: 'event-1',
  sessionDate: '2026-11-01',
  present: 4,
  expected: 5,
  importedRows: 4,
  rows: [
    {
      id: 'attendance-1',
      memberNo: 'M-1',
      name: 'Ama Mensah',
      gender: 'female',
      age: 32,
      status: 'present',
      source: 'import',
      sessionTime: '09:04',
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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
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

  it('appends the page offset after the limit when supplied', () => {
    expect(eventsListPath({ from: '2026-10-02', to: '2026-12-02', limit: 100, offset: 100 })).toBe(
      '/gateway/v1/events?from=2026-10-02&to=2026-12-02&limit=100&offset=100',
    );
  });

  it('adds the series filter between the window and the page size', () => {
    expect(
      eventsListPath({
        from: '2026-10-02',
        to: '2026-12-02',
        seriesId: 'series-1',
        limit: 100,
      }),
    ).toBe('/gateway/v1/events?from=2026-10-02&to=2026-12-02&seriesId=series-1&limit=100');
  });

  it('omits the series filter when it is empty', () => {
    expect(eventsListPath({ from: '2026-10-02', to: '2026-12-02', seriesId: '', limit: 100 })).toBe(
      '/gateway/v1/events?from=2026-10-02&to=2026-12-02&limit=100',
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

  it('passes the series filter through to the API query', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [EVENT] }));

    await listEvents(BASE, TOKEN, {
      from: '2026-10-02',
      to: '2026-12-02',
      seriesId: 'series-1',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/events?from=2026-10-02&to=2026-12-02&seriesId=series-1&limit=100`,
    );
  });

  it('rejects an empty response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));

    await expect(
      listEvents(BASE, TOKEN, { from: '2026-10-02', to: '2026-12-02' }),
    ).rejects.toMatchObject({ status: 500, message: 'The event list response was empty.' });
  });
});

describe('eventDetailPath', () => {
  it('encodes the event id as one path segment', () => {
    expect(eventDetailPath('event/with space')).toBe('/gateway/v1/events/event%2Fwith%20space');
  });
});

describe('getEvent', () => {
  it('GETs the event and keeps the ETag header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(EVENT, 200, { ETag: '"e123"' }));

    const detail = await getEvent(BASE, TOKEN, 'event/1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/events/event%2F1`);
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(requestOptions(0).method).toBe('GET');
    expect(detail.event).toEqual(EVENT);
    expect(detail.etag).toBe('"e123"');
  });

  it('rejects an empty response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));

    await expect(getEvent(BASE, TOKEN, 'event-1')).rejects.toMatchObject({
      status: 500,
      message: 'The event response was empty.',
    });
  });
});

describe('eventAttendancePath', () => {
  it('encodes the event id and carries the session date as a query', () => {
    expect(eventAttendancePath('event/1', '2026-11-01')).toBe(
      '/gateway/v1/events/event%2F1/attendance?date=2026-11-01',
    );
  });
});

describe('eventAttendanceRowPath', () => {
  it('addresses the attendance id under its event and encodes both ids', () => {
    expect(eventAttendanceRowPath('event/1', 'attendance 1')).toBe(
      '/gateway/v1/events/event%2F1/attendance/attendance%201',
    );
  });
});

describe('deleteEventAttendance', () => {
  it('DELETEs one attendance row through the gateway and accepts 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      deleteEventAttendance(BASE, TOKEN, 'event/1', 'attendance-1'),
    ).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/events/event%2F1/attendance/attendance-1`,
    );
    expect(requestOptions(0).method).toBe('DELETE');
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(requestOptions(0).body).toBeUndefined();
  });

  it('surfaces the API message when the row cannot be removed', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: 'Attendance attendance-1 was not found',
        },
        404,
      ),
    );

    await expect(
      deleteEventAttendance(BASE, TOKEN, 'event-1', 'attendance-1'),
    ).rejects.toMatchObject({ status: 404, message: 'Attendance attendance-1 was not found' });
  });
});

describe('getEventAttendance', () => {
  it('GETs the report for one session with the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ATTENDANCE));

    const report = await getEventAttendance(BASE, TOKEN, 'event-1', '2026-11-01');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/events/event-1/attendance?date=2026-11-01`,
    );
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(report).toEqual(ATTENDANCE);
  });

  it('surfaces the API error message for a session with no report', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          type: 'about:blank',
          title: 'Unprocessable Entity',
          status: 422,
          detail: 'Event event-1 has no session on 2026-11-02',
        },
        422,
      ),
    );

    await expect(getEventAttendance(BASE, TOKEN, 'event-1', '2026-11-02')).rejects.toMatchObject({
      status: 422,
      message: 'Event event-1 has no session on 2026-11-02',
    });
  });

  it('rejects an empty response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));

    await expect(getEventAttendance(BASE, TOKEN, 'event-1', '2026-11-01')).rejects.toMatchObject({
      status: 500,
      message: 'The event attendance response was empty.',
    });
  });
});
