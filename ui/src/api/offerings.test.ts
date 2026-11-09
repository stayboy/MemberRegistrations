import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOfferingsSummary,
  listOfferingTerms,
  listPledges,
  offeringsSummaryPath,
  pledgesPath,
  reassignPledge,
  type ChurchOfferingSummary,
  type PledgeItem,
} from './offerings';

const BASE = 'https://gateway.test';
const TOKEN = 'session-token';

const SUMMARY: ChurchOfferingSummary = {
  from: '2026-01-01',
  to: '2026-11-07',
  currency: 'GHS',
  totalPaidMinor: 120_000,
  totalPledgedMinor: 60_000,
  totalOutstandingMinor: 20_000,
  countedMinor: 50_000,
  varianceMinor: -73_000,
  visitors: { count: 2, paidMinor: 3_000 },
  members: [],
  offerings: [],
  events: [],
  pledges: { pending: 1, honored: 1, dishonored: 0, overdue: 0 },
};

const PLEDGE: PledgeItem = {
  id: 'pledge-1',
  memberNo: 'M-1',
  memberName: 'Kwame Asante',
  offeringId: 'offering-1',
  offeringName: 'Tithe',
  eventId: 'event-1',
  sessionDate: '2026-01-04',
  amountMinor: 5_000,
  currency: 'GHS',
  expectedOn: '2026-02-01',
  followUpOfficerMemberNo: 'M-2',
  officerName: 'Ama Mensah',
  status: 'pending',
  reason: null,
  nextReminder: '2026-01-25',
  settledContributionId: null,
  termsVersion: 1,
  idempotencyKey: 'key-1',
  createdAt: '2026-01-05T10:00:00.000Z',
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

describe('offeringsSummaryPath', () => {
  it('carries both bounds in the documented order', () => {
    expect(offeringsSummaryPath('2026-01-01', '2026-11-07')).toBe(
      '/gateway/v1/offerings/summary?from=2026-01-01&to=2026-11-07',
    );
  });
});

describe('pledgesPath', () => {
  it('is the plain list without options', () => {
    expect(pledgesPath()).toBe('/gateway/v1/pledges');
  });

  it('appends the limit and cursor', () => {
    expect(pledgesPath({ limit: 50, cursor: 'cursor-1' })).toBe(
      '/gateway/v1/pledges?limit=50&cursor=cursor-1',
    );
  });
});

describe('getOfferingsSummary', () => {
  it('GETs the window through the gateway with the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SUMMARY));

    const summary = await getOfferingsSummary(BASE, TOKEN, '2026-01-01', '2026-11-07');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/offerings/summary?from=2026-01-01&to=2026-11-07`,
    );
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(summary).toEqual(SUMMARY);
  });
});

describe('listPledges', () => {
  it('returns the API rows unchanged, including names and the next reminder', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [PLEDGE] }));

    const pledges = await listPledges(BASE, TOKEN, { limit: 50 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/pledges?limit=50`);
    expect(pledges).toEqual([PLEDGE]);
  });
});

describe('reassignPledge', () => {
  it('POSTs the officer number and trimmed reason', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PLEDGE, followUpOfficerMemberNo: 'M-9' }));

    await reassignPledge(BASE, TOKEN, 'pledge-1', 'M-9', '  Moved it  ');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/pledges/pledge-1/reassign`);
    expect(requestOptions(0)).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ officerMemberNo: 'M-9', reason: 'Moved it' }),
    });
  });
});

describe('listOfferingTerms', () => {
  it('GETs the newest-first terms list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await listOfferingTerms(BASE, TOKEN, 'offering-1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/offerings/offering-1/terms`);
  });
});
