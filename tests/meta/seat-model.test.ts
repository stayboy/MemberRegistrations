import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string): string => readFileSync(join(repoRoot, relative), 'utf8');

type Buckets = {
  outsideWindow?: readonly string[];
  insideWindow?: readonly string[];
  anyWindow?: readonly string[];
};

type Seats = {
  classes: Record<string, Buckets>;
  modelExceptions?: Record<string, { allowed: string; basis: string }>;
};

/**
 * The seat file to capability class mapping. `documents/agents/seats.json` names classes, not files,
 * and the file name is the only link between the two: a rung file inherits its class from its base
 * name, so `git-executor-fallback.md` ranks on the `git-executor` class like rung 1 does, and the
 * read-only reviewer is the `reviewer-pro` class.
 */
const SEAT_CLASS: Record<string, string> = {
  'git-executor.md': 'git-executor',
  'git-executor-fallback.md': 'git-executor',
  'publish-executor.md': 'publish-executor',
  'publish-executor-fallback.md': 'publish-executor',
  'reviewer.md': 'reviewer-pro',
};

const AGENT_DIR = '.opencode/agents';
const SEATS_FILE = 'documents/agents/seats.json';

const seats = JSON.parse(read(SEATS_FILE)) as Seats;
const seatFiles = readdirSync(join(repoRoot, AGENT_DIR))
  .filter((name) => name.endsWith('.md'))
  .sort();

/** The frontmatter `model:` value, or `null` when the frontmatter carries none. */
function frontmatterModel(text: string): string | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  return /^model:[ \t]*(\S+)[ \t]*$/m.exec(frontmatter)?.[1] ?? null;
}

/** Every model a class ranks, in any window bucket. */
function rankedModels(className: string): string[] {
  const buckets = seats.classes[className] ?? {};
  return [
    ...(buckets.outsideWindow ?? []),
    ...(buckets.insideWindow ?? []),
    ...(buckets.anyWindow ?? []),
  ];
}

/** A model outside the class's ranked lists is accepted only as that class's recorded exception. */
function isUnlisted(className: string, model: string): boolean {
  const accepted = rankedModels(className);
  const exception = seats.modelExceptions?.[className];
  if (exception) accepted.push(exception.allowed);
  return !accepted.includes(model);
}

describe('seat models', () => {
  it('maps every seat file to a class that seats.json defines', () => {
    expect(seatFiles.length).toBeGreaterThan(0);
    for (const file of seatFiles) {
      const className = SEAT_CLASS[file];
      expect(className, `${AGENT_DIR}/${file} has no declared class`).toBeDefined();
      expect(
        seats.classes[className as string],
        `${className} has no entry in ${SEATS_FILE}`,
      ).toBeDefined();
    }
    for (const file of Object.keys(SEAT_CLASS)) {
      expect(seatFiles, `${AGENT_DIR}/${file} is mapped but absent`).toContain(file);
    }
  });

  it('pins every seat file to a model its class ranks or records as an exception', () => {
    for (const file of seatFiles) {
      const path = `${AGENT_DIR}/${file}`;
      const model = frontmatterModel(read(path));
      expect(model, `${path} carries no frontmatter model`).not.toBeNull();
      const className = SEAT_CLASS[file] as string;
      expect(
        isUnlisted(className, model as string),
        `${path} pins ${model}, which is in no ${className} list and is not its recorded exception`,
      ).toBe(false);
    }
  });

  it('fails a model that is in no list and is not the class exception', () => {
    expect(rankedModels('publish-executor').length).toBeGreaterThan(0);
    expect(isUnlisted('publish-executor', 'acme/ghost-model')).toBe(true);
    expect(isUnlisted('git-executor', 'acme/ghost-model')).toBe(true);
    expect(isUnlisted('no-such-class', 'opencode/beam-free')).toBe(true);
  });

  it('honours the recorded exception, scoped to the class that records it', () => {
    const exception = seats.modelExceptions?.['git-executor'];
    expect(exception?.allowed, 'the git seat exception must name beam-free').toBe(
      'opencode/beam-free',
    );
    expect(exception?.basis, 'the git seat exception must state the owner basis').toMatch(
      /owner keeps the rung as is .*2026-11-22/,
    );
    expect(isUnlisted('git-executor', 'opencode/beam-free')).toBe(false);
    // The exception belongs to the git class alone: an unrelated class does not inherit it.
    expect(isUnlisted('worker-flash', 'opencode/beam-free')).toBe(true);
  });
});
