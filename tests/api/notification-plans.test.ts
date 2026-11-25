import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';

/**
 * Authoring, `If-Match` and the slot rules
 * (member-registrations-event-notifications.md N-2, N-3; FR-3, FR-16).
 *
 * R2 authors and previews but does not publish: the publish, cancel, change and
 * deliveries paths do not exist, and every read says so with its reason.
 */
let harness: TestApp;
let app: TestApp['app'];
let eventId: string;

const SMS = '{{firstName}}, {{eventName}} starts {{eventDate}} {{startTime}} at {{venue}}.';
const USSD = '{{eventName}} is on {{eventDate}} at {{startTime}}.';

function body(overrides: Record<string, unknown> = {}) {
  return {
    slots: [
      { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
      { kind: 'last', anchor: 'occurrence_end', offsetMinutes: -1440 },
    ],
    templates: [
      { channel: 'sms', bodyText: SMS },
      { channel: 'ussd', bodyText: USSD },
    ],
    ...overrides,
  };
}

function putPlan(input: unknown, ifMatch?: string) {
  const call = request(app).put(`/v1/events/${eventId}/notification-plan`).set(writeHeaders);
  if (ifMatch) call.set('If-Match', ifMatch);
  return call.send(input as object);
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
});

afterAll(async () => {
  await harness.close();
});

describe('GET /v1/events/{eventId}/notification-plan', () => {
  it('reads an empty plan before anything is authored', async () => {
    const response = await request(app)
      .get(`/v1/events/${eventId}/notification-plan`)
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBe('"r0"');
    expect(response.body).toMatchObject({
      planId: null,
      eventId,
      revision: 1,
      status: 'draft',
      slots: [],
      templates: [],
      flier: null,
      revisions: [],
      publish: { enabled: false },
    });
    expect(response.body.publish.reason).toMatch(/R3/);
  });

  it('answers 404 for an event that does not exist', async () => {
    const response = await request(app)
      .get('/v1/events/00000000-0000-4000-8000-000000000000/notification-plan')
      .set(readHeaders);
    expect(response.status).toBe(404);
  });
});

describe('PUT /v1/events/{eventId}/notification-plan', () => {
  it('creates revision 1 from one PUT', async () => {
    const response = await putPlan(body());

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"r1"');
    expect(response.body.revision).toBe(1);
    expect(response.body.status).toBe('draft');
    expect(response.body.revisions).toEqual([
      { revision: 1, status: 'draft', publishedAt: null, cancelledAt: null },
    ]);
    expect(response.body.slots.map((slot: { kind: string }) => slot.kind)).toEqual([
      'announce',
      'last',
    ]);
    expect(response.body.slots.map((slot: { sortOrder: number }) => slot.sortOrder)).toEqual([
      0, 1,
    ]);
    expect(response.body.templates).toHaveLength(2);
  });

  it('reads back what was written, with the revision as the ETag', async () => {
    const response = await request(app)
      .get(`/v1/events/${eventId}/notification-plan`)
      .set(readHeaders);
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"r1"');
    expect(response.body.etag).toBe('"r1"');
    expect(response.body.templates).toContainEqual(
      expect.objectContaining({ channel: 'sms', bodyText: SMS }),
    );
  });

  it('answers 412 and writes nothing on a stale If-Match', async () => {
    const response = await putPlan(
      body({
        slots: [{ kind: 'reminder', anchor: 'event_start', offsetMinutes: -60 }],
        templates: [{ channel: 'sms', bodyText: 'stale write' }],
      }),
      '"r0"',
    );
    expect(response.status).toBe(412);
    expect(response.body.code).toBe('plan_revision_stale');

    const after = await request(app)
      .get(`/v1/events/${eventId}/notification-plan`)
      .set(readHeaders);
    expect(after.body.revision).toBe(1);
    expect(after.body.templates).toHaveLength(2);
  });

  it('edits a draft in place when If-Match names its revision', async () => {
    const response = await putPlan(
      body({ templates: [{ channel: 'sms', bodyText: '{{firstName}}, see you there.' }] }),
      '"r1"',
    );
    expect(response.status).toBe(200);
    expect(response.body.revision).toBe(1);
    expect(response.body.revisions).toHaveLength(1);
    expect(response.body.templates).toEqual([
      expect.objectContaining({ channel: 'sms', bodyText: '{{firstName}}, see you there.' }),
    ]);
  });

  it('refuses an offset outside one week, a fifth kind, and a thirteenth slot', async () => {
    const offset = await putPlan(
      body({
        slots: [{ kind: 'announce', anchor: 'publish', offsetMinutes: 10081 }],
      }),
      '"r1"',
    );
    expect(offset.status).toBe(422);

    const fifthKind = await putPlan(
      body({ slots: [{ kind: 'change', anchor: 'publish', offsetMinutes: 0 }] }),
      '"r1"',
    );
    expect(fifthKind.status).toBe(422);

    const slots = Array.from({ length: 13 }, () => ({
      kind: 'announce',
      anchor: 'publish',
      offsetMinutes: 0,
    }));
    const thirteen = await putPlan(body({ slots }), '"r1"');
    expect(thirteen.status).toBe(422);
  });

  it('refuses an anchor the kind does not allow', async () => {
    const response = await putPlan(
      body({ slots: [{ kind: 'starts', anchor: 'event_start', offsetMinutes: 0 }] }),
      '"r1"',
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('invalid_slot_anchor');
  });

  it('refuses two slots that resolve to the same instant', async () => {
    const response = await putPlan(
      body({
        slots: [
          { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
          { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
        ],
      }),
      '"r1"',
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('duplicate_slot_time');
  });

  it('answers 404 for an event that does not exist', async () => {
    const response = await request(app)
      .put('/v1/events/00000000-0000-4000-8000-000000000000/notification-plan')
      .set(writeHeaders)
      .send(body());
    expect(response.status).toBe(404);
  });
});

describe('template validation', () => {
  async function templatesAfter() {
    const response = await request(app)
      .get(`/v1/events/${eventId}/notification-plan`)
      .set(readHeaders);
    return response.body.templates;
  }

  it('refuses an unknown variable and stores nothing', async () => {
    const response = await putPlan(
      body({ templates: [{ channel: 'sms', bodyText: 'Hi {{surname}}' }] }),
      '"r1"',
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('unknown_variable');
    expect(await templatesAfter()).toHaveLength(1);
  });

  it('refuses a client HTML body', async () => {
    const response = await putPlan(
      body({
        templates: [
          { channel: 'email', subject: 'Hello', body: '<p>hello</p>', bodyText: 'hello' },
        ],
      }),
      '"r1"',
    );
    expect(response.status).toBe(422);
    expect(await templatesAfter()).toHaveLength(1);
  });

  it('refuses an email row without its subject, document or plain text', async () => {
    for (const template of [
      { channel: 'email', body: { type: 'doc', content: [] }, bodyText: 'text' },
      { channel: 'email', subject: 'Subject', bodyText: 'text' },
      { channel: 'email', subject: 'Subject', body: { type: 'doc', content: [] } },
    ]) {
      const response = await putPlan(body({ templates: [template] }), '"r1"');
      expect(response.status).toBe(422);
    }
    expect(await templatesAfter()).toHaveLength(1);
  });

  it('refuses a WhatsApp row without its approved template name', async () => {
    const response = await putPlan(
      body({ templates: [{ channel: 'whatsapp', parameterMap: { firstName: 1 } }] }),
      '"r1"',
    );
    expect(response.status).toBe(422);
    expect(await templatesAfter()).toHaveLength(1);
  });

  it('refuses a WhatsApp parameter map that names an unknown variable', async () => {
    const response = await putPlan(
      body({
        templates: [
          { channel: 'whatsapp', templateName: 'event_announce', parameterMap: { surname: 1 } },
        ],
      }),
      '"r1"',
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('unknown_variable');
  });
});

describe('a published revision is frozen', () => {
  it('writes revision + 1 and leaves the published revision its own slots and templates', async () => {
    // Publishing is R3's; the freeze is seeded directly so the rule is tested
    // against the state R3 will produce.
    await harness.db.query(
      `update notification_plan_revisions
          set status = 'published', published_at = now()
        where revision = 1
          and plan_id = (select id from notification_plans where event_id = $1)`,
      [eventId],
    );

    const response = await putPlan(
      body({
        slots: [{ kind: 'reminder', anchor: 'event_start', offsetMinutes: -180 }],
        templates: [{ channel: 'ussd', bodyText: '{{eventName}} tomorrow.' }],
      }),
      '"r1"',
    );

    expect(response.status).toBe(200);
    expect(response.body.revision).toBe(2);
    expect(response.body.status).toBe('draft');
    expect(response.body.revisions).toEqual([
      expect.objectContaining({ revision: 1, status: 'published' }),
      expect.objectContaining({ revision: 2, status: 'draft' }),
    ]);

    const [plan] = await harness.db.query<{ id: string }>(
      'select id from notification_plans where event_id = $1',
      [eventId],
    );
    const rows = await harness.db.query<{ revision: number; slot: string; template: string }>(
      `select r.revision,
              (select kind from notification_plan_slots s
                where s.plan_id = r.plan_id and s.revision = r.revision limit 1) as slot,
              (select coalesce(body_text, template_name) from notification_templates t
                where t.plan_id = r.plan_id and t.revision = r.revision limit 1) as template
         from notification_plan_revisions r
        where r.plan_id = $1
        order by r.revision`,
      [plan!.id],
    );
    // Revision 1 keeps the two-slot set it published; revision 2 has its own.
    const rev1Slots = await harness.db.query(
      'select count(*)::int as count from notification_plan_slots where plan_id = $1 and revision = 1',
      [plan!.id],
    );
    const rev2Slots = await harness.db.query(
      'select count(*)::int as count from notification_plan_slots where plan_id = $1 and revision = 2',
      [plan!.id],
    );
    expect(Number((rev1Slots[0] as { count: number }).count)).toBe(2);
    expect(Number((rev2Slots[0] as { count: number }).count)).toBe(1);
    expect(rows.map((row) => row.revision)).toEqual([1, 2]);
    expect(rows[1]!.slot).toBe('reminder');
    expect(rows[1]!.template).toBe('{{eventName}} tomorrow.');
    expect(rows[0]!.slot).toBe('announce');
  });
});

describe('the send path is absent, not stubbed', () => {
  it('has no publish, cancel, change or deliveries route', async () => {
    for (const path of ['publish', 'cancel', 'change', 'deliveries']) {
      const response = await request(app)
        .post(`/v1/events/${eventId}/notification-plan/${path}`)
        .set(writeHeaders)
        .send({});
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('route_not_found');
    }
  });
});

describe('the contract', () => {
  it('serves the regenerated openapi.json with the new paths', async () => {
    const response = await request(app).get('/openapi.json');
    expect(response.status).toBe(200);
    const paths = response.body.paths as Record<string, unknown>;
    for (const path of [
      '/v1/events/{eventId}/notification-plan',
      '/v1/events/{eventId}/notification-plan/preview',
      '/v1/events/{eventId}/flier',
      '/v1/notification-defaults',
      '/fliers/{token}',
    ]) {
      expect(paths[path]).toBeDefined();
    }
    // The public image is the one path with no bearer requirement.
    expect((paths['/fliers/{token}'] as { get: { security: unknown[] } }).get.security).toEqual([]);
    // The send path is not in the contract either.
    expect(paths['/v1/events/{eventId}/notification-plan/publish']).toBeUndefined();
  });
});
