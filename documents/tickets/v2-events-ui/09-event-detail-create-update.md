# 09: Event detail, create and update

**Tier:** 2

**What to build:** Create, read and update a standalone event with multiple sessions. The detail
returns the session list, attached offerings and stats. The Strategic Conference is creatable as
13–15 October 2026, 17:30, Main Auditorium, three sessions.

**Blocked by:** 08 (Event list endpoint).

**Status:** ready-for-agent

- [ ] The Strategic Conference can be created standalone with three sessions at 17:30 and an `auditorium` venue.
- [ ] Sessions must be non-empty, have unique dates inside the start/end range, and are rejected otherwise with problem+json.
- [ ] A duplicate `event_no` returns 409; a missing `event_no` is rejected.
- [ ] Detail returns sessions with status and the offering/attendance placeholders.
- [ ] `npm run verify` and `npm run smoke` pass.
