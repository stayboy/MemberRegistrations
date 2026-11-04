# Round - attendance import contract (15a)

|        |                                                                          |
| ------ | ------------------------------------------------------------------------ |
| Status | CLOSED                                                                   |
| Tier   | 2 - Reviewed                                                             |
| Base   | `9cde6f5`                                                                |
| Spec   | `documents/specs/member-registrations-api.md` FR-5–FR-6b, "Import batch" |
| Ticket | 15a                                                                      |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Implement the amended contract so ticket 15 can build a screen that imports against a session the
operator already chose.

- Migration `0009_attendance_import_occurrence`: nullable `attendance.session_time`, and nullable
  `import_batches.event_instance_id`, `session_date`, `written_count`, `skipped_count`.
- `POST /v1/imports/attendance` takes `{ eventId, sessionDate, rows: [{ memberNo, datetime? }] }`.
- `datetime` accepts a date or a date plus a wall-clock time; its date must equal `sessionDate`; a time is
  stored as `sessionTime`. No timezone conversion — it is the time the register carried.
- The import refuses an unknown event, a `cancelled`/`archived` event, an unlisted session date, and a
  **cancelled session** (matching the manual path), and never changes the event's status.
- The checksum covers `{eventId, sessionDate, rows}`; a repeat is a `409` carrying the existing batch id.
- The batch reports `written` and `skipped` (a suppression exists, or a manual row already holds the
  session).
- Formats and the Excel template publish `memberNo` + optional `datetime`; the batch and attendance DTOs
  and the generated OpenAPI carry the new fields.
- Root Vitest `testTimeout` 15 s and `hookTimeout` 20 s (Q139), so the local hook stops flaking on PGlite.

Acceptance criteria: the ticket's checklist.

## Verification

| Gate               | Command                                                             | Result                                  |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------- |
| Typecheck / lint   | `npm run typecheck` / `lint`                                        | pass                                    |
| Tests (serialized) | `npx vitest run --no-file-parallelism`                              | pass - 17 files, 204 passed / 3 skipped |
| Import suite alone | `npx vitest run tests/api/attendance.test.ts --no-file-parallelism` | pass - 41 tests                         |
| Build              | `npm run build`                                                     | pass                                    |
| Smoke (migration)  | `npm run smoke`                                                     | pass - 9 checks, migrations applied     |
| Format             | `npm run format:check`                                              | pass                                    |

The default parallel `vitest run` flaked once on this machine (worker exit `0xC0000409` in
`tests/api/members-crud.test.ts`); the serialized run is the evidence and CI runs the parallel config.

## Review

`deepseek-v4-pro:0813`.

- **First pass: CHANGES REQUIRED.** No functional defect in the import path — the contract, checksum,
  duplicate rule and counting were confirmed sound, and the migration safe. The blockers were spec
  drift (the route table, the unknown-`eventno` sentence and a testing decision still described the
  retired per-row contract) and an OpenAPI gap (the `409` was not declared).
- **Applied before the second pass:** the three spec spots and the changelog wording; the `409` response
  in `src/openapi.ts` with a note that the shared `Problem` schema does not declare the `batchId`
  extension (same shape as the reassignment `409`); rejection of a **duplicate `memberNo` inside one
  attendance file**, which otherwise reported `written: 2` for one physical row; a lowercase `t`
  separator; and a `content-type` assertion on the duplicate response.
- **Second pass: ACCEPT.** All four P2s verified in place; the count logic, the duplicate-member guard's
  placement and the migration were re-checked with no regression. The remaining notes were drifts in
  _other_ documents, and the ones on ticket 15's path were fixed in the same change rather than deferred:
  the UI spec's `ImportBatch`/`AttendanceImport` shapes and FR-44 (it still described the retired event
  list), the root `README` route table, the V3 events/offerings spec, and an `eventNo` comment in
  `src/schemas/events.ts` that still called it "the import key".
- **Nits left as recorded:** `sessionTime` is read back as `HH:MM`, so seconds in the file are stored but
  not surfaced; the checksum is literal, so a repeat that differs only in member casing is a new import.

## Acceptance

| #   | Criterion                                                                                     | Met | Evidence                                                 |
| --- | --------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------- |
| 1   | `POST /v1/imports/attendance` takes `{ eventId, sessionDate, rows }`; no per-row event number | yes | `src/schemas/imports.ts`, `tests/api/attendance.test.ts` |
| 2   | A `datetime` on another date fails the batch; a time is stored, its absence leaves null       | yes | repo tests; attendance report exposes `sessionTime`      |
| 3   | `sessionTime` is nullable, added by migration; manual entry needs none                        | yes | `0009_attendance_import_occurrence`                      |
| 4   | Formats and the Excel template publish `memberNo` + optional `datetime`                       | yes | `IMPORT_FORMATS` (single source for both)                |
| 5   | The batch records the occurrence and the checksum covers it                                   | yes | `GET /v1/imports/:batchId` test                          |
| 6   | A repeat returns `409` with the batch id and creates no second batch                          | yes | duplicate test, `problem+json` asserted                  |
| 7   | The result reports written and skipped                                                        | yes | batch DTO + tests                                        |
| 8   | Manual shadow and suppression still hold                                                      | yes | manual-shadow and deletion tests                         |
| 9   | The attendance DTO exposes the optional `sessionTime`                                         | yes | `eventAttendanceRowSchema`, event report test            |

Verdict: **ACCEPTED**.

## Deviations

- **No unique index on the checksum.** Historical batches may legitimately share one and audit rows are
  never rewritten, so the duplicate check is a lookup inside the importing transaction. With one
  operator and a disabled submit button the race is not reachable; a unique index would need a
  data-cleaning migration that rewrites audit rows.
- **The exact same file cannot exercise a suppression.** A literal repeat is a `409` before any row
  pass, so the suppression rule is proven with a changed row set that still names the deleted member —
  which is also how a corrected export would arrive.
- **Duplicate detection precedes member validation**, so an exact repeat is a `409` even if its members
  were purged since. Deliberate: the file is still the same import.
- The spec's "skipped" sentence was clarified to say a manual shadow also counts as skipped, because the
  implementation reports one truthful count rather than inventing a second.
