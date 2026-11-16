import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The failing artefact behind the "a claim names its scope" lesson (`documents/lessons.md`).
 *
 * The MVP parity pack is the release's parity claim. It may claim a row only after someone has compared
 * it, and it must name the surfaces it cannot claim at all - otherwise the same evidence reads as clean
 * parity across every row. Before 2026-11-15 the pack carried five `owed` rows and no check noticed;
 * this test is the one that would have.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packPath = join(repoRoot, 'documents', 'parity', 'comparison-pack.md');
const registerPath = join(repoRoot, 'documents', 'parity', 'unclaimables.md');

/** The pack's top table: the rows above the first `## ` heading. */
function topTableRows(text: string): string[] {
  const end = text.indexOf('\n## ');
  const head = end === -1 ? text : text.slice(0, end);
  return head
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .filter((line) => !/^\|\s*-/.test(line.trimStart()));
}

function readCell(row: string): string {
  const cells = row.split('|').map((cell) => cell.trim());
  // The pack bolds its verdicts (`**read — matches**`), so strip the emphasis before reading the status:
  // an owed row written in that convention must not slip past the check the lesson names.
  return (cells.at(-2) ?? '').replaceAll('*', '').toLowerCase();
}

describe('the parity claim names its scope', () => {
  const text = readFileSync(packPath, 'utf8');

  it('leaves no row owed', () => {
    const owed = topTableRows(text).filter((row) => readCell(row).includes('owed'));
    expect(
      owed,
      `the pack still carries unread rows; read them or move them out of the claim:\n${owed.join('\n')}`,
    ).toEqual([]);
  });

  it('names the surfaces it cannot claim', () => {
    const rows = topTableRows(text);
    const notClaimable = rows.filter((row) => readCell(row).includes('not claimable'));
    expect(
      notClaimable.length,
      'the pack must list the surfaces with no signed mock as "not claimable": a claim whose edge is unstated is read as "all of it"',
    ).toBeGreaterThan(0);
  });

  it('states its verdict, not only its rows', () => {
    expect(text).toContain('## What the pack found');
  });
});

/** A register row's cells, with its leading and trailing empty split dropped. */
function tableCells(row: string): string[] {
  return row
    .split('|')
    .map((cell) => cell.trim())
    .slice(1, -1);
}

/** The register's table body: the header row and the separator row dropped. */
function registerRows(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .slice(1)
    .filter((row) => !tableCells(row).every((cell) => /^-+$/.test(cell)));
}

describe('the un-claimables register', () => {
  const text = existsSync(registerPath) ? readFileSync(registerPath, 'utf8') : '';

  it('exists and carries its title', () => {
    expect(existsSync(registerPath), `the un-claimables register is missing: ${registerPath}`).toBe(
      true,
    );
    expect(text, 'the register must open with its own heading').toContain(
      '# The un-claimables register',
    );
  });

  it('gives every row all four of its fields', () => {
    const broken = registerRows(text).filter((row) => {
      const cells = tableCells(row);
      return cells.length !== 4 || cells.some((cell) => cell.length === 0);
    });
    expect(
      broken,
      `a register row lost a field; every row names the surface, what is unproven, why it is accepted and what would close it:\n${broken.join('\n')}`,
    ).toEqual([]);
  });

  it('lists at least four un-claimable rows', () => {
    expect(
      registerRows(text).length,
      'the register must keep a row per un-claimable surface rather than a paragraph that loses one',
    ).toBeGreaterThan(3);
  });

  it('names every surface the pack calls not claimable', () => {
    const lower = text.toLowerCase();
    const missing = [
      'member detail',
      'add and edit member',
      'contacts dialog',
      'attendance dialog',
      'import batch list',
      'ussd simulator',
      'legacy prototype captures',
    ].filter((name) => !lower.includes(name));
    expect(
      missing,
      `the surfaces the pack cannot claim are missing from the register:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('records the gate risk that is not a surface', () => {
    const lower = text.toLowerCase();
    expect(lower, 'the register must name the flaky deep-link assertion').toContain('deep-link');
    expect(lower, 'the register must call that assertion flaky').toContain('flaky');
  });
});
