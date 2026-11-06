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
      code: `CLAIM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: 'Family Cover',
      premiumMinor: 4000,
      currency: 'GHS',
      paymentMode: 'church',
      periodMonths: 12,
      covers: 'household',
      maxDependents: 2,
      allowedRelationships: ['spouse', 'child'],
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body as { code: string; id: string };
}

describe('subscription claims', () => {
  it('records claims for the policyholder or an active dependent and totals approved and paid', async () => {
    const product = await createProduct();
    await createMember('C-1001', { firstName: 'Solomon' });
    await createMember('C-1002', { firstName: 'Grace' });
    await createMember('C-1003', { firstName: 'Kofi' });
    await createMember('C-1004', { firstName: 'Outsider' });
    await request(app)
      .post('/v1/members/C-1001/relationships')
      .set(writeHeaders)
      .send({ relatedMemberNo: 'C-1002', type: 'spouse' })
      .expect(201);

    const subscription = await request(app)
      .post('/v1/members/C-1001/subscriptions')
      .set(writeHeaders)
      .send({ productCode: product.code, coveredMemberNos: ['C-1002'] });
    expect(subscription.status).toBe(201);

    const byHolder = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims`)
      .set(writeHeaders)
      .send({ memberNo: 'C-1001', amountMinor: 5000, reason: 'Hospital admission' });
    expect(byHolder.status).toBe(201);
    expect(byHolder.headers.location).toBe(
      `/v1/subscriptions/${subscription.body.id}/claims/${byHolder.body.id}`,
    );
    expect(byHolder.body).toMatchObject({
      memberNo: 'C-1001',
      amountMinor: 5000,
      reason: 'Hospital admission',
      status: 'pending',
      recordedBy: 'test-admin',
      decidedBy: null,
      decisionNote: null,
    });

    const byDependent = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims`)
      .set(writeHeaders)
      .send({ memberNo: 'C-1002', amountMinor: 3000, reason: 'Dental' });
    expect(byDependent.status).toBe(201);

    const notCovered = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims`)
      .set(writeHeaders)
      .send({ memberNo: 'C-1004', amountMinor: 1000, reason: 'Not on the policy' });
    expect(notCovered.status).toBe(404);
    expect(notCovered.body.code).toBe('not_covered');

    const zero = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims`)
      .set(writeHeaders)
      .send({ memberNo: 'C-1001', amountMinor: 0, reason: 'Zero' });
    expect(zero.status).toBe(422);
    expect(zero.body.code).toBe('invalid_amount');

    const approved = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims/${byHolder.body.id}/decide`)
      .set(writeHeaders)
      .send({ status: 'approved', note: 'Covered' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      status: 'approved',
      decidedBy: 'test-admin',
      decisionNote: 'Covered',
    });
    expect(approved.body.decidedAt).toBeTruthy();

    const illegalFromPending = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims/${byDependent.body.id}/decide`)
      .set(writeHeaders)
      .send({ status: 'paid' });
    expect(illegalFromPending.status).toBe(409);
    expect(illegalFromPending.body.code).toBe('claim_not_pending');

    const rejected = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims/${byDependent.body.id}/decide`)
      .set(writeHeaders)
      .send({ status: 'rejected', note: 'Outside cover' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('rejected');

    const paid = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims/${byHolder.body.id}/decide`)
      .set(writeHeaders)
      .send({ status: 'paid' });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('paid');

    const again = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims/${byHolder.body.id}/decide`)
      .set(writeHeaders)
      .send({ status: 'rejected' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('claim_not_pending');

    const list = await request(app)
      .get(`/v1/subscriptions/${subscription.body.id}/claims`)
      .set(readHeaders);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);

    const read = await request(app).get('/v1/members/C-1001/subscriptions').set(readHeaders);
    expect(read.body.items[0].claimedTotalMinor).toBe(5000);
  });

  it('refuses a claim on an ended subscription', async () => {
    const product = await createProduct({ code: 'CLAIM-ENDED' });
    await createMember('C-2001');
    const subscription = await request(app)
      .post('/v1/members/C-2001/subscriptions')
      .set(writeHeaders)
      .send({ productCode: product.code });
    await request(app)
      .delete(`/v1/members/C-2001/subscriptions/${subscription.body.id}`)
      .set(writeHeaders)
      .expect(204);

    const response = await request(app)
      .post(`/v1/subscriptions/${subscription.body.id}/claims`)
      .set(writeHeaders)
      .send({ memberNo: 'C-2001', amountMinor: 1000, reason: 'Late claim' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('subscription_not_active');
  });
});
