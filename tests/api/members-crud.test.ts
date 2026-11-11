import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

async function create(memberNo: string, extra: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Ama',
      lastName: 'Mensah',
      gender: 'female',
      joinedOn: '2026-01-01',
      ...extra,
    });
  expect(response.status).toBe(201);
  return response;
}

/** A UTC calendar date `offset` days from today. */
function day(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * Seeds a manual attendance row for a series date. Per-member writes are
 * accepted only for a session dated today, so history is inserted directly and
 * the event instance is minted the way the write path mints it.
 */
async function seedAttendance(seriesId: string, memberNo: string, date: string): Promise<void> {
  const [member] = await harness.db.query<{ id: string }>(
    'select id from members where member_no = $1',
    [memberNo],
  );
  const [instance] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       series_id, start_date, end_date, name, timezone, venue_type, status, source, sessions
     )
     select s.id, $2, $2, s.name, s.timezone, 'auditorium', 'scheduled', 'series',
            jsonb_build_array(jsonb_build_object('date', $2::date, 'status', 'scheduled'))
       from event_series s where s.id = $1
     on conflict (series_id, start_date) do update set start_date = excluded.start_date
     returning id`,
    [seriesId, date],
  );
  const [inserted] = await harness.db.query<{ id: string }>(
    `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
     values ($1,$2,$3,'manual','seed')
     on conflict (event_instance_id, session_date, member_id) do nothing
     returning id`,
    [member!.id, instance!.id, date],
  );
  expect(inserted).toBeTruthy();
}

type PurgedRow = {
  first_name: string | null;
  last_name: string | null;
  other_names: string | null;
  maiden_name: string | null;
  alias: string | null;
  dob: string | null;
  place_of_residence: string | null;
  address_line: string | null;
  gender: string;
  is_presbyter: boolean;
  archived_at: Date | string | null;
  purged_at: Date | string | null;
};

describe('member row operations', () => {
  it('creates, reads and updates through an ETag round-trip', async () => {
    const created = await create('C-1001', { otherNames: 'Adwoa', alias: 'Ama' });
    expect(created.body.memberNo).toBe('C-1001');
    expect(created.body.otherNames).toBe('Adwoa');
    expect(created.body.version).toBe(1);

    const fetched = await request(app).get('/v1/members/C-1001').set(readHeaders).expect(200);
    expect(fetched.body.firstName).toBe('Ama');
    const etag = fetched.headers.etag as string;
    expect(etag).toBe('"v1"');

    const updated = await request(app)
      .put('/v1/members/C-1001')
      .set({ ...writeHeaders, 'If-Match': etag })
      .send({ placeOfResidence: 'Accra', alias: 'Ama Adwoa' })
      .expect(200);

    expect(updated.body.placeOfResidence).toBe('Accra');
    expect(updated.body.alias).toBe('Ama Adwoa');
    expect(updated.body.version).toBe(2);
    expect(updated.headers.etag).toBe('"v2"');

    const reread = await request(app).get('/v1/members/C-1001').set(readHeaders).expect(200);
    expect(reread.body.placeOfResidence).toBe('Accra');
    expect(reread.body.version).toBe(2);
  });

  it('archives a member and restores it', async () => {
    await create('C-2001');

    await request(app).delete('/v1/members/C-2001').set(writeHeaders).expect(204);
    await request(app).get('/v1/members/C-2001').set(readHeaders).expect(404);

    const archived = await request(app)
      .get('/v1/members/C-2001')
      .query({ includeArchived: 'true' })
      .set(readHeaders)
      .expect(200);
    expect(archived.body.archivedAt).toBeTruthy();

    const restored = await request(app)
      .post('/v1/members/C-2001/restore')
      .set(writeHeaders)
      .expect(200);
    expect(restored.body.archivedAt).toBeNull();

    const visible = await request(app).get('/v1/members/C-2001').set(readHeaders).expect(200);
    expect(visible.body.memberNo).toBe('C-2001');
  });

  it('purges PII, reserves the number and conflicts on a second purge', async () => {
    await create('C-3001', { alias: 'Kofi', placeOfResidence: 'Kumasi', otherNames: 'Kojo' });

    await request(app)
      .post('/v1/members/C-3001/purge')
      .set(writeHeaders)
      .send({ confirm: 'C-3001' })
      .expect(204);

    const [row] = await harness.db.query<PurgedRow>(
      `select first_name, last_name, other_names, maiden_name, alias, dob,
              place_of_residence, address_line, gender, is_presbyter, archived_at, purged_at
         from members where member_no = $1`,
      ['C-3001'],
    );

    expect(row!.first_name).toBeNull();
    expect(row!.last_name).toBeNull();
    expect(row!.other_names).toBeNull();
    expect(row!.maiden_name).toBeNull();
    expect(row!.alias).toBeNull();
    expect(row!.dob).toBeNull();
    expect(row!.place_of_residence).toBeNull();
    expect(row!.address_line).toBeNull();
    expect(row!.gender).toBe('undisclosed');
    expect(row!.is_presbyter).toBe(false);
    expect(row!.archived_at).toBeTruthy();
    expect(row!.purged_at).toBeTruthy();

    await request(app).get('/v1/members/C-3001').set(readHeaders).expect(404);

    const recreate = await request(app).post('/v1/members').set(writeHeaders).send({
      memberNo: 'C-3001',
      firstName: 'New',
      lastName: 'Person',
    });
    expect(recreate.status).toBe(409);
    expect(recreate.body.code).toBe('conflict');

    const second = await request(app)
      .post('/v1/members/C-3001/purge')
      .set(writeHeaders)
      .send({ confirm: 'C-3001' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('conflict');
  });

  it('rejects a duplicate member number case-insensitively', async () => {
    await create('C-4001');

    const duplicate = await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({ memberNo: 'c-4001', firstName: 'Other', lastName: 'Person' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('conflict');
  });

  it('rejects a stale ETag', async () => {
    const created = await create('C-5001');
    const stale = created.headers.etag as string;

    await request(app)
      .put('/v1/members/C-5001')
      .set({ ...writeHeaders, 'If-Match': stale })
      .send({ placeOfResidence: 'Accra' })
      .expect(200);

    const rejected = await request(app)
      .put('/v1/members/C-5001')
      .set({ ...writeHeaders, 'If-Match': stale })
      .send({ placeOfResidence: 'Kumasi' });

    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('conflict');
  });
});

describe('members import', () => {
  function importMembers(rows: unknown[]) {
    return request(app).post('/v1/imports/members').set(writeHeaders).send({ rows });
  }

  it('creates new members and a members batch', async () => {
    const response = await importMembers([
      {
        memberNo: 'I-1001',
        firstName: 'Akosua',
        lastName: 'Owusu',
        otherNames: 'Ama',
        gender: 'female',
        dob: '1990-05-14',
        joinedOn: '2026-01-04',
        placeOfResidence: 'Accra',
        addressLine: '12 Independence Avenue',
        isPresbyter: true,
        phone: '0801 234 5678',
        email: 'Akosua@Example.com',
      },
      { memberNo: 'I-1002', firstName: 'Kwame', lastName: 'Asante', joinedOn: '2026-01-11' },
    ]);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ kind: 'members', rowCount: 2, actor: 'test-admin' });

    const batch = await request(app).get(`/v1/imports/${response.body.id}`).set(readHeaders);
    expect(batch.status).toBe(200);
    expect(batch.body.kind).toBe('members');

    const first = await request(app).get('/v1/members/I-1001').set(readHeaders).expect(200);
    expect(first.body).toMatchObject({
      memberNo: 'I-1001',
      firstName: 'Akosua',
      lastName: 'Owusu',
      otherNames: 'Ama',
      gender: 'female',
      dob: '1990-05-14',
      joinedOn: '2026-01-04',
      placeOfResidence: 'Accra',
      addressLine: '12 Independence Avenue',
      isPresbyter: true,
      version: 1,
    });
    expect(first.body.contacts).toEqual([
      expect.objectContaining({ kind: 'phone', value: '0801 234 5678', displayOrder: 1 }),
      expect.objectContaining({ kind: 'email', value: 'Akosua@Example.com', displayOrder: 2 }),
    ]);

    const second = await request(app).get('/v1/members/I-1002').set(readHeaders).expect(200);
    expect(second.body).toMatchObject({ memberNo: 'I-1002', isPresbyter: false, version: 1 });
  });

  it('re-imports idempotently without duplicating members or contacts', async () => {
    const rows = [
      {
        memberNo: 'I-2001',
        firstName: 'Yaa',
        lastName: 'Boateng',
        joinedOn: '2026-01-04',
        phone: '08011112222',
        email: 'yaa@example.com',
      },
    ];

    await importMembers(rows).expect(201);
    await importMembers(rows).expect(201);

    const members = await request(app).get('/v1/members').query({ q: 'I-2001' }).set(readHeaders);
    expect(members.body.items).toHaveLength(1);

    const member = await request(app).get('/v1/members/I-2001').set(readHeaders);
    expect(member.body.version).toBe(2);
    expect(member.body.contacts).toHaveLength(2);
  });

  it('updates an existing member and keeps its number and creation time', async () => {
    const created = await create('U-1001', {
      firstName: 'Old',
      lastName: 'Name',
      otherNames: 'Kofi',
      placeOfResidence: 'Kumasi',
      joinedOn: '2026-01-01',
    });

    const response = await importMembers([
      {
        memberNo: 'u-1001',
        firstName: 'New',
        lastName: 'Name',
        otherNames: '',
        placeOfResidence: 'Accra',
        joinedOn: '2026-01-01',
      },
    ]);

    expect(response.status).toBe(201);

    const member = await request(app).get('/v1/members/U-1001').set(readHeaders).expect(200);
    expect(member.body).toMatchObject({
      memberNo: 'U-1001',
      firstName: 'New',
      otherNames: 'Kofi',
      placeOfResidence: 'Accra',
      version: 2,
    });
    expect(member.body.createdAt).toBe(created.body.createdAt);
  });

  it('rejects a duplicate member number inside the file and applies nothing', async () => {
    const response = await importMembers([
      { memberNo: 'I-3001', firstName: 'First', lastName: 'Row' },
      { memberNo: 'i-3001', firstName: 'Second', lastName: 'Row' },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('I-3001');
    expect(response.body.detail).toContain('rows 1, 2');
    expect(response.body.rows).toEqual([
      { row: 1, message: 'Duplicate memberNo I-3001 (rows 1, 2)' },
      { row: 2, message: 'Duplicate memberNo I-3001 (rows 1, 2)' },
    ]);

    await request(app).get('/v1/members/I-3001').set(readHeaders).expect(404);
  });

  it('rejects an archived member', async () => {
    await create('A-1001');
    await request(app).delete('/v1/members/A-1001').set(writeHeaders).expect(204);

    const response = await importMembers([
      { memberNo: 'A-1001', firstName: 'Still', lastName: 'Archived' },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('archived');
    expect(response.body.rows).toEqual([
      { row: 1, message: 'member A-1001 is archived; restore it before importing' },
    ]);

    const archived = await request(app)
      .get('/v1/members/A-1001')
      .query({ includeArchived: 'true' })
      .set(readHeaders);
    expect(archived.body.archivedAt).toBeTruthy();
  });

  it('rejects a purged member', async () => {
    await create('P-1001');
    await request(app)
      .post('/v1/members/P-1001/purge')
      .set(writeHeaders)
      .send({ confirm: 'P-1001' })
      .expect(204);

    const response = await importMembers([
      { memberNo: 'P-1001', firstName: 'Cannot', lastName: 'Return' },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.detail).toContain('purged');
    expect(response.body.rows).toEqual([
      { row: 1, message: 'member P-1001 has been purged and cannot be resurrected' },
    ]);
  });

  it('skips an identical contact and rejects one held by another member', async () => {
    const row = {
      memberNo: 'D-1001',
      firstName: 'Dedupe',
      lastName: 'Phone',
      joinedOn: '2026-01-04',
      phone: '09022223333',
    };

    await importMembers([row]).expect(201);
    await importMembers([{ ...row, phone: '0902 222 3333' }]).expect(201);

    const owner = await request(app).get('/v1/members/D-1001').set(readHeaders);
    expect(owner.body.contacts).toEqual([
      expect.objectContaining({ kind: 'phone', value: '09022223333' }),
    ]);

    const clash = await importMembers([
      { memberNo: 'D-1002', firstName: 'Other', lastName: 'Holder', phone: '090 2222 3333' },
    ]);

    expect(clash.status).toBe(422);
    expect(clash.body.code).toBe('import_failed');
    expect(clash.body.detail).toContain('Row 1');
    expect(clash.body.rows).toEqual([
      { row: 1, message: 'this phone already belongs to another member; correct or remove it' },
    ]);

    await request(app).get('/v1/members/D-1002').set(readHeaders).expect(404);
  });

  it('rolls the whole batch back when a later row fails', async () => {
    await create('R-ARCH');
    await request(app).delete('/v1/members/R-ARCH').set(writeHeaders).expect(204);

    const response = await importMembers([
      { memberNo: 'R-1001', firstName: 'First', lastName: 'Row' },
      { memberNo: 'R-ARCH', firstName: 'Second', lastName: 'Row' },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('import_failed');
    expect(response.body.rows).toEqual([
      { row: 2, message: 'member R-ARCH is archived; restore it before importing' },
    ]);

    await request(app).get('/v1/members/R-1001').set(readHeaders).expect(404);
  });
});

describe('members list contract', () => {
  it('returns contactCount and never a contact value', async () => {
    await create('L-1001', { contacts: [{ kind: 'phone', value: '0805 111 2222' }] });
    await create('L-1002');

    const response = await request(app).get('/v1/members').query({ q: 'L-10' }).set(readHeaders);

    expect(response.status).toBe(200);
    const owner = response.body.items.find(
      (item: { memberNo: string }) => item.memberNo === 'L-1001',
    );
    expect(owner.contactCount).toBe(1);
    expect(owner).not.toHaveProperty('contacts');
    expect(JSON.stringify(response.body)).not.toContain('08051112222');
    expect(JSON.stringify(response.body)).not.toContain('0805 111 2222');
  });

  it('filters by status, keeps includeArchived as an alias, and never lists purged members', async () => {
    await create('L-2001');
    await create('L-2002');
    await create('L-2003');
    await request(app).delete('/v1/members/L-2002').set(writeHeaders).expect(204);
    await request(app)
      .post('/v1/members/L-2003/purge')
      .set(writeHeaders)
      .send({ confirm: 'L-2003' })
      .expect(204);

    const memberNos = (body: { items: Array<{ memberNo: string }> }) =>
      body.items.map((item) => item.memberNo).sort();

    const defaulted = await request(app).get('/v1/members').query({ q: 'L-20' }).set(readHeaders);
    expect(memberNos(defaulted.body)).toEqual(['L-2001']);

    const active = await request(app)
      .get('/v1/members')
      .query({ q: 'L-20', status: 'active' })
      .set(readHeaders);
    expect(memberNos(active.body)).toEqual(['L-2001']);

    const archived = await request(app)
      .get('/v1/members')
      .query({ q: 'L-20', status: 'archived' })
      .set(readHeaders);
    expect(memberNos(archived.body)).toEqual(['L-2002']);

    const alias = await request(app)
      .get('/v1/members')
      .query({ q: 'L-20', includeArchived: 'true' })
      .set(readHeaders);
    expect(memberNos(alias.body)).toEqual(['L-2001', 'L-2002']);
    expect(JSON.stringify(alias.body)).not.toContain('L-2003');
  });

  it('adds page-level attendance for the requested series and clips each window', async () => {
    const series = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'List Attendance Series',
        timezone: 'UTC',
        schedule: {
          effectiveFrom: '2026-09-06',
          rrule: 'FREQ=WEEKLY;BYDAY=SU',
          endsOn: '2026-10-04',
        },
      });
    expect(series.status).toBe(201);
    const seriesId = series.body.id as string;

    await create('L-3001', { joinedOn: '2026-09-01' });
    await create('L-3002', { joinedOn: '2026-09-20' });

    // Per-member writes are accepted only for a session dated today, so the rows
    // this read aggregates are seeded directly; the read contract is unchanged.
    for (const date of ['2026-09-06', '2026-10-04']) {
      await seedAttendance(seriesId, 'L-3001', date);
    }
    await seedAttendance(seriesId, 'L-3002', '2026-09-27');

    const fullWindow = await request(app)
      .get('/v1/members')
      .query({ q: 'L-3001', include: 'attendance', seriesId })
      .set(readHeaders);
    expect(fullWindow.body.items[0].attendance).toEqual({
      seriesId,
      seriesName: 'List Attendance Series',
      attended: 2,
      expected: 5,
      remaining: 3,
      status: 'completed',
      lastAttendedOn: '2026-10-04',
    });

    const clipped = await request(app)
      .get('/v1/members')
      .query({ q: 'L-3002', include: 'attendance', seriesId })
      .set(readHeaders);
    expect(clipped.body.items[0].attendance).toEqual({
      seriesId,
      seriesName: 'List Attendance Series',
      attended: 1,
      expected: 3,
      remaining: 2,
      status: 'completed',
      lastAttendedOn: '2026-09-27',
    });

    const both = await request(app)
      .get('/v1/members')
      .query({ q: 'L-3001', include: 'attendance,subscriptions', seriesId })
      .set(readHeaders);
    expect(both.status).toBe(200);
    expect(both.body.items[0]).toHaveProperty('attendance');
    expect(both.body.items[0].subscriptions).toEqual([]);

    const missing = await request(app)
      .get('/v1/members')
      .query({ q: 'L-3001', include: 'attendance' })
      .set(readHeaders);
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation_error');

    const invalid = await request(app)
      .get('/v1/members')
      .query({ q: 'L-3001', include: 'attendance', seriesId: 'not-a-uuid' })
      .set(readHeaders);
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('validation_error');

    const unknown = await request(app)
      .get('/v1/members')
      .query({
        q: 'L-3001',
        include: 'attendance',
        seriesId: '00000000-0000-4000-8000-000000000000',
      })
      .set(readHeaders);
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('not_found');
  });

  it('refuses a manual attendance write for a non-today session and accepts a today one', async () => {
    await create('L-3003', { joinedOn: '2026-09-01' });

    const pastSeries = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Write Rule Past Series',
        timezone: 'UTC',
        schedule: {
          effectiveFrom: '2026-09-06',
          rrule: 'FREQ=WEEKLY;BYDAY=SU',
          endsOn: '2026-10-04',
        },
      });
    expect(pastSeries.status).toBe(201);
    const pastSeriesId = pastSeries.body.id as string;

    // 2026-09-06 is a held occurrence of the series, but it is not today.
    const refused = await request(app)
      .post('/v1/members/L-3003/attendance')
      .set(writeHeaders)
      .send({ seriesId: pastSeriesId, date: '2026-09-06' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('validation_error');

    const [notWritten] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from attendance a
         join members m on m.id = a.member_id
        where m.member_no = 'L-3003' and a.session_date = '2026-09-06'`,
    );
    expect(Number(notWritten!.count)).toBe(0);

    const todaySeries = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Write Rule Today Series',
        timezone: 'UTC',
        schedule: { effectiveFrom: day(0), rrule: 'FREQ=DAILY', endsOn: day(0) },
      });
    expect(todaySeries.status).toBe(201);

    const accepted = await request(app)
      .post('/v1/members/L-3003/attendance')
      .set(writeHeaders)
      .send({ seriesId: todaySeries.body.id, date: day(0) });
    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({ date: day(0), source: 'manual' });

    // The created row is the one the member's attendance collection reads.
    const attendance = await request(app)
      .get('/v1/members/L-3003/attendance')
      .set(readHeaders)
      .expect(200);
    const entry = attendance.body.series.find(
      (item: { seriesName: string }) => item.seriesName === 'Write Rule Today Series',
    );
    expect(entry).toMatchObject({ attended: 1, expected: 1 });
    expect(entry.entries).toContainEqual({
      id: accepted.body.id,
      date: day(0),
      source: 'manual',
    });
  });

  it('aggregates a page of 25 rows with the same number of queries as one row', async () => {
    for (let index = 1; index <= 25; index += 1) {
      await create(`BULK-${String(index).padStart(2, '0')}`);
    }

    const series = await request(app)
      .post('/v1/series')
      .set(writeHeaders)
      .send({
        name: 'Bulk Page Series',
        timezone: 'UTC',
        schedule: {
          effectiveFrom: '2026-09-06',
          rrule: 'FREQ=WEEKLY;BYDAY=SU',
          endsOn: '2026-10-04',
        },
      });
    expect(series.status).toBe(201);
    const seriesId = series.body.id as string;

    const db = harness.db;
    const original = db.query;
    let calls = 0;
    db.query = ((text: string, params?: readonly unknown[]) => {
      calls += 1;
      return original.call(db, text, params);
    }) as unknown as typeof db.query;

    try {
      const single = await request(app)
        .get('/v1/members')
        .query({ q: 'BULK-01', include: 'attendance,subscriptions', seriesId, limit: 1 })
        .set(readHeaders);
      expect(single.status).toBe(200);
      const singleCalls = calls;

      calls = 0;
      const page = await request(app)
        .get('/v1/members')
        .query({ q: 'BULK-', include: 'attendance,subscriptions', seriesId, limit: 25 })
        .set(readHeaders);
      expect(page.status).toBe(200);
      expect(page.body.items).toHaveLength(25);
      expect(
        page.body.items.every((item: { contactCount: number }) => item.contactCount === 0),
      ).toBe(true);
      expect(calls).toBe(singleCalls);
    } finally {
      db.query = original;
    }
  });
});
