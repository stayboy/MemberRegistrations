import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgDb } from '../../src/db/pg.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { OfferingCountRepository } from '../../src/repos/offering-counts.js';
import { OfferingRepository } from '../../src/repos/offerings.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let today: string;
let tomorrow: string;
let summaryDate: string;

let ghsOffering: string;
let ghsSecondOffering: string;
let usdOffering: string;

let eventA: string;
let eventB: string;
let otherEvent: string;
let cancelledEvent: string;
let cancelledSessionEvent: string;
let archivedEvent: string;
let summaryEvent: string;

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

async function createOffering(currency: string, purpose: string): Promise<string> {
  const response = await request(harness.app).post('/v1/offerings').set(writeHeaders).send({
    name: purpose,
    purpose,
    kind: 'freewill',
    currency,
    availableUntil: '2999-12-31',
  });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function attach(eventId: string, offeringId: string): Promise<void> {
  const response = await request(harness.app)
    .post(`/v1/events/${eventId}/offerings`)
    .set(writeHeaders)
    .send({ offeringId });
  expect(response.status).toBe(201);
}

async function createEvent(
  eventNo: string,
  dates: string[],
  sessions: Array<{
    date: string;
    startTime?: string;
    endTime?: string | null;
    status?: 'scheduled' | 'held' | 'cancelled';
    venueType?: 'auditorium' | 'virtual' | 'hybrid';
  }> = dates.map((date) => ({ date })),
): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo,
      name: `Offering count ${eventNo}`,
      timezone: 'UTC',
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      startTime: '09:00',
      venueType: 'auditorium',
      sessions,
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

function record(eventId: string, body: Record<string, unknown>, actor = 'count-admin') {
  return request(harness.app)
    .post(`/v1/events/${eventId}/offering-counts`)
    .set({ ...writeHeaders, 'X-Actor-Id': actor })
    .send(body);
}

function read(eventId: string, sessionDate: string, offeringId: string) {
  return request(harness.app)
    .get(`/v1/events/${eventId}/offering-counts`)
    .query({ sessionDate, offeringId })
    .set(readHeaders);
}

function baseCount(overrides: Record<string, unknown> = {}) {
  return {
    sessionDate: today,
    offeringId: ghsOffering,
    lines: [{ denominationMinor: 2000, pieces: 3 }],
    asOf: `${today}T09:00:00.000Z`,
    ...overrides,
  };
}

beforeAll(async () => {
  harness = await createTestApp();
  today = new Date().toISOString().slice(0, 10);
  tomorrow = shiftDate(today, 1);
  summaryDate = shiftDate(today, -5);

  ghsOffering = await createOffering('GHS', 'Count Tithe');
  ghsSecondOffering = await createOffering('GHS', 'Count Missions');
  usdOffering = await createOffering('USD', 'Count Dollars');

  eventA = await createEvent('OC-100', [today, tomorrow]);
  eventB = await createEvent('OC-200', [today]);
  otherEvent = await createEvent('OC-250', [today]);
  cancelledEvent = await createEvent('OC-280', [today]);
  cancelledSessionEvent = await createEvent(
    'OC-300',
    [today],
    [{ date: today, startTime: '09:00', status: 'cancelled' }],
  );
  archivedEvent = await createEvent('OC-400', [today]);
  summaryEvent = await createEvent('OC-500', [shiftDate(summaryDate, -1), summaryDate]);

  await attach(eventA, ghsOffering);
  await attach(eventA, usdOffering);
  await attach(eventA, ghsSecondOffering);
  await attach(otherEvent, ghsSecondOffering);
  await attach(cancelledEvent, ghsOffering);
  await attach(cancelledSessionEvent, ghsOffering);
  await attach(archivedEvent, ghsOffering);
  // The summary event is in the past, so attaching through the route would be
  // refused as an ended event; seed the attachments as the database would.
  await harness.db.query(
    `insert into event_instance_offerings (event_instance_id, offering_id, attached_by)
     values ($1, $2, 'seed'), ($1, $3, 'seed'), ($1, $4, 'seed')`,
    [summaryEvent, ghsOffering, ghsSecondOffering, usdOffering],
  );

  await harness.db.query(`update event_instances set status = 'cancelled' where id = $1`, [
    cancelledEvent,
  ]);
  await harness.db.query(`update event_instances set status = 'archived' where id = $1`, [
    archivedEvent,
  ]);
});

afterAll(async () => {
  await harness.close();
});

describe('GET /v1/events/{eventId}/offering-counts', () => {
  it('returns no current observation and no history for a fresh group', async () => {
    const response = await read(eventA, today, ghsSecondOffering);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ current: null, observations: [] });
  });

  it('requires both query parameters and the bearer token', async () => {
    const unauthenticated = await request(harness.app)
      .get(`/v1/events/${eventA}/offering-counts`)
      .query({ sessionDate: today, offeringId: ghsOffering });
    expect(unauthenticated.status).toBe(401);

    const missingOffering = await request(harness.app)
      .get(`/v1/events/${eventA}/offering-counts`)
      .query({ sessionDate: today })
      .set(readHeaders);
    expect(missingOffering.status).toBe(422);
    expect(missingOffering.body.code).toBe('validation_error');

    const missingSession = await request(harness.app)
      .get(`/v1/events/${eventA}/offering-counts`)
      .query({ offeringId: ghsOffering })
      .set(readHeaders);
    expect(missingSession.status).toBe(422);
  });

  it('answers 404 for an unknown event or a session the event does not hold', async () => {
    const unknownEvent = await request(harness.app)
      .get('/v1/events/00000000-0000-4000-8000-000000000000/offering-counts')
      .query({ sessionDate: today, offeringId: ghsOffering })
      .set(readHeaders);
    expect(unknownEvent.status).toBe(404);
    expect(unknownEvent.body.code).toBe('not_found');

    const unknownSession = await read(eventA, shiftDate(today, 5), ghsOffering);
    expect(unknownSession.status).toBe(404);
  });
});

describe('POST /v1/events/{eventId}/offering-counts', () => {
  it('appends an observation with a derived total, terms version and Location', async () => {
    const response = await record(
      eventA,
      baseCount({
        lines: [
          { denominationMinor: 1000, pieces: 4 },
          { denominationMinor: 2000, pieces: 3 },
        ],
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe(
      `/v1/events/${eventA}/offering-counts?sessionDate=${today}&offeringId=${ghsOffering}`,
    );
    expect(response.body).toMatchObject({
      eventId: eventA,
      offeringId: ghsOffering,
      sessionDate: today,
      asOf: `${today}T09:00:00.000Z`,
      currency: 'GHS',
      termsVersion: 1,
      totalMinor: 10_000,
      recordedBy: 'count-admin',
      supersedesId: null,
      supersededBy: null,
    });
    // Lines are canonical: newest denomination first.
    expect(response.body.lines).toEqual([
      { denominationMinor: 2000, pieces: 3 },
      { denominationMinor: 1000, pieces: 4 },
    ]);
    expect(typeof response.body.recordedAt).toBe('string');
  });

  it('rejects an asOf outside the session day in the event timezone', async () => {
    const response = await record(
      eventA,
      baseCount({ asOf: `${shiftDate(today, -1)}T23:30:00.000Z` }),
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects a currency that is not the offering terms currency', async () => {
    const response = await record(eventA, baseCount({ currency: 'USD' }));
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects an offering not attached to the event', async () => {
    const response = await record(eventB, baseCount());
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('offering_not_on_event');
  });

  it('rejects a session the event does not hold and a cancelled session', async () => {
    const unknownSession = await record(eventA, baseCount({ sessionDate: shiftDate(today, 5) }));
    expect(unknownSession.status).toBe(422);
    expect(unknownSession.body.code).toBe('session_not_in_event');

    const cancelledSession = await record(
      cancelledSessionEvent,
      baseCount({ asOf: `${today}T09:00:00.000Z` }),
    );
    expect(cancelledSession.status).toBe(409);
    expect(cancelledSession.body.code).toBe('event_not_active');
  });

  it('rejects a cancelled or archived event', async () => {
    const cancelled = await record(cancelledEvent, baseCount());
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.code).toBe('event_not_active');

    const archived = await record(archivedEvent, baseCount());
    expect(archived.status).toBe(409);
    expect(archived.body.code).toBe('event_not_active');
  });

  it('rejects an empty, all-zero, repeated-denomination or negative count', async () => {
    const empty = await record(eventA, baseCount({ lines: [] }));
    expect(empty.status).toBe(422);

    const zeroPieces = await record(
      eventA,
      baseCount({ lines: [{ denominationMinor: 1000, pieces: 0 }] }),
    );
    expect(zeroPieces.status).toBe(422);
    expect(zeroPieces.body.code).toBe('validation_error');

    const zeroDenomination = await record(
      eventA,
      baseCount({ lines: [{ denominationMinor: 0, pieces: 5 }] }),
    );
    expect(zeroDenomination.status).toBe(422);

    const repeated = await record(
      eventA,
      baseCount({
        lines: [
          { denominationMinor: 1000, pieces: 1 },
          { denominationMinor: 1000, pieces: 2 },
        ],
      }),
    );
    expect(repeated.status).toBe(422);
    expect(repeated.body.code).toBe('validation_error');

    const negative = await record(
      eventA,
      baseCount({ lines: [{ denominationMinor: 1000, pieces: -1 }] }),
    );
    expect(negative.status).toBe(422);
  });

  it('answers 404 for an unknown offering or an offering without published terms', async () => {
    const unknownOffering = await record(
      eventA,
      baseCount({ offeringId: '00000000-0000-4000-8000-000000000000' }),
    );
    expect(unknownOffering.status).toBe(404);

    const [bareOffering] = await harness.db.query<{ id: string }>(
      'insert into offerings default values returning id',
    );
    // The attach route resolves current terms and refuses a termless offering,
    // so seed the attachment directly to reach the count repository's check.
    await harness.db.query(
      `insert into event_instance_offerings (event_instance_id, offering_id, attached_by)
       values ($1, $2, 'seed')`,
      [eventA, bareOffering!.id],
    );
    const noTerms = await record(eventA, baseCount({ offeringId: bareOffering!.id }));
    expect(noTerms.status).toBe(404);
  });

  it('records a group per event, offering and session without colliding', async () => {
    const otherSession = await record(
      eventA,
      baseCount({ sessionDate: tomorrow, asOf: `${tomorrow}T09:00:00.000Z` }),
    );
    expect(otherSession.status).toBe(201);

    const otherOffering = await record(eventA, baseCount({ offeringId: ghsSecondOffering }));
    expect(otherOffering.status).toBe(201);

    const group = await read(eventA, today, ghsSecondOffering);
    expect(group.body.current.id).toBe(otherOffering.body.id);
  });
});

describe('offering count correction', () => {
  it('supersedes the current observation, keeps its asOf and replaces the lines', async () => {
    const original = await record(
      eventA,
      baseCount({
        offeringId: ghsSecondOffering,
        asOf: `${today}T10:00:00.000Z`,
        lines: [{ denominationMinor: 2000, pieces: 39 }],
      }),
    );
    expect(original.status).toBe(201);

    const corrected = await request(harness.app)
      .post(`/v1/events/${eventA}/offering-counts`)
      .set({ ...writeHeaders, 'X-Actor-Id': 'correcting-presbyter' })
      .send({
        sessionDate: today,
        offeringId: ghsSecondOffering,
        lines: [
          { denominationMinor: 2000, pieces: 40 },
          { denominationMinor: 1000, pieces: 40 },
        ],
        supersedesId: original.body.id,
      });

    expect(corrected.status).toBe(201);
    expect(corrected.body).toMatchObject({
      sessionDate: today,
      offeringId: ghsSecondOffering,
      asOf: `${today}T10:00:00.000Z`,
      totalMinor: 120_000,
      recordedBy: 'correcting-presbyter',
      supersedesId: original.body.id,
      supersededBy: null,
    });

    const page = await read(eventA, today, ghsSecondOffering);
    expect(page.body.current.id).toBe(corrected.body.id);
    const target = page.body.observations.find(
      (row: { id: string }) => row.id === original.body.id,
    );
    expect(target.supersededBy).toBe(corrected.body.id);
    // The earlier observation stays readable and valid for its own asOf.
    expect(target.totalMinor).toBe(78_000);
    expect(target.asOf).toBe(`${today}T10:00:00.000Z`);
  });

  it('allows correcting a correction and keeps the original asOf', async () => {
    const first = await record(
      eventA,
      baseCount({
        sessionDate: tomorrow,
        offeringId: ghsSecondOffering,
        asOf: `${tomorrow}T12:00:00.000Z`,
        lines: [{ denominationMinor: 2000, pieces: 10 }],
      }),
    );
    expect(first.status).toBe(201);

    const second = await record(eventA, {
      sessionDate: tomorrow,
      offeringId: ghsSecondOffering,
      lines: [{ denominationMinor: 2000, pieces: 20 }],
      supersedesId: first.body.id,
    });
    expect(second.status, JSON.stringify(second.body)).toBe(201);

    const third = await record(eventA, {
      sessionDate: tomorrow,
      offeringId: ghsSecondOffering,
      lines: [{ denominationMinor: 2000, pieces: 30 }],
      supersedesId: second.body.id,
    });
    expect(third.status, JSON.stringify(third.body)).toBe(201);
    expect(third.body).toMatchObject({
      asOf: `${tomorrow}T12:00:00.000Z`,
      totalMinor: 60_000,
      supersedesId: second.body.id,
      supersededBy: null,
    });

    // The read and the write agree on "current" after a chained correction.
    const page = await read(eventA, tomorrow, ghsSecondOffering);
    expect(page.body.current.id).toBe(third.body.id);
    expect(page.body.observations).toHaveLength(3);
    expect(
      page.body.observations.filter(
        (row: { supersededBy: string | null }) => row.supersededBy === null,
      ),
    ).toHaveLength(1);
    expect(
      page.body.observations.find((row: { id: string }) => row.id === second.body.id)?.supersededBy,
    ).toBe(third.body.id);
  });

  it('rejects a second supersede of the same row', async () => {
    const created = await record(eventA, {
      sessionDate: today,
      offeringId: ghsSecondOffering,
      asOf: `${today}T11:30:00.000Z`,
      lines: [{ denominationMinor: 2000, pieces: 39 }],
    });
    expect(created.status).toBe(201);

    const first = await record(eventA, {
      sessionDate: today,
      offeringId: ghsSecondOffering,
      lines: [{ denominationMinor: 2000, pieces: 40 }],
      supersedesId: created.body.id,
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    const again = await record(eventA, {
      sessionDate: today,
      offeringId: ghsSecondOffering,
      lines: [{ denominationMinor: 2000, pieces: 41 }],
      supersedesId: created.body.id,
    });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('validation_error');
  });

  it('rejects unknown, other-group and other-event supersede targets', async () => {
    const created = await record(eventA, {
      sessionDate: today,
      offeringId: ghsSecondOffering,
      asOf: `${today}T12:00:00.000Z`,
      lines: [{ denominationMinor: 2000, pieces: 1 }],
    });
    expect(created.status).toBe(201);
    const currentId = created.body.id as string;

    const unknown = await record(eventA, {
      sessionDate: today,
      offeringId: ghsSecondOffering,
      lines: [{ denominationMinor: 2000, pieces: 1 }],
      supersedesId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.status).toBe(422);

    const otherGroup = await record(eventA, {
      sessionDate: today,
      offeringId: ghsOffering,
      lines: [{ denominationMinor: 2000, pieces: 1 }],
      supersedesId: currentId,
    });
    expect(otherGroup.status).toBe(422);

    const otherEventTarget = await record(otherEvent, {
      sessionDate: today,
      offeringId: ghsSecondOffering,
      lines: [{ denominationMinor: 2000, pieces: 1 }],
      supersedesId: currentId,
    });
    expect(otherEventTarget.status).toBe(422);
  });

  it('lists observations newest first by asOf then recordedAt', async () => {
    const page = await read(eventA, today, ghsSecondOffering);
    expect(page.body.current.id).toBe(page.body.observations[0].id);
    const asOfs = page.body.observations.map((row: { asOf: string }) => row.asOf);
    expect(asOfs).toEqual([...asOfs].sort().reverse());
  });
});

describe('offering count summary reconciliation', () => {
  it('sums only the current observation, windows by sessionDate and excludes other currencies', async () => {
    // Group 1: a superseded 5000 and a current 10000.
    const first = await record(summaryEvent, {
      sessionDate: summaryDate,
      offeringId: ghsOffering,
      asOf: `${summaryDate}T09:00:00.000Z`,
      lines: [{ denominationMinor: 1000, pieces: 5 }],
    });
    expect(first.status).toBe(201);
    const corrected = await record(summaryEvent, {
      sessionDate: summaryDate,
      offeringId: ghsOffering,
      lines: [{ denominationMinor: 2000, pieces: 5 }],
      supersedesId: first.body.id,
    });
    expect(corrected.status).toBe(201);

    // Group 2: another offering on the same session.
    const second = await record(summaryEvent, {
      sessionDate: summaryDate,
      offeringId: ghsSecondOffering,
      asOf: `${summaryDate}T10:00:00.000Z`,
      lines: [{ denominationMinor: 1000, pieces: 4 }],
    });
    expect(second.status).toBe(201);

    // Group 3: another currency; never added to a GHS total.
    const dollars = await record(summaryEvent, {
      sessionDate: summaryDate,
      offeringId: usdOffering,
      currency: 'USD',
      asOf: `${summaryDate}T11:00:00.000Z`,
      lines: [{ denominationMinor: 7000, pieces: 1 }],
    });
    expect(dollars.status).toBe(201);

    // Group 4: a GHS count outside the report window.
    const outside = await record(summaryEvent, {
      sessionDate: shiftDate(summaryDate, -1),
      offeringId: ghsOffering,
      asOf: `${shiftDate(summaryDate, -1)}T09:00:00.000Z`,
      lines: [{ denominationMinor: 5000, pieces: 1 }],
    });
    expect(outside.status).toBe(201);

    // One paid member gift so the variance has both sides.
    const contribution = await request(harness.app)
      .post('/v1/contributions')
      .set(writeHeaders)
      .send({
        memberNo: await ensureMember(),
        offeringId: ghsOffering,
        eventId: summaryEvent,
        sessionDate: summaryDate,
        amountMinor: 3_000,
        channel: 'manual',
        idempotencyKey: 'count-summary-gift',
      });
    expect(contribution.status).toBe(201);

    const summary = await new OfferingRepository(harness.db).summary(
      summaryDate,
      summaryDate,
      today,
    );

    expect(summary.currency).toBe('GHS');
    // 10000 (current, not the superseded 5000) + 4000; USD and the
    // previous-day count are excluded.
    expect(summary.countedMinor).toBe(14_000);
    expect(summary.totalPaidMinor).toBe(3_000);
    expect(summary.varianceMinor).toBe(11_000);

    const offeringOne = summary.offerings.find((row) => row.offeringId === ghsOffering);
    expect(offeringOne).toMatchObject({ paidMinor: 3_000, countedMinor: 10_000 });
    const offeringTwo = summary.offerings.find((row) => row.offeringId === ghsSecondOffering);
    expect(offeringTwo).toMatchObject({ paidMinor: 0, countedMinor: 4_000 });
    expect(summary.offerings.some((row) => row.offeringId === usdOffering)).toBe(false);

    const event = summary.events.find((row) => row.eventId === summaryEvent);
    expect(event).toMatchObject({ countedMinor: 14_000, paidMinor: 3_000 });
  });

  it('keeps counted cash out of the recorded-gift totals', async () => {
    const summary = await new OfferingRepository(harness.db).summary(
      summaryDate,
      summaryDate,
      today,
    );
    // `totalPaidMinor` is the paid contribution only; counted cash is separate.
    expect(summary.totalPaidMinor).toBe(3_000);
    expect(summary.countedMinor).toBe(14_000);
    expect(summary.varianceMinor).toBe(
      summary.countedMinor - (summary.totalPaidMinor + summary.visitors.paidMinor),
    );
  });
});

let cachedMemberNo: string | null = null;
async function ensureMember(): Promise<string> {
  if (cachedMemberNo) return cachedMemberNo;
  const response = await request(harness.app).post('/v1/members').set(writeHeaders).send({
    memberNo: 'OC-MEMBER',
    firstName: 'Count',
    lastName: 'Member',
    gender: 'female',
    joinedOn: '2020-01-01',
  });
  expect(response.status).toBe(201);
  cachedMemberNo = 'OC-MEMBER';
  return cachedMemberNo;
}

/**
 * The same repository contract on the pooled `pg` driver. Set `TEST_DATABASE_URL`
 * to a scratch branch (never production) to run it; skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('offering counts on the pooled pg driver', () => {
  let pooled: Db;
  let offeringId: string;
  let eventId: string;

  beforeAll(async () => {
    pooled = createPgDb(testDatabaseUrl!);
    await migrate(pooled);

    const [offering] = await pooled.query<{ id: string }>(
      'insert into offerings default values returning id',
    );
    offeringId = offering!.id;
    await pooled.query(
      `insert into offering_terms (offering_id, version, name, purpose, kind, currency, created_by)
       values ($1, 1, 'PG Count', 'Pooled driver count', 'freewill', 'GHS', 'seed')`,
      [offeringId],
    );
    const [event] = await pooled.query<{ id: string }>(
      `insert into event_instances (event_no, name, timezone, start_date, end_date, status, source, sessions)
       values ('PG-OC-1', 'Pooled count service', 'UTC', $1::date, $1::date, 'scheduled', 'manual',
               jsonb_build_array(jsonb_build_object('date', $1::date, 'startTime', '09:00')))
       returning id`,
      [shiftDate(today, -2)],
    );
    eventId = event!.id;
    await pooled.query(
      `insert into event_instance_offerings (event_instance_id, offering_id, attached_by)
       values ($1, $2, 'seed')`,
      [eventId, offeringId],
    );
  });

  afterAll(async () => {
    await pooled.close();
  });

  it('records, corrects and reads the group', async () => {
    const repo = new OfferingCountRepository(pooled);
    const sessionDate = shiftDate(today, -2);

    const created = await repo.record(
      eventId,
      {
        sessionDate,
        offeringId,
        lines: [{ denominationMinor: 2000, pieces: 39 }],
        asOf: `${sessionDate}T09:00:00.000Z`,
      },
      'pg-actor',
    );
    expect(created.totalMinor).toBe(78_000);

    const corrected = await repo.record(
      eventId,
      {
        sessionDate,
        offeringId,
        lines: [
          { denominationMinor: 2000, pieces: 40 },
          { denominationMinor: 1000, pieces: 40 },
        ],
        supersedesId: created.id,
      },
      'pg-corrector',
    );
    expect(corrected.totalMinor).toBe(120_000);
    expect(corrected.asOf).toBe(created.asOf);

    const page = await repo.get(eventId, sessionDate, offeringId);
    expect(page.current?.id).toBe(corrected.id);
    expect(page.observations).toHaveLength(2);
    expect(page.observations.find((row) => row.id === created.id)?.supersededBy).toBe(corrected.id);
  });
});
