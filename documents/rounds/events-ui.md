# Round - events list and detail (17)

|        |                                                                                   |
| ------ | --------------------------------------------------------------------------------- |
| Status | OPEN                                                                              |
| Tier   | 2 - Reviewed                                                                      |
| Mode   | `unattended (auto-accept recommendations)`                                        |
| Base   | `b48b4bb`                                                                         |
| Spec   | `documents/specs/member-registrations-ui.md` FR-30/FR-31; events spec FR-2, NFR-5 |
| Ticket | 17                                                                                |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

- **`/events`** — list against `GET /v1/events?from&to&limit&offset`: dates, event, ministry, series or
  standalone, venue badge, per-session attendance, offerings count, status, and paging by offset.
- **`/events/:id`** — header and a sessions table with date, times, status, source
  (`import|manual|mixed|none`) and `present/expected`; selecting a session opens its attendance.
- **Attendance dialog** — read-only, showing the API's `present`, `expected`, `importedRows` and rows
  with their wall-clock `sessionTime` and source. On an API error it shows the message and no numbers.
- The date-window control was generalised at its second call site: `ShepherdingWindowControl` became
  `DateWindowControl` / `useDateWindow`, used by the three shepherding pages and the events list.

## Verification

| Gate                              | Command                                | Result                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| UI tests                          | `npm --prefix ui run test`             | pass - 19 files, 204 tests              |
| Typecheck / lint / build / format | `npm --prefix ui run ...`              | pass                                    |
| Root tests (serialized)           | `npx vitest run --no-file-parallelism` | pass - 17 files, 206 passed / 3 skipped |

## Review

`deepseek-v4-pro:0813`: **ACCEPT**, no P1, two P2 and three nits.

- **P2 applied** — the list silently capped at 100 events with no paging, which NFR-5 forbids. It now
  uses `useInfiniteQuery` with a "Load more" and an accumulated count; the window resets the list.
- **P2 applied** — the ministry column was missing although events FR-2 makes it a must. Added as
  `code — name`.
- **Nits applied** — the attendance-id backlog row and the dialog comment no longer cite the wrong
  FR-31; a backlog row records the events/offerings spec DTO debt (`seriesName`, offerings-shaped
  `stats`, `present | absent`); the Series column shows "Series" instead of repeating the event name.
- **Recorded** — the DTO has no `seriesName` and no event-level attendance aggregate, so the list shows
  the inherited name and per-session pairs rather than summing client-side.

## Acceptance

| #   | Criterion                                                                             | Met      | Evidence                                            |
| --- | ------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| 1   | List shows date range, event, series/standalone, venue, attendance, offerings, status | yes      | `EventsListPage`; ministry added after review       |
| 2   | Detail shows each session with present/expected and import or manual source           | yes      | `EventDetailPage` sessions table                    |
| 3   | Opening a session shows its rows; an unavailable report says so                       | yes      | `EventAttendanceDialog`                             |
| 4   | No attendance number or status derived on the client                                  | yes      | formatters render API values only; review confirmed |
| 5   | Screens match the local mocks                                                         | deferred | pixel parity is ticket 19                           |

Verdict: **ACCEPTED**.

## Deviations

- **Attendance-row deletion (FR-31) is not implemented.** `GET /v1/events/:id/attendance` returns rows
  with no attendance id, and `DELETE /v1/events/:id/attendance/:attendanceId` needs one; adding it is a
  wire-contract change, which parks. The dialog is read-only and the backlog records the constraint.
- **No event-level attendance aggregate** exists on the wire; the list shows each session's
  `present/expected` rather than a client-computed total.
- **Series names fall back to the event name** (the DTO carries no `seriesName`); the column shows
  "Series" rather than duplicating the Event column.
- Pixel-level mock parity stays with ticket 19.
