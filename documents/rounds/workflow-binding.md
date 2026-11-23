# Round - workflow-binding

|                        |                                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| Status                 | OPEN                                                                         |
| Tier                   | 1                                                                            |
| Mode                   | `attended` (owner: "all as recommended", 2026-11-23)                         |
| Base                   | `b1834ba`                                                                    |
| Review rounds          | 1                                                                            |
| Gate runs in parent    | 0                                                                            |
| Spec                   | `AGENTS.md` §3a and `documents/agents/orchestrator-policy.md` (process work) |
| Workers                | `single`                                                                     |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (the five edits)`              |
| Verbs this round needs | `branch, merge`                                                              |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                                      | Basis                        |
| -------- | -------------- | ------ | -------------- | --------------------------------------------------------------------- | ---------------------------- |
| Worker   | `2026-11-23`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` — answered                    | outside-window order, probed |
| Reviewer | `2026-11-23`   | out    | reviewer       | `ollama-cloud/deepseek-v4-pro:0813` — answered                        | first choice, outside window |
| Git seat | `2026-11-23`   | out    | git-executor   | `opencode/beam-free` — 429; `ollama-cloud/mimo-v2.6-flash` — answered | rung 1 unavailable           |

## Grill

1. **Bind the workflow before the UI round, in its own small round?** `parallel-ui-api.md` is committed but says twice
   it is not binding until a `0813`-reviewed sentence lands in `AGENTS.md` §3a and the policy. Bundling that protected
   change into the UI PR would make one review judge policy and product at once. Recommendation: a two-brief round
   now (branch + one `merge`), one `0813` pass, one hash record. Cost: ~15 minutes of process before product work; the
   workflow cannot bind without it. Owner answered "all as recommended" (2026-11-23).

## Plan

Goal: make the owner-approved contract-first UI/API workflow binding, by the sentence the workflow doc names as its
own precondition. `AGENTS.md` §3a forbids parallel tracks that share a wire contract; the workflow qualifies that with
a **frozen** contract, so the qualification belongs in §3a itself, with the procedure left where it already lives.

Scope (seven edits, no product change):

1. `AGENTS.md` §3a — the bullet that admits the workflow and states the frozen-contract qualification.
2. `documents/agents/orchestrator-policy.md` — one pointer under `## Parallel workers`; no restatement of the
   workflow (the doc owns its procedure).
3. `documents/agents/parallel-ui-api.md` — its Status row becomes binding since 2026-11-23, citing this round.
4. `documents/agents/parallel-ui-api.md` — its Further Note stops calling the seam pending.
5. `documents/backlog.md` — one row: the workflow doc is not yet in the protected set, and adding it is a later
   decision (it is a governing document, but the protected list is a design change of its own).
6. `.opencode/agents/git-executor.md` — the `merge` precondition now reads the three checks either as already green
   (the PR exists) or as the chain's wait condition (this brief opens the PR), which a chain brief can satisfy.
7. `.opencode/agents/git-executor-fallback.md` — the rung-2 seat carries the same four clauses (`--body-file`, the
   brief shape's uncommitted-merge fields, the merged refusal condition and the glossary pointer). Both seat files
   must agree; the primary owns the wording.

Acceptance criteria:

1. §3a states that the workflow binds for a UI-and-API round and that a frozen contract is the seam.
2. The policy points at the workflow doc and does not restate its procedure.
3. The workflow doc's Status row says binding since 2026-11-23 with the review basis.
4. The two protected hashes are recorded and the tripwire passes.
5. No product, API, UI or migration change.

## Verification

| Gate                   | Command                                                  | Result         |
| ---------------------- | -------------------------------------------------------- | -------------- |
| Fast gate              | `npm run verify:fast`                                    | pass — 4/4     |
| Protected-doc tripwire | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests |
| Pre-commit profile     | `node scripts/verify.mjs precommit`                      | pass — 4/4     |

gate-run 2026-11-23T05:44:14.054Z profile=fast steps=4/4 lines=4 bytes=691

One flake, resolved by the two-attempt rule: `verify:fast` at 05:42:46 failed one test ("sends to the phone when the
member has only a number", 203 ms); it passed in isolation at 05:42:52 and the full gate passed at 05:44:14. Recorded,
not parked.

## Review

Seat: consistent — worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                           |
| ----- | --------------------- | ------ | ------------------------------ | -------------------------------------------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut the round's `chore/` branch from `main`                                      |
| —     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | **Refused**, no write: the loaded rung-2 prompt predates the seat-file amendment |
| —     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | **Refused again**, same cause; the re-dispatch cannot reload the prompt          |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The seven edits and the hash record, as separate verbs                           |
| 3     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                                      |
| 4     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`, body from `.gates/pr-body.md`                                 |
| 5     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | After the three checks                                                           |
| 6     | `parent`              | sync   | —                              | `main` is checked out in the `ussd-budget` worktree                              |

`git-seat-budget: 6`, raised from the 2 declared at open: `1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync`. The
chain brief cannot run in the session that loads the pre-amendment seat prompt, so the round falls back to the
six separate verbs; the two refused briefs spent nothing and are recorded rather than counted. The next session
loads the amended files and gets the chain.

## Mock sign-off

n/a - no user-visible surface.

## Mock parity

n/a - no mock.

## Acceptance

| #   | Criterion                                                                 | Met | Evidence                                                        |
| --- | ------------------------------------------------------------------------- | --- | --------------------------------------------------------------- |
| 1   | §3a states that the workflow binds and that a frozen contract is the seam | yes | `AGENTS.md` §3a bullet                                          |
| 2   | The policy points at the workflow doc and does not restate its procedure  | yes | `documents/agents/orchestrator-policy.md` `## Parallel workers` |
| 3   | The workflow doc says binding since 2026-11-23 with the review basis      | yes | `documents/agents/parallel-ui-api.md` Status row                |
| 4   | The two protected hashes are recorded and the tripwire passes             | yes | `protected-doc-reviews.json`; 7/7 tests                         |
| 5   | No product, API, UI or migration change                                   | yes | diff has none                                                   |
| 6   | A chain brief can satisfy the seat's `merge` precondition as written      | yes | `.opencode/agents/git-executor.md` checks clause                |
| 7   | Both seat files carry the same chain rule                                 | yes | `.opencode/agents/git-executor.md`; `…-fallback.md`             |

## Deviations

- **A sixth edit was found at first use.** The seat's `merge` precondition read "the brief states all three checks
  green", which a chain brief cannot do because it opens the PR itself — the same class of drift the previous round
  removed, found exactly where the policy says it would be (a refused brief at first use). The seat file now accepts
  either already-green checks or the chain's wait condition; it is not a protected file, and the two protected texts
  this round records are unchanged by it.
- **The workflow document stays unprotected for now.** The binding seam is stated in two protected files; the
  delegated procedure is not, so an edit to `parallel-ui-api.md` would not need the `0813` gate. Recorded in the
  backlog with a mandatory trigger: the next edit to that document closes it.
- **The first chain brief was refused, spending nothing.** The rung-2 seat reads `.opencode/agents/git-executor-fallback.md`,
  which still carried the old "four briefs" clause and the green-checks precondition; only the rung-1 file had been
  amended. The fallback file now mirrors the primary, and the refusal cost no write — which is exactly the "a refused
  brief, a chain that stops" failure the one-owner table predicts.
- **The second attempt was refused for the same reason, and the fallback is recorded.** The rung-2 seat runs the
  definition loaded at dispatch time, so editing the file mid-session cannot amend it; only a fresh session loads the
  amended text. The round therefore spends six separate briefs (budget raised from 2 to 6 in the write table) and the
  chain takes effect from the next session — the first time it can be observed rather than asserted.
