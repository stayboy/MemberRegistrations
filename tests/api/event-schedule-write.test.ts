import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shiftDate, todayIn } from '../../src/domain/series.js';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';
import { seedEvent } from '../helpers/event-fixtures.js';
import { reachableContacts } from '../helpers/member-fixtures.js';

let harness: TestApp;
let app: TestApp['app'];
let everyoneId: string;
let memberId: string;
let offeringId: string;

const TODAY = todayIn('UTC');
const YESTERDAY = shiftDate(TODAY, -1);
const TOMORROW = shiftDate(TODAY, 1);
/** Wide enough for every event's 90-day window and a 30-day tail. */
const WINDOW = { from: shiftDate(TODAY, -40), to: shiftDate(TODAY, 130) };

/** The next Sunday strictly after today: a rule that starts in the future. */
function nextSunday(): string {
  const weekday = new Date(`${TODAY}T00:00:00Z`).getUTCDay();
  return shiftDate(TODAY, (7 - weekday) % 7 || 7);
}

function parentDetail(id: string) {
  return request(app)
    .get(`/v1/events/${id}`)
    .query({ view: 'parent', ...WINDOW })
    .set(readHeaders);
}

function putSchedule(id: string, body: object) {
  return request(app).put(`/v1/events/${id}/schedule`).set(writeHeaders).send(body);
}

function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
}

function isMonday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}

/** PGlite hands a `date` back as a Date, node-postgres as text. */
function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

async function createOffering(): Promise<string> {
  const [offering] = await harness.db.query<{ id: string }>(
    'insert into offerings default values returning id',
  );
  await harness.db.query(
    `insert into offering_terms (offering_id, version, name, purpose, kind, currency, created_by)
     values ($1,1,'Guard Offering','Seed','freewill','GHS','seed')`,
    [offering!.id],
  );
  return offering!.id;
}

/**
 * Seed one future occurrence with a series version, so the event is recurring
 * and the write's recurrence arm is the matching one.
 */
async function seedRecurringEvent(name: string, date: string, extra: object = {}) {
  const seeded = await seedEvent(harness.db, {
    name,
    startDate: date,
    endDate: date,
    startTime: '09:00',
    endTime: '11:00',
    series: true,
    sessions: [{ date }],
    ...extra,
  });
  return seeded;
}

let startedId: string;
let attachedEventId: string;
let attachedOccurrenceId: string;
let countedEventId: string;
let headcountEventId: string;
let attendanceEventId: string;
let suppressedEventId: string;
let rewriteEventId: string;
let cancelEventId: string;
let periodEventId: string;
let lockedPeriodEventId: string;
let homeCellsEventId: string;
let noOccurrencesEventId: string;
let emptyWindowEventId: string;
let standaloneEventId: string;
let cancelledDate: string;
let periodAnchor: string;

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  const [everyone] = await harness.db.query<{ id: string }>(
    `select id from audiences where system_key = 'everyone'`,
  );
  everyoneId = everyone!.id;
  offeringId = await createOffering();

  const member = await request(app).post('/v1/members').set(writeHeaders).send({
    memberNo: 'SG-1',
    firstName: 'Guard',
    lastName: 'Member',
    joinedOn: '2020-01-01',
    contacts: reachableContacts(),
  });
  expect(member.status).toBe(201);
  memberId = member.body.id as string;

  // 1. An occurrence dated today or earlier.
  const started = await seedRecurringEvent('Started Gathering', YESTERDAY);
  startedId = started.eventId;

  // 2. An offering attached to the event itself: it names no date.
  const attachedEvent = await seedRecurringEvent('Attached Gathering', TOMORROW);
  attachedEventId = attachedEvent.eventId;
  await harness.db.query(
    `insert into event_offerings (event_id, offering_id, attached_by) values ($1,$2,'seed')`,
    [attachedEventId, offeringId],
  );

  // 3. An offering attached to one occurrence.
  const attachedOccurrence = await seedRecurringEvent('Attachment Gathering', TOMORROW);
  attachedOccurrenceId = attachedOccurrence.eventId;
  await harness.db.query(
    `insert into event_offerings (event_id, offering_id, occurrence_id, attached_by)
     values ($1,$2,$3,'seed')`,
    [attachedOccurrenceId, offeringId, attachedOccurrence.occurrenceIds[TOMORROW]!],
  );

  // 4. A recorded offering count.
  const counted = await seedRecurringEvent('Counted Gathering', TOMORROW);
  countedEventId = counted.eventId;
  await harness.db.query(
    `insert into event_session_offering_counts
       (occurrence_id, offering_id, session_date, currency, terms_version, as_of, recorded_by)
     values ($1,$2,$3::date,'GHS',1,$4::timestamptz,'seed')`,
    [counted.occurrenceIds[TOMORROW]!, offeringId, TOMORROW, `${TOMORROW}T10:00:00Z`],
  );

  // 5. A headcount on a headcount-only event.
  const headcount = await seedRecurringEvent('Headcount Gathering', TOMORROW, {
    tracksMembers: false,
  });
  headcountEventId = headcount.eventId;
  await harness.db.query(
    `insert into event_session_headcounts
       (occurrence_id, session_date, as_of, mode, total, ended, recorded_by)
     values ($1,$2::date,$3::timestamptz,'adults',10,true,'seed')`,
    [headcount.occurrenceIds[TOMORROW]!, TOMORROW, `${TOMORROW}T09:10:00Z`],
  );

  // 6. A per-member attendance row.
  const attendance = await seedRecurringEvent('Attendance Gathering', TOMORROW);
  attendanceEventId = attendance.eventId;
  await harness.db.query(
    `insert into attendance (member_id, occurrence_id, source, created_by)
     values ($1,$2,'manual','seed')`,
    [memberId, attendance.occurrenceIds[TOMORROW]!],
  );

  // 7. An import suppression, whose row appears nowhere on the read.
  const suppressed = await seedRecurringEvent('Suppressed Gathering', TOMORROW);
  suppressedEventId = suppressed.eventId;
  await harness.db.query(
    `insert into attendance_suppressions (member_id, occurrence_id, suppressed_by)
     values ($1,$2,'seed')`,
    [memberId, suppressed.occurrenceIds[TOMORROW]!],
  );

  // 8. A recurring event whose rule is rewritten.
  const rewrite = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      name: 'Rewrite Gathering',
      audienceIds: [everyoneId],
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '09:00',
      endTime: '11:00',
      recurrence: {
        schedules: [{ effectiveFrom: nextSunday(), rrule: 'FREQ=WEEKLY;BYDAY=SU' }],
      },
    });
  expect(rewrite.status).toBe(201);
  expect(rewrite.body.schedule).toEqual({ locked: false, reasons: [] });
  rewriteEventId = rewrite.body.id as string;

  // 9. An active daily event with one date cancelled ahead of the rewrite.
  const cancel = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      name: 'Cancel Gathering',
      audienceIds: [everyoneId],
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '09:00',
      recurrence: { schedules: [{ effectiveFrom: TOMORROW, rrule: 'FREQ=DAILY' }] },
    });
  expect(cancel.status).toBe(201);
  cancelEventId = cancel.body.id as string;
  const activated = await request(app)
    .patch(`/v1/events/${cancelEventId}`)
    .set(writeHeaders)
    .send({ status: 'active' });
  expect(activated.status).toBe(200);
  cancelledDate = shiftDate(TOMORROW, 1);
  const cancelled = await request(app)
    .post(`/v1/events/${cancelEventId}/occurrences/${cancelledDate}/cancel`)
    .set(writeHeaders)
    .send({ note: 'The hall is taken' });
  expect(cancelled.status).toBe(200);
  expect(cancelled.body.status).toBe('cancelled');

  // 10. A recurring period event, anchored far enough ahead to stay untouched.
  periodAnchor = shiftDate(TODAY, 30);
  const period = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      name: 'Period Rewrite Gathering',
      audienceIds: [everyoneId],
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '09:00',
      period: {
        id: 'communion-week',
        frequency: 'monthly',
        day: 'SUN',
        effectiveFrom: periodAnchor,
      },
    });
  expect(period.status).toBe(201);
  periodEventId = period.body.id as string;

  // The same rule on a second event, which the guard tests close with history.
  const lockedPeriod = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      name: 'Locked Period Gathering',
      audienceIds: [everyoneId],
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '09:00',
      period: {
        id: 'communion-week',
        frequency: 'monthly',
        day: 'SUN',
        effectiveFrom: periodAnchor,
      },
    });
  expect(lockedPeriod.status).toBe(201);
  lockedPeriodEventId = lockedPeriod.body.id as string;

  // 11. A single-date period event, which takes no day.
  const homeCells = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      name: 'Home Cells Gathering',
      audienceIds: [everyoneId],
      timezone: 'UTC',
      venueType: 'auditorium',
      startTime: '18:00',
      period: { id: 'home-cells', frequency: 'monthly', effectiveFrom: periodAnchor },
    });
  expect(homeCells.status).toBe(201);
  homeCellsEventId = homeCells.body.id as string;

  // 12. A rule that starts in the past with no occurrence behind it: an open
  // guard, and a rewrite whose new rule could name past dates.
  const noOccurrences = await seedEvent(harness.db, {
    name: 'Quiet Gathering',
    startDate: shiftDate(TODAY, -30),
    endDate: shiftDate(TODAY, 60),
    startTime: '09:00',
    series: true,
    sessions: [],
  });
  noOccurrencesEventId = noOccurrences.eventId;

  // 13. The same shape, but the window ends today + 30 so a short new rule
  // produces nothing at all.
  const emptyWindow = await seedEvent(harness.db, {
    name: 'Empty Gathering',
    startDate: shiftDate(TODAY, -30),
    endDate: shiftDate(TODAY, 30),
    startTime: '09:00',
    series: true,
    sessions: [],
  });
  emptyWindowEventId = emptyWindow.eventId;

  // 14. A standalone event, which has no schedule version to rewrite.
  const standalone = await seedEvent(harness.db, {
    name: 'Standalone Gathering',
    startDate: TOMORROW,
    endDate: TOMORROW,
    startTime: '09:00',
    sessions: [{ date: TOMORROW }],
  });
  standaloneEventId = standalone.eventId;
});

afterAll(async () => {
  await harness.close();
});

describe('the edit guard on the parent read', () => {
  it('reports an occurrence dated today or earlier', async () => {
    const response = await parentDetail(startedId);
    expect(response.status).toBe(200);
    expect(response.body.schedule).toEqual({
      locked: true,
      reasons: [{ code: 'occurrence_started', date: YESTERDAY }],
    });
  });

  it('reports an offering attached to the event with no date', async () => {
    const response = await parentDetail(attachedEventId);
    expect(response.body.schedule).toEqual({
      locked: true,
      reasons: [{ code: 'offering_attached', date: null }],
    });
  });

  it('reports an offering attached to one occurrence, dated', async () => {
    const response = await parentDetail(attachedOccurrenceId);
    expect(response.body.schedule).toEqual({
      locked: true,
      reasons: [{ code: 'offering_attached', date: TOMORROW }],
    });
  });

  it('reports a recorded offering count', async () => {
    const response = await parentDetail(countedEventId);
    expect(response.body.schedule).toEqual({
      locked: true,
      reasons: [{ code: 'offering_counted', date: TOMORROW }],
    });
  });

  it('reports a headcount under attendance_recorded', async () => {
    const response = await parentDetail(headcountEventId);
    expect(response.body.schedule).toEqual({
      locked: true,
      reasons: [{ code: 'attendance_recorded', date: TOMORROW }],
    });
  });

  it('reports a per-member attendance row under the same code', async () => {
    const response = await parentDetail(attendanceEventId);
    expect(response.body.schedule).toEqual({
      locked: true,
      reasons: [{ code: 'attendance_recorded', date: TOMORROW }],
    });
  });

  it('reports an import suppression, which the read carries nowhere else', async () => {
    const response = await parentDetail(suppressedEventId);
    expect(response.body.schedule).toEqual({
      locked: true,
      reasons: [{ code: 'import_suppressed', date: TOMORROW }],
    });
  });

  it('reports an open guard on an untouched event', async () => {
    const response = await parentDetail(rewriteEventId);
    expect(response.body.schedule).toEqual({ locked: false, reasons: [] });
    expect(response.body.occurrences.length).toBeGreaterThan(0);
  });

  it('carries the same guard on the list item', async () => {
    const response = await request(app)
      .get('/v1/events')
      .query({ view: 'parent', ...WINDOW, limit: 100 })
      .set(readHeaders);

    expect(response.status).toBe(200);
    const open = response.body.items.find((item: { id: string }) => item.id === rewriteEventId);
    const locked = response.body.items.find((item: { id: string }) => item.id === startedId);
    expect(open.schedule).toEqual({ locked: false, reasons: [] });
    expect(locked.schedule).toEqual({
      locked: true,
      reasons: [{ code: 'occurrence_started', date: YESTERDAY }],
    });
  });
});

describe('PUT /v1/events/{eventId}/schedule under a closed guard', () => {
  it('refuses every cause with 409 recurrence_locked and its reasons', async () => {
    const cases: Array<[string, Array<{ code: string; date: string | null }>]> = [
      [startedId, [{ code: 'occurrence_started', date: YESTERDAY }]],
      [attachedEventId, [{ code: 'offering_attached', date: null }]],
      [attachedOccurrenceId, [{ code: 'offering_attached', date: TOMORROW }]],
      [countedEventId, [{ code: 'offering_counted', date: TOMORROW }]],
      [headcountEventId, [{ code: 'attendance_recorded', date: TOMORROW }]],
      [attendanceEventId, [{ code: 'attendance_recorded', date: TOMORROW }]],
      [suppressedEventId, [{ code: 'import_suppressed', date: TOMORROW }]],
    ];

    for (const [id, reasons] of cases) {
      const response = await putSchedule(id, {
        recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=SU' },
      });
      expect(response.status).toBe(409);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.code).toBe('recurrence_locked');
      expect(response.body.reasons).toEqual(reasons);
    }
  });

  it('leaves the started occurrence standing after the refusal', async () => {
    const response = await parentDetail(startedId);
    expect(response.body.occurrences).toEqual([
      expect.objectContaining({ date: YESTERDAY, status: 'held' }),
    ]);
  });

  it('refuses a period event whose guard is closed', async () => {
    const [occurrence] = await harness.db.query<{ id: string; date: unknown }>(
      `select id, date from event_occurrences where event_id = $1 order by date limit 1`,
      [lockedPeriodEventId],
    );
    const firstDate = isoDate(occurrence!.date);
    await harness.db.query(
      `insert into event_session_headcounts
         (occurrence_id, session_date, as_of, mode, total, ended, recorded_by)
       values ($1,$2::date,$3::timestamptz,'adults',5,true,'seed')`,
      [occurrence!.id, firstDate, `${firstDate}T09:10:00Z`],
    );

    const response = await putSchedule(lockedPeriodEventId, {
      period: { frequency: 'monthly', day: 'MON' },
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('recurrence_locked');
    expect(response.body.reasons).toEqual([{ code: 'attendance_recorded', date: firstDate }]);
  });
});

describe('PUT /v1/events/{eventId}/schedule arm matching', () => {
  it('refuses the period arm on a recurring event, naming the arm', async () => {
    const response = await putSchedule(rewriteEventId, {
      period: { frequency: 'monthly', day: 'SUN' },
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('period:');
  });

  it('refuses the recurrence arm on a period event, naming the arm', async () => {
    const response = await putSchedule(periodEventId, {
      recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=SU' },
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('recurrence:');
  });

  it('refuses the recurrence arm on a standalone event', async () => {
    const response = await putSchedule(standaloneEventId, {
      recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=SU' },
    });
    expect(response.status).toBe(422);
    expect(response.body.detail).toContain('recurrence:');
  });
});

describe('PUT /v1/events/{eventId}/schedule over a recurrence rule', () => {
  it('replaces the version in force and the calendar follows', async () => {
    const start = nextSunday();
    const before = await parentDetail(rewriteEventId);
    expect(before.body.recurrence.schedules.map((row: { rrule: string }) => row.rrule)).toEqual([
      'FREQ=WEEKLY;BYDAY=SU',
    ]);
    // The version starts in the future, so nothing is in force yet; the newest
    // version still owns the window and is the one replaced.
    const response = await putSchedule(rewriteEventId, {
      recurrence: { rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      recurrence: {
        schedules: [
          {
            effectiveFrom: start,
            rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU',
            endsOn: null,
          },
        ],
        exceptions: [],
      },
      period: null,
      generated: true,
    });

    const dates = response.body.occurrences.map((row: { date: string }) => row.date);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe(start);
    expect(dates[1]).toBe(shiftDate(start, 14));
    expect(dates).not.toContain(shiftDate(start, 7));
    expect(dates.every(isSunday)).toBe(true);

    const after = await parentDetail(rewriteEventId);
    expect(after.body.occurrences.map((row: { date: string }) => row.date)).toEqual(dates);
    const [versionCount] = await harness.db.query<{ count: string }>(
      'select count(*) as count from event_recurrence_versions where event_id = $1',
      [rewriteEventId],
    );
    expect(Number(versionCount!.count)).toBe(1);
  });

  it('leaves a future cancelled row standing and replaces the scheduled ones', async () => {
    const response = await putSchedule(cancelEventId, {
      recurrence: { rrule: 'FREQ=DAILY;INTERVAL=7' },
    });

    expect(response.status).toBe(200);
    expect(response.body.generated).toBe(true);
    const rows = response.body.occurrences as Array<{ date: string; status: string }>;
    expect(rows.find((row) => row.date === cancelledDate)).toMatchObject({
      date: cancelledDate,
      status: 'cancelled',
    });
    expect(rows.some((row) => row.date === shiftDate(TOMORROW, 2))).toBe(false);
    const scheduled = rows.filter((row) => row.status === 'scheduled').map((row) => row.date);
    expect(scheduled).toEqual(
      Array.from({ length: 13 }, (_, index) => shiftDate(TOMORROW, index * 7)),
    );

    const [cancelled] = await harness.db.query<{ status: string; note: string | null }>(
      'select status, note from event_occurrences where event_id = $1 and date = $2::date',
      [cancelEventId, cancelledDate],
    );
    expect(cancelled).toMatchObject({ status: 'cancelled', note: 'The hall is taken' });
  });

  it('never produces a date on or before the event today', async () => {
    const response = await putSchedule(noOccurrencesEventId, {
      recurrence: { rrule: 'FREQ=DAILY' },
    });

    expect(response.status).toBe(200);
    expect(response.body.generated).toBe(true);
    const dates = response.body.occurrences.map((row: { date: string }) => row.date);
    expect(dates).toHaveLength(60);
    expect(dates[0]).toBe(TOMORROW);
    expect(dates[dates.length - 1]).toBe(shiftDate(TODAY, 60));
    expect(dates.every((date: string) => date > TODAY)).toBe(true);

    const [past] = await harness.db.query<{ count: string }>(
      `select count(*) as count from event_occurrences
        where event_id = $1 and date <= $2::date`,
      [noOccurrencesEventId, TODAY],
    );
    expect(Number(past!.count)).toBe(0);
  });

  it('answers generated: false when the new rule produces nothing', async () => {
    const response = await putSchedule(emptyWindowEventId, {
      recurrence: { rrule: 'FREQ=DAILY', endsOn: YESTERDAY },
    });

    expect(response.status).toBe(200);
    expect(response.body.generated).toBe(false);
    expect(response.body.occurrences).toEqual([]);
    expect(response.body.recurrence.schedules).toEqual([
      {
        effectiveFrom: shiftDate(TODAY, -30),
        rrule: 'FREQ=DAILY',
        endsOn: YESTERDAY,
      },
    ]);
  });
});

describe('PUT /v1/events/{eventId}/schedule over a period rule', () => {
  it('replaces the stored frequency and day, and the calendar follows', async () => {
    const before = await parentDetail(periodEventId);
    const beforeDates = before.body.occurrences.map((row: { date: string }) => row.date);
    expect(beforeDates.length).toBeGreaterThan(0);
    expect(beforeDates.every(isSunday)).toBe(true);

    const response = await putSchedule(periodEventId, {
      period: { frequency: 'monthly', day: 'MON' },
    });

    expect(response.status).toBe(200);
    expect(response.body.recurrence).toBeNull();
    expect(response.body.period).toEqual({
      id: 'communion-week',
      name: 'Communion Week',
      frequency: 'monthly',
      day: 'MON',
    });
    expect(response.body.period).not.toHaveProperty('cycle');
    expect(response.body.generated).toBe(true);

    const dates = response.body.occurrences.map((row: { date: string }) => row.date);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every(isMonday)).toBe(true);
    for (const old of beforeDates) expect(dates).not.toContain(old);

    const after = await parentDetail(periodEventId);
    expect(after.body.period).toMatchObject({ id: 'communion-week', day: 'MON', cycle: null });
    expect(after.body.occurrences.map((row: { date: string }) => row.date)).toEqual(dates);
  });

  it('refuses a day on a single-date period', async () => {
    const response = await putSchedule(homeCellsEventId, {
      period: { frequency: 'monthly', day: 'MON' },
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.detail).toContain('period.day');
  });
});

describe('PATCH /v1/events/{eventId} keeps refusing the schedule', () => {
  it('refuses recurrence and period by name', async () => {
    const recurrence = await request(app)
      .patch(`/v1/events/${rewriteEventId}`)
      .set(writeHeaders)
      .send({ recurrence: { schedules: [{ effectiveFrom: TOMORROW, rrule: 'FREQ=DAILY' }] } });
    expect(recurrence.status).toBe(422);
    expect(recurrence.body.detail).toContain('recurrence');

    const period = await request(app)
      .patch(`/v1/events/${periodEventId}`)
      .set(writeHeaders)
      .send({ period: { id: 'home-cells', cycleMonth: '2027-01' } });
    expect(period.status).toBe(422);
    expect(period.body.detail).toContain('period');
  });
});
