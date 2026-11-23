import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { occurrenceId, seedEvent } from '../helpers/event-fixtures.js';
import { reachableContacts } from '../helpers/member-fixtures.js';

let harness: TestApp;
let seriesId: string;
let member1Id: string;
let member2Id: string;
const eventIds: Record<string, string> = {};

async function insertAttendance(
  memberId: string,
  eventId: string,
  sessionDate: string,
  source: 'import' | 'manual',
): Promise<void> {
  const occurrence = await occurrenceId(harness.db, eventId, sessionDate);
  await harness.db.query(
    `insert into attendance (member_id, occurrence_id, source, created_by)
     values ($1,$2,$3,'test')`,
    [memberId, occurrence, source],
  );
}

/** A UTC calendar date `offset` days from today. */
function day(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
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
      contacts: reachableContacts(),
    });
    expect(created.status).toBe(201);
  }

  const members = await harness.db.query<{ id: string; member_no: string }>(
    "select id, member_no from members where member_no in ('EL-001','EL-002')",
  );
  member1Id = members.find((member) => member.member_no === 'EL-001')!.id;
  member2Id = members.find((member) => member.member_no === 'EL-002')!.id;

  const seriesSeed = await seedEvent(harness.db, {
    eventId: seriesId,
    eventNo: 'EL-100',
    name: 'Event List Service',
    ministryCode: 'CHOIR',
    startDate: '2026-01-04',
    endDate: '2026-01-11',
    startTime: '09:00',
    endTime: '10:30',
    venueType: 'auditorium',
    venueName: 'Main Auditorium',
    description: 'Weekly service',
    source: 'series',
    series: true,
    sessions: [
      { date: '2026-01-04', startTime: '09:00', endTime: '10:30', status: 'held' },
      { date: '2026-01-11', startTime: '09:00', endTime: '10:30', status: 'held' },
    ],
  });
  eventIds.series = seriesSeed.eventId;

  eventIds.conference = (
    await seedEvent(harness.db, {
      eventNo: 'EL-200',
      name: 'Strategic Conference',
      timezone: 'Africa/Lagos',
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      startTime: '17:30',
      endTime: '20:00',
      venueType: 'hybrid',
      venueName: 'Main Auditorium + Zoom',
      description: 'Three-day conference',
      source: 'manual',
      sessions: [
        { date: '2026-03-01', startTime: '17:30', endTime: '20:00', status: 'held' },
        { date: '2026-03-02', startTime: '17:30', endTime: '20:00', status: 'held' },
        { date: '2026-03-03', startTime: '17:30', endTime: '12:00', status: 'held' },
      ],
    })
  ).eventId;

  eventIds.future = (
    await seedEvent(harness.db, {
      eventNo: 'EL-300',
      name: 'Future Virtual Gathering',
      startDate: '2999-06-01',
      endDate: '2999-06-01',
      startTime: '10:00',
      venueType: 'virtual',
      source: 'manual',
      sessions: [{ date: '2999-06-01', startTime: '10:00', endTime: null, status: 'scheduled' }],
    })
  ).eventId;

  eventIds.cancelled = (
    await seedEvent(harness.db, {
      eventNo: 'EL-400',
      name: 'Cancelled Gathering',
      startDate: '2026-05-01',
      endDate: '2026-05-01',
      venueType: 'auditorium',
      status: 'cancelled',
      source: 'manual',
      sessions: [{ date: '2026-05-01', status: 'cancelled' }],
    })
  ).eventId;

  eventIds.draft = (
    await seedEvent(harness.db, {
      eventNo: 'EL-500',
      name: 'Draft Gathering',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      venueType: 'auditorium',
      status: 'draft',
      source: 'manual',
      sessions: [{ date: '2026-06-01', status: 'scheduled' }],
    })
  ).eventId;

  eventIds.archived = (
    await seedEvent(harness.db, {
      eventNo: 'EL-600',
      name: 'Archived Gathering',
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      venueType: 'auditorium',
      status: 'archived',
      source: 'manual',
      sessions: [{ date: '2026-07-01', status: 'cancelled' }],
    })
  ).eventId;

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
      endDate: '2026-01-11',
      startTime: '09:00',
      endTime: '10:30',
      venueType: 'auditorium',
      venueName: 'Main Auditorium',
      description: 'Weekly service',
      status: 'active',
      source: 'series',
      tracksMembers: true,
      presbyterOnly: false,
      sessions: [
        {
          date: '2026-01-04',
          startTime: '09:00',
          endTime: '10:30',
          status: 'held',
          capture: null,
          note: null,
          present: 2,
          expected: 0,
          importedRows: 1,
          source: 'mixed',
        },
        {
          date: '2026-01-11',
          startTime: '09:00',
          endTime: '10:30',
          status: 'held',
          capture: null,
          note: null,
          present: 0,
          expected: 0,
          importedRows: 0,
          source: 'none',
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
      status: 'active',
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

  it('allows a series parent to keep its assigned event number', async () => {
    const response = await listEvents();
    const item = response.body.items.find((event: { id: string }) => event.id === eventIds.series);

    expect(item.eventNo).toBe('EL-100');
    expect(item.seriesId).toBe(seriesId);
  });

  it('carries the parent status, preserving draft and archived', async () => {
    const response = await listEvents();
    const byId = new Map(
      response.body.items.map(
        (event: { id: string; status: string }) => [event.id, event.status] as const,
      ),
    );

    expect(byId.get(eventIds.series)).toBe('active');
    expect(byId.get(eventIds.conference)).toBe('active');
    expect(byId.get(eventIds.future)).toBe('active');
    expect(byId.get(eventIds.cancelled)).toBe('active');
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
    expect(bySeries.body.items.map((event: { id: string }) => event.id)).toEqual([eventIds.series]);

    for (const ministry of ['CHOIR', 'choir', 'Choir']) {
      const byMinistry = await listEvents({ ministry });
      expect(byMinistry.body.items.map((event: { id: string }) => event.id)).toEqual([
        eventIds.series,
      ]);
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
  startTime: '17:30',
  endTime: '20:00',
  venueType: 'auditorium',
  venueName: 'Main Auditorium',
  description: 'Annual strategic conference',
  occurrences: [{ date: '2026-10-13' }, { date: '2026-10-14' }, { date: '2026-10-15' }],
};

const validBody = {
  eventNo: 'SC-VALID',
  name: 'Validation Event',
  startTime: '18:00',
  venueType: 'auditorium',
  occurrences: [{ date: '2026-12-01' }],
};

let conferenceId: string;
let conferenceEtag: string;

describe('POST /v1/events', () => {
  it('creates the Strategic Conference draft with three 17:30 occurrences', async () => {
    const response = await createEvent(conferenceBody);

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe(`/v1/events/${response.body.id}`);
    expect(response.headers.etag).toMatch(/^"e[0-9a-f]+"$/);

    conferenceId = response.body.id as string;

    expect(response.body).toMatchObject({
      eventNo: 'SC-2026',
      name: 'Strategic Conference',
      audienceId: response.body.audience.id,
      ministry: null,
      presbyterOnly: false,
      timezone: 'Africa/Lagos',
      startDate: '2026-10-13',
      endDate: '2026-10-15',
      startTime: '17:30',
      endTime: '20:00',
      venueType: 'auditorium',
      venueName: 'Main Auditorium',
      description: 'Annual strategic conference',
      tracksMembers: true,
      status: 'draft',
      recurrence: null,
      offerings: [],
      stats: emptyStats,
    });
    expect(response.body.occurrences).toHaveLength(3);
    expect(response.body.occurrences[0]).toMatchObject({
      date: '2026-10-13',
      startTime: '17:30',
      endTime: '20:00',
      status: 'scheduled',
      capture: null,
      note: null,
      present: 0,
      expected: 0,
      importedRows: 0,
      source: 'none',
    });

    // The legacy detail and update tests below read an active parent; the new
    // create is a draft, so activate it through PATCH and take the legacy ETag.
    const activated = await request(harness.app)
      .patch(`/v1/events/${conferenceId}`)
      .set({ ...writeHeaders, 'If-Match': response.headers.etag as string })
      .send({ status: 'active' });
    expect(activated.status).toBe(200);

    const legacy = await readEvent(conferenceId);
    expect(legacy.status).toBe(200);
    conferenceEtag = legacy.headers.etag as string;
  });

  it('rejects an empty occurrence list', async () => {
    const response = await createEvent({ ...validBody, eventNo: 'SC-EMPTY', occurrences: [] });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects duplicate occurrence dates', async () => {
    const response = await createEvent({
      ...validBody,
      eventNo: 'SC-DUPLICATE',
      occurrences: [{ date: '2026-12-01' }, { date: '2026-12-01' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('2026-12-01');
  });

  it('rejects a request carrying both occurrences and a recurrence', async () => {
    const response = await createEvent({
      ...validBody,
      eventNo: 'SC-BOTH',
      recurrence: {
        schedules: [{ effectiveFrom: '2026-12-06', rrule: 'FREQ=WEEKLY;BYDAY=SU' }],
      },
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('recurrence');

    const [row] = await harness.db.query<{ count: number | string }>(
      "select count(*)::int as count from events where event_no = 'SC-BOTH'",
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
      "select count(*)::int as count from events where event_no = 'SC-CHURCH'",
    );
    expect(Number(row!.count)).toBe(0);
  });

  it('mints an event number when the body omits it', async () => {
    const response = await createEvent({
      name: 'No Number',
      startTime: '18:00',
      venueType: 'auditorium',
      occurrences: [{ date: '2026-12-01' }],
    });

    expect(response.status).toBe(201);
    expect(response.body.eventNo).toMatch(/^EVT-\d{4}-\d{3}$/);
  });

  it('rejects a duplicate event number with 409', async () => {
    const response = await createEvent({ ...validBody, eventNo: 'EL-100' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('conflict');
  });

  it('creates a headcount-only event and refuses per-member attendance', async () => {
    // A per-member write is accepted only for a session dated today, so the
    // headcount-only refusal is checked on today's session; the old rule is
    // exercised after the date gate has passed.
    const created = await createEvent({
      ...validBody,
      eventNo: 'SC-HEADCOUNT',
      name: 'Headcount-only Rally',
      timezone: 'UTC',
      startTime: '00:00',
      occurrences: [{ date: day(0) }],
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
      .send({ memberNo: 'EL-001', date: day(0) });
    expect(manual.status).toBe(422);
    expect(manual.body.code).toBe('headcount_only');

    // The per-session report still reads, with no fabricated rows.
    const report = await request(harness.app)
      .get(`/v1/events/${id}/attendance`)
      .query({ date: day(0) })
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

    // PUT is the legacy per-instance write and quotes its own content ETag.
    const legacy = await readEvent(created.body.id as string);
    const renamed = await updateEvent(
      created.body.id as string,
      { name: 'Still headcount-only' },
      legacy.headers.etag as string,
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
      status: 'active',
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

  it('generates one occurrence per weekly date under one parent', async () => {
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
    expect(response.body.eventIds).toEqual([generatedSeriesId]);
    generatedIds = response.body.eventIds as string[];

    const listed = await listEvents({
      seriesId: generatedSeriesId,
      from: '2026-02-01',
      to: '2026-02-15',
      limit: 100,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    const event = listed.body.items[0];
    expect(event).toMatchObject({
      id: generatedSeriesId,
      name: 'Generation Sunday Service',
      seriesId: generatedSeriesId,
      ministry: { code: 'CHOIR', name: 'Choir' },
      timezone: 'UTC',
      startDate: '2026-02-01',
      endDate: '2026-02-15',
      startTime: '00:00',
      endTime: null,
      venueType: 'auditorium',
      venueName: null,
      description: null,
      source: 'series',
    });
    expect(event.eventNo).toMatch(/^EVT-2026-\d{3}$/);
    expect(event.sessions.map((session: { date: string }) => session.date)).toEqual([
      '2026-02-01',
      '2026-02-08',
      '2026-02-15',
    ]);
    for (const session of event.sessions) {
      expect(session).toMatchObject({
        startTime: '00:00',
        endTime: null,
        status: 'scheduled',
      });
    }
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
      .send({ date: '2026-03-08', kind: 'cancelled', note: 'Snow' });
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
    expect(listed.body.items).toHaveLength(1);
    const event = listed.body.items[0];
    expect(event.startDate).toBe('2026-03-01');
    expect(event.endDate).toBe('2026-03-15');
    expect(event.timezone).toBe('Africa/Lagos');
    expect(event.sessions.map((session: { date: string }) => session.date)).toEqual([
      '2026-03-01',
      '2026-03-11',
      '2026-03-15',
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

  it('keeps the series parent number when generation runs after a manual number', async () => {
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
        startTime: '17:00',
        venueType: 'auditorium',
        occurrences: [{ date: '2026-06-01' }],
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
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].eventNo).toMatch(/^EVT-2026-\d{3}$/);
    expect(listed.body.items[0].eventNo).not.toBe('EVT-2026-777');
  });
});
