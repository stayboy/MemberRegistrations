import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemberRepository } from '../../src/repos/members.js';
import { ShepherdingRepository } from '../../src/repos/shepherding.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];
let members: MemberRepository;
let shepherding: ShepherdingRepository;

const UNASSIGNED = ['A-9001', 'A-9002', 'A-9003', 'P-9001'];

async function create(memberNo: string, extra: Record<string, unknown> = {}): Promise<void> {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Test',
      lastName: memberNo,
      joinedOn: '2026-01-01',
      ...extra,
    });
  expect(response.status).toBe(201);
}

function memberNos(items: readonly { memberNo: string }[]): string[] {
  return items.map((item) => item.memberNo).sort();
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
  members = new MemberRepository(harness.db);
  shepherding = new ShepherdingRepository(harness.db);

  await create('P-9001', { isPresbyter: true });
  await create('A-9001');
  await create('A-9002');
  await create('A-9003');
  await create('A-9004');
  await create('A-9005');

  await request(app)
    .post('/v1/shepherding/assignments')
    .set(writeHeaders)
    .send({ officerMemberNo: 'P-9001', memberNo: 'A-9004', assignedOn: '2026-01-01' })
    .expect(201);

  await request(app).delete('/v1/members/A-9005').set(writeHeaders).expect(204);
});

afterAll(async () => {
  await harness.close();
});

describe('unassigned members filter', () => {
  it('lists exactly the active members with no active shepherding assignment', async () => {
    const page = await members.list({ unassigned: true, limit: 100 });
    expect(memberNos(page.items)).toEqual(UNASSIGNED);
  });

  it('agrees with the church report count for the same fixture', async () => {
    const page = await members.list({ unassigned: true, limit: 100 });
    const report = await shepherding.report();

    expect(report.totals.unassignedMembers).toBe(page.items.length);
    expect(report.totals.activeMembers).toBe(page.items.length + report.totals.assignedMembers);
  });

  it('combines unassigned with q', async () => {
    const page = await members.list({ unassigned: true, q: 'A-900', limit: 100 });
    expect(memberNos(page.items)).toEqual(['A-9001', 'A-9002', 'A-9003']);
  });

  it('serves the filter through the route with cursor pagination', async () => {
    const first = await request(app)
      .get('/v1/members')
      .query({ unassigned: 'true', limit: 2 })
      .set(readHeaders);

    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await request(app)
      .get('/v1/members')
      .query({ unassigned: 'true', limit: 2, cursor: first.body.nextCursor })
      .set(readHeaders);

    expect(second.status).toBe(200);
    const collected = memberNos([...first.body.items, ...second.body.items]);
    expect(collected).toEqual(UNASSIGNED);
  });

  it('combines the route filter with q and never returns the assigned member', async () => {
    const response = await request(app)
      .get('/v1/members')
      .query({ unassigned: 'true', q: 'A-9004' })
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('rejects any value other than true', async () => {
    for (const value of ['false', '1', 'yes']) {
      const response = await request(app)
        .get('/v1/members')
        .query({ unassigned: value })
        .set(readHeaders);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('validation_error');
    }
  });

  it('rejects unassigned combined with the archived status', async () => {
    const response = await request(app)
      .get('/v1/members')
      .query({ unassigned: 'true', status: 'archived' })
      .set(readHeaders);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('unassigned');
  });
});
