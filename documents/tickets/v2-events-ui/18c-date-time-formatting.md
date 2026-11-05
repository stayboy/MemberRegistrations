# 18c: Date and time display

**Tier:** 2

**What to build:** One formatter for every API date and time value, and a display preference the
officer can change from the sidebar or Settings — date style and clock cycle, defaulting to the
locale. Instants convert from UTC to the browser zone; calendar dates keep their stored day.

**Blocked by:** 12 (UI shell), 13 (members list), 17 (events), 18 (series) — every surface that renders
a date.

**Status:** ready-for-agent

- [ ] A single `format/datetime` module exposes `formatInstant`, `formatCalendarDate`, `formatWallClockTime` and `formatDateRange`; the calendar-date function takes no time zone and can never shift a day.
- [ ] A provider reads and writes `localStorage["mr.datetime.v1"]` (`{ dateStyle, timeCycle }`, default `locale`), validates unknown values, and exposes a `useDateTimeFormat()` hook; no component calls `Intl` or `toLocaleString` directly.
- [ ] Instants (`archivedAt`, `createdAt`, `updatedAt`, call and batch timestamps) render in the browser zone and carry the UTC instant in a `title`; calendar dates (`dob`, `joinedOn`, session dates, `calledOn`, `assignedOn`, `effectiveFrom`/`endsOn`, exception dates) render without a shift; wall-clock times (`startTime`, `endTime`, `sessionTime`) render as scheduled and are never converted.
- [ ] The sidebar footer shows one **Date and time** entry above Appearance; opening it (click or right-click) shows the full settings menu with the date-format and time-format groups and "Open settings". No inline dropdowns.
- [ ] Settings gains a **Date and time** panel with the same controls and a live preview.
- [ ] The audit removes `formatTimestamp`, both `toLocaleString()` calls and the date-only rendering of `archivedAt`.
- [ ] Tests pin a named zone for instants (UTC, Africa/Lagos, America/New_York), prove calendar dates are zone-proof, cover every style and clock cycle, and validate the preference parser.
- [ ] Browser behaviour (menu, preview) is left to ticket 19.
