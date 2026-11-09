# Runbook — MVP release cutover

How to ship `main` to production and how to react in the first fifteen minutes. This complements
`documents/runbooks/vercel-deploy.md` (deploy commands, env, rotation, symptoms); it does not repeat
them.

## Topology

| Half | Host                                                                    | Trigger                                  | URL                                                 |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| API  | Vercel, `mind-logs/member-registrations`, region `fra1`, `@vercel/node` | git-linked: push to `main`               | `https://member-registrations-mind-logs.vercel.app` |
| UI   | GitHub Pages, `deploy-pages.yml`                                        | push to `main` (and `workflow_dispatch`) | the Pages site URL, recorded at cutover             |

**Pages prerequisite:** the repository must have Pages enabled with **Source: GitHub Actions**. Without
it, `actions/configure-pages` fails with `Get Pages site failed` / HTTP 404 and the UI half never
deploys. On 2026-11-09 every `Deploy Pages` run since 2026-11-08 failed for this reason; enabling
Pages is an owner action in **Settings → Pages → Source: GitHub Actions**, or an admin API call.

## Release identity

1. Annotated tag `v0.1.0-mvp` on the release commit.
2. Record in the cutover round: the release commit SHA, both deployment URLs, and the SHA each host
   reports.
3. UI base path is `/MemberRegistrations/`; the Vite build assumes it.

## Pre-flight (T−1 day)

- [ ] `verify`, `ui` and `ui-e2e` green on the release commit.
- [ ] Every production-required name is set in Vercel, each with an owner. `src/config/env.ts:63-93`
      is authoritative: `API_BEARER_TOKEN`, `DATABASE_URL`, `RESEND_API_KEY`, `MAGIC_LINK_FROM`,
      `VISITOR_PHONE_PEPPER`, `USSD_GATEWAY_SECRET`, `USSD_PHONE_PEPPER`, `USSD_CODE_PEPPER`,
      `USSD_NALO_USER_ID`, `PAYMENT_GATEWAY_SECRET` (each must differ from its dev default), plus
      `USSD_ENABLED=false` and the functional `UI_BASE_URL`. Names and presence only — never a value.
      The README's seven-name table is the V2 set and omits the USSD/payment names.
- [ ] Pages enabled with Source: GitHub Actions, and the latest `Deploy Pages` run green.
- [ ] Migrations applied by the owner with `npm run db:migrate` against the production `DATABASE_URL`;
      the applied set recorded.
- [ ] Neon PITR window known and one restore rehearsal completed into a scratch branch, never over
      production; restored row counts and recovery time recorded.
- [ ] Alerting destinations and the paged owner recorded (Vercel/Neon notifications plus the
      five-minute `/health` probe).
- [ ] `npm run smoke` passes locally (compiled server, PGlite).

## Smoke set (read-only)

| Check              | Command                                                     | Pass                                      |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------- |
| Health             | `curl.exe -s -o NUL -w "%{http_code}" <api>/health`         | `200`; body `{status:"ok",uptimeSeconds}` |
| Health, DB down    | same, with the database unreachable                         | `503` problem `database_unavailable`      |
| Contract           | `curl.exe -s <api>/openapi.json`                            | `200`, `info.version` present             |
| Gate alive         | `curl.exe -s -o NUL -w "%{http_code}" <api>/v1/members`     | `401` without a token                     |
| Authenticated read | `GET <api>/v1/offerings/summary` with the owner-held bearer | `200`                                     |
| UI                 | load the Pages URL                                          | sign-in screen renders, no console error  |
| UI→API             | a sign-in attempt reaches `/auth/*` through the gateway     | non-5xx auth response; no CORS error      |

`/health` runs `select 1`; it is the only check that proves the database path.

## First fifteen minutes

| Time | Check                                                          | Owner         | Action                              |
| ---- | -------------------------------------------------------------- | ------------- | ----------------------------------- |
| T+0  | Merge to `main`; watch both deployments                        | release owner | record both URLs and SHAs           |
| T+2  | `/health` 200; UI loads; a sign-in attempt reaches `/auth/*`   | release owner | if either fails, go to Rollback     |
| T+5  | 5xx rate < 2% (Vercel function error-rate view); `/health` 200 | release owner | record the value                    |
| T+10 | 5xx rate < 2% (Vercel function error-rate view); `/health` 200 | release owner | record the value                    |
| T+15 | Rollback-or-keep decision                                      | release owner | record the decision and who made it |

"Release owner" is the on-call until the alerting owner is named.
Alerting owner: `<pending — owner input>`.

## Rollback

Fix forward for schema and data bugs: migrations are forward-only and there are no down migrations.

| Route           | When                                        | How                                                                                                                    |
| --------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| API deployment  | `/health` fails, or 5xx > 2% for 10 minutes | Promote the previous Vercel production deployment in the dashboard (or `vercel rollback`); record the restored URL/SHA |
| UI artifact     | the Pages build or the page is broken       | `gh workflow run deploy-pages.yml --ref <previous-good-sha>`; record the run and the served SHA                        |
| Schema/data bug | a bad migration or wrong data               | Corrective forward migration through a PR; never edit history                                                          |
| Data loss       | rows destroyed or corrupted                 | Neon PITR to a new branch, verify row counts, then point `DATABASE_URL` at it; never restore over production           |

After any rollback: record the route, the trigger value, the restored SHA/URL, and the follow-up PR.

An env-incomplete `500` is **not** a deployment regression: set the missing names in Vercel and
redeploy. Promoting the previous deployment repeats the same failure.

## Symptoms

| Symptom                                                                          | Cause                                        | Fix                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Get Pages site failed … 404`                                                    | Pages not enabled / not Actions source       | Settings → Pages → Source: GitHub Actions                                                |
| `500 FUNCTION_INVOCATION_FAILED` / `<NAME> is required when NODE_ENV=production` | production env incomplete                    | set the missing name(s) in Vercel and redeploy; do **not** promote a previous deployment |
| Production 302 to `vercel.com/sso-api`                                           | Vercel Authentication covers production      | set protection to preview only                                                           |
| `/health` 503 `database_unavailable`                                             | DB unreachable / bad `DATABASE_URL`          | check Neon; do not roll back before confirming the database                              |
| API 401 on every call                                                            | bearer rotated or missing                    | `vercel-deploy.md` → Rotating the API token                                              |
| UI loads but API calls fail cross-origin                                         | a specific origin is rejected by the gateway | check `CORS_ALLOWED_ORIGINS`; the default already includes the Pages origin              |

## Exercise record

- Local `npm run smoke`: pass (77 checks, compiled server, PGlite).
- Production probes on 2026-11-09: **500** on `/health`, `/openapi.json` and `/v1/members`. The Vercel
  runtime log says `RESEND_API_KEY is required when NODE_ENV=production`; the 401 gate could not be
  reached. The remaining USSD/payment names (`USSD_GATEWAY_SECRET`, `USSD_PHONE_PEPPER`,
  `USSD_CODE_PEPPER`, `USSD_NALO_USER_ID`, `PAYMENT_GATEWAY_SECRET`) are absent until set; `env.ts`
  throws on each in order. This is the P0 below.
- Preview rollback and Pages artifact swap: **paper-only** until the release window; the first real
  use of those routes is at cutover.
- The Pages prerequisite failed on 2026-11-09 (site not configured); `https://stayboy.github.io/MemberRegistrations/`
  is 404 and the UI half is blocked until Pages is enabled.

## Current state (2026-11-09)

- **P0: production API down.** Missing `RESEND_API_KEY` and the USSD/payment names in the Vercel
  production environment; the function exits before serving. Do not treat the release as "not yet
  started" — production is deployed and failing.
- **P1: UI not deployed.** Pages is not configured; every `Deploy Pages` run fails at
  `configure-pages`.
- Local gates are green; the gap is configuration, not code.
