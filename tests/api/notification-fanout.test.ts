import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { testPhone } from '../helpers/member-fixtures.js';
import {
  FakeNotificationSender,
  type NotificationSenders,
} from '../../src/messaging/notification-sender.js';
import { deliverNotification, fanOutInstance } from '../../src/repos/notification-deliveries.js';

/**
 * Fan-out: inbox before any provider call, destination resolution, the fixed
 * skip precedence and cadence per occurrence (N-4..N-6; FR-7..FR-11).
 * AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-9, AC-14, AC-44.
 */
let harness: TestApp;
let app: TestApp['app'];
let eventId: string;
let instanceId: string;
let memberA: string;
let memberB: string;
let memberC: string;
let memberD: string;
let memberG: string;
let verifiedEmailId: string;
let aPhoneValue: string;

const senders: NotificationSenders = {
  email: new FakeNotificationSender('email'),
  sms: new FakeNotificationSender('sms'),
  whatsapp: new FakeNotificationSender('whatsapp'),
};

async function createMember(
  memberNo: string,
  firstName: string,
  contacts: Array<{ kind: 'phone' | 'email' | 'whatsapp'; value: string }>,
  guardianMemberNo?: string,
) {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName,
      lastName: 'Fanout',
      joinedOn: '2020-01-01',
      dob: '1985-01-01',
      contacts,
      ...(guardianMemberNo ? { guardianMemberNo } : {}),
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function deliveryRows(instance: string) {
  return harness.db.query<{
    id: string;
    member_id: string;
    channel: string;
    status: string;
    skip_reason: string | null;
    routed_via: string;
    message_id: string | null;
    contact_id: string | null;
    destination_masked: string | null;
  }>(
    `select id, member_id, channel, status, skip_reason, routed_via, message_id,
            contact_id, destination_masked
       from notification_deliveries where instance_id = $1`,
    [instance],
  );
}

async function deliverAll(instance: string) {
  const rows = await deliveryRows(instance);
  for (const row of rows) {
    if (row.status === 'pending' || row.status === 'failed') {
      await deliverNotification(harness.db, senders, row.id);
    }
  }
}

function calls() {
  return {
    email: (senders.email as FakeNotificationSender).calls,
    sms: (senders.sms as FakeNotificationSender).calls,
    whatsapp: (senders.whatsapp as FakeNotificationSender).calls,
  };
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const seeded = await seedEvent(harness.db, {
    name: 'The Convention',
    startDate: '2026-12-06',
    endDate: '2026-12-06',
    startTime: '09:00',
    endTime: '12:00',
    venueName: 'The Auditorium',
    sessions: [{ date: '2026-12-06' }],
  });
  eventId = seeded.eventId;

  aPhoneValue = testPhone();
  memberA = await createMember('M-FAN-A', 'Ada', [
    { kind: 'phone', value: aPhoneValue },
    { kind: 'email', value: 'a.unverified@example.org' },
    { kind: 'email', value: 'a.verified@example.org' },
  ]);
  memberB = await createMember('M-FAN-B', 'Boateng', [{ kind: 'phone', value: testPhone() }]);
  memberG = await createMember('M-FAN-G', 'Grace', [{ kind: 'phone', value: testPhone() }]);
  memberC = await createMember('M-FAN-C', 'Child', [], 'M-FAN-G');
  memberD = await createMember('M-FAN-D', 'Dede', [{ kind: 'phone', value: testPhone() }]);

  const [emailRow] = await harness.db.query<{ id: string }>(
    `select id from member_contacts where member_id = $1 and value = 'a.verified@example.org'`,
    [memberA],
  );
  verifiedEmailId = emailRow!.id;
  await harness.db.query(`update member_contacts set verified_at = now() where id = $1`, [
    verifiedEmailId,
  ]);

  // B blocked SMS and muted the event; D chose minimal cadence.
  await harness.db.query(
    `insert into member_channel_blocks
       (member_id, channel, duration_days, expires_at, created_by, source)
     values ($1,'sms',30, now() + interval '30 days', 'test', 'admin')`,
    [memberB],
  );
  await harness.db.query(
    `insert into notification_mutes
       (member_id, scope_type, scope_id, scope_name, duration_days, expires_at, created_by, source)
     values ($1,'event',$2,'The Convention',30, now() + interval '30 days', 'test', 'admin')`,
    [memberB, eventId],
  );
  await harness.db.query(
    `insert into member_notification_settings (member_id, cadence, updated_by, updated_source)
     values ($1,'minimal','test','admin')`,
    [memberD],
  );

  const saved = await request(app)
    .put(`/v1/events/${eventId}/notification-plan`)
    .set(writeHeaders)
    .send({
      slots: [
        { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
        { kind: 'reminder', anchor: 'event_start', offsetMinutes: -60 },
        { kind: 'starts', anchor: 'occurrence_start', offsetMinutes: 0 },
        { kind: 'last', anchor: 'occurrence_end', offsetMinutes: -60 },
      ],
      templates: [
        {
          channel: 'email',
          subject: '{{eventName}}',
          body: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{firstName}}' }] }],
          },
          bodyText: '{{firstName}}, see you.',
        },
        { channel: 'sms', bodyText: '{{eventName}} on {{eventDate}}' },
        { channel: 'ussd', bodyText: '{{eventName}} is on {{eventDate}} at {{startTime}}.' },
      ],
    });
  expect(saved.status).toBe(200);

  const published = await request(app)
    .post(`/v1/events/${eventId}/notification-plan/publish`)
    .set(writeHeaders)
    .send({});
  expect(published.status).toBe(200);
  // The announce slot is the first instance; fan out that one.
  instanceId = (published.body.instances as Array<{ id: string; kind: string }>).find(
    (instance) => instance.kind === 'announce',
  )!.id;
});

afterAll(async () => {
  await harness.close();
});

describe('fan-out', () => {
  it('writes the inbox before any provider call, and only for members owning a contact', async () => {
    await fanOutInstance(harness.db, instanceId);
    expect(calls().email).toHaveLength(0);
    expect(calls().sms).toHaveLength(0);
    expect(calls().whatsapp).toHaveLength(0);

    const messages = await harness.db.query<{ member_id: string }>(
      'select member_id from notification_messages where instance_id = $1',
      [instanceId],
    );
    expect(messages).toHaveLength(4);
    expect(messages.map((row) => row.member_id)).not.toContain(memberC);
    expect(messages.map((row) => row.member_id)).toEqual(
      expect.arrayContaining([memberA, memberB, memberD, memberG]),
    );

    const rows = await deliveryRows(instanceId);
    expect(rows).toHaveLength(15); // five recipients, three channels
    expect(rows.every((row) => row.status === 'pending')).toBe(true);
  });

  it('creates no duplicate on a re-run (AC-14)', async () => {
    await fanOutInstance(harness.db, instanceId);
    const [messages] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_messages where instance_id = $1',
      [instanceId],
    );
    const [deliveries] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_deliveries where instance_id = $1',
      [instanceId],
    );
    expect(Number(messages!.count)).toBe(4);
    expect(Number(deliveries!.count)).toBe(15);
    expect(calls().email).toHaveLength(0);
  });

  it('pages the inbox in batches, one transaction each, and resumes a partial run', async () => {
    // The production batch is 500 rows; the seam lowers it so the loop is exercised rather than
    // assumed. A fresh instance is materialised so the earlier fan-out's rows cannot mask a
    // missing batch.
    const [fresh] = await harness.db.query<{ id: string }>(
      `insert into notification_slot_instances
         (plan_id, slot_id, kind, revision, occurrence_date, send_at, status)
       select plan_id, slot_id, kind, revision, occurrence_date, send_at + interval '1 day', 'scheduled'
         from notification_slot_instances where id = $1
       returning id`,
      [instanceId],
    );

    await fanOutInstance(harness.db, fresh!.id, { batchSize: 2 });

    const [messages] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_messages where instance_id = $1',
      [fresh!.id],
    );
    expect(Number(messages!.count)).toBe(4);

    // A second run with the same batch size adds nothing: each batch inserts under
    // `unique (instance_id, member_id)` and the resume is the rows that do not yet exist.
    await fanOutInstance(harness.db, fresh!.id, { batchSize: 2 });
    const [again] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_messages where instance_id = $1',
      [fresh!.id],
    );
    expect(Number(again!.count)).toBe(4);
  });

  it('records the skip precedence at delivery time and sends the permitted channels', async () => {
    await deliverAll(instanceId);
    const rows = await deliveryRows(instanceId);

    const find = (member: string, channel: string) =>
      rows.find((row) => row.member_id === member && row.channel === channel)!;

    // B: SMS is blocked; every other channel is muted by the event mute, which
    // precedes no_contact.
    expect(find(memberB, 'sms')).toMatchObject({
      status: 'skipped',
      skip_reason: 'channel_blocked',
    });
    expect(find(memberB, 'email')).toMatchObject({ status: 'skipped', skip_reason: 'event_muted' });
    expect(find(memberB, 'whatsapp')).toMatchObject({
      status: 'skipped',
      skip_reason: 'event_muted',
    });

    // The verified email beats the lower display order, and the row is masked.
    expect(find(memberA, 'email')).toMatchObject({
      status: 'sent',
      contact_id: verifiedEmailId,
      destination_masked: 'a***@example.org',
    });
    expect(find(memberA, 'email').destination_masked).not.toContain('a.verified');
    expect(find(memberA, 'sms')).toMatchObject({ status: 'sent' });
    expect(find(memberA, 'sms').destination_masked).toMatch(/^\*\*\*\d{4}$/);

    // C is reachable only through G: no inbox row, a guardian-routed delivery
    // with a null message_id and G's contact.
    const [child] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_messages where instance_id = $1 and member_id = $2',
      [instanceId, memberC],
    );
    expect(Number(child!.count)).toBe(0);
    expect(find(memberC, 'sms')).toMatchObject({
      status: 'sent',
      routed_via: 'guardian',
      message_id: null,
    });
    expect(find(memberC, 'sms').contact_id).not.toBeNull();
    expect(find(memberC, 'email')).toMatchObject({
      status: 'skipped',
      skip_reason: 'no_contact',
      message_id: null,
    });

    // No raw value reached a stored mask.
    for (const row of rows) {
      if (row.destination_masked) expect(row.destination_masked).not.toContain(aPhoneValue);
    }
  });

  it('applies cadence per occurrence: minimal keeps starts and last, the inbox keeps all', async () => {
    const published = await request(app)
      .get(`/v1/events/${eventId}/notification-plan/instances`)
      .set(readHeaders);
    const instances = published.body.instances as Array<{ id: string; kind: string }>;

    for (const instance of instances) {
      await fanOutInstance(harness.db, instance.id);
      await deliverAll(instance.id);
    }

    const rows = await harness.db.query<{
      kind: string;
      channel: string;
      status: string;
      skip_reason: string | null;
    }>(
      `select i.kind, d.channel, d.status, d.skip_reason
         from notification_deliveries d
         join notification_slot_instances i on i.id = d.instance_id
        where d.member_id = $1`,
      [memberD],
    );
    for (const row of rows) {
      if (row.kind === 'starts' || row.kind === 'last') {
        if (row.channel === 'sms') {
          expect(row.status).toBe('sent');
        } else {
          expect(row.status).toBe('skipped');
          expect(row.skip_reason).toBe('no_contact');
        }
      } else {
        expect(row.status).toBe('skipped');
        expect(row.skip_reason).toBe('cadence_filtered');
      }
    }

    // The inbox holds every instance for the minimal member.
    const [messages] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_messages where member_id = $1',
      [memberD],
    );
    expect(Number(messages!.count)).toBe(instances.length);
  });
});
