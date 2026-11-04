# 11: Series to event generation

**Tier:** 2

**What to build:** Generate event instances from series occurrences, honouring cancelled and extra
exceptions. Generated events inherit the series name, ministry, timezone and default venue. The series
detail links each occurrence to its event.

**Blocked by:** 09 (Event detail, create and update).

**Status:** done — 2026-11-04

- [x] Upcoming series occurrences produce event instances with inherited fields.
- [x] A cancelled exception produces no event; an extra exception produces one.
- [x] Re-running generation adds nothing and never overwrites an existing event.
- [x] Series detail shows the generated event for each occurrence.
- [x] `npm run verify` and `npm run smoke` pass.
