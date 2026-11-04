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
      firstName: 'Member',
      lastName: memberNo,
      gender: 'undisclosed',
      joinedOn: '2026-01-01',
      ...extra,
    });
  expect(response.status).toBe(201);
  return response;
}

describe('contacts', () => {
  it('refuses a duplicate contact value, on insert and on update', async () => {
    const owner = await create('S-1001', {
      contacts: [{ kind: 'phone', value: '0803 000 0001' }],
    });
    await create('S-1002', { contacts: [{ kind: 'phone', value: '0803 000 0002' }] });

    const duplicate = await request(app)
      .post('/v1/members/S-1002/contacts')
      .set(writeHeaders)
      .send({ kind: 'phone', value: '08030000001' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('conflict');
    expect(duplicate.body.detail).toContain('already belongs');

    const contactId = owner.body.contacts[0].id as string;
    const updated = await request(app)
      .put(`/v1/members/S-1001/contacts/${contactId}`)
      .set(writeHeaders)
      .send({ kind: 'phone', value: '08030000002' });

    expect(updated.status).toBe(409);
    expect(updated.body.code).toBe('conflict');
  });

  it('links and unlinks a shared contact with the documented rules', async () => {
    const guardian = await create('S-2001', {
      contacts: [{ kind: 'phone', value: '0803 000 0003' }],
    });
    await create('S-2002');
    const contactId = guardian.body.contacts[0].id as string;

    const own = await request(app)
      .post('/v1/members/S-2001/contacts/link')
      .set(writeHeaders)
      .send({ contactId });
    expect(own.status).toBe(409);
    expect(own.body.detail).toContain('already owns');

    const missing = await request(app)
      .post('/v1/members/S-2002/contacts/link')
      .set(writeHeaders)
      .send({ contactId: '00000000-0000-0000-0000-000000000000' });
    expect(missing.status).toBe(404);

    const linked = await request(app)
      .post('/v1/members/S-2002/contacts/link')
      .set(writeHeaders)
      .send({ contactId });
    expect(linked.status).toBe(201);
    expect(linked.body.linked).toBe(true);
    expect(linked.body.ownerMemberNo).toBe('S-2001');

    const again = await request(app)
      .post('/v1/members/S-2002/contacts/link')
      .set(writeHeaders)
      .send({ contactId });
    expect(again.status).toBe(409);
    expect(again.body.detail).toContain('already linked');

    await request(app)
      .delete(`/v1/members/S-2002/contacts/link/${contactId}`)
      .set(writeHeaders)
      .expect(204);

    const gone = await request(app)
      .delete(`/v1/members/S-2002/contacts/link/${contactId}`)
      .set(writeHeaders);
    expect(gone.status).toBe(404);
  });

  it('removes an owned contact and reports a missing one', async () => {
    const owner = await create('S-2101', {
      contacts: [{ kind: 'email', value: 'owner@example.test' }],
    });
    const contactId = owner.body.contacts[0].id as string;

    await request(app)
      .delete(`/v1/members/S-2101/contacts/${contactId}`)
      .set(writeHeaders)
      .expect(204);

    const view = await request(app).get('/v1/members/S-2101').set(readHeaders).expect(200);
    expect(view.body.contacts).toHaveLength(0);

    const missing = await request(app)
      .delete(`/v1/members/S-2101/contacts/${contactId}`)
      .set(writeHeaders);
    expect(missing.status).toBe(404);
  });
});

describe('subscriptions and coverage', () => {
  it('refuses overlapping active coverage', async () => {
    await create('S-3001');
    await create('S-3002');

    const created = await request(app)
      .post('/v1/members/S-3001/subscriptions')
      .set(writeHeaders)
      .send({
        kind: 'life_insurance',
        scope: 'household',
        coveredMemberNos: ['S-3002'],
      });
    expect(created.status).toBe(201);

    const overlap = await request(app)
      .post(`/v1/subscriptions/${created.body.id}/coverage`)
      .set(writeHeaders)
      .send({ memberNo: 'S-3002' });

    expect(overlap.status).toBe(409);
    expect(overlap.body.code).toBe('conflict');
    expect(overlap.body.detail).toContain('already covered');
  });

  it('adds and removes coverage on an active household policy', async () => {
    await create('S-3101');
    await create('S-3102');

    const created = await request(app)
      .post('/v1/members/S-3101/subscriptions')
      .set(writeHeaders)
      .send({ kind: 'credit_union', scope: 'household' });
    expect(created.status).toBe(201);

    await request(app)
      .post(`/v1/subscriptions/${created.body.id}/coverage`)
      .set(writeHeaders)
      .send({ memberNo: 'S-3102' })
      .expect(204);

    const covered = await request(app).get('/v1/members/S-3102').set(readHeaders).expect(200);
    expect(covered.body.subscriptions[0]).toMatchObject({
      role: 'covered',
      policyholderMemberNo: 'S-3101',
    });

    await request(app)
      .delete(`/v1/subscriptions/${created.body.id}/coverage/S-3102`)
      .set(writeHeaders)
      .expect(204);

    const removed = await request(app).get('/v1/members/S-3102').set(readHeaders).expect(200);
    expect(removed.body.subscriptions).toHaveLength(0);
  });

  it('ends a subscription once', async () => {
    await create('S-3201');

    const created = await request(app)
      .post('/v1/members/S-3201/subscriptions')
      .set(writeHeaders)
      .send({ kind: 'life_insurance', scope: 'individual', startedOn: '2026-01-01' });
    expect(created.status).toBe(201);

    await request(app)
      .delete(`/v1/members/S-3201/subscriptions/${created.body.id}`)
      .set(writeHeaders)
      .expect(204);

    const view = await request(app).get('/v1/members/S-3201').set(readHeaders).expect(200);
    expect(view.body.subscriptions[0].status).toBe('ended');
    expect(view.body.subscriptions[0].endedOn).toBeTruthy();

    const second = await request(app)
      .delete(`/v1/members/S-3201/subscriptions/${created.body.id}`)
      .set(writeHeaders);
    expect(second.status).toBe(404);
  });

  it('summarises policyholder and covered rows in one page-level listing', async () => {
    await create('S-3301');
    await create('S-3302');
    await create('S-3303');

    const created = await request(app)
      .post('/v1/members/S-3301/subscriptions')
      .set(writeHeaders)
      .send({
        kind: 'life_insurance',
        scope: 'household',
        reference: 'POL-3301',
        coveredMemberNos: ['S-3302', 'S-3303'],
      });
    expect(created.status).toBe(201);

    const holder = await request(app)
      .get('/v1/members')
      .query({ q: 'S-3301', include: 'subscriptions' })
      .set(readHeaders);
    expect(holder.status).toBe(200);
    expect(holder.body.items[0].subscriptions).toEqual([
      {
        id: created.body.id,
        kind: 'life_insurance',
        scope: 'household',
        status: 'active',
        role: 'policyholder',
        policyholderMemberNo: 'S-3301',
        coveredCount: 2,
      },
    ]);
    expect(holder.body.items[0]).not.toHaveProperty('contacts');

    const covered = await request(app)
      .get('/v1/members')
      .query({ q: 'S-3302', include: 'subscriptions' })
      .set(readHeaders);
    expect(covered.status).toBe(200);
    expect(covered.body.items[0].subscriptions).toEqual([
      {
        id: created.body.id,
        kind: 'life_insurance',
        scope: 'household',
        status: 'active',
        role: 'covered',
        policyholderMemberNo: 'S-3301',
        coveredCount: 2,
      },
    ]);
  });
});

describe('shepherding calls', () => {
  it('is append-only: logs, lists and exposes no update or delete route', async () => {
    await create('S-4001', { isPresbyter: true });
    await create('S-4002');

    const assignment = await request(app)
      .post('/v1/shepherding/assignments')
      .set(writeHeaders)
      .send({ officerMemberNo: 'S-4001', memberNo: 'S-4002', assignedOn: '2026-01-01' });
    expect(assignment.status).toBe(201);
    const assignmentId = assignment.body.id as string;

    const logged = await request(app)
      .post(`/v1/shepherding/assignments/${assignmentId}/calls`)
      .set(writeHeaders)
      .send({
        calledOn: '2026-01-05',
        outcome: 'reached',
        stillInChurch: 'yes',
        feedback: 'Back at work.',
      });
    expect(logged.status).toBe(201);
    expect(logged.body).toMatchObject({
      assignmentId,
      calledOn: '2026-01-05',
      outcome: 'reached',
      stillInChurch: 'yes',
      feedback: 'Back at work.',
      recordedBy: 'test-admin',
    });

    const listed = await request(app)
      .get(`/v1/shepherding/assignments/${assignmentId}/calls`)
      .set(readHeaders)
      .expect(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].id).toBe(logged.body.id);
    expect(listed.body.items[0].outcome).toBe('reached');

    const callId = logged.body.id as string;
    const update = await request(app)
      .put(`/v1/shepherding/assignments/${assignmentId}/calls/${callId}`)
      .set(writeHeaders)
      .send({ feedback: 'Corrected.' });
    expect(update.status).toBe(404);
    expect(update.body.code).toBe('route_not_found');

    const removed = await request(app)
      .delete(`/v1/shepherding/assignments/${assignmentId}/calls/${callId}`)
      .set(writeHeaders);
    expect(removed.status).toBe(404);
    expect(removed.body.code).toBe('route_not_found');

    const view = await request(app).get('/v1/members/S-4002/shepherding').set(readHeaders);
    expect(view.body.recentCalls).toHaveLength(1);
    expect(view.body.recentCalls[0].id).toBe(callId);
  });
});
