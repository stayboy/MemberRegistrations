# 02: Drizzle wiring and Ministries smoke

**Tier:** 2

**What to build:** Add Drizzle as a repository-level client beside the existing `Db` port, with the
schema, PGlite and Neon drivers, and migrate only the Ministries repository. Nothing else changes; the
change must be revertible in one commit.

**Blocked by:** 01 (Freeze specs and boundaries).

**Status:** done — 2026-11-03

- [x] Ministries CRUD runs through Drizzle on PGlite and on the pooled `pg` driver (Neon in production, Postgres in CI).
- [x] The existing tests pass unchanged; new tests cover duplicate-code and foreign-key conflicts mapped to the existing domain errors.
- [x] No route imports Drizzle directly; routes still parse and delegate to repositories.
- [x] Reverting Drizzle requires no schema change and leaves the test suite green.
- [x] `npm run verify` and `npm run smoke` pass.
