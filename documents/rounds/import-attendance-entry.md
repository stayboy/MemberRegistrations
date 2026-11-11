# Round — import-attendance-entry

|                     |                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Status              | CLOSED - merged in #109                                                                                             |
| Tier                | 2                                                                                                                   |
| Mode                | attended (owner grill, 2026-11-11; "all as recommended")                                                            |
| Base                | `c03e6f1`                                                                                                           |
| Review rounds       | 0                                                                                                                   |
| Gate runs in parent | 0                                                                                                                   |
| Spec                | `documents/specs/member-registrations-events-offerings.md` FR-8/AC-7; `member-registrations-api.md` §Imports, AC-31 |
| Workers             | `single`                                                                                                            |

### Decisions (grill, 2026-11-11)

- The entry is for **event series only**: the series detail and a **series-backed** event's detail.
  A standalone event offers no entry, and the API is the backstop.
- **Import** is the only capability the rule restricts. Manual and USSD per-member attendance stay,
  subject to the date-of-action rule in round B.
- A standalone event's import answers `422 series_required` and writes nothing; existing standalone
  attendance history stays visible read-only.
- The links carry `event=<id>` and `series=<id>`; `date` stays optional. The import page seeds the
  event (event link) or filters its picker to the series (series link), and a successful batch
  invalidates the events, series and imports queries.
- The shepherd-issued attendance code feature was **dropped** (owner, 2026-11-11): a shepherd clocks
  their members directly; the code path would only earn its place if clocking is too long or the
  member lookup is awkward, which would be a usability fix, not a new code flow.
- Round sequence: this round (A), then the capture model (B), then the USSD date/mode flow (C).

## Plan

1. **Spec first.** The FR-8/AC-7 and API import amendments are written; a separate
   `ollama-cloud/deepseek-v4-pro:0813` session reviews the exact text before code.
2. **Mock gate.** The owner signs the reduced target for the entry on the event detail and the series
   detail before any UI code; the series mock's missing button is a spec-required atom the build
   carries.
3. **API.** An attendance import targeting an event with `series_id IS NULL` throws
   `422 series_required` before any write; one repository check and its test. No migration.
4. **UI.** A header **Import attendance** action on the series detail and on a series-backed event's
   detail; the import page seeds `draftEventId` from `event`, filters its `listEvents` read by
   `series`, and on a successful batch invalidates the events, series and imports query keys.
5. **Tests.** API: standalone refused, series event accepted. UI: the entry hidden on a standalone
   event and shown on a series event; the seeded event and the series filter; invalidation. E2E:
   event detail to import page, series detail to import page.
6. **Gates.** `npm run verify`, `npm run smoke` (wire-contract code), `npm run ui:test`, `npm run ui:e2e`,
   and a capture refresh for the event and series detail baselines.
7. **Review.** Independent Standards + Spec code review against this doc and the accepted spec.

Expected files: `src/repos/imports.ts` (or the route's repository), `src/errors/domain-errors.ts`,
`src/schemas/imports.ts` if the error is declared there, their tests, `ui/src/pages/EventDetailPage.tsx`,
`ui/src/pages/SeriesDetailPage.tsx`, `ui/src/pages/ImportsAttendancePage.tsx`, `ui/src/format/occurrence.ts`,
the UI tests and `ui/e2e/*`.

### Acceptance criteria

1. A standalone event's detail has no Import-attendance entry; a series-backed event and a series do.
2. The event entry opens `/imports/attendance?event=<id>` with that event seeded; the series entry opens
   `?series=<id>` with the picker filtered to that series.
3. An attendance import for a standalone event answers `422 series_required` and writes no batch or row;
   the series-backed path still succeeds.
4. A successful batch invalidates the events, series and imports queries (AC-7).
5. Existing standalone attendance history remains visible and read-only.
6. `npm run verify`, `npm run smoke`, `npm run ui:test` and `npm run ui:e2e` are green.
7. The event and series detail capture baselines are refreshed.

## Verification

| Gate  | Command           | Result                                                                                       |
| ----- | ----------------- | -------------------------------------------------------------------------------------------- |
| Spec  | 0813 review       | ACCEPT — one REWORK round, then ACCEPT                                                       |
| Mocks | signatures        | signed 2026-11-11 (`v2-events/08-event-detail-series.png`, `v2-events/04-series-detail.png`) |
| Build | `npm run verify`  | two full runs hit the Windows worker exit with 0 failures; suites pass alone                 |
| Wire  | `npm run smoke`   | PASS                                                                                         |
| UI    | `npm run ui:test` | 406 passed                                                                                   |
| UI    | `npm run ui:e2e`  | 66 passed                                                                                    |
| Shot  | `ui:capture`      | `event-detail.png` and `series-detail.png` refreshed                                         |
| CI    | PR #109           | `verify`, `ui`, `ui-e2e` green; squash-merged `1f5b995`                                      |

Flake note (§8): the two full `verify` runs lost workers to exit `3221226505` with zero failed tests
(544 and 585 passed of 593, 6 skipped). `tests/api/attendance.test.ts` and
`tests/api/ussd-attendance.test.ts` pass alone (56 tests). CI is the gate for the commit.

gate-run 2026-11-11T11:40:17.595Z profile=precommit steps=4/4 lines=4 bytes=536

## Review

Independent 0813 pass over the frozen diff: **Standards ACCEPT**, **Spec ACCEPT**.

- **Nit** - `EventItem` re-declares `seriesId`, now also on `EventListItem`; harmless, accepted
  without change so the type pair keeps its symmetry.
- The reviewer traced every FR-8/AC-7/AC-31 sentence to code or a test, confirmed the API check runs
  inside the transaction before any write, and confirmed the standalone fixture is genuinely standalone.

## Mock sign-off

| Surface                      | Mock                                           | sha256                                                             | Signer | Date       | Verdict |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| Event detail — import entry  | `mockups/v2-events/08-event-detail-series.png` | `71c756677fdd03becf726bb06bf8486c107e30c18a045767d10a83ee3f958136` | Owner  | 2026-11-11 | signed  |
| Series detail — import entry | `mockups/v2-events/04-series-detail.png`       | `da1626bf173d3a7bbc0b5ad158bbd04477b54d24d1d2e3f477445f44cc920e59` | Owner  | 2026-11-11 | signed  |

The mocks live in the existing `mockups/v2-events/` set; `04-series-detail.png` is refreshed with the
series entry and `08-event-detail-series.png` is the new state for a series-backed event. No new folder,
no duplicated state. `mockups/v2-events/02-event-detail.png` is the **standalone** Strategic Conference
and still draws "Import attendance"; it is a recorded **mock correction** - the build must hide the
entry on a standalone event - and it is not the signature target for this round.

### Carry-forward decisions (grill, 2026-11-11)

- **Live capture is not indicated in this mock or in USSD yet**; the model belongs to rounds B and C.
- Capture mode is chosen **at capture time**: `Live session (recorded now)` / `End of session` on the
  import page and in the manual attendance dialog; it defaults to Live when the session is live right
  now and to End of session otherwise; Live is never offered outside the live window.
- The **detail** shows the latest capture per session ("Live capture · 10:42" / "End of session ·
  11 Nov") in round B.
- **USSD is always live** - a clock-in happens now - and its confirmation reads "Recorded now"; no
  mode menu, so C's prototype stays a copy/state change rather than a new branch.
- These land in the B and C specs when those rounds open; this doc is the interim record.

## Mock parity

| Claim                                              | Type | State  | Answer | Threshold | Confirmed by | Disposition |
| -------------------------------------------------- | ---- | ------ | ------ | --------- | ------------ | ----------- |
| Import-attendance entry on event and series detail | R    | closed | FR-8   | AC-7      | e2e          | ACCEPTED    |

## Acceptance

| #   | Criterion                                    | Met | Evidence                                                            | Verdict  |
| --- | -------------------------------------------- | --- | ------------------------------------------------------------------- | -------- |
| 1   | Entry only on series and series-backed event | yes | `EventDetailPage.tsx` conditional; `events.spec.ts` standalone test | ACCEPTED |
| 2   | Event links seed, series links filter        | yes | `events.spec.ts`, `series.spec.ts`; `ImportsAttendancePage.tsx`     | ACCEPTED |
| 3   | Standalone import refused, nothing written   | yes | `imports.ts`; `attendance.test.ts` 422 + zero rows                  | ACCEPTED |
| 4   | Successful batch invalidates three prefixes  | yes | `ImportsAttendancePage.tsx` handler (code evidence; no direct test) | ACCEPTED |
| 5   | Standalone history stays visible read-only   | yes | no change to the read paths; the diff touches the import write only | ACCEPTED |
| 6   | Four gates green                             | yes | `verify`/`ui`/`ui-e2e` green on PR #109 (`1f5b995`)                 | ACCEPTED |
| 7   | Event and series capture baselines refreshed | yes | both PNGs in the diff                                               | ACCEPTED |

## Deviations

- The shepherd-issued attendance code feature is dropped (owner, 2026-11-11); the existing
  back-office code flow is unchanged.
