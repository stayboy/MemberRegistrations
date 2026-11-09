# Round — mvp-offering-grid

|                     |                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Status              | OPEN — implementing (single-pass grid, slice A)                                                        |
| Tier                | 2                                                                                                      |
| Mode                | `attended`                                                                                             |
| Base                | `a6260c2`                                                                                              |
| Review rounds       | 0                                                                                                      |
| Gate runs in parent | 2 (`verify:fast`, both stopped by the Windows PGlite fork crash)                                       |
| Spec                | `documents/specs/member-registrations-events-offerings.md` §phase 5; `member-registrations-ui.md` §2.5 |
| Workers             | `single`                                                                                               |

### Seats (owner, 2026-11-09)

- **Reviewer:** `ollama-cloud/deepseek-v4-pro:0813` is the default; `cline-pass/cline-pass/mimo-v2.6-pro`
  when **either** the 12:00–18:00 window applies **or** the 0813 weekly limit makes it unavailable,
  with `fallbackReason`.
- **Worker:** `ollama-cloud/deepseek-v4.1-flash:1017` first choice; `cline-pass/cline-pass/deepseek-v4.1-flash-1017`
  in the same window or when the weekly limit hits.

### Decisions (grill, 2026-11-09)

The owner accepted the whole grill round. Slice A only is in scope.

- Entry is one pass: an always-visible grid of number inputs, not click-to-add rows.
- The catalogue is per-currency data seeded in code: GHS notes 200, 100, 50, 20, 10, 5, 2, 1; coins
  0.50, 0.20, 0.10, 0.05. `0.01` is not seeded until the Bank of Ghana set is confirmed.
- A free-form one-off row remains; a matching configured value sums into its row; a hidden or absent
  observed line re-renders as a pre-filled one-off on correction and submits unless blanked.
- The admin reorder/hide setting is **slice B**, parked behind 24e, migration `0019`, screen
  `#/admin/offering-denominations`.
- The setting is UI-only; the API keeps accepting any positive `denominationMinor`.
- Rejected: browser-local settings; API rejection; per-offering settings; a one-round delivery; a
  generic 1-2-5 ladder.

## Plan

Goal: replace the click-to-add denomination entry on `#/ussd/offerings` with a single-pass grid, so
an operator can enter every denomination in one pass without a click per value.

In scope:

1. A per-currency catalogue in `ui/src/format/offering-counts.ts`: `{ minor, kind, defaultOrder,
defaultEnabled }`, seeded for GHS; derived helpers for the ordered, enabled grid.
2. `OfferingCountEntry` renders one number input per configured denomination, notes before coins and
   descending; blank = not counted; the live total and the blank-row caption.
3. One-off free-form add: a matching configured row sums; any other value becomes a one-off row;
   the 50-row cap is a custom-row cap.
4. Correction merge: prefill the grid from the observation; re-render a hidden or absent observed
   line as a pre-filled, editable one-off that submits unless blanked.
5. No-catalogue and all-hidden states: no grid, free-form only, a message that names the condition
   and links to the future admin screen.
6. Unit tests for the catalogue/merge/payload helpers; a render test; e2e record and correct; axe
   stays green.
7. No API, migration or wire change.

Out of scope: slice B (server-backed setting, admin screen, migration `0019`), any API change,
foreign-currency counts, a Playwright visual baseline.

### Mock states

| #   | State                           | File                                               |
| --- | ------------------------------- | -------------------------------------------------- |
| 1   | Before — quick-pick + rows      | `mockups/offering-grid/01-before-quick-pick.png`   |
| 2   | Blank grid                      | `mockups/offering-grid/02-grid-blank.png`          |
| 3   | Filled grid, live total         | `mockups/offering-grid/03-grid-filled.png`         |
| 4   | Over-cap error, submit disabled | `mockups/offering-grid/04-grid-invalid.png`        |
| 5   | Saving                          | `mockups/offering-grid/05-grid-pending.png`        |
| 6   | API error, retryable            | `mockups/offering-grid/06-grid-error.png`          |
| 7   | Correct + hidden one-off line   | `mockups/offering-grid/07-correction-oneoff.png`   |
| 8   | Custom merge + custom-row cap   | `mockups/offering-grid/08-custom-merge.png`        |
| 9   | No catalogue (USD)              | `mockups/offering-grid/09-unconfigured.png`        |
| 10  | All denominations hidden        | `mockups/offering-grid/10-all-hidden.png`          |
| 11  | History keeps a hidden line     | `mockups/offering-grid/11-history-hidden-line.png` |
| 12  | Narrow 360 px                   | `mockups/offering-grid/12-narrow.png`              |

### Acceptance criteria

1. The twelve states render at their stated widths with no page or console errors; the owner signs
   every row.
2. The grid shows every configured denomination before any number is typed; blank means not counted.
3. A correction keeps the observed `asOf` and re-renders a hidden or absent observed line as a
   pre-filled one-off that submits unless blanked.
4. A custom value that matches a configured row sums into it; any other value is a one-off row and
   never joins the catalogue.
5. No-catalogue and all-hidden currencies show no grid, keep free-form rows and name the condition.
6. No API, migration or wire change; the API still accepts any positive `denominationMinor`.
7. Unit, render, e2e and axe stay green; `verify` green on CI.

## Verification

| Gate        | Command                                  | Result                                                                                         |
| ----------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Mock render | `node mockups/offering-grid/capture.mjs` | pass — 12 PNGs, no page or console errors                                                      |
| UI unit     | `npm run test --workspace ui`            | pass — 35 files / 394 tests                                                                    |
| UI e2e      | `npm run ui:e2e`                         | pass — 56/56, incl. grid record/correct and axe light/dark                                     |
| Full gate   | `npm run verify`                         | 45/46 files, 566 passed, 0 test failures; one Windows worker exit `3221226505` (environmental) |
| Required    | CI `verify` (Linux)                      | pending — the required check on the PR                                                         |

gate-run 2026-11-09T20:22:48.231Z profile=fast steps=3/4 lines=28 bytes=29323
gate-run 2026-11-09T20:39:16.234Z profile=full steps=4/6 lines=23 bytes=1775

## Mock sign-off

| Surface                     | Mock                                               | sha256                                                           | Signer | Date       | Verdict |
| --------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- | ------ | ---------- | ------- |
| Before — quick-pick + rows  | `mockups/offering-grid/01-before-quick-pick.png`   | c2819a9280288329e9ad438b8711f1c974b15b423a4187073144991dabea2138 | Owner  | 2026-11-09 | signed  |
| Blank grid                  | `mockups/offering-grid/02-grid-blank.png`          | b28e7c314c527eb8b2a721342dd8bd01640a0daa6b0daa296099f8bfe61159a4 | Owner  | 2026-11-09 | signed  |
| Filled grid                 | `mockups/offering-grid/03-grid-filled.png`         | 5ceb7e5017cd7e1fac72b8b4e5f8ca845c28fc45fd560b1a2777f220d3779463 | Owner  | 2026-11-09 | signed  |
| Over-cap error              | `mockups/offering-grid/04-grid-invalid.png`        | 1009d6d19436b138d828397b5d54e7fcca1f946f657d460eef7e9b5316fadabd | Owner  | 2026-11-09 | signed  |
| Saving                      | `mockups/offering-grid/05-grid-pending.png`        | d3a4d46faccc23737892d582b74526bd92cab7e686af0a04e8a862be2f53cf4e | Owner  | 2026-11-09 | signed  |
| API error                   | `mockups/offering-grid/06-grid-error.png`          | 72e2fc27de0774ec6bae2a2d057f9af7cea3d0003eefbdfe2585ed39dd8e4faf | Owner  | 2026-11-09 | signed  |
| Correct + one-off           | `mockups/offering-grid/07-correction-oneoff.png`   | 91e9c50953c0667a40d4c22e0cbbcb5c5d5bf235a089df72cc797461c08ecf44 | Owner  | 2026-11-09 | signed  |
| Custom merge + cap          | `mockups/offering-grid/08-custom-merge.png`        | 9a8fc7d168054ca805aa20fe6b5c454e63778fdd22bd48c46e62c052243b95de | Owner  | 2026-11-09 | signed  |
| No catalogue (USD)          | `mockups/offering-grid/09-unconfigured.png`        | 2624aad64eef15ed92ebbe9f60fde15f56e0a2c8d613884bc15ef462a91fc3f1 | Owner  | 2026-11-09 | signed  |
| All hidden                  | `mockups/offering-grid/10-all-hidden.png`          | 69b4915ebd38888644829c2f31bb30570d32a3780ed38444f15087844f856c75 | Owner  | 2026-11-09 | signed  |
| History keeps a hidden line | `mockups/offering-grid/11-history-hidden-line.png` | 6699b2eee8fe612da636bd9eaa0f92aff938f26bf62f37af25325fbee40bfcca | Owner  | 2026-11-09 | signed  |
| Narrow 360 px               | `mockups/offering-grid/12-narrow.png`              | 54330313777e8114bf7578b0275c423b55b68f240e265fb36973bdf90d03a6b7 | Owner  | 2026-11-09 | signed  |

## Mock parity

| Claim                                                                                    | Type | State       | Answer (max prob) | Threshold | Confirmed by                                                      | Disposition |
| ---------------------------------------------------------------------------------------- | ---- | ----------- | ----------------- | --------- | ----------------------------------------------------------------- | ----------- |
| One input per configured denomination, notes then coins descending, blank = not counted  | atom | build + e2e | yes (0.99)        | ≥ 0.8     | parent — `offering-counts.ts:51-64`; render test counts 12 inputs | CONFIRMED   |
| The caption reports `N of M` and the blank rows stay visible                             | atom | build + e2e | yes (0.99)        | ≥ 0.8     | parent — render/e2e assert the caption                            | CONFIRMED   |
| A custom value matching a row sums; any other value is a one-off and never the catalogue | atom | build       | yes (0.99)        | ≥ 0.8     | parent — `offering-counts.test.ts` sum-on-match and one-off cases | CONFIRMED   |
| A correction re-renders a hidden/absent observed line as a pre-filled one-off            | atom | build       | yes (0.99)        | ≥ 0.8     | parent — `rowsFromObservation`, unit test for absent/hidden lines | CONFIRMED   |
| Blanking a one-off removes it from the payload                                           | atom | build       | yes (0.99)        | ≥ 0.8     | parent — `countPayload` omits blanks; unit test                   | CONFIRMED   |
| No-catalogue and all-hidden currencies show no grid and name the condition               | atom | build       | yes (0.99)        | ≥ 0.8     | parent — render tests for both messages                           | CONFIRMED   |
| An over-cap piece row is marked and submit is disabled                                   | atom | build       | yes (0.99)        | ≥ 0.8     | parent — render test `aria-invalid` + message                     | CONFIRMED   |
| A new one-off cannot push the payload past the 50-line server cap                        | atom | build       | yes (0.99)        | ≥ 0.8     | parent — `positiveRowCount` guard, boundary unit test             | CONFIRMED   |
| No API, migration or wire change                                                         | atom | diff        | yes (1.00)        | ≥ 0.8     | parent — `git diff` touches `ui/` and docs only                   | CONFIRMED   |

## Review

Tier 2, independent reviewer `ollama-cloud/deepseek-v4-pro:0813`, against `a6260c2`. Verdict
**ACCEPT**, no P1.

- **Standards — ACCEPT.** Fluent v9 only; the entry is presentational and the page owns the request;
  React 19 rules; `makeStyles`/tokens.
- **Spec — ACCEPT.** The grid, the custom merge, the correction one-off, the no-catalogue/all-hidden
  states, the over-cap guard and the no-API boundary all match the amended sections.

P2 fixed in this pass:

1. `Configure denominations` linked to `#/settings`, contradicting the spec's named
   `#/admin/offering-denominations`. The link is removed in slice A; the message stays, and slice B
   adds the link when the screen exists.
2. `Custom rows: n of 50` misstated the bound (the guard counts positive payload rows, not custom
   rows). Relabelled `One-off rows: n`; the positive-row guard still stops the payload at 50.

Nits fixed: the unused `addDenomination` parameters are gone; the wide-dialog inline style moved to
`makeStyles`; the counted caption now uses positive pieces, matching the payload.

Nits accepted: one-off rows keep entry order on record and sorted order on correction (the table is
a scratch list); submit stays enabled for an empty count, matching the signed blank state.

## Acceptance

| #   | Criterion                                             | Met     | Evidence                              | Verdict  |
| --- | ----------------------------------------------------- | ------- | ------------------------------------- | -------- |
| 1   | Twelve states captured and signed                     | yes     | `## Mock sign-off`, 2026-11-09        | ACCEPTED |
| 2   | Grid shows every configured denomination, blank=0     | yes     | render test: 12 inputs, blank caption | ACCEPTED |
| 3   | Correction re-renders hidden/absent lines as one-offs | yes     | `rowsFromObservation`; unit tests     | ACCEPTED |
| 4   | Custom add sums/merges and never joins the catalogue  | yes     | `addDenomination`; unit tests         | ACCEPTED |
| 5   | No-catalogue and all-hidden states named              | yes     | render tests for both messages        | ACCEPTED |
| 6   | No API, migration or wire change                      | yes     | `git diff` is `ui/` + docs only       | ACCEPTED |
| 7   | Unit, render, e2e, axe and CI verify green            | pending | CI `verify`                           | PARKED   |

## Deviations

- The state-04 total includes the over-cap row; it follows the current `countTotalMinor` arithmetic
  and the submit is disabled. The owner signed it as shown.
- State 06 footer copy is `The count could not be recorded.`; the built page titles the bar
  `The offering count could not be recorded`. The conversion aligns the copy.
- The signed mock shows a `Configure denominations` link and `Custom rows: n of 50`. Slice A omits the
  link (the `#/admin/offering-denominations` route does not exist yet) and labels the list
  `One-off rows: n`, following the reviewer's two P2 fixes; slice B restores the link at the
  spec-named route. The add guard counts positive rows so a new one-off cannot push the payload
  past 50 lines.
- The all-hidden state is reachable through an optional `overrides` prop (default empty) and is
  render-tested; the page passes nothing until slice B threads the setting.
- `npm run verify` cannot complete on this Windows host: the vitest fork exits with `3221226505`
  after every suite that ran passed. Retried once per §8 and stopped; Linux CI `verify` is the
  required check.
