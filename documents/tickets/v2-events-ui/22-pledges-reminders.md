# 22: Pledges and reminders

**Tier:** 2

**What to build:** A pledge with an expected date and exactly one active follow-up officer: the
member's active shepherd, otherwise the offering's default officer, otherwise rejected. An admin can
assign or reassign with a reason. Honor on payment, dishonor only with a reason, and reminders without
duplicates.

**Blocked by:** 20 (Offerings, terms and attachment).

**Status:** ready-for-agent

- [ ] A pledge resolves its officer by shepherd, then offering default, then rejects with a clear error.
- [ ] An admin can assign or reassign the officer, and the change is appended with a reason.
- [ ] Honor is recorded on payment; dishonor requires a reason; both are append-only.
- [ ] A pending pledge survives offering expiry and can still be honored.
- [ ] Reminders deduplicate per pledge, date and channel, and an opt-out is respected.
- [ ] `npm run verify` and `npm run smoke` pass.
