# Round — mvp-release-cutover

|                     |                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | PARKED - production postponed (owner, 2026-11-10); the target is the local dev MVP in `mvp-local.md` |
| Tier                | 2                                                                                                    |
| Mode                | `attended` (owner supplies the values and the release go)                                            |
| Base                | `cacbee0`                                                                                            |
| Review rounds       | 0                                                                                                    |
| Gate runs in parent | 1 (`verify:fast`)                                                                                    |
| Spec                | `AGENTS.md` §7/§9; `documents/backlog.md` (MVP backup, alerting and rollback rows)                   |
| Workers             | `single`                                                                                             |

### Seats (owner, 2026-11-09)

- **Reviewer:** `ollama-cloud/deepseek-v4-pro:0813` is the default. `cline-pass/cline-pass/mimo-v2.6-pro`
  is admissible when **either** the 12:00–18:00 local window applies **or** the ollama weekly limit
  makes 0813 unavailable; the fallback is recorded with `fallbackReason`.
- **Worker:** `ollama-cloud/deepseek-v4.1-flash:1017` first choice; `cline-pass/cline-pass/deepseek-v4.1-flash-1017`
  in the same window or when the ollama weekly limit hits.

### Decisions (grill, 2026-11-09)

- Order: the Headcount mock is re-authored and signed first, then this cutover; Headcount code follows
  the release. Single worker; no parallel tracks.
- Deploy trigger: merging to `main` is the release trigger. The UI deploys to GitHub Pages on push
  (`deploy-pages.yml`); the API is Vercel git-linked. Record both deployment URLs and commit SHAs.
- Secrets: the owner sets values in Vercel; the agent reads names and presence only, never values.
- Migrations: the owner runs `npm run db:migrate` with the production `DATABASE_URL`; the agent
  verifies the applied set read-only.
- PITR: one restore rehearsal into a Neon branch, with restored row counts and recovery time recorded.
- Alerting: Vercel and Neon notifications plus an external 5-minute probe on `/health`, with a named
  owner; a GitHub Actions cron is the fallback if no monitor account is created.
- Rollback: previous Vercel deployment and previous Pages artifact when `/health` fails or 5xx exceeds
  2% for 10 minutes; fix forward for schema/data bugs (no down migrations); Neon restore only for
  data loss.
- Release identity: annotated tag `v0.1.0-mvp` on the release commit plus the note in this doc.
- Env set: `src/config/env.ts:63-93` (the loader), not the README's seven-name V2 table.

## Plan

Goal: turn the three MVP release blockers in `documents/backlog.md` into a rehearsed cutover, then
deploy `main` to production. This round changes configuration and operations, not application
behaviour; it has no user-visible surface, so no mock applies.

In scope:

1. **Production environment and secrets** — confirm every production-required name is present in the
   Vercel project. `src/config/env.ts:63-93` is authoritative: `API_BEARER_TOKEN`, `DATABASE_URL`,
   `RESEND_API_KEY`, `MAGIC_LINK_FROM`, `VISITOR_PHONE_PEPPER`, `USSD_GATEWAY_SECRET`,
   `USSD_PHONE_PEPPER`, `USSD_CODE_PEPPER`, `USSD_NALO_USER_ID`, `PAYMENT_GATEWAY_SECRET`, plus
   `USSD_ENABLED=false` and the functional `UI_BASE_URL`. Record the owner of each; no value enters
   the repo, a log or this transcript. The README's seven-name table is the V2 set.
2. **Migrations** — apply the embedded migrations with the tracked runner (`npm run db:migrate`) and
   record the applied set on the production database.
3. **Backup and restore drill** — confirm Neon's PITR window, restore one point into a scratch
   branch/database (never over production), and record restored row counts and the recovery time.
4. **Uptime and error alerting** — watch `/health` (which checks the database) and configure the
   Vercel/Neon notifications; record the destination and the owner who is paged.
5. **Smoke and rollback runbook** — write the runbook, exercise it once, and record the thresholds
   for the three routes: previous Vercel deployment + Pages artifact, corrective forward migration,
   Neon restore.
6. **Deploy and production smoke** — merge the release commit, watch both deployments, run the
   read-only production checks, tag `v0.1.0-mvp`, and record the release.

Out of scope: application behaviour, schema changes, the Headcount dialog round (separate), 24e,
Redis/aggregate materialisation and the giving trend.

### Owner inputs (gating)

| Input                             | Why it gates                                                         | Value                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Production env and secrets        | the function cannot start without the bearer, DB URL and the peppers | ten start-critical names (`env.ts`); production 500 `RESEND_API_KEY is required`; values NOT set; owners pending |
| Release window                    | migrations and merge need a low-traffic slot with the owner          | pending                                                                                                          |
| Neon PITR window + rehearsal slot | the restore drill needs the real window and a scratch target         | pending                                                                                                          |
| Alerting destination and owner    | nothing watches `/health` today                                      | pending                                                                                                          |
| Rollback thresholds               | decides rollback vs forward fix vs restore under pressure            | decided: `/health` fail or 5xx > 2% for 10 min; restore only on loss                                             |

### Acceptance criteria

1. Every production-required name in `src/config/env.ts:63-93` is present in Vercel with an owner, and no secret
   is committed.
2. The production migrations are applied by `npm run db:migrate` and the applied set is recorded.
3. One PITR restore rehearsal completes on a Neon branch with restored row counts and recovery
   time recorded; production was not overwritten.
4. `/health` is watched and the Vercel/Neon notifications reach a named destination and owner.
5. The smoke/rollback runbook exists and was exercised once, with the three rollback routes and
   thresholds written down.
6. The production smoke passes against the deployed API and UI URLs.
7. The release commit is recorded with both deployment URLs and SHAs, `v0.1.0-mvp` is tagged, and the
   `verify`/`ui`/`ui-e2e` checks are green on that commit.

## Verification

| Gate                  | Command                                         | Result     |
| --------------------- | ----------------------------------------------- | ---------- |
| Format/lint/type/test | `npm run verify:fast`                           | pass (4/4) |
| Production smoke      | `npm run smoke` (against the deployed base URL) | pending    |

gate-run 2026-11-09T13:31:17.400Z profile=fast steps=4/4 lines=4 bytes=514

## Mock sign-off

n/a — no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                                          | Met     | Evidence | Verdict |
| --- | ------------------------------------------------------------------ | ------- | -------- | ------- |
| 1   | Production env names present, owners recorded, no secret committed | pending |          | PARKED  |
| 2   | Production migrations applied by the tracked runner                | pending |          | PARKED  |
| 3   | PITR restore drill on a Neon branch with counts and recovery time  | pending |          | PARKED  |
| 4   | `/health` watched; notifications reach the named owner             | pending |          | PARKED  |
| 5   | Smoke/rollback runbook written and exercised once                  | pending |          | PARKED  |
| 6   | Production smoke passes against both deployments                   | pending |          | PARKED  |
| 7   | Release commit recorded, `v0.1.0-mvp` tagged, checks green         | pending |          | PARKED  |

## Deviations

- **2026-11-09 incident (P0/P1).** Production `/health`, `/openapi.json` and `/v1/members` return
  `500 FUNCTION_INVOCATION_FAILED`; the Vercel runtime log is `RESEND_API_KEY is required when
NODE_ENV=production` (`src/config/env.ts:67`), so the function exits before serving. The UI is 404
  because GitHub Pages is not configured (`configure-pages` 404 on every run since 2026-11-08). Both
  are owner-configuration fixes, not code. Recorded by `mvp-cutover-runbook`.
- The values are not supplied yet; the round stays OPEN until the four pending inputs are recorded.
- The env set is the loader's, not the README's: `src/config/env.ts:63-93` requires the ten
  start-critical names plus `USSD_ENABLED=false` and the functional `UI_BASE_URL`. The earlier
  seven-name correction (README lines 239–247) was the V2 set and omitted the USSD/payment names.
