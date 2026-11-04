# Round — attendance per session

|         |                                                                            |
| ------- | -------------------------------------------------------------------------- |
| Status  | CLOSED                                                                     |
| Tier    | 2 — Reviewed                                                               |
| Base    | `a58af26`                                                                  |
| Spec    | `documents/specs/member-registrations-api.md` (Occurrences and attendance) |
| Workers | `single`                                                                   |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 10: resolve attendance to the event session, enforce the session at the database, and expose the
per-session report.

- **Migration `0006_attendance_session_guard`:** a plpgsql trigger raises `23514` when
  `attendance.session_date` is not one of the event's `sessions`, so a direct write cannot bypass the
  API.
- **Import:** `(eventno, date)` resolves to the event's session; a date outside `sessions` fails the
  whole batch with a clear error and writes nothing. The row stores the session date, not the event
  start date.
- **Report:** `GET /v1/events/{id}/attendance?date=` returns present/expected, the imported-row count
  and the stored member rows with `import | manual` source. `expected` is the register at the session
  date (`joined_on <= date`, not archived, not purged).
- **Writes:** manual `POST` shadows an imported row and a second manual post is `409`; `DELETE` removes
  a manual row and suppresses an imported one; a cancelled or archived event, and a cancelled session,
  are read-only.
- **Detail:** every event session now reports the per-date `expected` from one lateral, not per event.

Acceptance criteria:

1. A non-session import date fails the batch with a clear message and writes nothing.
2. The report returns present/expected and rows with `import | manual` source.
3. Suppressions survive a re-import; a re-import is idempotent.
4. Manual shadowing, delete/suppression and read-only rules hold.
5. `npm run verify` and `npm run smoke` pass.

## Verification

| Gate              | Command                                                  | Result                                        |
| ----------------- | -------------------------------------------------------- | --------------------------------------------- |
| Protected guard   | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                                |
| Format/lint/types | `npm run format:check` / `lint` / `typecheck`            | pass                                          |
| Tests             | `npx vitest run`                                         | pass — 17 files, 172 passed / 3 skipped (175) |
| Build             | `npm run build`                                          | pass                                          |
| Smoke             | `npm run smoke`                                          | pass — 9/9                                    |

## Review

Independent Tier 2 review on `deepseek-v4-pro:0813`: **Standards PASS**, **Spec PASS**, two P2s and no
P1s. Fixed before acceptance:

- `DELETE` now rejects a row whose session is cancelled (the rule applied to `POST` only).
- Manual attendance now rejects an archived member, so `present` cannot exceed `expected`.

Both fixes carry tests. The review confirmed the trigger, import resolution, the single-query
`expected`, OpenAPI accuracy and the Drizzle boundary.

## Acceptance

| #   | Criterion                                             | Met | Evidence                                  |
| --- | ----------------------------------------------------- | --- | ----------------------------------------- |
| 1   | Non-session import date fails cleanly, writes nothing | yes | `imports.ts`; trigger test; rollback test |
| 2   | Report present/expected + source rows                 | yes | `getAttendance`; report tests             |
| 3   | Suppressions survive re-import; idempotent re-import  | yes | suppression + idempotency tests           |
| 4   | Manual shadowing, delete/suppression, read-only rules | yes | manual/cancel tests                       |
| 5   | `verify` and `smoke` pass                             | yes | 172 passed / 3 skipped; smoke 9/9         |

Verdict: **ACCEPTED**.

## Deviations

- The event-attendance report lists only stored rows; the mock's `Absent` rows are not represented in
  the data model (Q104).
- `expected` is historical (register at the session date), so a multi-day event may show a different
  denominator per day (Q103).
