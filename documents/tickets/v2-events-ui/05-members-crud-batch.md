# 05: Members CRUD batch

**Tier:** 2

**What to build:** Move member create, read, update and purge to the chosen data-access style, while
leaving the attendance counts, last-attended and denominator queries exactly as they are. This is the
batch that proves the boundary holds in the largest repository.

**Blocked by:** 04 (Gate outcome and drift check).

**Status:** ready-for-agent

- [ ] Member CRUD behaves identically, including the documented PII-erasure exception on purge.
- [ ] Attendance counts, `lastAttended` and the denominator queries remain raw and return the same numbers.
- [ ] Duplicate member numbers and contact conflicts still return the existing problem+json codes.
- [ ] Attendance and shepherding tests pass without edits.
- [ ] `npm run verify` and `npm run smoke` pass.
