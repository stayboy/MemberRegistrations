import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const TOKEN = 'smoke-token-please-change';

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
    'report covers the assignment',
    report.status === 200 &&
      report.body.totals?.assignedMembers === 1 &&
      report.body.totals?.conversations === 1,
    JSON.stringify(report.body?.totals),
  );

  const openapi = await request('/openapi.json');
  check('openapi is served', openapi.status === 200 && openapi.body.info?.version === '2.1.0');
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early (code ${child.exitCode})`);
    try {
      const response = await request('/health');
      if (response.status === 200) return;
    } catch {
      // Not listening yet.
    }
    await delay(200);
  }
  throw new Error('server did not become healthy within 10s');
}

async function request(path, init) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
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
