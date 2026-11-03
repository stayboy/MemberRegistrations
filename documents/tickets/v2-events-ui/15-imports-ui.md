# 15: Imports UI

**Tier:** 2

**What to build:** Upload a file, map its columns, preview rejected rows and commit the import, with
row-level reasons and a result summary. A duplicate file is recognised by checksum and reported as
already imported.

**Blocked by:** 12 (UI workspace, shell and Pages).

**Status:** ready-for-agent

- [ ] Upload, mapping, preview and commit complete against the API; result counts match the batch response.
- [ ] A duplicate file is reported as already imported and creates no second batch.
- [ ] Rejected rows show row-level reasons and no partial commit occurs.
- [ ] Members and attendance queries refresh after a successful import.
- [ ] The screen matches its mock screenshot at the recorded viewport.
