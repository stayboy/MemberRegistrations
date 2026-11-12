#!/usr/bin/env node
import { runGate } from './gates.mjs';

const PROFILES = {
  fast: ['format', 'lint', 'typecheck', 'test'],
  precommit: ['check-round', 'format', 'lint', 'typecheck', 'test'],
  full: ['skill', 'check-round', 'format', 'lint', 'typecheck', 'test', 'build'],
};

const profile = process.argv[2];
if (!profile || !PROFILES[profile]) {
  console.error(`usage: node scripts/verify.mjs <${Object.keys(PROFILES).join('|')}>`);
  process.exit(1);
}

const steps = PROFILES[profile];
let passed = 0;
// `lines` counts the bounded summary lines printed to the terminal; `bytes` counts the full log
// written to .gates/, which is why the two numbers describe different streams.
let lines = 0;
let bytes = 0;
let failureCode = 0;

for (const step of steps) {
  const result = await runGate(step, { profile });
  lines += result.summaryLines;
  bytes += result.logBytes;
  if (!result.ok) {
    failureCode = result.exitCode || 1;
    break;
  }
  passed += 1;
}

const signature = `gate-run ${new Date().toISOString()} profile=${profile} steps=${passed}/${steps.length} lines=${lines} bytes=${bytes}`;
process.stdout.write(`${signature}\n`);
process.exit(passed === steps.length ? 0 : failureCode);
