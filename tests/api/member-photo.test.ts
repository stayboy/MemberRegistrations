import pino from 'pino';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/create-app.js';
import { NullMailer } from '../../src/authn/mailer.js';
import { migrate } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/sql.js';
import { createTestApp, readHeaders, TOKEN, writeHeaders, type TestApp } from '../helpers/app.js';
import { reachableContacts } from '../helpers/member-fixtures.js';
import { createScratchPgDb } from '../helpers/scratch-db.js';

/**
 * Phase 2's wire contract (MR-14..MR-18, AC-MR12..AC-MR14, AC-MR34): one
 * nullable photo per member behind the bearer, three endpoints, magic-byte
 * verification, the 2 MiB ceiling, the ETag/304 path, and a log line that names
 * only the member number and the byte length.
 */

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest-of-a-png', 'ascii'),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('rest', 'ascii')]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from('VP8 ', 'ascii'),
]);

let harness: TestApp;
let app: TestApp['app'];
const logLines: Array<Record<string, unknown>> = [];

beforeAll(async () => {
  const logger = pino(
    { level: 'info' },
    {
      write(line: string) {
        logLines.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  harness = await createTestApp({ logger });
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

async function create(memberNo: string): Promise<void> {
  const response = await request(app).post('/v1/members').set(writeHeaders).send({
    memberNo,
    firstName: 'Ama',
    lastName: 'Mensah',
    gender: 'female',
    joinedOn: '2026-01-01',
    contacts: reachableContacts(),
  });
  expect(response.status).toBe(201);
  expect(response.body.photoUpdatedAt).toBeNull();
}

function upload(memberNo: string, bytes: Buffer, contentType: string, headers = writeHeaders) {
  return request(app)
    .put(`/v1/members/${memberNo}/photo`)
    .set({ ...headers, 'Content-Type': contentType, 'X-Original-Filename': 'family-reunion.jpg' })
    .send(bytes);
}

function fetchPhoto(memberNo: string, headers: Record<string, string> = readHeaders) {
  return request(app).get(`/v1/members/${memberNo}/photo`).set(headers);
}

describe('member photo endpoints', () => {
  it('stores a PNG, returns its timestamp and serves it with the private cache contract', async () => {
    await create('PHOTO-1');

    const put = await upload('PHOTO-1', PNG, 'image/png').expect(200);
    expect(typeof put.body.photoUpdatedAt).toBe('string');
    expect(put.headers['cache-control']).toBe('no-store');

    const get = await fetchPhoto('PHOTO-1').expect(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.headers['cache-control']).toBe('private, max-age=300');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.headers['content-disposition']).toBe('inline');
    expect(get.headers.etag).toMatch(new RegExp(`^"PHOTO-1-\\d+-${PNG.length}"$`));
    expect(Buffer.compare(get.body as Buffer, PNG)).toBe(0);

    const detail = await request(app).get('/v1/members/PHOTO-1').set(readHeaders).expect(200);
    expect(detail.body.photoUpdatedAt).toBe(put.body.photoUpdatedAt);

    const list = await request(app).get('/v1/members?q=PHOTO-1').set(readHeaders).expect(200);
    expect(list.body.items[0].photoUpdatedAt).toBe(put.body.photoUpdatedAt);
  });

  it('answers 304 to a matching ETag and 200 without If-None-Match', async () => {
    await create('PHOTO-2');
    await upload('PHOTO-2', PNG, 'image/png').expect(200);

    const first = await fetchPhoto('PHOTO-2').expect(200);
    const etag = first.headers.etag as string;

    const cached = await fetchPhoto('PHOTO-2', { ...readHeaders, 'If-None-Match': etag }).expect(
      304,
    );
    expect(cached.text).toBeFalsy();
    expect(cached.headers.etag).toBe(etag);
    expect(cached.headers['cache-control']).toBe('private, max-age=300');

    await fetchPhoto('PHOTO-2', { ...readHeaders, 'If-None-Match': '"other"' }).expect(200);
    await fetchPhoto('PHOTO-2', { ...readHeaders, 'If-None-Match': `W/${etag}` }).expect(304);
  });

  it('accepts JPEG and WebP by magic bytes and replaces the previous photo', async () => {
    await create('PHOTO-3');

    await upload('PHOTO-3', JPEG, 'image/jpeg').expect(200);
    const jpeg = await fetchPhoto('PHOTO-3').expect(200);
    expect(jpeg.headers['content-type']).toBe('image/jpeg');

    const replaced = await upload('PHOTO-3', WEBP, 'image/webp').expect(200);
    const webp = await fetchPhoto('PHOTO-3').expect(200);
    expect(webp.headers['content-type']).toBe('image/webp');
    expect(Buffer.compare(webp.body as Buffer, WEBP)).toBe(0);
    expect(typeof replaced.body.photoUpdatedAt).toBe('string');
  });

  it('refuses empty, mismatched and non-image bodies with 400 unsupported_photo', async () => {
    await create('PHOTO-4');

    const empty = await upload('PHOTO-4', Buffer.alloc(0), 'image/png').expect(400);
    expect(empty.body.code).toBe('unsupported_photo');

    const renamedText = await upload(
      'PHOTO-4',
      Buffer.from('this is not an image'),
      'image/png',
    ).expect(400);
    expect(renamedText.body.code).toBe('unsupported_photo');

    const mismatched = await upload('PHOTO-4', PNG, 'image/jpeg').expect(400);
    expect(mismatched.body.code).toBe('unsupported_photo');

    const notAnImageType = await upload('PHOTO-4', PNG, 'text/plain').expect(400);
    expect(notAnImageType.body.code).toBe('unsupported_photo');

    // Nothing was stored by any refused request.
    await fetchPhoto('PHOTO-4').expect(404);
    const detail = await request(app).get('/v1/members/PHOTO-4').set(readHeaders).expect(200);
    expect(detail.body.photoUpdatedAt).toBeNull();
  });

  it('refuses a body over 2 MiB with 413 photo_too_large and stores nothing', async () => {
    await create('PHOTO-5');

    const oversized = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const response = await upload('PHOTO-5', oversized, 'image/png').expect(413);
    expect(response.body.code).toBe('photo_too_large');

    await fetchPhoto('PHOTO-5').expect(404);
    const detail = await request(app).get('/v1/members/PHOTO-5').set(readHeaders).expect(200);
    expect(detail.body.photoUpdatedAt).toBeNull();
  });

  it('answers 404 when the member has no photo, and clearly when the member is unknown', async () => {
    await create('PHOTO-6');

    const absent = await fetchPhoto('PHOTO-6').expect(404);
    expect(absent.body.code).toBe('photo_not_found');

    const unknown = await fetchPhoto('NO-SUCH-MEMBER').expect(404);
    expect(unknown.body.code).toBe('not_found');
  });

  it('removes the photo with 204 and leaves every avatar surface without bytes', async () => {
    await create('PHOTO-7');
    await upload('PHOTO-7', PNG, 'image/png').expect(200);

    await request(app).delete('/v1/members/PHOTO-7/photo').set(writeHeaders).expect(204);
    await fetchPhoto('PHOTO-7').expect(404);

    const detail = await request(app).get('/v1/members/PHOTO-7').set(readHeaders).expect(200);
    expect(detail.body.photoUpdatedAt).toBeNull();

    // Deleting again is still a 204: removing an absent photo is not a conflict.
    await request(app).delete('/v1/members/PHOTO-7/photo').set(writeHeaders).expect(204);
  });

  it('requires the bearer on all three photo routes', async () => {
    await create('PHOTO-8');
    await upload('PHOTO-8', PNG, 'image/png').expect(200);

    await request(app)
      .put('/v1/members/PHOTO-8/photo')
      .set({ 'Content-Type': 'image/png' })
      .send(PNG)
      .expect(401);
    await request(app).get('/v1/members/PHOTO-8/photo').expect(401);
    await request(app).delete('/v1/members/PHOTO-8/photo').expect(401);
  });

  it('logs the member number and byte length only (AC-MR34)', async () => {
    await create('PHOTO-LOG');
    await upload('PHOTO-LOG', PNG, 'image/png').expect(200);

    const entry = logLines.find(
      (line) => line.msg === 'member photo stored' && line.memberNo === 'PHOTO-LOG',
    );
    expect(entry).toBeTruthy();
    expect(entry!.memberNo).toBe('PHOTO-LOG');
    expect(entry!.byteLength).toBe(PNG.length);
    expect(entry).not.toHaveProperty('filename');
    expect(entry).not.toHaveProperty('photo');
    expect(entry).not.toHaveProperty('bytes');
    expect(entry).not.toHaveProperty('dataUrl');

    const serialised = JSON.stringify(logLines);
    expect(serialised).not.toContain('family-reunion.jpg');
    expect(serialised).not.toContain(PNG.toString('base64'));
  });
});

/**
 * The same PUT/GET/DELETE contract on the pooled `pg` driver. Set
 * `TEST_DATABASE_URL` to a scratch server (never production) that allows
 * creating databases; the block migrates a database of its own and drops it
 * afterwards. Skipped otherwise. This is the lane that proves the `bytea`
 * mapping: PGlite hands bytes back as a `Uint8Array`, `pg` as a `Buffer`.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('member photo endpoints on the pooled pg driver', () => {
  let pooled: Db;
  let pgApp: Express;

  beforeAll(async () => {
    pooled = await createScratchPgDb(testDatabaseUrl!);
    await migrate(pooled);
    pgApp = createApp({
      db: pooled,
      bearerToken: TOKEN,
      logger: pino({ level: 'silent' }),
      mailer: new NullMailer(),
      ussd: { enabled: false },
    });
  });

  afterAll(async () => {
    await pooled?.close();
  });

  const putPhoto = (bytes: Buffer) =>
    request(pgApp)
      .put('/v1/members/PG-PHOTO-1/photo')
      .set({ ...writeHeaders, 'Content-Type': 'image/png' })
      .send(bytes);

  const getPhoto = () => request(pgApp).get('/v1/members/PG-PHOTO-1/photo').set(readHeaders);

  it('round-trips the bytes, serves the ETag contract and clears the photo', async () => {
    const created = await request(pgApp).post('/v1/members').set(writeHeaders).send({
      memberNo: 'PG-PHOTO-1',
      firstName: 'Ama',
      lastName: 'Mensah',
      gender: 'female',
      joinedOn: '2026-01-01',
      contacts: reachableContacts(),
    });
    expect(created.status).toBe(201);

    await getPhoto().expect(404);

    const put = await putPhoto(PNG).expect(200);
    expect(typeof put.body.photoUpdatedAt).toBe('string');

    const get = await getPhoto().expect(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.headers['cache-control']).toBe('private, max-age=300');
    expect(get.headers.etag).toMatch(new RegExp(`^"PG-PHOTO-1-\\d+-${PNG.length}"$`));
    expect(Buffer.isBuffer(get.body)).toBe(true);
    expect(Buffer.compare(get.body as Buffer, PNG)).toBe(0);

    // The column itself holds the same bytes; the mapper never re-encodes them.
    const [stored] = await pooled.query<{ photo: Buffer | null }>(
      'select photo from members where member_no = $1',
      ['PG-PHOTO-1'],
    );
    expect(Buffer.isBuffer(stored?.photo)).toBe(true);
    expect(Buffer.compare(stored!.photo!, PNG)).toBe(0);

    const etag = get.headers.etag as string;
    const cached = await getPhoto()
      .set({ ...readHeaders, 'If-None-Match': etag })
      .expect(304);
    expect(cached.text).toBeFalsy();

    const detail = await request(pgApp).get('/v1/members/PG-PHOTO-1').set(readHeaders).expect(200);
    expect(detail.body.photoUpdatedAt).toBe(put.body.photoUpdatedAt);

    // A replacement changes the tag even when both writes share a millisecond:
    // the byte length is part of it.
    const longer = Buffer.concat([PNG, Buffer.from('more-bytes', 'ascii')]);
    await putPhoto(longer).expect(200);
    const second = await getPhoto().expect(200);
    expect(Buffer.compare(second.body as Buffer, longer)).toBe(0);
    expect(second.headers.etag).not.toBe(etag);
    expect(second.headers.etag).toMatch(new RegExp(`-${longer.length}"$`));

    await request(pgApp).delete('/v1/members/PG-PHOTO-1/photo').set(writeHeaders).expect(204);
    const cleared = await getPhoto().expect(404);
    expect(cleared.body.code).toBe('photo_not_found');

    const after = await request(pgApp).get('/v1/members/PG-PHOTO-1').set(readHeaders).expect(200);
    expect(after.body.photoUpdatedAt).toBeNull();
  });
});
