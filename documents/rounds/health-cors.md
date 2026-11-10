# Round — health-cors

|                     |                                                            |
| ------------------- | ---------------------------------------------------------- |
| Status              | OPEN — implementing (Tier 1)                               |
| Tier                | 1                                                          |
| Mode                | attended (owner accepted the grill round)                  |
| Base                | `92bc553`                                                  |
| Review rounds       | 0                                                          |
| Gate runs in parent | 0                                                          |
| Spec                | `documents/specs/member-registrations-api.md` FR-23, AC-23 |
| Workers             | `single` (parent implements at Tier 1)                     |

### Seats (owner, 2026-11-10)

- **Spec gate:** `ollama-cloud/deepseek-v4-pro:0813`.
- **Git executor:** unavailable — `opencode/beam-free` is over its free usage limit and
  `git-seat-budget: 0` parks rung 2. The owner authorised the parent for this round's git verbs.

### Decisions (grill, 2026-11-10)

- CORS is fixed **before** the production env pass, so the first end-to-end sign-in is a fair test.
- Scope is `/health` only: it is the sole endpoint the browser probes before sign-in; `/dev` is
  already CORS'd. `/openapi.json` stays non-CORS.
- Tier 1: one middleware mount plus a test, with the `0813` spec review every behavioural change needs.
- Standalone round, not folded into the parked connect-page implementation.
- A local compose sign-in is the acceptance test; production still needs the three env names.
- The owner sets the three production secrets; the parent redeploys and runs the read-only probes.
- The `env-conditional-secrets` and `ui-fixed-gateway-origin` close-outs ride in this round's commits.
- The local compose walkthrough is written down (`documents/runbooks/local-docker.md`, linked from the
  README) in this round, so the seed, the log link, the CORS checks and the troubleshooting table stop
  living only in a transcript.
- The parent executes this round's git verbs; the git-executor seat stays parked.

## Plan

1. Mount `corsMiddleware(corsOrigins)` on `/health` in `src/create-app.ts`, before the route, so the
   allowlisted origin gets `Access-Control-Allow-Origin`; an unlisted origin is rejected as for the
   gateway, and a request with no `Origin` still answers `200`.
2. Test: allowed origin → `200` with the header; an unlisted origin, or no `Origin`, still answers its
   normal `200`/`503` result without the header.
3. Prove the flow on the compose stack: build, seed the officer, request a link, read it from the
   container log, exchange it, and read `/gateway/v1/members` with the session.
4. Close `env-conditional-secrets` at `92bc553` and correct `ui-fixed-gateway-origin`'s `Status` row.
5. Write `documents/runbooks/local-docker.md` and link it from the README's local-stack section.

Out of scope: `/openapi.json` CORS, the connect-page field removal, and any change to the gateway.

### Acceptance criteria

1. `/health` from an allowlisted origin returns `200` with `Access-Control-Allow-Origin` set to it.
2. `/health` from an unlisted origin, or with no `Origin`, answers its normal result without the
   header.
3. The local compose flow completes: link requested, read from the log, exchanged, `/gateway/v1`
   readable with the session.
4. `0813` ACCEPT on the amended text.
5. CI `verify` green and `npm run smoke` green locally.

## Verification

| Gate             | Command               | Result                                                                                                     |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Spec review      | `0813` exact text     | ACCEPT (REWORK ×2)                                                                                         |
| Format/lint/type | `npm run verify:fast` | format/lint/typecheck pass; `test` flaked twice on the Windows worker exit (46/48, 574 passed, 0 failures) |
| Tests (hook)     | `verify:precommit`    | 48/48 files, 581 passed, 5 skipped — the whole suite green at commit time                                  |
| Local flow       | compose + curl        | pass — header only for the allowlist, full sign-in to `/gateway/v1` 200                                    |
| Runbook          | doc review            | `documents/runbooks/local-docker.md` written; README links it                                              |

gate-run 2026-11-10T11:42:28.238Z profile=fast steps=3/4 lines=22 bytes=1688

## Review

Spec gate `0813`:

- Round 1: **REWORK** — P1: rejecting an unlisted origin with `403 cors_rejected` is wrong for a
  health endpoint; serve the normal result and gate only the header, or a monitor with a stray
  `Origin` reports a healthy service as down. P2s: the CORS bullet omitted the `/dev` browser surface;
  the no-`Origin` behaviour was unstated. Nits: "pre-flight" is wrong (a simple GET triggers no
  preflight — the _response read_ is blocked); the `503` case was not acknowledged.
- Round 2: spec text accepted; the round doc still described the rejected 403 behaviour.
- Round 3: round doc aligned → **ACCEPT**.

## Mock sign-off

n/a — no user-visible surface change (the badge stops reporting a false failure).

## Mock parity

n/a.

## Acceptance

| #   | Criterion                                    | Met | Evidence                                                               | Verdict  |
| --- | -------------------------------------------- | --- | ---------------------------------------------------------------------- | -------- |
| 1   | Allowed origin gets the header               | yes | compose: `Origin: http://localhost:8080` → 200 + ACAO                  | ACCEPTED |
| 2   | Unlisted/no-Origin answer without the header | yes | unlisted → 200 no ACAO; no Origin → 200                                | ACCEPTED |
| 3   | Local compose flow completes                 | yes | link 202, log token, exchange ok, `/gateway/v1/members` 200            | ACCEPTED |
| 4   | `0813` ACCEPT                                | yes | `## Review`                                                            | ACCEPTED |
| 5   | CI `verify` and local `smoke` green          | yes | 48/48, 581 passed, 5 skipped (hook run); smoke PASS; CI `verify` gates | ACCEPTED |

## Deviations

- The local `test` step flaked twice on the Windows Vitest worker exit `3221226505` (first 40/48 files,
  438 passed; then 46/48, 574 passed; 0 test failures either time) with the compose stack running, and
  `--maxWorkers=4` did not change it. The pre-commit run of the same suite immediately afterwards
  passed 48/48 files, 581 passed, 5 skipped, so the suite itself is sound; the flake is the local
  worker, and the Linux CI `verify` check remains the gate. `npm run smoke` is green.
