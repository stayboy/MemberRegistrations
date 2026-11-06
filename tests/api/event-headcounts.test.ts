import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let today: string;
let yesterday: string;
let tomorrow: string;
let eventId: string;
let pastEventId: string;
let lookupEventId: string;
let memberNo: string;

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

async function createMember(value: string): Promise<void> {
  const response = await request(harness.app).post('/v1/members').set(writeHeaders).send({
    memberNo: value,
    firstName: 'Head',
    lastName: value,
    gender: 'female',
    joinedOn: '2020-01-01',
  });
  expect(response.status).toBe(201);
}

async function createEvent(eventNo: string, dates: string[]): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo,
      name: `Headcount ${eventNo}`,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      startTime: '09:00',
      venueType: 'auditorium',
      sessions: dates.map((date) => ({ date })),
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

function record(body: Record<string, unknown>, actor = 'test-admin') {
  return request(harness.app)
    .post(`/v1/events/${eventId}/headcounts`)
    .set({ ...writeHeaders, 'X-Actor-Id': actor })
    .send(body);
}

function read(sessionDate: string) {
  return request(harness.app)
    .get(`/v1/events/${eventId}/headcounts`)
    .query({ sessionDate })
    .set(readHeaders);
}

beforeAll(async () => {
  harness = await createTestApp();
  today = new Date().toISOString().slice(0, 10);
  yesterday = shiftDate(today, -1);
  tomorrow = shiftDate(today, 1);

  memberNo = 'HC-MEMBER';
  await createMember(memberNo);

  eventId = await createEvent('HC-100', [today, tomorrow]);
  pastEventId = await createEvent('HC-200', [yesterday]);
  lookupEventId = await createEvent('HC-300', [today]);
});

afterAll(async () => {
  await harness.close();
});

describe('GET /v1/events/{eventId}/headcounts', () => {
  it('returns no current observation and no history for a fresh session', async () => {
    const response = await read(today);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ sessionDate: today, current: null, observations: [] });
  });

  it('answers 404 for an unknown event or a session the event does not hold', async () => {
    const unknownEvent = await request(harness.app)
      .get('/v1/events/00000000-0000-4000-8000-000000000000/headcounts')
      .query({ sessionDate: today })
      .set(readHeaders);
    expect(unknownEvent.status).toBe(404);
    expect(unknownEvent.body.code).toBe('not_found');

    const unknownSession = await read(shiftDate(today, 5));
    expect(unknownSession.status).toBe(404);
    expect(unknownSession.body.code).toBe('not_found');
  });
});

describe('POST /v1/events/{eventId}/headcounts', () => {
  it('appends an observation with a Location and a derived total', async () => {
    const response = await record({
      sessionDate: today,
      mode: 'adults',
      adultMale: 20,
      adultFemale: 30,
      childUnspecified: 40,
      asOf: `${today}T08:00:00.000Z`,
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe(`/v1/events/${eventId}/headcounts/${response.body.id}`);
    expect(response.body).toMatchObject({
      eventId,
      sessionDate: today,
      asOf: `${today}T08:00:00.000Z`,
      mode: 'adults',
      adultMale: 20,
      adultFemale: 30,
      adultUnspecified: 0,
      childMale: 0,
      childFemale: 0,
      childUnspecified: 40,
      total: 90,
      recordedBy: 'test-admin',
      supersedesId: null,
      supersededBy: null,
    });
    expect(typeof response.body.recordedAt).toBe('string');
  });

  it('allows an all-zero observation', async () => {
    const response = await record({
      sessionDate: today,
      mode: 'adults',
      adultMale: 0,
      adultFemale: 0,
      childUnspecified: 0,
      asOf: `${today}T07:00:00.000Z`,
    });
    expect(response.status).toBe(201);
    expect(response.body.total).toBe(0);
  });

  it('lists observations newest first by asOf and resolves current', async () => {
    const later = await record({
      sessionDate: today,
      mode: 'children',
      childMale: 5,
      childFemale: 6,
      adultUnspecified: 7,
      asOf: `${today}T10:00:00.000Z`,
    });
    expect(later.status).toBe(201);

    const page = await read(today);
    expect(page.status).toBe(200);
    expect(page.body.current.id).toBe(later.body.id);
    expect(page.body.observations.map((row: { asOf: string }) => row.asOf)).toEqual([
      `${today}T10:00:00.000Z`,
      `${today}T08:00:00.000Z`,
      `${today}T07:00:00.000Z`,
    ]);
  });

  it('rejects a mode-violating bucket with 422', async () => {
    const adults = await record({
      sessionDate: today,
      mode: 'adults',
      adultMale: 1,
      adultFemale: 0,
      childMale: 1,
      asOf: `${today}T11:00:00.000Z`,
    });
    expect(adults.status).toBe(422);
    expect(adults.body.code).toBe('validation_error');

    const children = await record({
      sessionDate: today,
      mode: 'children',
      adultMale: 1,
      childMale: 1,
      asOf: `${today}T11:00:00.000Z`,
    });
    expect(children.status).toBe(422);

    const mixed = await record({
      sessionDate: today,
      mode: 'mixed',
      adultMale: 1,
      adultFemale: 1,
      adultUnspecified: 1,
      asOf: `${today}T11:00:00.000Z`,
    });
    expect(mixed.status).toBe(422);
  });

  it('rejects a bucket over 10,000 and a total over 30,000', async () => {
    const bucket = await record({
      sessionDate: today,
      mode: 'adults',
      adultMale: 10_001,
      adultFemale: 0,
      asOf: `${today}T11:00:00.000Z`,
    });
    expect(bucket.status).toBe(422);

    const total = await record({
      sessionDate: today,
      mode: 'mixed',
      adultMale: 10_000,
      adultFemale: 10_000,
      childMale: 10_000,
      childFemale: 10_000,
      asOf: `${today}T11:00:00.000Z`,
    });
    expect(total.status).toBe(422);
  });

  it('rejects an asOf outside the session day in the event timezone', async () => {
    const response = await record({
      sessionDate: today,
      mode: 'adults',
      adultMale: 1,
      adultFemale: 1,
      asOf: `${yesterday}T23:30:00.000Z`,
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
  });

  it('answers 404 for an unknown event or session', async () => {
    const unknownEvent = await request(harness.app)
      .post('/v1/events/00000000-0000-4000-8000-000000000000/headcounts')
      .set(writeHeaders)
      .send({ sessionDate: today, mode: 'adults' });
    expect(unknownEvent.status).toBe(404);

    const unknownSession = await record({
      sessionDate: shiftDate(today, 5),
      mode: 'adults',
      adultMale: 1,
      adultFemale: 1,
    });
    expect(unknownSession.status).toBe(404);
  });
});

describe('headcount correction', () => {
  it('supersedes the current observation, keeps its asOf and may change the mode', async () => {
    const original = await record({
      sessionDate: today,
      mode: 'adults',
      adultMale: 40,
      adultFemale: 50,
      childUnspecified: 60,
      asOf: `${today}T12:00:00.000Z`,
    });
    expect(original.status).toBe(201);

    const corrected = await request(harness.app)
      .post(`/v1/events/${eventId}/headcounts`)
      .set({ ...writeHeaders, 'X-Actor-Id': 'correcting-presbyter' })
      .send({
        sessionDate: today,
        mode: 'children',
        childMale: 4,
        childFemale: 5,
        adultUnspecified: 6,
        supersedesId: original.body.id,
      });

    expect(corrected.status).toBe(201);
    expect(corrected.body).toMatchObject({
      sessionDate: today,
      asOf: `${today}T12:00:00.000Z`,
      mode: 'children',
      childMale: 4,
      childFemale: 5,
      adultUnspecified: 6,
      total: 15,
      recordedBy: 'correcting-presbyter',
      supersedesId: original.body.id,
      supersededBy: null,
    });

    const page = await read(today);
    expect(page.body.current.id).toBe(corrected.body.id);
    const target = page.body.observations.find(
      (row: { id: string }) => row.id === original.body.id,
    );
    expect(target.supersededBy).toBe(corrected.body.id);
    expect(target.total).toBe(150);

    // A second supersede of the same row is refused; the chain continues only
    // from the current row.
    const again = await request(harness.app)
      .post(`/v1/events/${eventId}/headcounts`)
      .set({ ...writeHeaders, 'X-Actor-Id': 'third-presbyter' })
      .send({
        sessionDate: today,
        mode: 'adults',
        adultMale: 1,
        adultFemale: 1,
        supersedesId: original.body.id,
      });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('validation_error');
  });

  it('refuses a supersedesId from another session or an unknown row', async () => {
    const current = await request(harness.app)
      .post(`/v1/events/${eventId}/headcounts`)
      .set(writeHeaders)
      .send({
        sessionDate: tomorrow,
        mode: 'adults',
        adultMale: 2,
        adultFemale: 3,
        asOf: `${tomorrow}T09:00:00.000Z`,
      });
    expect(current.status).toBe(201);

    const otherSession = await record({
      sessionDate: today,
      mode: 'adults',
      adultMale: 1,
      adultFemale: 1,
      supersedesId: current.body.id,
    });
    expect(otherSession.status).toBe(422);

    const unknown = await record({
      sessionDate: today,
      mode: 'adults',
      adultMale: 1,
      adultFemale: 1,
      supersedesId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.status).toBe(422);
  });

  it('corrects a past session without sending an asOf', async () => {
    const original = await request(harness.app)
      .post(`/v1/events/${pastEventId}/headcounts`)
      .set(writeHeaders)
      .send({
        sessionDate: yesterday,
        mode: 'adults',
        adultMale: 7,
        adultFemale: 8,
        asOf: `${yesterday}T10:00:00.000Z`,
      });
    expect(original.status).toBe(201);

    const corrected = await request(harness.app)
      .post(`/v1/events/${pastEventId}/headcounts`)
      .set({ ...writeHeaders, 'X-Actor-Id': 'late-corrector' })
      .send({
        sessionDate: yesterday,
        mode: 'adults',
        adultMale: 7,
        adultFemale: 9,
        supersedesId: original.body.id,
      });
    expect(corrected.status).toBe(201);
    expect(corrected.body.asOf).toBe(`${yesterday}T10:00:00.000Z`);
    expect(corrected.body.total).toBe(16);
    expect(corrected.body.recordedBy).toBe('late-corrector');
  });
});

describe('GET /v1/events/{eventId}/headcounts/{headcountId}', () => {
  it('reads back a created observation and a correction from both POST paths', async () => {
    const created = await request(harness.app)
      .post(`/v1/events/${lookupEventId}/headcounts`)
      .set({ ...writeHeaders, 'X-Actor-Id': 'lookup-admin' })
      .send({
        sessionDate: today,
        mode: 'adults',
        adultMale: 4,
        adultFemale: 6,
        asOf: `${today}T08:00:00.000Z`,
      });
    expect(created.status).toBe(201);

    const location = created.headers.location as string;
    expect(location).toBe(`/v1/events/${lookupEventId}/headcounts/${created.body.id}`);

    const readBack = await request(harness.app).get(location).set(readHeaders);
    expect(readBack.status).toBe(200);
    expect(readBack.headers['cache-control']).toBe('no-store');
    expect(readBack.body).toMatchObject({
      id: created.body.id,
      total: 10,
      supersedesId: null,
      supersededBy: null,
    });

    const corrected = await request(harness.app)
      .post(`/v1/events/${lookupEventId}/headcounts`)
      .set({ ...writeHeaders, 'X-Actor-Id': 'lookup-corrector' })
      .send({
        sessionDate: today,
        mode: 'adults',
        adultMale: 5,
        adultFemale: 6,
        supersedesId: created.body.id,
      });
    expect(corrected.status).toBe(201);
    expect(corrected.body.asOf).toBe(`${today}T08:00:00.000Z`);

    const correctedBack = await request(harness.app)
      .get(`/v1/events/${lookupEventId}/headcounts/${corrected.body.id}`)
      .set(readHeaders);
    expect(correctedBack.status).toBe(200);
    expect(correctedBack.body).toMatchObject({
      id: corrected.body.id,
      asOf: `${today}T08:00:00.000Z`,
      total: 11,
      recordedBy: 'lookup-corrector',
      supersedesId: created.body.id,
      supersededBy: null,
    });

    const originalBack = await request(harness.app)
      .get(`/v1/events/${lookupEventId}/headcounts/${created.body.id}`)
      .set(readHeaders);
    expect(originalBack.status).toBe(200);
    expect(originalBack.body.supersededBy).toBe(corrected.body.id);
  });

  it("answers 404 for an unknown id and for another event's observation", async () => {
    const created = await request(harness.app)
      .post(`/v1/events/${lookupEventId}/headcounts`)
      .set(writeHeaders)
      .send({
        sessionDate: today,
        mode: 'adults',
        adultMale: 1,
        adultFemale: 1,
        asOf: `${today}T09:00:00.000Z`,
      });
    expect(created.status).toBe(201);

    const unknown = await request(harness.app)
      .get(`/v1/events/${lookupEventId}/headcounts/00000000-0000-4000-8000-000000000000`)
      .set(readHeaders);
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('not_found');

    const wrongEvent = await request(harness.app)
      .get(`/v1/events/${eventId}/headcounts/${created.body.id}`)
      .set(readHeaders);
    expect(wrongEvent.status).toBe(404);
    expect(wrongEvent.body.code).toBe('not_found');
  });
});

describe('headcount visibility', () => {
  it('is operator-only and never appears in a member DTO, profile, summary or event', async () => {
    const profile = await request(harness.app)
      .get(`/v1/members/${memberNo}/profile`)
      .set(readHeaders);
    expect(profile.status).toBe(200);
    expect(JSON.stringify(profile.body)).not.toContain('adultMale');
    expect(JSON.stringify(profile.body)).not.toContain('headcount');

    const summary = await request(harness.app)
      .get(`/v1/members/${memberNo}/attendance/summary`)
      .query({ from: yesterday, to: tomorrow })
      .set(readHeaders);
    expect(summary.status).toBe(200);
    expect(JSON.stringify(summary.body)).not.toContain('adultMale');
    expect(JSON.stringify(summary.body)).not.toContain('headcount');

    const detail = await request(harness.app).get(`/v1/events/${eventId}`).set(readHeaders);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain('adultMale');
    expect(JSON.stringify(detail.body)).not.toContain('headcount');
  });
});
