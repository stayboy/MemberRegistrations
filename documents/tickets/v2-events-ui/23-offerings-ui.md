# 23: Offerings UI

**Tier:** 2

**What to build:** The offerings landing with totals by member, offering and event, the pledge table
with officer and reminder, the terms-of-reference dialog and the USSD preview. Financial data sits
behind the officer gate; visitor totals are separate.

**Blocked by:** 12 (UI workspace, shell and Pages), 21 (Contributions and visitors), 22 (Pledges and reminders).

**Status:** done — 2026-11-07 (round `v3-offerings-ui`; PR #83)

- [x] The landing shows paid, pledged and outstanding totals by member, offering and event.
- [x] Visitor totals are shown separately and never mixed into member totals.
- [x] The pledge table shows officer, status and next reminder, and allows an admin reassignment.
- [x] The terms dialog shows the versioned terms and the gateway payload preview.
- [x] The USSD preview shows the current or next event and at most five offerings plus `0 More`.
- [x] Financial screens are reachable only through the officer gate.
