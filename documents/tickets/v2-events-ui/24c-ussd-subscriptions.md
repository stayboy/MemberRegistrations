# 24c: USSD welfare subscriptions and claims

**Tier:** 2

**What to build:** Welfare **products** with eligibility rules, the member card and verification fields,
member-paid subscriptions and per-period payments, church-paid policies started by the back office,
inherited cover, claims as records, and the USSD Welfare & Services and My Profile subscription surface.

**Blocked by:** 24a, 24b. Migration **0015** (`subscription_products`, the subscription product/payer/
period columns, `subscription_payments`, `subscription_claims`, `members.membership_card_no` and
`members.verified_at`) and the bearer seams for product management, subscription/renewal and claims are
authorised for this round by the owner (2026-11-05).

**Status:** ready-for-agent

- [ ] A product records code, name, description, premium, currency, active flag, eligibility
      (`min_membership_days`, `requires_card`, `requires_verified`, `gender`, `min_age`, `max_age`),
      payer (`member`/`church`/`either`), period (1/2/3/6/12 months), cover (`individual`/`household`),
      `max_dependents` and `allowed_relationships`.
- [ ] Eligibility is evaluated server-side; an ineligible product is hidden from USSD, never refused
      after entry.
- [ ] The Subscribe list contains only products whose `paymentMode` is `member`; a self-subscription
      resolves `paid_by` to `member` automatically. A `church`-paid plan is started or renewed by the back
      office and appears in "My services" as "Paid by the church" with no payment. A product priced
      `either` is never offered for self-subscription.
- [ ] A member-paid period writes one `subscription_payments` row and advances `periodEnd`; an unpaid
      period leaves the subscription expired at `periodEnd` and USSD shows "Expired".
- [ ] A household product asks "Cover dependents? 1 Yes 2 No", lists the eligible dependents up to the
      cap, and writes explicit `subscription_coverage` rows; the relationship is read from the policyholder
      to the covered member (a covered-declared `child` normalises to `parent` from the policyholder), and
      a disallowed relationship, a non-active dependent or one beyond the cap is `422 validation_error`.
- [ ] Inherited cover appears read-only with `source: 'inherited'`, the policyholder's
      `{ memberNo, name, gender, age }` and the relationship label (spouse renders Husband/Wife by
      gender), e.g. `Life Cover (Husband · Solomon, Male, 32y)`.
- [ ] `members.membership_card_no` is trimmed, 1–32 characters and unique case-insensitively when
      present (partial unique index); `members.verified_at` is null or an officer-set timestamp with no
      expiry, and re-verification refreshes it. Card and verification are independent, and both fields
      are on `MemberDetail` only.
- [ ] Claims are back-office records (`subscription_claims`) with amount, reason, status, recorded by
      and decided by; "Total claimed" is the approved-plus-paid sum. There is no payout rail and no
      member self-service claim entry.
- [ ] Tests cover eligibility, payer resolution, period advance/expiry, household caps and
      relationships, inherited labelling, claims totals and the exact USSD screens.
- [ ] (addition) **Product routes**: `GET/POST /v1/subscription-products` and
      `GET/PUT /v1/subscription-products/{code}`; `code` unique case-insensitively, `premiumMinor > 0`,
      `periodMonths ∈ {1,2,3,6,12}`, `paymentMode`, `covers`, `maxDependents`, `allowedRelationships`;
      `PUT` sets `active` only.
- [ ] (addition) **Subscribe/renew**: `POST /v1/members/{memberNo}/subscriptions` resolves `paidBy`
      server-side (member→member, church→church, either→required), evaluates eligibility first and
      refuses `422 not_eligible`; `POST /v1/subscriptions/{id}/renew` extends from
      `max(periodEnd, today)`.
- [ ] (addition) **Payments**: `GET/POST /v1/subscriptions/{id}/payments`, idempotent by
      `idempotencyKey` (identical repeat `200`, different payload `409 idempotency_conflict`), one row
      per paid period (`409 period_already_paid` when already covered); premiums are recorded, not
      transacted.
- [ ] (addition) **Claims**: `GET/POST /v1/subscriptions/{id}/claims` and `POST …/{claimId}/decide`;
      claimant is the policyholder or an actively covered member (`404 not_covered`); transitions
      `pending → approved/rejected`, `approved → paid`, else `409 claim_not_pending`; total claimed =
      approved + paid.
- [ ] (addition) **Card/verification**: `membershipCardNo` trimmed 1–32, unique case-insensitively
      (`409 card_in_use`), clear-then-set reissue; `verified: boolean` sets/clears `verifiedAt`; both
      detail-only.
- [ ] (addition) **Legacy rows**: `life_insurance`/`credit_union` subscriptions stay readable; `kind`
      becomes nullable, the product/payer/period columns are added, and exactly one of
      `kind`/`product_id` is set.
- [ ] (addition) **Migration 0015** and the product/subscription/renewal/payment/claim bearer seams are
      pre-authorised for this round by the owner (2026-11-05).

**Out of scope:** the admin portal and simulator (24d), complaints (24e), claim history/upload and
payouts (V5).

## Spec record (to-spec, 2026-11-05)

### Problem Statement

Welfare cover — life insurance and credit-union subscriptions — exists in the register as free-form
rows, with no notion of what a member is eligible for, who pays, what a period covers, or how a
dependent is covered. A member without a smartphone has no way to see or take up the cover they are
entitled to, the back office has no way to start or renew a church-paid plan with an explicit period,
and claims are nowhere recorded. The membership card and verification status — which eligibility rules
must test — are not captured at all.

### Solution

Welfare becomes a **product** (`subscription_products`) with server-evaluated eligibility rules and a
payer/cover shape. A **subscription** records the payer, the cover period and the premium; a member-paid
period writes one `subscription_payments` row and advances `periodEnd`, while a church-paid period is
started or renewed by the back office with no payment. Household products cover explicit,
relationship-checked `subscription_coverage` rows, and a covered member reads the plan as inherited with
a relationship label. **Claims** are back-office records (no payout rail, no member entry). USSD adds a
**Welfare & Services** surface that lists only eligible, member-payable products, lets a member subscribe
and see their own and inherited cover, and renders expiry and the claimed total. The membership card and
verification become detail-only member fields that eligibility tests against.

### User Stories

1. As a member, I want to see only the welfare products I am eligible for, so that I do not apply for
   cover I cannot get.
2. As a member, I want to subscribe to an eligible service and be told who pays and what it costs, so
   that my cover starts immediately.
3. As a member, I want an ineligible service hidden rather than refused after I start, so that the menu
   stays honest.
4. As a member, I want to see my subscription status, paid-by, period, expiry and total claimed, so that
   I know my cover at a glance.
5. As a member, I want an unpaid period to show as "Expired", so that I know to renew.
6. As a member, I want my self-subscription to resolve the payer to "member" automatically, so that I
   never have to choose a payer.
7. As a member taking up a household plan, I want to be asked which dependents to cover up to the cap,
   so that only the right people are covered.
8. As a covered dependent, I want to see the plan I inherit labelled by the relationship, so that I know
   I am covered.
9. As a covered dependent, I want a spouse's plan to read "Husband" or "Wife" by their gender, so that
   the label is personal.
10. As a back-office officer, I want to start and renew a church-paid plan with an explicit period and
    no payment, so that church-funded cover is tracked.
11. As a back-office officer, I want to record a member-paid premium per period with an idempotency key,
    so that a retry cannot double-record.
12. As a back-office officer, I want to record a claim with an amount, reason and status, so that cover
    usage is tracked.
13. As a back-office officer, I want to decide a claim with a note, so that the record is auditable.
14. As an admin, I want to set and clear a member's verified status and record their card number, so
    that eligibility can test them.
15. As an admin, I want a card number to be unique case-insensitively, so that a card cannot belong to
    two members.
16. As a product manager, I want to define a product with eligibility, payer, period and dependent
    rules, so that cover is configured, not coded.
17. As a product manager, I want to activate and deactivate a product without deleting it, so that
    history is preserved.
18. As a developer, I want legacy `life_insurance` and `credit_union` rows to keep rendering, so that no
    historical cover disappears.
19. As an auditor, I want every subscription, payment and claim attributed to an actor and timestamp, so
    that the record is defensible.

### Implementation Decisions

- Products are reference data with a server-evaluated eligibility rule set and a payer/cover shape; they
  are created and toggled, not deleted. `PUT` sets `active` only; pricing and eligibility are fixed at
  creation.
- Eligibility is evaluated server-side and enforced on every write path; an ineligible member is never
  offered a product.
- The payer is resolved server-side from `paymentMode`; the member never chooses, and an `either`
  product is never self-subscribed.
- A period is one cover interval; a member-paid period is one payment row and advances `periodEnd`; an
  unpaid period lapses at `periodEnd`. Renewal extends from `max(periodEnd, today)`.
- Welfare premiums are recorded rows, not transacted — no gateway intent and no `payment_groups` row in
  V3.
- Coverage is an explicit financial fact joined by an existing relationship edge, never derived or
  auto-extended.
- Inherited cover is a read projection labelled by the relationship from the covered member to the
  policyholder; spouse renders Husband/Wife by gender.
- The card and verification are independent, detail-only fields; `verified` is a boolean payload that
  sets or clears an officer-set timestamp, and a card reissue is clear-then-set.
- Claims are back-office records with a fixed status machine and no payout rail; a member only reads the
  claimed total.
- Legacy subscription kinds remain readable; `kind` becomes nullable and exactly one of
  `kind`/`product_id` is set.

### Testing Decisions

- **External behaviour only.** Assert responses, persisted rows and computed counts, never internals.
- **Highest seam** is the product, subscription, payment and claim bearer routes, plus the USSD Welfare
  & Services screens driven as a sequence of `POST /ussd/session` frames (exact menu text and next
  state).
- **Prior art** is the existing subscription-route Supertest+PGlite tests and the USSD frame tests: one
  app instance, real migrations, rows asserted by query. Cover eligibility, payer resolution, period
  advance/expiry, household caps and relationships, inherited labelling, claims totals, payment
  idempotency, legacy-row rendering and the exact USSD screens.

### Out of Scope

- The operator app and simulator (24d), and complaints (24e).
- Claim history/upload and payouts (V5); claims are recorded, not paid out.
- Editing product eligibility after creation (recreate today; a future round).
- A gateway charge for welfare premiums; premiums are recorded, not transacted.

### Further Notes

- Migration 0015 and the product/subscription/renewal/payment/claim bearer seams are pre-authorised for
  this round by the owner (2026-11-05).
- `paid_by` is nullable so legacy rows render without a payer; product subscriptions always set it.
- `card_in_use` is a distinct `409` code so the UI can say "that card already belongs to a member".
