import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const presbyters = [
    ['P-1001', 'male', 40],
    ['P-1002', 'male', 45],
    ['P-1003', 'male', 38],
    ['P-1004', 'male', 50],
  ] as const;
  for (const [memberNo, gender, years] of presbyters) {
    await create(memberNo, {
      firstName: 'Presbyter',
      lastName: memberNo,
      isPresbyter: true,
      gender,
      dob: dobYearsAgo(years),
    });
  }

  await create('M-2001', {
    firstName: 'Ama',
    lastName: 'Mensah',
    gender: 'female',
    dob: dobYearsAgo(30),
    contacts: [{ kind: 'phone', value: '0801 234 5678' }],
  });
  await create('M-2002', { firstName: 'Kofi', lastName: 'Mensah' });
  await create('M-2003', { firstName: 'Yaa', lastName: 'Mensah' });
  await create('A-3001', { firstName: 'Ordinary', lastName: 'Member' });
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
  return response.body as Record<string, unknown>;
}

/** 1 January `years` ago: exactly `years` completed years on any later date. */
function dobYearsAgo(years: number): string {
  return `${new Date().getUTCFullYear() - years}-01-01`;
}

async function assign(body: Record<string, unknown>) {
  return request(app).post('/v1/shepherding/assignments').set(writeHeaders).send(body);
}

async function logCall(assignmentId: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/v1/shepherding/assignments/${assignmentId}/calls`)
    .set(writeHeaders)
    .send(body);
}

describe('eligibility', () => {
  it('refuses an officer who is not a presbyter', async () => {
    const response = await assign({ officerMemberNo: 'A-3001', memberNo: 'M-2001' });
    expect(response.status).toBe(422);
    expect(response.body.detail).toContain('not a presbyter');
  });

  it('refuses self-shepherding', async () => {
    const response = await assign({ officerMemberNo: 'P-1001', memberNo: 'P-1001' });
    expect(response.status).toBe(422);
  });
});

describe('assignments', () => {
  it('creates one and exposes it from the member side', async () => {
    const created = await assign({
      officerMemberNo: 'P-1001',
      memberNo: 'M-2001',
      assignedOn: '2026-01-01',
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      officerMemberNo: 'P-1001',
      officerGender: 'male',
      officerAge: 40,
      memberNo: 'M-2001',
      memberGender: 'female',
      memberAge: 30,
    });

    const view = await request(app).get('/v1/members/M-2001/shepherding').set(readHeaders);
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ gender: 'female', age: 30 });
    expect(view.body.shepherd).toMatchObject({
      assignmentId: created.body.id,
      memberNo: 'P-1001',
      gender: 'male',
      age: 40,
    });
    expect(view.body.history).toHaveLength(1);
    expect(view.body.history[0]).toMatchObject({ officerGender: 'male', officerAge: 40 });
  });

  it('refuses assigning the same officer twice', async () => {
    const response = await assign({ officerMemberNo: 'P-1001', memberNo: 'M-2001' });
    expect(response.status).toBe(409);
    expect(response.body.detail).toContain('already assigned');
  });

  it('requires consent and a reason to reassign', async () => {
    const blocked = await assign({ officerMemberNo: 'P-1002', memberNo: 'M-2001' });

    expect(blocked.status).toBe(409);
    expect(blocked.body.currentAssignment).toMatchObject({ officerMemberNo: 'P-1001' });
    const currentAssignmentId = blocked.body.currentAssignment.id as string;

    const stale = await assign({
      officerMemberNo: 'P-1002',
      memberNo: 'M-2001',
      replaceAssignmentId: '00000000-0000-0000-0000-000000000000',
      reason: 'rebalancing the list',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.currentAssignment.id).toBe(currentAssignmentId);

    const noReason = await assign({
      officerMemberNo: 'P-1002',
      memberNo: 'M-2001',
      replaceAssignmentId: currentAssignmentId,
    });
    expect(noReason.status).toBe(422);
    expect(noReason.body.detail).toContain('reason');

    const replaced = await assign({
      officerMemberNo: 'P-1002',
      memberNo: 'M-2001',
      assignedOn: '2026-01-02',
      replaceAssignmentId: currentAssignmentId,
      reason: 'rebalancing the list',
    });

    expect(replaced.status).toBe(201);
    expect(replaced.body.reason).toBe('rebalancing the list');

    const view = await request(app).get('/v1/members/M-2001/shepherding').set(readHeaders);
    expect(view.body.shepherd.memberNo).toBe('P-1002');
    expect(view.body.history).toHaveLength(2);
    expect(view.body.history[1].endedReason).toBe('rebalancing the list');

    const oldRoster = await request(app)
      .get('/v1/shepherding/officers/P-1001/members')
      .set(readHeaders);
    expect(oldRoster.body.items).toHaveLength(0);

    const newRoster = await request(app)
      .get('/v1/shepherding/officers/P-1002/members')
      .set(readHeaders);
    expect(newRoster.body.items).toHaveLength(1);
    expect(newRoster.body.items[0]).toMatchObject({
      memberNo: 'M-2001',
      gender: 'female',
      age: 30,
    });
    expect(newRoster.body.items[0].contactCount).toBe(1);
    expect(newRoster.body.items[0]).not.toHaveProperty('contacts');
    expect(JSON.stringify(newRoster.body)).not.toContain('0801 234 5678');
  });

  it('counts owned and linked contacts without returning their values', async () => {
    await create('M-2004', {
      firstName: 'Linked',
      lastName: 'Contact',
      contacts: [{ kind: 'phone', value: '0804 000 0004' }],
    });
    const guardian = await create('M-2005', {
      firstName: 'Guardian',
      lastName: 'Contact',
      contacts: [{ kind: 'phone', value: '0804 000 0005' }],
    });
    const guardianContact = (guardian.contacts as Array<{ id: string }>)[0]!;

    await request(app)
      .post('/v1/members/M-2004/contacts/link')
      .set(writeHeaders)
      .send({ contactId: guardianContact.id })
      .expect(201);

    const created = await assign({
      officerMemberNo: 'P-1001',
      memberNo: 'M-2004',
      assignedOn: '2026-01-05',
    });
    expect(created.status).toBe(201);

    const roster = await request(app)
      .get('/v1/shepherding/officers/P-1001/members')
      .set(readHeaders);
    const entry = roster.body.items.find(
      (item: { memberNo: string }) => item.memberNo === 'M-2004',
    );

    expect(entry.contactCount).toBe(2);
    expect(entry).not.toHaveProperty('contacts');
    expect(JSON.stringify(roster.body)).not.toContain('0804 000');
  });
});

describe('calls', () => {
  let assignmentId: string;

  beforeAll(async () => {
    const roster = await request(app)
      .get('/v1/shepherding/officers/P-1002/members')
      .set(readHeaders);
    assignmentId = roster.body.items[0].assignmentId as string;
  });

  it('counts every attempt, but conversations only when reached', async () => {
    const reached = await logCall(assignmentId, {
      calledOn: '2026-01-10',
      outcome: 'reached',
      stillInChurch: 'yes',
      feedback: 'Doing well, back at work.',
      issue: null,
    });
    expect(reached.status).toBe(201);
    expect(reached.body.stillInChurch).toBe('yes');

    const missed = await logCall(assignmentId, {
      calledOn: '2026-01-11',
      outcome: 'no_answer',
    });
    expect(missed.status).toBe(201);
    expect(missed.body.stillInChurch).toBe('unknown');

    const roster = await request(app)
      .get('/v1/shepherding/officers/P-1002/members')
      .query({ from: '2026-01-01', to: '2026-01-31' })
      .set(readHeaders);

    const entry = roster.body.items[0];
    expect(entry.attempts).toBe(2);
    expect(entry.conversations).toBe(1);
    expect(entry.lastCalledOn).toBe('2026-01-11');
    expect(entry.stillInChurch).toBe('yes');
    expect(entry.latestFeedback).toBe('Doing well, back at work.');
  });

  it('does not let unknown erase a known status', async () => {
    await logCall(assignmentId, { calledOn: '2026-01-12', outcome: 'no_answer' });

    const view = await request(app).get('/v1/members/M-2001/shepherding').set(readHeaders);
    expect(view.body.stillInChurch).toBe('yes');
    expect(view.body.calls.attempts).toBe(3);
  });

  it('requires stillInChurch when the call was reached', async () => {
    const response = await logCall(assignmentId, {
      calledOn: '2026-01-13',
      outcome: 'reached',
    });
    expect(response.status).toBe(422);
    expect(response.body.detail).toContain('stillInChurch');
  });

  it('rejects future calls and calls before the assignment', async () => {
    const future = await logCall(assignmentId, { calledOn: '2999-01-01', outcome: 'no_answer' });
    expect(future.status).toBe(422);

    const before = await logCall(assignmentId, {
      calledOn: '2025-12-31',
      outcome: 'no_answer',
    });
    expect(before.status).toBe(422);
  });

  it('is append-only: no delete route exists', async () => {
    const response = await request(app)
      .delete('/v1/shepherding/calls/00000000-0000-0000-0000-000000000000')
      .set(writeHeaders);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('route_not_found');
  });

  it('refuses calls on an ended assignment', async () => {
    const view = await request(app).get('/v1/members/M-2001/shepherding').set(readHeaders);
    const ended = view.body.history.find((item: { endedOn: string | null }) => item.endedOn);

    const response = await logCall(ended.assignmentId, {
      calledOn: '2026-01-20',
      outcome: 'no_answer',
    });
    expect(response.status).toBe(409);
  });
});

describe('reporting', () => {
  it('reports coverage and per-officer counts for a window', async () => {
    const response = await request(app)
      .get('/v1/shepherding/report')
      .query({ from: '2026-01-01', to: '2026-01-31' })
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body.totals.officers).toBeGreaterThanOrEqual(2);
    expect(response.body.totals.assignedMembers).toBeGreaterThanOrEqual(1);
    expect(response.body.totals.attempts).toBeGreaterThanOrEqual(3);
    expect(response.body.totals.conversations).toBeGreaterThanOrEqual(1);

    const officer = response.body.officers.find(
      (item: { memberNo: string }) => item.memberNo === 'P-1002',
    );
    expect(officer).toMatchObject({
      gender: 'male',
      age: 45,
      assignedMembers: 1,
      attempts: 3,
      conversations: 1,
      membersNeverCalled: 0,
      lastCalledOn: '2026-01-12',
    });
  });
});

describe('orphan protection', () => {
  it('refuses clearing the flag or archiving while a list exists', async () => {
    const assignment = await assign({
      officerMemberNo: 'P-1003',
      memberNo: 'M-2002',
      assignedOn: '2026-01-01',
    });
    expect(assignment.status).toBe(201);

    const clear = await request(app)
      .put('/v1/members/P-1003')
      .set(writeHeaders)
      .send({ isPresbyter: false });
    expect(clear.status).toBe(409);

    const archive = await request(app).delete('/v1/members/P-1003').set(writeHeaders);
    expect(archive.status).toBe(409);

    await request(app)
      .delete(`/v1/shepherding/assignments/${assignment.body.id}`)
      .set(writeHeaders)
      .expect(204);

    const cleared = await request(app)
      .put('/v1/members/P-1003')
      .set(writeHeaders)
      .send({ isPresbyter: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body.isPresbyter).toBe(false);
  });

  it('ends the assignment when the shepherded member is archived', async () => {
    const assignment = await assign({
      officerMemberNo: 'P-1004',
      memberNo: 'M-2003',
      assignedOn: '2026-01-01',
    });
    expect(assignment.status).toBe(201);

    await request(app).delete('/v1/members/M-2003').set(writeHeaders).expect(204);
    await request(app).get('/v1/members/M-2003/shepherding').set(readHeaders).expect(404);
    await request(app).post('/v1/members/M-2003/restore').set(writeHeaders).expect(200);

    const view = await request(app).get('/v1/members/M-2003/shepherding').set(readHeaders);
    expect(view.body.shepherd).toBeNull();
    expect(view.body.history[0].endedReason).toBe('member archived');
  });

  it('purge erases shepherding history in both roles', async () => {
    const assignment = await assign({
      officerMemberNo: 'P-1004',
      memberNo: 'M-2003',
      assignedOn: '2026-01-02',
    });
    expect(assignment.status).toBe(201);
    const call = await logCall(assignment.body.id, {
      calledOn: '2026-01-03',
      outcome: 'reached',
      stillInChurch: 'no',
    });
    expect(call.status).toBe(201);

    await request(app)
      .post('/v1/members/M-2003/purge')
      .set(writeHeaders)
      .send({ confirm: 'M-2003' })
      .expect(204);

    const roster = await request(app)
      .get('/v1/shepherding/officers/P-1004/members')
      .set(readHeaders);
    expect(roster.body.items).toHaveLength(0);
  });
});

describe('contract', () => {
  it('documents shepherding in OpenAPI', async () => {
    const response = await request(app).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.info.version).toBe('2.2.0');
    expect(response.body.paths['/v1/shepherding/assignments']).toBeTruthy();
    expect(response.body.paths['/v1/members/{memberNo}/shepherding']).toBeTruthy();
    expect(response.body.components.schemas.MemberShepherding).toBeTruthy();
  });
});
