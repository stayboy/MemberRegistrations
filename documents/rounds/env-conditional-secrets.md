# Round — env-conditional-secrets

|                     |                                                                         |
| ------------------- | ----------------------------------------------------------------------- |
| Status              | CLOSED - merged in #99 (`92bc553`)                                      |
| Tier                | 2 (auth-adjacent config, payment callback surface)                      |
| Mode                | attended (owner accepted the grill round)                               |
| Base                | `335ae67`                                                               |
| Review rounds       | 0                                                                       |
| Gate runs in parent | 0                                                                       |
| Spec                | `documents/specs/member-registrations-api.md` §Deployment, AC-29, AC-30 |
| Workers             | `worker` implements; separate `code-review` pass                        |

### Seats (owner, 2026-11-10)

- **Spec gate:** `ollama-cloud/deepseek-v4-pro:0813` — ACCEPT after two rework rounds.
- **Worker:** `ollama-cloud/deepseek-v4.1-flash:1017`.
- **Git executor:** rung 1 `opencode/beam-free`.

`git-seat-budget: 0 (rung 1 only; rung 2 parked)`

### Decisions (grill, 2026-11-10)

- USSD and payment are both pending, so their secrets must stop being required.
- `USSD_ENABLED=false` (default) no longer requires `USSD_GATEWAY_SECRET`, `USSD_PHONE_PEPPER`,
  `USSD_CODE_PEPPER` or `USSD_NALO_USER_ID`. The USSD entries already answer `503 ussd_disabled`
  before any HMAC check, so the defaults are inert.
- `PAYMENT_GATEWAY_SECRET` cannot simply be defaulted: `/v1/payments/callback` is mounted before the
  bearer gate and is authenticated **only** by HMAC, so a known dev secret would let anyone who read
  the repo forge a callback. A new `PAYMENTS_ENABLED` (default `false`) keeps the route unmounted
  (`404`) and the secret unrequired.
- `VISITOR_PHONE_PEPPER` stays required — contributions and pledges hash visitor phones.
- The production guard rejecting `USSD_ENABLED=true` is retained; the `when true` requirements are
  future-only (OS-3).

## Plan

1. `src/config/env.ts`: add `PAYMENTS_ENABLED` (`'true' | 'false'`, default `'false'`, transformed to
   boolean); move the four USSD production checks inside `if (env.USSD_ENABLED)`; move the payment
   secret check inside `if (env.PAYMENTS_ENABLED)`; keep the `USSD_ENABLED must be false in
production` throw.
2. `src/create-app.ts`: add `paymentsEnabled?: boolean` to `AppOptions` (default from
   `process.env.PAYMENTS_ENABLED === 'true'`); mount the raw-body parser and `paymentsRouter` only
   when enabled, and register an explicit `app.all('/v1/payments/callback', notFoundHandler)` in the
   `else` branch so a bearer-less provider callback gets `404`, not `401`.
3. `src/index.ts`: pass `paymentsEnabled: env.PAYMENTS_ENABLED`.
4. `tests/helpers/app.ts`: add `paymentsEnabled?: boolean`; default it **enabled** in `createTestApp`
   (as `ussd.enabled` already is), and add a disabled variant alongside
   `createDisabledUssdTestApp`.
5. Tests: production boots with only `API_BEARER_TOKEN`, `DATABASE_URL`, `RESEND_API_KEY`,
   `MAGIC_LINK_FROM`, `VISITOR_PHONE_PEPPER`; `USSD_ENABLED=true` with dev defaults still throws;
   AC-29 (404 with and without a signature, including a dev-default signature); AC-30 (`503` for
   `/ussd/session` and `/ussd/nalo` with no, valid and dev-default signatures).

Out of scope: re-enabling USSD or payments, the OpenAPI document's unconditional listing (stated in
the spec), and any UI.

### Acceptance criteria

1. A production boot succeeds with only the three required names plus the two Resend values.
2. `USSD_ENABLED=true` in production still throws the aggregator guard (after the secret checks);
   outside production the defaults stay usable, so a developer can drive the simulator.
3. `PAYMENTS_ENABLED` unset or `false` → `/v1/payments/callback` is `404` even with a signature made
   with the development secret; nothing is written.
4. `PAYMENTS_ENABLED=true` → the callback behaves exactly as today (existing suites pass unchanged).
5. USSD disabled → `/ussd/session` and `/ussd/nalo` answer `503` before any HMAC check.
6. No secret, token or member datum is logged or committed.
7. `npm run verify` green; independent code review ACCEPT.

## Verification

| Gate             | Command           | Result                           |
| ---------------- | ----------------- | -------------------------------- |
| Spec review      | `0813` exact text | ACCEPT                           |
| Format/lint/type | `npm run verify`  | pass — `verify:fast` 4/4         |
| Smoke            | `npm run smoke`   | pass — needed `PAYMENTS_ENABLED` |
| Code review      | independent pass  | Spec pending; Standards ACCEPT   |

gate-run 2026-11-10T10:37:24.869Z profile=fast steps=4/4 lines=4 bytes=514

## Review

Spec gate `0813`: REWORK (P1: the production USSD guard made the `when true` clause unreachable;
`paymentsEnabled` had no wiring and the callback suites would 404; P2: the disabled-gate invariant was
unstated; "four USSD secrets" mislabels a client identifier; nits on AC-30, API Contracts, OpenAPI,
`USSD_NALO_MAX_MSG_CHARS` and the dev simulator) → fixes → REWORK (the simulator returns `404` in
production, not `503`) → **ACCEPT**.

Code review (two independent passes on `git diff 335ae67`):

- **Spec**: REWORK — P1: `scripts/smoke.mjs` boots with `USSD_ENABLED=true` but not
  `PAYMENTS_ENABLED`, so the callback check now 404s and `npm run smoke` fails. P2: the five-marker
  env test is regression rather than fail-before. → both addressed → **ACCEPT**.
- **Standards**: ACCEPT, one P2 — the "valid signature" frame in the USSD suite was signed with the
  wrong secret and proved nothing; replaced with a frame signed with the disabled instance's own
  secret. Nits on two comments applied.

## Mock sign-off

n/a — no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                    | Met | Evidence                                             | Verdict  |
| --- | -------------------------------------------- | --- | ---------------------------------------------------- | -------- |
| 1   | Production boots with three required names   | yes | `tests/config/env.test.ts` boot case                 | ACCEPTED |
| 2   | USSD guard retained; defaults still rejected | yes | aggregator message asserted exactly                  | ACCEPTED |
| 3   | Payments disabled → 404, no write            | yes | AC-29, unsigned and dev-default signature            | ACCEPTED |
| 4   | Payments enabled → unchanged behaviour       | yes | callback suites pass; helper defaults enabled        | ACCEPTED |
| 5   | USSD disabled → 503 before HMAC              | yes | AC-30, both entries, would-verify frame              | ACCEPTED |
| 6   | No secret logged or committed                | yes | both reviews; only public `dev-only-*` defaults used | ACCEPTED |
| 7   | `verify` green; code review ACCEPT           | yes | `verify:fast` 4/4, `smoke` PASS, Spec + Standards    | ACCEPTED |

## Deviations

- **Git seat unavailable.** `opencode/beam-free` returned "Free usage limit reached" on the first
  brief, and `git-seat-budget: 0` leaves rung 2 parked, so the policy parks the action. The owner
  authorised the **parent** to run commit, push, PR and merge for this round (2026-11-10); the seat
  trial is interrupted, not extended.

- The OpenAPI document keeps listing `/v1/payments/callback` when payments are disabled; the runtime
  404s. Recorded in the spec rather than made conditional.
