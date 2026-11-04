# 15: Imports UI

**Tier:** 2

**What to build:** Upload a CSV or the downloaded Excel template for the member database or the
attendance registry, preview it, show row-level reasons and commit, with a result summary. Each screen
shows the expected columns and offers a template download. A duplicate file is recognised by checksum
and reported as already imported.

**Blocked by:** 12 (UI workspace, shell and Pages), 10b (Members import and Excel templates), 15a
(attendance import contract).

**Status:** ready-for-agent

- [ ] Member database and attendance screens upload, map, preview and commit against the API; result counts match the batch response, including rows written and rows skipped by a suppression.
- [ ] The attendance screen preselects **one event session** (a picker, or a deep link from the event detail) and shows it before commit; the file carries `memberNo` and an optional `datetime` checked against it, never a per-row event number.
- [ ] Importing the same occurrence and rows twice is reported as already imported with the existing batch id, and creates no second batch.
- [ ] Each screen shows the expected columns from `GET /v1/imports/formats` and offers `GET /v1/imports/templates/{kind}` as a download.
- [ ] The downloaded `.xlsx` template and CSV files are both accepted; if the template cannot be fetched, the column list is shown inline.
- [ ] A duplicate file is reported as already imported and creates no second batch.
- [ ] Rejected rows show row-level reasons and no partial commit occurs.
- [ ] Members and attendance queries refresh after a successful import.
- [ ] There is no event-list import screen.
- [ ] The screen matches the local `mockups/v2-imports/` capture at the recorded viewport (git-ignored; regenerate locally).
