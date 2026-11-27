import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVENT_PERIODS } from '../../src/domain/periods.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

/**
 * The wire split of the event read's `period` (member-registrations-event-periods.md,
 * "The detail read carries it, and only the detail"; owner, 2026-11-27): the single
 * event read carries `dates` and `definition`, and a list row carries the
 * provenance alone - the list reuses the parent schema, so a field there would be
 * paid on every row.
 */
let harness: TestApp;
let app: TestApp['app'];

const WINDOW = { from: '2026-11-01', to: '2027-03-31' };

function createPeriodEvent(period: Record<string, unknown>, name: string) {
  return request(app).post('/v1/events').set(writeHeaders).send({
    name,
    timezone: 'UTC',
    venueType: 'auditorium',
    startTime: '09:00',
    period,
  });
}

function parentDetail(id: string) {
  return request(app)
    .get(`/v1/events/${id}`)
    .query({ view: 'parent', ...WINDOW })
    .set(readHeaders);
}

function parentList() {
  return request(app)
    .get('/v1/events')
    .query({ view: 'parent', ...WINDOW })
    .set(readHeaders);
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

describe('the single event read carries the period’s shape and prose', () => {
  it('serves the catalogue’s `dates` and `definition` for every seeded period', async () => {
    for (const seeded of EVENT_PERIODS) {
      const created = await createPeriodEvent(
        { id: seeded.id, cycleMonth: '2027-01' },
        `Detail ${seeded.id}`,
      );
      expect(created.status).toBe(201);

      const read = await parentDetail(created.body.id);
      expect(read.status).toBe(200);
      expect(read.body.period).toMatchObject({
        id: seeded.id,
        name: seeded.name,
        cycle: '2027-01',
        frequency: null,
        day: null,
        dates: seeded.dates,
        definition: seeded.definition,
      });
    }
  });

  it('serves the shape the stored dates actually have for a monthly rule', async () => {
    // A named day inside each cycle stores one date per cycle, so the event reads
    // `date` even though the period's rule spans a week: `dates` describes the
    // event, and the line uses the day rather than the span when one is named.
    const withDay = await createPeriodEvent(
      { id: 'communion-week', frequency: 'monthly', day: 'SUN', effectiveFrom: '2027-01-01' },
      'Detail Monthly Communion Sunday',
    );
    expect(withDay.status).toBe(201);
    const dayRead = await parentDetail(withDay.body.id);
    expect(dayRead.status).toBe(200);
    expect(dayRead.body.period).toMatchObject({
      id: 'communion-week',
      frequency: 'monthly',
      day: 'SUN',
      dates: 'date',
    });

    // The whole week (no day) stores its seven dates, so it reads `week`.
    const wholeWeek = await createPeriodEvent(
      { id: 'communion-week', frequency: 'monthly', effectiveFrom: '2027-01-01' },
      'Detail Monthly Communion Week',
    );
    expect(wholeWeek.status).toBe(201);
    const weekRead = await parentDetail(wholeWeek.body.id);
    expect(weekRead.status).toBe(200);
    expect(weekRead.body.period).toMatchObject({
      id: 'communion-week',
      frequency: 'monthly',
      day: null,
      dates: 'week',
    });
  });

  it('serves a null period for an event not created from one', async () => {
    const created = await request(app)
      .post('/v1/events')
      .set(writeHeaders)
      .send({
        name: 'Detail Standalone',
        timezone: 'UTC',
        venueType: 'auditorium',
        startTime: '09:00',
        occurrences: [{ date: '2027-02-14' }],
      });
    expect(created.status).toBe(201);

    const read = await parentDetail(created.body.id);
    expect(read.status).toBe(200);
    expect(read.body.period).toBeNull();
  });
});

describe('the list rows carry the provenance alone', () => {
  it('omits `dates` and `definition` from every period row, and keeps the rest', async () => {
    const created = await createPeriodEvent(
      { id: 'communion-week', cycleMonth: '2027-01' },
      'List Communion January',
    );
    expect(created.status).toBe(201);

    const page = await parentList();
    expect(page.status).toBe(200);
    const row = (
      page.body.items as Array<{ id: string; period: Record<string, unknown> | null }>
    ).find((item) => item.id === created.body.id);
    expect(row?.period).toMatchObject({
      id: 'communion-week',
      name: 'Communion Week',
      cycle: '2027-01',
      frequency: null,
      day: null,
    });
    expect(row?.period).not.toHaveProperty('dates');
    expect(row?.period).not.toHaveProperty('definition');
  });
});
