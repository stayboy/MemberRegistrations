# Round — series ORM gate

|        |                                                                     |
| ------ | ------------------------------------------------------------------- |
| Status | CLOSED                                                              |
| Tier   | 2 — Reviewed                                                        |
| Base   | `8dc1c1d`                                                           |
| Spec   | `documents/specs/member-registrations-api.md` (ORM gate outcome)    |
| Ticket | `documents/tickets/v2-events-ui/04-gate-outcome-and-drift-check.md` |

Provider: `ollama-cloud` (author `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Record the adopt/revert ruling from the Series trial and enforce it with two guards: a drift check
between the Drizzle schema and the SQL migrations, and the repository boundary.

Acceptance criteria (ticket 04):

1. The decision is recorded with its evidence and the rejected alternative.
2. A deliberate column mismatch fails the drift check; the committed schema passes it.
3. No ORM type appears in a route, Zod schema or OpenAPI output.
4. If reverted, Drizzle is gone and the test suite still passes (not applicable — adopted).
5. `npm run verify` and `npm run smoke` pass.

## Decision — adopted

Evidence: the Series trial measured the ORM slower on PGlite (p95 ~1.5–1.9× raw), slightly larger,
and with the same round trips (`documents/rounds/series-orm-trial.md`).

**Ruling: adopt Drizzle for CRUD repositories.** The measurement is PGlite-only — in-process WASM
over-weights the ORM's per-query overhead versus networked Postgres — and the absolute deltas are
sub-3 ms. The gate adds the two guards that make the adoption safe.

**Rejected alternative: revert Drizzle.** Rejected because it would remove the merged Ministries and
Series ORM on the strength of one in-process benchmark, and would discard the type safety and the
drift check. If a networked-Postgres benchmark later shows a material regression, this ruling is the
thing to reopen.

## Verification

| Gate  | Command                | Result                                                       |
| ----- | ---------------------- | ------------------------------------------------------------ |
| Skill | `npm run verify:skill` | pass                                                         |
| Fast  | `npm run verify:fast`  | pass — format, lint, typecheck, 109 passed / 3 skipped (112) |
| Build | `npm run verify`       | pass                                                         |
| Smoke | `npm run smoke`        | pass                                                         |

The 3 skipped tests are the pooled `pg` ministry cases (CI runs them).

## Review

Tier 2: the flash worker authored the guard tests; the pro session reviewed.

**Standards — PASS.** The drift test compares the Drizzle column name/nullability against
`information_schema.columns` on a migrated PGlite DB; the deliberate-mismatch test proves it fails; the
boundary test scans `src/routes`, `src/schemas` and `src/openapi.ts` for Drizzle imports and passes.

**Spec — PASS.** Criteria 1–3 and 5 are met by the diff and the gate numbers; criterion 4 is not
applicable under the adopted ruling.

## Acceptance

| #   | Criterion                                           | Met | Evidence                                |
| --- | --------------------------------------------------- | --- | --------------------------------------- |
| 1   | Decision + evidence + rejected alternative recorded | yes | this round doc; spec `ORM gate outcome` |
| 2   | Deliberate mismatch fails; committed schema passes  | yes | `tests/db/schema-drift.test.ts`         |
| 3   | No ORM type in a route, Zod schema or OpenAPI       | yes | `tests/db/orm-boundary.test.ts`         |
| 4   | Revert path (not applicable — adopted)              | n/a | adopted                                 |
| 5   | `verify` and `smoke` pass                           | yes | Verification table                      |

Verdict: **ACCEPTED**.

## Deviations

- **Unattended (owner instruction 2026-11-04).** This gate ran unattended with the owner's
  auto-recommendation authorization; the adopt ruling is the auto-recommendation, recorded here so the
  owner can reverse it with the evidence in front of them.
- The PGlite latency finding from the trial stands recorded; a networked benchmark is the natural
  follow-up if the adoption is ever questioned.
