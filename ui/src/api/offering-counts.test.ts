import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOfferingCounts,
  offeringCountsPath,
  recordOfferingCount,
  type OfferingCount,
  type OfferingCountList,
} from './offering-counts';

const BASE = 'https://gateway.test';
const TOKEN = 'session-token';

const COUNT: OfferingCount = {
  id: 'count-1',
  eventId: 'event-1',
  offeringId: 'offering-1',
  sessionDate: '2026-11-01',
  asOf: '2026-11-01T10:00:00.000Z',
  currency: 'GHS',
  termsVersion: 1,
  lines: [{ denominationMinor: 2000, pieces: 39 }],
  totalMinor: 78_000,
  recordedAt: '2026-11-01T10:05:00.000Z',
  recordedBy: 'officer-1',
  supersedesId: null,
  supersededBy: null,
};

const PAGE: OfferingCountList = { current: COUNT, observations: [COUNT] };

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

describe('offeringCountsPath', () => {
  it('carries both required query parameters', () => {
    expect(offeringCountsPath('event-1', '2026-11-01', 'offering-1')).toBe(
      '/gateway/v1/events/event-1/offering-counts?sessionDate=2026-11-01&offeringId=offering-1',
    );
  });
});

describe('getOfferingCounts', () => {
  it('GETs the group through the gateway with the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));

    const page = await getOfferingCounts(BASE, TOKEN, 'event-1', '2026-11-01', 'offering-1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/events/event-1/offering-counts?sessionDate=2026-11-01&offeringId=offering-1`,
    );
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(page).toEqual(PAGE);
  });
});

describe('recordOfferingCount', () => {
  it('POSTs an append body with the lines and asOf', async () => {
    fetchMock.mockResolvedValue(jsonResponse(COUNT, 201));

    await recordOfferingCount(BASE, TOKEN, 'event-1', {
      sessionDate: '2026-11-01',
      offeringId: 'offering-1',
      lines: [{ denominationMinor: 2000, pieces: 39 }],
      asOf: '2026-11-01T10:00:00.000Z',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/events/event-1/offering-counts`);
    expect(requestOptions(0)).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        sessionDate: '2026-11-01',
        offeringId: 'offering-1',
        lines: [{ denominationMinor: 2000, pieces: 39 }],
        asOf: '2026-11-01T10:00:00.000Z',
      }),
    });
  });

  it('POSTs supersedesId on a correction and never an asOf', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...COUNT, supersedesId: 'count-0' }, 201));

    await recordOfferingCount(BASE, TOKEN, 'event-1', {
      sessionDate: '2026-11-01',
      offeringId: 'offering-1',
      lines: [{ denominationMinor: 2000, pieces: 40 }],
      supersedesId: 'count-0',
    });

    const body = JSON.parse(String(requestOptions(0).body)) as Record<string, unknown>;
    expect(body.supersedesId).toBe('count-0');
    expect(body).not.toHaveProperty('asOf');
  });
});
