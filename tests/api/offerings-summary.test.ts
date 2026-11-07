import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgDb } from '../../src/db/pg.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { OfferingRepository } from '../../src/repos/offerings.js';
import { PledgeRepository } from '../../src/repos/pledges.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

const today = todayUtc();
const from = shiftDate(today, -30);
const to = today;

let memberIds: Record<string, string>;
let offeringIds: { tithe: string; building: string; missionsUsd: string };
let eventIds: { harvest: string; thanksgiving: string; pledgeWindow: string };
let pledgeIds: Record<string, string>;

interface SeedPledge {
  label: string;
  memberNo: string;
  offeringId: string;
  eventId: string;
  amountMinor: number;
  currency?: string;
  expectedOn: string;
  transitions?: readonly { kind: 'honored' | 'dishonored'; at: string }[];
}

async function insertContribution(input: {
  memberNo: string | null;
  offeringId: string;
  eventId: string;
  sessionDate: string;
  amountMinor: number;
  currency: string;
  status?: 'paid' | 'initiated';
  suffix: string;
}): Promise<void> {
  const memberId = input.memberNo ? memberIds[input.memberNo] : null;
  await harness.db.query(
    `insert into contributions (
       member_id, visitor_name, visitor_phone_hash, offering_id, event_instance_id,
       session_date, amount_minor, currency, channel, status, reference, idempotency_key,
       terms_version, created_by
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9,$10,$11,1,'seed')`,
    [
      memberId,
      memberId ? null : 'Visitor',
      memberId ? null : 'visitor-phone-hash',
      input.offeringId,
      input.eventId,
      input.sessionDate,
      input.amountMinor,
      input.currency,
      input.status ?? 'paid',
      `SUM-${input.suffix}`,
      `sum-key-${input.suffix}`,
    ],
  );
}

async function insertPledge(seed: SeedPledge): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into pledges (
       member_id, offering_id, event_instance_id, session_date, amount_minor, currency,
       expected_on, officer_member_id, status, terms_version, idempotency_key, created_by
     ) values ($1,$2,$3,null,$4,$5,$6,$7,'pending',1,$8,'seed')
     returning id`,
    [
      memberIds[seed.memberNo],
      seed.offeringId,
      seed.eventId,
      seed.amountMinor,
      seed.currency ?? 'GHS',
      seed.expectedOn,
      memberIds['S-1002'],
      `pledge-key-${seed.label}`,
    ],
  );
  const id = row!.id;
  await harness.db.query(
    `insert into pledge_events (pledge_id, kind, actor, at)
     values ($1, 'created', 'seed', $2::timestamptz)`,
    [id, `${shiftDate(seed.expectedOn, -45)}T09:00:00Z`],
  );
  for (const transition of seed.transitions ?? []) {
    await harness.db.query(
      `insert into pledge_events (pledge_id, kind, actor, reason, at)
       values ($1, $2, 'seed', $3, $4::timestamptz)`,
      [
        id,
        transition.kind,
        transition.kind === 'dishonored' ? 'No longer able to give' : null,
        transition.at,
      ],
    );
  }
  return id;
}

async function insertEvent(name: string, startDate: string, sessions: string[]): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, venue_name, description, status, source, sessions
     ) values ($1,null,$2,'UTC',$3,$4,'09:00',null,'auditorium',null,null,'scheduled','manual',$5::jsonb)
     returning id`,
    [
      `SUM-${name.replace(/\W+/g, '-')}`,
      name,
      startDate,
      sessions[sessions.length - 1] ?? startDate,
      JSON.stringify(
        sessions.map((date) => ({
          date,
          startTime: '09:00',
          endTime: null,
          status: 'scheduled',
        })),
      ),
    ],
  );
  return row!.id;
}

async function seedDataset(db: Db): Promise<void> {
  const memberNos = [
    'S-1001',
    'S-1002',
    'S-1003',
    'S-1004',
    'S-1005',
    'S-1006',
    'S-1007',
    'S-1008',
    'S-1009',
    'S-1010',
    'S-1011',
    'S-1012',
  ];
  memberIds = {};
  for (const [index, memberNo] of memberNos.entries()) {
    const response = await request(harness.app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo,
        firstName: index === 0 ? 'Ama' : `Member${index + 1}`,
        lastName: index === 0 ? 'Mensah' : 'Seed',
        isPresbyter: memberNo === 'S-1002',
      });
    expect(response.status).toBe(201);
    const [row] = await db.query<{ id: string }>('select id from members where member_no = $1', [
      memberNo,
    ]);
    memberIds[memberNo] = row!.id;
  }

  const createOffering = async (body: Record<string, unknown>): Promise<string> => {
    const response = await request(harness.app).post('/v1/offerings').set(writeHeaders).send(body);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  offeringIds = {
    tithe: await createOffering({
      name: 'Sunday Tithe',
      purpose: 'The regular tithe',
      kind: 'tithe',
    }),
    building: await createOffering({
      name: 'Building Fund',
      purpose: 'The building appeal',
      kind: 'building',
    }),
    missionsUsd: await createOffering({
      name: 'Missions USD',
      purpose: 'Missions in USD',
      kind: 'missions',
      currency: 'USD',
    }),
  };

  eventIds = {
    harvest: await insertEvent('Harvest Service', shiftDate(today, -20), [shiftDate(today, -20)]),
    thanksgiving: await insertEvent('Thanksgiving', shiftDate(today, -10), [
      shiftDate(today, -10),
      shiftDate(today, -5),
    ]),
    pledgeWindow: await insertEvent('Pledge Window', shiftDate(today, 35), [shiftDate(today, 35)]),
  };

  const attach = await request(harness.app)
    .post(`/v1/events/${eventIds.pledgeWindow}/offerings`)
    .set(writeHeaders)
    .send({ offeringId: offeringIds.tithe });
  expect(attach.status).toBe(201);

  // The member giving: 10 paid members in the window, so members[] reconciles.
  const contributions: Array<Parameters<typeof insertContribution>[0]> = [
    {
      memberNo: 'S-1001',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      sessionDate: shiftDate(today, -20),
      amountMinor: 100_000,
      currency: 'GHS',
      suffix: 'm1-harvest',
    },
    {
      memberNo: 'S-1001',
      offeringId: offeringIds.tithe,
      eventId: eventIds.thanksgiving,
      sessionDate: shiftDate(today, -5),
      amountMinor: 20_000,
      currency: 'GHS',
      suffix: 'm1-thanks',
    },
    {
      memberNo: 'S-1002',
      offeringId: offeringIds.tithe,
      eventId: eventIds.thanksgiving,
      sessionDate: shiftDate(today, -10),
      amountMinor: 50_000,
      currency: 'GHS',
      suffix: 'm2-thanks',
    },
    {
      memberNo: 'S-1003',
      offeringId: offeringIds.building,
      eventId: eventIds.thanksgiving,
      sessionDate: shiftDate(today, -10),
      amountMinor: 50_000,
      currency: 'GHS',
      suffix: 'm3-thanks',
    },
    {
      memberNo: null,
      offeringId: offeringIds.tithe,
      eventId: eventIds.thanksgiving,
      sessionDate: shiftDate(today, -10),
      amountMinor: 7_000,
      currency: 'GHS',
      suffix: 'visitor-ghs',
    },
    {
      memberNo: 'S-1001',
      offeringId: offeringIds.missionsUsd,
      eventId: eventIds.harvest,
      sessionDate: shiftDate(today, -20),
      amountMinor: 50_000,
      currency: 'USD',
      suffix: 'm1-usd',
    },
    {
      memberNo: null,
      offeringId: offeringIds.missionsUsd,
      eventId: eventIds.thanksgiving,
      sessionDate: shiftDate(today, -10),
      amountMinor: 900,
      currency: 'USD',
      suffix: 'visitor-usd',
    },
    {
      memberNo: 'S-1004',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      sessionDate: shiftDate(today, -20),
      amountMinor: 999_999,
      currency: 'GHS',
      status: 'initiated',
      suffix: 'initiated',
    },
    // Two members with no in-window paid row; they only appear in a future window.
    {
      memberNo: 'S-1011',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      sessionDate: shiftDate(today, 2),
      amountMinor: 5_000,
      currency: 'GHS',
      suffix: 'm11-future',
    },
    {
      memberNo: 'S-1012',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      sessionDate: shiftDate(today, 3),
      amountMinor: 6_000,
      currency: 'GHS',
      suffix: 'm12-future',
    },
  ];
  for (let index = 4; index <= 10; index += 1) {
    contributions.push({
      memberNo: `S-10${String(index).padStart(2, '0')}`,
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      sessionDate: shiftDate(today, -20),
      amountMinor: 1_000,
      currency: 'GHS',
      suffix: `small-${index}`,
    });
  }
  for (const contribution of contributions) {
    await insertContribution(contribution);
  }

  pledgeIds = {};
  const pledges: SeedPledge[] = [
    {
      label: 'pending-overdue',
      memberNo: 'S-1001',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      amountMinor: 40_000,
      expectedOn: shiftDate(today, -10),
    },
    {
      label: 'honored',
      memberNo: 'S-1002',
      offeringId: offeringIds.building,
      eventId: eventIds.thanksgiving,
      amountMinor: 30_000,
      expectedOn: shiftDate(today, -10),
      transitions: [{ kind: 'honored', at: `${shiftDate(today, -9)}T10:00:00Z` }],
    },
    {
      label: 'dishonored',
      memberNo: 'S-1003',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      amountMinor: 25_000,
      expectedOn: shiftDate(today, -10),
      transitions: [{ kind: 'dishonored', at: `${shiftDate(today, -8)}T10:00:00Z` }],
    },
    {
      label: 'pending-before-from',
      memberNo: 'S-1001',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      amountMinor: 15_000,
      expectedOn: shiftDate(today, -45),
    },
    {
      label: 'honored-before-from',
      memberNo: 'S-1001',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      amountMinor: 99_000,
      expectedOn: shiftDate(today, -45),
      transitions: [{ kind: 'honored', at: `${shiftDate(today, -40)}T10:00:00Z` }],
    },
    {
      // The latest event lands exactly on the report date's inclusive boundary.
      label: 'boundary-honored',
      memberNo: 'S-1003',
      offeringId: offeringIds.building,
      eventId: eventIds.thanksgiving,
      amountMinor: 5_000,
      expectedOn: shiftDate(today, -10),
      transitions: [{ kind: 'honored', at: `${today}T23:59:59Z` }],
    },
    {
      label: 'usd-excluded',
      memberNo: 'S-1001',
      offeringId: offeringIds.missionsUsd,
      eventId: eventIds.harvest,
      amountMinor: 777_777,
      currency: 'USD',
      expectedOn: shiftDate(today, -10),
    },
    {
      label: 'pending-today',
      memberNo: 'S-1002',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      amountMinor: 8_000,
      expectedOn: today,
    },
    {
      label: 'pending-future',
      memberNo: 'S-1001',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      amountMinor: 12_000,
      expectedOn: shiftDate(today, 10),
    },
    {
      // Honored after the report date: still pending as at the boundary.
      label: 'honored-tomorrow',
      memberNo: 'S-1002',
      offeringId: offeringIds.tithe,
      eventId: eventIds.harvest,
      amountMinor: 11_000,
      expectedOn: shiftDate(today, -10),
      transitions: [{ kind: 'honored', at: `${shiftDate(today, 1)}T00:00:00Z` }],
    },
  ];
  for (const pledge of pledges) pledgeIds[pledge.label] = await insertPledge(pledge);

  await harness.db.query(
    `insert into reminders (pledge_id, scheduled_for, channel, status)
     values ($1,$2,'sms','pending'), ($1,$3,'sms','cancelled')`,
    [pledgeIds['pending-overdue'], shiftDate(today, 3), shiftDate(today, -3)],
  );
}

beforeAll(async () => {
  harness = await createTestApp();
  await seedDataset(harness.db);
});

afterAll(async () => {
  await harness.close();
});

describe('GET /v1/offerings/summary', () => {
  it('returns the R1/R2/R7 shape with no-store', async () => {
    const response = await request(harness.app)
      .get(`/v1/offerings/summary?from=${from}&to=${to}`)
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.from).toBe(from);
    expect(response.body.to).toBe(to);
    expect(response.body).not.toHaveProperty('offeredCount');
    expect(response.body.visitors).toEqual({ count: 1, paidMinor: 7_000 });
    expect(response.body.members.length).toBe(10);
    expect(Array.isArray(response.body.offerings)).toBe(true);
    expect(Array.isArray(response.body.events)).toBe(true);
  });

  it('rejects a missing, reversed or calendar-invalid window as 422', async () => {
    const missing = await request(harness.app).get('/v1/offerings/summary').set(readHeaders);
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation_error');

    const reversed = await request(harness.app)
      .get(`/v1/offerings/summary?from=${to}&to=${from}`)
      .set(readHeaders);
    expect(reversed.status).toBe(422);
    expect(reversed.body.code).toBe('validation_error');

    const invalid = await request(harness.app)
      .get('/v1/offerings/summary?from=2026-02-30&to=2026-03-01')
      .set(readHeaders);
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('validation_error');
  });

  it('picks the largest paid currency and excludes the others from every total', async () => {
    const response = await request(harness.app)
      .get(`/v1/offerings/summary?from=${from}&to=${to}`)
      .set(readHeaders);

    expect(response.body.currency).toBe('GHS');
    // USD gifts and USD pledges are excluded rather than converted.
    expect(response.body.totalPaidMinor).toBe(227_000);
    expect(response.body.totalPledgedMinor).toBe(109_000);
    expect(response.body.totalOutstandingMinor).toBe(74_000);
    expect(response.body.offerings.map((item: { offeringId: string }) => item.offeringId)).toEqual([
      offeringIds.tithe,
      offeringIds.building,
    ]);
  });

  it('reads pledge status as at the report date and holds pledged = outstanding + honored', async () => {
    const response = await request(harness.app)
      .get(`/v1/offerings/summary?from=${from}&to=${to}`)
      .set(readHeaders);

    expect(response.body.pledges).toEqual({
      pending: 1,
      honored: 2,
      dishonored: 1,
      overdue: 3,
    });
    expect(response.body.totalPledgedMinor).toBe(response.body.totalOutstandingMinor + 35_000);
    // P10 is honored tomorrow: still pending at the report date, so overdue.
    // P6 is honored at 23:59:59 today: included at the inclusive boundary.
  });

  it('reconciles members, visitors, offerings and events with the source rows', async () => {
    const response = await request(harness.app)
      .get(`/v1/offerings/summary?from=${from}&to=${to}`)
      .set(readHeaders);

    const sum = (rows: Array<Record<string, number>>, key: string): number =>
      rows.reduce((total, row) => total + row[key]!, 0);

    // members[] is the top 10 (23-Q4): reconcile exactly while the window has at
    // most ten givers; the truncated tail is covered by the twelve-giver test.
    const memberPaid = sum(response.body.members, 'paidMinor');
    if (response.body.members.length < 10) {
      expect(memberPaid).toBe(response.body.totalPaidMinor);
    } else {
      expect(memberPaid).toBeLessThanOrEqual(response.body.totalPaidMinor);
    }
    expect(sum(response.body.offerings, 'paidMinor')).toBe(response.body.totalPaidMinor);
    expect(sum(response.body.events, 'paidMinor')).toBe(response.body.totalPaidMinor);
    expect(sum(response.body.offerings, 'pledgedMinor')).toBe(response.body.totalPledgedMinor);
    expect(sum(response.body.events, 'pledgedMinor')).toBe(response.body.totalPledgedMinor);
    expect(sum(response.body.members, 'pledgedMinor')).toBe(response.body.totalPledgedMinor);
    expect(sum(response.body.offerings, 'outstandingMinor')).toBe(
      response.body.totalOutstandingMinor,
    );
    expect(sum(response.body.events, 'outstandingMinor')).toBe(response.body.totalOutstandingMinor);
    expect(sum(response.body.members, 'outstandingMinor')).toBe(
      response.body.totalOutstandingMinor,
    );
  });

  it('takes the top 10 by paid, tie broken by member number, with in-window last given', async () => {
    const response = await request(harness.app)
      .get(`/v1/offerings/summary?from=${from}&to=${to}`)
      .set(readHeaders);

    expect(response.body.members.map((member: { memberNo: string }) => member.memberNo)).toEqual([
      'S-1001',
      'S-1002',
      'S-1003',
      'S-1004',
      'S-1005',
      'S-1006',
      'S-1007',
      'S-1008',
      'S-1009',
      'S-1010',
    ]);
    const first = response.body.members[0];
    expect(first).toMatchObject({
      memberNo: 'S-1001',
      name: 'Ama Mensah',
      paidMinor: 120_000,
      pledgedMinor: 55_000,
      outstandingMinor: 55_000,
      lastGivenOn: shiftDate(today, -5),
    });
    // Contact values never appear in the aggregate.
    expect(JSON.stringify(response.body)).not.toContain('@');
  });

  it('keeps the report date at today when to is in the future', async () => {
    const repo = new OfferingRepository(harness.db);
    const summary = await repo.summary(from, shiftDate(today, 30), today);

    // P9 is now in the window; P6 stays honored, P10 stays pending.
    expect(summary.totalPledgedMinor).toBe(121_000);
    expect(summary.totalOutstandingMinor).toBe(86_000);
    expect(summary.pledges).toEqual({ pending: 2, honored: 2, dishonored: 1, overdue: 3 });
    // The two future contributions join the window but the report date does not move.
    expect(summary.totalPaidMinor).toBe(238_000);
    expect(summary.members.length).toBe(10);
    expect(summary.members.map((member) => member.memberNo)).not.toContain('S-1010');
    // A truncated top-10 never over-claims against the untruncated total.
    expect(
      summary.members.reduce((total, member) => total + member.paidMinor, 0),
    ).toBeLessThanOrEqual(summary.totalPaidMinor);
  });

  it('stops the as-at status at a past to date', async () => {
    const repo = new OfferingRepository(harness.db);
    const pastFrom = shiftDate(today, -15);
    const pastTo = shiftDate(today, -5);
    const summary = await repo.summary(pastFrom, pastTo, today);

    // P6 is honored at the end of today: after the report date, so still pending.
    // P2 (honored) and P3 (dishonored) happened before it and keep their status.
    expect(summary.totalPledgedMinor).toBe(101_000);
    expect(summary.totalOutstandingMinor).toBe(71_000);
    expect(summary.pledges).toEqual({ pending: 0, honored: 1, dishonored: 1, overdue: 4 });
  });

  it('carries the resolved names and next pending reminder on the pledge list', async () => {
    const response = await request(harness.app)
      .get('/v1/pledges?limit=200&memberNo=S-1001')
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const row = response.body.items.find(
      (item: { id: string }) => item.id === pledgeIds['pending-overdue'],
    );
    expect(row).toMatchObject({
      memberNo: 'S-1001',
      memberName: 'Ama Mensah',
      officerName: 'Member2 Seed',
      offeringName: 'Sunday Tithe',
      currency: 'GHS',
      nextReminder: shiftDate(today, 3),
    });

    const created = await request(harness.app)
      .post('/v1/pledges')
      .set(writeHeaders)
      .send({
        memberNo: 'S-1004',
        offeringId: offeringIds.tithe,
        eventId: eventIds.pledgeWindow,
        amountMinor: 2_000,
        expectedOn: shiftDate(today, 40),
        followUpOfficerMemberNo: 'S-1002',
        officerReason: 'The member asked for this officer',
        idempotencyKey: 'summary-created-pledge',
      });
    expect(created.status).toBe(201);
    expect(created.body.memberName).toBe('Member4 Seed');
    expect(created.body.officerName).toBe('Member2 Seed');
    expect(created.body.offeringName).toBe('Sunday Tithe');
    expect(created.body.nextReminder).toBe(shiftDate(today, 33));
  });
});

/**
 * The same repository contract on the pooled `pg` driver. Set `TEST_DATABASE_URL`
 * to a scratch branch (never production) to run it; skipped otherwise.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('offerings summary on the pooled pg driver', () => {
  let pooled: Db;
  let pledgeId: string;

  beforeAll(async () => {
    pooled = createPgDb(testDatabaseUrl!);
    await migrate(pooled);

    // Seed with SQL only: this block exercises the read queries, not the app.
    await pooled.query(
      `insert into members (member_no, first_name, last_name, gender, created_by, updated_by)
       values ('PG-1','Ama','Mensah','undisclosed','seed','seed'),
              ('PG-2','Kofi','Boateng','undisclosed','seed','seed'),
              ('PG-3','Yaa','Owusu','undisclosed','seed','seed')`,
    );
    const [member1] = await pooled.query<{ id: string }>(
      `select id from members where member_no = 'PG-1'`,
    );
    const [member2] = await pooled.query<{ id: string }>(
      `select id from members where member_no = 'PG-2'`,
    );
    const [member3] = await pooled.query<{ id: string }>(
      `select id from members where member_no = 'PG-3'`,
    );

    const [offering] = await pooled.query<{ id: string }>(
      'insert into offerings default values returning id',
    );
    await pooled.query(
      `insert into offering_terms (offering_id, version, name, purpose, kind, currency, created_by)
       values ($1, 1, 'Sunday Tithe', 'The regular tithe', 'tithe', 'GHS', 'seed')`,
      [offering!.id],
    );
    const [event] = await pooled.query<{ id: string }>(
      `insert into event_instances (event_no, name, start_date, end_date, status, source, sessions)
       values ('PG-EVT-1', 'Harvest Service', $1::date, $1::date, 'scheduled', 'manual', '[]'::jsonb)
       returning id`,
      [shiftDate(today, -20)],
    );

    await pooled.query(
      `insert into contributions (
         member_id, visitor_name, visitor_phone_hash, offering_id, event_instance_id,
         session_date, amount_minor, currency, channel, status, reference, idempotency_key,
         terms_version, created_by
       ) values
         ($1,null,null,$4,$5,$6,120000,'GHS','manual','paid','PG-SUM-1','pg-sum-1',1,'seed'),
         (null,'Visitor','hash',$4,$5,$7,7000,'GHS','manual','paid','PG-SUM-2','pg-sum-2',1,'seed'),
         ($2,null,null,$4,$5,$6,90000,'USD','manual','paid','PG-SUM-3','pg-sum-3',1,'seed'),
         ($3,null,null,$4,$5,$6,999999,'GHS','manual','initiated','PG-SUM-4','pg-sum-4',1,'seed')`,
      [
        member1!.id,
        member2!.id,
        member3!.id,
        offering!.id,
        event!.id,
        shiftDate(today, -5),
        shiftDate(today, -3),
      ],
    );

    const insertPledge = async (
      amountMinor: number,
      expectedOn: string,
      key: string,
    ): Promise<string> => {
      const [row] = await pooled.query<{ id: string }>(
        `insert into pledges (
           member_id, offering_id, event_instance_id, amount_minor, currency, expected_on,
           officer_member_id, status, terms_version, idempotency_key, created_by
         ) values ($1,$2,$3,$4,'GHS',$5,$6,'pending',1,$7,'seed')
         returning id`,
        [member1!.id, offering!.id, event!.id, amountMinor, expectedOn, member2!.id, key],
      );
      await pooled.query(
        `insert into pledge_events (pledge_id, kind, actor, at)
         values ($1,'created','seed',$2::timestamptz)`,
        [row!.id, `${shiftDate(today, -40)}T09:00:00Z`],
      );
      return row!.id;
    };

    pledgeId = await insertPledge(40_000, shiftDate(today, -10), 'pg-pledge-1');
    const honoredId = await insertPledge(30_000, shiftDate(today, -10), 'pg-pledge-2');
    await pooled.query(
      `insert into pledge_events (pledge_id, kind, actor, at)
       values ($1,'honored','seed',$2::timestamptz)`,
      [honoredId, `${shiftDate(today, -9)}T10:00:00Z`],
    );
    await insertPledge(15_000, shiftDate(today, -45), 'pg-pledge-3');
    await pooled.query(
      `insert into reminders (pledge_id, scheduled_for, channel, status)
       values ($1,$2,'sms','pending')`,
      [pledgeId, shiftDate(today, 3)],
    );
  });

  afterAll(async () => {
    await pooled?.close();
  });

  it('returns the same window and pledge measures', async () => {
    const repo = new OfferingRepository(pooled);
    const summary = await repo.summary(from, to, today);
    expect(summary.currency).toBe('GHS');
    expect(summary.totalPaidMinor).toBe(120_000);
    expect(summary.totalPledgedMinor).toBe(85_000);
    expect(summary.totalOutstandingMinor).toBe(55_000);
    expect(summary.visitors).toEqual({ count: 1, paidMinor: 7_000 });
    expect(summary.pledges).toEqual({ pending: 0, honored: 1, dishonored: 0, overdue: 2 });
    expect(summary.members[0]).toMatchObject({ memberNo: 'PG-1', paidMinor: 120_000 });

    const pledges = new PledgeRepository(pooled);
    const page = await pledges.list({ limit: 200, memberNo: 'PG-1' });
    const row = page.items.find((item) => item.id === pledgeId);
    expect(row?.memberName).toBe('Ama Mensah');
    expect(row?.offeringName).toBe('Sunday Tithe');
    expect(row?.nextReminder).toBe(shiftDate(today, 3));
  });
});
