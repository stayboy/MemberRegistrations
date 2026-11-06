import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, writeHeaders, type TestApp } from '../helpers/app.js';

const USSD_SECRET = 'test-ussd-gateway-secret-16';
const USSD_PHONE_PEPPER = 'test-ussd-phone-pepper-16';

let harness: TestApp;
let app: TestApp['app'];
let nonceSeq = 0;

const products: Record<string, string> = {};

function signed(body: Record<string, unknown>, ip: string) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  nonceSeq += 1;
  const nonce = `welfare-nonce-${String(nonceSeq).padStart(8, '0')}`;
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

async function start(phone: string, ip: string) {
  const response = await signed({ phone, input: '', seq: 1 }, ip);
  expect(response.status).toBe(200);
  return response.body as { sessionId: string; text: string; state: string };
}

async function frame(sessionId: string, phone: string, input: string, seq: number, ip: string) {
  const response = await signed({ phone, sessionId, input, seq }, ip);
  expect(response.status).toBe(200);
  return response.body as {
    text: string;
    state: string;
    done: boolean;
    options: Array<{ key: string; label: string }>;
  };
}

async function createMember(memberNo: string, phone: string, extra: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: memberNo,
      lastName: 'Member',
      joinedOn: '2020-01-01',
      gender: 'male',
      dob: '1990-01-01',
      contacts: [{ kind: 'phone', value: phone }],
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body as { id: string; memberNo: string };
}

async function createProduct(extra: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/v1/subscription-products')
    .set(writeHeaders)
    .send({
      code: `W-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      name: 'Welfare Cover',
      premiumMinor: 3000,
      currency: 'GHS',
      paymentMode: 'member',
      periodMonths: 12,
      covers: 'individual',
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body as { code: string; id: string; name: string };
}

async function relate(memberNo: string, relatedMemberNo: string, type: string) {
  await request(app)
    .post(`/v1/members/${memberNo}/relationships`)
    .set(writeHeaders)
    .send({ relatedMemberNo, type })
    .expect(201);
}

async function subscribeViaApi(memberNo: string, productCode: string, extra = {}) {
  const response = await request(app)
    .post(`/v1/members/${memberNo}/subscriptions`)
    .set(writeHeaders)
    .send({ productCode, ...extra });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

beforeAll(async () => {
  harness = await createTestApp({
    ussd: { gatewaySecret: USSD_SECRET, phonePepper: USSD_PHONE_PEPPER },
  });
  app = harness.app;

  const definitions: Array<[string, Record<string, unknown>]> = [
    ['A-LIFE', { name: 'Life Cover A' }],
    [
      'B-FAMILY',
      {
        name: 'Family Cover',
        premiumMinor: 5000,
        periodMonths: 3,
        covers: 'household',
        maxDependents: 2,
        allowedRelationships: ['spouse', 'child'],
      },
    ],
    ['C-CHURCH', { name: 'Church Cover', paymentMode: 'church' }],
    ['D-EITHER', { name: 'Either Cover', paymentMode: 'either', periodMonths: 1 }],
    ['E-FEMALE', { name: 'Ladies Cover', gender: 'female' }],
    ['F-EXTRA', { name: 'Extra One', periodMonths: 2 }],
    ['G-EXTRA', { name: 'Extra Two', periodMonths: 6 }],
    [
      'H-CHURCH',
      {
        name: 'Church Family',
        paymentMode: 'church',
        covers: 'household',
        maxDependents: 2,
        allowedRelationships: ['spouse', 'child'],
      },
    ],
  ];
  for (const [code, extra] of definitions) {
    const product = await createProduct({ code, ...extra });
    products[code] = product.id;
  }
});

afterAll(async () => {
  await harness.close();
});

describe('USSD Welfare & Services', () => {
  it('shows Welfare only on the member menu', async () => {
    const anonymous = await start('0899 000 1001', '10.3.0.1');
    expect(anonymous.state).toBe('main');
    expect(anonymous.text).not.toContain('Welfare');

    await createMember('W-MENU', '0801 110 0008');
    const member = await start('0801 110 0008', '10.3.0.2');
    expect(member.text).toContain('4 Welfare');
    expect(member.text).toContain('5 Profile');
    expect(member.text).toContain('6 Exit');
  });

  it('lists only eligible member-payable products, pages with 0 More and opens My services', async () => {
    await createMember('W-LIST', '0801 110 0001');
    const session = await start('0801 110 0001', '10.3.0.3');
    let seq = 2;
    const list = await frame(session.sessionId, '0801 110 0001', '4', seq++, '10.3.0.3');

    expect(list.state).toBe('welfare.list');
    expect(list.text).toContain('Welfare');
    expect(list.text).toContain('1 Life Cover A');
    expect(list.text).toContain('2 Family Cover');
    expect(list.text).toContain('3 Extra One');
    expect(list.text).toContain('0 More');
    expect(list.text).toContain('8 My plans');
    expect(list.text).toContain('9 Back');
    expect(list.text).toContain('00 Main');
    expect(list.text).not.toContain('Church Cover');
    expect(list.text).not.toContain('Either Cover');
    expect(list.text).not.toContain('Ladies Cover');

    const more = await frame(session.sessionId, '0801 110 0001', '0', seq++, '10.3.0.3');
    expect(more.state).toBe('welfare.list');
    expect(more.text).toContain('1 Extra Two');
    expect(more.text).not.toContain('0 More');

    const services = await frame(session.sessionId, '0801 110 0001', '8', seq++, '10.3.0.3');
    expect(services.state).toBe('welfare.services');
    expect(services.text).toContain('My plans');

    const back = await frame(session.sessionId, '0801 110 0001', '9', seq, '10.3.0.3');
    expect(back.state).toBe('welfare.list');
  });

  it('subscribes to an individual product and confirms the payer', async () => {
    await createMember('W-IND', '0801 110 0002');
    const session = await start('0801 110 0002', '10.3.0.4');
    let seq = 2;
    await frame(session.sessionId, '0801 110 0002', '4', seq++, '10.3.0.4');
    const detail = await frame(session.sessionId, '0801 110 0002', '1', seq++, '10.3.0.4');
    expect(detail.state).toBe('welfare.product');
    expect(detail.text).toContain('Life Cover A');
    expect(detail.text).toContain('Premium GHS 30.00');
    expect(detail.text).toContain('Cover Individual');
    expect(detail.text).toContain('1 Join');
    expect(detail.text).toContain('9 Back');

    const confirm = await frame(session.sessionId, '0801 110 0002', '1', seq++, '10.3.0.4');
    expect(confirm.state).toBe('welfare.confirm');
    expect(confirm.text).toContain('GHS 30.00');
    expect(confirm.text).toContain('1 Accept');

    const done = await frame(session.sessionId, '0801 110 0002', '1', seq, '10.3.0.4');
    expect(done.done).toBe(true);
    expect(done.state).toBe('welfare.done');
    expect(done.text).toContain('Ref ');
    expect(done.text).toContain('You pay');
    expect(done.text).not.toContain('Church');

    const read = await request(app).get('/v1/members/W-IND/subscriptions').set(writeHeaders);
    expect(read.body.items[0]).toMatchObject({
      source: 'owned',
      productCode: 'A-LIFE',
      paidBy: 'member',
      status: 'active',
    });
    const payments = await request(app)
      .get(`/v1/subscriptions/${read.body.items[0].id}/payments`)
      .set(writeHeaders);
    expect(payments.body.items).toHaveLength(1);
    expect(payments.body.items[0].channel).toBe('ussd');
  });

  it('asks a household product for dependents, lists them in order and writes coverage', async () => {
    await createMember('W-HH', '0801 110 0003');
    const spouse = await createMember('W-HH-SPOUSE', '0801 110 0013', {
      firstName: 'Grace',
      gender: 'female',
    });
    const child = await createMember('W-HH-CHILD', '0801 110 0014', {
      firstName: 'Kofi',
      gender: 'male',
    });
    await relate('W-HH', spouse.memberNo, 'spouse');
    await relate('W-HH', child.memberNo, 'child');

    const session = await start('0801 110 0003', '10.3.0.5');
    let seq = 2;
    await frame(session.sessionId, '0801 110 0003', '4', seq++, '10.3.0.5');
    const family = await frame(session.sessionId, '0801 110 0003', '2', seq++, '10.3.0.5');
    expect(family.state).toBe('welfare.product');
    expect(family.text).toContain('Family Cover');
    expect(family.text).toContain('Cover Household');

    const ask = await frame(session.sessionId, '0801 110 0003', '1', seq++, '10.3.0.5');
    expect(ask.state).toBe('welfare.dependents');
    expect(ask.text).toContain('Dependents?');
    expect(ask.text).toContain('1 Yes');
    expect(ask.text).toContain('2 No');

    const list = await frame(session.sessionId, '0801 110 0003', '1', seq++, '10.3.0.5');
    expect(list.state).toBe('welfare.dependents');
    expect(list.text).toContain('Grace');
    expect(list.text).toContain('Kofi');

    const confirm = await frame(session.sessionId, '0801 110 0003', '1,2', seq++, '10.3.0.5');
    expect(confirm.state).toBe('welfare.confirm');
    expect(confirm.text).toContain('Cover Household (2)');

    const done = await frame(session.sessionId, '0801 110 0003', '1', seq, '10.3.0.5');
    expect(done.state).toBe('welfare.done');
    expect(done.done).toBe(true);

    const read = await request(app).get('/v1/members/W-HH/subscriptions').set(writeHeaders);
    expect(read.body.items[0].coveredMemberNos).toEqual(['W-HH-CHILD', 'W-HH-SPOUSE']);
    const coverage = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from subscription_coverage where subscription_id = $1 and removed_on is null',
      [read.body.items[0].id],
    );
    expect(Number(coverage[0]!.count)).toBe(2);
  });

  it('applies the policyholder-to-covered direction to the dependent list', async () => {
    await createMember('W-DIR', '0801 110 0015');
    await createMember('W-DIR-HC', '0801 110 0016', { firstName: 'HolderChild' });
    await createMember('W-DIR-CC', '0801 110 0017', { firstName: 'CoveredChild' });
    await relate('W-DIR', 'W-DIR-HC', 'child');
    await relate('W-DIR-CC', 'W-DIR', 'child');

    const session = await start('0801 110 0015', '10.3.0.8');
    let seq = 2;
    await frame(session.sessionId, '0801 110 0015', '4', seq++, '10.3.0.8');
    await frame(session.sessionId, '0801 110 0015', '2', seq++, '10.3.0.8');
    await frame(session.sessionId, '0801 110 0015', '1', seq++, '10.3.0.8');
    const list = await frame(session.sessionId, '0801 110 0015', '1', seq, '10.3.0.8');

    expect(list.state).toBe('welfare.dependents');
    expect(list.text).toContain('HolderChild');
    expect(list.text).not.toContain('CoveredChild');
  });

  it('says None when a household member has no eligible dependents', async () => {
    await createMember('W-NONE', '0801 110 0004');
    const session = await start('0801 110 0004', '10.3.0.6');
    let seq = 2;
    await frame(session.sessionId, '0801 110 0004', '4', seq++, '10.3.0.6');
    await frame(session.sessionId, '0801 110 0004', '2', seq++, '10.3.0.6');
    const none = await frame(session.sessionId, '0801 110 0004', '1', seq, '10.3.0.6');
    expect(none.state).toBe('welfare.dependents');
    expect(none.text).toContain('Dependents?');
    expect(none.text).toContain('None');
    expect(none.text).toContain('1 Join');
  });

  it('shows an empty Subscribe list with a clear no-eligible message', async () => {
    const empty = await createTestApp({
      ussd: { gatewaySecret: USSD_SECRET, phonePepper: USSD_PHONE_PEPPER },
    });
    try {
      const created = await request(empty.app)
        .post('/v1/members')
        .set(writeHeaders)
        .send({
          memberNo: 'W-EMPTY',
          firstName: 'Empty',
          lastName: 'Member',
          contacts: [{ kind: 'phone', value: '0801 110 0009' }],
        });
      expect(created.status).toBe(201);

      const raw = JSON.stringify({ phone: '0801 110 0009', input: '', seq: 1 });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = 'empty-nonce-000001';
      const signature = createHmac('sha256', USSD_SECRET)
        .update(`${timestamp}${nonce}${raw}`)
        .digest('hex');
      const started = await request(empty.app)
        .post('/ussd/session')
        .set({
          'Content-Type': 'application/json',
          'X-USSD-Timestamp': timestamp,
          'X-USSD-Nonce': nonce,
          'X-USSD-Signature': signature,
          'X-Forwarded-For': '10.3.0.7',
        })
        .send(raw);
      const sessionId = started.body.sessionId as string;

      const listRaw = JSON.stringify({ phone: '0801 110 0009', sessionId, input: '4', seq: 2 });
      const listTimestamp = String(Math.floor(Date.now() / 1000));
      const listNonce = 'empty-nonce-000002';
      const listSignature = createHmac('sha256', USSD_SECRET)
        .update(`${listTimestamp}${listNonce}${listRaw}`)
        .digest('hex');
      const list = await request(empty.app)
        .post('/ussd/session')
        .set({
          'Content-Type': 'application/json',
          'X-USSD-Timestamp': listTimestamp,
          'X-USSD-Nonce': listNonce,
          'X-USSD-Signature': listSignature,
          'X-Forwarded-For': '10.3.0.7',
        })
        .send(listRaw);
      expect(list.body.state).toBe('welfare.list');
      expect(list.body.text).toContain('Not eligible');
      expect(list.body.text).toContain('8 My plans');
    } finally {
      await empty.close();
    }
  });

  it('shows owned status, payer, period and claimed total and pages with 0 More', async () => {
    await createMember('W-SVC', '0801 110 0005');
    await subscribeViaApi('W-SVC', 'A-LIFE');
    await subscribeViaApi('W-SVC', 'B-FAMILY');
    await subscribeViaApi('W-SVC', 'F-EXTRA');
    const church = await subscribeViaApi('W-SVC', 'C-CHURCH');

    const session = await start('0801 110 0005', '10.3.0.8');
    let seq = 2;
    await frame(session.sessionId, '0801 110 0005', '4', seq++, '10.3.0.8');
    const page1 = await frame(session.sessionId, '0801 110 0005', '8', seq++, '10.3.0.8');
    expect(page1.state).toBe('welfare.services');
    expect(page1.text).toContain('My plans');
    expect(page1.text).toContain('Church Cover');
    expect(page1.text).toContain('Church');
    expect(page1.text).toContain('Until');
    expect(page1.text).toContain('Claimed GHS 0.00');
    expect(page1.text).toContain('0 More');
    expect(page1.text).not.toContain('Extra One');

    const page2 = await frame(session.sessionId, '0801 110 0005', '0', seq, '10.3.0.8');
    expect(page2.state).toBe('welfare.services');
    expect(page2.text).toContain('Extra One');
    expect(page2.text).toContain('0 More');

    // An unpaid period lapses at periodEnd and renders Expired.
    await createMember('W-EXP', '0801 110 0010');
    const expiring = await subscribeViaApi('W-EXP', 'A-LIFE', {});
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await harness.db.query('update subscriptions set period_end = $2 where id = $1', [
      expiring.id,
      yesterday,
    ]);

    const expiredSession = await start('0801 110 0010', '10.3.0.9');
    seq = 2;
    await frame(expiredSession.sessionId, '0801 110 0010', '4', seq++, '10.3.0.9');
    const expiredPage = await frame(
      expiredSession.sessionId,
      '0801 110 0010',
      '8',
      seq,
      '10.3.0.9',
    );
    expect(expiredPage.text).toContain('Life Cover A Expired');

    // A church-paid policy has no payment and says Church.
    const churchRead = await request(app)
      .get(`/v1/subscriptions/${church.id}/payments`)
      .set(writeHeaders);
    expect(churchRead.body.items).toHaveLength(0);
  });

  it('labels inherited cover with the policyholder and a spouse label', async () => {
    await createMember('W-POL', '0801 110 0007', {
      firstName: 'Solomon',
      lastName: 'Mensah',
      gender: 'male',
      dob: '1990-01-01',
    });
    await createMember('W-INH', '0801 110 0006', {
      firstName: 'Grace',
      lastName: 'Mensah',
      gender: 'female',
      dob: '1992-01-01',
    });
    await relate('W-POL', 'W-INH', 'spouse');
    await subscribeViaApi('W-POL', 'H-CHURCH', { coveredMemberNos: ['W-INH'] });

    const session = await start('0801 110 0006', '10.3.0.10');
    let seq = 2;
    await frame(session.sessionId, '0801 110 0006', '4', seq++, '10.3.0.10');
    const services = await frame(session.sessionId, '0801 110 0006', '8', seq, '10.3.0.10');
    expect(services.state).toBe('welfare.services');
    expect(services.text).toContain('Church Family (Husband)');
    expect(services.text).toContain('Solomon Mensah');
    expect(services.text).toContain('Church');
    expect(services.text).toContain('Claimed GHS 0.00');
    expect(services.options).toEqual([
      { key: '9', label: 'Back' },
      { key: '00', label: 'Main' },
    ]);
  });
});
