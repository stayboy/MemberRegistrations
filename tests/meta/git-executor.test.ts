import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SEAT_FILES = [
  '.opencode/agents/git-executor.md',
  '.opencode/agents/git-executor-fallback.md',
];
const CANARY_FILES = [...SEAT_FILES, 'documents/rounds/git-beam-seat.md'];

/** A bearer/password/secret/token assignment, not the words themselves. */
const SECRET_SHAPE = /\b(bearer|password|secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i;

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('git executor seat', () => {
  it('pins rung 1 to opencode/beam-free and rung 2 to ollama-cloud/mimo-v2.6-flash', () => {
    expect(read(SEAT_FILES[0])).toContain('model: opencode/beam-free');
    expect(read(SEAT_FILES[1])).toContain('model: ollama-cloud/mimo-v2.6-flash');
  });

  it('forbids the destructive commands and hook bypasses', () => {
    for (const file of SEAT_FILES) {
      const text = read(file);
      for (const needle of [
        'push origin main',
        '--force',
        'reset --hard',
        'clean -fd',
        'branch -D',
        '--no-verify',
        '--admin',
      ]) {
        expect(text, `${file} lacks ${needle}`).toContain(needle);
      }
    }
  });

  it('keeps the git-state-only rule and carries no secret-shaped string', () => {
    expect(read(SEAT_FILES[0])).toContain(
      'Never print environment values, tokens, credentials or file contents',
    );
    for (const file of CANARY_FILES) {
      expect(read(file), `${file} carries a secret-shaped string`).not.toMatch(SECRET_SHAPE);
    }
  });
});
