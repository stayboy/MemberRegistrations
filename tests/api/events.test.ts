import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

interface StoredSession {
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: 'scheduled' | 'held' | 'cancelled';
}

interface SeedEvent {
  eventNo: string | null;
  seriesId: string | null;
  name: string;
  timezone?: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime?: string | null;
  venueType: 'auditorium' | 'virtual' | 'hybrid';
  venueName?: string | null;
  description?: string | null;
  status?: 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
  source?: 'series' | 'manual' | 'import';
  sessions: StoredSession[];
}

let harness: TestApp;
let seriesId: string;
let member1Id: string;
let member2Id: string;
const eventIds: Record<string, string> = {};

async function insertEvent(event: SeedEvent): Promise<string> {
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, venue_name, description, status, source, sessions
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     returning id`,
    [
      event.eventNo,
      event.seriesId,
      event.name,
      event.timezone ?? 'UTC',
      event.startDate,
      event.endDate,
      event.startTime,
      event.endTime ?? null,
      event.venueType,
      event.venueName ?? null,
      event.description ?? null,
      event.status ?? 'scheduled',
      event.source ?? 'manual',
      JSON.stringify(event.sessions),
    ],
  );
  return row!.id;
}

async function insertAttendance(
  memberId: string,
  eventInstanceId: string,
  sessionDate: string,
  source: 'import' | 'manual',
): Promise<void> {
  await harness.db.query(
    `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
     values ($1,$2,$3,$4,'test')`,
    [memberId, eventInstanceId, sessionDate, source],
  );
}

function listEvents(query: Record<string, string | number> = {}) {
  return request(harness.app).get('/v1/events').query(query).set(readHeaders);
}

beforeAll(async () => {
  harness = await createTestApp();
  const app = harness.app;

  const series = await request(app)
    .post('/v1/series')
    .set(writeHeaders)
    .send({
      name: 'Event List Service',
      ministryCode: 'CHOIR',
      description: 'Sunday, 09:00',
      schedule: {
        effectiveFrom: '2026-01-04',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2026-01-25',
      },
    });
  expect(series.status).toBe(201);
  seriesId = series.body.id as string;

  for (const memberNo of ['EL-001', 'EL-002']) {
    const created = await request(app).post('/v1/members').set(writeHeaders).send({
      memberNo,
      firstName: 'Event',
      lastName: memberNo,
      gender: 'undisclosed',
    });
    expect(created.status).toBe(201);
  }

  const members = await harness.db.query<{ id: string; member_no: string }>(
    "select id, member_no from members where member_no in ('EL-001','EL-002')",
  );
  member1Id = members.find((member) => member.member_no === 'EL-001')!.id;
  member2Id = members.find((member) => member.member_no === 'EL-002')!.id;

  eventIds.series = await insertEvent({
    eventNo: 'EL-100',
    seriesId,
    name: 'Event List Service',
    startDate: '2026-01-04',
    endDate: '2026-01-04',
    startTime: '09:00',
    endTime: '10:30',
    venueType: 'auditorium',
    venueName: 'Main Auditorium',
    description: 'Weekly service',
    status: 'scheduled',
    source: 'series',
    sessions: [{ date: '2026-01-04', startTime: '09:00', endTime: '10:30', status: 'held' }],
  });

  // A series-minted instance that has not been given an event number yet.
  eventIds.unminted = await insertEvent({
    eventNo: null,
    seriesId,
    name: 'Event List Service',
    startDate: '2026-01-11',
    endDate: '2026-01-11',
    startTime: '09:00',
    endTime: '10:30',
    venueType: 'auditorium',
    status: 'scheduled',
    source: 'series',
    sessions: [{ date: '2026-01-11', startTime: '09:00', endTime: '10:30', status: 'held' }],
  });

  eventIds.conference = await insertEvent({
    eventNo: 'EL-200',
    seriesId: null,
    name: 'Strategic Conference',
    timezone: 'Africa/Lagos',
    startDate: '2026-03-01',
    endDate: '2026-03-03',
    startTime: '17:30',
    endTime: '20:00',
    venueType: 'hybrid',
    venueName: 'Main Auditorium + Zoom',
    description: 'Three-day conference',
    status: 'scheduled',
    source: 'manual',
    sessions: [
      { date: '2026-03-01', startTime: '17:30', endTime: '20:00', status: 'held' },
      { date: '2026-03-02', startTime: '17:30', endTime: '20:00', status: 'held' },
      { date: '2026-03-03', startTime: '17:30', endTime: '12:00', status: 'held' },
    ],
  });

  eventIds.future = await insertEvent({
    eventNo: 'EL-300',
    seriesId: null,
    name: 'Future Virtual Gathering',
    startDate: '2999-06-01',
    endDate: '2999-06-01',
    startTime: '10:00',
    venueType: 'virtual',
    status: 'scheduled',
    source: 'manual',
    sessions: [{ date: '2999-06-01', startTime: '10:00', endTime: null, status: 'scheduled' }],
  });

  eventIds.cancelled = await insertEvent({
    eventNo: 'EL-400',
    seriesId: null,
    name: 'Cancelled Gathering',
    startDate: '2026-05-01',
    endDate: '2026-05-01',
    startTime: null,
    venueType: 'auditorium',
    status: 'cancelled',
    source: 'manual',
    sessions: [{ date: '2026-05-01', startTime: null, endTime: null, status: 'cancelled' }],
  });

  eventIds.draft = await insertEvent({
    eventNo: 'EL-500',
    seriesId: null,
    name: 'Draft Gathering',
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    startTime: null,
    venueType: 'auditorium',
    status: 'draft',
    source: 'manual',
    sessions: [{ date: '2026-06-01', startTime: null, endTime: null, status: 'scheduled' }],
  });

  eventIds.archived = await insertEvent({
    eventNo: 'EL-600',
    seriesId: null,
    name: 'Archived Gathering',
    startDate: '2026-07-01',
    endDate: '2026-07-01',
    startTime: null,
    venueType: 'auditorium',
    status: 'archived',
    source: 'manual',
    sessions: [{ date: '2026-07-01', startTime: null, endTime: null, status: 'cancelled' }],
  });

  // 2026-01-04: one manual and one import row → mixed.
  await insertAttendance(member1Id, eventIds.series!, '2026-01-04', 'manual');
  await insertAttendance(member2Id, eventIds.series!, '2026-01-04', 'import');
  // Conference day 1 is import only; day 2 is manual only; day 3 has nobody.
  await insertAttendance(member1Id, eventIds.conference!, '2026-03-01', 'import');
  await insertAttendance(member1Id, eventIds.conference!, '2026-03-02', 'manual');
});

afterAll(async () => {
  await harness.close();
});

describe('GET /v1/events', () => {
  it('returns the full event shape with enriched series sessions', async () => {
    const response = await listEvents({ limit: 100 });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');

    const item = response.body.items.find((event: { id: string }) => event.id === eventIds.series);

    expect(item).toEqual({
      id: eventIds.series,
      eventNo: 'EL-100',
      name: 'Event List Service',
      seriesId,
      ministry: { code: 'CHOIR', name: 'Choir' },
      timezone: 'UTC',
      startDate: '2026-01-04',
      endDate: '2026-01-04',
      startTime: '09:00',
      endTime: '10:30',
      venueType: 'auditorium',
      venueName: 'Main Auditorium',
      description: 'Weekly service',
      status: 'held',
      source: 'series',
      tracksMembers: true,
      presbyterOnly: false,
      sessions: [
        {
          date: '2026-01-04',
          startTime: '09:00',
          endTime: '10:30',
          status: 'held',
          present: 2,
          expected: 0,
          importedRows: 1,
          source: 'mixed',
        },
      ],
      offerings: [],
      stats: {
        attachedEvents: 0,
        pledgedMinor: 0,
        paidMinor: 0,
        pendingMinor: 0,
        honorRate: 0,
        contributionCount: 0,
      },
    });
  });

  it('keeps a standalone multi-day event and counts each session separately', async () => {
    const response = await listEvents({ venueType: 'hybrid' });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);

    const conference = response.body.items[0];
    expect(conference).toMatchObject({
      id: eventIds.conference,
      eventNo: 'EL-200',
      name: 'Strategic Conference',
      seriesId: null,
      ministry: null,
      timezone: 'Africa/Lagos',
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      venueType: 'hybrid',
      venueName: 'Main Auditorium + Zoom',
      status: 'held',
      source: 'manual',
      offerings: [],
    });
    expect(
      conference.sessions.map(
        (session: {
          date: string;
          present: number;
          importedRows: number;
          source: string;
          expected: number;
        }) => ({
          date: session.date,
          present: session.present,
          importedRows: session.importedRows,
          source: session.source,
          expected: session.expected,
        }),
      ),
    ).toEqual([
      { date: '2026-03-01', present: 1, importedRows: 1, source: 'import', expected: 0 },
      { date: '2026-03-02', present: 1, importedRows: 0, source: 'manual', expected: 0 },
      { date: '2026-03-03', present: 0, importedRows: 0, source: 'none', expected: 0 },
    ]);
  });

  it('allows a series-minted instance to have no event number', async () => {
    const response = await listEvents();
    const item = response.body.items.find(
      (event: { id: string }) => event.id === eventIds.unminted,
    );

    expect(item.eventNo).toBeNull();
    expect(item.seriesId).toBe(seriesId);
  });

  it('derives status in UTC while preserving draft, cancelled and archived', async () => {
    const response = await listEvents();
    const byId = new Map(
      response.body.items.map(
        (event: { id: string; status: string }) => [event.id, event.status] as const,
      ),
    );

    expect(byId.get(eventIds.series)).toBe('held');
    expect(byId.get(eventIds.conference)).toBe('held');
    expect(byId.get(eventIds.future)).toBe('scheduled');
    expect(byId.get(eventIds.cancelled)).toBe('cancelled');
    expect(byId.get(eventIds.draft)).toBe('draft');
    expect(byId.get(eventIds.archived)).toBe('archived');
  });

  it('filters by date window using overlap', async () => {
    const inside = await listEvents({ from: '2026-03-02', to: '2026-03-02' });
    expect(inside.body.items.map((event: { id: string }) => event.id)).toEqual([
      eventIds.conference,
    ]);

    const after = await listEvents({ from: '2026-03-04', to: '2026-03-31' });
    expect(after.body.items).toEqual([]);

    const empty = await listEvents({ from: '2026-01-12', to: '2026-02-28' });
    expect(empty.body.items).toEqual([]);
  });

  it('filters by seriesId and ministry code or name, case-insensitively', async () => {
    const bySeries = await listEvents({ seriesId });
    expect(bySeries.body.items.map((event: { id: string }) => event.id).sort()).toEqual(
      [eventIds.series, eventIds.unminted].sort(),
    );

    for (const ministry of ['CHOIR', 'choir', 'Choir']) {
      const byMinistry = await listEvents({ ministry });
      expect(byMinistry.body.items.map((event: { id: string }) => event.id).sort()).toEqual(
        [eventIds.series, eventIds.unminted].sort(),
      );
    }
  });

  it('rejects an unknown venueType with a 422 validation error', async () => {
    const response = await listEvents({ venueType: 'church' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.status).toBe(422);
  });

  it('pages in stable (start_date, id) order', async () => {
    const all = await listEvents({ limit: 100 });
    const ids = all.body.items.map((event: { id: string }) => event.id) as string[];

    const first = await listEvents({ limit: 2, offset: 0 });
    const second = await listEvents({ limit: 2, offset: 2 });

    expect(first.body.items.map((event: { id: string }) => event.id)).toEqual(ids.slice(0, 2));
    expect(second.body.items.map((event: { id: string }) => event.id)).toEqual(ids.slice(2, 4));
    expect(first.body.items).toHaveLength(2);
  });

  it('caps the page size at 100', async () => {
    const response = await listEvents({ limit: 101 });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });
});

function createEvent(body: Record<string, unknown>) {
  return request(harness.app).post('/v1/events').set(writeHeaders).send(body);
}

function readEvent(id: string) {
  return request(harness.app).get(`/v1/events/${id}`).set(readHeaders);
}

function updateEvent(id: string, body: Record<string, unknown>, etag?: string) {
  return request(harness.app)
    .put(`/v1/events/${id}`)
    .set(etag ? { ...writeHeaders, 'If-Match': etag } : writeHeaders)
    .send(body);
}

const emptyStats = {
  attachedEvents: 0,
  pledgedMinor: 0,
  paidMinor: 0,
  pendingMinor: 0,
  honorRate: 0,
  contributionCount: 0,
};

const conferenceBody = {
  eventNo: 'SC-2026',
  name: 'Strategic Conference',
  timezone: 'Africa/Lagos',
  startDate: '2026-10-13',
  endDate: '2026-10-15',
  startTime: '17:30',
  endTime: '20:00',
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  description: 'Annual strategic conference',
  sessions: [{ date: '2026-10-13' }, { date: '2026-10-14' }, { date: '2026-10-15' }],
};

const validBody = {
  eventNo: 'SC-VALID',
  name: 'Validation Event',
  startDate: '2026-12-01',
  endDate: '2026-12-03',
  startTime: '18:00',
  venueType: 'auditorium',
  sessions: [{ date: '2026-12-01' }],
};

let conferenceId: string;
let conferenceEtag: string;

describe('POST /v1/events', () => {
  it('creates the Strategic Conference standalone with three 17:30 sessions', async () => {
    const response = await createEvent(conferenceBody);

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe(`/v1/events/${response.body.id}`);
    expect(response.headers.etag).toMatch(/^"e[0-9a-f]+"$/);

    conferenceId = response.body.id as string;
    conferenceEtag = response.headers.etag as string;

    expect(response.body).toMatchObject({
      eventNo: 'SC-2026',
      name: 'Strategic Conference',
      seriesId: null,
      ministry: null,
      timezone: 'Africa/Lagos',
      startDate: '2026-10-13',
      endDate: '2026-10-15',
      startTime: '17:30',
      endTime: '20:00',
      venueType: 'auditorium',
      venueName: 'Main Auditorium',
      description: 'Annual strategic conference',
      // Today is after 2026-10-15, so the stored `scheduled` derives to held.
      status: 'held',
      source: 'manual',
      offerings: [],
      stats: emptyStats,
    });
    expect(response.body.sessions).toEqual([
      {
        date: '2026-10-13',
        startTime: '17:30',
        endTime: '20:00',
        status: 'scheduled',
        present: 0,
        expected: 0,
        importedRows: 0,
        source: 'none',
      },
      {
        date: '2026-10-14',
        startTime: '17:30',
        endTime: '20:00',
        status: 'scheduled',
        present: 0,
        expected: 0,
        importedRows: 0,
        source: 'none',
      },
      {
        date: '2026-10-15',
        startTime: '17:30',
        endTime: '20:00',
        status: 'scheduled',
        present: 0,
        expected: 0,
        importedRows: 0,
        source: 'none',
      },
    ]);
  });

  it('rejects an empty session list', async () => {
    const response = await createEvent({ ...validBody, eventNo: 'SC-EMPTY', sessions: [] });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects duplicate session dates', async () => {
    const response = await createEvent({
      ...validBody,
      eventNo: 'SC-DUPLICATE',
      sessions: [{ date: '2026-12-01' }, { date: '2026-12-01' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('2026-12-01');
  });

  it('rejects a session outside the event date range and writes nothing', async () => {
    const response = await createEvent({
      ...validBody,
      eventNo: 'SC-OUTSIDE',
      sessions: [{ date: '2026-11-30' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('2026-11-30');

    const [row] = await harness.db.query<{ count: number | string }>(
      "select count(*)::int as count from event_instances where event_no = 'SC-OUTSIDE'",
    );
    expect(Number(row!.count)).toBe(0);
  });

  it('rejects an unknown venue type and writes nothing', async () => {
    const response = await createEvent({
      ...validBody,
      eventNo: 'SC-CHURCH',
      venueType: 'church',
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');

    const [row] = await harness.db.query<{ count: number | string }>(
      "select count(*)::int as count from event_instances where event_no = 'SC-CHURCH'",
    );
    expect(Number(row!.count)).toBe(0);
  });

  it('rejects a missing event number', async () => {
    const response = await createEvent({
      name: 'No Number',
      startDate: '2026-12-01',
      endDate: '2026-12-01',
      startTime: '18:00',
      venueType: 'auditorium',
      sessions: [{ date: '2026-12-01' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects a duplicate event number with 409', async () => {
    const response = await createEvent({ ...validBody, eventNo: 'EL-100' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('conflict');
  });

  it('creates a headcount-only event and refuses per-member attendance', async () => {
    const created = await createEvent({
      ...validBody,
      eventNo: 'SC-HEADCOUNT',
      name: 'Headcount-only Rally',
      tracksMembers: false,
    });
    expect(created.status).toBe(201);
    expect(created.body.tracksMembers).toBe(false);

    const id = created.body.id as string;
    const detail = await readEvent(id);
    expect(detail.status).toBe(200);
    expect(detail.body.tracksMembers).toBe(false);

    const manual = await request(harness.app)
      .post(`/v1/events/${id}/attendance`)
      .set(writeHeaders)
      .send({ memberNo: 'EL-001', date: '2026-12-01' });
    expect(manual.status).toBe(422);
    expect(manual.body.code).toBe('headcount_only');

    // The per-session report still reads, with no fabricated rows.
    const report = await request(harness.app)
      .get(`/v1/events/${id}/attendance`)
      .query({ date: '2026-12-01' })
      .set(readHeaders)
      .expect(200);
    expect(report.body.rows).toEqual([]);
  });

  it('keeps tracksMembers when an update omits it and lets an update change it', async () => {
    const created = await createEvent({
      ...validBody,
      eventNo: 'SC-HEADCOUNT-UPDATE',
      name: 'Headcount-only Update',
      tracksMembers: false,
    });
    expect(created.status).toBe(201);

    const renamed = await updateEvent(
      created.body.id as string,
      { name: 'Still headcount-only' },
      created.headers.etag as string,
    );
    expect(renamed.status).toBe(200);
    expect(renamed.body.tracksMembers).toBe(false);

    const tracked = await updateEvent(
      created.body.id as string,
      { tracksMembers: true },
      renamed.headers.etag as string,
    );
    expect(tracked.status).toBe(200);
    expect(tracked.body.tracksMembers).toBe(true);
  });
});

describe('GET /v1/events/{eventId}', () => {
  it('returns the detail with sessions, placeholders and an ETag', async () => {
    const response = await readEvent(conferenceId);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBe(conferenceEtag);
    expect(response.body).toMatchObject({
      id: conferenceId,
      eventNo: 'SC-2026',
      name: 'Strategic Conference',
      seriesId: null,
      status: 'held',
      offerings: [],
      stats: emptyStats,
    });
    expect(response.body.sessions).toHaveLength(3);
    expect(
      response.body.sessions.map((session: { date: string; status: string; expected: number }) => ({
        date: session.date,
        status: session.status,
        expected: session.expected,
      })),
    ).toEqual([
      { date: '2026-10-13', status: 'scheduled', expected: 0 },
      { date: '2026-10-14', status: 'scheduled', expected: 0 },
      { date: '2026-10-15', status: 'scheduled', expected: 0 },
    ]);
  });

  it('returns 404 for an unknown event', async () => {
    const response = await readEvent('00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });
});

describe('PUT /v1/events/{eventId}', () => {
  it('updates mutable fields with a matching If-Match and rejects a stale one', async () => {
    const updated = await updateEvent(
      conferenceId,
      {
        name: 'Strategic Conference 2026',
        venueName: 'Main Auditorium + Zoom',
        description: 'Updated conference',
      },
      conferenceEtag,
    );

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      id: conferenceId,
      eventNo: 'SC-2026',
      name: 'Strategic Conference 2026',
      venueName: 'Main Auditorium + Zoom',
      description: 'Updated conference',
      seriesId: null,
    });
    const freshEtag = updated.headers.etag as string;
    expect(freshEtag).toBeTruthy();
    expect(freshEtag).not.toBe(conferenceEtag);

    const stale = await updateEvent(conferenceId, { name: 'Stale Name' }, conferenceEtag);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('conflict');

    const reread = await readEvent(conferenceId);
    expect(reread.body.name).toBe('Strategic Conference 2026');
  });

  it('updates without an If-Match header', async () => {
    const response = await updateEvent(conferenceId, { description: 'No precondition' });

    expect(response.status).toBe(200);
    expect(response.body.description).toBe('No precondition');
  });

  it('rejects an update that leaves a session outside the new range', async () => {
    const response = await updateEvent(conferenceId, { startDate: '2026-10-14' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('2026-10-13');
  });

  it('treats a cancelled event as read-only', async () => {
    const response = await updateEvent(eventIds.cancelled!, { name: 'Renamed' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('conflict');
  });

  it('treats an archived event as read-only', async () => {
    const response = await updateEvent(eventIds.archived!, { name: 'Renamed' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('conflict');
  });

  it('returns 404 for an unknown event', async () => {
    const response = await updateEvent('00000000-0000-4000-8000-000000000000', { name: 'Nope' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });
});

function generateEvents(query: Record<string, string> = {}) {
  return request(harness.app).post('/v1/events/generate').query(query).set(writeHeaders);
}

function createSeries(body: Record<string, unknown>) {
  return request(harness.app).post('/v1/series').set(writeHeaders).send(body);
}

describe('POST /v1/events/generate', () => {
  let generatedSeriesId: string;
  let generatedIds: string[];

  it('generates one event per weekly occurrence with inherited fields', async () => {
    const created = await createSeries({
      name: 'Generation Sunday Service',
      ministryCode: 'CHOIR',
      schedule: {
        effectiveFrom: '2026-02-01',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2026-02-15',
      },
    });
    expect(created.status).toBe(201);
    generatedSeriesId = created.body.id as string;

    const response = await generateEvents({ from: '2026-02-01', to: '2026-02-15' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ created: 3, skipped: 0 });
    expect(response.body.eventIds).toHaveLength(3);
    generatedIds = response.body.eventIds as string[];

    const listed = await listEvents({
      seriesId: generatedSeriesId,
      from: '2026-02-01',
      to: '2026-02-15',
      limit: 100,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(3);
    expect(listed.body.items.map((event: { id: string }) => event.id).sort()).toEqual(
      [...generatedIds].sort(),
    );
    expect(listed.body.items.map((event: { startDate: string }) => event.startDate)).toEqual([
      '2026-02-01',
      '2026-02-08',
      '2026-02-15',
    ]);

    const eventNos = new Set<string>();
    for (const event of listed.body.items) {
      expect(event).toMatchObject({
        name: 'Generation Sunday Service',
        seriesId: generatedSeriesId,
        ministry: { code: 'CHOIR', name: 'Choir' },
        timezone: 'UTC',
        startDate: event.startDate,
        endDate: event.startDate,
        startTime: '00:00',
        endTime: null,
        venueType: 'auditorium',
        venueName: null,
        description: null,
        source: 'series',
      });
      expect(event.eventNo).toMatch(/^EVT-2026-\d{3}$/);
      eventNos.add(event.eventNo as string);

      expect(event.sessions).toHaveLength(1);
      expect(event.sessions[0]).toMatchObject({
        date: event.startDate,
        startTime: '00:00',
        endTime: null,
        status: 'scheduled',
      });
    }
    expect(eventNos.size).toBe(3);
  });

  it('is idempotent and never overwrites an existing event', async () => {
    const renamed = await updateEvent(generatedIds[0]!, { name: 'Renamed Generation Service' });
    expect(renamed.status).toBe(200);

    const again = await generateEvents({ from: '2026-02-01', to: '2026-02-15' });

    expect(again.status).toBe(200);
    expect(again.body).toEqual({ created: 0, skipped: 3, eventIds: [] });

    const reread = await readEvent(generatedIds[0]!);
    expect(reread.body.name).toBe('Renamed Generation Service');
  });

  it('honours cancelled and extra exceptions', async () => {
    const created = await createSeries({
      name: 'Exception Generation Service',
      timezone: 'Africa/Lagos',
      schedule: {
        effectiveFrom: '2026-03-01',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2026-03-15',
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const cancelled = await request(harness.app)
      .post(`/v1/series/${id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-03-08', kind: 'cancelled' });
    expect(cancelled.status).toBe(201);

    const extra = await request(harness.app)
      .post(`/v1/series/${id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-03-11', kind: 'extra' });
    expect(extra.status).toBe(201);

    const response = await generateEvents({ from: '2026-03-01', to: '2026-03-15' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ created: 3, skipped: 0 });

    const listed = await listEvents({
      seriesId: id,
      from: '2026-03-01',
      to: '2026-03-15',
      limit: 100,
    });
    expect(listed.body.items.map((event: { startDate: string }) => event.startDate)).toEqual([
      '2026-03-01',
      '2026-03-11',
      '2026-03-15',
    ]);
    expect(listed.body.items.map((event: { timezone: string }) => event.timezone)).toEqual([
      'Africa/Lagos',
      'Africa/Lagos',
      'Africa/Lagos',
    ]);
  });

  it('does not generate for an archived series', async () => {
    const created = await createSeries({
      name: 'Archived Generation Service',
      schedule: {
        effectiveFrom: '2026-04-05',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2026-04-19',
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const archived = await request(harness.app)
      .put(`/v1/series/${id}`)
      .set(writeHeaders)
      .send({ archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    const response = await generateEvents({ from: '2026-04-05', to: '2026-04-19' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ created: 0, skipped: 0, eventIds: [] });

    const listed = await listEvents({ seriesId: id, from: '2026-04-05', to: '2026-04-19' });
    expect(listed.body.items).toEqual([]);
  });

  it('rejects an inverted window and missing dates with 422', async () => {
    const inverted = await generateEvents({ from: '2026-05-10', to: '2026-05-01' });
    expect(inverted.status).toBe(422);
    expect(inverted.body.code).toBe('validation_error');

    const missing = await generateEvents({ from: '2026-05-01' });
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation_error');
  });

  it('skips a manually assigned event number that outruns the counter', async () => {
    const created = await createSeries({
      name: 'Collision Generation Service',
      schedule: {
        effectiveFrom: '2026-06-07',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2026-06-07',
      },
    });
    expect(created.status).toBe(201);
    const seriesId = created.body.id as string;

    const manual = await request(harness.app)
      .post('/v1/events')
      .set(writeHeaders)
      .send({
        eventNo: 'EVT-2026-777',
        name: 'Manual Collision Event',
        timezone: 'UTC',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        startTime: '17:00',
        venueType: 'auditorium',
        sessions: [{ date: '2026-06-01' }],
      });
    expect(manual.status).toBe(201);

    await harness.db.query(
      `insert into event_no_counters (year, last_value) values (2026, 776)
       on conflict (year) do update set last_value = 776`,
    );

    const response = await generateEvents({ from: '2026-06-07', to: '2026-06-07' });
    expect(response.status).toBe(200);
    expect(response.body.created).toBe(1);

    const listed = await listEvents({ seriesId, from: '2026-06-07', to: '2026-06-07' });
    expect(listed.body.items[0].eventNo).toBe('EVT-2026-778');
  });
});
