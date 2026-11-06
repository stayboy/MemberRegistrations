import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

const today = () => new Date().toISOString().slice(0, 10);

function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(
    Math.min(day, lastDay),
  ).padStart(2, '0')}`;
}

async function createMember(memberNo: string, extra: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo, firstName: 'Member', lastName: memberNo, ...extra });
  expect(response.status).toBe(201);
}

async function createProduct(extra: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/v1/subscription-products')
    .set(writeHeaders)
    .send({
      code: `PAY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: 'Life Cover',
      premiumMinor: 2000,
      currency: 'GHS',
      paymentMode: 'member',
      periodMonths: 2,
      covers: 'individual',
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body as { code: string; id: string };
}

async function lapse(subscriptionId: string, memberNo: string) {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await harness.db.query('delete from subscription_payments where subscription_id = $1', [
    subscriptionId,
  ]);
  await harness.db.query('update subscriptions set period_end = $2 where id = $1', [
    subscriptionId,
    yesterday,
  ]);
  void memberNo;
}

function paymentBody(extra: Record<string, unknown> = {}) {
  return {
    amountMinor: 2000,
    currency: 'GHS',
    channel: 'manual',
    idempotencyKey: 'pay-key-1',
    ...extra,
  };
}

describe('subscription payments', () => {
  it('records one row per unpaid period, idempotently, and never anchors on paidAt', async () => {
    const product = await createProduct({ code: 'PAY-MEMBER' });
    await createMember('PAY-1001');
    const created = await request(app)
      .post('/v1/members/PAY-1001/subscriptions')
      .set(writeHeaders)
      .send({ productCode: product.code });
    expect(created.status).toBe(201);

    const alreadyPaid = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(paymentBody());
    expect(alreadyPaid.status).toBe(409);
    expect(alreadyPaid.body.code).toBe('period_already_paid');

    await lapse(created.body.id, 'PAY-1001');

    const zero = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(paymentBody({ amountMinor: 0 }));
    expect(zero.status).toBe(422);
    expect(zero.body.code).toBe('invalid_amount');

    const wrongCurrency = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(paymentBody({ currency: 'USD' }));
    expect(wrongCurrency.status).toBe(422);
    expect(wrongCurrency.body.code).toBe('validation_error');

    const paid = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(
        paymentBody({
          channel: 'ussd',
          reference: 'REF-PAY-1',
          paidAt: '2020-01-01T00:00:00.000Z',
        }),
      );
    expect(paid.status).toBe(201);
    expect(paid.headers.location).toBe(
      `/v1/subscriptions/${created.body.id}/payments/${paid.body.id}`,
    );
    expect(paid.body).toMatchObject({
      subscriptionId: created.body.id,
      periodStart: today(),
      periodEnd: addMonths(today(), 2),
      amountMinor: 2000,
      currency: 'GHS',
      channel: 'ussd',
      reference: 'REF-PAY-1',
      paidAt: '2020-01-01T00:00:00.000Z',
      recordedBy: 'test-admin',
      idempotencyKey: 'pay-key-1',
    });
    expect(paid.body.periodStart).toBe(today());

    const repeat = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(
        paymentBody({
          channel: 'ussd',
          reference: 'REF-PAY-1',
          paidAt: '2020-01-01T00:00:00.000Z',
        }),
      );
    expect(repeat.status).toBe(200);
    expect(repeat.body.id).toBe(paid.body.id);

    const different = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(paymentBody({ amountMinor: 3000 }));
    expect(different.status).toBe(409);
    expect(different.body.code).toBe('idempotency_conflict');

    const coveredAgain = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(paymentBody({ idempotencyKey: 'pay-key-3' }));
    expect(coveredAgain.status).toBe(409);
    expect(coveredAgain.body.code).toBe('period_already_paid');

    await createMember('PAY-1002');
    const second = await request(app)
      .post('/v1/members/PAY-1002/subscriptions')
      .set(writeHeaders)
      .send({ productCode: product.code });
    expect(second.status).toBe(201);
    await lapse(second.body.id, 'PAY-1002');

    const reusedReference = await request(app)
      .post(`/v1/subscriptions/${second.body.id}/payments`)
      .set(writeHeaders)
      .send(paymentBody({ idempotencyKey: 'pay-key-2', reference: 'REF-PAY-1' }));
    expect(reusedReference.status).toBe(409);
    expect(reusedReference.body.code).toBe('conflict');

    const list = await request(app)
      .get(`/v1/subscriptions/${created.body.id}/payments`)
      .set(readHeaders);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(paid.body.id);

    const read = await request(app).get('/v1/members/PAY-1001/subscriptions').set(readHeaders);
    expect(read.body.items[0]).toMatchObject({
      paidBy: 'member',
      premiumMinor: 2000,
      periodStart: today(),
      periodEnd: addMonths(today(), 2),
    });
  });

  it('refuses a payment once the subscription has ended', async () => {
    const product = await createProduct({ code: 'PAY-ENDED' });
    await createMember('PAY-2001');
    const created = await request(app)
      .post('/v1/members/PAY-2001/subscriptions')
      .set(writeHeaders)
      .send({ productCode: product.code });
    await request(app)
      .delete(`/v1/members/PAY-2001/subscriptions/${created.body.id}`)
      .set(writeHeaders)
      .expect(204);

    const response = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(paymentBody({ idempotencyKey: 'ended-key' }));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('subscription_not_active');
  });

  it('re-evaluates eligibility before recording a payment', async () => {
    const product = await createProduct({ code: 'PAY-CARD', requiresCard: true });
    await createMember('PAY-3001', { membershipCardNo: 'CARD-PAY-3001' });
    const created = await request(app)
      .post('/v1/members/PAY-3001/subscriptions')
      .set(writeHeaders)
      .send({ productCode: product.code });
    expect(created.status).toBe(201);

    await request(app)
      .put('/v1/members/PAY-3001')
      .set(writeHeaders)
      .send({ membershipCardNo: null })
      .expect(200);
    await lapse(created.body.id, 'PAY-3001');

    const response = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/payments`)
      .set(writeHeaders)
      .send(paymentBody({ idempotencyKey: 'card-key' }));
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('not_eligible');
  });
});
