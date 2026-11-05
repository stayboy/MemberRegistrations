# 19c: Post-release gaps — contact search, unassigned list, attendance ids and row errors

**Tier:** 2

**What to build:** The gaps the release gates surfaced, now unblocked: the Find by contact dialog, the
unassigned members list, attendance-row deletion, and structured import row errors.

**Blocked by:** 19b (the release gate that surfaced them).

**Status:** ready-for-agent

- [ ] A **Find by contact** dialog on the members page sends `contact` to `GET /v1/members`, keeps the value in component state only (never the URL, `localStorage` or `sessionStorage`), lists the matches and opens the contacts action for a row.
- [ ] The church report's unassigned count links to `/members?unassigned=true`; the members list sends `unassigned=true` and shows the archived combination as an error (the API rejects it).
- [ ] The attendance report's rows carry `id`, and the session attendance dialog can remove a row behind `ConfirmDialog`, calling `DELETE /v1/events/:id/attendance/:attendanceId`; the report and the member queries refresh, and the copy says the suppression keeps it out of a later import.
- [ ] An `import_failed` body carries `rows: [{ row, message }]` for row-level failures; the import panel renders those rows (the structured list it already has), while batch-level failures keep the flattened `detail`.
- [ ] A successful attendance import invalidates an open event attendance report.
- [ ] The backlog rows these changes close are removed and the remaining ones re-stated.
- [ ] The spec's three additive changes are implemented exactly as amended, with tests at the repository and route level.
