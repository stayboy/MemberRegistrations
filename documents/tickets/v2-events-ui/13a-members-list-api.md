# 13a: Members list API

**Tier:** 2

**What to build:** The list contract the members grid needs: `contactCount` instead of contact values,
`status=active|archived`, and page-level `include=attendance&seriesId=` and `include=subscriptions`
aggregates — each a constant number of queries, never one per row.

**Blocked by:** 06 (contacts and subscriptions), 10 (attendance per session).

**Status:** done — 2026-11-04

- [x] `GET /v1/members` returns `contactCount` and never a contact value; the detail DTO still returns contacts.
- [x] `status=active|archived` filters the set; purged members are never returned; `includeArchived=true` stays an active + archived alias.
- [x] `include=attendance&seriesId=` adds `{ seriesId, seriesName, attended, expected, remaining, status, lastAttendedOn }` per row from one page-level aggregate; a missing `seriesId` is `422`.
- [x] `include=subscriptions` adds `{ id, kind, scope, status, role, policyholderMemberNo, coveredCount }` per row from one page-level query.
- [x] `npm run verify` and `npm run smoke` pass.
