import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../../src/errors/domain-errors.js';
import type { UssdRepository, UssdSessionRow } from '../../src/repos/ussd.js';
import { buildUssdAdapters, createNaloAdapter, truncateMessage } from '../../src/ussd/adapters.js';

const USER_ID = 'NALOTest';

function naloBody(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      USERID: USER_ID,
      MSISDN: '0801 555 0013',
      USERDATA: '',
      MSGTYPE: true,
      NETWORK: 'test',
      SESSIONID: 'nalo-session-1',
      ...overrides,
    }),
  );
}

function stubRepo() {
  const attachExternalId = vi.fn(async () => {});
  const loadSessionByExternalId = vi.fn(async (): Promise<UssdSessionRow | null> => null);
  return {
    repo: { attachExternalId, loadSessionByExternalId } as unknown as UssdRepository,
    attachExternalId,
    loadSessionByExternalId,
  };
}

function render(text: string, done = false) {
  return {
    sessionId: '00000000-0000-0000-0000-000000000001',
    text,
    done,
    state: 'main' as const,
    options: [],
  };
}

describe('USSD adapter contract', () => {
  it('registers exactly the two providers with their declared routes and page sizes', () => {
    const { repo } = stubRepo();
    const adapters = buildUssdAdapters({
      repo,
      gatewaySecret: 'test-gateway-secret-16',
      naloUserId: USER_ID,
      naloMaxMsgChars: 120,
    });
    expect(adapters.map((adapter) => adapter.id)).toEqual(['hmac', 'nalo']);
    expect(adapters.map((adapter) => adapter.route)).toEqual(['/ussd/session', '/ussd/nalo']);
    expect(adapters[0]!.pageSize).toEqual({ events: 3, offerings: 5 });
    expect(adapters[1]!.pageSize).toEqual({ events: 2, offerings: 3 });
    expect(adapters[0]!.maxMsgChars).toBe(182);
    expect(adapters[1]!.maxMsgChars).toBe(120);
  });

  it('authenticates Nalo on USERID alone before any session work', async () => {
    const { repo, loadSessionByExternalId } = stubRepo();
    const adapter = createNaloAdapter({
      repo,
      gatewaySecret: 'test-gateway-secret-16',
      naloUserId: USER_ID,
      naloMaxMsgChars: 120,
    });
    expect(() =>
      adapter.authenticator({ raw: naloBody({ USERID: 'other' }), headers: {} }),
    ).toThrow(UnauthorizedError);
    expect(() =>
      adapter.authenticator({ raw: Buffer.from(JSON.stringify({})), headers: {} }),
    ).toThrow(UnauthorizedError);
    expect(loadSessionByExternalId).not.toHaveBeenCalled();
  });

  it('maps the Nalo wire to the internal frame and resolves the next sequence', async () => {
    const { repo, loadSessionByExternalId } = stubRepo();
    const adapter = createNaloAdapter({
      repo,
      gatewaySecret: 'test-gateway-secret-16',
      naloUserId: USER_ID,
      naloMaxMsgChars: 120,
    });

    const fresh = await adapter.toFrame({ raw: naloBody({ USERDATA: '1' }), headers: {} });
    expect(fresh).toEqual({ phone: '8015550013', sessionId: undefined, input: '1', seq: 1 });

    loadSessionByExternalId.mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-000000000002',
      phoneHash: 'hash',
      memberId: null,
      anonymous: true,
      state: 'main',
      context: {},
      lastInputSeq: 4,
      expiresAt: new Date().toISOString(),
    });
    const continuation = await adapter.toFrame({
      raw: naloBody({ USERDATA: '1', MSGTYPE: false }),
      headers: {},
    });
    expect(continuation).toEqual({
      phone: '8015550013',
      sessionId: '00000000-0000-0000-0000-000000000002',
      input: '1',
      seq: 5,
    });
  });

  it('rejects USERDATA over the pipeline input cap with a validation failure', async () => {
    const { repo } = stubRepo();
    const adapter = createNaloAdapter({
      repo,
      gatewaySecret: 'test-gateway-secret-16',
      naloUserId: USER_ID,
      naloMaxMsgChars: 120,
    });
    await expect(
      adapter.toFrame({ raw: naloBody({ USERDATA: '1'.repeat(65) }), headers: {} }),
    ).rejects.toThrow();
  });

  it('omits SESSIONID, echoes USERID and stores external_id on the new session', async () => {
    const { repo, attachExternalId } = stubRepo();
    const adapter = createNaloAdapter({
      repo,
      gatewaySecret: 'test-gateway-secret-16',
      naloUserId: USER_ID,
      naloMaxMsgChars: 120,
    });
    const wire = (await adapter.toWire(render('hello'), {
      raw: naloBody(),
      headers: {},
    })) as Record<string, unknown>;

    expect(wire).toEqual({
      USERID: USER_ID,
      MSISDN: '0801 555 0013',
      MSG: 'hello',
      MSGTYPE: true,
    });
    expect(wire).not.toHaveProperty('SESSIONID');
    expect(attachExternalId).toHaveBeenCalledWith(render('').sessionId, {
      provider: 'nalo',
      externalId: 'nalo-session-1',
    });
  });

  it('sets MSGTYPE to !done', async () => {
    const { repo } = stubRepo();
    const adapter = createNaloAdapter({
      repo,
      gatewaySecret: 'test-gateway-secret-16',
      naloUserId: USER_ID,
      naloMaxMsgChars: 120,
    });
    const wire = (await adapter.toWire(render('done', true), {
      raw: naloBody(),
      headers: {},
    })) as { MSGTYPE: boolean };
    expect(wire.MSGTYPE).toBe(false);
  });

  it('truncates only when the provider cap is smaller than the render', () => {
    expect(truncateMessage('x'.repeat(120), 120)).toHaveLength(120);
    const cut = truncateMessage('x'.repeat(140), 120);
    expect(cut).toHaveLength(120);
    expect(cut.endsWith('…')).toBe(true);
    expect(truncateMessage('short screen', 120)).toBe('short screen');
    expect(truncateMessage('xx', 1)).toBe('…');
  });

  it('cuts the Nalo MSG to its own cap with … and passes a within-budget screen through', async () => {
    const { repo } = stubRepo();
    const adapter = createNaloAdapter({
      repo,
      gatewaySecret: 'test-gateway-secret-16',
      naloUserId: USER_ID,
      naloMaxMsgChars: 120,
    });

    const long = (await adapter.toWire(render('x'.repeat(140)), {
      raw: naloBody(),
      headers: {},
    })) as { MSG: string };
    expect(long.MSG).toHaveLength(120);
    expect(long.MSG.endsWith('…')).toBe(true);

    // A screen at the top of the internally rendered budget is untouched.
    const fits = (await adapter.toWire(render('y'.repeat(118)), {
      raw: naloBody(),
      headers: {},
    })) as { MSG: string };
    expect(fits.MSG).toBe('y'.repeat(118));
  });
});
