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
let archivedEventId: string;

let memberContributionId: string;
let memberReference: string;
let eventSeq = 0;
let keySeq = 0;

interface SeedEvent {
  name: string;
  startDate: string;
  endDate: string;
  status?: 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
  sessions: Array<{ date: string; status?: 'scheduled' | 'held' | 'cancelled' }>;
}

function nextKey(label: string): string {
  keySeq += 1;
  return `${label}-${keySeq}`;
}

function postContribution(body: Record<string, unknown>) {
  return request(harness.app).post('/v1/contributions').set(writeHeaders).send(body);
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
      `CON-${eventSeq}`,
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
    offeringId: ghsOfferingId,
    eventId,
    sessionDate: '2999-01-01',
    amountMinor: 5000,
    channel: 'manual',
    ...overrides,
  };
}

beforeAll(async () => {
  harness = await createTestApp();

  const member = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'C-1001', firstName: 'Ama', lastName: 'Mensah' });
  expect(member.status).toBe(201);

  const secondMember = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'C-2002', firstName: 'Kofi', lastName: 'Boateng' });
  expect(secondMember.status).toBe(201);

  const archivedMember = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'C-3003', firstName: 'Yaa', lastName: 'Owusu' });
  expect(archivedMember.status).toBe(201);
  const archive = await request(harness.app).delete('/v1/members/C-3003').set(writeHeaders).send();
  expect(archive.status).toBe(204);

  const ghs = await createOffering({
    purpose: 'General giving',
    kind: 'freewill',
    availableUntil: '2999-12-31',
  });
  expect(ghs.status).toBe(201);
  ghsOfferingId = ghs.body.id;

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

  const archived = await createOffering({ purpose: 'Archived appeal', kind: 'other' });
  expect(archived.status).toBe(201);
  archivedOfferingId = archived.body.id;
  const archiveOffering = await request(harness.app)
    .put(`/v1/offerings/${archivedOfferingId}`)
    .set(writeHeaders)
    .send({ active: false });
  expect(archiveOffering.status).toBe(200);

  const expired = await createOffering({
    purpose: 'Expired appeal',
    kind: 'freewill',
    availableUntil: '2026-11-01',
  });
  expect(expired.status).toBe(201);
  expiredOfferingId = expired.body.id;

  eventId = await insertEvent({
    name: 'Giving Event',
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
  archivedEventId = await insertEvent({
    name: 'Archived Event',
    startDate: '2999-04-01',
    endDate: '2999-04-01',
    status: 'archived',
    sessions: [{ date: '2999-04-01', status: 'cancelled' }],
  });
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/contributions', () => {
  it('records a member gift with terms, reference and no-store', async () => {
    const response = await postContribution({
      ...baseBody({ memberNo: 'C-1001', idempotencyKey: nextKey('member-create') }),
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBeUndefined();
    expect(response.body).toMatchObject({
      id: expect.any(String),
      memberNo: 'C-1001',
      visitorName: null,
      offeringId: ghsOfferingId,
      eventId,
      sessionDate: '2999-01-01',
      amountMinor: 5000,
      currency: 'GHS',
      channel: 'manual',
      status: 'paid',
      termsVersion: 1,
      createdAt: expect.any(String),
    });
    expect(response.body.reference).toMatch(/^MR-[A-Z2-7]{10}$/);
    expect(response.body.idempotencyKey).toBe('member-create-1');
    expect(response.body).not.toHaveProperty('visitorPhone');
    expect(response.body).not.toHaveProperty('visitorPhoneHash');

    memberContributionId = response.body.id;
    memberReference = response.body.reference;
  });

  it('documents the one-giver rule in OpenAPI', async () => {
    const openapi = await request(harness.app).get('/openapi.json');
    expect(openapi.status).toBe(200);
    expect(openapi.body.components.schemas.ContributionCreate.description).toMatch(
      /Exactly one giver side/,
    );
  });

  it('returns the same record for an identical repeat', async () => {
    const response = await postContribution({
      ...baseBody({ memberNo: 'C-1001', idempotencyKey: 'member-create-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.id).toBe(memberContributionId);
    expect(response.body.reference).toBe(memberReference);

    const [row] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from contributions where idempotency_key = 'member-create-1'`,
    );
    expect(Number(row!.count)).toBe(1);
  });

  it('rejects a different payload under the same idempotency key', async () => {
    const response = await postContribution({
      ...baseBody({ memberNo: 'C-1001', amountMinor: 6000, idempotencyKey: 'member-create-1' }),
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('idempotency_conflict');
  });

  it('records a visitor gift with a hashed phone and no member', async () => {
    const [before] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from members',
    );

    const response = await postContribution({
      ...baseBody({
        sessionDate: '2999-01-02',
        amountMinor: 4000,
        visitorName: '  Visitor One  ',
        visitorPhone: '0801 234 5678',
        idempotencyKey: nextKey('visitor'),
      }),
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      memberNo: null,
      visitorName: 'Visitor One',
      sessionDate: '2999-01-02',
      amountMinor: 4000,
      status: 'paid',
    });
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('8012345678');
    expect(serialised).not.toContain('0801');
    expect(response.body).not.toHaveProperty('visitorPhone');
    expect(response.body).not.toHaveProperty('visitorPhoneHash');

    const [row] = await harness.db.query<{
      member_id: string | null;
      visitor_name: string | null;
      visitor_phone_hash: string;
      raw: string;
    }>(
      `select member_id, visitor_name, visitor_phone_hash, row_to_json(contributions)::text as raw
         from contributions where id = $1`,
      [response.body.id],
    );
    expect(row!.member_id).toBeNull();
    expect(row!.visitor_name).toBe('Visitor One');
    expect(row!.visitor_phone_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.raw).not.toContain('8012345678');

    const [after] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from members',
    );
    expect(Number(after!.count)).toBe(Number(before!.count));
  });

  it('accepted an initiated gift that totals ignore', async () => {
    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-2002',
        sessionDate: '2999-01-03',
        amountMinor: 100000,
        status: 'initiated',
        idempotencyKey: nextKey('initiated'),
      }),
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('initiated');
  });

  it('rejects zero and negative amounts', async () => {
    const zero = await postContribution({
      ...baseBody({ memberNo: 'C-1001', amountMinor: 0, idempotencyKey: nextKey('zero') }),
    });
    expect(zero.status).toBe(422);
    expect(zero.body.code).toBe('validation_error');

    const negative = await postContribution({
      ...baseBody({ memberNo: 'C-1001', amountMinor: -1, idempotencyKey: nextKey('negative') }),
    });
    expect(negative.status).toBe(422);
    expect(negative.body.code).toBe('validation_error');
  });

  it('rejects a currency different from the offering terms', async () => {
    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        currency: 'USD',
        idempotencyKey: nextKey('currency'),
      }),
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('returns 404 for an unknown event or offering', async () => {
    const unknownEvent = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        eventId: '00000000-0000-4000-8000-000000000001',
        idempotencyKey: nextKey('unknown-event'),
      }),
    });
    expect(unknownEvent.status).toBe(404);
    expect(unknownEvent.body.code).toBe('not_found');

    const unknownOffering = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        offeringId: '00000000-0000-4000-8000-000000000002',
        idempotencyKey: nextKey('unknown-offering'),
      }),
    });
    expect(unknownOffering.status).toBe(404);
    expect(unknownOffering.body.code).toBe('not_found');
  });

  it('rejects an archived offering', async () => {
    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        offeringId: archivedOfferingId,
        idempotencyKey: nextKey('inactive-offering'),
      }),
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects an offering not attached to the event', async () => {
    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        offeringId: unattachedOfferingId,
        idempotencyKey: nextKey('unattached-offering'),
      }),
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('offering_not_on_event');
  });

  it('rejects a session date the event does not hold', async () => {
    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        sessionDate: '2999-01-09',
        idempotencyKey: nextKey('not-a-session'),
      }),
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('session_not_in_event');
  });

  it('rejects a cancelled session', async () => {
    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        eventId: cancelledSessionEventId,
        sessionDate: '2999-02-02',
        idempotencyKey: nextKey('cancelled-session'),
      }),
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('session_not_in_event');
  });

  it('rejects a cancelled or archived event', async () => {
    for (const target of [cancelledEventId, archivedEventId]) {
      const response = await postContribution({
        ...baseBody({
          memberNo: 'C-1001',
          eventId: target,
          sessionDate: '2999-03-01',
          idempotencyKey: nextKey('inactive-event'),
        }),
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('event_not_active');
    }
  });

  it('returns 404 for an archived member', async () => {
    const response = await postContribution({
      ...baseBody({ memberNo: 'C-3003', idempotencyKey: nextKey('archived-member') }),
    });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });

  it('rejects a gift dated after the effective expiry', async () => {
    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        offeringId: expiredOfferingId,
        eventId: expiryEventId,
        sessionDate: '2999-12-31',
        idempotencyKey: nextKey('after-expiry'),
      }),
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('offering_expired');
  });

  it('accepts a backdated gift inside the window when the offering is expired today', async () => {
    const detail = await request(harness.app).get(`/v1/events/${expiryEventId}`).set(readHeaders);
    expect(detail.status).toBe(200);
    expect(detail.body.offerings[0].expired).toBe(true);

    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        offeringId: expiredOfferingId,
        eventId: expiryEventId,
        sessionDate: '2026-11-01',
        amountMinor: 1500,
        idempotencyKey: nextKey('backdated'),
      }),
    });

    expect(response.status).toBe(201);
    expect(response.body.sessionDate).toBe('2026-11-01');
  });

  it('rejects a failed status on create', async () => {
    const response = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        status: 'failed',
        idempotencyKey: nextKey('failed-status'),
      }),
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });
});

describe('GET /v1/contributions', () => {
  beforeAll(async () => {
    const extra = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        sessionDate: '2999-01-03',
        amountMinor: 2000,
        idempotencyKey: nextKey('list'),
      }),
    });
    expect(extra.status).toBe(201);

    const second = await postContribution({
      ...baseBody({
        memberNo: 'C-2002',
        sessionDate: '2999-01-01',
        amountMinor: 7000,
        idempotencyKey: nextKey('list'),
      }),
    });
    expect(second.status).toBe(201);

    const usd = await postContribution({
      ...baseBody({
        memberNo: 'C-1001',
        offeringId: usdOfferingId,
        sessionDate: '2999-01-01',
        amountMinor: 900,
        idempotencyKey: nextKey('list'),
      }),
    });
    expect(usd.status).toBe(201);
  });

  it('lists newest first and carries no-store', async () => {
    const response = await request(harness.app).get('/v1/contributions').set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.items.length).toBe(7);
    for (const item of response.body.items) {
      expect(item).not.toHaveProperty('visitorPhoneHash');
    }
    const timestamps = response.body.items.map((item: { createdAt: string }) => item.createdAt);
    for (let index = 1; index < timestamps.length; index += 1) {
      expect(timestamps[index - 1] >= timestamps[index]).toBe(true);
    }
  });

  it('filters by member, offering, event and session window', async () => {
    const byMember = await request(harness.app)
      .get('/v1/contributions?memberNo=c-1001')
      .set(readHeaders);
    expect(byMember.status).toBe(200);
    expect(byMember.body.items.length).toBe(4);
    expect(
      byMember.body.items.every((item: { memberNo: string }) => item.memberNo === 'C-1001'),
    ).toBe(true);

    const byOffering = await request(harness.app)
      .get(`/v1/contributions?offeringId=${ghsOfferingId}`)
      .set(readHeaders);
    expect(byOffering.status).toBe(200);
    expect(
      byOffering.body.items.every(
        (item: { offeringId: string }) => item.offeringId === ghsOfferingId,
      ),
    ).toBe(true);

    const byEvent = await request(harness.app)
      .get(`/v1/contributions?eventId=${eventId}`)
      .set(readHeaders);
    expect(byEvent.status).toBe(200);
    expect(byEvent.body.items.every((item: { eventId: string }) => item.eventId === eventId)).toBe(
      true,
    );

    const windowed = await request(harness.app)
      .get('/v1/contributions?from=2999-01-02&to=2999-01-03')
      .set(readHeaders);
    expect(windowed.status).toBe(200);
    expect(
      windowed.body.items.every(
        (item: { sessionDate: string }) =>
          item.sessionDate >= '2999-01-02' && item.sessionDate <= '2999-01-03',
      ),
    ).toBe(true);
  });

  it('rejects a calendar-invalid window as 422', async () => {
    for (const from of ['2026-02-30', '2026-13-01']) {
      const response = await request(harness.app)
        .get(`/v1/contributions?from=${from}`)
        .set(readHeaders);
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('validation_error');
    }

    const badTo = await request(harness.app)
      .get('/v1/contributions?to=2026-02-30')
      .set(readHeaders);
    expect(badTo.status).toBe(422);
    expect(badTo.body.code).toBe('validation_error');
  });

  it('pages with a stable nextCursor', async () => {
    const first = await request(harness.app).get('/v1/contributions?limit=3').set(readHeaders);
    expect(first.status).toBe(200);
    expect(first.body.items.length).toBe(3);
    expect(typeof first.body.nextCursor).toBe('string');

    const second = await request(harness.app)
      .get(`/v1/contributions?limit=3&cursor=${first.body.nextCursor}`)
      .set(readHeaders);
    expect(second.status).toBe(200);
    expect(second.body.items.length).toBe(3);
    expect(typeof second.body.nextCursor).toBe('string');

    const third = await request(harness.app)
      .get(`/v1/contributions?limit=3&cursor=${second.body.nextCursor}`)
      .set(readHeaders);
    expect(third.status).toBe(200);
    expect(third.body.items.length).toBe(1);
    expect(third.body.nextCursor).toBeUndefined();

    const ids = [...first.body.items, ...second.body.items, ...third.body.items].map(
      (item: { id: string }) => item.id,
    );
    expect(new Set(ids).size).toBe(7);
  });
});

describe('GET /v1/contributions/summary', () => {
  it('groups paid member and visitor totals by currency, ignoring initiated', async () => {
    const response = await request(harness.app)
      .get('/v1/contributions/summary?from=2999-01-01&to=2999-01-03')
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.from).toBe('2999-01-01');
    expect(response.body.to).toBe('2999-01-03');
    expect(response.body.items).toEqual([
      {
        currency: 'GHS',
        memberCount: 3,
        memberPaidMinor: 14000,
        visitorCount: 1,
        visitorPaidMinor: 4000,
      },
      {
        currency: 'USD',
        memberCount: 1,
        memberPaidMinor: 900,
        visitorCount: 0,
        visitorPaidMinor: 0,
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('Visitor One');
    expect(JSON.stringify(response.body)).not.toContain('C-1001');
  });

  it('requires both bounds and an ordered window', async () => {
    const missing = await request(harness.app)
      .get('/v1/contributions/summary?from=2999-01-01')
      .set(readHeaders);
    expect(missing.status).toBe(422);

    const reversed = await request(harness.app)
      .get('/v1/contributions/summary?from=2999-01-03&to=2999-01-01')
      .set(readHeaders);
    expect(reversed.status).toBe(422);
  });
});

describe('append-only surface', () => {
  it('has no update or delete route', async () => {
    const update = await request(harness.app)
      .put(`/v1/contributions/${memberContributionId}`)
      .set(writeHeaders)
      .send({ amountMinor: 1 });
    expect(update.status).toBe(404);

    const remove = await request(harness.app)
      .delete(`/v1/contributions/${memberContributionId}`)
      .set(writeHeaders);
    expect(remove.status).toBe(404);
  });
});

describe('idempotency outranks later state changes', () => {
  let retryOfferingId: string;
  let retryEventId: string;
  let retryEvent2Id: string;
  let retryOffering2Id: string;
  let memberGiftId: string;
  let memberGiftReference: string;
  let eventGiftId: string;
  let offeringGiftId: string;

  beforeAll(async () => {
    for (const memberNo of ['C-4004', 'C-5005']) {
      const member = await request(harness.app)
        .post('/v1/members')
        .set(writeHeaders)
        .send({ memberNo, firstName: 'Retry', lastName: memberNo });
      expect(member.status).toBe(201);
    }

    const retryOffering = await createOffering({
      purpose: 'Retry appeal',
      kind: 'freewill',
      availableUntil: '2999-12-31',
    });
    expect(retryOffering.status).toBe(201);
    retryOfferingId = retryOffering.body.id;

    const secondOffering = await createOffering({
      purpose: 'Second retry appeal',
      kind: 'freewill',
      availableUntil: '2999-12-31',
    });
    expect(secondOffering.status).toBe(201);
    retryOffering2Id = secondOffering.body.id;

    retryEventId = await insertEvent({
      name: 'Retry Event One',
      startDate: '2999-06-01',
      endDate: '2999-06-01',
      sessions: [{ date: '2999-06-01' }],
    });
    retryEvent2Id = await insertEvent({
      name: 'Retry Event Two',
      startDate: '2999-07-01',
      endDate: '2999-07-01',
      sessions: [{ date: '2999-07-01' }],
    });
    expect((await attach(retryEventId, retryOfferingId)).status).toBe(201);
    expect((await attach(retryEvent2Id, retryOfferingId)).status).toBe(201);
    expect((await attach(retryEventId, retryOffering2Id)).status).toBe(201);

    const memberGift = await postContribution({
      memberNo: 'C-4004',
      offeringId: retryOfferingId,
      eventId: retryEventId,
      sessionDate: '2999-06-01',
      amountMinor: 3000,
      channel: 'app',
      idempotencyKey: 'retry-member',
    });
    expect(memberGift.status).toBe(201);
    memberGiftId = memberGift.body.id;
    memberGiftReference = memberGift.body.reference;

    const eventGift = await postContribution({
      memberNo: 'C-5005',
      offeringId: retryOfferingId,
      eventId: retryEvent2Id,
      sessionDate: '2999-07-01',
      amountMinor: 3100,
      channel: 'app',
      idempotencyKey: 'retry-event',
    });
    expect(eventGift.status).toBe(201);
    eventGiftId = eventGift.body.id;

    const offeringGift = await postContribution({
      memberNo: 'C-5005',
      offeringId: retryOffering2Id,
      eventId: retryEventId,
      sessionDate: '2999-06-01',
      amountMinor: 3200,
      channel: 'app',
      idempotencyKey: 'retry-offering',
    });
    expect(offeringGift.status).toBe(201);
    offeringGiftId = offeringGift.body.id;
  });

  it('returns the stored member gift after the member is archived', async () => {
    const archive = await request(harness.app)
      .delete('/v1/members/C-4004')
      .set(writeHeaders)
      .send();
    expect(archive.status).toBe(204);

    const repeat = await postContribution({
      memberNo: 'C-4004',
      offeringId: retryOfferingId,
      eventId: retryEventId,
      sessionDate: '2999-06-01',
      amountMinor: 3000,
      channel: 'app',
      idempotencyKey: 'retry-member',
    });
    expect(repeat.status).toBe(200);
    expect(repeat.body.id).toBe(memberGiftId);
    expect(repeat.body.reference).toBe(memberGiftReference);

    const different = await postContribution({
      memberNo: 'C-4004',
      offeringId: retryOfferingId,
      eventId: retryEventId,
      sessionDate: '2999-06-01',
      amountMinor: 3001,
      channel: 'app',
      idempotencyKey: 'retry-member',
    });
    expect(different.status).toBe(409);
    expect(different.body.code).toBe('idempotency_conflict');
  });

  it('returns the stored gift after the event is cancelled', async () => {
    await harness.db.query(`update event_instances set status = 'cancelled' where id = $1`, [
      retryEvent2Id,
    ]);

    const repeat = await postContribution({
      memberNo: 'C-5005',
      offeringId: retryOfferingId,
      eventId: retryEvent2Id,
      sessionDate: '2999-07-01',
      amountMinor: 3100,
      channel: 'app',
      idempotencyKey: 'retry-event',
    });
    expect(repeat.status).toBe(200);
    expect(repeat.body.id).toBe(eventGiftId);
  });

  it('returns the stored gift after the offering is archived', async () => {
    const archive = await request(harness.app)
      .put(`/v1/offerings/${retryOffering2Id}`)
      .set(writeHeaders)
      .send({ active: false });
    expect(archive.status).toBe(200);

    const repeat = await postContribution({
      memberNo: 'C-5005',
      offeringId: retryOffering2Id,
      eventId: retryEventId,
      sessionDate: '2999-06-01',
      amountMinor: 3200,
      channel: 'app',
      idempotencyKey: 'retry-offering',
    });
    expect(repeat.status).toBe(200);
    expect(repeat.body.id).toBe(offeringGiftId);

    // A fresh key still runs the validations and rejects the archived offering.
    const fresh = await postContribution({
      memberNo: 'C-5005',
      offeringId: retryOffering2Id,
      eventId: retryEventId,
      sessionDate: '2999-06-01',
      amountMinor: 3300,
      channel: 'app',
      idempotencyKey: nextKey('retry-archived-offering'),
    });
    expect(fresh.status).toBe(422);
    expect(fresh.body.code).toBe('validation_error');
  });
});
