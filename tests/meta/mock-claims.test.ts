import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the guard is plain ESM outside the type-checked src/ tree, so it has no types.
import * as mockClaims from '../../scripts/round/mock-claims.mjs';

// --- the shapes the round doc fixes -------------------------------------------------------------

interface Citation {
  file: string;
  anchor: string;
  quote: string;
}

interface Entry {
  id: string;
  story: string;
  state: string;
  claim: string;
  expect: string;
  class: string;
  assert: string;
  /** "ac" or "prose"; required whenever `class` is "spec-required" (Decision 22). */
  anchorKind?: string;
  spec?: Citation;
  ac?: string[];
  control?: string;
  /** `<repo-relative path>::<title>`, required when `assert` is "e2e". */
  test?: string;
  /** `{ mock, build }`, required when `assert` is "dom" or "e2e" (Decision 25). */
  target?: { mock?: unknown; build?: unknown };
}

interface Story {
  id: string;
  as: string;
  iWant: string;
  soThat: string;
  spec: Citation;
}

interface MockState {
  mock: { path: string; sha256: string };
  baseline: string | null;
  coverage: string;
}

interface InventoryRow {
  file: string;
  /** Absent on a prose row, which is bound by `anchor` instead (Decision 22). */
  id?: string;
  anchorKind?: string;
  anchor?: string;
  disposition: string;
  /** One entry (singular) or several, one per state, for a prose row. */
  entry?: string;
  entries?: string[];
  test?: string;
  backlog?: string;
  revisit?: string;
}

interface Surface {
  id: string;
  route: string;
  spec: { file: string; section: string }[];
  acsMatch: string[];
}

interface Catalogue {
  set: string;
  specs: string[];
  surfaces: Surface[];
  states: Record<string, MockState>;
  inventory: { surface: string; acs: InventoryRow[] }[];
  stories: Story[];
  entries: Entry[];
}

interface CatalogueContext {
  readText?: (path: string) => string | null;
  backlogText?: string;
}

interface Claim {
  id: string;
  type: string;
  question: string;
  expect?: string;
}

interface Selection {
  claims: Claim[];
  state: string;
  coverage: string;
}

type Validate = (catalogue: unknown, ctx?: CatalogueContext) => string[];
type Select = (
  catalogue: unknown,
  options: { states: string[]; allowShort?: boolean },
) => Selection;

const validateCatalogue = mockClaims.validateCatalogue as Validate;
const validateCatalogues = mockClaims.validateCatalogues as Validate;
const selectClaims = mockClaims.selectClaims as Select;
const coverageLine = mockClaims.coverageLine as (catalogue: unknown) => string;

// --- fixtures -----------------------------------------------------------------------------------

const SPEC = 'documents/specs/fixture.md';
const BACKLOG = 'documents/backlog.md';
const E2E = 'tests/e2e/fixture.spec.ts';
const PROSE_HEADING = 'Action state';
const PROSE_QUOTE = 'The End of session action is disabled once the session ends';
const SPEC_TEXT = [
  '# Fixture spec',
  '',
  '## Acceptance Criteria',
  '',
  '### AC-1: **Given** a live session, **When** the headcount page renders, **Then** the header shows one End of session action. (FR-1)',
  '',
  '### AC-2: **Given** an ended session, **When** the headcount page renders, **Then** the action is visibly disabled. (FR-2)',
  '',
  '### AC-3: **Given** a past session, **When** the headcount page renders, **Then** no action is offered. (FR-3)',
  '',
  '### AC-4: **Given** a closed session, **When** a headcount is submitted, **Then** nothing is written. (FR-4)',
  '',
  '### AC-5: **Given** a cancelled session, **When** the page renders, **Then** the count is not shown. (FR-5)',
  '',
  '### AC-6: **Given** a past open session, **When** the page renders, **Then** the header reads Past session. (FR-6)',
  '',
  '### AC-7: **Given** a live session, **When** the headcount page renders, **Then** the roster label reads Roster. (FR-7)',
  '',
  '### AC-8: **Given** a capture, **When** the page renders, **Then** the capture time is shown beside the state. (FR-8)',
  '',
  '### Action state',
  '',
  'The End of session action is disabled once the session ends and is never offered on a past session.',
  '',
  '## Notes',
  '',
  'No acceptance criteria here.',
].join('\n');

const E2E_TEXT = [
  "import { test } from '@playwright/test';",
  '',
  "test('ended header is disabled', async () => {",
  '  // fixture',
  '});',
  '',
  "test('past session offers no action', async () => {",
  '  // fixture',
  '});',
  '',
  "test('closed session refuses the write', async () => {",
  '  // fixture',
  '});',
  '',
  "test('cancelled session hides the count', async () => {",
  '  // fixture',
  '});',
].join('\n');

const BACKLOG_TEXT = [
  '# Backlog',
  '',
  '## Headcount capture',
  '',
  '- capture the not-live state',
].join('\n');

const FILES: Record<string, string> = {
  [SPEC]: SPEC_TEXT,
  [BACKLOG]: BACKLOG_TEXT,
  [E2E]: E2E_TEXT,
};

function context(files: Record<string, string> = FILES): CatalogueContext {
  return {
    readText: (path) => (path in files ? files[path] : null),
    backlogText: files[BACKLOG] ?? '',
  };
}

function validCatalogue(): Catalogue {
  return {
    set: 'fixture',
    specs: [SPEC],
    surfaces: [
      {
        id: 'fixture-surface',
        route: '/fixture',
        spec: [{ file: SPEC, section: 'Acceptance Criteria' }],
        acsMatch: ['headcount', 'capture', 'past', 'roster', 'cancelled'],
      },
    ],
    states: {
      live: {
        mock: { path: 'mockups/fixture/live.png', sha256: 'a'.repeat(64) },
        baseline: 'fixture-capture.png',
        coverage: 'signed',
      },
      ended: {
        mock: { path: 'mockups/fixture/ended.png', sha256: 'b'.repeat(64) },
        baseline: 'fixture-capture.png',
        coverage: 'signed',
      },
      'not-live': {
        mock: { path: 'mockups/fixture/not-live.png', sha256: 'c'.repeat(64) },
        baseline: null,
        coverage: 'signed',
      },
      future: {
        mock: { path: 'mockups/fixture/future.png', sha256: 'd'.repeat(64) },
        baseline: null,
        coverage: 'target',
      },
    },
    inventory: [
      {
        surface: 'fixture-surface',
        acs: [
          { file: SPEC, id: 'AC-1', disposition: 'claimed', entry: 'FX-LIVE-01' },
          {
            file: SPEC,
            id: 'AC-2',
            disposition: 'e2e-only',
            test: `${E2E}::ended header is disabled`,
          },
          {
            file: SPEC,
            id: 'AC-3',
            disposition: 'e2e-only',
            test: `${E2E}::past session offers no action`,
          },
          {
            file: SPEC,
            id: 'AC-4',
            disposition: 'e2e-only',
            test: `${E2E}::closed session refuses the write`,
          },
          {
            file: SPEC,
            id: 'AC-5',
            disposition: 'e2e-only',
            test: `${E2E}::cancelled session hides the count`,
          },
          { file: SPEC, id: 'AC-6', disposition: 'claimed', entry: 'FX-LIVE-02' },
          { file: SPEC, id: 'AC-7', disposition: 'claimed', entry: 'FX-ENDED-02' },
          { file: SPEC, id: 'AC-8', disposition: 'claimed', entry: 'FX-ENDED-03' },
        ],
      },
    ],
    stories: [
      {
        id: 'FX',
        as: 'operator',
        iWant: 'see the capture state',
        soThat: 'I know whether the session is open',
        spec: {
          file: SPEC,
          anchor: 'AC-1',
          quote: 'the header shows one End of session action',
        },
      },
    ],
    entries: [
      {
        id: 'FX-LIVE-01',
        story: 'FX',
        state: 'live',
        claim: 'The header shows one End of session action.',
        expect: 'PRESENT',
        class: 'spec-required',
        assert: 'image',
        anchorKind: 'ac',
        spec: {
          file: SPEC,
          anchor: 'AC-1',
          quote: 'the header shows one End of session action',
        },
        ac: ['AC-1'],
        control: 'spec',
      },
      {
        id: 'FX-LIVE-02',
        story: 'FX',
        state: 'live',
        claim: 'The header reads Live.',
        expect: 'ABSENT',
        class: 'spec-required',
        assert: 'image',
        anchorKind: 'ac',
        spec: { file: SPEC, anchor: 'AC-6', quote: 'the header reads Past session' },
        ac: ['AC-6'],
        control: 'spec',
      },
      {
        id: 'FX-LIVE-03',
        story: 'FX',
        state: 'live',
        claim: 'The roster label sits above the count.',
        expect: 'PRESENT',
        class: 'mock-only',
        assert: 'image',
      },
      {
        id: 'FX-ENDED-01',
        story: 'FX',
        state: 'ended',
        claim: 'The count grid keeps three buckets.',
        expect: 'PRESENT',
        class: 'mock-only',
        assert: 'image',
      },
      {
        id: 'FX-ENDED-02',
        story: 'FX',
        state: 'ended',
        claim: 'The roster label reads Expected.',
        expect: 'ABSENT',
        class: 'spec-required',
        assert: 'image',
        anchorKind: 'ac',
        spec: { file: SPEC, anchor: 'AC-7', quote: 'the roster label reads Roster' },
        ac: ['AC-7'],
        control: 'spec',
      },
      {
        id: 'FX-ENDED-03',
        story: 'FX',
        state: 'ended',
        claim: 'The page shows no capture time.',
        expect: 'ABSENT',
        class: 'spec-required',
        assert: 'image',
        anchorKind: 'ac',
        spec: {
          file: SPEC,
          anchor: 'AC-8',
          quote: 'the capture time is shown beside the state',
        },
        ac: ['AC-8'],
        control: 'spec',
      },
    ],
  };
}

function entryOf(catalogue: Catalogue, id: string): Entry {
  const entry = catalogue.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`fixture has no entry ${id}`);
  return entry;
}

function rowOf(catalogue: Catalogue, id: string): InventoryRow {
  const row = catalogue.inventory[0].acs.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`fixture has no inventory row ${id}`);
  return row;
}

function proseRowOf(catalogue: Catalogue): InventoryRow {
  const row = catalogue.inventory[0].acs.find((candidate) => candidate.anchorKind === 'prose');
  if (!row) throw new Error('fixture has no prose inventory row');
  return row;
}

function failuresOf(catalogue: Catalogue, ctx = context()): string[] {
  return validateCatalogue(catalogue, ctx);
}

/** Rename every entry (and the inventory links) so a second catalogue can coexist. */
function renameEntries(catalogue: Catalogue, suffix: string): void {
  for (const entry of catalogue.entries) entry.id = `${entry.id}${suffix}`;
  for (const block of catalogue.inventory) {
    for (const row of block.acs) {
      if (row.entry) row.entry = `${row.entry}${suffix}`;
    }
  }
}

/**
 * The clean fixture plus one prose requirement (Decision 22) and its claimed inventory row: a
 * spec-required entry whose citation is a heading that is not an AC, asserted in the build.
 */
function proseCatalogue(): Catalogue {
  const catalogue = validCatalogue();
  catalogue.entries.push({
    id: 'FX-PROSE-01',
    story: 'FX',
    state: 'ended',
    claim: 'The End of session action is disabled once the session has ended.',
    expect: 'PRESENT',
    class: 'spec-required',
    assert: 'e2e',
    anchorKind: 'prose',
    spec: { file: SPEC, anchor: PROSE_HEADING, quote: PROSE_QUOTE },
    test: `${E2E}::ended header is disabled`,
    target: {
      mock: { selector: '[data-action="end-session"]' },
      build: { role: 'button', name: 'End session' },
    },
  });
  catalogue.inventory[0].acs.push({
    file: SPEC,
    anchorKind: 'prose',
    anchor: PROSE_HEADING,
    disposition: 'claimed',
    entry: 'FX-PROSE-01',
  });
  return catalogue;
}

/**
 * The prose fixture with a second prose entry on the same file+heading and in another state: one
 * requirement, two state assertions, claimed by one row (Decision 22).
 */
function twoProseEntries(): Catalogue {
  const catalogue = proseCatalogue();
  catalogue.entries.push({
    id: 'FX-PROSE-02',
    story: 'FX',
    state: 'live',
    claim: 'The End of session action is offered while the session is live.',
    expect: 'PRESENT',
    class: 'spec-required',
    assert: 'e2e',
    anchorKind: 'prose',
    spec: { file: SPEC, anchor: PROSE_HEADING, quote: PROSE_QUOTE },
    test: `${E2E}::closed session refuses the write`,
    target: {
      mock: { selector: '[data-action="end-session"]' },
      build: { role: 'button', name: 'End session' },
    },
  });
  return catalogue;
}

// --- the clean fixture --------------------------------------------------------------------------

describe('mock-claims: the clean catalogue', () => {
  it('validates against the round-doc schema', () => {
    expect(failuresOf(validCatalogue())).toEqual([]);
  });

  it('validates two clean catalogues with distinct ids', () => {
    const second = structuredClone(validCatalogue());
    second.set = 'fixture-b';
    second.surfaces[0].id = 'fixture-surface-b';
    second.inventory[0].surface = 'fixture-surface-b';
    second.stories[0].id = 'FXB';
    for (const entry of second.entries) entry.story = 'FXB';
    renameEntries(second, '-B');
    expect(validateCatalogues([validCatalogue(), second], context())).toEqual([]);
  });

  it('accepts a deferred AC that names a backlog anchor', () => {
    const catalogue = validCatalogue();
    rowOf(catalogue, 'AC-5').disposition = 'deferred';
    rowOf(catalogue, 'AC-5').backlog = 'Headcount capture';
    delete rowOf(catalogue, 'AC-5').test;
    expect(failuresOf(catalogue)).toEqual([]);
  });
});

// --- the schema rules, one negative fixture each -------------------------------------------------

describe('mock-claims: content pinning', () => {
  it('fails a quote that no longer occurs verbatim', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-01').spec!.quote = 'the header shows an End action';
    expect(failuresOf(catalogue).join('\n')).toContain('quote does not occur verbatim');
  });

  it('fails a quote taken from a different section than its anchor', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-01').spec!.quote = 'the roster label reads Roster';
    expect(failuresOf(catalogue).join('\n')).toContain('quote does not occur verbatim');
  });

  it('fails a dangling story reference', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-03').story = 'FX-MISSING';
    expect(failuresOf(catalogue).join('\n')).toContain('story "FX-MISSING" does not resolve');
  });

  it('fails an undeclared state on an entry', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-03').state = 'ghost';
    expect(failuresOf(catalogue).join('\n')).toContain('state "ghost" is not declared');
  });

  it('fails an anchor that is neither a heading nor an AC id', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-01').spec!.anchor = 'AC-99';
    expect(failuresOf(catalogue).join('\n')).toContain('anchor "AC-99" is not a heading or AC id');
  });

  it('fails a spec file that does not exist', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-01').spec!.file = 'documents/specs/nope.md';
    expect(failuresOf(catalogue).join('\n')).toContain(
      'spec file "documents/specs/nope.md" does not exist',
    );
  });

  it('fails a declared slice whose section is not a heading', () => {
    const catalogue = validCatalogue();
    catalogue.surfaces[0].spec[0].section = 'Nope';
    expect(failuresOf(catalogue).join('\n')).toContain('section "Nope" is not a heading');
  });

  it('fails a declared slice with no AC headings', () => {
    const catalogue = validCatalogue();
    catalogue.surfaces[0].spec[0].section = 'Notes';
    expect(failuresOf(catalogue).join('\n')).toContain('has no AC headings');
  });

  it('fails an ac id that is not in the declared slice', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-01').ac = ['AC-99'];
    expect(failuresOf(catalogue).join('\n')).toContain('ac "AC-99" is not in the declared slice');
  });

  it('fails a spec-required entry with no ac', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-01').ac = [];
    expect(failuresOf(catalogue).join('\n')).toContain('a spec-required entry must name its ac');
  });
});

describe('mock-claims: anchorKind (Decision 22)', () => {
  it('accepts a prose requirement whose inventory row claims it', () => {
    expect(failuresOf(proseCatalogue())).toEqual([]);
  });

  it('accepts one prose row that claims two state entries', () => {
    const catalogue = twoProseEntries();
    const row = proseRowOf(catalogue);
    row.entries = ['FX-PROSE-01', 'FX-PROSE-02'];
    delete row.entry;
    expect(failuresOf(catalogue)).toEqual([]);
  });

  it('accepts the singular entry and the plural entries together', () => {
    const catalogue = twoProseEntries();
    proseRowOf(catalogue).entries = ['FX-PROSE-02'];
    expect(failuresOf(catalogue)).toEqual([]);
  });

  it('fails a prose row with no entry at all', () => {
    const catalogue = proseCatalogue();
    delete proseRowOf(catalogue).entry;
    expect(failuresOf(catalogue).join('\n')).toContain(
      'a prose row must name the entry or entries that claim it',
    );
  });

  it('fails a prose row that lists a dangling id', () => {
    const catalogue = twoProseEntries();
    const row = proseRowOf(catalogue);
    row.entries = ['FX-PROSE-01', 'FX-MISSING'];
    delete row.entry;
    expect(failuresOf(catalogue).join('\n')).toContain('entry "FX-MISSING" does not resolve');
  });

  it('fails a prose row that lists an entry not anchored to the same heading', () => {
    const catalogue = proseCatalogue();
    const row = proseRowOf(catalogue);
    row.entries = ['FX-PROSE-01', 'FX-LIVE-01'];
    delete row.entry;
    expect(failuresOf(catalogue).join('\n')).toContain(
      'entry "FX-LIVE-01" is not a spec-required prose entry citing',
    );
  });

  it('fails a prose row whose disposition is not claimed', () => {
    const catalogue = proseCatalogue();
    proseRowOf(catalogue).disposition = 'deferred';
    expect(failuresOf(catalogue).join('\n')).toContain(
      'a prose row is claimed by its entries, so its disposition cannot be "deferred"',
    );
  });

  it('fails a prose entry that no row cites', () => {
    const catalogue = twoProseEntries();
    proseRowOf(catalogue).entries = ['FX-PROSE-01'];
    delete proseRowOf(catalogue).entry;
    expect(failuresOf(catalogue).join('\n')).toContain(
      'entry "FX-PROSE-02" has no claimed prose row in the inventory',
    );
  });

  it('fails a spec-required entry with no anchorKind', () => {
    const catalogue = validCatalogue();
    delete entryOf(catalogue, 'FX-LIVE-01').anchorKind;
    expect(failuresOf(catalogue).join('\n')).toContain(
      'a spec-required entry must carry anchorKind "ac"',
    );
  });

  it('fails an anchorKind that is neither ac nor prose', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-01').anchorKind = 'heading';
    expect(failuresOf(catalogue).join('\n')).toContain(
      'anchorKind must be "ac" or "prose" when present',
    );
  });

  it('fails a prose-anchored entry without anchorKind', () => {
    const catalogue = proseCatalogue();
    delete entryOf(catalogue, 'FX-PROSE-01').anchorKind;
    expect(failuresOf(catalogue).join('\n')).toContain(
      'a spec-required entry must carry anchorKind',
    );
  });

  it('fails a prose entry that still names an ac', () => {
    const catalogue = proseCatalogue();
    entryOf(catalogue, 'FX-PROSE-01').ac = ['AC-1'];
    expect(failuresOf(catalogue).join('\n')).toContain(
      'a prose-anchored entry must not name an ac',
    );
  });

  it('fails a prose anchor that is an AC heading', () => {
    const catalogue = proseCatalogue();
    entryOf(catalogue, 'FX-PROSE-01').spec = {
      file: SPEC,
      anchor: 'AC-2',
      quote: 'the action is visibly disabled',
    };
    expect(failuresOf(catalogue).join('\n')).toContain('prose anchor "AC-2" is an AC heading');
  });

  it('fails a prose entry with no claimed inventory row', () => {
    const catalogue = proseCatalogue();
    catalogue.inventory[0].acs = catalogue.inventory[0].acs.filter(
      (row) => row.anchorKind !== 'prose',
    );
    expect(failuresOf(catalogue).join('\n')).toContain('has no claimed prose row in the inventory');
  });

  it('fails a prose row whose anchor is not a heading', () => {
    const catalogue = proseCatalogue();
    proseRowOf(catalogue).anchor = 'Nope';
    expect(failuresOf(catalogue).join('\n')).toContain('anchor "Nope" is not a heading in');
  });

  it('fails a prose row whose anchor is an AC heading', () => {
    const catalogue = proseCatalogue();
    proseRowOf(catalogue).anchor = 'AC-2';
    expect(failuresOf(catalogue).join('\n')).toContain(
      'is an AC heading (AC-2); a prose requirement is not an AC',
    );
  });

  it('fails a prose row with no anchor', () => {
    const catalogue = proseCatalogue();
    delete proseRowOf(catalogue).anchor;
    expect(failuresOf(catalogue).join('\n')).toContain(
      'anchor is missing; a prose row names the heading it covers',
    );
  });

  it('fails the same prose requirement listed twice', () => {
    const catalogue = proseCatalogue();
    const clone = structuredClone(proseRowOf(catalogue));
    clone.disposition = 'deferred';
    clone.backlog = 'Headcount capture';
    delete clone.entry;
    catalogue.inventory[0].acs.push(clone);
    expect(failuresOf(catalogue).join('\n')).toContain(
      'this prose requirement is listed more than once',
    );
  });
});

describe('mock-claims: target and test names (Decision 25)', () => {
  const withProseEntry = () => proseCatalogue();

  it('fails an e2e entry with no target', () => {
    const catalogue = withProseEntry();
    delete entryOf(catalogue, 'FX-PROSE-01').target;
    expect(failuresOf(catalogue).join('\n')).toContain(
      'assert "e2e" needs target: { mock: <locator>, build: <locator> }',
    );
  });

  it('fails a dom entry with no target', () => {
    const catalogue = withProseEntry();
    entryOf(catalogue, 'FX-PROSE-01').assert = 'dom';
    delete entryOf(catalogue, 'FX-PROSE-01').target;
    expect(failuresOf(catalogue).join('\n')).toContain('assert "dom" needs target');
  });

  it('fails a target whose mock locator is empty', () => {
    const catalogue = withProseEntry();
    entryOf(catalogue, 'FX-PROSE-01').target = { mock: {}, build: { role: 'button' } };
    expect(failuresOf(catalogue).join('\n')).toContain(
      'target.mock must be a non-empty locator object',
    );
  });

  it('fails a target whose build locator is missing', () => {
    const catalogue = withProseEntry();
    entryOf(catalogue, 'FX-PROSE-01').target = { mock: { selector: '#end-session' } };
    expect(failuresOf(catalogue).join('\n')).toContain(
      'target.build must be a non-empty locator object',
    );
  });

  it('fails an image entry that carries a target', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-LIVE-01').target = {
      mock: { selector: '#end-session' },
      build: { selector: '#end-session' },
    };
    expect(failuresOf(catalogue).join('\n')).toContain('assert "image" must not carry target');
  });

  it('fails an e2e entry with no test name', () => {
    const catalogue = withProseEntry();
    delete entryOf(catalogue, 'FX-PROSE-01').test;
    expect(failuresOf(catalogue).join('\n')).toContain('an assert: "e2e" entry must name its test');
  });

  it('fails an e2e-only row whose test is free text, showing the expected shape', () => {
    const catalogue = validCatalogue();
    rowOf(catalogue, 'AC-2').test = 'ended header is disabled';
    const failures = failuresOf(catalogue).join('\n');
    expect(failures).toContain('<repo-relative path>::<title>');
    expect(failures).toContain('does not resolve to a title');
  });

  it('fails an e2e-only row whose title is no longer in the file', () => {
    const catalogue = validCatalogue();
    rowOf(catalogue, 'AC-2').test = `${E2E}::ended header is enabled`;
    expect(failuresOf(catalogue).join('\n')).toContain(
      'title "ended header is enabled" does not occur in',
    );
  });

  it('fails an e2e-only row whose test file does not exist', () => {
    const catalogue = validCatalogue();
    rowOf(catalogue, 'AC-2').test = 'tests/e2e/missing.spec.ts::ended header is disabled';
    expect(failuresOf(catalogue).join('\n')).toContain(
      'test file "tests/e2e/missing.spec.ts" does not exist',
    );
  });
});

describe('mock-claims: the coverage line (Decision 25)', () => {
  it('counts the AC dispositions and puts prose in its own bucket', () => {
    expect(coverageLine(validCatalogue())).toBe(
      'Mock coverage: claimed 4 · e2e-only 4 · deferred 0 · prose 0',
    );
  });

  it('counts a prose requirement, which is not an AC row', () => {
    expect(coverageLine(proseCatalogue())).toBe(
      'Mock coverage: claimed 4 · e2e-only 4 · deferred 0 · prose 1',
    );
  });

  it('counts one requirement per row, not one per prose entry', () => {
    const catalogue = twoProseEntries();
    const row = proseRowOf(catalogue);
    row.entries = ['FX-PROSE-01', 'FX-PROSE-02'];
    delete row.entry;
    // Two entries, one file+heading: the requirement is counted once (decision 22).
    expect(coverageLine(catalogue)).toBe(
      'Mock coverage: claimed 4 · e2e-only 4 · deferred 0 · prose 1',
    );
  });

  it('is emitted with the selection so the round doc can cite it', () => {
    const catalogue = twoProseEntries();
    const row = proseRowOf(catalogue);
    row.entries = ['FX-PROSE-01', 'FX-PROSE-02'];
    delete row.entry;
    const selection = selectClaims(catalogue, { states: ['live', 'ended'] });
    expect(selection.coverage).toBe('Mock coverage: claimed 4 · e2e-only 4 · deferred 0 · prose 1');
  });
});

describe('mock-claims: ids are unique', () => {
  it('fails an entry id repeated across two files', () => {
    const second = structuredClone(validCatalogue());
    second.set = 'fixture-b';
    second.surfaces[0].id = 'fixture-surface-b';
    second.inventory[0].surface = 'fixture-surface-b';
    second.stories[0].id = 'FXB';
    for (const entry of second.entries) entry.story = 'FXB';
    const failures = validateCatalogues([validCatalogue(), second], context());
    expect(failures.join('\n')).toContain('duplicate entry id "FX-LIVE-01" across files');
  });

  it('fails a duplicate entry id inside one file', () => {
    const catalogue = validCatalogue();
    catalogue.entries.push(structuredClone(entryOf(catalogue, 'FX-ENDED-01')));
    expect(failuresOf(catalogue).join('\n')).toContain('duplicate entry id "FX-ENDED-01"');
  });

  it('fails a surface id repeated across two files', () => {
    const second = structuredClone(validCatalogue());
    second.set = 'fixture-b';
    second.stories[0].id = 'FXB';
    for (const entry of second.entries) entry.story = 'FXB';
    renameEntries(second, '-B');
    const failures = validateCatalogues([validCatalogue(), second], context());
    expect(failures.join('\n')).toContain('duplicate surface id "fixture-surface" across files');
  });

  it('fails a story id repeated across two files', () => {
    const second = structuredClone(validCatalogue());
    second.set = 'fixture-b';
    second.surfaces[0].id = 'fixture-surface-b';
    second.inventory[0].surface = 'fixture-surface-b';
    renameEntries(second, '-B');
    const failures = validateCatalogues([validCatalogue(), second], context());
    expect(failures.join('\n')).toContain('duplicate story id "FX" across files');
  });
});

describe('mock-claims: dispositions', () => {
  it('fails a disposition that is not claimed, e2e-only or deferred', () => {
    const catalogue = validCatalogue();
    rowOf(catalogue, 'AC-1').disposition = 'missing';
    expect(failuresOf(catalogue).join('\n')).toContain(
      'disposition must be claimed, e2e-only or deferred',
    );
  });

  it('fails a deferred row with no backlog anchor', () => {
    const catalogue = validCatalogue();
    rowOf(catalogue, 'AC-5').disposition = 'deferred';
    delete rowOf(catalogue, 'AC-5').test;
    expect(failuresOf(catalogue).join('\n')).toContain('must name its backlog anchor');
  });

  it('fails a deferred row whose backlog anchor is absent from the backlog', () => {
    const catalogue = validCatalogue();
    rowOf(catalogue, 'AC-5').disposition = 'deferred';
    rowOf(catalogue, 'AC-5').backlog = 'Not a real backlog row';
    delete rowOf(catalogue, 'AC-5').test;
    expect(failuresOf(catalogue).join('\n')).toContain('does not occur in documents/backlog.md');
  });

  it('fails an e2e-only row with no test', () => {
    const catalogue = validCatalogue();
    delete rowOf(catalogue, 'AC-2').test;
    expect(failuresOf(catalogue).join('\n')).toContain('must name its test');
  });

  it('fails a claimed row whose entry does not resolve', () => {
    const catalogue = validCatalogue();
    rowOf(catalogue, 'AC-1').entry = 'FX-MISSING';
    expect(failuresOf(catalogue).join('\n')).toContain('entry "FX-MISSING" does not resolve');
  });

  it('fails a claimed row with no entry', () => {
    const catalogue = validCatalogue();
    delete rowOf(catalogue, 'AC-1').entry;
    expect(failuresOf(catalogue).join('\n')).toContain('a claimed row must name its entry');
  });
});

describe('mock-claims: the reverse AC inventory', () => {
  it('fails an AC that the inventory never cites, with the required summary', () => {
    const catalogue = validCatalogue();
    catalogue.inventory[0].acs = catalogue.inventory[0].acs.filter((row) => row.id !== 'AC-8');
    const failures = failuresOf(catalogue).join('\n');
    expect(failures).toContain(
      'AC inventory: fixture-surface (patterns: headcount, capture, past, roster, cancelled) lists 8 ACs; claimed 3 · e2e-only 4 · deferred 0 · prose 0 · uncited 1 (AC-8)',
    );
    expect(failures).toContain('proves naming, not rendering');
  });

  it('requires only the ACs its acsMatch patterns select', () => {
    const catalogue = validCatalogue();
    catalogue.surfaces[0].acsMatch = ['capture'];
    catalogue.inventory[0].acs = catalogue.inventory[0].acs.filter((row) => row.id === 'AC-8');
    expect(failuresOf(catalogue)).toEqual([]);
  });

  it('fails a surface with an empty acsMatch', () => {
    const catalogue = validCatalogue();
    catalogue.surfaces[0].acsMatch = [];
    const failures = failuresOf(catalogue).join('\n');
    expect(failures).toContain(
      'surface "fixture-surface": acsMatch must list at least one pattern',
    );
  });

  it('fails an inventory row for an AC outside the acsMatch patterns as extra', () => {
    const catalogue = validCatalogue();
    catalogue.surfaces[0].acsMatch = ['capture'];
    expect(failuresOf(catalogue).join('\n')).toContain(
      'lists AC-1, which is not in the declared slice',
    );
  });

  it('fails an AC cited twice in one surface inventory', () => {
    const catalogue = validCatalogue();
    catalogue.inventory[0].acs.push(structuredClone(rowOf(catalogue, 'AC-1')));
    expect(failuresOf(catalogue).join('\n')).toContain('lists AC-1 more than once');
  });

  it('fails an inventory row outside the declared slice', () => {
    const catalogue = validCatalogue();
    catalogue.inventory[0].acs.push({
      file: SPEC,
      id: 'AC-9',
      disposition: 'e2e-only',
      test: 'a test outside the slice',
    });
    expect(failuresOf(catalogue).join('\n')).toContain(
      'lists AC-9, which is not in the declared slice',
    );
  });

  it('fails an inventory block for a surface that is not declared', () => {
    const catalogue = validCatalogue();
    catalogue.inventory.push({ surface: 'ghost-surface', acs: [] });
    expect(failuresOf(catalogue).join('\n')).toContain(
      'inventory "ghost-surface": surface is not declared',
    );
  });
});

describe('mock-claims: the absence/state rule', () => {
  it.each(['AC-2', 'AC-3', 'AC-4', 'AC-5'])(
    'fails an image claim that cites the absence clause %s',
    (acId) => {
      const catalogue = validCatalogue();
      const source = entryOf(catalogue, 'FX-LIVE-01');
      catalogue.entries.push({
        ...structuredClone(source),
        id: 'FX-ENDED-04',
        state: 'ended',
        claim: 'The action is shown and enabled.',
        spec: {
          file: SPEC,
          anchor: acId,
          quote: SPEC_TEXT.split(`### ${acId}: `)[1].split(' (FR-')[0],
        },
        ac: [acId],
      });
      const failures = failuresOf(catalogue).join('\n');
      expect(failures).toContain('absence/state');
      expect(failures).toContain('FX-ENDED-04');
      expect(failures).toContain(acId);
    },
  );

  it('fails when a claimed inventory row links an image entry to an absence clause', () => {
    const catalogue = validCatalogue();
    const linked = entryOf(catalogue, 'FX-ENDED-02');
    linked.ac = ['AC-2'];
    linked.spec = {
      file: SPEC,
      anchor: 'AC-2',
      quote: 'the action is visibly disabled',
    };
    rowOf(catalogue, 'AC-7').entry = 'FX-ENDED-02';
    rowOf(catalogue, 'AC-2').disposition = 'claimed';
    rowOf(catalogue, 'AC-2').entry = 'FX-ENDED-02';
    delete rowOf(catalogue, 'AC-2').test;
    expect(failuresOf(catalogue).join('\n')).toContain('absence/state');
  });
});

// --- the generator ------------------------------------------------------------------------------

describe('mock-claims: the selection', () => {
  it('emits the probe body and the pairing legend for two paired states', () => {
    const selection = selectClaims(validCatalogue(), { states: ['live', 'ended'] });
    expect(selection.claims.map((claim) => claim.id)).toEqual([
      'FX-LIVE-01',
      'FX-LIVE-02',
      'FX-LIVE-03',
      'FX-ENDED-01',
      'FX-ENDED-02',
      'FX-ENDED-03',
    ]);
    for (const claim of selection.claims) {
      expect(claim.type).toBe('choice');
      expect(claim.question.length).toBeGreaterThan(0);
      expect(['PRESENT', 'PARTIAL', 'ABSENT', 'UNVERIFIABLE']).toContain(claim.expect);
    }
    expect(selection.state).toContain('Pair 1, state "live": image 1 is the signed mock');
    expect(selection.state).toContain('image 2 is the built baseline fixture-capture.png');
    expect(selection.state).toContain('Pair 2, state "ended": image 3 is the signed mock');
    expect(selection.state).toContain('image 4 is the built baseline');
    expect(selection.state).toContain('Verdict criteria: PRESENT');
    expect(selection.state).toContain('PARTIAL');
    expect(selection.state).not.toContain('controls: short');
  });

  it('refuses a target state', () => {
    expect(() => selectClaims(validCatalogue(), { states: ['future'] })).toThrow(
      /coverage "target"/,
    );
  });

  it('refuses a selection with no paired state', () => {
    expect(() => selectClaims(validCatalogue(), { states: ['not-live'] })).toThrow(
      /no paired state/,
    );
  });

  it('excludes an unpaired state when a pair is also selected', () => {
    const selection = selectClaims(validCatalogue(), {
      states: ['live', 'ended', 'not-live'],
    });
    expect(selection.claims.every((claim) => claim.id.startsWith('FX-'))).toBe(true);
    expect(selection.state).toContain('Excluded from pairing (no baseline): not-live');
  });

  it('refuses a pair with no control: "spec" entry', () => {
    const catalogue = validCatalogue();
    entryOf(catalogue, 'FX-ENDED-02').control = 'absent';
    entryOf(catalogue, 'FX-ENDED-03').control = 'absent';
    expect(() => selectClaims(catalogue, { states: ['ended'] })).toThrow(/no control: "spec"/);
  });

  it('refuses fewer than three ABSENT spec controls', () => {
    const catalogue = validCatalogue();
    catalogue.entries = catalogue.entries.filter((entry) => entry.id !== 'FX-ENDED-03');
    expect(() => selectClaims(catalogue, { states: ['live'] })).toThrow(/the floor is 3/);
  });

  it('emits controls: short (n) with --allow-short', () => {
    const selection = selectClaims(validCatalogue(), { states: ['live'], allowShort: true });
    expect(selection.state.startsWith('controls: short (1)')).toBe(true);
  });

  it('does not send an e2e-asserted entry to the model', () => {
    const catalogue = validCatalogue();
    const live = entryOf(catalogue, 'FX-LIVE-01');
    catalogue.entries.push({ ...structuredClone(live), id: 'FX-LIVE-04', assert: 'e2e' });
    const selection = selectClaims(catalogue, { states: ['live', 'ended'] });
    expect(selection.claims.map((claim) => claim.id)).not.toContain('FX-LIVE-04');
    expect(selection.state).toContain('Skipped 1 entry asserted outside the image');
  });
});

// --- the real catalogues ------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const claimsDir = join(repoRoot, 'documents', 'mock-claims');
const catalogueFiles = existsSync(claimsDir)
  ? readdirSync(claimsDir)
      .filter((name) => name.endsWith('.json'))
      .sort()
  : [];

function repoContext(): CatalogueContext {
  return {
    readText: (path) => {
      const full = join(repoRoot, path);
      return existsSync(full) ? readFileSync(full, 'utf8') : null;
    },
    backlogText: readFileSync(join(repoRoot, 'documents', 'backlog.md'), 'utf8'),
  };
}

describe('mock-claims: the tracked catalogues', () => {
  if (catalogueFiles.length === 0) {
    it.skip('skips: documents/mock-claims/ is empty (the parent writes the catalogues in this round)', () =>
      undefined);
    return;
  }

  const catalogues = catalogueFiles.map((name) => ({
    name,
    catalogue: JSON.parse(readFileSync(join(claimsDir, name), 'utf8')) as unknown,
  }));

  it('parses every file and names its set', () => {
    expect(catalogues.length).toBeGreaterThan(0);
    for (const { name, catalogue } of catalogues) {
      const set = (catalogue as { set?: unknown }).set;
      expect(typeof set, name).toBe('string');
      expect(String(set).length, name).toBeGreaterThan(0);
    }
  });

  it('passes the schema, the dispositions and the reverse AC inventory', () => {
    const failures = validateCatalogues(
      catalogues.map(({ catalogue }) => catalogue),
      repoContext(),
    );
    expect(failures).toEqual([]);
  });
});
