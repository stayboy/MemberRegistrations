import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_USSD_CODE_PEPPER } from '../../src/config/env.js';
import { AttendanceCodeRepository } from '../../src/repos/attendance-codes.js';
import type { RegistrationRequestItem } from '../../src/repos/registration-requests.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];
let codes: AttendanceCodeRepository;
let eventId: string;
let sessionDate: string;
let eventNo = 0;
let phone = 0;

function day(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function today(): string {
  return day(0);
}

async function createEvent(dates: string[]): Promise<string> {
  eventNo += 1;
  const response = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo: `REG-${eventNo}`,
      name: `Registration event ${eventNo}`,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      startTime: '09:00',
      venueType: 'auditorium',
      sessions: dates.map((date) => ({ date })),
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function pendingRequest(
  firstName = 'Kojo',
  lastName = 'Owusu',
  session = sessionDate,
  event = eventId,
): Promise<RegistrationRequestItem> {
  const issued = await request(app)
    .post(`/v1/events/${event}/codes`)
    .set(writeHeaders)
    .send({ purpose: 'registration', sessionDate: session });
  expect(issued.status).toBe(201);

  phone += 1;
  const result = await codes.redeem({
    code: issued.body.code,
    purpose: 'registration',
    phoneHash: `phone-hash-request-${phone}`,
    memberId: null,
    eventId: event,
    sessionDate: session,
    actor: 'test-admin',
    firstName,
    lastName,
  });
  expect(result.kind).toBe('registration');
  if (result.kind !== 'registration') throw new Error('expected a registration result');

  const [row] = await harness.db.query<{ id: string }>(
    'select id from registration_requests where reference = $1',
    [result.reference],
  );
  const fetched = await request(app)
    .get(`/v1/registration-requests/${row!.id}`)
    .set(readHeaders)
    .expect(200);
  return fetched.body as RegistrationRequestItem;
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
  codes = new AttendanceCodeRepository(harness.db, DEFAULT_USSD_CODE_PEPPER);
  sessionDate = day(-2);
  eventId = await createEvent([sessionDate, day(-1)]);
});

afterAll(async () => {
  await harness.close();
});

describe('registration request list', () => {
  it('filters by status, event and session and never exposes a raw phone', async () => {
    const requestItem = await pendingRequest('Efua', 'Mensah');

    const pending = await request(app)
      .get('/v1/registration-requests')
      .query({ status: 'pending', eventId, sessionDate })
      .set(readHeaders)
      .expect(200);

    expect(
      pending.body.items.some((item: RegistrationRequestItem) => item.id === requestItem.id),
    ).toBe(true);
    const item = pending.body.items.find(
      (entry: RegistrationRequestItem) => entry.id === requestItem.id,
    );
    expect(item.phoneHash).toMatch(/^phone-hash-request-/);
    expect(JSON.stringify(item)).not.toContain('+233');
    expect(item).not.toHaveProperty('phone');

    const otherSession = await request(app)
      .get('/v1/registration-requests')
      .query({ sessionDate: day(-1) })
      .set(readHeaders)
      .expect(200);
    expect(
      otherSession.body.items.some((entry: RegistrationRequestItem) => entry.id === requestItem.id),
    ).toBe(false);
  });
});

describe('approval', () => {
  it('creates the member, marks the request approved and links it', async () => {
    const requestItem = await pendingRequest('Akosua', 'Boateng');

    const approved = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-APPROVED-1' })
      .expect(200);

    expect(approved.body.status).toBe('approved');
    expect(approved.body.memberNo).toBe('REQ-APPROVED-1');
    expect(approved.body.decidedBy).toBe('test-admin');
    expect(approved.body.decidedAt).toBeTruthy();

    const member = await request(app)
      .get('/v1/members/REQ-APPROVED-1')
      .set(readHeaders)
      .expect(200);
    expect(member.body).toMatchObject({
      firstName: 'Akosua',
      lastName: 'Boateng',
      gender: 'undisclosed',
      joinedOn: today(),
      contacts: [],
    });

    const twice = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-APPROVED-2' });
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('registration_not_pending');
  });

  it('does not mark a request approved when the member number is taken', async () => {
    await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({ memberNo: 'REQ-TAKEN', firstName: 'Existing', lastName: 'Member' })
      .expect(201);

    const requestItem = await pendingRequest('Yaa', 'Asante');
    const [before] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );

    const response = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-TAKEN' });

    expect(response.status).toBe(409);

    const [row] = await harness.db.query<{ status: string; member_id: string | null }>(
      'select status, member_id from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(row!.status).toBe('pending');
    expect(row!.member_id).toBeNull();

    const [after] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );
    expect(after!.count).toBe(before!.count);
  });
});

describe('rejection', () => {
  it('records the reason and creates no member', async () => {
    const requestItem = await pendingRequest('Nana', 'Adjei');
    const [before] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );

    const rejected = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/reject`)
      .set(writeHeaders)
      .send({ reason: 'Could not verify the name' })
      .expect(200);

    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.memberNo).toBeNull();

    const [row] = await harness.db.query<{ reason: string; member_id: string | null }>(
      'select reason, member_id from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(row!.reason).toBe('Could not verify the name');
    expect(row!.member_id).toBeNull();

    const [after] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );
    expect(after!.count).toBe(before!.count);

    const twice = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/reject`)
      .set(writeHeaders)
      .send({ reason: 'again' });
    expect(twice.status).toBe(409);
  });
});
