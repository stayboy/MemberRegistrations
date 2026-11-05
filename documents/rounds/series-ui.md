# Round - series list and detail (18)

|        |                                                          |
| ------ | -------------------------------------------------------- |
| Status | OPEN                                                     |
| Tier   | 2 - Reviewed                                             |
| Mode   | `unattended (auto-accept recommendations)`               |
| Base   | `5d82ec8`                                                |
| Spec   | `documents/specs/member-registrations-ui.md` FR-42/FR-43 |
| Ticket | 18                                                       |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 18 was scoped to the **read + append** half; create/edit/archive (the rest of FR-42) is split into
ticket 18b so neither round hides a form behind a read-only screen.

- **`/events/series`** — name, ministry, timezone, a human-readable schedule from the current version's
  `rrule`, next occurrence, exception count and status. The next occurrence comes from
  `GET /v1/series/:id/occurrences` (one request per visible row), never from expanding the RRULE.
- **`/events/series/:id`** — header, schedule versions newest first, exceptions with add/remove, and a
  window of occurrences; each date links to the events list filtered to that series and date.
- Adding a version or an exception appends and invalidates through the `['series', baseUrl]` prefix, so
  earlier versions and exceptions stay visible.
- An archived series offers no add/remove affordance and says so.
- The events list now honours `?series=<id>&from&to` on first load and has a series filter.

## Verification

| Gate                              | Command                                | Result                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| UI tests                          | `npm --prefix ui run test`             | pass - 22 files, 239 tests              |
| Typecheck / lint / build / format | `npm --prefix ui run ...`              | pass                                    |
| Root tests (serialized)           | `npx vitest run --no-file-parallelism` | pass - 17 files, 206 passed / 3 skipped |

## Review

`deepseek-v4-pro:0813`: **ACCEPT**, no P1/P2, five nits.

- **Nits applied** — the events-list seed no longer returns a dead `window` (the window is owned by
  `useDateWindow`); `nextOccurrenceLabel` takes the window length so "None in N days" cannot go stale;
  the two series dialogs reuse the shared event styles instead of copying them; and the Schedule
  column's `max(effectiveFrom)` inference is commented because the DTO has no "current" marker.
- **Recorded** — the series filter is seeded once on mount, which is correct for the deep link but not
  for back/forward between two `?series=` URLs; occurrences are dates, not event ids, so a per-date link
  opens the filtered events list rather than one event.

The RRULE labeler deliberately falls back to the raw string for `COUNT`, `UNTIL`, `BYDAY=1MO`,
`FREQ=YEARLY` and malformed input, so it can never drop a constraint.

## Acceptance

| #   | Criterion                                                                     | Met      | Evidence                                                                                               |
| --- | ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| 1   | List shows the schedule, next occurrence, exceptions and status               | yes      | `SeriesListPage`, `format/series.ts`                                                                   |
| 2   | Detail shows versions, exceptions and occurrences, and links generated events | partly   | versions/exceptions/occurrences yes; occurrences are dates, so the link opens the filtered events list |
| 3   | Adding a version or exception appends and refreshes; earlier ones remain      | yes      | append-only POSTs; invalidation                                                                        |
| 4   | An archived series is read-only with no add or edit affordance                | yes      | add/remove hidden; notice shown                                                                        |
| 5   | Screens match the local mocks                                                 | deferred | pixel parity is ticket 19                                                                              |

Verdict: **ACCEPTED**.

## Deviations

- **Create/edit/archive are not in this round**; ticket 18b owns them (FR-42's other half).
- **Occurrences are dates, not event ids** — the detail cannot link to one generated event; the per-date
  link opens `/events?series=<id>&from&to`. Backlogged as a DTO gap.
- **The series filter is seeded once** on mount; back/forward between two `?series=` URLs does not
  re-seed it.
- Pixel-level mock parity stays with ticket 19.
