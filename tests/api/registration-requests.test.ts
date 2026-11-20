import pino from 'pino';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NullMailer } from '../../src/authn/mailer.js';
import {
  DEFAULT_COUNTRY_CODE,
  DEFAULT_REGISTRATION_PHONE_KEY,
  DEFAULT_USSD_CODE_PEPPER,
} from '../../src/config/env.js';
import { createApp } from '../../src/create-app.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { createPhoneCipher } from '../../src/domain/phone-cipher.js';
import { AttendanceCodeRepository } from '../../src/repos/attendance-codes.js';
import { MemberRepository } from '../../src/repos/members.js';
import type { RegistrationRequestItem } from '../../src/repos/registration-requests.js';
import { VerificationRepository } from '../../src/repos/verification.js';
import { createTestApp, readHeaders, TOKEN, writeHeaders, type TestApp } from '../helpers/app.js';
import { reachableContacts } from '../helpers/member-fixtures.js';
import { createScratchPgDb } from '../helpers/scratch-db.js';

let harness: TestApp;
let app: TestApp['app'];
let codes: AttendanceCodeRepository;
let eventId: string;
let sessionDate: string;
let eventNo = 0;
let phone = 0;
let guardianNo = 0;

const CIPHER = createPhoneCipher(DEFAULT_REGISTRATION_PHONE_KEY);

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

/** An adult with an own contact, so it can guard an approved request (MR-50). */
async function guardianMember(options: { underAge?: boolean } = {}): Promise<string> {
  guardianNo += 1;
  const memberNo = `REQ-GUARDIAN-${guardianNo}`;
  const year = new Date().getUTCFullYear();
  const dob = options.underAge ? `${year - 10}-01-15` : '1980-01-15';
  const created = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Adwoa',
      lastName: `Guardian ${guardianNo}`,
      dob,
      contacts: reachableContacts(),
    });
  expect(created.status).toBe(201);
  return memberNo;
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
  // MR-53: the caller's number is retained encrypted; the hash carries the rate
  // limit and the reference.
  const digits = `80410009${String(phone).padStart(2, '0')}`;
  const result = await codes.redeem({
    code: issued.body.code,
    purpose: 'registration',
    phoneHash: `phone-hash-request-${phone}`,
    phoneEncrypted: CIPHER.encrypt(digits),
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
    // MR-53: the officer sees the mask, never the raw value.
    expect(item.phoneMasked).toMatch(/^\+233 \*\*\* \d{2}$/);
    expect(JSON.stringify(item)).not.toContain('+233 80');
    expect(item).not.toHaveProperty('phone');
    expect(item).not.toHaveProperty('phoneEncrypted');

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
  it('binds an own number as the member’s phone contact and erases the ciphertext', async () => {
    const requestItem = await pendingRequest('Akosua', 'Boateng');
    const digits = requestItem.phoneMasked!.replace(/\D/g, '').slice(-2);

    const approved = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-OWN-1', phoneOwnership: 'own' })
      .expect(200);

    expect(approved.body.status).toBe('approved');
    expect(approved.body.memberNo).toBe('REQ-OWN-1');
    expect(approved.body.decidedBy).toBe('test-admin');
    expect(approved.body.decidedAt).toBeTruthy();
    expect(approved.body.phoneMasked).toBeNull();

    // MR-53: the number became the member's owned phone contact; no guardian is
    // needed because the member is reachable through it.
    const member = await request(app).get('/v1/members/REQ-OWN-1').set(readHeaders).expect(200);
    expect(member.body).toMatchObject({
      firstName: 'Akosua',
      lastName: 'Boateng',
      gender: 'undisclosed',
      joinedOn: today(),
      guardian: null,
    });
    expect(member.body.contacts).toHaveLength(1);
    expect(member.body.contacts[0].kind).toBe('phone');
    expect(member.body.contacts[0].value.replace(/\D/g, '').slice(-2)).toBe(digits);

    const [row] = await harness.db.query<{ phone_encrypted: string | null }>(
      'select phone_encrypted from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(row!.phone_encrypted).toBeNull();

    const twice = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-OWN-2', phoneOwnership: 'own' });
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('registration_not_pending');
  });

  it('links a borrowed number to the guardian and requires the guardian', async () => {
    const requestItem = await pendingRequest('Efua', 'Owusu');
    const guardianMemberNo = await guardianMember();

    const approved = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-BORROWED-1', phoneOwnership: 'borrowed', guardianMemberNo })
      .expect(200);

    expect(approved.body.status).toBe('approved');
    expect(approved.body.phoneMasked).toBeNull();

    // MR-53: borrowed leaves the member with no own contact; the guardian is the
    // reachability and is written in the same transaction.
    const member = await request(app)
      .get('/v1/members/REQ-BORROWED-1')
      .set(readHeaders)
      .expect(200);
    expect(member.body.contacts).toEqual([]);
    expect(member.body.guardian.memberNo).toBe(guardianMemberNo);
    expect(member.body.guardian.contactMasked).toBeTruthy();

    const [link] = await harness.db.query<{ type: string }>(
      `select r.type
         from member_relationships r
         join members m on m.id = r.member_id
        where m.member_no = $1`,
      ['REQ-BORROWED-1'],
    );
    expect(link!.type).toBe('guardian');
  });

  it('refuses a borrowed approval without a guardian and leaves the request pending', async () => {
    const requestItem = await pendingRequest('Efua', 'Owusu');
    const [before] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );

    const response = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-NO-GUARDIAN', phoneOwnership: 'borrowed' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toMatch(/guardianMemberNo/);

    const [row] = await harness.db.query<{
      status: string;
      member_id: string | null;
      phone_encrypted: string | null;
    }>('select status, member_id, phone_encrypted from registration_requests where id = $1', [
      requestItem.id,
    ]);
    expect(row!.status).toBe('pending');
    expect(row!.member_id).toBeNull();
    // A refusal leaves the retained number in place for the retry.
    expect(row!.phone_encrypted).not.toBeNull();

    const [after] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );
    expect(after!.count).toBe(before!.count);
  });

  it('refuses an under-age borrowed guardian and writes nothing', async () => {
    const requestItem = await pendingRequest('Adjoa', 'Mensah');
    const guardianMemberNo = await guardianMember({ underAge: true });
    const [before] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );

    const response = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-UNDERAGE', phoneOwnership: 'borrowed', guardianMemberNo });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('guardian_not_eligible');

    const [row] = await harness.db.query<{ status: string; member_id: string | null }>(
      'select status, member_id from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(row!.status).toBe('pending');
    expect(row!.member_id).toBeNull();

    const [approved] = await harness.db.query<{ count: number }>(
      `select count(*)::int as count from members where member_no = 'REQ-UNDERAGE'`,
    );
    expect(approved!.count).toBe(0);
    const [after] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );
    expect(after!.count).toBe(before!.count);
  });

  it('refuses a number another member already owns with 409 contact_in_use', async () => {
    const requestItem = await pendingRequest('Yaa', 'Asante');

    // The request's number is the one the owner will hold: take it from the
    // encrypted row through the same cipher the API uses.
    const [row] = await harness.db.query<{ phone_encrypted: string }>(
      'select phone_encrypted from registration_requests where id = $1',
      [requestItem.id],
    );
    const digits = CIPHER.decrypt(row!.phone_encrypted);

    await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'REQ-OWNER',
        firstName: 'Owner',
        lastName: 'Number',
        contacts: [{ kind: 'phone', value: digits }],
      })
      .expect(201);

    const response = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-CONFLICT', phoneOwnership: 'own' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('contact_in_use');
    expect(response.body.detail).toContain('REQ-OWNER');

    const [pending] = await harness.db.query<{ status: string; phone_encrypted: string | null }>(
      'select status, phone_encrypted from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(pending!.status).toBe('pending');
    expect(pending!.phone_encrypted).not.toBeNull();
  });

  it('refuses a guardian alongside an own approval with 422 naming the field (MR-53)', async () => {
    const requestItem = await pendingRequest('Adjoa', 'Owusu');
    const guardianNo = await guardianMember();

    const refused = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({
        memberNo: 'REQ-OWN-GUARDIAN',
        phoneOwnership: 'own',
        guardianMemberNo: guardianNo,
      });

    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
    expect(refused.body.detail).toMatch(/guardianMemberNo/);

    const [pending] = await harness.db.query<{ status: string }>(
      'select status from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(pending!.status).toBe('pending');
  });

  it('does not mark a request approved when the member number is taken', async () => {
    await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'REQ-TAKEN',
        firstName: 'Existing',
        lastName: 'Member',
        contacts: reachableContacts(),
      })
      .expect(201);

    const requestItem = await pendingRequest('Yaa', 'Asante');
    const [before] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from members',
    );

    const response = await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-TAKEN', phoneOwnership: 'own' });

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

    const [row] = await harness.db.query<{
      reason: string;
      member_id: string | null;
      phone_encrypted: string | null;
    }>('select reason, member_id, phone_encrypted from registration_requests where id = $1', [
      requestItem.id,
    ]);
    expect(row!.reason).toBe('Could not verify the name');
    expect(row!.member_id).toBeNull();
    // MR-53: a rejection erases the retained number.
    expect(row!.phone_encrypted).toBeNull();

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

describe('purge', () => {
  it('erases a retained request number with the member', async () => {
    const requestItem = await pendingRequest('Nana', 'Adjei');
    await request(app)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'REQ-PURGE-1', phoneOwnership: 'own' })
      .expect(200);

    // An older row may still carry ciphertext; a purge erases it even so.
    await harness.db.query('update registration_requests set phone_encrypted = $2 where id = $1', [
      requestItem.id,
      CIPHER.encrypt('8041000999'),
    ]);

    await request(app)
      .post('/v1/members/REQ-PURGE-1/purge')
      .set(writeHeaders)
      .send({ confirm: 'REQ-PURGE-1' })
      .expect(204);

    const [row] = await harness.db.query<{ phone_encrypted: string | null }>(
      'select phone_encrypted from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(row!.phone_encrypted).toBeNull();
  });
});

/**
 * The same approval contract on the pooled `pg` driver (AGENTS.md §12). The
 * scratch server is named by `TEST_DATABASE_URL`; the block migrates a database
 * of its own, drives the real app over HTTP and drops it. Skipped otherwise.
 *
 * The registration request is the one path that both reads the encrypted column
 * (list mask) and writes through two repositories in one transaction (the member
 * and its contact or guardian, then the request), so it needs the pooled
 * coverage the PGlite suite cannot prove.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('registration requests on the pooled pg driver', () => {
  let pooled: Db;
  let pgApp: Express;
  let pgCodes: AttendanceCodeRepository;
  let pgMembers: MemberRepository;
  let pgVerification: VerificationRepository;
  let pgEventId = '';
  let pgSessionDate = '';

  beforeAll(async () => {
    pooled = await createScratchPgDb(testDatabaseUrl!);
    await migrate(pooled);
    pgApp = createApp({
      db: pooled,
      bearerToken: TOKEN,
      logger: pino({ level: 'silent' }),
      mailer: new NullMailer(),
      senders: { whatsapp: null, email: null, sms: null },
      ussd: { enabled: true },
    });
    pgCodes = new AttendanceCodeRepository(pooled, DEFAULT_USSD_CODE_PEPPER);
    pgMembers = new MemberRepository(pooled, DEFAULT_COUNTRY_CODE);
    pgVerification = new VerificationRepository(pooled, DEFAULT_COUNTRY_CODE);

    pgSessionDate = day(-2);
    const event = await request(pgApp)
      .post('/v1/events')
      .set(writeHeaders)
      .send({
        eventNo: 'REG-PG-1',
        name: 'Pooled registration event',
        startDate: pgSessionDate,
        endDate: day(-1),
        startTime: '09:00',
        venueType: 'auditorium',
        sessions: [{ date: pgSessionDate }, { date: day(-1) }],
      });
    expect(event.status).toBe(201);
    pgEventId = event.body.id as string;
  });

  afterAll(async () => {
    await pooled?.close();
  });

  /** A pending request whose caller number is encrypted under the test key. */
  async function pgPending(
    phoneDigits: string,
    lastName: string,
  ): Promise<RegistrationRequestItem> {
    const issued = await request(pgApp)
      .post(`/v1/events/${pgEventId}/codes`)
      .set(writeHeaders)
      .send({ purpose: 'registration', sessionDate: pgSessionDate });
    expect(issued.status).toBe(201);

    const result = await pgCodes.redeem({
      code: issued.body.code,
      purpose: 'registration',
      phoneHash: `pg-phone-hash-${lastName.toLowerCase()}`,
      phoneEncrypted: CIPHER.encrypt(phoneDigits),
      memberId: null,
      eventId: pgEventId,
      sessionDate: pgSessionDate,
      actor: 'pg-test',
      firstName: 'Pooled',
      lastName,
    });
    expect(result.kind).toBe('registration');
    if (result.kind !== 'registration') throw new Error('expected a registration result');

    const [row] = await pooled.query<{ id: string }>(
      'select id from registration_requests where reference = $1',
      [result.reference],
    );
    const fetched = await request(pgApp)
      .get(`/v1/registration-requests/${row!.id}`)
      .set(readHeaders)
      .expect(200);
    return fetched.body as RegistrationRequestItem;
  }

  async function pgGuardian(): Promise<string> {
    const created = await request(pgApp)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'PG-REQ-GUARDIAN',
        firstName: 'Adwoa',
        lastName: 'Guardian',
        dob: '1980-01-01',
        contacts: [{ kind: 'phone', value: '0804 100 0899' }],
      });
    expect(created.status).toBe(201);
    return 'PG-REQ-GUARDIAN';
  }

  it('lists only the masked number and never the raw digits', async () => {
    const requestItem = await pgPending('8041000821', 'Listed');
    expect(requestItem.phoneMasked).toBe('+233 *** 21');

    const page = await request(pgApp)
      .get('/v1/registration-requests')
      .query({ status: 'pending', eventId: pgEventId, sessionDate: pgSessionDate })
      .set(readHeaders)
      .expect(200);
    const item = (page.body.items as RegistrationRequestItem[]).find(
      (entry) => entry.id === requestItem.id,
    );
    expect(item).toBeDefined();
    expect(item!.phoneMasked).toBe('+233 *** 21');
    expect(JSON.stringify(item)).not.toContain('8041000821');
    expect(item).not.toHaveProperty('phone');
    expect(item).not.toHaveProperty('phoneEncrypted');
  });

  it('approves an own number, writes the owned contact and erases the ciphertext', async () => {
    const requestItem = await pgPending('8041000822', 'Owned');

    const approved = await request(pgApp)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'PG-REQ-OWN', phoneOwnership: 'own' })
      .expect(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.phoneMasked).toBeNull();

    const [row] = await pooled.query<{ phone_encrypted: string | null }>(
      'select phone_encrypted from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(row!.phone_encrypted).toBeNull();

    const member = await request(pgApp).get('/v1/members/PG-REQ-OWN').set(readHeaders).expect(200);
    expect(member.body.contacts).toHaveLength(1);
    expect(member.body.contacts[0].kind).toBe('phone');
    expect(member.body.contacts[0].value.replace(/\D/g, '').slice(-2)).toBe('22');
    expect(member.body.guardian).toBeNull();
  });

  it('refuses a borrowed approval without a guardian, then links one with no own contact', async () => {
    const requestItem = await pgPending('8041000823', 'Borrowed');

    const refused = await request(pgApp)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'PG-REQ-BORROWED', phoneOwnership: 'borrowed' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
    expect(refused.body.detail).toMatch(/guardianMemberNo/);

    const [pending] = await pooled.query<{ status: string; phone_encrypted: string | null }>(
      'select status, phone_encrypted from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(pending!.status).toBe('pending');
    expect(pending!.phone_encrypted).not.toBeNull();

    const guardianMemberNo = await pgGuardian();
    await request(pgApp)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({
        memberNo: 'PG-REQ-BORROWED',
        phoneOwnership: 'borrowed',
        guardianMemberNo,
      })
      .expect(200);

    const member = await request(pgApp)
      .get('/v1/members/PG-REQ-BORROWED')
      .set(readHeaders)
      .expect(200);
    expect(member.body.contacts).toEqual([]);
    expect(member.body.guardian.memberNo).toBe(guardianMemberNo);

    const [link] = await pooled.query<{ type: string }>(
      `select r.type
         from member_relationships r
         join members m on m.id = r.member_id
        where m.member_no = $1`,
      ['PG-REQ-BORROWED'],
    );
    expect(link!.type).toBe('guardian');
  });

  it('refuses a number owned elsewhere with 409 contact_in_use and leaves the request pending', async () => {
    const requestItem = await pgPending('8041000824', 'Conflict');
    await request(pgApp)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'PG-REQ-OWNER',
        firstName: 'Owner',
        lastName: 'Number',
        contacts: [{ kind: 'phone', value: '0804 100 0824' }],
      })
      .expect(201);

    const refused = await request(pgApp)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'PG-REQ-CONFLICT', phoneOwnership: 'own' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('contact_in_use');
    expect(refused.body.detail).toContain('PG-REQ-OWNER');

    const [pending] = await pooled.query<{ status: string; phone_encrypted: string | null }>(
      'select status, phone_encrypted from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(pending!.status).toBe('pending');
    expect(pending!.phone_encrypted).not.toBeNull();
  });

  it('maps two simultaneous approvals of one number to one member and one 409 (MR-53)', async () => {
    const first = await pgPending('8041000831', 'Race One');
    const second = await pgPending('8041000832', 'Race Two');
    // Both requests retain the same caller number, so the unique index is the
    // only thing that can decide the race between their contact inserts.
    await pooled.query('update registration_requests set phone_encrypted = $1 where id = $2', [
      CIPHER.encrypt('8041000831'),
      second.id,
    ]);

    const [left, right] = await Promise.all([
      request(pgApp)
        .post(`/v1/registration-requests/${first.id}/approve`)
        .set(writeHeaders)
        .send({ memberNo: 'PG-RACE-ONE', phoneOwnership: 'own' }),
      request(pgApp)
        .post(`/v1/registration-requests/${second.id}/approve`)
        .set(writeHeaders)
        .send({ memberNo: 'PG-RACE-TWO', phoneOwnership: 'own' }),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const refused = left.status === 409 ? left : right;
    expect(refused.body.code).toBe('contact_in_use');
    const contacts = await pooled.query<{ id: string }>(
      `select id from member_contacts where normalized_value = '8041000831'`,
    );
    expect(contacts).toHaveLength(1);
  });

  it('decides one request once under two simultaneous approvals', async () => {
    const item = await pgPending('8041000833', 'Once Only');
    const [left, right] = await Promise.all([
      request(pgApp)
        .post(`/v1/registration-requests/${item.id}/approve`)
        .set(writeHeaders)
        .send({ memberNo: 'PG-ONCE-ONE', phoneOwnership: 'own' }),
      request(pgApp)
        .post(`/v1/registration-requests/${item.id}/approve`)
        .set(writeHeaders)
        .send({ memberNo: 'PG-ONCE-TWO', phoneOwnership: 'own' }),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const refused = left.status === 409 ? left : right;
    expect(refused.body.code).toBe('registration_not_pending');
    const members = await pooled.query<{ id: string }>(
      `select id from members where member_no in ('PG-ONCE-ONE', 'PG-ONCE-TWO')`,
    );
    expect(members).toHaveLength(1);
  });

  it('clears only the changed contact proof', async () => {
    const requestItem = await pgPending('8041000825', 'Proofs');
    await request(pgApp)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'PG-REQ-PROOF', phoneOwnership: 'own' })
      .expect(200);
    await request(pgApp)
      .post('/v1/members/PG-REQ-PROOF/contacts')
      .set(writeHeaders)
      .send({ kind: 'email', value: 'pooled.proof@example.test' })
      .expect(201);

    const contacts = await pooled.query<{ id: string; kind: string }>(
      `select c.id, c.kind
         from member_contacts c
         join members m on m.id = c.member_id
        where m.member_no = $1`,
      ['PG-REQ-PROOF'],
    );
    const phone = contacts.find((contact) => contact.kind === 'phone');
    const email = contacts.find((contact) => contact.kind === 'email');
    expect(phone).toBeDefined();
    expect(email).toBeDefined();
    await pooled.query(
      `update member_contacts set verified_at = now() where id = any($1::uuid[])`,
      [[phone!.id, email!.id]],
    );

    const before = await pgVerification.verificationFor('PG-REQ-PROOF');
    expect(before!.verifiedContacts).toHaveLength(2);

    await pgMembers.updateContact('PG-REQ-PROOF', phone!.id, { value: '0804 100 0826' }, 'pg-test');

    const after = await pgVerification.verificationFor('PG-REQ-PROOF');
    expect(after!.verifiedContacts).toHaveLength(1);
    expect(after!.verifiedContacts[0]!.channel).toBe('email');
    const [cleared] = await pooled.query<{ verified_at: Date | string | null }>(
      'select verified_at from member_contacts where id = $1',
      [phone!.id],
    );
    expect(cleared!.verified_at).toBeNull();
  });

  it('erases a retained request ciphertext on purge', async () => {
    const requestItem = await pgPending('8041000827', 'Purged');
    await request(pgApp)
      .post(`/v1/registration-requests/${requestItem.id}/approve`)
      .set(writeHeaders)
      .send({ memberNo: 'PG-REQ-PURGE', phoneOwnership: 'own' })
      .expect(200);

    await pooled.query('update registration_requests set phone_encrypted = $2 where id = $1', [
      requestItem.id,
      CIPHER.encrypt('8041000828'),
    ]);
    await request(pgApp)
      .post('/v1/members/PG-REQ-PURGE/purge')
      .set(writeHeaders)
      .send({ confirm: 'PG-REQ-PURGE' })
      .expect(204);

    const [row] = await pooled.query<{ phone_encrypted: string | null }>(
      'select phone_encrypted from registration_requests where id = $1',
      [requestItem.id],
    );
    expect(row!.phone_encrypted).toBeNull();
  });
});
