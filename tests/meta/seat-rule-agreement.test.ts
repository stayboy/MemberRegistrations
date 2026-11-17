import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string): string => readFileSync(join(repoRoot, relative), 'utf8');

/**
 * One owner per seat rule (`documents/agents/orchestrator-policy.md`, owner 2026-11-17): a rule stated
 * twice drifts, and the hash tripwire proves only that the reviewed text landed - never that two files
 * agree. This asserts the split, not the wording: the policy carries the mechanics, the seat file the
 * refusal and no default, the merge policy the pointer and no arithmetic. A widening drift (a second
 * file permitting what another forbids) is the direction this test exists to catch.
 */
describe('seat rule agreement', () => {
  const policy = read('documents/agents/orchestrator-policy.md');
  const mergePolicy = read('.github/merge-policy.md');
  const fallback = read('.opencode/agents/git-executor-fallback.md');
  const agents = read('AGENTS.md');

  it('keeps the budget default, the 0-parks rule and the retry in the policy', () => {
    expect(policy).toContain('12 briefs by default');
    expect(policy).toContain('parking every verb');
    expect(policy).toContain('retried **once');
  });

  it('leaves the seat file the refusal, and no default it could infer', () => {
    expect(fallback).toContain('REFUSED: no git-seat-budget');
    expect(fallback).not.toMatch(/or `12` when it declares none/);
    expect(fallback).not.toMatch(/default is 12/);
  });

  it('leaves the merge policy the pointer, and no arithmetic', () => {
    expect(mergePolicy).toContain('orchestrator-policy.md');
    expect(mergePolicy).not.toMatch(/12 briefs/);
    expect(mergePolicy).not.toMatch(/0` parks/);
  });

  it('names the ownership table, so the split itself has a home', () => {
    expect(policy).toContain('One owner per seat rule');
    expect(policy).toContain('A drift is asymmetric');
  });

  it("carries the ownership table's five rules", () => {
    for (const rule of [
      'What a verb authorises',
      "A brief's shape",
      "A round's budget amount",
      'The default (12 briefs)',
      'The model ids and their candidates',
    ]) {
      expect(policy).toContain(rule);
    }
  });

  it('leaves AGENTS.md the pointer, and no arithmetic of its own', () => {
    expect(agents).toContain('orchestrator-policy.md');
    expect(agents).not.toMatch(/12 briefs/);
    expect(agents).not.toMatch(/0` parks/);
  });
});
