import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { createS3FlierStore } from '../../src/storage/s3.js';

/**
 * The flier: the 2 MiB cap, the magic bytes, the public immutable route outside
 * `/v1`, and the same bytes through both stores
 * (member-registrations-event-notifications.md N-9, FR-22; AC-18, AC-19).
 */
function tinyPng(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 7),
  ]);
}

/**
 * A tiny S3-compatible double: put/get/delete on path-style keys. It does not
 * verify the signature (a real server would), so it records each request’s
 * headers and the suite asserts the shape of the SigV4 the adapter produces.
 */
function fakeS3(): {
  server: Server;
  objects: Map<string, Buffer>;
  requests: Array<{ method: string; url: string; headers: IncomingHttpHeaders }>;
  endpoint: Promise<string>;
} {
  const objects = new Map<string, Buffer>();
  const requests: Array<{ method: string; url: string; headers: IncomingHttpHeaders }> = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
      const key = decodeURIComponent((req.url ?? '').replace(/^\/[^/]+\//, ''));
      if (req.method === 'PUT') {
        objects.set(key, Buffer.concat(chunks));
        res.writeHead(200).end();
        return;
      }
      if (req.method === 'GET') {
        const body = objects.get(key);
        if (!body) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(body);
        return;
      }
      if (req.method === 'DELETE') {
        objects.delete(key);
        res.writeHead(204).end();
        return;
      }
      res.writeHead(405).end();
    });
  });
  const endpoint = new Promise<string>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
  return { server, objects, requests, endpoint };
}

const s3 = fakeS3();
const served: Record<string, Buffer> = {};

for (const kind of ['db', 's3'] as const) {
  describe(`${kind} store`, () => {
    let harness: TestApp;
    let app: TestApp['app'];
    let eventId: string;
    const bytes = tinyPng();

    beforeAll(async () => {
      harness = await createTestApp({
        flierStore:
          kind === 's3'
            ? createS3FlierStore({
                endpoint: await s3.endpoint,
                bucket: 'fliers',
                region: 'us-east-1',
                accessKeyId: 'minio',
                secretAccessKey: 'minio-secret',
              })
            : undefined,
      });
      app = harness.app;
      const seeded = await seedEvent(harness.db, {
        name: `${kind} flier event`,
        startDate: '2026-12-06',
        endDate: '2026-12-06',
        startTime: '09:00',
        sessions: [{ date: '2026-12-06' }],
      });
      eventId = seeded.eventId;
      const plan = await request(app)
        .put(`/v1/events/${eventId}/notification-plan`)
        .set(writeHeaders)
        .send({ templates: [{ channel: 'ussd', bodyText: '{{eventName}}' }] });
      expect(plan.status).toBe(200);
    });

    afterAll(async () => {
      await harness.close();
    });

    it('starts with no flier', async () => {
      const response = await request(app).get(`/v1/events/${eventId}/flier`).set(readHeaders);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('flier_not_found');
    });

    it('stores an accepted image and serves it immutably outside /v1', async () => {
      const upload = await request(app)
        .put(`/v1/events/${eventId}/flier`)
        .set(writeHeaders)
        .set('Content-Type', 'image/png')
        .send(bytes);

      expect(upload.status).toBe(200);
      expect(upload.body.token).toMatch(/^[a-f0-9]{64}$/);
      expect(upload.body).toMatchObject({
        contentType: 'image/png',
        byteSize: bytes.length,
        url: `/fliers/${upload.body.token}`,
      });
      expect(upload.body.sha256).toMatch(/^[a-f0-9]{64}$/);

      const meta = await request(app).get(`/v1/events/${eventId}/flier`).set(readHeaders);
      expect(meta.status).toBe(200);
      expect(meta.body).toEqual(upload.body);

      // No bearer: the token is the whole credential.
      const image = await request(app).get(upload.body.url);
      expect(image.status).toBe(200);
      expect(image.headers['content-type']).toBe('image/png');
      expect(image.headers['x-content-type-options']).toBe('nosniff');
      expect(image.headers['content-disposition']).toBe('inline');
      expect(image.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      const body = Buffer.isBuffer(image.body) ? image.body : Buffer.from(image.text, 'binary');
      expect(Buffer.compare(body, bytes)).toBe(0);
      served[kind] = body;

      // Outside `/v1`: the bearer namespace does not own it.
      const insideV1 = await request(app).get(`/v1${upload.body.url}`).set(readHeaders);
      expect(insideV1.status).toBe(404);
      expect(insideV1.body.code).toBe('route_not_found');
    });

    it('refuses more than 2 MiB and an unaccepted type without storing anything', async () => {
      const tooLarge = Buffer.concat([tinyPng(), Buffer.alloc(2 * 1024 * 1024, 1)]);
      const oversized = await request(app)
        .put(`/v1/events/${eventId}/flier`)
        .set(writeHeaders)
        .set('Content-Type', 'image/png')
        .send(tooLarge);
      expect(oversized.status).toBe(413);
      expect(oversized.body.code).toBe('flier_too_large');

      const notAnImage = await request(app)
        .put(`/v1/events/${eventId}/flier`)
        .set(writeHeaders)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('this is not an image'));
      expect(notAnImage.status).toBe(400);
      expect(notAnImage.body.code).toBe('unsupported_flier');

      // The bytes say PNG but the request claims JPEG: the magic bytes win.
      const mismatched = await request(app)
        .put(`/v1/events/${eventId}/flier`)
        .set(writeHeaders)
        .set('Content-Type', 'image/jpeg')
        .send(tinyPng());
      expect(mismatched.status).toBe(400);
      expect(mismatched.body.code).toBe('unsupported_flier');

      // The refused uploads did not disturb the stored one.
      const meta = await request(app).get(`/v1/events/${eventId}/flier`).set(readHeaders);
      expect(meta.status).toBe(200);
      expect(meta.body.contentType).toBe('image/png');
    });

    it('removes the flier and then answers 404', async () => {
      const removed = await request(app).delete(`/v1/events/${eventId}/flier`).set(writeHeaders);
      expect(removed.status).toBe(204);

      const meta = await request(app).get(`/v1/events/${eventId}/flier`).set(readHeaders);
      expect(meta.status).toBe(404);
    });

    it('answers 404 for an unknown or malformed token', async () => {
      const unknown = await request(app).get(`/fliers/${'a'.repeat(64)}`);
      expect(unknown.status).toBe(404);
      const malformed = await request(app).get('/fliers/not-a-token');
      expect(malformed.status).toBe(404);
    });
  });
}

describe('the s3 request signature', () => {
  it('signs every request with SigV4, the right scope and the payload hash', async () => {
    const signed = s3.requests.filter((request) => request.headers.authorization !== undefined);
    expect(signed.length).toBeGreaterThan(0);

    for (const request of signed) {
      const auth = String(request.headers.authorization);
      expect(auth).toMatch(/^AWS4-HMAC-SHA256 Credential=[^/]+\/\d{8}\/[^/]+\/s3\/aws4_request/);
      expect(auth).toContain('SignedHeaders=');
      expect(auth).toContain('Signature=');

      // The payload hash must be the body’s sha256, not a placeholder.
      const payloadHash = String(request.headers['x-amz-content-sha256']);
      expect(payloadHash).toMatch(/^[0-9a-f]{64}$/);
      expect(String(request.headers['x-amz-date'])).toMatch(/^\d{8}T\d{6}Z$/);

      // host must be one of the signed headers, or the signature is invalid.
      const signedHeaders = /SignedHeaders=([^,]+)/.exec(auth)?.[1] ?? '';
      expect(signedHeaders.split(';')).toContain('host');
    }
  });
});

describe('both stores', () => {
  it('serve identical bytes for the same upload', () => {
    expect(served.db).toBeTruthy();
    expect(served.s3).toBeTruthy();
    expect(Buffer.compare(served.db!, served.s3!)).toBe(0);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => s3.server.close(() => resolve()));
});
