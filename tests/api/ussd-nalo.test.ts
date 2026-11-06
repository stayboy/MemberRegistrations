import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const NALO_USER_ID = 'NALOTest';

let harness: TestApp;
let today: string;
let eventIds: string[] = [];
let nonceSeq = 0;
let sessionSeq = 0;
let eventSeq = 0;

function countRows(text: string): number {
  return text.split('\n').filter((line) => /^[1-7] \S/.test(line)).length;
}

async function createMember(memberNo: string, phone: string) {
  const response = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Member',
      lastName: memberNo,
      joinedOn: '2020-01-01',
      contacts: [{ kind: 'phone', value: phone }],
    });
  expect(response.status).toBe(201);
}

async function insertEvent(name: string, date: string): Promise<string> {
  eventSeq += 1;
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, venue_name, description, status, source, sessions
     )
     values ($1,null,$2,'UTC',$3,$3,'09:00',null,'auditorium',null,null,'scheduled','manual',$4::jsonb)
     returning id`,
    [
      `NALO-${name.replace(/\W/g, '').slice(0, 12)}-${Date.now()}-${eventSeq}`,
      name,
      date,
      JSON.stringify([{ date, startTime: '09:00', endTime: null, status: 'scheduled' }]),
    ],
  );
  return row!.id;
}

let attachSeq = 0;

async function attach(eventId: string, offeringId: string) {
  attachSeq += 1;
  await harness.db.query(
    `insert into event_instance_offerings (
       event_instance_id, series_id, offering_id, available_until, attached_on, attached_by
     ) values ($1,null,$2,null, now() + make_interval(secs => $3), 'test')`,
    [eventId, offeringId, attachSeq],
  );
}

async function createOffering(name: string): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/offerings')
    .set(writeHeaders)
    .send({
      name,
      purpose: `${name} purpose`,
      kind: 'freewill',
      currency: 'GHS',
      availableUntil: '2999-12-31',
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

function hmacFrame(
  app: TestApp['app'],
  body: Record<string, unknown>,
  ip = '10.20.0.1',
  secret = USSD_SECRET,
) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  nonceSeq += 1;
  const nonce = `nalo-nonce-${String(nonceSeq).padStart(6, '0')}`;
  const signature = createHmac('sha256', secret).update(`${timestamp}${nonce}${raw}`).digest('hex');
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

function naloFrame(
  app: TestApp['app'],
  input: {
    phone: string;
    input?: string;
    sessionId?: string;
    userId?: string;
    ip?: string;
    userData?: string;
  },
) {
  sessionSeq += 1;
  const sessionId = input.sessionId ?? `nalo-session-${sessionSeq}-${Date.now()}`;
  return request(app)
    .post('/ussd/nalo')
    .set('X-Forwarded-For', input.ip ?? '10.20.1.1')
    .send({
      USERID: input.userId ?? NALO_USER_ID,
      MSISDN: input.phone,
      USERDATA: input.userData ?? input.input ?? '',
      MSGTYPE: input.sessionId === undefined,
      NETWORK: 'test',
      SESSIONID: sessionId,
    });
}

async function sessionRow(provider: string, externalId: string) {
  const [row] = await harness.db.query<{
    id: string;
    provider: string;
    external_id: string;
    state: string;
  }>(
    'select id, provider, external_id, state from ussd_sessions where provider = $1 and external_id = $2',
    [provider, externalId],
  );
  return row ?? null;
}

beforeAll(async () => {
  harness = await createTestApp({
    ussd: {
      gatewaySecret: USSD_SECRET,
      phonePepper: USSD_PHONE_PEPPER,
      naloUserId: NALO_USER_ID,
    },
    visitorPhonePepper: VISITOR_PEPPER,
    paymentGatewaySecret: PAYMENT_SECRET,
  });
  today = new Date().toISOString().slice(0, 10);

  await createMember('NALO-1001', '0801 555 0011');
  await createMember('NALO-1002', '0801 555 0012');
  await createMember('NALO-1003', '0801 555 0013');
  await createMember('NALO-1004', '0801 555 0014');
  await createMember('NALO-1005', '0801 555 0015');
  await createMember('NALO-1006', '0801 555 0016');
  await createMember('NALO-1007', '0801 555 0017');
  await createMember('NALO-1008', '0801 555 0018');
  await createMember('NALO-1009', '0801 555 0019');

  const offerings: string[] = [];
  for (let index = 1; index <= 6; index += 1) {
    offerings.push(await createOffering(`Nalo Offering ${index}`));
  }
  eventIds = [
    await insertEvent('Nalo Activity A', today),
    await insertEvent('Nalo Activity B', today),
    await insertEvent('Nalo Activity C', today),
    await insertEvent('Nalo Activity D', today),
  ];
  for (const eventId of eventIds) {
    for (const offeringId of offerings) await attach(eventId, offeringId);
  }
});

afterAll(async () => {
  await harness.close();
});

describe('POST /ussd/nalo authentication and identity', () => {
  it('accepts the configured USERID and starts a session stored under its SESSIONID', async () => {
    const sessionId = `nalo-session-auth-${Date.now()}`;
    const response = await naloFrame(harness.app, {
      phone: '0801 555 0011',
      sessionId,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      USERID: NALO_USER_ID,
      MSISDN: '0801 555 0011',
      MSGTYPE: true,
    });
    expect(response.body.MSG).toContain('1 Offerings');
    expect(response.body).not.toHaveProperty('SESSIONID');

    const row = await sessionRow('nalo', sessionId);
    expect(row).toMatchObject({ provider: 'nalo', external_id: sessionId, state: 'main' });
    expect(JSON.stringify(response.body)).not.toContain('8015550001');
  });

  it('rejects a wrong or absent USERID with 401 and writes no session', async () => {
    const [before] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from ussd_sessions',
    );

    const wrong = await naloFrame(harness.app, {
      phone: '0801 555 0012',
      userId: 'NotTheClient',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('unauthorized');

    const absent = await request(harness.app).post('/ussd/nalo').send({
      MSISDN: '0801 555 0012',
      USERDATA: '',
      MSGTYPE: true,
      SESSIONID: 'nalo-session-absent',
    });
    expect(absent.status).toBe(401);
    expect(absent.body.code).toBe('unauthorized');

    const [after] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from ussd_sessions',
    );
    expect(Number(after!.count)).toBe(Number(before!.count));
    expect(await sessionRow('nalo', 'nalo-session-absent')).toBeNull();
  });

  it('round-trips SESSIONID through external_id and resolves the continuation', async () => {
    const sessionId = `nalo-session-route-${Date.now()}`;
    const first = await naloFrame(harness.app, {
      phone: '0801 555 0013',
      sessionId,
    });
    expect(first.status).toBe(200);

    const stored = await sessionRow('nalo', sessionId);
    expect(stored).not.toBeNull();

    const hub = await naloFrame(harness.app, {
      phone: '0801 555 0013',
      input: '1',
      sessionId,
    });
    expect(hub.status).toBe(200);
    expect(hub.body.MSG).toContain('1 Give');

    const [after] = await harness.db.query<{ id: string; state: string }>(
      'select id, state from ussd_sessions where provider = $1 and external_id = $2',
      ['nalo', sessionId],
    );
    expect(after!.id).toBe(stored!.id);
    expect(after!.state).toBe('offerings');
  });

  it('answers 422 for USERDATA longer than 64 characters and writes nothing', async () => {
    const [before] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from ussd_sessions',
    );
    const response = await naloFrame(harness.app, {
      phone: '0801 555 0014',
      sessionId: `nalo-session-long-${Date.now()}`,
      userData: '1'.repeat(65),
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    const [after] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from ussd_sessions',
    );
    expect(Number(after!.count)).toBe(Number(before!.count));
  });
});

describe('POST /ussd/nalo re-delivery', () => {
  it('advances once and does not double-apply a re-delivered confirmation', async () => {
    const phone = '0801 555 0015';
    const sessionId = `nalo-session-pay-${Date.now()}`;
    let frame = await naloFrame(harness.app, { phone, sessionId });
    expect(frame.status).toBe(200);

    // Main -> Offerings hub -> amount.
    frame = await naloFrame(harness.app, { phone, sessionId, input: '1' });
    expect(frame.status).toBe(200);
    expect(frame.body.MSG).toContain('1 Give');
    frame = await naloFrame(harness.app, { phone, sessionId, input: '1' });
    expect(frame.status).toBe(200);
    expect(frame.body.MSG).toContain('Amount');

    // Amount -> offering list (Nalo declares three rows) -> confirm.
    frame = await naloFrame(harness.app, { phone, sessionId, input: '5000' });
    expect(frame.status).toBe(200);
    expect(frame.body.MSG).toContain('1 Nalo Offering 1');
    frame = await naloFrame(harness.app, { phone, sessionId, input: '1' });
    expect(frame.status).toBe(200);
    expect(frame.body.MSG).toContain('1 Accept');

    const [before] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from payment_groups',
    );

    const accepted = await naloFrame(harness.app, { phone, sessionId, input: '1' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.MSGTYPE).toBe(false);
    expect(accepted.body.MSG).toMatch(/Ref MR-[A-Z2-7]{10}/);

    // The gateway re-delivers the same Accept frame: one session advance, one group.
    const redelivered = await naloFrame(harness.app, { phone, sessionId, input: '1' });
    expect(redelivered.status).toBe(200);
    expect(redelivered.body.MSGTYPE).toBe(false);
    expect(redelivered.body.MSG).toBe(accepted.body.MSG);

    const [after] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from payment_groups',
    );
    expect(Number(after!.count)).toBe(Number(before!.count) + 1);

    const stored = await sessionRow('nalo', sessionId);
    expect(stored!.state).toBe('offerings.done');
  });
});

describe('adapter page sizes', () => {
  it('renders two Nalo activities rows and three Nalo offering rows', async () => {
    const phone = '0801 555 0016';
    const activitiesSession = `nalo-session-act-${Date.now()}`;
    await naloFrame(harness.app, { phone, sessionId: activitiesSession });
    const activities = await naloFrame(harness.app, {
      phone,
      sessionId: activitiesSession,
      input: '2',
    });
    expect(activities.status).toBe(200);
    expect(countRows(activities.body.MSG)).toBe(2);
    expect(activities.body.MSG).toContain('0 More');
    // The declared two-row page fits the 120 cap, so no action is cut off.
    expect(activities.body.MSG.length).toBeLessThanOrEqual(120);

    const offeringsSession = `nalo-session-off-${Date.now()}`;
    await naloFrame(harness.app, { phone, sessionId: offeringsSession });
    await naloFrame(harness.app, { phone, sessionId: offeringsSession, input: '1' });
    await naloFrame(harness.app, { phone, sessionId: offeringsSession, input: '1' });
    const offerings = await naloFrame(harness.app, {
      phone,
      sessionId: offeringsSession,
      input: '5000',
    });
    expect(offerings.status).toBe(200);
    expect(countRows(offerings.body.MSG)).toBe(3);
    expect(offerings.body.MSG).toContain('0 More');
    expect(offerings.body.MSG.length).toBeLessThanOrEqual(120);
  });

  it('renders three HMAC activities rows and five HMAC offering rows', async () => {
    const phone = '0801 555 0017';
    const ip = '10.20.2.1';
    const started = await hmacFrame(harness.app, { phone, input: '', seq: 1 }, ip);
    expect(started.status).toBe(200);
    const sessionId = started.body.sessionId as string;

    const activities = await hmacFrame(harness.app, { phone, sessionId, input: '2', seq: 2 }, ip);
    expect(activities.status).toBe(200);
    expect(countRows(activities.body.text)).toBe(3);
    expect(activities.body.text).toContain('0 More');

    const startAgain = await hmacFrame(harness.app, { phone, input: '', seq: 1 }, '10.20.2.2');
    const secondSession = startAgain.body.sessionId as string;
    await hmacFrame(
      harness.app,
      { phone, sessionId: secondSession, input: '1', seq: 2 },
      '10.20.2.2',
    );
    await hmacFrame(
      harness.app,
      { phone, sessionId: secondSession, input: '1', seq: 3 },
      '10.20.2.2',
    );
    const offerings = await hmacFrame(
      harness.app,
      { phone, sessionId: secondSession, input: '5000', seq: 4 },
      '10.20.2.2',
    );
    expect(offerings.status).toBe(200);
    expect(countRows(offerings.body.text)).toBe(5);
    expect(offerings.body.text).toContain('0 More');
  });
});

describe('POST /dev/ussd/session', () => {
  it('drives the HMAC adapter server-side', async () => {
    const started = await request(harness.app).post('/dev/ussd/session').send({
      provider: 'hmac',
      phone: '0801 555 0018',
      input: '',
    });
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ provider: 'hmac', done: false, state: 'main' });
    expect(started.body.text).toContain('1 Offerings');
    expect(started.body.wire.sessionId).toBe(started.body.sessionId);
    expect(JSON.stringify(started.body)).not.toContain(USSD_SECRET);

    const next = await request(harness.app).post('/dev/ussd/session').send({
      provider: 'hmac',
      phone: '0801 555 0018',
      sessionId: started.body.sessionId,
      input: '2',
    });
    expect(next.status).toBe(200);
    expect(next.body.state).toBe('activities');
    expect(JSON.stringify(next.body)).not.toContain(USSD_SECRET);
  });

  it('drives the Nalo adapter server-side and returns the external session id', async () => {
    const started = await request(harness.app).post('/dev/ussd/session').send({
      provider: 'nalo',
      phone: '0801 555 0019',
      input: '',
    });
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ provider: 'nalo', done: false, state: 'main' });
    expect(started.body.sessionId).toMatch(/^devnalo-/);
    expect(started.body.wire).toMatchObject({ USERID: NALO_USER_ID, MSGTYPE: true });
    expect(started.body.wire).not.toHaveProperty('SESSIONID');
    expect(started.body.text).toBe(started.body.wire.MSG);
    expect(JSON.stringify(started.body)).not.toContain(USSD_SECRET);

    const stored = await sessionRow('nalo', started.body.sessionId);
    expect(stored).not.toBeNull();

    const next = await request(harness.app).post('/dev/ussd/session').send({
      provider: 'nalo',
      phone: '0801 555 0019',
      sessionId: started.body.sessionId,
      input: '1',
    });
    expect(next.status).toBe(200);
    expect(next.body.state).toBe('offerings');
    expect(next.body.wire.MSGTYPE).toBe(true);
  });

  it('refuses with 404 not_found in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await request(harness.app).post('/dev/ussd/session').send({
        provider: 'hmac',
        phone: '0801 555 0018',
        input: '',
      });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('not_found');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('answers ussd_disabled when the switch is off', async () => {
    const disabled = await createDisabledUssdTestApp(harness.db);
    const response = await request(disabled.app).post('/dev/ussd/session').send({
      provider: 'nalo',
      phone: '0801 555 0019',
      input: '',
    });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('ussd_disabled');
  });
});
