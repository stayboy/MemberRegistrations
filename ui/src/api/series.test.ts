import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SERIES_PATH,
  getSeries,
  getSeriesOccurrences,
  listSeries,
  seriesDetailPath,
  seriesListPath,
  seriesOccurrencesPath,
  seriesParentPath,
  type SeriesDto,
} from './series';

/**
 * The `/v1/series` write surface retired with the series screens (AC-65): an
 * event is the parent and its recurrence is written under the event, so this
 * module is read-only. These cases pin the reads the transition still serves and
 * that no writer is exported.
 */

const BASE = 'https://gateway.test';
const TOKEN = 'session-token';

const SERIES: SeriesDto = {
  id: 'series-1',
  name: 'Sunday service',
  ministry: { code: 'CHOIR', name: 'Choir' },
  timezone: 'UTC',
  description: null,
  archivedAt: null,
  presbyterOnly: false,
  schedules: [{ effectiveFrom: '2026-01-01', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: null }],
  exceptions: [{ date: '2026-11-08', kind: 'cancelled', note: 'Conference' }],
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

describe('seriesListPath', () => {
  it('uses the gateway series path and defaults to active series only', () => {
    expect(SERIES_PATH).toBe('/gateway/v1/series');
    expect(seriesListPath()).toBe('/gateway/v1/series');
    expect(seriesListPath({})).toBe('/gateway/v1/series');
  });

  it('asks for archived series only when the caller opts in', () => {
    expect(seriesListPath({ includeArchived: true })).toBe(
      '/gateway/v1/series?includeArchived=true',
    );
    expect(seriesListPath({ includeArchived: false })).toBe('/gateway/v1/series');
  });
});

describe('listSeries', () => {
  it('GETs the list through the gateway with the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [SERIES] }));

    const series = await listSeries(BASE, TOKEN);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/series`);
    expect(requestOptions(0).method).toBe('GET');
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(series).toEqual([SERIES]);
  });

  it('passes includeArchived through and keeps an empty list empty', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await expect(listSeries(BASE, TOKEN, { includeArchived: true })).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/series?includeArchived=true`);
  });

  it('rejects an empty response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));

    await expect(listSeries(BASE, TOKEN)).rejects.toMatchObject({
      status: 500,
      message: 'The series list response was empty.',
    });
  });
});

describe('series detail', () => {
  it('encodes the series id as one path segment', () => {
    expect(seriesDetailPath('series/with space')).toBe('/gateway/v1/series/series%2Fwith%20space');
  });

  it('GETs the detail with the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERIES));

    const series = await getSeries(BASE, TOKEN, 'series/1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/series/series%2F1`);
    expect(requestOptions(0).method).toBe('GET');
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(series).toEqual(SERIES);
  });

  it('rejects an empty response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));

    await expect(getSeries(BASE, TOKEN, 'series-1')).rejects.toMatchObject({
      status: 500,
      message: 'The series response was empty.',
    });
  });
});

describe('seriesParentPath', () => {
  it('encodes the id and carries view=parent with the window', () => {
    expect(
      seriesParentPath('series/1', {
        view: 'parent',
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).toBe('/gateway/v1/series/series%2F1?view=parent&from=2026-01-01&to=2026-01-31');
  });
});

describe('occurrences', () => {
  it('orders from and to in the occurrence query', () => {
    expect(seriesOccurrencesPath('series/1', '2026-11-01', '2026-12-01')).toBe(
      '/gateway/v1/series/series%2F1/occurrences?from=2026-11-01&to=2026-12-01',
    );
  });

  it('GETs the API dates for the window with the session bearer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        seriesId: 'series-1',
        from: '2026-11-01',
        to: '2026-12-01',
        dates: ['2026-11-01', '2026-11-08'],
      }),
    );

    const result = await getSeriesOccurrences(BASE, TOKEN, 'series-1', {
      from: '2026-11-01',
      to: '2026-12-01',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/series/series-1/occurrences?from=2026-11-01&to=2026-12-01`,
    );
    expect(requestOptions(0).method).toBe('GET');
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(result.dates).toEqual(['2026-11-01', '2026-11-08']);
  });

  it('rejects an empty response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));

    await expect(
      getSeriesOccurrences(BASE, TOKEN, 'series-1', {
        from: '2026-11-01',
        to: '2026-12-01',
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: 'The occurrence list response was empty.',
    });
  });
});
