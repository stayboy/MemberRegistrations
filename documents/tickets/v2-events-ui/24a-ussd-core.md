# 24a: USSD core — identity, giving and payments

**Tier:** 2

**What to build:** The aggregator-facing USSD entry, the server-owned menu tree and display glossary, a
member or anonymous session, the current or next event with its offerings, amount/split/confirmation
in lay terms, one payment group per commit with the stub gateway, a USSD pledge and redemption, and the
member's payment summary. Attendance, subscriptions, the admin portal and complaints stay in 24b–24e.

**Blocked by:** 21 (Contributions and visitors), 22 (Pledges and reminders). Migration **0013**
(`ussd_sessions`, `ussd_nonces`, `payment_groups`, `payment_intents`, `contributions.payment_group_id`,
`pledges.settled_contribution_id`), the HMAC `POST /ussd/session` entry and the signature-verified
`/v1/payments/callback` are authorised for this round by the owner (2026-11-05).

**Status:** ready-for-agent

- [ ] `POST /ussd/session` verifies the HMAC-SHA-256 signature over `timestamp + nonce + body` within
      five minutes, refuses a replayed nonce, is rate-limited per phone hash (10/min) and client address
      (30/min), and never stores, returns or logs the raw phone number.
- [ ] A session stores only the HMAC phone hash, binds the member when an **owned** phone or WhatsApp
      contact matches, treats a linked-only match as anonymous, and idle-expires after 3 minutes.
- [ ] A repeated `seq` returns the same prompt without advancing; an expired or unknown session restarts
      from the main menu with "Session expired".
- [ ] The menu tree ships Offerings, Register (anonymous) and Exit in this part; every entry opens its
      primary content, with `9` back, `0` more and `00` main. Activities, Attendance and My Profile
      arrive with 24b, and Welfare & Services with 24c.
- [ ] Every static string comes from the code-owned display glossary (`full`/`short`), dynamic values are
      truncated only by the per-kind widths, and the budget test enforces 16/60/182 characters.
- [ ] The current or next event lists at most five offerings plus `0 More`, using the active attachment
      rules; the caller enters the amount, selects offerings, and a multi-select asks for a split that
      sums to the total.
- [ ] The split is confirmed in lay terms returned by the API, and `1 Accept` / `2 Change` re-renders or
      commits.
- [ ] A commit writes one payment group, its child contributions and one payment intent in a single
      transaction; the group owns the idempotency key, each contribution uses `<groupKey>:<n>`, and one
      gateway charge is requested for the total.
- [ ] The stub `PaymentGateway` records the intent and the callback marks the group and its
      contributions paid; a repeated callback reconciles to the same rows.
- [ ] A USSD pledge targets exactly one offering, takes an expected date, reuses the officer-resolution
      rules, and shows the USSD idempotency key as its reference.
- [ ] "My pledges" lists pending pledges and redeems one by creating a contribution and appending
      `honored` in one transaction; a pledge can be honoured after the offering expires.
- [ ] "My payments" shows the week-to-date, quarter-to-date and year-to-date paid totals and the top
      three events from one member-scoped aggregate; visitor gifts never appear.
- [ ] USSD is disabled in production by configuration, and `/ussd/session` is the only non-bearer route.
- [ ] Tests drive the menu as input frames and assert prompts, persisted rows, HTTP status/codes and the
      confirmation code; the smoke run exercises start → give → pay and start → pledge.

**Out of scope:** attendance, codes, registration, clocking, delegation, expected headcounts and the
profile aggregate (24b); welfare products, eligibility and claims (24c); the admin portal and simulator
(24d); complaints (24e).
