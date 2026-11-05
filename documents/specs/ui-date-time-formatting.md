# Spec - UI date and time formatting (proposed)

|            |                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | **PROPOSED 2026-11-05.** Q169–Q178 resolved; the design and the mock are approved.                                                                |
| Author     | Solomon Owoo                                                                                                                                      |
| Related    | `documents/specs/member-registrations-ui.md` (FR-12, FR-76), `AGENTS.md` §4                                                                       |
| Mock       | local `mockups/v2-settings/01-date-time-settings.png` (1440×1150) and `02-date-time-sidebar.png` (1440×900, the shell mock viewport; git-ignored) |
| Supersedes | The single "dates are UTC calendar dates; the UI formats, never shifts" rule, which does not say what an instant does                             |

---

## Problem Statement

The UI shows three different kinds of value with two different policies. Calendar dates
(`dob`, session dates, `calledOn`) are formatted from `YYYY-MM-DD` without a time-zone shift, which
is correct. Instants (`archivedAt`, batch `createdAt`, call `createdAt`, `updatedAt`) are sometimes
rendered with the same date-only helper, so a member archived at `23:30Z` shows the previous day to a
reader west of UTC, and sometimes with a bare `toLocaleString()`, so the same app prints
`11/4/2026, 11:30:00 PM` or `04/11/2026, 23:30:00` depending on the reader's browser. An operator
cannot choose how dates look, and the two paths disagree.

## Solution

One **global formatter** for every API date and time value, and one **display preference** the
officer can change — the same way the accent and the light/dark scheme are changed today.

- The formatter has **one entry point per kind of value**: an instant (converted from UTC to the
  browser's zone) and a calendar date (formatted, never shifted). Callers cannot pick the wrong
  behaviour by accident because they call the function that names the value's kind.
- The preference chooses the display style: **Locale default** (the browser's own), **Day Month
  Year**, **Month Day, Year**, or **ISO 8601**, plus a **time cycle** of Locale default / 12-hour /
  24-hour.
- It defaults to the locale, is stored per browser like the theme, and is changed in Settings with a
  live preview.

## User Stories

1. As an officer, I want every date and time in the app to use one style, so that I am not reading
   `26 Oct` on one screen and `10/26/2026` on another.
2. As an officer west of UTC, I want a record created late in the UTC day to show the day I
   experienced, so that two records made minutes apart do not look a day apart.
3. As an officer, I want a birth date or a service date to keep the day the church recorded, so that
   a time zone can never move a birthday to the day before.
4. As an officer, I want to choose the date format, so that a day-first reader and a month-first
   reader can each work comfortably.
5. As an officer, I want to choose a 12- or 24-hour clock, so that times match how I write them.
6. As an officer, I want my choice to survive a reload and a sign-out, so that I do not re-pick it
   every morning.
7. As an officer, I want the default to be my browser's own style, so that the app feels right
   before I change anything.
8. As an officer, I want a preview next to the setting, so that I can see the effect before I commit
   to it.
9. As an officer, I want to change the format without leaving the page I am on, so that a quick
   comparison does not cost a trip to Settings.
10. As an officer on a narrow screen, I want the display controls reachable when the sidebar is
    collapsed, so that the choice is never hidden behind a layout state.
11. As an officer, I want session times to show the time the service was scheduled for, with its
    zone, so that a 09:00 service is never relabelled 08:00 because I am travelling.
12. As an officer, I want the member list, the event list, the import batches and the call history to
    agree on the format, so that I can compare them without translating in my head.
13. As an auditor, I want the stored value to remain the API's UTC value, so that changing my display
    preference never changes a record.
14. As an accessibility reviewer, I want a full timestamp to carry its UTC value in a tooltip, so
    that the exact instant is still recoverable.
15. As an officer using a screen reader, I want dates and times announced in the chosen style, so
    that the preference is not visual-only.
16. As a developer, I want one formatter with two named entry points, so that "convert to local" and
    "do not shift a calendar date" cannot be confused again.

## Implementation Decisions

- **Preference model.** `{ dateStyle: 'locale' | 'dmy' | 'mdy' | 'iso'; timeCycle: 'locale' | 'h12' |
'h24' }`, defaulting to `{ dateStyle: 'locale', timeCycle: 'locale' }`.
- **Storage.** `localStorage` key `mr.datetime.v1`, versioned and validated on read exactly like
  `mr.theme.v1`/`mr.nav.v1`; an unknown or malformed value falls back to the default. It is a
  browser preference, not a server-side officer setting.
- **One provider, one hook.** A `DateTimePreferenceProvider` mirrors the theme provider; components
  call a `useDateTimeFormat()` hook that returns the formatters already bound to the current
  preference, and never call `Intl` or `toLocaleString` directly.
- **The formatter module** (`format/datetime.ts`) exposes:
  - `formatInstant(value, preference, options?)` — an ISO instant, converted to the browser zone
    (or an explicit `timeZone` for tests), with the chosen date style and time cycle.
  - `formatCalendarDate(value, preference)` — a `YYYY-MM-DD` value, formatted in **UTC** so it can
    never shift; it does not accept a time zone.
  - `formatWallClockTime(value, preference)` — an `HH:MM[:SS]` string; formatted, never converted.
  - `formatDateRange(from, to, preference)`.
  - The existing `formatDateShort`/`formatDateLong` become internal helpers or are removed at the
    call sites; `formatTimestamp` and the two `toLocaleString()` calls disappear.
- **Calendar-date safety.** `formatCalendarDate` builds the date at 12:00 UTC and formats with
  `timeZone: 'UTC'`. Noon is chosen so a ±14-hour offset can never cross a day boundary, even under
  a future refactor that forgets the explicit zone.
- **Styles.** `dmy`: `day: numeric, month: long, year: numeric`; `mdy`: `month: long, day: numeric,
year: numeric`; `iso`: `2026-11-05`; `locale`: `dateStyle: 'medium'`. Times: `h24` sets
  `hour12: false`, `h12` sets `hour12: true`, `locale` omits the option.
- **Instants are always local; wall-clock times never are.** A session's `startTime` belongs to the
  event's timezone, not the reader's, so it is shown as scheduled and labelled with the event's zone;
  converting it would relabel the service.
- **Full timestamps carry a tooltip** with the UTC value, so the exact instant stays recoverable.
- **Settings** gains a **Date and time** section with the two selects and a live preview, beside the
  existing appearance controls.
- **One Display entry in the sidebar footer, not inline dropdowns.** Directly **above** the
  **Appearance** block sits a single **Date and time** row showing the current choice (for example
  "Day Month Year · 24-hour"). Opening it — by click or right-click, as a context menu — reveals the
  **full settings menu**: a Date format group, a Time format group and "Open settings". No inline
  dropdown sits in the sidebar. There is **no header control**; the mock is the same prototype render
  that produced the shell screenshot, so the chrome, toolbar and tables are identical. Settings keeps
  the panel with the preview, and every surface writes the same `mr.datetime.v1` preference.
- **Audit** of every render site: member dates and `archivedAt`, event dates and times, session
  times, attendance `sessionTime`, import batch and call timestamps, series dates. The spec rule
  "dates are formatted, never shifted" is amended to state the three kinds explicitly.
- **No first-paint flash work.** Unlike the theme, the preference affects text rather than colours;
  a default-then-preferred render is acceptable and needs no boot script.

## Testing Decisions

- Tests assert **external behaviour**: a known instant produces the expected text in a named zone,
  and a calendar date produces the same day in every zone.
- **Time zones are injected**, not inherited from the machine: tests assert
  `2026-11-04T23:30:00Z` renders as `4 November 2026, 23:30` in `UTC`, `5 November 2026, 00:30` in
  `Africa/Lagos`, and `4 November 2026, 18:30` in `America/New_York`.
- **Calendar dates are proven zone-proof** by formatting the same `YYYY-MM-DD` under several zones
  and asserting identical output.
- Each style and each time cycle has a case; the locale default is asserted structurally (that it
  uses `Intl` with the browser locale) rather than by pinning a machine's locale.
- The preference parser is tested for unknown, malformed and missing values.
- Component behaviour (the Settings control, the live preview) is deferred to the browser gate; the
  formatter and the preference are node-testable and are covered there.

## Out of Scope

- Converting event or session wall-clock times between zones; they stay event-local.
- Localising copy or adding a second language (OS-12).
- A server-side, per-officer preference or a cross-device sync.
- Relative labels ("3 days ago") and natural-language dates.
- Changing any stored or transmitted value; the API stays UTC.

## Further Notes

Open questions for the owner (the grill round):

- **Q169** — preference granularity: date style plus clock cycle (as mocked), date style only, or a
  full locale picker.
- **Q170** — the option set: the four date styles and three clock options as mocked, or a smaller set.
- **Q171** — the default: the browser locale, or a fixed `en-GB` house style.
- **Q172** — the two-entry formatter (`formatInstant` / `formatCalendarDate`) as the safety rail, so
  "convert every date/time" cannot shift a birth or session date.
- **Q173** — wall-clock session times: keep event-local and label the zone, or convert to the
  browser's zone.
- **Q174** — whether the exact UTC instant belongs in a tooltip on every timestamp.
- **Q175** — whether this lands as one PR before ticket 19, so the screenshot baseline captures the
  corrected timestamps.
- **Q176** — whether the preference should also drive the date windows (from/to controls), which are
  API values and must stay `YYYY-MM-DD` while the label the operator reads follows the preference.
- **Q177** — placement. **Resolved 2026-11-05:** the owner rejected a header menu; the controls sit
  in the sidebar footer, **above** Appearance, matching the shell mock's footer pattern. There is no
  header control.
- **Q178** — the footer control. **Resolved:** the sidebar shows a single **Date and time** entry above
  Appearance; it opens the full settings menu (click or right-click). No inline dropdowns. The
  appearance block stays exactly where it has always been.

**Status update (2026-11-05):** Q169–Q178 are resolved; the mock was rebuilt twice from the prototype
(`02-date-time-sidebar.png`, `02b-display-menu.png`) after the decision screen flagged the header menu
and the un-pinned footer.

## Mock parity (advisory)

The decision model (`clef:27b-cloud`, `scripts/round/decision-probe.mjs`) compared the rebuilt mock
with `v2-shell/01-shell-expanded-light.png` on six closed claims. `DM: clef:27b-cloud`.

| Claim | Ask                                                 | Answer  | Max prob |
| ----- | --------------------------------------------------- | ------- | -------- |
| c01   | A `Display` button was added to the header          | ABSENT  | 0.503    |
| c02   | Appearance pinned to the sidebar bottom in both     | PARTIAL | 0.807    |
| c03   | Same top-level navigation labels                    | PARTIAL | 0.533    |
| c04   | Members toolbar present as in the shell mock        | PRESENT | 0.890    |
| c05   | Date and time block above Appearance in the sidebar | PRESENT | 0.801    |
| c06   | Same sidebar items above the footer                 | PRESENT | 0.763    |

The screen is advisory: the `Display` control is gone, the date/time block sits above Appearance, and
the toolbar matches. The one visible difference is the header label — the shell screenshot predates
the `Attendance` → `Events` rename, while the rebuilt mock is the app's current render.
