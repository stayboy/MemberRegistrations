import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { testPhone } from '../helpers/member-fixtures.js';
import {
  FakeNotificationSender,
  NotificationSendError,
  type NotificationSenders,
} from '../../src/messaging/notification-sender.js';
import { deliverNotification, fanOutInstance } from '../../src/repos/notification-deliveries.js';

/**
 * The send path: `channel_unconfigured` and `provider_rejected` are terminal,
 * `transport_unavailable` backs off to five attempts, and the audited retry
 * route accepts only a failed row (N-8; FR-21, FR-45). AC-10, AC-15, AC-47.
 */
let harness: TestApp;
let app: TestApp['app'];
let eventId: string;
let instanceId: string;
let emailDelivery: string;
let smsDelivery: string;

const email = new FakeNotificationSender('email');
const sms = new FakeNotificationSender('sms');
const whatsapp = new FakeNotificationSender('whatsapp');
const senders: NotificationSenders = { email: null, sms, whatsapp };

async function row(id: string) {
  const [record] = await harness.db.query<{
    status: string;
    attempts: number;
    last_error_code: string | null;
    skip_reason: string | null;
  }>(
    'select status, attempts, last_error_code, skip_reason from notification_deliveries where id = $1',
    [id],
  );
  return record!;
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
  const seeded = await seedEvent(harness.db, {
    name: 'Delivery Service',
    startDate: '2026-12-06',
    endDate: '2026-12-06',
    startTime: '09:00',
    endTime: '12:00',
    sessions: [{ date: '2026-12-06' }],
  });
  eventId = seeded.eventId;

  const member = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo: 'M-DEL-1',
      firstName: 'Ada',
      lastName: 'Delivery',
      joinedOn: '2020-01-01',
      contacts: [
        { kind: 'phone', value: testPhone() },
        { kind: 'email', value: 'ada.delivery@example.org' },
      ],
    });
  expect(member.status).toBe(201);

  await request(app)
    .put(`/v1/events/${eventId}/notification-plan`)
    .set(writeHeaders)
    .send({
      slots: [{ kind: 'announce', anchor: 'publish', offsetMinutes: 0 }],
      templates: [
        {
          channel: 'email',
          subject: '{{eventName}}',
          body: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
          },
          bodyText: 'hello',
        },
        { channel: 'sms', bodyText: '{{eventName}}' },
        { channel: 'ussd', bodyText: '{{eventName}}' },
      ],
    });

  const published = await request(app)
    .post(`/v1/events/${eventId}/notification-plan/publish`)
    .set(writeHeaders)
    .send({});
  instanceId = published.body.instances[0].id;
  await fanOutInstance(harness.db, instanceId);

  const rows = await harness.db.query<{ id: string; channel: string }>(
    'select id, channel from notification_deliveries where instance_id = $1',
    [instanceId],
  );
  emailDelivery = rows.find((entry) => entry.channel === 'email')!.id;
  smsDelivery = rows.find((entry) => entry.channel === 'sms')!.id;
});

afterAll(async () => {
  await harness.close();
});

describe('an unconfigured channel', () => {
  it('fails channel_unconfigured on the first attempt and never calls a provider', async () => {
    await deliverNotification(harness.db, senders, emailDelivery);
    expect(await row(emailDelivery)).toMatchObject({
      status: 'failed',
      attempts: 1,
      last_error_code: 'channel_unconfigured',
    });
    expect(email.calls).toHaveLength(0);
  });

  it('refuses a retry of a sent delivery with 409 delivery_not_failed', async () => {
    // A sent row is terminal; the route must refuse it.
    await harness.db.query(
      `update notification_deliveries set status = 'sent', sent_at = now() where id = $1`,
      [emailDelivery],
    );
    const response = await request(app)
      .post(`/v1/notification-deliveries/${emailDelivery}/retry`)
      .set(writeHeaders)
      .send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('delivery_not_failed');
  });
});

describe('the retry route', () => {
  it('re-enqueues a failed row once and audits the actor and time', async () => {
    await harness.db.query(
      `update notification_deliveries set status = 'failed', last_error_code = 'provider_rejected' where id = $1`,
      [emailDelivery],
    );
    const response = await request(app)
      .post(`/v1/notification-deliveries/${emailDelivery}/retry`)
      .set(writeHeaders)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pending');
    expect(response.body.lastErrorCode).toBeNull();
    expect(response.body.destinationMasked).toBe('a***@example.org');

    const [audit] = await harness.db.query<{
      field: string;
      source: string;
      actor: string;
      from_value: string;
    }>(
      `select field, source, actor, from_value from notification_preference_events
        where member_id = (select member_id from notification_deliveries where id = $1)
        order by at desc limit 1`,
      [emailDelivery],
    );
    expect(audit).toMatchObject({
      field: 'delivery_retry',
      source: 'admin',
      actor: 'test-admin',
      from_value: 'failed',
    });
  });

  it('re-renders and can end sent on the second attempt', async () => {
    senders.email = email;
    await deliverNotification(harness.db, senders, emailDelivery);
    expect(await row(emailDelivery)).toMatchObject({
      status: 'sent',
      // The retry reset the budget, so this is the first attempt of the new run.
      attempts: 1,
      last_error_code: null,
    });
    expect(email.calls).toHaveLength(1);
    expect(email.calls[0]!.payload.subject).toBe('Delivery Service');
  });

  it('grants a fresh budget to a dead-lettered row at the fifth attempt', async () => {
    await harness.db.query(
      `update notification_deliveries
          set status = 'failed', attempts = 5, last_error_code = 'transport_unavailable'
        where id = $1`,
      [emailDelivery],
    );
    const response = await request(app)
      .post(`/v1/notification-deliveries/${emailDelivery}/retry`)
      .set(writeHeaders)
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.attempts).toBe(0);

    const fresh = new FakeNotificationSender('email');
    senders.email = fresh;
    await deliverNotification(harness.db, senders, emailDelivery);
    expect(await row(emailDelivery)).toMatchObject({ status: 'sent', attempts: 1 });
    expect(fresh.calls).toHaveLength(1);
  });
});

describe('provider rejection is terminal', () => {
  it('fails provider_rejected on the first attempt without backing off', async () => {
    senders.sms = sms;
    sms.failWith(new NotificationSendError('provider_rejected'));
    await deliverNotification(harness.db, senders, smsDelivery);
    expect(await row(smsDelivery)).toMatchObject({
      status: 'failed',
      attempts: 1,
      last_error_code: 'provider_rejected',
    });
  });

  it('does not re-send a failed row when pg-boss redelivers the job', async () => {
    // A terminal row must survive at-least-once redelivery unchanged: FR-21 makes it terminal,
    // and the redelivery is exactly what happens when the worker dies between commit and ack.
    const retryable = new FakeNotificationSender('sms');
    senders.sms = retryable;
    await deliverNotification(harness.db, senders, smsDelivery);
    expect(retryable.calls).toHaveLength(0);
    expect(await row(smsDelivery)).toMatchObject({
      status: 'failed',
      attempts: 1,
      last_error_code: 'provider_rejected',
    });
    senders.sms = sms;
  });

  it('does not send a delivery whose instance was cancelled', async () => {
    await harness.db.query(
      `update notification_slot_instances set status = 'cancelled' where id = $1`,
      [instanceId],
    );
    await harness.db.query(
      `update notification_deliveries set status = 'pending', attempts = 0 where id = $1`,
      [emailDelivery],
    );
    const live = new FakeNotificationSender('email');
    senders.email = live;
    await deliverNotification(harness.db, senders, emailDelivery);
    expect(live.calls).toHaveLength(0);
    expect((await row(emailDelivery)).status).toBe('pending');
    await harness.db.query(`update notification_slot_instances set status = 'sent' where id = $1`, [
      instanceId,
    ]);
  });
});

describe('transport_unavailable backs off for five attempts then dead-letters', () => {
  it('stores a sanitised code each time and failed on the fifth', async () => {
    await harness.db.query(
      `update notification_deliveries
          set status = 'pending', attempts = 0, last_error_code = null
        where id = $1`,
      [smsDelivery],
    );
    sms.failWith(new NotificationSendError('transport_unavailable'));

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(deliverNotification(harness.db, senders, smsDelivery)).rejects.toThrow();
      const stored = await row(smsDelivery);
      expect(stored.attempts).toBe(attempt);
      expect(stored.last_error_code).toBe('transport_unavailable');
      expect(stored.status).toBe(attempt === 5 ? 'failed' : 'pending');
    }
  });

  it('never stores a provider body: the code is from the closed set', async () => {
    const codes = await harness.db.query<{ last_error_code: string }>(
      `select distinct last_error_code from notification_deliveries where last_error_code is not null`,
    );
    for (const entry of codes) {
      expect(['channel_unconfigured', 'transport_unavailable', 'provider_rejected']).toContain(
        entry.last_error_code,
      );
    }
  });
});
