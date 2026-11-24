# Round - workflow-hardening

|                        |                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Status                 | OPEN                                                                                 |
| Tier                   | 2                                                                                    |
| Mode                   | attended - five decisions answered 2026-11-24                                        |
| Base                   | `c4b2fad`                                                                            |
| Review rounds          | 0                                                                                    |
| Gate runs in parent    | 0                                                                                    |
| Spec                   | `AGENTS.md` (§3, §9), `.github/merge-policy.md` (the verb glossary), both seat files |
| Workers                | `single`                                                                             |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017                                         |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                              |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                           | Basis                       |
| -------- | -------------- | ------ | -------------- | ---------------------------------------------------------- | --------------------------- |
| Worker   | `2026-11-24`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`                    | outside-window order        |
| Reviewer | `2026-11-24`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                        | first choice outside window |
| Git seat | `2026-11-24`   | out    | `git-executor` | `opencode/beam-free` - 429; `ollama-cloud/mimo-v2.6-flash` | rung 1 unavailable          |

## Grill

1. **Make "branch first, then edit" the standing discipline?** Every dirty-tree refusal came from authoring edits
   before the branch existed, and the rule already permits one dirty path - the round doc. **Recommendation:** write the
   doc, cut the branch, commit the doc, then touch code or specs. **Cost:** a round that changes shape needs a second
   doc commit instead of an in-place edit. Owner answered "all as recommended" (2026-11-24).
2. **Add a parent preflight that prints what a brief needs?** Six refusals were stale `tree:` hashes and one was a
   fabricated hash. **Recommendation:** `scripts/round/git-preflight.mjs`, printing the branch, HEAD, the tree hash, the
   dirty paths and whether they match the round doc's declared set. **Cost:** one script to maintain, and it can itself
   go stale if it is not run immediately before the brief. Owner answered "all as recommended". **Landed in this
   commit.**
3. **Give the seat a brief file and a runner instead of inline PowerShell?** Every `shell-permission-denied` fallback
   came from the seat writing its own verification script. **Recommendation:** a JSON brief plus `scripts/git/verb.mjs`
   that performs the verb and its checks, so the seat runs one command with no shell logic. **Cost:** a rule change in
   both seat files, and it moves staging responsibility into a script the seat must trust. Owner answered "all as
   recommended".
4. **Add `restore` to the verb vocabulary?** The parent has twice run `git checkout --` itself because no seat verb
   covered "undo a bad edit". **Recommendation:** add `restore`, narrow to named paths and a named revision, with the
   brief stating what is being discarded. **Cost:** a sharp tool, and a brief that omits the revision turns it into a
   licence to discard anything. Owner answered "all as recommended".
5. **Can a round park with a dirty tree?** The spec-and-backlog tidy is blocked precisely because its edits build on a
   parked branch's file. **Recommendation:** no - a park commits its work or names the dirty paths and their lineage,
   and the next round starts clean. **Cost:** a park may force a WIP commit that a later round rewrites. Owner answered
   "all as recommended".

## Plan

Goal: the six friction classes that cost a dozen refusals in one day stop recurring.

- `scripts/round/git-preflight.mjs` - landed; prints the brief's fields from one run.
- `scripts/git/verb.mjs` - a brief-file runner: reads a JSON brief, performs one verb, and owns the checks the seat
  currently improvises in shell.
- Both seat files - `restore` added to the verb list, and the runner named as the way a brief is executed.
- `AGENTS.md` §3 and §9 - branch-first and park-clean, stated as rules rather than habits. **Protected: the exact text
  goes to `0813` and its hash into `documents/agents/protected-doc-reviews.json` in the same commit.**
- `.github/merge-policy.md` - the glossary gains `restore` and the two rules. **Protected, same treatment.**

Out of scope: the parked downstream round, the mock rebuild, and any change to what a round may contain.

Acceptance criteria:

1. `git-preflight.mjs` prints branch, HEAD, tree, dirty paths and the declared/undeclared split, with a test for a dirty
   and a clean tree.
2. `verb.mjs` performs a branch, a commit and a restore from a JSON brief, refusing a mismatch on the printed tree, with
   tests for each refusal path.
3. Both seat files carry identical `restore` wording, and the runner is named.
4. `AGENTS.md` and `merge-policy.md` carry the two rules, with their `0813` review recorded and hashes matching.

## Verification

| Gate                                | Command                                                                                    | Result                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Fast gate (round doc and preflight) | `npm run verify:fast`                                                                      | pass — 4/4                                                              |
| Preflight smoke                     | `node scripts/round/git-preflight.mjs --round documents/rounds/event-parent-downstream.md` | prints branch, HEAD, tree, the five dirty paths and one undeclared path |

gate-run 2026-11-24T06:45:40.094Z profile=fast steps=4/4 lines=4 bytes=691

## Review

Seat: consistent - worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                  |
| ----- | --------------------- | ------ | ------------------------------ | ----------------------------------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/workflow-hardening` at `main` with this doc and the preflight |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | This doc and `scripts/round/git-preflight.mjs`                          |
| 3     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The runner, the seat files and the two protected documents              |
| 4     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                             |
| 5     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                                       |
| 6     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                                                |
| 7     | `parent`              | sync   | -                              | Main is held by the `ussd-budget` worktree                              |

`git-seat-budget: 8` = `1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync`, one brief held.

## Mock sign-off

n/a - no surface and no `ui/src/` change.

## Mock parity

n/a - no drawing changes.

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

- **The preflight landed alone.** The round is otherwise not built: the runner, the seat files and the two protected
  documents wait for a round that starts from a clean tree, which is the rule this round is about.
- **The tidy that exposed all this is still uncommitted** (`documents/backlog.md`, `documents/specs/member-registrations-ui.md`,
  the two round docs). It cannot branch from `main` because its backlog edits build on the parked branch's copy — the
  exact case answer 5 forbids, and the reason the rule is worth having.
