# Round — series to event generation

|         |                                                                |
| ------- | -------------------------------------------------------------- |
| Status  | CLOSED                                                         |
| Tier    | 2 — Reviewed                                                   |
| Base    | `6be452c`                                                      |
| Spec    | `documents/specs/member-registrations-api.md` (Event instance) |
| Workers | `single`                                                       |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 11: generate event instances from series occurrences, idempotently.

- **Migration `0007_event_no_counters`:** a per-year counter seeded from existing `EVT-<year>-<NNN>`
  numbers, so generated events get a unique, readable `eventNo`.
- **`EventRepository.generate(from, to)`:** for every non-archived series, resolve occurrences (schedule
  versions, cancelled and extra exceptions), skip existing `(seriesId, startDate)` pairs, and insert a
  single-session event inheriting the name, ministry and timezone, with `auditorium` / `00:00` defaults.
- **Route:** `POST /v1/events/generate?from&to`; `200 { created, skipped, eventIds }`.

Acceptance criteria:

1. Occurrences produce events with inherited fields.
2. Cancelled and extra exceptions are honoured.
3. Re-running adds nothing and never overwrites an existing event.
4. The generated events are visible per series.
5. `npm run verify` and `npm run smoke` pass.

## Verification

| Gate              | Command                                                  | Result                                        |
| ----------------- | -------------------------------------------------------- | --------------------------------------------- |
| Protected guard   | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                                |
| Format/lint/types | `npm run format:check` / `lint` / `typecheck`            | pass                                          |
| Tests             | `npx vitest run --no-file-parallelism`                   | pass — 17 files, 178 passed / 3 skipped (181) |
| Build             | `npm run build`                                          | pass                                          |
| Smoke             | `npm run smoke`                                          | pass — 9/9                                    |

## Review

Independent Tier 2 review on `deepseek-v4-pro:0813`: **Standards PASS**, **Spec PASS**, two P2s and no
P1s. Fixed before acceptance:

- A manually assigned `EVT-2026-NNN` can outrun the counter; generation now checks the minted number
  and takes the next one (bounded), instead of surfacing an unmapped `23505` as a `500`.
- The generation test now asserts ministry inheritance (`CHOIR` / `Choir`) and the counter-collision
  path.

## Acceptance

| #   | Criterion                                        | Met | Evidence                               |
| --- | ------------------------------------------------ | --- | -------------------------------------- |
| 1   | Occurrences produce events with inherited fields | yes | generation test; `generate` projection |
| 2   | Cancelled and extra exceptions honoured          | yes | exception generation test              |
| 3   | Re-run adds nothing; no overwrite                | yes | idempotency + rename-preservation test |
| 4   | Generated events visible per series              | yes | `GET /v1/events?seriesId=` test        |
| 5   | `verify` and `smoke` pass                        | yes | 178 passed / 3 skipped; smoke 9/9      |

Verdict: **ACCEPTED**.

## Deviations

- The UI bullet ("series detail shows the generated event for each occurrence") is served by the
  events list filtered by `seriesId`; the series-detail screen lands in ticket 18.
- The event-list import still exists; it is retired in the imports round now that generation can create
  series instances.
