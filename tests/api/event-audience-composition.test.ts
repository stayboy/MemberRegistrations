import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { reachableContacts } from '../helpers/member-fixtures.js';

/**
 * Composition across an event's audience set (A-2a). A member is in the event
 * when they match **every** audience, so the roster, `expected` and the parent
 * read count the intersection, never the primary and never the union.
 */
let harness: TestApp;
let app: TestApp['app'];

let everyoneId: string;
let choirId: string;
let presbytersId: string;
let visitorsId: string;

const DATE = '2030-02-10';
const WINDOW = { from: '2030-02-01', to: '2030-02-20' };

function createMember(memberNo: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Composition',
      lastName: memberNo,
      joinedOn: '2020-01-01',
      contacts: reachableContacts(),
      ...extra,
    });
}

async function audienceByKey(key: string): Promise<string> {
  const [audience] = await harness.db.query<{ id: string }>(
    'select id from audiences where system_key = $1',
    [key],
  );
  expect(audience).toBeTruthy();
  return audience!.id;
}

function createEvent(name: string, audienceIds: string[], date = DATE) {
  return request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      name,
      startTime: '09:00',
      venueType: 'auditorium',
      occurrences: [{ date }],
      audienceIds,
    });
}

async function expectedFor(eventId: string, date = DATE): Promise<number> {
  const response = await request(app)
    .get(`/v1/events/${eventId}/attendance`)
    .query({ date })
    .set(readHeaders);
  expect(response.status).toBe(200);
  return response.body.expected as number;
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  everyoneId = await audienceByKey('everyone');
  choirId = await audienceByKey('ministry:CHOIR');
  presbytersId = await audienceByKey('presbyters');
  visitorsId = await audienceByKey('status:visitor');

  // Exactly two active members: one choir member and one plain member. The
  // intersection of Everyone and Choir is therefore the choir member alone.
  expect((await createMember('COMP-CHOIR', { ministries: ['CHOIR'] })).status).toBe(201);
  expect((await createMember('COMP-PLAIN')).status).toBe(201);
  expect(
    (
      await createMember('COMP-VISITOR', {
        membershipStatus: 'visitor',
        ministries: ['CHOIR'],
      })
    ).status,
  ).toBe(201);
});

afterAll(async () => {
  await harness.close();
});

describe('event audience composition', () => {
  it('rosters only the members in every audience, not the primary audience', async () => {
    const created = await createEvent('Choir Assembly', [everyoneId, choirId]);
    expect(created.status).toBe(201);

    // COMP-PLAIN matches Everyone but not Choir, so the second audience removes
    // them from the roster and from the count.
    expect(await expectedFor(created.body.id)).toBe(1);
  });

  it('resolves Visitors intersected with Choir to zero and saves it', async () => {
    const created = await createEvent('Newcomers Choir', [visitorsId, choirId]);
    expect(created.status).toBe(201);

    expect(await expectedFor(created.body.id)).toBe(0);

    const detail = await request(app)
      .get(`/v1/events/${created.body.id}`)
      .query({ view: 'parent', ...WINDOW })
      .set(readHeaders);
    expect(detail.status).toBe(200);
    expect(detail.body.audiences.map((audience: { id: string }) => audience.id)).toEqual([
      visitorsId,
      choirId,
    ]);
    expect(detail.body.occurrences[0].expected).toBe(0);
    expect(detail.body.summary.attendance.memberSessions.expected).toBe(0);
  });

  it('moves the ETag when only the second audience changes', async () => {
    const created = await createEvent('Tiered Service', [everyoneId, choirId]);
    expect(created.status).toBe(201);
    const firstEtag = created.headers.etag as string;
    expect(firstEtag).toBeTruthy();

    const changed = await request(app)
      .patch(`/v1/events/${created.body.id}`)
      .set(writeHeaders)
      .send({ audienceIds: [everyoneId, presbytersId] });
    expect(changed.status).toBe(200);
    expect(changed.headers.etag).toBeTruthy();
    expect(changed.headers.etag).not.toBe(firstEtag);
    expect(changed.body.audienceIds).toEqual([everyoneId, presbytersId]);
    expect(changed.body.audiences).toHaveLength(2);
    expect(changed.body.audienceId).toBe(everyoneId);

    // Re-sending the same set is not a content change.
    const repeat = await request(app)
      .patch(`/v1/events/${created.body.id}`)
      .set(writeHeaders)
      .send({ audienceIds: [everyoneId, presbytersId] });
    expect(repeat.status).toBe(200);
    expect(repeat.headers.etag).toBe(changed.headers.etag);
  });

  it('returns the event from ?ministry= when any audience projects to it', async () => {
    const created = await createEvent('Everyone And Choir', [everyoneId, choirId]);
    expect(created.status).toBe(201);

    const included = await request(app)
      .get('/v1/events')
      .query({ view: 'parent', ...WINDOW, ministry: 'CHOIR', limit: 100 })
      .set(readHeaders);
    expect(included.status).toBe(200);
    expect((included.body.items as Array<{ id: string }>).map((item) => item.id)).toContain(
      created.body.id,
    );

    const excluded = await request(app)
      .get('/v1/events')
      .query({ view: 'parent', ...WINDOW, ministry: 'PRAYER', limit: 100 })
      .set(readHeaders);
    expect(excluded.status).toBe(200);
    expect((excluded.body.items as Array<{ id: string }>).map((item) => item.id)).not.toContain(
      created.body.id,
    );
  });

  it('treats a reordered audience set as the same recurring name key', async () => {
    const first = await request(app)
      .post('/v1/events')
      .set(writeHeaders)
      .send({
        name: 'Ordered Assembly',
        startTime: '09:00',
        venueType: 'auditorium',
        audienceIds: [everyoneId, choirId],
        recurrence: {
          schedules: [{ effectiveFrom: DATE, rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU' }],
        },
      });
    expect(first.status).toBe(201);

    const reordered = await request(app)
      .post('/v1/events')
      .set(writeHeaders)
      .send({
        name: 'Ordered Assembly',
        startTime: '09:00',
        venueType: 'auditorium',
        audienceIds: [choirId, everyoneId],
        recurrence: {
          schedules: [
            { effectiveFrom: '2030-02-11', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU' },
          ],
        },
      });
    expect(reordered.status).toBe(409);
    expect(reordered.body.detail).toContain('audience set');
  });

  it('rosters a series-created event through its one-row set', async () => {
    const series = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Choir Weekly',
        ministryCode: 'CHOIR',
        timezone: 'UTC',
        schedule: {
          effectiveFrom: DATE,
          rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU',
          endsOn: DATE,
        },
      });
    expect(series.status).toBe(201);

    const generated = await request(app)
      .post('/v1/events/generate')
      .query({ from: DATE, to: DATE })
      .set(writeHeaders);
    expect(generated.status).toBe(200);
    const eventId = generated.body.eventIds[0] as string;
    expect(eventId).toBeTruthy();

    expect(await expectedFor(eventId)).toBe(1);

    const [set] = await harness.db.query<{ audience_id: string; sort_order: number }>(
      'select audience_id, sort_order from event_audiences where event_id = $1',
      [eventId],
    );
    expect(set).toEqual({ audience_id: choirId, sort_order: 0 });
  });

  it('rosters a seedEvent-created event through its one-row set', async () => {
    const seeded = await seedEvent(harness.db, {
      name: 'Seeded Choir Service',
      ministryCode: 'CHOIR',
      startDate: DATE,
      endDate: DATE,
      sessions: [{ date: DATE, status: 'held' }],
    });

    expect(await expectedFor(seeded.eventId)).toBe(1);

    const [set] = await harness.db.query<{ audience_id: string }>(
      'select audience_id from event_audiences where event_id = $1',
      [seeded.eventId],
    );
    expect(set).toEqual({ audience_id: choirId });
  });
});
