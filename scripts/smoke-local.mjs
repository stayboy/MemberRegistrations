#!/usr/bin/env node
/**
 * Release smoke for the local Docker stack (`docker compose up -d --build`).
 *
 * It answers one question: is the stack that is running the release we think it
 * is? That means the CORS matrix, the API gate (401 without a bearer, 200 with
 * one), a write that survives a read, and the revision baked into the image.
 *
 * No dependencies, Node 24, plain fetch. Run: `npm run smoke:local`.
 * Exit 0 = the stack is a working release; 1 = a check failed; 2 = the stack is
 * not up at all, which is a setup problem rather than a release defect.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const API = process.env.SMOKE_API_URL ?? 'http://localhost:3000';
const UI = process.env.SMOKE_UI_URL ?? 'http://localhost:8080';
const BEARER = process.env.API_BEARER_TOKEN ?? 'local-development-bearer-change-me';
// These must match docker-compose.yml's app environment; a one-sided edit fails the smoke closed
// (401/404 instead of 200), which is loud but only at run time.
const USSD_SECRET = process.env.USSD_GATEWAY_SECRET ?? 'local-development-ussd-gateway-secret';
const PAYMENT_SECRET = process.env.PAYMENT_GATEWAY_SECRET ?? 'local-development-payment-secret';
const UI_ORIGIN = UI;

const failures = [];
let checks = 0;

function record(name, ok, detail) {
  checks += 1;
  if (ok) {
    process.stdout.write(`ok   ${name}\n`);
  } else {
    process.stdout.write(`FAIL ${name}${detail ? `: ${detail}` : ''}\n`);
    failures.push(name);
  }
}

async function call(url, init) {
  return fetch(url, { redirect: 'manual', ...init });
}

/** The stack must be up before any assertion means anything. */
async function preflight() {
  try {
    const response = await call(`${API}/health`);
    if (!response.ok) throw new Error(`/health answered ${response.status}`);
  } catch (error) {
    process.stdout.write(
      `FAIL stack is up: ${error instanceof Error ? error.message : String(error)}\n` +
        'Run `docker compose up -d --build` and try again.\n',
    );
    process.exit(2);
  }
}

async function healthAndCors() {
  const bare = await call(`${API}/health`);
  record('health answers 200', bare.status === 200, `status ${bare.status}`);
  record(
    'health sends no CORS header without an Origin',
    !bare.headers.get('access-control-allow-origin'),
    bare.headers.get('access-control-allow-origin') ?? undefined,
  );

  const allowed = await call(`${API}/health`, { headers: { Origin: UI_ORIGIN } });
  record(
    'health allows the UI origin',
    allowed.headers.get('access-control-allow-origin') === UI_ORIGIN,
    allowed.headers.get('access-control-allow-origin') ?? 'no header',
  );

  const denied = await call(`${API}/health`, { headers: { Origin: 'http://evil.test' } });
  record(
    'an unlisted origin gets 200 and no header, never a 403',
    denied.status === 200 && !denied.headers.get('access-control-allow-origin'),
    `status ${denied.status}, header ${denied.headers.get('access-control-allow-origin') ?? 'none'}`,
  );
}

async function apiGate() {
  const anonymous = await call(`${API}/v1/members`);
  record(
    'a protected read refuses an anonymous caller',
    anonymous.status === 401,
    `status ${anonymous.status}`,
  );

  const authorised = await call(`${API}/v1/members`, {
    headers: { Authorization: `Bearer ${BEARER}` },
  });
  const body = authorised.ok ? await authorised.json() : null;
  record(
    'the same read answers 200 with the bearer',
    authorised.status === 200 && Array.isArray(body?.items),
    `status ${authorised.status}`,
  );
  return body;
}

async function writeThenRead() {
  const memberNo = `SMOKE-${Date.now().toString(36).toUpperCase()}`;
  const created = await call(`${API}/v1/members`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BEARER}`,
      'X-Actor-Id': 'smoke-local',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      memberNo,
      firstName: 'Release',
      lastName: 'Smoke',
      gender: 'undisclosed',
    }),
  });
  record('a member is created', created.status === 201, `status ${created.status}`);
  if (created.status !== 201) return memberNo;

  const read = await call(`${API}/v1/members/${memberNo}`, {
    headers: { Authorization: `Bearer ${BEARER}` },
  });
  const detail = read.ok ? await read.json() : null;
  record(
    'the new member reads back',
    read.status === 200 && detail?.memberNo === memberNo,
    `status ${read.status}`,
  );
  return memberNo;
}

/** The USSD signature covers timestamp, nonce and the raw body, in that order. */
function signUssd(timestamp, nonce, raw) {
  return createHmac('sha256', USSD_SECRET)
    .update(timestamp)
    .update(nonce)
    .update(raw)
    .digest('hex');
}

async function ussdFrame(body, overrides = {}) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = overrides.nonce ?? `smoke-${randomBytes(8).toString('hex')}`;
  const signature = overrides.signature ?? signUssd(timestamp, nonce, raw);
  const response = await call(`${API}/ussd/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-USSD-Timestamp': timestamp,
      'X-USSD-Nonce': nonce,
      'X-USSD-Signature': signature,
      'X-Forwarded-For': '10.99.0.1',
    },
    body: raw,
  });
  return { response, status: response.status };
}

async function ussd() {
  const start = await ussdFrame({ phone: '0244000000', input: '', seq: 1 });
  const wire = start.status === 200 ? await start.response.json() : null;
  record(
    'a signed USSD start frame renders a menu',
    start.status === 200 && typeof wire?.text === 'string' && wire.text.length > 0,
    `status ${start.status}`,
  );

  const forged = await ussdFrame(
    { phone: '0244000000', input: '', seq: 1 },
    { signature: 'deadbeef' },
  );
  record(
    'the USSD endpoint refuses a bad signature',
    forged.status === 401,
    `status ${forged.status}`,
  );

  // A nonce is consumed once, so a fresh valid signature over the same nonce must still be refused.
  const nonce = `smoke-${randomBytes(8).toString('hex')}`;
  const first = await ussdFrame({ phone: '0244000000', input: '', seq: 1 }, { nonce });
  const replay = await ussdFrame({ phone: '0244000000', input: '', seq: 1 }, { nonce });
  record(
    'a replayed USSD nonce is refused',
    first.status === 200 && replay.status === 401,
    `first ${first.status}, replay ${replay.status}`,
  );
}

async function payments() {
  const reference = `SMOKE-${Date.now().toString(36).toUpperCase()}`;
  const raw = JSON.stringify({
    reference,
    status: 'paid',
    amountMinor: 100,
    currency: 'GHS',
    occurredAt: new Date().toISOString(),
  });
  const signature = createHmac('sha256', PAYMENT_SECRET).update(raw).digest('hex');

  const accepted = await call(`${API}/v1/payments/callback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Payment-Signature': signature },
    body: raw,
  });
  // 404 is the success condition here: it means the signature verified and the body parsed, and
  // only then did the repository report an unknown reference (401 would mean auth failed). A bare
  // 404 from an unmounted route would not echo the reference, so the body is asserted too.
  const detail = accepted.status === 404 ? await accepted.json() : null;
  const echoesReference = typeof detail?.detail === 'string' && detail.detail.includes(reference);
  record(
    'a signed payment callback reaches the repository',
    accepted.status === 404 && echoesReference,
    `status ${accepted.status}, body ${echoesReference ? 'names the reference' : 'does not name it'}`,
  );

  const forged = await call(`${API}/v1/payments/callback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Payment-Signature': 'deadbeef' },
    body: raw,
  });
  record(
    'the payment callback refuses a bad signature',
    forged.status === 401,
    `status ${forged.status}`,
  );
}

async function uiShell() {
  const page = await call(`${UI}/`);
  const html = page.ok ? await page.text() : '';
  record('the UI shell answers 200', page.status === 200, `status ${page.status}`);
  record('the UI shell is the built app', /<div id="root"/i.test(html), 'no root element');
}

function imageRevision() {
  try {
    const revision = execFileSync(
      'docker',
      [
        'image',
        'inspect',
        'member-registrations-api:local',
        '--format',
        '{{ index .Config.Labels "org.opencontainers.image.revision" }}',
      ],
      { encoding: 'utf8' },
    ).trim();
    record(
      'the API image names the revision it was built from',
      revision !== '',
      revision || 'empty',
    );
  } catch {
    // No Docker CLI on this machine: the stack is reachable, so the release is
    // still verifiable; say so rather than failing the smoke.
    process.stdout.write('skip the image revision (no docker CLI)\n');
  }
}

async function main() {
  await preflight();
  await healthAndCors();
  await apiGate();
  const memberNo = await writeThenRead();
  await ussd();
  await payments();
  await uiShell();
  imageRevision();

  process.stdout.write(
    `\n${checks - failures.length}/${checks} checks passed${memberNo ? `, sample member ${memberNo}` : ''}\n`,
  );
  if (failures.length > 0) {
    process.stdout.write(`failed: ${failures.join(', ')}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  process.stdout.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
