import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the guard is plain ESM outside the type-checked src/ tree, so it has no types.
import { checkDocuments } from '../../scripts/check-round.mjs';

type CheckDocuments = (
  files: string[],
  changedPaths: string[] | null,
  readText: (path: string) => string,
) => string[];

const check = checkDocuments as CheckDocuments;

const DOC = 'documents/rounds/fixture.md';
const GATE = 'gate-run 2026-11-11T09:00:00Z profile=full steps=12/12 lines=140 bytes=8192';
const PARENT = 'parent opencode/deepseek-v4.1-flash-free';

interface DocOptions {
  tier?: string;
  /** `null` omits the row entirely. */
  implementer?: string | null;
  deviations?: string[];
  /** Header rows to omit by name, e.g. `['Base']`. */
  omitRows?: string[];
}

/** A complete round doc: header rows, the gate-run signature and a `## Deviations` section. */
function roundDoc(options: DocOptions = {}): string {
  const { tier = '1', implementer = PARENT, deviations = [], omitRows = [] } = options;
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
    '# Round — fixture',
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
    '## Acceptance',
    '',
    'Met.',
    '',
    '## Deviations',
    '',
    ...(deviations.length === 0 ? ['- none'] : deviations),
    '',
  ].join('\n');
}

function checkText(text: string, changedPaths: string[] | null = null): string[] {
  return check([DOC], changedPaths, () => text);
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

  it('reads a suffixed Tier cell for the floor', () => {
    const failures = checkText(roundDoc({ tier: '0 - Solo (process/docs)', implementer: PARENT }), [
      'ui/src/x.ts',
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
