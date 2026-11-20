import pino from 'pino';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/create-app.js';
import { NullMailer } from '../../src/authn/mailer.js';
import { DeliveryUnavailableError } from '../../src/errors/domain-errors.js';
import {
  DEFAULT_COUNTRY_CODE,
  DEFAULT_OTP_PEPPER,
  DEFAULT_VERIFICATION_LINK_BASE,
} from '../../src/config/env.js';
import { hashToken } from '../../src/domain/verification.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { VerificationRepository } from '../../src/repos/verification.js';
import { VerificationService } from '../../src/verification/service.js';
import {
  capturingSenders,
  createTestApp,
  readHeaders,
  TOKEN,
  writeHeaders,
  type CapturingSenders,
  type TestApp,
} from '../helpers/app.js';
import { createScratchPgDb } from '../helpers/scratch-db.js';

/**
 * Phase 3 slice 3a: contact verification (MR-24..MR-27, MR-29, MR-31..MR-35,
 * MR-43, MR-51..MR-53; AC-MR20, AC-MR21, AC-MR23, AC-MR35, AC-MR37,
 * AC-MR41..AC-MR43).
 *
 * Every assertion is external: the wire answer, the captured message, and the
 * rows the register keeps. Every channel completes on the public acceptance
 * page; there is no USSD entry path.
 */

const logLines: Array<Record<string, unknown>> = [];
const captured: CapturingSenders = capturingSenders();
let harness: TestApp;
let app: Express;
let unconfigured: TestApp;
let service: VerificationService;

const OTP_PEPPER = DEFAULT_OTP_PEPPER;
const LINK_BASE = DEFAULT_VERIFICATION_LINK_BASE;

beforeAll(async () => {
  const logger = pino(
    { level: 'info' },
    {
      write(line: string) {
        logLines.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  harness = await createTestApp({ logger, senders: captured.senders });
  app = harness.app;

  // A member whose channel has no configured sender must be a 503 that stores
  // nothing, so the second app has no senders at all.
  unconfigured = await createTestApp();

  service = new VerificationService(new VerificationRepository(harness.db, DEFAULT_COUNTRY_CODE), {
    otpPepper: OTP_PEPPER,
    countryCode: DEFAULT_COUNTRY_CODE,
    linkBase: LINK_BASE,
    senders: captured.senders,
  });
});

afterAll(async () => {
  await harness.close();
  await unconfigured.close();
});

beforeEach(async () => {
  captured.messages.length = 0;
  captured.emails.length = 0;
  logLines.length = 0;
  // Fixed windows are keyed in Postgres; a test resets them rather than sleeping.
  await harness.db.query('delete from auth_rate_limits where key like $1', ['verify:%']);
});

async function createMember(
  memberNo: string,
  contacts: Array<{ kind: 'phone' | 'email' | 'whatsapp'; value: string }>,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Veri',
      lastName: memberNo,
      joinedOn: '2024-01-01',
      contacts,
      ...extra,
    });
  expect(response.status).toBe(201);
}

function startCode(memberNo: string, headers: Record<string, string> = writeHeaders) {
  return request(app).post(`/v1/members/${memberNo}/verification/otp`).set(headers).send({});
}

function acceptPage(token: string, code: string) {
  return request(app).post('/portal/verification/accept').send({ token, code });
}

function codeFrom(body: string): string {
  const match = /\b(\d{6})\b/.exec(body);
  expect(match, `no six-digit code in "${body}"`).not.toBeNull();
  return match![1]!;
}

function tokenFrom(body: string): string {
  const match = /#t=([A-Za-z0-9_-]+)/.exec(body);
  expect(match, `no acceptance token in "${body}"`).not.toBeNull();
  return match![1]!;
}

async function memberId(memberNo: string): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    'select id from members where member_no = $1',
    [memberNo],
  );
  return row!.id;
}

async function contactProofs(
  memberNo: string,
): Promise<Array<{ kind: string; verifiedAt: string | null }>> {
  const rows = await harness.db.query<{
    kind: string;
    verified_at: Date | string | null;
  }>(
    `select c.kind, c.verified_at
       from member_contacts c
       join members m on m.id = c.member_id
      where m.member_no = $1
      order by c.display_order`,
    [memberNo],
  );
  return rows.map((row) => ({
    kind: row.kind,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
  }));
}

async function detail(memberNo: string) {
  const response = await request(app).get(`/v1/members/${memberNo}`).set(readHeaders).expect(200);
  return response.body as {
    verifiedContacts: Array<{ id: string; channel: string; masked: string; verifiedAt: string }>;
    confirmedAt: string | null;
  };
}

async function codeRow(memberNo: string) {
  const [row] = await harness.db.query<{
    code_hash: string;
    destination: { channel: string; masked: string };
    contact_id: string | null;
    destination_value_hash: string;
    token_hash: string;
    consumed_at: Date | string | null;
    attempts: number;
  }>(
    `select c.code_hash, c.destination, c.contact_id, c.destination_value_hash,
            c.token_hash, c.consumed_at, c.attempts
       from member_verification_codes c
       join members m on m.id = c.member_id
      where m.member_no = $1
      order by c.created_at desc
      limit 1`,
    [memberNo],
  );
  return row ?? null;
}

async function contactIdOf(memberNo: string, kind: string): Promise<string> {
  const response = await request(app).get(`/v1/members/${memberNo}`).set(readHeaders);
  const contact = (response.body.contacts as Array<{ id: string; kind: string }>).find(
    (entry) => entry.kind === kind,
  );
  expect(contact).toBeDefined();
  return contact!.id;
}

async function prove(memberNo: string, kind: string): Promise<void> {
  await harness.db.query(
    `update member_contacts set verified_at = now()
      where member_id = (select id from members where member_no = $1) and kind = $2`,
    [memberNo, kind],
  );
}

describe('officer issue (MR-23, MR-24, MR-27, MR-29, MR-35)', () => {
  it('sends once to the email when the member has an email, a number and WhatsApp', async () => {
    await createMember('VER-E1', [
      { kind: 'phone', value: '0804 100 0201' },
      { kind: 'email', value: 'ama.one@example.test' },
      { kind: 'whatsapp', value: '0555 100 201' },
    ]);

    const response = await startCode('VER-E1');
    expect(response.status).toBe(202);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      destination: { channel: 'email', masked: 'a***@example.test' },
      expiresAt: expect.any(String),
    });
    expect(Date.parse(response.body.expiresAt)).toBeGreaterThan(Date.now());
    expect(response.body).not.toHaveProperty('code');
    expect(response.body).not.toHaveProperty('token');

    // One channel, once: email only, and the message carries the code and link.
    expect(captured.emails).toHaveLength(1);
    expect(captured.messages).toHaveLength(0);
    const code = codeFrom(captured.emails[0]!.body);
    const token = tokenFrom(captured.emails[0]!.body);
    expect(captured.emails[0]!.body).toContain(`${LINK_BASE}#t=${token}`);
    expect(captured.emails[0]!.body).not.toContain('USSD');

    const stored = await codeRow('VER-E1');
    expect(stored).not.toBeNull();
    expect(stored!.code_hash).not.toBe(code);
    expect(stored!.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored!.token_hash).toBe(hashToken(token));
    expect(stored!.destination).toEqual({ channel: 'email', masked: 'a***@example.test' });
  });

  it('uses WhatsApp when there is no email, with the code and the same link', async () => {
    await createMember('VER-W1', [
      { kind: 'phone', value: '0804 100 0202' },
      { kind: 'whatsapp', value: '0555 100 202' },
    ]);

    const response = await startCode('VER-W1');
    expect(response.status).toBe(202);
    expect(response.body.destination).toEqual({ channel: 'whatsapp', masked: '+233 *** 02' });
    expect(captured.messages).toHaveLength(1);
    expect(captured.messages[0]!.channel).toBe('whatsapp');
    expect(captured.messages[0]!.to).toBe('233555100202');
    expect(captured.emails).toHaveLength(0);
    expect(codeFrom(captured.messages[0]!.body)).toMatch(/^\d{6}$/);
    const token = tokenFrom(captured.messages[0]!.body);
    expect(captured.messages[0]!.body).toContain(`${LINK_BASE}#t=${token}`);
    expect(captured.messages[0]!.body).not.toContain('USSD');
    expect((await codeRow('VER-W1'))!.token_hash).toBe(hashToken(token));
  });

  it('sends the phone code and the acceptance link by SMS', async () => {
    await createMember('VER-S1', [{ kind: 'phone', value: '0804 100 0203' }]);

    const response = await startCode('VER-S1');
    expect(response.status).toBe(202);
    expect(response.body.destination).toEqual({ channel: 'phone', masked: '+233 *** 03' });

    expect(captured.messages).toHaveLength(1);
    expect(captured.messages[0]!.channel).toBe('sms');
    expect(captured.messages[0]!.to).toBe('2338041000203');
    const code = codeFrom(captured.messages[0]!.body);
    const token = tokenFrom(captured.messages[0]!.body);
    expect(captured.messages[0]!.body).toContain(`${LINK_BASE}#t=${token}`);
    expect(captured.messages[0]!.body).not.toContain('USSD');

    const stored = await codeRow('VER-S1');
    expect(stored!.token_hash).toBe(hashToken(token));
    expect(stored!.token_hash).not.toContain(token);
    expect(stored!.code_hash).not.toBe(code);
  });

  it('issues to an email-only member with 202, the code and the link', async () => {
    await createMember('VER-EMAILONLY', [{ kind: 'email', value: 'solo@example.test' }]);

    const response = await startCode('VER-EMAILONLY');
    expect(response.status).toBe(202);
    expect(response.body.destination).toEqual({ channel: 'email', masked: 's***@example.test' });
    expect(response.body).not.toHaveProperty('entry');

    expect(captured.emails).toHaveLength(1);
    expect(captured.messages).toHaveLength(0);
    const message = captured.emails[0]!.body;
    const code = codeFrom(message);
    const token = tokenFrom(message);
    expect(message).toContain(`${LINK_BASE}#t=${token}`);
    expect(message).not.toContain('USSD');

    const stored = await codeRow('VER-EMAILONLY');
    expect(stored!.token_hash).toBe(hashToken(token));
    expect(stored!.code_hash).not.toBe(code);
  });

  it('skips a proven contact and resolves the next unproven channel (AC-MR46)', async () => {
    await createMember('VER-SKIP', [
      { kind: 'phone', value: '0804 100 0213' },
      { kind: 'email', value: 'skip.one@example.test' },
    ]);
    const phoneId = await contactIdOf('VER-SKIP', 'phone');
    await prove('VER-SKIP', 'phone');

    const response = await startCode('VER-SKIP');
    expect(response.status).toBe(202);
    // The proven phone is skipped even though it would be a valid channel.
    expect(response.body.destination).toEqual({
      channel: 'email',
      masked: 's***@example.test',
    });
    expect(captured.emails).toHaveLength(1);
    expect(captured.messages).toHaveLength(0);

    const message = captured.emails[0]!.body;
    const accepted = await acceptPage(tokenFrom(message), codeFrom(message));
    expect(accepted.status).toBe(200);

    // Both proofs now exist; the second did not replace the first.
    const member = await detail('VER-SKIP');
    expect(member.verifiedContacts).toHaveLength(2);
    expect(member.verifiedContacts.map((proof) => proof.channel).sort()).toEqual([
      'email',
      'phone',
    ]);
    expect(member.verifiedContacts.some((proof) => proof.id === phoneId)).toBe(true);
    const proofs = await contactProofs('VER-SKIP');
    expect(proofs.every((proof) => proof.verifiedAt !== null)).toBe(true);
  });

  it('refuses an all-proven or officer-confirmed member with 409 already_verified (AC-MR46)', async () => {
    await createMember('VER-ALLPROVEN', [
      { kind: 'phone', value: '0804 100 0214' },
      { kind: 'email', value: 'all.proven@example.test' },
    ]);
    await prove('VER-ALLPROVEN', 'phone');
    await prove('VER-ALLPROVEN', 'email');

    const allProven = await startCode('VER-ALLPROVEN');
    expect(allProven.status).toBe(409);
    expect(allProven.body.code).toBe('already_verified');
    expect(captured.messages).toHaveLength(0);
    expect(captured.emails).toHaveLength(0);
    expect(await codeRow('VER-ALLPROVEN')).toBeNull();

    // An officer confirmation means nothing is left to prove, even though the
    // member still holds an unproven contact.
    await createMember('VER-CONFIRMED-ISSUE', [{ kind: 'phone', value: '0804 100 0215' }]);
    await request(app)
      .post('/v1/members/VER-CONFIRMED-ISSUE/confirmation')
      .set(writeHeaders)
      .send({ reason: 'Known to the office' })
      .expect(201);

    const confirmed = await startCode('VER-CONFIRMED-ISSUE');
    expect(confirmed.status).toBe(409);
    expect(confirmed.body.code).toBe('already_verified');
    expect(captured.messages).toHaveLength(0);
    expect(await codeRow('VER-CONFIRMED-ISSUE')).toBeNull();
  });

  it('refuses a contactless member with 409 no_own_contact and sends nothing', async () => {
    await createMember('VER-GUARD', [{ kind: 'phone', value: '0804 100 0204' }], {
      dob: '1980-01-01',
    });
    const dependent = await request(app).post('/v1/members').set(writeHeaders).send({
      memberNo: 'VER-D1',
      firstName: 'Dependent',
      lastName: 'One',
      joinedOn: '2024-01-01',
      guardianMemberNo: 'VER-GUARD',
    });
    expect(dependent.status).toBe(201);

    const response = await startCode('VER-D1');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('no_own_contact');
    expect(response.body.detail).toMatch(/email, phone or WhatsApp/);
    expect(captured.messages).toHaveLength(0);
    expect(captured.emails).toHaveLength(0);
    expect(await codeRow('VER-D1')).toBeNull();
  });

  it('throttles a second send and a sixth hourly send with 429 too_many_requests', async () => {
    await createMember('VER-T1', [{ kind: 'phone', value: '0804 100 0205' }]);
    const id = await memberId('VER-T1');

    await startCode('VER-T1').expect(202);
    const repeated = await startCode('VER-T1');
    expect(repeated.status).toBe(429);
    expect(repeated.body.code).toBe('too_many_requests');
    // The two windows answer distinguishable refusals (MR-27, AC-MR45).
    expect(repeated.body.detail).toMatch(/less than a minute/);
    expect(captured.messages).toHaveLength(1);

    // Only the 60-second window is reset between sends; the hourly counter is
    // the one under test (AC-MR35, second clause).
    const clearMinute = () =>
      harness.db.query('delete from auth_rate_limits where key = $1', [
        `verify:member:${id}:minute`,
      ]);
    for (let send = 2; send <= 5; send += 1) {
      await clearMinute();
      await startCode('VER-T1').expect(202);
    }
    expect(captured.messages).toHaveLength(5);

    await clearMinute();
    const sixth = await startCode('VER-T1');
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('too_many_requests');
    expect(sixth.body.detail).toMatch(/last hour/);
    expect(captured.messages).toHaveLength(5);
  });

  it('answers 503 delivery_unavailable when the channel has no sender and stores nothing', async () => {
    const member = await request(unconfigured.app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'VER-U1',
        firstName: 'Unconfigured',
        lastName: 'Channel',
        joinedOn: '2024-01-01',
        contacts: [{ kind: 'phone', value: '0804 100 0206' }],
      });
    expect(member.status).toBe(201);

    const response = await request(unconfigured.app)
      .post('/v1/members/VER-U1/verification/otp')
      .set(writeHeaders)
      .send({});
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('delivery_unavailable');

    const [id] = await unconfigured.db.query<{ id: string }>(
      'select id from members where member_no = $1',
      ['VER-U1'],
    );
    const codes = await unconfigured.db.query(
      'select id from member_verification_codes where member_id = $1',
      [id!.id],
    );
    expect(codes).toHaveLength(0);
    // A 503 is a configuration fault, not a send: neither fixed window moved.
    const counters = await unconfigured.db.query<{ key: string }>(
      'select key from auth_rate_limits where key like $1',
      [`verify:member:${id!.id}:%`],
    );
    expect(counters).toHaveLength(0);
  });

  it('stores the code before sending, so a transport failure leaves a live row that the next issue replaces', async () => {
    await createMember('VER-X1', [{ kind: 'phone', value: '0804 100 0212' }]);
    const id = await memberId('VER-X1');

    const failingApp = createApp({
      db: harness.db,
      bearerToken: TOKEN,
      logger: pino({ level: 'silent' }),
      mailer: new NullMailer(),
      senders: {
        whatsapp: null,
        email: null,
        sms: {
          async send(): Promise<void> {
            throw new DeliveryUnavailableError('The message provider could not be reached');
          },
        },
      },
      ussd: { enabled: false },
    });

    const failed = await request(failingApp)
      .post('/v1/members/VER-X1/verification/otp')
      .set(writeHeaders)
      .send({});
    expect(failed.status).toBe(503);

    const stored = await harness.db.query<{ id: string; consumed_at: Date | string | null }>(
      'select id, consumed_at from member_verification_codes where member_id = $1',
      [id],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]!.consumed_at).toBeNull();

    await harness.db.query('delete from auth_rate_limits where key like $1', ['verify:member:%']);
    await startCode('VER-X1').expect(202);
    expect(captured.messages).toHaveLength(1);

    // Exactly one live code: the unsent row was consumed by the replacement.
    const rows = await harness.db.query<{ id: string; consumed_at: Date | string | null }>(
      'select id, consumed_at from member_verification_codes where member_id = $1',
      [id],
    );
    expect(rows).toHaveLength(2);
    const live = rows.filter((row) => row.consumed_at === null);
    expect(live).toHaveLength(1);
    expect(live[0]!.id).not.toBe(stored[0]!.id);
  });

  it('answers 404 for an archived member and 401 without the bearer', async () => {
    await createMember('VER-A1', [{ kind: 'phone', value: '0804 100 0208' }]);
    await request(app).delete('/v1/members/VER-A1').set(writeHeaders).expect(204);

    const archived = await startCode('VER-A1');
    expect(archived.status).toBe(404);
    expect(archived.body.code).toBe('not_found');

    const unknown = await startCode('VER-NOPE');
    expect(unknown.status).toBe(404);

    const anonymous = await request(app).post('/v1/members/VER-A1/verification/otp').send({});
    expect(anonymous.status).toBe(401);

    const unauthenticatedRevoke = await request(app).delete('/v1/members/VER-A1/verification');
    expect(unauthenticatedRevoke.status).toBe(401);
  });

  it('logs the member number and channel, never the code, a destination or a token', async () => {
    await createMember('VER-L1', [{ kind: 'phone', value: '0804 100 0209' }]);

    await startCode('VER-L1').expect(202);
    const message = captured.messages[0]!.body;
    const code = codeFrom(message);
    const token = tokenFrom(message);

    const issued = logLines.filter((line) => line.msg === 'member verification code issued');
    expect(issued.length).toBeGreaterThanOrEqual(1);
    const line = issued.at(-1)!;
    expect(line).toMatchObject({ memberNo: 'VER-L1', channel: 'phone' });
    expect(line).not.toHaveProperty('entry');

    // `time` is the logger's own epoch and may contain any six digits; the
    // fields the route wrote must not.
    const { time: _time, ...fields } = line;
    const serialised = JSON.stringify(fields);
    expect(serialised).not.toContain(code);
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain('2338041000209');
    expect(serialised).not.toContain('+233 ***');
    expect(serialised).not.toContain('code_hash');
  });
});

describe('the public acceptance page (MR-51, AC-MR41)', () => {
  async function issuePhone(memberNo: string): Promise<{ token: string; code: string }> {
    const response = await startCode(memberNo).expect(202);
    expect(response.body).not.toHaveProperty('entry');
    const body = captured.messages.at(-1)!.body;
    return { token: tokenFrom(body), code: codeFrom(body) };
  }

  it('accepts the code once, sets the phone proof and answers only the mask', async () => {
    await createMember('VER-P1', [{ kind: 'phone', value: '0804 100 0301' }]);
    const { token, code } = await issuePhone('VER-P1');

    const accepted = await acceptPage(token, code);
    expect(accepted.status).toBe(200);
    expect(accepted.headers['cache-control']).toBe('no-store');
    expect(accepted.body).toEqual({ channel: 'phone', masked: '+233 *** 01' });

    const proofs = await contactProofs('VER-P1');
    expect(proofs).toEqual([{ kind: 'phone', verifiedAt: expect.any(String) }]);
    expect((await codeRow('VER-P1'))!.consumed_at).not.toBeNull();

    const member = await detail('VER-P1');
    expect(member.verifiedContacts).toEqual([
      {
        id: expect.any(String),
        channel: 'phone',
        masked: '+233 *** 01',
        verifiedAt: expect.any(String),
      },
    ]);
    expect(member.confirmedAt).toBeNull();

    // The token and the code are single use: the live row is gone.
    const replay = await acceptPage(token, code);
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('code_invalid');
  });

  it('counts a wrong code and ends it at five attempts', async () => {
    await createMember('VER-P2', [{ kind: 'phone', value: '0804 100 0302' }]);
    const { token, code } = await issuePhone('VER-P2');
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await acceptPage(token, wrong);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('code_invalid');
    }
    expect((await codeRow('VER-P2'))!.attempts).toBe(4);

    const fifth = await acceptPage(token, wrong);
    expect(fifth.status).toBe(400);
    expect(fifth.body.code).toBe('too_many_tries');
    expect((await codeRow('VER-P2'))!.consumed_at).not.toBeNull();

    // The right code no longer works once the five attempts closed the row.
    const closed = await acceptPage(token, code);
    expect(closed.status).toBe(400);
    expect(closed.body.code).toBe('code_invalid');
  });

  it('refuses an expired code', async () => {
    await createMember('VER-P3', [{ kind: 'phone', value: '0804 100 0303' }]);
    const issued = await service.issue('VER-P3');
    const message = captured.messages.at(-1)!.body;
    await expect(
      service.accept(
        tokenFrom(message),
        codeFrom(message),
        new Date(Date.parse(issued.expiresAt) + 1),
      ),
    ).rejects.toMatchObject({ code: 'code_expired' });
    expect((await contactProofs('VER-P3'))[0]!.verifiedAt).toBeNull();
  });

  it('rate-limits the token and the address with 429 too_many_requests', async () => {
    await harness.db.query('delete from auth_rate_limits where key like $1', ['verify:ip:%']);

    // One repeated unknown token consumes its own window; the eleventh is refused.
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await acceptPage('unknown-token', '000000');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('code_invalid');
    }
    const overToken = await acceptPage('unknown-token', '000000');
    expect(overToken.status).toBe(429);
    expect(overToken.body.code).toBe('too_many_requests');

    // The address window is separate: 20 requests total from one address.
    await harness.db.query('delete from auth_rate_limits where key like $1', ['verify:token:%']);
    await harness.db.query('delete from auth_rate_limits where key like $1', ['verify:ip:%']);
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const response = await acceptPage(`address-token-${attempt}`, '000000');
      expect(response.status).toBe(400);
    }
    const overAddress = await acceptPage('address-token-21', '000000');
    expect(overAddress.status).toBe(429);
    expect(overAddress.body.code).toBe('too_many_requests');
  });

  it('binds the code to the contact it was sent to and refuses an edited contact (MR-26)', async () => {
    await createMember('VER-BIND', [
      { kind: 'phone', value: '0804 100 0310' },
      { kind: 'email', value: 'bind.one@example.test' },
    ]);
    const emailId = await contactIdOf('VER-BIND', 'email');
    const issued = await startCode('VER-BIND').expect(202);
    expect(issued.body.destination).toEqual({ channel: 'email', masked: 'b***@example.test' });
    const body = captured.emails.at(-1)!.body;
    const token = tokenFrom(body);
    const code = codeFrom(body);

    // The issue resolved the email, so the row names the email contact and a
    // hash of its normalised value (never the value itself).
    const stored = await codeRow('VER-BIND');
    expect(stored!.contact_id).toBe(emailId);
    expect(stored!.destination_value_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain('bind.one@example.test');

    // The contact is edited after the send: the code must not prove the new value.
    await request(app)
      .put(`/v1/members/VER-BIND/contacts/${emailId}`)
      .set(writeHeaders)
      .send({ value: 'bind.two@example.test' })
      .expect(200);

    const refused = await acceptPage(token, code);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('code_invalid');
    const proofs = await contactProofs('VER-BIND');
    expect(proofs.every((proof) => proof.verifiedAt === null)).toBe(true);
    // The code itself was not burned by the mismatch: the refusal is the contact
    // change, not a consumed code.
    expect((await codeRow('VER-BIND'))!.consumed_at).toBeNull();
  });

  it('never needs the bearer and answers no member data', async () => {
    await createMember('VER-P5', [{ kind: 'phone', value: '0804 100 0305' }]);
    const { token, code } = await issuePhone('VER-P5');

    const response = await acceptPage(token, code);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['channel', 'masked']);
    expect(JSON.stringify(response.body)).not.toContain('VER-P5');
    expect(JSON.stringify(response.body)).not.toContain('8041000305');
  });

  it('refuses an unknown token with 400 code_invalid', async () => {
    const response = await acceptPage('never-issued', '123456');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('code_invalid');
  });

  it('treats a code row with an unreadable destination as no code (MR-24)', async () => {
    await createMember('VER-BADDEST', [{ kind: 'phone', value: '0804 100 0311' }]);
    const id = await memberId('VER-BADDEST');
    await harness.db.query(
      `insert into member_verification_codes
         (member_id, code_hash, destination, contact_id, destination_value_hash, token_hash,
          expires_at)
       values ($1, $2, '{"channel": 7, "masked": ""}'::jsonb, null, $3, $4,
               now() + interval '10 minutes')`,
      [id, 'a'.repeat(64), 'b'.repeat(64), 'unreadable-token-hash'],
    );

    const repo = new VerificationRepository(harness.db, DEFAULT_COUNTRY_CODE);
    expect(await repo.liveCode(id)).toBeNull();
    expect(await repo.liveCodeByToken('unreadable-token-hash')).toBeNull();
  });
});

describe('acceptance for every channel (MR-51)', () => {
  it('accepts an email token and sets the email proof', async () => {
    await createMember('VER-V1', [
      { kind: 'phone', value: '0804 100 0401' },
      { kind: 'email', value: 'verify.one@example.test' },
    ]);
    const issued = await startCode('VER-V1').expect(202);
    expect(issued.body.destination).toEqual({ channel: 'email', masked: 'v***@example.test' });
    const message = captured.emails[0]!.body;
    const token = tokenFrom(message);
    const code = codeFrom(message);

    const accepted = await acceptPage(token, code);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ channel: 'email', masked: 'v***@example.test' });

    const proofs = await contactProofs('VER-V1');
    expect(proofs.find((proof) => proof.kind === 'email')!.verifiedAt).not.toBeNull();
    expect(proofs.find((proof) => proof.kind === 'phone')!.verifiedAt).toBeNull();

    // The token is single use whatever channel it came from.
    const replay = await acceptPage(token, code);
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('code_invalid');
  });

  it('accepts a WhatsApp token and sets the WhatsApp proof', async () => {
    await createMember('VER-V2', [
      { kind: 'phone', value: '0804 100 0402' },
      { kind: 'whatsapp', value: '0555 100 402' },
    ]);
    const issued = await startCode('VER-V2').expect(202);
    expect(issued.body.destination).toEqual({ channel: 'whatsapp', masked: '+233 *** 02' });
    const message = captured.messages[0]!.body;
    const token = tokenFrom(message);
    const code = codeFrom(message);

    const accepted = await acceptPage(token, code);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ channel: 'whatsapp', masked: '+233 *** 02' });

    const proofs = await contactProofs('VER-V2');
    expect(proofs.find((proof) => proof.kind === 'whatsapp')!.verifiedAt).not.toBeNull();
    expect(proofs.find((proof) => proof.kind === 'phone')!.verifiedAt).toBeNull();
  });
});

describe('officer confirmation and withdrawal (MR-31, MR-52, AC-MR42)', () => {
  it('appends an audited confirmation, then withdraws it and every proof', async () => {
    await createMember('VER-C1', [{ kind: 'phone', value: '0804 100 0501' }]);
    await service.issue('VER-C1');
    const code = codeFrom(captured.messages[0]!.body);
    const token = tokenFrom(captured.messages[0]!.body);
    await acceptPage(token, code).expect(200);

    const confirmed = await request(app)
      .post('/v1/members/VER-C1/confirmation')
      .set(writeHeaders)
      .send({ reason: 'Known to the office for 20 years' });
    expect(confirmed.status).toBe(201);
    expect(typeof confirmed.body.confirmedAt).toBe('string');

    const [audit] = await harness.db.query<{
      confirmed_by: string;
      reason: string;
      withdrawn_at: Date | string | null;
    }>(
      `select confirmed_by, reason, withdrawn_at
         from member_confirmations c
         join members m on m.id = c.member_id
        where m.member_no = 'VER-C1'`,
    );
    expect(audit).toMatchObject({
      confirmed_by: 'test-admin',
      reason: 'Known to the office for 20 years',
      withdrawn_at: null,
    });

    const before = await detail('VER-C1');
    expect(before.confirmedAt).toBe(confirmed.body.confirmedAt);
    expect(before.verifiedContacts).toHaveLength(1);

    // The confirmation alone can be withdrawn; the contact proof stays.
    await request(app).delete('/v1/members/VER-C1/confirmation').set(writeHeaders).expect(204);
    const afterConfirmation = await detail('VER-C1');
    expect(afterConfirmation.confirmedAt).toBeNull();
    expect(afterConfirmation.verifiedContacts).toHaveLength(1);
    const [withdrawn] = await harness.db.query<{ withdrawn_by: string }>(
      `select withdrawn_by from member_confirmations c
         join members m on m.id = c.member_id
        where m.member_no = 'VER-C1'`,
    );
    expect(withdrawn!.withdrawn_by).toBe('test-admin');

    // Revoke withdraws the proof too, never the contact.
    await request(app).delete('/v1/members/VER-C1/verification').set(writeHeaders).expect(204);
    const revoked = await detail('VER-C1');
    expect(revoked.confirmedAt).toBeNull();
    expect(revoked.verifiedContacts).toEqual([]);
    expect(await contactProofs('VER-C1')).toEqual([{ kind: 'phone', verifiedAt: null }]);
    // The number is still owned, so identification is unchanged.
    expect((await detail('VER-C1')).verifiedContacts).toEqual([]);
    expect(
      (await request(app).get('/v1/members/VER-C1').set(readHeaders)).body.contacts,
    ).toHaveLength(1);
  });

  it('requires a reason and refuses an unknown member', async () => {
    await createMember('VER-C2', [{ kind: 'phone', value: '0804 100 0502' }]);
    const blank = await request(app)
      .post('/v1/members/VER-C2/confirmation')
      .set(writeHeaders)
      .send({ reason: '   ' });
    expect(blank.status).toBe(422);
    expect(blank.body.code).toBe('validation_error');

    const missing = await request(app)
      .post('/v1/members/VER-NOBODY/confirmation')
      .set(writeHeaders)
      .send({ reason: 'Known' });
    expect(missing.status).toBe(404);
  });

  it('renders no badge source for an imported legacy date with no audit row', async () => {
    await createMember('VER-C3', [{ kind: 'phone', value: '0804 100 0503' }]);
    await harness.db.query(`update members set verified_at = now() where member_no = 'VER-C3'`);

    const member = await detail('VER-C3');
    expect(member.verifiedContacts).toEqual([]);
    expect(member.confirmedAt).toBeNull();
  });
});

describe('proofs follow the contact (MR-32)', () => {
  async function provePhone(memberNo: string): Promise<void> {
    await harness.db.query(
      `update member_contacts set verified_at = now()
        where member_id = (select id from members where member_no = $1) and kind = 'phone'`,
      [memberNo],
    );
  }

  async function contactId(memberNo: string, kind: string): Promise<string> {
    const response = await request(app).get(`/v1/members/${memberNo}`).set(readHeaders);
    const contact = (response.body.contacts as Array<{ id: string; kind: string }>).find(
      (entry) => entry.kind === kind,
    );
    expect(contact).toBeDefined();
    return contact!.id;
  }

  it('clears the proof when that contact value changes, and keeps another contact’s proof', async () => {
    await createMember('VER-K1', [
      { kind: 'phone', value: '0804 100 0601' },
      { kind: 'email', value: 'change.one@example.test' },
    ]);
    await provePhone('VER-K1');
    // An email proof written directly, so both proofs exist at once.
    await harness.db.query(
      `update member_contacts set verified_at = now()
        where member_id = (select id from members where member_no = 'VER-K1') and kind = 'email'`,
    );
    expect((await detail('VER-K1')).verifiedContacts).toHaveLength(2);

    const phoneId = await contactId('VER-K1', 'phone');
    await request(app)
      .put(`/v1/members/VER-K1/contacts/${phoneId}`)
      .set(writeHeaders)
      .send({ value: '0804 100 0602' })
      .expect(200);

    const proofs = await contactProofs('VER-K1');
    expect(proofs.find((proof) => proof.kind === 'phone')!.verifiedAt).toBeNull();
    expect(proofs.find((proof) => proof.kind === 'email')!.verifiedAt).not.toBeNull();
  });

  it('clears nothing when only the display order changes', async () => {
    await createMember('VER-K2', [{ kind: 'phone', value: '0804 100 0603' }]);
    await provePhone('VER-K2');
    const phoneId = await contactId('VER-K2', 'phone');

    await request(app)
      .put(`/v1/members/VER-K2/contacts/${phoneId}`)
      .set(writeHeaders)
      .send({ displayOrder: 3 })
      .expect(200);
    expect((await contactProofs('VER-K2'))[0]!.verifiedAt).not.toBeNull();
  });

  it('removes the proof with the contact row', async () => {
    await createMember('VER-K3', [
      { kind: 'phone', value: '0804 100 0604' },
      { kind: 'email', value: 'kept@example.test' },
    ]);
    await provePhone('VER-K3');
    const phoneId = await contactId('VER-K3', 'phone');

    await request(app)
      .delete(`/v1/members/VER-K3/contacts/${phoneId}`)
      .set(writeHeaders)
      .expect(204);
    expect(await contactProofs('VER-K3')).toEqual([{ kind: 'email', verifiedAt: null }]);
    expect((await detail('VER-K3')).verifiedContacts).toEqual([]);
  });
});

describe('purge (MR-53)', () => {
  it('deletes the confirmations and codes and leaves the tombstone', async () => {
    await createMember('VER-PURGE', [{ kind: 'phone', value: '0804 100 0701' }]);
    await service.issue('VER-PURGE');
    const code = codeFrom(captured.messages[0]!.body);
    await acceptPage(tokenFrom(captured.messages[0]!.body), code).expect(200);
    await request(app)
      .post('/v1/members/VER-PURGE/confirmation')
      .set(writeHeaders)
      .send({ reason: 'Known' })
      .expect(201);

    const id = await memberId('VER-PURGE');

    await request(app)
      .post('/v1/members/VER-PURGE/purge')
      .set(writeHeaders)
      .send({ confirm: 'VER-PURGE' })
      .expect(204);

    const confirmations = await harness.db.query(
      'select id from member_confirmations where member_id = $1',
      [id],
    );
    expect(confirmations).toHaveLength(0);
    const codes = await harness.db.query(
      'select id from member_verification_codes where member_id = $1',
      [id],
    );
    expect(codes).toHaveLength(0);
    // The member stays as a tombstone with no proofs or audit left.
    const [tombstone] = await harness.db.query<{ purged_at: Date | string | null }>(
      'select purged_at from members where id = $1',
      [id],
    );
    expect(tombstone!.purged_at).not.toBeNull();
  });
});

/**
 * The same repository contract on the pooled `pg` driver (AGENTS.md §12). Set
 * `TEST_DATABASE_URL` to a scratch server that allows creating databases; the
 * block migrates a database of its own and drops it. Skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('verification repository on the pooled pg driver', () => {
  let pooled: Db;
  let repo: VerificationRepository;
  let pgService: VerificationService;
  let pgSenders: CapturingSenders;
  let memberIdValue = '';

  beforeAll(async () => {
    pooled = await createScratchPgDb(testDatabaseUrl!);
    await migrate(pooled);
    repo = new VerificationRepository(pooled, DEFAULT_COUNTRY_CODE);
    pgSenders = capturingSenders();
    pgService = new VerificationService(repo, {
      otpPepper: OTP_PEPPER,
      countryCode: DEFAULT_COUNTRY_CODE,
      linkBase: LINK_BASE,
      senders: pgSenders.senders,
    });

    const [member] = await pooled.query<{ id: string }>(
      `insert into members (member_no, first_name, last_name, joined_on, created_by, updated_by)
       values ('PG-VER-1', 'Pooled', 'Member', '2024-01-01', 'seed', 'seed')
       returning id`,
    );
    memberIdValue = member!.id;
    await pooled.query(
      `insert into member_contacts (member_id, kind, value, normalized_value, display_order)
       values ($1, 'phone', '0804 100 0401', '8041000401', 0)`,
      [memberIdValue],
    );
  });

  afterAll(async () => {
    await pooled?.close();
  });

  it('issues, stores, accepts, confirms and revokes on the pooled driver', async () => {
    const issued = await pgService.issue('PG-VER-1');
    expect(issued.destination).toEqual({ channel: 'phone', masked: '+233 *** 01' });
    expect(issued).not.toHaveProperty('entry');

    const live = await repo.liveCode(memberIdValue);
    expect(live).not.toBeNull();
    expect(live!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(live!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(live!.attempts).toBe(0);

    expect(await repo.recordAttempt(live!.id)).toBe(1);
    expect((await repo.liveCode(memberIdValue))!.attempts).toBe(1);

    const body = pgSenders.messages.at(-1)!.body;
    expect(body).toContain(`${LINK_BASE}#t=`);
    const token = tokenFrom(body);
    const accepted = await pgService.accept(token, codeFrom(body));
    expect(accepted).toEqual({ channel: 'phone', masked: '+233 *** 01' });

    const member = await repo.verificationFor('PG-VER-1');
    expect(member!.verifiedContacts).toHaveLength(1);
    expect(member!.verifiedContacts[0]).toMatchObject({
      channel: 'phone',
      masked: '+233 *** 01',
    });

    const confirmedAt = await pgService.confirm('PG-VER-1', 'Known', 'seed');
    expect(await repo.activeConfirmation(memberIdValue)).toBe(confirmedAt.confirmedAt);

    await pgService.revoke('PG-VER-1', 'seed');
    const revoked = await repo.verificationFor('PG-VER-1');
    expect(revoked!.verifiedContacts).toEqual([]);
    expect(revoked!.confirmedAt).toBeNull();

    // A second issue is a live code again, and a wrong entry counts.
    await pooled.query('delete from auth_rate_limits where key like $1', ['verify:%']);
    await pgService.issue('PG-VER-1');
    expect(await repo.liveCode(memberIdValue)).not.toBeNull();
    expect(await repo.consumeRateLimit('verify:test:window', 1, 1)).toBe(true);
    expect(await repo.consumeRateLimit('verify:test:window', 1, 1)).toBe(false);
  });

  it('maps the live-code index race to a 429 and keeps one live code (MR-27)', async () => {
    await pooled.query(`delete from auth_rate_limits where key like 'verify:%'`);
    const [racing] = await pooled.query<{ id: string }>(
      `insert into members (member_no, first_name, last_name, joined_on, created_by, updated_by)
       values ('PG-VER-RACE', 'Race', 'Member', '2024-01-01', 'seed', 'seed')
       returning id`,
    );
    const [contact] = await pooled.query<{ id: string }>(
      `insert into member_contacts (member_id, kind, value, normalized_value, display_order)
       values ($1, 'phone', '0804 100 0850', '8041000850', 0)
       returning id`,
      [racing!.id],
    );

    const input = (suffix: string) => ({
      codeHash: `${suffix}`.repeat(64).slice(0, 64),
      destination: { channel: 'phone' as const, masked: '+233 *** 50' },
      contactId: contact!.id,
      destinationValueHash: 'c'.repeat(64),
      tokenHash: `${suffix}${suffix}`.repeat(64).slice(0, 64),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const results = await Promise.allSettled([
      repo.replaceLiveCode(racing!.id, input('a')),
      repo.replaceLiveCode(racing!.id, input('b')),
    ]);

    // The throttle is bypassed here on purpose: this is the repository's own
    // unique-index race, and its loser must be a 429, never a 500.
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ code: 'too_many_requests' });
      }
    }
    const rows = await pooled.query<{ consumed_at: Date | string | null }>(
      'select consumed_at from member_verification_codes where member_id = $1',
      [racing!.id],
    );
    expect(rows.filter((row) => row.consumed_at === null)).toHaveLength(1);
  });
});
