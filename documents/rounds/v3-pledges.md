# Round - V3 phase 3: pledges and reminders (ticket 22)

|         |                                                                                     |
| ------- | ----------------------------------------------------------------------------------- |
| Status  | OPEN                                                                                |
| Tier    | 2 - Reviewed                                                                        |
| Mode    | `attended`                                                                          |
| Base    | `d3f3356`                                                                           |
| Spec    | `member-registrations-events-offerings.md` (phase 3); `member-registrations-api.md` |
| Ticket  | 22                                                                                  |
| Workers | `single`                                                                            |

## Plan

Ticket 22 records a pledge against an existing offering, resolves exactly one follow-up officer,
appends honor/dishonor/reassign transitions, and writes reminder records with a pledge/date/channel
uniqueness rule. A pledge is a payment mode, never an offering kind, so migration `0012_pledges`
reclassifies any pre-existing `offering_terms.kind = 'pledge'` row to `other` before removing the
value from the check.

Scope:

- `src/db/migrations.ts` - `pledges`, `pledge_events`, `reminders`, the `offering_terms.kind` check
  narrowed to `freewill, tithe, building, missions, other`.
- `src/db/migrate.ts` - a `logged` pre-statement hook so the reclassification count is reported before
  the schema change, in the same transaction.
- `src/schemas/pledges.ts` - create/list/DTO/event/reminder/transition schemas.
- `src/repos/pledges.ts` - idempotent create, officer resolution, expiry date gate, transitions,
  reminder rules and cursor list.
- `src/routes/pledges.ts` - the `/v1/pledges` routes, mounted at `/v1/pledges`.
- `src/errors/domain-errors.ts` - `officer_required`, `invalid_expected_date`,
  `invalid_reminder_date`, `pledge_already_terminal`.
- `src/openapi.ts` - pledge paths and schemas.
- `src/schemas/offerings.ts`, `src/repos/offerings.ts`, `ui/src/api/events.ts` - remove the `pledge`
  kind.
- `tests/api/pledges.test.ts` - 29 API tests.
- `scripts/smoke.mjs` - create, remind and honor a pledge.

Acceptance criteria:

1. A pledge resolves the member's active shepherd, otherwise a supplied active presbyter with a
   reason, otherwise `422 officer_required`.
2. An officer can be reassigned with a reason; `pledge_events` keeps both officers.
3. Honor appends `honored`; dishonor requires a reason and appends `dishonored`; a terminal pledge is
   `409 pledge_already_terminal`.
4. A pending pledge survives offering expiry and can still be honored.
5. Creation writes three `sms` reminders; a past-dated auto reminder is `cancelled`, the others
   `pending`; manual duplicate or past-dated reminders are rejected.
6. The list supports status/member/officer/date filters, derives `overdue`, pages by cursor and sends
   `no-store`.
7. `pledge` is no longer an offering kind in the schema or the database check.

## Spec review

Two separate `deepseek-v4-pro:0813` reviews, both ACCEPT.

- Phase-3 pledge spec (2026-11-05): the pledge is a payment mode on an existing offering, never a
  kind; create/read/list/transition contracts, officer resolution, expiry-as-of the pledge date,
  idempotency, DTOs, the three data-model rows and the `officer_required` /
  `pledge_already_terminal` codes are consistent between both specs. ACCEPT.
- Reminder/payer clarification (2026-11-05): the three auto-created reminders are `pending`, except
  one dated before today (UTC) at creation, which is written `cancelled`; a manually scheduled past
  date is `422 invalid_reminder_date`. The welfare payer clarification in the same commit does not
  change this contract. ACCEPT.

## Verification

| Gate      | Command                                    | Result                                            |
| --------- | ------------------------------------------ | ------------------------------------------------- |
| Typecheck | `npm run typecheck`                        | pass                                              |
| UI types  | `npm --prefix ui run typecheck`            | pass                                              |
| Lint      | `npm run lint`                             | pass                                              |
| Format    | `npm run format:check`                     | pass                                              |
| API tests | `npm run test`                             | pass on re-run - 23 files, 318 passed / 3 skipped |
| API tests | `npx vitest run --no-file-parallelism`     | pass - 23 files, 318 passed / 3 skipped           |
| Build     | `npm run build`                            | pass                                              |
| Smoke     | `npm run smoke`                            | pass - 21 checks, migration 0012 exercised        |
| New tests | `npx vitest run tests/api/pledges.test.ts` | pass - 29 tests                                   |

The first `npm run test` had one `beforeAll` hook timeout in `tests/api/members-crud.test.ts`
(20 s, no assertion failure) while 22 files ran in parallel; the serial run and an immediate re-run
were both green. Recorded as the known local parallel timeout, not a code failure.

## Review

Tier 2 Standards + Spec review by `deepseek-v4-pro:0813`: **ACCEPT**, no P1. One P2 was fixed before
commit: `pledges` lacked a `(created_at desc, id desc)` cursor index for the unfiltered/status-only
list, unlike `contributions`; migration 0012 now adds `pledges_cursor`. Two non-blocking nits remain
(a redundant `assertDate` in the route after the schema parse, and a manual past-date reminder on a
missing pledge returning `422` before `404`; the spec does not order them).

## Acceptance

Accepted by the parent on 2026-11-05 after the Tier 2 review. Every criterion in the plan is met:
officer resolution and reassignment history, terminal transitions, honor after expiry, the three
reminders with the past-dated `cancelled` rule, the filtered/derived-overdue cursor list with
`no-store`, and the removal of `pledge` from the offering kind. Verification is the serialized API
suite, the build and the smoke run; no migration was skipped.

| Criterion                                                  | Result |
| ---------------------------------------------------------- | ------ |
| Shepherd → supplied presbyter → `422 officer_required`     | pass   |
| Reassign keeps both officers in `pledge_events`            | pass   |
| Honor/dishonor append-only; terminal `409`                 | pass   |
| Pending pledge honored after expiry                        | pass   |
| Three reminders; past-dated `cancelled`; manual past `422` | pass   |
| Filters, derived `overdue`, cursor, `no-store`             | pass   |
| `pledge` gone from schema, labels, UI union and DB check   | pass   |

## Deviations

- **Smoke order.** The ticket lists create, honor, then add a reminder, but a terminal pledge rejects
  reminders by contract (`pledge_already_terminal`). The smoke creates the pledge, adds the reminder,
  then honors it, exercising all three.
- **Migration count logging.** Embedded SQL cannot `console.log`, so `migrate()` gained an optional
  `logged` pre-statement list executed before the migration SQL in the same transaction. It reports
  the reclassified row count outside `NODE_ENV=test`; the update uses a CTE so the count is the
  affected rows.
- **Officer reason.** The Zod refine rejects `officerReason` without a supplied officer; the repository
  additionally rejects a supplied officer without a reason, both as `422 validation_error`.
- **Reminder list order.** Newest first is interpreted as `scheduled_for desc, id desc`.
- **Not committed or pushed.** The working branch is `feat/v3-pledges`; the owner owns commit, push,
  PR and merge.
