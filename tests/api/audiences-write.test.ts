import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];

const rule = {
  operator: 'allOf',
  clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: 30 }],
};

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/audiences', () => {
  it('creates a custom audience with Location and the actor recorded', async () => {
    const response = await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({ name: 'Young Adults', rule });

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/v1/audiences/${response.body.id}`);
    expect(response.body).toMatchObject({
      name: 'Young Adults',
      system: false,
      systemKey: null,
      active: true,
      createdBy: 'test-admin',
      updatedBy: 'test-admin',
    });
    expect(response.body.summary).toContain('age 18-30');

    const [row] = await harness.db.query<{
      name: string;
      system: boolean;
      active: boolean;
      created_by: string;
    }>('select name, system, active, created_by from audiences where id = $1', [response.body.id]);
    expect(row).toMatchObject({
      name: 'Young Adults',
      system: false,
      active: true,
      created_by: 'test-admin',
    });
  });

  it('refuses a duplicate name with audience_name_in_use and names the field', async () => {
    await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({ name: 'Duplicate Group', rule })
      .expect(201);

    const duplicate = await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({ name: 'duplicate group', rule });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('audience_name_in_use');
    expect(duplicate.body.detail).toContain('name');
  });

  it('refuses an unknown ministry code in the rule', async () => {
    const response = await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({
        name: 'No Such Ministry',
        rule: {
          operator: 'allOf',
          clauses: [{ attribute: 'ministry', ministryCode: 'NOPE' }],
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('ministryCode');
  });
});

describe('PUT /v1/audiences/{id}', () => {
  it('refuses a system audience with audience_system', async () => {
    const [everyone] = await harness.db.query<{ id: string }>(
      `select id from audiences where system_key = 'everyone'`,
    );

    const response = await request(app)
      .put(`/v1/audiences/${everyone!.id}`)
      .set(writeHeaders)
      .send({ name: 'Everyone Renamed' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('audience_system');
  });

  it('edits a custom audience name and rule, then archives it with active false', async () => {
    const created = await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({ name: 'Evening Circle', rule })
      .expect(201);

    const edited = await request(app)
      .put(`/v1/audiences/${created.body.id}`)
      .set(writeHeaders)
      .send({
        name: 'Evening Circle 18-35',
        rule: {
          operator: 'anyOf',
          clauses: [
            { attribute: 'ageBand', minYears: 18, maxYears: 35 },
            { attribute: 'ministry', ministryCode: 'CHOIR' },
          ],
        },
      });

    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      name: 'Evening Circle 18-35',
      active: true,
      updatedBy: 'test-admin',
    });
    expect(edited.body.summary).toContain('any of');

    const archived = await request(app)
      .put(`/v1/audiences/${created.body.id}`)
      .set(writeHeaders)
      .send({ active: false });

    expect(archived.status).toBe(200);
    expect(archived.body.active).toBe(false);

    const [row] = await harness.db.query<{ active: boolean; updated_by: string }>(
      'select active, updated_by from audiences where id = $1',
      [created.body.id],
    );
    expect(row).toMatchObject({ active: false, updated_by: 'test-admin' });

    const hidden = await request(app).get('/v1/audiences').set(readHeaders);
    expect(hidden.body.items.map((item: { id: string }) => item.id)).not.toContain(created.body.id);

    const included = await request(app)
      .get('/v1/audiences')
      .query({ includeArchived: 'true' })
      .set(readHeaders);
    expect(included.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);
  });

  it('refuses a rename that collides with another audience', async () => {
    await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({ name: 'First Name', rule })
      .expect(201);
    const second = await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({ name: 'Second Name', rule })
      .expect(201);

    const response = await request(app)
      .put(`/v1/audiences/${second.body.id}`)
      .set(writeHeaders)
      .send({ name: 'First Name' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('audience_name_in_use');
    expect(response.body.detail).toContain('name');
  });

  it('returns 404 for an unknown audience and has no delete route', async () => {
    const unknown = await request(app)
      .put('/v1/audiences/00000000-0000-4000-8000-000000000000')
      .set(writeHeaders)
      .send({ name: 'Ghost' });
    expect(unknown.status).toBe(404);

    const created = await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({ name: 'No Delete Group', rule })
      .expect(201);

    const deleted = await request(app).delete(`/v1/audiences/${created.body.id}`).set(writeHeaders);
    expect(deleted.status).toBe(404);
    expect(deleted.body.code).toBe('route_not_found');
  });
});
