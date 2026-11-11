import request from 'supertest';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];
let seriesId: string;

/** 1 January `years` ago: exactly `years` completed years on any later date. */
function dobYearsAgo(years: number): string {
  return `${new Date().getUTCFullYear() - years}-01-01`;
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const created = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo: 'M-5001',
      firstName: 'Ama',
      lastName: 'Mensah',
      gender: 'female',
      dob: dobYearsAgo(30),
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
      .send({ date: '2026-01-11', kind: 'cancelled', note: 'Public holiday' })
      .expect(201);

    const attendance = await request(app).get('/v1/members/M-5001/attendance').set(readHeaders);

    expect(attendance.body.series[0].expected).toBe(4);
    expect(attendance.body.series[0].attended).toBe(2);
  });
});

describe('imports', () => {
  const events = new Map<string, { id: string; eventNo: string }>();
  let cancelledEventId: string;

  function event(date: string): { id: string; eventNo: string } {
    const value = events.get(date);
    if (!value) throw new Error(`No generated event for ${date}`);
    return value;
  }

  function importAttendance(body: {
    eventId: string;
    sessionDate: string;
    rows: Array<{ memberNo: string; datetime?: string }>;
  }) {
    return request(app).post('/v1/imports/attendance').set(writeHeaders).send(body);
  }

  beforeAll(async () => {
    const generated = await request(app)
      .post('/v1/events/generate')
      .query({ from: '2026-01-01', to: '2026-02-10' })
      .set(writeHeaders);
    expect(generated.status).toBe(200);

    const listed = await request(app)
      .get('/v1/events')
      .query({ seriesId, from: '2026-01-01', to: '2026-02-10', limit: 100 })
      .set(readHeaders);
    expect(listed.status).toBe(200);

    for (const entry of listed.body.items as Array<{
      id: string;
      startDate: string;
      eventNo: string | null;
    }>) {
      if (entry.eventNo) events.set(entry.startDate, { id: entry.id, eventNo: entry.eventNo });
    }

    // 2026-01-11 is cancelled by the attendance-counts suite.
    expect(events.size).toBe(4);

    const [cancelled] = await harness.db.query<{ id: string }>(
      `insert into event_instances (
         event_no, name, timezone, start_date, end_date, start_time, venue_type, status, source, sessions
       )
       values ('EVT-2026-090','Cancelled Import Event','UTC','2026-02-08','2026-02-08',
               '09:00','auditorium','cancelled','manual',
               '[{"date":"2026-02-08","status":"scheduled"}]'::jsonb)
       returning id`,
    );
    cancelledEventId = cancelled!.id;
  });

  it('retires the event-list import', async () => {
    const response = await request(app)
      .post('/v1/imports/events')
      .set(writeHeaders)
      .send({ rows: [] });

    expect(response.status).toBe(404);
  });

  it('rejects an unknown event id, and adds nothing', async () => {
    const unknownId = '00000000-0000-4000-8000-000000000000';
    const response = await importAttendance({
      eventId: unknownId,
      sessionDate: '2026-01-25',
      rows: [{ memberNo: 'M-5001' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain(unknownId);
    expect(response.body).not.toHaveProperty('rows');

    const [row] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from import_batches where event_instance_id = $1',
      [unknownId],
    );
    expect(Number(row!.count)).toBe(0);
  });

  it('does not overwrite a manual entry, and counts the manual row as skipped', async () => {
    const target = event('2026-01-04');
    const response = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-01-04',
      rows: [{ memberNo: 'M-5001' }],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      kind: 'attendance',
      rowCount: 1,
      eventInstanceId: target.id,
      sessionDate: '2026-01-04',
      written: 0,
      skipped: 1,
    });

    const stored = await request(app).get(`/v1/imports/${response.body.id}`).set(readHeaders);
    expect(stored.status).toBe(200);
    expect(stored.body).toMatchObject({
      eventInstanceId: target.id,
      sessionDate: '2026-01-04',
      written: 0,
      skipped: 1,
    });

    const attendance = await request(app).get('/v1/members/M-5001/attendance').set(readHeaders);
    const entry = attendance.body.series[0].entries.find(
      (row: { date: string }) => row.date === '2026-01-04',
    );
    expect(entry.source).toBe('manual');
  });

  it('imports a date-only file, leaves sessionTime null, and records the occurrence', async () => {
    const target = event('2026-01-25');
    const response = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-01-25',
      rows: [{ memberNo: 'M-5001' }],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      eventInstanceId: target.id,
      sessionDate: '2026-01-25',
      written: 1,
      skipped: 0,
    });

    const report = await request(app)
      .get(`/v1/events/${target.id}/attendance`)
      .query({ date: '2026-01-25' })
      .set(readHeaders);

    expect(report.status).toBe(200);
    const [row] = await harness.db.query<{ id: string }>(
      'select id from attendance where event_instance_id = $1 and session_date = $2',
      [target.id, '2026-01-25'],
    );
    expect(report.body.rows).toEqual([
      {
        id: row!.id,
        memberNo: 'M-5001',
        name: 'Ama Mensah',
        gender: 'female',
        age: 30,
        status: 'present',
        source: 'import',
        sessionTime: null,
      },
    ]);
  });

  it('serves the targeted occurrence and counts on the batch record', async () => {
    const target = event('2026-02-01');
    const created = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-02-01',
      rows: [{ memberNo: 'M-5001', datetime: '2026-02-01T12:00' }],
    });
    expect(created.status).toBe(201);

    const response = await request(app).get(`/v1/imports/${created.body.id}`).set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body.eventInstanceId).toBe(target.id);
    expect(response.body.sessionDate).toBe('2026-02-01');
    expect(response.body.written).toBe(1);
    expect(response.body.skipped).toBe(0);
  });

  it('stores a time from the datetime and exposes it in the event report', async () => {
    const target = event('2026-02-01');
    const response = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-02-01',
      rows: [{ memberNo: 'M-5001', datetime: '2026-02-01 09:15:30' }],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ written: 1, skipped: 0 });

    const report = await request(app)
      .get(`/v1/events/${target.id}/attendance`)
      .query({ date: '2026-02-01' })
      .set(readHeaders);

    const [row] = await harness.db.query<{ id: string }>(
      'select id from attendance where event_instance_id = $1 and session_date = $2',
      [target.id, '2026-02-01'],
    );
    expect(report.body.rows).toEqual([
      {
        id: row!.id,
        memberNo: 'M-5001',
        name: 'Ama Mensah',
        gender: 'female',
        age: 30,
        status: 'present',
        source: 'import',
        sessionTime: '09:15',
      },
    ]);
  });

  it('imports a lowercase-t datetime and stores the time', async () => {
    const target = event('2026-02-01');
    const response = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-02-01',
      rows: [{ memberNo: 'M-5001', datetime: '2026-02-01t11:45' }],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ written: 1, skipped: 0 });

    const report = await request(app)
      .get(`/v1/events/${target.id}/attendance`)
      .query({ date: '2026-02-01' })
      .set(readHeaders);

    expect(report.body.rows[0].sessionTime).toBe('11:45');
  });

  it('rejects a datetime on another date, names the row, and writes nothing', async () => {
    const target = event('2026-01-18');
    const response = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-01-18',
      rows: [{ memberNo: 'M-5001', datetime: '2026-01-25T09:00' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('Row 1');
    expect(response.body.detail).toContain('2026-01-25');
    expect(response.body.detail).toContain('2026-01-18');
    expect(response.body.rows).toEqual([
      {
        row: 1,
        message:
          'datetime 2026-01-25T09:00 is on 2026-01-25, but the selected session is 2026-01-18',
      },
    ]);

    const [batch] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from import_batches where event_instance_id = $1',
      [target.id],
    );
    expect(Number(batch!.count)).toBe(0);

    const [attendance] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from attendance where event_instance_id = $1',
      [target.id],
    );
    // The manual row from the attendance-counts suite is untouched.
    expect(Number(attendance!.count)).toBe(1);
  });

  it('names every row whose datetime falls outside the selected session, keeping the first in detail', async () => {
    const target = event('2026-01-18');
    const response = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-01-18',
      rows: [
        { memberNo: 'M-5001', datetime: '2026-01-25T09:00' },
        { memberNo: 'M-5002', datetime: '2026-01-25T09:05' },
        { memberNo: 'M-5003', datetime: '2026-01-18T09:10' },
      ],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toBe(
      'Row 1: datetime 2026-01-25T09:00 is on 2026-01-25, but the selected session is 2026-01-18',
    );
    expect(response.body.rows).toEqual([
      {
        row: 1,
        message:
          'datetime 2026-01-25T09:00 is on 2026-01-25, but the selected session is 2026-01-18',
      },
      {
        row: 2,
        message:
          'datetime 2026-01-25T09:05 is on 2026-01-25, but the selected session is 2026-01-18',
      },
    ]);
  });

  it('rejects a cancelled event, and writes nothing', async () => {
    const response = await importAttendance({
      eventId: cancelledEventId,
      sessionDate: '2026-02-08',
      rows: [{ memberNo: 'M-5001' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('cancelled');
    // A cancelled event is a batch-level failure, so there is no row list.
    expect(response.body).not.toHaveProperty('rows');

    const [batch] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from import_batches where event_instance_id = $1',
      [cancelledEventId],
    );
    expect(Number(batch!.count)).toBe(0);

    const [attendance] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from attendance where event_instance_id = $1',
      [cancelledEventId],
    );
    expect(Number(attendance!.count)).toBe(0);
  });

  it('rejects an unknown member and adds nothing', async () => {
    const target = event('2026-01-25');
    const response = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-01-25',
      rows: [{ memberNo: 'M-9999' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('M-9999');
    expect(response.body.rows).toEqual([{ row: 1, message: 'Unknown member number M-9999' }]);

    const [attendance] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from attendance
       where event_instance_id = $1 and session_date = '2026-01-25'`,
      [target.id],
    );
    expect(Number(attendance!.count)).toBe(1);
  });

  it('rejects a duplicate memberNo in one file and writes nothing', async () => {
    const target = event('2026-01-18');
    const response = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-01-18',
      rows: [{ memberNo: 'M-5001' }, { memberNo: 'M-5001' }],
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('M-5001');
    expect(response.body.detail).toContain('rows 1, 2');
    expect(response.body.rows).toEqual([
      { row: 1, message: 'Duplicate memberNo M-5001 (rows 1, 2)' },
      { row: 2, message: 'Duplicate memberNo M-5001 (rows 1, 2)' },
    ]);

    const [batch] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from import_batches where event_instance_id = $1',
      [target.id],
    );
    expect(Number(batch!.count)).toBe(0);

    const [attendance] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from attendance where event_instance_id = $1',
      [target.id],
    );
    // Only the manual row from the attendance-counts suite remains.
    expect(Number(attendance!.count)).toBe(1);
  });

  it('refuses the same occurrence and rows twice with the first batch id', async () => {
    const target = event('2026-02-01');
    const body = {
      eventId: target.id,
      sessionDate: '2026-02-01',
      rows: [{ memberNo: 'M-5001', datetime: '2026-02-01T10:30' }],
    };

    const first = await importAttendance(body);
    expect(first.status).toBe(201);

    const second = await importAttendance(body);
    expect(second.status).toBe(409);
    expect(second.headers['content-type']).toContain('application/problem+json');
    expect(second.body.code).toBe('conflict');
    expect(second.body.batchId).toBe(first.body.id);
    expect(second.body.detail).toContain(first.body.id);
    expect(second.body).not.toHaveProperty('rows');

    const [rows] = await harness.db.query<{ count: number | string }>(
      "select count(*)::int as count from import_batches where kind = 'attendance' and checksum = $1",
      [first.body.checksum],
    );
    expect(Number(rows!.count)).toBe(1);
  });

  it('honours a deleted imported row suppression on a later import', async () => {
    const target = event('2026-01-25');
    const [imported] = await harness.db.query<{ id: string }>(
      `select a.id from attendance a
       join members m on m.id = a.member_id
       where m.member_no = 'M-5001' and a.event_instance_id = $1 and a.session_date = '2026-01-25'`,
      [target.id],
    );

    await request(app)
      .delete(`/v1/events/${target.id}/attendance/${imported!.id}`)
      .set(writeHeaders)
      .expect(204);

    // A different row set has a different checksum, so the duplicate-batch
    // guard does not fire; the deletion's suppression is what stops the row.
    const again = await importAttendance({
      eventId: target.id,
      sessionDate: '2026-01-25',
      rows: [{ memberNo: 'M-5001', datetime: '2026-01-25T10:00' }],
    });
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ written: 0, skipped: 1 });

    const after = await request(app)
      .get(`/v1/events/${target.id}/attendance`)
      .query({ date: '2026-01-25' })
      .set(readHeaders);
    expect(after.body.present).toBe(0);
    expect(after.body.rows).toEqual([]);
  });
});

describe('generation backfill', () => {
  it('assigns an event number to an instance created by manual attendance', async () => {
    for (const member of [
      { memberNo: 'M-5101', firstName: 'Manual', lastName: 'First', joinedOn: '2026-12-01' },
      { memberNo: 'M-5102', firstName: 'Imported', lastName: 'Second', joinedOn: '2026-12-01' },
    ]) {
      await request(app).post('/v1/members').set(writeHeaders).send(member).expect(201);
    }

    const series = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Backfill Sunday Service',
        timezone: 'UTC',
        schedule: {
          effectiveFrom: '2026-12-06',
          rrule: 'FREQ=WEEKLY;BYDAY=SU',
          endsOn: '2026-12-06',
        },
      });
    expect(series.status).toBe(201);
    const backfillSeriesId = series.body.id as string;

    // The manual entry creates the instance before generation has numbered it.
    await request(app)
      .post('/v1/members/M-5101/attendance')
      .set(writeHeaders)
      .send({ seriesId: backfillSeriesId, date: '2026-12-06' })
      .expect(201);

    const [before] = await harness.db.query<{ id: string; event_no: string | null }>(
      `select id, event_no from event_instances
       where series_id = $1 and start_date = '2026-12-06'`,
      [backfillSeriesId],
    );
    expect(before!.event_no).toBeNull();

    const generated = await request(app)
      .post('/v1/events/generate')
      .query({ from: '2026-12-06', to: '2026-12-06' })
      .set(writeHeaders);
    expect(generated.status).toBe(200);
    expect(generated.body.created).toBe(0);
    expect(generated.body.skipped).toBe(1);

    const [after] = await harness.db.query<{ id: string; event_no: string | null }>(
      `select id, event_no from event_instances
       where series_id = $1 and start_date = '2026-12-06'`,
      [backfillSeriesId],
    );
    expect(after!.event_no).toBeTruthy();

    // The assigned number now lets an attendance import target that instance.
    await request(app)
      .post('/v1/imports/attendance')
      .set(writeHeaders)
      .send({
        eventId: before!.id,
        sessionDate: '2026-12-06',
        rows: [{ memberNo: 'M-5102' }],
      })
      .expect(201);

    const report = await request(app)
      .get(`/v1/events/${before!.id}/attendance`)
      .query({ date: '2026-12-06' })
      .set(readHeaders);
    expect(report.status).toBe(200);
    expect(report.body.present).toBe(2);
  });
});

describe('import formats and templates', () => {
  it('publishes the column contract for both kinds', async () => {
    const response = await request(app).get('/v1/imports/formats').set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.body.formats.map((format: { kind: string }) => format.kind)).toEqual([
      'members',
      'attendance',
    ]);

    const members = response.body.formats.find(
      (format: { kind: string }) => format.kind === 'members',
    );
    expect(members.columns.map((column: { name: string }) => column.name)).toEqual([
      'memberNo',
      'firstName',
      'lastName',
      'otherNames',
      'gender',
      'dob',
      'joinedOn',
      'placeOfResidence',
      'addressLine',
      'isPresbyter',
      'phone',
      'email',
    ]);
    expect(
      members.columns.find((column: { name: string }) => column.name === 'memberNo').required,
    ).toBe(true);

    const attendance = response.body.formats.find(
      (format: { kind: string }) => format.kind === 'attendance',
    );
    expect(attendance.columns.map((column: { name: string }) => column.name)).toEqual([
      'memberNo',
      'datetime',
    ]);
    expect(
      attendance.columns.find((column: { name: string }) => column.name === 'memberNo').required,
    ).toBe(true);
    expect(
      attendance.columns.find((column: { name: string }) => column.name === 'datetime').required,
    ).toBe(false);
    expect(
      attendance.columns.some(
        (column: { name: string }) => column.name === 'eventno' || column.name === 'date',
      ),
    ).toBe(false);
  });

  it.each(['members', 'attendance'])('serves a real %s workbook', async (kind) => {
    const formats = await request(app).get('/v1/imports/formats').set(readHeaders);
    const registry = formats.body.formats.find(
      (format: { kind: string }) => format.kind === kind,
    ) as { columns: Array<{ name: string }> };

    const response = await request(app)
      .get(`/v1/imports/templates/${kind}`)
      .set(readHeaders)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${kind}-import-template.xlsx"`,
    );
    expect(response.headers['cache-control']).toBe('no-store');

    const body = response.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.subarray(0, 2).toString('latin1')).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);

    const sheet = workbook.getWorksheet(kind);
    expect(sheet).toBeTruthy();
    const header = (sheet!.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(registry.columns.map((column) => column.name));
    expect((sheet!.getRow(2).values as unknown[]).slice(1)).toHaveLength(registry.columns.length);

    const notes = workbook.getWorksheet('Notes');
    expect(notes).toBeTruthy();
    expect((notes!.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Column',
      'Required',
      'Type',
      'Example',
      'Notes',
    ]);
    expect(notes!.rowCount).toBe(registry.columns.length + 3);
  });

  it('publishes the batch occurrence fields in the generated OpenAPI', async () => {
    const response = await request(app).get('/openapi.json');

    expect(response.status).toBe(200);
    const properties = response.body.components.schemas.ImportBatch.properties as Record<
      string,
      unknown
    >;
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(['eventInstanceId', 'sessionDate', 'written', 'skipped']),
    );
  });

  it('returns 404 for an unknown template kind', async () => {
    const response = await request(app).get('/v1/imports/templates/events').set(readHeaders);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });
});

describe('event attendance per session', () => {
  const EVENT_NO = 'EVT-2026-014';

  let eventId: string;
  let cancelledEventId: string;
  let cancelledSessionEventId: string;
  const memberIds: Record<string, string> = {};

  let duplicateImportBatchId: string;

  function importRows(
    eventId: string,
    sessionDate: string,
    rows: Array<{ memberNo: string; datetime?: string }>,
  ) {
    return request(app)
      .post('/v1/imports/attendance')
      .set(writeHeaders)
      .send({ eventId, sessionDate, rows });
  }

  function readReport(id: string, date: string) {
    return request(app).get(`/v1/events/${id}/attendance`).query({ date }).set(readHeaders);
  }

  function addManual(id: string, memberNo: string, date: string) {
    return request(app)
      .post(`/v1/events/${id}/attendance`)
      .set(writeHeaders)
      .send({ memberNo, date });
  }

  async function insertEvent(body: {
    eventNo: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    sessions: Array<{ date: string; status?: string }>;
  }): Promise<string> {
    const [row] = await harness.db.query<{ id: string }>(
      `insert into event_instances (
         event_no, name, timezone, start_date, end_date, start_time, venue_type, status, source, sessions
       )
       values ($1,$2,'UTC',$3,$4,'17:00','auditorium',$5,'manual',$6::jsonb)
       returning id`,
      [
        body.eventNo,
        body.name,
        body.startDate,
        body.endDate,
        body.status,
        JSON.stringify(body.sessions),
      ],
    );
    return row!.id;
  }

  beforeAll(async () => {
    const members = [
      {
        memberNo: 'M-7001',
        firstName: 'Ada',
        lastName: 'Bello',
        gender: 'female',
        dob: dobYearsAgo(30),
        joinedOn: '2026-01-01',
      },
      {
        memberNo: 'M-7002',
        firstName: 'Chika',
        lastName: 'Okafor',
        gender: 'female',
        dob: dobYearsAgo(25),
        joinedOn: '2026-10-14',
      },
      { memberNo: 'M-7003', firstName: 'Bisi', lastName: 'Adeyemi', joinedOn: '2026-10-20' },
    ];
    for (const member of members) {
      const created = await request(app).post('/v1/members').set(writeHeaders).send(member);
      expect(created.status).toBe(201);
    }

    await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'M-7004',
        firstName: 'Archived',
        lastName: 'Member',
        joinedOn: '2026-01-01',
      })
      .expect(201);
    await request(app).delete('/v1/members/M-7004').set(writeHeaders).expect(204);

    const rows = await harness.db.query<{ id: string; member_no: string }>(
      "select id, member_no from members where member_no like 'M-700%'",
    );
    for (const row of rows) memberIds[row.member_no] = row.id;

    const event = await request(app)
      .post('/v1/events')
      .set(writeHeaders)
      .send({
        eventNo: EVENT_NO,
        name: 'October Conference',
        timezone: 'UTC',
        startDate: '2026-10-13',
        endDate: '2026-10-15',
        startTime: '17:00',
        endTime: '19:00',
        venueType: 'auditorium',
        sessions: [{ date: '2026-10-13' }, { date: '2026-10-14' }, { date: '2026-10-15' }],
      });
    expect(event.status).toBe(201);
    eventId = event.body.id as string;

    cancelledEventId = await insertEvent({
      eventNo: 'EVT-2026-015',
      name: 'Cancelled Conference',
      status: 'cancelled',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      sessions: [{ date: '2026-11-01', status: 'scheduled' }],
    });

    cancelledSessionEventId = await insertEvent({
      eventNo: 'EVT-2026-016',
      name: 'Partly Cancelled Conference',
      status: 'scheduled',
      startDate: '2026-11-10',
      endDate: '2026-11-11',
      sessions: [
        { date: '2026-11-10', status: 'scheduled' },
        { date: '2026-11-11', status: 'cancelled' },
      ],
    });
  });

  it('stores an import row on the session date, not the event start date', async () => {
    const response = await importRows(eventId, '2026-10-14', [{ memberNo: 'M-7001' }]);

    expect(response.status).toBe(201);

    const rows = await harness.db.query<{ session_date: Date | string; source: string }>(
      'select session_date, source from attendance where event_instance_id = $1',
      [eventId],
    );
    const dates = rows.map((row) =>
      row.session_date instanceof Date
        ? row.session_date.toISOString().slice(0, 10)
        : String(row.session_date),
    );
    expect(dates).toEqual(['2026-10-14']);
    expect(rows[0]!.source).toBe('import');
  });

  it('rejects a session date outside the event and rolls back the whole batch', async () => {
    const response = await importRows(eventId, '2026-10-16', [
      { memberNo: 'M-7001' },
      { memberNo: 'M-7002' },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain(EVENT_NO);
    expect(response.body.detail).toContain('2026-10-16');
    expect(response.body).not.toHaveProperty('rows');

    const [row] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from attendance where event_instance_id = $1',
      [eventId],
    );
    expect(Number(row!.count)).toBe(1);
  });

  it('rejects a direct write with a non-session date at the database trigger', async () => {
    await expect(
      harness.db.query(
        `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
         values ($1,$2,'2026-10-16','manual','test')`,
        [memberIds['M-7001'], eventId],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const [row] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from attendance
       where event_instance_id = $1 and session_date = '2026-10-16'`,
      [eventId],
    );
    expect(Number(row!.count)).toBe(0);
  });

  it('returns present, expected and rows with their source', async () => {
    const manual = await addManual(eventId, 'M-7002', '2026-10-14');
    expect(manual.status).toBe(201);
    expect(manual.body).toMatchObject({
      memberNo: 'M-7002',
      name: 'Chika Okafor',
      gender: 'female',
      age: 25,
      sessionDate: '2026-10-14',
      source: 'manual',
    });
    expect(manual.headers.location).toBe(`/v1/events/${eventId}/attendance/${manual.body.id}`);

    const response = await readReport(eventId, '2026-10-14');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const [importedRow] = await harness.db.query<{ id: string }>(
      `select id from attendance
       where event_instance_id = $1 and session_date = '2026-10-14' and source = 'import'`,
      [eventId],
    );
    expect(response.body).toEqual({
      eventId,
      sessionDate: '2026-10-14',
      present: 2,
      // M-5001 joined in January and is in the register on every October date too.
      expected: 3,
      importedRows: 1,
      rows: [
        {
          id: importedRow!.id,
          memberNo: 'M-7001',
          name: 'Ada Bello',
          gender: 'female',
          age: 30,
          status: 'present',
          source: 'import',
          sessionTime: null,
        },
        {
          id: manual.body.id,
          memberNo: 'M-7002',
          name: 'Chika Okafor',
          gender: 'female',
          age: 25,
          status: 'present',
          source: 'manual',
          sessionTime: null,
        },
      ],
    });
  });

  it('carries the attendance id the row delete accepts', async () => {
    const created = await addManual(eventId, 'M-7002', '2026-10-13');
    expect(created.status).toBe(201);

    const before = await readReport(eventId, '2026-10-13');
    expect(before.body.rows).toHaveLength(1);
    const rowId = before.body.rows[0].id as string;
    expect(rowId).toBe(created.body.id);

    await request(app)
      .delete(`/v1/events/${eventId}/attendance/${rowId}`)
      .set(writeHeaders)
      .expect(204);

    const after = await readReport(eventId, '2026-10-13');
    expect(after.body.rows).toEqual([]);
  });

  it('counts expected per session date and lists nobody for an empty session', async () => {
    const response = await readReport(eventId, '2026-10-13');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sessionDate: '2026-10-13',
      present: 0,
      expected: 2,
      importedRows: 0,
      rows: [],
    });
  });

  it('rejects an unknown event, a date outside the sessions and a missing date', async () => {
    await readReport('00000000-0000-4000-8000-000000000000', '2026-10-14').expect(404);
    await readReport(eventId, '2026-10-16').expect(422);

    const missing = await request(app).get(`/v1/events/${eventId}/attendance`).set(readHeaders);
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation_error');
  });

  it('converts an import row to manual and refuses a second manual post', async () => {
    const converted = await addManual(eventId, 'M-7001', '2026-10-14');
    expect(converted.status).toBe(201);
    expect(converted.body.source).toBe('manual');

    const duplicate = await addManual(eventId, 'M-7001', '2026-10-14');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('conflict');

    const report = await readReport(eventId, '2026-10-14');
    expect(report.body.present).toBe(2);
    expect(report.body.importedRows).toBe(0);
    expect(report.body.rows.map((row: { source: string }) => row.source)).toEqual([
      'manual',
      'manual',
    ]);
  });

  it('deletes a manual row', async () => {
    const created = await addManual(eventId, 'M-7003', '2026-10-13');
    expect(created.status).toBe(201);

    await request(app)
      .delete(`/v1/events/${eventId}/attendance/${created.body.id}`)
      .set(writeHeaders)
      .expect(204);

    const report = await readReport(eventId, '2026-10-13');
    expect(report.body.present).toBe(0);
    expect(report.body.rows).toEqual([]);
  });

  it('suppresses a deleted import row against a later import', async () => {
    const imported = await importRows(eventId, '2026-10-15', [{ memberNo: 'M-7003' }]);
    expect(imported.status).toBe(201);

    const [row] = await harness.db.query<{ id: string }>(
      `select a.id from attendance a
       join members m on m.id = a.member_id
       where m.member_no = 'M-7003' and a.event_instance_id = $1 and a.session_date = '2026-10-15'`,
      [eventId],
    );

    await request(app)
      .delete(`/v1/events/${eventId}/attendance/${row!.id}`)
      .set(writeHeaders)
      .expect(204);

    const [suppression] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from attendance_suppressions
       where member_id = $1 and event_instance_id = $2 and session_date = '2026-10-15'`,
      [memberIds['M-7003'], eventId],
    );
    expect(Number(suppression!.count)).toBe(1);

    // A different row set has a different checksum, so the duplicate-batch
    // guard does not fire; the suppression is what stops the deleted member.
    const again = await importRows(eventId, '2026-10-15', [
      { memberNo: 'M-7003' },
      { memberNo: 'M-7001' },
    ]);
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ written: 1, skipped: 1 });
    duplicateImportBatchId = again.body.id as string;

    const report = await readReport(eventId, '2026-10-15');
    expect(report.body.present).toBe(1);
    const [surviving] = await harness.db.query<{ id: string }>(
      `select a.id from attendance a
       join members m on m.id = a.member_id
       where m.member_no = 'M-7001' and a.event_instance_id = $1 and a.session_date = '2026-10-15'`,
      [eventId],
    );
    expect(report.body.rows).toEqual([
      {
        id: surviving!.id,
        memberNo: 'M-7001',
        name: 'Ada Bello',
        gender: 'female',
        age: 30,
        status: 'present',
        source: 'import',
        sessionTime: null,
      },
    ]);
  });

  it('removes a row only when it belongs to the event', async () => {
    const [row] = await harness.db.query<{ id: string }>(
      `select a.id from attendance a
       join members m on m.id = a.member_id
       where m.member_no = 'M-7001' and a.event_instance_id = $1 and a.session_date = '2026-10-14'`,
      [eventId],
    );

    await request(app)
      .delete(`/v1/events/${cancelledSessionEventId}/attendance/${row!.id}`)
      .set(writeHeaders)
      .expect(404);
  });

  it('refuses a repeat of the same occurrence and rows, and creates no second batch', async () => {
    const response = await importRows(eventId, '2026-10-15', [
      { memberNo: 'M-7003' },
      { memberNo: 'M-7001' },
    ]);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('conflict');
    expect(response.body.batchId).toBe(duplicateImportBatchId);
    expect(response.body.detail).toContain(duplicateImportBatchId);

    const [row] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from import_batches
       where event_instance_id = $1 and session_date = '2026-10-15'`,
      [eventId],
    );
    expect(Number(row!.count)).toBe(2);
  });

  it('rejects an import against a cancelled session, and writes nothing', async () => {
    const response = await importRows(cancelledSessionEventId, '2026-11-11', [
      { memberNo: 'M-7001' },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('2026-11-11');
    expect(response.body.detail).toContain('cancelled');

    const [batch] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from import_batches where event_instance_id = $1',
      [cancelledSessionEventId],
    );
    expect(Number(batch!.count)).toBe(0);

    const [attendance] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from attendance
       where event_instance_id = $1 and session_date = '2026-11-11'`,
      [cancelledSessionEventId],
    );
    expect(Number(attendance!.count)).toBe(0);
  });

  it('rejects writes to a cancelled event but still serves the report', async () => {
    const write = await addManual(cancelledEventId, 'M-7001', '2026-11-01');
    expect(write.status).toBe(409);
    expect(write.body.code).toBe('conflict');

    const report = await readReport(cancelledEventId, '2026-11-01');
    expect(report.status).toBe(200);
    expect(report.headers['cache-control']).toBe('no-store');
  });

  it('rejects a manual write against a cancelled session', async () => {
    const response = await addManual(cancelledSessionEventId, 'M-7001', '2026-11-11');

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects deleting a row on a cancelled session', async () => {
    const [row] = await harness.db.query<{ id: string }>(
      `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
       values ($1,$2,'2026-11-11','manual','test-admin')
       returning id`,
      [memberIds['M-7001'], cancelledSessionEventId],
    );

    const response = await request(app)
      .delete(`/v1/events/${cancelledSessionEventId}/attendance/${row!.id}`)
      .set(writeHeaders);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');

    const [still] = await harness.db.query('select id from attendance where id = $1', [row!.id]);
    expect(still).toBeTruthy();
  });

  it('rejects an unknown member with 404', async () => {
    const unknown = await addManual(eventId, 'M-9999', '2026-10-14');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('not_found');
  });

  it('rejects a manual write for an archived member', async () => {
    const response = await addManual(eventId, 'M-7004', '2026-10-14');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
  });

  it('reports the register at each session date on the event detail', async () => {
    const response = await request(app).get(`/v1/events/${eventId}`).set(readHeaders);

    expect(response.status).toBe(200);
    expect(
      response.body.sessions.map((session: { date: string; expected: number }) => ({
        date: session.date,
        expected: session.expected,
      })),
    ).toEqual([
      { date: '2026-10-13', expected: 2 },
      { date: '2026-10-14', expected: 3 },
      { date: '2026-10-15', expected: 3 },
    ]);
  });
});
