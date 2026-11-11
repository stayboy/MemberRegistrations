# Round — attendance-capture-model

|                     |                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                                 |
| Tier                | 2                                                                                                                                                                    |
| Mode                | attended (owner grill, 2026-11-11; "all as recommended")                                                                                                             |
| Base                | `1f5b995`                                                                                                                                                            |
| Review rounds       | 4 (spec: 2 on the window seat, 2 on 0813)                                                                                                                            |
| Gate runs in parent | 0                                                                                                                                                                    |
| Spec                | events/offerings FR-4b/FR-6f; API §Imports/§Headcounts/§Clocking, AC-32/AC-33                                                                                        |
| Workers             | `single`                                                                                                                                                             |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (source, UI, migration 0020); worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (tests, ses_e34fe2afdffeORnZA8BEy0HkpB) |
| Migration           | **pre-authorised by name**: `0020_attendance_captures` (owner, 2026-11-11)                                                                                           |

### Decisions (grill, 2026-11-11)

- **Live is computed**, never stored and never a user choice: a session is live when its date is today in the
  event timezone and the clock falls inside its start/end window. The 1/2 mode menu is dropped.
- Each capture stores `asOf` (the clock) and `ended`; the only user action is **End of session**.
- A capture outside the live window, before any close, is accepted **as** the end capture and closes the
  session.
- **One shared close** per (event, session), derived from any ended capture — per-member or headcount; after
  it every per-member and headcount write answers `409 session_closed`.
- A capture replaces that session's **imported** rows; manual rows and suppressions survive. Live captures
  may repeat; an end capture is once.
- Manual and USSD per-member rows are accepted only for a session dated **today** in the event timezone and
  never after a close; they never carry `ended`.
- The presbyter records male/female/children counts on the headcount page and USSD (roles unchanged); the
  headcount gain the same computed live/end.
- Round C keeps the USSD copy and the date fallback.
- The event session DTO gains `capture: { asOf, ended } | null` — the latest capture of either channel
  (the later `asOf`; `asOf` is an ISO-8601 instant, rendered in the event timezone); **this round is the
  named §17 pre-authorisation for that wire addition**.
- Migration `0020` adds `as_of` nullable with a `now()` default, backfills it from each batch's
  `created_at`, then applies `not null`; existing headcounts get `ended = false`.
- A headcount's `asOf` stays inside the session's calendar day, so a headcount after that day is refused;
  only a late **import** can close a past session.
- The capture time displays in the event timezone; **End of session** is offered only while the session is
  live, and a past open session reads "Past session — this capture will end it".
- The detail line shows the latest capture of either channel.

## Plan

1. **Spec first.** The API and events amendments are written; a separate
   `ollama-cloud/deepseek-v4-pro:0813` session reviews the exact text before code.
2. **Mock gate.** Signed states in the existing sets: the import page's capture state and End action
   (`mockups/v2-imports/`), the headcount state (`mockups/headcount/`), and the detail line
   (`mockups/v2-events/`). No new folder.
3. **Migration `0020_attendance_captures`.** `import_batches` gains `as_of timestamptz not null default now()`
   and `ended boolean not null default false`; the migration adds `as_of` nullable with a `now()` default,
   backfills it from each batch's `created_at`, then applies `not null`; `event_session_headcounts` gains
   `ended boolean not null default false`. No session table: the close is derived from any ended capture.
4. **API.** The attendance import body gains `ended?`; the server stamps `asOf`, computes live, forces `ended`
   outside the window, refuses after a close (`409 session_closed`), and replaces the session's imported rows.
   The headcount route gains `ended?` and the same close check. Manual/USSD writes gain the date-today and
   close checks. The event aggregate computes each session's `capture` (the later `asOf` across the import
   batch and the headcount, with the session's shared `ended` state), which feeds FR-4b.
5. **UI.** The import page shows the computed state ("Live · recorded 10:42") with one **End of session**
   action; the headcount page the same, and its service-mode labels follow the spec — Adult service is
   **Adult men / Adult women / Children**, Children service is **Boys / Girls / Adults** (never
   "(unspecified)"), and the children-service field order is boys, girls, adults; the event detail shows
   the per-session capture line. The import page also carries the past-open label and the headcount page the
   ended state.
6. **Tests.** Live vs end, repeat live, end once, late end, the shared close across channels, manual
   date/close, replacement vs manual survival.
7. **Gates.** `verify`, `smoke`, `ui:test`, `ui:e2e`; capture refreshes for the import, headcount and event
   detail baselines.

### Acceptance criteria

1. A live capture (session today, inside the window) is accepted, stamped with `asOf`, and does not close
   the session; a second live capture replaces the first's imported rows.
2. An end-of-session capture is accepted once, sets `ended`, and closes the session; any later per-member or
   headcount write answers `409 session_closed`.
3. A capture outside the live window with no close is accepted and treated as the end capture.
4. Manual and USSD per-member writes are accepted only for a session dated today in the event timezone and
   refused after a close; a manual row survives later captures.
5. The event detail shows, per session, the latest capture's time and whether it ended the session,
   derived from the session's `capture` field — never from a stored live flag.
6. The migration is `0020_attendance_captures`; no session-close table is added.
7. `verify`, `smoke`, `ui:test` and `ui:e2e` are green.
8. The three capture baselines are refreshed.
9. The headcount page names the adult-service buckets **Adult men / Adult women / Children**, the
   children-service buckets **Boys / Girls / Adults**, in that order — never "(unspecified)" — and Mixed
   service stays portal-only with **Adult men / Adult women / Boys / Girls**, matching
   `member-registrations-ussd.md:401-402`.
10. `GET /v1/events` and `GET /v1/events/{id}` sessions carry `capture: { asOf, ended } | null` (the later
    `asOf` of the two channels, with the session's shared `ended`; `asOf` an ISO-8601 instant rendered in
    the event timezone), and the detail line derives from it.
11. Migration `0020` backfills `as_of` from each batch's `created_at`; existing headcounts read `ended =
false`.
12. A headcount after the session's calendar day is refused with `422`; the capture time is rendered in the
    event timezone, and **End of session** is offered only while the session is live.

## Verification

| Gate     | Command              | Result                                                                                                   |
| -------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| Spec     | window seat          | window-seat `mimo` ACCEPT after two REWORK rounds; 0813 in-window verdicts superseded                    |
| Spec (2) | window seat          | close-before-day and code-punch gate approved 2026-11-11; exact sentences reviewed                       |
| Mocks    | signatures           | owner signed ten states, 2026-11-11                                                                      |
| Verify   | `npm run verify`     | pass — skill/format/lint/typecheck/test/build, 6/6 steps                                                 |
| Smoke    | `npm run smoke`      | pass — PGlite end-to-end, headcount now written against the today event                                  |
| UI unit  | `npm run ui:test`    | 417 passed (39 files)                                                                                    |
| UI e2e   | `npm run ui:e2e`     | 66 passed                                                                                                |
| Capture  | `npm run ui:capture` | 21 + 1 written; three committed (`imports-attendance`, `event-detail`, `headcount-capture`), 19 reverted |

The parent's numbers are the acceptance numbers. The worker's totals (37/37 API files, 515 passed, 6
skipped, after the checkout reconcile) are evidence only and are not quoted in `## Acceptance`.

**Windows worker flake.** Three full `verify` runs were made at the reworked tree: two aborted with the
known `3221226505` worker crash (0 test failures; the crashing file differed each time — `ussd.test.ts`,
then `payment-groups.test.ts` and `members-crud.test.ts`), and the third passed 6/6. The crash is the
runner, not a test: the same suites pass in isolation and the counts were 596/596. Recorded, not looped
beyond the third run.

### Worker report (tests, `cline-pass/cline-pass/deepseek-v4.1-flash-1017`)

Files: `tests/api/attendance.test.ts`, `events.test.ts`, `event-headcounts.test.ts`,
`attendance-codes.test.ts`, `members-crud.test.ts`, `ussd-attendance.test.ts`, new
`tests/api/attendance-captures.test.ts` (9 tests). Findings returned to the parent, not fixed by the
worker: the repeat-capture checksum guard (fixed in `src/repos/imports.ts`), the headcount close/day
precedence (fixed), the ungated code punch (fixed with the glossary), and a `Location` expectation that
the spec does not define (dropped).

Seat note (verified 2026-11-11, 14:2x local). The 12:00–18:00 window rule
(`orchestrator-policy.md:37-39`) moves **only** the reviewer / plan-gate / spec-review / acceptance
seat, and moves it to `cline-pass/cline-pass/mimo-v2.6-pro`; no document gives the **worker** a clock
rule. The earlier window review was served by `ollama-cloud/mimo-v2.6-pro` after a `cline-pass`
dispatch failure, and that failure was then written up as "model not found". That claim is not
repeated: `cline-pass` is configured (15 models in `opencode models`) and
`cline-pass/cline-pass/deepseek-v4.1-flash-1017` dispatched cleanly on 2026-11-11. Resolve a seat by
dispatch, never by catalogue.

The tests seat for this round is `cline-pass/cline-pass/deepseek-v4.1-flash-1017`, chosen by the
owner on 2026-11-11 while `ollama-cloud/deepseek-v4.1-flash:1017` (rank 1 at policy:43) was
available — an owner-directed choice, not an unavailable-seat fallback. The parent had already
authored the source, UI, migration and two test conversions before that choice; the deviation is
recorded under `## Deviations`.

Enforcement decisions taken in the same grill (they land in the next protected-doc round, not here):
a machine-checked `Implementer` header row; a Tier-2 rule that needs a `worker` segment or an explicit
`Tier 2 parent-authored: <reason>` deviation; a required round doc whenever `src/**` or `ui/src/**`
changes; a path-derived Tier floor; a reviewer `Seat:` consistency verdict; the worker's report pasted
into the round doc by the parent (the parent stays the only writer); a reviewer instruction to diff
test assertions so a tests-only worker cannot weaken them; and a correction to the stale canonical
`references/models.md` claim that no cline-pass provider exists, as a separate commit with the manifest
hash and the record entry.

The spec review caught two contract gaps (the headcount body lacked `ended?`, the repeat-`409` text survived)
and the migration number: `0018` stays with 24e and `0019` with the offering denominations, so the capture
model takes **`0020_attendance_captures`**.

gate-run 2026-11-11T15:29:59.002Z profile=full steps=6/6 lines=6 bytes=680

## Review

Round 1 (`ollama-cloud/mimo-v2.6-pro`, window seat; the `cline-pass` route was rejected as model not
found and the same model on `ollama-cloud` served it) returned **REWORK** with three blockers, all fixed:

| #   | Finding                                                                          | Fix                                                                                   |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | AC 8: no baseline for the changed headcount surface                              | `ui/e2e/capture.spec.ts` gains a `headcount capture` case and `headcount-capture.png` |
| 2   | P1 `ui/src/format/events.ts:131` — the detail line formatted in the browser zone | `sessionCaptureLine` renders `captureStamp` in the event timezone (`8 Nov 11:05`)     |
| 3   | P1 `src/repos/members.ts:1367` — member route checked today before the close     | close is read first (no instance minted on refusal), then the today rule              |

P2s also fixed: the event aggregate takes `asOf` from the current non-superseded headcount only and
resolves a full tie to the import (`src/repos/events.ts`); the import page shows **End of session**
disabled once ended, as FR-6f/AC-7a say (`endActionState` in `ui/src/format/capture.ts`). The signed
mock `03` shows the action absent, so that is recorded as a **mock correction**, not a spec change.
Nits left: `DuplicateImportError` now has no thrower (kept, mapped), `ui/src/api/events.ts` still types
`capture` optional.

Review round 2 (confirmation, same seat) returned **ACCEPTED** on all three blockers, with two P2s kept
out of the block and fixed anyway: the FR-4b/FR-6f examples now match the rendered, owner-signed form
(the detail line carries the day and renders in the event timezone without a zone suffix; the import page
says "recorded"; the ended action is disabled), and the aggregate now carries the DTO comment's final
`id` tie-break inside a channel. The reviewer also confirmed the gate record and the AC 8 baseline.

## Mock sign-off

| Surface                                   | Mock                                               | sha256                                                             | Signer | Date       | Verdict |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| Import page — live state + End action     | `mockups/v2-imports/02-attendance-live.png`        | `6fc03131c699db0f2ef267a486ee8d8de25d56e5a20b00d5c125eb6c20534206` | owner  | 2026-11-11 | signed  |
| Import page — ended state, no End action  | `mockups/v2-imports/03-attendance-ended.png`       | `eb71d1304f2ecd88775dccda04a900afd0462debe6c0122b8735bf837bb1dd9d` | owner  | 2026-11-11 | signed  |
| Import page — past and open               | `mockups/v2-imports/04-attendance-past-open.png`   | `446c94d1997230f217d3494e7ab002685c4eea3345c60b198094d708665dd91d` | owner  | 2026-11-11 | signed  |
| Import page — not started, no capture     | `mockups/v2-imports/05-attendance-not-started.png` | `2722835fabb3d5bf370a7714ef9b159a34e251d4e9a2e811088756de2b9e3380` | owner  | 2026-11-11 | signed  |
| Headcount page — live state + End action  | `mockups/headcount/10-capture-state.png`           | `632463051aa1cc8b11610aae03def16d543457658779c2d9fdbe539266ea39a1` | owner  | 2026-11-11 | signed  |
| Headcount — children service              | `mockups/headcount/11-children-service.png`        | `863313e0a5cd5a19e44244a13c96f05a04b7406757b24666967a2eae7a24d8bd` | owner  | 2026-11-11 | signed  |
| Headcount — mixed service (portal-only)   | `mockups/headcount/12-mixed-service.png`           | `855c962ba780a848b5918a678175a6d361e5bd45a4d702244d382f2aa339a2b4` | owner  | 2026-11-11 | signed  |
| Headcount — ended state, actions disabled | `mockups/headcount/13-headcount-ended.png`         | `6fc440a06ec86d691d7596649a567954e48c570b471a4e182fccd4f25cb647ec` | owner  | 2026-11-11 | signed  |
| Event detail — capture line               | `mockups/v2-events/08-event-detail-series.png`     | `f21776afbbf9e96e43073952bb1cf500f3b52306ead212c612b6c7d8e413cf25` | owner  | 2026-11-11 | signed  |
| Event detail — cancelled session line     | `mockups/v2-events/09-event-detail-cancelled.png`  | `7694767252dec489b21cbaa8e27179c15d48ff689e9af598a58330881978d96b` | owner  | 2026-11-11 | signed  |

All states live inside the sets the surfaces already have (`v2-imports`, `headcount`, `v2-events`); no new
folder. The event-detail file is refreshed from its entry state (`71c756…`), so this round signs the new
hash.

## Mock parity

| Claim                                        | Type | State                    | Answer | Threshold | Confirmed by                                 | Disposition                                                                             |
| -------------------------------------------- | ---- | ------------------------ | ------ | --------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Computed live/end state on captures          | R    | `imports-attendance.png` | FR-6f  | AC-32     | parent, baseline vs signed `02/03/04/05`     | PASS — past-open label present; no End action on a past session, as signed              |
| Per-session capture line on the event detail | R    | `event-detail.png`       | FR-4b  | AC-33     | parent, baseline vs signed `08`              | PASS — line under the status pill; "No capture yet" on an uncaptured session, as signed |
| Headcount capture state and actions          | R    | `headcount-capture.png`  | FR-6f  | AC-32     | parent, baseline vs signed `headcount/10-13` | PASS — state line and End action present; added after review round 1                    |

**Mock correction.** Signed `mockups/v2-imports/03-attendance-ended.png` shows the ended state with **no**
End action, while FR-6f and AC-7a require the action _disabled_. The spec is authoritative, so the build
renders a disabled button and the mock is corrected on its next refresh; the spec was not amended.

The `clef:27b` screen was not run (it is optional and needs an endpoint this round did not have); the
comparison is the rendered baseline against the owner-signed mock, which is the check the policy makes
advisory until a fully signed round is green. The reviewer confirms each row in `## Review`.

## Acceptance

| #   | Criterion                                                                  | Evidence                                                                              |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Live capture accepted, stamped, not closing; repeat replaces imported rows | `attendance-captures.test.ts` live block; `src/repos/imports.ts`                      |
| 2   | End capture once, sets `ended`; later writes `409 session_closed`          | same suite, "closes on an ended capture…"                                             |
| 3   | Outside-window capture with no close is the end capture                    | same suite, "treats an import outside the live window…"                               |
| 4   | Manual/USSD today-only, not after a close; manual survives captures        | same suite, per-member block; `member-attendance.test.ts`                             |
| 5   | Detail shows the latest capture and ended-ness from `capture`              | `ui/src/format/capture.ts`, `sessionCaptureLine`; `event-detail.png`                  |
| 6   | Migration `0020`, no session-close table                                   | `src/db/migrations.ts`; `src/repos/captures.ts`                                       |
| 7   | Gates green                                                                | `verify` 6/6, `smoke` pass, `ui:test` 417, `ui:e2e` 66                                |
| 8   | Three capture baselines refreshed                                          | `imports-attendance.png`, `event-detail.png`, `headcount-capture.png`                 |
| 9   | Headcount labels and order; Mixed portal-only                              | `ui/src/format/ussd.ts`; `ussd.test.ts`; `headcount.render.test.tsx`                  |
| 10  | `capture` on list and detail; later `asOf`, shared `ended`, event zone     | `src/schemas/events.ts`; DTO block in `attendance-captures.test.ts`; `events.test.ts` |
| 11  | `as_of` backfilled from `created_at`; headcounts read `ended = false`      | `src/db/migrations.ts`                                                                |
| 12  | Headcount past the day is `422`; event-zone stamp; End only while live     | `src/repos/headcounts.ts`; `capture.test.ts`; `event-headcounts.test.ts`              |
| A   | A closed past headcount answers `409`, not `422`                           | `src/repos/headcounts.ts`; `event-headcounts.test.ts` "answers session_closed…"       |
| B   | A redeemed punch is today+close gated, reported `Closed` / `Not today`     | `attendance-codes.ts`, `machine.ts`, `glossary.ts`; two suites                        |

**ACCEPTED** (2026-11-11), on the parent's numbers and review round 2.

## Deviations

- The owner dropped the user-selected live/end mode (2026-11-11) in favour of a computed live state; the
  saved `ended` flag remains the only user input.
- **Tier 2 worker seat.** `AGENTS.md` §3 expects a worker at Tier 2; the parent authored the feature
  source, the UI, migration `0020` and the first two test conversions before any worker was dispatched.
  The remaining test delta is worker-authored (`cline-pass/cline-pass/deepseek-v4.1-flash-1017`,
  `ses_e34fe2afdffeORnZA8BEy0HkpB`), and the `Implementer` row names both authors. This is recorded, not
  hidden: the enforcement guard that would have made the skip visible cannot land in this round without
  a protected-doc review of a round that was still red, so it becomes its own round immediately after.
- **Window rule misread.** The claim "the worker shifts to `cline-pass/.../deepseek-v4.1-flash-1017`
  between 12:00 and 18:00" is not in any document; the window moves the reviewer-class seat only.
  Rejected: adding a worker clock rule — it would route between two providers of the _same_ model family
  and buy nothing but a hop.
- The parent ran the tests it could not delegate before the worker existed; the worker's totals are not
  the acceptance numbers. `## Verification` is filled from the parent's own gate run.
- **Capture baselines.** `npm run ui:capture` rewrote all 21 committed baselines; only the two surfaces
  this round changes (`imports-attendance`, `event-detail`) are kept. The other 19 differ from `HEAD` on
  pages this round does not touch, so they are reverted rather than smuggled in as noise; refreshing the
  whole set is a separate chore in `documents/backlog.md`.
- **Smoke fixture.** The headcount event stays dated yesterday so it never shadows the today giving
  event in the USSD activity picker, and the headcount writes now target the today event, because a
  headcount is only accepted for the session's own day. Without that split the smoke run picks the
  headcount event for the offerings flow and reports "No offering".
- **A brief error, not a code change.** The worker was told a manual attendance `POST` returns a
  `Location`; the spec defines no item route for it, so the test asserts the created entry and the
  collection row instead. No header was invented.
- **Review rework is parent-authored.** The three blockers and two P2s from review round 1 were fixed by
  the parent, including the tests that pin them (`sessionCaptureLine` zone, the member-route 409, the
  capture state matrix). The worker's authorship covers the first full test pass; the rework is recorded
  here rather than claimed as worker work.
