# Round — events list endpoint

|        |                                                            |
| ------ | ---------------------------------------------------------- |
| Status | CLOSED                                                     |
| Tier   | 2 — Reviewed                                               |
| Base   | `c3623ae`                                                  |
| Spec   | `documents/specs/member-registrations-api.md` (Events)     |
| Ticket | `documents/tickets/v2-events-ui/08-event-list-endpoint.md` |

Provider: `ollama-cloud` (author `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Add `GET /v1/events`: a date-window list of standalone and series-generated events, with the spec's
`Event` shape, server-derived status, per-session attendance counts, and the zeroed offering summary.

Decisions (Q66–Q70):

- Return the full `Event`/`EventSession` shape; `offerings: []` and `stats` zeroed until they land.
- Status derived in UTC: stored `draft`/`cancelled`/`archived` preserved; else `held`/`scheduled` from
  the dates.
- Per session: `present` (attendance rows), `importedRows` (`source='import'`), `source`; `expected` is
  `0` (ticket 10 owns it).
- Filters `from`/`to`/`seriesId`/`ministry`/`venueType`, `limit`/`offset`, stable `(start_date, id)`.
- New `src/repos/events.ts`, `src/schemas/events.ts`, `src/routes/events.ts`; one page query with a
  lateral aggregate, no N+1; `eventNo` nullable for a series-minted instance until ticket 11.

Acceptance criteria (ticket 08):

1. The list returns held, upcoming and cancelled events with server-derived status.
2. Filters cover `from`, `to`, `seriesId`, `ministry` and `venueType`; pagination is stable.
3. `venueType` is the enum; an invalid value is rejected (the filter → 422; the write is ticket 09).
4. A page of events uses one query, not one query per event.
5. `npm run verify` and `npm run smoke` pass.

## Verification

| Gate  | Command                | Result                                                       |
| ----- | ---------------------- | ------------------------------------------------------------ |
| Skill | `npm run verify:skill` | pass                                                         |
| Fast  | `npm run verify:fast`  | pass — format, lint, typecheck, 133 passed / 3 skipped (136) |
| Build | `npm run verify`       | pass                                                         |
| Smoke | `npm run smoke`        | pass                                                         |

The 3 skipped tests are the pooled `pg` ministry cases (CI runs them).

## Review

Independent Tier-2 review on `ollama-cloud/deepseek-v4-pro:0813` (Standards + Spec).

**First pass — Standards: FINDINGS (1 P1, 1 P2); Spec: FINDINGS.**

- **P1** — the code/schema/test use `eventNo: string | null` for series-minted instances, but the spec's
  `Event` interface still said `eventNo: string`. Resolved: the spec interface, the Data Models row and
  the changelog now state the nullable-until-ticket-11 window; the domain prose was also aligned.
- **P2** — the derived-status test claimed "archived" without seeding it. Resolved: an archived event is
  seeded and asserted.

**Re-check — Standards: PASS; Spec: PASS.** Both findings confirmed fixed; one minor spec-internal prose
note was raised and closed (the domain record now marks `eventNo?`).

The reviewer also confirmed: single query + lateral aggregate (no N+1), additive OpenAPI, and no
existing endpoint or response changed.

## Acceptance

| #   | Criterion                                          | Met | Evidence                                                                             |
| --- | -------------------------------------------------- | --- | ------------------------------------------------------------------------------------ |
| 1   | Held/upcoming/cancelled with server-derived status | yes | `deriveStatus`; `tests/api/events.test.ts` (draft/cancelled/archived/held/scheduled) |
| 2   | Filters + stable pagination                        | yes | events tests (window, seriesId, ministry, limit/offset)                              |
| 3   | `venueType` enum; invalid rejected                 | yes | filter `422`; write validation is ticket 09                                          |
| 4   | One page query, no N+1                             | yes | `LIST_SQL` page CTE + lateral aggregate                                              |
| 5   | `verify` and `smoke` pass                          | yes | Verification table                                                                   |

Verdict: **ACCEPTED**.

## Deviations

- **Unattended (owner instruction 2026-11-04).** Author split restored: flash worker implements, pro
  reviews.
- `expected` is `0` and offerings/stats are zeroed placeholders (tickets 10 and 20).
- The `venueType` _write_ rejection belongs to ticket 09; this round rejects an invalid filter value.
