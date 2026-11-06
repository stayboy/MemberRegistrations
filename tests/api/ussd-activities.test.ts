import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, writeHeaders, type TestApp } from '../helpers/app.js';

const USSD_SECRET = 'test-ussd-gateway-secret-16';
const USSD_PHONE_PEPPER = 'test-ussd-phone-pepper-16';

let harness: TestApp;
let today: string;
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

function signed(body: Record<string, unknown>, ip: string) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `nonce-${String(++nonceSeq).padStart(8, '0')}`;
  const signature = createHmac('sha256', USSD_SECRET)
    .update(`${timestamp}${nonce}${raw}`)
    .digest('hex');
  return request(harness.app)
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
  return signed({ phone, input: '', seq: 1 }, ip);
}

function frame(sessionId: string, phone: string, input: string, seq: number, ip: string) {
  return signed({ phone, sessionId, input, seq }, ip);
}

async function createMember(memberNo: string, phone: string, extra: Record<string, unknown> = {}) {
  const response = await request(harness.app)
    .post('/v1/members')
    .set(writeHeaders)
    .send({
      memberNo,
      firstName: 'Activity',
      lastName: memberNo,
      joinedOn: '2020-01-01',
      contacts: [{ kind: 'phone', value: phone }],
      ...extra,
    });
  expect(response.status).toBe(201);
}

async function createEvent(
  eventNo: string,
  date: string,
  startTime = '10:00',
  extra: Record<string, unknown> = {},
): Promise<string> {
  const response = await request(harness.app)
    .post('/v1/events')
    .set(writeHeaders)
    .send({
      eventNo,
      name: eventNo,
      startDate: date,
      endDate: date,
      startTime,
      venueType: 'auditorium',
      sessions: [{ date }],
      ...extra,
    });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function createMinistryEvent(
  name: string,
  date: string,
  ministryCode: string,
): Promise<string> {
  eventSeq += 1;
  const byday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ]!;
  const series = await request(harness.app)
    .post('/v1/series')
    .set(writeHeaders)
    .send({
      name,
      ministryCode,
      schedule: {
        effectiveFrom: date,
        rrule: `FREQ=WEEKLY;BYDAY=${byday}`,
        endsOn: date,
      },
    });
  expect(series.status).toBe(201);

  const generated = await request(harness.app)
    .post('/v1/events/generate')
    .query({ from: date, to: date })
    .set(writeHeaders);
  expect(generated.status).toBe(200);
  expect(generated.body.created).toBe(1);
  const id = generated.body.eventIds[0] as string;
  const renamed = await request(harness.app)
    .put(`/v1/events/${id}`)
    .set(writeHeaders)
    .send({ name: `${name} ${eventSeq}` });
  expect(renamed.status).toBe(200);
  return id;
}

async function openActivities(phone: string, ip: string, seqBase = 2) {
  const started = await start(phone, ip);
  const sessionId = started.body.sessionId as string;
  return { sessionId, response: await frame(sessionId, phone, '2', seqBase, ip) };
}

const plainPhone = '0840 000 0001';
const choirMemberPhone = '0841 000 0002';
const otherMinistryPhone = '0842 000 0003';
const presbyterPhone = '0843 000 0004';
const anonymousPhone = '0899 000 4444';
const zeroOnePhone = '0844 000 0005';
const zeroTwoPhone = '0845 000 0006';
const zeroThreePhone = '0846 000 0007';
const zeroFourPhone = '0847 000 0008';
const orderPhone = '0848 000 0009';

let choirEventName: string;
let presbyterEventName: string;

beforeAll(async () => {
  harness = await createTestApp({
    ussd: { gatewaySecret: USSD_SECRET, phonePepper: USSD_PHONE_PEPPER },
  });
  today = new Date().toISOString().slice(0, 10);

  await createMember('ACT-PLAIN', plainPhone);
  await createMember('ACT-CHOIR', choirMemberPhone, { ministries: ['CHOIR'] });
  await createMember('ACT-OTHER', otherMinistryPhone, { ministries: ['PRAYER'] });
  await createMember('ACT-PRES', presbyterPhone, {
    isPresbyter: true,
    ministries: ['CHOIR'],
  });
  await createMember('ACT-ZERO1', zeroOnePhone);
  await createMember('ACT-ZERO2', zeroTwoPhone);
  await createMember('ACT-ZERO3', zeroThreePhone);
  await createMember('ACT-ZERO4', zeroFourPhone);
  await createMember('ACT-ORDER', orderPhone);

  choirEventName = 'Choir Meet';
  await createMinistryEvent(choirEventName, today, 'CHOIR');

  presbyterEventName = 'Elders Meet';
  await createEvent('ACT-PRESBYTER', today, '12:00', {
    name: presbyterEventName,
    presbyterOnly: true,
  });

  await createEvent('ACT-GEN-A', today, '09:00', { name: 'General Alpha' });
  await createEvent('ACT-GEN-B', today, '11:00', { name: 'General Beta' });
  await createEvent('ACT-GEN-C', today, '11:00', { name: 'General Gamma' });

  // Start time beats event number: the later-numbered event starts first.
  const orderDate = shiftDate(today, 50);
  await createEvent('ACT-ORDER-Z', orderDate, '08:00', { name: 'Early Z' });
  await createEvent('ACT-ORDER-A', orderDate, '10:00', { name: 'Late A' });

  // Zero-today horizons, far enough from the live fixture to stay isolated.
  const dayOne = shiftDate(today, 101);
  const dayTwo = shiftDate(today, 102);
  await createEvent('ACT-ZA-ONE', dayOne, '09:00', { name: 'Za One' });
  await createEvent('ACT-ZA-TWO', dayOne, '10:00', { name: 'Za Two' });
  await createEvent('ACT-ZA-THREE', dayTwo, '09:00', { name: 'Za Three' });

  await createEvent('ACT-ZB-14', shiftDate(today, 214), '09:00', { name: 'Zb Fourteen' });
  await createEvent('ACT-ZC-15', shiftDate(today, 315), '09:00', { name: 'Zc Fifteen' });
});

afterAll(async () => {
  await harness.close();
});

describe('Activities eligibility and ordering', () => {
  it('shows only general events to a plain member', async () => {
    const { response } = await openActivities(plainPhone, '10.40.1.1');
    expect(response.body.state).toBe('activities');
    expect(response.body.text).toContain('Today');
    expect(response.body.text).toContain('1 General Alpha');
    expect(response.body.text).toContain('2 General Beta');
    expect(response.body.text).toContain('3 General Gamma');
    expect(response.body.text).not.toContain(choirEventName);
    expect(response.body.text).not.toContain(presbyterEventName);
  });

  it('shows a ministry event to its active member and ranks it first', async () => {
    const { response } = await openActivities(choirMemberPhone, '10.40.1.2');
    expect(response.body.state).toBe('activities');
    const lines = response.body.text.split('\n');
    expect(lines[1]).toContain(choirEventName);
    expect(lines[2]).toContain('General Alpha');
    expect(lines[3]).toContain('General Beta');
    expect(lines[4]).toContain('0 More');
    expect(response.body.text).not.toContain('General Gamma');
    expect(response.body.text).not.toContain(presbyterEventName);
  });

  it('does not show another ministry’s event', async () => {
    const { response } = await openActivities(otherMinistryPhone, '10.40.1.3');
    expect(response.body.text).not.toContain(choirEventName);
    expect(response.body.text).toContain('General Alpha');
  });

  it('ranks ministry, then presbyter-only, then general and pages at three', async () => {
    const { sessionId, response } = await openActivities(presbyterPhone, '10.40.1.4');
    expect(response.body.state).toBe('activities');
    const lines = response.body.text.split('\n');
    expect(lines[1]).toContain(choirEventName);
    expect(lines[2]).toContain(presbyterEventName);
    expect(lines[3]).toContain('General Alpha');
    expect(lines[4]).toContain('0 More');
    expect(response.body.text).not.toContain('General Beta');

    const week = await frame(sessionId, presbyterPhone, '0', 3, '10.40.1.4');
    expect(week.body.state).toBe('activities.week');
    expect(week.body.text).toContain('0 More');
    const nextPage = await frame(sessionId, presbyterPhone, '0', 4, '10.40.1.4');
    expect(nextPage.body.text).toContain('General Beta');
  });

  it('orders a same-tier day by start time before event number', async () => {
    const ip = '10.40.1.6';
    const started = await start(orderPhone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(sessionId, orderPhone, '2', 2, ip);
    await frame(sessionId, orderPhone, '8', 3, ip);
    const ordered = await frame(sessionId, orderPhone, ddmmyyyy(shiftDate(today, 50)), 4, ip);
    expect(ordered.body.state).toBe('activities');
    const lines = ordered.body.text.split('\n');
    expect(lines[1]).toContain('Early Z');
    expect(lines[2]).toContain('Late A');
  });

  it('shows general events only to an anonymous caller', async () => {
    const started = await start(anonymousPhone, '10.40.1.5');
    const sessionId = started.body.sessionId as string;
    const response = await frame(sessionId, anonymousPhone, '3', 2, '10.40.1.5');
    expect(response.body.state).toBe('activities');
    expect(response.body.text).toContain('General Alpha');
    expect(response.body.text).toContain('General Beta');
    expect(response.body.text).toContain('General Gamma');
    expect(response.body.text).not.toContain(choirEventName);
    expect(response.body.text).not.toContain(presbyterEventName);
  });
});

describe('Activities zero-today horizon', () => {
  it('names the next day inside the horizon and offers View and This week', async () => {
    const ip = '10.40.2.1';
    const started = await start(zeroOnePhone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(sessionId, zeroOnePhone, '2', 2, ip);
    const datePrompt = await frame(sessionId, zeroOnePhone, '8', 3, ip);
    expect(datePrompt.body.state).toBe('activities.date');
    expect(datePrompt.body.text).toContain('Date (DDMMYYYY)');

    const zero = await frame(sessionId, zeroOnePhone, ddmmyyyy(shiftDate(today, 100)), 4, ip);
    expect(zero.body.state).toBe('activities');
    expect(zero.body.text).toContain('0 events today');
    expect(zero.body.text).toContain('2 events tomorrow');
    expect(zero.body.text).toContain('1 View');
    expect(zero.body.text).toContain('2 This week');

    const week = await frame(sessionId, zeroOnePhone, '2', 5, ip);
    expect(week.body.state).toBe('activities.week');
    expect(week.body.text).toContain('This week');
    expect(week.body.text).toContain('Za One');
    expect(week.body.text).toContain('Za Three');

    const back = await frame(sessionId, zeroOnePhone, '9', 6, ip);
    expect(back.body.state).toBe('activities');
    const viewed = await frame(sessionId, zeroOnePhone, '1', 7, ip);
    expect(viewed.body.state).toBe('activities');
    expect(viewed.body.text).toContain('Za One');
    expect(viewed.body.text).toContain('Za Two');
  });

  it('renders in 14 days at the horizon edge', async () => {
    const ip = '10.40.2.2';
    const started = await start(zeroTwoPhone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(sessionId, zeroTwoPhone, '2', 2, ip);
    await frame(sessionId, zeroTwoPhone, '8', 3, ip);
    const zero = await frame(sessionId, zeroTwoPhone, ddmmyyyy(shiftDate(today, 200)), 4, ip);
    expect(zero.body.text).toContain('0 events today');
    expect(zero.body.text).toContain('1 event in 14 days');
    expect(zero.body.text).toContain('1 View');
  });

  it('says No upcoming events beyond the horizon', async () => {
    const ip = '10.40.2.3';
    const started = await start(zeroThreePhone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(sessionId, zeroThreePhone, '2', 2, ip);
    await frame(sessionId, zeroThreePhone, '8', 3, ip);
    const zero = await frame(sessionId, zeroThreePhone, ddmmyyyy(shiftDate(today, 300)), 4, ip);
    expect(zero.body.text).toContain('0 events today');
    expect(zero.body.text).toContain('No upcoming events');
    expect(zero.body.text).toContain('2 This week');
    expect(zero.body.text).not.toContain('1 View');
  });

  it('shows an empty week with A date and Back', async () => {
    const ip = '10.40.2.4';
    const started = await start(zeroFourPhone, ip);
    const sessionId = started.body.sessionId as string;
    await frame(sessionId, zeroFourPhone, '2', 2, ip);
    await frame(sessionId, zeroFourPhone, '8', 3, ip);
    await frame(sessionId, zeroFourPhone, ddmmyyyy(shiftDate(today, 400)), 4, ip);
    const week = await frame(sessionId, zeroFourPhone, '2', 5, ip);
    expect(week.body.state).toBe('activities.week');
    expect(week.body.text).toContain('0 events this week');
    expect(week.body.text).toContain('1 Date');
    expect(week.body.text).toContain('9 Back');
  });
});
