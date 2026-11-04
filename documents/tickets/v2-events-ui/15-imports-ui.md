# 15: Imports UI — shared shell, member import and batch lookup

**Tier:** 2

**What to build:** The imports workspace. One shared shell — file choice, expected columns plus a
template download, a preview, row-level errors, confirm and result — then the member database import end
to end and the batch lookup. CSV and the downloaded Excel template are both accepted and parsed in the
browser.

**Blocked by:** 12 (UI workspace, shell and Pages), 10b (Members import and Excel templates).

**Status:** ready-for-agent

- [ ] A CSV file and the downloaded `.xlsx` template are both accepted for the member import; cell values are normalised to the API's string shapes before the preview and the commit.
- [ ] The preview shows the parsed row count, the first five rows and row-level validation errors; no request is sent until the operator confirms.
- [ ] The API limits are enforced before sending: at most 10,000 rows and 1,048,576 bytes of serialised JSON, with guidance to split the file. The UI never chunks automatically.
- [ ] A confirmed import posts to `/v1/imports/members` and shows the batch id, kind, row count, checksum and created time; the file contents and parsed rows are discarded.
- [ ] Rejected rows show row-level reasons and the register is unchanged (all-or-nothing).
- [ ] The members list and any open member detail refresh after a successful import.
- [ ] Batch lookup lists the batch ids this tab created (sessionStorage) and resolves any id through `GET /v1/imports/:batchId`.
- [ ] The retired **Event list** nav entry and its placeholder routes are gone.
- [ ] The screen matches the local `mockups/v2-imports/01-members-import.png` and `03-import-preview-errors.png` at the recorded viewport (git-ignored; regenerate locally).
