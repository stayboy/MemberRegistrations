# Round - series authoring (18b)

|        |                                                          |
| ------ | -------------------------------------------------------- |
| Status | OPEN                                                     |
| Tier   | 2 - Reviewed                                             |
| Mode   | `unattended (auto-accept recommendations)`               |
| Base   | `5af7594`                                                |
| Spec   | `documents/specs/member-registrations-ui.md` FR-42/FR-43 |
| Ticket | 18b                                                      |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

The authoring half of FR-42 that ticket 18 deliberately left out.

- **Create** (`/events/series/new`) — name, ministry, timezone, description and the first schedule
  version (`effectiveFrom`, `rrule`, optional `endsOn`).
- **Edit** (`/events/series/:id/edit`) — identity only; schedule versions are appended on the detail
  page and are never rewritten here.
- **Archive / restore** on the detail — a confirmation, then `PUT /v1/series/:id` with `{ archived }`;
  an archived series stays read-only and restoring brings the append actions back. No hard delete.
- Validation mirrors the API: name required and ≤120, `rrule` 6–200 **and** starting `FREQ=` with a
  supported frequency and no `COUNT`/`UNTIL`, a real `effectiveFrom` on or before `endsOn`, a non-empty
  timezone. The timezone list offers the common zones plus an "Other" free-text path so an off-list IANA
  zone round-trips; the form defaults to the church's local zone while the API defaults to UTC.

## Verification

| Gate                              | Command                                | Result                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| UI tests                          | `npm --prefix ui run test`             | pass - 23 files, 261 tests              |
| Typecheck / lint / build / format | `npm --prefix ui run ...`              | pass                                    |
| Root tests (serialized)           | `npx vitest run --no-file-parallelism` | pass - 17 files, 206 passed / 3 skipped |

## Review

`deepseek-v4-pro:0813`: **ACCEPT**, no P1, one P2 and five nits.

- **P2 applied** — the form's RRULE check only mirrored the Zod length, so it accepted `abcdef` or
  `FREQ=D`, which the domain validator rejects; a test even asserted `FREQ=D` was valid. The check now
  mirrors the domain rule (prefix, supported frequency, no `COUNT`/`UNTIL`) and the tests cover the
  rejection cases.
- **Nits applied** — the edit prefill no longer carries a meaningless `effectiveFrom`; the back action
  uses the router; the timezone "Other" decision is recorded on the ticket, including the form-vs-API
  default; and the missing boundary tests (5 vs 6 characters, a malformed `endsOn`, blank → `null`
  trimming) were added.

## Acceptance

| #   | Criterion                                                                  | Met      | Evidence                                  |
| --- | -------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| 1   | Create a series with identity and a first schedule; it appears in the list | yes      | `SeriesFormPage`, `toCreateSeriesPayload` |
| 2   | Edit changes identity fields only                                          | yes      | `toUpdateSeriesPayload` omits `schedule`  |
| 3   | Archive/restore with confirmation; read-only while archived                | yes      | detail actions + `ConfirmDialog`          |
| 4   | Validation mirrors the API                                                 | yes      | `series-form.ts` (+ tests)                |
| 5   | Mutations invalidate the list and detail; no hard delete                   | yes      | `['series', baseUrl]` prefix              |
| 6   | Screens match the local mocks                                              | deferred | pixel parity is ticket 19                 |

Verdict: **ACCEPTED**.

## Deviations

- **The form's timezone default differs from the API's.** The UI defaults to `Africa/Lagos` and always
  sends an explicit value; the API defaults to `UTC` when the field is omitted. Recorded on the ticket.
- **Pixel-level mock parity** stays with ticket 19.
