// sign-unattended - record an unattended signature on a mock state, and list what was signed.
//
// The owner pre-authorises this (AGENTS.md section 17, "Auto-signed mocks", 2026-11-15): in unattended
// mode a refreshed mock may carry `auto-signed` so the round can close, and the catalogue MUST say
// `by: "unattended"` with the basis - never `by: "owner"`, which only the owner can attest. When the
// unattended work ends the reviewer inspects the list this prints, and a state it rejects drops to
// `target` and is re-cut.
//
// The state machine, one line each:
//   target      -> auto-signed   always: a target has no signature to preserve, so it is the state the
//                                owner authorised in advance (never the status quo)
//   auto-signed -> unchanged     when its bytes did not move
//   auto-signed -> auto-signed   when its bytes moved (the state was re-cut)
//   signed      -> untouched     and reported as stale when its bytes moved: re-signing is the owner's,
//                                so a refresh voids a signature through `target` first
//   reference   -> untouched     its hash is corrected so the pre-flight's absolute holds
//
//   node scripts/mock/sign-unattended.mjs <set> [<set> ...]        apply, printing every state it signed
//   node scripts/mock/sign-unattended.mjs --list <set> [...]       print what would be signed, change nothing
//
// Exit codes: 0 clean · 1 a signed state moved (the owner must re-sign) · 2 usage.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Decide what to do with each state, without touching a file. `actualSha(state)` returns the file's
 * current hash, so the CLI reads the disk and a test supplies its own.
 */
export function planSignatures(catalogue, actualSha) {
  const plan = [];
  for (const [name, state] of Object.entries(catalogue.states ?? {})) {
    const coverage = state.coverage;
    if (coverage === 'signed') {
      plan.push({
        name,
        from: coverage,
        actual: actualSha(state),
        action: 'unchanged',
        stale: false,
      });
      continue;
    }
    if (coverage === 'reference') {
      const actual = actualSha(state);
      plan.push({
        name,
        from: coverage,
        actual,
        action: actual === state.mock.sha256 ? 'unchanged' : 'correct-reference-hash',
        stale: false,
      });
      continue;
    }
    if (coverage === 'auto-signed') {
      const actual = actualSha(state);
      plan.push({
        name,
        from: coverage,
        actual,
        // A re-cut state continues the same unattended session. AGENTS.md section 17's "a refresh
        // voids a signature through target first" governs the owner's signature, not this one, which
        // was never the owner's to void.
        action: actual === state.mock.sha256 ? 'unchanged' : 'auto-sign',
        stale: false,
      });
      continue;
    }
    // `target`: the state awaiting a signature. Auto-sign it whether or not its bytes moved.
    plan.push({
      name,
      from: coverage,
      actual: actualSha(state),
      action: 'auto-sign',
      stale: false,
    });
  }
  return plan;
}

const basis =
  'owner pre-authorisation 2026-11-15 (AGENTS.md section 17, auto-signed mocks); pending the reviewer second look';

function main(argv) {
  const listOnly = argv.includes('--list');
  const sets = argv.filter((arg) => !arg.startsWith('--'));
  if (sets.length === 0) {
    console.error('usage: sign-unattended.mjs [--list] <set> [<set> ...]');
    return 2;
  }

  const at = new Date().toISOString().slice(0, 10);
  const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
  let signed = 0;
  let unchanged = 0;
  let stale = 0;

  for (const set of sets) {
    const cataloguePath = join(repoRoot, 'documents', 'mock-claims', `${set}.json`);
    const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8'));
    const plan = planSignatures(catalogue, (state) => sha256(join(repoRoot, state.mock.path)));

    for (const item of plan) {
      const state = catalogue.states[item.name];

      if (item.from === 'signed') {
        // A signature the owner gave is never rewritten here. If the bytes moved, the refresh voided it
        // and only the owner restores it.
        if (item.actual === state.mock.sha256) {
          unchanged += 1;
        } else {
          console.log(
            `${set}/${item.name}  signed but stale - the owner must re-sign  ${item.actual}`,
          );
          stale += 1;
        }
        continue;
      }

      if (item.action === 'unchanged') {
        unchanged += 1;
        continue;
      }

      if (item.action === 'correct-reference-hash') {
        console.log(`${set}/${item.name}  reference hash corrected  ${item.actual}`);
        if (!listOnly) state.mock.sha256 = item.actual;
        continue;
      }

      console.log(`${set}/${item.name}  ${item.from} -> auto-signed  ${item.actual}`);
      signed += 1;
      if (listOnly) continue;

      state.mock.sha256 = item.actual;
      state.coverage = 'auto-signed';
      state.signed = { by: 'unattended', at, sha256: item.actual, basis };
    }

    if (!listOnly) writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`);
  }

  console.log(
    `\n${listOnly ? 'would auto-sign' : 'auto-signed'}: ${signed} · unchanged: ${unchanged} · signed-but-stale: ${stale}`,
  );
  if (stale > 0) {
    console.error(
      "\nA signed state moved. Re-signing is the owner's: run it through target, then sign.",
    );
    return 1;
  }
  if (signed > 0) {
    console.log(
      'Record this list in the round doc; the reviewer inspects it when the unattended work ends.',
    );
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.platform === 'win32'
    ? join(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
    : process.argv[1] === fileURLToPath(import.meta.url));

if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
