import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { effectiveAvailableUntil, isExpired } from '../../src/repos/offerings.js';

let harness: TestApp;
let seriesId: string;
let archivedSeriesId: string;
let pastEventId: string;
let cancelledEventId: string;
let archivedEventId: string;
let eventSeq = 0;

interface SeedEvent {
  name: string;
  startDate: string;
  endDate: string;
  status?: 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
  seriesId?: string | null;
  sessions: Array<{ date: string; status?: 'scheduled' | 'held' | 'cancelled' }>;
}

function createOffering(body: Record<string, unknown>) {
  return request(harness.app).post('/v1/offerings').set(writeHeaders).send(body);
}

async function makeOffering(overrides: Record<string, unknown> = {}) {
  const response = await createOffering({
    purpose: 'General giving',
    kind: 'freewill',
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body as {
    id: string;
    active: boolean;
    createdAt: string;
    terms: {
      version: number;
      name: string | null;
      purpose: string;
      kind: string;
      currency: string;
      availableUntil: string | null;
      targetMinor: number | null;
    };
  };
}

async function insertEvent(seed: SeedEvent): Promise<string> {
  eventSeq += 1;
  const [row] = await harness.db.query<{ id: string }>(
    `insert into event_instances (
       event_no, series_id, name, timezone, start_date, end_date, start_time, end_time,
       venue_type, venue_name, description, status, source, sessions
     )
     values ($1,$2,$3,'UTC',$4,$5,'09:00',null,'auditorium',null,null,$6,'manual',$7::jsonb)
     returning id`,
    [
      `OFF-${eventSeq}`,
      seed.seriesId ?? null,
      seed.name,
      seed.startDate,
      seed.endDate,
      seed.status ?? 'scheduled',
      JSON.stringify(
        seed.sessions.map((session) => ({
          date: session.date,
          startTime: '09:00',
          endTime: null,
          status: session.status ?? 'scheduled',
        })),
      ),
    ],
  );
  return row!.id;
}

function attachToEvent(eventId: string, body: Record<string, unknown>) {
  return request(harness.app).post(`/v1/events/${eventId}/offerings`).set(writeHeaders).send(body);
}

function attachToSeries(targetSeriesId: string, body: Record<string, unknown>) {
  return request(harness.app)
    .post(`/v1/series/${targetSeriesId}/offerings`)
    .set(writeHeaders)
    .send(body);
}

function listEventAttachments(eventId: string) {
  return request(harness.app).get(`/v1/events/${eventId}/offerings`).set(readHeaders);
}

beforeAll(async () => {
  harness = await createTestApp();

  const series = await request(harness.app)
    .post('/v1/series')
    .set(writeHeaders)
    .send({
      name: 'Offering Series',
      schedule: {
        effectiveFrom: '2026-01-04',
        rrule: 'FREQ=WEEKLY;BYDAY=SU',
        endsOn: '2026-01-25',
      },
    });
  expect(series.status).toBe(201);
  seriesId = series.body.id as string;

  const extra = await request(harness.app)
    .post(`/v1/series/${seriesId}/exceptions`)
    .set(writeHeaders)
    .send({ date: '2026-01-06', kind: 'extra', note: 'Epiphany service' });
  expect(extra.status).toBe(201);

  const archived = await request(harness.app)
    .post('/v1/series')
    .set(writeHeaders)
    .send({
      name: 'Archived Offering Series',
      schedule: { effectiveFrom: '2026-02-01', rrule: 'FREQ=WEEKLY;BYDAY=SU' },
    });
  archivedSeriesId = archived.body.id as string;
  const archiveSeries = await request(harness.app)
    .put(`/v1/series/${archivedSeriesId}`)
    .set(writeHeaders)
    .send({ archived: true });
  expect(archiveSeries.status).toBe(200);

  pastEventId = await insertEvent({
    name: 'Past Gathering',
    startDate: '2020-01-01',
    endDate: '2020-01-01',
    sessions: [{ date: '2020-01-01', status: 'held' }],
  });
  cancelledEventId = await insertEvent({
    name: 'Cancelled Gathering',
    startDate: '2999-07-01',
    endDate: '2999-07-01',
    status: 'cancelled',
    sessions: [{ date: '2999-07-01', status: 'cancelled' }],
  });
  archivedEventId = await insertEvent({
    name: 'Archived Gathering',
    startDate: '2999-08-01',
    endDate: '2999-08-01',
    status: 'archived',
    sessions: [{ date: '2999-08-01', status: 'cancelled' }],
  });
});

afterAll(async () => {
  await harness.close();
});

describe('POST /v1/offerings', () => {
  it('creates terms version 1 with the flat body and a Location', async () => {
    const response = await createOffering({
      name: '  Harvest Appeal  ',
      purpose: 'Harvest thanksgiving',
      kind: 'missions',
      targetMinor: 500000,
      defaultAmountMinor: 5000,
      startsOn: '2999-01-01',
      endsOn: '2999-01-31',
      availableUntil: '2999-12-31',
      scripture: 'Malachi 3:10',
      gatewayAccount: 'gw-123',
      gatewayMetadata: { fund: 'missions' },
    });

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/v1/offerings/${response.body.id}`);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      active: true,
      createdAt: expect.any(String),
      terms: {
        version: 1,
        name: 'Harvest Appeal',
        purpose: 'Harvest thanksgiving',
        kind: 'missions',
        currency: 'GHS',
        targetMinor: 500000,
        defaultAmountMinor: 5000,
        startsOn: '2999-01-01',
        endsOn: '2999-01-31',
        availableUntil: '2999-12-31',
        scripture: 'Malachi 3:10',
        gatewayAccount: 'gw-123',
        gatewayMetadata: { fund: 'missions' },
      },
    });

    const read = await request(harness.app)
      .get(`/v1/offerings/${response.body.id}`)
      .set(readHeaders);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(response.body);
  });

  it('leaves an omitted name null, so the event scope resolves the fallback', async () => {
    const response = await createOffering({ purpose: 'Weekly tithe', kind: 'tithe' });
    expect(response.status).toBe(201);
    expect(response.body.terms.name).toBeNull();
  });

  it('rejects a non-positive amount, a bad currency and inverted dates', async () => {
    const badAmount = await createOffering({
      purpose: 'Bad amount',
      kind: 'freewill',
      targetMinor: 0,
    });
    expect(badAmount.status).toBe(422);

    const badCurrency = await createOffering({
      purpose: 'Bad currency',
      kind: 'freewill',
      currency: 'ghs',
    });
    expect(badCurrency.status).toBe(422);

    const inverted = await createOffering({
      purpose: 'Bad dates',
      kind: 'freewill',
      startsOn: '2999-02-01',
      endsOn: '2999-01-01',
    });
    expect(inverted.status).toBe(422);
  });
});

describe('GET /v1/offerings', () => {
  it('defaults to active, filters archived and can include both newest first', async () => {
    const first = await makeOffering({ purpose: 'Listed first', kind: 'freewill' });
    const second = await makeOffering({ purpose: 'Listed second', kind: 'tithe' });
    const archived = await makeOffering({ purpose: 'Archived', kind: 'other' });
    const archive = await request(harness.app)
      .put(`/v1/offerings/${archived.id}`)
      .set(writeHeaders)
      .send({ active: false });
    expect(archive.status).toBe(200);
    expect(archive.body.active).toBe(false);

    const active = await request(harness.app).get('/v1/offerings').set(readHeaders);
    expect(active.status).toBe(200);
    expect(active.body.items.map((item: { id: string }) => item.id)).toContain(first.id);
    expect(active.body.items.map((item: { id: string }) => item.id)).toContain(second.id);
    expect(active.body.items.map((item: { id: string }) => item.id)).not.toContain(archived.id);

    const archivedOnly = await request(harness.app)
      .get('/v1/offerings')
      .query({ active: 'false' })
      .set(readHeaders);
    expect(archivedOnly.status).toBe(200);
    expect(archivedOnly.body.items.map((item: { id: string }) => item.id)).toEqual([archived.id]);

    const all = await request(harness.app)
      .get('/v1/offerings')
      .query({ includeArchived: 'true' })
      .set(readHeaders);
    expect(all.status).toBe(200);
    const ids = all.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ids).toContain(archived.id);

    const createdAt = all.body.items.map((item: { createdAt: string }) => item.createdAt);
    const sorted = [...createdAt].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(createdAt).toEqual(sorted);
  });
});

describe('PUT /v1/offerings/{id}', () => {
  it('archives and reactivates without editing terms', async () => {
    const offering = await makeOffering({ purpose: 'Toggle me', kind: 'building' });

    const archived = await request(harness.app)
      .put(`/v1/offerings/${offering.id}`)
      .set(writeHeaders)
      .send({ active: false });
    expect(archived.status).toBe(200);
    expect(archived.body.active).toBe(false);
    expect(archived.body.terms).toEqual(offering.terms);

    const [stored] = await harness.db.query<{ updated_by: string | null }>(
      'select updated_by from offerings where id = $1',
      [offering.id],
    );
    expect(stored!.updated_by).toBe('test-admin');

    const noActor = await request(harness.app)
      .put(`/v1/offerings/${offering.id}`)
      .set(readHeaders)
      .send({ active: true });
    expect(noActor.status).toBe(422);

    const restored = await request(harness.app)
      .put(`/v1/offerings/${offering.id}`)
      .set(writeHeaders)
      .send({ active: true });
    expect(restored.status).toBe(200);
    expect(restored.body.active).toBe(true);
    expect(restored.body.terms).toEqual(offering.terms);

    const unknown = await request(harness.app)
      .put('/v1/offerings/00000000-0000-4000-8000-000000000000')
      .set(writeHeaders)
      .send({ active: true });
    expect(unknown.status).toBe(404);
  });
});

describe('terms versions', () => {
  it('publishes n+1 from the current base and keeps every earlier version', async () => {
    const offering = await makeOffering({ name: 'Original', purpose: 'First appeal' });

    const published = await request(harness.app)
      .post(`/v1/offerings/${offering.id}/terms`)
      .set(writeHeaders)
      .send({
        baseVersion: 1,
        name: 'Revised',
        purpose: 'Revised appeal',
        kind: 'freewill',
        targetMinor: 90000,
        reason: 'Corrected the appeal target',
      });
    expect(published.status).toBe(201);
    expect(published.headers.location).toBeUndefined();
    expect(published.body).toMatchObject({
      version: 2,
      name: 'Revised',
      purpose: 'Revised appeal',
      targetMinor: 90000,
      currency: 'GHS',
      createdBy: 'test-admin',
      reason: 'Corrected the appeal target',
      createdAt: expect.any(String),
    });

    const versions = await request(harness.app)
      .get(`/v1/offerings/${offering.id}/terms`)
      .set(readHeaders);
    expect(versions.status).toBe(200);
    expect(versions.body.items.map((item: { version: number }) => item.version)).toEqual([2, 1]);
    expect(versions.body.items[1]).toMatchObject({
      name: 'Original',
      purpose: 'First appeal',
      reason: null,
      createdBy: 'test-admin',
      createdAt: expect.any(String),
    });

    const current = await request(harness.app).get(`/v1/offerings/${offering.id}`).set(readHeaders);
    expect(current.body.terms.version).toBe(2);
  });

  it('requires a reason to publish and records the auditor of each version', async () => {
    const offering = await makeOffering({ purpose: 'Needs a reason' });

    const missing = await request(harness.app)
      .post(`/v1/offerings/${offering.id}/terms`)
      .set(writeHeaders)
      .send({ baseVersion: 1, purpose: 'No reason given', kind: 'freewill' });
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation_error');

    const published = await request(harness.app)
      .post(`/v1/offerings/${offering.id}/terms`)
      .set(writeHeaders)
      .send({
        baseVersion: 1,
        purpose: 'With a reason',
        kind: 'freewill',
        reason: 'Finance committee changed the wording',
      });
    expect(published.status).toBe(201);
    expect(published.body).toMatchObject({
      version: 2,
      reason: 'Finance committee changed the wording',
      createdBy: 'test-admin',
      createdAt: expect.any(String),
    });

    const versions = await request(harness.app)
      .get(`/v1/offerings/${offering.id}/terms`)
      .set(readHeaders);
    expect(versions.body.items[0]).toMatchObject({
      version: 2,
      reason: 'Finance committee changed the wording',
    });
    expect(versions.body.items[1]).toMatchObject({ version: 1, reason: null });
  });

  it('rejects a stale base with 409 terms_version_conflict and publishes nothing', async () => {
    const offering = await makeOffering({ purpose: 'Stale base' });
    await request(harness.app).post(`/v1/offerings/${offering.id}/terms`).set(writeHeaders).send({
      baseVersion: 1,
      purpose: 'Version two',
      kind: 'freewill',
      reason: 'First publish',
    });

    const stale = await request(harness.app)
      .post(`/v1/offerings/${offering.id}/terms`)
      .set(writeHeaders)
      .send({
        baseVersion: 1,
        purpose: 'Stale attempt',
        kind: 'freewill',
        reason: 'Stale publish',
      });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('terms_version_conflict');

    const versions = await request(harness.app)
      .get(`/v1/offerings/${offering.id}/terms`)
      .set(readHeaders);
    expect(versions.body.items).toHaveLength(2);
  });

  it('404s the version list and publish for an unknown offering', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    const list = await request(harness.app).get(`/v1/offerings/${unknown}/terms`).set(readHeaders);
    expect(list.status).toBe(404);

    const publish = await request(harness.app)
      .post(`/v1/offerings/${unknown}/terms`)
      .set(writeHeaders)
      .send({
        baseVersion: 1,
        purpose: 'Nowhere',
        kind: 'freewill',
        reason: 'Unknown offering',
      });
    expect(publish.status).toBe(404);
  });
});

describe('event attachments', () => {
  it('attaches two offerings to one event and lists both with current terms', async () => {
    const eventId = await insertEvent({
      name: 'Two Offerings',
      startDate: '2999-06-01',
      endDate: '2999-06-01',
      sessions: [{ date: '2999-06-01' }],
    });
    const first = await makeOffering({ name: 'Harvest', purpose: 'First' });
    const second = await makeOffering({ purpose: 'Second', kind: 'tithe' });

    const a = await attachToEvent(eventId, { offeringId: first.id });
    expect(a.status).toBe(201);
    expect(a.headers.location).toBe(`/v1/events/${eventId}/offerings/${first.id}`);
    expect(a.body).toMatchObject({
      attachmentId: expect.any(String),
      offeringId: first.id,
      availableUntil: null,
      terms: { version: 1, name: 'Harvest' },
    });

    const b = await attachToEvent(eventId, { offeringId: second.id });
    expect(b.status).toBe(201);

    const list = await listEventAttachments(eventId);
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.body.items.map((item: { offeringId: string }) => item.offeringId)).toEqual([
      first.id,
      second.id,
    ]);
    expect(list.body.items[1].terms.name).toBeNull();
  });

  it('rejects an active duplicate with 409 offering_already_attached', async () => {
    const eventId = await insertEvent({
      name: 'Duplicate Offering',
      startDate: '2999-06-02',
      endDate: '2999-06-02',
      sessions: [{ date: '2999-06-02' }],
    });
    const offering = await makeOffering({ purpose: 'Duplicate' });
    expect((await attachToEvent(eventId, { offeringId: offering.id })).status).toBe(201);

    const duplicate = await attachToEvent(eventId, { offeringId: offering.id });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('offering_already_attached');
  });

  it('rejects a past, cancelled or archived event with 409 event_not_active', async () => {
    const offering = await makeOffering({ purpose: 'Not active' });
    for (const eventId of [pastEventId, cancelledEventId, archivedEventId]) {
      const response = await attachToEvent(eventId, { offeringId: offering.id });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('event_not_active');
    }
  });

  it('rejects an archived offering with 422 validation_error', async () => {
    const eventId = await insertEvent({
      name: 'Inactive Offering',
      startDate: '2999-06-03',
      endDate: '2999-06-03',
      sessions: [{ date: '2999-06-03' }],
    });
    const offering = await makeOffering({ purpose: 'Will be archived' });
    await request(harness.app)
      .put(`/v1/offerings/${offering.id}`)
      .set(writeHeaders)
      .send({ active: false });

    const response = await attachToEvent(eventId, { offeringId: offering.id });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('rejects an availableUntil before the event end and accepts the end date', async () => {
    const eventId = await insertEvent({
      name: 'Expiry Guard',
      startDate: '2999-06-10',
      endDate: '2999-06-30',
      sessions: [{ date: '2999-06-30' }],
    });
    const offering = await makeOffering({ purpose: 'Expiry guard' });

    const early = await attachToEvent(eventId, {
      offeringId: offering.id,
      availableUntil: '2999-06-29',
    });
    expect(early.status).toBe(422);
    expect(early.body.code).toBe('validation_error');

    const onEnd = await attachToEvent(eventId, {
      offeringId: offering.id,
      availableUntil: '2999-06-30',
    });
    expect(onEnd.status).toBe(201);
    expect(onEnd.body.availableUntil).toBe('2999-06-30');
  });

  it('404s the attachment list for an unknown event', async () => {
    const response = await listEventAttachments('00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
  });
});

describe('series attachments', () => {
  it('attaches to a series and rejects an attachment-level availableUntil', async () => {
    const offering = await makeOffering({ purpose: 'Series offering', kind: 'building' });

    const withDate = await attachToSeries(seriesId, {
      offeringId: offering.id,
      availableUntil: '2026-12-31',
    });
    expect(withDate.status).toBe(422);
    expect(withDate.body.code).toBe('validation_error');

    const attached = await attachToSeries(seriesId, { offeringId: offering.id });
    expect(attached.status).toBe(201);
    expect(attached.headers.location).toBe(`/v1/series/${seriesId}/offerings/${offering.id}`);
    expect(attached.body.availableUntil).toBeNull();

    const list = await request(harness.app)
      .get(`/v1/series/${seriesId}/offerings`)
      .set(readHeaders);
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { offeringId: string }) => item.offeringId)).toContain(
      offering.id,
    );
  });

  it('rejects a duplicate and an archived series', async () => {
    const offering = await makeOffering({ purpose: 'Series duplicate' });
    expect((await attachToSeries(seriesId, { offeringId: offering.id })).status).toBe(201);

    const duplicate = await attachToSeries(seriesId, { offeringId: offering.id });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('offering_already_attached');

    const archived = await attachToSeries(archivedSeriesId, { offeringId: offering.id });
    expect(archived.status).toBe(409);
    expect(archived.body.code).toBe('event_not_active');
  });
});

describe('detaching', () => {
  it('ends the attachment, keeps the row and excludes it from the list', async () => {
    const eventId = await insertEvent({
      name: 'Detach Event',
      startDate: '2999-06-04',
      endDate: '2999-06-04',
      sessions: [{ date: '2999-06-04' }],
    });
    const offering = await makeOffering({ purpose: 'Detach me' });
    const attached = await attachToEvent(eventId, { offeringId: offering.id });
    expect(attached.status).toBe(201);

    const detached = await request(harness.app)
      .delete(`/v1/events/${eventId}/offerings/${offering.id}`)
      .set(writeHeaders);
    expect(detached.status).toBe(204);

    const [row] = await harness.db.query<{
      id: string;
      detached_on: Date | string | null;
      detached_by: string | null;
    }>('select id, detached_on, detached_by from event_instance_offerings where id = $1', [
      attached.body.attachmentId,
    ]);
    expect(row!.detached_on).not.toBeNull();
    expect(row!.detached_by).toBe('test-admin');

    const list = await listEventAttachments(eventId);
    expect(list.body.items).toHaveLength(0);

    const again = await request(harness.app)
      .delete(`/v1/events/${eventId}/offerings/${offering.id}`)
      .set(writeHeaders);
    expect(again.status).toBe(404);
  });

  it('re-attaching makes a new row and does not carry exceptions over', async () => {
    const eventId = await insertEvent({
      name: 'Reattach Event',
      startDate: '2999-06-05',
      endDate: '2999-06-05',
      sessions: [{ date: '2999-06-05' }],
    });
    const offering = await makeOffering({ purpose: 'Reattach me' });
    const first = await attachToEvent(eventId, { offeringId: offering.id });
    expect(first.status).toBe(201);

    const exception = await request(harness.app)
      .post(`/v1/events/${eventId}/offerings/${offering.id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2999-06-05', kind: 'skip', note: 'First attachment only' });
    expect(exception.status).toBe(201);

    await request(harness.app)
      .delete(`/v1/events/${eventId}/offerings/${offering.id}`)
      .set(writeHeaders);
    const second = await attachToEvent(eventId, { offeringId: offering.id });
    expect(second.status).toBe(201);
    expect(second.body.attachmentId).not.toBe(first.body.attachmentId);

    const exceptions = await request(harness.app)
      .get(`/v1/events/${eventId}/offerings/${offering.id}/exceptions`)
      .set(readHeaders);
    expect(exceptions.status).toBe(200);
    expect(exceptions.body.items).toEqual([]);

    const [kept] = await harness.db.query<{ count: number | string }>(
      'select count(*)::int as count from offering_exceptions where attachment_id = $1',
      [first.body.attachmentId],
    );
    expect(Number(kept!.count)).toBe(1);
  });

  it('ends a series attachment, keeps the row and 404s a second detach', async () => {
    const offering = await makeOffering({ purpose: 'Series detach' });
    const attached = await attachToSeries(seriesId, { offeringId: offering.id });
    expect(attached.status).toBe(201);

    const detached = await request(harness.app)
      .delete(`/v1/series/${seriesId}/offerings/${offering.id}`)
      .set(writeHeaders);
    expect(detached.status).toBe(204);

    const [row] = await harness.db.query<{
      detached_on: Date | string | null;
      detached_by: string | null;
    }>('select detached_on, detached_by from event_instance_offerings where id = $1', [
      attached.body.attachmentId,
    ]);
    expect(row!.detached_on).not.toBeNull();
    expect(row!.detached_by).toBe('test-admin');

    const list = await request(harness.app)
      .get(`/v1/series/${seriesId}/offerings`)
      .set(readHeaders);
    expect(list.body.items.map((item: { offeringId: string }) => item.offeringId)).not.toContain(
      offering.id,
    );

    const again = await request(harness.app)
      .delete(`/v1/series/${seriesId}/offerings/${offering.id}`)
      .set(writeHeaders);
    expect(again.status).toBe(404);
  });

  it('404s a detach with no active attachment', async () => {
    const eventId = await insertEvent({
      name: 'No Attachment',
      startDate: '2999-06-06',
      endDate: '2999-06-06',
      sessions: [{ date: '2999-06-06' }],
    });
    const offering = await makeOffering({ purpose: 'Never attached' });
    const response = await request(harness.app)
      .delete(`/v1/events/${eventId}/offerings/${offering.id}`)
      .set(writeHeaders);
    expect(response.status).toBe(404);
  });
});

describe('series exceptions', () => {
  it('accepts skip on an occurrence and opt_in on an extra date', async () => {
    const offering = await makeOffering({ purpose: 'Series exceptions' });
    expect((await attachToSeries(seriesId, { offeringId: offering.id })).status).toBe(201);

    const skip = await request(harness.app)
      .post(`/v1/series/${seriesId}/offerings/${offering.id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-01-11', kind: 'skip', note: 'No second service' });
    expect(skip.status).toBe(201);
    expect(skip.body).toMatchObject({
      id: expect.any(String),
      date: '2026-01-11',
      kind: 'skip',
      note: 'No second service',
      createdAt: expect.any(String),
      createdBy: 'test-admin',
    });

    const optIn = await request(harness.app)
      .post(`/v1/series/${seriesId}/offerings/${offering.id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-01-06', kind: 'opt_in', note: 'Epiphany' });
    expect(optIn.status).toBe(201);
    expect(optIn.body.kind).toBe('opt_in');
  });

  it('rejects an invalid date or kind with 422 invalid_exception_date', async () => {
    const offering = await makeOffering({ purpose: 'Series invalid dates' });
    expect((await attachToSeries(seriesId, { offeringId: offering.id })).status).toBe(201);

    const notMet = await request(harness.app)
      .post(`/v1/series/${seriesId}/offerings/${offering.id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-01-07', kind: 'skip' });
    expect(notMet.status).toBe(422);
    expect(notMet.body.code).toBe('invalid_exception_date');

    const occurrenceOptIn = await request(harness.app)
      .post(`/v1/series/${seriesId}/offerings/${offering.id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-01-18', kind: 'opt_in' });
    expect(occurrenceOptIn.status).toBe(422);
    expect(occurrenceOptIn.body.code).toBe('invalid_exception_date');
  });

  it('is append-only and lists the newest row first', async () => {
    const offering = await makeOffering({ purpose: 'Series history' });
    expect((await attachToSeries(seriesId, { offeringId: offering.id })).status).toBe(201);
    const path = `/v1/series/${seriesId}/offerings/${offering.id}/exceptions`;

    await request(harness.app)
      .post(path)
      .set(writeHeaders)
      .send({ date: '2026-01-25', kind: 'skip', note: 'first' });
    await request(harness.app)
      .post(path)
      .set(writeHeaders)
      .send({ date: '2026-01-25', kind: 'skip', note: 'second' });

    const history = await request(harness.app).get(path).set(readHeaders);
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items[0].note).toBe('second');
    expect(history.body.items[1].note).toBe('first');

    // The newest row for a date is the effective one on the event aggregate.
    const eventId = await insertEvent({
      name: 'Newest Wins',
      startDate: '2026-01-25',
      endDate: '2026-01-25',
      seriesId,
      sessions: [{ date: '2026-01-25', status: 'held' }],
    });
    const detail = await request(harness.app).get(`/v1/events/${eventId}`).set(readHeaders);
    const item = detail.body.offerings.find(
      (entry: { offeringId: string }) => entry.offeringId === offering.id,
    );
    expect(item.exceptions).toEqual([{ date: '2026-01-25', kind: 'skip', note: 'second' }]);
  });

  it('404s exceptions when the offering has no active attachment', async () => {
    const offering = await makeOffering({ purpose: 'Not attached here' });
    const list = await request(harness.app)
      .get(`/v1/series/${seriesId}/offerings/${offering.id}/exceptions`)
      .set(readHeaders);
    expect(list.status).toBe(404);

    const create = await request(harness.app)
      .post(`/v1/series/${seriesId}/offerings/${offering.id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2026-01-11', kind: 'skip' });
    expect(create.status).toBe(404);
  });
});

describe('event exceptions', () => {
  it('accepts skip on a session date and rejects opt_in or an off-session date', async () => {
    const eventId = await insertEvent({
      name: 'Event Exception',
      startDate: '2999-06-07',
      endDate: '2999-06-08',
      sessions: [{ date: '2999-06-07' }, { date: '2999-06-08' }],
    });
    const offering = await makeOffering({ purpose: 'Event exceptions' });
    expect((await attachToEvent(eventId, { offeringId: offering.id })).status).toBe(201);
    const path = `/v1/events/${eventId}/offerings/${offering.id}/exceptions`;

    const skip = await request(harness.app)
      .post(path)
      .set(writeHeaders)
      .send({ date: '2999-06-07', kind: 'skip', note: 'First evening only' });
    expect(skip.status).toBe(201);

    const optIn = await request(harness.app)
      .post(path)
      .set(writeHeaders)
      .send({ date: '2999-06-07', kind: 'opt_in' });
    expect(optIn.status).toBe(422);
    expect(optIn.body.code).toBe('invalid_exception_date');

    const offSession = await request(harness.app)
      .post(path)
      .set(writeHeaders)
      .send({ date: '2999-06-09', kind: 'skip' });
    expect(offSession.status).toBe(422);
    expect(offSession.body.code).toBe('invalid_exception_date');

    const list = await request(harness.app).get(path).set(readHeaders);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
  });
});

describe('event aggregate offerings', () => {
  it('resolves custom and fallback names, effective expiry, terms and zero stats', async () => {
    const eventId = await insertEvent({
      name: 'Bible Conference',
      startDate: '2999-06-20',
      endDate: '2999-06-21',
      sessions: [{ date: '2999-06-20' }, { date: '2999-06-21' }],
    });
    const named = await makeOffering({
      name: 'Harvest Appeal',
      purpose: 'Named appeal',
      availableUntil: '2999-12-31',
    });
    const unnamed = await makeOffering({ purpose: 'Tithe appeal', kind: 'tithe' });

    expect((await attachToEvent(eventId, { offeringId: named.id })).status).toBe(201);
    expect((await attachToEvent(eventId, { offeringId: unnamed.id })).status).toBe(201);

    const skip = await request(harness.app)
      .post(`/v1/events/${eventId}/offerings/${named.id}/exceptions`)
      .set(writeHeaders)
      .send({ date: '2999-06-20', kind: 'skip', note: 'Opening night' });
    expect(skip.status).toBe(201);

    const detail = await request(harness.app).get(`/v1/events/${eventId}`).set(readHeaders);
    expect(detail.status).toBe(200);
    expect(detail.body.offerings).toHaveLength(2);

    const namedItem = detail.body.offerings.find(
      (item: { offeringId: string }) => item.offeringId === named.id,
    );
    expect(namedItem).toMatchObject({
      offeringId: named.id,
      name: 'Harvest Appeal',
      availableUntil: '2999-12-31',
      expired: false,
      terms: { version: 1, name: 'Harvest Appeal', kind: 'freewill' },
      exceptions: [{ date: '2999-06-20', kind: 'skip', note: 'Opening night' }],
      stats: {
        attachedEvents: 1,
        pledgedMinor: 0,
        paidMinor: 0,
        pendingMinor: 0,
        honorRate: 0,
        contributionCount: 0,
      },
    });

    const unnamedItem = detail.body.offerings.find(
      (item: { offeringId: string }) => item.offeringId === unnamed.id,
    );
    expect(unnamedItem.name).toBe('Bible Conference · Tithe');
    expect(unnamedItem.availableUntil).toBe('2999-06-21');
    expect(unnamedItem.expired).toBe(false);
    expect(unnamedItem.exceptions).toEqual([]);

    expect(detail.body.stats).toEqual({
      attachedEvents: 2,
      pledgedMinor: 0,
      paidMinor: 0,
      pendingMinor: 0,
      honorRate: 0,
      contributionCount: 0,
    });
  });

  it('uses the attachment date before the terms date and flags an expired offering', async () => {
    const eventId = await insertEvent({
      name: 'Expiry Precedence',
      startDate: '2999-06-22',
      endDate: '2999-06-30',
      sessions: [{ date: '2999-06-30' }],
    });
    const expiring = await makeOffering({
      purpose: 'Already expired',
      availableUntil: '2020-01-01',
    });
    const bounded = await makeOffering({
      purpose: 'Attachment bounded',
      availableUntil: '2999-12-31',
    });

    expect((await attachToEvent(eventId, { offeringId: expiring.id })).status).toBe(201);
    expect(
      (
        await attachToEvent(eventId, {
          offeringId: bounded.id,
          availableUntil: '2999-11-30',
        })
      ).status,
    ).toBe(201);

    const detail = await request(harness.app).get(`/v1/events/${eventId}`).set(readHeaders);
    const expired = detail.body.offerings.find(
      (item: { offeringId: string }) => item.offeringId === expiring.id,
    );
    const attachmentBounded = detail.body.offerings.find(
      (item: { offeringId: string }) => item.offeringId === bounded.id,
    );

    expect(expired.availableUntil).toBe('2020-01-01');
    expect(expired.expired).toBe(true);
    expect(attachmentBounded.availableUntil).toBe('2999-11-30');
    expect(attachmentBounded.expired).toBe(false);
  });

  it('counts active event attachments across events on the offering stats', async () => {
    const offering = await makeOffering({ purpose: 'Shared offering' });
    const firstEvent = await insertEvent({
      name: 'Shared One',
      startDate: '2999-06-23',
      endDate: '2999-06-23',
      sessions: [{ date: '2999-06-23' }],
    });
    const secondEvent = await insertEvent({
      name: 'Shared Two',
      startDate: '2999-06-24',
      endDate: '2999-06-24',
      sessions: [{ date: '2999-06-24' }],
    });
    expect((await attachToEvent(firstEvent, { offeringId: offering.id })).status).toBe(201);
    expect((await attachToEvent(secondEvent, { offeringId: offering.id })).status).toBe(201);

    const detail = await request(harness.app).get(`/v1/events/${firstEvent}`).set(readHeaders);
    expect(detail.body.offerings[0].stats.attachedEvents).toBe(2);
  });

  it('applies a series attachment to its event and filters exceptions to session dates', async () => {
    const offering = await makeOffering({ purpose: 'Series aggregate', kind: 'building' });
    expect((await attachToSeries(seriesId, { offeringId: offering.id })).status).toBe(201);

    const eventId = await insertEvent({
      name: 'Series Event',
      startDate: '2026-01-04',
      endDate: '2026-01-04',
      seriesId,
      sessions: [{ date: '2026-01-04', status: 'held' }],
    });

    const path = `/v1/series/${seriesId}/offerings/${offering.id}/exceptions`;
    expect(
      (
        await request(harness.app)
          .post(path)
          .set(writeHeaders)
          .send({ date: '2026-01-04', kind: 'skip', note: 'On the event date' })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(harness.app)
          .post(path)
          .set(writeHeaders)
          .send({ date: '2026-01-11', kind: 'skip', note: 'Outside the event' })
      ).status,
    ).toBe(201);

    const detail = await request(harness.app).get(`/v1/events/${eventId}`).set(readHeaders);
    expect(detail.status).toBe(200);
    const item = detail.body.offerings.find(
      (entry: { offeringId: string }) => entry.offeringId === offering.id,
    );
    expect(item).toMatchObject({
      offeringId: offering.id,
      name: 'Series Event · Building',
      availableUntil: '2026-01-04',
      expired: true,
      exceptions: [{ date: '2026-01-04', kind: 'skip', note: 'On the event date' }],
      stats: { attachedEvents: 0 },
    });
  });

  it('carries the offerings on the event list as well', async () => {
    const eventId = await insertEvent({
      name: 'Listed Offerings',
      startDate: '2999-06-25',
      endDate: '2999-06-25',
      sessions: [{ date: '2999-06-25' }],
    });
    const offering = await makeOffering({ purpose: 'On the list' });
    expect((await attachToEvent(eventId, { offeringId: offering.id })).status).toBe(201);

    const list = await request(harness.app)
      .get('/v1/events')
      .query({ limit: 100 })
      .set(readHeaders);
    expect(list.status).toBe(200);
    const item = list.body.items.find((event: { id: string }) => event.id === eventId);
    expect(item.offerings).toHaveLength(1);
    expect(item.offerings[0].offeringId).toBe(offering.id);
    expect(item.stats.attachedEvents).toBe(1);
  });
});

describe('expiry helpers and the ticket-21 split', () => {
  it('resolves the effective availableUntil in order', () => {
    expect(
      effectiveAvailableUntil({
        attachmentAvailableUntil: '2026-03-01',
        termsAvailableUntil: '2026-02-01',
        eventEndDate: '2026-01-01',
      }),
    ).toBe('2026-03-01');
    expect(
      effectiveAvailableUntil({
        attachmentAvailableUntil: null,
        termsAvailableUntil: '2026-02-01',
        eventEndDate: '2026-01-01',
      }),
    ).toBe('2026-02-01');
    expect(
      effectiveAvailableUntil({
        attachmentAvailableUntil: null,
        termsAvailableUntil: null,
        eventEndDate: '2026-01-01',
      }),
    ).toBe('2026-01-01');
    expect(
      effectiveAvailableUntil({
        attachmentAvailableUntil: null,
        termsAvailableUntil: null,
        eventEndDate: null,
      }),
    ).toBeNull();
  });

  it('expires only after the date, never on it', () => {
    expect(isExpired(null, '2026-01-01')).toBe(false);
    expect(isExpired('2026-01-01', '2026-01-01')).toBe(false);
    expect(isExpired('2026-01-01', '2026-01-02')).toBe(true);
    expect(isExpired('2026-01-02', '2026-01-01')).toBe(false);
  });

  it('exposes the predicate and leaves contributions to ticket 21', async () => {
    expect(typeof isExpired).toBe('function');

    // Ticket 20 shipped the expiry predicate only; ticket 21 owns the route.
    const contributions = await request(harness.app)
      .post('/v1/contributions')
      .set(writeHeaders)
      .send({ offeringId: '00000000-0000-4000-8000-000000000000' });
    expect(contributions.status).toBe(422);
    expect(contributions.body.code).toBe('validation_error');

    const openapi = await request(harness.app).get('/openapi.json');
    expect(openapi.status).toBe(200);
    expect(openapi.body.paths['/v1/contributions']).toBeDefined();
    expect(openapi.body.paths['/v1/offerings']).toBeDefined();
  });
});
