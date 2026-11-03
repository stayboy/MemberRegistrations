# 24: USSD flow and gateway stub

**Tier:** 2

**What to build:** A simulated USSD session that identifies a member or visitor, shows the current or
next event, lists at most five offerings plus `0 More`, accepts a multi-select, and completes a payment
or a pledge with a confirmation code. Produce the gateway terms payload and reconcile a callback
idempotently. Not enabled in production until a real aggregator and gateway are chosen.

**Blocked by:** 21 (Contributions and visitors), 22 (Pledges and reminders). Deferred to V3.

**Status:** ready-for-agent

- [ ] A session identifies a member or visitor, shows the current or next event, and lists at most five offerings plus `0 More`.
- [ ] A multi-select produces one combined total and a confirmation code for pay or pledge.
- [ ] An expired session is rejected, and no raw phone number appears in logs.
- [ ] The gateway terms payload is produced, and a repeated callback reconciles to the same contribution.
- [ ] The flow is disabled in production by configuration.
