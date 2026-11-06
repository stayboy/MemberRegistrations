# Headcount, activities and presbyter-only (24d slice A)

|        |                                                                                               |
| ------ | --------------------------------------------------------------------------------------------- |
| Status | OPEN                                                                                          |
| Tier   | 2 - Reviewed                                                                                  |
| Mode   | unattended (auto-accept recommendations)                                                      |
| Base   | `f0eba0d`                                                                                     |
| Ticket | 24d, slice A of two                                                                           |
| Spec   | `documents/specs/member-registrations-api.md`; `documents/specs/member-registrations-ussd.md` |

## Plan

Slice A delivers the data, semantics, API and USSD half of 24d; the operator pages and simulator are
slice B and are not built here. The work is one migration (`0016`), the headcount seam that replaces
`/expected`, presbyter-only event and series semantics, the Activities eligibility/ordering/zero-state
rules, the USSD presbyter headcount screen, and the tests and OpenAPI updates behind them.

Files:

- `src/db/migrations.ts` - `0016_ussd_headcount_presbytery`: `ussd_sessions.provider` (default
  `hmac`) plus `external_id` and the partial unique `(provider, external_id)`; `event_session_headcounts`;
  `presbyter_only` on `event_instances` and `event_series`; drop `event_session_expected`.
- `src/db/schema.ts`, `tests/db/schema-drift.test.ts` - the Drizzle mirrors for the headcount table, the
  session provider/external id, the event/series flag and the headcount/provider indexes.
- `src/repos/headcounts.ts` - append-only observations, `current` resolution, correction by
  supersession, mode/bucket validation, the session-day `asOf` rule, `supersededBy`.
- `src/repos/ussd.ts` - resolve a gateway session on `(provider, external_id)` without changing the
  existing pipeline.
- `src/repos/events.ts`, `src/repos/series.ts`, `src/repos/members.ts`, `src/repos/clocking.ts` -
  `presbyterOnly` on create/update/generation, the presbyter roster, the 404 posture and regularity
  exclusion.
- `src/routes/events.ts`, `src/routes/series.ts`, `src/schemas/events.ts`,
  `src/schemas/reference.ts`, `src/openapi.ts`, `src/create-app.ts` - the headcount routes, route
  deletion and the generated contract. The bearer event routes carry no member identity (owner
  decision, see **Decisions**).
- `src/ussd/machine.ts`, `src/ussd/services.ts`, `src/ussd/glossary.ts` - eligibility/ordering, the
  declared page size, the zero-events states, the presbyter headcount states and the display keys.
- `tests/api/event-headcounts.test.ts`, `tests/api/events-presbytery.test.ts`,
  `tests/api/ussd-activities.test.ts`, plus the updated `events`, `series`, `clocking`, `ussd-*` and
  `ussd-glossary` tests - external-behaviour coverage.
- `documents/specs/member-registrations-api.md`, `documents/specs/member-registrations-ussd.md` - the
  provider column, the member-facing presbyter-only rule and the Activities headcount carve-out.

Acceptance criteria:

1. Migration `0016` matches the ORM mirror and the drift checks; the old expected table is gone.
2. `GET`/`POST /v1/events/{eventId}/headcounts` append, list newest first, resolve `current`, derive
   `supersededBy`, keep a correction's target `asOf`, allow a mode change and refuse a second supersede.
3. Every headcount bound, mode rule, all-zero case, out-of-day `asOf` and unknown event/session has the
   specified `422`/`404` answer; the routes are `no-store` and operator-only.
4. `/expected` answers `404`; the attendance report keeps `expected` as the roster and a presbyter-only
   session counts active presbyters.
5. Presbyter-only visibility is a member-facing rule: the USSD member session and the member-scoped
   routes hide the event from non-presbyters (attendance, clocking, roster, regularity and
   Activities); an officer's bearer read sees it like any other event, and a series flag change
   affects future occurrences only.
6. Activities eligibility, date → tier → start time → event number ordering, declared page size, the
   two-week zero-today horizon, `No upcoming events`, the empty week and `A date` all match the spec.
7. The USSD headcount screen shows the current mode/time, New vs Correct, a preselected last mode,
   tolerant three-number entry, a lay restatement, the recorded total, and mixed as display-only.
8. Every screen stays inside 16/60/182 and the glossary covers every static key.

## Verification

| Gate             | Command                                | Result                                                                                                          |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Typecheck        | `npm run typecheck`                    | pass                                                                                                            |
| Lint             | `npm run lint`                         | pass                                                                                                            |
| Tests            | `npm run test`                         | parallel worker flake, see note below                                                                           |
| Build            | `npm run build`                        | pass                                                                                                            |
| Format           | `npm run format:check`                 | pass                                                                                                            |
| Serialized tests | `npx vitest run --no-file-parallelism` | pass - 40 files, 506 passed / 3 skipped (509); one replay lost 2 workers at 491 passed / 3 skipped, retry green |
| Smoke            | `npm run smoke`                        | pass - 61 checks                                                                                                |
| UI types         | `npm --prefix ui run typecheck`        | pass                                                                                                            |

`npm run test` (parallel) was resource-flaky on this Windows machine. The first run lost three workers
to the known PGlite exit `3221226505` (37/40 files, 486 passed / 3 skipped) and the required retry timed
out five `beforeAll` PGlite starts (35/40 files, 453 passed / 54 skipped). The serialized gate reached
40/40 and 506 passed / 3 skipped (509) on a green replay; two later replays lost a worker to the same
exit (`ussd-attendance.test.ts`, then `ussd.test.ts`), and both files pass alone (10/10 and 20/20), as
do the new headcount (13/13) and presbytery (9/9) files. No assertion failed in any run. Recorded, not
looped.

### Decision pass (2026-11-06)

After the owner settled the three carry-over decisions below, the required gates were re-run:

| Gate             | Command                                                                                                                                                                           | Result                                                                                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck        | `npm run typecheck`                                                                                                                                                               | pass                                                                                                                                                                                                                                                           |
| Lint             | `npm run lint`                                                                                                                                                                    | pass                                                                                                                                                                                                                                                           |
| Format           | `npm run format:check`                                                                                                                                                            | pass                                                                                                                                                                                                                                                           |
| Focused suites   | `npx vitest run --no-file-parallelism tests/api/events-presbytery.test.ts tests/api/event-headcounts.test.ts tests/api/ussd-activities.test.ts tests/api/ussd-attendance.test.ts` | pass - 4 files, 42 passed (presbytery 9, headcounts 13, activities 10, attendance 10)                                                                                                                                                                          |
| Serialized suite | `npx vitest run --no-file-parallelism`                                                                                                                                            | 39/40 files: 504 passed / 3 skipped, with the lost file's tests unrun, so the run is partial against the 509 green baseline; the retry and the isolated runs are the evidence. The retry lost two more files (`ussd-attendance`, `ussd`); no assertion failed. |
| Smoke            | `npm run smoke`                                                                                                                                                                   | pass - 61 checks                                                                                                                                                                                                                                               |

The serialized failures are the known Windows PGlite/fork-pool exits, not assertion failures: retried
once, then the affected files isolated, recorded, not looped.

## Decisions (owner, 2026-11-06)

Three owner decisions were applied to the uncommitted slice before the review gate.

1. **The member-identity request header is removed.** Slice A had grown an optional request header
   naming the member on whose behalf a bearer event read was made, with a `404` for a non-presbyter on
   a presbyter-only event. The owner rejected it: it was an implementer-introduced,
   authorization-shaped mechanism, and `AGENTS.md` §6 says V2 has no per-officer authorization. The
   header, its helper, the `viewer` parameters and every presbyter-only guard on the bearer routes are
   deleted. An officer bearer reads a presbyter-only event, its attendance report and an attendance
   write like any other event; the bearer surface carries no member identity.
   `EventViewer` and `isActivePresbyter` were removed with their only callers. The USSD path builds
   its own viewer from the session and is untouched. `tests/api/events-presbytery.test.ts` now asserts
   the corrected behaviour: the bearer reads without any special header, while the roster,
   regularity, clocking and series rules stay covered. A repo-wide case-insensitive grep for the
   header name returns zero hits.
2. **The session provider default is kept.** `ussd_sessions.provider` stays `NOT NULL DEFAULT 'hmac'`
   with the partial unique index on `(provider, external_id)`; reviewed and kept, no change.
3. **The Activities headcount enrichment is kept.** A headcount-only event still shows its current
   headcount in Activities (`src/ussd/services.ts:237-244`). This is explicitly carved out by the
   spec: `documents/specs/member-registrations-ussd.md:379` (a headcount-only event is listed in
   Activities with its current headcount), `:785-786` (the Activities page size accounts for that
   headcount inside the 182-character budget), and
   `documents/specs/member-registrations-api.md:632` (Activities reads the current headcount for a
   headcount-only event through the same `GET`). Do not remove it; it does not breach the
   operator-only headcount rule.

The spec was corrected alongside the code: the change-log entry now records the member-facing scope,
the header entry is gone, and the presbyter-only rule is stated positively for member-facing surfaces
(the USSD member session and member-scoped routes), not for officer bearer reads.

## Review

Tier 2 Standards + Spec review by `deepseek-v4-pro` build `0813`: **ACCEPT**, with two P2 findings and
three nits. All five are applied in the uncommitted slice.

1. **P2 — dangling `Location`.** `POST /v1/events/{eventId}/headcounts` named a read target that did
   not exist. `GET /v1/events/{eventId}/headcounts/{headcountId}` now returns the `Headcount` DTO with
   `no-store`, and answers `404 not_found` for an unknown id or a row belonging to another event. It is
   registered in `src/openapi.ts` and the spec, and the test reads back a row created by `POST` and by a
   correction, then asserts the 404. The pre-existing attendance `Location`
   (`/v1/events/{id}/attendance/{entryId}` on `POST …/attendance`) still names no route; that is the
   same class of defect but predates this slice and is recorded here as out of scope, not fixed.
2. **P2 — the presbyter-only guard leaked onto the officer delegation route.** `ClockingRepository.delegate`
   hides a non-presbyter grantor at a presbyter-only session as `404` for every caller. It now takes
   `{ surface: 'member' | 'operator' }`, defaulting to `member`: the USSD member path keeps the hidden
   `404`, and the officer bearer `POST /v1/events/{eventId}/delegations` passes `operator` and answers
   `422 not_presbyter`. Tests cover both. A grep found no bearer caller for `clockIn` — only the USSD
   service and tests call it — so it keeps the member default and is unchanged.
3. **Nit — the `eventInstances` Drizzle mirror.** The unused `presbyterOnly` field is dropped; only its
   `id` is consumed by the headcount foreign key. The comment now says the raw engine owns
   `presbyter_only`, so the mirror cannot imply the flag is ORM-owned.
4. **Nit — the serialized-suite arithmetic.** The decision-pass line now states it as a partial total
   (504 passed / 3 skipped with the lost file unrun), names the retry and isolated runs as the evidence,
   and no longer quotes a retry total that could not be reconciled.
5. **Nit — smoke coverage.** `scripts/smoke.mjs` now exercises headcount append, correction (keeping the
   target `asOf`), the list's `current` plus supersession chain, the retired `/expected` `404`, and a
   presbyter-only report whose `expected` equals the active-presbyter count.

Gates after the fixes:

| Gate             | Command                                                                                                                                                                                             | Result                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Typecheck        | `npm run typecheck`                                                                                                                                                                                 | pass                                                          |
| Lint             | `npm run lint`                                                                                                                                                                                      | pass                                                          |
| Format           | `npm run format:check`                                                                                                                                                                              | pass                                                          |
| Focused suites   | `npx vitest run --no-file-parallelism tests/api/event-headcounts.test.ts tests/api/events-presbytery.test.ts tests/api/clocking.test.ts tests/api/ussd-attendance.test.ts tests/api/events.test.ts` | pass - 5 files, 76 passed                                     |
| Serialized suite | `npx vitest run --no-file-parallelism`                                                                                                                                                              | pass - 40 files, 509 passed / 3 skipped (512); no worker exit |
| Smoke            | `npm run smoke`                                                                                                                                                                                     | pass - 67 checks (61 existing + 6 headcount/presbyter-only)   |

The smoke event for this block is dated yesterday so it never displaces the `findCurrentEvent` giving
event; `P-9001` gained `joinedOn: '2026-01-01'` so the presbyter roster floor includes it.

## Acceptance

TBD - parent acceptance after the review gate.

## Spec review record

- `pro:0813` spec review ACCEPT on the headcount/activities refinements, PRs 71/72.

## Interpretations

- **Provider column.** No provider column existed, so `ussd_sessions.provider` is added with the
  existing single provider as `hmac`; `(provider, external_id)` is the partial unique pair. The internal
  uuid remains the session key. `UssdRepository` gains resolve/attach methods; the existing pipeline
  behaviour is unchanged because no adapter supplies an external id in slice A.
- **Correction `asOf`.** A correction always keeps the target's `asOf`, even when recorded on a later
  day; a client `asOf` on a correction is ignored. An append validates its `asOf` (default now) against
  the session day in the event timezone.
- **`current`.** The current observation is the newest non-superseded row by `asOf`, then `recordedAt`,
  then `id`. Appends can leave several non-superseded observations; a correction must name the current
  one, and its own `asOf` is the target's.
- **List shape.** The response keeps the spec's `sessionDate` alongside `current` and `observations`,
  although the ticket shorthand mentioned only the latter two.
- **USSD headcount actor.** `recordedBy` is `ussd:<phoneHash>`, matching the 24b clocking audit style; the
  correcting presbyter adds a new actor and `recordedAt` while the target row stays readable.
- **Headcount time display.** The USSD current screen shows the `asOf` clock time in UTC (`HH:MM`); the
  session pipeline does not carry the event timezone into the screen, while storage still validates the
  calendar day in the event timezone.
- **Headcount done screen.** After save the screen shows the recorded total and offers `9 Back` to the
  clocking/session menu and `00 Main`; it is not terminal, so the gateway keeps the session open. This
  is the interpretation of "return to the session menu".
- **Mode preselection.** USSD shows `Last mode <Adult|Children service>`; it is a hint, not an implicit
  keypress. A mixed current observation falls back to Adult service and is never offered for entry.
- **Activities and ministry-tied presbyter-only events.** A presbyter-only event tied to a ministry still
  requires an active assignment to that ministry (the same scope as regularity); a general
  presbyter-only event is visible to every presbyter. This keeps "never show an event the caller cannot
  attend" and "my ministry events" consistent.
- **Declared page size.** The day and week lists page at `UssdSessionInfo.pageSize.events` (default 3);
  the renderer also pages when the day itself has more rows than the declared size, so the `0 More`
  action is never lost. Slice B supplies Nalo's 2.
- **Zero state and `Date` label.** `1 View` opens the next applicable date inside the 14-day horizon;
  `2 This week` opens the week list. The empty-week action uses the glossary's short `Date` form for
  `activities.a_date` (the prose's "A date" is its full form).
- **`in N days`.** `label.in_days` is `in {n} days` in both forms and the extra `label.days` key was
  removed, so the handset reads `2 events in 2 days` exactly as the spec's example.
- **Headcount visibility.** The headcount DTO, profile, summary and event detail never carry a
  headcount. Activities still shows a headcount-only event's current total, which the spec explicitly
  carves out of the operator-only rule.
- **`/expected` deletion.** The route is removed rather than deprecated; a `GET` or `PUT` answers `404`.
  The attendance report keeps the wire field `expected`, computed from the roster.
- **Roster floor.** A presbyter-only roster counts active presbyters that satisfy the session's join-date
  floor, the same floor as the general roster. The event-list session counts and the report use the same
  filter.
- **Series flag.** `presbyterOnly` is read from the series at generation time; updating the series never
  writes existing instances. A generated instance inherits the flag once and can then be edited on its
  own.
- **Error set.** No new domain error code was needed: mode/bucket/`asOf`/`supersedesId` failures map to
  the existing `422 validation_error` and an unknown event/session to `404 not_found`.
- **Scope.** Slice B (operator pages, Nalo/HMAC adapters, `/dev/ussd/session`, simulator) is not built.
  No commit, push or merge was made.

## Deviations

- The parallel `npm run test` gate was not green on this Windows host; the serialized command was. The
  known PGlite worker exit is recorded above and was retried once.
- No UI mock is involved in slice A; the USSD screens are asserted as exact frames and budgets.
