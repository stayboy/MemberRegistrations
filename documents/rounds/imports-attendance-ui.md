# Round - attendance import screen (15b)

|        |                                                                   |
| ------ | ----------------------------------------------------------------- |
| Status | OPEN                                                              |
| Tier   | 2 - Reviewed                                                      |
| Mode   | `unattended (auto-accept recommendations)`                        |
| Base   | `4ace7d1`                                                         |
| Spec   | `documents/specs/member-registrations-ui.md` FR-36a, FR-37, FR-41 |
| Ticket | 15b                                                               |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Go-forward grill before this round (unattended, auto-accepted)

- **Q148 — picker source.** `GET /v1/events` has no text search, so the picker uses a **date window**
  (last 30 / next 30 days, widenable) plus the session list already carried on each event. Accepted.
- **Q149 — cancellation.** Cancelled and archived events are dropped from the event list, and cancelled
  sessions from the session list, so the import's own refusal is never reachable from the picker.
- **Q150 — deep link.** `#/imports/attendance?event=<id>&date=<YYYY-MM-DD>`; the page seeds the window
  around that date, resolves the occurrence once, and "Change occurrence" clears the URL and the panel.
- **Q151 — nav.** The Attendance registry item stops being a placeholder; its description names the
  chosen session.
- **Q152 — reuse.** The screen uses the ticket-15 `ImportPanel` unchanged in shape: the occurrence is
  captured in the `commitRows` closure and the panel is keyed by it.
- **Q153 — next.** Ticket 16 (shepherding UI) follows, and its first commit splits the 1,263-line
  `MemberDetailPage` (Q123). The backlog row for the event-attendance invalidation was added.

## Plan

The attendance screen: choose one session, upload CSV or the downloaded template, preview, commit, and
see written/skipped. A `409` reads as already imported with the batch id and offers no retry.

- Picker: UTC date range (today ±30 by default), Fluent event and session dropdowns; cancelled/archived
  events and cancelled sessions are not offered.
- Deep link from the event detail; the resolved occurrence is a snapshot, so a refetch cannot unmount
  the panel and discard a parsed file.
- Parsing reuses the ticket-15 normalisation and limits; `datetime` is optional and its date must equal
  the chosen session.
- Commit posts `{ eventId, sessionDate, rows }`; the result shows written/skipped when present.
- Success invalidates the member queries and records the batch.

## Verification

| Gate                      | Command                                                   | Result                                  |
| ------------------------- | --------------------------------------------------------- | --------------------------------------- |
| UI tests                  | `npm --prefix ui run test`                                | pass - 14 files, 149 tests              |
| Typecheck / lint / format | `npm --prefix ui run typecheck` / `lint` / `format:check` | pass                                    |
| Build                     | `npm --prefix ui run build`                               | pass                                    |
| Root tests (serialized)   | `npx vitest run --no-file-parallelism`                    | pass - 17 files, 206 passed / 3 skipped |

| Chunk                          | Size      |
| ------------------------------ | --------- |
| entry                          | 40.82 kB  |
| `vendor`                       | 887.68 kB |
| `import-parsers`               | 84.99 kB  |
| shared panel + download helper | 16.50 kB  |
| `ImportsAttendancePage`        | 9.02 kB   |
| `ImportsPage`                  | 2.17 kB   |

## Review

`deepseek-v4-pro:0813`.

- **First pass: CHANGES REQUIRED.** No P1. Two P2: the "no retry" claim was not enforced after a `409`
  (the preview and the enabled button survived), and the event/session filters plus the deep-link
  resolution were behavioural but untested. Three nits: duplicated file dispatch, a deep link
  re-derived every render (a refetch could silently discard a parsed file), and the missing
  event-attendance invalidation.
- **Applied:** a `409` now clears the parsed preview and the file input and blocks the commit button
  (pure `isDuplicateImport` / `duplicateBlocksCommit`, tested); the filters and `resolveOccurrence`
  moved to `ui/src/format/occurrence.ts` with eight tests; one `readImportMatrix` dispatch serves both
  kinds; the deep link seeds state once and the window is seeded around its date.
- **Second pass: ACCEPT.** Both P2s verified fixed with no regression to the generic-error path, the
  shared dispatch or the occurrence snapshot. Three nits were also closed: a dead `parseAttendanceCsv`
  export removed, the duplicate test fixture corrected to the server's real `conflict` code, and
  `initialRange` moved to `occurrence.ts` with three tests.

## Acceptance

| #   | Criterion                                                                                              | Met      | Evidence                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| 1   | One session preselected (picker or deep link), visible before upload, changing it clears a parsed file | yes      | `ImportsAttendancePage`, keyed panel, snapshot state                                         |
| 2   | Cancelled/archived events and cancelled sessions cannot be selected                                    | yes      | `occurrence.ts` + tests                                                                      |
| 3   | Rows are `memberNo` + optional `datetime`; another date is a row error                                 | yes      | `import-file.ts` + tests                                                                     |
| 4   | Columns and template from the API; same limits as ticket 15                                            | yes      | shared parser + panel                                                                        |
| 5   | Commit posts the occurrence and shows written/skipped                                                  | yes      | `postAttendanceImport`, panel result rows                                                    |
| 6   | A `409` reads as already imported with the batch id and cannot be retried                              | yes      | panel duplicate path + tests                                                                 |
| 7   | Attendance queries refresh after success                                                               | partly   | member queries invalidated; the event report key does not exist until ticket 17 (backlogged) |
| 8   | Matches the local mock at the recorded viewport                                                        | deferred | Pixel parity is ticket 19                                                                    |

Verdict: **ACCEPTED**.

## Deviations

- **Event attendance invalidation** is not possible yet — the events UI queries land in ticket 17; the
  backlog records it rather than leaving the ticket word silently unmet.
- **Pixel parity** stays with ticket 19, as for every UI ticket since 14.
- The shared panel chunk is emitted under the name `download` (rolldown names a shared chunk after its
  first module); it holds `ImportPanel` plus the download helper.
