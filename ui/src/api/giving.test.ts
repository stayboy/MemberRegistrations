import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contributionsPath,
  listContributions,
  recordManualContribution,
  recordPledge,
} from './giving';

const BASE = 'https://gateway.test';
const TOKEN = 'session-token';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestOptions(call: number): RequestInit {
  return (fetchMock.mock.calls[call]?.[1] ?? {}) as RequestInit;
}

describe('recordManualContribution', () => {
  it('POSTs the existing contribution route with channel manual', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'contribution-1',
        memberNo: 'M-1',
        visitorName: null,
        offeringId: 'offering-1',
        eventId: 'event-1',
        sessionDate: '2026-11-01',
        amountMinor: 5000,
        currency: 'GHS',
        channel: 'manual',
        status: 'paid',
        reference: 'MR-TEST000001',
        idempotencyKey: 'manual-gift-1',
        termsVersion: 1,
        createdAt: '2026-11-01T10:00:00.000Z',
      }),
    );

    await recordManualContribution(BASE, TOKEN, {
      memberNo: 'M-1',
      offeringId: 'offering-1',
      eventId: 'event-1',
      sessionDate: '2026-11-01',
      amountMinor: 5000,
      idempotencyKey: 'manual-gift-1',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/contributions`);
    const options = requestOptions(0);
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(JSON.parse(String(options.body))).toMatchObject({
      memberNo: 'M-1',
      channel: 'manual',
      amountMinor: 5000,
    });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('visitorPhone');
  });
});

describe('contributionsPath', () => {
  it('scopes the read to the event, offering and session date', () => {
    expect(
      contributionsPath({
        eventId: 'event-1',
        offeringId: 'offering-1',
        from: '2026-11-01',
        to: '2026-11-01',
        limit: 50,
      }),
    ).toBe(
      '/gateway/v1/contributions?eventId=event-1&offeringId=offering-1&from=2026-11-01&to=2026-11-01&limit=50',
    );
  });
});

describe('listContributions', () => {
  it('GETs the session-scoped list with the session bearer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          items: [
            {
              id: 'contribution-1',
              memberNo: 'M-1',
              visitorName: null,
              offeringId: 'offering-1',
              eventId: 'event-1',
              sessionDate: '2026-11-01',
              amountMinor: 5000,
              currency: 'GHS',
              channel: 'manual',
              status: 'paid',
              reference: 'MR-TEST000001',
              idempotencyKey: 'manual-gift-1',
              termsVersion: 1,
              createdAt: '2026-11-01T10:00:00.000Z',
            },
          ],
        },
        200,
      ),
    );

    const rows = await listContributions(BASE, TOKEN, {
      eventId: 'event-1',
      offeringId: 'offering-1',
      from: '2026-11-01',
      to: '2026-11-01',
      limit: 50,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/gateway/v1/contributions?eventId=event-1&offeringId=offering-1&from=2026-11-01&to=2026-11-01&limit=50`,
    );
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(rows).toHaveLength(1);
  });
});

describe('recordPledge', () => {
  it('POSTs the existing pledge route with the expected date', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'pledge-1',
        memberNo: 'M-1',
        memberName: 'Kwame Asante',
        offeringId: 'offering-1',
        offeringName: 'Tithe',
        eventId: 'event-1',
        sessionDate: '2026-11-01',
        amountMinor: 10_000,
        currency: 'GHS',
        expectedOn: '2026-12-01',
        followUpOfficerMemberNo: 'M-2',
        officerName: 'Ama Mensah',
        status: 'pending',
        reason: null,
        nextReminder: null,
        settledContributionId: null,
        termsVersion: 1,
        idempotencyKey: 'pledge-1',
        createdAt: '2026-11-01T10:00:00.000Z',
      }),
    );

    await recordPledge(BASE, TOKEN, {
      memberNo: 'M-1',
      offeringId: 'offering-1',
      eventId: 'event-1',
      sessionDate: '2026-11-01',
      amountMinor: 10_000,
      expectedOn: '2026-12-01',
      followUpOfficerMemberNo: 'M-2',
      idempotencyKey: 'pledge-1',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/pledges`);
    expect(JSON.parse(String(requestOptions(0).body))).toMatchObject({
      memberNo: 'M-1',
      expectedOn: '2026-12-01',
      followUpOfficerMemberNo: 'M-2',
    });
  });
});
