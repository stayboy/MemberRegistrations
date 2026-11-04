# 10: Attendance per session

**Tier:** 2

**What to build:** Attendance import resolves `eventno` + date to one of the event's sessions and stores
the row against that session. The attendance report returns present/expected and the member rows with
their import or manual source. A date outside `sessions` is rejected by the database, not only by the
API.

**Blocked by:** 07 (`event_instances` migration and backfill).

**Status:** done — 2026-11-04

- [x] An import row whose date is not one of the event's sessions fails with a clear error and writes nothing.
- [x] The report returns present/expected and rows with `import` or `manual` source for one session.
- [x] Suppressions survive a re-import of the same file.
- [x] Re-importing the same member, session and event is idempotent.
- [x] `npm run verify` and `npm run smoke` pass.
