import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { reachableContacts } from '../helpers/member-fixtures.js';

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
      contacts: reachableContacts(),
      ...extra,
    });
  expect(response.status).toBe(201);
  return response;
}

/** 1 January `years` ago: exactly `years` completed years on any later date. */
function dobYearsAgo(years: number): string {
  return `${new Date().getUTCFullYear() - years}-01-01`;
}

/** The first of the month `months` ago: exactly `months` completed months today. */
function dobMonthsAgo(months: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return date.toISOString().slice(0, 10);
}

/** A UTC calendar date `offset` days from today. */
function day(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

let overviewEventNo = 0;

async function createOverviewEvent(date: string, name: string): Promise<string> {
  overviewEventNo += 1;
  const response = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo: `OVR-${overviewEventNo}`,
      name,
      startTime: '09:00',
      venueType: 'auditorium',
      occurrences: [{ date }],
    });
  expect(response.status).toBe(201);
  const id = response.body.id as string;
  await harness.db.query("update events set status = 'active' where id = $1", [id]);
  return id;
}

/** History is seeded directly: per-member writes accept only a session dated today. */
async function seedOverviewAttendance(
  eventId: string,
  memberNo: string,
  date: string,
): Promise<void> {
  const [member] = await harness.db.query<{ id: string }>(
    'select id from members where member_no = $1',
    [memberNo],
  );
  const [inserted] = await harness.db.query<{ id: string }>(
    `insert into attendance (member_id, occurrence_id, source, created_by)
     values ($1, (select id from event_occurrences where event_id = $2 and date = $3), 'manual','seed')
     on conflict (occurrence_id, member_id) do nothing
     returning id`,
    [member!.id, eventId, date],
  );
  expect(inserted).toBeTruthy();
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

  it('rejects a contact value another member owns with the generic conflict (MR-53)', async () => {
    // The member API documents a plain `conflict` here; only registration
    // approval names `contact_in_use`, so this pins that the create path keeps
    // its own code while sharing the uniqueness index.
    await create('M-1015', { contacts: [{ kind: 'phone', value: '0809 900 0015' }] });

    const duplicate = await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'M-1016',
        firstName: 'Other',
        lastName: 'Holder',
        contacts: [{ kind: 'phone', value: '08099000015' }],
      });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('conflict');
    expect(duplicate.body.detail).toContain('already belongs');

    const [created] = await harness.db.query<{ count: number }>(
      `select count(*)::int as count from members where member_no = 'M-1016'`,
    );
    expect(created!.count).toBe(0);
  });

  it('finds a member by a shared contact value', async () => {
    await create('M-1002', { contacts: [{ kind: 'phone', value: '+234 801 234 5678' }] });

    const response = await request(app)
      .get('/v1/members')
      .query({ contact: '08012345678' })
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body.items.map((entry: { memberNo: string }) => entry.memberNo)).toContain(
      'M-1001',
    );
    const item = response.body.items.find(
      (entry: { memberNo: string }) => entry.memberNo === 'M-1001',
    );
    expect(item.contactCount).toBe(1);
    expect(item).not.toHaveProperty('contacts');
    expect(JSON.stringify(response.body)).not.toContain('0801 234 5678');
    expect(JSON.stringify(response.body)).not.toContain('08012345678');
  });

  it('derives the current age from dob and omits it for unknown or future dates', async () => {
    const aged = await create('M-1010', { dob: dobYearsAgo(30), gender: 'male' });
    expect(aged.body).toMatchObject({ gender: 'male', age: 30 });

    const list = await request(app).get('/v1/members').query({ q: 'M-1010' }).set(readHeaders);
    expect(list.body.items[0]).toMatchObject({ age: 30 });
    expect(list.body.items[0]).not.toHaveProperty('dob');

    const unknown = await create('M-1011');
    expect(unknown.body.age).toBeNull();

    const future = await create('M-1012', { dob: `${new Date().getUTCFullYear() + 1}-01-01` });
    expect(future.body.age).toBeNull();
  });

  it('derives ageMonths with the same rule, so an eight-month-old is not zero years', async () => {
    const infant = await create('M-1013', { dob: dobMonthsAgo(8), gender: 'female' });
    expect(infant.body).toMatchObject({ age: 0, ageMonths: 8 });

    const list = await request(app).get('/v1/members').query({ q: 'M-1013' }).set(readHeaders);
    expect(list.body.items[0]).toMatchObject({ age: 0, ageMonths: 8 });
    expect(list.body.items[0]).not.toHaveProperty('dob');

    const unknown = await create('M-1014');
    expect(unknown.body.age).toBeNull();
    expect(unknown.body.ageMonths).toBeNull();
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
    await create('M-1005', {
      alias: 'Ama',
      cameFrom: 'Tema Central',
      movedToAssembly: 'Accra North',
    });

    await request(app)
      .post('/v1/members/M-1005/purge')
      .set(writeHeaders)
      .send({ confirm: 'M-1005' })
      .expect(204);

    // The two new free-text membership values join the erase list; the dates do not.
    const [tombstone] = await harness.db.query<{
      came_from: string | null;
      moved_to_assembly: string | null;
      alias: string | null;
    }>('select came_from, moved_to_assembly, alias from members where member_no = $1', ['M-1005']);
    expect(tombstone).toMatchObject({ came_from: null, moved_to_assembly: null, alias: null });

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
      dob: '1980-01-01',
    });
    // MR-38: a member with no own contact is created with its guardian link.
    await create('M-2004', { guardianMemberNo: 'M-2003', contacts: [] });
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

describe('search narrowing', () => {
  beforeAll(async () => {
    await create('M-6001', {
      firstName: 'Narrow',
      lastName: 'Search',
      otherNames: 'Adwoa',
      alias: 'Quiet',
      maidenName: 'Oldname',
      contacts: [{ kind: 'phone', value: '0803 000 1111' }],
    });
    const owner = await create('M-6002', {
      firstName: 'Contact',
      lastName: 'Owner',
      contacts: [{ kind: 'phone', value: '0803 000 3333' }],
    });
    await create('M-6003', { firstName: 'Linked', lastName: 'Member' });
    await request(app)
      .post('/v1/members/M-6003/contacts/link')
      .set(writeHeaders)
      .send({ contactId: owner.body.contacts[0].id })
      .expect(201);
  });

  it('does not match owned or linked contact values through q', async () => {
    const owned = await request(app)
      .get('/v1/members')
      .query({ q: '0803 000 1111' })
      .set(readHeaders);

    expect(owned.status).toBe(200);
    expect(owned.body.items).toHaveLength(0);
    expect(JSON.stringify(owned.body)).not.toContain('0803 000 1111');

    const linked = await request(app)
      .get('/v1/members')
      .query({ q: '0803 000 3333' })
      .set(readHeaders);

    expect(linked.status).toBe(200);
    expect(linked.body.items).toHaveLength(0);
    expect(JSON.stringify(linked.body)).not.toContain('0803 000 3333');
  });

  it('still matches member number, name parts, alias and maiden name', async () => {
    for (const q of ['M-6001', 'Narrow', 'Search', 'Adwoa', 'Quiet', 'Oldname']) {
      const response = await request(app).get('/v1/members').query({ q }).set(readHeaders);
      const memberNos = response.body.items.map((entry: { memberNo: string }) => entry.memberNo);

      expect(response.status).toBe(200);
      expect(memberNos).toContain('M-6001');
      expect(JSON.stringify(response.body)).not.toContain('0803 000 1111');
    }
  });

  it('keeps the contact filter for owned and linked values', async () => {
    const owned = await request(app)
      .get('/v1/members')
      .query({ contact: '08030001111' })
      .set(readHeaders);
    expect(owned.body.items.map((entry: { memberNo: string }) => entry.memberNo)).toContain(
      'M-6001',
    );

    const linked = await request(app)
      .get('/v1/members')
      .query({ contact: '08030003333' })
      .set(readHeaders);
    const memberNos = linked.body.items.map((entry: { memberNo: string }) => entry.memberNo);
    expect(memberNos).toContain('M-6002');
    expect(memberNos).toContain('M-6003');
  });
});

describe('relationships', () => {
  it('creates one spouse edge and refuses a second', async () => {
    await create('M-3001');
    await create('M-3002', { gender: 'male', dob: dobYearsAgo(25) });
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
    expect(response.body.items[0]).toMatchObject({
      memberNo: 'M-3001',
      type: 'spouse',
      gender: 'female',
      age: null,
    });

    const holder = await request(app).get('/v1/members/M-3001/relationships').set(readHeaders);
    expect(holder.body.items[0]).toMatchObject({
      memberNo: 'M-3002',
      gender: 'male',
      age: 25,
    });
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

describe('member card and verification', () => {
  it('trims the card, keeps it detail-only and enforces case-insensitive uniqueness', async () => {
    const created = await create('M-5001', { membershipCardNo: '  Card-ONE  ' });
    expect(created.body.membershipCardNo).toBe('Card-ONE');
    expect(created.body.verifiedContacts).toEqual([]);
    expect(created.body.confirmedAt).toBeNull();

    const list = await request(app).get('/v1/members').query({ q: 'M-5001' }).set(readHeaders);
    expect(list.body.items[0]).not.toHaveProperty('membershipCardNo');
    expect(list.body.items[0]).not.toHaveProperty('verifiedContacts');

    const duplicate = await request(app).post('/v1/members').set(writeHeaders).send({
      memberNo: 'M-5002',
      firstName: 'Other',
      lastName: 'Person',
      membershipCardNo: 'card-one',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('card_in_use');

    const tooLong = await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'M-5003',
        firstName: 'Long',
        lastName: 'Card',
        membershipCardNo: 'X'.repeat(33),
      });
    expect(tooLong.status).toBe(422);

    const cleared = await request(app)
      .put('/v1/members/M-5001')
      .set(writeHeaders)
      .send({ membershipCardNo: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.membershipCardNo).toBeNull();

    const reissued = await request(app).post('/v1/members').set(writeHeaders).send({
      memberNo: 'M-5004',
      firstName: 'Card',
      lastName: 'Reissue',
      membershipCardNo: 'CARD-ONE',
      contacts: reachableContacts(),
    });
    expect(reissued.status).toBe(201);
    expect(reissued.body.membershipCardNo).toBe('CARD-ONE');

    const reassign = await request(app)
      .put('/v1/members/M-5004')
      .set(writeHeaders)
      .send({ membershipCardNo: 'Card-Two' })
      .expect(200);
    expect(reassign.body.membershipCardNo).toBe('Card-Two');

    const taken = await request(app)
      .put('/v1/members/M-5001')
      .set(writeHeaders)
      .send({ membershipCardNo: 'card-two' });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('card_in_use');
  });

  it('never accepts `verified`: the proof and the confirmation are read-only', async () => {
    const created = await create('M-5101', { verified: true });
    expect(created.body.verifiedContacts).toEqual([]);
    expect(created.body.confirmedAt).toBeNull();

    const ignored = await request(app)
      .put('/v1/members/M-5101')
      .set(writeHeaders)
      .send({ verified: true });
    // The retired field is stripped, so a body that carries nothing else has no
    // fields to update and is refused; either way the read-only fields never move.
    expect(ignored.status).toBe(422);
    expect(ignored.body.code).toBe('validation_error');
    const afterIgnored = await request(app).get('/v1/members/M-5101').set(readHeaders);
    expect(afterIgnored.body.verifiedContacts).toEqual([]);
    expect(afterIgnored.body.confirmedAt).toBeNull();
    expect(afterIgnored.body.membershipCardNo).toBeNull();

    // A proof and a confirmation written by the services survive a write that
    // names the retired field: the payload can never clear or refresh them
    // (MR-33, AC-MR20).
    const id = (
      await harness.db.query<{ id: string }>('select id from members where member_no = $1', [
        'M-5101',
      ])
    )[0]!.id;
    await harness.db.query(
      `update member_contacts set verified_at = '2026-11-01T09:00:00Z'
        where member_id = $1`,
      [id],
    );
    await harness.db.query(
      `insert into member_confirmations (member_id, confirmed_by, confirmed_at, reason)
       values ($1, 'officer', '2026-11-02T09:00:00Z', 'Known')`,
      [id],
    );
    const stillConfirmed = await request(app)
      .put('/v1/members/M-5101')
      .set(writeHeaders)
      .send({ verified: false, placeOfResidence: 'Accra' });
    expect(stillConfirmed.status).toBe(200);
    expect(stillConfirmed.body.confirmedAt).toBe('2026-11-02T09:00:00.000Z');
    expect(stillConfirmed.body.verifiedContacts).toHaveLength(1);
  });
});

describe('membership fields and the overview projection', () => {
  const OFFICER = 'M-7000';
  const SUBJECT = 'M-7001';
  const EMPTY = 'M-7002';
  let recurringSeriesId = '';
  let recurringEventId = '';
  let standaloneEventId = '';
  let expectedRecurring = 0;

  beforeAll(async () => {
    await create(OFFICER, {
      firstName: 'Shepherd',
      lastName: 'One',
      gender: 'male',
      dob: dobYearsAgo(40),
      isPresbyter: true,
    });
    await create(SUBJECT, {
      firstName: 'Subject',
      lastName: 'Member',
      joinedOn: day(-60),
      assemblyJoinedOn: '2019-03-03',
      cameFrom: 'Tema Central',
      movedOutOn: '2026-02-01',
      movedToAssembly: 'Accra North',
    });
    await create(EMPTY);

    // One recurring series row: its event instance is dated on a real
    // occurrence, so the counts are exercised as well as the entry identity.
    const series = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Overview Recurring Series',
        timezone: 'UTC',
        schedule: { effectiveFrom: day(-60), rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: day(-5) },
      });
    expect(series.status).toBe(201);
    recurringSeriesId = series.body.id as string;

    const occurrences = await request(app)
      .get(`/v1/series/${recurringSeriesId}/occurrences`)
      .query({ from: day(-60), to: day(-5) })
      .set(readHeaders);
    expect(occurrences.status).toBe(200);
    const dates = occurrences.body.dates as string[];
    expect(dates.length).toBeGreaterThan(0);
    expectedRecurring = dates.length;

    recurringEventId = recurringSeriesId;
    await seedEvent(harness.db, {
      eventId: recurringSeriesId,
      name: 'Overview Recurring Series',
      startDate: dates[dates.length - 1]!,
      endDate: dates[dates.length - 1]!,
      series: true,
      sessions: [{ date: dates[dates.length - 1]!, startTime: '09:00' }],
    });
    await seedOverviewAttendance(recurringEventId, SUBJECT, dates[dates.length - 1]!);

    // One standalone event row: no series, so the detail must not drop it.
    standaloneEventId = await createOverviewEvent(day(-3), 'Overview Standalone Rally');
    await seedOverviewAttendance(standaloneEventId, SUBJECT, day(-3));

    const assignment = await request(app)
      .post('/v1/shepherding/assignments')
      .set(writeHeaders)
      .send({ officerMemberNo: OFFICER, memberNo: SUBJECT, assignedOn: day(-30) });
    expect(assignment.status).toBe(201);

    const reached = await request(app)
      .post(`/v1/shepherding/assignments/${assignment.body.id}/calls`)
      .set(writeHeaders)
      .send({ calledOn: day(-9), outcome: 'reached', stillInChurch: 'yes' });
    expect(reached.status).toBe(201);

    const missed = await request(app)
      .post(`/v1/shepherding/assignments/${assignment.body.id}/calls`)
      .set(writeHeaders)
      .send({ calledOn: day(-2), outcome: 'no_answer' });
    expect(missed.status).toBe(201);
  });

  it('round-trips the four membership fields through create, detail and update', async () => {
    const created = await create('M-7100', {
      assemblyJoinedOn: '2018-06-01',
      cameFrom: 'Koforidua',
      movedOutOn: '2025-12-31',
      movedToAssembly: 'Ho Central',
    });
    const fields = {
      assemblyJoinedOn: '2018-06-01',
      cameFrom: 'Koforidua',
      movedOutOn: '2025-12-31',
      movedToAssembly: 'Ho Central',
    };
    expect(created.body).toMatchObject(fields);

    const detail = await request(app).get('/v1/members/M-7100').set(readHeaders).expect(200);
    expect(detail.body).toMatchObject(fields);
    // `assemblyJoinedOn` is its own date, not a second name for `joinedOn`.
    expect(detail.body.joinedOn).toBe('2026-01-01');

    const list = await request(app).get('/v1/members').query({ q: 'M-7100' }).set(readHeaders);
    expect(list.body.items[0]).not.toHaveProperty('assemblyJoinedOn');
    expect(list.body.items[0]).not.toHaveProperty('cameFrom');
    expect(list.body.items[0]).not.toHaveProperty('movedOutOn');
    expect(list.body.items[0]).not.toHaveProperty('movedToAssembly');

    const updated = await request(app)
      .put('/v1/members/M-7100')
      .set(writeHeaders)
      .send({
        assemblyJoinedOn: '2020-01-05',
        cameFrom: 'Sunyani',
        movedOutOn: '2026-03-04',
        movedToAssembly: 'Tamale',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      assemblyJoinedOn: '2020-01-05',
      cameFrom: 'Sunyani',
      movedOutOn: '2026-03-04',
      movedToAssembly: 'Tamale',
    });

    const reread = await request(app).get('/v1/members/M-7100').set(readHeaders).expect(200);
    expect(reread.body).toMatchObject({
      assemblyJoinedOn: '2020-01-05',
      cameFrom: 'Sunyani',
      movedOutOn: '2026-03-04',
      movedToAssembly: 'Tamale',
    });

    const cleared = await request(app)
      .put('/v1/members/M-7100')
      .set(writeHeaders)
      .send({ assemblyJoinedOn: null, cameFrom: null, movedOutOn: null, movedToAssembly: null })
      .expect(200);
    expect(cleared.body).toMatchObject({
      assemblyJoinedOn: null,
      cameFrom: null,
      movedOutOn: null,
      movedToAssembly: null,
    });

    const clearedAgain = await request(app).get('/v1/members/M-7100').set(readHeaders).expect(200);
    expect(clearedAgain.body).toMatchObject({
      assemblyJoinedOn: null,
      cameFrom: null,
      movedOutOn: null,
      movedToAssembly: null,
    });
  });

  it('leaves the four membership fields null when they are not supplied', async () => {
    const detail = await request(app).get(`/v1/members/${EMPTY}`).set(readHeaders).expect(200);
    expect(detail.body).toMatchObject({
      assemblyJoinedOn: null,
      cameFrom: null,
      movedOutOn: null,
      movedToAssembly: null,
    });
  });

  it('rejects a membership date that is not an ISO calendar date', async () => {
    const badCreate = await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({ memberNo: 'M-7101', firstName: 'A', lastName: 'B', assemblyJoinedOn: '03/03/2019' });
    expect(badCreate.status).toBe(422);

    const badUpdate = await request(app)
      .put(`/v1/members/${SUBJECT}`)
      .set(writeHeaders)
      .send({ movedOutOn: '31-12-2025' });
    expect(badUpdate.status).toBe(422);
  });

  it('projects the current shepherd and the all-time call counts on the detail', async () => {
    const detail = await request(app).get(`/v1/members/${SUBJECT}`).set(readHeaders).expect(200);

    expect(detail.body.shepherd).toMatchObject({
      memberNo: OFFICER,
      name: 'Shepherd One',
      gender: 'male',
      age: 40,
      assignedOn: day(-30),
    });
    expect(detail.body.calls).toEqual({
      attempts: 2,
      conversations: 1,
      lastCalledOn: day(-2),
      lastReachedOn: day(-9),
    });

    // The detail reuses the shepherding projection: same shepherd, same counts.
    const view = await request(app)
      .get(`/v1/members/${SUBJECT}/shepherding`)
      .set(readHeaders)
      .expect(200);
    expect(detail.body.shepherd.memberNo).toBe(view.body.shepherd.memberNo);
    expect(detail.body.shepherd.assignedOn).toBe(view.body.shepherd.assignedOn);
    expect(detail.body.calls).toMatchObject(view.body.calls);
  });

  it('returns a null shepherd and zeroed calls when no assignment exists', async () => {
    const detail = await request(app).get(`/v1/members/${EMPTY}`).set(readHeaders).expect(200);

    expect(detail.body.shepherd).toBeNull();
    expect(detail.body.calls).toEqual({
      attempts: 0,
      conversations: 0,
      lastCalledOn: null,
      lastReachedOn: null,
    });
  });

  it('carries the event identity on each recurring-series attendance entry', async () => {
    const detail = await request(app).get(`/v1/members/${SUBJECT}`).set(readHeaders).expect(200);
    const row = detail.body.attendance.find(
      (item: { seriesId: string | null }) => item.seriesId === recurringSeriesId,
    );

    expect(row).toMatchObject({
      seriesName: 'Overview Recurring Series',
      attended: 1,
      expected: expectedRecurring,
    });
    expect(row.entries).toHaveLength(1);
    expect(row.entries[0]).toMatchObject({
      eventId: recurringEventId,
      eventName: 'Overview Recurring Series',
    });

    const attendance = await request(app)
      .get(`/v1/members/${SUBJECT}/attendance`)
      .set(readHeaders)
      .expect(200);
    const listed = attendance.body.series.find(
      (item: { seriesId: string | null }) => item.seriesId === recurringSeriesId,
    );
    expect(listed.entries[0]).toMatchObject({
      eventId: recurringEventId,
      eventName: 'Overview Recurring Series',
    });
  });

  it('returns non-series attendance as a row with null series identity, grouped by its event', async () => {
    const detail = await request(app).get(`/v1/members/${SUBJECT}`).set(readHeaders).expect(200);
    const row = detail.body.attendance.find(
      (item: { seriesId: string | null }) => item.seriesId === null,
    );

    expect(row).toMatchObject({
      seriesId: null,
      seriesName: null,
      ministry: null,
      attended: 1,
      expected: 1,
      status: 'completed',
    });
    expect(row.entries).toEqual([
      expect.objectContaining({
        eventId: standaloneEventId,
        eventName: 'Overview Standalone Rally',
        date: day(-3),
        source: 'manual',
      }),
    ]);

    const attendance = await request(app)
      .get(`/v1/members/${SUBJECT}/attendance`)
      .set(readHeaders)
      .expect(200);
    const listed = attendance.body.series.find(
      (item: { seriesId: string | null }) => item.seriesId === null,
    );
    expect(listed.entries[0]).toMatchObject({ eventId: standaloneEventId });
  });

  it('returns the event identity from a manual attendance write', async () => {
    const series = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Overview Today Series',
        timezone: 'UTC',
        schedule: { effectiveFrom: day(0), rrule: 'FREQ=DAILY' },
      });
    expect(series.status).toBe(201);

    const recorded = await request(app)
      .post(`/v1/members/${EMPTY}/attendance`)
      .set(writeHeaders)
      .send({ seriesId: series.body.id, date: day(0) });
    expect(recorded.status).toBe(201);
    expect(recorded.body.eventName).toBe('Overview Today Series');
    expect(recorded.body.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const detail = await request(app).get(`/v1/members/${EMPTY}`).set(readHeaders).expect(200);
    const row = detail.body.attendance.find(
      (item: { seriesId: string | null }) => item.seriesId === series.body.id,
    );
    expect(row.entries[0]).toMatchObject({
      eventId: recorded.body.eventId,
      eventName: 'Overview Today Series',
    });
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
