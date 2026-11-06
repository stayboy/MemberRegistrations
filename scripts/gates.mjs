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

const STEP_COMMANDS = {
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
