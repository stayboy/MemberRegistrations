# 24d: USSD admin portal and simulator

**Tier:** 2

**What to build:** A new top-level **USSD** section in the existing operator app with the operational
pages behind the 24a–24c seams, plus a dev-only simulator that drives the real API. The gateway secret
never reaches the browser.

**Blocked by:** 24a, 24b, 24c. No migration. Uses the existing shell, session and officer gate.

**Status:** ready-for-agent

- [ ] The operator app gains one **USSD** nav section (same shell and session, no separate app) with
      **Codes**, **Registrations**, **Clocking**, **Expected headcounts**, **Products** and **Claims**;
      24e adds **Complaints**.
- [ ] **Codes** issues an `attendance_punch` or `registration` code against one event session, shows the
      plain code once with its TTL, lists active/used/expired/voided codes, and voids one with a reason.
- [ ] **Registrations** lists pending requests with the event, session, name and reference, and approves
      (supplying the immutable member number through the existing member create path) or rejects with a
      reason.
- [ ] **Clocking** shows session attendance and delegations, records a clock-in for a member, and records
      a delegation from a senior presbyter to another presbyter for one session.
- [ ] **Expected headcounts** captures and corrects `male`, `female` and `children` for one session,
      restating the total, and keeps the register-derived expected count visually separate.
- [ ] **Products** manages welfare products and their eligibility, payer, period, cover and dependent
      rules.
- [ ] **Claims** records a claim (amount, reason) and moves it through its statuses with a decision note.
- [ ] Member detail/form edits `presbyterRank` (only when presbyter), `membershipCardNo` and `verified`
      with the API's validation; rank clears when the presbyter flag clears.
- [ ] A dev-only `POST /dev/ussd/session` computes the HMAC server-side and forwards to the real entry;
      it is **disabled in production** and the gateway secret is never sent to the browser.
- [ ] A **Simulator** page drives the dev-only entry, renders the returned screen text and exposes the
      stub gateway's callback for a commit; the static `mockups/ussd` simulator stays a review artifact.
- [ ] Tests cover the pages' rendering, the officer gate, the production guard on `/dev/ussd/session`,
      and one end-to-end simulate → pay → callback journey against the stub gateway.

**Out of scope:** production aggregator or gateway credentials, real shortcodes, and any card data.
