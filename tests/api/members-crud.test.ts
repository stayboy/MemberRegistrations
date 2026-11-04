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
