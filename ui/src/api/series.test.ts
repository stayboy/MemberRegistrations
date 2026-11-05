import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SERIES_PATH,
  addScheduleVersion,
  getSeries,
  getSeriesOccurrences,
  listSeries,
  removeSeriesException,
  seriesDetailPath,
  seriesExceptionPath,
  seriesListPath,
  seriesOccurrencesPath,
  seriesSchedulePath,
  setSeriesException,
  type SeriesDto,
} from './series';

const BASE = 'https://gateway.test';
const TOKEN = 'session-token';

const SERIES: SeriesDto = {
  id: 'series-1',
  name: 'Sunday service',
  ministry: { code: 'CHOIR', name: 'Choir' },
  timezone: 'UTC',
  description: null,
  archivedAt: null,
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

describe('schedule versions', () => {
  it('POSTs the append-only version body to the schedule path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERIES, 201));

    await addScheduleVersion(BASE, TOKEN, 'series/1', {
      effectiveFrom: '2026-12-01',
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=15',
      endsOn: '2027-12-01',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/series/series%2F1/schedule`);
    expect(requestOptions(0).method).toBe('POST');
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(JSON.parse(String(requestOptions(0).body))).toEqual({
      effectiveFrom: '2026-12-01',
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=15',
      endsOn: '2027-12-01',
    });
  });

  it('sends endsOn as null when the version has no end date', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERIES, 201));

    await addScheduleVersion(BASE, TOKEN, 'series-1', {
      effectiveFrom: '2026-12-01',
      rrule: 'FREQ=DAILY',
    });

    expect(JSON.parse(String(requestOptions(0).body))).toEqual({
      effectiveFrom: '2026-12-01',
      rrule: 'FREQ=DAILY',
      endsOn: null,
    });
  });

  it('exposes the schedule path for a caller that only needs the route', () => {
    expect(seriesSchedulePath('series/1')).toBe('/gateway/v1/series/series%2F1/schedule');
  });
});

describe('series exceptions', () => {
  it('POSTs date, kind and note to the exceptions path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERIES, 201));

    await setSeriesException(BASE, TOKEN, 'series/1', {
      date: '2026-11-08',
      kind: 'extra',
      note: 'Added service',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/series/series%2F1/exceptions`);
    expect(requestOptions(0).method).toBe('POST');
    expect(JSON.parse(String(requestOptions(0).body))).toEqual({
      date: '2026-11-08',
      kind: 'extra',
      note: 'Added service',
    });
  });

  it('sends a null note when the caller omits it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERIES, 201));

    await setSeriesException(BASE, TOKEN, 'series-1', {
      date: '2026-11-08',
      kind: 'cancelled',
    });

    expect(JSON.parse(String(requestOptions(0).body))).toEqual({
      date: '2026-11-08',
      kind: 'cancelled',
      note: null,
    });
  });

  it('encodes the date in the DELETE path and accepts a 204 body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await removeSeriesException(BASE, TOKEN, 'series/1', '2026-11-08');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/series/series%2F1/exceptions/2026-11-08`,
    );
    expect(requestOptions(0).method).toBe('DELETE');
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('exposes the exception path with the date encoded', () => {
    expect(seriesExceptionPath('series/1', '2026-11-08')).toBe(
      '/gateway/v1/series/series%2F1/exceptions/2026-11-08',
    );
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
