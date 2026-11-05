# Round - V3 phase 1: offerings, versions and attachment (ticket 20)

|        |                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| Status | OPEN                                                                                                               |
| Tier   | 2 - Reviewed                                                                                                       |
| Mode   | `unattended (auto-accept recommendations)`                                                                         |
| Base   | `aed92b3`                                                                                                          |
| Spec   | `member-registrations-events-offerings.md` (phase 1, amended 2026-11-05); `member-registrations-api.md` reconciled |
| Ticket | 20                                                                                                                 |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

V3 opens with the offering domain: a definition with immutable versioned terms, event and series
attachment with detach-by-ending, append-only skip/opt-in exceptions, the effective-expiry predicate,
and the event aggregate that carries each attached offering's resolved name, expiry, terms and stats.

The spec amendment settled six ambiguities before any code: terms publish through `POST
/v1/offerings/{id}/terms` with a required `baseVersion` (the `PUT` toggles only `active`); series
attach/detach and list routes exist beside the event ones; exception routes nest under the attachment
and key to the attachment row; the effective expiry is the attachment date (events only, on or after
the event end), then the terms date, then the event end; the API resolves the display name; and the
event aggregate nests the current `terms` and adds `expired`. It also closes the events/offerings DTO
debt: the event DTO matches the implementation, attendance rows are `present`-only with `id` and
`sessionTime`, `OfferingTerms.name` is nullable, and contributions/pledges name `eventId`.

The contribution rejection after expiry lands in ticket 21; ticket 20 ships the predicate and the
`expired` flag. The offerings UI is ticket 23.

## Spec review

`deepseek-v4-pro:0813`, separate session. Two passes returned CHANGES REQUIRED and the third ACCEPTED:
the first found the API spec contradicting the new routes and DTOs and the ticket still claiming the
expiry rejection; the second found the API spec's data-model table and type blocks still on the old
shapes. Both were reconciled before the worker started. A later pass, after code review, closed the
NFR-3 audit gap: a terms version records its actor, timestamp and reason (`created_by`, `created_at`,
a required publish `reason`, null on version 1), and the active-flag toggle records `updated_by`.

Record: "Phase-1 offering definitions (ticket 20) are approved — versioning with `baseVersion` and a
required `reason`, name resolution, attachment/detach/re-attach, effective-expiry precedence,
append-only exceptions, the event aggregate, and the full audit trail on terms are all unambiguous and
testable, and the two specs' DTOs, Data Models, routes and error codes are in full agreement, so the
implementer can build without further guessing."

## Verification

| Gate      | Command                                              | Result                                    |
| --------- | ---------------------------------------------------- | ----------------------------------------- |
| Typecheck | `npm run typecheck`, `npm --prefix ui run typecheck` | pass                                      |
| Lint      | `npm run lint`, `npm --prefix ui run lint`           | pass                                      |
| Build     | `npm run build`, `npm --prefix ui run build`         | pass                                      |
| Format    | `npm run format:check`                               | pass                                      |
| API tests | `npx vitest run --no-file-parallelism`               | pass - 19 files, 249 passed / 3 skipped   |
| Smoke     | `npm run smoke`                                      | pass - 14 checks, new migration exercised |

Two `npm run test` runs crashed a Vitest worker with exit code `3221226505` (once in
`offerings.test.ts`, once in `members.test.ts`); both reran green, and both `verify` and the serialized
run were green. Recorded as the known Windows worker-fork flake, not a test failure.

## Review

`deepseek-v4-pro:0813`, read-only, uncommitted diff against `aed92b3`.

- **Verdict: ACCEPT**, with two P2s and one nit.
- **P2 applied:** `PUT /v1/offerings/{id}` now takes `actorOf(req)` and records `updated_at`/`updated_by`,
  so the OpenAPI's required `X-Actor-Id` and FR-19 are honoured.
- **P2 applied:** the series-detach route gained its missing test (204, the row kept with `detached_on`,
  gone from the list, a second detach 404).
- **Nit applied:** terms publish no longer sends a `Location` header that pointed at a nonexistent GET.
- **Spec amendment after review:** the terms audit trail (NFR-3) was missing from the data model and
  DTO; it now carries `reason`/`created_at`/`created_by`, and the re-review returned ACCEPT.
- Left as a nit: `reason` is enforced in Zod rather than a database check, consistent with how term
  immutability is enforced.

## Acceptance

| #   | Criterion                                                                                           | Met | Evidence                                                |
| --- | --------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------- |
| 1   | An offering carries kind, currency, target, default amount and available-until; terms are versioned | yes | `src/repos/offerings.ts`, `tests/api/offerings.test.ts` |
| 2   | Two or more offerings attach to one event; detaching ends the attachment and keeps history          | yes | attach/detach routes and tests                          |
| 3   | A series attachment accepts a skip or opt-in on a specific date                                     | yes | exception routes and tests                              |
| 4   | The expiry predicate is exposed and tested; the rejection lands in ticket 21                        | yes | `effectiveAvailableUntil`, `expired`                    |
| 5   | An offering with no custom name displays as the event name plus kind                                | yes | `eventOfferingsFor` resolution                          |
| 6   | `npm run verify` and `npm run smoke` pass                                                           | yes | gates above                                             |

Verdict: **ACCEPTED**.

## Deviations

- **Raw SQL, not Drizzle.** The offerings repository is join- and aggregate-heavy (current terms,
  effective attachments, exception history), which sits outside the CRUD-only ORM scope in AGENTS §12;
  it follows `src/repos/events.ts`.
- **Expiry enforcement is split.** Ticket 20 ships the predicate, the resolved date and the `expired`
  flag; the contribution route that rejects a new gift is ticket 21, as the ticket now states.
- **No Drizzle mirror for the new tables.** The drift test covers four tables only; the embedded SQL
  remains the source of truth.
- **`stats.attachedEvents` counts event attachments only**, so a series-only attachment reports `0`;
  the spec now says so explicitly.
- **The attachment-list DTO** (`{ items: [{ attachmentId, offeringId, availableUntil, terms }] }`) is
  not pinned by the spec; it returns the attachment's own date, while the event aggregate carries the
  effective date.
