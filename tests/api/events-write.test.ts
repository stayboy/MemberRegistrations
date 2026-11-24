import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];
let everyoneId: string;
let presbytersId: string;
let choirId: string;

const YEAR = new Date().getUTCFullYear();

function createEvent(body: Record<string, unknown>) {
  return request(app).post('/v1/events').set(writeHeaders).send(body);
}

function patchEvent(id: string, body: Record<string, unknown>, etag?: string) {
  return request(app)
    .patch(`/v1/events/${id}`)
    .set(etag ? { ...writeHeaders, 'If-Match': etag } : writeHeaders)
    .send(body);
}

function parentRead(id: string, from: string, to: string) {
  return request(app).get(`/v1/events/${id}`).query({ view: 'parent', from, to }).set(readHeaders);
}

function standaloneBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Harvest Thanksgiving',
    timezone: 'UTC',
    description: 'Three evenings of thanksgiving',
    venueType: 'hybrid',
    venueName: 'Main Auditorium + Zoom',
    startTime: '17:00',
    endTime: '19:30',
    occurrences: [{ date: '2026-11-27' }, { date: '2026-11-28', startTime: '18:00' }],
    ...overrides,
  };
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const [everyone] = await harness.db.query<{ id: string }>(
    `select id from audiences where system_key = 'everyone'`,
  );
  everyoneId = everyone!.id;
  const [presbyters] = await harness.db.query<{ id: string }>(
    `select id from audiences where system_key = 'presbyters'`,
  );
  presbytersId = presbyters!.id;
  const [choir] = await harness.db.query<{ id: string }>(
    `select id from audiences where system_key = 'ministry:CHOIR'`,
  );
  choirId = choir!.id;
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/events', () => {
  it('creates a draft standalone parent, mints eventNo and persists its occurrences', async () => {
    const response = await createEvent(standaloneBody());

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe(`/v1/events/${response.body.id}`);
    expect(response.headers.etag).toMatch(/^"e[0-9a-f]+"$/);

    expect(response.body).toMatchObject({
      eventNo: expect.stringMatching(new RegExp(`^EVT-${YEAR}-\\d{3}$`)),
      name: 'Harvest Thanksgiving',
      audienceId: everyoneId,
      audience: { id: everyoneId, name: 'Everyone', system: true },
      ministry: null,
      presbyterOnly: false,
      timezone: 'UTC',
      description: 'Three evenings of thanksgiving',
      venueType: 'hybrid',
      venueName: 'Main Auditorium + Zoom',
      startDate: '2026-11-27',
      endDate: '2026-11-28',
      startTime: '17:00',
      endTime: '19:30',
      tracksMembers: true,
      status: 'draft',
      recurrence: null,
    });
    expect(response.body.occurrences).toHaveLength(2);
    expect(response.body.occurrences[0]).toMatchObject({
      date: '2026-11-27',
      startTime: '17:00',
      endTime: '19:30',
      status: 'scheduled',
      note: null,
      present: 0,
      importedRows: 0,
      source: 'none',
    });
    expect(response.body.occurrences[1]).toMatchObject({
      date: '2026-11-28',
      startTime: '18:00',
      endTime: '19:30',
      status: 'scheduled',
    });

    const [row] = await harness.db.query<{
      event_no: string;
      status: string;
      audience_id: string;
      ministry_id: string | null;
      presbyter_only: boolean;
      start_time: string | null;
    }>(
      `select event_no, status, audience_id, ministry_id, presbyter_only, start_time
         from events where id = $1`,
      [response.body.id],
    );
    expect(row).toMatchObject({
      event_no: response.body.eventNo,
      status: 'draft',
      audience_id: everyoneId,
      ministry_id: null,
      presbyter_only: false,
      start_time: '17:00',
    });

    const occurrences = await harness.db.query<{
      date: unknown;
      status: string;
      start_time: string;
    }>(
      `select date, status, start_time from event_occurrences
        where event_id = $1 order by date`,
      [response.body.id],
    );
    expect(
      occurrences.map((item) =>
        item.date instanceof Date ? item.date.toISOString().slice(0, 10) : String(item.date),
      ),
    ).toEqual(['2026-11-27', '2026-11-28']);
    expect(occurrences.every((item) => item.status === 'scheduled')).toBe(true);
  });

  it('creates a recurring parent and generates the first window atomically', async () => {
    const response = await createEvent({
      name: 'Epiphany Evenings',
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '19:00',
      recurrence: {
        schedules: [
          {
            effectiveFrom: '2027-01-03',
            rrule: 'FREQ=WEEKLY;BYDAY=SU',
            endsOn: '2027-01-31',
          },
        ],
        exceptions: [
          { date: '2027-01-17', kind: 'cancelled', note: 'Guest speaker away' },
          { date: '2027-01-06', kind: 'extra', note: 'Epiphany' },
        ],
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.eventNo).toMatch(/^EVT-2027-\d{3}$/);
    expect(response.body.status).toBe('draft');
    expect(response.body.recurrence).toEqual({
      schedules: [
        { effectiveFrom: '2027-01-03', rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: '2027-01-31' },
      ],
      exceptions: [
        { date: '2027-01-06', kind: 'extra', note: 'Epiphany' },
        { date: '2027-01-17', kind: 'cancelled', note: 'Guest speaker away' },
      ],
    });
    expect(
      response.body.occurrences.map((occurrence: { date: string }) => occurrence.date),
    ).toEqual(['2027-01-03', '2027-01-06', '2027-01-10', '2027-01-24', '2027-01-31']);

    const schedules = await harness.db.query<{ effective_from: unknown; rrule: string }>(
      `select effective_from, rrule from event_recurrence_versions where event_id = $1`,
      [response.body.id],
    );
    expect(schedules).toHaveLength(1);
    const effectiveFrom = schedules[0]!.effective_from;
    expect(
      effectiveFrom instanceof Date
        ? effectiveFrom.toISOString().slice(0, 10)
        : String(effectiveFrom),
    ).toBe('2027-01-03');

    const [count] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from event_occurrences where event_id = $1`,
      [response.body.id],
    );
    expect(Number(count!.count)).toBe(5);
  });

  it('refuses both occurrences and a recurrence', async () => {
    const response = await createEvent({
      ...standaloneBody({ name: 'Both Shapes Refusal' }),
      recurrence: {
        schedules: [{ effectiveFrom: '2026-12-06', rrule: 'FREQ=WEEKLY;BYDAY=SU' }],
      },
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('recurrence');

    const [row] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from events where name = 'Both Shapes Refusal'`,
    );
    expect(Number(row!.count)).toBe(0);
  });

  it('refuses an event with neither occurrences nor a recurrence', async () => {
    const response = await createEvent(standaloneBody({ occurrences: undefined }));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('occurrences');
  });

  it('refuses the retired ministry and presbyterOnly fields by name', async () => {
    for (const field of ['ministry', 'presbyterOnly']) {
      const response = await createEvent(
        standaloneBody({ [field]: field === 'ministry' ? 'CHOIR' : true }),
      );
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('validation_error');
      expect(response.body.detail).toContain(field);
    }
  });

  it('refuses eventNo by name and writes nothing', async () => {
    const [before] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from events',
    );

    const response = await createEvent(standaloneBody({ eventNo: 'CLIENT-INVENTED' }));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('eventNo');

    const [after] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from events',
    );
    expect(Number(after!.count)).toBe(Number(before!.count));
  });

  it('still accepts audienceId alone as a one-element audience set', async () => {
    const response = await createEvent(standaloneBody({ audienceId: choirId }));

    expect(response.status).toBe(201);
    expect(response.body.audienceId).toBe(choirId);
  });

  it('refuses an audienceId that disagrees with the first audienceIds element, naming both', async () => {
    const response = await createEvent(
      standaloneBody({ audienceId: choirId, audienceIds: [presbytersId] }),
    );

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('audienceId');
    expect(response.body.detail).toContain('audienceIds');
  });

  it('accepts audienceIds whose first element matches the audienceId alias', async () => {
    const response = await createEvent(
      standaloneBody({ audienceId: everyoneId, audienceIds: [everyoneId] }),
    );

    expect(response.status).toBe(201);
    expect(response.body.audienceId).toBe(everyoneId);
  });

  it('refuses a duplicate audienceIds entry', async () => {
    const response = await createEvent(standaloneBody({ audienceIds: [everyoneId, everyoneId] }));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('audienceIds');
  });

  it('refuses an empty audienceIds set', async () => {
    const response = await createEvent(standaloneBody({ audienceIds: [] }));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('audienceIds');
  });

  it('derives the legacy projection where the audience is expressible as the pair', async () => {
    const ministry = await createEvent(
      standaloneBody({ name: 'Choir Rehearsal', audienceId: choirId }),
    );
    expect(ministry.status).toBe(201);
    expect(ministry.body.ministry).toMatchObject({ code: 'CHOIR' });
    expect(ministry.body.presbyterOnly).toBe(false);

    const presbyters = await createEvent(
      standaloneBody({
        name: 'Elders Meeting',
        audienceId: presbytersId,
      }),
    );
    expect(presbyters.status).toBe(201);
    expect(presbyters.body.ministry).toBeNull();
    expect(presbyters.body.presbyterOnly).toBe(true);

    for (const [id, code, presbyter] of [
      [ministry.body.id, 'CHOIR', false],
      [presbyters.body.id, null, true],
    ] as const) {
      const [row] = await harness.db.query<{
        ministry_code: string | null;
        presbyter_only: boolean;
      }>(
        `select m.code as ministry_code, e.presbyter_only
           from events e left join ministries m on m.id = e.ministry_id
          where e.id = $1`,
        [id],
      );
      expect(row).toMatchObject({ ministry_code: code, presbyter_only: presbyter });
    }
  });

  it('leaves the legacy projection empty for an audience the pair cannot express', async () => {
    const audience = await request(app)
      .post('/v1/audiences')
      .set(writeHeaders)
      .send({
        name: 'Young Adults ' + YEAR,
        rule: {
          operator: 'allOf',
          clauses: [{ attribute: 'ageBand', minYears: 18, maxYears: 30 }],
        },
      });
    expect(audience.status).toBe(201);

    const created = await createEvent(
      standaloneBody({
        name: 'Young Adults Night',
        audienceId: audience.body.id,
      }),
    );
    expect(created.status).toBe(201);
    expect(created.body.ministry).toBeNull();
    expect(created.body.presbyterOnly).toBe(false);

    const [row] = await harness.db.query<{ ministry_id: string | null; presbyter_only: boolean }>(
      `select ministry_id, presbyter_only from events where id = $1`,
      [created.body.id],
    );
    expect(row).toMatchObject({ ministry_id: null, presbyter_only: false });
  });
});

describe('PATCH /v1/events/{eventId}', () => {
  it('moves draft to active and refuses the backwards transition', async () => {
    const created = await createEvent(standaloneBody({ name: 'Patch Status' }));
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const draftEtag = created.headers.etag as string;

    const activated = await patchEvent(
      id,
      { name: 'Harvest Thanksgiving 2026', status: 'active' },
      draftEtag,
    );
    expect(activated.status).toBe(200);
    expect(activated.body).toMatchObject({
      id,
      eventNo: created.body.eventNo,
      name: 'Harvest Thanksgiving 2026',
      status: 'active',
    });
    expect(activated.headers.etag).toBeTruthy();
    expect(activated.headers.etag).not.toBe(draftEtag);

    const backwards = await patchEvent(id, { status: 'draft' }, activated.headers.etag as string);
    expect(backwards.status).toBe(409);

    const stale = await patchEvent(id, { name: 'Stale Name' }, draftEtag);
    expect(stale.status).toBe(409);

    const [row] = await harness.db.query<{ name: string; status: string }>(
      'select name, status from events where id = $1',
      [id],
    );
    expect(row).toMatchObject({ name: 'Harvest Thanksgiving 2026', status: 'active' });
  });

  it('refuses the retired ministry and presbyterOnly fields by name', async () => {
    for (const field of ['ministry', 'presbyterOnly']) {
      const response = await patchEvent('00000000-0000-4000-8000-000000000000', {
        [field]: field === 'ministry' ? 'CHOIR' : true,
      });
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('validation_error');
      expect(response.body.detail).toContain(field);
    }
  });

  it('refuses eventNo on PATCH by name', async () => {
    const created = await createEvent(standaloneBody({ name: 'Patch Number Refusal' }));

    const response = await patchEvent(
      created.body.id,
      { eventNo: 'EVT-2026-999' },
      created.headers.etag as string,
    );

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('eventNo');

    const read = await parentRead(created.body.id, '2026-11-01', '2026-12-31');
    expect(read.body.eventNo).toBe(created.body.eventNo);
  });

  it('reprojects the legacy pair when the audience changes', async () => {
    const created = await createEvent(standaloneBody({ name: 'Patch Audience' }));

    const presbyters = await patchEvent(
      created.body.id,
      { audienceId: presbytersId },
      created.headers.etag as string,
    );
    expect(presbyters.status).toBe(200);
    expect(presbyters.body.ministry).toBeNull();
    expect(presbyters.body.presbyterOnly).toBe(true);

    const choir = await patchEvent(
      created.body.id,
      { audienceId: choirId },
      presbyters.headers.etag as string,
    );
    expect(choir.status).toBe(200);
    expect(choir.body.ministry).toMatchObject({ code: 'CHOIR' });
    expect(choir.body.presbyterOnly).toBe(false);

    const [row] = await harness.db.query<{ ministry_code: string | null; presbyter_only: boolean }>(
      `select m.code as ministry_code, e.presbyter_only
         from events e left join ministries m on m.id = e.ministry_id
        where e.id = $1`,
      [created.body.id],
    );
    expect(row).toMatchObject({ ministry_code: 'CHOIR', presbyter_only: false });
  });

  it('refuses archiving through PATCH and archives through the archive route', async () => {
    const created = await createEvent(standaloneBody({ name: 'Patch Archive' }));
    const id = created.body.id as string;

    const draftArchive = await patchEvent(
      id,
      { status: 'archived' },
      created.headers.etag as string,
    );
    expect(draftArchive.status).toBe(409);
    expect(draftArchive.body.code).toBe('status');

    const active = await patchEvent(id, { status: 'active' }, created.headers.etag as string);
    expect(active.status).toBe(200);

    const activeArchive = await patchEvent(
      id,
      { status: 'archived' },
      active.headers.etag as string,
    );
    expect(activeArchive.status).toBe(409);
    expect(activeArchive.body.code).toBe('status');

    const [row] = await harness.db.query<{ status: string }>(
      'select status from events where id = $1',
      [id],
    );
    expect(row!.status).toBe('active');

    const archived = await request(app).post(`/v1/events/${id}/archive`).set(writeHeaders);
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');

    const again = await patchEvent(id, { name: 'After archive' });
    expect(again.status).toBe(409);

    const read = await parentRead(id, '2026-11-01', '2026-12-31');
    expect(read.status).toBe(200);
    expect(read.body.status).toBe('archived');
    expect(read.body.occurrences).toHaveLength(2);
  });
});

describe('POST /v1/events/{eventId}/archive', () => {
  it('archives an active parent once and keeps its history readable', async () => {
    const created = await createEvent(standaloneBody({ name: 'Archive One' }));
    const active = await patchEvent(
      created.body.id,
      { status: 'active' },
      created.headers.etag as string,
    );
    expect(active.status).toBe(200);

    const archived = await request(app)
      .post(`/v1/events/${created.body.id}/archive`)
      .set(writeHeaders);
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');

    const again = await request(app)
      .post(`/v1/events/${created.body.id}/archive`)
      .set(writeHeaders);
    expect(again.status).toBe(409);

    const read = await parentRead(created.body.id, '2026-11-01', '2026-12-31');
    expect(read.status).toBe(200);
    expect(read.body.occurrences.map((occurrence: { date: string }) => occurrence.date)).toEqual([
      '2026-11-27',
      '2026-11-28',
    ]);
  });

  it('returns 404 for an unknown event', async () => {
    const response = await request(app)
      .post('/v1/events/00000000-0000-4000-8000-000000000000/archive')
      .set(writeHeaders);
    expect(response.status).toBe(404);
  });
});

describe('POST /v1/events/{eventId}/occurrences/{date}/cancel', () => {
  it('refuses a cancel on a draft parent without touching the occurrence', async () => {
    const created = await createEvent(standaloneBody({ name: 'Cancel Draft' }));
    expect(created.body.status).toBe('draft');

    const refused = await request(app)
      .post(`/v1/events/${created.body.id}/occurrences/2026-11-27/cancel`)
      .set(writeHeaders)
      .send({ note: 'Should not apply' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('event_draft');

    const [row] = await harness.db.query<{ status: string; note: string | null }>(
      `select status, note from event_occurrences where event_id = $1 and date = '2026-11-27'`,
      [created.body.id],
    );
    expect(row).toEqual({ status: 'scheduled', note: null });
  });

  it('cancels an occurrence with its reason and refuses a repeat or an unknown date', async () => {
    const created = await createEvent(standaloneBody({ name: 'Cancel One' }));
    const active = await patchEvent(
      created.body.id,
      { status: 'active' },
      created.headers.etag as string,
    );
    expect(active.status).toBe(200);

    const cancelled = await request(app)
      .post(`/v1/events/${created.body.id}/occurrences/2026-11-27/cancel`)
      .set(writeHeaders)
      .send({ note: 'Public holiday - moved to 2 December' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      date: '2026-11-27',
      status: 'cancelled',
      note: 'Public holiday - moved to 2 December',
    });

    const [row] = await harness.db.query<{ status: string; note: string }>(
      `select status, note from event_occurrences where event_id = $1 and date = '2026-11-27'`,
      [created.body.id],
    );
    expect(row).toMatchObject({
      status: 'cancelled',
      note: 'Public holiday - moved to 2 December',
    });

    const repeat = await request(app)
      .post(`/v1/events/${created.body.id}/occurrences/2026-11-27/cancel`)
      .set(writeHeaders)
      .send({ note: 'Again' });
    expect(repeat.status).toBe(409);
    expect(repeat.body.code).toBe('conflict');

    const unknown = await request(app)
      .post(`/v1/events/${created.body.id}/occurrences/2026-12-24/cancel`)
      .set(writeHeaders)
      .send({ note: 'Not a date' });
    expect(unknown.status).toBe(404);
  });

  it('refuses an empty cancellation reason with reason_required', async () => {
    const created = await createEvent(standaloneBody({ name: 'Cancel Empty' }));
    const response = await request(app)
      .post(`/v1/events/${created.body.id}/occurrences/2026-11-27/cancel`)
      .set(writeHeaders)
      .send({ note: '   ' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('reason_required');
    expect(response.body.detail).toContain('note');
  });
});

describe('recurrence writes', () => {
  let eventId: string;

  beforeAll(async () => {
    const created = await createEvent({
      name: 'Recurrence Write Event',
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '19:00',
      recurrence: {
        schedules: [{ effectiveFrom: '2027-01-03', rrule: 'FREQ=WEEKLY;BYDAY=SU' }],
      },
    });
    expect(created.status).toBe(201);
    eventId = created.body.id as string;
  });

  it('refuses a schedule version and an exception on a manually dated parent', async () => {
    const created = await createEvent(standaloneBody({ name: 'Recurrence Standalone' }));
    expect(created.status).toBe(201);
    expect(created.body.recurrence).toBeNull();

    const version = await request(app)
      .post(`/v1/events/${created.body.id}/recurrence/versions`)
      .set(writeHeaders)
      .send({ effectiveFrom: '2027-02-07', rrule: 'FREQ=WEEKLY;BYDAY=SU' });
    expect(version.status).toBe(409);
    expect(version.body.code).toBe('recurrence');

    const exception = await request(app)
      .post(`/v1/events/${created.body.id}/recurrence/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-11-27', kind: 'cancelled', note: 'Nope' });
    expect(exception.status).toBe(409);
    expect(exception.body.code).toBe('recurrence');

    const [row] = await harness.db.query<{ count: number | string }>(
      `select count(*)::int as count from event_recurrence_versions where event_id = $1`,
      [created.body.id],
    );
    expect(Number(row!.count)).toBe(0);
  });

  it('appends a schedule version without rewriting the first', async () => {
    const appended = await request(app)
      .post(`/v1/events/${eventId}/recurrence/versions`)
      .set(writeHeaders)
      .send({
        effectiveFrom: '2027-02-07',
        rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU',
        endsOn: '2027-12-26',
      });
    expect(appended.status).toBe(201);
    expect(appended.body.schedules).toHaveLength(2);
    expect(appended.body.schedules[0]).toMatchObject({ effectiveFrom: '2027-01-03' });
    expect(appended.body.schedules[1]).toMatchObject({
      effectiveFrom: '2027-02-07',
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU',
      endsOn: '2027-12-26',
    });

    const duplicate = await request(app)
      .post(`/v1/events/${eventId}/recurrence/versions`)
      .set(writeHeaders)
      .send({ effectiveFrom: '2027-02-07', rrule: 'FREQ=WEEKLY;BYDAY=SU' });
    expect(duplicate.status).toBe(409);
  });

  it('upserts and removes an exception and returns the recomputed recurrence', async () => {
    const cancelled = await request(app)
      .post(`/v1/events/${eventId}/recurrence/exceptions`)
      .set(writeHeaders)
      .send({ date: '2027-01-17', kind: 'cancelled', note: 'Guest speaker away' });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.exceptions).toContainEqual({
      date: '2027-01-17',
      kind: 'cancelled',
      note: 'Guest speaker away',
    });

    const replaced = await request(app)
      .post(`/v1/events/${eventId}/recurrence/exceptions`)
      .set(writeHeaders)
      .send({ date: '2027-01-17', kind: 'extra', note: 'Now an extra' });
    expect(replaced.status).toBe(201);
    expect(replaced.body.exceptions).toContainEqual({
      date: '2027-01-17',
      kind: 'extra',
      note: 'Now an extra',
    });
    expect(
      replaced.body.exceptions.filter(
        (exception: { date: string }) => exception.date === '2027-01-17',
      ),
    ).toHaveLength(1);

    const removed = await request(app)
      .delete(`/v1/events/${eventId}/recurrence/exceptions/2027-01-17`)
      .set(writeHeaders);
    expect(removed.status).toBe(200);
    expect(
      removed.body.exceptions.filter(
        (exception: { date: string }) => exception.date === '2027-01-17',
      ),
    ).toHaveLength(0);

    const unknown = await request(app)
      .delete(`/v1/events/${eventId}/recurrence/exceptions/2027-01-17`)
      .set(writeHeaders);
    expect(unknown.status).toBe(404);
  });

  it('refuses a cancelled exception without a note', async () => {
    const response = await request(app)
      .post(`/v1/events/${eventId}/recurrence/exceptions`)
      .set(writeHeaders)
      .send({ date: '2027-01-24', kind: 'cancelled' });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('note');
  });
});

describe('the served OpenAPI contract', () => {
  it('advertises the event entries this round adds', async () => {
    const response = await request(app).get('/openapi.json');
    expect(response.status).toBe(200);

    const paths = response.body.paths as Record<string, unknown>;
    for (const path of ['/v1/events/periods', '/v1/events/preview']) {
      expect(paths[path]).toBeDefined();
    }

    const audiences = paths['/v1/audiences'] as {
      get: { parameters: Array<{ name: string }> };
    };
    expect(audiences.get.parameters.map((parameter) => parameter.name)).toContain('countAt');

    const schemas = response.body.components.schemas as Record<
      string,
      { properties?: Record<string, unknown>; required?: string[] }
    >;
    expect(schemas.CreateEvent!.properties!.audienceIds).toBeDefined();
    expect(schemas.CreateEvent!.properties!.eventNo).toBeDefined();
    expect(schemas.UpdateEvent!.properties!.audienceIds).toBeDefined();
    expect(schemas.EventParent!.properties!.audiences).toBeDefined();
    expect(schemas.EventParent!.required).toContain('audiences');
    expect(schemas.EventParent!.required).toContain('audienceIds');
    expect(schemas.EventPreview).toBeDefined();
    expect(schemas.EventPeriodList).toBeDefined();
  });
});
