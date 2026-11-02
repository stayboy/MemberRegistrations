import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];
let seriesId: string;

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const created = await request(app).post('/v1/members').set(writeHeaders).send({
    memberNo: 'M-5001',
    firstName: 'Ama',
    lastName: 'Mensah',
    gender: 'female',
    joinedOn: '2026-01-01',
  });
  expect(created.status).toBe(201);

  const series = await request(app)
    .post('/v1/series')
    .set(writeHeaders)
    .send({
      name: 'Sunday Main English Service',
      description: '08:00, English',
      schedule: {
        effectiveFrom: '2026-01-04',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2026-02-01',
      },
    });

  expect(series.status).toBe(201);
  seriesId = series.body.id as string;
});

afterAll(async () => {
  await harness.close();
});

describe('series and occurrences', () => {
  it('rejects COUNT inside the recurrence rule', async () => {
    const response = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Bad Rule',
        schedule: { effectiveFrom: '2026-01-04', rrule: 'FREQ=WEEKLY;COUNT=5' },
      });

    expect(response.status).toBe(422);
  });

  it('resolves the Sundays the series met', async () => {
    const response = await request(app)
      .get(`/v1/series/${seriesId}/occurrences`)
      .query({ from: '2026-01-01', to: '2026-02-10' })
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body.dates).toEqual([
      '2026-01-04',
      '2026-01-11',
      '2026-01-18',
      '2026-01-25',
      '2026-02-01',
    ]);
  });
});

describe('attendance counts', () => {
  it('records a manual entry and reports attended out of expected', async () => {
    for (const date of ['2026-01-04', '2026-01-18']) {
      const response = await request(app)
        .post('/v1/members/M-5001/attendance')
        .set(writeHeaders)
        .send({ seriesId, date });
      expect(response.status).toBe(201);
      expect(response.body.source).toBe('manual');
    }

    const attendance = await request(app).get('/v1/members/M-5001/attendance').set(readHeaders);

    const entry = attendance.body.series[0];
    expect(entry.seriesName).toBe('Sunday Main English Service');
    expect(entry.attended).toBe(2);
    expect(entry.expected).toBe(5);
    expect(entry.status).toBe('completed');
  });

  it('refuses a date the series did not meet', async () => {
    const response = await request(app)
      .post('/v1/members/M-5001/attendance')
      .set(writeHeaders)
      .send({ seriesId, date: '2026-01-07' });

    expect(response.status).toBe(422);
  });

  it('rejects a duplicate manual entry', async () => {
    const response = await request(app)
      .post('/v1/members/M-5001/attendance')
      .set(writeHeaders)
      .send({ seriesId, date: '2026-01-04' });

    expect(response.status).toBe(409);
  });

  it('drops a cancelled date from the denominator', async () => {
    await request(app)
      .post(`/v1/series/${seriesId}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-01-11', kind: 'cancelled' })
      .expect(201);

    const attendance = await request(app).get('/v1/members/M-5001/attendance').set(readHeaders);

    expect(attendance.body.series[0].expected).toBe(4);
    expect(attendance.body.series[0].attended).toBe(2);
  });
});

describe('imports', () => {
  const events = [
    { date: '2026-01-04', eventno: 'E-04', eventname: 'Sunday Main English Service' },
    { date: '2026-01-18', eventno: 'E-18', eventname: 'Sunday Main English Service' },
    { date: '2026-01-25', eventno: 'E-25', eventname: 'Sunday Main English Service' },
    { date: '2026-02-01', eventno: 'E-01', eventname: 'Sunday Main English Service' },
  ];

  it('rejects an unknown series name without applying anything', async () => {
    const response = await request(app)
      .post('/v1/imports/events')
      .set(writeHeaders)
      .send({ rows: [...events, { date: '2026-02-08', eventno: 'X', eventname: 'Unknown' }] });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('Unknown');

    const occurrences = await request(app)
      .get(`/v1/series/${seriesId}/occurrences`)
      .query({ from: '2026-01-01', to: '2026-02-10' })
      .set(readHeaders);

    // Unchanged: the whole import rolled back.
    expect(occurrences.body.dates).toHaveLength(4);
  });

  it('applies an event list idempotently', async () => {
    const first = await request(app)
      .post('/v1/imports/events')
      .set(writeHeaders)
      .send({ rows: events });
    expect(first.status).toBe(201);
    expect(first.body.rowCount).toBe(4);

    const second = await request(app)
      .post('/v1/imports/events')
      .set(writeHeaders)
      .send({ rows: events });
    expect(second.status).toBe(201);

    const batch = await request(app).get(`/v1/imports/${second.body.id}`).set(readHeaders);
    expect(batch.body.checksum).toBe(second.body.checksum);
  });

  it('rejects attendance rows for unknown event numbers', async () => {
    const response = await request(app)
      .post('/v1/imports/attendance')
      .set(writeHeaders)
      .send({ rows: [{ memberno: 'M-5001', date: '2026-01-04', eventno: 'NOPE' }] });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
  });

  it('does not overwrite a manual entry, and adds the missing ones', async () => {
    const response = await request(app)
      .post('/v1/imports/attendance')
      .set(writeHeaders)
      .send({
        rows: [
          { memberno: 'M-5001', date: '2026-01-04', eventno: 'E-04' },
          { memberno: 'M-5001', date: '2026-01-18', eventno: 'E-18' },
          { memberno: 'M-5001', date: '2026-01-25', eventno: 'E-25' },
        ],
      });

    expect(response.status).toBe(201);

    const attendance = await request(app).get('/v1/members/M-5001/attendance').set(readHeaders);
    const byDate = new Map(
      attendance.body.series[0].entries.map((entry: { date: string; source: string }) => [
        entry.date,
        entry.source,
      ]),
    );

    expect(byDate.get('2026-01-04')).toBe('manual');
    expect(byDate.get('2026-01-18')).toBe('manual');
    expect(byDate.get('2026-01-25')).toBe('import');
    expect(attendance.body.series[0].attended).toBe(3);
  });

  it('suppresses a deleted imported entry against the next import', async () => {
    const attendance = await request(app).get('/v1/members/M-5001/attendance').set(readHeaders);
    const imported = attendance.body.series[0].entries.find(
      (entry: { date: string }) => entry.date === '2026-01-25',
    );

    await request(app)
      .delete(`/v1/members/M-5001/attendance/${imported.id}`)
      .set(writeHeaders)
      .expect(204);

    await request(app)
      .post('/v1/imports/attendance')
      .set(writeHeaders)
      .send({
        rows: [
          { memberno: 'M-5001', date: '2026-01-25', eventno: 'E-25' },
          { memberno: 'M-5001', date: '2026-02-01', eventno: 'E-01' },
        ],
      })
      .expect(201);

    const after = await request(app).get('/v1/members/M-5001/attendance').set(readHeaders);
    const dates = after.body.series[0].entries.map((entry: { date: string }) => entry.date);

    expect(dates).not.toContain('2026-01-25');
    expect(dates).toContain('2026-02-01');
    expect(after.body.series[0].attended).toBe(3);
  });
});
