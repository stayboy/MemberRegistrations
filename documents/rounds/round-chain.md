# Round - round-chain

|                        |                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                        |
| Tier                   | 1                                                                                                                           |
| Mode                   | `attended` (owner: "include going forward", 2026-11-23)                                                                     |
| Base                   | `7ce4910`                                                                                                                   |
| Review rounds          | 1                                                                                                                           |
| Gate runs in parent    | 2                                                                                                                           |
| Spec                   | `AGENTS.md` §7 and §9, `documents/agents/orchestrator-policy.md` (process work)                                             |
| Workers                | `single`                                                                                                                    |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (the five edits); parent ollama-cloud/deepseek-v4.1-flash:1017 (the wording)` |
| Verbs this round needs | `branch, commit, push, pr, merge`                                                                                           |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                                           | Basis                        |
| -------- | -------------- | ------ | -------------- | -------------------------------------------------------------------------- | ---------------------------- |
| Worker   | `2026-11-23`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` - answered                         | outside-window order, probed |
| Reviewer | `2026-11-23`   | out    | reviewer       | `ollama-cloud/deepseek-v4-pro:0813` - answered                             | first choice, outside window |
| Git seat | `2026-11-23`   | out    | git-executor   | `opencode/beam-free` - HTTP 429; `ollama-cloud/mimo-v2.6-flash` - answered | rung 1 unavailable           |

## Plan

Goal: remove the round chain's avoidable latency without removing a check. Measured on slice 2a (PR #219): gate
green `04:21:45`, commit `04:22:51`, PR opened `04:27:41`, merged `04:31:41` — a 9m56s tail, 4m50 of it two
one-command seat briefs (`push`, `pr`), and the suite run three times (the parent's `verify:fast`, the hook's
`verify:precommit`, CI's `verify`).

The owner's instruction: review the proposal with `deepseek-v4-pro:0813` and include the result going forward. The
review returned ACCEPT on four points and REWORK on the chain brief, because `.opencode/agents/git-executor.md`
said an uncommitted `merge` "expands to … four briefs" while `.github/merge-policy.md:57-58` says a `merge` brief
"still carries one verb even though that verb expands to several commands" — a three-way drift with the policy's
budget formula. The one-owner table makes `merge-policy.md` the owner of "what a verb authorises, and the `merge`
chain", so the fix is to delete the seat file's restatement, not to add a fourth.

Scope (five edits, no behaviour change to any endpoint):

1. `AGENTS.md` §7 — the pre-commit sentence: the hook runs `check-round`, `format:check`, `lint`, `typecheck`; the
   suite and build are CI's required `verify`; `smoke` stays manual.
2. `documents/agents/orchestrator-policy.md` — the budget formula becomes `1 branch + 1 merge`; two `## Gates`
   bullets (review and gate start together on a frozen tree with a fix voiding both; the PR body is a parent-authored
   file delivered with `--body-file`).
3. `.opencode/agents/git-executor.md` — the `merge` action points at the glossary instead of restating the chain; the
   `pr` action names `--body-file`.
4. `scripts/verify.mjs` — the `precommit` profile drops `test`; `verify:fast` is unchanged.
5. `documents/agents/parallel-ui-api.md` — the owner-approved contract-first workflow lands (it binds once its
   protected sentence lands, which is a later change).
6. `documents/rounds/event-parent-migration.md` — two record corrections for the previous round: write-table row 12
   now names the parent for the 2b-read sync (`main` is held by the `ussd-budget` worktree), and two deviations record
   the commit-body escaping artefact and the parent-run sync. No product or process rule changes.

Acceptance criteria:

1. `verify:precommit` passes with the four steps and runs no suite.
2. `verify:fast` still runs the suite and is unchanged.
3. The protected files' recorded hashes match their text and `tests/meta/protected-doc-review.test.ts` passes.
4. The seat file and `.github/merge-policy.md` agree with the new policy paragraph on the chain.
5. No endpoint, schema, migration or UI change.
6. The previous round's record names the actor and the reason for the sync it reports.

## Verification

| Gate                                                    | Command                                                  | Result                                      |
| ------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| Pre-commit profile, new steps                           | `node scripts/verify.mjs precommit`                      | pass — check-round, format, lint, typecheck |
| Fast gate                                               | `npm run verify:fast`                                    | pass — 4/4                                  |
| Protected-doc tripwire                                  | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                              |
| Seat and merge-policy re-read against the new paragraph | reviewer read of the exact text                          | pass — no restatement, no contradiction     |
| Profile pin updated with the change                     | `tests/meta/check-round.test.ts`                         | fail before, pass after                     |

gate-run 2026-11-23T05:21:08.679Z profile=fast steps=4/4 lines=4 bytes=691

## Review

Seat: consistent — worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.
The design review (2026-11-23) returned point 1 REWORK (the seat-file and budget amendments it named are applied
here) and points 2-5 ACCEPT; its exact wording is followed for §7, the `## Gates` bullets and the hook profile. The
protected-text review on the same day ACCEPTed §7 and the policy, with two P2s now applied: the seat file's brief
shape says a `merge` brief on uncommitted work also carries `files:` and `message:`, and the previous round's record
correction is declared in this round's scope. The reviewer read the exact text but could not recompute the sha256
(shell denied in its read-only session); the hashes were computed by the parent over the normalised text and the
tripwire test recomputes them.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                             |
| ----- | --------------------- | ------ | ------------------------------ | ---------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut the round's `chore/` branch    |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The five edits and the hash record |
| 3     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                        |
| 4     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                  |
| 5     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | After the three checks             |

`git-seat-budget: 5` (five briefs; the chain brief this round introduces does not apply to the round that lands it,
because the seat reads its own file and the briefs here are dispatched under the old one).

## Mock sign-off

n/a - no user-visible surface.

## Mock parity

n/a - no mock.

## Acceptance

| #   | Criterion                                                      | Met     | Evidence                                                                             |
| --- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| 1   | `verify:precommit` passes with four steps and no suite         | yes     | `scripts/verify.mjs:6`; `tests/meta/check-round.test.ts` pin                         |
| 2   | `verify:fast` unchanged and green                              | yes     | `gate-run 2026-11-23T05:21:08.679Z`                                                  |
| 3   | Protected hashes match and the tripwire passes                 | yes     | `protected-doc-reviews.json`; 7/7 tests                                              |
| 4   | Seat file and merge policy agree with the new policy paragraph | yes     | reviewer read of `.opencode/agents/git-executor.md`; `.github/merge-policy.md:57-58` |
| 5   | No endpoint, schema, migration or UI change                    | yes     | diff has none                                                                        |
| 6   | The previous round's record names the actor and the reason     | pending | `documents/rounds/event-parent-migration.md`, write-table row 12                     |

## Deviations

- The chain brief cannot commit the round that introduces it: the seat loads its own file, so this round dispatches
  the five verbs separately and the next round uses the chain.
