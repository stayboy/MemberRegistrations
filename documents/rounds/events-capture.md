# Round - events-capture

|                        |                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                                                                       |
| Tier                   | 2                                                                                                                            |
| Mode                   | attended - three questions settled by the seat; one put to the owner                                                         |
| Base                   | `6076f46`                                                                                                                    |
| Review rounds          | 1                                                                                                                            |
| Gate runs in parent    | 1                                                                                                                            |
| Spec                   | `documents/specs/member-registrations-ui.md` (the event detail's occurrence row), `…-api.md` (attendance capture and import) |
| Workers                | `single`                                                                                                                     |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017                                                                                 |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                      |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                           | Basis                       |
| -------- | -------------- | ------ | -------------- | ---------------------------------------------------------- | --------------------------- |
| Worker   | `2026-11-23`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`                    | outside-window order        |
| Reviewer | `2026-11-23`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                        | first choice outside window |
| Git seat | `2026-11-23`   | out    | `git-executor` | `opencode/beam-free` - 429; `ollama-cloud/mimo-v2.6-flash` | rung 1 unavailable          |

## Grill

Settled by the `grill-flash` seat on the owner's "grill-me" (2026-11-23), and carried from the
"where we stand" grill ("all as recommended"): this round is the capture and import panel, the downstream round
runs beside it, session-offerings precedes the route deletion, the three additive wires go in one contract PR,
and the two mocks stay `target` for one rebuild pass.

1. **Does the round own the `End of session` surface?** The parent's premise was wrong twice: `POST /v1/imports/attendance`
   already takes `{ rows: [], ended: true }` and closes the session (`src/schemas/imports.ts`, proved by
   `attendance-captures.test.ts`), the shared close is derived from `import_batches.ended` and
   `event_session_headcounts.ended` rather than stored, and `AttendanceWorkspace` already renders the action with
   `format/capture.ts`'s AC-7a matrix. `Live` is derived from the date and the clock, not stored. Recommendation
   (seat): claim it and **prove** it — one panel case on `event-live` (action enabled → click → ended, then disabled)
   and one on `event-ended` — close backlog row 30's trigger and re-point its withdrawn headcount claims at that
   case. Cost: one e2e case, a backlog rewrite, and no wire gate.
2. **How do the two parked deep-link cases come back?** Recommendation (seat): split it. `AC-20` and `AC-7a` are
   proved **without the URL**, through the occurrence row's own `Import` control; `FR-8a` is proved by mechanism —
   a trace naming the cause, then both cases green in **three consecutive default-worker** runs, because a
   `--workers=1` pass would make the required `ui-e2e` check red and that is worse than the `fixme`. The seat named
   the likely mechanism: `onClose` calls `clearImportParam()`, which deletes `import` from the URL, so one transient
   close is irreversible. Cost: a diagnosis before UI work, and a park if the trace names nothing.
3. **Do the retired series mock states get pruned here?** Recommendation (seat): no, and the premise does not
   survive reading the file. `11-series-create`, `series-list` and `series-new` are git-ignored PNGs, not catalogue
   keys; `03/04/05-activity-detail-*` are `signed` against a live source and describe the same surface at its new
   route, so they stay. The genuine orphans are `02-event-detail`, `05-offerings-landing` and `07-offering-terms`
   — no source, no entry — and they fold into the shared-shell rebuild. Cost: the mock debt stays open one more
   round; in exchange this round needs no protected-file review at all.
4. **Does `End of session` get a confirmation step?** It is the one irreversible verb on the screen — after it every
   import, headcount and manual write answers `session_closed` — yet it posts immediately while Archive and Cancel
   both confirm. Recommendation (seat): yes, one `ConfirmDialog`. Cost: the panel's claim changes, so a
   `v2-events.json` edit and a protected review, which answer 3 otherwise avoids. Owner answered "all as
   recommended" (2026-11-23): the confirmation lands.
5. **What happens to the signed panel claim when the dialog lands?** `07-import-attendance-panel` is owner-signed
   and draws the panel without a confirmation step. Recommendation: drop it to `target` like `02-event-detail` and
   `10-event-create`, so three states share one rebuild pass. Cost: the panel's drawing stands one step behind until
   that pass. Owner answered "all as recommended".
6. **Do the withdrawn headcount claims become new claims or a pointer?** Backlog row 30 says the capture states have
   no surface; the new e2e cases prove them. Recommendation: re-point the catalogue entries' `test` fields at the new
   case titles rather than closing the row with prose — a claim citing a case is checkable. Cost: the protected pass
   grows by the entries it touches. Owner answered "all as recommended".

## Plan

Goal: the attendance capture loop proved end to end on the event detail, without a new route.

- The panel's two states proved from the occurrence row's `Import` control: live (action enabled, click, ended,
  action disabled) and ended (disabled, further capture refused).
- `AC-20` and `AC-7a` proved through that control, not through the deep link.
- The deep link diagnosed: a trace naming the mechanism, then both parked cases green in three consecutive
  default-worker runs — or the round parks on `FR-8a` with the trace recorded.
- Backlog row 30's trigger closed and its withdrawn headcount claims re-pointed at the new case.
- The `End of session` confirmation: one `ConfirmDialog` before the end-only import, matching Archive and Cancel.
- One protected pass: `07-import-attendance-panel` drops to `target`, and the capture entries re-point their `test`
  fields at the new case titles.

Out of scope: the downstream round (audience-derived `expected`, the legacy drop, the series route deletion),
session-offerings, the additive wires, any migration, any new route, and the mock rebuild.

Acceptance criteria:

1. The panel renders for a chosen occurrence from the row's `Import` control, on `event-live` and `event-ended`,
   and its action state follows `format/capture.ts`.
2. `AC-20` and `AC-7a` have proving cases that do not depend on the deep-link parameter.
3. The deep link is either proved (three consecutive default-worker full-suite runs green, mechanism named in a
   trace recorded in the round doc) or the round parks on `FR-8a` — no third `fixme` is added under any outcome.
4. `End of session` confirms before it writes, and the dialog states that further captures will be refused.
5. The catalogue's capture entries cite the new cases by title, and `07-import-attendance-panel` is `target`.
6. No migration, no wire change, no public route deleted.

## Verification

| Gate                     | Command               | Result     |
| ------------------------ | --------------------- | ---------- |
| Fast gate (first commit) | `npm run verify:fast` | pass — 4/4 |

gate-run 2026-11-23T18:51:43.723Z profile=fast steps=4/4 lines=4 bytes=691

## Review

Seat: consistent — worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                                                                         |
| ----- | --------------------- | ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/events-capture` at `main`; carries the round doc, the catalogue's target move and the three stale round-doc statuses |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | Those first-commit paths                                                                                                       |
| 3     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The capture work                                                                                                               |
| 4     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                                                                                    |
| 5     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                                                                                              |
| 6     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                                                                                                       |
| 7     | `parent`              | sync   | -                              | `main` is held by the `ussd-budget` worktree                                                                                   |

`git-seat-budget: 8` = `1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync`, with one brief held for a
re-brief.

## Mock sign-off

| Surface      | Mock                                               | Capture                                  | Signer       | Date       | Verdict                                                                                                                                                          |
| ------------ | -------------------------------------------------- | ---------------------------------------- | ------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import panel | `mockups/v2-events/07-import-attendance-panel.png` | `ui/e2e/baseline/event-import-panel.png` | `unattended` | 2026-11-24 | auto-signed — target re-cut for the Close control, the commit pair and the header close; the owner's 2026-11-22 signature is void and only the owner restores it |

## Mock parity

No probe ran. The panel's capture was re-taken from the shipped build and the redrawn mock now matches it on the four points that were checked (Close as the single footer button, the commit pair in the content, no header close, the "End of session" label), but that is a like-for-like redraw, not a parity probe. Three states remain `target`: `02-event-detail` (no HTML source, rebuild owed), `10-event-create` (drawing current, signature withdrawn on the owner's answer) and `07`'s siblings.

Mock coverage: claimed 10 · e2e-only 1 · deferred 1 · prose 0

## Acceptance

| #   | Criterion                                                                                                                                                      | Met    | Evidence                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | The panel renders for a chosen occurrence from the row's `Import` control, on `event-live` and `event-ended`, and its action state follows `format/capture.ts` | yes    | `ui/e2e/attendance-panel.spec.ts`, the two panel cases                                                                        |
| 2   | `AC-20` and `AC-7a` have proving cases that do not depend on the deep-link parameter                                                                           | yes    | the same file; AC-20 asserts no upload leaves the panel                                                                       |
| 3   | The deep link is proved or the round parks; no third `fixme`                                                                                                   | proved | three consecutive default-worker full-suite runs (93/93) with both reopened cases running, plus 105/105 single-worker repeats |
| 4   | `End of session` confirms before it writes, and the dialog states that further captures will be refused                                                        | yes    | `EndOfSessionConfirm`, used by the panel and the headcount dialog; the case asserts nothing is sent before confirming         |
| 5   | The catalogue's capture entries are honest, and `07-import-attendance-panel` is `target`                                                                       | yes    | one protected pass; AC-20 and AC-7a move to `e2e-only`; the unprovable clause is a backlog row                                |
| 6   | No migration, no wire change, no public route deleted                                                                                                          | yes    | `git diff main -- src openapi.json` empty                                                                                     |

## Deviations

- **The three merged rounds stay `OPEN`.** Closing them was the first commit of this round, but CI proved the
  intent wrong: `check-round` judges _every_ round doc in the diff, so a closed `event-parent-ui.md` was re-checked
  under R6 against `02-event-detail`, which is now `target`. Reverting left them byte-identical to `main`, so they
  are out of this diff; the closure belongs to a docs-only change from a round that touches no `ui/src/`.
- **The seat's diagnosis was wrong, and the truth was worse.** It predicted the panel lost `import=` from the URL; the trace shows the parameter present at failure and the dialog painted but `aria-hidden`. Fluent focused the already-open surface before tabster registered it, so tabster marked its own modalizer inactive ~200 ms after mount. Every opening of that panel was queryable for ~100 ms — a screen-reader defect, not a test artefact. Fixed by mounting the dialog closed and giving it a **Close** control, which is how every other dialog in the app behaves.
- **A spec defect surfaced and was corrected in the same round.** AC-7a offered the end action on past and not-yet-started occurrences while its own changelog and `format/capture.ts` offered it only while live, and it named "End session" where the UI says "End of session". Amended with a clarifying changelog line; the `acsMatch` pattern in `v2-imports.json` moved with it, which is what caught it.
- **Q3's premise did not survive reading the file**: every entry in `v2-events` asserts `image`, so there was no `test` field to re-point there. The claims that needed re-pointing live in `v2-imports`, and that is where they moved.
- **One clause is now honestly unproven**: AC-7a's "only while live" is asserted by no case, and the inventory allows one `test` pointer per AC. It is a backlog row, not a claim.
- **`End of session` now confirms on both surfaces** — the panel and the headcount dialog — because guarding only the panel would have left the same irreversible write unconfirmed one control away.
