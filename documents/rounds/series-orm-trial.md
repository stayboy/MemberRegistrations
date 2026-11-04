# Round — series ORM trial

|        |                                                                  |
| ------ | ---------------------------------------------------------------- |
| Status | CLOSED                                                           |
| Tier   | 2 — Reviewed                                                     |
| Base   | `c7e3622`                                                        |
| Spec   | `documents/specs/member-registrations-api.md` (Series ORM trial) |
| Ticket | `documents/tickets/v2-events-ui/03-series-orm-trial.md`          |

Provider: `ollama-cloud` (author `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Migrate the Series CRUD/transaction operations to Drizzle, keep the occurrence engine raw (`AGENTS.md`
§12), and publish the comparison. No public-contract change.

Scope (settled, Q55–Q59):

- Migrate `list`, `get`, `create`, `update`, `addSchedule`, `setException`, `removeException` and
  `load` to Drizzle; keep `resolveSeriesOccurrences`/`loadCalendar` raw.
- Publish code size, query count per operation, p95 latency on PGlite, and every SQL fragment kept raw.
- The trial publishes a recommendation; the owner decides adopt/revert, and ticket 04 records it.

Acceptance criteria:

1. The Series CRUD/transaction operations run through Drizzle on PGlite; the occurrence engine stays raw.
2. The public DTOs and contract are unchanged; all existing tests pass.
3. New tests cover concurrent version append and exception idempotency.
4. The round doc publishes the comparison (code size, query count, p95, raw fragments).
5. `npm run verify` and `npm run smoke` pass.
6. The migration is revertible in one commit (schema mirror only; migrations untouched).

## Comparison (PGlite, 50 runs)

| Operation       | Raw p95 ms | Drizzle p95 ms | Δ    |
| --------------- | ---------- | -------------- | ---- |
| list            | 1.34       | 2.41           | +80% |
| get             | 0.79       | 1.33           | +68% |
| update          | 1.48       | 2.90           | +96% |
| addSchedule     | 2.38       | 3.66           | +54% |
| setException    | 2.19       | 3.60           | +64% |
| removeException | 2.49       | 4.05           | +63% |
| occurrences     | 1.45       | 2.22           | +53% |
| create          | 1.55       | 2.95           | +90% |

Code size: `src/repos/series.ts` 273 → 290 lines (+17); the schema mirror adds ~64 lines in
`src/db/schema.ts`; the new test file is 106 lines.

Query count per operation (unchanged): `create` 5, `get`/`load` 3, `list` 1 + 3 per series, `update` 7,
`addSchedule` 7, `setException` 7, `removeException` 1, `occurrences` 6. The ORM emits the same round
trips.

Raw fragments kept: `loadCalendar`, `resolveSeriesOccurrences` and `isHeldOccurrence` remain raw SQL on
the `Db` port.

## Verification

| Gate  | Command                | Result                                                       |
| ----- | ---------------------- | ------------------------------------------------------------ |
| Skill | `npm run verify:skill` | pass                                                         |
| Fast  | `npm run verify:fast`  | pass — format, lint, typecheck, 106 passed / 3 skipped (109) |
| Build | `npm run verify`       | pass                                                         |
| Smoke | `npm run smoke`        | pass                                                         |

The 3 skipped tests are the pooled `pg` ministry cases (CI runs them).

## Review

Tier 2: the flash worker authored; the pro session reviewed.

**Standards — PASS.** The occurrence engine stays raw; `create` uses the transaction-scoped `orm`;
conflict mapping uses the shared `sqlState`; the public DTOs and routes are unchanged; the new tests
cover the required cases.

**Spec — PASS.** Criteria 1–6 are met by the diff and the gate numbers above.

The comparison is a finding, not a defect: on PGlite the ORM is ~1.5–1.9× slower and slightly larger,
with the same round trips. PGlite is in-process WASM, so the ORM's per-query overhead is a larger share
than it would be over a network to Postgres; the ticket specifies PGlite, so the numbers are the trial's
evidence.

## Acceptance

| #   | Criterion                                        | Met | Evidence                                                    |
| --- | ------------------------------------------------ | --- | ----------------------------------------------------------- |
| 1   | CRUD/transaction through Drizzle; occurrence raw | yes | `src/repos/series.ts`; `occurrences()` calls the raw engine |
| 2   | Contract unchanged; existing tests pass          | yes | `npm test` 106 passed; HTTP contract test                   |
| 3   | Concurrent append + exception idempotency tests  | yes | `tests/api/series.test.ts`                                  |
| 4   | Comparison published                             | yes | Comparison table                                            |
| 5   | `verify` and `smoke` pass                        | yes | Verification table                                          |
| 6   | Revertible in one commit                         | yes | schema mirror only; migrations untouched                    |

Verdict: **ACCEPTED** for the trial. The adopt/revert ruling is the owner's at ticket 04, with this
comparison as the evidence.

## Deviations

- The p95 numbers are PGlite-only, as the ticket requires; they over-weight the ORM's per-query overhead
  versus a networked Postgres.
- Recommendation: the ORM does not beat raw SQL on these metrics for the Series repository; the owner
  should weigh revert or a narrower adoption at ticket 04. The trial does not self-adopt.
