# 10b: Members import and Excel templates

**Tier:** 2

**What to build:** V2 has exactly two imports — the member database and the attendance registry. Add
`POST /v1/imports/members` (upsert by `memberNo`, all-or-nothing), expose every import's column
contract, and serve a downloadable Excel template for each. Retire the event-list import now that
generation creates series events.

**Blocked by:** 10 (Attendance per session), 11 (Series to event generation).

**Status:** done — 2026-11-04

- [x] `POST /v1/imports/members` creates or updates members by `memberNo`; a duplicate `memberNo` in the file, an archived member or a purged member fails the whole batch.
- [x] `phone`/`email` become contacts; an identical contact is skipped and a value held by another member is an error.
- [x] `GET /v1/imports/formats` returns the column contract for `members` and `attendance`.
- [x] `GET /v1/imports/templates/{kind}` returns a valid `.xlsx` with a header row, one example row and a notes sheet.
- [x] `POST /v1/imports/events` is gone (404); occurrences come from the schedule and exceptions only.
- [x] `npm run verify` and `npm run smoke` pass.
