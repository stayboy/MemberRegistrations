# 08: Event list endpoint

**Tier:** 2

**What to build:** `GET /v1/events` returns a date-window list of standalone and series-generated
events with date range, series or standalone, venue type and name, session count, attendance summary
and offering summary (zero until offerings land). Status is derived by the API in UTC.

**Blocked by:** 07 (`event_instances` migration and backfill).

**Status:** ready-for-agent

- [ ] The list returns held, upcoming and cancelled events with server-derived status.
- [ ] Filters cover `from`, `to`, `seriesId`, `ministry` and `venueType`; pagination is stable.
- [ ] `venueType` is one of `auditorium`, `virtual` or `hybrid`; any other value is rejected at write.
- [ ] A page of events uses one query, not one query per event.
- [ ] `npm run verify` and `npm run smoke` pass.
