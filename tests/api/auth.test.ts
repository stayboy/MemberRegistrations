import { Writable } from 'node:stream';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/create-app.js';
import {
  createMailer,
  NullMailer,
  ResendMailer,
  type MagicLinkMessage,
  type Mailer,
} from '../../src/authn/mailer.js';
import { OfficerRepository } from '../../src/repos/officers.js';
import { createTestApp, TOKEN, type TestApp } from '../helpers/app.js';

class MemoryMailer implements Mailer {
  readonly messages: MagicLinkMessage[] = [];

  async sendMagicLink(message: MagicLinkMessage): Promise<void> {
    this.messages.push(message);
  }
}

class DeferredMailer implements Mailer {
  readonly messages: MagicLinkMessage[] = [];
  private releaseDelivery: (() => void) | null = null;

  sendMagicLink(message: MagicLinkMessage): Promise<void> {
    this.messages.push(message);
    return new Promise((resolve) => {
      this.releaseDelivery = resolve;
    });
  }

  release(): void {
    this.releaseDelivery?.();
  }
}

let harness: TestApp;
let mailer: MemoryMailer;
let app: TestApp['app'];

function tokenFromLink(link: string): string {
  const query = link.split('?')[1] ?? '';
  return new URLSearchParams(query).get('token') ?? '';
}

async function seedOfficer(
  email: string,
  name = 'Ama Mensah',
  actorId = 'ama',
  active = true,
): Promise<void> {
  await harness.db.query(
    'insert into officers (email, name, actor_id, active) values ($1,$2,$3,$4)',
    [email.toLowerCase(), name, actorId, active],
  );
}

async function requestLink(email: string) {
  return request(app).post('/auth/magic-link').send({ email });
}

async function signIn(email: string): Promise<string> {
  const before = mailer.messages.length;
  const response = await requestLink(email);
  expect(response.status).toBe(202);
  const message = mailer.messages[before];
  expect(message).toBeDefined();

  const exchange = await request(app)
    .post('/auth/exchange')
    .send({ token: tokenFromLink(message!.link) });
  expect(exchange.status).toBe(200);
  return exchange.body.sessionToken as string;
}

beforeAll(async () => {
  mailer = new MemoryMailer();
  harness = await createTestApp({ mailer });
  app = harness.app;
});

beforeEach(async () => {
  mailer.messages.length = 0;
  await harness.db.query('delete from auth_rate_limits');
});

afterAll(async () => {
  await harness.close();
});

describe('magic-link request', () => {
  it('does not wait for delivery before responding', async () => {
    const deferred = new DeferredMailer();
    const localApp = createApp({
      db: harness.db,
      bearerToken: TOKEN,
      logger: pino({ level: 'silent' }),
      mailer: deferred,
    });
    await seedOfficer('timing@church.org', 'Timing Officer', 'timing');

    const response = await request(localApp)
      .post('/auth/magic-link')
      .send({ email: 'timing@church.org' });

    expect(response.status).toBe(202);
    expect(deferred.messages).toHaveLength(1);
    deferred.release();
  });

  it('returns the same accepted response for a known and an unknown address', async () => {
    await seedOfficer('known@church.org', 'Known Officer', 'known');

    const known = await requestLink('known@church.org');
    const unknown = await requestLink('nobody@church.org');

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual({ status: 'accepted' });
    expect(unknown.body).toEqual({ status: 'accepted' });
    expect(mailer.messages).toHaveLength(1);
    expect(mailer.messages[0]!.to).toBe('known@church.org');
  });

  it('does not send a link to an inactive officer', async () => {
    await seedOfficer('inactive@church.org', 'Inactive Officer', 'inactive', false);

    const response = await requestLink('inactive@church.org');

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: 'accepted' });
    expect(mailer.messages).toHaveLength(0);
  });

  it('rejects a malformed email', async () => {
    const response = await requestLink('not-an-email');
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rate-limits repeated requests without revealing the decision', async () => {
    await seedOfficer('limited@church.org', 'Limited Officer', 'limited');

    const responses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(await requestLink('limited@church.org'));
    }

    expect(responses.every((response) => response.status === 202)).toBe(true);
    expect(mailer.messages).toHaveLength(5);
  });

  it('enforces the per-IP limit across different addresses', async () => {
    await seedOfficer('ip-known@church.org', 'IP Officer', 'ip');

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await requestLink(`unknown-${attempt}@church.org`)).status).toBe(202);
    }
    const known = await requestLink('ip-known@church.org');

    expect(known.status).toBe(202);
    expect(mailer.messages).toHaveLength(0);
  });
});

describe('magic-link exchange', () => {
  it('issues a session for a valid single-use link', async () => {
    await seedOfficer('exchange@church.org', 'Exchange Officer', 'exchange');
    expect((await requestLink('exchange@church.org')).status).toBe(202);
    const token = tokenFromLink(mailer.messages[0]!.link);

    const response = await request(app).post('/auth/exchange').send({ token });

    expect(response.status).toBe(200);
    expect(response.body.sessionToken).toEqual(expect.any(String));
    expect(response.body.officer).toMatchObject({
      email: 'exchange@church.org',
      actorId: 'exchange',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a replayed link', async () => {
    await seedOfficer('replay@church.org', 'Replay Officer', 'replay');
    await requestLink('replay@church.org');
    const token = tokenFromLink(mailer.messages[0]!.link);

    expect((await request(app).post('/auth/exchange').send({ token })).status).toBe(200);
    const replay = await request(app).post('/auth/exchange').send({ token });

    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('unauthorized');
  });

  it('rejects an expired link', async () => {
    await seedOfficer('expired@church.org', 'Expired Officer', 'expired');
    await requestLink('expired@church.org');
    const token = tokenFromLink(mailer.messages[0]!.link);
    await harness.db.query("update auth_magic_links set expires_at = now() - interval '1 minute'");

    const response = await request(app).post('/auth/exchange').send({ token });
    expect(response.status).toBe(401);
  });

  it('rejects a link after the officer is deactivated', async () => {
    await seedOfficer('late@church.org', 'Late Officer', 'late');
    await requestLink('late@church.org');
    const token = tokenFromLink(mailer.messages[0]!.link);
    await harness.db.query("update officers set active = false where email = 'late@church.org'");

    const response = await request(app).post('/auth/exchange').send({ token });
    expect(response.status).toBe(401);
  });
});

describe('session and identity', () => {
  it('returns the derived actor from /auth/me', async () => {
    await seedOfficer('me@church.org', 'Me Officer', 'me-actor');
    const session = await signIn('me@church.org');

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${session}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: 'Me Officer',
      email: 'me@church.org',
      actorId: 'me-actor',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a missing session', async () => {
    const response = await request(app).get('/auth/me');
    expect(response.status).toBe(401);
  });

  it('revokes the session on logout', async () => {
    await seedOfficer('logout@church.org', 'Logout Officer', 'logout');
    const session = await signIn('logout@church.org');

    expect(
      (await request(app).post('/auth/logout').set('Authorization', `Bearer ${session}`)).status,
    ).toBe(204);

    expect(
      (await request(app).get('/auth/me').set('Authorization', `Bearer ${session}`)).status,
    ).toBe(401);
  });

  it('revokes sessions when an officer is deactivated', async () => {
    await seedOfficer('deactivated@church.org', 'Deactivated Officer', 'deactivated');
    const session = await signIn('deactivated@church.org');
    const officers = new OfficerRepository(harness.db);

    await officers.deactivate('deactivated@church.org');

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${session}`);
    expect(response.status).toBe(401);
  });

  it('rejects an idle-expired session', async () => {
    await seedOfficer('idle@church.org', 'Idle Officer', 'idle');
    const session = await signIn('idle@church.org');
    await harness.db.query("update auth_sessions set expires_at = now() - interval '1 minute'");

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${session}`);
    expect(response.status).toBe(401);
  });

  it('extends the idle window and caps it at the absolute deadline', async () => {
    await seedOfficer('slide@church.org', 'Slide Officer', 'slide');
    const session = await signIn('slide@church.org');

    await harness.db.query(
      "update auth_sessions set expires_at = now() + interval '1 minute', absolute_expires_at = now() + interval '1 minute'",
    );
    const before = await harness.db.query<{ last_used_at: string }>(
      `select s.last_used_at::text as last_used_at
         from auth_sessions s join officers o on o.id = s.officer_id
        where o.email = 'slide@church.org'`,
    );

    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${session}`);

    expect(me.status).toBe(200);
    expect(new Date(me.body.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 65_000);
    const after = await harness.db.query<{ last_used_at: string }>(
      `select s.last_used_at::text as last_used_at
         from auth_sessions s join officers o on o.id = s.officer_id
        where o.email = 'slide@church.org'`,
    );
    expect(new Date(after[0]!.last_used_at).getTime()).toBeGreaterThan(
      new Date(before[0]!.last_used_at).getTime(),
    );
  });

  it('rejects a session past its absolute expiry', async () => {
    await seedOfficer('absolute@church.org', 'Absolute Officer', 'absolute');
    const session = await signIn('absolute@church.org');
    await harness.db.query(
      "update auth_sessions set expires_at = now() - interval '1 minute', absolute_expires_at = now() - interval '1 minute'",
    );

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${session}`);
    expect(response.status).toBe(401);
  });
});

describe('gateway', () => {
  it('proxies a read with a session credential', async () => {
    await seedOfficer('read@church.org', 'Read Officer', 'read');
    const session = await signIn('read@church.org');

    const response = await request(app)
      .get('/gateway/v1/ministries')
      .set('Authorization', `Bearer ${session}`);

    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(TOKEN);
  });

  it('injects the bearer and the derived actor, discarding a spoofed actor', async () => {
    await seedOfficer('write@church.org', 'Write Officer', 'write-actor');
    const session = await signIn('write@church.org');

    const response = await request(app)
      .post('/gateway/v1/members')
      .set('Authorization', `Bearer ${session}`)
      .set('X-Actor-Id', 'attacker')
      .send({ memberNo: 'M-GATEWAY', firstName: 'Gateway', lastName: 'Member' });

    expect(response.status).toBe(201);
    const [row] = await harness.db.query<{ created_by: string }>(
      'select created_by from members where member_no = $1',
      ['M-GATEWAY'],
    );
    expect(row?.created_by).toBe('write-actor');
  });

  it('does not accept the session credential on the direct API route', async () => {
    await seedOfficer('direct@church.org', 'Direct Officer', 'direct');
    const session = await signIn('direct@church.org');

    const response = await request(app)
      .get('/v1/ministries')
      .set('Authorization', `Bearer ${session}`);

    expect(response.status).toBe(401);
  });

  it('rejects a revoked session at the gateway', async () => {
    await seedOfficer('revoked@church.org', 'Revoked Officer', 'revoked');
    const session = await signIn('revoked@church.org');
    await request(app).post('/auth/logout').set('Authorization', `Bearer ${session}`);

    const response = await request(app)
      .get('/gateway/v1/ministries')
      .set('Authorization', `Bearer ${session}`);

    expect(response.status).toBe(401);
  });

  it('does not expose paths outside /v1', async () => {
    await seedOfficer('scope@church.org', 'Scope Officer', 'scope');
    const session = await signIn('scope@church.org');

    const response = await request(app)
      .get('/gateway/openapi.json')
      .set('Authorization', `Bearer ${session}`);

    expect(response.status).toBe(404);
  });
});

describe('CORS', () => {
  it('answers an allowed preflight before the session gate', async () => {
    const response = await request(app)
      .options('/auth/magic-link')
      .set('Origin', 'https://stayboy.github.io')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://stayboy.github.io');
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    expect(response.headers.vary).toBe('Origin');
  });

  it('rejects an unlisted origin', async () => {
    const response = await request(app)
      .options('/gateway/v1/ministries')
      .set('Origin', 'https://evil.example');

    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects an unlisted origin on an actual request, not just preflight', async () => {
    const response = await request(app)
      .post('/auth/magic-link')
      .set('Origin', 'https://evil.example')
      .send({ email: 'someone@church.org' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('cors_rejected');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('mailer selection', () => {
  it('never sends from tests even when provider keys are present', () => {
    const mailer = createMailer({
      NODE_ENV: 'test',
      RESEND_API_KEY: 'key',
      MAGIC_LINK_FROM: 'no-reply@church.org',
    });
    expect(mailer).toBeInstanceOf(NullMailer);
  });

  it('uses Resend in production and refuses to start without credentials', () => {
    expect(
      createMailer({
        NODE_ENV: 'production',
        RESEND_API_KEY: 'key',
        MAGIC_LINK_FROM: 'no-reply@church.org',
      }),
    ).toBeInstanceOf(ResendMailer);
    expect(() => createMailer({ NODE_ENV: 'production' })).toThrow('RESEND_API_KEY');
  });
});

describe('contract', () => {
  it('documents the auth surface in OpenAPI', async () => {
    const response = await request(app).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.paths['/auth/magic-link']).toBeTruthy();
    expect(response.body.paths['/auth/exchange']).toBeTruthy();
    expect(response.body.paths['/auth/me']).toBeTruthy();
    expect(response.body.paths['/auth/logout']).toBeTruthy();
    expect(response.body.components.schemas.ExchangeResponse).toBeTruthy();
  });
});

describe('log redaction', () => {
  it('never logs the magic-link token', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const localMailer = new MemoryMailer();
    const localApp = createApp({
      db: harness.db,
      bearerToken: TOKEN,
      logger: pino({ level: 'info' }, stream),
      mailer: localMailer,
    });
    await seedOfficer('logs@church.org', 'Log Officer', 'logs');

    await request(localApp).post('/auth/magic-link').send({ email: 'logs@church.org' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const token = tokenFromLink(localMailer.messages[0]!.link);
    const output = chunks.join('');
    expect(output).toContain('/auth/magic-link');
    expect(output).not.toContain(token);
    expect(output).not.toContain('Authorization');
  });
});
