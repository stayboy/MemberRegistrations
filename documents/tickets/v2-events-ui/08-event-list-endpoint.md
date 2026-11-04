# 08: Event list endpoint

**Tier:** 2

**What to build:** `GET /v1/events` returns a date-window list of standalone and series-generated
events with date range, series or standalone, venue type and name, session count, attendance summary
and offering summary (zero until offerings land). Status is derived by the API in UTC.

**Blocked by:** 07 (`event_instances` migration and backfill).

**Status:** done — 2026-11-04

- [x] The list returns held, upcoming and cancelled events with server-derived status.
- [x] Filters cover `from`, `to`, `seriesId`, `ministry` and `venueType`; pagination is stable.
- [x] `venueType` is one of `auditorium`, `virtual` or `hybrid`; an invalid filter value is rejected (the write path lands in ticket 09).
- [x] A page of events uses one query, not one query per event.
- [x] `npm run verify` and `npm run smoke` pass.
