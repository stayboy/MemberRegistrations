import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClockingRepository } from '../../src/repos/clocking.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let today: string;
let yesterday: string;
let presbyterEventId: string;
let generalEventId: string;

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

async function createMember(
  memberNo: string,
  isPresbyter: boolean,
  joinedOn = '2020-01-01',
): Promise<void> {
  const response = await request(harness.app).post('/v1/members').set(writeHeaders).send({
    memberNo,
    firstName: 'Member',
    lastName: memberNo,
    gender: 'male',
    joinedOn,
    isPresbyter,
  });
  expect(response.status).toBe(201);
}

async function createEvent(
  eventNo: string,
  dates: string[],
  presbyterOnly = false,
): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo,
      name: `Presbytery ${eventNo}`,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      startTime: '09:00',
      venueType: 'auditorium',
      presbyterOnly,
      sessions: dates.map((date) => ({ date })),
    });
  expect(response.status).toBe(201);
  expect(response.body.presbyterOnly).toBe(presbyterOnly);
  return response.body.id as string;
}

beforeAll(async () => {
  harness = await createTestApp();
  today = new Date().toISOString().slice(0, 10);
  yesterday = shiftDate(today, -1);

  await createMember('PR-PLAIN', false);
  await createMember('PR-PRES', true);
  await createMember('PR-PRES2', true);

  presbyterEventId = await createEvent('PR-100', [today], true);
  generalEventId = await createEvent('PR-200', [today]);
  await createEvent('PR-300', [yesterday]);
  await createEvent('PR-400', [yesterday], true);
});

afterAll(async () => {
  await harness.close();
});

describe('presbyter-only events on the officer bearer surface', () => {
  it('reads a presbyter-only event with no special header', async () => {
    const detail = await request(harness.app)
      .get(`/v1/events/${presbyterEventId}`)
      .set(readHeaders);
    expect(detail.status).toBe(200);
    expect(detail.body.presbyterOnly).toBe(true);

    const listed = await request(harness.app)
      .get('/v1/events')
      .query({ limit: 100 })
      .set(readHeaders);
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((event: { id: string }) => event.id)).toContain(presbyterEventId);

    const report = await request(harness.app)
      .get(`/v1/events/${presbyterEventId}/attendance`)
      .query({ date: today })
      .set(readHeaders);
    expect(report.status).toBe(200);
    expect(report.body.eventId).toBe(presbyterEventId);
  });

  it('records and removes attendance on a presbyter-only session through the officer bearer', async () => {
    const recorded = await request(harness.app)
      .post(`/v1/events/${presbyterEventId}/attendance`)
      .set(writeHeaders)
      .send({ memberNo: 'PR-PRES2', date: today });
    expect(recorded.status).toBe(201);

    const removed = await request(harness.app)
      .delete(`/v1/events/${presbyterEventId}/attendance/${recorded.body.id}`)
      .set(writeHeaders);
    expect(removed.status).toBe(204);
  });

  it('refuses a non-presbyter as the attendance target on a presbyter-only session', async () => {
    const response = await request(harness.app)
      .post(`/v1/events/${presbyterEventId}/attendance`)
      .set(writeHeaders)
      .send({ memberNo: 'PR-PLAIN', date: today });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('answers 404 to clocking and delegation at a presbyter-only session for a non-presbyter actor', async () => {
    const clocking = new ClockingRepository(harness.db);

    await expect(
      clocking.clockIn({
        eventId: presbyterEventId,
        sessionDate: today,
        memberNo: 'PR-PLAIN',
        actorMemberNo: 'PR-PLAIN',
        actor: 'test',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    await expect(
      clocking.delegate(
        {
          eventId: presbyterEventId,
          sessionDate: today,
          fromMemberNo: 'PR-PLAIN',
          toMemberNo: 'PR-PRES',
          reason: 'not a presbyter',
        },
        'test',
        { surface: 'member' },
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('answers 422 not_presbyter to a bearer delegation from a non-presbyter', async () => {
    const response = await request(harness.app)
      .post(`/v1/events/${presbyterEventId}/delegations`)
      .query({ sessionDate: today })
      .set(writeHeaders)
      .send({
        fromMemberNo: 'PR-PLAIN',
        toMemberNo: 'PR-PRES',
        reason: 'bearer caller names the member',
      });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('not_presbyter');
  });
});

describe('presbyter-only roster and regularity', () => {
  it('counts the active presbyters as the presbyter-only expected', async () => {
    const response = await request(harness.app)
      .get(`/v1/events/${presbyterEventId}/attendance`)
      .query({ date: today })
      .set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.body.expected).toBe(2);
  });

  it('counts every active member for a general session', async () => {
    const response = await request(harness.app)
      .get(`/v1/events/${generalEventId}/attendance`)
      .query({ date: today })
      .set(readHeaders);
    expect(response.body.expected).toBe(3);
  });

  it('excludes presbyter-only sessions from a non-presbyter member regularity', async () => {
    const plain = await request(harness.app).get('/v1/members/PR-PLAIN/profile').set(readHeaders);
    expect(plain.status).toBe(200);
    expect(plain.body.attendance.expected).toBe(2);

    const presbyter = await request(harness.app)
      .get('/v1/members/PR-PRES/profile')
      .set(readHeaders);
    expect(presbyter.body.attendance.expected).toBe(4);
  });
});

describe('series presbyterOnly', () => {
  it('affects future generated occurrences only', async () => {
    const created = await request(harness.app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Future Presbyter Service',
        schedule: {
          effectiveFrom: '2030-02-03',
          rrule: 'FREQ=WEEKLY;BYDAY=SU',
          endsOn: '2030-02-17',
        },
      });
    expect(created.status).toBe(201);
    expect(created.body.presbyterOnly).toBe(false);
    const seriesId = created.body.id as string;

    const first = await request(harness.app)
      .post('/v1/events/generate')
      .query({ from: '2030-02-03', to: '2030-02-10' })
      .set(writeHeaders);
    expect(first.status).toBe(200);
    expect(first.body.created).toBe(2);

    const flagged = await request(harness.app)
      .put(`/v1/series/${seriesId}`)
      .set(writeHeaders)
      .send({ presbyterOnly: true });
    expect(flagged.status).toBe(200);
    expect(flagged.body.presbyterOnly).toBe(true);

    const second = await request(harness.app)
      .post('/v1/events/generate')
      .query({ from: '2030-02-03', to: '2030-02-17' })
      .set(writeHeaders);
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(1);

    const listed = await request(harness.app)
      .get('/v1/events')
      .query({ seriesId, from: '2030-02-03', to: '2030-02-17', limit: 100 })
      .set(readHeaders);
    const byDate = new Map<string, boolean>(
      listed.body.items.map((event: { startDate: string; presbyterOnly: boolean }) => [
        event.startDate,
        event.presbyterOnly,
      ]),
    );
    expect(byDate.get('2030-02-03')).toBe(false);
    expect(byDate.get('2030-02-10')).toBe(false);
    expect(byDate.get('2030-02-17')).toBe(true);
  });

  it('creates a presbyter-only series whose generated instances inherit the flag', async () => {
    const created = await request(harness.app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Elders Only Service',
        presbyterOnly: true,
        schedule: {
          effectiveFrom: '2030-03-03',
          rrule: 'FREQ=WEEKLY;BYDAY=SU',
          endsOn: '2030-03-03',
        },
      });
    expect(created.status).toBe(201);
    expect(created.body.presbyterOnly).toBe(true);

    const generated = await request(harness.app)
      .post('/v1/events/generate')
      .query({ from: '2030-03-03', to: '2030-03-03' })
      .set(writeHeaders);
    expect(generated.status).toBe(200);
    expect(generated.body.created).toBe(1);

    const listed = await request(harness.app)
      .get('/v1/events')
      .query({ seriesId: created.body.id, from: '2030-03-03', to: '2030-03-03' })
      .set(readHeaders);
    expect(listed.body.items[0].presbyterOnly).toBe(true);
  });
});
