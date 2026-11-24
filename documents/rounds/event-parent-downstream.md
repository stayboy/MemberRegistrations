# Round - event-parent-downstream

|                        |                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                |
| Tier                   | 2                                                                                                   |
| Mode                   | `unattended (auto-accept recommendations)` - owner pre-authorisation of the gates                   |
| Base                   | `c4b2fad`                                                                                           |
| Review rounds          | 0                                                                                                   |
| Gate runs in parent    | 0                                                                                                   |
| Spec                   | `documents/specs/member-registrations-api.md` (the flip), `…-event-audience.md` (A-7's legacy pair) |
| Workers                | `single`                                                                                            |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017                                                        |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                             |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                           | Basis                       |
| -------- | -------------- | ------ | -------------- | ---------------------------------------------------------- | --------------------------- |
| Worker   | `2026-11-24`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`                    | outside-window order        |
| Reviewer | `2026-11-24`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                        | first choice outside window |
| Git seat | `2026-11-24`   | out    | `git-executor` | `opencode/beam-free` - 429; `ollama-cloud/mimo-v2.6-flash` | rung 1 unavailable          |

## Grill

1. **Does session-offerings disappear into this round?** The five `/v1/series/:id/offerings` routes write the same
   parent-level row as the event routes, have no client, and are kept alive only by their own tests.
   **Recommendation:** fold them into this round's deletion list and drop that round. **Cost:** this diff grows by
   five routes and their tests; nothing else changes. Owner answered "all as recommended" (2026-11-24).
2. **Do offerings stay parent-only?** **Recommendation:** yes — an offering is **defined at the parent event** and
   **collected against a session** through the per-session offering count, and the per-occurrence attachment stays
   deliberately unexposed. **Cost:** one date cannot price differently from another, which nobody has asked for, and
   `member-registrations-session-offerings.md` is withdrawn to a record of what was considered. Owner, 2026-11-24:
   "offerings are collected against sessions, but defined at parent event."
3. **Does `view=parent` get removed?** Removing it forces a UI change into a round that also carries a migration and
   a route deletion, and R6 would then demand a signed mock for the list and detail, both `target`.
   **Recommendation:** no — the default flips to the parent read and the flag stays accepted as an ignored alias,
   retiring in a later UI-only round with the mock rebuild. **Cost:** the flag outlives its usefulness by one round.
   Owner answered "all as recommended".
4. **Where does this round run?** **Recommendation:** a fresh session, with a clean context and the seat files
   reloaded. **Cost:** one hand-off, where this doc, the amended specs and the owner's pre-authorisation carry the
   intent instead of the working session's memory. Owner answered "all as recommended".

**The owner's pre-authorisation, as amended by answer 3:** unattended for round `event-parent-downstream`, with its
three hard gates: the migration that drops `events.ministry_id` and `events.presbyter_only` and adds the partial
unique indexes for recurring `(lower(name), audience_id)` and audience `(lower(name))`; the deletion of the public
`/v1/series/*` routes (including the five offering aliases); and the wire-contract change that flips the default read
to the parent while `view=parent` remains accepted.

## Plan

Goal: the parent read is the default, the legacy pair is gone, and `/v1/series/*` is deleted.

- Migration: drop `events.ministry_id` and `events.presbyter_only`; add `(lower(name), audience_id)` partial unique
  over non-archived recurring events and `(lower(name))` partial unique over audiences.
- The legacy serialisers go; `/v1/events` and `/v1/events/:id` serve the parent shape by default; `view=parent` is
  accepted and ignored.
- Delete `/v1/series/*` — the read alias and the five offering aliases — with their tests.
- Retire the dual write of the legacy projection (nothing reads it once the columns are gone).
- Update every fixture and test that asserts the legacy shape.

Out of scope: the UI (no change — the flag keeps it working), the additive wires, the mock rebuild, and any
per-occurrence attachment.

Acceptance criteria:

1. The migration drops both columns and adds both indexes, with its rollback story stated in the round doc.
2. `/v1/events` and `/v1/events/:id` return the parent shape by default; `view=parent` still resolves.
3. `/v1/series/*` is gone, and no UI call reaches it.
4. No reader of `ministry_id`/`presbyter_only` remains.
5. `npm run smoke` passes; the full gate passes; the UI lane is unchanged because no UI file moved.

## Verification

| Gate                  | Command               | Result                                                                                                                |
| --------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Fast gate (round doc) | `npm run verify:fast` | pass — 4/4, after one re-run of three member suites that failed together under parallel load and passed alone (67/67) |

gate-run 2026-11-24T05:26:52.018Z profile=fast steps=4/4 lines=4 bytes=891

## Review

Seat: consistent - worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                             |
| ----- | --------------------- | ------ | ------------------------------ | ---------------------------------------------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/event-parent-downstream` at `main` with this doc and the spec amendments |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The doc and the three amended specs                                                |
| 3     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The migration, the flip and the deletions                                          |
| 4     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                                        |
| 5     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                                                  |
| 6     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                                                           |
| 7     | `parent`              | sync   | -                              | Main is held by the `ussd-budget` worktree                                         |

`git-seat-budget: 8` = `1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync`, one brief held.

## Mock sign-off

n/a - no `ui/src/` change: the read flip ships behind the accepted `view=parent` flag, so the UI is untouched.

## Mock parity

n/a - no drawing changes.

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

- **The round opens from a fresh session** on the owner's answer 4. Everything it needs is in this doc, the three
  amended specs and `git log`: the evaluator (`c4b2fad`), the withdrawn session-offerings spec, and the amended
  transition paragraph in the API spec.
