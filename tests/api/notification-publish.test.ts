import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { testPhone } from '../helpers/member-fixtures.js';

/**
 * Publish, cancel and the change notice (N-1, N-3; FR-17..FR-19).
 * AC-2, AC-9, AC-10, AC-11, AC-12, AC-13, AC-36, AC-43.
 */
let harness: TestApp;
let app: TestApp['app'];
let eventId: string;

function templates(
  channels: Array<'email' | 'whatsapp' | 'sms' | 'ussd'> = ['email', 'whatsapp', 'sms', 'ussd'],
) {
  const all = {
    email: {
      channel: 'email',
      subject: '{{eventName}} starts {{eventDate}}',
      body: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '{{firstName}}, see you.' }] },
        ],
      },
      bodyText: '{{firstName}}, see you at {{venue}}.',
    },
    whatsapp: {
      channel: 'whatsapp',
      templateName: 'event_announce',
      parameterMap: { firstName: 1, eventName: 2 },
    },
    sms: { channel: 'sms', bodyText: '{{eventName}} {{eventDate}} {{startTime}}' },
    ussd: { channel: 'ussd', bodyText: '{{eventName}} is on {{eventDate}} at {{startTime}}.' },
  };
  return channels.map((channel) => all[channel]);
}

function planBody(
  slots = [
    { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
    { kind: 'starts', anchor: 'occurrence_start', offsetMinutes: 0 },
    { kind: 'last', anchor: 'occurrence_end', offsetMinutes: -1440 },
  ],
  channels?: Array<'email' | 'whatsapp' | 'sms' | 'ussd'>,
) {
  return { slots, templates: templates(channels) };
}

async function createMember(memberNo: string, firstName: string) {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName,
      lastName: 'Publish',
      joinedOn: '2020-01-01',
      contacts: [{ kind: 'phone', value: testPhone() }],
    });
  expect(response.status).toBe(201);
}

async function savePlan(id = eventId, body = planBody()) {
  return request(app).put(`/v1/events/${id}/notification-plan`).set(writeHeaders).send(body);
}

function publish(id = eventId, ifMatch?: string) {
  const call = request(app).post(`/v1/events/${id}/notification-plan/publish`).set(writeHeaders);
  if (ifMatch) call.set('If-Match', ifMatch);
  return call.send({});
}

async function planRows(id: string) {
  const [row] = await harness.db.query<{ plan_id: string; revision: number }>(
    `select p.id as plan_id, max(r.revision)::int as revision
       from notification_plans p join notification_plan_revisions r on r.plan_id = p.id
      where p.event_id = $1 group by p.id`,
    [id],
  );
  return row!;
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;
  const seeded = await seedEvent(harness.db, {
    name: 'The Convention',
    startDate: '2026-12-06',
    endDate: '2026-12-08',
    startTime: '09:00',
    endTime: '12:00',
    venueName: 'The Auditorium',
    sessions: [{ date: '2026-12-06' }, { date: '2026-12-08' }],
  });
  eventId = seeded.eventId;
  await createMember('M-PUB-1', 'Ada');
  await createMember('M-PUB-2', 'Boateng');
  const saved = await savePlan();
  expect(saved.status).toBe(200);
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/events/{eventId}/notification-plan/publish', () => {
  it('materialises one instance per slot and occurrence and pins the content token', async () => {
    const read = await request(app).get(`/v1/events/${eventId}/notification-plan`).set(readHeaders);
    const contentEtag = read.body.contentEtag as string;
    expect(contentEtag).toMatch(/^"c[0-9a-f]+"$/);

    const response = await publish(eventId, contentEtag);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('published');
    expect(response.body.revision).toBe(1);
    expect(response.body.created).toBe(5);
    expect(response.body.instances).toHaveLength(5);
    expect(
      response.body.instances.map((instance: { kind: string }) => instance.kind).sort(),
    ).toEqual(['announce', 'last', 'last', 'starts', 'starts']);
    for (const instance of response.body.instances) {
      expect(instance.deliveryAt).not.toBeNull();
      expect(instance.status).toBe('scheduled');
    }
  });

  it('is idempotent: a republish returns the same instances and creates none', async () => {
    const first = await publish(eventId);
    const second = await publish(eventId);
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(0);
    expect(second.body.revision).toBe(1);
    expect(second.body.instances.map((instance: { id: string }) => instance.id)).toEqual(
      first.body.instances.map((instance: { id: string }) => instance.id),
    );
    const [count] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_slot_instances',
    );
    expect(Number(count!.count)).toBe(5);
  });

  it('refuses a stale content If-Match with 412 and schedules nothing', async () => {
    const response = await publish(eventId, '"cdeadbeefdeadbeef"');
    expect(response.status).toBe(412);
    expect(response.body.code).toBe('plan_content_stale');
  });

  it('refuses a past slot with 422 slot_in_past and leaves the plan draft', async () => {
    const past = await seedEvent(harness.db, {
      name: 'Past Service',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      startTime: '09:00',
      sessions: [{ date: '2026-11-01' }],
    });
    await savePlan(
      past.eventId,
      planBody([
        { kind: 'reminder', anchor: 'event_start', offsetMinutes: -60 },
        { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
      ]),
    );
    const response = await publish(past.eventId);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('slot_in_past');
    const [row] = await harness.db.query<{ status: string }>(
      `select r.status from notification_plans p
         join notification_plan_revisions r on r.plan_id = p.id
        where p.event_id = $1`,
      [past.eventId],
    );
    expect(row!.status).toBe('draft');
  });

  it('refuses two slots resolving to one instant with 422 duplicate_slot_time', async () => {
    const duplicate = await seedEvent(harness.db, {
      name: 'Duplicate Service',
      startDate: '2026-12-13',
      endDate: '2026-12-13',
      startTime: '09:00',
      sessions: [{ date: '2026-12-13' }],
    });
    await savePlan(
      duplicate.eventId,
      planBody([{ kind: 'announce', anchor: 'publish', offsetMinutes: 0 }]),
    );
    const rows = await planRows(duplicate.eventId);
    await harness.db.query(
      `insert into notification_plan_slots (plan_id, revision, kind, anchor, offset_minutes, sort_order)
       values ($1,$2,'announce','publish',0,9)`,
      [rows.plan_id, rows.revision],
    );
    const response = await publish(duplicate.eventId);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('duplicate_slot_time');
    const [count] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_slot_instances where plan_id = $1',
      [rows.plan_id],
    );
    expect(Number(count!.count)).toBe(0);
  });

  it('requires the ussd template even when no other channel has recipients (FR-12)', async () => {
    const missing = await seedEvent(harness.db, {
      name: 'Missing Template',
      startDate: '2026-12-13',
      endDate: '2026-12-13',
      startTime: '09:00',
      sessions: [{ date: '2026-12-13' }],
    });
    await savePlan(
      missing.eventId,
      planBody([{ kind: 'announce', anchor: 'publish', offsetMinutes: 0 }], ['sms']),
    );
    const response = await publish(missing.eventId);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('template_required');
  });

  it('caps materialisation to the 90-day horizon (FR-5)', async () => {
    const far = await seedEvent(harness.db, {
      name: 'Horizon Service',
      startDate: '2026-12-13',
      endDate: '2027-06-13',
      startTime: '09:00',
      sessions: [{ date: '2026-12-13' }, { date: '2027-06-13' }],
    });
    await savePlan(
      far.eventId,
      planBody([
        { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
        { kind: 'starts', anchor: 'occurrence_start', offsetMinutes: 0 },
      ]),
    );
    const response = await publish(far.eventId);
    expect(response.status).toBe(200);
    const starts = (response.body.instances as Array<{ kind: string; occurrenceDate: string }>)
      .filter((instance) => instance.kind === 'starts')
      .map((instance) => instance.occurrenceDate);
    expect(starts).toEqual(['2026-12-13']);
  });

  it('refuses a draft or archived event with 409 event_not_active', async () => {
    const draft = await seedEvent(harness.db, {
      name: 'Draft Event',
      startDate: '2026-12-13',
      endDate: '2026-12-13',
      status: 'draft',
      sessions: [{ date: '2026-12-13' }],
    });
    await savePlan(
      draft.eventId,
      planBody([{ kind: 'announce', anchor: 'publish', offsetMinutes: 0 }]),
    );
    const response = await publish(draft.eventId);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('event_not_active');
  });
});

describe('the deployed cadence floor (FR-42, AC-36)', () => {
  it('refuses a starts slot on a trigger coarser than 15 minutes', async () => {
    const coarse = await createTestApp({ notificationTriggerMinutes: 30 });
    try {
      const seeded = await seedEvent(coarse.db, {
        name: 'Coarse Trigger',
        startDate: '2026-12-13',
        endDate: '2026-12-13',
        startTime: '09:00',
        sessions: [{ date: '2026-12-13' }],
      });
      const saved = await request(coarse.app)
        .put(`/v1/events/${seeded.eventId}/notification-plan`)
        .set(writeHeaders)
        .send(planBody());
      expect(saved.status).toBe(200);
      const refused = await request(coarse.app)
        .post(`/v1/events/${seeded.eventId}/notification-plan/publish`)
        .set(writeHeaders)
        .send({});
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('cadence_too_coarse');

      const defaults = await request(coarse.app).get('/v1/notification-defaults').set(readHeaders);
      expect(defaults.body.trigger).toEqual({ kind: 'interval', minutes: 30 });
    } finally {
      await coarse.close();
    }
  });

  it('allows the same publish on a 15-minute trigger', async () => {
    const fine = await createTestApp({ notificationTriggerMinutes: 15 });
    try {
      const seeded = await seedEvent(fine.db, {
        name: 'Fine Trigger',
        startDate: '2026-12-13',
        endDate: '2026-12-13',
        startTime: '09:00',
        sessions: [{ date: '2026-12-13' }],
      });
      await request(fine.app)
        .put(`/v1/events/${seeded.eventId}/notification-plan`)
        .set(writeHeaders)
        .send(planBody());
      const response = await request(fine.app)
        .post(`/v1/events/${seeded.eventId}/notification-plan/publish`)
        .set(writeHeaders)
        .send({});
      expect(response.status).toBe(200);
    } finally {
      await fine.close();
    }
  });
});

describe('cancel and republish (FR-18, AC-9)', () => {
  it('cancels scheduled instances, keeps history, and republishing the same moment works', async () => {
    const response = await request(app)
      .post(`/v1/events/${eventId}/notification-plan/cancel`)
      .set(writeHeaders)
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelled');
    expect(response.body.cancelledInstances).toBe(5);

    const [scheduled] = await harness.db.query<{ count: number }>(
      `select count(*)::int as count from notification_slot_instances
        where plan_id = (select id from notification_plans where event_id = $1)
          and status = 'scheduled'`,
      [eventId],
    );
    expect(Number(scheduled!.count)).toBe(0);

    const republished = await publish(eventId);
    expect(republished.status).toBe(200);
    expect(republished.body.revision).toBe(2);
    expect(republished.body.created).toBe(5);
  });
});

describe('the change notice (FR-19, AC-13)', () => {
  it('writes its own row and its own instance, touching no slot or future instance', async () => {
    const before = await request(app)
      .get(`/v1/events/${eventId}/notification-plan/instances`)
      .set(readHeaders);
    const future = (before.body.instances as Array<{ kind: string }>).filter(
      (instance) => instance.kind !== 'change',
    ).length;

    const response = await request(app)
      .post(`/v1/events/${eventId}/notification-plan/change`)
      .set(writeHeaders)
      .send({
        title: 'Tonight is cancelled',
        bodyText: 'The venue changed; see the notice.',
        whatsappTemplate: 'event_change',
        whatsappParameters: ['The Convention'],
        emailSubject: 'Venue changed',
        emailBodyText: 'The venue changed; see the notice.',
      });

    expect(response.status).toBe(201);
    expect(response.body.noticeId).toBeDefined();
    expect(response.body.instance.kind).toBe('change');

    const [notices] = await harness.db.query<{ count: number }>(
      'select count(*)::int as count from notification_change_notices',
    );
    expect(Number(notices!.count)).toBe(1);
    const [slots] = await harness.db.query<{ count: number }>(
      `select count(*)::int as count from notification_plan_slots
        where plan_id = (select id from notification_plans where event_id = $1)
          and revision = (select max(revision) from notification_plan_revisions
                           where plan_id = (select id from notification_plans where event_id = $1))`,
      [eventId],
    );
    expect(Number(slots!.count)).toBe(3);

    const after = await request(app)
      .get(`/v1/events/${eventId}/notification-plan/instances`)
      .set(readHeaders);
    expect(
      (after.body.instances as Array<{ kind: string }>).filter(
        (instance) => instance.kind !== 'change',
      ),
    ).toHaveLength(future);
  });
});
