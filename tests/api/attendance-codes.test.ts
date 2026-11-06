import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_USSD_CODE_PEPPER } from '../../src/config/env.js';
import { AttendanceCodeRepository } from '../../src/repos/attendance-codes.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];
let codes: AttendanceCodeRepository;
let eventId: string;
let secondEventId: string;
let sessionDate: string;
let otherSessionDate: string;
let eventNo = 0;

function day(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createEvent(dates: string[]): Promise<string> {
  eventNo += 1;
  const response = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo: `CODE-${eventNo}`,
      name: `Code event ${eventNo}`,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      startTime: '09:00',
      venueType: 'auditorium',
      sessions: dates.map((date) => ({ date })),
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function createMember(memberNo: string): Promise<string> {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo, firstName: 'Ama', lastName: 'Mensah', gender: 'female' });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function issue(
  purpose: 'attendance_punch' | 'registration',
  event = eventId,
  session = sessionDate,
) {
  return request(app)
    .post(`/v1/events/${event}/codes`)
    .set(writeHeaders)
    .send({ purpose, sessionDate: session });
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
  codes = new AttendanceCodeRepository(harness.db, DEFAULT_USSD_CODE_PEPPER);
  sessionDate = day(-2);
  otherSessionDate = day(-1);
  eventId = await createEvent([sessionDate, otherSessionDate]);
  secondEventId = await createEvent([sessionDate]);
});

afterAll(async () => {
  await harness.close();
});

describe('code issuance and listing', () => {
  it('issues a six-digit code once and stores only the hash', async () => {
    const response = await issue('attendance_punch');
    expect(response.status).toBe(201);
    expect(response.body.code).toMatch(/^\d{6}$/);
    expect(response.body.purpose).toBe('attendance_punch');
    expect(response.body.sessionDate).toBe(sessionDate);

    const [row] = await harness.db.query<{ code_hash: string }>(
      'select code_hash from attendance_codes where id = $1',
      [response.body.id],
    );
    expect(row!.code_hash).toHaveLength(64);
    expect(row!.code_hash).not.toBe(response.body.code);

    const list = await request(app)
      .get(`/v1/events/${eventId}/codes`)
      .query({ sessionDate })
      .set(readHeaders)
      .expect(200);

    const item = list.body.items.find((entry: { id: string }) => entry.id === response.body.id);
    expect(item).toMatchObject({
      purpose: 'attendance_punch',
      sessionDate,
      status: 'active',
      usedAt: null,
      usedByMemberNo: null,
      voidedAt: null,
    });
    expect(JSON.stringify(list.body)).not.toContain(response.body.code);
    expect(JSON.stringify(list.body)).not.toContain(row!.code_hash);
  });

  it('expires fifteen minutes after issue', async () => {
    const response = await issue('attendance_punch');
    expect(response.status).toBe(201);
    const issued = new Date(response.body.expiresAt).getTime();

    const [row] = await harness.db.query<{ issued_at: Date; expires_at: Date }>(
      'select issued_at, expires_at from attendance_codes where id = $1',
      [response.body.id],
    );
    const minutes = (row!.expires_at.getTime() - row!.issued_at.getTime()) / 60_000;
    expect(Math.round(minutes)).toBe(15);
    expect(Math.abs(issued - row!.expires_at.getTime())).toBeLessThan(60_000);
  });

  it('voids an unused code and refuses a second void', async () => {
    const response = await issue('registration');
    const voided = await request(app)
      .post(`/v1/codes/${response.body.id}/void`)
      .set(writeHeaders)
      .send({ reason: 'issued in error' })
      .expect(200);
    expect(voided.body.status).toBe('voided');
    expect(voided.body.voidedAt).toBeTruthy();

    const twice = await request(app)
      .post(`/v1/codes/${response.body.id}/void`)
      .set(writeHeaders)
      .send({});
    expect(twice.status).toBe(409);
  });
});

describe('redemption', () => {
  it('writes attendance and marks the code used', async () => {
    const memberId = await createMember('CODE-M1');
    const issued = await issue('attendance_punch');

    const result = await codes.redeem({
      code: issued.body.code,
      purpose: 'attendance_punch',
      phoneHash: 'phone-hash-punch',
      memberId,
      eventId,
      sessionDate,
      actor: 'test-admin',
    });

    expect(result).toMatchObject({ kind: 'attendance', eventId, sessionDate });
    const [row] = await harness.db.query<{ used_at: Date | null; used_by_member_id: string }>(
      'select used_at, used_by_member_id from attendance_codes where id = $1',
      [issued.body.id],
    );
    expect(row!.used_at).toBeTruthy();
    expect(row!.used_by_member_id).toBe(memberId);

    const attendance = await request(app)
      .get(`/v1/events/${eventId}/attendance`)
      .query({ date: sessionDate })
      .set(readHeaders)
      .expect(200);
    expect(attendance.body.rows.map((entry: { memberNo: string }) => entry.memberNo)).toContain(
      'CODE-M1',
    );
  });

  it('refuses an already clocked member without consuming the code', async () => {
    await createMember('CODE-M2');
    await request(app)
      .post(`/v1/events/${eventId}/attendance`)
      .set(writeHeaders)
      .send({ memberNo: 'CODE-M2', date: sessionDate })
      .expect(201);

    const [member] = await harness.db.query<{ id: string }>(
      'select id from members where member_no = $1',
      ['CODE-M2'],
    );
    const issued = await issue('attendance_punch');
    await expect(
      codes.redeem({
        code: issued.body.code,
        purpose: 'attendance_punch',
        phoneHash: 'phone-hash-already',
        memberId: member!.id,
        eventId,
        sessionDate,
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'already_clocked' });

    const [row] = await harness.db.query<{ used_at: Date | null }>(
      'select used_at from attendance_codes where id = $1',
      [issued.body.id],
    );
    expect(row!.used_at).toBeNull();
  });

  it('creates a pending registration request and marks the code used', async () => {
    const issued = await issue('registration');
    const result = await codes.redeem({
      code: issued.body.code,
      purpose: 'registration',
      phoneHash: 'phone-hash-reg',
      memberId: null,
      eventId,
      sessionDate,
      actor: 'test-admin',
      firstName: 'Kojo',
      lastName: 'Owusu',
    });

    expect(result.kind).toBe('registration');
    if (result.kind !== 'registration') return;
    expect(result.reference).toMatch(/^REG-[A-Z2-7]{6}$/);

    const [row] = await harness.db.query<{
      status: string;
      phone_hash: string;
      code_id: string;
    }>(
      `select status, phone_hash, code_id
         from registration_requests where reference = $1`,
      [result.reference],
    );
    expect(row!.status).toBe('pending');
    expect(row!.phone_hash).toBe('phone-hash-reg');
    expect(row!.code_id).toBe(issued.body.id);

    const [codeRow] = await harness.db.query<{ registration_request_id: string }>(
      'select registration_request_id from attendance_codes where id = $1',
      [issued.body.id],
    );
    expect(codeRow!.registration_request_id).toBeTruthy();

    await expect(
      codes.redeem({
        code: issued.body.code,
        purpose: 'registration',
        phoneHash: 'phone-hash-reg',
        memberId: null,
        eventId,
        sessionDate,
        actor: 'test-admin',
        firstName: 'Kojo',
        lastName: 'Owusu',
      }),
    ).rejects.toMatchObject({ code: 'code_used' });
  });

  it('refuses unknown, expired, voided, wrong-session and wrong-purpose codes', async () => {
    await expect(
      codes.redeem({
        code: '000000',
        purpose: 'attendance_punch',
        phoneHash: 'phone-hash-unknown',
        memberId: null,
        eventId,
        sessionDate,
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'code_invalid' });

    const expired = await issue('attendance_punch');
    await harness.db.query(
      `update attendance_codes set expires_at = now() - interval '1 minute' where id = $1`,
      [expired.body.id],
    );
    await expect(
      codes.redeem({
        code: expired.body.code,
        purpose: 'attendance_punch',
        phoneHash: 'phone-hash-expired',
        memberId: null,
        eventId,
        sessionDate,
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'code_expired' });

    const voided = await issue('attendance_punch');
    await request(app)
      .post(`/v1/codes/${voided.body.id}/void`)
      .set(writeHeaders)
      .send({})
      .expect(200);
    await expect(
      codes.redeem({
        code: voided.body.code,
        purpose: 'attendance_punch',
        phoneHash: 'phone-hash-voided',
        memberId: null,
        eventId,
        sessionDate,
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'code_voided' });

    const wrongSession = await issue('attendance_punch');
    await expect(
      codes.redeem({
        code: wrongSession.body.code,
        purpose: 'attendance_punch',
        phoneHash: 'phone-hash-session',
        memberId: null,
        eventId: secondEventId,
        sessionDate,
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'code_wrong_session' });

    const wrongPurpose = await issue('attendance_punch');
    await expect(
      codes.redeem({
        code: wrongPurpose.body.code,
        purpose: 'registration',
        phoneHash: 'phone-hash-purpose',
        memberId: null,
        eventId,
        sessionDate,
        actor: 'test-admin',
        firstName: 'A',
        lastName: 'B',
      }),
    ).rejects.toMatchObject({ code: 'code_invalid' });
  });

  it('answers five failed attempts then 429 without revealing the code', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        codes.redeem({
          code: '123456',
          purpose: 'attendance_punch',
          phoneHash: 'phone-hash-rate',
          memberId: null,
          eventId,
          sessionDate,
          actor: 'test-admin',
        }),
      ).rejects.toMatchObject({ code: 'code_invalid' });
    }

    await expect(
      codes.redeem({
        code: '123456',
        purpose: 'attendance_punch',
        phoneHash: 'phone-hash-rate',
        memberId: null,
        eventId,
        sessionDate,
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'too_many_tries' });
  });
});
