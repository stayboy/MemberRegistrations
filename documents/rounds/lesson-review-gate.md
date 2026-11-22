# Round — lesson review gate and weekend window

|                        |                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Status                 | OPEN                                                                                                                           |
| Tier                   | 1 — Plan                                                                                                                       |
| Mode                   | `attended`                                                                                                                     |
| Base                   | `f2f5792`                                                                                                                      |
| Review rounds          | 0                                                                                                                              |
| Gate runs in parent    | 1                                                                                                                              |
| Spec                   | `documents/lessons.md` (Admission) + `AGENTS.md` §10/§10a/§17 + `documents/agents/orchestrator-policy.md` (Seats)              |
| Workers                | `single`                                                                                                                       |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (docs); parent ollama-cloud/deepseek-v4.1-flash:1017 (round doc, record, gates)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                        |

## Instruction

Owner, 2026-11-22, verbatim: "always run this sort of review before proposing lessons to me. do clean
up as suggested." Later the same day: "remove model window selection for saturday and sunday. Those are
off-peak all day."

Three changes:

- The reviewer-seat durability review becomes **mandatory before a lesson is proposed**, not an
  on-request alternative to a grill. The seat incident that prompted this proposal was demoted to a
  note by that review, which is the outcome the rule is meant to make routine.
- The git seat titles drop their model ids, matching the publish seats. This is the consistency nit the
  durability review flagged out of scope.
- The 12:00-18:00 local provider window applies **Monday to Friday only**; Saturday and Sunday are
  off-peak all day, so the outside-window ranking applies. Today (Sunday) is therefore an `0813` review
  day, not a window-seat day.

## Plan

Goal: make the review a precondition of the proposal, and finish the title cleanup without touching the
seat model pins or the git ranking.

- **In:** `documents/lessons.md` (the Admission preamble, header, step 1 cross-reference and step 2);
  `AGENTS.md` §10's pointer bullet, §10a's reviewer window and §17's grill/worker window;
  `documents/agents/orchestrator-policy.md` (the spec-review window, the Seats paragraph and table, the
  protected-doc window); `documents/agents/seats.json`'s `insideWindow` note; the titles of
  `.opencode/agents/git-executor.md` and `git-executor-fallback.md`.
- **Out:** any change to the seat model pins or the `git-executor` exception; a new lesson entry (the
  seat incident is a note, already in `documents/rounds/publish-seat.md`); the review's six gap
  proposals (owner decisions for a later round).

Acceptance:

1. `documents/lessons.md` step 2 makes the reviewer-seat durability review mandatory before a
   proposition; step 1's closing sentence points at the owner's acceptance; the preamble points at the
   Admission rather than restating it.
2. `AGENTS.md` §10 is a pointer to the Admission, not a second statement of the review gate.
3. The two git seat titles name no model; the publish seats already do not.
4. The 12:00-18:00 local window is Monday-Friday in `AGENTS.md` §10a/§17,
   `orchestrator-policy.md` and the `seats.json` note; Saturday and Sunday use the outside-window
   ranking all day.
5. The protected-doc review (`deepseek-v4-pro:0813`, the off-peak weekend seat) accepts the changed
   protected files, and `documents/agents/protected-doc-reviews.json` records each exact-text hash.
6. `npm run verify:fast` and the full `npm run verify` pass; the protected-doc guard passes.

No product surface; mock sign-off `n/a`.

## Verification

| Gate                | Command                                                                               | Result                   |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| Protected-doc guard | `npx vitest run tests/meta/protected-doc-review.test.ts`                              | pass — 7 tests           |
| Seat guards         | `npx vitest run tests/meta/seat-model.test.ts tests/meta/seat-rule-agreement.test.ts` | pass — 2 files, 10 tests |
| Fast gate           | `npm run verify:fast`                                                                 | pass — 4/4               |
| Full gate           | `TEST_DATABASE_URL=… npm run verify`                                                  | pass — 7/7               |

gate-run 2026-11-22T17:27:10.277Z profile=full steps=7/7 lines=7 bytes=966

## Protected review

The first pass (window seat `mimo-v2.6-pro`, before the owner's weekend rule) returned **REWORK**: P1 -
`AGENTS.md` §10 was a second home for the review gate; P2 - the lessons preamble duplicated step 2; P2 -
the record was not yet re-recorded. The P1 and P2 were fixed; the record P2 is this section's re-record.

The second pass, on `deepseek-v4-pro:0813` (the first choice, because the owner's weekend rule makes
Sunday off-peak all day), returned **ACCEPT** with no P1/P2. It recorded two nits and four gap proposals,
none applied: the window has no single home; the two reviewer passes for lessons lack a stated
relationship; the record's `policy` preamble needed the weekday qualifier (applied in the record); and a
dated lesson's live Rule was scope-qualified in place without a stated convention.

The record `documents/agents/protected-doc-reviews.json` now carries the exact-text hashes:
`AGENTS.md` `69762c28…`, `documents/lessons.md` `45f55548…`, `documents/agents/orchestrator-policy.md`
`d3f0b38b…`.

## Git writes

`git-seat-budget: 12` (this round `1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync = 6 of 12`).

| Brief | Actor                 | Verb     | Variant                        | Reason                                               |
| ----- | --------------------- | -------- | ------------------------------ | ---------------------------------------------------- |
| 1     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Cut from `main`; rung 1 429                          |
| 2     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | One round commit; the protected record lands with it |
| 3     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Feature branch only                                  |
| 4     | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                    |
| 5     | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | Only after `verify`, `ui` and `ui-e2e` are green     |
| 6     | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull                                      |

## Mock sign-off

n/a — no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                                                                                                                  | Met | Evidence                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | --- | ----------------------------------------------------------------- |
| 1   | The lessons Admission makes the reviewer-seat durability review mandatory before a proposition; the close points at the owner's acceptance | yes | `documents/lessons.md` Admission steps 1-2                        |
| 2   | `AGENTS.md` §10 is a pointer to the Admission, not a second statement of the gate                                                          | yes | `AGENTS.md` §10                                                   |
| 3   | The two git seat titles name no model                                                                                                      | yes | `.opencode/agents/git-executor*.md` H1                            |
| 4   | The 12:00-18:00 window is Monday-Friday; Saturday and Sunday use the outside-window ranking all day                                        | yes | `AGENTS.md` §10a/§17; `orchestrator-policy.md`; `seats.json` note |
| 5   | The `0813` protected review accepts the changed files and the record carries each exact-text hash                                          | yes | `protected-doc-reviews.json`; 7/7 guard                           |
| 6   | `verify:fast` and the full `verify` pass                                                                                                   | yes | 4/4 and 7/7 above                                                 |

Verdict: **ACCEPTED**.

## Deviations

- **The first protected pass was a window-seat read.** It returned REWORK on `AGENTS.md` §10 (a second
  home) and the lessons preamble (a duplicate); both were fixed before the `0813` pass. The weekend rule
  also made that pass's seat wrong for the day, so the authoritative review is the `0813` one.
- **The `0813` pass left two nits.** `documents/lessons.md:16`'s "step 2's question" reads looser than the
  former "test", and `orchestrator-policy.md:43`'s "and all weekend" is redundant emphasis. Neither is a
  contradiction; both are recorded for the next touch.
- **The review's four gap proposals are deferred owner decisions:** the window has no single home; the
  two reviewer passes for lessons lack a stated relationship; a dated lesson's live Rule was
  scope-qualified in place without a stated convention; and the record's `policy` preamble needed the
  weekday qualifier (this one was applied in the record).
- **The 2026-11-10 lesson's live Rule was scope-qualified in place** ("on Monday to Friday; outside that
  window, and all weekend"); its Evidence, heading and Trigger are unchanged. The convention for such an
  amendment is one of the deferred gaps.
- **The weekend rule takes effect 2026-11-22.** The historical entries keep their dates and evidence; the
  current rule is the policy text.
