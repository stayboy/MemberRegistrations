import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  capturingSenders,
  createTestApp,
  readHeaders,
  writeHeaders,
  type TestApp,
} from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { testPhone } from '../helpers/member-fixtures.js';

/**
 * The preview renders the four bodies, the per-channel counts and the SMS
 * segmentation, writes nothing and calls no provider
 * (member-registrations-event-notifications.md N-5, N-7, FR-13, FR-16).
 *
 * The exclusion sample is R3's and is deliberately absent: it needs the
 * preference tables (round grill 2).
 */
let harness: TestApp;
let app: TestApp['app'];
let eventId: string;
let secondEventId: string;
let flierUrl: string;
const sent = capturingSenders();

const LONG_USSD =
  '{{firstName}}, {{eventName}} is on {{eventDate}} at {{startTime}}, {{venue}}. ' +
  'Come early, the doors open an hour before, and bring a friend from your street.';

async function createMember(
  memberNo: string,
  firstName: string,
  contacts: Array<{ kind: 'phone' | 'email' | 'whatsapp'; value: string }>,
) {
  const response = await request(app).post('/v1/members').set(writeHeaders).send({
    memberNo,
    firstName,
    lastName: 'Preview',
    joinedOn: '2020-01-01',
    contacts,
  });
  expect(response.status).toBe(201);
}

/** A one-pixel PNG's signature and enough bytes to be a body. */
function tinyPng(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 1),
  ]);
}

function planBody() {
  return {
    slots: [
      { kind: 'announce', anchor: 'publish', offsetMinutes: 0 },
      { kind: 'last', anchor: 'occurrence_end', offsetMinutes: -1440 },
    ],
    templates: [
      {
        channel: 'email',
        subject: '{{eventName}} starts {{eventDate}}',
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: '{{firstName}}, ' },
                { type: 'text', marks: [{ type: 'bold' }], text: '{{eventName}}' },
                { type: 'text', text: ' starts on {{eventDate}} at {{startTime}}.' },
              ],
            },
          ],
        },
        bodyText: '{{firstName}}, {{eventName}} starts on {{eventDate}}. Poster: {{flierUrl}}',
      },
      {
        channel: 'whatsapp',
        templateName: 'event_announce',
        parameterMap: { firstName: 1, eventName: 2 },
      },
      {
        channel: 'sms',
        bodyText: '{{firstName}}, {{eventName}} starts {{eventDate}} at {{startTime}}.',
      },
      { channel: 'ussd', bodyText: LONG_USSD },
    ],
  };
}

async function rowCounts(): Promise<Record<string, number>> {
  const [row] = await harness.db.query<Record<string, string>>(
    `select
       (select count(*) from notification_plans) as plans,
       (select count(*) from notification_plan_revisions) as revisions,
       (select count(*) from notification_plan_slots) as slots,
       (select count(*) from notification_templates) as templates,
       (select count(*) from event_fliers) as fliers`,
  );
  return Object.fromEntries(Object.entries(row!).map(([key, value]) => [key, Number(value)]));
}

beforeAll(async () => {
  harness = await createTestApp({ senders: sent.senders });
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

  const second = await seedEvent(harness.db, {
    name: 'No Venue Service',
    startDate: '2026-12-13',
    endDate: '2026-12-13',
    startTime: '07:00',
    sessions: [{ date: '2026-12-13' }],
  });
  secondEventId = second.eventId;

  await createMember('M-PV-1', 'Ada', [
    { kind: 'phone', value: testPhone() },
    { kind: 'email', value: 'ada.preview@example.org' },
  ]);
  await createMember('M-PV-2', 'Boateng', [{ kind: 'phone', value: testPhone() }]);
  await createMember('M-PV-3', 'Chidi', [
    { kind: 'phone', value: testPhone() },
    { kind: 'whatsapp', value: testPhone() },
  ]);

  const saved = await request(app)
    .put(`/v1/events/${eventId}/notification-plan`)
    .set(writeHeaders)
    .send(planBody());
  expect(saved.status).toBe(200);

  const flier = await request(app)
    .put(`/v1/events/${eventId}/flier`)
    .set(writeHeaders)
    .set('Content-Type', 'image/png')
    .send(tinyPng());
  expect(flier.status).toBe(200);
  flierUrl = flier.body.url;
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/events/{eventId}/notification-plan/preview', () => {
  it('renders the four bodies, the counts and the SMS segments', async () => {
    const response = await request(app)
      .post(`/v1/events/${eventId}/notification-plan/preview`)
      .set(readHeaders);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { renders, counts, sample, at } = response.body;

    expect(at).toBe('2026-12-06');
    expect(sample).toEqual({ memberNo: 'M-PV-1', displayName: 'Ada Preview' });
    expect(counts).toEqual({ audience: 3, email: 1, whatsapp: 1, sms: 3, ussd: 3 });

    // Email: HTML from the structured document, the stored text alternative and
    // the flier as an inline attachment.
    expect(renders.email.subject).toBe('The Convention starts 2026-12-06');
    expect(renders.email.html).toContain('<strong>The Convention</strong>');
    expect(renders.email.html).toContain('Ada, ');
    expect(renders.email.text).toContain(`Poster: ${flierUrl}`);
    expect(renders.email.attachments).toEqual([
      expect.objectContaining({ contentType: 'image/png', url: flierUrl, inline: true }),
    ]);

    // WhatsApp: the approved template and its ordered parameters, with the
    // flier as header media and no URL in the body.
    expect(renders.whatsapp.templateName).toBe('event_announce');
    expect(renders.whatsapp.parameters).toEqual([
      { name: 'firstName', slot: 1, value: 'Ada' },
      { name: 'eventName', slot: 2, value: 'The Convention' },
    ]);
    expect(renders.whatsapp.headerMediaUrl).toBe(flierUrl);
    expect(renders.whatsapp.body).not.toContain('/fliers/');

    // SMS: GSM-7, one segment for this length.
    expect(renders.sms.encoding).toBe('gsm7');
    expect(renders.sms.segments).toBe(1);
    expect(renders.sms.body).toBe('Ada, The Convention starts 2026-12-06 at 09:00.');

    // USSD: paginated under the adapter budget, never truncated.
    expect(renders.ussd.budget).toBe(120);
    expect(renders.ussd.screens.length).toBeGreaterThan(1);
    for (const screen of renders.ussd.screens) expect(screen.length).toBeLessThanOrEqual(120);
    expect(renders.ussd.screens[0]).toMatch(/0 More$/);
    expect(renders.ussd.screens.join(' ')).not.toContain('null');
  });

  it('writes nothing and calls no provider', async () => {
    const before = await rowCounts();
    await request(app).post(`/v1/events/${eventId}/notification-plan/preview`).set(readHeaders);
    expect(await rowCounts()).toEqual(before);
    expect(sent.messages).toHaveLength(0);
    expect(sent.emails).toHaveLength(0);
  });

  it('renders a body that has not been saved, still writing nothing', async () => {
    const before = await rowCounts();
    const response = await request(app)
      .post(`/v1/events/${secondEventId}/notification-plan/preview`)
      .set(readHeaders)
      .send({
        slots: [{ kind: 'announce', anchor: 'publish', offsetMinutes: 0 }],
        templates: [
          { channel: 'sms', bodyText: 'Venue:[{{venue}}] Name:[{{eventName}}]' },
          { channel: 'ussd', bodyText: '{{eventName}}' },
        ],
      });

    expect(response.status).toBe(200);
    // A null field renders empty rather than "null".
    expect(response.body.renders.sms.body).toBe('Venue:[] Name:[No Venue Service]');
    expect(await rowCounts()).toEqual(before);
  });

  it('switches to UCS-2 and halves the segment budget for one emoji', async () => {
    const response = await request(app)
      .post(`/v1/events/${secondEventId}/notification-plan/preview`)
      .set(readHeaders)
      .send({
        slots: [{ kind: 'announce', anchor: 'publish', offsetMinutes: 0 }],
        templates: [
          {
            channel: 'sms',
            bodyText: '{{eventName}} ' + 'x'.repeat(60) + ' 🎉 ' + 'y'.repeat(10),
          },
          { channel: 'ussd', bodyText: '{{eventName}}' },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.renders.sms.encoding).toBe('ucs2');
    expect(response.body.renders.sms.length).toBeGreaterThan(70);
    expect(response.body.renders.sms.segments).toBe(2);
  });

  it('answers 422 when there is neither a stored nor a supplied body', async () => {
    const third = await seedEvent(harness.db, {
      name: 'Empty Plan',
      startDate: '2026-12-20',
      endDate: '2026-12-20',
      sessions: [{ date: '2026-12-20' }],
    });
    const response = await request(app)
      .post(`/v1/events/${third.eventId}/notification-plan/preview`)
      .set(readHeaders);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('template_required');
  });

  it('refuses an unknown variable before rendering', async () => {
    const response = await request(app)
      .post(`/v1/events/${secondEventId}/notification-plan/preview`)
      .set(readHeaders)
      .send({
        slots: [{ kind: 'announce', anchor: 'publish', offsetMinutes: 0 }],
        templates: [
          { channel: 'sms', bodyText: '{{surname}}' },
          { channel: 'ussd', bodyText: 'x' },
        ],
      });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('unknown_variable');
  });
});
