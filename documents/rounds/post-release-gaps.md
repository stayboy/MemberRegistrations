# Round - Post-release gaps: contact search, unassigned list, attendance ids and row errors (19c)

|        |                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Status | OPEN                                                                                                                           |
| Tier   | 2 - Reviewed                                                                                                                   |
| Mode   | `unattended (auto-accept recommendations)`                                                                                     |
| Base   | `9ba8d48`                                                                                                                      |
| Spec   | `documents/tickets/v2-events-ui/19c-post-release-gaps.md`; API spec amended 2026-11-05 (FR-8a, attendance `id`, import `rows`) |
| Ticket | 19c                                                                                                                            |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

**Pre-authorised gates.** The owner answered the go-forward grill ("all as recommended") and named the
three additive wire changes (attendance row `id`, `unassigned=true`, `import_failed.rows`) before this
round started. No migration, auth, tenant or route deletion is in scope.

## Plan

The release gates surfaced five gaps; 19c closes four of them plus the refresh the gates exposed:

- **Find by contact (FR-79).** A toolbar dialog sends `contact` to `GET /v1/members`, keeps the value
  in component state only and drops the cached result on close. The main search stays name/number.
- **Unassigned list (FR-8a).** The church report's figure links to `/members?unassigned=true`; the
  page seeds the filter once, sends it to the API and shows a removable chip. The API rejects any
  `unassigned` value other than `true`, and `status=archived` with it.
- **Attendance row ids.** The per-session report's rows carry `attendance.id`; the dialog removes a row
  through `ConfirmDialog` and a new `deleteEventAttendance`, then invalidates the events and member
  queries.
- **Structured import rows.** `ImportError` carries `rows: [{ row, message }]`; `problem.ts` emits it
  beside the unchanged `detail`; `ImportPanel` renders it.
- **Refresh after import.** A successful attendance import invalidates the event's attendance report.

Spec review (`deepseek-v4-pro:0813`, separate session) returned CHANGES REQUIRED twice on the amended
text and ACCEPT after each gap closed: the problem body now names `detail` as the carrier (not
`message`), `unassigned` accepts only `true`, the attendance `id` is the `attendance.id` and not the
member id, and `rows` cardinality is pinned — field validation and unknown attendance members name
every offending row, a duplicate names each involved row, database-dependent checks name the row they
stop at, `detail` keeps the first rejected row's `Row N: …` message, and batch-level failures carry
none.

## Verification

| Gate          | Command                                              | Result                                  |
| ------------- | ---------------------------------------------------- | --------------------------------------- |
| Typecheck     | `npm run typecheck`, `npm --prefix ui run typecheck` | pass                                    |
| Lint          | `npm run lint`, `npm --prefix ui run lint`           | pass                                    |
| Build         | `npm --prefix ui run build`                          | pass                                    |
| Format        | `npm run format:check`                               | pass                                    |
| API tests     | `npx vitest run --no-file-parallelism`               | pass - 18 files, 215 passed / 3 skipped |
| UI unit tests | `npm --prefix ui run test`                           | pass - 25 files, 293 tests              |
| E2E           | `npm run ui:e2e`                                     | pass - 46 tests (capture excluded)      |
| Captures      | `npm run ui:capture`                                 | pass - 21 regenerated; 9 committed      |

The first typecheck failed on a `never` narrowing in the new aggregation helper (a closure assignment
TypeScript's control flow could not see); the helper now uses a plain loop, and every gate above ran on
the final code.

## Review

`deepseek-v4-pro:0813`, read-only, uncommitted diff against `9ba8d48`.

- **Verdict: ACCEPT.** All seven ticket items and the three amendments were verified against the code,
  not the report.
- **P2 applied:** the delete and import invalidations covered the report and member queries but not the
  event-detail key, so the detail's present/expected column and the list counts went stale behind an
  open dialog. Both paths now invalidate the `['events', baseUrl]` prefix.
- **Nits applied:** the redundant `aria-label` on the contact `Input` was removed (the `Field` label
  already names it), and the stale `16a` ticket reference was dropped from the backlog.
- **Nits left:** `importErrorSchema` remains exported but unused (it predates this round);
  the member-detail-split row was removed as stale (closed by ticket 16).

**Author check the review missed.** The first spec draft promised one `rows` entry per offending row
while the code reported only the first field-validation failure. The text was clarified in two review
passes and the code now aggregates every rejected row in the file's field-validation pass; `detail` is
still the first failure's exact wording. A new test proves two bad attendance datetimes report rows 1
and 2 while `detail` names row 1.

## Acceptance

| #   | Criterion                                                        | Met | Evidence                                                                     |
| --- | ---------------------------------------------------------------- | --- | ---------------------------------------------------------------------------- |
| 1   | Find by contact dialog; value never in URL/storage               | yes | `FindByContactDialog.tsx`, client-path test                                  |
| 2   | Unassigned link, filter and 422                                  | yes | `ShepherdingReportPage.tsx`, `MembersPage.tsx`, `members-unassigned.test.ts` |
| 3   | Attendance `id`, remove behind `ConfirmDialog`, suppression copy | yes | `EventAttendanceDialog.tsx`, `attendance.test.ts`                            |
| 4   | Structured `import_failed` rows; batch-level keeps `detail`      | yes | `problem.ts`, `ImportPanel.tsx`, import tests                                |
| 5   | A successful attendance import invalidates the report            | yes | `ImportsAttendancePage.tsx`                                                  |
| 6   | Backlog rows closed and restated                                 | yes | `documents/backlog.md`                                                       |
| 7   | The three amendments implemented as reviewed                     | yes | repo and route tests                                                         |

Verdict: **ACCEPTED**.

## Deviations

- **The API's `q` still matches contact values.** FR-79 splits the main search (name/number) from the
  contact lookup in the UI, but `GET /v1/members?q=` still `ilike`s stored contact values, so a phone
  number typed in the main box finds the member. Narrowing `q` changes an existing read contract that
  this round did not authorise; it is recorded in the backlog with that framing.
- **The baseline screenshots were regenerated for the screens this round changed.** Nine captures now
  show the new members toolbar action (members list, contacts dialog and the five shell states), the
  attendance dialog's Remove actions, and the report's Unassigned link. Three further captures differed
  only by antialiasing (≤30 pixels) and were left untouched.
- **The member import's field validation is mostly enforced by the request schema**, so `rows` is
  observable mainly on attendance, duplicates and unknown members; the repository still validates and
  aggregates defensively.

## End-of-round go-forward (unattended — recommendations auto-accepted)

| #    | Decision                                                                                                                                                             | Where it lands                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Q201 | Write the two accepted lessons — pin the capture clock; keep a contrast fix monotonic — with the protected-doc review and the hash record; hold the third candidate. | `documents/lessons.md`, `documents/agents/protected-doc-reviews.json` (docs round) |
| Q202 | Narrow `GET /v1/members?q=` to name and member number so FR-79's separation is real, not nominal.                                                                    | API spec amendment + review, then the repo and its tests                           |
| Q203 | Start V3 at ticket 20 (offerings terms and attach), Tier 2, spec review before the worker.                                                                           | `documents/tickets/v2-events-ui/20-offerings-terms-attach.md`                      |
| Q204 | Cover 19c's new surfaces in the e2e gate — Find by contact and the attendance Remove — in the next UI round.                                                         | `ui/e2e/`                                                                          |
| Q205 | Keep the roster's contact values deferred until the roster DTO is next touched, and fold the change into it.                                                         | `documents/backlog.md`                                                             |
| Q206 | Enable Pages (owner step), watch the first deploy and record the URL.                                                                                                | repository setting, next round doc                                                 |
| Q207 | Leave the local mocks as they are; the committed baseline is the durable artifact.                                                                                   | none                                                                               |
| Q208 | Fix the events/offerings spec DTO debt inside ticket 20's own spec amendment so V3 starts from a truthful spec.                                                      | `member-registrations-events-offerings.md`                                         |
