import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app.js';

const ALLOWED = 'https://stayboy.github.io';
const UNLISTED = 'https://evil.example';

/**
 * The operator UI probes `/health` cross-origin before asking for a magic link
 * (FR-23, AC-23). Without the header the browser refuses to let the fetch read
 * the response and the connection badge reports the gateway down.
 */
describe('health CORS', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ corsOrigins: [ALLOWED] });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('answers an allowlisted origin with Access-Control-Allow-Origin', async () => {
    const response = await request(harness.app).get('/health').set('Origin', ALLOWED);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers.vary).toContain('Origin');
  });

  it('answers an unlisted origin normally, without the header', async () => {
    const response = await request(harness.app).get('/health').set('Origin', UNLISTED);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a request with no Origin without the header', async () => {
    const response = await request(harness.app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
