import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, writeHeaders, type TestApp } from '../helpers/app.js';

const USSD_SECRET = 'test-ussd-gateway-secret-16';
const USSD_PHONE_PEPPER = 'test-ussd-phone-pepper-16';

let harness: TestApp;
let today: string;
let yesterday: string;
let tomorrow: string;
let mainEventId: string;
let pastEventId: string;
let headcountEventId: string;
let offeringId: string;
let nonceSeq = 0;
let eventSeq = 0;

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function ddmmyyyy(iso: string): string {
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
}

function signed(app: TestApp['app'], body: Record<string, unknown>, ip: string) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `nonce-${String(++nonceSeq).padStart(8, '0')}`;
  const signature = createHmac('sha256', USSD_SECRET)
    .update(`${timestamp}${nonce}${raw}`)
    .digest('hex');
  return request(app)
    .post('/ussd/session')
    .set({
      'Content-Type': 'application/json',
      'X-USSD-Timestamp': timestamp,
      'X-USSD-Nonce': nonce,
      'X-USSD-Signature': signature,
      'X-Forwarded-For': ip,
    })
    .send(raw);
}

function start(phone: string, ip: string) {
  return signed(harness.app, { phone, input: '', seq: 1 }, ip);
}

function frame(sessionId: string, phone: string, input: string, seq: number, ip: string) {
  return signed(harness.app, { phone, sessionId, input, seq }, ip);
}

async function createMember(
  memberNo: string,
  phone: string | null,
  extra: Record<string, unknown> = {},
) {
  const response = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Member',
      lastName: memberNo,
      joinedOn: '2020-01-01',
      ...(phone ? { contacts: [{ kind: 'phone', value: phone }] } : {}),
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body as { id: string; memberNo: string };
}

async function assignShepherd(officerMemberNo: string, memberNo: string) {
  const response = await request(harness.app)
    .post('/v1/shepherding/assignments')
    .set(writeHeaders)
    .send({ officerMemberNo, memberNo, assignedOn: '2020-01-01' });
  expect(response.status).toBe(201);
}

async function createEvent(name: string, date: string, extra: Record<string, unknown> = {}) {
  eventSeq += 1;
  const response = await request(harness.app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo: `USSD-ATT-${eventSeq}`,
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

async function attend(eventId: string, memberNo: string, date: string) {
  const response = await request(harness.app)
    .post(`/v1/events/${eventId}/attendance`)
    .set(writeHeaders)
    .send({ memberNo, date });
  expect(response.status).toBe(201);
}

async function issueCode(eventId: string, sessionDate: string, purpose: string) {
  const response = await request(harness.app)
    .post(`/v1/events/${eventId}/codes`)
    .set(writeHeaders)
    .send({ sessionDate, purpose });
  expect(response.status).toBe(201);
  return response.body as { id: string; code: string };
}

async function recordExpected(male: number, female: number, children: number) {
  const response = await request(harness.app)
    .put(`/v1/events/${headcountEventId}/expected`)
    .query({ sessionDate: tomorrow })
    .set(writeHeaders)
    .send({ male, female, children });
  expect(response.status).toBe(200);
}

async function createOffering(name: string) {
  const response = await request(harness.app)
    .post('/v1/offerings')
    .set(writeHeaders)
    .send({
      name,
      purpose: `${name} purpose`,
      kind: 'freewill',
      currency: 'GHS',
      availableUntil: '2999-12-31',
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function attach(eventId: string, offering: string) {
  const response = await request(harness.app)
    .post(`/v1/events/${eventId}/offerings`)
    .set(writeHeaders)
    .send({ offeringId: offering });
  expect(response.status).toBe(201);
}

beforeAll(async () => {
  harness = await createTestApp({
    ussd: { gatewaySecret: USSD_SECRET, phonePepper: USSD_PHONE_PEPPER },
  });

  today = new Date().toISOString().slice(0, 10);
  yesterday = shiftDate(today, -1);
  tomorrow = shiftDate(today, 1);

  await createMember('UA-MAIN', '0801 000 0001', {
    firstName: 'Main',
    lastName: 'Member',
    gender: 'female',
  });
  const year = Number(today.slice(0, 4));
  await createMember('UA-PROFILE', '0802 000 0002', {
    firstName: 'Ama',
    lastName: 'Mensah',
    gender: 'female',
    dob: `${year - 32}-01-01`,
    ministries: ['CHOIR', 'PRAYER'],
  });
  await createMember('UA-EMPTY', '0803 000 0003', {
    firstName: 'New',
    lastName: 'Member',
    joinedOn: tomorrow,
  });
  await createMember('UA-PUNCH', '0804 000 0004', { firstName: 'Punch', lastName: 'Member' });
  await createMember('UA-WRONG', '0805 000 0005', { firstName: 'Wrong', lastName: 'Member' });
  await createMember('UA-EXPIRED', '0806 000 0006', { firstName: 'Expired', lastName: 'Member' });
  await createMember('UA-SHEPHERD', '0807 000 0007', {
    firstName: 'Grace',
    lastName: 'Okafor',
    gender: 'female',
    isPresbyter: true,
    dob: `${year - 40}-02-10`,
  });
  await createMember('UA-SENIOR', '0808 000 0008', {
    firstName: 'Senior',
    lastName: 'Presbyter',
    isPresbyter: true,
    presbyterRank: 1,
  });
  await createMember('UA-SENIOR2', '0809 000 0009', {
    firstName: 'Senior2',
    lastName: 'Present',
    isPresbyter: true,
    presbyterRank: 2,
  });
  await createMember('UA-DELEGATE', '0810 000 0010', {
    firstName: 'Delegate',
    lastName: 'Presbyter',
    isPresbyter: true,
  });
  await createMember('UA-SHEEP', '0811 000 0011', { firstName: 'Sheep', lastName: 'Member' });
  await createMember('UA-OTHER', '0812 000 0012', { firstName: 'Other', lastName: 'Member' });
  await createMember('UA-TARGET', '0813 000 0013', { firstName: 'Target', lastName: 'Member' });
  await createMember('UA-TARGET2', '0814 000 0014', { firstName: 'Target2', lastName: 'Other' });
  await createMember('UA-CLOCK3', '0815 000 0015', {
    firstName: 'Clock',
    lastName: 'Three',
    isPresbyter: true,
  });
  await createMember('UA-GIVE', '0816 000 0016', { firstName: 'Give', lastName: 'Member' });
  await createMember('UA-ACT', '0817 000 0017', { firstName: 'Act', lastName: 'Member' });
  await createMember('UA-DATE', '0818 000 0018', { firstName: 'Date', lastName: 'Member' });

  await assignShepherd('UA-SHEPHERD', 'UA-PROFILE');
  await assignShepherd('UA-SHEPHERD', 'UA-SHEEP');

  mainEventId = await createEvent('Sunday Celebration', today);
  pastEventId = await createEvent('Past Gathering', yesterday);
  headcountEventId = await createEvent('Rally', tomorrow, { tracksMembers: false });
  await recordExpected(20, 30, 40);

  const profileEventIds: string[] = [];
  for (let offset = 60; offset >= 56; offset -= 1) {
    profileEventIds.push(await createEvent(`Profile Day ${offset}`, shiftDate(today, -offset)));
  }

  await attend(mainEventId, 'UA-MAIN', today);
  await attend(pastEventId, 'UA-MAIN', yesterday);
  await attend(mainEventId, 'UA-PROFILE', today);
  await attend(pastEventId, 'UA-PROFILE', yesterday);
  for (const id of profileEventIds) {
    const date = (
      await harness.db.query<{ session_date: string }>(
        `select (s->>'date') as session_date
           from event_instances e, jsonb_array_elements(e.sessions) s
          where e.id = $1`,
        [id],
      )
    )[0]!.session_date;
    await attend(id, 'UA-PROFILE', date);
  }

  await attend(mainEventId, 'UA-SENIOR2', today);

  offeringId = await createOffering('Welfare Fund');
  await attach(mainEventId, offeringId);
});

afterAll(async () => {
  await harness.close();
});

describe('USSD attendance, codes and clocking', () => {
  it('opens today’s activities, the week and an event, and gives from the event', async () => {
    const phone = '0817 000 0017';
    const ip = '10.20.1.1';
    const started = await start(phone, ip);
    const sessionId = started.body.sessionId as string;

    const todayList = await frame(sessionId, phone, '2', 2, ip);
    expect(todayList.body.state).toBe('activities');
    expect(todayList.body.text).toContain('Today');
    expect(todayList.body.text).toContain('1 Sunday Celebration');
    expect(todayList.body.text).toContain('0 More');
    expect(todayList.body.text).toContain('8 Date');

    const event = await frame(sessionId, phone, '1', 3, ip);
    expect(event.body.state).toBe('activities.event');
    expect(event.body.text).toContain('Sunday Celebration');
    expect(event.body.text).toContain('1 Give');
    expect(event.body.text).toContain('2 Attendance');

    const back = await frame(sessionId, phone, '9', 4, ip);
    expect(back.body.state).toBe('activities');
    const week = await frame(sessionId, phone, '0', 5, ip);
    expect(week.body.state).toBe('activities.week');
    expect(week.body.text).toContain('This week');
    expect(week.body.text).toContain('Rally (90)');

    const give = await frame(sessionId, phone, '1', 6, ip);
    expect(give.body.state).toBe('activities.event');
    const amount = await frame(sessionId, phone, '1', 7, ip);
    expect(amount.body.state).toBe('offerings.amount');
    const select = await frame(sessionId, phone, '50', 8, ip);
    expect(select.body.state).toBe('offerings.select');
    expect(select.body.text).toContain('Welfare Fund');
    const confirm = await frame(sessionId, phone, '1', 9, ip);
    expect(confirm.body.text).toContain('You give GHS 50.00 to Welfare Fund.');
    const accepted = await frame(sessionId, phone, '1', 10, ip);
    expect(accepted.body.done).toBe(true);
    expect(accepted.body.text).toMatch(/Ref MR-[A-Z2-7]{10}/);
  });

  it('accepts a past date for activities and shows the event attendance status', async () => {
    const phone = '0818 000 0018';
    const ip = '10.20.2.1';
    const started = await start(phone, ip);
    const sessionId = started.body.sessionId as string;

    await frame(sessionId, phone, '2', 2, ip);
    const prompt = await frame(sessionId, phone, '8', 3, ip);
    expect(prompt.body.state).toBe('activities.date');
    expect(prompt.body.text).toContain('Date (DDMMYYYY)');

    const list = await frame(sessionId, phone, ddmmyyyy(yesterday), 4, ip);
    expect(list.body.state).toBe('activities');
    expect(list.body.text).toContain('Past Gathering');

    const event = await frame(sessionId, phone, '1', 5, ip);
    expect(event.body.state).toBe('activities.event');
    const attendance = await frame(sessionId, phone, '2', 6, ip);
    expect(attendance.body.state).toBe('attendance.event');
    expect(attendance.body.text).toContain('Past Gathering');
    expect(attendance.body.text).toContain('Present 0 Expected 1');
    expect(attendance.body.text).toContain('Date Member');
    expect(attendance.body.text).toContain('1 Present');
  });

  it('shows today, a day and a period on the attendance screen', async () => {
    const phone = '0801 000 0001';
    const ip = '10.20.3.1';
    const started = await start(phone, ip);
    const sessionId = started.body.sessionId as string;

    const todayStatus = await frame(sessionId, phone, '3', 2, ip);
    expect(todayStatus.body.state).toBe('attendance');
    expect(todayStatus.body.text).toContain('Present 1 Expected 1');
    expect(todayStatus.body.text).toContain('Sunday Celebration');
    expect(todayStatus.body.text).toContain('1 Day');
    expect(todayStatus.body.text).toContain('2 Period');
    expect(todayStatus.body.text).toContain('3 Present');
    expect(todayStatus.body.text).not.toContain('4 Clock');

    const dayPrompt = await frame(sessionId, phone, '1', 3, ip);
    expect(dayPrompt.body.state).toBe('attendance.day');
    const day = await frame(sessionId, phone, ddmmyyyy(yesterday), 4, ip);
    expect(day.body.state).toBe('attendance.status');
    expect(day.body.text).toContain('Present 1 Expected 1');
    expect(day.body.text).toContain('Past Gathering');

    const back = await frame(sessionId, phone, '9', 5, ip);
    expect(back.body.state).toBe('attendance');
    const period = await frame(sessionId, phone, '2', 6, ip);
    expect(period.body.state).toBe('attendance.period');
    expect(period.body.text).toContain('1 Month');
    expect(period.body.text).toContain('2 Quarter');
    expect(period.body.text).toContain('3 Year');

    const year = await frame(sessionId, phone, '3', 7, ip);
    expect(year.body.state).toBe('attendance.status');
    expect(year.body.text).toContain('Present 2');

    const home = await frame(sessionId, phone, '9', 8, ip);
    expect(home.body.state).toBe('attendance');
    const denied = await frame(sessionId, phone, '4', 9, ip);
    expect(denied.body.state).toBe('error');
    expect(denied.body.text).toContain('Not senior');
  });

  it('shows no attendance for a member with no held sessions and the profile label', async () => {
    const emptyPhone = '0803 000 0003';
    const emptyIp = '10.20.4.1';
    const empty = await start(emptyPhone, emptyIp);
    const emptySession = empty.body.sessionId as string;
    const attendance = await frame(emptySession, emptyPhone, '3', 2, emptyIp);
    expect(attendance.body.state).toBe('attendance');
    expect(attendance.body.text).toContain('No attendance');

    const phone = '0802 000 0002';
    const ip = '10.20.4.2';
    const started = await start(phone, ip);
    const sessionId = started.body.sessionId as string;
    const profile = await frame(sessionId, phone, '5', 2, ip);
    expect(profile.body.state).toBe('profile');
    expect(profile.body.text).toContain('Ama Mensah (Female, 32y)');
    expect(profile.body.text).toContain('Member no. UA-PROFILE');
    expect(profile.body.text).toContain('Ministries');
    expect(profile.body.text).toContain('Choir');
    expect(profile.body.text).toContain('Prayer');
    expect(profile.body.text).toContain('Regular · 5 of 5');
    expect(profile.body.text).toContain('Shepherd Grace Okafor');
  });

  it('redeems an attendance code once and refuses a reused, wrong and expired code', async () => {
    const punch = await issueCode(mainEventId, today, 'attendance_punch');
    const phone = '0804 000 0004';
    const ip = '10.20.5.1';
    const started = await start(phone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(sessionId, phone, '3', 2, ip);
    await frame(sessionId, phone, '3', 3, ip);
    const done = await frame(sessionId, phone, punch.code, 4, ip);
    expect(done.body.state).toBe('attendance.done');
    expect(done.body.done).toBe(true);
    expect(done.body.text).toContain('Recorded');
    expect(done.body.text).toContain('Punch Member');

    const [row] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count
         from attendance a
         join members m on m.id = a.member_id
        where m.member_no = 'UA-PUNCH' and a.event_instance_id = $1 and a.session_date = $2`,
      [mainEventId, today],
    );
    expect(Number(row!.count)).toBe(1);

    const wrongPhone = '0805 000 0005';
    const wrongIp = '10.20.5.2';
    const wrong = await start(wrongPhone, wrongIp);
    const wrongSession = wrong.body.sessionId as string;
    await frame(wrongSession, wrongPhone, '3', 2, wrongIp);
    await frame(wrongSession, wrongPhone, '3', 3, wrongIp);
    const reused = await frame(wrongSession, wrongPhone, punch.code, 4, wrongIp);
    expect(reused.body.state).toBe('attendance.code');
    expect(reused.body.text).toContain('Bad code');

    let wrongCode = reused;
    for (let attempt = 5; attempt <= 9; attempt += 1) {
      wrongCode = await frame(wrongSession, wrongPhone, '000000', attempt, wrongIp);
    }
    expect(wrongCode.body.state).toBe('error');
    expect(wrongCode.body.text).toBe('Too many tries');

    const expired = await issueCode(mainEventId, today, 'attendance_punch');
    await harness.db.query(
      `update attendance_codes set expires_at = now() - interval '1 minute' where id = $1`,
      [expired.id],
    );
    const expiredPhone = '0806 000 0006';
    const expiredIp = '10.20.5.3';
    const expiredStart = await start(expiredPhone, expiredIp);
    const expiredSession = expiredStart.body.sessionId as string;
    await frame(expiredSession, expiredPhone, '3', 2, expiredIp);
    await frame(expiredSession, expiredPhone, '3', 3, expiredIp);
    const expiredResult = await frame(expiredSession, expiredPhone, expired.code, 4, expiredIp);
    expect(expiredResult.body.state).toBe('attendance.code');
    expect(expiredResult.body.text).toContain('Bad code');
  });

  it('registers an anonymous caller from a registration code and refuses a reuse', async () => {
    const issued = await issueCode(mainEventId, today, 'registration');
    const phone = '0899 000 2001';
    const ip = '10.20.6.1';
    const started = await start(phone, ip);
    const sessionId = started.body.sessionId as string;
    const main = await frame(sessionId, phone, '1', 2, ip);
    expect(main.body.state).toBe('register.code');
    const code = await frame(sessionId, phone, issued.code, 3, ip);
    expect(code.body.state).toBe('register.first');
    const first = await frame(sessionId, phone, 'Ama', 4, ip);
    expect(first.body.state).toBe('register.last');
    const done = await frame(sessionId, phone, 'Visitor', 5, ip);
    expect(done.body.state).toBe('register.done');
    expect(done.body.done).toBe(true);
    expect(done.body.text).toContain('Registered');
    expect(done.body.text).toMatch(/Ref REG-[A-Z2-7]{6}/);
    const reference = /Ref (REG-[A-Z2-7]{6})/.exec(done.body.text)![1]!;

    const [request] = await harness.db.query<{
      reference: string;
      first_name: string;
      last_name: string;
      phone_hash: string;
      status: string;
      code_id: string;
      event_instance_id: string;
    }>(
      `select reference, first_name, last_name, phone_hash, status, code_id, event_instance_id
         from registration_requests where reference = $1`,
      [reference],
    );
    expect(request).toMatchObject({
      reference,
      first_name: 'Ama',
      last_name: 'Visitor',
      status: 'pending',
      event_instance_id: mainEventId,
    });
    expect(request!.code_id).toBe(issued.id);
    expect(request!.phone_hash).toBe(
      createHmac('sha256', USSD_PHONE_PEPPER).update('8990002001').digest('hex'),
    );

    const againPhone = '0899 000 2002';
    const againIp = '10.20.6.2';
    const again = await start(againPhone, againIp);
    const againSession = again.body.sessionId as string;
    await frame(againSession, againPhone, '1', 2, againIp);
    await frame(againSession, againPhone, issued.code, 3, againIp);
    await frame(againSession, againPhone, 'Other', 4, againIp);
    const reused = await frame(againSession, againPhone, 'Visitor', 5, againIp);
    expect(reused.body.state).toBe('register.last');
    expect(reused.body.text).toContain('Code used');

    const [requests] = await harness.db.query<{ count: number | string }>(
      'select count(*) as count from registration_requests where code_id = $1',
      [issued.id],
    );
    expect(Number(requests!.count)).toBe(1);
  });

  it('clocks a member in as a shepherd and rejects a non-presbyter', async () => {
    const phone = '0807 000 0007';
    const ip = '10.20.7.1';
    const started = await start(phone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(sessionId, phone, '3', 2, ip);
    const menu = await frame(sessionId, phone, '4', 3, ip);
    expect(menu.body.state).toBe('attendance.clocking');
    expect(menu.body.text).toContain('1 Clock in');
    expect(menu.body.text).toContain('2 Expected');
    expect(menu.body.text).toContain('3 Delegate');
    const prompt = await frame(sessionId, phone, '1', 4, ip);
    expect(prompt.body.state).toBe('attendance.clock');
    const done = await frame(sessionId, phone, 'UA-SHEEP', 5, ip);
    expect(done.body.state).toBe('attendance.done');
    expect(done.body.text).toContain('Sheep Member');

    const [row] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count
         from attendance a
         join members m on m.id = a.member_id
        where m.member_no = 'UA-SHEEP' and a.event_instance_id = $1`,
      [mainEventId],
    );
    expect(Number(row!.count)).toBe(1);
  });

  it('lets a present senior clock anyone and makes an absent senior delegate', async () => {
    const presentPhone = '0809 000 0009';
    const presentIp = '10.20.8.1';
    const present = await start(presentPhone, presentIp);
    const presentSession = present.body.sessionId as string;
    await frame(presentSession, presentPhone, '3', 2, presentIp);
    await frame(presentSession, presentPhone, '4', 3, presentIp);
    await frame(presentSession, presentPhone, '1', 4, presentIp);
    const clocked = await frame(presentSession, presentPhone, 'UA-OTHER', 5, presentIp);
    expect(clocked.body.state).toBe('attendance.done');
    expect(clocked.body.text).toContain('Other Member');

    const absentPhone = '0808 000 0008';
    const absentIp = '10.20.8.2';
    const absent = await start(absentPhone, absentIp);
    const absentSession = absent.body.sessionId as string;
    await frame(absentSession, absentPhone, '3', 2, absentIp);
    await frame(absentSession, absentPhone, '4', 3, absentIp);
    await frame(absentSession, absentPhone, '1', 4, absentIp);
    const blocked = await frame(absentSession, absentPhone, 'UA-TARGET', 5, absentIp);
    expect(blocked.body.state).toBe('attendance.clock');
    expect(blocked.body.text).toContain('Delegate');

    const back = await frame(absentSession, absentPhone, '9', 6, absentIp);
    expect(back.body.state).toBe('attendance.clocking');
    const delegate = await frame(absentSession, absentPhone, '3', 7, absentIp);
    expect(delegate.body.state).toBe('attendance.delegate');
    const person = await frame(absentSession, absentPhone, 'UA-DELEGATE', 8, absentIp);
    expect(person.body.state).toBe('attendance.delegate_reason');
    expect(person.body.text).toContain('Reason');
    const reason = await frame(absentSession, absentPhone, 'I will be late', 9, absentIp);
    expect(reason.body.state).toBe('attendance.done');
    expect(reason.body.text).toContain('Delegate Presbyter');

    const [delegation] = await harness.db.query<{ count: number | string }>(
      `select count(*) as count from clocking_delegations
        where event_instance_id = $1 and session_date = $2`,
      [mainEventId, today],
    );
    expect(Number(delegation!.count)).toBe(1);

    const delegatePhone = '0810 000 0010';
    const delegateIp = '10.20.8.3';
    const delegated = await start(delegatePhone, delegateIp);
    const delegatedSession = delegated.body.sessionId as string;
    await frame(delegatedSession, delegatePhone, '3', 2, delegateIp);
    await frame(delegatedSession, delegatePhone, '4', 3, delegateIp);
    await frame(delegatedSession, delegatePhone, '1', 4, delegateIp);
    const delegatedDone = await frame(delegatedSession, delegatePhone, 'UA-TARGET2', 5, delegateIp);
    expect(delegatedDone.body.state).toBe('attendance.done');
    expect(delegatedDone.body.text).toContain('Target2 Other');
  });

  it('records the expected headcount and restates the buckets', async () => {
    const phone = '0815 000 0015';
    const ip = '10.20.9.1';
    const started = await start(phone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(sessionId, phone, '3', 2, ip);
    await frame(sessionId, phone, '4', 3, ip);
    const prompt = await frame(sessionId, phone, '2', 4, ip);
    expect(prompt.body.state).toBe('attendance.expected');
    expect(prompt.body.text).toContain('Male, Female, Children');
    const done = await frame(sessionId, phone, '20,30,40', 5, ip);
    expect(done.body.state).toBe('attendance.done');
    expect(done.body.text).toContain('20 Male, 30 Female, 40 Children');
    expect(done.body.text).toContain('90 Expected');

    const [row] = await harness.db.query<{
      male: number;
      female: number;
      children: number;
    }>(
      `select male, female, children from event_session_expected
        where event_instance_id = $1 and session_date = $2`,
      [mainEventId, today],
    );
    expect(row).toEqual({ male: 20, female: 30, children: 40 });
  });
});
