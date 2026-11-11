# Round — seat-enforcement

|                     |                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                          |
| Tier                | 2                                                                                                                             |
| Mode                | attended (owner: "all as recommended" on the seat grill, 2026-11-11)                                                          |
| Base                | `fcd6624`                                                                                                                     |
| Review rounds       | 1 (protected text) + 1 (code)                                                                                                 |
| Gate runs in parent | 0                                                                                                                             |
| Spec                | `documents/agents/orchestrator-policy.md`, `documents/rounds/README.md`, `AGENTS.md` §3/§17, canonical `references/models.md` |
| Workers             | `single`                                                                                                                      |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (protected text); worker ollama-cloud/deepseek-v4.1-flash:1017 (guard + test)        |

## Plan

The seat grill of 2026-11-11 found that `AGENTS.md` §3 already says a Tier 2 round is worker-authored
and it was skipped anyway, because nothing can fail. This round turns that one rule into a check.

Goal: a round doc cannot silently omit the implementer, silently claim no round doc, or label Tier 2
work Tier 1 — and the stale canonical catalogue stops telling readers the cline-pass seats are dead.

Scope (accepted in the grill):

1. `documents/rounds/README.md` — the template gains `| Implementer | parent <provider>/<model>
(<scope>); worker <provider>/<model> (<scope>) |`, with the statement that it is a **declaration,
   not attestation**, that the cell is split on `;` with each segment trimmed, and that `(<scope>)` is
   optional. The reviewer's reading of the diff remains the control. No historical backfill: only a
   round doc changed by this round must carry the row.
2. `scripts/check-round.mjs` — R1: the row exists; the cell is trimmed, then split on `/\s*;\s*/`, and
   every segment matches
   `^(worker|parent)\s+[a-z0-9][a-z0-9._-]*\/\S+$` with an optional ` (<scope>)` group. R2: when the `Tier` row is `2`,
   either a segment starts `worker ` or the doc carries a `## Deviations` line beginning
   `Tier 2 parent-authored:` with ≥20 characters after the colon. R3: a round doc is required whenever
   the diff touches `src/**` or `ui/src/**`. R4: a path-derived Tier floor — `src/db/migrations.ts`,
   `src/schemas/**` and `src/authn/**` require `Tier 2`, `src/**` or `ui/src/**` require at least
   `Tier 1`; a `Tier` row below the floor fails.
3. `tests/meta/check-round.test.ts` — the script has no test today; fixtures for a valid worker row, a
   valid parent row at Tier 0/1, a Tier 2 parent row without the deviation, a malformed cell, and each
   Tier floor.
4. `documents/rounds/review-brief.md` — the reviewer returns `Seat: consistent | contradicted` and
   diff-tests the assertions so a tests-only worker cannot weaken them.
5. `AGENTS.md` §17 and `documents/agents/orchestrator-policy.md` — the `grill-me` window rule: between
   12:00 and 18:00 local the grill-me seat uses the cline-pass provider for the same model
   (`cline-pass/cline-pass/deepseek-v4.1-flash-1017`), outside the window the ranking applies. The
   policy also states explicitly that the **worker has no clock rule**, so the window cannot be
   re-derived onto it.
6. canonical `references/models.md` (+ `CHANGELOG.md`, `skill-manifest.json`) — `cline-pass` **is**
   configured (15 models, verified 2026-11-11); delete "do not dispatch", and resolve ids by dispatch.
   This is a separate commit from the repo guard, because the canonical directory is not a git repo.
7. Deferred: a cross-check that no implementer id equals the reviewer id (vacuous while the gate is
   pro family), and subagent-id capture (no harness support).

Rejected in the grill and recorded here: adding a **worker** window rule (same model family across
providers, a provider hop for nothing); requiring the round doc to hold an `Implementer` row at Tier
0/1 with a non-`parent` value (the parent implements at 0–1); a commit trailer or `files:` artefact as
the primary record (a second place to drift).

Acceptance criteria:

1. `npm run check-round` fails on a round doc with no `Implementer` row, with a malformed one, and on
   a Tier 2 doc with neither a `worker` segment nor a `Tier 2 parent-authored:` deviation.
2. A diff touching `src/**` or `ui/src/**` with no round doc fails; a `Tier` row below the path floor
   fails.
3. The template, the declaration-not-attestation line and the no-backfill line are in
   `documents/rounds/README.md`.
4. The review brief requires `Seat:` and an assertion diff.
5. `AGENTS.md` §17 and the policy carry the grill-me window rule, and the policy says the worker has no
   clock rule.
6. Canonical `models.md` no longer claims cline-pass is absent, and `verify:skill` is green with the
   manifest hashes refreshed in the same change.
7. `verify` and the new meta tests pass.

## Verification

| Gate   | Command                            | Result                                                                                                                                                     |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec   | protected text, window seat        | round 1 ACCEPTED with five P2s; one fix pass then a confirmation ACCEPTED at the attested hashes                                                           |
| Guard  | `npm run check-round -- --files …` | both selected docs pass R1/R2; the missing signature line is this line below                                                                               |
| Meta   | `npx vitest run tests/meta`        | 41 passed (3 files) — 31 guard tests, git-executor and protected-doc unchanged                                                                             |
| Skill  | `npm run verify:skill`             | ok — manifest hashes refreshed in the same change                                                                                                          |
| Verify | `npm run verify`                   | pass — skill/format/lint/typecheck/test/build, 6/6; one run before it aborted on the known `3221226505` worker crash with 633 tests passed and no failures |

gate-run 2026-11-11T18:07:10.850Z profile=full steps=6/6 lines=6 bytes=680

## Review

Protected text (two rounds on `ollama-cloud/mimo-v2.6-pro`, the window seat): round 1 ACCEPTED with
five P2s — provider naming, the split/trim and optional-scope wording, template padding, a stale
verification date, and this round doc's placeholder cell. One fix pass, then a confirmation ACCEPTED at
the attested hashes; `documents/agents/protected-doc-reviews.json` records all five paths.

Code (one round on the same seat, then one fix pass): ACCEPTED with six P2s and no P1. Fixed: R1 now
accepts one code span per segment (so the README template's own cell passes) and an optional bullet
before the `Tier 2 parent-authored:` line; the `Tier` value is validated to 0–2; the R3 message is
tagged like its siblings; the required-rows loop has a regression test; the argv compare is
case-insensitive on win32. Three judgement calls were confirmed as the right reading of the contract:
the leading-integer `Tier` parse, the bare-or-bulleted deviation line, and R3/R4 being off in `--files`
mode. Criterion 6 — the canonical claim, the manifest hashes and `verify:skill` — the reviewer could
not read `~/.agents/skills/orchestrator`, so the parent confirms all three from its own seat:
`verify:skill ok`, `references/models.md` rewritten, manifest `references/models.md` at
`6613b9bf…`.

Assertion audit: no pre-existing assertion in any other test file changed; the only test artifact is
the new `tests/meta/check-round.test.ts`. Two Nits were left deliberately rather than reopen the
bounded exchange: the required-rows regression covers two of the five rows (deleting the loop fails,
removing one row would not), and `PARENT_AUTHORED_PATTERN` carries a leading `\s*` that is dead on
already-trimmed input. Both are one-liners for a later round.

Seat: consistent — parent protected text, worker guard + test; reviewers `ollama-cloud/mimo-v2.6-pro`
(window) and `ollama-cloud/deepseek-v4-pro:0813`, both distinct from the two authors.

## Mock sign-off

n/a — no user-visible surface

## Mock parity

n/a — no mock

## Acceptance

| #   | Criterion                                                                      | Evidence                                                                            |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | The guard fails a missing, malformed and unbuildered Tier 2 row                | `tests/meta/check-round.test.ts` (R1/R2 blocks); `npm run check-round -- --files …` |
| 2   | A code diff with no round doc fails; a Tier below the floor fails              | same file (R3/R4 blocks)                                                            |
| 3   | The template row, declaration and no-backfill paragraph are in the README      | `documents/rounds/README.md:22,61-65`                                               |
| 4   | The review brief requires `Seat:` and an assertion diff                        | `documents/rounds/review-brief.md:24-30`                                            |
| 5   | §17 and the policy carry the window rule; the policy says the worker has none  | `AGENTS.md:245-249`; `documents/agents/orchestrator-policy.md:38-42`                |
| 6   | Canonical `models.md` no longer claims cline-pass is absent; `verify:skill` ok | `verify:skill ok`; manifest `references/models.md 6613b9bf…`                        |
| 7   | `verify` and the new meta tests pass                                           | 6/6 at 18:07:10.850Z; `npx vitest run tests/meta` → 41 passed (3 files)             |

**ACCEPTED** (2026-11-11), pending only the owner's merge verb.

## Deviations

- The protected text is written by the parent and reviewed first; the code and its test are the
  worker's slice, dispatched after the text lands (recorded in the `Implementer` row).
- The `Implementer` cell is written bare — no code spans around the ids — because R1 matches
  `^(worker|parent)\s+<provider>/<model>` literally. The fix pass also taught R1 to accept one
  surrounding code span per segment, so the README template and per-id backticks both work; bare stays
  the documented shape.
- The `Tier 2 parent-authored:` line must be **bare** (no bullet marker) or bulleted — the fix pass
  accepts either, because the corpus writes bullets and the README text says "a … line". The round doc
  no longer claims the README states the ≥20-character rule: that minimum lives in the Plan, not in
  README, and the README gap goes to the next protected-doc round.
- The round doc needs the `gate-run` signature line: `## Verification` is filled from the parent's own
  gate run before the commit.
