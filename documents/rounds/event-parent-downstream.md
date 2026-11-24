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

- **Rollback.** The two columns are derived projections (A-7), so the story is a **restore, not a
  down-migration**: re-add `ministry_id` and `presbyter_only` with a migration that re-derives them from
  `audience_id` for every event whose audience is an `allOf` of ministry and presbyter clauses, and leave them null
  otherwise; the two indexes drop with the same migration. `/v1/series/*` returns with the code revert. Deploying
  the old code without that migration is not a rollback — the old serialisers read columns that would not exist.
- **The `audiences` name index is included on its own merit**, not because the column drop needs it: the write round
  enforced that uniqueness in the repository only, and a concurrent pair of creates can still slip past it. It lands
  here because this is the round that touches the schema. The recurring `(lower(name), audience_id)` index is the
  same story and is what the drop makes safe to add.
- **`seriesId` on the members attendance aggregate** is the last legacy alias: it retires here and becomes
  `eventId`, because the round deletes `/v1/series/*` and leaving one alias behind would be a lie about the
  transition being over.

Out of scope: the UI (no change — the flag keeps it working), the additive wires, the mock rebuild, and any
per-occurrence attachment.

Acceptance criteria:

1. The migration drops both columns and adds both indexes; its rollback story is stated in this doc, and a test proves the legacy pair is gone from the schema and the read model.
2. `/v1/events` and `/v1/events/:id` return the parent shape with no `view`, with `view=parent`, and answer `422 validation_error` for any other `view` value.
3. `/v1/series/*` is gone, and a grep proves no `ui/src/` source and no test references it.
4. No reader of `ministry_id`/`presbyter_only` remains.
5. `npm run smoke` passes and the full gate passes; `git diff --name-only` shows no `ui/src/` file.

## Verification

| Gate                  | Command               | Result                                                                                                                |
| --------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Fast gate (round doc) | `npm run verify:fast` | pass — 4/4, after one re-run of three member suites that failed together under parallel load and passed alone (67/67) |

gate-run 2026-11-24T05:26:52.018Z profile=fast steps=4/4 lines=4 bytes=891

## Review

Seat: consistent - worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

**Pass 3 (commit `b322f51`) - ACCEPT.** The withdrawal is complete in both specs: every surviving mention is either
explicitly withdrawn, recorded as "not part of this model", stated as "no replacement / no such column", or a
superseded changelog entry. FR-22/23/24/25/43, AC-12/AC-32, the route contract and OS-14 describe event-level
attachment with per-session collection, and a reader building the schema from these documents cannot mint
`session_offerings` or a `session_offering_id`. **The round is unblocked for its migration.**

One observation the reviewer left for the owner, not a finding: `event_offerings.occurrence_id` still documents the
settled 0026 per-instance rekey as a nullable legacy column, which the "legacy history" qualifier and the "no
`session_offerings` replaces it" note keep from reading as a forward target.

**Pass 1 (commit `511844b`) - REWORK.** The amendment changed the transition paragraph and left a dozen sentences
elsewhere describing per-occurrence attachment as the plan. Fixed in `0d6bb33`: FR-10/FR-11, the parent-scope
bullet, the `view` contract, the contribution and pledge sessions, `?ministry=`, the error list, two data-model
rows, the offerings spec's status/expiry/FR-9/FR-19, the withdrawn spec's round order, and superseded notes on the
2026-11-22 changelog entries.

**Pass 2 (commit `0d6bb33`) - REWORK.** Judgements 3-6 met; judgement 1 (withdrawal completeness) still fails.
The surviving normative text, which must be rewritten rather than annotated:

- `member-registrations-api.md` - the session-expiry sentence; the "event-level rows are the contract until the
  session-offerings round" block; the `event_offerings`, `offering_exceptions`, `session_offerings` and
  `session_offering_events` model rows; the three "the session-offerings round replaces/adds/converts" notes; and
  OS-14.
- `member-registrations-events-offerings.md` - FR-43, FR-22, FR-23, FR-24 (two sentences), AC-12, AC-32, the
  one-row-per-session-offering line, the "attachment routes move in a separate round" block, five model rows
  including `event_session_offering_counts`, and the 2026-11-22 changelog entry.

**Why it is parked rather than patched again:** the reviewer's bound is one more fix and one confirmation. The
surviving list is ~25 sentences needing per-sentence judgement, and a mechanical annotation pass attempted here
produced markers mid-sentence and on already-corrected text; it was reverted and the two specs restored from
`0d6bb33`. **Resume by rewriting the normative text** (FRs, ACs, the schema rows and the migration outline) and
annotating only what is historical - the changelog entries and the withdrawn spec's own narrative. A table
definition marked "withdrawn" still reads as a table definition.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                                     |
| ----- | --------------------- | ------ | ------------------------------ | ------------------------------------------------------------------------------------------ |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/event-parent-downstream` at `main`; carries this doc and the spec amendments     |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The doc and the three amended specs (`511844b`)                                            |
| 3     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The review's fixes across the three specs and this doc, plus `seats.json` and `backlog.md` |
| 4     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The migration, the flip and the deletions                                                  |
| 5     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                                                |
| 6     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                                                          |
| 7     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                                                                   |
| 8     | `parent`              | sync   | -                              | Main is held by the `ussd-budget` worktree                                                 |

`git-seat-budget: 8` = `1 branch + 3 commits + 1 push + 1 pr + 1 merge + 1 sync`; the third commit carries the
review's fixes and the two bookkeeping files, so no brief is held in reserve.

## Mock sign-off

n/a - no `ui/src/` change: the read flip ships behind the accepted `view=parent` flag, so the UI is untouched.

## Mock parity

n/a - no drawing changes.

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

- **The sweep rewrote rather than annotated**, as the second review required: ~30 sentences across the two specs, the
  schema rows included. `session_offerings` and `session_offering_events` are now recorded as **not part of the
  model** rather than as tables to build, the migration outline no longer promises a conversion, and FR-22/23/24/43
  with AC-12/AC-32 describe parent-level attachment and per-session collection.
- **The branch is deliberately unpushed at two commits** (`511844b`, `0d6bb33`). A PR carrying spec text refused twice
  invites a review of the wrong thing, and the protected-doc rule hashes exact bytes, so it goes up once the text
  passes.
- **The round opens from a fresh session** on the owner's answer 4. Everything it needs is in this doc, the three
  amended specs and `git log`: the evaluator (`c4b2fad`), the withdrawn session-offerings spec, and the amended
  transition paragraph in the API spec.
