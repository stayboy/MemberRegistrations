# 03: Series ORM trial (the gate)

**Tier:** 2

**What to build:** Migrate the Series repository to the chosen style: schedule versions, exceptions,
occurrence resolution and transaction boundaries. Measure it against the raw implementation and
publish the comparison. This ticket decides whether the ORM is adopted; it does not change the public
contract.

**Blocked by:** 02 (Drizzle wiring and Ministries smoke).

**Status:** ready-for-agent

- [ ] Appending a schedule version, adding/removing an exception, resolving occurrences and rolling back a failed transaction behave identically to today.
- [ ] All series tests pass; new tests cover concurrent version append and exception idempotency.
- [ ] The round doc records code size, query count, p95 latency on PGlite, and every SQL fragment kept raw.
- [ ] No request or response shape changes.
- [ ] `npm run verify` and `npm run smoke` pass.
