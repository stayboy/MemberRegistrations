# 04: Gate outcome and drift check

**Tier:** 2

**What to build:** Record the adopt or revert decision from the Series trial in the round doc and the
governing docs. On adopt, add a CI check that the ORM schema and the SQL migrations agree, and enforce
the repository boundary. On revert, remove Drizzle and record why.

**Blocked by:** 03 (Series ORM trial).

**Status:** ready-for-agent

- [ ] The decision is recorded with its evidence and the rejected alternative.
- [ ] A deliberate column mismatch fails the drift check; the committed schema passes it.
- [ ] No ORM type appears in a route, Zod schema or OpenAPI output.
- [ ] If reverted, Drizzle is gone and the 64 tests still pass.
- [ ] `npm run verify` and `npm run smoke` pass.
