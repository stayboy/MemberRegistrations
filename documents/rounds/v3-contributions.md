# Round - V3 phase 2: contributions and visitor gifts (ticket 21)

|        |                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| Status | OPEN                                                                                                               |
| Tier   | 2 - Reviewed                                                                                                       |
| Mode   | `unattended (auto-accept recommendations)`                                                                         |
| Base   | `dc436a2`                                                                                                          |
| Spec   | `member-registrations-events-offerings.md` (phase 2, amended 2026-11-05); `member-registrations-api.md` reconciled |
| Ticket | 21                                                                                                                 |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 21 records gifts. The contract settled before code: one endpoint for member and visitor
contributions with a required idempotency key, a date-gated expiry rule, the terms snapshot, a
server-generated `MR-` reference, HMAC-hashed visitor phones, a `no-store` history and a totals
endpoint that keeps member and visitor money separate.

The spec review settled the two ambiguities that mattered: the expiry gate is the **gift's
`sessionDate`**, not "today" — the `expired` flag only tells the UI/USSD not to offer the offering, so
a backdated manual gift inside the window stays recordable — and the visitor phone is HMAC-SHA-256
under `VISITOR_PHONE_PEPPER`, which is now production-required.

## Spec review

`deepseek-v4-pro:0813`, separate session. The first pass returned CHANGES REQUIRED on the expiry gate
conflict (today vs `sessionDate`), an unreconciled endpoints table, the `member_no`/`member_id` naming
and the unsalted hash; the second ACCEPTED after reconciliation; two wording nits (shared gift-target
checks, the pepper as a production secret) were then applied and confirmed.

Record: "Reviewed by deepseek-v4-pro build 0813 on 2026-11-05 — the phase-2 contribution spec is
approved: the expiry date-gate is reconciled with phase-1, the two specs agree on DTOs, routes, codes
and the `contributions` table, the visitor phone is HMAC-SHA-256 peppered (with
`VISITOR_PHONE_PEPPER` declared production-required) and never returned, and the gift-target checks are
stated once for member and visitor gifts alike, leaving no implementer guess."

## Verification

| Gate      | Command                                              | Result                                  |
| --------- | ---------------------------------------------------- | --------------------------------------- |
| Typecheck | `npm run typecheck`, `npm --prefix ui run typecheck` | pass                                    |
| Lint      | `npm run lint`, `npm --prefix ui run lint`           | pass                                    |
| Build     | `npm run build`                                      | pass                                    |
| Format    | `npm run format:check`                               | pass                                    |
| API tests | `npx vitest run --no-file-parallelism`               | pass - 21 files, 282 passed / 3 skipped |
| Smoke     | `npm run smoke`                                      | pass - 18 checks, migration exercised   |

The Windows fork-pool crash (`exit 3221226505`) recurred once with no assertion failures; the serialized
gate and a clean re-run were both green. Recorded as the known local flake.

## Review

`deepseek-v4-pro:0813`, read-only, uncommitted diff against `dc436a2`.

- **Verdict: ACCEPT**, after one CHANGES REQUIRED round.
- **P2 applied:** the list route let a calendar-invalid `from`/`to` reach Postgres and return `500`.
  It now calls `assertDate`, and `assertDate` itself verifies an ISO round-trip, so `2026-02-30` is
  `422` rather than silently normalising to 2 March. Every existing caller stays correct.
- **P2 applied:** `VISITOR_PHONE_PEPPER` fell back to the public default in production; the env loader
  now refuses to boot in production with that default.
- **P2 applied:** the idempotency lookup ran after target validation, so a retry failed once the
  member, event or offering had changed. It now runs first and returns the stored `200` for an
  identical payload; a different payload remains `409 idempotency_conflict`.
- **Nits applied:** a `(created_at desc, id desc)` index, the one-giver rule in the OpenAPI description,
  a no-`Location` assertion, and the backlog says "implemented", not "accepted".

## Acceptance

| #   | Criterion                                                                                   | Met | Evidence                                                                                |
| --- | ------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------- |
| 1   | A member contribution is created once per idempotency key; a repeat returns the same record | yes | repo + route tests, retry-after-state-change tests                                      |
| 2   | A visitor gives name + phone, receives a reference, and creates no member                   | yes | visitor tests, no member row                                                            |
| 3   | Visitor phones are hashed and never returned or logged                                      | yes | HMAC-SHA-256 under the pepper; DTO has no hash/phone; `tests/api/contributions.test.ts` |
| 4   | Totals aggregate members and visitors separately with no contact values                     | yes | `GET /v1/contributions/summary`, paid-only, grouped by currency                         |
| 5   | Amounts are integer minor units; zero or negative is rejected                               | yes | `amountMinor > 0` in schema, DB check and tests                                         |
| 6   | `npm run verify` and `npm run smoke` pass                                                   | yes | gates above                                                                             |

Verdict: **ACCEPTED**.

## Deviations

- **No `Location` header.** There is no GET-by-id route, so the response body (id + reference) is the
  receipt; the spec does not promise a Location.
- **The summary window filters `session_date`**, consistent with the history list, and emits no
  zero-value currency group.
- **The dev/test pepper is a public default**; production refuses to boot with it, and rotation changes
  every stored hash.
- **`assertDate` is now stricter for every caller** (imports included): impossible calendar dates are
  rejected instead of normalised.
- **The concurrent-duplicate (23505 → re-read) branch is untested**; it is hard to trigger
  deterministically, and the pre-insert path is covered.
