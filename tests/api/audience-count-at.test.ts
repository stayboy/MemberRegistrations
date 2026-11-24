import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { reachableContacts } from '../helpers/member-fixtures.js';

/**
 * `GET /v1/audiences?countAt=` (member-registrations-event-periods.md,
 * "Counts"): each audience's own member count at that UTC date. Without
 * `countAt` the field is absent - there is no invented default date - and the
 * form's headline is the intersection, which is a different number.
 */
let harness: TestApp;
let app: TestApp['app'];
let everyoneId: string;

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const [everyone] = await harness.db.query<{ id: string }>(
    `select id from audiences where system_key = 'everyone'`,
  );
  everyoneId = everyone!.id;

  // One member joined after the earlier count date, so the two counts differ.
  const created = await request(app).post('/v1/members').set(writeHeaders).send({
    memberNo: 'COUNT-LATER',
    firstName: 'Count',
    lastName: 'Later',
    joinedOn: '2026-06-01',
    contacts: reachableContacts(),
  });
  expect(created.status).toBe(201);
});

afterAll(async () => {
  await harness.close();
});

async function everyoneItem(countAt?: string) {
  const query = countAt ? { countAt } : {};
  const response = await request(app).get('/v1/audiences').query(query).set(readHeaders);
  expect(response.status).toBe(200);
  const item = (response.body.items as Array<{ id: string; memberCount?: number }>).find(
    (audience) => audience.id === everyoneId,
  );
  expect(item).toBeTruthy();
  return item!;
}

describe('audience memberCount at a date', () => {
  it('omits memberCount when no countAt is supplied', async () => {
    const item = await everyoneItem();
    expect('memberCount' in item).toBe(false);
  });

  it('counts a member who joined later as absent at an earlier date', async () => {
    expect((await everyoneItem('2026-01-01')).memberCount).toBe(0);
  });

  it('counts that member once the date reaches their join date', async () => {
    expect((await everyoneItem('2026-06-01')).memberCount).toBe(1);
  });

  it("differs from today's count for a member who joined later", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const now = await everyoneItem(today);
    const then = await everyoneItem('2026-01-01');

    expect(now.memberCount).toBe(1);
    expect(now.memberCount).not.toBe(then.memberCount);
  });

  it('refuses a countAt that is not an ISO date', async () => {
    const response = await request(app)
      .get('/v1/audiences')
      .query({ countAt: '24/11/2026' })
      .set(readHeaders);
    expect(response.status).toBe(422);
  });
});
