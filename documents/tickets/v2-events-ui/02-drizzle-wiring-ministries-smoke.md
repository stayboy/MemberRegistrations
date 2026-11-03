# 02: Drizzle wiring and Ministries smoke

**Tier:** 2

**What to build:** Add Drizzle as a repository-level client beside the existing `Db` port, with the
schema, PGlite and Neon drivers, and migrate only the Ministries repository. Nothing else changes; the
change must be revertible in one commit.

**Blocked by:** 01 (Freeze specs and boundaries).

**Status:** ready-for-agent

- [ ] Ministries CRUD runs through Drizzle on PGlite and on a Neon pooled connection.
- [ ] The existing 64 tests pass unchanged; new tests cover duplicate-name and foreign-key conflicts mapped to the existing domain errors.
- [ ] No route imports Drizzle directly; routes still parse and delegate to repositories.
- [ ] Reverting Drizzle requires no schema change and leaves the test suite green.
- [ ] `npm run verify` and `npm run smoke` pass.
