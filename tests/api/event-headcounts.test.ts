import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { reachableContacts } from '../helpers/member-fixtures.js';
import { HeadcountRepository } from '../../src/repos/headcounts.js';
import { ValidationError } from '../../src/errors/domain-errors.js';
import type { Db, DbClient, Row } from '../../src/db/sql.js';

let harness: TestApp;
let today: string;
let tomorrow: string;
let memberNo: string;

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

async function createMember(value: string): Promise<void> {
  const response = await request(harness.app).post('/v1/members').set(writeHeaders).send({
    memberNo: value,
    firstName: 'Head',
    lastName: value,
    gender: 'female',
    joinedOn: '2020-01-01',
    contacts: reachableContacts(),
  });
  expect(response.status).toBe(201);
}

async function createEvent(eventNo: string, dates: string[]): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      name: `Headcount ${eventNo}`,
      startTime: '09:00',
      venueType: 'auditorium',
      occurrences: dates.map((date) => ({ date })),
    });
  expect(response.status).toBe(201);
  const id = response.body.id as string;
  await harness.db.query("update events set status = 'active' where id = $1", [id]);
  return id;
}

function record(eventId: string, body: Record<string, unknown>, actor = 'test-admin') {
  return request(harness.app)
    .post(`/v1/events/${eventId}/headcounts`)
    .set({ ...writeHeaders, 'X-Actor-Id': actor })
    .send(body);
}

function read(eventId: string, sessionDate: string, mode?: string) {
  const query: Record<string, string> = { sessionDate };
  if (mode) query.mode = mode;
  return request(harness.app).get(`/v1/events/${eventId}/headcounts`).query(query).set(readHeaders);
}

function adultsLines(adultMale: number, adultFemale: number, children: number) {
  return [
    { code: 'adult-male', count: adultMale },
    { code: 'adult-female', count: adultFemale },
    { code: 'child-unspecified', count: children },
  ];
}

function childrenLines(childMale: number, childFemale: number, adults: number) {
  return [
    { code: 'child-male', count: childMale },
    { code: 'child-female', count: childFemale },
    { code: 'adult-unspecified', count: adults },
  ];
}

let eventSeq = 0;
async function freshEvent(dates: string[] = [today]): Promise<string> {
  eventSeq += 1;
  return createEvent(`HC-${100 + eventSeq}`, dates);
}

interface CapturedStatement {
  text: string;
  params?: readonly unknown[];
}

/** A `Db` that records every statement it sees, including inside transactions. */
function captureStatements(db: Db): { db: Db; statements: CapturedStatement[] } {
  const statements: CapturedStatement[] = [];
  const wrap = (client: DbClient): DbClient => ({
    orm: client.orm,
    query: async <T extends Row = Row>(text: string, params?: readonly unknown[]): Promise<T[]> => {
      statements.push({ text, params });
      return client.query<T>(text, params);
    },
    exec: async (text: string): Promise<void> => {
      statements.push({ text });
      return client.exec(text);
    },
  });
  return {
    db: {
      ...wrap(db),
      transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
        return db.transaction((tx) => fn(wrap(tx)));
      },
      close: () => db.close(),
    },
    statements,
  };
}

beforeAll(async () => {
  harness = await createTestApp();
  today = new Date().toISOString().slice(0, 10);
  tomorrow = shiftDate(today, 1);

  memberNo = 'HC-MEMBER';
  await createMember(memberNo);
});

afterAll(async () => {
  await harness.close();
});

describe('GET /v1/events/{eventId}/headcounts', () => {
  it('returns every live lane as null and no history for a fresh session', async () => {
    const eventId = await freshEvent();
    const response = await read(eventId, today);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      sessionDate: today,
      current: { adults: null, children: null, visitors: null, presbyters: null },
      observations: [],
    });
  });

  it('answers 404 for an unknown event or a session the event does not hold', async () => {
    const unknownEvent = await request(harness.app)
      .get('/v1/events/00000000-0000-4000-8000-000000000000/headcounts')
      .query({ sessionDate: today })
      .set(readHeaders);
    expect(unknownEvent.status).toBe(404);
    expect(unknownEvent.body.code).toBe('not_found');

    const eventId = await freshEvent();
    const unknownSession = await read(eventId, shiftDate(today, 5));
    expect(unknownSession.status).toBe(404);
    expect(unknownSession.body.code).toBe('not_found');
  });

  it('rejects an unknown mode filter', async () => {
    const eventId = await freshEvent();
    const response = await read(eventId, today, 'everyone');
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });
});

describe('POST /v1/events/{eventId}/headcounts', () => {
  it('appends a lane observation with Location, derived total and labelled lines', async () => {
    const eventId = await freshEvent();
    const response = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(20, 30, 40),
      asOf: `${today}T08:00:00.000Z`,
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe(`/v1/events/${eventId}/headcounts/${response.body.id}`);
    expect(response.body).toMatchObject({
      eventId,
      sessionDate: today,
      asOf: `${today}T08:00:00.000Z`,
      mode: 'adults',
      total: 90,
      recordedBy: 'test-admin',
      supersedesId: null,
      supersededBy: null,
      lines: [
        { code: 'adult-male', label: 'Adult men', count: 20 },
        { code: 'adult-female', label: 'Adult women', count: 30 },
        { code: 'child-unspecified', label: 'Children', count: 40 },
      ],
    });
    expect(typeof response.body.recordedAt).toBe('string');
  });

  it('records an all-zero observation with no lines, and it is current', async () => {
    const eventId = await freshEvent();
    const created = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: [],
      asOf: `${today}T07:00:00.000Z`,
    });
    expect(created.status).toBe(201);
    expect(created.body.total).toBe(0);
    expect(created.body.lines).toEqual([]);

    const page = await read(eventId, today);
    expect(page.body.current.adults.id).toBe(created.body.id);
    expect(page.body.current.adults.total).toBe(0);
    expect(page.body.current.adults.lines).toEqual([]);
  });

  it('records adults and children as two live lanes with their own asOf', async () => {
    const eventId = await freshEvent();
    const adults = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(20, 30, 40),
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(adults.status).toBe(201);

    const children = await record(eventId, {
      sessionDate: today,
      mode: 'children',
      lines: childrenLines(5, 6, 7),
      asOf: `${today}T10:00:00.000Z`,
    });
    expect(children.status).toBe(201);

    const page = await read(eventId, today);
    expect(page.body.current.adults.id).toBe(adults.body.id);
    expect(page.body.current.adults.asOf).toBe(`${today}T08:00:00.000Z`);
    expect(page.body.current.adults.recordedBy).toBe('test-admin');
    expect(page.body.current.children.id).toBe(children.body.id);
    expect(page.body.current.children.asOf).toBe(`${today}T10:00:00.000Z`);
    expect(page.body.current.adults.supersededBy).toBeNull();
    expect(page.body.observations.map((row: { asOf: string }) => row.asOf)).toEqual([
      `${today}T10:00:00.000Z`,
      `${today}T08:00:00.000Z`,
    ]);
  });

  it('supersedes only that lane’s tip on a plain new count', async () => {
    const eventId = await freshEvent();
    const first = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(10, 10, 0),
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(first.status).toBe(201);

    const second = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(11, 12, 0),
      asOf: `${today}T09:00:00.000Z`,
    });
    expect(second.status).toBe(201);
    expect(second.body.supersedesId).toBe(first.body.id);
    expect(second.body.asOf).toBe(`${today}T09:00:00.000Z`);

    const page = await read(eventId, today);
    expect(page.body.current.adults.id).toBe(second.body.id);
    const older = page.body.observations.find((row: { id: string }) => row.id === first.body.id);
    expect(older.supersededBy).toBe(second.body.id);
    expect(page.body.observations).toHaveLength(2);

    // A third plain count follows the chain from the current row, not the root.
    const third = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(12, 13, 0),
      asOf: `${today}T10:00:00.000Z`,
    });
    expect(third.status).toBe(201);
    expect(third.body.supersedesId).toBe(second.body.id);
    const afterThird = await read(eventId, today);
    expect(afterThird.body.current.adults.id).toBe(third.body.id);
    expect(afterThird.body.observations).toHaveLength(3);
  });

  it('records the visitors and presbyters lanes with only their own buckets', async () => {
    const eventId = await freshEvent();
    const visitors = await record(eventId, {
      sessionDate: today,
      mode: 'visitors',
      lines: [
        { code: 'visitor-male', count: 3 },
        { code: 'visitor-female', count: 4 },
        { code: 'visitor-children', count: 5 },
      ],
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(visitors.status).toBe(201);
    expect(visitors.body.total).toBe(12);
    expect(visitors.body.lines.map((line: { code: string }) => line.code)).toEqual([
      'visitor-male',
      'visitor-female',
      'visitor-children',
    ]);

    const presbyters = await record(eventId, {
      sessionDate: today,
      mode: 'presbyters',
      lines: [
        { code: 'elder', count: 2 },
        { code: 'deaconess', count: 3 },
        { code: 'deacon', count: 4 },
      ],
      asOf: `${today}T08:30:00.000Z`,
    });
    expect(presbyters.status).toBe(201);
    expect(presbyters.body.total).toBe(9);
    expect(presbyters.body.lines.map((line: { code: string }) => line.code)).toEqual([
      'elder',
      'deaconess',
      'deacon',
    ]);

    const page = await read(eventId, today);
    expect(Object.keys(page.body.current)).toEqual([
      'adults',
      'children',
      'visitors',
      'presbyters',
    ]);
    expect(page.body.current.visitors.id).toBe(visitors.body.id);
    expect(page.body.current.presbyters.id).toBe(presbyters.body.id);
  });

  it('refuses a bucket that is not the mode’s, a duplicate and an unknown bucket', async () => {
    const eventId = await freshEvent();
    const foreignBucket = await record(eventId, {
      sessionDate: today,
      mode: 'visitors',
      lines: [{ code: 'adult-male', count: 1 }],
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(foreignBucket.status).toBe(422);
    expect(foreignBucket.body.code).toBe('validation_error');

    const duplicate = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: [
        { code: 'adult-male', count: 1 },
        { code: 'adult-male', count: 2 },
      ],
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(duplicate.status).toBe(422);

    const unknown = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: [{ code: 'pastor', count: 1 }],
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(unknown.status).toBe(422);
  });

  it('refuses a new mixed count and a bucket over 10,000', async () => {
    const eventId = await freshEvent();
    const mixed = await record(eventId, {
      sessionDate: today,
      mode: 'mixed',
      lines: [
        { code: 'adult-male', count: 1 },
        { code: 'adult-female', count: 1 },
      ],
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(mixed.status).toBe(422);
    expect(mixed.body.code).toBe('validation_error');

    const bucket = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: [{ code: 'adult-male', count: 10_001 }],
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(bucket.status).toBe(422);
  });

  it('rejects an asOf outside the session day in the event timezone', async () => {
    const eventId = await freshEvent();
    const response = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(1, 1, 0),
      asOf: `${shiftDate(today, -1)}T23:30:00.000Z`,
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('answers 404 for an unknown event or session', async () => {
    const unknownEvent = await request(harness.app)
      .post('/v1/events/00000000-0000-4000-8000-000000000000/headcounts')
      .set(writeHeaders)
      .send({ sessionDate: today, mode: 'adults', lines: [] });
    expect(unknownEvent.status).toBe(404);

    const eventId = await freshEvent();
    const unknownSession = await record(eventId, {
      sessionDate: shiftDate(today, 5),
      mode: 'adults',
      lines: adultsLines(1, 1, 0),
    });
    expect(unknownSession.status).toBe(404);
  });

  it('closes the session for every lane when an observation ends it', async () => {
    const eventId = await freshEvent();
    const ended = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(2, 3, 0),
      ended: true,
    });
    expect(ended.status).toBe(201);
    expect(ended.body.ended).toBe(true);

    const blocked = await record(eventId, {
      sessionDate: today,
      mode: 'children',
      lines: childrenLines(1, 1, 0),
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('session_closed');

    const page = await read(eventId, today);
    expect(page.body.current.adults.id).toBe(ended.body.id);
    expect(page.body.current.children).toBeNull();
  });
});

describe('headcount corrections', () => {
  it('supersedes the current observation of its own lane, keeps its asOf and leaves the other lane alone', async () => {
    const eventId = await freshEvent();
    const adults = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(40, 50, 60),
      asOf: `${today}T12:00:00.000Z`,
    });
    const children = await record(eventId, {
      sessionDate: today,
      mode: 'children',
      lines: childrenLines(1, 2, 3),
      asOf: `${today}T12:30:00.000Z`,
    });

    const corrected = await record(
      eventId,
      {
        sessionDate: today,
        mode: 'adults',
        lines: adultsLines(4, 5, 6),
        supersedesId: adults.body.id,
      },
      'correcting-presbyter',
    );
    expect(corrected.status).toBe(201);
    expect(corrected.body).toMatchObject({
      asOf: `${today}T12:00:00.000Z`,
      mode: 'adults',
      total: 15,
      recordedBy: 'correcting-presbyter',
      supersedesId: adults.body.id,
      supersededBy: null,
    });

    const page = await read(eventId, today);
    expect(page.body.current.adults.id).toBe(corrected.body.id);
    expect(page.body.current.children.id).toBe(children.body.id);
    expect(page.body.current.children.asOf).toBe(`${today}T12:30:00.000Z`);
    const target = page.body.observations.find((row: { id: string }) => row.id === adults.body.id);
    expect(target.supersededBy).toBe(corrected.body.id);
    expect(target.total).toBe(150);

    // A second supersede of the same row is refused; the chain continues only
    // from the current row.
    const again = await record(
      eventId,
      {
        sessionDate: today,
        mode: 'adults',
        lines: adultsLines(1, 1, 0),
        supersedesId: adults.body.id,
      },
      'third-presbyter',
    );
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('validation_error');

    // A correction of the correction follows the lane's current row.
    const correctedAgain = await record(
      eventId,
      {
        sessionDate: today,
        mode: 'adults',
        lines: adultsLines(2, 3, 4),
        supersedesId: corrected.body.id,
      },
      'final-presbyter',
    );
    expect(correctedAgain.status).toBe(201);
    expect(correctedAgain.body.asOf).toBe(`${today}T12:00:00.000Z`);
    expect(correctedAgain.body.supersedesId).toBe(corrected.body.id);
    const finalPage = await read(eventId, today);
    expect(finalPage.body.current.adults.id).toBe(correctedAgain.body.id);
    expect(finalPage.body.current.children.id).toBe(children.body.id);
  });

  it('moves a correction into another lane only while that lane has no current observation', async () => {
    const eventId = await freshEvent();
    const adults = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(7, 8, 0),
      asOf: `${today}T10:00:00.000Z`,
    });
    expect(adults.status).toBe(201);

    const moved = await record(
      eventId,
      {
        sessionDate: today,
        mode: 'children',
        lines: childrenLines(5, 6, 7),
        supersedesId: adults.body.id,
      },
      'mode-mover',
    );
    expect(moved.status).toBe(201);
    expect(moved.body.mode).toBe('children');
    expect(moved.body.asOf).toBe(`${today}T10:00:00.000Z`);
    expect(moved.body.supersedesId).toBe(adults.body.id);

    const page = await read(eventId, today);
    // The destination becomes current; the source lane reads not recorded.
    expect(page.body.current.children.id).toBe(moved.body.id);
    expect(page.body.current.adults).toBeNull();
    const source = page.body.observations.find((row: { id: string }) => row.id === adults.body.id);
    expect(source.supersededBy).toBe(moved.body.id);

    // The destination lane already holds a current observation, so a second
    // move into it is refused with an error naming that lane and writes nothing.
    const blockedEventId = await freshEvent();
    const children = await record(blockedEventId, {
      sessionDate: today,
      mode: 'children',
      lines: childrenLines(1, 2, 0),
      asOf: `${today}T09:00:00.000Z`,
    });
    const adultTip = await record(blockedEventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(1, 2, 0),
      asOf: `${today}T10:00:00.000Z`,
    });
    expect(children.status).toBe(201);
    expect(adultTip.status).toBe(201);

    const blocked = await record(blockedEventId, {
      sessionDate: today,
      mode: 'children',
      lines: childrenLines(1, 2, 0),
      supersedesId: adultTip.body.id,
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('validation_error');
    expect(String(blocked.body.detail)).toContain('children');

    const after = await read(blockedEventId, today);
    expect(after.body.observations).toHaveLength(2);
    expect(after.body.current.children.id).toBe(children.body.id);
    expect(after.body.current.adults.id).toBe(adultTip.body.id);
  });

  it('records a plain new count into a lane a mode-moving correction vacated', async () => {
    const eventId = await freshEvent();
    const adults = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(7, 8, 0),
      asOf: `${today}T09:00:00.000Z`,
    });
    expect(adults.status).toBe(201);

    // The children lane is empty, so the correction is accepted and the adults
    // lane reads not recorded afterwards.
    const moved = await record(
      eventId,
      {
        sessionDate: today,
        mode: 'children',
        lines: childrenLines(5, 6, 7),
        supersedesId: adults.body.id,
      },
      'mode-mover',
    );
    expect(moved.status).toBe(201);
    const vacated = await read(eventId, today);
    expect(vacated.body.current.adults).toBeNull();

    // The vacated adults row keeps a null supersedes_id, so a lane-wide unique
    // index on that column would refuse this count; the tip query does not.
    const again = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(9, 10, 0),
      asOf: `${today}T11:00:00.000Z`,
    });
    expect(again.status).toBe(201);
    expect(again.body.supersedesId).toBeNull();

    const page = await read(eventId, today);
    expect(page.body.current.adults.id).toBe(again.body.id);
    expect(page.body.current.adults.total).toBe(19);
    expect(page.body.current.children.id).toBe(moved.body.id);
  });

  it('refuses a supersedesId from another session or an unknown row', async () => {
    const eventId = await freshEvent([today, tomorrow]);
    const current = await record(eventId, {
      sessionDate: tomorrow,
      mode: 'adults',
      lines: adultsLines(2, 3, 0),
      asOf: `${tomorrow}T09:00:00.000Z`,
    });
    expect(current.status).toBe(201);

    const otherSession = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(1, 1, 0),
      supersedesId: current.body.id,
    });
    expect(otherSession.status).toBe(422);

    const unknown = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(1, 1, 0),
      supersedesId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.status).toBe(422);
  });

  it('refuses a headcount, including a correction, for a session dated before today', async () => {
    const yesterday = shiftDate(today, -1);
    const pastEventId = await freshEvent([yesterday]);

    // The observation is historical: seed it directly, because the API no longer
    // accepts a headcount for a session dated before today (AC-33a).
    const [seeded] = await harness.db.query<{ id: string }>(
      `insert into event_session_headcounts (
         occurrence_id, session_date, as_of, mode, total, ended, recorded_by
       )
       values (
         (select id from event_occurrences where event_id = $1 and date = $2),
         $2,$3,'adults',15,false,'seed'
       )
       returning id`,
      [pastEventId, yesterday, `${yesterday}T10:00:00.000Z`],
    );
    await harness.db.query(
      `insert into headcount_lines (headcount_id, mode_code, bucket_code, count)
       values ($1,'adults','adult-male',7), ($1,'adults','adult-female',8)`,
      [seeded!.id],
    );

    const original = await record(pastEventId, {
      sessionDate: yesterday,
      mode: 'adults',
      lines: adultsLines(7, 8, 0),
      asOf: `${yesterday}T10:00:00.000Z`,
    });
    expect(original.status).toBe(422);
    expect(original.body.code).toBe('validation_error');

    const corrected = await record(
      pastEventId,
      {
        sessionDate: yesterday,
        mode: 'adults',
        lines: adultsLines(7, 9, 0),
        supersedesId: seeded!.id,
      },
      'late-corrector',
    );
    expect(corrected.status).toBe(422);
    expect(corrected.body.code).toBe('validation_error');

    const [stored] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count
         from event_session_headcounts h
         join event_occurrences o on o.id = h.occurrence_id
        where o.event_id = $1 and o.date = $2`,
      [pastEventId, yesterday],
    );
    expect(Number(stored!.count)).toBe(1);

    const readBack = await request(harness.app)
      .get(`/v1/events/${pastEventId}/headcounts/${seeded!.id}`)
      .set(readHeaders);
    expect(readBack.status).toBe(200);
    expect(readBack.body.supersededBy).toBeNull();
    expect(readBack.body.lines).toHaveLength(2);
    // A row written before the capture model reads as not ended.
    expect(readBack.body.ended).toBe(false);
  });

  it('answers session_closed when a late import already closed the past session', async () => {
    const sessionDate = shiftDate(today, -3);
    const closedEventId = await freshEvent([sessionDate]);
    await harness.db.query(
      `insert into event_recurrence_versions (event_id, effective_from, rrule, ends_on, created_by)
       values ($1,$2,'FREQ=DAILY',$2,'seed')`,
      [closedEventId, sessionDate],
    );

    const closed = await request(harness.app)
      .post('/v1/imports/attendance')
      .set(writeHeaders)
      .send({ eventId: closedEventId, sessionDate, rows: [{ memberNo }] });
    expect(closed.status).toBe(201);

    const response = await record(closedEventId, {
      sessionDate,
      asOf: `${sessionDate}T10:00:00.000Z`,
      mode: 'adults',
      lines: adultsLines(1, 1, 0),
    });

    // The close is terminal: it is reported before the calendar-day rule.
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('session_closed');

    const [stored] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count
         from event_session_headcounts h
         join event_occurrences o on o.id = h.occurrence_id
        where o.event_id = $1 and o.date = $2`,
      [closedEventId, sessionDate],
    );
    expect(Number(stored!.count)).toBe(0);
  });
});

describe('lane filters and legacy rows', () => {
  it('limits observations to one lane and returns that lane alone in current', async () => {
    const eventId = await freshEvent();
    const adults = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(4, 5, 0),
      asOf: `${today}T08:00:00.000Z`,
    });
    const children = await record(eventId, {
      sessionDate: today,
      mode: 'children',
      lines: childrenLines(1, 2, 3),
      asOf: `${today}T09:00:00.000Z`,
    });
    expect(adults.status).toBe(201);
    expect(children.status).toBe(201);

    const page = await read(eventId, today, 'children');
    expect(Object.keys(page.body.current)).toEqual(['children']);
    expect(page.body.current.children.id).toBe(children.body.id);
    expect(page.body.observations.map((row: { id: string }) => row.id)).toEqual([children.body.id]);
  });

  it('keeps a migrated mixed observation readable without a stale adults current', async () => {
    const eventId = await freshEvent();

    // A legacy chain: an adults row that a mixed observation superseded. The
    // reshape keeps both rows and does not rewrite the chain (HC-19..HC-21).
    const [adults] = await harness.db.query<{ id: string }>(
      `insert into event_session_headcounts (
         occurrence_id, session_date, as_of, mode, total, ended, recorded_by
       )
       values (
         (select id from event_occurrences where event_id = $1 and date = $2),
         $2,$3,'adults',12,false,'legacy'
       )
       returning id`,
      [eventId, today, `${today}T07:00:00.000Z`],
    );
    await harness.db.query(
      `insert into headcount_lines (headcount_id, mode_code, bucket_code, count)
       values ($1,'adults','adult-male',5), ($1,'adults','adult-female',7)`,
      [adults!.id],
    );
    const [mixed] = await harness.db.query<{ id: string }>(
      `insert into event_session_headcounts (
         occurrence_id, session_date, as_of, mode, total, ended, recorded_by, supersedes_id
       )
       values (
         (select id from event_occurrences where event_id = $1 and date = $2),
         $2,$3,'mixed',18,false,'legacy',$4
       )
       returning id`,
      [eventId, today, `${today}T08:00:00.000Z`, adults!.id],
    );
    await harness.db.query(
      `insert into headcount_lines (headcount_id, mode_code, bucket_code, count)
       values ($1,'mixed','adult-male',3), ($1,'mixed','adult-female',4),
              ($1,'mixed','child-male',5), ($1,'mixed','child-female',6)`,
      [mixed!.id],
    );

    const page = await read(eventId, today);
    expect(page.body.current.adults).toBeNull();
    expect(page.body.current.mixed.id).toBe(mixed!.id);
    expect(page.body.current.mixed.total).toBe(18);
    expect(page.body.current.mixed.lines).toEqual([
      { code: 'adult-male', label: 'Adult men', count: 3 },
      { code: 'adult-female', label: 'Adult women', count: 4 },
      { code: 'child-male', label: 'Boys', count: 5 },
      { code: 'child-female', label: 'Girls', count: 6 },
    ]);
    const superseded = page.body.observations.find((row: { id: string }) => row.id === adults!.id);
    expect(superseded.supersededBy).toBe(mixed!.id);

    const refused = await record(eventId, {
      sessionDate: today,
      mode: 'mixed',
      lines: [{ code: 'adult-male', count: 1 }],
    });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
  });
});

describe('GET /v1/events/{eventId}/headcounts/{headcountId}', () => {
  it('reads back a created observation and a correction with their lines', async () => {
    const eventId = await freshEvent();
    const created = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(4, 6, 0),
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(created.status).toBe(201);

    const location = created.headers.location as string;
    expect(location).toBe(`/v1/events/${eventId}/headcounts/${created.body.id}`);

    const readBack = await request(harness.app).get(location).set(readHeaders);
    expect(readBack.status).toBe(200);
    expect(readBack.headers['cache-control']).toBe('no-store');
    expect(readBack.body).toMatchObject({
      id: created.body.id,
      total: 10,
      supersedesId: null,
      supersededBy: null,
    });
    expect(readBack.body.lines).toEqual([
      { code: 'adult-male', label: 'Adult men', count: 4 },
      { code: 'adult-female', label: 'Adult women', count: 6 },
    ]);

    const corrected = await record(
      eventId,
      {
        sessionDate: today,
        mode: 'adults',
        lines: adultsLines(5, 6, 0),
        supersedesId: created.body.id,
      },
      'lookup-corrector',
    );
    expect(corrected.status).toBe(201);
    expect(corrected.body.asOf).toBe(`${today}T08:00:00.000Z`);

    const correctedBack = await request(harness.app)
      .get(`/v1/events/${eventId}/headcounts/${corrected.body.id}`)
      .set(readHeaders);
    expect(correctedBack.status).toBe(200);
    expect(correctedBack.body).toMatchObject({
      id: corrected.body.id,
      asOf: `${today}T08:00:00.000Z`,
      total: 11,
      recordedBy: 'lookup-corrector',
      supersedesId: created.body.id,
      supersededBy: null,
    });

    const originalBack = await request(harness.app)
      .get(`/v1/events/${eventId}/headcounts/${created.body.id}`)
      .set(readHeaders);
    expect(originalBack.status).toBe(200);
    expect(originalBack.body.supersededBy).toBe(corrected.body.id);
  });

  it("answers 404 for an unknown id and for another event's observation", async () => {
    const eventId = await freshEvent();
    const otherEventId = await freshEvent();
    const created = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(1, 1, 0),
      asOf: `${today}T09:00:00.000Z`,
    });
    expect(created.status).toBe(201);

    const unknown = await request(harness.app)
      .get(`/v1/events/${eventId}/headcounts/00000000-0000-4000-8000-000000000000`)
      .set(readHeaders);
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('not_found');

    const wrongEvent = await request(harness.app)
      .get(`/v1/events/${otherEventId}/headcounts/${created.body.id}`)
      .set(readHeaders);
    expect(wrongEvent.status).toBe(404);
    expect(wrongEvent.body.code).toBe('not_found');
  });
});

describe('the session capture time', () => {
  it('uses the later asOf across two lanes and names each lane’s count', async () => {
    const eventId = await freshEvent();
    const adults = await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(10, 12, 0),
      asOf: `${today}T08:00:00.000Z`,
    });
    const children = await record(eventId, {
      sessionDate: today,
      mode: 'children',
      lines: childrenLines(5, 6, 0),
      asOf: `${today}T10:00:00.000Z`,
    });
    expect(adults.status).toBe(201);
    expect(children.status).toBe(201);

    const detail = await request(harness.app).get(`/v1/events/${eventId}`).set(readHeaders);
    expect(detail.status).toBe(200);
    expect(detail.body.sessions[0].capture).toEqual({
      asOf: `${today}T10:00:00.000Z`,
      ended: false,
    });
  });
});

describe('headcount visibility', () => {
  it('is operator-only and never appears in a member DTO, profile, summary or event', async () => {
    const eventId = await freshEvent();
    await record(eventId, {
      sessionDate: today,
      mode: 'adults',
      lines: adultsLines(4, 6, 0),
      asOf: `${today}T08:00:00.000Z`,
    });

    const profile = await request(harness.app)
      .get(`/v1/members/${memberNo}/profile`)
      .set(readHeaders);
    expect(profile.status).toBe(200);
    expect(JSON.stringify(profile.body)).not.toContain('adult-male');
    expect(JSON.stringify(profile.body)).not.toContain('headcount');

    const summary = await request(harness.app)
      .get(`/v1/members/${memberNo}/attendance/summary`)
      .query({ from: shiftDate(today, -1), to: tomorrow })
      .set(readHeaders);
    expect(summary.status).toBe(200);
    expect(JSON.stringify(summary.body)).not.toContain('adult-male');
    expect(JSON.stringify(summary.body)).not.toContain('headcount');

    const detail = await request(harness.app).get(`/v1/events/${eventId}`).set(readHeaders);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain('adult-male');
    expect(JSON.stringify(detail.body)).not.toContain('headcount');
  });
});

describe('headcount lane locking (HC-2)', () => {
  it('never leaves two current observations when two first counts race into an empty lane', async () => {
    const eventId = await freshEvent();
    const bodies = [adultsLines(3, 4, 5), adultsLines(6, 7, 8)].map((lines) => ({
      sessionDate: today,
      mode: 'adults',
      lines,
      asOf: `${today}T08:00:00.000Z`,
    }));

    const responses = await Promise.all([record(eventId, bodies[0]!), record(eventId, bodies[1]!)]);

    // Exactly one accepted write may be a root. The other either supersedes it
    // or is refused; two roots in one lane is the race this forbids (AC-H11).
    const accepted = responses.filter((response) => response.status === 201);
    expect(responses.every((response) => [201, 409, 422].includes(response.status))).toBe(true);
    expect(accepted.length).toBeGreaterThanOrEqual(1);
    expect(accepted.filter((response) => response.body.supersedesId === null)).toHaveLength(1);

    const rows = await harness.db.query<{ supersedes_id: string | null }>(
      `select h.supersedes_id
         from event_session_headcounts h
         join event_occurrences o on o.id = h.occurrence_id
        where o.event_id = $1 and o.date = $2 and h.mode = 'adults'`,
      [eventId, today],
    );
    expect(rows.filter((row) => row.supersedes_id === null)).toHaveLength(1);
    expect(rows).toHaveLength(accepted.length);
  });

  it('takes the lane advisory lock before resolving the tip, even in an empty lane', async () => {
    // PGlite runs every statement under one connection mutex, so two real
    // writers cannot overlap here; the mechanism that makes the race safe is
    // asserted directly instead of a race test that would pass either way.
    const eventId = await freshEvent();
    const captured = captureStatements(harness.db);
    const repo = new HeadcountRepository(captured.db);

    await repo.record(
      eventId,
      {
        sessionDate: today,
        mode: 'visitors',
        lines: [{ code: 'visitor-male', count: 2 }],
        asOf: `${today}T08:00:00.000Z`,
      },
      'test-admin',
    );

    const lock = captured.statements.findIndex((statement) =>
      statement.text.includes('pg_advisory_xact_lock'),
    );
    const tip = captured.statements.findIndex((statement) => statement.text.includes('not exists'));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(tip).toBeGreaterThan(lock);
    expect(captured.statements[lock]!.params).toEqual([eventId, today, 'visitors']);
  });

  it('locks both lanes of a mode-moving correction in a stable order', async () => {
    const eventId = await freshEvent();
    const seeded = await record(eventId, {
      sessionDate: today,
      mode: 'visitors',
      lines: [{ code: 'visitor-male', count: 2 }],
      asOf: `${today}T08:00:00.000Z`,
    });
    expect(seeded.status).toBe(201);

    const captured = captureStatements(harness.db);
    const repo = new HeadcountRepository(captured.db);
    // The destination is `adults` and the source is `visitors`; sorted order
    // holds whichever way the move runs, so two movers cannot deadlock.
    await repo.record(
      eventId,
      {
        sessionDate: today,
        mode: 'adults',
        lines: [{ code: 'adult-male', count: 1 }],
        supersedesId: seeded.body.id as string,
      },
      'test-admin',
    );

    const lanes = captured.statements
      .filter((statement) => statement.text.includes('pg_advisory_xact_lock'))
      .map((statement) => statement.params?.[2]);
    expect(lanes).toEqual(['adults', 'visitors']);
  });
});

describe('headcount total guard (HC-5)', () => {
  const extraBucket = `insert into headcount_buckets (mode_code, code, label, sort_order)
     values ('visitors', 'visitor-other', 'Visitor other', 4)
     on conflict (mode_code, code) do nothing`;
  const dropExtraBucket = `delete from headcount_buckets
     where mode_code = 'visitors' and code = 'visitor-other'`;

  it('answers 422 for a posted total over 30,000', async () => {
    const eventId = await freshEvent();
    await harness.db.query(extraBucket);
    try {
      const response = await record(eventId, {
        sessionDate: today,
        mode: 'visitors',
        lines: [
          { code: 'visitor-male', count: 10_000 },
          { code: 'visitor-female', count: 10_000 },
          { code: 'visitor-children', count: 10_000 },
          { code: 'visitor-other', count: 1 },
        ],
        asOf: `${today}T08:00:00.000Z`,
      });
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('validation_error');
    } finally {
      await harness.db.query(dropExtraBucket);
    }
  });

  it('guards the total at the repository when the wire schema is bypassed', async () => {
    const eventId = await freshEvent();
    await harness.db.query(extraBucket);
    try {
      const repo = new HeadcountRepository(harness.db);
      await expect(
        repo.record(
          eventId,
          {
            sessionDate: today,
            mode: 'visitors',
            lines: [
              { code: 'visitor-male', count: 10_000 },
              { code: 'visitor-female', count: 10_000 },
              { code: 'visitor-children', count: 10_000 },
              { code: 'visitor-other', count: 1 },
            ],
          },
          'test-admin',
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    } finally {
      await harness.db.query(dropExtraBucket);
    }
  });
});
