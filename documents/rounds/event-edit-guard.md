# Round — event-edit-guard

|                        |                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                                                                                                                       |
| Tier                   | 2                                                                                                                                                                            |
| Mode                   | `unattended (auto-accept recommendations)`                                                                                                                                   |
| Base                   | `748f6d2`                                                                                                                                                                    |
| Review rounds          | 0                                                                                                                                                                            |
| Gate runs in parent    | 0                                                                                                                                                                            |
| Spec                   | `documents/specs/member-registrations-event-periods.md`, `member-registrations-api.md`, `member-registrations-ui.md`                                                         |
| Workers                | `single (the two tracks run serially; no persistent worktree slot existed, so parallel would have paid two full installs - see Deviations)`                                  |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (contract); worker ollama-cloud/deepseek-v4.1-flash:1017 (API track); worker ollama-cloud/deepseek-v4.1-flash:1017 (UI track)` |
| Verbs this round needs | `branch, commit, push, pr, merge`                                                                                                                                            |
| Git-seat budget        | 20 (`3 branch + N commits + 3 push + 3 pr + 3 merge` = 12 + N; the previous round spent 22 against a declared 16, so this is set from evidence)                              |

## Seats

| Seat     | Picked (local) | Window | Class         | Candidate probed                                   | Basis                                      |
| -------- | -------------- | ------ | ------------- | -------------------------------------------------- | ------------------------------------------ |
| grill-me | 2026-11-25     | out    | `grill-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` - answered | outside 12:00-18:00, so ollama-cloud leads |

## Grill

One `grill-flash` round, relayed and answered "all as recommended". The seat corrected the brief on nine facts
before asking; the corrections are recorded in the questions they changed.

1. **Round scope: rule only, or the whole edit surface?** Recommendation: rule only; a standalone event's date rows get
   their own round. Cost: FR-42b's standalone clause waits another round, mock `19` falls to `target` (a protected
   catalogue edit), and a one-cycle period event's dates stay uneditable by any path (backlog row). **Answered: as
   recommended.**
2. **How the client learns the guard before offering an edit.** Derivation cannot answer it - the parent read is
   one day wide, offerings are active-only, `stats` are zeroed, suppressions appear nowhere. Recommendation: the parent
   read gains `schedule: { locked, reasons: [{ code, date }] }`, computed by the same function the write guard calls,
   with a closed code set. Cost: a wire change on the list and the detail, one `EXISTS` batch per assembled parent,
   `openapi.json`, and a `0813` amendment. **Answered: as recommended.**
3. **Which clock is the guard's "today"?** Recommendation: the event's own today (UTC unless the event carries a
   timezone), as the status chip already uses. Cost: a one-line amendment to the spec's "(UTC)", so the guard cannot
   contradict the status beside it. **Answered: as recommended.**
4. **The rule write's verb and shape.** Recommendation: one `PUT /v1/events/{id}/schedule` taking exactly one arm
   (`{ recurrence: { rrule, endsOn? } }` or `{ period: { frequency, day? } }`), the wrong arm refused `422`; extension
   stays on `POST .../recurrence/versions`. Cost: the spec's "the write is `POST .../versions`" sentence is amended and a
   `oneOf` enters the contract. **Answered: as recommended.**
5. **The rewrite's response and window.** Recommendation: `{ recurrence, period, occurrences, generated }`, regenerated
   over the event's current window, never extending the horizon (`generate` stays the calendar's job). Cost: a richer
   response than the versions route, and a rule resolving further out needs a later `generate`. **Answered: as
   recommended.**
6. **What the rewrite deletes.** Recommendation: future rows with status `scheduled` only; a future `cancelled` row
   survives, and `extra`/`cancelled` exceptions re-apply on regeneration. Cost: a cancelled date can outlive the rule
   that produced it - truthful, but odd on the calendar. **Answered: as recommended.**
7. **Does the form send the rule when it has not changed?** Recommendation: only when the authored rule differs from the
   stored one; a stored rule outside the vocabulary stays read-only as it already renders. Cost: a dirty comparison, and
   such an event is permanently read-only. **Answered: as recommended.**
8. **`PATCH` must refuse the schedule by name.** Recommendation: `updateEventParentSchema` refuses `recurrence` **and**
   `period` by name (the `eventNo` idiom, `422`), because today a `recurrence` key is silently stripped - a dropped
   write. Cost: two schema lines, two tests, one spec sentence, and a visible error where a no-op used to be. **Answered:
   as recommended.**
9. **Does the guard cover audience changes?** Recommendation: no - schedule-only; record the shrink's history
   consequence (past `expected` and the window's `rate` already move) in the spec and the backlog. Cost: recorded debt,
   against amending AC 9 and taking away a verb officers have. **Answered: as recommended.**
10. **The mock disposition.** Recommendation: the owner signs `16-event-edit`, `17-event-edit-locked` and the four
    create states at acceptance; `19` drops to `target`. Cost: a protected-catalogue edit with its exact-text review, and
    the owner's signature - a seat cannot sign. **Answered: as recommended.**
11. **The round's shape, tier and workers.** Recommendation: three PRs - contract, API, UI - at Tier 2, with parallel
    API and UI tracks after the contract merges (`documents/agents/parallel-ui-api.md`). Cost: three cycles, two
    workers' peak RSS recorded, one live-vs-mock e2e case per new endpoint. **Answered: as recommended.**
12. **The git budget.** Recommendation: declare 20, from the previous round's 22-against-16 evidence. Cost: a metered
    rung may be drawn; every write names its actor. **Answered: as recommended.**
13. **The hard-gate sentence.** Recommendation: the round runs unattended, opened by "Round `event-edit-guard` is
    unattended, and its wire-contract change is approved". Cost: the sentence must name this round and this gate; the
    spec is still amended, reviewed and recorded before a worker builds. **Answered: accepted by the owner's "all as
    recommended" on this frontier.**
14. **Exclusions.** Recommendation: the detail's period line and audience chips (backlog trigger re-pointed), the
    catalogue admin, `RowActionsMenu`/P-1, the standalone and one-cycle date rows, and any change to `generate`'s
    scheduling. Cost: the detail keeps reading without its provenance line for one more round. **Answered: as
    recommended.**

## Review

`0813` (`reviewer-pro`). First pass: `Seat: contradicted` - FR-42g had been corrected while **AC-56 and AC-64 still
bound a create `409` to the Event-number field AC 8 removed**, which would have had an implementer build the control the
spec forbids elsewhere. All findings were fixed (the two ACs; FR-42h's missing AC, now AC-66; the stale `Event` snippet;
the response's after-write contents; "attached to any occurrence" vs the event-level attachment; `attendance_recorded`
covering a headcount; the period arm's comparison; the header's stale gate sentence), and the confirmation pass returned
`Seat: consistent`, with two notes applied: AC-66 now states the **recurring** precondition, and the response's `period`
is explained as carrying no `cycle`.

**Tier 2 code review** (`0813`, Standards + Spec): `Seat: consistent` with one **P2** and one user-visible nit. The P2:
`toScheduleWrite` keyed its single-date special case off an edit-seed field that is always null, so the branch was dead
and worked only because a single-date period's stored `day` happens to be null - fixed by deriving the shape from the
catalogue, the same projection the builder uses, with a test that fails if the dead branch returns. The nit: the edit
branch's preview did not feed the page-level counts, so an audience chip could disagree with the summary beside it -
wired to the same state the create route uses. The remaining nits (a bare `Text` where `Label` is preferred, and the
locked read-out stating the rule three times) are recorded and left, not silently dropped.

Seat: consistent

## Plan

Goal: make an event's schedule editable under the approved guard, without any path rewriting a past date.

**PR 1 - contract only** (schemas, examples, `openapi.json`, no handler): the read's `schedule`, the
`PUT /v1/events/{id}/schedule` request/response, and the `PATCH` refusals. Merges before either track branches.

**PR 2 - API track**: one `scheduleFor` that answers both the read field and the write guard; the write in one
transaction (replace the version in force for an rrule, replace the period fields for a period rule), regenerating the
current window's future `scheduled` rows, leaving cancelled rows and exceptions; `generated: false` when the window
could not be produced.

**PR 3 - UI track**: the edit route mounts the builder when the guard is open and the type is recurring; a closed guard
renders the four-row summary with the specific cause; the rule is sent only when changed; no Repeats switch; the period
control edits `frequency`/`day` through the same verb.

Acceptance criteria (numbered):

1. Each guard cause alone produces `locked: true` with its code, and the write answers `409 recurrence_locked`.
2. An unchanged rule writes nothing; a changed rule writes once and the calendar matches the response.
3. No occurrence on or before the guard's today is deleted or moved; a future `cancelled` row survives a rewrite.
4. A period rule edits `frequency`/`day` while the guard is open, and answers `409` once it closes.
5. `PATCH` with `recurrence` or `period` is a `422` naming the field.
6. The UI never offers a rule edit it cannot save, and renders the cause when it cannot.

## Verification

| Gate                           | Command                        | Result                                                                                         |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| docs (round doc + three specs) | `npm run verify:fast`          | pass 4/4                                                                                       |
| PR 1 contract                  | `npm run verify:fast`          | pass 4/4 (1223 tests)                                                                          |
| PR 2 API                       | `npm run verify:fast`          | pass 4/4 (1245 tests)                                                                          |
| PR 2 API                       | `npm run smoke`                | PASS, 84 checks                                                                                |
| PR 3 UI                        | `npm run verify:fast`          | pass 4/4 (1245 tests)                                                                          |
| PR 3 UI                        | `npm run ui:test`              | 567 passed                                                                                     |
| PR 3 UI                        | `npm --prefix ui run test:dom` | 258 passed                                                                                     |
| PR 3 UI (merged)               | `npm run ui:e2e`               | 93 passed (re-run 1 of 2: one retired-route test failed on a cold server, 93/93 on the re-run) |

gate-run 2026-11-25T09:26:21.783Z profile=fast steps=4/4 lines=4 bytes=718

## Git writes

| Brief | Actor | Verb | Variant | Reason |
| ----- | ----- | ---- | ------- | ------ |

## Mock sign-off

| Surface                | Mock                                  | Capture                          | sha256     | Signer       | Date       | Verdict     |
| ---------------------- | ------------------------------------- | -------------------------------- | ---------- | ------------ | ---------- | ----------- |
| event edit, guard open | `mockups/v2-events/16-event-edit.png` | `ui/e2e/baseline/event-edit.png` | `71ee1d0b` | owner (owed) | 2026-11-25 | auto-signed |

Mock coverage: claimed 10 · e2e-only 1 · deferred 1 · prose 0

The pair is the round's surface, and the build stands under both drawings: `16` was unchanged by the re-cut (the
recorder reported it identical) once the edit route regained FR-42b's summary and Preview, and its baseline was
re-captured (`event-edit.png`, 67 KB -> 84 KB). `17` was **wrong** - it drew the builder's controls inert, while
FR-42h/AC-66 say a locked schedule offers no control at all - so it was re-cut to the built state (notice with the cause,
stored rule line, "Dates on the rule in force" with no Preview) and its auto-signature voided to `target`, as §17
requires. The two edit claims (`EVE-GUARD-SURFACE` PRESENT, `EVE-NO-REPEATS` ABSENT) were added so the state can be
scored at all. The line still runs with `--allow-short`: the **selection** carries one `spec-required` + `ABSENT`
control, below the tool's floor of three - reaching the floor would mean scoring the create and headcount states, which
this round did not touch.

## Mock parity

| Claim | Type | State | Answer (max prob) | Threshold | Confirmed by | Disposition |
| ----- | ---- | ----- | ----------------- | --------- | ------------ | ----------- |

## Acceptance

| Criterion                                                                                 | Met | Evidence                                                                                                                                      | Verdict  |
| ----------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Each guard cause locks the read and refuses the write with its code                       | yes | `tests/api/event-schedule-write.test.ts` - every cause, on the read and on the 409                                                            | ACCEPTED |
| An unchanged rule writes nothing; a changed one writes once                               | yes | DOM tests: "sends no schedule write when the rule is unchanged", and one `PUT` for a changed rule                                             | ACCEPTED |
| No occurrence on or before today is deleted or moved, and a future cancelled row survives | yes | API test: the rewrite keeps the cancelled row and its note; the window is read before the delete                                              | ACCEPTED |
| A period rule edits frequency/day and 409s once the guard closes                          | yes | API and DOM tests, including Home Cells taking no day                                                                                         | ACCEPTED |
| `PATCH` refuses `recurrence` and `period` by name                                         | yes | `tests/unit/event-schemas.test.ts`; the contract merged in #237                                                                               | ACCEPTED |
| The UI never offers an edit the write would refuse                                        | yes | `canEditSchedule` reads `schedule.locked`, computed by the same function the write calls; the code review confirmed no second source of truth | ACCEPTED |

## Deviations

- **The tracks ran serially, not in parallel** (2026-11-25). The plan declared `parallel (tracks: API, UI)`, but no
  persistent worktree slot existed for either track, and a fresh slot pays a full install; two installs to run two
  file-disjoint tracks was the worse trade. The API track therefore merged before the UI track branched, which also
  satisfies the contract-first ordering the round already required.
- The frontier was seat-run; the owner answered "all as recommended" on the whole round, which is also the grant for
  its wire-contract gate (Q13).
