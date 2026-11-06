import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const TOKEN = 'smoke-token-please-change';
const USSD_SECRET = 'dev-only-ussd-gateway-secret';
const PAYMENT_SECRET = 'dev-only-payment-gateway-secret';
const TODAY = new Date().toISOString().slice(0, 10);
let ussdNonce = 0;

if (!existsSync('dist/index.js')) {
  console.error('dist/index.js is missing; run `npm run build` first');
  process.exit(1);
}

const port = await freePort();
const child = spawn(process.execPath, ['dist/index.js'], {
  env: {
    ...withoutDatabaseUrl(process.env),
    NODE_ENV: 'development',
    PORT: String(port),
    API_BEARER_TOKEN: TOKEN,
    LOG_LEVEL: 'silent',
    USSD_ENABLED: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

let failed = false;
try {
  await waitForHealth();
  await runScenario();
  console.log('smoke: PASS');
} catch (error) {
  failed = true;
  console.error(`smoke: FAIL — ${error.message}`);
  if (output.trim()) console.error(output.trim());
} finally {
  child.kill();
}

process.exit(failed ? 1 : 0);

async function runScenario() {
  const write = {
    Authorization: `Bearer ${TOKEN}`,
    'X-Actor-Id': 'smoke',
    'Content-Type': 'application/json',
  };
  const read = { Authorization: `Bearer ${TOKEN}` };

  const unauth = await request('/v1/shepherding/report');
  check('unauthenticated read rejected', unauth.status === 401, `status ${unauth.status}`);

  const presbyter = await request('/v1/members', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      memberNo: 'P-9001',
      firstName: 'Grace',
      lastName: 'Okafor',
      joinedOn: '2026-01-01',
      isPresbyter: true,
    }),
  });
  check('presbyter created', presbyter.status === 201 && presbyter.body.isPresbyter === true);

  const member = await request('/v1/members', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      memberNo: 'M-9002',
      firstName: 'Ama',
      lastName: 'Mensah',
      contacts: [{ kind: 'phone', value: '0801 234 5678' }],
    }),
  });
  check('member created', member.status === 201);

  const pledgeMember = await request('/v1/members', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      memberNo: 'M-9003',
      firstName: 'Kofi',
      lastName: 'Boateng',
      contacts: [{ kind: 'phone', value: '0802 345 6789' }],
    }),
  });
  check('second member created', pledgeMember.status === 201);

  const punchMember = await request('/v1/members', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      memberNo: 'M-9004',
      firstName: 'Akosua',
      lastName: 'Darko',
      contacts: [{ kind: 'phone', value: '0803 456 7890' }],
    }),
  });
  check('punch member created', punchMember.status === 201);

  const assignment = await request('/v1/shepherding/assignments', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      officerMemberNo: 'P-9001',
      memberNo: 'M-9002',
      assignedOn: '2026-01-01',
    }),
  });
  check('assignment created', assignment.status === 201);

  const pledgeAssignment = await request('/v1/shepherding/assignments', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      officerMemberNo: 'P-9001',
      memberNo: 'M-9003',
      assignedOn: '2026-01-01',
    }),
  });
  check('pledge member assigned', pledgeAssignment.status === 201);

  const call = await request(`/v1/shepherding/assignments/${assignment.body.id}/calls`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      calledOn: '2026-01-10',
      outcome: 'reached',
      stillInChurch: 'yes',
      feedback: 'Back at work and in church.',
    }),
  });
  check('call recorded', call.status === 201 && call.body.stillInChurch === 'yes');

  const roster = await request('/v1/shepherding/officers/P-9001/members', { headers: read });
  const entry = roster.body.items?.[0];
  check(
    'roster counts a call',
    roster.status === 200 && entry?.attempts === 1 && entry?.conversations === 1,
    JSON.stringify(roster.body),
  );
  check('roster carries the contact', entry?.contacts?.length === 1);

  const report = await request('/v1/shepherding/report', { headers: read });
  check(
    'report covers the assignments',
    report.status === 200 &&
      report.body.totals?.assignedMembers === 2 &&
      report.body.totals?.conversations === 1,
    JSON.stringify(report.body?.totals),
  );

  const offering = await request('/v1/offerings', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      name: 'Smoke Offering',
      purpose: 'Exercises the offerings migration',
      kind: 'freewill',
      availableUntil: '2999-12-31',
    }),
  });
  check(
    'offering created with terms v1',
    offering.status === 201 && offering.body.terms?.version === 1,
    JSON.stringify(offering.body),
  );

  const published = await request(`/v1/offerings/${offering.body.id}/terms`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      baseVersion: 1,
      name: 'Smoke Offering',
      purpose: 'Published a second terms version',
      kind: 'freewill',
      availableUntil: '2999-12-31',
      reason: 'Smoke test publisher',
    }),
  });
  check('terms version 2 published', published.status === 201 && published.body.version === 2);

  const smokeEvent = await request('/v1/events', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      eventNo: 'SMOKE-9001',
      name: 'Smoke Offering Event',
      startDate: '2999-01-01',
      endDate: '2999-01-01',
      startTime: '09:00',
      venueType: 'auditorium',
      sessions: [{ date: '2999-01-01', startTime: '09:00' }],
    }),
  });
  check(
    'smoke event created',
    smokeEvent.status === 201 && Boolean(smokeEvent.body.id),
    JSON.stringify(smokeEvent.body),
  );

  const attached = await request(`/v1/events/${smokeEvent.body.id}/offerings`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ offeringId: offering.body.id }),
  });
  check('offering attached', attached.status === 201, JSON.stringify(attached.body));

  const todayEvent = await request('/v1/events', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      eventNo: 'SMOKE-TODAY',
      name: 'Smoke Today Event',
      startDate: TODAY,
      endDate: TODAY,
      startTime: '09:00',
      venueType: 'auditorium',
      sessions: [{ date: TODAY, startTime: '09:00' }],
    }),
  });
  check(
    'today event created',
    todayEvent.status === 201 && Boolean(todayEvent.body.id),
    JSON.stringify(todayEvent.body),
  );

  const todayAttached = await request(`/v1/events/${todayEvent.body.id}/offerings`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ offeringId: offering.body.id }),
  });
  check(
    'today offering attached',
    todayAttached.status === 201,
    JSON.stringify(todayAttached.body),
  );

  // Headcount: append, correct, read back the chain, and prove the retired
  // /expected route is gone. The presbyter-only roster is the active presbyters.
  const headcountDate = shiftDate(TODAY, -1);
  const headcountEvent = await request('/v1/events', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      eventNo: 'SMOKE-HEAD',
      name: 'Smoke Headcount Event',
      // Dated yesterday so it never competes with today's giving event.
      startDate: shiftDate(TODAY, -1),
      endDate: shiftDate(TODAY, -1),
      startTime: '09:00',
      venueType: 'auditorium',
      presbyterOnly: true,
      sessions: [{ date: headcountDate, startTime: '09:00' }],
    }),
  });
  check(
    'headcount event created',
    headcountEvent.status === 201,
    JSON.stringify(headcountEvent.body),
  );

  const headcount = await request(`/v1/events/${headcountEvent.body.id}/headcounts`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      sessionDate: headcountDate,
      mode: 'adults',
      adultMale: 20,
      adultFemale: 30,
      asOf: `${headcountDate}T08:00:00.000Z`,
    }),
  });
  check(
    'headcount appended',
    headcount.status === 201 && headcount.body.total === 50 && headcount.body.supersedesId === null,
    JSON.stringify(headcount.body),
  );

  const correctedHeadcount = await request(`/v1/events/${headcountEvent.body.id}/headcounts`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      sessionDate: headcountDate,
      mode: 'adults',
      adultMale: 21,
      adultFemale: 30,
      supersedesId: headcount.body.id,
    }),
  });
  check(
    'headcount correction supersedes and keeps asOf',
    correctedHeadcount.status === 201 &&
      correctedHeadcount.body.asOf === headcount.body.asOf &&
      correctedHeadcount.body.supersedesId === headcount.body.id &&
      correctedHeadcount.body.total === 51,
    JSON.stringify(correctedHeadcount.body),
  );

  const headcountPage = await request(
    `/v1/events/${headcountEvent.body.id}/headcounts?sessionDate=${headcountDate}`,
    { headers: read },
  );
  const supersededHeadcount = headcountPage.body.observations?.find(
    (row) => row.id === headcount.body.id,
  );
  check(
    'headcount list keeps current and the chain',
    headcountPage.status === 200 &&
      headcountPage.body.current?.id === correctedHeadcount.body.id &&
      headcountPage.body.current?.total === 51 &&
      supersededHeadcount?.supersededBy === correctedHeadcount.body.id,
    JSON.stringify(headcountPage.body),
  );

  const retiredExpected = await request(
    `/v1/events/${headcountEvent.body.id}/expected?sessionDate=${headcountDate}`,
    { headers: read },
  );
  check(
    'retired expected route is 404',
    retiredExpected.status === 404,
    JSON.stringify(retiredExpected.body),
  );

  const presbyterReport = await request(
    `/v1/events/${headcountEvent.body.id}/attendance?date=${headcountDate}`,
    { headers: read },
  );
  check(
    'presbyter-only roster counts active presbyters',
    presbyterReport.status === 200 && presbyterReport.body.expected === 1,
    JSON.stringify({ expected: presbyterReport.body?.expected }),
  );

  const exception = await request(
    `/v1/events/${smokeEvent.body.id}/offerings/${offering.body.id}/exceptions`,
    {
      method: 'POST',
      headers: write,
      body: JSON.stringify({ date: '2999-01-01', kind: 'skip', note: 'smoke' }),
    },
  );
  check('offering exception appended', exception.status === 201);

  const eventDetail = await request(`/v1/events/${smokeEvent.body.id}`, { headers: read });
  const attachedOffering = eventDetail.body.offerings?.[0];
  check(
    'event aggregate carries the offering',
    eventDetail.status === 200 &&
      eventDetail.body.offerings?.length === 1 &&
      attachedOffering.name === 'Smoke Offering' &&
      attachedOffering.terms?.version === 2 &&
      attachedOffering.expired === false &&
      attachedOffering.exceptions?.length === 1,
    JSON.stringify(attachedOffering),
  );

  const contribution = await request('/v1/contributions', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      memberNo: 'M-9002',
      offeringId: offering.body.id,
      eventId: smokeEvent.body.id,
      sessionDate: '2999-01-01',
      amountMinor: 5000,
      channel: 'manual',
      idempotencyKey: 'smoke-contribution-1',
    }),
  });
  check(
    'contribution recorded',
    contribution.status === 201 &&
      /^MR-[A-Z2-7]{10}$/.test(contribution.body.reference) &&
      contribution.body.termsVersion === 2,
    JSON.stringify(contribution.body),
  );

  const repeatContribution = await request('/v1/contributions', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      memberNo: 'M-9002',
      offeringId: offering.body.id,
      eventId: smokeEvent.body.id,
      sessionDate: '2999-01-01',
      amountMinor: 5000,
      channel: 'manual',
      idempotencyKey: 'smoke-contribution-1',
    }),
  });
  check(
    'contribution repeat is idempotent',
    repeatContribution.status === 200 &&
      repeatContribution.body.id === contribution.body.id &&
      repeatContribution.body.reference === contribution.body.reference,
    JSON.stringify(repeatContribution.body),
  );

  const contributionSummary = await request(
    '/v1/contributions/summary?from=2999-01-01&to=2999-01-01',
    { headers: read },
  );
  const ghsTotals = contributionSummary.body.items?.find((item) => item.currency === 'GHS');
  check(
    'contribution summary totals',
    contributionSummary.status === 200 &&
      ghsTotals?.memberCount === 1 &&
      ghsTotals?.memberPaidMinor === 5000 &&
      ghsTotals?.visitorCount === 0,
    JSON.stringify(contributionSummary.body),
  );

  const pledge = await request('/v1/pledges', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      memberNo: 'M-9002',
      offeringId: offering.body.id,
      eventId: smokeEvent.body.id,
      amountMinor: 7000,
      expectedOn: '2999-02-01',
      idempotencyKey: 'smoke-pledge-1',
    }),
  });
  check(
    'pledge created with the shepherd as officer',
    pledge.status === 201 &&
      pledge.body.status === 'pending' &&
      pledge.body.followUpOfficerMemberNo === 'P-9001' &&
      pledge.body.termsVersion === 2,
    JSON.stringify(pledge.body),
  );

  const reminder = await request(`/v1/pledges/${pledge.body.id}/reminders`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ scheduledFor: '2999-02-05', channel: 'sms' }),
  });
  check(
    'pledge reminder recorded',
    reminder.status === 201 &&
      reminder.body.status === 'pending' &&
      reminder.body.scheduledFor === '2999-02-05',
    JSON.stringify(reminder.body),
  );

  const honored = await request(`/v1/pledges/${pledge.body.id}/honor`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({}),
  });
  check('pledge honored', honored.status === 200 && honored.body.status === 'honored');

  // USSD starts → gives → accepts, then the signature-verified callback proves
  // the persisted group and intent. A second session pledges.
  const ussdStart = await ussdFrame({ phone: '0801 234 5678', input: '', seq: 1 });
  check(
    'ussd session starts at main',
    ussdStart.status === 200 &&
      ussdStart.body.state === 'main' &&
      ussdStart.body.text.includes('1 Offerings'),
    JSON.stringify(ussdStart.body),
  );
  const ussdSession = ussdStart.body.sessionId;
  let seq = 2;
  const ussdHub = await ussdFrame({
    phone: '0801 234 5678',
    sessionId: ussdSession,
    input: '1',
    seq: seq++,
  });
  check(
    'ussd offerings hub',
    ussdHub.status === 200 && ussdHub.body.state === 'offerings',
    JSON.stringify(ussdHub.body),
  );
  const ussdAmount = await ussdFrame({
    phone: '0801 234 5678',
    sessionId: ussdSession,
    input: '1',
    seq: seq++,
  });
  check(
    'ussd amount prompt',
    ussdAmount.body.state === 'offerings.amount',
    JSON.stringify(ussdAmount.body),
  );
  const ussdSelect = await ussdFrame({
    phone: '0801 234 5678',
    sessionId: ussdSession,
    input: '50',
    seq: seq++,
  });
  check(
    'ussd offering select',
    ussdSelect.body.state === 'offerings.select' && ussdSelect.body.text.includes('Smoke Offering'),
    JSON.stringify(ussdSelect.body),
  );
  const ussdConfirm = await ussdFrame({
    phone: '0801 234 5678',
    sessionId: ussdSession,
    input: '1',
    seq: seq++,
  });
  check(
    'ussd confirm reads in lay terms',
    ussdConfirm.body.state === 'offerings.confirm' &&
      ussdConfirm.body.text.includes('You give GHS 50.00 to Smoke Offering.'),
    JSON.stringify(ussdConfirm.body),
  );
  const ussdAccepted = await ussdFrame({
    phone: '0801 234 5678',
    sessionId: ussdSession,
    input: '1',
    seq,
  });
  check(
    'ussd gift pending with a reference',
    ussdAccepted.body.done === true && /Ref MR-[A-Z2-7]{10}/.test(ussdAccepted.body.text),
    JSON.stringify(ussdAccepted.body),
  );
  const ussdReference = /Ref (MR-[A-Z2-7]{10})/.exec(ussdAccepted.body.text)[1];

  const callbackRaw = JSON.stringify({
    reference: ussdReference,
    status: 'paid',
    amountMinor: 5000,
    currency: 'GHS',
    occurredAt: new Date().toISOString(),
  });
  const callbackSignature = createHmac('sha256', PAYMENT_SECRET).update(callbackRaw).digest('hex');
  const ussdCallback = await request('/v1/payments/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment-Signature': callbackSignature },
    body: callbackRaw,
  });
  check(
    'ussd payment group persisted and payable',
    ussdCallback.status === 200 && ussdCallback.body.status === 'paid',
    JSON.stringify(ussdCallback.body),
  );

  const ussdContributions = await request(
    `/v1/contributions?memberNo=M-9002&eventId=${todayEvent.body.id}`,
    { headers: read },
  );
  const ussdContribution = ussdContributions.body.items?.find((item) => item.channel === 'ussd');
  check(
    'ussd gift persisted',
    ussdContributions.status === 200 &&
      ussdContribution?.amountMinor === 5000 &&
      ussdContribution?.status === 'paid',
    JSON.stringify(ussdContributions.body),
  );

  const pledgeStart = await ussdFrame({ phone: '0802 345 6789', input: '', seq: 1 });
  const pledgeSession = pledgeStart.body.sessionId;
  let pledgeSeq = 2;
  await ussdFrame({
    phone: '0802 345 6789',
    sessionId: pledgeSession,
    input: '1',
    seq: pledgeSeq++,
  });
  const pledgeAction = await ussdFrame({
    phone: '0802 345 6789',
    sessionId: pledgeSession,
    input: '2',
    seq: pledgeSeq++,
  });
  check(
    'ussd pledge amount prompt',
    pledgeAction.body.state === 'offerings.amount',
    JSON.stringify(pledgeAction.body),
  );
  await ussdFrame({
    phone: '0802 345 6789',
    sessionId: pledgeSession,
    input: '70',
    seq: pledgeSeq++,
  });
  const pledgeSelect = await ussdFrame({
    phone: '0802 345 6789',
    sessionId: pledgeSession,
    input: '1',
    seq: pledgeSeq++,
  });
  check(
    'ussd pledge date prompt',
    pledgeSelect.body.state === 'offerings.pledge_date',
    JSON.stringify(pledgeSelect.body),
  );
  const pledgeConfirm = await ussdFrame({
    phone: '0802 345 6789',
    sessionId: pledgeSession,
    input: ddmmyyyy(shiftDate(TODAY, 30)),
    seq: pledgeSeq++,
  });
  check(
    'ussd pledge confirm',
    pledgeConfirm.body.state === 'offerings.pledge_confirm' &&
      pledgeConfirm.body.text.includes('GHS 70.00'),
    JSON.stringify(pledgeConfirm.body),
  );
  const pledgeAccepted = await ussdFrame({
    phone: '0802 345 6789',
    sessionId: pledgeSession,
    input: '1',
    seq: pledgeSeq,
  });
  check(
    'ussd pledge accepted',
    pledgeAccepted.body.done === true && /Ref USSD-[A-F0-9]{10}/.test(pledgeAccepted.body.text),
    JSON.stringify(pledgeAccepted.body),
  );
  const pledgeKey = /Ref (USSD-[A-F0-9]{10})/.exec(pledgeAccepted.body.text)[1];
  const pledges = await request('/v1/pledges?memberNo=M-9003', { headers: read });
  const ussdPledge = pledges.body.items?.find((item) => item.idempotencyKey === pledgeKey);
  check(
    'ussd pledge persisted with the shepherd',
    pledges.status === 200 &&
      ussdPledge?.status === 'pending' &&
      ussdPledge?.amountMinor === 7000 &&
      ussdPledge?.followUpOfficerMemberNo === 'P-9001',
    JSON.stringify(pledges.body),
  );

  // An attendance code issued through the bearer seam, redeemed inside the
  // USSD session, writes the attendance row.
  const punchCode = await request(`/v1/events/${todayEvent.body.id}/codes`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ sessionDate: TODAY, purpose: 'attendance_punch' }),
  });
  check(
    'attendance code issued',
    punchCode.status === 201 && /^\d{6}$/.test(punchCode.body.code),
    JSON.stringify(punchCode.body),
  );

  const punchStart = await ussdFrame({ phone: '0803 456 7890', input: '', seq: 1 });
  const punchSession = punchStart.body.sessionId;
  let punchSeq = 2;
  await ussdFrame({
    phone: '0803 456 7890',
    sessionId: punchSession,
    input: '3',
    seq: punchSeq++,
  });
  const punchPrompt = await ussdFrame({
    phone: '0803 456 7890',
    sessionId: punchSession,
    input: '3',
    seq: punchSeq++,
  });
  check(
    'ussd attendance code prompt',
    punchPrompt.body.state === 'attendance.code',
    JSON.stringify(punchPrompt.body),
  );
  const punched = await ussdFrame({
    phone: '0803 456 7890',
    sessionId: punchSession,
    input: punchCode.body.code,
    seq: punchSeq,
  });
  check(
    'ussd attendance code redeemed',
    punched.body.done === true && punched.body.text.includes('Recorded'),
    JSON.stringify(punched.body),
  );

  const attendanceReport = await request(
    `/v1/events/${todayEvent.body.id}/attendance?date=${TODAY}`,
    { headers: read },
  );
  const attendanceRow = attendanceReport.body.rows?.find((row) => row.memberNo === 'M-9004');
  check(
    'ussd code punch persisted',
    attendanceReport.status === 200 && Boolean(attendanceRow),
    JSON.stringify(attendanceReport.body),
  );

  // A registration code and two names create a pending request; no member row.
  const registrationCode = await request(`/v1/events/${todayEvent.body.id}/codes`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ sessionDate: TODAY, purpose: 'registration' }),
  });
  check(
    'registration code issued',
    registrationCode.status === 201 && /^\d{6}$/.test(registrationCode.body.code),
    JSON.stringify(registrationCode.body),
  );

  const registerStart = await ussdFrame({ phone: '0899 000 0001', input: '', seq: 1 });
  const registerSession = registerStart.body.sessionId;
  let registerSeq = 2;
  const registerEntry = await ussdFrame({
    phone: '0899 000 0001',
    sessionId: registerSession,
    input: '1',
    seq: registerSeq++,
  });
  check(
    'ussd register prompt',
    registerEntry.body.state === 'register.code',
    JSON.stringify(registerEntry.body),
  );
  await ussdFrame({
    phone: '0899 000 0001',
    sessionId: registerSession,
    input: registrationCode.body.code,
    seq: registerSeq++,
  });
  await ussdFrame({
    phone: '0899 000 0001',
    sessionId: registerSession,
    input: 'Yaa',
    seq: registerSeq++,
  });
  const registered = await ussdFrame({
    phone: '0899 000 0001',
    sessionId: registerSession,
    input: 'Asante',
    seq: registerSeq,
  });
  check(
    'ussd registration pending with a reference',
    registered.body.done === true && /Ref REG-[A-Z2-7]{6}/.test(registered.body.text),
    JSON.stringify(registered.body),
  );
  const registrationReference = /Ref (REG-[A-Z2-7]{6})/.exec(registered.body.text)[1];

  const requests = await request(
    `/v1/registration-requests?status=pending&eventId=${todayEvent.body.id}&sessionDate=${TODAY}`,
    { headers: read },
  );
  const requestRow = requests.body.items?.find((item) => item.reference === registrationReference);
  check(
    'ussd registration request persisted',
    requests.status === 200 &&
      requestRow?.firstName === 'Yaa' &&
      requestRow?.lastName === 'Asante' &&
      requestRow?.status === 'pending',
    JSON.stringify(requests.body),
  );

  // Welfare: a product, a member subscription, a renewal, a claim, the card and
  // verification, then the USSD Subscribe and My services flow.
  const welfareProduct = await request('/v1/subscription-products', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      code: 'SMOKE-WELFARE',
      name: 'Smoke Welfare',
      premiumMinor: 3000,
      currency: 'GHS',
      paymentMode: 'member',
      periodMonths: 1,
      covers: 'individual',
    }),
  });
  check(
    'welfare product created',
    welfareProduct.status === 201 && welfareProduct.body.code === 'SMOKE-WELFARE',
    JSON.stringify(welfareProduct.body),
  );

  const welfareMember = await request('/v1/members', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({
      memberNo: 'M-9005',
      firstName: 'Abena',
      lastName: 'Owusu',
      joinedOn: '2020-01-01',
      contacts: [{ kind: 'phone', value: '0804 567 8901' }],
    }),
  });
  check('welfare member created', welfareMember.status === 201);

  const card = await request('/v1/members/M-9005', {
    method: 'PUT',
    headers: write,
    body: JSON.stringify({ membershipCardNo: 'SMOKE-CARD-9005', verified: true }),
  });
  check(
    'card and verification set',
    card.status === 200 &&
      card.body.membershipCardNo === 'SMOKE-CARD-9005' &&
      Boolean(card.body.verifiedAt),
    JSON.stringify(card.body),
  );

  const welfareSubscription = await request('/v1/members/M-9005/subscriptions', {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ productCode: 'SMOKE-WELFARE' }),
  });
  check(
    'welfare subscription created',
    welfareSubscription.status === 201 &&
      welfareSubscription.body.paidBy === 'member' &&
      welfareSubscription.body.periodStart === TODAY,
    JSON.stringify(welfareSubscription.body),
  );

  const renewal = await request(`/v1/subscriptions/${welfareSubscription.body.id}/renew`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({}),
  });
  check(
    'welfare renewal extends the period',
    renewal.status === 200 && renewal.body.periodStart === welfareSubscription.body.periodEnd,
    JSON.stringify(renewal.body),
  );

  const welfareClaim = await request(`/v1/subscriptions/${welfareSubscription.body.id}/claims`, {
    method: 'POST',
    headers: write,
    body: JSON.stringify({ memberNo: 'M-9005', amountMinor: 1000, reason: 'Smoke claim' }),
  });
  check(
    'welfare claim recorded',
    welfareClaim.status === 201 && welfareClaim.body.status === 'pending',
    JSON.stringify(welfareClaim.body),
  );

  const decidedClaim = await request(
    `/v1/subscriptions/${welfareSubscription.body.id}/claims/${welfareClaim.body.id}/decide`,
    {
      method: 'POST',
      headers: write,
      body: JSON.stringify({ status: 'approved', note: 'Smoke approval' }),
    },
  );
  check(
    'welfare claim approved',
    decidedClaim.status === 200 && decidedClaim.body.status === 'approved',
    JSON.stringify(decidedClaim.body),
  );

  const welfareStart = await ussdFrame({ phone: '0804 567 8901', input: '', seq: 1 }, '10.9.0.1');
  check(
    'ussd member menu shows welfare',
    welfareStart.body.text.includes('4 Welfare'),
    JSON.stringify(welfareStart.body),
  );
  const welfareMenu = await ussdFrame(
    { phone: '0804 567 8901', sessionId: welfareStart.body.sessionId, input: '4', seq: 2 },
    '10.9.0.1',
  );
  check(
    'ussd welfare list shows the product',
    welfareMenu.body.state === 'welfare.list' &&
      welfareMenu.body.text.includes('Smoke Welfare') &&
      welfareMenu.body.text.includes('8 My plans'),
    JSON.stringify(welfareMenu.body),
  );
  const welfareDetail = await ussdFrame(
    { phone: '0804 567 8901', sessionId: welfareStart.body.sessionId, input: '1', seq: 3 },
    '10.9.0.1',
  );
  check(
    'ussd welfare product reads in lay terms',
    welfareDetail.body.state === 'welfare.product' &&
      welfareDetail.body.text.includes('Premium GHS 30.00') &&
      welfareDetail.body.text.includes('1 Join'),
    JSON.stringify(welfareDetail.body),
  );
  const welfareConfirm = await ussdFrame(
    { phone: '0804 567 8901', sessionId: welfareStart.body.sessionId, input: '1', seq: 4 },
    '10.9.0.1',
  );
  check(
    'ussd welfare confirm',
    welfareConfirm.body.state === 'welfare.confirm' &&
      welfareConfirm.body.text.includes('1 Accept'),
    JSON.stringify(welfareConfirm.body),
  );
  const welfareDone = await ussdFrame(
    { phone: '0804 567 8901', sessionId: welfareStart.body.sessionId, input: '1', seq: 5 },
    '10.9.0.1',
  );
  check(
    'ussd welfare subscribed with a reference',
    welfareDone.body.done === true &&
      welfareDone.body.state === 'welfare.done' &&
      welfareDone.body.text.includes('Ref ') &&
      welfareDone.body.text.includes('You pay'),
    JSON.stringify(welfareDone.body),
  );

  const servicesStart = await ussdFrame({ phone: '0804 567 8901', input: '', seq: 1 }, '10.9.0.2');
  await ussdFrame(
    { phone: '0804 567 8901', sessionId: servicesStart.body.sessionId, input: '4', seq: 2 },
    '10.9.0.2',
  );
  const services = await ussdFrame(
    { phone: '0804 567 8901', sessionId: servicesStart.body.sessionId, input: '8', seq: 3 },
    '10.9.0.2',
  );
  let servicesText = services.body.text;
  if (services.body.text.includes('0 More')) {
    const moreServices = await ussdFrame(
      { phone: '0804 567 8901', sessionId: servicesStart.body.sessionId, input: '0', seq: 4 },
      '10.9.0.2',
    );
    servicesText += `\n${moreServices.body.text}`;
  }
  check(
    'ussd welfare services shows rows and the claimed total',
    services.body.state === 'welfare.services' &&
      servicesText.includes('Smoke Welfare') &&
      servicesText.includes('You pay') &&
      servicesText.includes('Claimed GHS 10.00'),
    JSON.stringify(services.body),
  );

  const subscriptions = await request('/v1/members/M-9005/subscriptions', { headers: read });
  check(
    'welfare read returns both subscriptions',
    subscriptions.status === 200 &&
      subscriptions.body.items?.length === 2 &&
      subscriptions.body.items.some(
        (item) => item.claimedTotalMinor === 1000 && item.status === 'active',
      ),
    JSON.stringify(subscriptions.body),
  );

  const openapi = await request('/openapi.json');
  check(
    'openapi is served',
    openapi.status === 200 &&
      openapi.body.info?.version === '2.2.0' &&
      Boolean(openapi.body.paths?.['/auth/magic-link']) &&
      Boolean(openapi.body.paths?.['/v1/subscription-products']) &&
      Boolean(openapi.body.paths?.['/ussd/nalo']) &&
      !openapi.body.paths?.['/dev/ussd/session'],
  );

  // The Nalo provider route authenticates on USERID alone and resolves a
  // continuation through its SESSIONID; the dev gateway never leaks a secret.
  const naloSession = `smoke-nalo-${Date.now()}`;
  const naloStart = await request('/ussd/nalo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      USERID: 'NALOTest',
      MSISDN: '0801 777 0001',
      USERDATA: '',
      MSGTYPE: true,
      NETWORK: 'smoke',
      SESSIONID: naloSession,
    }),
  });
  check(
    'nalo route authenticates USERID',
    naloStart.status === 200 &&
      naloStart.body.MSGTYPE === true &&
      typeof naloStart.body.MSG === 'string' &&
      naloStart.body.MSG.includes('1 Register') &&
      !('SESSIONID' in naloStart.body),
    JSON.stringify(naloStart.body),
  );

  const naloDenied = await request('/ussd/nalo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      USERID: 'NotTheClient',
      MSISDN: '0801 777 0002',
      USERDATA: '',
      MSGTYPE: true,
      NETWORK: 'smoke',
      SESSIONID: `smoke-nalo-denied-${Date.now()}`,
    }),
  });
  check(
    'nalo route rejects a wrong USERID',
    naloDenied.status === 401 && naloDenied.body.code === 'unauthorized',
    JSON.stringify(naloDenied.body),
  );

  const devNalo = await request('/dev/ussd/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'nalo', phone: '0801 777 0003', input: '' }),
  });
  check(
    'dev simulator plays the nalo adapter without a secret',
    devNalo.status === 200 &&
      devNalo.body.provider === 'nalo' &&
      devNalo.body.wire?.MSGTYPE === true &&
      !JSON.stringify(devNalo.body).includes(USSD_SECRET),
    JSON.stringify(devNalo.body),
  );

  const devHmac = await request('/dev/ussd/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'hmac', phone: '0801 777 0004', input: '' }),
  });
  check(
    'dev simulator signs the hmac frame server-side without a secret',
    devHmac.status === 200 &&
      devHmac.body.provider === 'hmac' &&
      typeof devHmac.body.wire?.sessionId === 'string' &&
      !JSON.stringify(devHmac.body).includes(USSD_SECRET),
    JSON.stringify(devHmac.body),
  );

  await checkDisabledSwitch();
}

/**
 * The off posture needs its own boot because `USSD_ENABLED` is read once at
 * startup. NODE_ENV=production cannot be smoke-tested here: it requires a real
 * database and email configuration and refuses USSD_ENABLED=true, so the
 * production refusal stays covered by `tests/api/ussd-nalo.test.ts`.
 */
async function checkDisabledSwitch() {
  const disabledPort = await freePort();
  const disabledChild = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...withoutDatabaseUrl(process.env),
      NODE_ENV: 'development',
      PORT: String(disabledPort),
      API_BEARER_TOKEN: TOKEN,
      LOG_LEVEL: 'silent',
      USSD_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let disabledOutput = '';
  disabledChild.stdout.on('data', (chunk) => (disabledOutput += chunk));
  disabledChild.stderr.on('data', (chunk) => (disabledOutput += chunk));
  try {
    await waitForHealthOn(disabledChild, disabledPort);
    const nalo = await requestOn(disabledPort, '/ussd/nalo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ USERID: 'NALOTest', MSISDN: '0801 777 0005', SESSIONID: 'x' }),
    });
    const dev = await requestOn(disabledPort, '/dev/ussd/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'nalo', phone: '0801 777 0005', input: '' }),
    });
    check(
      'disabled switch answers ussd_disabled on both entries',
      nalo.status === 503 &&
        nalo.body.code === 'ussd_disabled' &&
        dev.status === 503 &&
        dev.body.code === 'ussd_disabled',
      `${nalo.status}/${dev.status}`,
    );
  } catch (error) {
    if (disabledOutput.trim()) console.error(disabledOutput.trim());
    throw error;
  } finally {
    disabledChild.kill();
  }
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function ddmmyyyy(iso) {
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
}

function ussdFrame(body, ip) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  ussdNonce += 1;
  const nonce = `smoke-ussd-${String(ussdNonce).padStart(6, '0')}`;
  const signature = createHmac('sha256', USSD_SECRET)
    .update(`${timestamp}${nonce}${raw}`)
    .digest('hex');
  return request('/ussd/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-USSD-Timestamp': timestamp,
      'X-USSD-Nonce': nonce,
      'X-USSD-Signature': signature,
      ...(ip ? { 'X-Forwarded-For': ip } : {}),
    },
    body: raw,
  });
}

async function waitForHealth() {
  await waitForHealthOn(child, port);
}

async function waitForHealthOn(server, serverPort) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`server exited early (code ${server.exitCode})`);
    try {
      const response = await requestOn(serverPort, '/health');
      if (response.status === 200) return;
    } catch {
      // Not listening yet.
    }
    await delay(200);
  }
  throw new Error('server did not become healthy within 10s');
}

function request(path, init) {
  return requestOn(port, path, init);
}

async function requestOn(serverPort, path, init) {
  const response = await fetch(`http://127.0.0.1:${serverPort}${path}`, init);
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep the raw body.
  }
  return { status: response.status, body };
}

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`ok ${label}`);
}

function withoutDatabaseUrl(env) {
  const copy = { ...env };
  delete copy.DATABASE_URL;
  return copy;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const chosen = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(chosen));
    });
  });
}
