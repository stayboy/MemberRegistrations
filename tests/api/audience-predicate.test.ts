import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClockingRepository } from '../../src/repos/clocking.js';
import type { AudienceRule } from '../../src/schemas/audiences.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { reachableContacts } from '../helpers/member-fixtures.js';

/**
 * The retired `ministry_id`/`presbyter_only` pair, seen through the audience
 * (member-registrations-event-audience.md A-6 and A-7): the parent DTO derives
 * it from the rule, the `?ministry=` filter resolves through it, the ETag
 * ignores the columns, and clock-in authority is not the audience.
 */

let harness: TestApp;
let today: string;
let sequence = 0;

const EVERYONE: AudienceRule = {
  operator: 'allOf',
  clauses: [{ attribute: 'membershipStatus', value: 'active' }],
};
const CHOIR: AudienceRule = {
  operator: 'allOf',
  clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
};
const PRESBYTERS: AudienceRule = {
  operator: 'allOf',
  clauses: [{ attribute: 'presbyter', value: true }],
};
const CHOIR_PRESBYTERS: AudienceRule = {
  operator: 'allOf',
  clauses: [
    { attribute: 'ministry', ministryCode: 'CHOIR' },
    { attribute: 'presbyter', value: true },
  ],
};

/** The four legacy shapes: no ministry/no flag, ministry, flag, both. */
const LEGACY_SHAPES: Array<{
  label: string;
  rule: AudienceRule;
  expected: { ministryCode: string | null; presbyterOnly: boolean };
}> = [
  { label: 'general', rule: EVERYONE, expected: { ministryCode: null, presbyterOnly: false } },
  { label: 'ministry', rule: CHOIR, expected: { ministryCode: 'CHOIR', presbyterOnly: false } },
  { label: 'presbyters', rule: PRESBYTERS, expected: { ministryCode: null, presbyterOnly: true } },
  {
    label: 'ministry and presbyters',
    rule: CHOIR_PRESBYTERS,
    expected: { ministryCode: 'CHOIR', presbyterOnly: true },
  },
];

async function createAudience(name: string, rule: AudienceRule): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/audiences')
    .set(writeHeaders)
    .send({ name, rule });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function createEvent(
  name: string,
  audienceId: string,
  date: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  sequence += 1;
  const response = await request(harness.app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo: `AUD-${String(sequence).padStart(3, '0')}`,
      name,
      startTime: '09:00',
      venueType: 'auditorium',
      audienceId,
      occurrences: [{ date }],
      ...extra,
    });
  expect(response.status).toBe(201);
  const id = response.body.id as string;
  await harness.db.query("update events set status = 'active' where id = $1", [id]);
  return id;
}

async function legacyColumns(
  eventId: string,
): Promise<{ ministryCode: string | null; presbyterOnly: boolean }> {
  const [row] = await harness.db.query<{ code: string | null; presbyter_only: boolean }>(
    `select m.code as code, e.presbyter_only
       from events e
       left join ministries m on m.id = e.ministry_id
      where e.id = $1`,
    [eventId],
  );
  return { ministryCode: row!.code ?? null, presbyterOnly: row!.presbyter_only };
}

async function parent(eventId: string, from = today, to = today) {
  const response = await request(harness.app)
    .get(`/v1/events/${eventId}`)
    .query({ view: 'parent', from, to })
    .set(readHeaders);
  expect(response.status).toBe(200);
  return response.body as {
    ministry: { code: string; name: string } | null;
    presbyterOnly: boolean;
    audienceId: string;
  };
}

async function parentList(query: Record<string, string | number>): Promise<string[]> {
  const response = await request(harness.app)
    .get('/v1/events')
    .query({ view: 'parent', from: today, to: today, ...query })
    .set(readHeaders);
  expect(response.status).toBe(200);
  return (response.body.items as Array<{ id: string }>).map((item) => item.id);
}

beforeAll(async () => {
  harness = await createTestApp();
  today = new Date().toISOString().slice(0, 10);
});

afterAll(async () => {
  await harness.close();
});

describe('the legacy projection through the parent DTO', () => {
  it('derives the pair from the audience and writes the same pair to the columns', async () => {
    const created: Array<{ label: string; eventId: string }> = [];

    for (const shape of LEGACY_SHAPES) {
      const audienceId = await createAudience(
        `Projection ${shape.label} ${++sequence}`,
        shape.rule,
      );
      const eventId = await createEvent(`Projection ${shape.label}`, audienceId, today);
      created.push({ label: shape.label, eventId });

      const columns = await legacyColumns(eventId);
      const detail = await parent(eventId);

      // Derivation == the columns, and both are the shape's pair.
      expect(columns).toEqual(shape.expected);
      expect({
        ministryCode: detail.ministry?.code ?? null,
        presbyterOnly: detail.presbyterOnly,
      }).toEqual(shape.expected);
      expect(detail.audienceId).toBe(audienceId);
    }

    // The ministry label the DTO renders comes from the rule's code.
    const ministryShape = LEGACY_SHAPES.find((shape) => shape.label === 'ministry')!;
    const ministryDetail = await parent(
      created.find((item) => item.label === ministryShape.label)!.eventId,
    );
    expect(ministryDetail.ministry).toEqual({ code: 'CHOIR', name: 'Choir' });
  });

  it('hashes the audience and not the retired columns into the parent ETag', async () => {
    const audienceId = await createAudience(`Etag general ${++sequence}`, EVERYONE);
    const eventId = await createEvent('Etag general', audienceId, today);

    const before = await request(harness.app)
      .get(`/v1/events/${eventId}`)
      .query({ view: 'parent', from: today, to: today })
      .set(readHeaders);
    expect(before.status).toBe(200);

    // The columns are written from the audience; a stale copy of them must not
    // make the validator move. The audience is unchanged, so the ETag is too.
    await harness.db.query(`update events set presbyter_only = not presbyter_only where id = $1`, [
      eventId,
    ]);

    const after = await request(harness.app)
      .get(`/v1/events/${eventId}`)
      .query({ view: 'parent', from: today, to: today })
      .set(readHeaders);
    expect(after.status).toBe(200);
    expect(after.headers.etag).toBe(before.headers.etag);
  });

  it('resolves ?ministry= through the projection, not through clause presence', async () => {
    const choirAudience = await createAudience(`Filter choir ${++sequence}`, CHOIR);
    const notChoirAudience = await createAudience(`Filter not choir ${++sequence}`, {
      operator: 'noneOf',
      clauses: [{ attribute: 'ministry', ministryCode: 'CHOIR' }],
    });
    const youthAudience = await createAudience(`Filter youth ${++sequence}`, {
      operator: 'allOf',
      clauses: [{ attribute: 'ageBand', minYears: 13, maxYears: 40 }],
    });

    const choirEvent = await createEvent('Filter choir', choirAudience, today);
    const notChoirEvent = await createEvent('Filter not choir', notChoirAudience, today);
    await createEvent('Filter youth', youthAudience, today);

    const filtered = await request(harness.app)
      .get('/v1/events')
      .query({ view: 'parent', from: today, to: today, ministry: 'CHOIR', limit: 100 })
      .set(readHeaders);
    expect(filtered.status).toBe(200);

    const ids = filtered.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(choirEvent);
    // `noneOf(ministry CHOIR)` carries the clause but projects general; a
    // clause-presence filter would have returned it and inverted the meaning.
    expect(ids).not.toContain(notChoirEvent);

    // The filter also accepts the ministry's name.
    const byName = await request(harness.app)
      .get('/v1/events')
      .query({ view: 'parent', from: today, to: today, ministry: 'Choir', limit: 100 })
      .set(readHeaders);
    expect(byName.body.items.map((item: { id: string }) => item.id)).toEqual(ids);

    // A code no ministry carries matches nothing rather than everything.
    const unknown = await request(harness.app)
      .get('/v1/events')
      .query({ view: 'parent', from: today, to: today, ministry: 'NO-SUCH', limit: 100 })
      .set(readHeaders);
    expect(unknown.status).toBe(200);
    expect(unknown.body.items).toEqual([]);
  });

  it('pages both list paths in the same (start date, id) order', async () => {
    const audienceId = await createAudience(`Paging ${++sequence}`, CHOIR);
    for (let index = 0; index < 3; index += 1) {
      await createEvent(`Paging ${index}`, audienceId, today);
    }

    // The unfiltered path pages in SQL; the ministry path pages after the
    // filter. Both must walk the same order across pages.
    const all = await parentList({ limit: 100 });
    expect(all.length).toBeGreaterThan(3);
    expect(await parentList({ limit: 2, offset: 0 })).toEqual(all.slice(0, 2));
    expect(await parentList({ limit: 2, offset: 2 })).toEqual(all.slice(2, 4));

    const choir = await parentList({ ministry: 'CHOIR', limit: 100 });
    expect(choir.length).toBeGreaterThan(3);
    expect(await parentList({ ministry: 'CHOIR', limit: 2, offset: 0 })).toEqual(choir.slice(0, 2));
    expect(await parentList({ ministry: 'CHOIR', limit: 2, offset: 2 })).toEqual(choir.slice(2, 4));
  });
});

describe('clocking is authority, not audience', () => {
  it('lets a presbyter clock a member into a Youth event', async () => {
    const youthAudience = await createAudience(`Clock youth ${++sequence}`, {
      operator: 'allOf',
      clauses: [{ attribute: 'ageBand', minYears: 13, maxYears: 17 }],
    });

    for (const memberNo of ['CLOCK-PRES', 'CLOCK-YOUTH']) {
      const created = await request(harness.app)
        .post('/v1/members')
        .set(writeHeaders)
        .send({
          memberNo,
          firstName: 'Clock',
          lastName: memberNo,
          gender: 'male',
          dob: memberNo === 'CLOCK-YOUTH' ? '2012-01-01' : '1975-01-01',
          joinedOn: '2020-01-01',
          contacts: reachableContacts(),
        });
      expect(created.status).toBe(201);
    }
    const presbyter = await request(harness.app)
      .put('/v1/members/CLOCK-PRES')
      .set(writeHeaders)
      .send({ isPresbyter: true });
    expect(presbyter.status).toBe(200);

    const assigned = await request(harness.app)
      .post('/v1/shepherding/assignments')
      .set(writeHeaders)
      .send({ officerMemberNo: 'CLOCK-PRES', memberNo: 'CLOCK-YOUTH' });
    expect(assigned.status).toBe(201);

    const eventId = await createEvent('Clock youth', youthAudience, today);

    // The presbyter is outside the event's audience (they are not 13-17); the
    // roster says so, and clocking still works because authority, not audience,
    // gates it.
    const roster = await request(harness.app)
      .get(`/v1/events/${eventId}/attendance`)
      .query({ date: today })
      .set(readHeaders);
    expect(roster.body.expected).toBe(1);

    const clocking = new ClockingRepository(harness.db);
    const entry = await clocking.clockIn({
      eventId,
      sessionDate: today,
      memberNo: 'CLOCK-YOUTH',
      actorMemberNo: 'CLOCK-PRES',
      actor: 'test',
    });
    expect(entry.memberNo).toBe('CLOCK-YOUTH');
  });
});
