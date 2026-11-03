# 21: Contributions and visitors

**Tier:** 2

**What to build:** Record member and visitor contributions with idempotency and a receipt or reference.
A visitor gives a name and phone, receives a receipt, and leaves no member record. Member and visitor
totals are reported separately.

**Blocked by:** 20 (Offerings, terms and attachment).

**Status:** ready-for-agent

- [ ] A member contribution is created once per idempotency key; a repeat returns the same record.
- [ ] A visitor contribution accepts name and phone, returns a receipt or reference, and creates no member.
- [ ] Visitor phone numbers are stored hashed and never returned or logged.
- [ ] Totals aggregate members and visitors separately and expose no contact values.
- [ ] Amounts are integer minor units; zero or negative is rejected.
- [ ] `npm run verify` and `npm run smoke` pass.
