import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the tool is plain ESM outside the type-checked src/ tree, so it has no types.
import { planSignatures } from '../../scripts/mock/sign-unattended.mjs';

// The owner's rule (AGENTS.md section 17, 2026-11-15): auto-sign applies only to a `target`, is never the
// status quo, and never overrides a signature the owner gave. These cases are that rule, mechanically.

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const catalogue = (states: Record<string, { coverage: string; sha256: string }>) => ({
  set: 'fixture',
  states: Object.fromEntries(
    Object.entries(states).map(([name, state]) => [
      name,
      {
        mock: { path: `mockups/fixture/${name}.png`, sha256: state.sha256 },
        coverage: state.coverage,
      },
    ]),
  ),
});

const plan = (states: Record<string, { coverage: string; sha256: string }>, actual: string) =>
  (planSignatures as (c: unknown, sha: (s: unknown) => string) => unknown[])(
    catalogue(states),
    () => actual,
  );

describe('sign-unattended: the state machine', () => {
  it('auto-signs a target whose bytes did not move, because a target has no signature to keep', () => {
    expect(plan({ live: { coverage: 'target', sha256: A } }, A)).toEqual([
      expect.objectContaining({ name: 'live', from: 'target', action: 'auto-sign' }),
    ]);
  });

  it('auto-signs a target whose bytes moved', () => {
    expect(plan({ live: { coverage: 'target', sha256: A } }, B)).toEqual([
      expect.objectContaining({ action: 'auto-sign', actual: B }),
    ]);
  });

  it('leaves a signed state untouched when its bytes match', () => {
    expect(plan({ live: { coverage: 'signed', sha256: A } }, A)).toEqual([
      expect.objectContaining({ from: 'signed', action: 'unchanged' }),
    ]);
  });

  it('never auto-signs a signed state whose bytes moved', () => {
    expect(plan({ live: { coverage: 'signed', sha256: A } }, B)).toEqual([
      expect.objectContaining({ from: 'signed', action: 'unchanged', actual: B }),
    ]);
  });

  it('leaves an auto-signed state alone when its bytes match, so a rerun is idempotent', () => {
    expect(plan({ live: { coverage: 'auto-signed', sha256: A } }, A)).toEqual([
      expect.objectContaining({ from: 'auto-signed', action: 'unchanged' }),
    ]);
  });

  it('re-signs an auto-signed state whose bytes moved, as a re-cut state', () => {
    expect(plan({ live: { coverage: 'auto-signed', sha256: A } }, B)).toEqual([
      expect.objectContaining({ from: 'auto-signed', action: 'auto-sign' }),
    ]);
  });

  it('only corrects a reference hash, never signs it', () => {
    expect(plan({ live: { coverage: 'reference', sha256: A } }, B)).toEqual([
      expect.objectContaining({ action: 'correct-reference-hash' }),
    ]);
    expect(plan({ live: { coverage: 'reference', sha256: A } }, A)).toEqual([
      expect.objectContaining({ action: 'unchanged' }),
    ]);
  });

  it('plans every state in the catalogue, in order', () => {
    const result = plan(
      { a: { coverage: 'target', sha256: A }, b: { coverage: 'signed', sha256: A } },
      A,
    ) as { name: string }[];
    expect(result.map((item) => item.name)).toEqual(['a', 'b']);
  });
});
