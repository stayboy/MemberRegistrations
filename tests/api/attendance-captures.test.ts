import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

/**
 * Attendance is a capture model (AC-32, AC-33, AC-33a): the server stamps
 * `asOf`, live is computed from the session date and window, one close per
 * (event, session) is shared across channels, and the event session DTO carries
 * the derived `capture`.
 *
 * Fixtures are inserted directly so a test can choose a session window that is
 * live or outside the live window whatever the wall clock says: a session dated
 * today with no end time is live for its whole date, and every other date is
 * outside the window.
 */
let harness: TestApp;
let app: TestApp['app'];
let eventSeq = 0;

/** A UTC calendar date `offset` days from today. */
function day(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createMember(memberNo: string): Promise<void> {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Capture',
      lastName: memberNo,
      gender: 'female',
      joinedOn: day(-90),
    });
  expect(response.status).toBe(201);
}

interface SeedSession {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  status?: 'scheduled' | 'held' | 'cancelled';
}

/** A series row, so the event is series-backed and an import is allowed. */
async function createSeries(name: string): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_series (name, timezone, created_by, updated_by)
     values ($1,'UTC','seed','seed')
     returning id`,
    [name],
  );
  return row!.id;
}

/** A series-backed event, inserted directly so the session window is exact. */
async function insertEvent(options: {
  sessions: SeedSession[];
  timezone?: string;
  status?: string;
  startTime?: string;
  endTime?: string | null;
  /** Reuse a series that already has a schedule, so its occurrences resolve. */
  seriesId?: string;
}): Promise<string> {
  eventSeq += 1;
  const startTime = options.startTime ?? '00:00';
  const endTime = options.endTime ?? null;
  const sessions = options.sessions.map((session) => ({
    date: session.date,
    startTime: session.startTime === undefined ? startTime : session.startTime,
    endTime: session.endTime === undefined ? endTime : session.endTime,
    status: session.status ?? 'scheduled',
  }));
  const seriesId = options.seriesId ?? (await createSeries(`Capture Series ${eventSeq}`));

  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, status, source, sessions
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,'auditorium',$9,'series',$10::jsonb)
     returning id`,
    [
      `CAP-${eventSeq}`,
      seriesId,
      `Capture event ${eventSeq}`,
      options.timezone ?? 'UTC',
      sessions[0]!.date,
      sessions[sessions.length - 1]!.date,
      startTime,
      endTime,
      options.status ?? 'scheduled',
      JSON.stringify(sessions),
    ],
  );
  return row!.id;
}

/** A session dated today with no end time is live for its whole date. */
function liveEvent(extra: { timezone?: string } = {}): Promise<string> {
  return insertEvent({
    sessions: [{ date: day(0), startTime: '00:00', endTime: null }],
    ...extra,
  });
}

function captureAttendance(body: {
  eventId: string;
  sessionDate: string;
  rows?: Array<{ memberNo: string; datetime?: string }>;
  ended?: boolean;
}) {
  return request(app).post('/v1/imports/attendance').set(writeHeaders).send(body);
}

function addManual(eventId: string, memberNo: string, date: string) {
  return request(app).post(`/v1/events/${eventId}/attendance`).set(writeHeaders).send({
    memberNo,
    date,
  });
}

function recordHeadcount(eventId: string, body: Record<string, unknown>) {
  return request(app).post(`/v1/events/${eventId}/headcounts`).set(writeHeaders).send(body);
}

function readEvent(id: string) {
  return request(app).get(`/v1/events/${id}`).set(readHeaders);
}

async function attendanceRows(
  eventId: string,
  sessionDate: string,
): Promise<Array<{ memberNo: string; source: string }>> {
  const rows = await harness.db.query<{ member_no: string; source: string }>(
    `select m.member_no, a.source
       from attendance a
       join members m on m.id = a.member_id
      where a.event_instance_id = $1 and a.session_date = $2
      order by m.member_no`,
    [eventId, sessionDate],
  );
  return rows.map((row) => ({ memberNo: row.member_no, source: row.source }));
}

async function batchRows(
  eventId: string,
  sessionDate: string,
): Promise<Array<{ id: string; checksum: string; asOf: string; ended: boolean }>> {
  const rows = await harness.db.query<{
    id: string;
    checksum: string;
    as_of: Date | string;
    ended: boolean;
  }>(
    `select id, checksum, as_of, ended
       from import_batches
      where kind = 'attendance' and event_instance_id = $1 and session_date = $2
      order by created_at`,
    [eventId, sessionDate],
  );
  return rows.map((row) => ({
    id: row.id,
    checksum: row.checksum,
    asOf: row.as_of instanceof Date ? row.as_of.toISOString() : String(row.as_of),
    ended: row.ended,
  }));
}

async function headcountCount(eventId: string, sessionDate: string): Promise<number> {
  const [row] = await harness.db.query<{ count: number | string }>(
    `select count(*)::int as count from event_session_headcounts
      where event_instance_id = $1 and session_date = $2`,
    [eventId, sessionDate],
  );
  return Number(row!.count);
}

/** An attendance batch as a historical capture, for the derived DTO. */
async function seedBatch(options: {
  eventId: string;
  sessionDate: string;
  asOf: string;
  createdAt: string;
  ended?: boolean;
}): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into import_batches (
       kind, actor, row_count, checksum, event_instance_id, session_date,
       as_of, ended, created_at
     )
     values ('attendance','seed',1,$1,$2,$3,$4,$5,$6)
     returning id`,
    [
      `seed-${options.eventId}-${options.sessionDate}-${options.asOf}`,
      options.eventId,
      options.sessionDate,
      options.asOf,
      options.ended ?? false,
      options.createdAt,
    ],
  );
  return row!.id;
}

/** A headcount observation as a historical capture, for the derived DTO. */
async function seedHeadcount(options: {
  eventId: string;
  sessionDate: string;
  asOf: string;
  recordedAt: string;
  ended?: boolean;
  supersedesId?: string | null;
}): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_session_headcounts (
       event_instance_id, session_date, as_of, mode,
       adult_male, adult_female, adult_unspecified,
       child_male, child_female, child_unspecified,
       total, ended, recorded_by, recorded_at, supersedes_id
     )
     values ($1,$2,$3,'adults',10,0,0,0,0,0,10,$4,'seed',$5,$6)
     returning id`,
    [
      options.eventId,
      options.sessionDate,
      options.asOf,
      options.ended ?? false,
      options.recordedAt,
      options.supersedesId ?? null,
    ],
  );
  return row!.id;
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  for (const memberNo of ['CAP-A', 'CAP-B', 'CAP-C', 'CAP-D']) {
    await createMember(memberNo);
  }
});

afterAll(async () => {
  await harness.close();
});

describe('live captures', () => {
  it('accepts a repeat live capture, replaces its imported rows and keeps manual rows', async () => {
    const eventId = await liveEvent();

    const manual = await addManual(eventId, 'CAP-A', day(0));
    expect(manual.status).toBe(201);
    expect(manual.body.source).toBe('manual');

    const before = Date.now();
    const first = await captureAttendance({
      eventId,
      sessionDate: day(0),
      rows: [{ memberNo: 'CAP-B' }, { memberNo: 'CAP-C' }],
    });
    const after = Date.now();

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ rowCount: 2, written: 2, skipped: 0 });

    const [firstBatch] = await batchRows(eventId, day(0));
    expect(firstBatch!.ended).toBe(false);
    // The server stamps `asOf` with the clock; it is never supplied by the caller.
    const stamped = new Date(firstBatch!.asOf).getTime();
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before - 1_000);
    expect(stamped).toBeLessThanOrEqual(after + 1_000);

    const second = await captureAttendance({
      eventId,
      sessionDate: day(0),
      rows: [{ memberNo: 'CAP-C' }, { memberNo: 'CAP-D' }],
    });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ written: 2, skipped: 0 });
    expect(second.body.id).not.toBe(first.body.id);

    // The second capture replaced CAP-B with CAP-D; the manual row survived.
    expect(await attendanceRows(eventId, day(0))).toEqual([
      { memberNo: 'CAP-A', source: 'manual' },
      { memberNo: 'CAP-C', source: 'import' },
      { memberNo: 'CAP-D', source: 'import' },
    ]);

    const batches = await batchRows(eventId, day(0));
    expect(batches).toHaveLength(2);
    expect(batches.map((batch) => batch.ended)).toEqual([false, false]);
  });

  it('accepts the same rows again as a new observation, not a duplicate-batch conflict', async () => {
    const eventId = await liveEvent();
    const body = {
      eventId,
      sessionDate: day(0),
      rows: [{ memberNo: 'CAP-A' }, { memberNo: 'CAP-B' }],
    };

    const first = await captureAttendance(body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ written: 2, skipped: 0 });

    const second = await captureAttendance(body);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body).toMatchObject({ rowCount: 2, written: 2, skipped: 0 });

    const batches = await batchRows(eventId, day(0));
    expect(batches).toHaveLength(2);
    // The checksum still audits the capture; it no longer refuses the repeat.
    expect(batches[0]!.checksum).toBe(batches[1]!.checksum);

    expect(await attendanceRows(eventId, day(0))).toEqual([
      { memberNo: 'CAP-A', source: 'import' },
      { memberNo: 'CAP-B', source: 'import' },
    ]);
  });
});

describe('the session close', () => {
  it('closes on an ended capture; a further import, headcount and manual write all answer session_closed', async () => {
    const eventId = await liveEvent();

    const ended = await captureAttendance({
      eventId,
      sessionDate: day(0),
      rows: [{ memberNo: 'CAP-A' }],
      ended: true,
    });
    expect(ended.status).toBe(201);
    expect((await batchRows(eventId, day(0))).map((batch) => batch.ended)).toEqual([true]);

    const afterImport = await captureAttendance({
      eventId,
      sessionDate: day(0),
      rows: [{ memberNo: 'CAP-B' }],
    });
    expect(afterImport.status).toBe(409);
    expect(afterImport.headers['content-type']).toContain('application/problem+json');
    expect(afterImport.body.code).toBe('session_closed');
    expect(await batchRows(eventId, day(0))).toHaveLength(1);

    const afterHeadcount = await recordHeadcount(eventId, {
      sessionDate: day(0),
      asOf: `${day(0)}T09:00:00.000Z`,
      mode: 'adults',
      adultMale: 12,
      adultFemale: 8,
    });
    expect(afterHeadcount.status).toBe(409);
    expect(afterHeadcount.body.code).toBe('session_closed');
    expect(await headcountCount(eventId, day(0))).toBe(0);

    const afterManual = await addManual(eventId, 'CAP-B', day(0));
    expect(afterManual.status).toBe(409);
    expect(afterManual.body.code).toBe('session_closed');
    expect(await attendanceRows(eventId, day(0))).toEqual([
      { memberNo: 'CAP-A', source: 'import' },
    ]);
  });

  it('treats an import outside the live window with no ended as the end capture', async () => {
    const sessionDate = day(-3);
    const eventId = await insertEvent({
      sessions: [{ date: sessionDate, startTime: '09:00', endTime: '10:00' }],
    });

    const capture = await captureAttendance({
      eventId,
      sessionDate,
      rows: [{ memberNo: 'CAP-A' }],
    });
    expect(capture.status).toBe(201);

    const batches = await batchRows(eventId, sessionDate);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.ended).toBe(true);

    const afterClose = await captureAttendance({
      eventId,
      sessionDate,
      rows: [{ memberNo: 'CAP-B' }],
    });
    expect(afterClose.status).toBe(409);
    expect(afterClose.body.code).toBe('session_closed');
    expect(await batchRows(eventId, sessionDate)).toHaveLength(1);
    expect(await attendanceRows(eventId, sessionDate)).toEqual([
      { memberNo: 'CAP-A', source: 'import' },
    ]);
  });

  it('shares the close across channels: a headcount ending the session refuses a later import', async () => {
    const eventId = await liveEvent();

    const ended = await recordHeadcount(eventId, {
      sessionDate: day(0),
      asOf: `${day(0)}T08:00:00.000Z`,
      mode: 'adults',
      adultMale: 20,
      adultFemale: 15,
      childUnspecified: 5,
      ended: true,
    });
    expect(ended.status).toBe(201);
    expect(ended.body.ended).toBe(true);

    const afterClose = await captureAttendance({
      eventId,
      sessionDate: day(0),
      rows: [{ memberNo: 'CAP-A' }],
    });
    expect(afterClose.status).toBe(409);
    expect(afterClose.body.code).toBe('session_closed');
    expect(await batchRows(eventId, day(0))).toHaveLength(0);

    const second = await recordHeadcount(eventId, {
      sessionDate: day(0),
      asOf: `${day(0)}T09:00:00.000Z`,
      mode: 'adults',
      adultMale: 1,
      adultFemale: 1,
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('session_closed');
    expect(await headcountCount(eventId, day(0))).toBe(1);
  });
});

describe('per-member writes', () => {
  it('refuses a session not dated today even with no close, and accepts one dated today', async () => {
    const sessionDate = day(-2);
    const pastEventId = await insertEvent({
      sessions: [{ date: sessionDate, startTime: '09:00', endTime: '10:00' }],
    });

    const refused = await addManual(pastEventId, 'CAP-A', sessionDate);
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');
    expect(await attendanceRows(pastEventId, sessionDate)).toEqual([]);
    // No close exists: the refusal is the date rule, not a closed session.
    expect(await batchRows(pastEventId, sessionDate)).toHaveLength(0);

    const todayEventId = await liveEvent();
    const accepted = await addManual(todayEventId, 'CAP-A', day(0));
    expect(accepted.status).toBe(201);
    expect(accepted.body.source).toBe('manual');
    // A per-member row carries no `ended`; the close comes from a capture.
    expect(accepted.body).not.toHaveProperty('ended');
  });

  it('answers session_closed, not a date refusal, for a closed past session on the member route', async () => {
    const sessionDate = day(-3);
    // A scheduled series so the date is a held occurrence the member route can
    // resolve; the event is inserted directly for an exact session window.
    const series = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Closed Manual Series',
        timezone: 'UTC',
        schedule: { effectiveFrom: day(-3), rrule: 'FREQ=DAILY', endsOn: day(0) },
      });
    expect(series.status).toBe(201);

    const eventId = await insertEvent({
      sessions: [{ date: sessionDate, startTime: '09:00', endTime: '10:00' }],
      seriesId: series.body.id as string,
    });
    await createMember('CAP-CLOSED');
    // A late import is the end capture for a past session, so the close exists
    // before the date rule can answer.
    const capture = await captureAttendance({
      eventId,
      sessionDate,
      rows: [{ memberNo: 'CAP-CLOSED' }],
    });
    expect(capture.status).toBe(201);

    const response = await request(app)
      .post('/v1/members/CAP-CLOSED/attendance')
      .set(writeHeaders)
      .send({ seriesId: series.body.id, date: sessionDate });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('session_closed');
    // The import row stays; no manual row was written for the closed session.
    expect(await attendanceRows(eventId, sessionDate)).toEqual([
      { memberNo: 'CAP-CLOSED', source: 'import' },
    ]);
  });
});

describe('headcount captures', () => {
  it('rejects an asOf outside the session day and writes nothing', async () => {
    const eventId = await liveEvent();

    const response = await recordHeadcount(eventId, {
      sessionDate: day(0),
      asOf: `${day(-1)}T23:30:00.000Z`,
      mode: 'adults',
      adultMale: 1,
      adultFemale: 1,
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(await headcountCount(eventId, day(0))).toBe(0);
  });

  it('accepts an asOf inside the day but outside the live window without closing the session', async () => {
    const sessionDate = day(1);
    const eventId = await insertEvent({
      sessions: [{ date: sessionDate, startTime: '09:00', endTime: '10:00' }],
    });

    // The session is not today, so the clock is outside its live window; the
    // calendar day still contains the count.
    const first = await recordHeadcount(eventId, {
      sessionDate,
      asOf: `${sessionDate}T09:30:00.000Z`,
      mode: 'adults',
      adultMale: 30,
      adultFemale: 25,
    });
    expect(first.status).toBe(201);
    expect(first.body.ended).toBe(false);

    // A second observation is accepted: the first did not close the session.
    const second = await recordHeadcount(eventId, {
      sessionDate,
      asOf: `${sessionDate}T10:30:00.000Z`,
      mode: 'children',
      childMale: 4,
      childFemale: 6,
      adultUnspecified: 3,
    });
    expect(second.status).toBe(201);
    expect(second.body.ended).toBe(false);
    expect(await headcountCount(eventId, sessionDate)).toBe(2);

    const detail = await readEvent(eventId);
    expect(detail.body.sessions[0].capture).toEqual({
      asOf: `${sessionDate}T10:30:00.000Z`,
      ended: false,
    });
  });
});

describe('the session capture DTO', () => {
  it('exposes the later asOf of either channel and the shared close on the list and the detail', async () => {
    const headcountOnlyDate = day(-2);
    const endedBySupersededDate = day(-3);
    const importLaterDate = day(-4);

    const eventId = await insertEvent({
      timezone: 'Africa/Lagos',
      sessions: [
        { date: day(-1), startTime: '09:00', endTime: '10:00' },
        { date: headcountOnlyDate, startTime: '09:00', endTime: '10:00' },
        { date: endedBySupersededDate, startTime: '09:00', endTime: '10:00' },
        { date: importLaterDate, startTime: '09:00', endTime: '10:00' },
      ],
    });

    // (a) a headcount is the only capture.
    await seedHeadcount({
      eventId,
      sessionDate: headcountOnlyDate,
      asOf: `${headcountOnlyDate}T10:00:00.000Z`,
      recordedAt: `${headcountOnlyDate}T10:05:00.000Z`,
    });

    // (b) a superseded headcount carried `ended`; the newer observation is the
    // current one and ends nothing, so `asOf` is the newer moment and `ended`
    // is still true because the close is shared with the superseded row.
    const superseded = await seedHeadcount({
      eventId,
      sessionDate: endedBySupersededDate,
      asOf: `${endedBySupersededDate}T09:00:00.000Z`,
      recordedAt: `${endedBySupersededDate}T09:05:00.000Z`,
      ended: true,
    });
    await seedHeadcount({
      eventId,
      sessionDate: endedBySupersededDate,
      asOf: `${endedBySupersededDate}T13:00:00.000Z`,
      recordedAt: `${endedBySupersededDate}T13:05:00.000Z`,
      supersedesId: superseded,
    });
    await seedBatch({
      eventId,
      sessionDate: endedBySupersededDate,
      asOf: `${endedBySupersededDate}T12:00:00.000Z`,
      createdAt: `${endedBySupersededDate}T12:01:00.000Z`,
    });

    // (c) the import batch is the later capture of the two.
    await seedHeadcount({
      eventId,
      sessionDate: importLaterDate,
      asOf: `${importLaterDate}T09:00:00.000Z`,
      recordedAt: `${importLaterDate}T09:05:00.000Z`,
    });
    await seedBatch({
      eventId,
      sessionDate: importLaterDate,
      asOf: `${importLaterDate}T11:00:00.000Z`,
      createdAt: `${importLaterDate}T11:01:00.000Z`,
    });

    const expected = new Map<string, { asOf: string; ended: boolean } | null>([
      [day(-1), null],
      [headcountOnlyDate, { asOf: `${headcountOnlyDate}T10:00:00.000Z`, ended: false }],
      [endedBySupersededDate, { asOf: `${endedBySupersededDate}T13:00:00.000Z`, ended: true }],
      [importLaterDate, { asOf: `${importLaterDate}T11:00:00.000Z`, ended: false }],
    ]);

    // The detail and the list derive the same capture from the same rows, and
    // `asOf` stays the UTC instant it was stamped with even in Africa/Lagos.
    const detail = await readEvent(eventId);
    expect(detail.status).toBe(200);
    for (const session of detail.body.sessions as Array<{ date: string; capture: unknown }>) {
      expect(session).toHaveProperty('capture');
      expect(session.capture).toEqual(expected.get(session.date));
    }

    const listed = await request(app).get('/v1/events').query({ limit: 100 }).set(readHeaders);
    expect(listed.status).toBe(200);
    const item = (listed.body.items as Array<{ id: string; sessions: unknown[] }>).find(
      (event) => event.id === eventId,
    );
    expect(item).toBeTruthy();
    for (const session of item!.sessions as Array<{ date: string; capture: unknown }>) {
      expect(session.capture).toEqual(expected.get(session.date));
    }

    // The close is shared with a superseded row too: an import that would
    // otherwise be the end capture is refused.
    const afterClose = await captureAttendance({
      eventId,
      sessionDate: endedBySupersededDate,
      rows: [{ memberNo: 'CAP-A' }],
    });
    expect(afterClose.status).toBe(409);
    expect(afterClose.body.code).toBe('session_closed');
  });
});
