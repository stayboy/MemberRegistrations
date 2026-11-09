# Round — mvp-headcount

|                     |                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Status              | CLOSED - merged in #92 (`69666cc`)                                                                  |
| Tier                | 2                                                                                                   |
| Mode                | `unattended (auto-accept recommendations)` after the mock sign-off                                  |
| Base                | `cacbee0`                                                                                           |
| Review rounds       | 1                                                                                                   |
| Gate runs in parent | 1 (`verify:fast`)                                                                                   |
| Spec                | `documents/specs/member-registrations-ui.md` §2.5; `member-registrations-api.md` headcount sections |
| Workers             | `single`                                                                                            |

### Seats (owner, 2026-11-09)

- **Reviewer:** `ollama-cloud/deepseek-v4-pro:0813` is the default; `cline-pass/cline-pass/mimo-v2.6-pro`
  when **either** the 12:00–18:00 window applies **or** the ollama weekly limit makes 0813 unavailable,
  with `fallbackReason`.
- **Worker:** `ollama-cloud/deepseek-v4.1-flash:1017` first choice; `cline-pass/cline-pass/deepseek-v4.1-flash-1017`
  in the same window or when the weekly limit hits.

## Plan

The Headcount operator page already exists and is routed — `ui/src/pages/ussd/UssdHeadcountPage.tsx`,
built in #79 under `v3-ussd-operator-portal` (CLOSED). It was built before the mock rule, and the
capture round only mocked the offerings count page. More importantly, it breaks the recorded operator
pattern: the page renders an always-visible **Record a headcount** form and reuses that panel as an
inline correction, while the offerings count page and the recorded pattern are read-first with every
write action in a dialog from the toolbar, row or header.

This round fixes both: re-author the mock to the dialog pattern, sign it, convert the page, then run
parity.

**Owner exception:** this is a deliberate one-off to "no historical backfill" — the owner explicitly
queued the Headcount mock (capture go-forward Q14) rather than waiting for the page's next change.

In scope:

1. Re-author the nine mock states for a **read-first** page: no inline write form; a header
   **Record headcount** action opens a dialog; a row **Correct** action opens a dialog that keeps the
   observation's `asOf`.
2. Owner sign-off per state; the orchestrator records it under `## Mock sign-off`.
3. Convert `UssdHeadcountPage.tsx` to the read-first + dialog pattern, following
   `OfferingDialogs.tsx` for the Fluent dialog shape.
4. Parity pass: spec-required atoms against the rendered page, each confirmed at `path:line`; fix
   confirmed drift only.
5. Copy fix: a superseded row shows its `asOf`, not `Valid for <session date>`.
6. New `ui/e2e/headcount.spec.ts` covering record, correct and history; axe light and dark.
7. Close the stale `documents/rounds/v3-ussd-headcount.md` with a note that slice B landed in #79.

Out of scope: the API headcount semantics (already shipped), the USSD handset screens (separate mock
family), a Playwright visual baseline (not added this round), product/claim pages and 24e.

### Mock states

| #   | State                        | File                                      |
| --- | ---------------------------- | ----------------------------------------- |
| 1   | Read-first page              | `mockups/headcount/01-read-first.png`     |
| 2   | Record dialog — Adult        | `mockups/headcount/02-record-adult.png`   |
| 3   | Record dialog — Mixed        | `mockups/headcount/03-record-mixed.png`   |
| 4   | Correct dialog               | `mockups/headcount/04-correct-dialog.png` |
| 5   | History + superseded row     | `mockups/headcount/05-history.png`        |
| 6   | Empty (read-first)           | `mockups/headcount/06-empty.png`          |
| 7   | Loading                      | `mockups/headcount/07-loading.png`        |
| 8   | Error (header Refresh retry) | `mockups/headcount/08-error.png`          |
| 9   | Dark (read-first + dialog)   | `mockups/headcount/09-dark.png`           |

The earlier inline nine (`01-adult` … `09-dark`) document the built inline page, were never signed, and
are **superseded** by this set.

### Acceptance criteria

1. The nine PNGs render at 1440 with no page or console errors; the owner signs every row.
2. The page is read-first: no inline write form; Record and Correct are dialogs and Correct keeps the
   row's `asOf`.
3. The parity table confirms each spec-required atom; a confirmed miss is fixed or recorded.
4. `ui/e2e/headcount.spec.ts` records, corrects and reads the history against the fixtures.
5. axe passes on the page and both dialogs in light and dark.
6. Existing API/UI tests, `verify` and the UI e2e stay green.
7. `v3-ussd-headcount.md` is CLOSED with the #79 note.

## Verification

| Gate        | Command                              | Result                                                                                         |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Mock render | `node mockups/headcount/capture.mjs` | pass — 9 PNGs, no page or console errors                                                       |
| UI unit     | `npm run test --workspace ui`        | pass — 36 files / 386 tests                                                                    |
| UI e2e      | `npm run ui:e2e`                     | pass — 59/59, incl. headcount spec and axe light/dark                                          |
| Full gate   | `npm run verify`                     | 45/46 files, 563 passed, 0 test failures; one Windows worker exit `3221226505` (environmental) |
| Required    | CI `verify` (Linux)                  | pass - #92 merged (`69666cc`)                                                                  |

gate-run 2026-11-09T13:31:17.400Z profile=fast steps=4/4 lines=4 bytes=514
gate-run 2026-11-09T17:44:49.068Z profile=full steps=6/6 lines=6 bytes=680
gate-run 2026-11-09T17:58:07.429Z profile=full steps=4/6 lines=23 bytes=1775

## Mock sign-off

| Surface                        | Mock                                      | sha256                                                           | Signer | Date       | Verdict |
| ------------------------------ | ----------------------------------------- | ---------------------------------------------------------------- | ------ | ---------- | ------- |
| Headcount — Read-first page    | `mockups/headcount/01-read-first.png`     | f1b4769447504629575d925c87838cb13a965783ce51140a49bbd47470ec3d37 | Owner  | 2026-11-09 | signed  |
| Headcount — Record Adult       | `mockups/headcount/02-record-adult.png`   | 9d1bf69eadf39199ec68651810fc7c40fb14760af5489917e40742c521505379 | Owner  | 2026-11-09 | signed  |
| Headcount — Record Mixed       | `mockups/headcount/03-record-mixed.png`   | 463a62b682fe9d8d2a49fd046463ce7716d61ec7f62d2a29c423aecfbfab158a | Owner  | 2026-11-09 | signed  |
| Headcount — Correct dialog     | `mockups/headcount/04-correct-dialog.png` | 7b73f00fd000ec6b077e165cb6432cf7610dd0321614c7f5b02c55f32e8b0d5c | Owner  | 2026-11-09 | signed  |
| Headcount — History/superseded | `mockups/headcount/05-history.png`        | b751bc111de3021d066e3a23ec6edc9b3e8976bd364a0ef83938327eb972ff46 | Owner  | 2026-11-09 | signed  |
| Headcount — Empty              | `mockups/headcount/06-empty.png`          | 6665db7e2f34c06ae58209396d73fe1dfe868ed1e6af111a609a56d8a669185b | Owner  | 2026-11-09 | signed  |
| Headcount — Loading            | `mockups/headcount/07-loading.png`        | 39672b039042be7287ae16e7004039fd6043a0c46e4b7434706d66c903332037 | Owner  | 2026-11-09 | signed  |
| Headcount — Error              | `mockups/headcount/08-error.png`          | 895c2c5bbc3b2674e114881ec09e9200ed381dbe82b59cc5b7f40d1ca19332c4 | Owner  | 2026-11-09 | signed  |
| Headcount — Dark               | `mockups/headcount/09-dark.png`           | fff0f3796d4feee98e5e7e37f6f69e9e11f992b7ec14e2181f48e94dea34dcf6 | Owner  | 2026-11-09 | signed  |

## Mock parity

| Claim                                                                               | Type | State       | Answer (max prob) | Threshold | Confirmed by                                                        | Disposition |
| ----------------------------------------------------------------------------------- | ---- | ----------- | ----------------- | --------- | ------------------------------------------------------------------- | ----------- |
| Read-first: no always-visible write form; Record is a header action                 | atom | build + e2e | yes (0.99)        | ≥ 0.8     | parent — `headcount.spec.ts:23`, `UssdHeadcountPage.tsx:196-203`    | CONFIRMED   |
| Record dialog: Adult/Children three fields, Mixed four, `As of`, live total         | atom | build + e2e | yes (0.99)        | ≥ 0.8     | parent — `HeadcountDialogs.tsx:74-130`, `headcount.spec.ts`         | CONFIRMED   |
| Correct keeps the row's `asOf`, has no editable date, and sends `supersedesId` only | atom | build + e2e | yes (0.99)        | ≥ 0.8     | parent — `HeadcountDialogs.tsx:82-115`, `UssdHeadcountPage.tsx:142` | CONFIRMED   |
| A superseded row reads `Valid for <its asOf>`, stays readable, is never deleted     | atom | build       | yes (0.99)        | ≥ 0.8     | parent — `HeadcountReadFirst.tsx:148-173`                           | CONFIRMED   |
| Roster is its own card labelled **Roster**, never merged with the headcount         | atom | build       | yes (0.99)        | ≥ 0.8     | parent — `HeadcountReadFirst.tsx:85-105`                            | CONFIRMED   |
| Error state retries from the header **Refresh**; no Retry inside the bar            | atom | build       | yes (0.99)        | ≥ 0.8     | parent — `UssdHeadcountPage.tsx:204-214,250-256`                    | CONFIRMED   |
| `asOf` defaults to now on Record and is absent on Correct                           | atom | build       | yes (0.99)        | ≥ 0.8     | parent — `UssdHeadcountPage.tsx:59,100`, `HeadcountDialogs.tsx:103` | CONFIRMED   |

## Review

Tier 2, independent reviewer `cline-pass/cline-pass/mimo-v2.6-pro` (12:00–18:00 window), against
`a6260c2`. Verdict **ACCEPT**, no P1.

- **Standards — ACCEPT.** Fluent v9 only; page/state in `UssdHeadcountPage`, presentational
  `HeadcountReadFirst`/`HeadcountDialogFields`; React 19 rules; focused diff.
- **Spec — ACCEPT.** All nine signed states matched. Adjudicated: on a correction the client sends
  `supersedesId` and omits `asOf`; the server owns the value (`src/repos/headcounts.ts:222-255`),
  which is the spec's `asOf?` contract. The e2e fixture mirrors it, so "keeps its asOf" is real.

P2 findings, all fixed in this pass:

1. Row state keyed off `supersededBy === null`, so a second uncorrected record would show two green
   Current badges and a Correct that the API rejects (`422`). Now `id === current?.id` decides the
   badge and the action; a stale non-superseded row reads **Earlier** and `Valid for <asOf>`.
2. A rejected save rendered behind the modal. The dialog now shows `submitError` in its footer; only
   a local validation error disables submit, so a server failure stays retryable.
3. The row's Correct entry point was not exercised end-to-end. `headcount.spec.ts` now opens the dialog
   from the history row and cancels.
4. `axe.spec.ts` reformatted an unrelated offerings-count assertion. Reverted; the diff is
   headcount-only (29 insertions, 0 deletions).

## Acceptance

| #   | Criterion                                      | Met | Evidence                                                                                                                             | Verdict  |
| --- | ---------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | Nine dialog-pattern states captured and signed | yes | `## Mock sign-off`, 2026-11-09                                                                                                       | ACCEPTED |
| 2   | Page converted to read-first + dialogs         | yes | `UssdHeadcountPage.tsx`, `HeadcountDialogs.tsx`, `HeadcountReadFirst.tsx`                                                            | ACCEPTED |
| 3   | Parity table complete                          | yes | `## Mock parity` (seven atoms, all confirmed)                                                                                        | ACCEPTED |
| 4   | e2e covers record/correct/history              | yes | `ui/e2e/headcount.spec.ts`; 59/59                                                                                                    | ACCEPTED |
| 5   | axe light and dark, page and dialogs           | yes | `ui/e2e/axe.spec.ts` headcount entries; 21/21 targeted                                                                               | ACCEPTED |
| 6   | Gates stay green                               | yes | UI unit 386; `ui:e2e` 59/59; `verify` 563 passed / 0 test failures, one environmental Windows worker exit (CI is the required check) | ACCEPTED |
| 7   | Stale round closed                             | yes | `v3-ussd-headcount.md` CLOSED in #91                                                                                                 | ACCEPTED |

## Deviations

- Tier raised from 1 to 2: the conversion changes the write flow across the page and two dialogs, so
  the worker implements and the reviewer gate is independent.
- The built page is inline; this round converts it to the recorded dialog pattern, so the mock now
  shows the target, not the current build.
- The earlier inline nine-state mock was superseded before signature; no inline state was signed.
- The error state's retry is the header **Refresh**, not a Retry button inside the MessageBar.
- A superseded row's action cell must read its `asOf`; the built page prints the session date, and the
  conversion fixes it.
- Mixed has four buckets (adult men/women, boys, girls), matching `headcountFields('mixed')`.
- The Roster caption drops the build's word "expected"; "Roster" is the only label.
- A stale non-superseded row (the second uncorrected record in a session) reads **Earlier**; the
  signed mock only shows Current and Superseded, so this badge is new cover for the reviewer's P2 fix.
- Local `npm run verify` cannot complete on this Windows host: one vitest fork exits `3221226505`
  while every test that ran passed (563 passed, 0 failures). Retried once per §8 and stopped; Linux CI
  `verify` is the required check.
- The production USSD notice is omitted from this mock; `mockups/mvp-hardening/02-simulator-hidden.png`
  covers it.
