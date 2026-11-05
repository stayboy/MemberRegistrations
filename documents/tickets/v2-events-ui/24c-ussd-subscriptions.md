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
      payer (`member`/`church`/`either`), period (1/3/6/12 months), cover (`individual`/`household`),
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
      cap, and writes explicit `subscription_coverage` rows; a disallowed relationship, a non-active
      dependent or one beyond the cap is `422 validation_error`.
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

**Out of scope:** the admin portal and simulator (24d), complaints (24e), claim history/upload and
payouts (V5).
