# Round — members import and Excel templates

|         |                                                                       |
| ------- | --------------------------------------------------------------------- |
| Status  | CLOSED                                                                |
| Tier    | 2 — Reviewed                                                          |
| Base    | `3a502b8`                                                             |
| Spec    | `documents/specs/member-registrations-api.md` (Import batch, Imports) |
| Workers | `single`                                                              |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 10b: V2 has exactly two imports — the member database and the attendance registry — each with a
column contract and an Excel template. Retire the event-list import now that generation can create
series events.

- **Members import:** `POST /v1/imports/members` upserts by `memberNo`, all-or-nothing; a duplicate in
  the file, an archived member or a purged member fails the batch. `phone`/`email` become contacts
  without duplicating an existing value.
- **Formats/templates:** one registry drives `GET /v1/imports/formats` and
  `GET /v1/imports/templates/{kind}` (`.xlsx` with a header, an example row and a Notes sheet), built
  with `exceljs`.
- **Retirement:** the event-list import and its schema are gone; occurrences come from the schedule and
  exceptions. The generation endpoint backfills a missing `eventNo` on an existing series instance so an
  attendance import can target it.

Acceptance criteria:

1. Members import upserts and rejects duplicate/archived/purged rows with no partial write.
2. Contacts dedupe and a cross-member value fails the batch.
3. The formats contract covers both kinds; the workbook matches it.
4. The event-list import is gone and the attendance import still targets generated instances.
5. `verify` and `smoke` pass.

## Verification

| Gate              | Command                                                  | Result                                        |
| ----------------- | -------------------------------------------------------- | --------------------------------------------- |
| Protected guard   | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                                |
| Format/lint/types | `npm run format:check` / `lint` / `typecheck`            | pass                                          |
| Tests             | `npx vitest run --no-file-parallelism`                   | pass — 17 files, 190 passed / 3 skipped (193) |
| Build             | `npm run build`                                          | pass                                          |
| Smoke             | `npm run smoke`                                          | pass — 9/9                                    |

## Review

Independent Tier 2 review on `deepseek-v4-pro:0813`: **Standards PASS**, **Spec PASS**, two P2s and no
P1s. Fixed before acceptance:

- Upserts no longer null optional fields when a cell is blank; a blank optional cell leaves the stored
  value unchanged, and the spec and template Notes say so.
- The cross-member contact error no longer echoes the raw phone/email value (row number + kind only).

The `tests/api/members.test.ts` OpenAPI assertion was updated for the retired route (accepted).

## Acceptance

| #   | Criterion                                                        | Met | Evidence                          |
| --- | ---------------------------------------------------------------- | --- | --------------------------------- |
| 1   | Members import upsert + duplicate/archived/purged all-or-nothing | yes | `importMembers`; batch tests      |
| 2   | Contact dedupe; cross-member value fails                         | yes | contact tests                     |
| 3   | Formats contract + matching workbook                             | yes | registry; xlsx round-trip test    |
| 4   | Event-list import retired; attendance targets generated events   | yes | 404 test; backfill + import test  |
| 5   | `verify` and `smoke` pass                                        | yes | 190 passed / 3 skipped; smoke 9/9 |

Verdict: **ACCEPTED**.

## Deviations

- The event-list import's occurrence-refinement rule is removed from the spec; the pure
  `resolveOccurrences` branch remains for a future event-list import and is fed an empty list.
- The import batches kind keeps legacy `events` rows readable; only `members` and `attendance` are
  created.
