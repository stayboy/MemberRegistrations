import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../src/errors/domain-errors.js';
import { SeriesRepository } from '../../src/repos/series.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let series: SeriesRepository;

const weekly = { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;BYDAY=SU' };

beforeAll(async () => {
  harness = await createTestApp();
  series = new SeriesRepository(harness.db);
});

afterAll(async () => {
  await harness.close();
});

describe('series through Drizzle', () => {
  it('serves the unchanged HTTP contract', async () => {
    const created = await request(harness.app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Sunday Service',
        ministryCode: 'CHOIR',
        timezone: 'Africa/Lagos',
        description: 'Weekly gathering',
        schedule: { ...weekly, endsOn: '2026-02-01' },
      });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'Sunday Service',
      ministry: { code: 'CHOIR', name: 'Choir' },
      presbyterOnly: false,
      timezone: 'Africa/Lagos',
      description: 'Weekly gathering',
      archivedAt: null,
      schedules: [
        { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: '2026-02-01' },
      ],
      exceptions: [],
    });

    const read = await request(harness.app).get(`/v1/series/${created.body.id}`).set(readHeaders);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(created.body);

    const listed = await request(harness.app).get('/v1/series').set(readHeaders);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toContainEqual(created.body);

    const updated = await request(harness.app)
      .put(`/v1/series/${created.body.id}`)
      .set(writeHeaders)
      .send({ name: 'Sunday Gathering' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Sunday Gathering');

    const archived = await request(harness.app)
      .put(`/v1/series/${created.body.id}`)
      .set(writeHeaders)
      .send({ archived: true });
    expect(archived.body.archivedAt).not.toBeNull();

    const active = await request(harness.app).get('/v1/series').set(readHeaders);
    expect(active.body.items).not.toContainEqual(archived.body);
    const all = await request(harness.app).get('/v1/series?includeArchived=true').set(readHeaders);
    expect(all.body.items).toContainEqual(archived.body);
  });

  it('lets exactly one concurrent schedule append win', async () => {
    const created = await series.create({ name: 'Concurrent schedule', ...weekly }, 'test');
    const results = await Promise.allSettled([
      series.addSchedule(created.id, { effectiveFrom: '2026-03-01', rrule: weekly.rrule }, 'test'),
      series.addSchedule(created.id, { effectiveFrom: '2026-03-01', rrule: weekly.rrule }, 'test'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });

  it('keeps exception writes idempotent and deletes once', async () => {
    const created = await series.create({ name: 'Exception series', ...weekly }, 'test');
    const exception = { date: '2026-01-11', kind: 'cancelled' as const, note: 'Snow' };

    await expect(series.setException(created.id, exception, 'test')).resolves.toBeTruthy();
    await expect(series.setException(created.id, exception, 'test')).resolves.toBeTruthy();

    const loaded = await series.require(created.id);
    expect(loaded.exceptions.filter((row) => row.date === exception.date)).toEqual([exception]);

    await expect(series.removeException(created.id, exception.date)).resolves.toBeUndefined();
    await expect(series.removeException(created.id, exception.date)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('still resolves occurrences through the raw engine', async () => {
    const created = await series.create(
      { name: 'Occurrence series', ...weekly, endsOn: '2026-02-01' },
      'test',
    );

    expect(await series.occurrences(created.id, '2026-01-01', '2026-03-01')).toEqual([
      '2026-01-04',
      '2026-01-11',
      '2026-01-18',
      '2026-01-25',
      '2026-02-01',
    ]);

    await series.setException(
      created.id,
      { date: '2026-01-18', kind: 'cancelled', note: 'Weather' },
      'test',
    );
    expect(await series.occurrences(created.id, '2026-01-01', '2026-03-01')).toEqual([
      '2026-01-04',
      '2026-01-11',
      '2026-01-25',
      '2026-02-01',
    ]);
  });
});
