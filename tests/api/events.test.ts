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
