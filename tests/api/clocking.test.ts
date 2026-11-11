import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClockingRepository } from '../../src/repos/clocking.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];
let clocking: ClockingRepository;
let eventId: string;
const sessions = {
  delegation: '',
  expected: '',
  shepherd: '',
  senior: '',
  delegated: '',
};

function day(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createMember(memberNo: string, extra: Record<string, unknown> = {}): Promise<void> {
  await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({ memberNo, firstName: 'Member', lastName: memberNo, gender: 'male', ...extra })
    .expect(201);
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
  clocking = new ClockingRepository(harness.db);

  // Per-member writes (clock-in and the manual row it wraps) are accepted only
  // for a session dated today; delegation reads and the roster count work on
  // any session date.
  sessions.delegation = day(-5);
  sessions.expected = day(-4);
  sessions.shepherd = day(0);
  sessions.senior = day(0);
  sessions.delegated = day(0);

  await createMember('CLK-SENIOR', { isPresbyter: true, presbyterRank: 1 });
  await createMember('CLK-SENIOR-2', { isPresbyter: true, presbyterRank: 2 });
  await createMember('CLK-DELEGATE', { isPresbyter: true });
  await createMember('CLK-PLAIN');
  await createMember('CLK-M1');
  await createMember('CLK-M2');
  await createMember('CLK-M3');

  await request(app)
    .post('/v1/shepherding/assignments')
    .set(writeHeaders)
    .send({ officerMemberNo: 'CLK-DELEGATE', memberNo: 'CLK-M1' })
    .expect(201);

  const event = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo: 'CLK-EVENT',
      name: 'Clocking event',
      startDate: sessions.delegation,
      endDate: sessions.delegated,
      startTime: '09:00',
      venueType: 'auditorium',
      sessions: [...new Set(Object.values(sessions))].map((date) => ({ date })),
    })
    .expect(201);
  eventId = event.body.id as string;
});

afterAll(async () => {
  await harness.close();
});

describe('delegation', () => {
  it('lets a senior presbyter delegate to an active presbyter', async () => {
    const response = await request(app)
      .post(`/v1/events/${eventId}/delegations`)
      .query({ sessionDate: sessions.delegation })
      .set(writeHeaders)
      .send({
        fromMemberNo: 'CLK-SENIOR',
        toMemberNo: 'CLK-DELEGATE',
        reason: 'I will be late',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      fromMemberNo: 'CLK-SENIOR',
      toMemberNo: 'CLK-DELEGATE',
      reason: 'I will be late',
    });

    const list = await request(app)
      .get(`/v1/events/${eventId}/delegations`)
      .query({ sessionDate: sessions.delegation })
      .set(readHeaders)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].toMemberNo).toBe('CLK-DELEGATE');

    const [stored] = await harness.db.query<{ created_by: string }>(
      'select created_by from clocking_delegations where id = $1',
      [response.body.id],
    );
    expect(stored!.created_by).toBe('test-admin');
  });

  it('refuses a non-senior grantor and a non-presbyter delegate', async () => {
    const nonSenior = await request(app)
      .post(`/v1/events/${eventId}/delegations`)
      .query({ sessionDate: sessions.delegation })
      .set(writeHeaders)
      .send({
        fromMemberNo: 'CLK-DELEGATE',
        toMemberNo: 'CLK-SENIOR',
        reason: 'not senior',
      });
    expect(nonSenior.status).toBe(422);
    expect(nonSenior.body.code).toBe('not_senior_presbyter');

    const nonPresbyter = await request(app)
      .post(`/v1/events/${eventId}/delegations`)
      .query({ sessionDate: sessions.delegation })
      .set(writeHeaders)
      .send({
        fromMemberNo: 'CLK-SENIOR',
        toMemberNo: 'CLK-PLAIN',
        reason: 'not a presbyter',
      });
    expect(nonPresbyter.status).toBe(422);
    expect(nonPresbyter.body.code).toBe('not_presbyter');

    const plainGrantor = await request(app)
      .post(`/v1/events/${eventId}/delegations`)
      .query({ sessionDate: sessions.delegation })
      .set(writeHeaders)
      .send({
        fromMemberNo: 'CLK-PLAIN',
        toMemberNo: 'CLK-DELEGATE',
        reason: 'plain member',
      });
    expect(plainGrantor.status).toBe(422);
    expect(plainGrantor.body.code).toBe('not_presbyter');

    await expect(
      clocking.delegate(
        {
          eventId,
          sessionDate: sessions.delegation,
          fromMemberNo: 'CLK-SENIOR',
          toMemberNo: 'CLK-DELEGATE',
          reason: ' x ',
        },
        'test-admin',
      ),
    ).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('refuses a second active delegation for the same session', async () => {
    const response = await request(app)
      .post(`/v1/events/${eventId}/delegations`)
      .query({ sessionDate: sessions.delegation })
      .set(writeHeaders)
      .send({
        fromMemberNo: 'CLK-SENIOR-2',
        toMemberNo: 'CLK-DELEGATE',
        reason: 'another grant',
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('delegation_exists');
  });
});

describe('expected headcount route removal', () => {
  it('answers 404 for the retired /expected route', async () => {
    const response = await request(app)
      .get(`/v1/events/${eventId}/expected`)
      .query({ sessionDate: sessions.expected })
      .set(readHeaders);
    expect(response.status).toBe(404);

    const write = await request(app)
      .put(`/v1/events/${eventId}/expected`)
      .query({ sessionDate: sessions.expected })
      .set(writeHeaders)
      .send({ male: 20, female: 30, children: 40 });
    expect(write.status).toBe(404);
  });
});

describe('clock-in authority', () => {
  it('lets a presbyter clock in a member they actively shepherd only', async () => {
    const clocked = await clocking.clockIn({
      eventId,
      sessionDate: sessions.shepherd,
      memberNo: 'CLK-M1',
      actorMemberNo: 'CLK-DELEGATE',
      actor: 'test-admin',
    });
    expect(clocked.memberNo).toBe('CLK-M1');

    await expect(
      clocking.clockIn({
        eventId,
        sessionDate: sessions.shepherd,
        memberNo: 'CLK-M2',
        actorMemberNo: 'CLK-DELEGATE',
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'not_shepherd' });

    await expect(
      clocking.clockIn({
        eventId,
        sessionDate: sessions.shepherd,
        memberNo: 'CLK-M1',
        actorMemberNo: 'CLK-DELEGATE',
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ name: 'ConflictError' });
  });

  it('lets a senior who is recorded present clock anyone', async () => {
    await request(app)
      .post(`/v1/events/${eventId}/attendance`)
      .set(writeHeaders)
      .send({ memberNo: 'CLK-SENIOR', date: sessions.senior })
      .expect(201);

    const clocked = await clocking.clockIn({
      eventId,
      sessionDate: sessions.senior,
      memberNo: 'CLK-M2',
      actorMemberNo: 'CLK-SENIOR',
      actor: 'test-admin',
    });
    expect(clocked.memberNo).toBe('CLK-M2');
  });

  it('requires a senior who is not present to delegate first', async () => {
    await expect(
      clocking.clockIn({
        eventId,
        sessionDate: sessions.senior,
        memberNo: 'CLK-M3',
        actorMemberNo: 'CLK-SENIOR-2',
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'delegate_required' });
  });

  it('lets a delegate clock any member for the delegated session', async () => {
    await request(app)
      .post(`/v1/events/${eventId}/delegations`)
      .query({ sessionDate: sessions.delegated })
      .set(writeHeaders)
      .send({
        fromMemberNo: 'CLK-SENIOR',
        toMemberNo: 'CLK-DELEGATE',
        reason: 'covering the session',
      })
      .expect(201);

    const clocked = await clocking.clockIn({
      eventId,
      sessionDate: sessions.delegated,
      memberNo: 'CLK-M3',
      actorMemberNo: 'CLK-DELEGATE',
      actor: 'test-admin',
    });
    expect(clocked.memberNo).toBe('CLK-M3');
  });

  it('refuses a non-presbyter actor', async () => {
    await expect(
      clocking.clockIn({
        eventId,
        sessionDate: sessions.delegated,
        memberNo: 'CLK-M1',
        actorMemberNo: 'CLK-PLAIN',
        actor: 'test-admin',
      }),
    ).rejects.toMatchObject({ code: 'not_presbyter' });
  });
});
