#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROUND_DIR = 'documents/rounds/';
const REQUIRED_ROWS = ['Status', 'Tier', 'Base', 'Review rounds', 'Gate runs in parent'];
// The runner emits exactly this shape; a placeholder or a hand-written line does not match.
const SIGNATURE_PATTERN =
  /^gate-run \d{4}-\d{2}-\d{2}T[\d:.]+Z profile=\S+ steps=\d+\/\d+ lines=\d+ bytes=\d+$/m;

function changedFiles() {
  const ranges = [
    ['diff', '--name-only', '--diff-filter=ACM', 'origin/main...HEAD'],
    // A shallow clone has no merge base, so fall back to the plain two-ref diff.
    ['diff', '--name-only', '--diff-filter=ACM', 'origin/main', 'HEAD'],
  ];
  let lastError;
  for (const args of ranges) {
    try {
      return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
        .split(/\r?\n/)
        .filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }
  console.error(`check-round: could not compute the changed files (${ranges[0].join(' ')}):`);
  console.error(String(lastError?.stderr ?? lastError?.message).trim());
  process.exit(1);
}

function filesFromArgs(argv) {
  const index = argv.indexOf('--files');
  if (index === -1) return null;
  return argv.slice(index + 1).filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// README.md documents the shape and review-brief.md is the process brief; neither is a round doc.
function isRoundDoc(path) {
  if (!path.startsWith(ROUND_DIR)) return false;
  if (path === `${ROUND_DIR}README.md` || path === `${ROUND_DIR}review-brief.md`) return false;
  return /^[^/]+\.md$/.test(path.slice(ROUND_DIR.length));
}

const supplied = filesFromArgs(process.argv.slice(2));
const files = (supplied ?? changedFiles())
  .map((path) => path.replaceAll('\\', '/'))
  .filter((path) => path.endsWith('.md'))
  .filter(isRoundDoc);

const failures = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(join(repoRoot, file), 'utf8');
  } catch {
    failures.push(`${file}: round doc not found`);
    continue;
  }

  for (const row of REQUIRED_ROWS) {
    const pattern = new RegExp(`^\\|\\s*${escapeRegExp(row)}\\s*\\|`, 'm');
    if (!pattern.test(text)) {
      failures.push(`${file}: missing round-doc header row "${row}"`);
    }
  }
  if (!SIGNATURE_PATTERN.test(text)) {
    failures.push(
      `${file}: missing a real gate-run signature line (expected "gate-run <ISO-8601> profile=<name> steps=<n>/<n> lines=<n> bytes=<n>")`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`check-round: ${failure}`);
  process.exit(1);
}

console.log(`check-round: ok (${files.length} round doc${files.length === 1 ? '' : 's'})`);
