import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { createPgDb } from '../../src/db/pg.js';
import type { Db } from '../../src/db/sql.js';
import { SeriesRepository } from '../../src/repos/series.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

const today = utcToday();
const from = shiftDate(today, -90);
const to = shiftDate(today, 90);
const held1 = shiftDate(today, -21);
const held2 = shiftDate(today, -14);
const cancelledDate = shiftDate(today, -7);
const upcomingDate = shiftDate(today, 7);

let harness: TestApp;
let series: SeriesRepository;
let mainSeriesId: string;
let endedSeriesId: string;

async function insertMember(input: {
  memberNo: string;
  joinedOn: string;
  presbyter?: boolean;
  archived?: boolean;
}): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into members (
       member_no, first_name, last_name, gender, joined_on, is_presbyter,
       archived_at, created_by, updated_by
     ) values ($1,'Summary','Member','undisclosed',$2::date,$3,$4,'seed','seed')
     returning id`,
    [
      input.memberNo,
      input.joinedOn,
      input.presbyter ?? false,
      input.archived ? new Date().toISOString() : null,
    ],
  );
  return row!.id;
}

async function insertEvent(input: {
  eventNo: string;
  status?: 'scheduled' | 'cancelled';
  sessions: readonly { date: string; status?: 'scheduled' | 'cancelled' }[];
  tracksMembers?: boolean;
  presbyterOnly?: boolean;
  /** Distinct per series: the unique index is (series_id, start_date). */
  startDate?: string;
}): Promise<string> {
  const sessions = input.sessions.map((session) => ({
    date: session.date,
    startTime: '09:00',
    endTime: null,
    status: session.status ?? 'scheduled',
    note: session.status === 'cancelled' ? 'Seeded cancellation' : null,
  }));
  const dates = input.sessions.map((session) => session.date).sort();
  const startDate = input.startDate ?? dates[0];
  const endDate = input.startDate ?? dates[dates.length - 1];
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, name, series_id, timezone, start_date, end_date, start_time,
       status, source, sessions, tracks_members, presbyter_only
     ) values ($1,$2,$3,'UTC',$4::date,$5::date,'09:00',$6,'series',$7::jsonb,$8,$9)
     returning id`,
    [
      input.eventNo,
      `Event ${input.eventNo}`,
      mainSeriesId,
      startDate,
      endDate,
      input.status ?? 'scheduled',
      JSON.stringify(sessions),
      input.tracksMembers ?? true,
      input.presbyterOnly ?? false,
    ],
  );
  return row!.id;
}

async function insertAttendance(eventId: string, date: string, memberId: string): Promise<void> {
  await harness.db.query(
    `insert into attendance (event_instance_id, session_date, member_id, source, created_by)
     values ($1,$2::date,$3,'manual','seed')`,
    [eventId, date, memberId],
  );
}

async function insertOffering(name: string, currency = 'GHS'): Promise<string> {
  const [offering] = await harness.db.query<{ id: string }>(
    'insert into offerings default values returning id',
  );
  await harness.db.query(
    `insert into offering_terms (offering_id, version, name, purpose, kind, currency, created_by)
     values ($1,1,$2,'Seed purpose','freewill',$3,'seed')`,
    [offering!.id, name, currency],
  );
  return offering!.id;
}

async function attachToSeries(seriesId: string, offeringId: string): Promise<void> {
  await harness.db.query(
    `insert into event_instance_offerings (series_id, offering_id, attached_by)
     select $1,$2,'seed' where not exists (
       select 1 from event_instance_offerings
        where series_id = $1 and offering_id = $2 and detached_on is null
     )`,
    [seriesId, offeringId],
  );
}

async function insertContribution(input: {
  eventId: string;
  offeringId: string;
  memberId: string | null;
  amountMinor: number;
  currency: string;
  suffix: string;
}): Promise<void> {
  await harness.db.query(
    `insert into contributions (
       member_id, visitor_name, visitor_phone_hash, offering_id, event_instance_id,
       session_date, amount_minor, currency, channel, status, reference, idempotency_key,
       terms_version, created_by
     ) values ($1,$2,$3,$4,$5,$6::date,$7,$8,'manual','paid',$9,$10,1,'seed')`,
    [
      input.memberId,
      input.memberId ? null : 'Visitor',
      input.memberId ? null : 'visitor-phone-hash',
      input.offeringId,
      input.eventId,
      held2,
      input.amountMinor,
      input.currency,
      `SUM-${input.suffix}`,
      `sum-key-${input.suffix}`,
    ],
  );
}

async function insertPledge(input: {
  memberId: string;
  officerId: string;
  offeringId: string;
  eventId: string;
  amountMinor: number;
  expectedOn: string;
  suffix: string;
  transitions?: readonly ('honored' | 'dishonored')[];
}): Promise<void> {
  const [pledge] = await harness.db.query<{ id: string }>(
    `insert into pledges (
       member_id, offering_id, event_instance_id, session_date, amount_minor, currency,
       expected_on, officer_member_id, status, terms_version, idempotency_key, created_by
     ) values ($1,$2,$3,$4::date,$5,'GHS',$6::date,$7,'pending',1,$8,'seed')
     returning id`,
    [
      input.memberId,
      input.offeringId,
      input.eventId,
      held2,
      input.amountMinor,
      input.expectedOn,
      input.officerId,
      `pledge-key-${input.suffix}`,
    ],
  );
  await harness.db.query(
    `insert into pledge_events (pledge_id, kind, actor) values ($1,'created','seed')`,
    [pledge!.id],
  );
  for (const kind of input.transitions ?? []) {
    await harness.db.query(
      `insert into pledge_events (pledge_id, kind, actor, at) values ($1,$2,'seed', now())`,
      [pledge!.id, kind],
    );
  }
}

beforeAll(async () => {
  harness = await createTestApp();
  series = new SeriesRepository(harness.db);

  const main = await series.create(
    {
      name: 'Summary Series',
      timezone: 'UTC',
      effectiveFrom: shiftDate(today, -365),
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
    },
    'seed',
  );
  mainSeriesId = main.id;

  const ended = await series.create(
    {
      name: 'Ended Series',
      timezone: 'UTC',
      effectiveFrom: shiftDate(today, -365),
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      endsOn: shiftDate(today, -60),
    },
    'seed',
  );
  endedSeriesId = ended.id;

  const m1 = await insertMember({
    memberNo: 'SUM-1',
    joinedOn: shiftDate(today, -365),
    presbyter: true,
  });
  const m2 = await insertMember({ memberNo: 'SUM-2', joinedOn: shiftDate(today, -17) });
  await insertMember({ memberNo: 'SUM-3', joinedOn: shiftDate(today, -365), archived: true });

  const heldEvent = await insertEvent({
    eventNo: 'SUM-EVT-1',
    sessions: [{ date: held1 }, { date: held2 }],
  });
  const mixedEvent = await insertEvent({
    eventNo: 'SUM-EVT-2',
    sessions: [{ date: cancelledDate, status: 'cancelled' }, { date: upcomingDate }],
  });
  const headcountEvent = await insertEvent({
    eventNo: 'SUM-EVT-3',
    sessions: [{ date: held2 }],
    tracksMembers: false,
    startDate: shiftDate(today, -16),
  });
  await insertEvent({
    eventNo: 'SUM-EVT-4',
    status: 'cancelled',
    sessions: [{ date: shiftDate(today, -10) }],
  });
  const presbyterEvent = await insertEvent({
    eventNo: 'SUM-EVT-5',
    sessions: [{ date: held2 }],
    presbyterOnly: true,
    startDate: held2,
  });

  await insertAttendance(heldEvent, held1, m1);
  await insertAttendance(heldEvent, held2, m1);
  await insertAttendance(presbyterEvent, held2, m1);
  // A headcount-only session takes no member rows.
  void headcountEvent;
  void mixedEvent;
  void m2;

  const freewill = await insertOffering('Sunday Offering');
  await insertOffering('Building Fund');
  await attachToSeries(mainSeriesId, freewill);

  await insertContribution({
    eventId: heldEvent,
    offeringId: freewill,
    memberId: m1,
    amountMinor: 5000,
    currency: 'GHS',
    suffix: 'paid-member',
  });
  await insertContribution({
    eventId: heldEvent,
    offeringId: freewill,
    memberId: null,
    amountMinor: 7000,
    currency: 'GHS',
    suffix: 'paid-visitor',
  });
  await insertContribution({
    eventId: heldEvent,
    offeringId: freewill,
    memberId: m1,
    amountMinor: 9000,
    currency: 'USD',
    suffix: 'paid-usd',
  });

  const [count] = await harness.db.query<{ id: string }>(
    `insert into event_session_offering_counts (
       event_instance_id, offering_id, session_date, currency, terms_version,
       as_of, recorded_by
     ) values ($1,$2,$3::date,'GHS',1, now(),'seed')
     returning id`,
    [heldEvent, freewill, held2],
  );
  await harness.db.query(
    `insert into event_session_offering_count_lines (count_id, denomination_minor, pieces)
     values ($1, 1000, 2)`,
    [count!.id],
  );

  await insertPledge({
    memberId: m1,
    officerId: m1,
    offeringId: freewill,
    eventId: heldEvent,
    amountMinor: 30000,
    expectedOn: held2,
    suffix: 'pending',
  });
  await insertPledge({
    memberId: m1,
    officerId: m1,
    offeringId: freewill,
    eventId: heldEvent,
    amountMinor: 40000,
    expectedOn: held2,
    suffix: 'honored',
    transitions: ['honored'],
  });
  await insertPledge({
    memberId: m1,
    officerId: m1,
    offeringId: freewill,
    eventId: heldEvent,
    amountMinor: 50000,
    expectedOn: held2,
    suffix: 'dishonored',
    transitions: ['dishonored'],
  });
});

afterAll(async () => {
  await harness.close();
});

describe('series window summary', () => {
  it('answers the window figures in one no-store response', async () => {
    const response = await request(harness.app)
      .get(`/v1/series/${mainSeriesId}/summary?from=${from}&to=${to}`)
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      from,
      to,
      attendance: {
        memberSessions: { held: 3, expected: 4, present: 3, rate: 0.75 },
        lastHeld: { date: held2, expected: 3, present: 2 },
        headcountSessions: { held: 1 },
        cancelled: 2,
        upcoming: 1,
      },
      offerings: {
        attachedCount: 1,
        currency: 'GHS',
        paidMinor: 5000,
        pledgedMinor: 70000,
        outstandingMinor: 30000,
        countedMinor: 2000,
        visitors: { count: 1, paidMinor: 7000 },
      },
    });

    expect(response.body.nextOccurrence).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(response.body.nextOccurrence >= today).toBe(true);
    expect(response.body.nextOccurrence <= shiftDate(today, 90)).toBe(true);
  });

  it('returns a null next occurrence for a series that ended', async () => {
    const response = await request(harness.app)
      .get(`/v1/series/${endedSeriesId}/summary?from=${from}&to=${to}`)
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body.nextOccurrence).toBeNull();
    expect(response.body.attendance.memberSessions).toMatchObject({
      held: 0,
      expected: 0,
      present: 0,
      rate: null,
    });
    expect(response.body.attendance.lastHeld).toBeNull();
    expect(response.body.offerings).toMatchObject({
      attachedCount: 0,
      paidMinor: 0,
      pledgedMinor: 0,
      outstandingMinor: 0,
      countedMinor: 0,
    });
  });

  it('rejects a reversed window and an unknown series', async () => {
    const reversed = await request(harness.app)
      .get(`/v1/series/${mainSeriesId}/summary?from=${to}&to=${from}`)
      .set(readHeaders);
    expect(reversed.status).toBe(400);
    expect(reversed.body.code).toBe('invalid_window');

    const unknown = await request(harness.app)
      .get(`/v1/series/00000000-0000-0000-0000-000000000000/summary?from=${from}&to=${to}`)
      .set(readHeaders);
    expect(unknown.status).toBe(404);
  });

  it('requires a reason on a cancelled series exception', async () => {
    const refused = await request(harness.app)
      .post(`/v1/series/${mainSeriesId}/exceptions`)
      .set(writeHeaders)
      .send({ date: shiftDate(today, -5), kind: 'cancelled' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('reason_required');

    const accepted = await request(harness.app)
      .post(`/v1/series/${mainSeriesId}/exceptions`)
      .set(writeHeaders)
      .send({ date: shiftDate(today, -5), kind: 'cancelled', note: 'Public holiday' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.exceptions).toContainEqual({
      date: shiftDate(today, -5),
      kind: 'cancelled',
      note: 'Public holiday',
    });
  });

  it('requires a reason on a cancelled event session and returns it', async () => {
    const base = {
      eventNo: 'SUM-EVT-REASON',
      name: 'Reason Event',
      timezone: 'UTC',
      startDate: upcomingDate,
      endDate: upcomingDate,
      startTime: '09:00',
      venueType: 'auditorium',
    };

    const refused = await request(harness.app)
      .post('/v1/events')
      .set(writeHeaders)
      .send({ ...base, sessions: [{ date: upcomingDate, status: 'cancelled' }] });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('reason_required');

    const accepted = await request(harness.app)
      .post('/v1/events')
      .set(writeHeaders)
      .send({
        ...base,
        sessions: [{ date: upcomingDate, status: 'cancelled', note: 'Venue flooded' }],
      });
    expect(accepted.status).toBe(201);
    expect(accepted.body.sessions[0]).toMatchObject({
      status: 'cancelled',
      note: 'Venue flooded',
    });
  });
});

/**
 * The same summary read on the pooled `pg` driver. Set `TEST_DATABASE_URL` to a
 * scratch branch (never production) to run it; skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('series window summary on the pooled pg driver', () => {
  let pooled: Db;
  let seriesId: string;

  beforeAll(async () => {
    pooled = createPgDb(testDatabaseUrl!);
    await migrate(pooled);
    const repo = new SeriesRepository(pooled);

    const created = await repo.create(
      {
        name: 'PG Summary Series',
        timezone: 'UTC',
        effectiveFrom: shiftDate(today, -365),
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
      },
      'seed',
    );
    seriesId = created.id;

    const [member] = await pooled.query<{ id: string }>(
      `insert into members (
         member_no, first_name, last_name, gender, joined_on, created_by, updated_by
       ) values ('PG-SUM-1','Pooled','Member','undisclosed',$1::date,'seed','seed')
       returning id`,
      [shiftDate(today, -365)],
    );
    const [event] = await pooled.query<{ id: string }>(
      `insert into event_instances (
         event_no, name, series_id, timezone, start_date, end_date, start_time,
         status, source, sessions
       ) values ('PG-SUM-EVT-1','Pooled Event',$1,'UTC',$2::date,$2::date,'09:00','scheduled','series',$3::jsonb)
       returning id`,
      [
        seriesId,
        held2,
        JSON.stringify([{ date: held2, startTime: '09:00', endTime: null, status: 'scheduled' }]),
      ],
    );
    await pooled.query(
      `insert into attendance (event_instance_id, session_date, member_id, source, created_by)
       values ($1,$2::date,$3,'manual','seed')`,
      [event!.id, held2, member!.id],
    );
    const [offering] = await pooled.query<{ id: string }>(
      'insert into offerings default values returning id',
    );
    await pooled.query(
      `insert into offering_terms (offering_id, version, name, purpose, kind, currency, created_by)
       values ($1,1,'Pooled Offering','Purpose','freewill','GHS','seed')`,
      [offering!.id],
    );
    await pooled.query(
      `insert into event_instance_offerings (series_id, offering_id, attached_by)
       values ($1,$2,'seed')`,
      [seriesId, offering!.id],
    );
    await pooled.query(
      `insert into contributions (
         member_id, offering_id, event_instance_id, session_date, amount_minor, currency,
         channel, status, reference, idempotency_key, terms_version, created_by
       ) values ($1,$2,$3,$4::date,4200,'GHS','manual','paid','PG-SUM-REF','PG-SUM-KEY',1,'seed')`,
      [member!.id, offering!.id, event!.id, held2],
    );
  });

  afterAll(async () => {
    await pooled.close();
  });

  it('reads the same figures from the source tables', async () => {
    const summary = await new SeriesRepository(pooled).summary(seriesId, from, to);
    expect(summary.attendance.memberSessions).toMatchObject({
      held: 1,
      expected: 1,
      present: 1,
      rate: 1,
    });
    expect(summary.attendance.lastHeld).toEqual({ date: held2, expected: 1, present: 1 });
    expect(summary.offerings).toMatchObject({
      attachedCount: 1,
      currency: 'GHS',
      paidMinor: 4200,
      countedMinor: 0,
      visitors: { count: 0, paidMinor: 0 },
    });
  });
});
