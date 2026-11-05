# 22: Pledges and reminders

**Tier:** 2

**What to build:** A pledge with an expected date and exactly one active follow-up officer: the
member's active shepherd, otherwise an active presbyter the administrator supplies with a reason,
otherwise rejected. An admin can assign or reassign with a reason. Honor on payment, dishonor only with
a reason, and reminders without duplicates. A pledge always targets an existing offering.

**Blocked by:** 21 (Contributions and visitors).

**Status:** ready-for-agent

- [ ] A pledge resolves its officer by the member's shepherd, then an administrator-supplied presbyter, then rejects with `422 officer_required`.
- [ ] An admin can assign or reassign the officer, and the change is appended with a reason.
- [ ] Honor is recorded on payment; dishonor requires a reason; both are append-only.
- [ ] A pending pledge survives offering expiry and can still be honored.
- [ ] Reminders deduplicate per pledge, date and channel; the member-level opt-out preference is deferred to the delivery round (backlog).
- [ ] `npm run verify` and `npm run smoke` pass.
