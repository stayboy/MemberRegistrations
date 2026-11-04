# Round — contacts, subscriptions and shepherding batch

|        |                                                                                 |
| ------ | ------------------------------------------------------------------------------- |
| Status | CLOSED                                                                          |
| Tier   | 2 — Reviewed                                                                    |
| Base   | `afdbbe0`                                                                       |
| Spec   | `documents/specs/member-registrations-api.md` (contacts/subs batch)             |
| Ticket | `documents/tickets/v2-events-ui/06-contacts-subscriptions-shepherding-batch.md` |

Provider: `ollama-cloud` (author `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Move the contact, coverage, subscription and append-only shepherding-call writes to Drizzle; keep the
report/aggregate queries and the complex union/array reads raw. No contract change.

Scope (settled, Q65):

- **In scope:** the contact writes (`insertContact`, `addContact`, `updateContact`, `removeContact`,
  `linkContact`, `unlinkContact`); coverage (`insertCoverage`, `addCoverage`, `removeCoverage`);
  subscriptions (`addSubscription`, `endSubscription`); the shepherding call insert and list
  (`logCall`, `listCalls`).
- **Raw:** `loadContacts` (the union read), `subscriptionsFor` (the array aggregate), the member `list`,
  the attendance/ministries/relationships loaders, `loadCallsForMember` (joins the unmirrored
  assignments table), the assignment lifecycle (`assign`, `endAssignment`), and the roster/report/
  officer aggregates.
- **Contract:** preserved. The summary keeps its contact list (Q65); no response shape changes.

Acceptance criteria (ticket 06, corrected per Q65):

1. Contact search behaviour is unchanged; the existing summary contract (including its contact list)
   is preserved.
2. Coverage overlap and subscription rules are unchanged.
3. Shepherding calls remain append-only: no update or delete route appears.
4. Shepherding report totals are unchanged on the existing fixture.
5. `npm run verify` and `npm run smoke` pass.

## Verification

| Gate  | Command                | Result                                                       |
| ----- | ---------------------- | ------------------------------------------------------------ |
| Skill | `npm run verify:skill` | pass                                                         |
| Fast  | `npm run verify:fast`  | pass — format, lint, typecheck, 121 passed / 3 skipped (124) |
| Build | `npm run verify`       | pass                                                         |
| Smoke | `npm run smoke`        | pass                                                         |

The 3 skipped tests are the pooled `pg` ministry cases (CI runs them).

## Review

Tier 2: the flash worker authored; the pro session reviewed.

**Standards — PASS.** Only the written operations use Drizzle; `loadContacts`, `subscriptionsFor`,
`loadCallsForMember`, the member `list`, the assignment lifecycle and the aggregates stay raw.
Conflict mapping uses the shared `sqlState`. The append-only call path has no update/delete route; the
test asserts a `404 route_not_found`.

**Spec — PASS.** Criteria 1–5 are met by the diff and the gate numbers. The ticket's original
"no contact values in list responses" wording was corrected under Q65 because the summary contract has
always carried the contact list; this round preserves it.

## Acceptance

| #   | Criterion                                              | Met | Evidence                                                         |
| --- | ------------------------------------------------------ | --- | ---------------------------------------------------------------- |
| 1   | Contact search unchanged; summary contract preserved   | yes | `tests/api/contacts-subs-shepherding.test.ts`; unchanged summary |
| 2   | Coverage overlap and subscription rules unchanged      | yes | overlap 409, coverage add/remove, end-once tests                 |
| 3   | Shepherding calls append-only (no update/delete route) | yes | 404 `route_not_found` assertions                                 |
| 4   | Shepherding report totals unchanged                    | yes | report/roster stay raw; existing tests pass                      |
| 5   | `verify` and `smoke` pass                              | yes | Verification table                                               |

Verdict: **ACCEPTED**.

## Deviations

- **Unattended (owner instruction 2026-11-04).** This round ran unattended under the owner's
  auto-recommendation and auto-merge authorization.
- The complex reads (`loadContacts` union, `subscriptionsFor` array aggregate, `loadCallsForMember`
  join) stay raw and are recorded as such; this round migrates the write paths and the simple call
  reads, which is where the Drizzle boundary is exercised.
