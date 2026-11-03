# Round - drizzle-ministries

|        |                                                                        |
| ------ | ---------------------------------------------------------------------- |
| Status | CLOSED                                                                 |
| Tier   | 2                                                                      |
| Base   | `de00239`                                                              |
| Spec   | `documents/specs/member-registrations-api.md` (reference/Ministry)     |
| Ticket | `documents/tickets/v2-events-ui/02-drizzle-wiring-ministries-smoke.md` |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Wire Drizzle in beside the existing `Db` port as the CRUD repository client, with a schema mirror
and both drivers, then migrate only the Ministries repository. This is the smoke that precedes the
Series trial (ticket 03) and the adopt/revert gate (ticket 04).

Scope:

- `drizzle-orm` dependency; `src/db/schema.ts` (ministries table mirror) and `src/db/orm.ts`
  (engine-neutral `Orm` type).
- `DbClient` gains a read-only `orm` handle bound to the same connection (or transaction);
  `src/db/pglite.ts` and `src/db/pg.ts` construct it per client/transaction.
- `src/repos/ministries.ts` moves to Drizzle and takes a minimal `OrmClient` (`{ orm }`); SQLSTATE
  `23505` and `23503` map to the existing `ConflictError` through a shared `sqlState` helper. No
  route, Zod schema, OpenAPI or response-shape change.
- New repository tests: CRUD, duplicate code, foreign-key conflict and an ORM-in-transaction rollback
  on PGlite; the same CRUD/FK/transaction contract on the pooled `pg` driver.
- Hand-written migrations are untouched, so reverting Drizzle needs no schema change.

Acceptance criteria (from ticket 02):

1. Ministries CRUD runs through Drizzle on PGlite and on the pooled `pg` driver (Neon in production,
   Postgres in CI).
2. The existing tests pass unchanged; new tests cover duplicate-code and foreign-key conflicts mapped
   to the existing domain errors.
3. No route imports Drizzle directly; routes still parse and delegate to repositories.
4. Reverting Drizzle requires no schema change and leaves the test suite green.
5. `npm run verify` and `npm run smoke` pass.

Governance note: `AGENTS.md` section 12 says Drizzle is imported only in `src/repos/`. Ticket 02
explicitly requires the schema and both drivers, so this round amends section 12 with a clarifying
sentence (construction in `src/db/`, queries in `src/repos/`) and records it here per the
clarifying-edit rule.

## Verification

| Gate   | Command                | Result                                                                           |
| ------ | ---------------------- | -------------------------------------------------------------------------------- |
| Format | `npm run format:check` | pass                                                                             |
| Lint   | `npm run lint`         | pass                                                                             |
| Types  | `npm run typecheck`    | pass                                                                             |
| Tests  | `npm test`             | pass — 102 passed, 3 skipped (105)                                               |
| Build  | `npm run verify`       | pass                                                                             |
| Smoke  | `npm run smoke`        | pass — health, 401, presbyter, member, assignment, call, roster, report, OpenAPI |

The 3 skipped tests are the pooled `pg` cases (CRUD, foreign key, transaction). They run in CI, where
the `verify` job provisions `postgres:16` and sets `TEST_DATABASE_URL`. Locally they skip without a
scratch database — recorded, not implied.

## Review

Tier 2 re-review on the fixed seat (Q19): the flash worker authored the fixes and the pro session
reviewed the diff; the earlier fallback review's P1s were the input.

**Standards — PASS.** The P1s are resolved:

- Spec-first changelog: the spec now records ticket 02 as the smoke and keeps wider adoption gated by
  03–04 (`documents/specs/member-registrations-api.md` `## Changelog`).
- Transaction seam: `DbClient` carries `orm`, and both drivers bind it to the same connection or
  transaction; the PGlite and pooled-`pg` rollback tests prove it.
- SQLSTATE: one `sqlState` helper unwraps `.cause`; the repository maps `23505`/`23503` and
  `problem.ts` uses the same helper as a backstop.
- Driver parity: CI provisions Postgres and sets `TEST_DATABASE_URL`, so the pooled `pg` tests run.

**Spec — PASS.** Criteria 1–5 are met by the diff and the gate numbers above.

## Acceptance

| #   | Criterion                                                          | Met | Evidence                                                                            |
| --- | ------------------------------------------------------------------ | --- | ----------------------------------------------------------------------------------- |
| 1   | CRUD through Drizzle on PGlite and the pooled `pg` driver          | yes | `tests/api/ministries.test.ts` (both describes); `.github/workflows/ci.yml` service |
| 2   | Existing tests unchanged; duplicate-code + FK map to domain errors | yes | `npm test` 102 passed; `ConflictError` assertions                                   |
| 3   | No route imports Drizzle                                           | yes | imports only in `src/db/` and `src/repos/ministries.ts`                             |
| 4   | Revert needs no schema change and the suite stays green            | yes | `src/db/schema.ts` mirrors `0001_init`; migrations untouched                        |
| 5   | `npm run verify` and `npm run smoke` pass                          | yes | Verification table                                                                  |

Verdict: **ACCEPTED**.

## Deviations

- The pooled `pg` tests skip locally without `TEST_DATABASE_URL`; CI runs them against `postgres:16`.
- Clarifying edits only: the spec changelog and the ticket's "duplicate-code"/"pooled `pg` driver"
  wording; no behaviour change.
- The flash worker implemented the change; the pro session reviewed; the parent wrote this round doc.
