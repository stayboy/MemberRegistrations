import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashVisitorPhone } from '../../src/domain/contributions.js';
import {
  createDisabledUssdTestApp,
  createTestApp,
  writeHeaders,
  type TestApp,
} from '../helpers/app.js';

const USSD_SECRET = 'test-ussd-gateway-secret-16';
const USSD_PHONE_PEPPER = 'test-ussd-phone-pepper-16';
const VISITOR_PEPPER = 'test-visitor-phone-pepper-16';
const PAYMENT_SECRET = 'test-payment-gateway-secret-16';

let harness: TestApp;
let today: string;
let eventId: string;
let welfareId: string;
let buildingId: string;
let pledgeSeq = 0;
let nonceSeq = 0;

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function ddmmyyyy(iso: string): string {
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
}

function signed(
  app: TestApp['app'],
  body: Record<string, unknown>,
  options: {
    timestamp?: string;
    nonce?: string;
    signature?: string;
    ip?: string;
    secret?: string;
  } = {},
) {
  const raw = JSON.stringify(body);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = options.nonce ?? `nonce-${String(++nonceSeq).padStart(8, '0')}`;
  const signature =
    options.signature ??
    createHmac('sha256', options.secret ?? USSD_SECRET)
      .update(`${timestamp}${nonce}${raw}`)
      .digest('hex');
  return request(app)
    .post('/ussd/session')
    .set({
      'Content-Type': 'application/json',
      'X-USSD-Timestamp': timestamp,
      'X-USSD-Nonce': nonce,
      'X-USSD-Signature': signature,
      'X-Forwarded-For': options.ip ?? '10.1.0.1',
    })
    .send(raw);
}

function start(app: TestApp['app'], phone: string, ip: string, seq = 1) {
  return signed(app, { phone, input: '', seq }, { ip });
}

function frame(
  app: TestApp['app'],
  sessionId: string,
  phone: string,
  input: string,
  seq: number,
  ip: string,
) {
  return signed(app, { phone, sessionId, input, seq }, { ip });
}

async function createMember(
  memberNo: string,
  phone: string | null,
  extra: Record<string, unknown> = {},
) {
  const response = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Member',
      lastName: memberNo,
      joinedOn: '2020-01-01',
      ...(phone ? { contacts: [{ kind: 'phone', value: phone }] } : {}),
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body as {
    id: string;
    memberNo: string;
    contacts: Array<{ id: string; value: string }>;
  };
}

async function assignShepherd(memberNo: string) {
  const response = await request(harness.app)
    .post('/v1/shepherding/assignments')
    .set(writeHeaders)
    .send({ officerMemberNo: 'USSD-9001', memberNo, assignedOn: '2020-01-01' });
  expect(response.status).toBe(201);
}

async function insertEvent(name: string, date: string): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, venue_name, description, status, source, sessions
     )
     values ($1,null,$2,'UTC',$3,$3,'09:00',null,'auditorium',null,null,'scheduled','manual',$4::jsonb)
     returning id`,
    [
      `USSD-${name.replace(/\W/g, '').slice(0, 12)}-${Date.now()}`,
      name,
      date,
      JSON.stringify([{ date, startTime: '09:00', endTime: null, status: 'scheduled' }]),
    ],
  );
  return row!.id;
}

let attachSeq = 0;

async function attach(event: string, offeringId: string) {
  attachSeq += 1;
  await harness.db.query(
    `insert into event_instance_offerings (
       event_instance_id, series_id, offering_id, available_until, attached_on, attached_by
     ) values ($1,null,$2,null, now() + make_interval(secs => $3), 'test')`,
    [event, offeringId, attachSeq],
  );
}

async function createOffering(name: string, kind: string): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/offerings')
    .set(writeHeaders)
    .send({
      name,
      purpose: `${name} purpose`,
      kind,
      currency: 'GHS',
      availableUntil: '2999-12-31',
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function seedPledge(memberNo: string, amountMinor = 7000) {
  pledgeSeq += 1;
  const response = await request(harness.app)
    .post('/v1/pledges')
    .set(writeHeaders)
    .send({
      memberNo,
      offeringId: welfareId,
      eventId,
      sessionDate: today,
      amountMinor,
      expectedOn: shiftDate(today, 30),
      idempotencyKey: `seed-pledge-${pledgeSeq}`,
    });
  expect(response.status).toBe(201);
  return response.body as { id: string; amountMinor: number; currency: string };
}

async function seedPaidContribution(memberNo: string, amountMinor: number) {
  const response = await request(harness.app)
    .post('/v1/contributions')
    .set(writeHeaders)
    .send({
      memberNo,
      offeringId: welfareId,
      eventId,
      sessionDate: today,
      amountMinor,
      channel: 'manual',
      idempotencyKey: `seed-gift-${memberNo}-${amountMinor}-${Date.now()}`,
    });
  expect(response.status).toBe(201);
  return response.body;
}

async function groupForReference(reference: string) {
  const [row] = await harness.db.query<{
    id: string;
    pledge_id: string | null;
    total_minor: number | string;
    currency: string;
    status: string;
  }>(
    'select id, pledge_id, total_minor, currency, status from payment_groups where reference = $1',
    [reference],
  );
  return row!;
}

function postCallback(reference: string, amountMinor: number, currency: string) {
  const body = JSON.stringify({
    reference,
    status: 'paid',
    amountMinor,
    currency,
    occurredAt: new Date().toISOString(),
  });
  const signature = createHmac('sha256', PAYMENT_SECRET).update(body).digest('hex');
  return request(harness.app)
    .post('/v1/payments/callback')
    .set({ 'Content-Type': 'application/json', 'X-Payment-Signature': signature })
    .send(body);
}

beforeAll(async () => {
  harness = await createTestApp({
    ussd: { gatewaySecret: USSD_SECRET, phonePepper: USSD_PHONE_PEPPER },
    visitorPhonePepper: VISITOR_PEPPER,
    paymentGatewaySecret: PAYMENT_SECRET,
  });

  today = new Date().toISOString().slice(0, 10);

  const presbyter = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'USSD-9001', firstName: 'Grace', lastName: 'Okafor', isPresbyter: true });
  expect(presbyter.status).toBe(201);

  await createMember('USSD-1001', '0801 234 5678');
  await createMember('USSD-1002', '0802 000 0002');
  await createMember('USSD-1007', '0807 000 0007');
  await createMember('USSD-1008', '0808 000 0008');
  await createMember('USSD-1009', '0809 000 0009');
  await createMember('USSD-1010', '0810 000 0010');
  await createMember('USSD-1011', '0811 000 0011');
  await createMember('USSD-1012', '0812 000 0012');
  for (const memberNo of ['USSD-1001', 'USSD-1007', 'USSD-1008', 'USSD-1009', 'USSD-1010']) {
    await assignShepherd(memberNo);
  }

  const owner = await createMember('USSD-OWN', '0890 000 0001');
  await createMember('USSD-LINK', null);
  const linkedContact = owner.contacts[0]!;
  const link = await request(harness.app)
    .post('/v1/members/USSD-LINK/contacts/link')
    .set(writeHeaders)
    .send({ contactId: linkedContact.id });
  expect(link.status).toBe(201);
  const archived = await request(harness.app)
    .delete('/v1/members/USSD-OWN')
    .set(writeHeaders)
    .send();
  expect(archived.status).toBe(204);

  eventId = await insertEvent('Sunday Celebration', today);
  welfareId = await createOffering('Welfare Fund', 'freewill');
  buildingId = await createOffering('Building Fund', 'building');
  await attach(eventId, welfareId);
  await attach(eventId, buildingId);
});

afterAll(async () => {
  await harness.close();
});

describe('POST /ussd/session authentication and identity', () => {
  it('starts a member session and an anonymous session without identifying linked-only contacts', async () => {
    const member = await start(harness.app, '0801 234 5678', '10.1.1.1');
    expect(member.status).toBe(200);
    expect(member.body).toMatchObject({ done: false, state: 'main' });
    expect(member.body.text).toContain('1 Offerings');
    expect(member.body.text).toContain('2 Exit');
    expect(member.body.sessionId).toBeTruthy();
    expect(JSON.stringify(member.body)).not.toContain('8012345678');

    const [session] = await harness.db.query<{
      member_id: string | null;
      anonymous: boolean;
      phone_hash: string;
    }>('select member_id, anonymous, phone_hash from ussd_sessions where id = $1', [
      member.body.sessionId,
    ]);
    expect(session!.anonymous).toBe(false);
    expect(session!.member_id).toBeTruthy();
    expect(session!.phone_hash).toBe(
      createHmac('sha256', USSD_PHONE_PEPPER).update('8012345678').digest('hex'),
    );

    const anonymous = await start(harness.app, '0899 000 0001', '10.1.1.2');
    expect(anonymous.status).toBe(200);
    const [anonSession] = await harness.db.query<{
      member_id: string | null;
      anonymous: boolean;
    }>('select member_id, anonymous from ussd_sessions where id = $1', [anonymous.body.sessionId]);
    expect(anonSession).toEqual({ member_id: null, anonymous: true });

    const linkedOnly = await start(harness.app, '0890 000 0001', '10.1.1.3');
    expect(linkedOnly.status).toBe(200);
    const [linkedSession] = await harness.db.query<{
      member_id: string | null;
      anonymous: boolean;
    }>('select member_id, anonymous from ussd_sessions where id = $1', [linkedOnly.body.sessionId]);
    expect(linkedSession).toEqual({ member_id: null, anonymous: true });
  });

  it('rejects a bad or missing signature', async () => {
    const bad = await signed(
      harness.app,
      { phone: '0899 000 0101', input: '', seq: 1 },
      { ip: '10.1.2.1', secret: 'wrong-secret-16-characters' },
    );
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('unauthorized');

    const missing = await request(harness.app)
      .post('/ussd/session')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ phone: '0899 000 0101', input: '', seq: 1 }));
    expect(missing.status).toBe(401);
  });

  it('rejects a stale timestamp and a replayed nonce', async () => {
    const stale = await signed(
      harness.app,
      { phone: '0899 000 0102', input: '', seq: 1 },
      { ip: '10.1.3.1', timestamp: String(Math.floor(Date.now() / 1000) - 400) },
    );
    expect(stale.status).toBe(401);

    const body = { phone: '0899 000 0103', input: '', seq: 1 };
    const nonce = 'nonce-replay-0001';
    const first = await signed(harness.app, body, { ip: '10.1.3.2', nonce });
    expect(first.status).toBe(200);
    const replay = await signed(harness.app, body, { ip: '10.1.3.2', nonce });
    expect(replay.status).toBe(401);
  });

  it('returns 503 when USSD is disabled and writes nothing', async () => {
    const disabled = await createDisabledUssdTestApp(harness.db);
    const [before] = await disabled.db.query<{ count: number | string }>(
      'select count(*) as count from ussd_sessions',
    );
    const response = await start(disabled.app, '0899 000 0201', '10.1.4.1');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('ussd_disabled');
    const [after] = await disabled.db.query<{ count: number | string }>(
      'select count(*) as count from ussd_sessions',
    );
    expect(Number(after!.count)).toBe(Number(before!.count));
  });

  it('rate-limits the phone hash at 10 frames per minute and the address at 30', async () => {
    const phone = '0899 000 0301';
    const ip = '10.1.5.1';
    const first = await start(harness.app, phone, ip);
    expect(first.status).toBe(200);
    const sessionId = first.body.sessionId as string;
    let lastStatus = 0;
    for (let seq = 2; seq <= 11; seq += 1) {
      const response = await frame(harness.app, sessionId, phone, '00', seq, ip);
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);

    // Every start carries a distinct phone, so only the address counter trips.
    const addressIp = '10.1.5.2';
    let addressStatus = 0;
    for (let index = 1; index <= 31; index += 1) {
      const response = await start(
        harness.app,
        `0899 00${String(1000 + index).slice(-4)}`,
        addressIp,
      );
      addressStatus = response.status;
    }
    expect(addressStatus).toBe(429);
  });
});

describe('USSD menu navigation', () => {
  it('moves back with 9 and returns to main with 00', async () => {
    const ip = '10.2.1.1';
    const started = await start(harness.app, '0899 000 0401', ip);
    const sessionId = started.body.sessionId as string;

    const hub = await frame(harness.app, sessionId, '0899 000 0401', '1', 2, ip);
    expect(hub.body.state).toBe('offerings');
    expect(hub.body.text).toContain('1 Give');

    const back = await frame(harness.app, sessionId, '0899 000 0401', '9', 3, ip);
    expect(back.body.state).toBe('main');

    const hubAgain = await frame(harness.app, sessionId, '0899 000 0401', '1', 4, ip);
    expect(hubAgain.body.state).toBe('offerings');
    const home = await frame(harness.app, sessionId, '0899 000 0401', '00', 5, ip);
    expect(home.body.state).toBe('main');
  });

  it('keeps the state and shows Invalid for an unknown choice', async () => {
    const ip = '10.2.2.1';
    const started = await start(harness.app, '0899 000 0402', ip);
    const sessionId = started.body.sessionId as string;
    await frame(harness.app, sessionId, '0899 000 0402', '1', 2, ip);
    const invalid = await frame(harness.app, sessionId, '0899 000 0402', '5', 3, ip);
    expect(invalid.body.state).toBe('offerings');
    expect(invalid.body.text).toContain('Invalid');
  });

  it('exits with 2 at main and with 9 at main', async () => {
    const ip = '10.2.3.1';
    const started = await start(harness.app, '0899 000 0403', ip);
    const sessionId = started.body.sessionId as string;
    const exit = await frame(harness.app, sessionId, '0899 000 0403', '2', 2, ip);
    expect(exit.body.done).toBe(true);
    expect(exit.body.text).toBe('Exit');

    const other = await start(harness.app, '0899 000 0404', ip);
    const nine = await frame(harness.app, other.body.sessionId, '0899 000 0404', '9', 2, ip);
    expect(nine.body.done).toBe(true);
    expect(nine.body.text).toBe('Exit');
  });

  it('ends the session with Too many tries after five invalid inputs', async () => {
    const ip = '10.2.6.1';
    const phone = '0899 000 0406';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(harness.app, sessionId, phone, '1', 2, ip);
    let last: Awaited<ReturnType<typeof frame>> | undefined;
    for (let seq = 3; seq <= 7; seq += 1) {
      last = await frame(harness.app, sessionId, phone, '5', seq, ip);
    }
    expect(last!.body.state).toBe('error');
    expect(last!.body.done).toBe(true);
    expect(last!.body.text).toBe('Too many tries');
  });

  it('restarts an expired session with Session expired and the main menu', async () => {
    const ip = '10.2.4.1';
    const started = await start(harness.app, '0899 000 0405', ip);
    await harness.db.query(
      `update ussd_sessions set expires_at = now() - interval '1 minute' where id = $1`,
      [started.body.sessionId],
    );
    const response = await frame(harness.app, started.body.sessionId, '0899 000 0405', '1', 2, ip);
    expect(response.status).toBe(200);
    expect(response.body.state).toBe('main');
    expect(response.body.done).toBe(false);
    expect(response.body.text).toContain('Session expired');
    expect(response.body.text).toContain('1 Offerings');
  });
});

describe('USSD giving', () => {
  it('gives the whole amount to one offering, persists one group, and repeats without a second charge', async () => {
    const phone = '0812 000 0012';
    const ip = '10.3.1.1';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;

    const hub = await frame(harness.app, sessionId, phone, '1', 2, ip);
    expect(hub.body.text).toContain('2 Pledge');
    const amount = await frame(harness.app, sessionId, phone, '1', 3, ip);
    expect(amount.body.state).toBe('offerings.amount');
    const select = await frame(harness.app, sessionId, phone, '50', 4, ip);
    expect(select.body.state).toBe('offerings.select');
    expect(select.body.text).toContain('Welfare Fund');
    const confirm = await frame(harness.app, sessionId, phone, '1', 5, ip);
    expect(confirm.body.state).toBe('offerings.confirm');
    expect(confirm.body.text).toContain('You give GHS 50.00 to Welfare Fund.');
    expect(confirm.body.text).toContain('1 Accept');

    const accepted = await frame(harness.app, sessionId, phone, '1', 6, ip);
    expect(accepted.body.done).toBe(true);
    expect(accepted.body.state).toBe('offerings.done');
    expect(accepted.body.text).toContain('Pending');
    expect(accepted.body.text).toMatch(/Ref MR-[A-Z2-7]{10}/);
    expect(accepted.body.text).not.toContain('8012345678');
    const reference = /Ref (MR-[A-Z2-7]{10})/.exec(accepted.body.text)![1]!;

    const group = await groupForReference(reference);
    expect(group).toMatchObject({ status: 'pending', pledge_id: null, total_minor: 5000 });

    const contributions = await harness.db.query<{
      id: string;
      member_id: string | null;
      amount_minor: number | string;
      status: string;
      channel: string;
      idempotency_key: string;
    }>(
      'select id, member_id, amount_minor, status, channel, idempotency_key from contributions where payment_group_id = $1',
      [group.id],
    );
    expect(contributions).toHaveLength(1);
    expect(contributions[0]).toMatchObject({
      amount_minor: 5000,
      status: 'initiated',
      channel: 'ussd',
    });
    const [intent] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from payment_intents where payment_group_id = $1',
      [group.id],
    );
    expect(Number(intent!.count)).toBe(1);

    const repeat = await frame(harness.app, sessionId, phone, '1', 6, ip);
    expect(repeat.body.text).toBe(accepted.body.text);
    const [groups] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from payment_groups where reference = $1`,
      [reference],
    );
    expect(Number(groups!.count)).toBe(1);

    const [session] = await harness.db.query<{ raw: string }>(
      `select row_to_json(ussd_sessions)::text as raw from ussd_sessions where id = $1`,
      [sessionId],
    );
    expect(session!.raw).not.toContain('8012345678');
  });

  it('splits a multi-offering gift in selection order and renders the lay sentence', async () => {
    const phone = '0807 000 0007';
    const ip = '10.3.2.1';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;

    await frame(harness.app, sessionId, phone, '1', 2, ip);
    await frame(harness.app, sessionId, phone, '1', 3, ip);
    await frame(harness.app, sessionId, phone, '50', 4, ip);
    const select = await frame(harness.app, sessionId, phone, '1,2', 5, ip);
    expect(select.body.state).toBe('offerings.split');
    expect(select.body.text).toContain('Total GHS 50.00');

    const wrong = await frame(harness.app, sessionId, phone, '20', 6, ip);
    expect(wrong.body.state).toBe('offerings.split');
    expect(wrong.body.text).toContain('Bad amount');

    const split = await frame(harness.app, sessionId, phone, '20,30', 7, ip);
    expect(split.body.state).toBe('offerings.confirm');
    expect(split.body.text).toContain(
      'You split GHS 20.00 to Welfare Fund, GHS 30.00 to Building Fund. Total GHS 50.00.',
    );

    const accepted = await frame(harness.app, sessionId, phone, '1', 8, ip);
    expect(accepted.body.done).toBe(true);
    const reference = /Ref (MR-[A-Z2-7]{10})/.exec(accepted.body.text)![1]!;
    const group = await groupForReference(reference);
    expect(Number(group.total_minor)).toBe(5000);

    const contributions = await harness.db.query<{
      amount_minor: number | string;
      idempotency_key: string;
    }>(
      'select amount_minor, idempotency_key from contributions where payment_group_id = $1 order by idempotency_key',
      [group.id],
    );
    expect(contributions.map((row) => Number(row.amount_minor))).toEqual([2000, 3000]);
    expect(contributions[0]!.idempotency_key).toMatch(/:1$/);
    expect(contributions[1]!.idempotency_key).toMatch(/:2$/);
    const [intent] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from payment_intents where payment_group_id = $1',
      [group.id],
    );
    expect(Number(intent!.count)).toBe(1);
  });

  it('asks an anonymous giver for a name and stores the visitor hash under VISITOR_PHONE_PEPPER', async () => {
    const phone = '0899 000 0601';
    const ip = '10.3.3.1';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;

    const hub = await frame(harness.app, sessionId, phone, '1', 2, ip);
    expect(hub.body.text).not.toContain('2 Pledge');
    const name = await frame(harness.app, sessionId, phone, '1', 3, ip);
    expect(name.body.state).toBe('offerings.name');
    expect(name.body.text).toContain('Name');
    const amount = await frame(harness.app, sessionId, phone, 'Visitor One', 4, ip);
    expect(amount.body.state).toBe('offerings.amount');
    const select = await frame(harness.app, sessionId, phone, '30', 5, ip);
    expect(select.body.state).toBe('offerings.select');
    const confirm = await frame(harness.app, sessionId, phone, '1', 6, ip);
    expect(confirm.body.text).toContain('You give GHS 30.00');
    const accepted = await frame(harness.app, sessionId, phone, '1', 7, ip);
    expect(accepted.body.done).toBe(true);
    const reference = /Ref (MR-[A-Z2-7]{10})/.exec(accepted.body.text)![1]!;
    const group = await groupForReference(reference);

    const [contribution] = await harness.db.query<{
      member_id: string | null;
      visitor_name: string | null;
      visitor_phone_hash: string;
      raw: string;
    }>(
      `select member_id, visitor_name, visitor_phone_hash, row_to_json(contributions)::text as raw
         from contributions where payment_group_id = $1`,
      [group.id],
    );
    expect(contribution!.member_id).toBeNull();
    expect(contribution!.visitor_name).toBe('Visitor One');
    expect(contribution!.visitor_phone_hash).toBe(hashVisitorPhone(phone, VISITOR_PEPPER));
    expect(contribution!.raw).not.toContain('8990000601');
    expect(JSON.stringify(accepted.body)).not.toContain('8990000601');
  });
});

describe('USSD pledges', () => {
  it('creates a pledge with one offering, an expected date and the USSD key as reference', async () => {
    const phone = '0808 000 0008';
    const ip = '10.4.1.1';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;
    const expected = shiftDate(today, 30);

    await frame(harness.app, sessionId, phone, '1', 2, ip);
    await frame(harness.app, sessionId, phone, '2', 3, ip);
    await frame(harness.app, sessionId, phone, '70', 4, ip);
    const select = await frame(harness.app, sessionId, phone, '1', 5, ip);
    expect(select.body.state).toBe('offerings.pledge_date');
    expect(select.body.text).toContain('Date (DDMMYYYY)');
    const confirm = await frame(harness.app, sessionId, phone, ddmmyyyy(expected), 6, ip);
    expect(confirm.body.state).toBe('offerings.pledge_confirm');
    expect(confirm.body.text).toContain('GHS 70.00');
    expect(confirm.body.text).toContain('Due date');
    const accepted = await frame(harness.app, sessionId, phone, '1', 7, ip);
    expect(accepted.body.done).toBe(true);
    expect(accepted.body.text).toMatch(/Ref USSD-[A-F0-9]{10}/);
    const key = /Ref (USSD-[A-F0-9]{10})/.exec(accepted.body.text)![1]!;

    const [pledge] = await harness.db.query<{
      member_id: string;
      status: string;
      expected_on: string;
      amount_minor: number | string;
      idempotency_key: string;
      created_by: string;
      officer_member_no: string;
    }>(
      `select p.member_id, p.status, p.expected_on, p.amount_minor, p.idempotency_key,
              p.created_by, o.member_no as officer_member_no
         from pledges p join members o on o.id = p.officer_member_id
        where p.idempotency_key = $1`,
      [key],
    );
    expect(pledge).toMatchObject({
      status: 'pending',
      amount_minor: 7000,
      idempotency_key: key,
      created_by: 'ussd',
      officer_member_no: 'USSD-9001',
    });
    expect(new Date(pledge!.expected_on).toISOString().slice(0, 10)).toBe(expected);
  });

  it('re-prompts for exactly one offering and refuses a past date', async () => {
    const phone = '0809 000 0009';
    const ip = '10.4.2.1';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;

    await frame(harness.app, sessionId, phone, '1', 2, ip);
    await frame(harness.app, sessionId, phone, '2', 3, ip);
    await frame(harness.app, sessionId, phone, '70', 4, ip);
    const multiple = await frame(harness.app, sessionId, phone, '1,2', 5, ip);
    expect(multiple.body.state).toBe('offerings.select');
    expect(multiple.body.text).toContain('One only');
    const select = await frame(harness.app, sessionId, phone, '1', 6, ip);
    expect(select.body.state).toBe('offerings.pledge_date');

    const past = await frame(harness.app, sessionId, phone, ddmmyyyy(shiftDate(today, -1)), 7, ip);
    expect(past.body.state).toBe('offerings.pledge_date');
    expect(past.body.text).toContain('Bad date');
  });

  it('shows officer_required and writes no pledge when the member has no shepherd', async () => {
    const phone = '0802 000 0002';
    const ip = '10.4.3.1';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;

    await frame(harness.app, sessionId, phone, '1', 2, ip);
    await frame(harness.app, sessionId, phone, '2', 3, ip);
    await frame(harness.app, sessionId, phone, '70', 4, ip);
    await frame(harness.app, sessionId, phone, '1', 5, ip);
    const confirm = await frame(
      harness.app,
      sessionId,
      phone,
      ddmmyyyy(shiftDate(today, 30)),
      6,
      ip,
    );
    expect(confirm.body.state).toBe('offerings.pledge_confirm');
    const accepted = await frame(harness.app, sessionId, phone, '1', 7, ip);
    expect(accepted.body.state).toBe('offerings.pledge_confirm');
    expect(accepted.body.text).toContain('No officer');

    const [count] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from pledges p
         join members m on m.id = p.member_id
        where m.member_no = 'USSD-1002'`,
    );
    expect(Number(count!.count)).toBe(0);
  });

  it('lists pending pledges, redeems one as a pledge-carrying group, and the callback honors it', async () => {
    const phone = '0810 000 0010';
    const ip = '10.4.4.1';
    const pledge = await seedPledge('USSD-1010', 7000);
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;

    await frame(harness.app, sessionId, phone, '1', 2, ip);
    const list = await frame(harness.app, sessionId, phone, '3', 3, ip);
    expect(list.body.state).toBe('pledges.list');
    expect(list.body.text).toContain('Welfare Fund');
    expect(list.body.text).toContain('GHS 70.00');
    const one = await frame(harness.app, sessionId, phone, '1', 4, ip);
    expect(one.body.state).toBe('pledges.confirm');
    expect(one.body.text).toContain('1 Pay');
    const paid = await frame(harness.app, sessionId, phone, '1', 5, ip);
    expect(paid.body.done).toBe(true);
    const reference = /Ref (MR-[A-Z2-7]{10})/.exec(paid.body.text)![1]!;
    const group = await groupForReference(reference);
    expect(group.pledge_id).toBe(pledge.id);
    expect(Number(group.total_minor)).toBe(7000);

    const [contributions] = await harness.db.query<{ id: string; amount_minor: number | string }>(
      'select id, amount_minor from contributions where payment_group_id = $1',
      [group.id],
    );
    expect(Number(contributions!.amount_minor)).toBe(7000);

    const callback = await postCallback(reference, 7000, 'GHS');
    expect(callback.status).toBe(200);
    expect(callback.body).toEqual({ status: 'paid', duplicate: false });

    const [row] = await harness.db.query<{
      status: string;
      settled_contribution_id: string;
    }>('select status, settled_contribution_id from pledges where id = $1', [pledge.id]);
    expect(row!.status).toBe('honored');
    expect(row!.settled_contribution_id).toBe(contributions!.id);

    const repeat = await postCallback(reference, 7000, 'GHS');
    expect(repeat.body).toEqual({ status: 'paid', duplicate: true });
  });

  it('reports no_pledges for a member with no pending pledges', async () => {
    const phone = '0811 000 0011';
    const ip = '10.4.5.1';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(harness.app, sessionId, phone, '1', 2, ip);
    const response = await frame(harness.app, sessionId, phone, '3', 3, ip);
    expect(response.body.state).toBe('error');
    expect(response.body.text).toContain('No pledges');
  });
});

describe('USSD my payments', () => {
  it('shows week, quarter and year totals and the top events', async () => {
    await seedPaidContribution('USSD-1011', 5000);
    const phone = '0811 000 0011';
    const ip = '10.5.1.1';
    const started = await start(harness.app, phone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(harness.app, sessionId, phone, '1', 2, ip);
    const summary = await frame(harness.app, sessionId, phone, '4', 3, ip);
    expect(summary.body.state).toBe('payments.summary');
    expect(summary.body.text).toContain('Week GHS 50.00');
    expect(summary.body.text).toContain('Quarter');
    expect(summary.body.text).toContain('Year');
    expect(summary.body.text).toContain('Sunday Celebration');
  });
});
