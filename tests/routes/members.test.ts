import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pino from 'pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/create-app.js';
import { LocalFileMemberStore } from '../../src/store/local-file-store.js';

const TOKEN = 'test-token-value';
const AUTH = `Bearer ${TOKEN}`;

const baseMember = {
  memberNo: 'M-1001',
  firstName: 'Ama',
  lastName: 'Mensah',
  otherNames: 'Akosua',
  dateOfBirth: '1990-04-12',
  gender: 'female',
  placeOfResidence: 'Accra',
  contacts: [{ channel: 'email', value: 'ama@example.com' }],
  subscriptions: ['life-insurance'],
  ministries: ['choir'],
};

describe('MemberRegistrations API', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'member-api-'));
    app = createApp({
      store: new LocalFileMemberStore(root),
      bearerToken: TOKEN,
      logger: pino({ level: 'silent' }),
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('health and contract', () => {
    it('exposes liveness without authentication', async () => {
      const response = await request(app).get('/health').expect(200);
      expect(response.body).toMatchObject({ status: 'ok' });
    });

    it('publishes an OpenAPI document generated from the schemas', async () => {
      const response = await request(app).get('/openapi.json').expect(200);

      expect(response.body.openapi).toBe('3.1.0');
      expect(Object.keys(response.body.paths)).toContain('/members/{memberNo}');
      expect(Object.keys(response.body.components.schemas)).toContain('Member');
    });

    it('returns problem+json for an unknown route', async () => {
      const response = await request(app).get('/nope').expect(404);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 404, code: 'route_not_found' });
    });
  });

  describe('authentication', () => {
    it('rejects requests without a token', async () => {
      const response = await request(app).get('/members').expect(401);

      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.body.code).toBe('unauthorized');
    });

    it('rejects an invalid token', async () => {
      await request(app).get('/members').set('Authorization', 'Bearer wrong').expect(401);
    });
  });

  describe('CRUD', () => {
    it('creates a member and returns it on lookup', async () => {
      const created = await request(app)
        .post('/members')
        .set('Authorization', AUTH)
        .send(baseMember)
        .expect(201);

      expect(created.headers.location).toBe('/members/M-1001');
      expect(created.headers.etag).toMatch(/^".+"$/);
      expect(created.headers['cache-control']).toBe('no-store');
      expect(created.body).toMatchObject({
        memberNo: 'M-1001',
        firstName: 'Ama',
        ministries: ['choir'],
      });

      const fetched = await request(app)
        .get('/members/M-1001')
        .set('Authorization', AUTH)
        .expect(200);

      expect(fetched.body).toEqual(created.body);
      expect(fetched.headers.etag).toBe(created.headers.etag);
    });

    it('rejects a duplicate member number with a conflict', async () => {
      await request(app).post('/members').set('Authorization', AUTH).send(baseMember).expect(201);

      const duplicate = await request(app)
        .post('/members')
        .set('Authorization', AUTH)
        .send(baseMember)
        .expect(409);

      expect(duplicate.body.code).toBe('conflict');
    });

    it('validates the request body', async () => {
      const response = await request(app)
        .post('/members')
        .set('Authorization', AUTH)
        .send({ ...baseMember, memberNo: '../escape' })
        .expect(422);

      expect(response.body).toMatchObject({ status: 422, code: 'validation_error' });
      expect(response.body.detail).toContain('memberNo');
    });

    it('rejects malformed JSON', async () => {
      const response = await request(app)
        .post('/members')
        .set('Authorization', AUTH)
        .set('Content-Type', 'application/json')
        .send('{"memberNo":')
        .expect(400);

      expect(response.body.code).toBe('invalid_json');
    });

    it('returns 404 problem+json for an unknown member', async () => {
      const response = await request(app)
        .get('/members/M-404')
        .set('Authorization', AUTH)
        .expect(404);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.code).toBe('not_found');
    });

    it('updates a member and enforces optimistic concurrency', async () => {
      const created = await request(app)
        .post('/members')
        .set('Authorization', AUTH)
        .send(baseMember)
        .expect(201);

      const updated = await request(app)
        .put('/members/M-1001')
        .set('Authorization', AUTH)
        .send({ placeOfResidence: 'Kumasi' })
        .expect(200);

      expect(updated.body.placeOfResidence).toBe('Kumasi');
      expect(updated.headers.etag).not.toBe(created.headers.etag);

      const stale = await request(app)
        .put('/members/M-1001')
        .set('Authorization', AUTH)
        .set('If-Match', created.headers.etag)
        .send({ placeOfResidence: 'Tamale' })
        .expect(409);

      expect(stale.body.code).toBe('conflict');

      const conditional = await request(app)
        .put('/members/M-1001')
        .set('Authorization', AUTH)
        .set('If-Match', updated.headers.etag)
        .send({ placeOfResidence: 'Tamale' })
        .expect(200);

      expect(conditional.body.placeOfResidence).toBe('Tamale');
    });

    it('deletes a member', async () => {
      await request(app).post('/members').set('Authorization', AUTH).send(baseMember).expect(201);

      await request(app).delete('/members/M-1001').set('Authorization', AUTH).expect(204);
      await request(app).get('/members/M-1001').set('Authorization', AUTH).expect(404);
      await request(app).delete('/members/M-1001').set('Authorization', AUTH).expect(404);
    });
  });

  describe('listing', () => {
    beforeEach(async () => {
      for (const memberNo of ['M-1003', 'M-1001', 'M-1002']) {
        await request(app)
          .post('/members')
          .set('Authorization', AUTH)
          .send({ ...baseMember, memberNo })
          .expect(201);
      }
    });

    it('pages by member number', async () => {
      const firstPage = await request(app)
        .get('/members?limit=2')
        .set('Authorization', AUTH)
        .expect(200);

      expect(firstPage.body.items.map((item: { memberNo: string }) => item.memberNo)).toEqual([
        'M-1001',
        'M-1002',
      ]);
      expect(firstPage.body.nextCursor).toBe('M-1002');

      const secondPage = await request(app)
        .get(`/members?limit=2&cursor=${firstPage.body.nextCursor}`)
        .set('Authorization', AUTH)
        .expect(200);

      expect(secondPage.body.items.map((item: { memberNo: string }) => item.memberNo)).toEqual([
        'M-1003',
      ]);
      expect(secondPage.body.nextCursor).toBeUndefined();
    });

    it('filters with q', async () => {
      const response = await request(app)
        .get('/members?q=ama')
        .set('Authorization', AUTH)
        .expect(200);

      expect(response.body.items).toHaveLength(3);
    });

    it('rejects an invalid limit', async () => {
      await request(app).get('/members?limit=0').set('Authorization', AUTH).expect(422);
    });
  });

  describe('attendance', () => {
    beforeEach(async () => {
      await request(app).post('/members').set('Authorization', AUTH).send(baseMember).expect(201);
    });

    it('records attendance and returns a summary', async () => {
      await request(app)
        .post('/members/M-1001/attendance')
        .set('Authorization', AUTH)
        .send({ eventNo: 'E-1', eventName: 'Harvest', date: '2026-10-04', ministry: 'choir' })
        .expect(201);

      const response = await request(app)
        .get('/members/M-1001/attendance')
        .set('Authorization', AUTH)
        .expect(200);

      expect(response.body.memberNo).toBe('M-1001');
      expect(response.body.entries).toHaveLength(1);
      expect(response.body.summary).toEqual([
        { eventName: 'Harvest', attendances: 1, lastDate: '2026-10-04' },
      ]);
    });

    it('rejects duplicate attendance for the same event and date', async () => {
      const entry = { eventNo: 'E-1', eventName: 'Harvest', date: '2026-10-04' };

      await request(app)
        .post('/members/M-1001/attendance')
        .set('Authorization', AUTH)
        .send(entry)
        .expect(201);

      await request(app)
        .post('/members/M-1001/attendance')
        .set('Authorization', AUTH)
        .send(entry)
        .expect(409);
    });
  });

  describe('contacts, subscriptions and ministries', () => {
    beforeEach(async () => {
      await request(app).post('/members').set('Authorization', AUTH).send(baseMember).expect(201);
    });

    it('adds and removes contacts', async () => {
      const added = await request(app)
        .post('/members/M-1001/contacts')
        .set('Authorization', AUTH)
        .send({ channel: 'phone', value: '+233200000000', label: 'mobile' })
        .expect(201);

      expect(added.body).toMatchObject({ channel: 'phone', preferred: false });

      await request(app)
        .post('/members/M-1001/contacts')
        .set('Authorization', AUTH)
        .send({ channel: 'phone', value: '+233200000000' })
        .expect(409);

      await request(app)
        .delete(`/members/M-1001/contacts/${added.body.id}`)
        .set('Authorization', AUTH)
        .expect(204);

      const member = await request(app)
        .get('/members/M-1001')
        .set('Authorization', AUTH)
        .expect(200);

      expect(member.body.contacts).toHaveLength(1);
    });

    it('activates and deactivates a subscription', async () => {
      await request(app)
        .post('/members/M-1001/subscriptions')
        .set('Authorization', AUTH)
        .send({ kind: 'credit-union' })
        .expect(201);

      await request(app)
        .post('/members/M-1001/subscriptions')
        .set('Authorization', AUTH)
        .send({ kind: 'credit-union' })
        .expect(409);

      await request(app)
        .delete('/members/M-1001/subscriptions/credit-union')
        .set('Authorization', AUTH)
        .expect(204);

      await request(app)
        .delete('/members/M-1001/subscriptions/credit-union')
        .set('Authorization', AUTH)
        .expect(404);
    });

    it('assigns and removes a ministry', async () => {
      await request(app)
        .post('/members/M-1001/ministries')
        .set('Authorization', AUTH)
        .send({ ministry: 'pemem' })
        .expect(201);

      await request(app)
        .post('/members/M-1001/ministries')
        .set('Authorization', AUTH)
        .send({ ministry: 'pemem' })
        .expect(409);

      await request(app)
        .delete('/members/M-1001/ministries/pemem')
        .set('Authorization', AUTH)
        .expect(204);

      await request(app)
        .delete('/members/M-1001/ministries/unknown')
        .set('Authorization', AUTH)
        .expect(422);
    });
  });
});
