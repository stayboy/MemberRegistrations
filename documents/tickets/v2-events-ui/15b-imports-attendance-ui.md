# 15b: Imports UI — attendance registry

**Tier:** 2

**What to build:** The attendance import screen on the shared shell from ticket 15: choose **one event
session** before the upload — from a date-window picker, or from a deep link out of the event detail —
then upload the CSV or the downloaded template, preview it, commit, and see written/skipped. Importing
the same file twice reports the existing batch instead of a generic failure.

**Blocked by:** 15 (shared import shell), 15a (attendance import contract).

**Status:** ready-for-agent

- [ ] The screen preselects one event session: a date-window picker (events load from `GET /v1/events` with `from`/`to`, and the chosen event's sessions come from the same response) or a deep link carrying the event and date. The chosen occurrence is visible before the upload and cannot be changed after a file is parsed without clearing it.
- [ ] A cancelled or archived event and a cancelled session cannot be selected for import.
- [ ] The file carries `memberNo` and an optional `datetime`; the screen never offers a per-row event column. A `datetime` on another date is a preview error naming the row and the chosen session.
- [ ] The expected columns from `GET /v1/imports/formats` and the template download are shown, and the preview obeys the same row/byte limits as ticket 15.
- [ ] A confirmed import posts `{ eventId, sessionDate, rows }` and shows the batch id, kind, row count, **written** and **skipped**, plus checksum and created time.
- [ ] A `409` duplicate is shown as "already imported" with the existing batch id, and creates no second batch.
- [ ] Attendance queries (the member detail's attendance line and any open event attendance report) refresh after a successful import.
- [ ] The screen matches the local `mockups/v2-imports/02-attendance-import.png` at the recorded viewport (git-ignored; regenerate locally).
