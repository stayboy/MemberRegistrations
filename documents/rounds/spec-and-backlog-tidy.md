# Round - spec-and-backlog-tidy

|                        |                                                                  |
| ---------------------- | ---------------------------------------------------------------- |
| Status                 | OPEN                                                             |
| Tier                   | 1                                                                |
| Mode                   | attended - the four decisions below were answered on 2026-11-24  |
| Base                   | `c4b2fad`                                                        |
| Review rounds          | 0                                                                |
| Gate runs in parent    | 0                                                                |
| Spec                   | `documents/specs/member-registrations-ui.md` (FR-73, clarifying) |
| Workers                | `single`                                                         |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017                     |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                          |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                           | Basis                       |
| -------- | -------------- | ------ | -------------- | ---------------------------------------------------------- | --------------------------- |
| Worker   | `2026-11-24`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`                    | outside-window order        |
| Reviewer | `2026-11-24`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                        | first choice outside window |
| Git seat | `2026-11-24`   | out    | `git-executor` | `opencode/beam-free` - 429; `ollama-cloud/mimo-v2.6-flash` | rung 1 unavailable          |

## Grill

1. **Own branch, or ride the parked downstream branch?** The parked branch is unpushed and scoped to the migration; a
   spec fix and three backlog decisions do not belong in it. **Recommendation:** their own branch carrying all three,
   including the mock round's doc so it stops being an untracked file. **Cost:** one chain for a documents-only change.
   Owner answered "all as recommended".
2. **What tier?** No behaviour changes. **Recommendation:** Tier 1, because the spec clause changes and a round record
   is then owed anyway - which is what lets the branch clause see these dirty paths. **Cost:** a round doc for a small
   change. Owner answered "all as recommended".
3. **Does `FR-73` get a changelog line?** It changed without one. **Recommendation:** yes, saying the clause was wrong
   rather than that the route changed - the endpoint has always parsed `productCode`. **Cost:** one line, no
   re-approval. Owner answered "all as recommended".
4. **Does the lessons entry for the two out-of-seat git writes land now?** **Recommendation:** after the milestone, and
   only after a **durability test** by the reviewer seat (KEEP / MERGE / DROP) - `lessons.md` is protected, so it costs
   an `0813` pass and a hash record either way. **Cost:** the lesson lands later than the behaviour, and its admission
   still has to pass the gate then. Owner agreed, with the durability test made explicit.

## Plan

Goal: three stale records corrected, and the next round's doc put under version control.

- `member-registrations-ui.md`: FR-73 names the body the route parses, with a clarifying changelog line.
- `documents/backlog.md`: the `FR-73` row, the coverage-threshold row and the window-wording row are removed (the first
  two resolved by this change, the third because the wording was already harmonised and the surviving "admissible"
  means something else); the `tracksMembers` row records the owner's 2026-11-24 decision; the track-mockups row's
  trigger moves to after the mock rebuild.
- `documents/rounds/events-mock-rebuild.md` committed, so the next round starts from `main` with its record in place.

Out of scope: code, migrations, mocks, and the parked downstream round.

Acceptance criteria:

1. FR-73's body matches `subscribeProductSchema`, with its changelog line.
2. The three removed backlog rows are genuinely resolved, and the two edited rows say what was decided.
3. The mock round doc is committed and `check-round` passes on it.

## Verification

| Gate                  | Command               | Result     |
| --------------------- | --------------------- | ---------- |
| Fast gate (round doc) | `npm run verify:fast` | pass — 4/4 |

gate-run 2026-11-24T06:40:43.709Z profile=fast steps=4/4 lines=4 bytes=691

## Review

Seat: consistent - worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                           |
| ----- | --------------------- | ------ | ------------------------------ | ---------------------------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/spec-and-backlog-tidy` at `main` with these four paths |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The spec clause, the backlog and the mock round doc              |
| 3     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                      |
| 4     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                                |
| 5     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                                         |
| 6     | `parent`              | sync   | -                              | Main is held by the `ussd-budget` worktree                       |

`git-seat-budget: 8` = `1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync`, two briefs held.

## Mock sign-off

n/a - no surface and no `ui/src/` change.

## Mock parity

n/a - no drawing changes.

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

None yet.
