// sign-unattended - record an unattended signature on a mock state, and list what was signed.
//
// The owner pre-authorises this (AGENTS.md section 17, "Auto-signed mocks", 2026-11-15): in unattended
// mode a refreshed mock may be signed so the round can close, and the catalogue MUST say `by:
// "unattended"` with the basis - never `by: "owner"`, which only the owner can attest. When the
// unattended work ends the reviewer inspects the list this prints, and a state it rejects drops to
// `target` and is re-cut.
//
//   node scripts/mock/sign-unattended.mjs <set> [<set> ...]        apply, printing every state it signed
//   node scripts/mock/sign-unattended.mjs --list <set> [...]       print what would be signed, change nothing
//
// It only touches a state whose file hash differs from the catalogue: an unchanged state keeps the
// signature it already carries.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const sets = args.filter((arg) => !arg.startsWith('--'));

if (sets.length === 0) {
  console.error('usage: sign-unattended.mjs [--list] <set> [<set> ...]');
  process.exit(1);
}

const basis =
  'owner pre-authorisation 2026-11-15 (AGENTS.md section 17, auto-signed mocks); pending the reviewer second look';
const at = new Date().toISOString().slice(0, 10);
let signed = 0;
let unchanged = 0;
let stale = 0;

for (const set of sets) {
  const cataloguePath = join(repoRoot, 'documents', 'mock-claims', `${set}.json`);
  const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8'));

  for (const [name, state] of Object.entries(catalogue.states)) {
    if (state.coverage === 'reference') continue;
    const file = join(repoRoot, state.mock.path);
    const actual = sha256(file);
    if (actual === state.mock.sha256) {
      unchanged += 1;
      continue;
    }

    // A state the owner signed is never rewritten here. If its bytes moved the refresh voided that
    // signature; re-signing is the owner's, so the tool reports it instead of swapping a signature for
    // its own.
    if (state.coverage === 'signed') {
      console.log(`${set}/${name}  signed but stale - the owner must re-sign  ${actual}`);
      stale += 1;
      continue;
    }

    console.log(`${set}/${name}  ${state.coverage} -> auto-signed  ${actual}`);
    if (listOnly) {
      signed += 1;
      continue;
    }

    state.mock.sha256 = actual;
    state.coverage = 'auto-signed';
    state.signed = { by: 'unattended', at, sha256: actual, basis };
    signed += 1;
  }

  if (!listOnly) {
    writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`);
  }
}

console.log(
  `\n${listOnly ? 'would auto-sign' : 'auto-signed'}: ${signed} · unchanged: ${unchanged} · signed-but-stale: ${stale}`,
);
if (stale > 0) {
  console.error(
    "\nA signed state moved. Re-signing is the owner's: run it through target, then sign.",
  );
  process.exitCode = 1;
}
if (signed > 0) {
  console.log(
    'Record this list in the round doc; the reviewer inspects it when the unattended work ends.',
  );
}
