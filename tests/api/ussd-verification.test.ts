import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VERIFICATION_LINK_BASE } from '../../src/config/env.js';
import {
  capturingSenders,
  createTestApp,
  writeHeaders,
  type CapturingSenders,
  type TestApp,
} from '../helpers/app.js';

/**
 * MR-54/MR-55 at the USSD pipeline seam: an identified member starts a code from
 * `My Profile > Verify contact`; the real verification service sends the code and
 * the acceptance-page link to the register-chosen channel, and the notice shows
 * only the mask. A fake sender captures the message so the test can prove the code
 * and the link without a network.
 */

const USSD_SECRET = 'test-ussd-gateway-secret-16';
const USSD_PHONE_PEPPER = 'test-ussd-phone-pepper-16';

let harness: TestApp;
let captured: CapturingSenders;
let nonceSeq = 0;

function signed(app: TestApp['app'], body: Record<string, unknown>, ip = '10.9.0.1'): request.Test {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `nonce-ussd-verify-${String(++nonceSeq).padStart(6, '0')}`;
  const signature = createHmac('sha256', USSD_SECRET)
    .update(`${timestamp}${nonce}${raw}`)
    .digest('hex');
  return request(app)
    .post('/ussd/session')
    .set({
      'Content-Type': 'application/json',
      'X-USSD-Timestamp': timestamp,
      'X-USSD-Nonce': nonce,
      'X-USSD-Signature': signature,
      'X-Forwarded-For': ip,
    })
    .send(raw);
}

function frame(sessionId: string, phone: string, input: string, seq: number, ip: string) {
  return signed(harness.app, { phone, input, seq, sessionId }, ip);
}

async function createMember(
  memberNo: string,
  phone: string,
  extraContacts: Array<{ kind: 'email' | 'whatsapp'; value: string }> = [],
): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Ussd',
      lastName: memberNo,
      joinedOn: '2024-01-01',
      contacts: [{ kind: 'phone', value: phone }, ...extraContacts],
    });
  expect(response.status).toBe(201);
  const [row] = await harness.db.query<{ id: string }>(
    'select id from members where member_no = $1',
    [memberNo],
  );
  return row!.id;
}

async function openProfile(
  phone: string,
  ip: string,
): Promise<{ sessionId: string; text: string }> {
  const started = await signed(harness.app, { phone, input: '', seq: 1 }, ip);
  expect(started.status).toBe(200);
  const profile = await frame(started.body.sessionId, phone, '5', 2, ip);
  expect(profile.status).toBe(200);
  expect(profile.body.state).toBe('profile');
  return { sessionId: started.body.sessionId, text: profile.body.text as string };
}

beforeAll(async () => {
  captured = capturingSenders();
  harness = await createTestApp({
    senders: captured.senders,
    ussd: { enabled: true, gatewaySecret: USSD_SECRET, phonePepper: USSD_PHONE_PEPPER },
  });
});

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  captured.messages.length = 0;
  captured.emails.length = 0;
});

describe('My Profile > Verify contact (MR-54, MR-55)', () => {
  it('sends to the email and renders the mask and link with no code', async () => {
    await createMember('USSD-V-EMAIL', '0804 200 0001', [
      { kind: 'email', value: 'ussd.email@example.test' },
    ]);

    const { sessionId, text } = await openProfile('0804 200 0001', '10.9.1.1');
    expect(text).toContain('1 Verify contact');

    const sent = await frame(sessionId, '0804 200 0001', '1', 3, '10.9.1.1');
    expect(sent.status).toBe(200);
    expect(sent.body.state).toBe('verify.sent');
    expect(sent.body.done).toBe(false);
    expect(sent.body.text).toContain(
      'A code was sent to u***@example.test. Open the link we sent.',
    );
    expect(sent.body.options.map((option: { key: string }) => option.key)).toEqual(['9', '00']);

    expect(captured.emails).toHaveLength(1);
    expect(captured.messages).toHaveLength(0);
    const body = captured.emails[0]!.body;
    const code = /\b(\d{6})\b/.exec(body)![1]!;
    expect(body).toContain(`${DEFAULT_VERIFICATION_LINK_BASE}#t=`);
    expect(sent.body.text).not.toContain(code);
    expect(sent.body.text).not.toContain('#t=');

    // 9 Back returns to My Profile, where the action is still offered.
    const back = await frame(sessionId, '0804 200 0001', '9', 4, '10.9.1.1');
    expect(back.body.state).toBe('profile');
    expect(back.body.text).toContain('1 Verify contact');
  });

  it('sends to WhatsApp when the member has no email', async () => {
    await createMember('USSD-V-WA', '0804 200 0002', [{ kind: 'whatsapp', value: '0555 200 002' }]);

    const { sessionId, text } = await openProfile('0804 200 0002', '10.9.1.2');
    expect(text).toContain('1 Verify contact');
    const sent = await frame(sessionId, '0804 200 0002', '1', 3, '10.9.1.2');

    expect(sent.body.state).toBe('verify.sent');
    expect(sent.body.text).toContain('A code was sent to +233 *** 02.');
    expect(captured.messages).toHaveLength(1);
    expect(captured.messages[0]!.channel).toBe('whatsapp');
    expect(captured.messages[0]!.body).toContain(`${DEFAULT_VERIFICATION_LINK_BASE}#t=`);
  });

  it('sends to the phone when the member has only a number', async () => {
    await createMember('USSD-V-PHONE', '0804 200 0003');

    const { sessionId, text } = await openProfile('0804 200 0003', '10.9.1.3');
    expect(text).toContain('1 Verify contact');
    const sent = await frame(sessionId, '0804 200 0003', '1', 3, '10.9.1.3');

    expect(sent.body.state).toBe('verify.sent');
    expect(sent.body.text).toContain('A code was sent to +233 *** 03.');
    expect(captured.messages).toHaveLength(1);
    expect(captured.messages[0]!.channel).toBe('sms');
    expect(captured.messages[0]!.body).toContain(`${DEFAULT_VERIFICATION_LINK_BASE}#t=`);
  });

  it('names the wait on a second request inside 60 seconds', async () => {
    await createMember('USSD-V-WAIT', '0804 200 0004', [
      { kind: 'email', value: 'ussd.wait@example.test' },
    ]);

    const { sessionId } = await openProfile('0804 200 0004', '10.9.1.4');
    await frame(sessionId, '0804 200 0004', '1', 3, '10.9.1.4');
    await frame(sessionId, '0804 200 0004', '9', 4, '10.9.1.4');
    const again = await frame(sessionId, '0804 200 0004', '1', 5, '10.9.1.4');

    expect(again.body.state).toBe('verify.sent');
    expect(again.body.text).toContain('Too soon');
    expect(captured.emails).toHaveLength(1);
  });

  it('hides the action when every owned contact is proven, and for an officer-confirmed member', async () => {
    const provenId = await createMember('USSD-V-PROVEN', '0804 200 0005', [
      { kind: 'email', value: 'ussd.proven@example.test' },
    ]);
    // MR-24/AC-MR46: only *every* owned contact proven hides the action; the
    // dialing phone is owned too, so both proofs are needed.
    await harness.db.query(`update member_contacts set verified_at = now() where member_id = $1`, [
      provenId,
    ]);
    const proven = await openProfile('0804 200 0005', '10.9.1.5');
    expect(proven.text).not.toContain('Verify contact');

    const confirmedId = await createMember('USSD-V-CONFIRMED', '0804 200 0006', [
      { kind: 'email', value: 'ussd.confirmed@example.test' },
    ]);
    await harness.db.query(
      `insert into member_confirmations (member_id, confirmed_by, reason)
       values ($1, 'officer', 'Known')`,
      [confirmedId],
    );
    const confirmed = await openProfile('0804 200 0006', '10.9.1.6');
    expect(confirmed.text).not.toContain('Verify contact');
  });

  it('offers the action while another owned contact is unproven and sends to it', async () => {
    // The dialing phone is proven; the email is not, so the resolver must skip
    // the phone and send to the email (MR-24, AC-MR46).
    const id = await createMember('USSD-V-MIXED', '0804 200 0007', [
      { kind: 'email', value: 'ussd.mixed@example.test' },
    ]);
    await harness.db.query(
      `update member_contacts set verified_at = now()
        where member_id = $1 and kind = 'phone'`,
      [id],
    );

    const { sessionId, text } = await openProfile('0804 200 0007', '10.9.1.8');
    expect(text).toContain('1 Verify contact');

    const sent = await frame(sessionId, '0804 200 0007', '1', 3, '10.9.1.8');
    expect(sent.body.state).toBe('verify.sent');
    expect(sent.body.text).toContain(
      'A code was sent to u***@example.test. Open the link we sent.',
    );
    expect(captured.emails).toHaveLength(1);
    expect(captured.messages).toHaveLength(0);
  });

  it('names the hour limit on a sixth request in the hour (AC-MR45)', async () => {
    await createMember('USSD-V-LIMIT', '0804 200 0008', [
      { kind: 'email', value: 'ussd.limit@example.test' },
    ]);
    const [row] = await harness.db.query<{ id: string }>(
      'select id from members where member_no = $1',
      ['USSD-V-LIMIT'],
    );
    const clearMinute = () =>
      harness.db.query('delete from auth_rate_limits where key = $1', [
        `verify:member:${row!.id}:minute`,
      ]);

    const { sessionId } = await openProfile('0804 200 0008', '10.9.1.9');
    // The USSD phone window (ten frames a minute) is the harness's, not the send
    // throttle under test, so it is reset between frames.
    const clearUssd = () =>
      harness.db.query(`delete from auth_rate_limits where key like 'ussd:%'`);
    let seq = 3;
    for (let send = 1; send <= 5; send += 1) {
      await clearMinute();
      await clearUssd();
      const sent = await frame(sessionId, '0804 200 0008', '1', seq++, '10.9.1.9');
      expect(sent.body.state).toBe('verify.sent');
      expect(sent.body.text).toContain('A code was sent to');
      await clearUssd();
      const back = await frame(sessionId, '0804 200 0008', '9', seq++, '10.9.1.9');
      expect(back.body.state).toBe('profile');
    }
    expect(captured.emails).toHaveLength(5);

    await clearMinute();
    await clearUssd();
    const sixth = await frame(sessionId, '0804 200 0008', '1', seq, '10.9.1.9');
    expect(sixth.body.state).toBe('verify.sent');
    expect(sixth.body.text).toContain('Hour limit');
    expect(captured.emails).toHaveLength(5);
  });

  it('does not offer the action to an anonymous session', async () => {
    const anonymous = await signed(
      harness.app,
      { phone: '0899 200 0099', input: '', seq: 1 },
      '10.9.1.7',
    );
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.text).not.toContain('Verify contact');
    expect(anonymous.body.text).toContain('5 Exit');
  });
});
