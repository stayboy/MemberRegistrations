import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { reachableContacts } from '../helpers/member-fixtures.js';

/**
 * `GET /v1/events/periods` and `POST /v1/events/preview` (member-registrations-event-periods.md,
 * "Named periods" and AC 4, 10, 11). The preview writes nothing: the dates it
 * reports are the dates a create would then store, and `expected` is the
 * intersection of the audience set, never a sum of the audiences.
 */
let harness: TestApp;
let app: TestApp['app'];

let everyoneId: string;
let choirId: string;

async function audienceByKey(key: string): Promise<string> {
  const [audience] = await harness.db.query<{ id: string }>(
    'select id from audiences where system_key = $1',
    [key],
  );
  expect(audience).toBeTruthy();
  return audience!.id;
}

function createMember(memberNo: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Preview',
      lastName: memberNo,
      joinedOn: '2020-01-01',
      contacts: reachableContacts(),
      ...extra,
    });
}

async function writeCounts(): Promise<{ events: number; schedules: number; occurrences: number }> {
  const [row] = await harness.db.query<{
    events: number | string;
    schedules: number | string;
    occurrences: number | string;
  }>(
    `select (select count(*) from events) as events,
            (select count(*) from event_recurrence_versions) as schedules,
            (select count(*) from event_occurrences) as occurrences`,
  );
  return {
    events: Number(row!.events),
    schedules: Number(row!.schedules),
    occurrences: Number(row!.occurrences),
  };
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  everyoneId = await audienceByKey('everyone');
  choirId = await audienceByKey('ministry:CHOIR');

  // Everyone is 2 members and Choir is 1, so the intersection is 1: neither the
  // primary audience's count nor the sum of the audiences.
  expect((await createMember('PV-CHOIR', { ministries: ['CHOIR'] })).status).toBe(201);
  expect((await createMember('PV-PLAIN')).status).toBe(201);
});

afterAll(async () => {
  await harness.close();
});

describe('GET /v1/events/periods', () => {
  it('serves the three declared periods from the code catalogue', async () => {
    const response = await request(app).get('/v1/events/periods').set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.items).toEqual([
      {
        id: 'communion-week',
        name: 'Communion Week',
        definition:
          'The week of the monthly communion service: week 1 of the cycle month, the seven days ending on that month’s first Sunday.',
        dates: 'week',
      },
      {
        id: 'gospel-week',
        name: 'Gospel Week',
        definition:
          'The last week of the month before, when ministries hold their meetings: the week before Communion Week.',
        dates: 'week',
      },
      {
        id: 'home-cells',
        name: 'Home Cells',
        definition:
          'The Monday of week 1 of the cycle month - the Monday of Communion Week, one date.',
        dates: 'date',
      },
    ]);
  });
});

describe('POST /v1/events/preview', () => {
  it('resolves a recurrence to the dates a create would store, with an extra date', async () => {
    const before = await writeCounts();

    const response = await request(app)
      .post('/v1/events/preview')
      .set(writeHeaders)
      .send({
        audienceIds: [everyoneId, choirId],
        recurrence: {
          schedules: [
            {
              effectiveFrom: '2027-01-04',
              rrule: 'FREQ=WEEKLY;BYDAY=MO,TH,FR',
              endsOn: '2027-01-15',
            },
          ],
          exceptions: [{ date: '2027-01-06', kind: 'extra', note: 'Epiphany' }],
        },
      });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.occurrences).toEqual([
      { date: '2027-01-04', expected: 1 },
      { date: '2027-01-06', expected: 1 },
      { date: '2027-01-07', expected: 1 },
      { date: '2027-01-08', expected: 1 },
      { date: '2027-01-11', expected: 1 },
      { date: '2027-01-14', expected: 1 },
      { date: '2027-01-15', expected: 1 },
    ]);
    expect(response.body.audienceCounts).toEqual([
      { id: everyoneId, count: 2 },
      { id: choirId, count: 1 },
    ]);

    // The headline is the intersection, not the primary and not the sum.
    const sum = response.body.audienceCounts.reduce(
      (total: number, item: { count: number }) => total + item.count,
      0,
    );
    expect(sum).toBe(3);
    expect(response.body.occurrences[0].expected).toBe(1);
    expect(response.body.occurrences[0].expected).not.toBe(sum);

    // Nothing was persisted.
    expect(await writeCounts()).toEqual(before);
  });

  it('resolves a named period to its enumerated dates', async () => {
    const before = await writeCounts();

    const response = await request(app)
      .post('/v1/events/preview')
      .set(writeHeaders)
      .send({
        audienceIds: [everyoneId],
        period: { id: 'communion-week', cycleMonth: '2027-01' },
      });

    expect(response.status).toBe(200);
    expect(response.body.occurrences.map((row: { date: string }) => row.date)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(response.body.occurrences.every((row: { expected: number }) => row.expected === 2)).toBe(
      true,
    );
    expect(response.body.audienceCounts).toEqual([{ id: everyoneId, count: 2 }]);

    expect(await writeCounts()).toEqual(before);
  });

  it('takes the audienceId one-element alias like the create does', async () => {
    const response = await request(app)
      .post('/v1/events/preview')
      .set(writeHeaders)
      .send({
        audienceId: choirId,
        period: { id: 'home-cells', cycleMonth: '2027-01' },
      });

    expect(response.status).toBe(200);
    expect(response.body.occurrences).toEqual([{ date: '2026-12-28', expected: 1 }]);
    expect(response.body.audienceCounts).toEqual([{ id: choirId, count: 1 }]);
  });

  it('refuses a preview with neither a recurrence nor a period', async () => {
    const response = await request(app)
      .post('/v1/events/preview')
      .set(writeHeaders)
      .send({ audienceIds: [everyoneId] });

    expect(response.status).toBe(422);
  });

  it('refuses a preview with both a recurrence and a period', async () => {
    const response = await request(app)
      .post('/v1/events/preview')
      .set(writeHeaders)
      .send({
        recurrence: { schedules: [{ effectiveFrom: '2027-01-04', rrule: 'FREQ=WEEKLY;BYDAY=MO' }] },
        period: { id: 'communion-week', cycleMonth: '2027-01' },
      });

    expect(response.status).toBe(422);
  });
});

describe('the preview and the create agree', () => {
  it('stores the same dates the preview showed', async () => {
    const input = {
      audienceIds: [everyoneId, choirId],
      recurrence: {
        schedules: [
          { effectiveFrom: '2027-02-01', rrule: 'FREQ=WEEKLY;BYDAY=MO,TH', endsOn: '2027-02-12' },
        ],
      },
    };

    const preview = await request(app).post('/v1/events/preview').set(writeHeaders).send(input);
    expect(preview.status).toBe(200);
    const previewed = preview.body.occurrences.map((row: { date: string }) => row.date);
    expect(previewed).toEqual(['2027-02-01', '2027-02-04', '2027-02-08', '2027-02-11']);

    const created = await request(app)
      .post('/v1/events')
      .set(writeHeaders)
      .send({
        name: 'Preview Agreement Service',
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '09:00',
        ...input,
      });
    expect(created.status).toBe(201);

    const stored = await harness.db.query<{ date: string }>(
      'select date::text as date from event_occurrences where event_id = $1 order by date',
      [created.body.id],
    );
    expect(stored.map((row) => row.date)).toEqual(previewed);
    // The schedule is stored with WKST=SU only when it carries an interval;
    // this one has none, so the stored body is the client's.
    expect(created.body.recurrence.schedules[0].rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TH');
  });
});
