# Round — mvp-offering-capture

|                     |                                                                  |
| ------------------- | ---------------------------------------------------------------- |
| Status              | BLOCKED — no mock or sign-off for the two changed surfaces       |
| Tier                | 2                                                                |
| Mode                | `attended` (owner present; migration and wire gates named below) |
| Base                | `268b8f8` + the phase-5 spec amendment                           |
| Review rounds       | 2 (REWORK → ACCEPT)                                              |
| Gate runs in parent | 8                                                                |
| Spec                | `documents/specs/member-registrations-events-offerings.md`       |
| Workers             | `single`                                                         |

## Plan

Goal: ship the MVP's bulk offering capture end to end — migration `0017`, the offering-count API, the
`#/ussd/offerings` operator page, the counted/variance figures on the offerings landing — on the
phase-5 contract. The member-announced gift and pledge forms reuse the existing routes.

Seats (policy ranking): worker `ollama-cloud/deepseek-v4.1-flash:1017` → fallback
`cline-pass/cline-pass/deepseek-v4.1-flash-1017`; reviewer/spec-review
`ollama-cloud/deepseek-v4-pro:0813` → fallback `cline-pass/cline-pass/mimo-v2.6-pro`. The ollama weekly
limit is expected, so the fallback seats are recorded here; the policy table is unchanged.

Pre-authorisations (named, accepted 2026-11-08):

- **Migration `0017_offering_counts`** — the two count tables. 24e's expected migration moves to `0018`.
- **Wire route** `GET`/`POST /v1/events/{eventId}/offering-counts?sessionDate&offeringId` and the
  `ChurchOfferingSummary` additions (`countedMinor`, `varianceMinor`, group `countedMinor`).
- **UI route** `#/ussd/offerings` and the navigation row.

No other wire contract changes: announced gifts reuse `POST /v1/contributions` (`channel: manual`) and
pledges reuse `POST /v1/pledges`.

### Decisions (grill follow-up, all accepted 2026-11-08)

| ID  | Decision                 | Answer                                                                                                                                                            |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | MVP boundary             | One church, officer web app + API/gateway; every officer equal; members never sign in; live USSD, gateway money, notifications and per-officer scoping out.       |
| Q2  | Giving capture           | Bulk cash count per event, headcount-style; **not** a per-member form. Denomination lines `value × pieces`. Member-announced gifts and pledges stay member-level. |
| Q3  | Live USSD                | Post-MVP on an aggregator/gateway/shortcode trigger.                                                                                                              |
| Q4  | USSD pages in production | Hide the Simulator in production; keep the other pages with a "USSD is not live" notice.                                                                          |
| Q5  | Roster contacts          | Must-fix read-contract narrowing.                                                                                                                                 |
| Q6  | Main-search narrowing    | Must-fix; authorises the read-contract change.                                                                                                                    |
| Q7  | Offering terms reach     | Read-only "Active offerings" panel; full detail O1 post-MVP.                                                                                                      |
| Q8  | UI baseline              | Recapture after the UI changes; review artifact only.                                                                                                             |
| Q9  | Won't list               | FR-29 stats, presbyter picker, `+ Add offering`, Reminders card, series-occurrence ids, contact link/unlink.                                                      |
| Q10 | Notifications            | Parked as one delivery round.                                                                                                                                     |
| Q11 | Per-officer auth         | Parked until a second church/role.                                                                                                                                |
| Q12 | Production config        | One cutover sequence; every env var, explicit `UI_BASE_URL`/CORS, `0016`, officers seeded, runbook fixed.                                                         |
| Q13 | Cutover data             | Officers → members → ministries → events → attendance → shepherding; example template row removed.                                                                |
| Q14 | Backup/alerting          | New backlog rows; both must land before release.                                                                                                                  |
| Q15 | Smoke/rollback           | New backlog row; forward migration for a bad one, Vercel rollback for code.                                                                                       |
| Q16 | Hardening round          | One `mvp-release-hardening` round after this capture round.                                                                                                       |
| Q17 | Parking map              | Triggers recorded in the backlog.                                                                                                                                 |
| Q18 | Count granularity        | Per event + offering + session.                                                                                                                                   |
| Q19 | Count storage            | Append-only observation + denomination lines; correction supersedes; migration `0017`.                                                                            |
| Q20 | Denominations            | Editable rows with a GHS quick-pick; any positive `denominationMinor` + `pieces`; bounded.                                                                        |
| Q21 | Reconciliation           | Counted cash and variance alongside recorded gifts, never added.                                                                                                  |
| Q22 | Member forms             | Reuse the existing contribution and pledge routes.                                                                                                                |
| Q23 | UI placement             | `#/ussd/offerings` beside Headcount, headcount pattern.                                                                                                           |
| Q24 | Round split              | This capture round first, then `mvp-release-hardening`.                                                                                                           |

### Scope (expected files)

- `src/db/migrations.ts` — `0017_offering_counts`: `event_session_offering_counts` and
  `event_session_offering_count_lines`; supersede uniqueness; constraint checks.
- `src/db/schema.ts` — ORM schema parity for the new tables (drift check).
- `src/schemas/offering-counts.ts` — query, create/correct, line, DTO schemas.
- `src/repos/offering-counts.ts` — record/correct/list, current derivation, validations.
- `src/routes/offering-counts.ts` (or mounted in `src/routes/events.ts`) — collection `GET`/`POST`,
  registered before any conflicting `:id` route; `no-store`.
- `src/repos/offerings.ts` — summary counted/variance aggregation (current-only, windowed, reporting
  currency).
- `src/schemas/offerings.ts` — summary additions.
- `src/openapi.ts`, `scripts/smoke.mjs`.
- `ui/src/api/offering-counts.ts`, `ui/src/format/offering-counts.ts`, `ui/src/pages/ussd/OfferingsCountPage.tsx`,
  `ui/src/pages/ussd/ussd-styles.ts` (or page-local), `ui/src/app/router.tsx`, `ui/src/shell/navigation.ts`.
- Offerings landing: counted/variance cards and group columns (`ui/src/pages/offerings/*`).
- Tests: repo/API (PGlite + pg parity), migration, summary reconciliation, UI api/format/render, e2e +
  axe light/dark, smoke.

### Acceptance criteria

1. Migration `0017` applies on both drivers; the tables enforce one line per denomination, positive
   amounts/pieces, a positive total, a session date in the event's sessions, an attached offering, and
   unique `supersedes_id`.
2. `POST /v1/events/{eventId}/offering-counts` appends an observation (`201`), defaults `asOf` to now
   within the session day, rejects all-zero counts, validates currency = terms currency, and rejects a
   correction whose `supersedesId` is unknown, already superseded, another group or not current (`422
validation_error`).
3. A correction keeps the corrected `asOf`, replaces its lines, and leaves the earlier row readable and
   valid; a second supersede is `422`. The read returns `{ current, observations }` with current =
   newest non-superseded by `asOf`, `recordedAt`.
4. `GET`/`POST` are bearer and `no-store`; no contact values; OpenAPI documents the route.
5. The summary's `countedMinor` sums only the current observation per group, windowed by `sessionDate`,
   in the reporting currency; `varianceMinor = countedMinor − (totalPaidMinor + visitors.paidMinor)`;
   counted cash is never added to gifts.
6. `#/ussd/offerings` follows the headcount pattern (picker, current, record/correct, history), uses a
   GHS quick-pick hidden for non-GHS offerings, shows a live total, and carries the announced-gift,
   pledge and terms actions.
7. The landing shows counted cash and variance without changing the existing gift/pledge semantics.
8. Tests fail before and pass after; both drivers; UI api/format/render; e2e and axe light/dark; smoke
   covers the new route.

Out of scope: the `mvp-release-hardening` items (roster contacts, search narrowing, active-offerings
panel, production config, backup/alerting, cutover); live USSD; Redis/aggregates; 24e.

## Verification

| Gate                | Command                                                                                                                            | Result                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Format (repo)       | `npm run format:check`                                                                                                             | pass                                                                                                                                 |
| Format (UI)         | `npm run format:check` (ui)                                                                                                        | pass                                                                                                                                 |
| Lint (repo)         | `npm run lint`                                                                                                                     | pass                                                                                                                                 |
| Lint (UI)           | `npm run lint` (ui)                                                                                                                | pass                                                                                                                                 |
| Typecheck (repo)    | `npm run typecheck`                                                                                                                | pass                                                                                                                                 |
| Typecheck (UI)      | `npm run typecheck` (ui)                                                                                                           | pass                                                                                                                                 |
| Root tests          | `npx vitest run --no-file-parallelism`                                                                                             | 45/46 files, 554 passed, 5 skipped; one worker `3221226505` at start of `tests/api/offerings.test.ts`, which then passed 34/34 alone |
| Root tests (target) | `npx vitest run tests/api/event-offering-counts.test.ts tests/db/schema-drift.test.ts tests/api/offerings-summary-explain.test.ts` | 27 passed, 1 skipped                                                                                                                 |
| UI tests            | `npm test` (ui)                                                                                                                    | 34 files, 370 passed                                                                                                                 |
| UI build            | `npm run build` (ui)                                                                                                               | pass (existing chunk-size warning)                                                                                                   |
| UI e2e              | `npx playwright test` (ui)                                                                                                         | 55 passed                                                                                                                            |
| Smoke               | `npm run smoke`                                                                                                                    | pass, including the count, invalid correction, summary identity and OpenAPI checks                                                   |

The Windows fork-pool exit `3221226505` is environmental (recorded, retried once, never looped).
The first full root run also lost two unrelated files to beforeAll timeouts under memory pressure;
the serial rerun above is the recorded result.

## Mock parity (when a mock exists)

**Mocks now exist, sign-off pending.** The owner ruled on 2026-11-09 that every UI and USSD surface
needs a comparison mock and a sign-off **before** implementation. This round started before that rule
and recorded "no mock"; that was the gap. `documents/rounds/mvp-mocks.md` builds the two spec-derived
mocks under `mockups/mvp-offerings/` (landing success/empty/loading/error; operator count
success/none/correcting/loading/error). The round stays blocked until the owner signs both in that
round doc; the parity pass then compares the built pages and any spec-required miss is reworked before
the commit request.

What existed before (all git-ignored):

- `mockups/v2-events/05-offerings-landing.png` — 2026-11-03, the V3 landing before counted cash and
  variance; it is the ticket-23 reference, not this round's.
- `mockups/ussd/` — 41 screens; the back-office set stops at claims (`35`–`41`). No mock for the
  operator Headcount or Offerings count pages existed.

The protected-doc amendment that makes this a standing requirement (`documents/agents/orchestrator-policy.md`,
canonical `SKILL.md` step 4b, `documents/rounds/README.md`) is drafted in `mvp-mocks.md` and
**parks**: the first-choice reviewer `0813` is unavailable (ollama weekly limit), and a protected change
may not land without that review.

The e2e mock in `ui/e2e/fixtures.ts` is an API-shape stub for the browser test, not a design mock, and
does not satisfy this gate.

## Acceptance

| #   | Criterion                                                                  | Met | Evidence                                                                                                                                          | Verdict |
| --- | -------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Migration constraints                                                      | yes | `0017_offering_counts`; drift test compares columns, indexes, FKs and check names for both tables                                                 | pass    |
| 2   | Append/correct semantics, every 422 case, currency/attachment/session      | yes | `tests/api/event-offering-counts.test.ts` (append, chained correction, second supersede, unknown/other-group target, all-zero, currency, session) | pass    |
| 3   | `asOf` kept, history readable, current derivation                          | yes | Chained-correction test: current = newest non-superseded by `asOf`, then `recordedAt`; write and read predicates agree                            | pass    |
| 4   | Bearer, `no-store`, no contact values, OpenAPI                             | yes | Route headers; OpenAPI documents 201/401/404/409/422; smoke hits the path                                                                         | pass    |
| 5   | Counted cash current-only, windowed, reporting currency; variance identity | yes | Summary SQL uses the same current predicate; API + smoke assert `countedMinor` and `varianceMinor = counted − (member paid + visitor paid)`       | pass    |
| 6   | `#/ussd/offerings` follows the headcount pattern                           | yes | Page, entry, history, quick-pick hidden for non-GHS, live total, gift/pledge/terms actions; e2e + axe both schemes                                | pass    |
| 7   | Landing counted/variance without changing gift/pledge semantics            | yes | Read-only cards and `Counted` columns; render and e2e tests                                                                                       | pass    |
| 8   | Tests fail before/pass after, both drivers, UI, e2e, smoke                 | yes | Above; pg parity through the existing app harness                                                                                                 | pass    |

## Deviations

- A cancelled event/session answers `409 event_not_active` (the phase text names `event_not_active`;
  contributions use `422 session_not_in_event` for a date outside the sessions).
- A count for a past session day requires an explicit `asOf`, matching headcounts.
- `TermsDialog` moved from `ui/src/pages/offerings/` to `ui/src/components/` at its second call site
  (§15).
- Offering selectors carry distinct accessible names (`Offering to count`, `Gift offering`,
  `Pledge offering`) after the e2e found three identically labelled comboboxes.

## Review

| Round | Seat                         | Verdict       | Notes                                                                                 |
| ----- | ---------------------------- | ------------- | ------------------------------------------------------------------------------------- |
| 1     | `cline-pass/…/mimo-v2.6-pro` | REWORK        | P1 correction-chain derivation; P2 EXPLAIN guard, drift blind spot, OpenAPI 409; nits |
| 2     | `cline-pass/…/mimo-v2.6-pro` | ACCEPT (both) | All findings fixed; no new P1/P2                                                      |

The first-choice reviewer `ollama-cloud/deepseek-v4-pro:0813` was unavailable both times (ollama
weekly usage limit, 2026-11-08); the fallback seat is the sanctioned substitute. The worker seat
`ollama-cloud/deepseek-v4.1-flash:1017` was likewise unavailable and `cline-pass` implemented.
