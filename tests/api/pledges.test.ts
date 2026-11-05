import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;

let ghsOfferingId: string;
let usdOfferingId: string;
let unattachedOfferingId: string;
let archivedOfferingId: string;
let expiredOfferingId: string;

let eventId: string;
let expiryEventId: string;
let cancelledSessionEventId: string;
let cancelledEventId: string;

let eventSeq = 0;
let keySeq = 0;

interface SeedEvent {
  name: string;
  startDate: string;
  endDate: string;
  status?: 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
  sessions: Array<{ date: string; status?: 'scheduled' | 'held' | 'cancelled' }>;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function nextKey(label: string): string {
  keySeq += 1;
  return `${label}-${keySeq}`;
}

function postPledge(body: Record<string, unknown>) {
  return request(harness.app).post('/v1/pledges').set(writeHeaders).send(body);
}

function getPledge(id: string) {
  return request(harness.app).get(`/v1/pledges/${id}`).set(readHeaders);
}

function createOffering(body: Record<string, unknown>) {
  return request(harness.app).post('/v1/offerings').set(writeHeaders).send(body);
}

function attach(event: string, offeringId: string) {
  return request(harness.app)
    .post(`/v1/events/${event}/offerings`)
    .set(writeHeaders)
    .send({ offeringId });
}

async function insertEvent(seed: SeedEvent): Promise<string> {
  eventSeq += 1;
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, venue_name, description, status, source, sessions
     )
     values ($1,null,$2,'UTC',$3,$4,'09:00',null,'auditorium',null,null,$5,'manual',$6::jsonb)
     returning id`,
    [
      `PL-${eventSeq}`,
      seed.name,
      seed.startDate,
      seed.endDate,
      seed.status ?? 'scheduled',
      JSON.stringify(
        seed.sessions.map((session) => ({
          date: session.date,
          startTime: '09:00',
          endTime: null,
          status: session.status ?? 'scheduled',
        })),
      ),
    ],
  );
  return row!.id;
}

function baseBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    memberNo: 'PL-1001',
    offeringId: ghsOfferingId,
    eventId,
    amountMinor: 5000,
    expectedOn: '2999-01-01',
    idempotencyKey: nextKey('pledge'),
    ...overrides,
  };
}

async function makePledge(overrides: Record<string, unknown> = {}) {
  const response = await postPledge(baseBody(overrides));
  expect(response.status).toBe(201);
  return response.body as {
    id: string;
    memberNo: string;
    followUpOfficerMemberNo: string;
    status: string;
    expectedOn: string;
  };
}

beforeAll(async () => {
  harness = await createTestApp();

  const presbyter = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'PL-9001', firstName: 'Grace', lastName: 'Okafor', isPresbyter: true });
  expect(presbyter.status).toBe(201);

  const secondPresbyter = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'PL-9002', firstName: 'Daniel', lastName: 'Adjei', isPresbyter: true });
  expect(secondPresbyter.status).toBe(201);

  const member = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'PL-1001', firstName: 'Ama', lastName: 'Mensah' });
  expect(member.status).toBe(201);

  const unassigned = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'PL-1002', firstName: 'Kofi', lastName: 'Boateng' });
  expect(unassigned.status).toBe(201);

  const archived = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'PL-3003', firstName: 'Yaa', lastName: 'Owusu' });
  expect(archived.status).toBe(201);
  expect(
    (await request(harness.app).delete('/v1/members/PL-3003').set(writeHeaders).send()).status,
  ).toBe(204);

  const assignment = await request(harness.app)
    .post('/v1/shepherding/assignments')
    .set(writeHeaders)
    .send({ officerMemberNo: 'PL-9001', memberNo: 'PL-1001', assignedOn: '2020-01-01' });
  expect(assignment.status).toBe(201);

  const ghs = await createOffering({
    purpose: 'General giving',
    kind: 'freewill',
    availableUntil: '2999-12-31',
  });
  expect(ghs.status).toBe(201);
  ghsOfferingId = ghs.body.id;

  const published = await request(harness.app)
    .post(`/v1/offerings/${ghsOfferingId}/terms`)
    .set(writeHeaders)
    .send({
      baseVersion: 1,
      purpose: 'General giving, second version',
      kind: 'freewill',
      availableUntil: '2999-12-31',
      reason: 'Pledge tests use the current terms',
    });
  expect(published.status).toBe(201);
  expect(published.body.version).toBe(2);

  const usd = await createOffering({
    purpose: 'Missions giving',
    kind: 'missions',
    currency: 'USD',
    availableUntil: '2999-12-31',
  });
  expect(usd.status).toBe(201);
  usdOfferingId = usd.body.id;

  const unattached = await createOffering({ purpose: 'Unattached appeal', kind: 'other' });
  expect(unattached.status).toBe(201);
  unattachedOfferingId = unattached.body.id;

  const archivedOffering = await createOffering({ purpose: 'Archived appeal', kind: 'other' });
  expect(archivedOffering.status).toBe(201);
  archivedOfferingId = archivedOffering.body.id;
  expect(
    (
      await request(harness.app)
        .put(`/v1/offerings/${archivedOfferingId}`)
        .set(writeHeaders)
        .send({ active: false })
    ).status,
  ).toBe(200);

  const expired = await createOffering({
    purpose: 'Expired appeal',
    kind: 'freewill',
    availableUntil: '2026-11-01',
  });
  expect(expired.status).toBe(201);
  expiredOfferingId = expired.body.id;

  eventId = await insertEvent({
    name: 'Pledge Event',
    startDate: '2999-01-01',
    endDate: '2999-01-05',
    sessions: [{ date: '2999-01-01' }, { date: '2999-01-02' }, { date: '2999-01-03' }],
  });
  expect((await attach(eventId, ghsOfferingId)).status).toBe(201);
  expect((await attach(eventId, usdOfferingId)).status).toBe(201);

  expiryEventId = await insertEvent({
    name: 'Expiry Window Event',
    startDate: '2026-11-01',
    endDate: '2999-12-31',
    sessions: [{ date: '2026-11-01' }, { date: '2999-12-31' }],
  });
  expect((await attach(expiryEventId, expiredOfferingId)).status).toBe(201);

  cancelledSessionEventId = await insertEvent({
    name: 'Cancelled Session Event',
    startDate: '2999-02-01',
    endDate: '2999-02-02',
    sessions: [{ date: '2999-02-01' }, { date: '2999-02-02', status: 'cancelled' }],
  });
  expect((await attach(cancelledSessionEventId, ghsOfferingId)).status).toBe(201);

  cancelledEventId = await insertEvent({
    name: 'Cancelled Event',
    startDate: '2999-03-01',
    endDate: '2999-03-01',
    status: 'cancelled',
    sessions: [{ date: '2999-03-01', status: 'cancelled' }],
  });
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/pledges', () => {
  it('creates a pledge and resolves the member’s active shepherd', async () => {
    const response = await postPledge(baseBody({ idempotencyKey: nextKey('shepherd') }));

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe(`/v1/pledges/${response.body.id}`);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      memberNo: 'PL-1001',
      offeringId: ghsOfferingId,
      eventId,
      sessionDate: null,
      amountMinor: 5000,
      currency: 'GHS',
      expectedOn: '2999-01-01',
      followUpOfficerMemberNo: 'PL-9001',
      status: 'pending',
      reason: null,
      termsVersion: 2,
      createdAt: expect.any(String),
    });
    expect(response.body.idempotencyKey).toBe('shepherd-1');
  });

  it('prefers a supplied active presbyter and records the reason', async () => {
    const response = await postPledge(
      baseBody({
        followUpOfficerMemberNo: 'PL-9002',
        officerReason: 'Administrator assigned the follow-up',
        idempotencyKey: nextKey('supplied-officer'),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.followUpOfficerMemberNo).toBe('PL-9002');
    expect(response.body.reason).toBe('Administrator assigned the follow-up');
  });

  it('rejects an officerReason without a supplied officer', async () => {
    const response = await postPledge(
      baseBody({ officerReason: 'No officer named', idempotencyKey: nextKey('orphan-reason') }),
    );

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects a supplied officer who is not an active presbyter', async () => {
    const response = await postPledge(
      baseBody({
        followUpOfficerMemberNo: 'PL-1001',
        officerReason: 'Not a presbyter',
        idempotencyKey: nextKey('invalid-officer'),
      }),
    );

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('requires an officer when the member has no shepherd', async () => {
    const response = await postPledge(
      baseBody({ memberNo: 'PL-1002', idempotencyKey: nextKey('officer-required') }),
    );

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('officer_required');
  });

  it('rejects an expected date before today (UTC)', async () => {
    const response = await postPledge(
      baseBody({ expectedOn: '2020-01-01', idempotencyKey: nextKey('past-expected') }),
    );

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('invalid_expected_date');
  });

  it('rejects a currency different from the offering terms', async () => {
    const response = await postPledge(
      baseBody({ currency: 'USD', idempotencyKey: nextKey('currency') }),
    );

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('returns 404 for an unknown member, event or offering', async () => {
    const cases: Array<Record<string, unknown>> = [
      { memberNo: 'PL-9999' },
      { eventId: '00000000-0000-4000-8000-000000000001' },
      { offeringId: '00000000-0000-4000-8000-000000000002' },
    ];

    for (const override of cases) {
      const response = await postPledge(baseBody({ ...override, idempotencyKey: nextKey('404') }));
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('not_found');
    }
  });

  it('returns 404 for an archived member', async () => {
    const response = await postPledge(
      baseBody({ memberNo: 'PL-3003', idempotencyKey: nextKey('archived-member') }),
    );
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });

  it('rejects an offering not attached to the event', async () => {
    const response = await postPledge(
      baseBody({ offeringId: unattachedOfferingId, idempotencyKey: nextKey('unattached') }),
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('offering_not_on_event');
  });

  it('rejects an archived offering', async () => {
    const response = await postPledge(
      baseBody({ offeringId: archivedOfferingId, idempotencyKey: nextKey('inactive') }),
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects a session date the event does not hold or has cancelled', async () => {
    const notASession = await postPledge(
      baseBody({ sessionDate: '2999-01-09', idempotencyKey: nextKey('not-a-session') }),
    );
    expect(notASession.status).toBe(422);
    expect(notASession.body.code).toBe('session_not_in_event');

    const cancelled = await postPledge(
      baseBody({
        eventId: cancelledSessionEventId,
        sessionDate: '2999-02-02',
        idempotencyKey: nextKey('cancelled-session'),
      }),
    );
    expect(cancelled.status).toBe(422);
    expect(cancelled.body.code).toBe('session_not_in_event');
  });

  it('rejects a cancelled event', async () => {
    const response = await postPledge(
      baseBody({ eventId: cancelledEventId, idempotencyKey: nextKey('cancelled-event') }),
    );
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('event_not_active');
  });

  it('rejects a pledge dated after the effective expiry but accepts a backdated one inside it', async () => {
    const afterExpiry = await postPledge(
      baseBody({
        offeringId: expiredOfferingId,
        eventId: expiryEventId,
        sessionDate: '2999-12-31',
        idempotencyKey: nextKey('after-expiry'),
      }),
    );
    expect(afterExpiry.status).toBe(422);
    expect(afterExpiry.body.code).toBe('offering_expired');

    const backdated = await postPledge(
      baseBody({
        offeringId: expiredOfferingId,
        eventId: expiryEventId,
        sessionDate: '2026-11-01',
        idempotencyKey: nextKey('backdated'),
      }),
    );
    expect(backdated.status).toBe(201);
    expect(backdated.body.sessionDate).toBe('2026-11-01');
  });

  it('is idempotent and keeps the repeat after a state change', async () => {
    const created = await postPledge(baseBody({ idempotencyKey: 'pledge-idem-1' }));
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const repeat = await postPledge(baseBody({ idempotencyKey: 'pledge-idem-1' }));
    expect(repeat.status).toBe(200);
    expect(repeat.headers['cache-control']).toBe('no-store');
    expect(repeat.body.id).toBe(id);

    const different = await postPledge(
      baseBody({ amountMinor: 6000, idempotencyKey: 'pledge-idem-1' }),
    );
    expect(different.status).toBe(409);
    expect(different.body.code).toBe('idempotency_conflict');

    expect(
      (await request(harness.app).post(`/v1/pledges/${id}/honor`).set(writeHeaders).send({}))
        .status,
    ).toBe(200);

    const afterStateChange = await postPledge(baseBody({ idempotencyKey: 'pledge-idem-1' }));
    expect(afterStateChange.status).toBe(200);
    expect(afterStateChange.body.id).toBe(id);
    expect(afterStateChange.body.status).toBe('honored');

    const [row] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from pledges where idempotency_key = 'pledge-idem-1'`,
    );
    expect(Number(row!.count)).toBe(1);
  });
});

describe('default reminders', () => {
  it('creates three pending sms reminders for a far-future expected date', async () => {
    const pledge = await makePledge({
      expectedOn: '2999-01-01',
      idempotencyKey: nextKey('reminders-far'),
    });

    const list = await request(harness.app)
      .get(`/v1/pledges/${pledge.id}/reminders`)
      .set(readHeaders);

    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.body.items).toHaveLength(3);
    expect(
      list.body.items.map((item: { scheduledFor: string }) => item.scheduledFor).sort(),
    ).toEqual(['2998-12-25', '2999-01-01', '2999-01-08']);
    for (const item of list.body.items as Array<{ channel: string; status: string }>) {
      expect(item.channel).toBe('sms');
      expect(item.status).toBe('pending');
    }
  });

  it('writes a past-dated auto reminder as cancelled and keeps the rest pending', async () => {
    const expectedOn = shiftDate(todayUtc(), 1);
    const pledge = await makePledge({
      expectedOn,
      idempotencyKey: nextKey('reminders-short'),
    });

    const list = await request(harness.app)
      .get(`/v1/pledges/${pledge.id}/reminders`)
      .set(readHeaders);

    const byDate = new Map(
      (list.body.items as Array<{ scheduledFor: string; status: string }>).map((item) => [
        item.scheduledFor,
        item.status,
      ]),
    );
    expect(byDate.get(shiftDate(expectedOn, -7))).toBe('cancelled');
    expect(byDate.get(expectedOn)).toBe('pending');
    expect(byDate.get(shiftDate(expectedOn, 7))).toBe('pending');
  });
});

describe('reminder routes', () => {
  it('rejects a manually scheduled past date', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('manual-past') });
    const response = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/reminders`)
      .set(writeHeaders)
      .send({ scheduledFor: '2020-01-01', channel: 'sms' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('invalid_reminder_date');
  });

  it('rejects a duplicate pledge/date/channel and lists the reminder', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('duplicate-reminder') });
    const body = { scheduledFor: '2999-02-02', channel: 'whatsapp' };

    const first = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/reminders`)
      .set(writeHeaders)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body).toMatchObject({
      pledgeId: pledge.id,
      scheduledFor: '2999-02-02',
      channel: 'whatsapp',
      status: 'pending',
      sentAt: null,
    });

    const duplicate = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/reminders`)
      .set(writeHeaders)
      .send(body);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('conflict');

    const list = await request(harness.app)
      .get(`/v1/pledges/${pledge.id}/reminders`)
      .set(readHeaders);
    expect(list.body.items).toHaveLength(4);
    expect(list.body.items[0]).toMatchObject({ scheduledFor: '2999-02-02', channel: 'whatsapp' });
  });

  it('closes reminders on a terminal pledge', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('terminal-reminder') });
    expect(
      (await request(harness.app).post(`/v1/pledges/${pledge.id}/honor`).set(writeHeaders).send({}))
        .status,
    ).toBe(200);

    const response = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/reminders`)
      .set(writeHeaders)
      .send({ scheduledFor: '2999-02-03', channel: 'sms' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('pledge_already_terminal');
  });
});

describe('pledge transitions', () => {
  it('honors a pledge', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('honor') });
    const response = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/honor`)
      .set(writeHeaders)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('honored');

    const [event] = await harness.db.query<{ kind: string; actor: string }>(
      `select kind, actor from pledge_events where pledge_id = $1 and kind = 'honored'`,
      [pledge.id],
    );
    expect(event!.actor).toBe('test-admin');
  });

  it('requires a reason to dishonor and records it', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('dishonor') });

    const missing = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/dishonor`)
      .set(writeHeaders)
      .send({});
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation_error');

    const dishonored = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/dishonor`)
      .set(writeHeaders)
      .send({ reason: 'Did not pay after the follow-up' });
    expect(dishonored.status).toBe(200);
    expect(dishonored.body.status).toBe('dishonored');

    const [event] = await harness.db.query<{ reason: string }>(
      `select reason from pledge_events where pledge_id = $1 and kind = 'dishonored'`,
      [pledge.id],
    );
    expect(event!.reason).toBe('Did not pay after the follow-up');
  });

  it('rejects another transition on a terminal pledge', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('terminal') });
    expect(
      (await request(harness.app).post(`/v1/pledges/${pledge.id}/honor`).set(writeHeaders).send({}))
        .status,
    ).toBe(200);

    const secondHonor = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/honor`)
      .set(writeHeaders)
      .send({});
    expect(secondHonor.status).toBe(409);
    expect(secondHonor.body.code).toBe('pledge_already_terminal');

    const dishonor = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/dishonor`)
      .set(writeHeaders)
      .send({ reason: 'Changed my mind' });
    expect(dishonor.status).toBe(409);
    expect(dishonor.body.code).toBe('pledge_already_terminal');
  });

  it('honors a pending pledge after the offering expired', async () => {
    const pledge = await makePledge({
      offeringId: expiredOfferingId,
      eventId: expiryEventId,
      sessionDate: '2026-11-01',
      idempotencyKey: nextKey('honor-after-expiry'),
    });

    const response = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/honor`)
      .set(writeHeaders)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('honored');
  });

  it('reassigns the officer and keeps both officers in pledge_events', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('reassign') });
    expect(pledge.followUpOfficerMemberNo).toBe('PL-9001');

    const response = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/reassign`)
      .set(writeHeaders)
      .send({ officerMemberNo: 'PL-9002', reason: 'Moved to another presbyter' });

    expect(response.status).toBe(200);
    expect(response.body.followUpOfficerMemberNo).toBe('PL-9002');

    const [row] = await harness.db.query<{
      from_member_no: string;
      to_member_no: string;
      reason: string;
    }>(
      `select f.member_no as from_member_no, t.member_no as to_member_no, e.reason
         from pledge_events e
         join members f on f.id = e.from_officer_member_id
         join members t on t.id = e.to_officer_member_id
        where e.pledge_id = $1 and e.kind = 'reassigned'`,
      [pledge.id],
    );
    expect(row).toMatchObject({
      from_member_no: 'PL-9001',
      to_member_no: 'PL-9002',
      reason: 'Moved to another presbyter',
    });
  });

  it('rejects a reassignment to a non-presbyter', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('reassign-invalid') });
    const response = await request(harness.app)
      .post(`/v1/pledges/${pledge.id}/reassign`)
      .set(writeHeaders)
      .send({ officerMemberNo: 'PL-1001', reason: 'Not an officer' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });
});

describe('GET /v1/pledges', () => {
  it('filters by member, officer, derived overdue and expected-date range', async () => {
    const first = await makePledge({
      memberNo: 'PL-1001',
      expectedOn: '2999-03-03',
      idempotencyKey: nextKey('list-first'),
    });
    const second = await makePledge({
      memberNo: 'PL-1002',
      followUpOfficerMemberNo: 'PL-9002',
      officerReason: 'Unassigned member needs an officer',
      expectedOn: '2999-04-04',
      idempotencyKey: nextKey('list-second'),
    });

    const byMember = await request(harness.app)
      .get('/v1/pledges?memberNo=PL-1001')
      .set(readHeaders);
    expect(byMember.status).toBe(200);
    expect(byMember.headers['cache-control']).toBe('no-store');
    expect(byMember.body.items.length).toBeGreaterThan(0);
    expect(
      (byMember.body.items as Array<{ memberNo: string }>).every(
        (item) => item.memberNo === 'PL-1001',
      ),
    ).toBe(true);

    const byOfficer = await request(harness.app)
      .get('/v1/pledges?officerMemberNo=PL-9002')
      .set(readHeaders);
    expect(
      (byOfficer.body.items as Array<{ followUpOfficerMemberNo: string }>).every(
        (item) => item.followUpOfficerMemberNo === 'PL-9002',
      ),
    ).toBe(true);

    const inRange = await request(harness.app)
      .get('/v1/pledges?from=2999-03-03&to=2999-03-03')
      .set(readHeaders);
    expect(inRange.body.items).toHaveLength(1);
    expect(inRange.body.items[0].id).toBe(first.id);

    // Overdue is derived, never stored: backdate a pending pledge behind the API.
    await harness.db.query(`update pledges set expected_on = '2020-01-01' where id = $1`, [
      second.id,
    ]);
    const [stored] = await harness.db.query<{ status: string }>(
      'select status from pledges where id = $1',
      [second.id],
    );
    expect(stored!.status).toBe('pending');

    const overdue = await request(harness.app)
      .get('/v1/pledges?status=overdue&memberNo=PL-1002')
      .set(readHeaders);
    expect(overdue.body.items).toHaveLength(1);
    expect(overdue.body.items[0]).toMatchObject({ id: second.id, status: 'overdue' });

    const pending = await request(harness.app)
      .get('/v1/pledges?status=pending&memberNo=PL-1002')
      .set(readHeaders);
    expect(pending.body.items).toHaveLength(0);

    const detail = await getPledge(second.id);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('overdue');
  });
});

describe('offering kinds', () => {
  it('rejects the retired pledge kind in the schema', async () => {
    const response = await createOffering({ purpose: 'A pledge kind', kind: 'pledge' });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects the retired pledge kind at the database check', async () => {
    await expect(
      harness.db.query(
        `insert into offering_terms (offering_id, version, purpose, kind, currency, created_by)
         values ($1, 99, 'A pledge kind', 'pledge', 'GHS', 'test')`,
        [ghsOfferingId],
      ),
    ).rejects.toThrow();
  });
});
