# Round — behavioural-acs

|                        |                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                          |
| Tier                   | 2                                                                                                                                                             |
| Mode                   | `attended`                                                                                                                                                    |
| Base                   | `b01f0e8`                                                                                                                                                     |
| Review rounds          | 0                                                                                                                                                             |
| Gate runs in parent    | 0                                                                                                                                                             |
| Spec                   | `documents/specs/member-registrations-ui.md`                                                                                                                  |
| Workers                | `single`                                                                                                                                                      |
| Implementer            | `worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (e2e specs, fixtures, catalogue); parent opencode/deepseek-v4.1-flash-free (round doc, gates, record)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                       |

`git-seat-budget: 10` — 1 branch + 3 commits + 1 push + 1 pr + 1 merge + 1 sync + 2 retries, written
here by the parent from the default, with the allocation below.

| #    | Brief          | Actor planned         | Verb   | Draws the budget? |
| ---- | -------------- | --------------------- | ------ | ----------------- |
| 1    | cut the branch | `git-executor rung 2` | branch | yes (1 of 10)     |
| 2-4  | three commits  | `git-executor rung 2` | commit | yes (4 of 10)     |
| 5    | push           | `git-executor rung 2` | push   | yes (5 of 10)     |
| 6    | open the PR    | `git-executor rung 2` | pr     | yes (6 of 10)     |
| 7    | squash-merge   | `git-executor rung 2` | merge  | yes (7 of 10)     |
| 8    | sync `main`    | `git-executor rung 2` | sync   | yes (8 of 10)     |
| 9-10 | re-briefs      | `git-executor rung 2` | -      | held              |

## Seats

| Seat   | Picked (local)   | Window | Class          | Candidate probed                                            | Basis                                                                                  |
| ------ | ---------------- | ------ | -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Worker | 2026-11-17 12:35 | in     | `worker-flash` | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` — answered | inside the window, the cline-pass candidate is first; probe and dispatch were one call |

## Grill

Seven questions, answered "all as recommended" (owner, 2026-11-17).

1. **One round or two?** One round, two new spec files (`imports.spec.ts`, `settings.spec.ts`).
   **Cost:** a larger diff and a longer e2e run; splitting costs a second round's ceremony for no code
   gain.
2. **How deep should AC-18 go, given the guard already has unit tests?** The e2e asserts the UI
   consequence only - split guidance visible, upload route never called - leaving the byte/row arithmetic
   to `import-file.test.ts`. **Cost:** the e2e must generate a ~1 MB CSV fixture.
3. **What proves "the file contents are discarded" for AC-19?** The five summary fields render, and no
   browser storage value contains a member name from the file; the key shape is not pinned, because
   FR-39 says "may remain", not "must". **Cost:** weaker than a key-shape assertion, but it freezes no
   implementation choice.
4. **Where does AC-20 run?** On the event detail's session row, because FR-36a says attendance has no
   standalone page; a stubbed `422 import_failed` names the row number and `datetime`, the panel lists
   them against the chosen session, and the register is unchanged. **Cost:** the panel lives inside a
   row, so selectors are tighter than a page-level test.
5. **Does AC-27 test "without a flash of the other scheme"?** No - the test seeds storage, reloads and
   asserts accent, scheme and sidebar restore, and that no storage value contains the bearer; "no flash"
   is recorded as out of scope with the reason. **Cost:** half of FR-47's sentence stays unproven, stated
   openly.
6. **What happens to the four deferred catalogue rows?** They move from `deferred` to `e2e-only`, naming
   the new specs; no drawing asserts behaviour, so no mock claim is added. **Cost:** the coverage line
   moves from `e2e-only 6` to `e2e-only 10`, and the backlog row is removed.
7. **Tier and seats.** Tier 2, worker implements, `code-review` gate; the worker seat is probed on
   cline-pass first inside the window, with `fallbackReason` recorded if it does not answer. **Cost:** one
   review pass and one probe; the worker cannot run a browser harness, so the parent runs e2e.

## Plan

Goal: prove four behavioural ACs end-to-end, none of which a mock claim can stand in for.

Scope: two new e2e specs, fixtures they need, the four catalogue dispositions, and the backlog row.

Expected files:

- `ui/e2e/imports.spec.ts` (new) - AC-18, AC-19, AC-20.
- `ui/e2e/settings.spec.ts` (new) - AC-27.
- `ui/e2e/fixtures.ts` (extend, only if a stub is missing).
- `documents/mock-claims/v2-imports.json`, `documents/mock-claims/v2-settings.json` - dispositions.
- `documents/backlog.md` - the behavioural-ACs row leaves.
- this document.

Acceptance criteria:

1. AC-18: a 10,001-row CSV and a serialised body over 1,048,576 bytes are rejected with split guidance,
   and the upload route is never called.
2. AC-19: a confirmed member import shows batch id, kind, row count, checksum and created time, and no
   browser storage value carries a member name from the file.
3. AC-20: a `422 import_failed` naming a `datetime` mismatch lists the offending row number and date
   against the chosen session, and the register is unchanged.
4. AC-27: after a reload, accent, scheme and sidebar state restore, the session is read only from
   `sessionStorage`, and no storage value contains the API bearer.
5. `npm run verify`, `ui:test`, `ui:test:dom` and the e2e lane are green; the catalogue and backlog
   agree with what shipped.

## Verification

| Gate                 | Command                                         | Result                                                        |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| Full gate            | `npm run verify`                                | pass - 7/7                                                    |
| UI unit              | `npm --prefix ui run test`                      | pass - 41 files, 449 tests                                    |
| UI DOM lane          | `npm --prefix ui run test:dom`                  | pass - 13 files, 89 tests                                     |
| UI typecheck         | `npm --prefix ui run typecheck`                 | pass                                                          |
| UI e2e               | `npx playwright test` (in `ui/`)                | pass - 74 tests, including the new imports and settings specs |
| Mock catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts` | pass - 77 tests                                               |

gate-run 2026-11-17T14:03:39.356Z profile=full steps=7/7 lines=7 bytes=1025

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason |
| ----- | --------------------- | ------ | ------------------------------ | ------ |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | -      |

## Mock sign-off

n/a — no user-visible surface; no `ui/src/**` file changes.

## Mock parity

n/a — no mock; these ACs describe behaviour, and no drawing asserts it.

## Acceptance

| #   | Criterion                                                                                                                                        | Evidence                                                                                                                                                                                                            | Verdict  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | AC-18: a 10,001-row CSV and a body over 1,048,576 bytes are rejected with split guidance and no request is sent                                  | `ui/e2e/imports.spec.ts` - "a member CSV over the 10,000-row limit..." and "a member CSV whose serialised body passes 1,048,576 bytes..."; both count upload requests and assert zero                               | ACCEPTED |
| 2   | AC-19: the batch summary renders and no browser storage value carries a member name from the file                                                | `ui/e2e/imports.spec.ts` - "a confirmed member import shows the batch summary and keeps no file contents in browser storage"                                                                                        | ACCEPTED |
| 3   | AC-20: a rejected attendance import lists the offsetting row against the chosen session and leaves the register unchanged                        | Not proven: the attendance panel's open/close race fails the case and the older deep-link case in the same parallel run. The two tests were removed rather than left flaky, and the backlog row records the blocker | PARKED   |
| 4   | AC-27: accent, scheme and sidebar restore after reload; the session is read only from `sessionStorage`; the bearer is in no `localStorage` value | `ui/e2e/settings.spec.ts` - the preference is written once in the page (not by an init script that re-writes it), the sidebar key is written only by the app, and every storage entry is scanned for the bearer     | ACCEPTED |
| 5   | Gates green, catalogue and backlog agree with what shipped                                                                                       | the table above; `v2-imports` AC-18/19 and `v2-settings` AC-27 are `e2e-only`; the attendance rows and AC-20 stay `deferred`                                                                                        | ACCEPTED |

## Deviations

- **AC-20 is parked, not delivered.** The worker's first version drove the panel from the deep link; that
  case failed under parallel load, and the same run failed the existing
  `events.spec.ts` deep-link case too. Opening the panel from the session row also failed under load,
  which rules out the route as the cause and points at the panel's own open/close race - the backlog's
  "The import panel's deep-link opening is unverified end to end" row named two prior reproducers and
  this is a third. The two new attendance tests were removed rather than landed as flakes; the
  catalogue's attendance rows and AC-20 stay `deferred`.
- **The settings test does not use `seedTheme`.** That helper writes the key on every navigation, so a
  reload assertion would prove the seed rather than the app. The preference is written once through
  `page.evaluate`, and the sidebar key is never written by the test.
- **AC-20's client half was also found.** The panel's parse rejects a `datetime` on another date before
  any request, which is stronger than the AC's wording; that behaviour is recorded here because the
  test that proved it was removed with the parked case.
- **The backlog row was renamed, not deleted.** Three other ACs (v2-shell AC-4, v2-events AC-6,
  v2-imports AC-7a) still anchored to it, so the row became "Remaining behavioural ACs behind the v2
  mock catalogues" and AC-20 stays in it.

## Review

Seat: consistent - the `Implementer` row names the cline-pass worker for the specs, fixtures and
catalogue edits, and the Tier 2 review is dispatched on a different class candidate.

Standards and Spec verdicts: pending.
