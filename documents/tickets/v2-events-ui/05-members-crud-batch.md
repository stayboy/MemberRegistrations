# 05: Members CRUD batch

**Tier:** 2

**What to build:** Move member create, read, update and purge to the chosen data-access style, while
leaving the attendance counts, last-attended and denominator queries exactly as they are. This is the
batch that proves the boundary holds in the largest repository.

**Blocked by:** 04 (Gate outcome and drift check).

**Status:** done — 2026-11-04

- [x] Member CRUD behaves identically, including the documented PII-erasure exception on purge.
- [x] Attendance counts, `lastAttended` and the denominator queries remain raw and return the same numbers.
- [x] Duplicate member numbers and contact conflicts still return the existing problem+json codes.
- [x] Attendance and shepherding tests pass without edits.
- [x] `npm run verify` and `npm run smoke` pass.
