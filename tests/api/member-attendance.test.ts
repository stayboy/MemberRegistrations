import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, readHeaders, writeHeaders, type TestApp } from '../helpers/app.js';

let harness: TestApp;
let app: TestApp['app'];
let eventNo = 0;
const summaryEvent = new Map<number, string>();
const profileEvent = new Map<number, string>();
let ministryEventId: string;
let headcountEventId: string;

function day(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createMember(
  memberNo: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const response = await request(app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Member',
      lastName: memberNo,
      gender: 'female',
      joinedOn: day(-60),
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function createEvent(
  date: string,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  eventNo += 1;
  const response = await request(app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo: `ATT-${eventNo}`,
      name,
      startDate: date,
      endDate: date,
      startTime: '09:00',
      venueType: 'auditorium',
      sessions: [{ date }],
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function attend(eventId: string, memberNo: string, date: string): Promise<void> {
  await request(app)
    .post(`/v1/events/${eventId}/attendance`)
    .set(writeHeaders)
    .send({ memberNo, date })
    .expect(201);
}

async function summary(memberNo: string, from: string, to: string) {
  return request(app)
    .get(`/v1/members/${memberNo}/attendance/summary`)
    .query({ from, to })
    .set(readHeaders)
    .expect(200);
}

beforeAll(async () => {
  harness = await createTestApp();
  app = harness.app;

  for (const offset of [-50, -40, -30, -20, -10]) {
    summaryEvent.set(offset, await createEvent(day(offset), `Summary ${offset}`));
  }

  const series = await request(app)
    .post('/v1/series')
    .set(writeHeaders)
    .send({
      name: 'Ministry attendance series',
      ministryCode: 'CHOIR',
      schedule: { effectiveFrom: day(-60), rrule: 'FREQ=WEEKLY;BYDAY=SU', endsOn: day(-20) },
    })
    .expect(201);
  ministryEventId = await createEvent(day(-25), 'Choir rehearsal');
  await harness.db.query('update event_instances set series_id = $2 where id = $1', [
    ministryEventId,
    series.body.id,
  ]);

  headcountEventId = await createEvent(day(-15), 'Headcount-only rally', {
    tracksMembers: false,
  });
  await createEvent(day(0), 'Headcount-only today', { tracksMembers: false });
  await createMember('ATT-HEADCOUNT', { joinedOn: day(0) });

  await createMember('ATT-MAIN');
  await attend(summaryEvent.get(-50)!, 'ATT-MAIN', day(-50));
  await attend(summaryEvent.get(-30)!, 'ATT-MAIN', day(-30));
  await attend(summaryEvent.get(-10)!, 'ATT-MAIN', day(-10));

  await createMember('ATT-JOINED', { joinedOn: day(-25) });

  for (const offset of [-7, -6, -5, -4, -3]) {
    profileEvent.set(offset, await createEvent(day(offset), `Profile ${offset}`));
  }

  await createMember('PROFILE-REG', { joinedOn: day(-8) });
  await createMember('PROFILE-NON', { joinedOn: day(-8) });
  await createMember('PROFILE-FEW', { joinedOn: day(-4) });

  for (const offset of [-7, -6, -5]) {
    await attend(profileEvent.get(offset)!, 'PROFILE-REG', day(offset));
  }
  for (const offset of [-7, -6]) {
    await attend(profileEvent.get(offset)!, 'PROFILE-NON', day(offset));
  }
});

afterAll(async () => {
  await harness.close();
});

describe('attendance summary', () => {
  it('counts held general sessions and lists attended rows newest first', async () => {
    const response = await summary('ATT-MAIN', day(-60), day(-10));

    expect(response.body.from).toBe(day(-60));
    expect(response.body.to).toBe(day(-10));
    expect(response.body.expected).toBe(5);
    expect(response.body.attended).toBe(3);
    expect(response.body.events.map((event: { sessionDate: string }) => event.sessionDate)).toEqual(
      [day(-10), day(-30), day(-50)],
    );
  });

  it('windows the expected set without fabricating absences', async () => {
    const response = await summary('ATT-MAIN', day(-35), day(-15));

    expect(response.body.expected).toBe(2);
    expect(response.body.attended).toBe(1);
    expect(response.body.events).toEqual([
      expect.objectContaining({ eventId: summaryEvent.get(-30), sessionDate: day(-30) }),
    ]);
  });

  it('applies the join-date floor', async () => {
    const response = await summary('ATT-JOINED', day(-60), day(-10));
    expect(response.body.expected).toBe(2);
    expect(response.body.attended).toBe(0);
    expect(response.body.events).toEqual([]);
  });

  it('drops headcount-only events from the summary and profile', async () => {
    expect(headcountEventId).toBeTruthy();
    const response = await summary('ATT-MAIN', day(-16), day(-14));
    expect(response.body.expected).toBe(0);
    expect(response.body.attended).toBe(0);

    const today = await summary('ATT-HEADCOUNT', day(0), day(0));
    expect(today.body.expected).toBe(0);
    expect(today.body.attended).toBe(0);

    const profile = await request(app)
      .get('/v1/members/ATT-HEADCOUNT/profile')
      .set(readHeaders)
      .expect(200);
    expect(profile.body.attendance).toEqual({
      status: 'not_enough_data',
      attended: 0,
      expected: 0,
      window: 5,
      lastAttendedOn: null,
    });
  });

  it('scopes ministry events to active membership and its assignment floor', async () => {
    const before = await summary('ATT-MAIN', day(-60), day(-10));
    expect(before.body.expected).toBe(5);

    const memberId = await createMember('ATT-MINISTRY');

    await request(app)
      .post('/v1/members/ATT-MINISTRY/ministries')
      .set(writeHeaders)
      .send({ code: 'CHOIR' })
      .expect(201);

    // Assigned today: the earlier ministry session is floored out.
    const floored = await summary('ATT-MINISTRY', day(-60), day(-10));
    expect(floored.body.expected).toBe(5);

    await harness.db.query(
      `update member_ministries mm
          set assigned_on = $2
        from ministries mi
       where mm.ministry_id = mi.id and mm.member_id = $1 and mi.code = 'CHOIR'`,
      [memberId, day(-60)],
    );

    const included = await summary('ATT-MINISTRY', day(-60), day(-10));
    expect(included.body.expected).toBe(6);

    await attend(ministryEventId, 'ATT-MINISTRY', day(-25));
    const attended = await summary('ATT-MINISTRY', day(-60), day(-10));
    expect(attended.body.attended).toBe(1);
    expect(attended.body.events[0]).toMatchObject({
      eventId: ministryEventId,
      name: 'Choir rehearsal',
      sessionDate: day(-25),
    });
  });
});

describe('member profile', () => {
  it('reports not enough data below three held sessions', async () => {
    const response = await request(app)
      .get('/v1/members/PROFILE-FEW/profile')
      .set(readHeaders)
      .expect(200);

    expect(response.body.attendance).toEqual({
      status: 'not_enough_data',
      attended: 0,
      expected: 2,
      window: 5,
      lastAttendedOn: null,
    });
  });

  it('reports regular at 60 percent and non-regular below it', async () => {
    const regular = await request(app)
      .get('/v1/members/PROFILE-REG/profile')
      .set(readHeaders)
      .expect(200);
    expect(regular.body.attendance).toEqual({
      status: 'regular',
      attended: 3,
      expected: 5,
      window: 5,
      lastAttendedOn: day(-5),
    });

    const nonRegular = await request(app)
      .get('/v1/members/PROFILE-NON/profile')
      .set(readHeaders)
      .expect(200);
    expect(nonRegular.body.attendance).toMatchObject({
      status: 'non_regular',
      attended: 2,
      expected: 5,
      lastAttendedOn: day(-6),
    });
  });

  it('returns at most three ministries and the active shepherd', async () => {
    await createMember('PROFILE-OFFICER', {
      isPresbyter: true,
      joinedOn: day(-60),
    });
    await request(app)
      .post('/v1/shepherding/assignments')
      .set(writeHeaders)
      .send({ officerMemberNo: 'PROFILE-OFFICER', memberNo: 'PROFILE-REG' })
      .expect(201);

    await request(app)
      .post('/v1/members/PROFILE-REG/ministries')
      .set(writeHeaders)
      .send({ code: 'PEMEM' })
      .expect(201);
    await request(app)
      .post('/v1/members/PROFILE-REG/ministries')
      .set(writeHeaders)
      .send({ code: 'WOMEN' })
      .expect(201);
    await request(app)
      .post('/v1/members/PROFILE-REG/ministries')
      .set(writeHeaders)
      .send({ code: 'CHOIR' })
      .expect(201);
    await request(app)
      .post('/v1/members/PROFILE-REG/ministries')
      .set(writeHeaders)
      .send({ code: 'PRAYER' })
      .expect(201);

    const response = await request(app)
      .get('/v1/members/PROFILE-REG/profile')
      .set(readHeaders)
      .expect(200);

    expect(response.body.ministries).toEqual(['Choir', 'PEMEM', 'Prayer']);
    expect(response.body.shepherd).toMatchObject({
      memberNo: 'PROFILE-OFFICER',
      name: 'Member PROFILE-OFFICER',
    });
  });
});

describe('presbyter rank', () => {
  it('is accepted on create and appears only on the member detail', async () => {
    const created = await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({
        memberNo: 'RANK-1',
        firstName: 'Rank',
        lastName: 'One',
        isPresbyter: true,
        presbyterRank: 2,
      })
      .expect(201);
    expect(created.body.presbyterRank).toBe(2);

    const detail = await request(app).get('/v1/members/RANK-1').set(readHeaders).expect(200);
    expect(detail.body.presbyterRank).toBe(2);

    const list = await request(app).get('/v1/members').set(readHeaders).expect(200);
    const summary = list.body.items.find(
      (item: { memberNo: string }) => item.memberNo === 'RANK-1',
    );
    expect(summary).not.toHaveProperty('presbyterRank');
  });

  it('rejects a rank without the presbyter flag and non-positive ranks', async () => {
    const withoutFlag = await request(app)
      .post('/v1/members')
      .set(writeHeaders)
      .send({ memberNo: 'RANK-BAD-1', firstName: 'A', lastName: 'B', presbyterRank: 3 });
    expect(withoutFlag.status).toBe(422);

    const zero = await request(app).post('/v1/members').set(writeHeaders).send({
      memberNo: 'RANK-BAD-2',
      firstName: 'A',
      lastName: 'B',
      isPresbyter: true,
      presbyterRank: 0,
    });
    expect(zero.status).toBe(422);

    const negative = await request(app)
      .put('/v1/members/RANK-1')
      .set(writeHeaders)
      .send({ presbyterRank: -1 });
    expect(negative.status).toBe(422);

    const noFlagUpdate = await request(app)
      .put('/v1/members/RANK-1')
      .set(writeHeaders)
      .send({ isPresbyter: false, presbyterRank: 4 });
    expect(noFlagUpdate.status).toBe(422);
  });

  it('guards rank changes by version and clears the rank with the flag', async () => {
    const detail = await request(app).get('/v1/members/RANK-1').set(readHeaders).expect(200);
    const version = detail.body.version as number;

    const updated = await request(app)
      .put('/v1/members/RANK-1')
      .set({ ...writeHeaders, 'If-Match': `"v${version}"` })
      .send({ presbyterRank: 1 })
      .expect(200);
    expect(updated.body.presbyterRank).toBe(1);

    const stale = await request(app)
      .put('/v1/members/RANK-1')
      .set({ ...writeHeaders, 'If-Match': `"v${version}"` })
      .send({ presbyterRank: 2 });
    expect(stale.status).toBe(409);

    const cleared = await request(app)
      .put('/v1/members/RANK-1')
      .set(writeHeaders)
      .send({ isPresbyter: false })
      .expect(200);
    expect(cleared.body.isPresbyter).toBe(false);
    expect(cleared.body.presbyterRank).toBeNull();

    // The database enforces the same invariant as the repository.
    await expect(
      harness.db.query(`update members set presbyter_rank = 2 where member_no = 'RANK-1'`),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
