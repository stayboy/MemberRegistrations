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
    .send({
      memberNo,
      firstName: 'Member',
      lastName: memberNo,
      gender: 'male',
      joinedOn: '2020-01-01',
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
      code: `P-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: 'Life Cover',
      premiumMinor: 3000,
      currency: 'GHS',
      paymentMode: 'member',
      periodMonths: 12,
      covers: 'individual',
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body as { code: string; id: string; [key: string]: unknown };
}

async function subscribe(memberNo: string, body: Record<string, unknown>) {
  return request(app).post(`/v1/members/${memberNo}/subscriptions`).set(writeHeaders).send(body);
}

async function relate(memberNo: string, relatedMemberNo: string, type: string) {
  const response = await request(app)
    .post(`/v1/members/${memberNo}/relationships`)
    .set(writeHeaders)
    .send({ relatedMemberNo, type });
  expect(response.status).toBe(201);
}

describe('welfare eligibility', () => {
  it('evaluates card and verification rules before writing anything', async () => {
    const product = await createProduct({
      code: 'CARD-ONLY',
      requiresCard: true,
      requiresVerified: true,
    });
    await createMember('E-1001');

    const refused = await subscribe('E-1001', { productCode: product.code });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('not_eligible');

    await request(app)
      .put('/v1/members/E-1001')
      .set(writeHeaders)
      .send({ membershipCardNo: 'CARD-E-1001', verified: true })
      .expect(200);

    const accepted = await subscribe('E-1001', { productCode: product.code });
    expect(accepted.status).toBe(201);
    expect(accepted.body.paidBy).toBe('member');
  });

  it('tests gender and age rules, and an unknown dob fails an age rule', async () => {
    const ladies = await createProduct({ code: 'LADIES', gender: 'female' });
    const young = await createProduct({ code: 'YOUNG', minAge: 18, maxAge: 30 });
    await createMember('E-2001', { gender: 'male', dob: '2000-01-01' });

    const wrongGender = await subscribe('E-2001', { productCode: ladies.code });
    expect(wrongGender.status).toBe(422);
    expect(wrongGender.body.code).toBe('not_eligible');

    const rightAge = await subscribe('E-2001', { productCode: young.code });
    expect(rightAge.status).toBe(201);

    await createMember('E-2002', { gender: 'female', dob: '2015-01-01' });
    const tooYoung = await subscribe('E-2002', { productCode: young.code });
    expect(tooYoung.status).toBe(422);
    expect(tooYoung.body.code).toBe('not_eligible');

    await createMember('E-2003', { gender: 'female' });
    const noDob = await subscribe('E-2003', { productCode: young.code });
    expect(noDob.status).toBe(422);
    expect(noDob.body.code).toBe('not_eligible');

    const female = await subscribe('E-2003', { productCode: ladies.code });
    expect(female.status).toBe(201);
  });

  it('tests the minimum membership days from joinedOn', async () => {
    const product = await createProduct({ code: 'TENURE', minMembershipDays: 3650 });
    await createMember('E-3001', { joinedOn: today() });

    const refused = await subscribe('E-3001', { productCode: product.code });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('not_eligible');

    await createMember('E-3002', { joinedOn: '2010-01-01' });
    const accepted = await subscribe('E-3002', { productCode: product.code });
    expect(accepted.status).toBe(201);
  });

  it('hides an inactive product from subscription', async () => {
    const product = await createProduct({ code: 'INACTIVE' });
    await createMember('E-4001');
    await request(app)
      .put(`/v1/subscription-products/${product.code}`)
      .set(writeHeaders)
      .send({ active: false })
      .expect(200);

    const refused = await subscribe('E-4001', { productCode: product.code });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('not_eligible');
  });
});

describe('payer resolution', () => {
  it('resolves a member product to member and writes the first period payment', async () => {
    const product = await createProduct({ code: 'MEMBER-12', periodMonths: 12 });
    await createMember('P-1001');

    const response = await subscribe('P-1001', {
      productCode: product.code,
      paidBy: 'church',
    });
    expect(response.status).toBe(201);
    expect(response.headers.location).toMatch(/^\/v1\/members\/P-1001\/subscriptions\//);
    expect(response.body).toMatchObject({
      source: 'owned',
      role: 'policyholder',
      status: 'active',
      productCode: 'MEMBER-12',
      paidBy: 'member',
      premiumMinor: 3000,
      currency: 'GHS',
      periodStart: today(),
      periodEnd: addMonths(today(), 12),
      scope: 'individual',
      claimedTotalMinor: 0,
      policyholder: null,
      relationship: null,
    });
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'claimedTotalMinor',
        'coveredMemberNos',
        'createdBy',
        'currency',
        'endedOn',
        'id',
        'kind',
        'paidBy',
        'periodEnd',
        'periodStart',
        'policyholder',
        'premiumMinor',
        'productCode',
        'productName',
        'relationship',
        'role',
        'scope',
        'source',
        'startedOn',
        'status',
        'updatedAt',
        'updatedBy',
      ].sort(),
    );

    const payments = await request(app)
      .get(`/v1/subscriptions/${response.body.id}/payments`)
      .set(readHeaders);
    expect(payments.status).toBe(200);
    expect(payments.body.items).toHaveLength(1);
    expect(payments.body.items[0]).toMatchObject({
      periodStart: today(),
      periodEnd: addMonths(today(), 12),
      amountMinor: 3000,
      currency: 'GHS',
      channel: 'manual',
    });
  });

  it('resolves a church product to church and writes no payment', async () => {
    const product = await createProduct({
      code: 'CHURCH-1',
      paymentMode: 'church',
      periodMonths: 3,
      premiumMinor: 5000,
    });
    await createMember('P-2001');

    const response = await subscribe('P-2001', { productCode: product.code });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ paidBy: 'church', premiumMinor: null });

    const payments = await request(app)
      .get(`/v1/subscriptions/${response.body.id}/payments`)
      .set(readHeaders);
    expect(payments.body.items).toHaveLength(0);
  });

  it('requires paidBy for either and accepts it for the back office', async () => {
    const product = await createProduct({
      code: 'EITHER-1',
      paymentMode: 'either',
      periodMonths: 1,
      premiumMinor: 1000,
    });
    await createMember('P-3001');

    const missing = await subscribe('P-3001', { productCode: product.code });
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation_error');

    for (const paidBy of ['member', 'church'] as const) {
      const response = await subscribe('P-3001', { productCode: product.code, paidBy });
      expect(response.status).toBe(201);
      expect(response.body.paidBy).toBe(paidBy);
      expect(response.body.premiumMinor).toBe(paidBy === 'member' ? 1000 : null);
    }
  });
});

describe('household cover', () => {
  it('validates relationship, cap, active state and individual scope', async () => {
    const family = await createProduct({
      code: 'FAMILY-1',
      paymentMode: 'church',
      covers: 'household',
      periodMonths: 12,
      maxDependents: 1,
      allowedRelationships: ['spouse', 'child'],
    });
    const individual = await createProduct({ code: 'SOLO-2' });
    await createMember('H-1001');
    await createMember('H-1002');
    await createMember('H-1003');
    await createMember('H-1004');
    await relate('H-1001', 'H-1002', 'spouse');
    await relate('H-1001', 'H-1003', 'child');
    await relate('H-1001', 'H-1004', 'guardian');

    const tooMany = await subscribe('H-1001', {
      productCode: family.code,
      coveredMemberNos: ['H-1002', 'H-1003'],
    });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.code).toBe('validation_error');

    const disallowed = await subscribe('H-1001', {
      productCode: family.code,
      coveredMemberNos: ['H-1004'],
    });
    expect(disallowed.status).toBe(422);

    const individualWithDep = await subscribe('H-1001', {
      productCode: individual.code,
      coveredMemberNos: ['H-1002'],
    });
    expect(individualWithDep.status).toBe(422);

    const accepted = await subscribe('H-1001', {
      productCode: family.code,
      coveredMemberNos: ['H-1002'],
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.coveredMemberNos).toEqual(['H-1002']);

    await request(app).delete('/v1/members/H-1003').set(writeHeaders).expect(204);
    const inactive = await subscribe('H-1001', {
      productCode: family.code,
      coveredMemberNos: ['H-1003'],
    });
    expect(inactive.status).toBe(422);
  });

  it('adds and removes standalone coverage under the product rules', async () => {
    const family = await createProduct({
      code: 'FAMILY-COVER',
      paymentMode: 'member',
      covers: 'household',
      periodMonths: 6,
      maxDependents: 2,
      allowedRelationships: ['spouse', 'child'],
    });
    await createMember('H-2001');
    await createMember('H-2002');
    await createMember('H-2003');
    await relate('H-2001', 'H-2002', 'spouse');
    await relate('H-2001', 'H-2003', 'guardian');

    const created = await subscribe('H-2001', { productCode: family.code });
    expect(created.status).toBe(201);

    await request(app)
      .post(`/v1/subscriptions/${created.body.id}/coverage`)
      .set(writeHeaders)
      .send({ memberNo: 'H-2002' })
      .expect(204);

    const repeat = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/coverage`)
      .set(writeHeaders)
      .send({ memberNo: 'H-2002' });
    expect(repeat.status).toBe(409);
    expect(repeat.body.code).toBe('conflict');

    const disallowed = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/coverage`)
      .set(writeHeaders)
      .send({ memberNo: 'H-2003' });
    expect(disallowed.status).toBe(422);

    await request(app)
      .delete(`/v1/subscriptions/${created.body.id}/coverage/H-2002`)
      .set(writeHeaders)
      .expect(204);

    const missing = await request(app)
      .delete(`/v1/subscriptions/${created.body.id}/coverage/H-2002`)
      .set(writeHeaders);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('not_covered');

    await request(app)
      .delete(`/v1/members/H-2001/subscriptions/${created.body.id}`)
      .set(writeHeaders)
      .expect(204);

    const ended = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/coverage`)
      .set(writeHeaders)
      .send({ memberNo: 'H-2002' });
    expect(ended.status).toBe(409);
    expect(ended.body.code).toBe('subscription_not_active');
  });
});

describe('renewal and expiry', () => {
  it('renews from max(periodEnd, today) and records the member payment', async () => {
    const product = await createProduct({ code: 'RENEW-3', periodMonths: 3 });
    await createMember('R-1001');
    const created = await subscribe('R-1001', { productCode: product.code });
    expect(created.status).toBe(201);

    const firstEnd = created.body.periodEnd as string;
    const renewed = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/renew`)
      .set(writeHeaders)
      .send({});
    expect(renewed.status).toBe(200);
    expect(renewed.body.periodStart).toBe(firstEnd);
    expect(renewed.body.periodEnd).toBe(addMonths(firstEnd, 3));

    const payments = await request(app)
      .get(`/v1/subscriptions/${created.body.id}/payments`)
      .set(readHeaders);
    expect(payments.body.items).toHaveLength(2);

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    // A lapsed subscription has no payment covering today; the synthetic reset
    // removes the original period so renewal starts from today.
    await harness.db.query('delete from subscription_payments where subscription_id = $1', [
      created.body.id,
    ]);
    await harness.db.query('update subscriptions set period_end = $2 where id = $1', [
      created.body.id,
      yesterday,
    ]);

    const read = await request(app).get('/v1/members/R-1001/subscriptions').set(readHeaders);
    expect(read.body.items[0].status).toBe('expired');

    const lapsed = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/renew`)
      .set(writeHeaders)
      .send({});
    expect(lapsed.status).toBe(200);
    expect(lapsed.body.periodStart).toBe(today());

    await request(app)
      .delete(`/v1/members/R-1001/subscriptions/${created.body.id}`)
      .set(writeHeaders)
      .expect(204);

    const ended = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/renew`)
      .set(writeHeaders)
      .send({});
    expect(ended.status).toBe(409);
    expect(ended.body.code).toBe('subscription_not_active');
  });

  it('renews a church product with no payment and a null premium', async () => {
    const product = await createProduct({
      code: 'CHURCH-3',
      paymentMode: 'church',
      periodMonths: 3,
      premiumMinor: 2500,
    });
    await createMember('R-2001');
    const created = await subscribe('R-2001', { productCode: product.code });
    const renewed = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/renew`)
      .set(writeHeaders)
      .send({ paidBy: 'church' });
    expect(renewed.status).toBe(200);
    expect(renewed.body).toMatchObject({ paidBy: 'church', premiumMinor: null });

    const payments = await request(app)
      .get(`/v1/subscriptions/${created.body.id}/payments`)
      .set(readHeaders);
    expect(payments.body.items).toHaveLength(0);
  });
});

describe('inherited cover and legacy rows', () => {
  it('labels an inherited row with the policyholder and relationship', async () => {
    const product = await createProduct({
      code: 'INHERIT-1',
      paymentMode: 'church',
      covers: 'household',
      periodMonths: 12,
      maxDependents: 2,
      allowedRelationships: ['spouse'],
    });
    await createMember('I-1001', {
      firstName: 'Solomon',
      lastName: 'Mensah',
      gender: 'male',
      dob: '1990-01-01',
    });
    await createMember('I-1002', {
      firstName: 'Grace',
      lastName: 'Mensah',
      gender: 'female',
      dob: '1992-01-01',
    });
    await relate('I-1001', 'I-1002', 'spouse');

    const created = await subscribe('I-1001', {
      productCode: product.code,
      coveredMemberNos: ['I-1002'],
    });
    expect(created.status).toBe(201);

    const response = await request(app).get('/v1/members/I-1002/subscriptions').set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      id: created.body.id,
      source: 'inherited',
      role: 'covered',
      status: 'active',
      productCode: 'INHERIT-1',
      paidBy: 'church',
      relationship: 'spouse',
      policyholder: {
        memberNo: 'I-1001',
        name: 'Solomon Mensah',
        gender: 'male',
        age: expect.any(Number),
      },
    });

    const owner = await request(app).get('/v1/members/I-1001/subscriptions').set(readHeaders);
    expect(owner.body.items[0]).toMatchObject({
      source: 'owned',
      role: 'policyholder',
      policyholder: null,
      relationship: null,
    });
  });

  it('keeps a legacy row readable with null product, payer and period fields', async () => {
    await createMember('L-1001');
    const legacy = await request(app)
      .post('/v1/members/L-1001/subscriptions')
      .set(writeHeaders)
      .send({ kind: 'life_insurance', scope: 'individual', startedOn: '2025-01-01' });
    expect(legacy.status).toBe(201);
    expect(legacy.headers['cache-control']).toBe('no-store');

    const read = await request(app).get('/v1/members/L-1001/subscriptions').set(readHeaders);
    expect(read.status).toBe(200);
    expect(read.body.items[0]).toMatchObject({
      id: legacy.body.id,
      kind: 'life_insurance',
      productCode: null,
      productName: null,
      paidBy: null,
      premiumMinor: null,
      currency: null,
      periodStart: null,
      periodEnd: null,
      status: 'active',
    });

    await request(app)
      .delete(`/v1/members/L-1001/subscriptions/${legacy.body.id}`)
      .set(writeHeaders)
      .expect(204);
    const ended = await request(app).get('/v1/members/L-1001/subscriptions').set(readHeaders);
    expect(ended.body.items[0].status).toBe('ended');
  });
});

describe('ending a subscription', () => {
  it('records the actor and the end timestamp in the same update', async () => {
    const product = await createProduct({ code: 'END-AUDIT', paymentMode: 'church' });
    await createMember('END-1001');
    const created = await subscribe('END-1001', { productCode: product.code });
    expect(created.status).toBe(201);

    await harness.db.query(
      `update subscriptions set updated_by = null, updated_at = '2000-01-01T00:00:00Z'
        where id = $1`,
      [created.body.id],
    );

    await request(app)
      .delete(`/v1/members/END-1001/subscriptions/${created.body.id}`)
      .set(writeHeaders)
      .expect(204);

    const [row] = await harness.db.query<{
      status: string;
      ended_on: string | Date;
      updated_by: string | null;
      updated_at: string | Date | null;
    }>('select status, ended_on, updated_by, updated_at from subscriptions where id = $1', [
      created.body.id,
    ]);

    expect(row).toMatchObject({ status: 'ended', updated_by: 'test-admin' });
    expect(new Date(row!.ended_on).toISOString().slice(0, 10)).toBe(today());
    expect(new Date(row!.updated_at!).getUTCFullYear()).toBeGreaterThan(2000);
  });
});

describe('relationship direction', () => {
  async function householdProduct(code: string, allowedRelationships: string[]) {
    return createProduct({
      code,
      paymentMode: 'church',
      covers: 'household',
      maxDependents: 1,
      allowedRelationships,
    });
  }

  it('accepts a holder-declared child under an allowed child rule', async () => {
    const product = await householdProduct('DIR-HC', ['child']);
    await createMember('DIR-1001');
    await createMember('DIR-1002');
    await relate('DIR-1001', 'DIR-1002', 'child');

    const accepted = await subscribe('DIR-1001', {
      productCode: product.code,
      coveredMemberNos: ['DIR-1002'],
    });
    expect(accepted.status).toBe(201);
  });

  it('rejects a covered-declared child under a child rule because it normalises to parent', async () => {
    const product = await householdProduct('DIR-CC', ['child']);
    await createMember('DIR-2001');
    await createMember('DIR-2002');
    await relate('DIR-2002', 'DIR-2001', 'child');

    const refused = await subscribe('DIR-2001', {
      productCode: product.code,
      coveredMemberNos: ['DIR-2002'],
    });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
  });

  it('rejects a holder-declared parent under a child rule and accepts it under a parent rule', async () => {
    const childProduct = await householdProduct('DIR-PC', ['child']);
    await createMember('DIR-3001');
    await createMember('DIR-3002');
    await relate('DIR-3001', 'DIR-3002', 'parent');

    const refused = await subscribe('DIR-3001', {
      productCode: childProduct.code,
      coveredMemberNos: ['DIR-3002'],
    });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');

    const parentProduct = await householdProduct('DIR-PP', ['parent']);
    await createMember('DIR-3003');
    await createMember('DIR-3004');
    await relate('DIR-3003', 'DIR-3004', 'parent');

    const accepted = await subscribe('DIR-3003', {
      productCode: parentProduct.code,
      coveredMemberNos: ['DIR-3004'],
    });
    expect(accepted.status).toBe(201);
  });

  it('accepts a spouse edge declared from either side', async () => {
    const product = await householdProduct('DIR-SP', ['spouse']);
    await createMember('DIR-4001');
    await createMember('DIR-4002');
    await createMember('DIR-4003');
    await createMember('DIR-4004');
    await relate('DIR-4001', 'DIR-4002', 'spouse');
    await relate('DIR-4004', 'DIR-4003', 'spouse');

    const holderDeclared = await subscribe('DIR-4001', {
      productCode: product.code,
      coveredMemberNos: ['DIR-4002'],
    });
    expect(holderDeclared.status).toBe(201);

    const coveredDeclared = await subscribe('DIR-4003', {
      productCode: product.code,
      coveredMemberNos: ['DIR-4004'],
    });
    expect(coveredDeclared.status).toBe(201);
  });
});
