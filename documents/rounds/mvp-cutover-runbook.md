# Round — mvp-cutover-runbook

|                     |                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Status              | CLOSED - merged in #96 (`ae570f6`)                                                                  |
| Tier                | 1                                                                                                   |
| Mode                | `unattended (auto-accept recommendations)`                                                          |
| Base                | `3e51010`                                                                                           |
| Review rounds       | 0                                                                                                   |
| Gate runs in parent | 0                                                                                                   |
| Spec                | `documents/runbooks/vercel-deploy.md`; `documents/rounds/mvp-release-cutover.md`; `AGENTS.md` §7/§9 |
| Workers             | `single` (parent implements at Tier 1)                                                              |

### Seats (owner, 2026-11-09)

- **Plan gate:** `ollama-cloud/deepseek-v4-pro:0813` reads the runbook text; this is not a behavioural
  spec, so the 12:00–18:00 reviewer window does not apply.
- **Git executor:** rung 1 `opencode/beam-free`; rung 2 parked.

`git-seat-budget: 0 (rung 1 only; rung 2 parked)`

### Decisions (go-forward grill, 2026-11-09)

- Next round is the cutover runbook slice, not 24e or slice B. 24e and slice B **park** until the
  owner names the round and the migration/wire gate.
- Move now: the runbook, the read-only deploy-config check, and the env-inventory skeleton. Wait: the
  env presence/owners (fresh consent link), the PITR window and rehearsal, the alerting owner, the
  release window, production migrations, the production smoke and the tag.
- Runbook scope: `/health`, the read-only smoke set, the three rollback routes and thresholds, the
  first-fifteen-minutes checklist, and release identity.
- No mock (no user-visible surface) and no behavioural spec amendment; the durable record is the
  runbook plus the backlog row.
- Tier 1, parent implements; a `0813` plan-gate read of the runbook text.
- The git seat handles this round's commit, push, PR and merge (trial round 3).

## Plan

Goal: turn the cutover's only unblocked blocker into a written, exercised runbook, and surface every
owner input that still gates the release.

In scope:

1. Write `documents/runbooks/release-cutover.md`: topology, Pages prerequisite, release identity,
   pre-flight, the read-only smoke set, the first-fifteen-minutes checklist, the three rollback routes
   and thresholds, symptoms, and the exercise record.
2. Verify the deploy configuration read-only: `vercel.json` (region, `@vercel/node`, route rewrite),
   `deploy-pages.yml` (trigger, build path), the seven production env names, and the Pages site state.
3. Exercise the smoke set: `npm run smoke` locally; the production `/health`, `/openapi.json` and
   `/v1/members` 401 gate read-only.
4. Record the owner asks: Pages enabled, env consent link, alerting owner, release window, PITR slot.
5. Close or narrow the `documents/backlog.md` "MVP smoke and rollback runbook" row.

Out of scope: applying production migrations, the PITR drill, production smoke, the tag, 24e and
slice B.

### Acceptance criteria

1. The runbook covers `/health`, the smoke set, the three rollback routes with thresholds, the
   first-fifteen-minutes checklist and release identity.
2. The deploy config is verified read-only and every gap is recorded; the Pages 404 is a P1.
3. The smoke set is exercised and the results are recorded (local pass; production read-only).
4. A `0813` plan-gate read returns ACCEPT.
5. No mock and no behavioural spec change; the round records `n/a` for both.
6. `verify:fast` is green.
7. The owner asks are listed in priority order.

## Findings

- **P0 — the production API is down.** `GET /health`, `/openapi.json` and `/v1/members` all return
  `500 FUNCTION_INVOCATION_FAILED`. The Vercel runtime log shows
  `Error: RESEND_API_KEY is required when NODE_ENV=production` at `src/config/env.ts:67`; the function
  exits with status 1 on every request. The loader requires ten start-critical names
  (`API_BEARER_TOKEN`, `DATABASE_URL`, `RESEND_API_KEY`, `MAGIC_LINK_FROM`, `VISITOR_PHONE_PEPPER`,
  `USSD_GATEWAY_SECRET`, `USSD_PHONE_PEPPER`, `USSD_CODE_PEPPER`, `USSD_NALO_USER_ID`,
  `PAYMENT_GATEWAY_SECRET`) plus `USSD_ENABLED=false`, so the cutover's env input is a live outage,
  not a pre-flight. The 401 gate cannot be reached.
- **P1 — GitHub Pages is not configured.** Every `Deploy Pages` run since 2026-11-08 fails at
  `actions/configure-pages@v5` with `Get Pages site failed … 404`; the API `pages` endpoint returns
  404 and the repository has no Pages site. `https://stayboy.github.io/MemberRegistrations/` is 404.
  The UI half of the release cannot deploy until Pages is enabled with **Source: GitHub Actions**.
- `vercel.json` builds `src/index.ts` with `@vercel/node` in `fra1` and routes `/(.*)` to it — matches
  the runbook.
- `deploy-pages.yml` runs on push to `main` (and dispatch), builds `ui/dist`, uploads the artifact and
  deploys Pages.
- The README's seven-name table (lines 239–250) is the V2 set and omits the USSD/payment names.
  `src/config/env.ts:63-93` requires ten start-critical names plus `USSD_ENABLED=false` and the
  functional `UI_BASE_URL`; the P0 proves at least one is absent in production.

## Verification

| Gate             | Command                                                                | Result                                                                                             |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Deploy config    | read-only inspection of `vercel.json` / `deploy-pages.yml` / Pages API | pass — gaps recorded (P0/P1)                                                                       |
| Local smoke      | `npm run smoke`                                                        | pass — 77 checks                                                                                   |
| Production probe | `GET /health`, `/openapi.json`, `/v1/members`                          | FAIL — 500 on all three; UI 404                                                                    |
| Plan gate        | `0813` read of the runbook                                             | pass — REWORK → fixes → ACCEPT                                                                     |
| Format/lint/type | `npm run verify:fast`                                                  | format/lint/typecheck pass; test stopped by the Windows PGlite fork crash (526 passed, 0 failures) |
| CI               | `verify`, `ui`, `ui-e2e` on #96                                        | pass                                                                                               |

gate-run 2026-11-09T22:53:31.259Z profile=fast steps=3/4 lines=26 bytes=4234

## Review

Plan gate: `ollama-cloud/deepseek-v4-pro:0813` read the runbook, the round doc and the cutover doc.

- Round 1: **REWORK** — P1 (the "seven names" list was the V2 set; the loader requires ten
  start-critical names plus `USSD_ENABLED=false` and `UI_BASE_URL`, so the release would fail on the
  next name), P2s (no env-500 rollback route; the CORS row was misleading), nits (no UI→API check,
  unnamed 5xx source, on-call vs alerting owner, "likely" wording).
- Round 2: confirmed the P1 and the P2s; one P2 remained (the count said eleven, not ten).
- The count fix was applied verbatim; no further round.

Verdict: **ACCEPT** for the runbook text after the fixes.

## Owner asks (priority order)

1. **Set the missing production env names in Vercel** (P0). `src/config/env.ts:63-93` is authoritative;
   never send a value through chat or the repo.
2. **Enable GitHub Pages with Source: GitHub Actions** (P1). The token has admin; say the word if you
   want the API call made rather than doing it in Settings.
3. **Refresh the Vercel consent link** so the env presence/owners check can run.
4. **Name the alerting owner** for the first-fifteen-minutes checklist.
5. **Name the release window and the Neon PITR window + rehearsal slot.**

## Mock sign-off

n/a — no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                      | Met | Evidence                                                                   | Verdict  |
| --- | ---------------------------------------------- | --- | -------------------------------------------------------------------------- | -------- |
| 1   | Runbook covers health, smoke, rollback, 15 min | yes | `documents/runbooks/release-cutover.md`                                    | ACCEPTED |
| 2   | Deploy config verified; P0/P1 recorded         | yes | `## Findings` P0/P1                                                        | ACCEPTED |
| 3   | Smoke set exercised and recorded               | yes | local 77 pass; production 500/404 recorded                                 | ACCEPTED |
| 4   | `0813` plan gate ACCEPT                        | yes | `## Review`                                                                | ACCEPTED |
| 5   | No mock and no behavioural spec change         | yes | `## Mock sign-off` / `## Mock parity`                                      | ACCEPTED |
| 6   | `verify:fast` green                            | yes | CI `verify`, `ui`, `ui-e2e` pass on #96; local fork crash is environmental | ACCEPTED |
| 7   | Owner asks listed                              | yes | `## Owner asks`                                                            | ACCEPTED |

## Deviations

- The Pages rollback and the Vercel production rollback are paper-only until the release window; the
  first real use of both routes is at cutover.
- The runbook's alerting owner is a placeholder until the owner names it.
