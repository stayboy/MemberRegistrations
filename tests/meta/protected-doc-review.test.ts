import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const recordPath = join(repoRoot, 'documents', 'agents', 'protected-doc-reviews.json');
const canonicalDir =
  process.env.ORCHESTRATOR_SKILL_DIR ?? join(homedir(), '.agents', 'skills', 'orchestrator');
const canonicalPresent = existsSync(canonicalDir);

const REPO_PROTECTED = [
  'AGENTS.md',
  'documents/agents/orchestrator-policy.md',
  'documents/agents/component-first.md',
  'documents/lessons.md',
  'documents/rounds/README.md',
  '.github/merge-policy.md',
];

function markdownUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return markdownUnder(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

function protectedPaths(): string[] {
  const paths = [...REPO_PROTECTED];
  if (canonicalPresent) {
    for (const file of markdownUnder(canonicalDir)) {
      paths.push(`canonical/${relative(canonicalDir, file).replaceAll('\\', '/')}`);
    }
  }
  return paths.sort();
}

function fileFor(path: string): string {
  return path.startsWith('canonical/')
    ? join(canonicalDir, path.slice('canonical/'.length))
    : join(repoRoot, path);
}

/** SHA-256 of the reviewed text: CRLF→LF, trailing whitespace trimmed, leading BOM dropped. */
function attestationHash(text: string): string {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\uFEFF/, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

interface Review {
  path: string;
  sha256: string;
  reviewedBy?: string;
  model: string;
  build?: string;
  reason: string;
  fallbackReason?: string;
  verdict?: string;
  attestation?: string;
  at?: string;
}

function reviews(): Review[] {
  const record = JSON.parse(readFileSync(recordPath, 'utf8')) as { reviews: Review[] };
  return record.reviews;
}

describe('protected documents', () => {
  it('keeps a non-empty protected set with the entry points', () => {
    const paths = protectedPaths();
    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('documents/agents/orchestrator-policy.md');
    expect(paths).toContain('documents/agents/component-first.md');
    expect(paths).toContain('documents/lessons.md');
    expect(paths).toContain('documents/rounds/README.md');
    expect(paths).toContain('.github/merge-policy.md');
    if (canonicalPresent) expect(paths).toContain('canonical/SKILL.md');
    for (const path of paths) {
      expect(existsSync(fileFor(path)), `${path} is protected but missing`).toBe(true);
    }
  });

  it('attests every protected document', () => {
    const recorded = new Set(reviews().map((review) => review.path));
    const missing = protectedPaths().filter((path) => !recorded.has(path));
    expect(missing).toEqual([]);
  });

  it('matches every recorded hash to the current text', () => {
    const byPath = new Map(reviews().map((review) => [review.path, review]));
    for (const path of protectedPaths()) {
      const review = byPath.get(path);
      if (!review) continue;
      expect(
        attestationHash(readFileSync(fileFor(path), 'utf8')),
        `${path} changed after it was reviewed`,
      ).toBe(review.sha256);
    }
  });

  it('uses the first-choice reviewer, or the fallback with a stated reason', () => {
    for (const review of reviews()) {
      if (review.model.toLowerCase() === 'glm-5.3') {
        expect(
          review.fallbackReason?.trim(),
          `${review.path} fell back without a reason`,
        ).toBeTruthy();
        continue;
      }
      expect(review.model).toBe('deepseek-v4-pro');
      expect(review.build).toBe('0813');
    }
  });

  it('requires a reason naming changes, why and rejected', () => {
    for (const review of reviews()) {
      const reason = review.reason.toLowerCase();
      expect(reason, `${review.path} lacks changes:`).toContain('changes:');
      expect(reason, `${review.path} lacks why:`).toContain('why:');
      expect(reason, `${review.path} lacks rejected:`).toContain('rejected:');
    }
  });

  it('has no orphan attestations', () => {
    const available = new Set(protectedPaths());
    const orphans = reviews()
      .map((review) => review.path)
      .filter(
        (path) => !available.has(path) && !(path.startsWith('canonical/') && !canonicalPresent),
      );
    expect(orphans).toEqual([]);
  });

  it('normalizes line endings and trailing whitespace but not content', () => {
    expect(attestationHash('a\r\nb\r\n')).toBe(attestationHash('a\nb\n'));
    expect(attestationHash('a\nb\n')).toBe(attestationHash('a  \nb\t\n'));
    expect(attestationHash('a\nb\n')).not.toBe(attestationHash('a\nc\n'));
  });
});
