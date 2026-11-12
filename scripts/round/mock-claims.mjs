#!/usr/bin/env node
// mock-claims — the deterministic half of mock parity.
//
// Spec:  references/mock-parity.md (canonical; the coverage guard) and
//        documents/rounds/mock-claims-guard.md (the schema and the generator contract)
//
// Two jobs, both deterministic:
//   1. selectClaims(catalogue, { states }) turns a set+state selection into the closed claim list
//      `decision-probe.mjs` takes, plus the pairing legend it needs as `--state`.
//   2. validateCatalogue(s) is the schema guard the meta test runs: the citation triple, the
//      dispositions, the absence/state rule and the reverse AC-inventory coverage.
//
// The generator NEVER calls a model, never reads a mock image and never writes a file: it prints the
// probe body and refuses loudly when the selection cannot produce a defensible call.
//
// Usage
//   node scripts/round/mock-claims.mjs --set <name> --states <a,b> [options]
//
// Options
//   --set <name>        the catalogue set, i.e. documents/mock-claims/<name>.json
//   --states <a,b>      the states to score (order is the image order)
//   --catalogue <path>  override the default catalogue path
//   --json              print the probe body ({ claims, state, coverage }) instead of a table; the
//                       probe reads claims and state, and coverage is the line the round doc cites
//   --allow-short       accept fewer than three ABSENT spec controls; the state legend then starts
//                       with `controls: short (<n>)` and the call is advisory-only
//
// Exit codes: 0 emitted · 1 refused (nothing on stdout) · 2 usage or unreadable catalogue.
//
// Load-bearing notes:
//   * Only `assert: "image"` entries are emitted. Role/name/absence checks belong to `e2e` and must
//     not be handed to the model (decision 9); they are counted as skipped in the legend.
//   * A selected state is paired only when it has a baseline. `target` is a hard refusal, and a
//     selection with no paired state is a refusal — there is nothing to compare.
//   * The ≥3 ABSENT floor counts only emitted claims that are both `control: "spec"` and
//     `expect: "ABSENT"`: a mock-only control does not test the false-pass direction.
//   * Decisions 22 and 25: a spec-required entry declares `anchorKind` — "ac" (an AC id in the
//     surface's declared slice) or "prose" (a heading that is not an AC). One prose row claims a
//     requirement once per file+heading and may list several entries, one per state. A `dom`/`e2e`
//     atom declares `target: { mock, build }`, the same atom twice, because the mock's raw HTML and
//     the built Fluent tree do not share a locator. A test is named `path::title` and resolved
//     against that file, so a renamed test fails the guard.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERDICT_CRITERIA = {
  PRESENT: 'The artifact contains it exactly as described.',
  PARTIAL: 'Something similar is present but not as described.',
  ABSENT: 'The artifact does not contain it.',
  UNVERIFIABLE: 'The artifact cannot settle this.',
};

export const VERDICTS = ['PRESENT', 'PARTIAL', 'ABSENT', 'UNVERIFIABLE'];
export const DISPOSITIONS = ['claimed', 'e2e-only', 'deferred'];
export const ABSENCE_WORDS = ['disabled', 'no action', 'not shown', 'nothing is written'];
export const ANCHOR_KINDS = ['ac', 'prose'];

const COVERAGE = ['signed', 'reference', 'target'];
const CLASSES = ['spec-required', 'mock-only'];
const ASSERTS = ['image', 'dom', 'e2e', 'api'];
const TEST_NAME_SHAPE =
  '"<repo-relative path>::<title>" (for example "tests/e2e/headcount.spec.ts::the header is disabled")';

/** A refusal, not a usage error: the call cannot produce a defensible claim list. */
export class ClaimSelectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClaimSelectionError';
  }
}

// --- small text helpers -------------------------------------------------------------------------

/** CRLF→LF only: citations are copied, not reflowed. */
export function normalizeText(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function normalizeLabel(value) {
  return normalizeText(value)
    .replace(/^\uFEFF/, '')
    .replace(/^#+\s*/, '')
    .replace(/^§\s*/, '')
    .replace(/\*\*/g, '')
    .trim()
    .replace(/:$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Every Markdown heading in the text, in order, with its 0-based line index. */
export function parseHeadings(text) {
  const headings = [];
  normalizeText(text)
    .split('\n')
    .forEach((line, lineIndex) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (match) headings.push({ level: match[1].length, text: match[2], line: lineIndex });
    });
  return headings;
}

/** The AC id a heading declares, e.g. `### AC-7a: ...` → `AC-7a`; otherwise null. */
export function acIdOf(heading) {
  const match = /^(AC-\d+[a-z]?)\b/i.exec(heading.text);
  return match ? match[1] : null;
}

/** Lines from a heading to the next heading of the same or a higher level, heading included. */
function sectionText(text, heading, headings) {
  const lines = normalizeText(text).split('\n');
  const next = headings.find((other) => other.line > heading.line && other.level <= heading.level);
  return lines.slice(heading.line, next ? next.line : lines.length).join('\n');
}

/**
 * Resolve a citation anchor to a heading. An anchor is either an AC id (`AC-7a`) or a heading label
 * (`Acceptance Criteria`, `Headcounts`). Returns null when nothing matches, so a typo fails loudly.
 */
export function resolveAnchor(text, anchor) {
  const headings = parseHeadings(text);
  const wanted = normalizeLabel(anchor);
  if (!wanted) return null;
  const wantedAc = /^ac-\d+[a-z]?$/i.test(wanted) ? wanted : null;

  for (const heading of headings) {
    const acId = acIdOf(heading);
    if (wantedAc && acId && acId.toLowerCase() === wantedAc) {
      return { heading, headings, acId, body: sectionText(text, heading, headings) };
    }
  }
  for (const heading of headings) {
    const label = normalizeLabel(heading.text);
    if (label === wanted || label.split(':')[0].trim() === wanted) {
      return {
        heading,
        headings,
        acId: acIdOf(heading),
        body: sectionText(text, heading, headings),
      };
    }
  }
  return null;
}

/** The AC headings inside a declared slice; null when the section is not a heading. */
export function sliceAcs(text, section) {
  const resolved = resolveAnchor(text, section);
  if (resolved === null) return null;
  const end =
    resolved.headings.find(
      (other) => other.line > resolved.heading.line && other.level <= resolved.heading.level,
    )?.line ?? normalizeText(text).split('\n').length;
  return resolved.headings
    .filter((heading) => heading.line >= resolved.heading.line && heading.line < end)
    .map((heading) => ({ id: acIdOf(heading), text: heading.text }))
    .filter((ac) => ac.id !== null);
}

function readMaybe(readText, path) {
  try {
    const value = readText(path);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function keyOf(file, id) {
  return `${file}\u0000${id.toLowerCase()}`;
}

/** A locator: an object carrying at least one non-empty string leaf (role/name, css, text, …). */
function isLocator(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const hasLeaf = (node) => {
    if (typeof node === 'string') return node.trim().length > 0;
    if (typeof node === 'number') return Number.isFinite(node);
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      return Object.values(node).some(hasLeaf);
    }
    return false;
  };
  return Object.keys(value).some((key) => hasLeaf(value[key]));
}

/** Split a `path::title` test name; null when it is not that shape. */
function splitTestName(value) {
  if (typeof value !== 'string') return null;
  const at = value.indexOf('::');
  if (at <= 0) return null;
  const file = value.slice(0, at).trim();
  const title = value.slice(at + 2).trim();
  if (!file || !title) return null;
  return { file, title };
}

/** The entry ids a prose row claims: the plural `entries` plus the singular `entry`. */
function proseRowEntryIds(row) {
  const ids = [];
  if (Array.isArray(row.entries)) {
    for (const id of row.entries) {
      if (typeof id === 'string' && id.trim()) ids.push(id.trim());
    }
  }
  if (typeof row.entry === 'string' && row.entry.trim()) ids.push(row.entry.trim());
  return ids;
}

/**
 * The coverage line (Decision 25). AC rows count by disposition; a prose requirement counts once per
 * file+heading inventory row, not once per entry, so a requirement covering several states is not
 * over-counted. Its own bucket keeps a non-AC requirement in the denominator.
 */
export function coverageLine(catalogue) {
  const counts = { claimed: 0, 'e2e-only': 0, deferred: 0, prose: 0 };
  const inventory = Array.isArray(catalogue?.inventory) ? catalogue.inventory : [];
  for (const block of inventory) {
    for (const row of Array.isArray(block?.acs) ? block.acs : []) {
      if (row === null || typeof row !== 'object') continue;
      if (row.anchorKind === 'prose') {
        counts.prose++;
        continue;
      }
      if (DISPOSITIONS.includes(row.disposition)) counts[row.disposition]++;
    }
  }
  return `Mock coverage: claimed ${counts.claimed} · e2e-only ${counts['e2e-only']} · deferred ${counts.deferred} · prose ${counts.prose}`;
}

// --- the schema guard ---------------------------------------------------------------------------

/**
 * Validate one catalogue against the round-doc schema and its content pins. Pure: every file read
 * goes through `ctx.readText(path)` (returning null when missing), and the backlog text is
 * `ctx.backlogText`. Returns a list of failures; empty means clean.
 */
export function validateCatalogue(catalogue, ctx = {}) {
  const readText = typeof ctx.readText === 'function' ? ctx.readText : () => null;
  const backlogText = typeof ctx.backlogText === 'string' ? normalizeText(ctx.backlogText) : null;
  const failures = [];

  if (catalogue === null || typeof catalogue !== 'object' || Array.isArray(catalogue)) {
    return ['mock-claims: catalogue is not an object'];
  }

  const set =
    typeof catalogue.set === 'string' && catalogue.set.trim() ? catalogue.set.trim() : '(unnamed)';
  const fail = (message) => failures.push(`mock-claims: ${set}: ${message}`);
  if (set === '(unnamed)') fail('set is missing');

  // specs ---------------------------------------------------------------------------------------
  const specs = Array.isArray(catalogue.specs) ? catalogue.specs : [];
  if (!Array.isArray(catalogue.specs) || specs.length === 0) {
    fail('specs must list at least one spec file');
  }
  for (const spec of specs) {
    if (typeof spec !== 'string' || !spec.trim()) fail('specs entries must be file paths');
    else if (readMaybe(readText, spec) === null) fail(`spec file "${spec}" does not exist`);
  }

  // states --------------------------------------------------------------------------------------
  const states =
    catalogue.states !== null &&
    typeof catalogue.states === 'object' &&
    !Array.isArray(catalogue.states)
      ? catalogue.states
      : {};
  if (Object.keys(states).length === 0) fail('states must declare at least one state');
  for (const [name, state] of Object.entries(states)) {
    const where = `state "${name}"`;
    if (!name.trim()) fail('a state has an empty name');
    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      fail(`${where} is not an object`);
      continue;
    }
    if (!COVERAGE.includes(state.coverage)) {
      fail(`${where}: coverage must be signed, reference or target`);
    }
    const mock = state.mock;
    if (mock === null || typeof mock !== 'object' || Array.isArray(mock)) {
      fail(`${where}: mock must carry path and sha256`);
    } else {
      if (typeof mock.path !== 'string' || !mock.path.trim())
        fail(`${where}: mock.path is missing`);
      if (typeof mock.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(mock.sha256)) {
        fail(`${where}: mock.sha256 must be the 64-hex sign-off pin`);
      }
    }
    if (state.baseline !== null && (typeof state.baseline !== 'string' || !state.baseline.trim())) {
      fail(`${where}: baseline must be a file name or null`);
    }
    if (state.coverage === 'target' && state.baseline !== null) {
      fail(`${where}: a target has no baseline to pair`);
    }
  }

  // stories -------------------------------------------------------------------------------------
  const stories = Array.isArray(catalogue.stories) ? catalogue.stories : [];
  if (!Array.isArray(catalogue.stories)) fail('stories must be an array');
  const storyIds = new Set();
  for (const story of stories) {
    if (story === null || typeof story !== 'object' || Array.isArray(story)) {
      fail('a story is not an object');
      continue;
    }
    const id = typeof story.id === 'string' ? story.id.trim() : '';
    if (!id) fail('a story has no id');
    else if (storyIds.has(id.toLowerCase())) fail(`duplicate story id "${id}"`);
    else storyIds.add(id.toLowerCase());
    for (const field of ['as', 'iWant', 'soThat']) {
      if (typeof story[field] !== 'string' || !story[field].trim()) {
        fail(`story "${id || '?'}": ${field} is missing`);
      }
    }
  }

  // surfaces and their declared AC slices -------------------------------------------------------
  const surfaces = Array.isArray(catalogue.surfaces) ? catalogue.surfaces : [];
  if (!Array.isArray(catalogue.surfaces) || surfaces.length === 0) {
    fail('surfaces must declare at least one surface');
  }
  const surfaceIds = new Set();
  const surfaceLabels = new Map();
  const surfacePatterns = new Map();
  const acsBySurface = new Map();
  const coverageSkipped = new Set();
  const allAcs = [];

  for (const surface of surfaces) {
    if (surface === null || typeof surface !== 'object' || Array.isArray(surface)) {
      fail('a surface is not an object');
      continue;
    }
    const id = typeof surface.id === 'string' ? surface.id.trim() : '';
    if (!id) {
      fail('a surface has no id');
      continue;
    }
    if (surfaceIds.has(id.toLowerCase())) fail(`duplicate surface id "${id}"`);
    surfaceIds.add(id.toLowerCase());
    surfaceLabels.set(id.toLowerCase(), id);
    if (typeof surface.route !== 'string' || !surface.route.trim()) {
      fail(`surface "${id}": route is missing`);
    }

    // The denominator is a recorded manual assignment: the surface's patterns select which AC
    // headings in its declared slices it answers for. This is the one author-chosen input.
    const patterns = Array.isArray(surface.acsMatch)
      ? surface.acsMatch
          .map((pattern) => (typeof pattern === 'string' ? pattern.trim() : ''))
          .filter(Boolean)
      : [];
    if (!Array.isArray(surface.acsMatch) || patterns.length === 0) {
      fail(
        `surface "${id}": acsMatch must list at least one pattern over the AC heading text; none was given, so the denominator is not a recorded assignment`,
      );
      coverageSkipped.add(id.toLowerCase());
    }
    surfacePatterns.set(id.toLowerCase(), patterns);
    const compiled = [];
    for (const pattern of patterns) {
      try {
        compiled.push(new RegExp(pattern, 'i'));
      } catch {
        fail(`surface "${id}": acsMatch pattern "${pattern}" is not a valid regular expression`);
      }
    }

    const slices = Array.isArray(surface.spec) ? surface.spec : [];
    if (!Array.isArray(surface.spec) || slices.length === 0) {
      fail(`surface "${id}": spec must declare at least one slice`);
    }
    const acs = [];
    const seen = new Set();
    for (const slice of slices) {
      if (slice === null || typeof slice !== 'object' || Array.isArray(slice)) {
        fail(`surface "${id}": a spec slice is not an object`);
        continue;
      }
      const file = typeof slice.file === 'string' ? slice.file.trim() : '';
      const section = typeof slice.section === 'string' ? slice.section.trim() : '';
      if (!file) {
        fail(`surface "${id}": a spec slice has no file`);
        continue;
      }
      const text = readMaybe(readText, file);
      if (text === null) {
        fail(`surface "${id}": spec file "${file}" does not exist`);
        continue;
      }
      if (!section) {
        fail(`surface "${id}": spec slice for ${file} has no section`);
        continue;
      }
      const found = sliceAcs(text, section);
      if (found === null) {
        fail(`surface "${id}": section "${section}" is not a heading in ${file}`);
        continue;
      }
      if (found.length === 0) {
        fail(
          `surface "${id}": section "${section}" in ${file} has no AC headings; the slice is the denominator`,
        );
        continue;
      }
      for (const ac of found) {
        const key = keyOf(file, ac.id);
        if (seen.has(key)) continue;
        seen.add(key);
        allAcs.push({ surface: id, file, id: ac.id, text: ac.text });
        if (compiled.some((regex) => regex.test(ac.text))) {
          acs.push({ file, id: ac.id, text: ac.text });
        }
      }
    }
    if (patterns.length > 0 && compiled.length > 0 && acs.length === 0) {
      fail(
        `surface "${id}": acsMatch patterns ${patterns.map((pattern) => `"${pattern}"`).join(', ')} select no AC headings in the declared slice`,
      );
      coverageSkipped.add(id.toLowerCase());
    }
    acsBySurface.set(id.toLowerCase(), acs);
  }

  const acsById = new Map();
  for (const ac of allAcs) {
    const id = ac.id.toLowerCase();
    const list = acsById.get(id) ?? [];
    list.push(ac);
    acsById.set(id, list);
  }

  const citationChecks = (citation, where) => {
    if (citation === null || typeof citation !== 'object' || Array.isArray(citation)) {
      fail(`${where}: spec citation is missing`);
      return null;
    }
    const file = typeof citation.file === 'string' ? citation.file.trim() : '';
    if (!file) {
      fail(`${where}: spec.file is missing`);
      return null;
    }
    const text = readMaybe(readText, file);
    if (text === null) {
      fail(`${where}: spec file "${file}" does not exist`);
      return null;
    }
    const anchor = typeof citation.anchor === 'string' ? citation.anchor.trim() : '';
    if (!anchor) {
      fail(`${where}: spec.anchor is missing`);
      return null;
    }
    const resolved = resolveAnchor(text, anchor);
    if (resolved === null) {
      fail(`${where}: anchor "${anchor}" is not a heading or AC id in ${file}`);
      return null;
    }
    const quote = typeof citation.quote === 'string' ? citation.quote.trim() : '';
    if (!quote) {
      fail(`${where}: spec.quote is missing`);
      return null;
    }
    if (!normalizeText(resolved.body).includes(normalizeText(quote))) {
      fail(`${where}: quote does not occur verbatim under "${anchor}" in ${file}`);
    }
    return resolved;
  };

  /** A test name resolves to a real file and an exact title string inside it. */
  const testChecks = (value, where, kind) => {
    const parsed = splitTestName(value);
    if (parsed === null) {
      fail(
        `${where}: ${kind} names its test as ${TEST_NAME_SHAPE}; "${typeof value === 'string' ? value : ''}" does not resolve to a title`,
      );
      return;
    }
    const text = readMaybe(readText, parsed.file);
    if (text === null) {
      fail(`${where}: test file "${parsed.file}" does not exist`);
      return;
    }
    if (!normalizeText(text).includes(normalizeText(parsed.title))) {
      fail(`${where}: title "${parsed.title}" does not occur in ${parsed.file}`);
    }
  };

  for (const story of stories) {
    if (story !== null && typeof story === 'object' && !Array.isArray(story)) {
      const id = typeof story.id === 'string' ? story.id.trim() : '?';
      citationChecks(story.spec, `story "${id}"`);
    }
  }

  // absence/state tripwire ----------------------------------------------------------------------
  const absence = new Map();
  for (const ac of allAcs) {
    const word = ABSENCE_WORDS.find((candidate) => ac.text.toLowerCase().includes(candidate));
    if (word) absence.set(keyOf(ac.file, ac.id), { ...ac, word });
  }
  const absenceFor = (file, id) => {
    if (typeof file === 'string' && file.trim()) {
      return absence.get(keyOf(file.trim(), id)) ?? null;
    }
    return (acsById.get(id.toLowerCase()) ?? [])
      .map((ac) => absence.get(keyOf(ac.file, ac.id)))
      .find(Boolean);
  };

  // entries -------------------------------------------------------------------------------------
  const entries = Array.isArray(catalogue.entries) ? catalogue.entries : [];
  if (!Array.isArray(catalogue.entries)) fail('entries must be an array');
  const entryIds = new Set();
  const entriesById = new Map();
  const reportedAbsence = new Set();

  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('an entry is not an object');
      continue;
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const where = `entry "${id || '?'}"`;
    if (!id) {
      fail('an entry has no id');
    } else if (entryIds.has(id.toLowerCase())) {
      fail(`duplicate entry id "${id}"`);
      continue;
    } else {
      entryIds.add(id.toLowerCase());
      entriesById.set(id.toLowerCase(), entry);
    }

    if (typeof entry.claim !== 'string' || !entry.claim.trim()) fail(`${where}: claim is missing`);
    if (typeof entry.state !== 'string' || !entry.state.trim()) {
      fail(`${where}: state is missing`);
    } else if (!Object.prototype.hasOwnProperty.call(states, entry.state)) {
      fail(`${where}: state "${entry.state}" is not declared`);
    }
    if (typeof entry.story !== 'string' || !entry.story.trim()) {
      fail(`${where}: story is missing`);
    } else if (!storyIds.has(entry.story.toLowerCase())) {
      fail(`${where}: story "${entry.story}" does not resolve`);
    }
    if (!VERDICTS.includes(entry.expect)) {
      fail(`${where}: expect must be one of ${VERDICTS.join(', ')}`);
    }
    if (!CLASSES.includes(entry.class)) {
      fail(`${where}: class must be spec-required or mock-only`);
    }
    if (!ASSERTS.includes(entry.assert)) {
      fail(`${where}: assert must be one of ${ASSERTS.join(', ')}`);
    }
    if (entry.control !== undefined && !['spec', 'absent'].includes(entry.control)) {
      fail(`${where}: control must be "spec" or "absent" when present`);
    }
    if (entry.anchorKind !== undefined && !ANCHOR_KINDS.includes(entry.anchorKind)) {
      fail(`${where}: anchorKind must be "ac" or "prose" when present`);
    }

    // Decision 25: a dom/e2e atom is declared twice — the mock's raw HTML and the built Fluent tree
    // do not share a locator. An image atom is judged by the model and carries none.
    if (entry.assert === 'dom' || entry.assert === 'e2e') {
      const target = entry.target;
      if (target === null || typeof target !== 'object' || Array.isArray(target)) {
        fail(
          `${where}: assert "${entry.assert}" needs target: { mock: <locator>, build: <locator> }`,
        );
      } else {
        if (!isLocator(target.mock))
          fail(`${where}: target.mock must be a non-empty locator object`);
        if (!isLocator(target.build))
          fail(`${where}: target.build must be a non-empty locator object`);
      }
    } else if (entry.assert === 'image' && entry.target !== undefined) {
      fail(`${where}: assert "image" must not carry target (an image atom is judged by the model)`);
    }
    if (entry.assert === 'e2e') {
      if (entry.test === undefined) {
        fail(`${where}: an assert: "e2e" entry must name its test; ${TEST_NAME_SHAPE}`);
      } else {
        testChecks(entry.test, where, 'an assert: "e2e" entry');
      }
    }

    const acIds = Array.isArray(entry.ac) ? entry.ac : [];
    if (entry.ac !== undefined && !Array.isArray(entry.ac)) {
      fail(`${where}: ac must be an array of AC ids`);
    }
    for (const acId of acIds) {
      if (typeof acId !== 'string' || !acId.trim()) {
        fail(`${where}: ac entries must be AC ids`);
        continue;
      }
      const declared = acsById.get(acId.trim().toLowerCase());
      if (!declared || declared.length === 0) {
        fail(`${where}: ac "${acId}" is not in the declared slice`);
        continue;
      }
      const hit = absenceFor(
        typeof entry.spec === 'object' && entry.spec !== null ? entry.spec.file : '',
        acId.trim(),
      );
      if (entry.assert === 'image' && hit) {
        const mark = `${id}|${keyOf(hit.file, hit.id)}`;
        if (!reportedAbsence.has(mark)) {
          reportedAbsence.add(mark);
          fail(
            `absence/state: ${where} claims ${hit.id} as an image, but the clause contains "${hit.word}"; it must be assert: "e2e" (entry or disposition)`,
          );
        }
      }
    }

    if (entry.class === 'spec-required') {
      if (!ANCHOR_KINDS.includes(entry.anchorKind)) {
        fail(
          `${where}: a spec-required entry must carry anchorKind "ac" (an AC id in the declared slice) or "prose" (a heading that is not an AC); it carries ${
            entry.anchorKind === undefined ? 'none' : `"${entry.anchorKind}"`
          }`,
        );
      }
      if (entry.anchorKind === 'prose') {
        if (acIds.length > 0) {
          fail(
            `${where}: a prose-anchored entry must not name an ac; its requirement is a heading, and the inventory's prose row claims it`,
          );
        }
        const resolved = citationChecks(entry.spec, where);
        if (resolved !== null && resolved.acId !== null) {
          fail(
            `${where}: prose anchor "${resolved.acId}" is an AC heading; a prose anchor is a heading that is not an AC`,
          );
        }
      } else if (entry.anchorKind === 'ac') {
        if (acIds.length === 0) fail(`${where}: a spec-required entry must name its ac`);
        citationChecks(entry.spec, where);
      } else if (entry.spec !== undefined) {
        citationChecks(entry.spec, where);
      }
    } else if (entry.spec !== undefined) {
      citationChecks(entry.spec, where);
    }
  }

  // inventory -----------------------------------------------------------------------------------
  const inventory = Array.isArray(catalogue.inventory) ? catalogue.inventory : [];
  if (!Array.isArray(catalogue.inventory)) fail('inventory must be an array');
  const inventoryBySurface = new Map();
  // Prose rows are keyed by file+heading so one requirement is claimed once; `proseClaims` is the
  // set of prose entries an inventory row actually claims (the reverse check below).
  const proseRowKeys = new Set();
  const proseClaims = new Set();
  for (const block of inventory) {
    if (block === null || typeof block !== 'object' || Array.isArray(block)) {
      fail('an inventory block is not an object');
      continue;
    }
    const surfaceId = typeof block.surface === 'string' ? block.surface.trim() : '';
    if (!surfaceId) {
      fail('an inventory block has no surface');
      continue;
    }
    if (!surfaceIds.has(surfaceId.toLowerCase())) {
      fail(`inventory "${surfaceId}": surface is not declared`);
      continue;
    }
    if (inventoryBySurface.has(surfaceId.toLowerCase())) {
      fail(`duplicate inventory block for surface "${surfaceId}"`);
      continue;
    }
    const rows = Array.isArray(block.acs) ? block.acs : [];
    if (!Array.isArray(block.acs)) fail(`inventory "${surfaceId}": acs must be an array`);
    inventoryBySurface.set(surfaceId.toLowerCase(), rows);

    for (const row of rows) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) {
        fail(`inventory "${surfaceId}": a row is not an object`);
        continue;
      }
      const file = typeof row.file === 'string' ? row.file.trim() : '';
      // Decision 22: a prose requirement is not an AC. Its row is bound by a heading anchor, not
      // an id, and a row that resolves to nothing is a failure, not a silent gap.
      const isProse = row.anchorKind === 'prose';
      const anchor = typeof row.anchor === 'string' ? row.anchor.trim() : '';
      const acId = isProse ? '' : typeof row.id === 'string' ? row.id.trim() : '';
      const where = `inventory "${surfaceId}"${
        isProse ? ` prose${anchor ? ` "${anchor}"` : ''}` : acId ? ` ${acId}` : ''
      }`;
      if (!file) fail(`${where}: file is missing`);
      else if (readMaybe(readText, file) === null) fail(`${where}: file "${file}" does not exist`);
      if (row.anchorKind !== undefined && !ANCHOR_KINDS.includes(row.anchorKind)) {
        fail(`${where}: anchorKind must be "prose" when present; an AC row addresses the AC by id`);
      }
      if (isProse) {
        if (row.id !== undefined) fail(`${where}: a prose row carries anchor, not id`);
        if (!anchor) {
          fail(`${where}: anchor is missing; a prose row names the heading it covers`);
        } else {
          const text = readMaybe(readText, file);
          if (text !== null) {
            const resolved = resolveAnchor(text, anchor);
            if (resolved === null) {
              fail(`${where}: anchor "${anchor}" is not a heading in ${file}`);
            } else if (resolved.acId !== null) {
              fail(
                `${where}: anchor "${anchor}" is an AC heading (${resolved.acId}); a prose requirement is not an AC`,
              );
            }
          }
          const proseKey = `${file}\u0000${normalizeLabel(anchor)}`;
          if (proseRowKeys.has(proseKey)) {
            fail(`${where}: this prose requirement is listed more than once`);
          } else {
            proseRowKeys.add(proseKey);
          }
        }
      } else if (!acId) {
        fail(
          `${where}: id is missing; an AC row names its id, a prose row names anchorKind "prose" and an anchor`,
        );
      }
      if (!DISPOSITIONS.includes(row.disposition)) {
        fail(`${where}: disposition must be claimed, e2e-only or deferred`);
        continue;
      }
      if (isProse) {
        // Decision 22: one prose requirement (one file+heading) covers as many state entries as it
        // needs; the row stays unique per file+heading and the entries carry the assertions.
        if (row.entries !== undefined && !Array.isArray(row.entries)) {
          fail(`${where}: entries must be an array of entry ids`);
        }
        const entryIds = proseRowEntryIds(row);
        if (entryIds.length === 0) {
          fail(`${where}: a prose row must name the entry or entries that claim it`);
          continue;
        }
        if (row.disposition !== 'claimed') {
          fail(
            `${where}: a prose row is claimed by its entries, so its disposition cannot be "${row.disposition}"`,
          );
        }
        for (const entryId of entryIds) {
          if (!entriesById.has(entryId.toLowerCase())) {
            fail(`${where}: entry "${entryId}" does not resolve`);
            continue;
          }
          const linked = entriesById.get(entryId.toLowerCase());
          const cited = linked.spec !== null && typeof linked.spec === 'object' ? linked.spec : {};
          const citedFile = typeof cited.file === 'string' ? cited.file.trim() : '';
          const citedAnchor = typeof cited.anchor === 'string' ? cited.anchor.trim() : '';
          if (
            linked.class !== 'spec-required' ||
            linked.anchorKind !== 'prose' ||
            citedFile !== file ||
            normalizeLabel(citedAnchor) !== normalizeLabel(anchor)
          ) {
            fail(
              `${where}: entry "${entryId}" is not a spec-required prose entry citing "${anchor}" in ${file}`,
            );
            continue;
          }
          proseClaims.add(entryId.toLowerCase());
        }
        continue;
      }
      if (row.disposition === 'claimed') {
        const entryId = typeof row.entry === 'string' ? row.entry.trim() : '';
        if (!entryId) {
          fail(`${where}: a claimed row must name its entry`);
        } else if (!entriesById.has(entryId.toLowerCase())) {
          fail(`${where}: entry "${entryId}" does not resolve`);
        } else {
          const linked = entriesById.get(entryId.toLowerCase());
          const hit = absenceFor(file, acId);
          if (linked.assert === 'image' && hit) {
            const mark = `${entryId}|${keyOf(hit.file, hit.id)}`;
            if (!reportedAbsence.has(mark)) {
              reportedAbsence.add(mark);
              fail(
                `absence/state: entry "${entryId}" claims ${hit.id} as an image, but the clause contains "${hit.word}"; it must be assert: "e2e" (entry or disposition)`,
              );
            }
          }
        }
      } else if (row.disposition === 'e2e-only') {
        if (typeof row.test !== 'string' || !row.test.trim()) {
          fail(`${where}: an e2e-only row must name its test`);
        } else {
          testChecks(row.test, where, 'an e2e-only row');
        }
      } else if (row.disposition === 'deferred') {
        const backlog = typeof row.backlog === 'string' ? row.backlog.trim() : '';
        if (!backlog) {
          fail(`${where}: a deferred row must name its backlog anchor`);
        } else if (backlogText === null) {
          fail(`${where}: backlog text was not supplied to the guard`);
        } else if (!backlogText.includes(normalizeText(backlog))) {
          fail(`${where}: backlog anchor "${backlog}" does not occur in documents/backlog.md`);
        }
      }
    }
  }

  // A prose requirement may not merely exist as an entry: its surface's inventory must claim it.
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    if (entry.class !== 'spec-required' || entry.anchorKind !== 'prose') continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) continue;
    if (!proseClaims.has(id.toLowerCase())) {
      fail(
        `prose requirement: entry "${id}" has no claimed prose row in the inventory; a prose requirement may not exist only as an entry`,
      );
    }
  }

  // reverse AC-inventory coverage ---------------------------------------------------------------
  for (const [surfaceId, declared] of acsBySurface) {
    if (coverageSkipped.has(surfaceId)) continue;
    const label = surfaceLabels.get(surfaceId) ?? surfaceId;
    const patternText = (surfacePatterns.get(surfaceId) ?? []).join(', ');
    const rows = inventoryBySurface.get(surfaceId) ?? [];
    const counts = { claimed: 0, 'e2e-only': 0, deferred: 0, prose: 0 };
    const uncited = [];
    const duplicated = [];

    for (const ac of declared) {
      const matches = rows.filter(
        (row) =>
          row !== null &&
          typeof row === 'object' &&
          typeof row.file === 'string' &&
          typeof row.id === 'string' &&
          row.file.trim() === ac.file &&
          row.id.trim().toLowerCase() === ac.id.toLowerCase(),
      );
      if (matches.length === 0) {
        uncited.push(ac.id);
        continue;
      }
      if (matches.length > 1) duplicated.push(ac.id);
      const disposition = matches[0].disposition;
      if (DISPOSITIONS.includes(disposition)) counts[disposition]++;
    }

    const declaredKeys = new Set(declared.map((ac) => keyOf(ac.file, ac.id)));
    const extras = rows.filter(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        typeof row.file === 'string' &&
        typeof row.id === 'string' &&
        !declaredKeys.has(keyOf(row.file.trim(), row.id.trim())),
    );
    counts.prose = rows.filter(
      (row) => row !== null && typeof row === 'object' && row.anchorKind === 'prose',
    ).length;

    if (uncited.length > 0 || duplicated.length > 0 || extras.length > 0) {
      fail(
        `AC inventory: ${label} (patterns: ${patternText}) lists ${declared.length} ACs; claimed ${counts.claimed} · e2e-only ${counts['e2e-only']} · deferred ${counts.deferred} · prose ${counts.prose} · uncited ${uncited.length}${
          uncited.length > 0 ? ` (${uncited.join(', ')})` : ''
        }`,
      );
      fail(
        'AC inventory proves naming, not rendering: every AC in the declared slice must be named exactly once, but a row does not show that the UI renders it',
      );
      for (const id of duplicated) {
        fail(`AC inventory: ${label} lists ${id} more than once`);
      }
      for (const row of extras) {
        fail(`AC inventory: ${label} lists ${row.id}, which is not in the declared slice`);
      }
    }
  }

  return failures;
}

/** Cross-file validation: one catalogue is clean, and ids do not collide across files. */
export function validateCatalogues(catalogues, ctx = {}) {
  const failures = [];
  const list = Array.isArray(catalogues) ? catalogues : [];
  if (list.length === 0) return ['mock-claims: no catalogues supplied'];
  for (const catalogue of list) failures.push(...validateCatalogue(catalogue, ctx));

  const seen = new Map();
  for (const catalogue of list) {
    if (catalogue === null || typeof catalogue !== 'object') continue;
    const set = typeof catalogue.set === 'string' ? catalogue.set : '(unnamed)';
    const claim = (kind, id) => {
      const key = `${kind}\u0000${id.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, set);
      else if (seen.get(key) !== set) {
        failures.push(
          `mock-claims: ${set}: duplicate ${kind} id "${id}" across files (also in ${seen.get(key)})`,
        );
      }
    };
    for (const entry of Array.isArray(catalogue.entries) ? catalogue.entries : []) {
      if (entry && typeof entry.id === 'string' && entry.id.trim()) claim('entry', entry.id.trim());
    }
    for (const surface of Array.isArray(catalogue.surfaces) ? catalogue.surfaces : []) {
      if (surface && typeof surface.id === 'string' && surface.id.trim()) {
        claim('surface', surface.id.trim());
      }
    }
    for (const story of Array.isArray(catalogue.stories) ? catalogue.stories : []) {
      if (story && typeof story.id === 'string' && story.id.trim()) claim('story', story.id.trim());
    }
  }
  return failures;
}

// --- the generator ------------------------------------------------------------------------------

function uniqueStates(states) {
  const seen = new Set();
  return states.filter((state) => {
    if (seen.has(state)) return false;
    seen.add(state);
    return true;
  });
}

function legend(catalogue, paired, excluded, claims, skipped, short) {
  const lines = [];
  if (short !== null) lines.push(`controls: short (${short})`);
  lines.push(
    'You are scoring a built baseline against a signed mock. Image 1 in each pair is the mock, image 2 is the build.',
  );
  paired.forEach((name, index) => {
    const state = catalogue.states[name];
    lines.push(
      `Pair ${index + 1}, state "${name}": image ${index * 2 + 1} is the signed mock ${state.mock.path}; image ${index * 2 + 2} is the built baseline ${state.baseline}.`,
    );
  });
  if (excluded.length > 0) {
    lines.push(`Excluded from pairing (no baseline): ${excluded.join(', ')}.`);
  }
  if (skipped > 0) {
    lines.push(
      `Skipped ${skipped} entr${skipped === 1 ? 'y' : 'ies'} asserted outside the image (dom/e2e/api); the model is not asked about them.`,
    );
  }
  lines.push(
    `Verdict criteria: PRESENT — ${VERDICT_CRITERIA.PRESENT} PARTIAL — ${VERDICT_CRITERIA.PARTIAL} ABSENT — ${VERDICT_CRITERIA.ABSENT} UNVERIFIABLE — ${VERDICT_CRITERIA.UNVERIFIABLE}`,
  );
  lines.push(
    `Claims to answer: ${claims.length}. State names in this call: ${paired.map((name) => `"${name}"`).join(', ')}.`,
  );
  return lines.join('\n');
}

/**
 * Select the probe claims for a set+state selection.
 * Returns `{ claims, state }` (the probe body and its legend) or throws ClaimSelectionError.
 */
export function selectClaims(catalogue, options = {}) {
  if (catalogue === null || typeof catalogue !== 'object' || Array.isArray(catalogue)) {
    throw new ClaimSelectionError('the catalogue is not an object');
  }
  const states = catalogue.states;
  if (states === null || typeof states !== 'object' || Array.isArray(states)) {
    throw new ClaimSelectionError('the catalogue declares no states');
  }
  const requested = uniqueStates(
    (Array.isArray(options.states) ? options.states : [])
      .map((state) => (typeof state === 'string' ? state.trim() : ''))
      .filter(Boolean),
  );
  const allowShort = options.allowShort === true;

  if (requested.length === 0) {
    throw new ClaimSelectionError('select at least one state with --states a,b');
  }
  const unknown = requested.filter((state) => !Object.prototype.hasOwnProperty.call(states, state));
  if (unknown.length > 0) {
    throw new ClaimSelectionError(
      `state${unknown.length === 1 ? '' : 's'} ${unknown.map((state) => `"${state}"`).join(', ')} not declared in the catalogue`,
    );
  }
  const targets = requested.filter((state) => states[state].coverage === 'target');
  if (targets.length > 0) {
    throw new ClaimSelectionError(
      `state "${targets[0]}" is coverage "target": a target has no signed mock and is never scored`,
    );
  }

  const paired = requested.filter(
    (state) => typeof states[state].baseline === 'string' && states[state].baseline.trim(),
  );
  const excluded = requested.filter((state) => !paired.includes(state));
  if (paired.length === 0) {
    throw new ClaimSelectionError(
      `no paired state in the selection (${requested.map((state) => `"${state}"`).join(', ')}): a state without a baseline has nothing to compare`,
    );
  }
  if (paired.length > 2) {
    throw new ClaimSelectionError(
      `at most two pairs per call (the probe takes four images); this selection has ${paired.length}`,
    );
  }

  const entries = Array.isArray(catalogue.entries) ? catalogue.entries : [];
  const selected = entries.filter(
    (entry) => entry !== null && typeof entry === 'object' && paired.includes(entry.state),
  );
  const emitted = selected.filter((entry) => entry.assert === 'image');

  for (const state of paired) {
    const controls = emitted.filter((entry) => entry.state === state && entry.control === 'spec');
    if (controls.length === 0) {
      throw new ClaimSelectionError(
        `state "${state}" is paired but has no control: "spec" entry; a pair without a spec-derived control cannot detect a stale mock`,
      );
    }
  }

  const absentControls = emitted.filter(
    (entry) => entry.control === 'spec' && entry.expect === 'ABSENT',
  );
  let short = null;
  if (absentControls.length < 3) {
    if (!allowShort) {
      throw new ClaimSelectionError(
        `only ${absentControls.length} ABSENT spec control${absentControls.length === 1 ? '' : 's'}; the floor is 3 (use --allow-short for an advisory call)`,
      );
    }
    short = absentControls.length;
  }

  const claims = emitted.map((entry) => {
    const citation =
      entry.spec && typeof entry.spec === 'object' && typeof entry.spec.quote === 'string'
        ? ` The requirement (${entry.spec.file} ${entry.spec.anchor}): "${entry.spec.quote}".`
        : '';
    return {
      id: entry.id,
      type: 'choice',
      question: `${String(entry.claim).trim()} Judge the built baseline for state "${entry.state}" relative to the signed mock.${citation}`,
      expect: entry.expect,
    };
  });

  return {
    claims,
    state: legend(catalogue, paired, excluded, claims, selected.length - emitted.length, short),
    coverage: coverageLine(catalogue),
  };
}

// --- CLI ----------------------------------------------------------------------------------------

const USAGE = `mock-claims — emit decision-probe claims for a mock set and state selection

Usage:
  node scripts/round/mock-claims.mjs --set <name> --states <a,b> [options]

Options:
  --set <name>        documents/mock-claims/<name>.json
  --states <a,b>      states to score (image order)
  --catalogue <path>  override the catalogue path
  --json              print the probe body ({ claims, state, coverage })
  --allow-short       accept fewer than three ABSENT spec controls (advisory only)
  --help, -h          this text`;

function parseArgs(argv) {
  const out = { states: [], json: false, allowShort: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} needs a value`);
      return value;
    };
    if (argument === '--set') out.set = next();
    else if (argument === '--states') {
      out.states = next()
        .split(',')
        .map((state) => state.trim())
        .filter(Boolean);
    } else if (argument === '--catalogue') out.catalogue = next();
    else if (argument === '--json') out.json = true;
    else if (argument === '--allow-short') out.allowShort = true;
    else if (argument === '--help' || argument === '-h') out.help = true;
    else throw new Error(`unknown argument ${argument}`);
  }
  if (!out.help) {
    if (!out.set) throw new Error('--set is required');
    if (out.states.length === 0) throw new Error('--states a,b is required');
  }
  return out;
}

function truncate(value, width) {
  const text = String(value);
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`;
}

export function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`mock-claims: ${error.message}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const path = args.catalogue
    ? resolve(args.catalogue)
    : resolve('documents', 'mock-claims', `${args.set}.json`);

  let catalogue;
  try {
    catalogue = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`mock-claims: cannot read ${path}: ${error.message}`);
    return 2;
  }

  let selection;
  try {
    selection = selectClaims(catalogue, { states: args.states, allowShort: args.allowShort });
  } catch (error) {
    // Refusals print nothing to stdout: an empty claim list is never emitted as a pass.
    console.error(`mock-claims: ${error.message}`);
    return error instanceof ClaimSelectionError ? 1 : 2;
  }

  if (args.json) {
    console.log(JSON.stringify(selection, null, 2));
    return 0;
  }

  console.log(selection.state);
  console.log('');
  console.log(selection.coverage);
  console.log('');
  console.log(`${'id'.padEnd(18)} ${'expect'.padEnd(14)} claim`);
  for (const claim of selection.claims) {
    console.log(
      `${String(claim.id).padEnd(18)} ${String(claim.expect ?? '—').padEnd(14)} ${truncate(claim.question, 110)}`,
    );
  }
  return 0;
}

// Importing this module (the meta test does) must not run the generator.
// Windows paths are case-insensitive, so the entry point is compared the same way there.
const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.platform === 'win32'
    ? resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
    : resolve(process.argv[1]) === fileURLToPath(import.meta.url));

if (invokedDirectly) process.exitCode = run(process.argv.slice(2));
