#!/usr/bin/env node
// check-round — the round-doc gate. Modes:
//   (default)   the change set from `origin/main...HEAD` (two-ref fallback for a shallow clone)
//   --staged    `git diff --cached --name-only --diff-filter=ACM`, for the pre-commit hook
//   --files ... an explicit document list; there is no diff, so the path-derived rules (R4, R6) skip
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
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

// R6: a change under ui/src/ is a surface change, so the round doc must carry a resolving sign-off
// row and the catalogue's coverage line. R6 never reads a mock image: mocks are git-ignored today.
// A test or a test helper under ui/src is not a surface: it ships no rendered output, so requiring a
// mock sign-off for one would be a false positive that invites a fake row (owner, 2026-11-13).
const UI_SRC_PATTERN = /^ui\/src\//;
const UI_SRC_NON_SURFACE = [
  /^ui\/src\/test\//,
  /\.test\.tsx?$/,
  /\.dom\.test\.tsx$/,
  /\.stories\.tsx?$/,
];
const CATALOGUE_DIR = 'documents/mock-claims/';
const MOCK_ROW_PATTERN = /mockups\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+\.png)/g;
const MOCK_COVERAGE_PATTERN =
  /^\s*(?:[-*]\s+)?Mock coverage: claimed \d+ .* e2e-only \d+ .* deferred \d+ .* prose \d+/m;
const GIT_STAGED_ARGS = ['diff', '--cached', '--name-only', '--diff-filter=ACM'];

const PREFIX = 'check-round: ';

const defaultExecGit = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

/** Split `git ... --name-only` output into paths; CRLF and blank lines are tolerated. */
export function parseNameOnly(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The staged change set, for the pre-commit hook. `execGit` is injectable so tests never shell out. */
export function stagedChangedPaths(execGit = defaultExecGit) {
  return parseNameOnly(execGit(GIT_STAGED_ARGS));
}

function changedFiles() {
  const ranges = [
    ['diff', '--name-only', '--diff-filter=ACM', 'origin/main...HEAD'],
    // A shallow clone has no merge base, so fall back to the plain two-ref diff.
    ['diff', '--name-only', '--diff-filter=ACM', 'origin/main', 'HEAD'],
  ];
  let lastError;
  for (const args of ranges) {
    try {
      return parseNameOnly(defaultExecGit(args));
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

/** The catalogue set names under documents/mock-claims/; [] when the directory does not exist. */
function catalogueNames() {
  try {
    return readdirSync(join(repoRoot, 'documents', 'mock-claims'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
  } catch {
    return [];
  }
}

/** The `mockups/<set>/<state>.png` paths a `## Mock sign-off` row names, with that row's text. */
function mockSignOffRows(text) {
  const rows = [];
  for (const line of sectionLines(text, 'Mock sign-off')) {
    for (const match of line.matchAll(MOCK_ROW_PATTERN)) {
      rows.push({ path: `mockups/${match[1]}/${match[2]}`, line });
    }
  }
  return rows;
}

/** A catalogue file as JSON, or null when it is missing or not an object. */
function readCatalogue(readText, file) {
  try {
    const parsed = JSON.parse(readText(file));
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * R6: a round that changes ui/src/** must carry a `## Mock sign-off` row naming a mock image whose
 * catalogue state is `signed`, plus the coverage line the generator prints. The mock file is never
 * read — mocks are git-ignored, so the row proves the sign-off and the catalogue, not the pixels.
 */
function checkMockSignOff(label, text, readText, listCatalogues, fail) {
  const catalogues = listCatalogues === null ? null : listCatalogues();
  if (catalogues !== null && catalogues.length === 0) {
    fail(
      `${label}: the change touches ui/src/ but ${CATALOGUE_DIR} holds no claim catalogue (R6: a surface change with no catalogue)`,
    );
    return;
  }
  if (sectionLines(text, 'Mock sign-off').length === 0) {
    fail(
      `${label}: a change under ui/src/ needs a "## Mock sign-off" section with a row naming "mockups/<set>/<state>.png", the state marked "signed", plus the "Mock coverage:" line (R6)`,
    );
    return;
  }
  const rows = mockSignOffRows(text);
  if (rows.length === 0) {
    fail(`${label}: "## Mock sign-off" has no row naming "mockups/<set>/<state>.png" (R6)`);
  }
  for (const row of rows) {
    const set = row.path.split('/')[1];
    const catalogueFile = `${CATALOGUE_DIR}${set}.json`;
    const catalogue = readCatalogue(readText, catalogueFile);
    if (catalogue === null) {
      fail(
        `${label}: the sign-off row names ${row.path}, but ${catalogueFile} does not exist (R6)`,
      );
      continue;
    }
    const states =
      catalogue.states !== null && typeof catalogue.states === 'object' ? catalogue.states : {};
    const hit = Object.entries(states).find(
      ([, state]) =>
        state !== null &&
        typeof state === 'object' &&
        typeof state.mock?.path === 'string' &&
        state.mock.path.replaceAll('\\', '/') === row.path,
    );
    if (hit === undefined) {
      fail(
        `${label}: ${catalogueFile} has no state whose mock.path is ${row.path} (R6: the row must resolve to a state in the catalogue)`,
      );
      continue;
    }
    const [stateName, state] = hit;
    if (state.coverage !== 'signed') {
      fail(
        `${label}: state "${stateName}" in ${catalogueFile} is coverage "${state.coverage}", not "signed" (R6)`,
      );
      continue;
    }
    if (!/\bsigned\b/i.test(row.line)) {
      fail(`${label}: the row for ${row.path} does not mark the state "signed" (R6)`);
    }
  }
  if (!MOCK_COVERAGE_PATTERN.test(text)) {
    fail(
      `${label}: missing the line "Mock coverage: claimed <n> · e2e-only <n> · deferred <n> · prose <n>" (R6; node scripts/round/mock-claims.mjs prints it)`,
    );
  }
}

/**
 * Pure check: the round docs selected by the change, the full changed-path list (null when there
 * is no diff, as in `--files` mode) and a reader. `options.listCatalogues` is the injectable
 * `documents/mock-claims/` listing R6 needs. Returns the failure lines, prefixed for the CLI.
 */
export function checkDocuments(files, changedPaths, readText, options = {}) {
  const failures = [];
  const fail = (message) => failures.push(`${PREFIX}${message}`);
  const listCatalogues =
    typeof options.listCatalogues === 'function' ? options.listCatalogues : null;
  // R6 applies only when the diff shows a surface change; `--files` mode has no diff to read.
  const touchesUiSrc =
    changedPaths !== null &&
    changedPaths.some(
      (path) => UI_SRC_PATTERN.test(path) && !UI_SRC_NON_SURFACE.some((skip) => skip.test(path)),
    );

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

    // R6: a surface change cites the mock it was signed against.
    if (touchesUiSrc) checkMockSignOff(file, text, readText, listCatalogues, fail);
  }

  return failures;
}

function run(argv) {
  const supplied = filesFromArgs(argv);
  const staged = argv.includes('--staged');
  // In `--files` mode the caller names the documents and there is no diff to consult.
  let changedPaths;
  if (supplied !== null) {
    changedPaths = null;
  } else if (staged) {
    try {
      changedPaths = stagedChangedPaths();
    } catch (error) {
      console.error(
        `check-round: could not compute the staged files (${GIT_STAGED_ARGS.join(' ')}):`,
      );
      console.error(String(error?.stderr ?? error?.message).trim());
      process.exit(1);
    }
  } else {
    changedPaths = changedFiles();
  }
  if (changedPaths !== null) changedPaths = changedPaths.map((path) => path.replaceAll('\\', '/'));
  const files = (supplied ?? changedPaths)
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.md'))
    .filter(isRoundDoc);

  const failures = checkDocuments(
    files,
    changedPaths,
    (file) => readFileSync(join(repoRoot, file), 'utf8'),
    { listCatalogues: catalogueNames },
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
