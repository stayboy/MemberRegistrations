import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import {
  addContact,
  addCoverage,
  addMemberMinistry,
  addMemberRelationship,
  addSubscription,
  createMember,
  getMemberShepherding,
  listMinistries,
  memberDetailPath,
  memberPickerPath,
  membersListPath,
  removeContact,
  removeCoverage,
  removeMemberMinistry,
  removeMemberRelationship,
  searchMembers,
  updateMember,
  type RelationshipInput,
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

  it('sends an explicit contact lookup encoded, never through q', () => {
    const path = membersListPath({
      contact: ' ama+church@example.com ',
      includeSubscriptions: false,
    });
    expect(path).toBe('/gateway/v1/members?contact=ama%2Bchurch%40example.com');
    expect(path).not.toContain('q=');
  });

  it('sends unassigned=true only when the filter is on', () => {
    expect(membersListPath({ unassigned: true, includeSubscriptions: false })).toBe(
      '/gateway/v1/members?unassigned=true',
    );
    expect(membersListPath({ includeSubscriptions: false })).toBe('/gateway/v1/members');
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

describe('memberPickerPath and searchMembers', () => {
  it('builds a ten-row search path with no aggregates', () => {
    expect(memberPickerPath('  ama  ')).toBe('/gateway/v1/members?q=ama&limit=10');
    expect(memberPickerPath('   ')).toBe('/gateway/v1/members?limit=10');
  });

  it('searches through the gateway with the session credential', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          { memberNo: 'M-1001', firstName: 'Ama', lastName: 'Mensah', gender: 'female', age: 32 },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const page = await searchMembers('https://gateway.example', 'session-token', 'ama');

    expect(page.items).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/members?q=ama&limit=10');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
  });
});

describe('listMinistries', () => {
  it('reads the reference list with no-store traffic', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [{ code: 'CHOIR', name: 'Choir', description: null, active: true }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const ministries = await listMinistries('https://gateway.example', 'session-token');

    expect(ministries).toEqual([{ code: 'CHOIR', name: 'Choir', description: null, active: true }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/ministries');
    expect(init.method).toBe('GET');
  });
});

describe('addMemberMinistry and removeMemberMinistry', () => {
  it('posts { code } and encodes the member number', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 'CHOIR', name: 'Choir' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const ministry = await addMemberMinistry(
      'https://gateway.example',
      'session-token',
      'M 1/2',
      'CHOIR',
    );

    expect(ministry).toEqual({ code: 'CHOIR', name: 'Choir' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/members/M%201%2F2/ministries');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ code: 'CHOIR' });
  });

  it('deletes with the code encoded and tolerates 204', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      removeMemberMinistry('https://gateway.example', 'session-token', 'M-1001', 'CH OIR'),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/members/M-1001/ministries/CH%20OIR');
    expect(init.method).toBe('DELETE');
  });
});

describe('addMemberRelationship and removeMemberRelationship', () => {
  it('posts the relationship body and encodes the member number', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: 'rel-1',
          type: 'spouse',
          isDependent: false,
          memberNo: 'M-1002',
          name: 'Kofi Mensah',
          gender: 'male',
          age: 34,
          archived: false,
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const input: RelationshipInput = {
      relatedMemberNo: 'M-1002',
      type: 'spouse',
      isDependent: false,
    };
    const relationship = await addMemberRelationship(
      'https://gateway.example',
      'session-token',
      'M 1/2',
      input,
    );

    expect(relationship.id).toBe('rel-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/members/M%201%2F2/relationships');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(input);
  });

  it('deletes with the relationship id encoded and tolerates 204', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      removeMemberRelationship('https://gateway.example', 'session-token', 'M-1001', 'rel 1/2'),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/members/M-1001/relationships/rel%201%2F2');
    expect(init.method).toBe('DELETE');
  });
});

describe('getMemberShepherding', () => {
  it('reads the member summary and encodes the member number', async () => {
    const summary = {
      memberNo: 'M 1/2',
      name: 'Ama Mensah',
      gender: 'female',
      age: 32,
      shepherd: null,
      history: [],
      calls: { attempts: 0, conversations: 0, lastCalledOn: null },
      stillInChurch: null,
      latestFeedback: null,
      latestIssue: null,
      recentCalls: [],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(summary));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getMemberShepherding('https://gateway.example', 'session-token', 'M 1/2');

    expect(result).toEqual(summary);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example/gateway/v1/members/M%201%2F2/shepherding');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
  });
});
