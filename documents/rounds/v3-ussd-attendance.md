# USSD attendance (ticket 24b)

|        |                                                                                               |
| ------ | --------------------------------------------------------------------------------------------- |
| Status | OPEN                                                                                          |
| Tier   | 2 - Reviewed                                                                                  |
| Mode   | unattended (auto-accept recommendations)                                                      |
| Base   | `b4a8e32`                                                                                     |
| Ticket | 24b                                                                                           |
| Spec   | `documents/specs/member-registrations-api.md`; `documents/specs/member-registrations-ussd.md` |

## Plan

Two slices, one round. Slice A shipped the bearer seams; slice B ships the USSD tree that uses them.
Code redemption and registration-request creation stay inside `POST /ussd/session`; neither gets a
bearer route.

### Slice A — bearer seams

- `src/db/migrations.ts` — migration `0014_ussd_attendance`: `members.presbyter_rank`, the
  `tracks_members` event flag, `attendance_codes`, `registration_requests`, the late request foreign key,
  `clocking_delegations` with its partial unique active grant, and `event_session_expected`.
- `src/schemas/events.ts`, `src/repos/events.ts` — expose `tracksMembers` on create, update and the event
  DTO, persist it on manual inserts and updates, keep generated series instances member-tracked, include
  it in the ETag, and reject a manual attendance write on a headcount-only event with
  `422 headcount_only` while the report still reads.
- `src/db/schema.ts`, `src/repos/members.ts` — `presbyterRank` on the detail DTO only, create/update
  rules (rank requires the flag, clearing the flag clears the rank, version-guarded), and the windowed
  `attendanceSummary` plus `profile` aggregates over held scoped sessions with join and ministry floors.
- `src/errors/domain-errors.ts`, `src/errors/problem.ts` — the code, clocking, registration and
  rate-limit error codes, including `TooManyTriesError` → `429 too_many_tries`.
- `src/repos/attendance-codes.ts` — six-digit CSPRNG issue with a 15-minute TTL, HMAC-SHA-256 storage
  under `USSD_CODE_PEPPER`, list without the plain value, void, and redemption with the shared
  `auth_rate_limits` attempt counter.
- `src/repos/registration-requests.ts` — pending/decided list, portal read, approval through
  `MemberRepository.create`, and rejection that creates nothing.
- `src/repos/clocking.ts` — delegation, expected-headcount upsert/read and the USSD actor rules that
  guard `EventRepository.addManualAttendance`.
- `src/schemas/events.ts`, `src/schemas/members.ts`, `src/schemas/registration-requests.ts` — the wire
  contracts, including `presbyterRank` and the summary/profile shapes.
- `src/routes/attendance-codes.ts`, `src/routes/registration-requests.ts`, `src/routes/events.ts`,
  `src/routes/members.ts` — the bearer seams. The summary and profile routes are declared alongside the
  existing member sub-routes; the one-segment `GET /:memberNo` read does not shadow a deeper path.
- `src/create-app.ts`, `src/openapi.ts` — wire the repositories with the resolved code pepper and
  document every new path and schema.

### Slice B — the USSD screens

- `src/ussd/services.ts` — `memberContext`, `activities`, `activitiesWeek`, `attendance`, `profile`,
  `redeemCode`, `createRegistration`, `clockIn`, `delegate`, `recordExpected`, `memberByNo` and
  `isSenior`, all behind the shipped repositories. The USSD actor is `ussd:<phoneHash>`.
- `src/ussd/machine.ts` — the 24b main menu and the Activities, Attendance, Profile and Register
  states, with the existing 24a giving flow reused for an event. Navigation keeps `9`, `00` and the
  five-try invalid guard.
- `src/ussd/glossary.ts` — the 24b static keys plus two done-screen keys added to the reviewed table.
- `src/create-app.ts` — pass the existing event, code and clocking repositories into the USSD services
  (composition only, no behaviour change).
- `tests/api/ussd-attendance.test.ts` — the 24b journeys over the real app and PGlite.
- `tests/api/ussd.test.ts`, `tests/unit/ussd-glossary.test.ts` — the 24a tests move to the 24b menu
  numbering and the glossary budget fixtures cover every new state.
- `scripts/smoke.mjs` — issue an attendance code and a registration code through the bearer seams,
  redeem both through the USSD session and assert the attendance row and the pending request; the
  existing give and pledge journeys stay in place.

Acceptance criteria:

1. The member menu is Offerings, Activities, Attendance, Profile, Exit; the anonymous menu is Register,
   Offerings, Activities, Attendance, Exit. `9` goes back and exits at main, `00` returns to main.
2. Activities opens today's held events (at most four, `0 More` for the week, `8 A date`), a selected
   event offers Give and Attendance, and a headcount-only event carries its expected headcount.
3. Attendance opens today's status with the counts and the attended events newest first, then a day, a
   period, a code and (for presbyters) clocking; a member with no data reads "No attendance".
4. An `attendance_punch` code records the member's attendance once; reused, expired, voided,
   wrong-session and unknown codes all answer "Bad code" and never reveal whether the code exists.
5. A `registration` code plus first and last name creates a pending request with a reference and no
   member row; a reused code answers "Code used".
6. A presbyter clocks in a member they shepherd; a present senior clocks anyone; an absent senior is
   told to delegate first; the delegate may then clock anyone for the session.
7. Expected `male,female,children` is captured for the session and the done screen restates the
   buckets and total.
8. Profile renders the shared identity label, member number, up to three ministries, the attendance
   line and the shepherd (or "Not assigned").
9. Every state renders inside the glossary budgets; the USSD actor is `ussd:<phoneHash>` and no raw
   phone enters a session context.

## Verification

| Gate             | Command                                | Result                                  |
| ---------------- | -------------------------------------- | --------------------------------------- |
| Typecheck        | `npm run typecheck`                    | pass                                    |
| Lint             | `npm run lint`                         | pass                                    |
| Tests            | `npm run test`                         | pass — 32 files, 425 passed / 3 skipped |
| Build            | `npm run build`                        | pass                                    |
| Format           | `npm run format:check`                 | pass                                    |
| Serialized tests | `npx vitest run --no-file-parallelism` | pass — 32 files, 425 passed / 3 skipped |
| Smoke            | `npm run smoke`                        | pass — 47 checks                        |
| UI types         | `npm --prefix ui run typecheck`        | pass                                    |

Focused review-fix tests: `attendance-codes`, `registration-requests` and `clocking` pass 23/23
serialized; the new USSD registration journey passes alone (1/1). The full parallel run was green at
32 files / 425 passed / 3 skipped after one intermediate run lost the `clocking` worker to the known
Windows/PGlite exit `3221226505`; the serialized run was also green. Recorded, not looped.

## Review

The 24b review findings are fixed on this branch:

- **Registration code binding (P2).** Registration redemption no longer uses `currentEvent()` or a
  wrong-session check. The code row owns the event and session; the USSD register flow collects the code
  and both names and redeems against that row. Attendance punches still require and match the caller's
  event/session.
- **Concurrent double approve (P2).** `MemberRepository.createWithin` runs inside the caller's
  transaction. Approval locks the request `for update`, re-checks `pending`, creates the member and marks
  the request in one unit; a duplicate number rolls back and leaves the request pending.
- **Delegation audit and validation.** `clocking_delegations.created_by` records the actor, the trim
  floor is three characters, and a plain non-presbyter now gets `422 not_presbyter` rather than
  `not_shepherd`/`not_senior_presbyter`.
- **Rank invariant.** `members_presbyter_rank_check` enforces “rank only with `is_presbyter`” in the
  database as well as the repository.

Tier 2 Standards + Spec re-review is the next gate.

## Acceptance

Fixed and verified; parent acceptance is still pending. The four findings above are the review record
for this pass, and the USSD spec records the four-item Activities page.

## Spec review record

- `pro:0813` ACCEPT on the 24b attendance/codes/clocking/profile spec.

## Interpretations

- **`tracks_members` column and contract.** The data model already specifies
  `event_instances.tracks_members`, but the shipped schema had neither the column nor a way to set it.
  Migration 0014 adds it with `default true`, and the event create/update/DTO contract now carries
  `tracksMembers`; the update schema re-declares it without the create default because Zod’s `.partial()`
  would otherwise keep applying `true` to an omitted update. Generated series instances are explicitly
  member-tracked.
- **Approval transaction.** Approval locks the request and calls `MemberRepository.createWithin` in the
  same transaction, so a concurrent second approval waits, sees `approved` and returns
  `409 registration_not_pending`; a duplicate member number rolls the member insert back and leaves the
  request pending.
- **Void reason.** The authorised table has no reason column, so `POST /v1/codes/{id}/void` accepts the
  reason for contract symmetry and records the void actor/time only.
- **Profile `lastAttendedOn`.** It is the latest attended date inside the five-session regularity window,
  not the latest date over all history; that is the reading the USSD "No data · 2 of 2 · date" line uses.
- **Headcount bounds.** Each bucket is capped at 10,000, so the 30,000 total check is reachable only at
  the exact sum; the per-bucket bounds are the observable guard.
- **Composition root.** Slice B passes the already-constructed `events`, `attendanceCodes` and
  `clocking` repositories into `createUssdServices`; no repository rule or route changes. This is the
  only edit outside the listed USSD files and the tests.
- **Registration redemption point.** `register.code` accepts a six-digit code and collects both names
  before redeeming, because the repository creates the request and consumes the code in one
  transaction and needs the names. `error.code_invalid`/`error.code_used` therefore render on the last
  name step; the format check still rejects a non-six-digit value at the code prompt. A registration
  code is redeemed against its own row, so the menu never needs a current event.
- **Code and clocking session.** Attendance codes are redeemed against the event already in context (the
  current event on the Attendance screen, or the selected Activities event). A punch code for another
  session is refused as `code_wrong_session`; registration codes carry their own event/session.
- **Activities count on an event.** `activities.event` `2 Attendance` uses the member-scoped window for
  that date, so the count is the member's own expected/attended pair and the presence is whether their
  row exists. This avoids a second attendance service outside the authorised seam list.
- **Activities week.** `activitiesWeek(date)` is an extra read over the same repository query, used by
  the `0 More` page. It returns the seven-day window; the machine pages four at a time so a
  five-headcount-event day with a five-digit expected count still fits the 182-character budget. The
  spec now records the four-per-page Activities limit (the fifth and later are reachable through
  `0 More`, and the week list includes today).
- **Done screens.** `attendance.done` and `register.done` are terminal (`done: true`, no options), like
  the 24a payment confirmations. A confirmation does not re-open the tree.
- **Attendance list width.** The status screen renders at most two event rows so the whole screen stays
  inside 182 characters with the four actions and the footer.
- **Two glossary keys.** The done screens need words the 24b table did not carry, so
  `status.attendance_recorded` (Recorded) and `error.code_used` (Code used) are added to the USSD spec
  table and the glossary with a changelog line. No other static copy was added.
- **Not committed or pushed.** The parent owns commit, push, PR and merge.
