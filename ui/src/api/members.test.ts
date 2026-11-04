import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import {
  addContact,
  addCoverage,
  addSubscription,
  createMember,
  memberDetailPath,
  membersListPath,
  removeContact,
  removeCoverage,
  updateMember,
  type SubscriptionInput,
} from './members';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('membersListPath', () => {
  it('requests the subscriptions aggregate by default', () => {
    expect(membersListPath()).toBe('/gateway/v1/members?include=subscriptions');
  });

  it('adds status, query, limit and cursor', () => {
    const path = membersListPath({
      status: 'archived',
      q: '  ama  ',
      limit: 25,
      cursor: 'M-1002',
    });

    expect(path).toContain('status=archived');
    expect(path).toContain('q=ama');
    expect(path).toContain('limit=25');
    expect(path).toContain('cursor=M-1002');
  });

  it('only adds attendance when a series is selected', () => {
    expect(membersListPath({ includeAttendance: true })).not.toContain('attendance');

    const path = membersListPath({ includeAttendance: true, seriesId: 'series-1' });
    expect(path).toContain('include=attendance%2Csubscriptions');
    expect(path).toContain('seriesId=series-1');
  });

  it('omits the include parameter when subscriptions are switched off', () => {
    expect(membersListPath({ includeSubscriptions: false })).toBe('/gateway/v1/members');
  });
});

describe('memberDetailPath', () => {
  it('encodes the member number and widens the archived set', () => {
    expect(memberDetailPath('M 1/2')).toBe('/gateway/v1/members/M%201%2F2?includeArchived=true');
  });
});

describe('createMember', () => {
  it('reads the new member number from Location when the body is stripped', async () => {
    fetchMock
      .mockResolvedValueOnce(emptyResponse(204, { Location: '/v1/members/M-1002' }))
      .mockResolvedValueOnce(jsonResponse({ memberNo: 'M-1002', version: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const created = await createMember('https://gateway.example', 'session-token', {
      memberNo: 'M-1002',
      firstName: 'Kofi',
      lastName: 'Mensah',
    });

    expect(created.memberNo).toBe('M-1002');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://gateway.example/gateway/v1/members/M-1002?includeArchived=true',
    );
  });

  it('throws when neither the body nor the Location header names the member', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createMember('https://gateway.example', 'session-token', {
        memberNo: 'M-1002',
        firstName: 'Kofi',
        lastName: 'Mensah',
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: 'The created member response was empty.',
    });
  });
});

describe('updateMember', () => {
  it('sends If-Match with the read ETag', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ memberNo: 'M-1001', version: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    const updated = await updateMember(
      'https://gateway.example',
      'session-token',
      'M-1001',
      { firstName: 'Akosua' },
      '"v3"',
    );

    expect(updated.memberNo).toBe('M-1001');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/members/M-1001');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['If-Match']).toBe('"v3"');
    expect(JSON.parse(String(init.body))).toEqual({ firstName: 'Akosua' });
  });

  it('refuses to send an unconditional update when the ETag is null', async () => {
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateMember('https://gateway.example', 'session-token', 'M-1001', { firstName: 'A' }, null),
    ).rejects.toMatchObject({
      status: 428,
      message: 'Reload the member before saving: the server version is unknown.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('addSubscription', () => {
  it('posts the household body and encodes the member number', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'sub-1' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const input: SubscriptionInput = {
      kind: 'life_insurance',
      scope: 'household',
      reference: 'POL-8842',
      startedOn: '2026-11-04',
      coveredMemberNos: ['M-1002', 'M-1003'],
    };
    await addSubscription('https://gateway.example', 'session-token', 'M 1/2', input);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/members/M%201%2F2/subscriptions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(input);
  });
});

describe('addCoverage', () => {
  it('posts { memberNo } to the subscription coverage path and tolerates 204', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      addCoverage('https://gateway.example', 'session-token', 'sub 1', 'M-1002'),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/subscriptions/sub%201/coverage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ memberNo: 'M-1002' });
  });
});

describe('removeCoverage and removeContact', () => {
  it('both use DELETE and tolerate 204', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204)).mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      removeCoverage('https://gateway.example', 'session-token', 'sub-1', 'M-1002'),
    ).resolves.toBeUndefined();
    await expect(
      removeContact('https://gateway.example', 'session-token', 'M-1001', 'contact 1'),
    ).resolves.toBeUndefined();

    const [coverageUrl, coverageInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(coverageUrl).toBe(
      'https://gateway.example/gateway/v1/subscriptions/sub-1/coverage/M-1002',
    );
    expect(coverageInit.method).toBe('DELETE');

    const [contactUrl, contactInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(contactUrl).toBe(
      'https://gateway.example/gateway/v1/members/M-1001/contacts/contact%201',
    );
    expect(contactInit.method).toBe('DELETE');
  });
});

describe('addContact', () => {
  it('surfaces a 409 as an ApiError with status 409', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'The contact value already belongs to M-1002.',
        },
        409,
        { 'Content-Type': 'application/problem+json' },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await addContact('https://gateway.example', 'session-token', 'M-1001', {
      kind: 'phone',
      value: '024 000 0000',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe('The contact value already belongs to M-1002.');
  });
});
