# 13: Members list UI

**Tier:** 1

**What to build:** The refined members grid against the API: member identity, presbyter status, last
attended as `4/5 (26-Oct-26)`, subscriptions as a pill only, and `Contacts · n` as the only route to
contact values. Status detail lives in tooltips, never in pills.

**Blocked by:** 12 (UI workspace, shell and Pages).

**Status:** ready-for-agent

- [ ] The grid shows presbyter status, last attended in the agreed format, a subscriptions pill and `Contacts · n`.
- [ ] No contact value appears in the grid; opening `Contacts · n` shows the aggregate contact dialog for that member.
- [ ] Attendance shows only the `4/5 (26-Oct-26)` form, with no bottom text.
- [ ] Loading, empty and error states are present; status is not derived from local dates.
- [ ] The screen matches its mock screenshot at the recorded viewport.
