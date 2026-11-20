#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const logDir = join(repoRoot, '.gates');

const MAX_SUCCESS_LINES = 20;
const MAX_SUCCESS_BYTES = 4096;
const MAX_FAILURE_LINES = 40;
const ERROR_BLOCK_LINES = 15;
const TAIL_LINES = 20;
const ERROR_RE = /error|fail|✗|not ok/i;

/**
 * The full gate runs the pooled `pg` lane, which needs a scratch Postgres named by
 * `TEST_DATABASE_URL`. The `fast` and `precommit` profiles deliberately skip that lane
 * so the quick gate and the pre-commit hook stay quick.
 */
export function requiresPooledLane(profile, env = process.env) {
  return profile === 'full' && !env.TEST_DATABASE_URL;
}

/** The one line the terminal and `.gates/test.log` both carry when the lane is missing. */
export const POOLED_LANE_REQUIRED =
  'test ... FAIL: the full gate requires TEST_DATABASE_URL (the pooled pg lane). ' +
  'Set it to a scratch Postgres (never production) or run `npm run verify:fast` for the quick gate.';

const STEP_COMMANDS = {
  'check-round': ['npm', ['run', 'check-round']],
  format: ['npm', ['run', 'format:check']],
  lint: ['npm', ['run', 'lint']],
  typecheck: ['npm', ['run', 'typecheck']],
  skill: ['npm', ['run', 'verify:skill']],
  build: ['npm', ['run', 'build']],
  smoke: ['npm', ['run', 'smoke']],
};

function commandFor(name, profile) {
  if (name === 'test') {
    const args = profile === 'precommit' ? ['--', '--no-file-parallelism'] : [];
    return ['npm', ['run', 'test', ...args]];
  }
  if (name === 'check-round' && profile === 'precommit') {
    return ['npm', ['run', 'check-round', '--', '--staged']];
  }
  const command = STEP_COMMANDS[name];
  if (!command) throw new Error(`unknown gate step: ${name}`);
  return command;
}

function run(line) {
  return new Promise((resolvePromise) => {
    const child = spawn(line, {
      cwd: repoRoot,
      env: process.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => {
      chunks.push(Buffer.from(`${error.message}\n`, 'utf8'));
      resolvePromise({ code: 1, output: Buffer.concat(chunks).toString('utf8') });
    });
    child.on('close', (code) => {
      resolvePromise({ code: code ?? 1, output: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

/** First matching error lines, then the tail, deduplicated in order. */
function failureDetail(output) {
  const lines = output
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());

  const errors = [];
  for (const line of lines) {
    if (errors.length >= ERROR_BLOCK_LINES) break;
    if (ERROR_RE.test(line)) errors.push(line);
  }

  const tail = lines.filter((line) => line.trim() !== '').slice(-TAIL_LINES);
  const detail = [];
  for (const line of [...errors, ...tail]) {
    if (!detail.includes(line)) detail.push(line);
  }
  return detail;
}

function clip(summary, maxLines, maxBytes) {
  const lines = summary.split('\n').slice(0, maxLines);
  const lineBounded = lines.join('\n');
  if (Buffer.byteLength(lineBounded, 'utf8') <= maxBytes) return lineBounded;
  return Buffer.from(lineBounded, 'utf8').subarray(0, maxBytes).toString('utf8');
}

/**
 * Run one named gate, write its full output to `.gates/<name>.log`, and print a
 * bounded summary: one line on success, header plus error block and tail on failure.
 */
export async function runGate(name, { profile = 'fast' } = {}) {
  if (name === 'test' && requiresPooledLane(profile, process.env)) {
    // Skip the child process: run the same failure path with the policy message so the
    // terminal summary and `.gates/test.log` cannot tell different stories.
    const started = Date.now();
    const log = `${POOLED_LANE_REQUIRED}\n`;
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, `${name}.log`);
    writeFileSync(logPath, log, 'utf8');
    process.stdout.write(`${POOLED_LANE_REQUIRED}\n`);
    return {
      name,
      ok: false,
      exitCode: 1,
      durationMs: Date.now() - started,
      logPath,
      logBytes: Buffer.byteLength(log, 'utf8'),
      summary: POOLED_LANE_REQUIRED,
      summaryLines: 1,
    };
  }

  const [command, args] = commandFor(name, profile);
  const started = Date.now();
  const { code, output } = await run([command, ...args].join(' '));
  const ok = code === 0;

  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${name}.log`);
  writeFileSync(logPath, output, 'utf8');
  const logBytes = Buffer.byteLength(output, 'utf8');

  let summary = ok ? `${name} ... PASS` : `${name} ... FAIL (exit ${code})`;
  if (!ok) {
    const detail = failureDetail(output);
    if (detail.length > 0) summary += `\n${detail.join('\n')}`;
  }
  summary = clip(
    summary,
    ok ? MAX_SUCCESS_LINES : MAX_FAILURE_LINES,
    ok ? MAX_SUCCESS_BYTES : Number.MAX_SAFE_INTEGER,
  );

  const summaryLines = summary.split('\n').length;
  process.stdout.write(`${summary}\n`);

  return {
    name,
    ok,
    exitCode: code,
    durationMs: Date.now() - started,
    logPath,
    logBytes,
    summary,
    summaryLines,
  };
}
