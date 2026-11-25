import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';

/**
 * The church defaults round-trip and a new plan copies their slot template
 * (member-registrations-event-notifications.md N-12, FR-31; AC-40).
 */
let harness: TestApp;
let app: TestApp['app'];

const TEMPLATE = [
  { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
  { kind: 'last', anchor: 'event_end', offsetMinutes: -2880 },
];

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

describe('/v1/notification-defaults', () => {
  it('answers the built-in defaults when no row is stored', async () => {
    const response = await request(app).get('/v1/notification-defaults').set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      churchName: 'The Church',
      smsConfirmThreshold: 250,
      sendMode: 'window',
      churchTimezone: 'Africa/Lagos',
      failureDigestEnabled: true,
      updatedAt: null,
      updatedBy: null,
    });
    expect(response.body.slots).toHaveLength(4);
  });

  it('round-trips a partial write and keeps every omitted field', async () => {
    const written = await request(app)
      .put('/v1/notification-defaults')
      .set(writeHeaders)
      .send({
        churchName: 'Grace Assembly',
        emailReplyTo: 'events@example.org',
        slots: TEMPLATE,
        whatsappTemplates: { announce: 'event_announce' },
      });

    expect(written.status).toBe(200);
    expect(written.body).toMatchObject({
      churchName: 'Grace Assembly',
      emailReplyTo: 'events@example.org',
      slots: TEMPLATE,
      whatsappTemplates: { announce: 'event_announce' },
      // Untouched fields keep their values.
      smsConfirmThreshold: 250,
      sendMode: 'window',
      updatedBy: 'test-admin',
    });
    expect(written.body.updatedAt).not.toBeNull();

    const read = await request(app).get('/v1/notification-defaults').set(readHeaders);
    expect(read.body).toEqual(written.body);
  });

  it('refuses a slot template whose anchor its kind does not allow', async () => {
    const response = await request(app)
      .put('/v1/notification-defaults')
      .set(writeHeaders)
      .send({ slots: [{ kind: 'starts', anchor: 'event_start', offsetMinutes: 0 }] });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('invalid_slot_anchor');
  });

  it('refuses a write with no actor', async () => {
    const response = await request(app)
      .put('/v1/notification-defaults')
      .set({ Authorization: writeHeaders.Authorization })
      .send({ churchName: 'Anonymous' });
    expect(response.status).toBe(422);
  });
});

describe('a new plan copies the slot template', () => {
  it('takes the defaults slots when the write names none, and leaves the defaults row alone', async () => {
    const before = await request(app).get('/v1/notification-defaults').set(readHeaders);

    const seeded = await seedEvent(harness.db, {
      name: 'Defaults Copy',
      startDate: '2026-12-06',
      endDate: '2026-12-06',
      startTime: '09:00',
      sessions: [{ date: '2026-12-06' }],
    });

    const plan = await request(app)
      .put(`/v1/events/${seeded.eventId}/notification-plan`)
      .set(writeHeaders)
      .send({ templates: [{ channel: 'ussd', bodyText: '{{eventName}}' }] });

    expect(plan.status).toBe(200);
    expect(
      plan.body.slots.map((slot: { kind: string; anchor: string; offsetMinutes: number }) => ({
        kind: slot.kind,
        anchor: slot.anchor,
        offsetMinutes: slot.offsetMinutes,
      })),
    ).toEqual(TEMPLATE);

    const after = await request(app).get('/v1/notification-defaults').set(readHeaders);
    expect(after.body).toEqual(before.body);
  });
});
