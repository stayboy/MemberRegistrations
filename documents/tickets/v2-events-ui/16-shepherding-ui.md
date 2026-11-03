# 16: Shepherding UI

**Tier:** 1

**What to build:** Officers, roster and report screens against the API, with call logging. Calls are
append-only, so the UI offers no edit or delete affordance. Unassigned members and members never called
are visible.

**Blocked by:** 12 (UI workspace, shell and Pages).

**Status:** ready-for-agent

- [ ] Officers, roster and report show the same totals as the API fixture.
- [ ] Logging a call appends a record and refreshes the roster; there is no edit or delete control.
- [ ] Unassigned members and members never called are visible and filterable.
- [ ] Contact values are not exposed outside the explicit contacts action.
- [ ] The screens match their mock screenshots at the recorded viewport.
