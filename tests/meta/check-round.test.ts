import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the guard is plain ESM outside the type-checked src/ tree, so it has no types.
import { checkDocuments, parseNameOnly, stagedChangedPaths } from '../../scripts/check-round.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

interface CheckOptions {
  /** The injectable `documents/mock-claims/` listing R6 reads; omit to leave it unknown. */
  listCatalogues?: () => string[];
}

type CheckDocuments = (
  files: string[],
  changedPaths: string[] | null,
  readText: (path: string) => string,
  options?: CheckOptions,
) => string[];

const check = checkDocuments as CheckDocuments;
const parse = parseNameOnly as (output: string | null | undefined) => string[];
const staged = stagedChangedPaths as (execGit: (args: string[]) => string) => string[];

const DOC = 'documents/rounds/fixture.md';
const GATE = 'gate-run 2026-11-11T09:00:00Z profile=full steps=12/12 lines=140 bytes=8192';
const PARENT = 'parent opencode/deepseek-v4.1-flash-free';
/** The header rows the guard requires, pinned here so a dropped row fails a test. */
const REQUIRED_ROWS = ['Status', 'Tier', 'Base', 'Review rounds', 'Gate runs in parent'];

interface DocOptions {
  tier?: string;
  /** `null` omits the row entirely. */
  implementer?: string | null;
  deviations?: string[];
  /** Header rows to omit by name, e.g. `['Base']`. */
  omitRows?: string[];
  /** The `## Review` body; `null` omits the section (R5). */
  review?: string[] | null;
  /** The `## Mock sign-off` body; omitted leaves the section out entirely (R6). */
  mockSignOff?: string[];
}

/** A complete round doc: header rows, the gate-run signature and a `## Deviations` section. */
function roundDoc(options: DocOptions = {}): string {
  const {
    tier = '1',
    implementer = PARENT,
    deviations = [],
    omitRows = [],
    review = ['Seat: consistent'],
    mockSignOff = [],
  } = options;
  const rows: Array<[string, string]> = [
    ['Status', 'OPEN'],
    ['Tier', tier],
    ['Base', 'abc1234'],
    ['Review rounds', '1'],
    ['Gate runs in parent', '0'],
  ];
  if (implementer !== null) rows.push(['Implementer', implementer]);
  const header = rows
    .filter(([name]) => !omitRows.includes(name))
    .map(([name, value]) => `| ${name} | ${value} |`);
  return [
    '# Round - fixture',
    '',
    ...header,
    '',
    '## Plan',
    '',
    'Fixture round.',
    '',
    '## Verification',
    '',
    GATE,
    '',
    ...(review === null ? [] : ['## Review', '', ...review, '']),
    '## Acceptance',
    '',
    'Met.',
    '',
    ...(mockSignOff.length === 0 ? [] : ['## Mock sign-off', '', ...mockSignOff, '']),
    '## Deviations',
    '',
    ...(deviations.length === 0 ? ['- none'] : deviations),
    '',
  ].join('\n');
}

function checkText(text: string, changedPaths: string[] | null = null): string[] {
  return check([DOC], changedPaths, () => text);
}

// R6 fixtures: a catalogue binds a mock image to a state, and the doc cites both.
const CATALOGUE = 'documents/mock-claims/headcount.json';
const MOCK = 'mockups/headcount/14-headcount-not-live.png';
const COVERAGE = 'Mock coverage: claimed 4 · e2e-only 3 · deferred 1 · prose 1';

function catalogueText(coverage = 'signed'): string {
  return JSON.stringify(
    {
      set: 'headcount',
      states: {
        'not-live': {
          mock: { path: MOCK, sha256: 'a'.repeat(64) },
          baseline: null,
          coverage,
        },
      },
    },
    null,
    2,
  );
}

/** A check whose reader serves the round doc and the fixture catalogue, with an injectable listing. */
function checkSurface(
  text: string,
  files: Record<string, string> = { [CATALOGUE]: catalogueText() },
  changedPaths: string[] | null = ['ui/src/pages/headcount/HeadcountPage.tsx'],
  options: CheckOptions = {},
): string[] {
  return check(
    [DOC],
    changedPaths,
    (path) => {
      if (path === DOC) return text;
      if (path in files) return files[path];
      throw new Error(`missing ${path}`);
    },
    options,
  );
}

describe('check-round: the Implementer row (R1)', () => {
  it('accepts a Tier 2 doc with a worker segment', () => {
    const text = roundDoc({
      tier: '2',
      implementer:
        'parent opencode/deepseek-v4.1-flash-free (protected text); worker ollama-cloud/deepseek-v4.1-flash:1017 (guard + test)',
    });
    expect(checkText(text)).toEqual([]);
  });

  it('accepts a Tier 1 doc with a parent segment and no scope', () => {
    expect(checkText(roundDoc({ tier: '1', implementer: PARENT }))).toEqual([]);
  });

  it('accepts the README template cell, which wraps every segment in one code span', () => {
    const implementer =
      '`parent opencode/deepseek-v4.1-flash-free (protected text); worker ollama-cloud/deepseek-v4.1-flash:1017 (guard + test)`';
    expect(checkText(roundDoc({ tier: '2', implementer }))).toEqual([]);
  });

  it('accepts a cell that backticks each segment, and still finds the worker for R2', () => {
    const implementer =
      '`parent opencode/deepseek-v4.1-flash-free` ; `worker ollama-cloud/deepseek-v4.1-flash:1017 (guard + test)`';
    // Tier 2 also proves the worker segment survived the per-segment strip.
    expect(checkText(roundDoc({ tier: '2', implementer }))).toEqual([]);
  });

  it('rejects a backticked segment whose content is malformed', () => {
    const failures = checkText(roundDoc({ implementer: '`worker deepseek-v4.1-flash`' }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('malformed Implementer segment "worker deepseek-v4.1-flash"');
  });

  it('rejects a cell whose role is not parent or worker', () => {
    const failures = checkText(roundDoc({ implementer: 'reviewer opencode/model-a' }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^check-round: documents\/rounds\/fixture\.md: /);
    expect(failures[0]).toContain('reviewer opencode/model-a');
    expect(failures[0]).toContain('R1');
  });

  it('rejects a segment with no provider/model', () => {
    const failures = checkText(roundDoc({ implementer: 'worker deepseek-v4.1-flash' }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('worker deepseek-v4.1-flash');
    expect(failures[0]).toContain('malformed Implementer segment');
  });

  it('rejects a missing Implementer row', () => {
    const failures = checkText(roundDoc({ implementer: null }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^check-round: documents\/rounds\/fixture\.md: /);
    expect(failures[0]).toContain('"Implementer"');
  });

  it('rejects an empty Implementer cell', () => {
    const failures = checkText(roundDoc({ implementer: '  ' }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('Implementer row is empty');
  });
});

describe('check-round: Tier 2 needs a builder who is not the parent (R2)', () => {
  it('rejects a Tier 2 doc with no worker segment and no deviation', () => {
    const failures = checkText(roundDoc({ tier: '2', implementer: PARENT }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^check-round: documents\/rounds\/fixture\.md: /);
    expect(failures[0]).toContain('Tier 2');
    expect(failures[0]).toContain('worker');
    expect(failures[0]).toContain('Tier 2 parent-authored:');
    expect(failures[0]).toContain('R2');
  });

  it('accepts a Tier 2 doc with a long enough parent-authored deviation', () => {
    const text = roundDoc({
      tier: '2',
      implementer: PARENT,
      deviations: ['Tier 2 parent-authored: a reason long enough'],
    });
    expect(checkText(text)).toEqual([]);
  });

  it('accepts a bulleted parent-authored deviation', () => {
    const text = roundDoc({
      tier: '2',
      implementer: PARENT,
      deviations: ['- Tier 2 parent-authored: a reason long enough'],
    });
    expect(checkText(text)).toEqual([]);
  });

  it('rejects a parent-authored deviation shorter than 20 characters', () => {
    const text = roundDoc({
      tier: '2',
      implementer: PARENT,
      deviations: ['Tier 2 parent-authored: too short'],
    });
    const failures = checkText(text);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('R2');
  });

  it('reads the leading number of a suffixed Tier cell', () => {
    const failures = checkText(roundDoc({ tier: '2 - Reviewed', implementer: PARENT }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('R2');
  });

  it('rejects a Tier cell with no leading number', () => {
    const failures = checkText(roundDoc({ tier: 'TBD', implementer: PARENT }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('no leading number');
    expect(failures[0]).toContain('R2');
  });

  it('rejects a Tier value outside 0, 1 and 2', () => {
    const failures = checkText(roundDoc({ tier: '3', implementer: PARENT }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^check-round: documents\/rounds\/fixture\.md: /);
    expect(failures[0]).toContain('is not 0, 1 or 2');
    expect(failures[0]).toContain('R2');
  });

  it('rejects an out-of-range Tier value in a suffixed cell too', () => {
    const failures = checkText(roundDoc({ tier: '4 - Round of four', implementer: PARENT }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('is not 0, 1 or 2');
  });

  it('ignores a parent-authored line outside ## Deviations', () => {
    const text = roundDoc({ tier: '2', implementer: PARENT }).replace(
      'Fixture round.',
      'Tier 2 parent-authored: a reason long enough to count',
    );
    const failures = checkText(text);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('R2');
  });
});

describe('check-round: a round doc is required for code (R3)', () => {
  it('fails when the change touches ui/src and no round doc is selected', () => {
    const failures = check([], ['ui/src/x.ts'], () => '');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(
      'a round doc is required when the change touches src/** or ui/src/**',
    );
    expect(failures[0]).toContain('ui/src/x.ts');
    expect(failures[0]).toContain('R3');
  });

  it('fails when the change touches src and no round doc is selected', () => {
    const failures = check([], ['src/app.ts'], () => '');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('src/app.ts');
  });

  it('passes a docs-only change with no round doc', () => {
    expect(check([], ['documents/specs/member-registrations-api.md'], () => '')).toEqual([]);
  });
});

describe('check-round: the path-derived Tier floor (R4)', () => {
  it('requires Tier 2 for src/db/migrations.ts', () => {
    const failures = checkText(roundDoc({ tier: '1', implementer: PARENT }), [
      'src/db/migrations.ts',
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('src/db/migrations.ts');
    expect(failures[0]).toContain('Tier >= 2');
    expect(failures[0]).toContain('R4');
  });

  it('requires Tier 2 for src/schemas/** and src/authn/**', () => {
    for (const path of ['src/schemas/member.ts', 'src/authn/session.ts']) {
      const failures = checkText(roundDoc({ tier: '1', implementer: PARENT }), [path]);
      expect(failures, path).toHaveLength(1);
      expect(failures[0], path).toContain(path);
    }
  });

  it('requires Tier 1 for other src/** paths', () => {
    const failures = checkText(roundDoc({ tier: '0', implementer: PARENT }), ['src/app.ts']);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('src/app.ts');
    expect(failures[0]).toContain('Tier >= 1');
  });

  it('requires Tier 1 for ui/src/** paths', () => {
    const failures = checkText(roundDoc({ tier: '0', implementer: PARENT }), [
      'ui/src/pages/Headcount.tsx',
    ]);
    expect(failures.some((failure) => failure.includes('ui/src/pages/Headcount.tsx'))).toBe(true);
    expect(failures.some((failure) => failure.includes('Tier >= 1'))).toBe(true);
  });

  it('reads a suffixed Tier cell for the floor', () => {
    const failures = checkText(roundDoc({ tier: '0 - Solo (process/docs)', implementer: PARENT }), [
      'src/app.ts',
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('Tier >= 1');
  });

  it('accepts a doc that meets the floor', () => {
    const text = roundDoc({
      tier: '2',
      implementer: 'parent opencode/model-a; worker ollama-cloud/model-b',
    });
    expect(checkText(text, ['src/db/migrations.ts'])).toEqual([]);
  });

  it('is not applied in --files mode, where there is no diff', () => {
    expect(checkText(roundDoc({ tier: '0', implementer: PARENT }), null)).toEqual([]);
  });
});

describe('check-round: the required header rows', () => {
  it('fails a doc that is missing a required row', () => {
    const failures = checkText(roundDoc({ omitRows: ['Base'] }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^check-round: documents\/rounds\/fixture\.md: /);
    expect(failures[0]).toContain('missing round-doc header row "Base"');
  });

  it('names every required row it is missing', () => {
    const failures = checkText(roundDoc({ omitRows: ['Base', 'Review rounds'] }));
    expect(failures).toHaveLength(2);
    expect(failures.join('\n')).toContain('"Base"');
    expect(failures.join('\n')).toContain('"Review rounds"');
  });

  it('names each of the five required rows when it is the one omitted', () => {
    for (const row of REQUIRED_ROWS) {
      const failures = checkText(roundDoc({ omitRows: [row] }));
      expect(failures, row).toHaveLength(1);
      expect(failures[0], row).toContain(`missing round-doc header row "${row}"`);
    }
  });
});

describe('check-round: the reviewer seat verdict (R5)', () => {
  it('accepts a Tier 2 doc whose review records a consistent seat', () => {
    const text = roundDoc({
      tier: '2',
      implementer: 'parent opencode/model-a; worker ollama-cloud/model-b',
      review: ['Standards: PASS', 'Seat: consistent'],
    });
    expect(checkText(text)).toEqual([]);
  });

  it('rejects a Tier 2 doc with no Review section', () => {
    const failures = checkText(
      roundDoc({
        tier: '2',
        implementer: 'parent opencode/model-a; worker ollama-cloud/model-b',
        review: null,
      }),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('Seat: consistent');
    expect(failures[0]).toContain('R5');
  });

  it('rejects a Review section with no Seat line', () => {
    const failures = checkText(
      roundDoc({
        tier: '2',
        implementer: 'parent opencode/model-a; worker ollama-cloud/model-b',
        review: ['Standards: PASS', 'Verdict: ACCEPTED'],
      }),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('R5');
  });

  it('rejects a contradicted seat', () => {
    const failures = checkText(
      roundDoc({
        tier: '2',
        implementer: 'parent opencode/model-a; worker ollama-cloud/model-b',
        review: ['Seat: contradicted'],
      }),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('contradicted');
    expect(failures[0]).toContain('REWORK');
  });

  it('does not apply below Tier 2', () => {
    expect(checkText(roundDoc({ tier: '1', review: null }))).toEqual([]);
  });
});

describe('check-round: the mock sign-off (R6)', () => {
  const SIGNED_ROW = `| ${MOCK} | not-live | signed |`;

  it('accepts a signed row that resolves to a signed catalogue state, plus the coverage line', () => {
    expect(checkSurface(roundDoc({ mockSignOff: [SIGNED_ROW, '', COVERAGE] }))).toEqual([]);
  });

  it('fails a ui/src change with no "## Mock sign-off" section', () => {
    const failures = checkSurface(roundDoc());
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('## Mock sign-off');
    expect(failures[0]).toContain('R6');
  });

  it('fails when the row names a state whose coverage is "target"', () => {
    const failures = checkSurface(roundDoc({ mockSignOff: [SIGNED_ROW, COVERAGE] }), {
      [CATALOGUE]: catalogueText('target'),
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('coverage "target", not "signed"');
    expect(failures[0]).toContain('R6');
  });

  it('fails when the coverage line is missing', () => {
    const failures = checkSurface(roundDoc({ mockSignOff: [SIGNED_ROW] }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('Mock coverage: claimed');
    expect(failures[0]).toContain('R6');
  });

  it('fails a surface change when no claim catalogue exists anywhere', () => {
    const failures = checkSurface(roundDoc(), {}, undefined, { listCatalogues: () => [] });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('a surface change with no catalogue');
    expect(failures[0]).toContain('R6');
  });

  it('fails a row whose catalogue file does not exist', () => {
    const failures = checkSurface(roundDoc({ mockSignOff: [SIGNED_ROW, COVERAGE] }), {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(CATALOGUE);
    expect(failures[0]).toContain('does not exist');
  });

  it('fails a section whose only rows name no mock image', () => {
    const failures = checkSurface(
      roundDoc({ mockSignOff: ['| not-live | signed |', '', COVERAGE] }),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('has no row naming "mockups/<set>/<state>.png"');
    expect(failures[0]).toContain('R6');
  });

  it('fails a row whose png is not any state mock.path in the catalogue', () => {
    const row = '| mockups/headcount/99-unknown-state.png | not-live | signed |';
    const failures = checkSurface(roundDoc({ mockSignOff: [row, COVERAGE] }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(
      'has no state whose mock.path is mockups/headcount/99-unknown-state.png',
    );
    expect(failures[0]).toContain('R6');
  });

  it('fails a row that does not mark its state "signed"', () => {
    const row = `| ${MOCK} | not-live | verified |`;
    const failures = checkSurface(roundDoc({ mockSignOff: [row, COVERAGE] }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('does not mark the state "signed"');
    expect(failures[0]).toContain('R6');
  });

  it('does not apply to a change that only touches src/', () => {
    expect(checkSurface(roundDoc(), undefined, ['src/app.ts'])).toEqual([]);
  });

  it('does not apply in --files mode, where there is no diff', () => {
    expect(checkSurface(roundDoc(), undefined, null)).toEqual([]);
  });
});

describe('check-round: the precommit wiring', () => {
  it('runs check-round with --staged in the precommit profile', () => {
    // Neither script exports its table, and importing verify.mjs would run it, so the pin is
    // textual — the same style as the git-executor seat test.
    expect(read('scripts/verify.mjs')).toContain(
      "precommit: ['check-round', 'format', 'lint', 'typecheck', 'test'],",
    );
    expect(read('scripts/gates.mjs')).toContain(
      "return ['npm', ['run', 'check-round', '--', '--staged']];",
    );
  });
});

describe('check-round: --staged reads the index', () => {
  it('asks git for the staged name-only list', () => {
    const calls: string[][] = [];
    const paths = staged((args) => {
      calls.push(args);
      return 'documents/rounds/fixture.md\r\nui/src/pages/headcount/HeadcountPage.tsx\r\n';
    });
    expect(paths).toEqual([
      'documents/rounds/fixture.md',
      'ui/src/pages/headcount/HeadcountPage.tsx',
    ]);
    expect(calls).toEqual([['diff', '--cached', '--name-only', '--diff-filter=ACM']]);
  });

  it('tolerates blank lines, CRLF and surrounding spaces', () => {
    expect(parse('src/app.ts\r\n\n  ui/src/x.tsx  \n')).toEqual(['src/app.ts', 'ui/src/x.tsx']);
  });

  it('feeds the staged list into R6 exactly as the diff mode does', () => {
    const stagedPaths = staged(() => 'ui/src/pages/x.tsx\ndocuments/rounds/fixture.md\n');
    const failures = check([DOC], stagedPaths, (path) => {
      if (path === DOC) return roundDoc();
      throw new Error(`missing ${path}`);
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('## Mock sign-off');
  });
});

describe('check-round: the existing contract still holds', () => {
  it('reports a selected round doc that does not exist', () => {
    const failures = check([DOC], null, () => {
      throw new Error('missing');
    });
    expect(failures).toEqual([`check-round: ${DOC}: round doc not found`]);
  });

  it('still reports a missing gate-run signature', () => {
    const failures = checkText(roundDoc().replace(GATE, 'gate-run pending'));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('gate-run');
  });
});
