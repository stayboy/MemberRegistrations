# 13: Members list UI

**Tier:** 1

**What to build:** The refined members grid against the API: member identity, presbyter status, last
attended as `4/5 (26-Oct-26)`, subscriptions as a pill only, and `Contacts · n` as the only route to
contact values. Status detail lives in tooltips, never in pills.

**Blocked by:** 12 (UI workspace, shell and Pages), 13a (Members list API).

**Status:** done — 2026-11-04

- [x] The grid shows presbyter status, last attended in the agreed format, a subscriptions pill and `Contacts · n`.
- [x] No contact value appears in the grid; opening `Contacts · n` shows the aggregate contact dialog for that member.
- [x] Attendance shows only the `4/5 (26-Oct-26)` form, with no bottom text.
- [x] Loading, empty and error states are present; status is not derived from local dates.
- [x] The structure matches the local mock at 1440×900; the pixel-level live-vs-mock gate is ticket 19.
