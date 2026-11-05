import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignMember,
  assignmentCallsPath,
  assignmentPath,
  endAssignment,
  getReport,
  getRoster,
  listOfficers,
  logCall,
  officersPath,
  reportPath,
  rosterPath,
  type AssignmentInput,
  type CallInput,
} from './shepherding';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const window = { from: '2026-08-06', to: '2026-11-04' };

describe('shepherding paths', () => {
  it('builds the shared window in from/to order and omits empty values', () => {
    expect(officersPath(window)).toBe(
      '/gateway/v1/shepherding/officers?from=2026-08-06&to=2026-11-04',
    );
    expect(reportPath({ to: '2026-11-04' })).toBe('/gateway/v1/shepherding/report?to=2026-11-04');
    expect(reportPath()).toBe('/gateway/v1/shepherding/report');
  });

  it('encodes the officer member number and assignment id segments', () => {
    expect(rosterPath('M 1/2', window)).toBe(
      '/gateway/v1/shepherding/officers/M%201%2F2/members?from=2026-08-06&to=2026-11-04',
    );
    expect(assignmentPath('assign 1/2')).toBe('/gateway/v1/shepherding/assignments/assign%201%2F2');
    expect(assignmentCallsPath('assign 1/2')).toBe(
      '/gateway/v1/shepherding/assignments/assign%201%2F2/calls',
    );
  });
});

describe('listOfficers and getRoster', () => {
  it('reads the officers list through the gateway', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [{ memberNo: 'M-1', name: 'Ama', gender: 'female', age: 32 }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const officers = await listOfficers('https://gateway.example', 'session-token', window);

    expect(officers).toEqual([{ memberNo: 'M-1', name: 'Ama', gender: 'female', age: 32 }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://gateway.example/gateway/v1/shepherding/officers?from=2026-08-06&to=2026-11-04',
    );
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
  });

  it('reads a roster and encodes the officer segment', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ officerMemberNo: 'M 1/2', from: window.from, to: window.to, items: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const roster = await getRoster('https://gateway.example', 'session-token', 'M 1/2', window);

    expect(roster.officerMemberNo).toBe('M 1/2');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://gateway.example/gateway/v1/shepherding/officers/M%201%2F2/members?from=2026-08-06&to=2026-11-04',
    );
  });
});

describe('getReport', () => {
  it('reads the church report with the same window', async () => {
    const report = { from: window.from, to: window.to, totals: { officers: 1 }, officers: [] };
    fetchMock.mockResolvedValueOnce(jsonResponse(report));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getReport('https://gateway.example', 'session-token', window);

    expect(result).toEqual(report);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://gateway.example/gateway/v1/shepherding/report?from=2026-08-06&to=2026-11-04',
    );
  });
});

describe('assignMember', () => {
  it('posts the assignment body, including the replacement id when present', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'assign-2' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const input: AssignmentInput = {
      officerMemberNo: 'M-1',
      memberNo: 'M-2',
      assignedOn: '2026-11-04',
      replaceAssignmentId: 'assign-1',
      reason: 'The previous officer moved away.',
    };
    await assignMember('https://gateway.example', 'session-token', input);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/shepherding/assignments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(input);
  });
});

describe('endAssignment', () => {
  it('deletes the encoded assignment id and tolerates 204', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      endAssignment('https://gateway.example', 'session-token', 'assign 1/2'),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/shepherding/assignments/assign%201%2F2');
    expect(init.method).toBe('DELETE');
  });
});

describe('logCall', () => {
  it('posts one append-only call to the encoded assignment path', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'call-1' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const input: CallInput = {
      calledOn: '2026-11-04',
      outcome: 'reached',
      stillInChurch: 'yes',
      feedback: 'Doing well.',
      issue: null,
    };
    await logCall('https://gateway.example', 'session-token', 'assign 1/2', input);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://gateway.example/gateway/v1/shepherding/assignments/assign%201%2F2/calls',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(input);
  });
});
