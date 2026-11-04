# 15a: Attendance import contract

**Tier:** 2

**What to build:** Make the attendance import target one event session chosen by the operator, with
rows of `(memberNo, datetime?)`, an optional time stored on the attendance row, an occurrence-aware
checksum, and a `409` for a repeated import. API only; the imports UI is ticket 15.

**Blocked by:** 10b (imports and templates), 11 (event numbering).

**Status:** ready-for-agent

- [ ] `POST /v1/imports/attendance` takes `{ eventId, sessionDate, rows: [{ memberNo, datetime? }] }`; a per-row event number is no longer accepted.
- [ ] A `datetime` on another date fails the whole batch with row-level reasons; a time inside it is stored as the row's `sessionTime`, and its absence leaves that column null.
- [ ] `attendance.sessionTime` is nullable and added by a migration; existing rows stay null, and a manual entry does not need it.
- [ ] `GET /v1/imports/formats` publishes `memberNo` and `datetime` for the attendance kind, and the Excel template matches it.
- [ ] The batch records the event and session it targeted, and its checksum covers the occurrence plus the rows.
- [ ] Repeating the same occurrence and rows returns `409` with the existing batch id and creates no second batch.
- [ ] The batch result reports rows written and rows skipped because a suppression exists.
- [ ] A manual attendance row still shadows an import for the same `(eventInstanceId, sessionDate, memberId)`, and a deleted imported row's suppression is still honoured.
- [ ] The attendance DTO exposes the optional `sessionTime`.
