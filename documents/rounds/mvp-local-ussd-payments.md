# Round — mvp-local-ussd-payments

|                     |                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Status              | OPEN                                                                                                         |
| Tier                | 2                                                                                                            |
| Mode                | attended (owner: "all as recommended", 2026-11-13)                                                           |
| Base                | `c0da262`                                                                                                    |
| Review rounds       | 0                                                                                                            |
| Gate runs in parent | 0                                                                                                            |
| Spec                | no behavioural spec change — the contracts are already specified; this round exercises them                  |
| Workers             | `single`                                                                                                     |
| Implementer         | worker ollama-cloud/deepseek-v4.1-flash:1017 (this session, the ranked worker seat: compose, smoke, runbook) |

## Plan

The local release smoke covers the register and not the other two writable subsystems: USSD and payments are
`USSD_ENABLED=true` and `PAYMENTS_ENABLED=true` in compose but nothing asserts them, so a broken HMAC path or a
dead USSD pipeline would ship unnoticed.

### The two contracts, as they stand

- **USSD** — `POST /ussd/session` with `X-USSD-Timestamp`, `X-USSD-Nonce` and `X-USSD-Signature`, where the
  signature is `HMAC-SHA256(secret, timestamp + nonce + rawBody)`, the timestamp must be within ±5 minutes, and
  a nonce is consumed once (`src/ussd/adapters.ts`). Body `{ phone, input, seq }`; a start frame is `input: ""`.
- **Payments** — `POST /v1/payments/callback` with `X-Payment-Signature = HMAC-SHA256(secret, rawBody)`. An
  unknown reference is a `404`; a bad signature is a `401` (`src/routes/payments.ts`).

### Changes

1. `docker-compose.yml`: explicit local `USSD_GATEWAY_SECRET` and `PAYMENT_GATEWAY_SECRET`, so the stack cannot
   drift onto a library default and the smoke and the app always agree (the same decision as the bearer).
2. `scripts/smoke-local.mjs`: five checks — a signed USSD start frame renders a menu, a bad USSD signature is
   `401`, a replayed nonce is `401`, a correctly signed payment callback reaches the repository (`404`, because
   the reference is unknown — a `401` would mean it never got past auth), and a bad payment signature is `401`.
3. `documents/runbooks/local-docker.md`: the two subsystems in the smoke section, and the two secrets in the
   configuration table.

### Why the payment check asserts 404

There is no seeding chain in the smoke (member → offering term → pledge → payment group). A correctly signed
callback with a `SMOKE-` reference reaches `handleCallback`, which answers `404` for an unknown reference; a
bad signature never reaches it and answers `401`. The `404` is therefore the evidence that HMAC, JSON parsing
and the schema all passed, and the `401` is the evidence that a wrong signature cannot get that far. The
matched-payment write path stays covered by the repository tests, not by the smoke.

### Proof

`docker compose up -d` after the env change, `npm run smoke:local` with the five new checks, the stack still
healthy, then `npm run verify` and the reviewer.

## Verification

`npm run smoke:local` on the restarted stack: **16/16 checks passed**, sample member `SMOKE-MWESCMYJ`. The five
new checks:

```
ok   a signed USSD start frame renders a menu
ok   the USSD endpoint refuses a bad signature
ok   a replayed USSD nonce is refused
ok   a signed payment callback reaches the repository
ok   the payment callback refuses a bad signature
```

`npm run verify` **7/7**:

gate-run 2026-11-13T09:46:58.679Z profile=full steps=7/7 lines=7 bytes=1054

`docker compose ps` after the env change: `db`, `app`, `ui` healthy, `migrate` exited 0.

## Review

Tier 2, independent seat `ollama-cloud/deepseek-v4-pro:0813` (09:4x local, outside the window).

**Verdict: ACCEPTED.** `Standards: PASS` (one P2), `Spec: PASS`, `Seat: consistent`.

The review confirmed the checks cannot pass for the wrong reason: the forged USSD frame fails the signature
length guard before any nonce is touched; the replay is refused by nonce consumption alone, because its
signature and timestamp are valid; and the payment `404` carries the reference in its `detail`, which an
unmounted route's `No route for POST /v1/payments/callback` cannot produce. It also confirmed the claim that
the matched-payment write stays with the repository tests (`tests/api/payment-groups.test.ts` asserts the paid,
failed and pledge-honoring paths against the database).

P2: the secrets are now hardcoded in compose and in the smoke's defaults, so a one-sided edit fails the smoke
closed but only at run time. Fixed with a cross-reference comment at the constants, as the review suggested,
and recorded here.

It also noted, out of scope: `src/config/env.ts` keeps `dev-only-*` defaults alongside the new
`local-development-*` compose values, so two naming families now describe the same secrets. No action this
round; worth folding into whichever round next touches `env.ts`.

Seat: consistent — the flash worker seat implemented, the pro seat reviewed, and the reviewer never authored.

## Mock sign-off

n/a — no visual surface.

## Mock parity

n/a — no surface changed.

## Acceptance

**ACCEPTED.**

| Criterion                                               | Evidence                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| The two subsystems are exercised by the release smoke   | 16/16, including the five new checks                                        |
| USSD: render, forged signature, nonce replay            | `smoke-local.mjs` `ussd()`; 200 with text, 401, 401                         |
| Payments: signed reaches the repository, forged refused | `smoke-local.mjs` `payments()`; 404 whose `detail` names the reference, 401 |
| Secrets are explicit and non-secret                     | compose `local-development-*`, ≥16 chars; the runbook lists both            |
| One command, one report                                 | `npm run smoke:local`; fail-closed at 2 when the stack is down              |

Not covered: the matched payment write (a seeding chain would rot; `tests/api/payment-groups.test.ts` owns it),
the USSD menu beyond the first frame, and the `/dev` simulator.

## Deviations

- The secrets are hardcoded in three places (compose, the smoke's defaults, and the library `dev-only-*`
  defaults in `src/config/env.ts`). The compose and smoke values must agree; a mismatch fails the smoke closed.
  A cross-reference comment records it; no mechanical guard exists.
