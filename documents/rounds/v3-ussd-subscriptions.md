# Welfare subscriptions (ticket 24c)

|        |                                                                                               |
| ------ | --------------------------------------------------------------------------------------------- |
| Status | OPEN                                                                                          |
| Tier   | 2 - Reviewed                                                                                  |
| Mode   | unattended (auto-accept recommendations)                                                      |
| Base   | `7fe7b2b`                                                                                     |
| Ticket | 24c                                                                                           |
| Spec   | `documents/specs/member-registrations-api.md`; `documents/specs/member-registrations-ussd.md` |

## Plan

Welfare becomes configured products with server-evaluated eligibility, an explicit payer and cover
period, recorded per-period payments, explicit household coverage, back-office claims, and the USSD
Welfare & Services surface. The membership card and verification timestamp are added as detail-only
member fields and are tested by eligibility. Legacy `life_insurance`/`credit_union` rows keep rendering.

Files:

- `src/db/migrations.ts` - migration `0015_welfare_products`: `subscription_products`,
  `subscription_payments`, `subscription_claims`, the subscription product/payer/period/audit columns,
  `members.membership_card_no`/`verified_at`, the partial card index and the trimmed-card check.
- `src/db/schema.ts`, `tests/db/schema-drift.test.ts` - the Drizzle mirror of every touched table and
  the member columns; the drift check now covers members, subscriptions, products, payments, claims and
  coverage.
- `src/domain/member-types.ts` - leaf member vocabulary shared by repository DTOs and schemas.
- `src/errors/domain-errors.ts`, `src/errors/problem.ts`, `src/errors/sqlstate.ts` - `invalid_amount`,
  `not_eligible`, `subscription_not_active`, `period_already_paid`, `not_covered`,
  `claim_not_pending`, `card_in_use`, and constraint-aware 23505 mapping.
- `src/schemas/subscription-products.ts`, `src/repos/subscription-products.ts`,
  `src/routes/subscription-products.ts` - product create/list/read/active-toggle with code, premium,
  period, payer, cover and eligibility validation, plus `isEligible`.
- `src/schemas/subscriptions.ts`, `src/repos/subscriptions.ts` - subscribe, renew, standalone coverage,
  payments, claims, the owned+inherited member read and the legacy member-detail projection.
- `src/routes/subscriptions.ts`, `src/routes/members.ts` - the renewal/payment/claim/coverage seams and
  the member subscription read; the member POST accepts both the legacy body and `productCode`.
- `src/repos/members.ts`, `src/schemas/members.ts` - `membershipCardNo` and `verified` on create/update,
  `verifiedAt` on the detail DTO only, and card uniqueness mapped to `409 card_in_use`.
- `src/ussd/machine.ts`, `src/ussd/services.ts`, `src/ussd/glossary.ts` - the 24c member menu and the
  Welfare list, product, dependents, confirm, done and My services states, backed by the new repos.
- `src/routes/ussd.ts`, `src/create-app.ts`, `src/openapi.ts` - session page size, composition and the
  generated contract.
- `scripts/smoke.mjs` - a product, subscription, renewal, claim decision, card/verification, then the
  USSD list -> subscribe -> My services journey.
- `tests/api/subscription-products.test.ts`, `subscriptions.test.ts`, `subscription-payments.test.ts`,
  `subscription-claims.test.ts`, `ussd-welfare.test.ts`, `members.test.ts`, `ussd.test.ts`,
  `ussd-attendance.test.ts`, `tests/unit/ussd-glossary.test.ts` - the external-behaviour coverage.

Acceptance criteria:

1. Product creation normalises the code, refuses a repeat and a non-positive premium, and enforces the
   household/individual dependent rules; `PUT` toggles `active` only.
2. Eligibility is evaluated server-side on every write path: tenure, card, verification, gender and age;
   an unknown `dob` fails an age rule.
3. The payer is resolved from `paymentMode` (`member`, `church`), and `either` requires an explicit
   back-office `paidBy`; the USSD list never offers `church` or `either`.
4. A member-paid period writes one `subscription_payments` row and advances cover; a church-paid period
   writes none and keeps `premiumMinor` null; renewal extends from `max(periodEnd, today)`.
5. A product row with `periodEnd` before today reads `expired`; an ended row reads `ended`; a legacy
   row without a period reads active unless ended.
6. Household subscribe and standalone coverage enforce the cap, an allowed existing relationship and an
   active dependent; a duplicate is `409 conflict` and a missing removal is `404 not_covered`.
7. Payments are idempotent by key, unique by reference, guarded by `period_already_paid`, and never
   anchor the period on `paidAt`.
8. Claims are back-office records: the claimant is the policyholder or actively covered, transitions are
   `pending -> approved/rejected` and `approved -> paid`, and the claimed total is approved + paid.
9. The member read returns owned and inherited rows with the exact DTO, the policyholder identity and the
   relationship label; legacy rows keep rendering with null product/payer/period fields.
10. The card is trimmed 1-32 characters and unique case-insensitively; `verified` sets or clears the
    timestamp; both are detail-only.
11. USSD Welfare lists only eligible member-payable products, subscribes with the resolved payer, asks a
    household product for dependents, and My services shows status, payer, period, claimed total,
    inherited labelling and paging. Anonymous sessions never see Welfare.
12. Every state stays inside the 16/60/182 glossary budgets and the declared `pageSize` rule.

## Verification

| Gate             | Command                                | Result                                                                       |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Typecheck        | `npm run typecheck`                    | pass                                                                         |
| Lint             | `npm run lint`                         | pass                                                                         |
| Tests            | `npm run test`                         | worker crash, see note below                                                 |
| Build            | `npm run build`                        | pass                                                                         |
| Format           | `npm run format:check`                 | pass                                                                         |
| Serialized tests | `npx vitest run --no-file-parallelism` | pass once - 37 files, 471 passed / 3 skipped; replay lost a worker, see note |
| Smoke            | `npm run smoke`                        | pass - 61 checks                                                             |
| UI types         | `npm --prefix ui run typecheck`        | pass                                                                         |

`npm run test` (parallel) repeatedly lost a worker to the known Windows/PGlite exit `3221226505`,
including in `members.test.ts` and `ussd.test.ts`. The same crash reproduces with the five new test
files excluded (31/32 files passed, one worker exit), so it is the pre-existing parallel-worker memory
condition, not a failing assertion. Some intermediate serialized runs also lost pre-existing workers
(`ussd-attendance.test.ts`, then `pledges.test.ts`/`members-unassigned.test.ts`); each affected file
passed alone. After the review fixes one serialized run was green (37 files, 471 passed / 3 skipped).
Two verification replays then lost a worker to the same exit (`ussd.test.ts`, then
`subscriptions.test.ts`); `subscriptions.test.ts` passed alone (18/18) and two isolated `ussd.test.ts`
runs reached 15 and 16 of 20 tests before the same worker exit. Recorded, not looped.

## Review

TBD - Tier 2 Standards + Spec review is the next gate.

## Acceptance

TBD - parent acceptance after the review gate.

## Spec review record

- `pro:0813` spec review ACCEPT on the 24c wire contract.

## Interpretations

- **Legacy POST retained.** `POST /v1/members/{memberNo}/subscriptions` accepts both the new
  `{ productCode, paidBy?, coveredMemberNos? }` body and the old `{ kind, scope, ... }` body, so the
  shipped legacy rows and tests keep working. A body with `productCode` takes the product path.
- **Services page size.** The reference Subscribe list pages three products. My services pages one row
  per screen (and still offers `0 More`): status, payer, period and claimed total plus an inherited
  policyholder identity cannot fit two rows at the maximum dynamic widths inside 182 characters. One row
  is within the channel's declared `pageSize.events` of three (and Nalo's two).
- **Relationship direction.** `allowedRelationships` is read from the policyholder to the covered
  member: `child` means the covered member is the policyholder's child. The stored edge is normalised
  to that direction, so a holder-declared `child` edge is allowed by a `child` rule while a
  covered-declared `child` edge normalises to `parent` and is not. `spouse`, `guardian` and `other` are
  direction-neutral. Inherited display still uses the covered-to-holder direction: a spouse renders
  Husband/Wife from the policyholder's gender, a child sees `Parent`, and other types keep their name.
- **`relationship` wire value.** The API returns the raw relationship type (`spouse`, `child`, ...) and
  the policyholder `{ memberNo, name, gender, age }`; the channel composes the display label. This keeps
  the UI free to render Husband/Wife itself.
- **Legacy audit fields.** `subscriptions.updated_by`/`updated_at` are nullable, but migration 0015
  backfills them from `created_by`/`created_at`; the read coalesces again so every row reports strings.
- **Payment idempotency.** An identical repeat compares the subscription, amount, currency, channel and
  a supplied reference; `paidAt` is informational and is not part of the comparison. A new payment on a
  lapsed subscription sets the current period to member-paid (`paidBy = member`, `premiumMinor` =
  amount); a church-paid renewal keeps `premiumMinor` null.
- **Error set.** `InvalidAmountError` (`422 invalid_amount`) was added alongside the six listed error
  classes because the spec requires that code for a non-positive product premium and payment amount.
- **Card uniqueness mapping.** Drizzle wraps the driver error, so `sqlConstraint` reads the constraint
  name through the cause; the member number and card indexes stay distinguishable in create.
- **Coverage on legacy rows.** A legacy household subscription still enforces household scope and an
  active member, but has no product cap or allowed-relationship list to apply; those are product rules.
- **Empty USSD states.** An empty Subscribe list renders `welfare.not_eligible` ("Not eligible") and an
  empty My services renders `welfare.no_services` ("No services" / "None"). No other static copy was
  invented.
- **Menu shape.** The member menu is 1 Offerings, 2 Activities, 3 Attendance, 4 Welfare, 5 Profile,
  6 Exit; the anonymous menu is unchanged (1 Register, 2 Offerings, 3 Activities, 4 Attendance,
  5 Exit). This keeps one top-level entry per domain and puts Welfare before Profile.
- **Month arithmetic.** A period month addition is a UTC calendar month, clamping a 31st to the target
  month's last day, so `2026-01-31 + 1 month` is `2026-02-28`.
- **No mock.** This round has no UI mock; the USSD screens are tested as exact frames and budgets.
- **Not committed or pushed.** The parent owns commit, push, PR and merge.
