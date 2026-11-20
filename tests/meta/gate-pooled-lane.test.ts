import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the gate is plain ESM outside the type-checked src/ tree, so it has no types.
import { POOLED_LANE_REQUIRED, requiresPooledLane } from '../../scripts/gates.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const requires = requiresPooledLane as (profile: string, env: NodeJS.ProcessEnv) => boolean;

describe('gate policy: the pooled pg lane', () => {
  it('requires TEST_DATABASE_URL on the full profile only when it is unset', () => {
    expect(requires('full', {})).toBe(true);
    expect(requires('full', { TEST_DATABASE_URL: 'postgres://scratch/db' })).toBe(false);
  });

  it('keeps the fast and precommit profiles skipping the lane', () => {
    expect(requires('fast', {})).toBe(false);
    expect(requires('precommit', {})).toBe(false);
  });

  it('names the variable, the scratch warning and the quick gate in the failure line', () => {
    expect(POOLED_LANE_REQUIRED).toContain('TEST_DATABASE_URL');
    expect(POOLED_LANE_REQUIRED).toContain('never production');
    expect(POOLED_LANE_REQUIRED).toContain('verify:fast');
  });

  it('keeps the full profile at seven steps', () => {
    // Importing verify.mjs would run it, so the pin is textual.
    const text = readFileSync(join(repoRoot, 'scripts', 'verify.mjs'), 'utf8');
    expect(text).toContain(
      "full: ['skill', 'check-round', 'format', 'lint', 'typecheck', 'test', 'build'],",
    );
  });

  it('passes the profile into runGate, so the guard cannot go inert', () => {
    // The same textual pin: verify.mjs runs its loop on import.
    const text = readFileSync(join(repoRoot, 'scripts', 'verify.mjs'), 'utf8');
    expect(text).toContain('runGate(step, { profile });');
  });
});
