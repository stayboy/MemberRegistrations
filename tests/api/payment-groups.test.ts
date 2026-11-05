import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  InitiatePaymentInput,
  InitiatedPayment,
  PaymentGateway,
} from '../../src/payments/gateway.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

const TEST_PAYMENT_SECRET = 'test-payment-gateway-secret-16';

let harness: TestApp;
let gateway: ControllableGateway;

let ghsOfferingId: string;
let buildingOfferingId: string;
let usdOfferingId: string;
let unattachedOfferingId: string;
let expiredOfferingId: string;

let eventId: string;
let expiryEventId: string;
let eventSeq = 0;
let keySeq = 0;

class ControllableGateway implements PaymentGateway {
  failNext = false;
  calls: InitiatePaymentInput[] = [];

  async initiate(input: InitiatePaymentInput): Promise<InitiatedPayment> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('gateway down');
    }
    this.calls.push(input);
    return { reference: input.reference, status: 'initiated' };
  }
}

interface SeedEvent {
  name: string;
  startDate: string;
  endDate: string;
  sessions: Array<{ date: string }>;
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

function postGroup(body: Record<string, unknown>) {
  return request(harness.app).post('/v1/contributions/groups').set(writeHeaders).send(body);
}

function postPledge(body: Record<string, unknown>) {
  return request(harness.app).post('/v1/pledges').set(writeHeaders).send(body);
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
     values ($1,null,$2,'UTC',$3,$4,'09:00',null,'auditorium',null,null,'scheduled','manual',$5::jsonb)
     returning id`,
    [
      `PAY-${eventSeq}`,
      seed.name,
      seed.startDate,
      seed.endDate,
      JSON.stringify(
        seed.sessions.map((session) => ({
          date: session.date,
          startTime: '09:00',
          endTime: null,
          status: 'scheduled',
        })),
      ),
    ],
  );
  return row!.id;
}

function baseGroup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    memberNo: 'PG-1001',
    eventId,
    sessionDate: todayUtc(),
    idempotencyKey: nextKey('group'),
    items: [
      { offeringId: ghsOfferingId, amountMinor: 2000 },
      { offeringId: buildingOfferingId, amountMinor: 3000 },
    ],
    ...overrides,
  };
}

async function makePledge(overrides: Record<string, unknown> = {}) {
  const response = await postPledge({
    memberNo: 'PG-1001',
    offeringId: ghsOfferingId,
    eventId,
    sessionDate: todayUtc(),
    amountMinor: 7000,
    expectedOn: shiftDate(todayUtc(), 30),
    idempotencyKey: nextKey('pledge'),
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body as {
    id: string;
    memberNo: string;
    offeringId: string;
    amountMinor: number;
    currency: string;
  };
}

function callbackBody(
  group: { reference: string; totalMinor: number; currency: string },
  status: 'paid' | 'failed',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    reference: group.reference,
    status,
    amountMinor: group.totalMinor,
    currency: group.currency,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function postCallback(body: Record<string, unknown>, signature?: string) {
  const raw = JSON.stringify(body);
  const signed = signature ?? createHmac('sha256', TEST_PAYMENT_SECRET).update(raw).digest('hex');
  return request(harness.app)
    .post('/v1/payments/callback')
    .set({ 'Content-Type': 'application/json', 'X-Payment-Signature': signed })
    .send(raw);
}

async function countGroups(key: string): Promise<number> {
  const [row] = await harness.db.query<{ count: number | string }>(
    'select count(*) as count from payment_groups where idempotency_key = $1',
    [key],
  );
  return Number(row!.count);
}

beforeAll(async () => {
  gateway = new ControllableGateway();
  harness = await createTestApp({
    paymentGateway: gateway,
    paymentGatewaySecret: TEST_PAYMENT_SECRET,
  });

  const presbyter = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo: 'PG-9001', firstName: 'Grace', lastName: 'Okafor', isPresbyter: true });
  expect(presbyter.status).toBe(201);

  for (const memberNo of ['PG-1001', 'PG-1002']) {
    const member = await request(harness.app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({ memberNo, firstName: 'Member', lastName: memberNo });
    expect(member.status).toBe(201);
  }

  const assignment = await request(harness.app)
    .post('/v1/shepherding/assignments')
    .set(writeHeaders)
    .send({ officerMemberNo: 'PG-9001', memberNo: 'PG-1001', assignedOn: '2020-01-01' });
  expect(assignment.status).toBe(201);

  const ghs = await createOffering({
    purpose: 'General giving',
    kind: 'freewill',
    availableUntil: '2999-12-31',
  });
  expect(ghs.status).toBe(201);
  ghsOfferingId = ghs.body.id;

  const building = await createOffering({
    purpose: 'Building fund',
    kind: 'building',
    availableUntil: '2999-12-31',
  });
  expect(building.status).toBe(201);
  buildingOfferingId = building.body.id;

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

  const expired = await createOffering({
    purpose: 'Expired appeal',
    kind: 'freewill',
    availableUntil: '2026-11-01',
  });
  expect(expired.status).toBe(201);
  expiredOfferingId = expired.body.id;

  eventId = await insertEvent({
    name: 'Payment Group Event',
    startDate: todayUtc(),
    endDate: todayUtc(),
    sessions: [{ date: todayUtc() }],
  });
  expect((await attach(eventId, ghsOfferingId)).status).toBe(201);
  expect((await attach(eventId, buildingOfferingId)).status).toBe(201);
  expect((await attach(eventId, usdOfferingId)).status).toBe(201);

  expiryEventId = await insertEvent({
    name: 'Expiry Window Event',
    startDate: '2026-11-01',
    endDate: '2999-12-31',
    sessions: [{ date: '2026-11-01' }, { date: '2999-12-31' }],
  });
  expect((await attach(expiryEventId, expiredOfferingId)).status).toBe(201);
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/contributions/groups', () => {
  it('creates one group, its child contributions and one intent for a member split', async () => {
    gateway.calls = [];
    const response = await postGroup(baseGroup({ idempotencyKey: 'split-1' }));

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.created).toBe(true);
    expect(response.body.group).toMatchObject({
      reference: expect.stringMatching(/^MR-[A-Z2-7]{10}$/),
      idempotencyKey: 'split-1',
      totalMinor: 5000,
      currency: 'GHS',
      status: 'pending',
      pledgeId: null,
      createdBy: 'test-admin',
    });
    expect(response.body.contributions).toHaveLength(2);
    expect(
      response.body.contributions.map((item: { idempotencyKey: string }) => item.idempotencyKey),
    ).toEqual(['split-1:1', 'split-1:2']);
    for (const contribution of response.body.contributions) {
      expect(contribution).toMatchObject({
        memberNo: 'PG-1001',
        status: 'initiated',
        channel: 'ussd',
        currency: 'GHS',
      });
    }
    expect(response.body.intent).toMatchObject({
      gateway: 'stub',
      reference: response.body.group.reference,
      status: 'initiated',
      rawCallbackHash: null,
    });

    const [rows] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from contributions where payment_group_id = $1',
      [response.body.group.id],
    );
    expect(Number(rows!.count)).toBe(2);

    expect(gateway.calls).toHaveLength(1);
    expect(gateway.calls[0]).toMatchObject({
      reference: response.body.group.reference,
      totalMinor: 5000,
      currency: 'GHS',
      payer: { memberNo: 'PG-1001' },
    });
    expect(gateway.calls[0]!.items).toHaveLength(2);
  });

  it('returns the stored rows for an identical repeat and writes no second rows', async () => {
    const first = await postGroup(baseGroup({ idempotencyKey: 'split-repeat-1' }));
    expect(first.status).toBe(201);

    const second = await postGroup(baseGroup({ idempotencyKey: 'split-repeat-1' }));
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.group.id).toBe(first.body.group.id);
    expect(second.body.contributions.map((item: { id: string }) => item.id)).toEqual(
      first.body.contributions.map((item: { id: string }) => item.id),
    );

    expect(await countGroups('split-repeat-1')).toBe(1);
    const [contributions] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from contributions where idempotency_key like 'split-repeat-1:%'`,
    );
    expect(Number(contributions!.count)).toBe(2);
  });

  it('rejects a different payload under the same idempotency key', async () => {
    const first = await postGroup(baseGroup({ idempotencyKey: 'split-conflict-1' }));
    expect(first.status).toBe(201);

    const different = await postGroup(
      baseGroup({
        idempotencyKey: 'split-conflict-1',
        items: [
          { offeringId: ghsOfferingId, amountMinor: 2000 },
          { offeringId: buildingOfferingId, amountMinor: 3001 },
        ],
      }),
    );
    expect(different.status).toBe(409);
    expect(different.body.code).toBe('idempotency_conflict');
  });

  it('records a visitor payment group with a hashed phone and no member', async () => {
    const response = await postGroup(
      baseGroup({
        memberNo: undefined,
        visitorName: '  Visitor One  ',
        visitorPhone: '0801 234 5678',
        idempotencyKey: 'visitor-group-1',
        items: [{ offeringId: ghsOfferingId, amountMinor: 4000 }],
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.group.pledgeId).toBeNull();
    expect(response.body.contributions).toHaveLength(1);
    expect(response.body.contributions[0]).toMatchObject({
      memberNo: null,
      visitorName: 'Visitor One',
      status: 'initiated',
    });
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('8012345678');
    expect(serialised).not.toContain('0801');

    const [row] = await harness.db.query<{ visitor_phone_hash: string; raw: string }>(
      `select visitor_phone_hash, row_to_json(contributions)::text as raw
         from contributions where id = $1`,
      [response.body.contributions[0].id],
    );
    expect(row!.visitor_phone_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.raw).not.toContain('8012345678');
  });

  it('rejects invalid items before writing anything', async () => {
    const empty = await postGroup(baseGroup({ idempotencyKey: nextKey('empty'), items: [] }));
    expect(empty.status).toBe(422);
    expect(empty.body.code).toBe('validation_error');

    const tooMany = await postGroup(
      baseGroup({
        idempotencyKey: nextKey('too-many'),
        items: Array.from({ length: 21 }, () => ({
          offeringId: ghsOfferingId,
          amountMinor: 100,
        })),
      }),
    );
    expect(tooMany.status).toBe(422);

    const zero = await postGroup(
      baseGroup({
        idempotencyKey: nextKey('zero'),
        items: [{ offeringId: ghsOfferingId, amountMinor: 0 }],
      }),
    );
    expect(zero.status).toBe(422);

    const mixed = await postGroup(
      baseGroup({
        idempotencyKey: nextKey('mixed-currency'),
        items: [
          { offeringId: ghsOfferingId, amountMinor: 1000 },
          { offeringId: usdOfferingId, amountMinor: 1000 },
        ],
      }),
    );
    expect(mixed.status).toBe(422);
    expect(mixed.body.code).toBe('validation_error');
  });

  it('returns 404 for an unknown member, offering or event', async () => {
    const member = await postGroup(
      baseGroup({ memberNo: 'PG-9999', idempotencyKey: nextKey('unknown-member') }),
    );
    expect(member.status).toBe(404);
    expect(member.body.code).toBe('not_found');

    const offering = await postGroup(
      baseGroup({
        idempotencyKey: nextKey('unknown-offering'),
        items: [{ offeringId: '00000000-0000-4000-8000-000000000002', amountMinor: 1000 }],
      }),
    );
    expect(offering.status).toBe(404);
    expect(offering.body.code).toBe('not_found');

    const before = await countGroups('unknown-event-1');
    const event = await postGroup(
      baseGroup({
        idempotencyKey: 'unknown-event-1',
        eventId: '00000000-0000-4000-8000-000000000001',
      }),
    );
    expect(event.status).toBe(404);
    expect(event.body.code).toBe('not_found');
    expect(await countGroups('unknown-event-1')).toBe(before);
  });

  it('rejects an unattached or expired offering and rolls the group back', async () => {
    const unattached = await postGroup(
      baseGroup({
        idempotencyKey: 'unattached-group-1',
        items: [{ offeringId: unattachedOfferingId, amountMinor: 1000 }],
      }),
    );
    expect(unattached.status).toBe(422);
    expect(unattached.body.code).toBe('offering_not_on_event');
    expect(await countGroups('unattached-group-1')).toBe(0);

    const expired = await postGroup(
      baseGroup({
        idempotencyKey: 'expired-group-1',
        eventId: expiryEventId,
        sessionDate: '2999-12-31',
        items: [{ offeringId: expiredOfferingId, amountMinor: 1000 }],
      }),
    );
    expect(expired.status).toBe(422);
    expect(expired.body.code).toBe('offering_expired');
    expect(await countGroups('expired-group-1')).toBe(0);

    const [contributions] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from contributions
        where idempotency_key like 'unattached-group-1:%'
           or idempotency_key like 'expired-group-1:%'`,
    );
    expect(Number(contributions!.count)).toBe(0);
  });

  it('rolls everything back and returns 502 payment_failed when the gateway fails', async () => {
    gateway.failNext = true;
    const response = await postGroup(baseGroup({ idempotencyKey: 'gateway-fail-1' }));

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('payment_failed');
    expect(await countGroups('gateway-fail-1')).toBe(0);

    const [contributions] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from contributions where idempotency_key like 'gateway-fail-1:%'`,
    );
    expect(Number(contributions!.count)).toBe(0);
  });
});

describe('pledge redemption groups', () => {
  it('requires the owner and an exact offering, amount and currency match', async () => {
    const pledge = await makePledge();

    const otherMember = await postGroup(
      baseGroup({
        memberNo: 'PG-1002',
        pledgeId: pledge.id,
        idempotencyKey: nextKey('pledge-other-member'),
        items: [{ offeringId: ghsOfferingId, amountMinor: 7000 }],
      }),
    );
    expect(otherMember.status).toBe(422);
    expect(otherMember.body.code).toBe('validation_error');

    const wrongOffering = await postGroup(
      baseGroup({
        pledgeId: pledge.id,
        idempotencyKey: nextKey('pledge-wrong-offering'),
        items: [{ offeringId: buildingOfferingId, amountMinor: 7000 }],
      }),
    );
    expect(wrongOffering.status).toBe(422);

    const wrongAmount = await postGroup(
      baseGroup({
        pledgeId: pledge.id,
        idempotencyKey: nextKey('pledge-wrong-amount'),
        items: [{ offeringId: ghsOfferingId, amountMinor: 7001 }],
      }),
    );
    expect(wrongAmount.status).toBe(422);

    const valid = await postGroup(
      baseGroup({
        pledgeId: pledge.id,
        idempotencyKey: nextKey('pledge-valid'),
        items: [{ offeringId: ghsOfferingId, amountMinor: 7000 }],
      }),
    );
    expect(valid.status).toBe(201);
    expect(valid.body.group.pledgeId).toBe(pledge.id);
    expect(valid.body.contributions).toHaveLength(1);
    expect(valid.body.contributions[0]).toMatchObject({
      memberNo: 'PG-1001',
      amountMinor: 7000,
      status: 'initiated',
    });
  });

  it('reuses the pledge creation-time validation after the event is cancelled', async () => {
    const redemptionEventId = await insertEvent({
      name: 'Cancelled Redemption Event',
      startDate: todayUtc(),
      endDate: todayUtc(),
      sessions: [{ date: todayUtc() }],
    });
    expect((await attach(redemptionEventId, ghsOfferingId)).status).toBe(201);

    const pledge = await makePledge({
      eventId: redemptionEventId,
      sessionDate: todayUtc(),
      idempotencyKey: nextKey('pledge-cancelled-event'),
    });
    await harness.db.query(`update event_instances set status = 'cancelled' where id = $1`, [
      redemptionEventId,
    ]);

    const response = await postGroup(
      baseGroup({
        eventId: redemptionEventId,
        pledgeId: pledge.id,
        idempotencyKey: nextKey('pledge-cancelled-group'),
        items: [{ offeringId: ghsOfferingId, amountMinor: 7000 }],
      }),
    );
    expect(response.status).toBe(201);
    expect(response.body.contributions[0]).toMatchObject({ status: 'initiated' });
  });
});

describe('POST /v1/payments/callback', () => {
  it('rejects a missing or invalid signature with 401', async () => {
    const group = await postGroup(baseGroup({ idempotencyKey: nextKey('callback-bad-signature') }));
    expect(group.status).toBe(201);

    const missing = await request(harness.app)
      .post('/v1/payments/callback')
      .set({ 'Content-Type': 'application/json' })
      .send(JSON.stringify(callbackBody(group.body.group, 'paid')));
    expect(missing.status).toBe(401);

    const invalid = await postCallback(callbackBody(group.body.group, 'paid'), 'abcd');
    expect(invalid.status).toBe(401);
  });

  it('returns 404 for an unknown reference', async () => {
    const response = await postCallback({
      reference: 'MR-UNKNOWN000',
      status: 'paid',
      amountMinor: 1000,
      currency: 'GHS',
      occurredAt: new Date().toISOString(),
    });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });

  it('rejects an amount mismatch without writing anything', async () => {
    const created = await postGroup(baseGroup({ idempotencyKey: nextKey('callback-mismatch') }));
    expect(created.status).toBe(201);

    const response = await postCallback(
      callbackBody(created.body.group, 'paid', { amountMinor: created.body.group.totalMinor + 1 }),
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');

    const [group] = await harness.db.query<{ status: string }>(
      'select status from payment_groups where id = $1',
      [created.body.group.id],
    );
    expect(group!.status).toBe('pending');
    const [intent] = await harness.db.query<{ status: string; raw_callback_hash: string | null }>(
      'select status, raw_callback_hash from payment_intents where payment_group_id = $1',
      [created.body.group.id],
    );
    expect(intent!.status).toBe('initiated');
    expect(intent!.raw_callback_hash).toBeNull();
  });

  it('marks the group and contributions paid, then reconciles a repeat', async () => {
    const created = await postGroup(baseGroup({ idempotencyKey: nextKey('callback-paid') }));
    expect(created.status).toBe(201);
    const body = callbackBody(created.body.group, 'paid');

    const paid = await postCallback(body);
    expect(paid.status).toBe(200);
    expect(paid.body).toEqual({ status: 'paid', duplicate: false });

    const [group] = await harness.db.query<{ status: string }>(
      'select status from payment_groups where id = $1',
      [created.body.group.id],
    );
    expect(group!.status).toBe('paid');
    const contributions = await harness.db.query<{ status: string }>(
      'select status from contributions where payment_group_id = $1',
      [created.body.group.id],
    );
    expect(contributions).toHaveLength(2);
    expect(contributions.every((row) => row.status === 'paid')).toBe(true);
    const [intent] = await harness.db.query<{
      status: string;
      raw_callback_hash: string;
    }>('select status, raw_callback_hash from payment_intents where payment_group_id = $1', [
      created.body.group.id,
    ]);
    expect(intent!.status).toBe('paid');
    expect(intent!.raw_callback_hash).toMatch(/^[a-f0-9]{64}$/);

    const repeat = await postCallback(body);
    expect(repeat.status).toBe(200);
    expect(repeat.body).toEqual({ status: 'paid', duplicate: true });
  });

  it('marks a failed group failed and never moves a terminal intent', async () => {
    const created = await postGroup(baseGroup({ idempotencyKey: nextKey('callback-failed') }));
    expect(created.status).toBe(201);
    const body = callbackBody(created.body.group, 'failed');

    const failed = await postCallback(body);
    expect(failed.status).toBe(200);
    expect(failed.body).toEqual({ status: 'failed', duplicate: false });

    const [group] = await harness.db.query<{ status: string }>(
      'select status from payment_groups where id = $1',
      [created.body.group.id],
    );
    expect(group!.status).toBe('failed');
    const contributions = await harness.db.query<{ status: string }>(
      'select status from contributions where payment_group_id = $1',
      [created.body.group.id],
    );
    expect(contributions.every((row) => row.status === 'failed')).toBe(true);

    const mismatch = await postCallback(callbackBody(created.body.group, 'paid'));
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.code).toBe('conflict');
  });

  it('honors a pledge once when its redemption group is paid', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('callback-pledge') });
    const created = await postGroup(
      baseGroup({
        pledgeId: pledge.id,
        idempotencyKey: nextKey('callback-pledge-group'),
        items: [{ offeringId: ghsOfferingId, amountMinor: 7000 }],
      }),
    );
    expect(created.status).toBe(201);
    const contributionId = created.body.contributions[0].id as string;

    const paid = await postCallback(callbackBody(created.body.group, 'paid'));
    expect(paid.status).toBe(200);
    expect(paid.body.duplicate).toBe(false);

    const [row] = await harness.db.query<{
      status: string;
      settled_contribution_id: string;
    }>('select status, settled_contribution_id from pledges where id = $1', [pledge.id]);
    expect(row!.status).toBe('honored');
    expect(row!.settled_contribution_id).toBe(contributionId);

    const events = await harness.db.query<{ actor: string }>(
      `select actor from pledge_events where pledge_id = $1 and kind = 'honored'`,
      [pledge.id],
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.actor).toBe(`gateway:${created.body.group.reference}`);

    const repeat = await postCallback(callbackBody(created.body.group, 'paid'));
    expect(repeat.status).toBe(200);
    expect(repeat.body.duplicate).toBe(true);
    const after = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from pledge_events where pledge_id = $1 and kind = 'honored'`,
      [pledge.id],
    );
    expect(Number(after[0]!.count)).toBe(1);
  });

  it('leaves a pledge pending when its redemption callback fails', async () => {
    const pledge = await makePledge({ idempotencyKey: nextKey('callback-pledge-failed') });
    const created = await postGroup(
      baseGroup({
        pledgeId: pledge.id,
        idempotencyKey: nextKey('callback-pledge-failed-group'),
        items: [{ offeringId: ghsOfferingId, amountMinor: 7000 }],
      }),
    );
    expect(created.status).toBe(201);

    const failed = await postCallback(callbackBody(created.body.group, 'failed'));
    expect(failed.status).toBe(200);

    const [row] = await harness.db.query<{
      status: string;
      settled_contribution_id: string | null;
    }>('select status, settled_contribution_id from pledges where id = $1', [pledge.id]);
    expect(row!.status).toBe('pending');
    expect(row!.settled_contribution_id).toBeNull();
    const events = await harness.db.query<{ id: string }>(
      `select id from pledge_events where pledge_id = $1 and kind = 'honored'`,
      [pledge.id],
    );
    expect(events).toHaveLength(0);
  });

  it('rejects a malformed body with 422 after a valid signature', async () => {
    const raw = '{"reference":';
    const signature = createHmac('sha256', TEST_PAYMENT_SECRET).update(raw).digest('hex');
    const response = await request(harness.app)
      .post('/v1/payments/callback')
      .set({ 'Content-Type': 'application/json', 'X-Payment-Signature': signature })
      .send(raw);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });
});

describe('openapi', () => {
  it('documents the group, settle and callback seams', async () => {
    const response = await request(harness.app).get('/openapi.json').set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.body.paths['/v1/contributions/groups']).toBeDefined();
    expect(response.body.paths['/v1/pledges/{id}/settle']).toBeDefined();
    expect(response.body.paths['/v1/payments/callback']).toBeDefined();
    expect(response.body.paths['/v1/payments/callback'].post.security).toEqual([]);
  });
});
