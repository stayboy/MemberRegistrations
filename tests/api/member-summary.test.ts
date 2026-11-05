import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let today: string;
let offeringId: string;

interface SeedContribution {
  label: string;
  eventName: string;
  date: string;
  amountMinor: number;
  memberNo?: string;
  visitorName?: string;
  visitorPhone?: string;
}

const seeded: SeedContribution[] = [];

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function mondayOf(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return value.toISOString().slice(0, 10);
}

function quarterStartOf(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const month = Math.floor(value.getUTCMonth() / 3) * 3;
  return `${value.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}-01`;
}

function yearStartOf(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

async function insertEvent(name: string, date: string): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, venue_name, description, status, source, sessions
     )
     values ($1,null,$2,'UTC',$3,$3,'09:00',null,'auditorium',null,null,'scheduled','manual',$4::jsonb)
     returning id`,
    [
      `SUM-${name.replace(/\W/g, '').slice(0, 12)}-${Date.now()}-${seeded.length}`,
      name,
      date,
      JSON.stringify([{ date, startTime: '09:00', endTime: null, status: 'scheduled' }]),
    ],
  );
  await harness.db.query(
    `insert into event_instance_offerings (
       event_instance_id, series_id, offering_id, available_until, attached_by
     ) values ($1,null,$2,null,'test')`,
    [row!.id, offeringId],
  );
  return row!.id;
}

async function seedContribution(seed: SeedContribution): Promise<void> {
  const eventId = await insertEvent(seed.eventName, seed.date);
  const body: Record<string, unknown> = {
    offeringId,
    eventId,
    sessionDate: seed.date,
    amountMinor: seed.amountMinor,
    channel: 'manual',
    idempotencyKey: `summary-${seed.label}-${Date.now()}-${seeded.length}`,
  };
  if (seed.memberNo) {
    body.memberNo = seed.memberNo;
  } else {
    body.visitorName = seed.visitorName;
    body.visitorPhone = seed.visitorPhone;
  }
  const response = await request(harness.app)
    .post('/v1/contributions')
    .set(writeHeaders)
    .send(body);
  expect(response.status).toBe(201);
  seeded.push(seed);
}

beforeAll(async () => {
  harness = await createTestApp();
  today = new Date().toISOString().slice(0, 10);

  const member = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'SUM-1001', firstName: 'Ama', lastName: 'Mensah' });
  expect(member.status).toBe(201);
  const empty = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'SUM-1002', firstName: 'Kojo', lastName: 'Owusu' });
  expect(empty.status).toBe(201);

  const offering = await request(harness.app).post('/v1/offerings').set(writeHeaders).send({
    name: 'Summary Fund',
    purpose: 'Windowed summary',
    kind: 'freewill',
    currency: 'GHS',
    availableUntil: '2999-12-31',
  });
  expect(offering.status).toBe(201);
  offeringId = offering.body.id;

  await seedContribution({
    label: 'a',
    eventName: 'Alpha Event',
    date: today,
    amountMinor: 5000,
    memberNo: 'SUM-1001',
  });
  await seedContribution({
    label: 'b',
    eventName: 'Beta Event',
    date: today,
    amountMinor: 3000,
    memberNo: 'SUM-1001',
  });
  await seedContribution({
    label: 'c',
    eventName: 'Charlie Event',
    date: today,
    amountMinor: 2000,
    memberNo: 'SUM-1001',
  });
  await seedContribution({
    label: 'g',
    eventName: 'Gamma Event',
    date: shiftDate(today, -8),
    amountMinor: 100,
    memberNo: 'SUM-1001',
  });
  await seedContribution({
    label: 'd',
    eventName: 'Delta Event',
    date: shiftDate(today, -400),
    amountMinor: 9000,
    memberNo: 'SUM-1001',
  });
  await seedContribution({
    label: 'v',
    eventName: 'Visitor Event',
    date: today,
    amountMinor: 7000,
    visitorName: 'Visitor One',
    visitorPhone: '0801 999 0001',
  });
});

afterAll(async () => {
  await harness.close();
});

function expectedPaid(from: string): number {
  return seeded
    .filter((seed) => seed.memberNo && seed.date >= from && seed.date <= today)
    .reduce((sum, seed) => sum + seed.amountMinor, 0);
}

describe('GET /v1/members/{memberNo}/contributions/summary', () => {
  it('returns the three UTC windows ending today, with only paid member gifts', async () => {
    const response = await request(harness.app)
      .get('/v1/members/SUM-1001/contributions/summary')
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.currency).toBe('GHS');
    expect(response.body.week).toEqual({
      from: mondayOf(today),
      to: today,
      paidMinor: expectedPaid(mondayOf(today)),
    });
    expect(response.body.quarter).toEqual({
      from: quarterStartOf(today),
      to: today,
      paidMinor: expectedPaid(quarterStartOf(today)),
    });
    expect(response.body.year).toEqual({
      from: yearStartOf(today),
      to: today,
      paidMinor: expectedPaid(yearStartOf(today)),
    });

    // Three member events this year, ordered by amount then name; the visitor
    // gift and last year's gift never appear.
    expect(response.body.topEvents.map((event: { name: string }) => event.name)).toEqual([
      'Alpha Event',
      'Beta Event',
      'Charlie Event',
    ]);
    expect(response.body.topEvents.map((event: { paidMinor: number }) => event.paidMinor)).toEqual([
      5000, 3000, 2000,
    ]);
  });

  it('returns zero windows, GHS and no events for a member with no gifts', async () => {
    const response = await request(harness.app)
      .get('/v1/members/SUM-1002/contributions/summary')
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      currency: 'GHS',
      week: { from: mondayOf(today), to: today, paidMinor: 0 },
      quarter: { from: quarterStartOf(today), to: today, paidMinor: 0 },
      year: { from: yearStartOf(today), to: today, paidMinor: 0 },
      topEvents: [],
    });
  });

  it('is bearer-protected and returns 404 for an unknown member', async () => {
    const unauth = await request(harness.app).get('/v1/members/SUM-1001/contributions/summary');
    expect(unauth.status).toBe(401);

    const missing = await request(harness.app)
      .get('/v1/members/SUM-9999/contributions/summary')
      .set(readHeaders);
    expect(missing.status).toBe(404);
  });

  it('documents the member summary and the non-bearer USSD entry', async () => {
    const response = await request(harness.app).get('/openapi.json').set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.body.paths['/v1/members/{memberNo}/contributions/summary']).toBeDefined();
    expect(response.body.paths['/ussd/session']).toBeDefined();
    expect(response.body.paths['/ussd/session'].post.security).toEqual([]);
    expect(response.body.components.schemas.MemberContributionsSummary).toBeDefined();
  });
});
