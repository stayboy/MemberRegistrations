# Round - events-capture

|                        |                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                         |
| Tier                   | 2                                                                                                                            |
| Mode                   | attended - the round's own three questions are open                                                                          |
| Base                   | `6076f46`                                                                                                                    |
| Review rounds          | 0                                                                                                                            |
| Gate runs in parent    | 0                                                                                                                            |
| Spec                   | `documents/specs/member-registrations-ui.md` (the event detail's occurrence row), `…-api.md` (attendance capture and import) |
| Workers                | `single`                                                                                                                     |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017                                                                                 |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                      |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                           | Basis                       |
| -------- | -------------- | ------ | -------------- | ---------------------------------------------------------- | --------------------------- |
| Worker   | `2026-11-23`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`                    | outside-window order        |
| Reviewer | `2026-11-23`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                        | first choice outside window |
| Git seat | `2026-11-23`   | out    | `git-executor` | `opencode/beam-free` - 429; `ollama-cloud/mimo-v2.6-flash` | rung 1 unavailable          |

## Grill

Carried over from the "where we stand" grill, answered "all as recommended" (owner, 2026-11-23): the capture
and import panel is the next round; the downstream round runs beside it as a spec amendment with two slices
(2d-1 the evaluator, 2d-2 the drop/flip/delete); session-offerings precedes the route deletion; the three
additive wires go in one contract PR; and the two mocks drop to `target` for one rebuild pass.

1. **Does the capture round own the retired `End of session` surface, or only the panel and its deep link?**
   The operator page that carried the action is gone, and the capture states still describe live/ended copy.
   Recommendation: own it — but only over an existing mutation; a new one parks. Cost: a round that touches the
   attendance write path again, and a gate if it needs a route.
2. **How do the two parked `fixme` deep-link cases come back?** Recommendation: prove the deep link under a
   single worker, then reopen both cases rather than papering over them with retries. Cost: the diagnosis is a
   prerequisite to closing, so an unstable panel parks the round.
3. **Does this round prune the retired series mock states?** They name surfaces deleted in #226.
   Recommendation: yes, one catalogue pass, no UI work. Cost: another protected-file review in a round that is
   otherwise not about mocks.

## Plan

Goal: the attendance capture loop closed on the event detail.

- The import panel opens from the occurrence row's deep link, with its states reading live or ended.
- `AC-20` and `AC-7a` proved end to end; the two parked `fixme` cases reopened with the deep link proved
  single-worker.
- Whatever answer 1 settles for the `End of session` surface.
- The retired series mock states pruned (answer 3).

Out of scope: the downstream round (audience-derived `expected`, the legacy drop, the series route deletion),
session-offerings, the additive wires, and any migration.

Acceptance criteria:

1. The panel renders for a chosen occurrence and its deep link resolves after a reload, single-worker.
2. `AC-20` and `AC-7a` have proving cases; no third `fixme` is added.
3. Answer 1's surface behaves as specified, or is explicitly deferred with a backlog row.
4. No migration, no wire change, no public route deleted.

## Verification

| Gate                     | Command               | Result     |
| ------------------------ | --------------------- | ---------- |
| Fast gate (first commit) | `npm run verify:fast` | pass — 4/4 |

gate-run 2026-11-23T18:51:43.723Z profile=fast steps=4/4 lines=4 bytes=691

## Review

Seat: consistent — worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                                                                         |
| ----- | --------------------- | ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/events-capture` at `main`; carries the round doc, the catalogue's target move and the three stale round-doc statuses |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | Those first-commit paths                                                                                                       |
| 3     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The capture work                                                                                                               |
| 4     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                                                                                    |
| 5     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                                                                                              |
| 6     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                                                                                                       |
| 7     | `parent`              | sync   | -                              | `main` is held by the `ussd-budget` worktree                                                                                   |

`git-seat-budget: 8` = `1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync`, with one brief held for a
re-brief.

## Mock sign-off

n/a - no new surface; the two `target` states are rebuilt in the mock pass, not here.

## Mock parity

n/a - no drawing changes in this round.

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

- **The first commit is documentation, not code**: it closes the three merged rounds that still read OPEN,
  corrects the backlog's "V2 is closed" claim, adds the missing row for the hand-written-fixture exception,
  and moves `10-event-create` and `02-event-detail` to `target` on the owner's 2026-11-23 answer. The widened
  `branch` clause exists because of exactly this shape.
