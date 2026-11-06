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

function product(extra: Record<string, unknown> = {}) {
  return {
    code: 'LIFE-1',
    name: 'Life Cover',
    description: 'Member life cover',
    premiumMinor: 3000,
    currency: 'GHS',
    paymentMode: 'member',
    periodMonths: 12,
    covers: 'individual',
    ...extra,
  };
}

describe('welfare product management', () => {
  it('creates a product with an uppercase code and a Location header', async () => {
    const response = await request(app)
      .post('/v1/subscription-products')
      .set(writeHeaders)
      .send(product({ code: ' life-1 ' }));

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/v1/subscription-products/LIFE-1');
    expect(response.body).toMatchObject({
      code: 'LIFE-1',
      name: 'Life Cover',
      premiumMinor: 3000,
      currency: 'GHS',
      active: true,
      paymentMode: 'member',
      periodMonths: 12,
      covers: 'individual',
      maxDependents: 0,
      allowedRelationships: [],
    });
    expect(response.body.createdBy).toBe('test-admin');
  });

  it('matches a code case-insensitively and refuses a repeat', async () => {
    const read = await request(app).get('/v1/subscription-products/life-1').set(readHeaders);
    expect(read.status).toBe(200);
    expect(read.body.code).toBe('LIFE-1');

    const repeat = await request(app)
      .post('/v1/subscription-products')
      .set(writeHeaders)
      .send(product({ code: 'Life-1' }));
    expect(repeat.status).toBe(409);
    expect(repeat.body.code).toBe('conflict');
  });

  it('rejects a non-positive premium as invalid_amount', async () => {
    const response = await request(app)
      .post('/v1/subscription-products')
      .set(writeHeaders)
      .send(product({ code: 'FREE', premiumMinor: 0 }));
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('invalid_amount');
  });

  it('requires a cap and relationships for a household product', async () => {
    const noCap = await request(app)
      .post('/v1/subscription-products')
      .set(writeHeaders)
      .send(product({ code: 'HOUSE-1', covers: 'household' }));
    expect(noCap.status).toBe(422);
    expect(noCap.body.code).toBe('validation_error');

    const noRelations = await request(app)
      .post('/v1/subscription-products')
      .set(writeHeaders)
      .send(product({ code: 'HOUSE-2', covers: 'household', maxDependents: 2 }));
    expect(noRelations.status).toBe(422);

    const created = await request(app)
      .post('/v1/subscription-products')
      .set(writeHeaders)
      .send(
        product({
          code: 'HOUSE-3',
          covers: 'household',
          maxDependents: 2,
          allowedRelationships: ['spouse', 'child'],
        }),
      );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      covers: 'household',
      maxDependents: 2,
      allowedRelationships: ['spouse', 'child'],
    });
  });

  it('forces an individual product to no dependents and no relationships', async () => {
    const response = await request(app)
      .post('/v1/subscription-products')
      .set(writeHeaders)
      .send(
        product({
          code: 'SOLO-1',
          covers: 'individual',
          maxDependents: 3,
          allowedRelationships: ['spouse'],
        }),
      );
    expect(response.status).toBe(201);
    expect(response.body.maxDependents).toBe(0);
    expect(response.body.allowedRelationships).toEqual([]);
  });

  it('rejects an unrecognised period', async () => {
    const response = await request(app)
      .post('/v1/subscription-products')
      .set(writeHeaders)
      .send(product({ code: 'BAD-PERIOD', periodMonths: 4 }));
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('documents the product code constraint in the generated contract', async () => {
    const response = await request(app).get('/openapi.json').set(readHeaders);
    expect(response.status).toBe(200);
    const schema = response.body.components.schemas.SubscriptionProductCreate;
    expect(schema.properties.code.pattern).toBe('^[A-Za-z0-9_-]{1,32}$');
  });

  it('lists active products only, then includes inactive ones on request', async () => {
    const deactivated = await request(app)
      .put('/v1/subscription-products/LIFE-1')
      .set(writeHeaders)
      .send({ active: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.active).toBe(false);

    const active = await request(app).get('/v1/subscription-products').set(readHeaders);
    expect(active.status).toBe(200);
    expect(active.body.items.map((item: { code: string }) => item.code)).not.toContain('LIFE-1');

    const all = await request(app)
      .get('/v1/subscription-products')
      .query({ includeInactive: 'true' })
      .set(readHeaders);
    expect(all.body.items.map((item: { code: string }) => item.code)).toContain('LIFE-1');

    const unknown = await request(app)
      .put('/v1/subscription-products/NOPE')
      .set(writeHeaders)
      .send({ active: true });
    expect(unknown.status).toBe(404);
  });
});
