# Round - events-audience-expected

|                        |                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                               |
| Tier                   | 2                                                                                                                                  |
| Mode                   | `unattended (auto-accept recommendations)` - standing consent to the milestone                                                     |
| Base                   | `97bbe95`                                                                                                                          |
| Review rounds          | 0                                                                                                                                  |
| Gate runs in parent    | 0                                                                                                                                  |
| Spec                   | `documents/specs/member-registrations-event-audience.md`, `…-api.md` (the occurrence read), `…-events-offerings.md` (AC-5's tiles) |
| Workers                | `single`                                                                                                                           |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017                                                                                       |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                            |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                           | Basis                       |
| -------- | -------------- | ------ | -------------- | ---------------------------------------------------------- | --------------------------- |
| Worker   | `2026-11-24`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`                    | outside-window order        |
| Reviewer | `2026-11-24`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                        | first choice outside window |
| Git seat | `2026-11-24`   | out    | `git-executor` | `opencode/beam-free` - 429; `ollama-cloud/mimo-v2.6-flash` | rung 1 unavailable          |

## Grill

1. **Is the evaluator one shared module?** Recommendation: yes — one domain module mirroring the audience rule's operator
   and clause semantics, used by the roster and the event read alike, tested on both drivers. Cost: a new domain
   surface. Owner answered "all as recommended" (Tue 24 Nov, unattended to the milestone).
2. **Does `expected` become audience-derived at the occurrence date?** Recommendation: yes — evaluated at that date, so
   age and membership are read as of then, `0` for `tracksMembers = false`, and the CHOIR pin flips from its old `2` to
   `0`. Cost: every roster figure changes meaning; the caption already says **Roster**.
3. **Do the legacy projections keep being written until the columns drop?** Recommendation: yes — dual-write until the
   drop round, so a revert needs no schema change. Cost: two sources of truth for one more round.
4. **Do visitors count toward `expected`?** Recommendation: only when the audience names them, per A-7's three person
   kinds. Cost: the evaluator must read membership status, not only ministry.

## Plan

Goal: `expected` is the audience's count at the occurrence date, not the legacy presbyter projection.

- One evaluator module: audience rule in, a date in, a count out; ministries, age bands, gender, presbyter flag and
  membership status per A-7.
- The roster and the event detail's attendance summary both read it; `tracksMembers = false` yields `0`.
- The legacy projection keeps being written (dual-write) until the drop round.
- The pinned CHOIR expectation in `tests/api/event-parent-read.test.ts` flips to the audience's answer.

Out of scope: dropping the legacy columns, deleting `/v1/series/*`, flipping the read default, the additive wires,
the mock rebuild, and any UI change.

Acceptance criteria:

1. The evaluator answers a rule and a date with a count, and has a test per clause kind (ministry, age band, gender,
   presbyter, membership status) and per operator (`allOf`, `anyOf`, `noneOf`).
2. The roster's `expected` equals the evaluator's answer for every seed, and differs from the legacy projection where
   the rule is not an `allOf` of ministry and presbyter.
3. `tracksMembers = false` yields `0` everywhere `expected` is served.
4. The CHOIR pin asserts `0`, with the audience and the members that make it so.
5. No migration, no wire change, no public route deleted, no UI change.

## Verification

| Gate                  | Command               | Result     |
| --------------------- | --------------------- | ---------- |
| Fast gate (round doc) | `npm run verify:fast` | pass — 4/4 |

gate-run 2026-11-24T03:40:19.198Z profile=fast steps=4/4 lines=4 bytes=892

## Review

Seat: consistent - worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                      |
| ----- | --------------------- | ------ | ------------------------------ | ----------------------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/events-audience-expected` at `main` with this doc |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | This round doc                                              |
| 3     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The evaluator, its wiring and its tests                     |
| 4     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                 |
| 5     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                           |
| 6     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                                    |
| 7     | `parent`              | sync   | -                              | Main is held by the `ussd-budget` worktree                  |

`git-seat-budget: 8` = `1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync`, one brief held.

## Mock sign-off

n/a - no user-visible surface changes; the roster's figure already renders.

## Mock parity

n/a - no drawing changes.

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

None yet.
