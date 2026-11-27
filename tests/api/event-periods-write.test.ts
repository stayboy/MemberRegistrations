import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { periodById } from '../../src/domain/periods.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

/**
 * The period write half (member-registrations-event-periods.md, "Named
 * periods"): a period create resolves to ordinary occurrences, records its
 * provenance, previews the same dates, filters the list and generates later
 * windows through the same 90-day expand step a recurrence uses.
 */
let harness: TestApp;
let app: TestApp['app'];

function createEvent(body: Record<string, unknown>) {
  return request(app).post('/v1/events').set(writeHeaders).send(body);
}

function periodCreate(period: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return createEvent({
    name: 'Period Service',
    timezone: 'UTC',
    venueType: 'auditorium',
    startTime: '09:00',
    period,
    ...overrides,
  });
}

function preview(period: Record<string, unknown>) {
  return request(app).post('/v1/events/preview').set(writeHeaders).send({ period });
}

async function storedDates(eventId: string): Promise<string[]> {
  const rows = await harness.db.query<{ date: string }>(
    'select date::text as date from event_occurrences where event_id = $1 order by date',
    [eventId],
  );
  return rows.map((row) => row.date);
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/events with a one-off period', () => {
  it('materialises the cycle and returns its provenance', async () => {
    const response = await periodCreate(
      { id: 'communion-week', cycleMonth: '2027-01' },
      { name: 'Communion January' },
    );

    expect(response.status).toBe(201);
    expect(response.body.period).toEqual({
      id: 'communion-week',
      name: 'Communion Week',
      cycle: '2027-01',
      frequency: null,
      day: null,
    });
    expect(response.body.startDate).toBe('2026-12-28');
    expect(response.body.endDate).toBe('2027-01-03');
    expect(response.body.occurrences.map((row: { date: string }) => row.date)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    // Every occurrence is ordinary: the parent's time, scheduled, no capture.
    for (const occurrence of response.body.occurrences) {
      expect(occurrence).toMatchObject({
        startTime: '09:00',
        endTime: null,
        status: 'scheduled',
        capture: null,
        present: 0,
      });
    }

    // The provenance is stored on the event, with the name and definition snapshots.
    const [row] = await harness.db.query<{
      period_id: string;
      period_cycle: string;
      period_name: string;
      period_definition: string | null;
      period_frequency: string | null;
      period_day: string | null;
    }>(
      `select period_id, period_cycle, period_name, period_definition,
              period_frequency, period_day
         from events where id = $1`,
      [response.body.id],
    );
    expect(row).toEqual({
      period_id: 'communion-week',
      period_cycle: '2027-01',
      period_name: 'Communion Week',
      period_definition: periodById('communion-week').definition,
      period_frequency: null,
      period_day: null,
    });
  });

  it('reads a non-period event with a null period', async () => {
    const created = await createEvent({
      name: 'Plain Standalone',
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '10:00',
      occurrences: [{ date: '2027-02-14' }],
    });
    expect(created.status).toBe(201);
    expect(created.body.period).toBeNull();
  });
});

describe('POST /v1/events with a monthly period', () => {
  it('materialises every cycle in the 90-day window, with the day inside it', async () => {
    const response = await periodCreate(
      {
        id: 'communion-week',
        frequency: 'monthly',
        day: 'SUN',
        effectiveFrom: '2027-01-01',
      },
      { name: 'Miracle Sunday' },
    );

    expect(response.status).toBe(201);
    expect(response.body.period).toEqual({
      id: 'communion-week',
      name: 'Communion Week',
      cycle: null,
      frequency: 'monthly',
      day: 'SUN',
    });
    // The first Sunday on or after the anchor in each cycle inside
    // 2027-01-01..2027-03-31; the April cycle's Sunday (4 April) is outside.
    expect(response.body.occurrences.map((row: { date: string }) => row.date)).toEqual([
      '2027-01-03',
      '2027-02-07',
      '2027-03-07',
    ]);

    // `effectiveFrom` is input-only and is never stored.
    const [row] = await harness.db.query<{ period_cycle: string | null }>(
      'select period_cycle from events where id = $1',
      [response.body.id],
    );
    expect(row!.period_cycle).toBeNull();
  });

  it('anchors on today (UTC) when effectiveFrom is omitted', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const response = await periodCreate({
      id: 'communion-week',
      frequency: 'monthly',
      day: 'SUN',
    });

    expect(response.status).toBe(201);
    const dates = response.body.occurrences.map((row: { date: string }) => row.date);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) expect(date >= today).toBe(true);
  });

  it('generates the whole period when no day is given', async () => {
    const response = await periodCreate({
      id: 'communion-week',
      frequency: 'monthly',
      effectiveFrom: '2027-01-01',
    });

    expect(response.status).toBe(201);
    const dates = response.body.occurrences.map((row: { date: string }) => row.date);
    // January's week starts before the anchor, so only its on-or-after dates
    // survive; February and March contribute all seven; April's week starts in
    // March, so its first three dates fall inside the window.
    expect(dates).toHaveLength(20);
    expect(dates[0]).toBe('2027-01-01');
    expect(dates[dates.length - 1]).toBe('2027-03-31');
    for (const date of [
      '2027-02-01',
      '2027-02-02',
      '2027-02-03',
      '2027-02-04',
      '2027-02-05',
      '2027-02-06',
      '2027-02-07',
    ]) {
      expect(dates).toContain(date);
    }
  });
});

describe('period refusals', () => {
  it('refuses a day on a single-date period, naming period.day', async () => {
    const response = await periodCreate({
      id: 'home-cells',
      frequency: 'monthly',
      day: 'MON',
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('period.day');
  });

  it('refuses a period alongside occurrences', async () => {
    const response = await createEvent({
      name: 'Two Arms',
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '09:00',
      occurrences: [{ date: '2027-01-03' }],
      period: { id: 'communion-week', cycleMonth: '2027-01' },
    });

    expect(response.status).toBe(422);
    expect(response.body.detail).toContain('period');
  });

  it('refuses cycleMonth together with frequency', async () => {
    const response = await periodCreate({
      id: 'communion-week',
      cycleMonth: '2027-01',
      frequency: 'monthly',
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });
});

describe('the preview and the create agree for a period', () => {
  it('stores the one-off dates the preview showed', async () => {
    const period = { id: 'gospel-week', cycleMonth: '2027-03' };
    const reviewed = await preview(period);
    expect(reviewed.status).toBe(200);
    const previewed = reviewed.body.occurrences.map((row: { date: string }) => row.date);
    expect(previewed).toHaveLength(7);

    const created = await periodCreate(period);
    expect(created.status).toBe(201);
    expect(await storedDates(created.body.id)).toEqual(previewed);
  });

  it('stores the monthly dates the preview showed', async () => {
    const period = {
      id: 'communion-week',
      frequency: 'monthly',
      day: 'SUN',
      effectiveFrom: '2027-01-01',
    };
    const reviewed = await preview(period);
    expect(reviewed.status).toBe(200);
    const previewed = reviewed.body.occurrences.map((row: { date: string }) => row.date);
    expect(previewed).toEqual(['2027-01-03', '2027-02-07', '2027-03-07']);

    const created = await periodCreate(period);
    expect(created.status).toBe(201);
    expect(await storedDates(created.body.id)).toEqual(previewed);
  });
});

describe('GET /v1/events?period=', () => {
  it('filters the parent list on the stored period id', async () => {
    const communion = await periodCreate(
      { id: 'communion-week', cycleMonth: '2027-05' },
      { name: 'Filtered Communion' },
    );
    const homeCells = await periodCreate(
      { id: 'home-cells', cycleMonth: '2027-05' },
      { name: 'Filtered Home Cells' },
    );
    expect(communion.status).toBe(201);
    expect(homeCells.status).toBe(201);

    const filtered = await request(app)
      .get('/v1/events')
      .query({ view: 'parent', from: '2027-04-01', to: '2027-06-30', period: 'home-cells' })
      .set(readHeaders);

    expect(filtered.status).toBe(200);
    expect(filtered.body.items.map((item: { id: string }) => item.id)).toEqual([homeCells.body.id]);
  });
});

describe('POST /v1/events/generate for a period event', () => {
  it('materialises a later window and is idempotent', async () => {
    const created = await periodCreate(
      {
        id: 'communion-week',
        frequency: 'monthly',
        day: 'SUN',
        effectiveFrom: '2027-01-01',
      },
      { name: 'Generated Sundays' },
    );
    expect(created.status).toBe(201);
    expect(created.body.occurrences.map((row: { date: string }) => row.date)).toEqual([
      '2027-01-03',
      '2027-02-07',
      '2027-03-07',
    ]);

    // Draft events are not generated; activate it first, as the register does.
    const activated = await request(app)
      .patch(`/v1/events/${created.body.id}`)
      .set(writeHeaders)
      .send({ status: 'active' });
    expect(activated.status).toBe(200);

    const first = await request(app)
      .post('/v1/events/generate')
      .query({ from: '2027-04-01', to: '2027-06-30' })
      .set(writeHeaders);
    expect(first.status).toBe(200);
    expect(first.body.created).toBe(3);
    expect(first.body.eventIds).toContain(created.body.id);

    expect(await storedDates(created.body.id)).toEqual([
      '2027-01-03',
      '2027-02-07',
      '2027-03-07',
      '2027-04-04',
      '2027-05-02',
      '2027-06-06',
    ]);

    // A re-run inserts nothing and never rewrites a past date.
    const second = await request(app)
      .post('/v1/events/generate')
      .query({ from: '2027-04-01', to: '2027-06-30' })
      .set(writeHeaders);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ created: 0, skipped: 3, eventIds: [] });
    expect(await storedDates(created.body.id)).toEqual([
      '2027-01-03',
      '2027-02-07',
      '2027-03-07',
      '2027-04-04',
      '2027-05-02',
      '2027-06-06',
    ]);
  });
});
