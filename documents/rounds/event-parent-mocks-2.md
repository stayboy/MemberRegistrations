# Round — event-parent mocks, defect re-cut

|                        |                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | ACCEPTED (owner signed all eleven, 2026-11-22)                                                                                                                                                    |
| Tier                   | 1 — Plan                                                                                                                                                                                          |
| Mode                   | `unattended (auto-accept recommendations)`                                                                                                                                                        |
| Base                   | `9c69208`                                                                                                                                                                                         |
| Review rounds          | 3 (spec amendment ACCEPT + P2; catalogue REWORK; confirmation ACCEPT)                                                                                                                             |
| Gate runs in parent    | 3 (the hash tripwire before the record; the full pass after; the signed-text pass)                                                                                                                |
| Spec                   | the event-parent specs + the session-end amendment (`member-registrations-api.md`, `member-registrations-events-offerings.md`, `member-registrations-headcount.md`, `member-registrations-ui.md`) |
| Workers                | `single` (spec + mock-builder)                                                                                                                                                                    |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (spec and mocks); parent ollama-cloud/deepseek-v4.1-flash:1017 (round doc, records, gates)`                                                         |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                                                           |

## Grill

Mode: unattended (the owner's "go unattended all the work to mock seeking signoff", 2026-11-22; the owner then answered "all as recommended").

1. **The `Open` link.** Remove the separate `Open`; the activity name is the link and a `⋯` kebab at the row's end holds the row actions, mirroring `22-members-list-photos`.
   Recommendation: remove `Open`, add the kebab. Cost: the mock matches the build's name link.
2. **The members grid.** Adopt the `22-members-list-photos` table (header case, row height, identity block, trailing `⋯`, footer count) for the events list and the detail grids.
   Recommendation: one shared grid pattern. Cost: a consistent re-cut of `01` and the `03`/`04` grids.
3. **`03-activity-detail-series`.** Schedule versions and Exceptions side-by-side in one two-column row.
   Recommendation: the two panels share a row; the occurrence table below. Cost: a wider panel row.
4. **`04-activity-detail-event`.** The members grid, the `⋯` row menu, a KPI row (sessions, present/expected, offerings, headcount) and a short event summary above the grid.
   Recommendation: the members KPI tiles plus the occurrence grid. Cost: the richest screen.
5. **`06-record-headcount-dialog`.** Lane selection as selectable **round chips**, beautified; Visitor Mode one chip with its three buckets.
   Recommendation: a round chip group for the lanes, the buckets beneath. Cost: the select turns to chips.
6. **`07-import-attendance-panel`.** Drag-and-drop intake and a **Download Excel template** action alongside browse.
   Recommendation: a drop zone plus the template button. Cost: a taller panel with both paths.
7. **The session end is not automatic.** A capture or import must not end the session; only an explicit admin **End session** does, and an event may run without it. The spec amendment relaxes `FR-6b`'s close-on-capture and the `409 session_closed` refusal to the explicit close.
   Recommendation: the capture never ends; the explicit action closes; a later capture is refused only after it. Cost: a spec amendment across four specs and a mock re-cut.
8. **The sign-off flow.** Re-cut `01`, `03`, `04`, `06`, `07` (and the events-list KPIs), record them `auto-signed`, and bring the list back for the owner's signature.
   Recommendation: re-cut, then sign. Cost: one mock round.
9. **Which channel carries the explicit end.** The `0813` review of the amendment noted the text left it open and that a headcount write is calendar-day-bounded, so an end on a past occurrence could not be a headcount.
   Recommendation: the close is the attendance channel's — an end-only attendance import (`rows: []` with `ended: true`), offered on every member-tracking occurrence, live or past, from the import panel and the headcount dialog alike; a `tracksMembers = false` occurrence has no attendance session, is never closed and offers no end action. Cost: one sentence in each of the API and events/offerings specs, and the mock shows End session only on the attendance panel. Auto-accepted under the unattended standing.

## Plan

**Spec amendment (item 7).** The capture/import never sets the session's ended state; an explicit admin **End session** sets it; a capture after that explicit close is refused; an event runs indefinitely without it. The close is the end-only attendance import, offered on member-tracking occurrences only, live or past (item 9). Applied to the API capture contract (FR-6b, the import paragraph, the Headcounts paragraph, AC-32/33/33a), the events/offerings capture states (FR-4b/6f, AC-7a), the headcount's `ended` (`HC-6`, `AC-H17`), the USSD table and the UI change-log. The `0813` spec review read the exact text: ACCEPT, with the item-9 gap and four nits applied.

**Mock re-cut (items 1-6).** `01-events-list`: the members grid, the kebab, no `Open`, the KPI/summary. `03`: the side-by-side. `04`: the grid, the kebab, the KPI row and the summary. `06`: the round chips. `07`: the drop zone, the template and the explicit `End session`. The states are `auto-signed`; the owner signs after.

Acceptance: the spec amendment reviewed and accepted; the re-cut states match the decisions; the catalogue records each `auto-signed`; the owner signs.

## Verification

| Gate                | Command                                                  | Result     |
| ------------------- | -------------------------------------------------------- | ---------- |
| Mocks shell-check   | `node scripts/mock/shell-check.mjs v2-events`            | 7/7        |
| Mock-claims guard   | `npx vitest run tests/meta/mock-claims.test.ts`          | 77 passed  |
| Protected-doc guard | `npx vitest run tests/meta/protected-doc-review.test.ts` | 7 passed   |
| Fast gate           | `npm run verify:fast`                                    | pass — 4/4 |

gate-run 2026-11-22T21:52:39.956Z profile=fast steps=4/4 lines=4 bytes=691

The first gate run failed only on the protected-doc tripwire, as expected before the review was recorded; the second
run passed all four steps.

## Review

`deepseek-v4-pro:0813` (first choice; Sunday off-peak) read the exact working-tree text three times:

1. **The spec amendment** — ACCEPT, one P2 (which channel carries the explicit end) and four nits. The P2 was settled
   as item 9 of the grill and the nits were applied.
2. **The catalogues and the amended specs** — REWORK: three cross-spec contradictions (HC-6, both `capture` DTO
   comments, the headcount `POST` body still carrying `ended`) and one non-atomic claim (`AD-IMPORT-PANEL`).
3. **The confirmation** — ACCEPT; the fixes closed all four findings, and one final nit was applied (the `Headcount`
   DTO now marks `ended` legacy read-only).

Seat: consistent — mock-builder/parent `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

`git-seat-budget: 12` (this round `1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync = 6 of 12`).

| Brief | Actor                 | Verb     | Variant                        | Reason                                                     |
| ----- | --------------------- | -------- | ------------------------------ | ---------------------------------------------------------- |
| 1     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/event-parent-mocks-2` from `main`; rung 1 429    |
| 2     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | The spec amendment, the re-cut catalogue and the round doc |
| 3     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Feature branch only                                        |
| 4     | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                          |
| 5     | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | After the checks                                           |
| 6     | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull                                            |
| 7     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Cut `chore/mock-signoff` from `main` for the signature     |
| 8     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | The eleven signatures, the records and the round docs      |
| 9     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Sign-off branch only                                       |
| 10    | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                          |
| 11    | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | After the checks                                           |
| 12    | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull                                            |

## Mock sign-off

The six re-cut states, plus the five this re-cut did not change (the owner did not flag them):

| Surface | State                          | sha256 (short) | Cut        | Signer | Verdict           |
| ------- | ------------------------------ | -------------- | ---------- | ------ | ----------------- |
| Events  | `01-events-list`               | `dfadc7ed…`    | this round | owner  | signed 2026-11-22 |
| Events  | `03-activity-detail-series`    | `ee296ee4…`    | this round | owner  | signed 2026-11-22 |
| Events  | `04-activity-detail-event`     | `c0671da3…`    | this round | owner  | signed 2026-11-22 |
| Events  | `05-activity-detail-cancelled` | `e74e9bb6…`    | this round | owner  | signed 2026-11-22 |
| Events  | `06-record-headcount-dialog`   | `41ede1e4…`    | this round | owner  | signed 2026-11-22 |
| Events  | `07-import-attendance-panel`   | `a26c426c…`    | this round | owner  | signed 2026-11-22 |
| Events  | `10-event-create`              | `5f5d7194…`    | round 1    | owner  | signed 2026-11-22 |
| Admin   | `25-admin-audiences`           | `c6a7efed…`    | round 1    | owner  | signed 2026-11-22 |
| Admin   | `26-audience-rule-builder`     | `0024461a…`    | round 1    | owner  | signed 2026-11-22 |
| Admin   | `27-add-member-visitor`        | `91d28c70…`    | round 1    | owner  | signed 2026-11-22 |
| Admin   | `28-member-visitor-promote`    | `ce8c80ec…`    | round 1    | owner  | signed 2026-11-22 |

Full hashes are in `documents/mock-claims/v2-events.json` and `v2-shell.json`.

## Mock parity

The owner rejected the first cut on: a separate `Open` link, grids unlike `22-members-list-photos`, stacked
schedule-versions/exceptions, a sparse standalone detail, a select-based headcount dialog, a browse-only import
panel, and a capture that ended the session. The six re-cut states address each; the parity review is the owner's at
sign-off.

## Acceptance

| #   | Criterion                                              | Met | Evidence                        |
| --- | ------------------------------------------------------ | --- | ------------------------------- |
| 1   | The owner's eight decisions are drawn                  | yes | the six states; items 1-6 and 7 |
| 2   | The session-end amendment is in the specs and reviewed | yes | `## Review`; the five specs     |
| 3   | The catalogue records each `auto-signed` with its hash | yes | the sign-off table              |
| 4   | The protected review accepts the catalogues            | yes | `## Review`                     |
| 5   | The owner signs the states                             | yes | signed 2026-11-22               |

Verdict: **ACCEPTED**.

## Deviations

- **The owner signed all eleven states on 2026-11-22** after the second cut: the six re-cut here and the five
  unchanged candidates (`10`, `25`–`28`). Each catalogue entry is now `coverage: "signed"` with
  `signed: { by: "owner", at: "2026-11-22", sha256 }`; the two protected catalogues were re-reviewed at the signed
  text and the record re-hashed.
- **The close is the attendance channel's** (item 9, settled after the `0813` P2): an end-only attendance import
  offered on member-tracking occurrences only; a `tracksMembers = false` occurrence is never closed. The headcount
  request loses `ended`, a wire change that lands with the implementation round.
- **`AD-IMPORT-PANEL` was split** into `AD-IMPORT-DROP`, `AD-IMPORT-TEMPLATE` and the preview claim, with
  `AD-END-SESSION` separate, after the review's non-atomic-claim finding.
- **The disabled `End session` state is not drawn**: both surfaces are open in the mocks; the ended copy with no
  action is shown on ended occurrence rows, and the panel copy says the action is disabled once ended.
- **The six states' frames changed** (1440-wide grid, 760×608 dialog, 720×582 panel); the catalogue carries the new
  pin hashes.
