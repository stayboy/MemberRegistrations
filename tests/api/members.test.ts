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

async function create(memberNo: string, extra: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Ama',
      lastName: 'Mensah',
      gender: 'female',
      joinedOn: '2026-01-01',
      ...extra,
    });
  expect(response.status).toBe(201);
  return response;
}

describe('authentication and attribution', () => {
  it('rejects requests without a bearer token', async () => {
    const response = await request(app).get('/v1/members');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('unauthorized');
  });

  it('rejects writes without X-Actor-Id', async () => {
    const response = await request(app)
      .post('/v1/members')
      .set({ Authorization: writeHeaders.Authorization })
      .send({ memberNo: 'M-NOACTOR', firstName: 'A', lastName: 'B' });
    expect(response.status).toBe(422);
    expect(response.body.detail).toContain('X-Actor-Id');
  });
});

describe('member lifecycle', () => {
  it('creates a member with an ETag and a Location header', async () => {
    const response = await create('M-1001', {
      otherNames: 'Adwoa',
      contacts: [{ kind: 'phone', value: '0801 234 5678' }],
      ministries: ['CHOIR'],
    });

    expect(response.headers.etag).toMatch(/^"v\d+"$/);
    expect(response.headers.location).toBe('/v1/members/M-1001');
    expect(response.body.contacts[0].value).toBe('0801 234 5678');
    expect(response.body.ministries[0].code).toBe('CHOIR');
  });

  it('rejects a duplicate member number case-insensitively', async () => {
    const response = await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({ memberNo: 'm-1001', firstName: 'Other', lastName: 'Person' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('conflict');
  });

  it('finds a member by a shared contact value', async () => {
    await create('M-1002', { contacts: [{ kind: 'phone', value: '+234 801 234 5678' }] });

    const response = await request(app)
      .get('/v1/members')
      .query({ contact: '08012345678' })
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { memberNo: string }) => item.memberNo)).toContain(
      'M-1001',
    );
  });

  it('rejects a stale If-Match', async () => {
    const created = await create('M-1003');
    const stale = created.headers.etag as string;

    await request(app)
      .put('/v1/members/M-1003')
      .set({ ...writeHeaders, 'If-Match': stale })
      .send({ placeOfResidence: 'Accra' })
      .expect(200);

    const response = await request(app)
      .put('/v1/members/M-1003')
      .set({ ...writeHeaders, 'If-Match': stale })
      .send({ placeOfResidence: 'Kumasi' });

    expect(response.status).toBe(409);
  });

  it('hides an archived member, then restores it', async () => {
    await create('M-1004');

    await request(app).delete('/v1/members/M-1004').set(writeHeaders).expect(204);
    await request(app).get('/v1/members/M-1004').set(readHeaders).expect(404);

    const archived = await request(app)
      .get('/v1/members/M-1004')
      .query({ includeArchived: 'true' })
      .set(readHeaders);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).toBeTruthy();

    await request(app).post('/v1/members/M-1004/restore').set(writeHeaders).expect(200);
    await request(app).get('/v1/members/M-1004').set(readHeaders).expect(200);
  });

  it('purges PII but keeps the member number reserved', async () => {
    await create('M-1005', { alias: 'Ama' });

    await request(app)
      .post('/v1/members/M-1005/purge')
      .set(writeHeaders)
      .send({ confirm: 'M-1005' })
      .expect(204);

    await request(app)
      .get('/v1/members/M-1005')
      .query({ includeArchived: 'true' })
      .set(readHeaders)
      .expect(404);

    const recreate = await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({ memberNo: 'M-1005', firstName: 'New', lastName: 'Person' });

    expect(recreate.status).toBe(409);
  });
});

describe('contacts', () => {
  it('refuses to store the same value twice across members', async () => {
    await create('M-2001', { contacts: [{ kind: 'phone', value: '0802 000 0001' }] });
    await create('M-2002');

    const response = await request(app)
      .post('/v1/members/M-2002/contacts')
      .set(writeHeaders)
      .send({ kind: 'phone', value: '08020000001' });

    expect(response.status).toBe(409);
  });

  it('links a dependent to the guardian contact instead of copying it', async () => {
    const guardian = await create('M-2003', {
      contacts: [{ kind: 'phone', value: '0802 000 0003' }],
    });
    await create('M-2004');
    const contactId = guardian.body.contacts[0].id as string;

    const linked = await request(app)
      .post('/v1/members/M-2004/contacts/link')
      .set(writeHeaders)
      .send({ contactId });

    expect(linked.status).toBe(201);
    expect(linked.body.linked).toBe(true);
    expect(linked.body.ownerMemberNo).toBe('M-2003');

    const lookup = await request(app).get('/v1/members/M-2004').set(readHeaders);

    expect(lookup.body.contacts).toHaveLength(1);
    expect(lookup.body.contacts[0].linked).toBe(true);
  });
});

describe('relationships', () => {
  it('creates one spouse edge and refuses a second', async () => {
    await create('M-3001');
    await create('M-3002');
    await create('M-3003');

    await request(app)
      .post('/v1/members/M-3001/relationships')
      .set(writeHeaders)
      .send({ relatedMemberNo: 'M-3002', type: 'spouse' })
      .expect(201);

    const second = await request(app)
      .post('/v1/members/M-3001/relationships')
      .set(writeHeaders)
      .send({ relatedMemberNo: 'M-3003', type: 'spouse' });

    expect(second.status).toBe(409);
  });

  it('reads the relationship from the other side too', async () => {
    const response = await request(app).get('/v1/members/M-3002/relationships').set(readHeaders);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].memberNo).toBe('M-3001');
    expect(response.body.items[0].type).toBe('spouse');
  });

  it('refuses a self relationship', async () => {
    const response = await request(app)
      .post('/v1/members/M-3001/relationships')
      .set(writeHeaders)
      .send({ relatedMemberNo: 'M-3001', type: 'other' });

    expect(response.status).toBe(422);
  });
});

describe('subscriptions', () => {
  it('records one household policy and shows it on a covered member', async () => {
    await create('M-4001');
    await create('M-4002', { firstName: 'Kofi' });

    const created = await request(app)
      .post('/v1/members/M-4001/subscriptions')
      .set(writeHeaders)
      .send({
        kind: 'life_insurance',
        scope: 'household',
        reference: 'POL-8842',
        coveredMemberNos: ['M-4002'],
      });

    expect(created.status).toBe(201);
    expect(created.body.coveredMemberNos).toEqual(['M-4002']);

    const covered = await request(app).get('/v1/members/M-4002').set(readHeaders);
    expect(covered.body.subscriptions).toHaveLength(1);
    expect(covered.body.subscriptions[0].role).toBe('covered');
    expect(covered.body.subscriptions[0].policyholderMemberNo).toBe('M-4001');
  });
});

describe('reference endpoints', () => {
  it('serves health and an OpenAPI document covering the new surface', async () => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const openapi = await request(app).get('/openapi.json');
    expect(openapi.status).toBe(200);
    expect(openapi.body.paths['/v1/members/{memberNo}/attendance']).toBeTruthy();
    expect(openapi.body.paths['/v1/imports/members']).toBeTruthy();
    expect(openapi.body.paths['/v1/imports/formats']).toBeTruthy();
    expect(openapi.body.paths['/v1/imports/events']).toBeUndefined();
  });

  it('refuses to delete a ministry that is referenced', async () => {
    const response = await request(app).delete('/v1/ministries/CHOIR').set(writeHeaders);
    expect(response.status).toBe(409);
  });
});
