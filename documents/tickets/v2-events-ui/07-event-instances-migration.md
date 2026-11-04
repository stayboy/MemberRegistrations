# 07: `event_instances` migration and backfill

**Tier:** 2

**What to build:** Evolve the existing `event_occurrences` table into `event_instances` in place: make
`series_id` nullable, add the event name, timezone, start/end, venue type and name, status, source and
the `sessions` JSONB array. Backfill one session per existing occurrence, repoint attendance and
suppressions to the event instance and session date, and keep `event_no` unique. A standalone
conference becomes representable without a dummy series.

**Blocked by:** 01 (Freeze specs and boundaries), 04 (Gate outcome and drift check).

**Status:** done — 2026-11-04

- [x] Every existing occurrence becomes an event instance with one session and its original `event_no`.
- [x] Attendance and suppression rows keep their member and date and resolve through the new event instance.
- [x] A standalone event with no series and a three-session event are both accepted; a non-null `series_id` still enforces its foreign key.
- [x] Re-running the migration is safe; a half-applied migration is not left behind.
- [x] Import resolution by `eventno` + date still works against seeded rows.
- [x] `npm run verify` and `npm run smoke` pass.
