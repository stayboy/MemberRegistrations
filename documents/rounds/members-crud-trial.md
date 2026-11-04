# Round — members CRUD trial

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| Status | CLOSED                                                             |
| Tier   | 2 — Reviewed                                                       |
| Base   | `dae0628`                                                          |
| Spec   | `documents/specs/member-registrations-api.md` (Members CRUD trial) |
| Ticket | `documents/tickets/v2-events-ui/05-members-crud-batch.md`          |

Provider: `ollama-cloud` (author `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Move the `members`-table row operations to Drizzle and keep everything that crosses into another
entity raw. No public-contract change.

Scope (settled, Q60–Q64):

- Migrate `create` (row insert), the reads (`findRow`/`findAnyRow`/`findById`), `update` (the
  version-gated update), `archive`/`restore` (the member row update), and `purge` (the PII nulling).
- Keep `list` raw (the cross-entity name/contact search), every related-table read and write raw
  (contacts, subscriptions, coverage, ministries, relationships, attendance, shepherding), the
  create sub-inserts raw, and the purge related-deletes raw.
- Keep the attendance counts, `lastAttended` and the denominator queries raw.
- No benchmark; behavioural identity is the acceptance.

Acceptance criteria (ticket 05):

1. Member CRUD behaves identically, including the PII-erasure exception on purge.
2. Attendance counts, `lastAttended` and the denominator queries remain raw and return the same numbers.
3. Duplicate member numbers and contact conflicts still return the existing problem+json codes.
4. Attendance and shepherding tests pass without edits.
5. `npm run verify` and `npm run smoke` pass.

## Verification

| Gate  | Command                | Result                                                       |
| ----- | ---------------------- | ------------------------------------------------------------ |
| Skill | `npm run verify:skill` | pass                                                         |
| Fast  | `npm run verify:fast`  | pass — format, lint, typecheck, 114 passed / 3 skipped (117) |
| Build | `npm run verify`       | pass                                                         |
| Smoke | `npm run smoke`        | pass                                                         |

The 3 skipped tests are the pooled `pg` ministry cases (CI runs them).

## Review

Tier 2: the flash worker authored; the pro session reviewed.

**Standards — PASS.** Only the row operations use Drizzle; `list`, the related loaders, the create
sub-inserts and the purge deletes stay raw. Conflict mapping uses the shared `sqlState`. The ETag gate
is preserved (`version = version + 1 where version = $x returning id`). The schema mirror includes
`is_presbyter` (the ticket's block omitted it; `0002` adds the column, so the mirror is honest).

**Spec — PASS.** Criteria 1–5 are met by the diff and the gate numbers.

## Acceptance

| #   | Criterion                                                       | Met | Evidence                                                 |
| --- | --------------------------------------------------------------- | --- | -------------------------------------------------------- |
| 1   | Member CRUD identical, including the purge exception            | yes | `tests/api/members-crud.test.ts`; existing members tests |
| 2   | Attendance counts / lastAttended / denominator stay raw         | yes | `attendanceFor` and `summariseAttendance` untouched      |
| 3   | Duplicate member numbers and contact conflicts keep their codes | yes | 409 conflict tests; `sqlState` mapping                   |
| 4   | Attendance and shepherding tests pass without edits             | yes | no existing test file edited; 114 passed                 |
| 5   | `verify` and `smoke` pass                                       | yes | Verification table                                       |

Verdict: **ACCEPTED**.

## Deviations

- **Unattended (owner instruction 2026-11-04).** This round ran unattended under the owner's
  auto-recommendation and auto-merge authorization.
- `list` stays raw until ticket 06 (its search spans `member_contacts`), recorded in the spec.
- The `members` schema mirror added `is_presbyter`, which the ticket's schema block omitted but the
  `0002` migration and the repository require.
