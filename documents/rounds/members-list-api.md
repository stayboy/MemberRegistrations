# Round — members list API

|         |                                                                |
| ------- | -------------------------------------------------------------- |
| Status  | CLOSED                                                         |
| Tier    | 2 — Reviewed                                                   |
| Base    | `96e6077`                                                      |
| Spec    | `documents/specs/member-registrations-api.md` (Member summary) |
| Workers | `single`                                                       |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 13a: the list contract the members grid needs.

- **`MemberSummary`** returns `contactCount` (never contact values) and `ministries`; the detail keeps
  `contacts`.
- **`status=active|archived`**, default active; purged members are never returned;
  `includeArchived=true` is a deprecated active + archived alias.
- **`include=attendance&seriesId=`**: one page-level aggregate (`seriesId`, `seriesName`, `attended`,
  `expected`, `remaining`, `status`, `lastAttendedOn`).
- **`include=subscriptions`**: one policyholder query and one coverage query, returning `id`, `kind`,
  `scope`, `status`, `role`, `policyholderMemberNo` and `coveredCount`.

Acceptance criteria:

1. No contact value in the list; `contactCount` matches the detail's contact list.
2. Status filters and purged exclusion; the `includeArchived` alias still works.
3. The attendance aggregate is correct for different `joinedOn` windows and is one page-level query.
4. Subscription roles and `coveredCount` are correct.
5. `verify` and `smoke` pass.

## Verification

| Gate              | Command                                                  | Result                                        |
| ----------------- | -------------------------------------------------------- | --------------------------------------------- |
| Protected guard   | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                                |
| Format/lint/types | `npm run format:check` / `lint` / `typecheck`            | pass                                          |
| Tests             | `npx vitest run --no-file-parallelism`                   | pass — 17 files, 195 passed / 3 skipped (198) |
| Build             | `npm run build`                                          | pass                                          |
| Smoke             | `npm run smoke`                                          | pass — 9/9                                    |

## Review

Independent Tier 2 review on `deepseek-v4-pro:0813`: **Standards PASS**, **Spec PASS**, no P1. Three
low-severity findings fixed before acceptance:

- The attendance aggregate now loads the calendar once (`resolveCalendarOccurrences`) instead of twice.
- The detail and list now use the same `joinedOn ?? createdAt` window rule.
- The UI spec's stale `status=…|all` line is reconciled to `active|archived`.

## Acceptance

| #   | Criterion                                            | Met | Evidence                          |
| --- | ---------------------------------------------------- | --- | --------------------------------- |
| 1   | No contact values; `contactCount` matches the detail | yes | summary/detail tests              |
| 2   | Status filters, purged exclusion, alias              | yes | members-crud tests                |
| 3   | Attendance aggregate correct and constant-query      | yes | attendance test; query-count test |
| 4   | Subscription roles and `coveredCount`                | yes | contacts/subs tests               |
| 5   | `verify` and `smoke` pass                            | yes | 195 passed / 3 skipped; smoke 9/9 |

Verdict: **ACCEPTED**.

## Deviations

- `status` supports `active|archived` only; the UI spec's `all` option is removed (use
  `includeArchived=true` for the legacy active + archived set).
