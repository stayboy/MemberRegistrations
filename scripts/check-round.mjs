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

// R1: a segment is "<role> <provider>/<model>" with an optional " (<scope>)".
const IMPLEMENTER_SEGMENT_PATTERN = /^(worker|parent)\s+[a-z0-9][a-z0-9._-]*\/\S+(?: \([^)]+\))?$/;
const IMPLEMENTER_ROW_PATTERN = /^\|\s*Implementer\s*\|([^\n]*)\|\s*$/m;
const TIER_ROW_PATTERN = /^\|\s*Tier\s*\|([^\n]*)\|\s*$/m;

// R2: "Tier 2 parent-authored: <reason>" (optionally bulleted) inside ## Deviations,
// with a real reason.
const PARENT_AUTHORED_PATTERN = /^(?:[-*]\s+)?Tier 2 parent-authored:\s*(\S.*)$/;
const PARENT_AUTHORED_MIN_REASON = 20;
const TIER_VALUES = new Set([0, 1, 2]);

// R4: the Tier floor a changed path sets. Tier 2 wins over Tier 1 when both appear.
const TIER2_PATHS = [/^src\/db\/migrations\.ts$/, /^src\/schemas\//, /^src\/authn\//];
const TIER1_PATHS = [/^src\//, /^ui\/src\//];

const PREFIX = 'check-round: ';

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

/**
 * Strips one optional surrounding Markdown code span. A span whose body contains its own
 * delimiter (as in "`a` ; `b`") is left alone, so per-segment spans survive the cell pass.
 */
function stripOneCodeSpan(value) {
  const text = value.trim();
  const match = /^(`+)([\s\S]*)\1$/.exec(text);
  if (!match) return text;
  return match[2].includes(match[1]) ? text : match[2].trim();
}

// README.md documents the shape and review-brief.md is the process brief; neither is a round doc.
function isRoundDoc(path) {
  if (!path.startsWith(ROUND_DIR)) return false;
  if (path === `${ROUND_DIR}README.md` || path === `${ROUND_DIR}review-brief.md`) return false;
  return /^[^/]+\.md$/.test(path.slice(ROUND_DIR.length));
}

function isCodePath(path) {
  return path.startsWith('src/') || path.startsWith('ui/src/');
}

/**
 * The `Tier` row's cell and the number it leads with. The corpus writes `2 - Reviewed` and
 * `1 - Plan`, so only the leading integer is read.
 */
function tierRow(text) {
  const match = TIER_ROW_PATTERN.exec(text);
  if (!match) return { present: false, value: null, cell: '' };
  const cell = match[1].trim();
  const value = /^(\d+)/.exec(cell);
  return { present: true, value: value === null ? null : Number(value[1]), cell };
}

/** The lines under a top-level heading, stopping at the next one. */
function sectionLines(text, heading) {
  const lines = text.split(/\r?\n/);
  const pattern = new RegExp(`^##\\s+${heading}\\s*$`);
  const start = lines.findIndex((line) => pattern.test(line));
  if (start === -1) return [];
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => /^#{1,2}\s/.test(line));
  return end === -1 ? body : body.slice(0, end);
}

const deviationsLines = (text) => sectionLines(text, 'Deviations');

/** The reviewer's seat verdict (R5), the first `Seat:` line in `## Review`. */
function seatVerdict(text) {
  return (
    sectionLines(text, 'Review')
      .map((line) => line.trim())
      .find((line) => /^Seat:/i.test(line)) ?? null
  );
}

function hasParentAuthoredDeviation(text) {
  return deviationsLines(text).some((line) => {
    const match = PARENT_AUTHORED_PATTERN.exec(line.trim());
    return match !== null && match[1].trim().length >= PARENT_AUTHORED_MIN_REASON;
  });
}

/** The highest Tier floor the changed paths demand, naming the first path that sets it. */
function tierFloor(changedPaths) {
  let floor = null;
  for (const path of changedPaths) {
    if (TIER2_PATHS.some((pattern) => pattern.test(path))) return { tier: 2, path };
    if (floor === null && TIER1_PATHS.some((pattern) => pattern.test(path))) {
      floor = { tier: 1, path };
    }
  }
  return floor;
}

/**
 * Pure check: the round docs selected by the change, the full changed-path list (null when there
 * is no diff, as in `--files` mode) and a reader. Returns the failure lines, prefixed for the CLI.
 */
export function checkDocuments(files, changedPaths, readText) {
  const failures = [];
  const fail = (message) => failures.push(`${PREFIX}${message}`);

  // R3: code moved, so a round doc must have been selected. Only with a real changed-file list.
  if (changedPaths !== null && files.length === 0) {
    const code = changedPaths.filter(isCodePath);
    if (code.length > 0) {
      fail(
        `a round doc is required when the change touches src/** or ui/src/** (R3: selected none; touched ${code[0]}${code.length > 1 ? ` and ${code.length - 1} more` : ''})`,
      );
    }
  }

  // R4: the path-derived Tier floor, computed once. It applies to every selected doc.
  const floor = changedPaths === null ? null : tierFloor(changedPaths);

  for (const file of files) {
    let text;
    try {
      text = readText(file);
    } catch {
      fail(`${file}: round doc not found`);
      continue;
    }

    for (const row of REQUIRED_ROWS) {
      const pattern = new RegExp(`^\\|\\s*${escapeRegExp(row)}\\s*\\|`, 'm');
      if (!pattern.test(text)) {
        fail(`${file}: missing round-doc header row "${row}"`);
      }
    }
    if (!SIGNATURE_PATTERN.test(text)) {
      fail(
        `${file}: missing a real gate-run signature line (expected "gate-run <ISO-8601> profile=<name> steps=<n>/<n> lines=<n> bytes=<n>")`,
      );
    }

    // R1: the Implementer row exists and every segment is "<role> <provider>/<model> (<scope>)".
    const implementerMatch = IMPLEMENTER_ROW_PATTERN.exec(text);
    let segments = [];
    if (!implementerMatch) {
      fail(
        `${file}: missing round-doc header row "Implementer" (R1: expected "parent|worker <provider>/<model> (<scope>)", segments separated by ";")`,
      );
    } else {
      // The README template wraps the whole cell in one code span; authors also backtick ids.
      const cell = stripOneCodeSpan(implementerMatch[1]);
      if (cell === '') {
        fail(
          `${file}: the Implementer row is empty (R1: expected "parent|worker <provider>/<model> (<scope>)")`,
        );
      }
      segments = cell === '' ? [] : cell.split(/\s*;\s*/).map(stripOneCodeSpan);
      for (const segment of segments) {
        if (!IMPLEMENTER_SEGMENT_PATTERN.test(segment)) {
          fail(
            `${file}: malformed Implementer segment "${segment}" (R1: each segment is "parent|worker <provider>/<model>" with an optional " (<scope>)")`,
          );
        }
      }
    }

    // R2: Tier 2 needs a worker segment, or a stated parent-authored deviation.
    const tier = tierRow(text);
    if (tier.present && tier.value === null) {
      fail(
        `${file}: the Tier row is "${tier.cell}", which has no leading number (R2: expected 0, 1 or 2)`,
      );
    }
    if (tier.value !== null && !TIER_VALUES.has(tier.value)) {
      fail(
        `${file}: the Tier row is "${tier.cell}", whose value ${tier.value} is not 0, 1 or 2 (R2: expected 0, 1 or 2)`,
      );
    }
    if (tier.value === 2) {
      const hasWorker = segments.some((segment) => segment.startsWith('worker '));
      if (!hasWorker && !hasParentAuthoredDeviation(text)) {
        fail(
          `${file}: Tier 2 needs a "worker <provider>/<model>" Implementer segment or a "## Deviations" line "Tier 2 parent-authored: <reason>" of at least ${PARENT_AUTHORED_MIN_REASON} characters (R2)`,
        );
      }
    }

    // R5: a Tier 2 round records the reviewer's seat verdict in "## Review".
    if (tier.value === 2) {
      const seat = seatVerdict(text);
      if (seat === null) {
        fail(
          `${file}: Tier 2 needs a "Seat: consistent" line in "## Review" (R5: the reviewer's verdict on the Implementer row)`,
        );
      } else if (/contradicted/i.test(seat)) {
        fail(`${file}: the Seat line records "contradicted"; a contradicted seat is REWORK (R5)`);
      }
    }

    // R4: the Tier row cannot sit below the floor its own change sets.
    if (floor !== null && tier.value !== null && tier.value < floor.tier) {
      fail(
        `${file}: Tier ${tier.value} is below the floor set by ${floor.path} (R4: Tier >= ${floor.tier} required)`,
      );
    }
  }

  return failures;
}

function run(argv) {
  const supplied = filesFromArgs(argv);
  // In `--files` mode the caller names the documents and there is no diff to consult.
  const changedPaths =
    supplied === null ? changedFiles().map((path) => path.replaceAll('\\', '/')) : null;
  const files = (supplied ?? changedPaths)
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.md'))
    .filter(isRoundDoc);

  const failures = checkDocuments(files, changedPaths, (file) =>
    readFileSync(join(repoRoot, file), 'utf8'),
  );

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log(`check-round: ok (${files.length} round doc${files.length === 1 ? '' : 's'})`);
}

// Importing this module (the meta test does) must not run the guard.
// Windows paths are case-insensitive, so the entry point is compared the same way there.
const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.platform === 'win32'
    ? resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
    : resolve(process.argv[1]) === fileURLToPath(import.meta.url));

if (invokedDirectly) run(process.argv.slice(2));
