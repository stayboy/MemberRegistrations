import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIn } from '../../src/domain/series.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { reachableContacts } from '../helpers/member-fixtures.js';

let harness: TestApp;
let app: TestApp['app'];
let seriesId: string;
let seriesEventId: string;
let draftId: string;
let archivedId: string;
let presbyterEventId: string;
let offeringId: string;
let everyoneId: string;
let occurrenceFirst: string;
let occurrenceSecond: string;

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

const TODAY = new Date().toISOString().slice(0, 10);
const FIRST_HELD = shiftDate(TODAY, -7);
const SECOND_HELD = shiftDate(TODAY, -1);
const SERIES_START = shiftDate(TODAY, -28);
const WINDOW = { from: shiftDate(TODAY, -30), to: shiftDate(TODAY, 30) };

async function createMember(memberNo: string): Promise<string> {
  const response = await request(app).post('/v1/members').set(writeHeaders).send({
    memberNo,
    firstName: 'Parent',
    lastName: memberNo,
    joinedOn: '2020-01-01',
    contacts: reachableContacts(),
  });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

function parentList(query: Record<string, string | number> = {}) {
  return request(app)
    .get('/v1/events')
    .query({ view: 'parent', ...WINDOW, ...query })
    .set(readHeaders);
}

function parentDetail(id: string) {
  return request(app)
    .get(`/v1/events/${id}`)
    .query({ view: 'parent', ...WINDOW })
    .set(readHeaders);
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const [everyone] = await harness.db.query<{ id: string }>(
    `select id from audiences where system_key = 'everyone'`,
  );
  everyoneId = everyone!.id;

  await createMember('PR-1');
  await createMember('PR-2');

  const series = await request(app)
    .post('/v1/series')
    .set(writeHeaders)
    .send({
      name: 'Sunday Celebration',
      ministryCode: 'CHOIR',
      timezone: 'UTC',
      description: 'Sunday service',
      schedule: {
        effectiveFrom: SERIES_START,
        rrule: 'FREQ=DAILY',
      },
    });
  expect(series.status).toBe(201);
  seriesId = series.body.id as string;

  const seeded = await seedEvent(harness.db, {
    eventId: seriesId,
    eventNo: 'EVT-2026-014',
    name: 'Sunday Celebration',
    ministryCode: 'CHOIR',
    startDate: FIRST_HELD,
    endDate: SECOND_HELD,
    startTime: '09:00',
    endTime: '11:00',
    venueType: 'auditorium',
    venueName: 'Main Auditorium',
    description: 'Sunday service',
    sessions: [
      {
        date: FIRST_HELD,
        startTime: '09:00',
        endTime: '11:00',
        status: 'held',
      },
      {
        date: SECOND_HELD,
        startTime: '09:00',
        endTime: '11:00',
        status: 'held',
      },
    ],
  });
  seriesEventId = seeded.eventId;
  occurrenceFirst = seeded.occurrenceIds[FIRST_HELD]!;
  occurrenceSecond = seeded.occurrenceIds[SECOND_HELD]!;

  const [batch] = await harness.db.query<{ id: string }>(
    `insert into import_batches
       (kind, actor, row_count, checksum, occurrence_id, session_date, as_of, ended)
     values ('attendance','seed',1,'parent-read-1',$1,$2::date,$3::timestamptz,false)
     returning id`,
    [occurrenceFirst, FIRST_HELD, `${FIRST_HELD}T10:42:00Z`],
  );
  const [member2] = await harness.db.query<{ id: string }>(
    `select id from members where member_no = 'PR-2'`,
  );
  const [member1] = await harness.db.query<{ id: string }>(
    `select id from members where member_no = 'PR-1'`,
  );
  await harness.db.query(
    `insert into attendance (member_id, occurrence_id, source, import_batch_id, created_by)
     values ($1,$2,'manual',null,'seed'), ($3,$2,'import',$4,'seed')`,
    [member1!.id, occurrenceFirst, member2!.id, batch!.id],
  );
  await harness.db.query(
    `insert into event_session_headcounts
       (occurrence_id, session_date, as_of, mode, total, ended, recorded_by)
     values ($1,$2::date,$3::timestamptz,'adults',10,true,'seed')`,
    [occurrenceSecond, SECOND_HELD, `${SECOND_HELD}T09:10:00Z`],
  );

  const [offering] = await harness.db.query<{ id: string }>(
    'insert into offerings default values returning id',
  );
  offeringId = offering!.id;
  await harness.db.query(
    `insert into offering_terms (offering_id, version, name, purpose, kind, currency, created_by)
     values ($1,1,'Sunday Offering','Seed','freewill','GHS','seed')`,
    [offeringId],
  );
  await harness.db.query(
    `insert into event_offerings (event_id, offering_id, attached_by)
     values ($1,$2,'seed')`,
    [seriesEventId, offeringId],
  );

  const draft = await seedEvent(harness.db, {
    eventNo: 'DRAFT-READ-1',
    name: 'Draft Gathering',
    startDate: shiftDate(TODAY, -2),
    endDate: shiftDate(TODAY, -2),
    status: 'draft',
    sessions: [{ date: shiftDate(TODAY, -2), status: 'held' }],
  });
  draftId = draft.eventId;

  const archived = await seedEvent(harness.db, {
    eventNo: 'ARCH-READ-1',
    name: 'Archived Gathering',
    startDate: shiftDate(TODAY, -3),
    endDate: shiftDate(TODAY, -3),
    status: 'archived',
    sessions: [{ date: shiftDate(TODAY, -3), status: 'scheduled' }],
  });
  archivedId = archived.eventId;

  const presbyter = await request(app).post('/v1/members').set(writeHeaders).send({
    memberNo: 'PR-PRES',
    firstName: 'Presbyter',
    lastName: 'Member',
    isPresbyter: true,
    joinedOn: TODAY,
    contacts: reachableContacts(),
  });
  expect(presbyter.status).toBe(201);

  const presbyterOnly = await seedEvent(harness.db, {
    eventNo: 'PRES-READ-1',
    name: 'Presbyters Gathering',
    presbyterOnly: true,
    startDate: TODAY,
    endDate: TODAY,
    sessions: [{ date: TODAY, status: 'scheduled' }],
  });
  presbyterEventId = presbyterOnly.eventId;
});

afterAll(async () => {
  await harness.close();
});

describe('GET /v1/events?view=parent', () => {
  it('returns one parent row with audience, recurrence, occurrences and window figures', async () => {
    const response = await parentList();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.items).toHaveLength(4);

    const event = response.body.items.find((item: { id: string }) => item.id === seriesEventId);
    expect(event).toMatchObject({
      id: seriesEventId,
      eventNo: 'EVT-2026-014',
      name: 'Sunday Celebration',
      audienceId: event.audience.id,
      audience: {
        name: 'Choir',
        system: true,
      },
      ministry: { code: 'CHOIR', name: 'Choir' },
      presbyterOnly: false,
      timezone: 'UTC',
      venueType: 'auditorium',
      venueName: 'Main Auditorium',
      startDate: SERIES_START,
      endDate: null,
      tracksMembers: true,
      status: 'active',
      stats: expect.objectContaining({ attachedEvents: 1 }),
    });
    expect(event.audience.summary).toContain('ministry CHOIR');
    expect(event.recurrence.schedules).toEqual([
      { effectiveFrom: SERIES_START, rrule: 'FREQ=DAILY', endsOn: null },
    ]);
    expect(event.occurrences.map((row: { date: string }) => row.date)).toEqual([
      FIRST_HELD,
      SECOND_HELD,
    ]);
    // The event's audience is allOf(ministry CHOIR). The legacy projection
    // counted every evaluated member (2) because presbyter_only is false and
    // it cannot express a ministry clause; neither PR-1 nor PR-2 holds a CHOIR
    // assignment, so the audience counts nobody at either occurrence date.
    expect(event.occurrences[0]).toMatchObject({
      status: 'held',
      present: 2,
      expected: 0,
      importedRows: 1,
      source: 'mixed',
      capture: { asOf: `${FIRST_HELD}T10:42:00.000Z`, ended: false },
    });
    expect(event.occurrences[1]).toMatchObject({
      status: 'held',
      present: 0,
      expected: 0,
      capture: { asOf: `${SECOND_HELD}T09:10:00.000Z`, ended: true },
    });
    expect(event.summary).toMatchObject({
      nextOccurrence: TODAY,
      attendance: {
        memberSessions: { held: 2, expected: 0, present: 2, rate: null },
        lastHeld: { date: SECOND_HELD, expected: 0, present: 0 },
        cancelled: 0,
        upcoming: 0,
      },
      offerings: { attachedCount: 1, paidMinor: 0 },
    });
  });

  it('carries draft and archived state without counting a draft', async () => {
    const response = await parentList();
    const draft = response.body.items.find((item: { id: string }) => item.id === draftId);
    const archived = response.body.items.find((item: { id: string }) => item.id === archivedId);

    expect(draft.status).toBe('draft');
    expect(draft.occurrences[0].status).toBe('scheduled');
    expect(draft.summary.attendance).toMatchObject({
      memberSessions: { held: 0, expected: 0, present: 0, rate: null },
      lastHeld: null,
      cancelled: 0,
      upcoming: 0,
    });

    expect(archived.status).toBe('archived');
    expect(archived.occurrences[0].status).toBe('cancelled');
    expect(archived.summary.attendance.cancelled).toBe(1);
  });

  it('requires the parent window and rejects an unknown view', async () => {
    const missing = await request(app).get('/v1/events').query({ view: 'parent' }).set(readHeaders);
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation_error');

    const unknown = await request(app)
      .get('/v1/events')
      .query({ view: 'other', ...WINDOW })
      .set(readHeaders);
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe('validation_error');
  });
});

describe('GET /v1/events/{eventId}?view=parent', () => {
  it('returns the parent detail and its window summary', async () => {
    const response = await parentDetail(seriesEventId);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      id: seriesEventId,
      eventNo: 'EVT-2026-014',
      status: 'active',
    });
    expect(response.body.audienceId).toBe(response.body.audience.id);
    expect(response.body.audience.summary).toContain('ministry CHOIR');
    expect(response.body.recurrence.exceptions).toEqual([]);
    expect(response.body.occurrences).toHaveLength(2);
    expect(response.body.offerings.map((item: { offeringId: string }) => item.offeringId)).toEqual([
      offeringId,
    ]);
    expect(response.body.summary.offerings.attachedCount).toBe(1);
  });

  it('checks the legacy presbyter-only count, which coincides with its audience', async () => {
    // Not the deferral tripwire: a presbyter-only legacy event backfills to
    // allOf(presbyter), so the legacy projection and the audience rule both
    // count the one presbyter. The CHOIR case above is the tripwire.
    const response = await parentDetail(presbyterEventId);
    expect(response.status).toBe(200);
    expect(response.body.occurrences[0].expected).toBe(1);
    expect(response.body.summary.attendance.memberSessions.expected).toBe(1);
  });

  it('rejects an unknown view and a missing window', async () => {
    const unknown = await request(app)
      .get(`/v1/events/${seriesEventId}`)
      .query({ view: 'other', ...WINDOW })
      .set(readHeaders);
    expect(unknown.status).toBe(422);

    const missing = await request(app)
      .get(`/v1/events/${seriesEventId}`)
      .query({ view: 'parent' })
      .set(readHeaders);
    expect(missing.status).toBe(422);
  });
});

describe('GET /v1/series/{id}?view=parent', () => {
  it('serves the same parent detail behind the alias', async () => {
    const viaSeries = await request(app)
      .get(`/v1/series/${seriesId}`)
      .query({ view: 'parent', ...WINDOW })
      .set(readHeaders);
    const viaEvent = await parentDetail(seriesEventId);

    expect(viaSeries.status).toBe(200);
    expect(viaSeries.body).toEqual(viaEvent.body);
  });

  it('rejects an unknown view and a missing window', async () => {
    const unknown = await request(app)
      .get(`/v1/series/${seriesId}`)
      .query({ view: 'other', ...WINDOW })
      .set(readHeaders);
    expect(unknown.status).toBe(422);

    const missing = await request(app)
      .get(`/v1/series/${seriesId}`)
      .query({ view: 'parent' })
      .set(readHeaders);
    expect(missing.status).toBe(422);
  });
});

describe('GET /v1/audiences', () => {
  it('lists the seeded and ministry audiences with their summary', async () => {
    const response = await request(app).get('/v1/audiences').set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const everyone = response.body.items.find(
      (item: { systemKey: string | null }) => item.systemKey === 'everyone',
    );
    expect(everyone).toMatchObject({
      name: 'Everyone',
      system: true,
      active: true,
      rule: {
        operator: 'allOf',
        clauses: [{ attribute: 'membershipStatus', value: 'active' }],
      },
    });
    expect(everyone.summary).toContain('Everyone');

    const choir = response.body.items.find(
      (item: { systemKey: string | null }) => item.systemKey === 'ministry:CHOIR',
    );
    expect(choir).toMatchObject({ name: 'Choir', system: true });
    expect(choir.summary).toContain('ministry CHOIR');
  });

  it('reads one audience by id', async () => {
    const response = await request(app).get(`/v1/audiences/${everyoneId}`).set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: everyoneId,
      name: 'Everyone',
      system: true,
      systemKey: 'everyone',
    });
    expect(response.body.rule.operator).toBe('allOf');
  });

  it('answers 404 for an unknown audience', async () => {
    const response = await request(app)
      .get('/v1/audiences/00000000-0000-4000-8000-000000000000')
      .set(readHeaders);
    expect(response.status).toBe(404);
  });
});

describe('members attendance alias', () => {
  it('accepts eventId as the parent id and keeps seriesId working', async () => {
    const viaEvent = await request(app)
      .get('/v1/members')
      .query({ include: 'attendance', eventId: seriesEventId, limit: 100 })
      .set(readHeaders);
    const viaSeries = await request(app)
      .get('/v1/members')
      .query({ include: 'attendance', seriesId: seriesEventId, limit: 100 })
      .set(readHeaders);

    expect(viaEvent.status).toBe(200);
    expect(viaSeries.status).toBe(200);
    expect(viaEvent.body).toEqual(viaSeries.body);

    const member = viaEvent.body.items.find(
      (item: { memberNo: string }) => item.memberNo === 'PR-1',
    );
    expect(member.attendance).toMatchObject({
      seriesId: seriesEventId,
      attended: 1,
    });
  });

  it('rejects unequal eventId and seriesId and accepts the same parent twice', async () => {
    const conflict = await request(app)
      .get('/v1/members')
      .query({
        include: 'attendance',
        eventId: seriesEventId,
        seriesId: draftId,
        limit: 100,
      })
      .set(readHeaders);
    expect(conflict.status).toBe(422);
    expect(conflict.body.code).toBe('validation_error');
    expect(conflict.body.detail).toContain('eventId:');

    const same = await request(app)
      .get('/v1/members')
      .query({
        include: 'attendance',
        eventId: seriesEventId,
        seriesId: seriesEventId,
        limit: 100,
      })
      .set(readHeaders);
    const seriesOnly = await request(app)
      .get('/v1/members')
      .query({ include: 'attendance', seriesId: seriesEventId, limit: 100 })
      .set(readHeaders);
    expect(same.status).toBe(200);
    expect(same.body).toEqual(seriesOnly.body);
  });

  it('keeps the legacy required-id error on seriesId', async () => {
    const response = await request(app)
      .get('/v1/members')
      .query({ include: 'attendance' })
      .set(readHeaders);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain(
      'seriesId: seriesId is required when include=attendance',
    );
  });
});

describe('parent next occurrence uses the event timezone', () => {
  it('resolves UTC+14 and UTC-11 to their own local next date', async () => {
    const origin = shiftDate(TODAY, -3650);
    const window = { from: shiftDate(TODAY, -1), to: shiftDate(TODAY, 1) };

    const create = (name: string, timezone: string) =>
      request(app)
        .post('/v1/series')
        .set(writeHeaders)
        .send({
          name,
          timezone,
          schedule: { effectiveFrom: origin, rrule: 'FREQ=DAILY' },
        });

    const kiritimati = await create('Kiritimati Daily Service', 'Pacific/Kiritimati');
    const pagoPago = await create('Pago Pago Daily Service', 'Pacific/Pago_Pago');
    expect(kiritimati.status).toBe(201);
    expect(pagoPago.status).toBe(201);

    const response = await request(app)
      .get('/v1/events')
      .query({ view: 'parent', ...window, limit: 100 })
      .set(readHeaders);
    expect(response.status).toBe(200);

    const byId = new Map(
      (
        response.body.items as Array<{ id: string; summary: { nextOccurrence: string | null } }>
      ).map((item) => [item.id, item]),
    );
    const kiritimatiNext = byId.get(kiritimati.body.id)!.summary.nextOccurrence;
    const pagoPagoNext = byId.get(pagoPago.body.id)!.summary.nextOccurrence;

    // The calendar dates are never equal: the zones are 25 hours apart.
    expect(kiritimatiNext).not.toBeNull();
    expect(pagoPagoNext).not.toBeNull();
    expect(kiritimatiNext).not.toBe(pagoPagoNext);
    expect(kiritimatiNext).toBe(todayIn('Pacific/Kiritimati'));
    expect(pagoPagoNext).toBe(todayIn('Pacific/Pago_Pago'));
  });
});

describe('legacy defaults', () => {
  it('keeps the legacy events list shape without view', async () => {
    const response = await request(app).get('/v1/events').query({ limit: 100 }).set(readHeaders);
    expect(response.status).toBe(200);
    const item = response.body.items.find((row: { id: string }) => row.id === seriesEventId);
    expect(item).toHaveProperty('sessions');
    expect(item).not.toHaveProperty('occurrences');
    expect(item).not.toHaveProperty('summary');
    expect(item).not.toHaveProperty('audience');
  });

  it('keeps the legacy event detail shape without view', async () => {
    const response = await request(app).get(`/v1/events/${seriesEventId}`).set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('sessions');
    expect(response.body).not.toHaveProperty('occurrences');
    expect(response.body).not.toHaveProperty('summary');
  });

  it('keeps the legacy series shape without view', async () => {
    const response = await request(app).get(`/v1/series/${seriesId}`).set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('schedules');
    expect(response.body).toHaveProperty('exceptions');
    expect(response.body).not.toHaveProperty('occurrences');
    expect(response.body).not.toHaveProperty('summary');
    expect(response.body).not.toHaveProperty('audience');
  });
});
