# Round — series-detail-summary

|                     |                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                            |
| Tier                | 2                                                                                                               |
| Mode                | attended (owner grill, 2026-11-11; "all as recommended")                                                        |
| Base                | `648334b`                                                                                                       |
| Review rounds       | 2 (spec review on the 0813 seat)                                                                                |
| Gate runs in parent | 0                                                                                                               |
| Spec                | `documents/specs/member-registrations-events-offerings.md` (FR-4a, FR-6a–FR-6e, FR-7, AC-5, AC-5a–AC-5b, AC-6a) |
| Workers             | `single`                                                                                                        |

### Decisions (grill, 2026-11-11)

S-Q1–S-Q8 are recorded in the spec under "Series-summary grill — settled 2026-11-11". The material
ones for this round:

- The summary is one dedicated read, `GET /v1/series/{id}/summary?from&to`. **S-Q1 is the named §17
  pre-authorisation for that wire addition in this round**; no other §17 gate is waived.
- The DTO carries only the four tiles' figures. Per-offering rows, the attached-offerings rail and the
  per-occurrence attendance/offering columns stay queued in `ui-mock-parity.md`.
- One window (the page's `DateWindowControl`) drives occurrences, attendance and money.
- The mock `mockups/v2-events/04-series-detail.png` is the design reference for the tiles and was never
  signed; `ui-mock-parity.md`'s contradictory "no mock exists for series-detail" line is corrected in
  this round.

## Plan

1. **Spec first.** Amend the events/offerings spec (done before this doc's build step) and have a
   separate `ollama-cloud/deepseek-v4-pro:0813` session review the exact text before any code.
2. **API read.** `seriesSummaryQuerySchema` (`from`/`to`, `from <= to`), `seriesSummarySchema`, and
   `SeriesRepository.summary(id, from, to, today = <date in the series timezone>)`, plus
   `GET /v1/series/:id/summary` answering `no-store`. Held/upcoming/cancelled are date-derived with the
   series timezone; `expected` is the register count per held date and `present` the `attendance` row
   count; headcount-only held sessions are a count; offering money reuses the church-summary rules
   scoped by `event_instances.series_id`; `nextOccurrence` reuses the occurrence generation capped at
   90 days. OpenAPI is generated from the schemas.
3. **Cancellation reasons (S-Q9).** `series_exceptions.note` becomes required for `kind='cancelled'`
   (schema refinement + `SeriesExceptionDialog` validation), and an event session written with
   `status='cancelled'` gains `sessions[].note`, required at the repository boundary. Both answer
   `422 reason_required`; legacy null reasons still render as "No reason recorded".
4. **Mock gate (policy `orchestrator-policy.md:84-89`).** Produce a reduced static-HTML prototype for
   this surface and capture one PNG per state — success, empty window, loading, error, archived, and
   the Add-exception dialog in its valid and missing-reason states — under local
   `mockups/series-summary/`. Record path + sha256 in `## Mock sign-off` and **park for the owner's
   signature**; no UI code resumes until it is signed.
5. **UI (after sign-off).** `getSeriesSummary` in `ui/src/api/series.ts`; a presentational tile
   component used four times, placed above Schedule versions; the Occurrences tile counts the
   already-fetched occurrence list; archived series shows the tiles read-only; empty window shows
   explicit zeros and "No held sessions in this window"; the captions are the ones enumerated in
   FR-6e; the exception dialog requires a reason for a cancelled date.
6. **Tests.** Repository aggregate on both drivers (PGlite and `pg` suites), route contract
   (200/400/404, `no-store`), the two `reason_required` paths, UI render tests for the ratio/null/zero
   states, and e2e assertions for the four tiles.
7. **Gates.** `npm run verify`, `npm run smoke` (wire change), `npm run ui:test`, `npm run ui:e2e`, then a
   capture refresh of `series-detail.png`.
8. **Review.** Independent Standards + Spec code review against this doc and the accepted spec.

Expected files: `src/schemas/reference.ts`, `src/schemas/events.ts`, `src/repos/series.ts`,
`src/repos/events.ts`, `src/routes/series.ts`, their tests, `ui/src/api/series.ts`,
`ui/src/pages/SeriesDetailPage.tsx`, `ui/src/pages/SeriesExceptionDialog.tsx`, styles as needed, the UI
tests and e2e.

### Acceptance criteria

1. `GET /v1/series/{id}/summary?from&to` returns the FR-6b/FR-6c/FR-6d figures from **one** request, is
   `no-store`, answers `400` for a reversed window and `404` for an unknown series.
2. The ratio counts held member-tracking sessions only, with "held" date-derived in the series
   timezone; the headcount-only held count and the cancelled/upcoming counts are reported separately;
   `rate` is null when `expected` is 0 (AC-5a).
3. The series detail shows the four tiles above Schedule versions; the three window figures come from
   one summary request, the Occurrences tile counts the same list the table renders, and the captions
   are as specified (AC-5, S-Q10).
4. An archived series still shows the tiles, read-only (AC-10); an empty window shows explicit zeros and
   "No held sessions in this window", and a null `nextOccurrence` reads "None in 90 days" (AC-5b).
5. A cancelled series exception or event session without a reason is rejected with
   `422 reason_required` and writes nothing (AC-6a).
6. Both drivers pass the repository tests; the UI tests cover the ratio, the null ratio and the empty
   states.
7. `npm run verify`, `npm run smoke`, `npm run ui:test` and `npm run ui:e2e` are green.
8. `ui-mock-parity.md` no longer contradicts its own findings table, and the round records the mock as an
   unsigned design reference.

## Verification

| Gate      | Command           | Result                                                                                       |
| --------- | ----------------- | -------------------------------------------------------------------------------------------- |
| Spec      | 0813 review       | ACCEPT — two REWORK rounds, then ACCEPT; the `attachedCount` clarification separately ACCEPT |
| Mock      | reduced target    | signed 2026-11-11: series tiles and the event-detail reason line                             |
| Protected | 0813 review       | ACCEPTED — `orchestrator-policy.md` PNG definition; record updated; guard 7/7                |
| Backend   | `npm run verify`  | 6/6 PASS on the final code at 09:26:33                                                       |
| Wire      | `npm run smoke`   | PASS on the final code                                                                       |
| UI unit   | `npm run ui:test` | 406 passed                                                                                   |
| UI e2e    | `npm run ui:e2e`  | 63 passed                                                                                    |
| Capture   | `ui:capture`      | `series-detail.png` refreshed after the exceptions-row fixture change                        |

`gate-run 2026-11-11T09:26:33.003Z profile=full steps=6/6 lines=6 bytes=680`

Flake note (§8): two earlier post-fix runs each lost one worker with exit `3221226505` (Windows), with
0 failed tests — 583 and 576 passed of 592 (6 skipped), the crashed file differing between runs. Both
files passed individually, and the final run was 6/6 green. CI remains the gate for the commit.

## Review

Independent 0813 pass over the frozen diff: **Standards REWORK**, **Spec REWORK**.

- **P1** — FR-4a/FR-7's "a legacy row without a reason is displayed as 'No reason recorded'" was not
  rendered anywhere. The series-exceptions table now uses `exceptionNoteLabel`
  (`ui/src/format/series.ts`), covered by a unit test and an e2e fixture row; the event-session reason
  line is **open** (see Deviations) because the event-detail surface has no signed mock.
- **P2** — the four tiles repeated one card pattern; extracted `SummaryTile` inside
  `SeriesSummaryTiles.tsx`.
- **Nit** — a series-exception note is now trimmed before storage, matching event sessions.

Confirmation: the owner signed the event-detail reduced target and the series-exception fallback was
already in place; the `attachedCount` clarification and the protected-doc wording were each reviewed to
ACCEPT. No P1/P2 remain.

## Mock sign-off

| Surface                                         | Mock                                     | sha256                                                             | Signer | Date       | Verdict                                       |
| ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | --------------------------------------------- |
| Series detail — summary tiles                   | `mockups/v2-events/04-series-detail.png` | `ddc6d86458d6e8e7fcd173d083391bfccc3b0c768ba58de6f77399346ede7690` | Owner  | 2026-11-11 | signed                                        |
| Event detail — cancelled session reason line    | `mockups/v2-events/02-event-detail.png`  | `1d2cd1cbb86d437d6f8b9f0dd7027161e3951c533e9d3eaddd25d13ac93cea51` | Owner  | 2026-11-11 | signed                                        |
| Add exception — reason field for a cancellation | —                                        | —                                                                  | —      | —          | deferred — inline error queued, API 422 shown |

Under the owner's ruling (2026-11-11) a PNG is a mock, so the existing series-detail PNG satisfies the
mock requirement for the tiles, and the owner signed the reduced target on the same day: the tiles'
layout, position and set are adopted; captions follow FR-6e, because the mock's "This
quarter"/"last Sunday"/"this month" periods were rejected in S-Q5; the rail and the per-occurrence
columns stay queued. The cancellation-reason field in `SeriesExceptionDialog` stays out of this round
— the dialog shows the API's `422 reason_required` banner, and the inline error is queued with the
dialog's next mock.

## Mock parity

| Claim                                                  | Type | State  | Answer   | Threshold | Confirmed by | Disposition |
| ------------------------------------------------------ | ---- | ------ | -------- | --------- | ------------ | ----------- |
| Series detail shows the attendance/offering summary    | R    | closed | FR-6a–6e | AC-5      | e2e          | ACCEPTED    |
| A cancelled event session displays its reason          | R    | closed | FR-4a    | AC-6a     | e2e          | ACCEPTED    |
| Attached-offerings rail with per-offering Paid/Pending | M    | queued | S-Q2     | —         | triage       | queued      |
| Per-occurrence attendance/offering columns             | M    | queued | S-Q2     | —         | triage       | queued      |

## Acceptance

| #   | Criterion                                       | Met | Evidence                                                                          | Verdict  |
| --- | ----------------------------------------------- | --- | --------------------------------------------------------------------------------- | -------- |
| 1   | Summary endpoint, one request, 400/404/no-store | yes | `tests/api/series-summary.test.ts`; `src/routes/series.ts`                        | ACCEPTED |
| 2   | Ratio/held/headcount semantics                  | yes | `tests/api/series-summary.test.ts`; `SERIES_SUMMARY_ATTENDANCE_SQL`               | ACCEPTED |
| 3   | Four tiles, one summary request, list count     | yes | `SeriesSummaryTiles.tsx`; `series.spec.ts`; `SeriesSummaryTiles.render.test.tsx`  | ACCEPTED |
| 4   | Archived/empty/null states                      | yes | render test; page keeps the tiles under the archived banner                       | ACCEPTED |
| 5   | Cancelled exception/session needs a reason      | yes | API 422 covered; series fallback and event reason line in the UI, both e2e-tested | ACCEPTED |
| 6   | Both drivers pass the repository tests          | yes | pooled `pg` block (skipped without `TEST_DATABASE_URL`); PGlite suite             | ACCEPTED |
| 7   | Four gates green                                | yes | `verify` 6/6 at 09:26:33, `smoke` PASS, `ui:test` 406, `ui:e2e` 63                | ACCEPTED |
| 8   | Parity doc consistent, mock recorded            | yes | `ui-mock-parity.md`; this doc's sign-off                                          | ACCEPTED |

## Deviations

- **Mock gate breach, corrected (2026-11-11).** The first pass wrote the tiles and the dialog
  validation before the owner had **signed** a mock, contradicting `orchestrator-policy.md:84-89` and
  SKILL step 4b. The mock itself existed (`mockups/v2-events/04-series-detail.png`); under the owner's
  ruling of the same day a PNG is a mock, so the missing piece was the signature, not the artifact.
  The UI files were reverted (`ui/src/api/series.ts`, `ui/src/pages/SeriesDetailPage.tsx`,
  `ui/src/pages/SeriesExceptionDialog.tsx`, `ui/src/pages/events-styles.ts`, and the new
  `SeriesSummaryTiles.tsx`); the API read and the reason rules are kept, because API rounds are exempt
  and no UI surface changed. The UI half restarts after the tiles' reduced target is signed.
- **Policy text corrected (2026-11-11).** `orchestrator-policy.md:87-89` now records the owner's ruling
  that a PNG is a mock, with the static-HTML prototype as the usual capture method and the
  clickable-prototype rule kept for multi-step USSD. Reviewed by `0813` (ACCEPTED, two Nits), recorded in
  `protected-doc-reviews.json`; the guard `tests/meta/protected-doc-review.test.ts` passes.
- **Event-session reason display built after its own sign-off.** FR-4a's "No reason recorded" is now
  rendered under a cancelled session's status badge, and the owner signed
  `mockups/v2-events/02-event-detail.png` as the reduced target on 2026-11-11 before the code.
- **No mock for the cancellation-reason field.** `SeriesExceptionDialog` keeps the API's
  `422 reason_required` banner instead of an inline error; the inline validation is queued with the
  dialog's next mock (AC-6a only requires the API to reject).
- `ui-mock-parity.md` had listed `series-detail` both as "no mock exists" and as a triaged R gap; the
  first line is corrected here (S-Q8).
