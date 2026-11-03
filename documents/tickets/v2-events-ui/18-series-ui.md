# 18: Series UI

**Tier:** 1

**What to build:** Series list and detail against the existing API: schedule, next occurrence,
exceptions, schedule versions, occurrences and a link to each generated event. Adding a schedule
version or an exception appends history rather than rewriting it.

**Blocked by:** 12 (UI workspace, shell and Pages).

**Status:** ready-for-agent

- [ ] The list shows the human-readable schedule, next occurrence, exceptions and status.
- [ ] The detail shows schedule versions, exceptions and occurrences, and links each generated event.
- [ ] Adding a version or an exception appends and refreshes; earlier versions and exceptions remain visible.
- [ ] An archived series is read-only, with no add or edit affordance.
- [ ] The screens match their mock screenshots at the recorded viewport.
