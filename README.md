# MemberRegistrations API

Member registration lookup and CRUD for the church register, with attendance derived from event
series and imported attendance registries. Built with **Express 5**, **TypeScript**, and **Node.js
24**, persisted in **Postgres (Neon)**, and deployed as a single Vercel Function.

- Spec: [`documents/specs/member-registrations-api.md`](documents/specs/member-registrations-api.md)
- Contract: `GET /openapi.json` (OpenAPI 3.1, generated from the Zod schemas)
- Tests: 64 Vitest + Supertest cases — domain rules, full HTTP surface, real Postgres via PGlite

Attendance is **modelled, not transcribed**. A series declares a recurrence; occurrences are derived
from the schedule and refined by imported event lists; a member's record reports
`attended` / `expected` per series (e.g. `Sunday Main English Service — 2 of 5`).

## Quick start

```bash
npm install
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
npm run dev               # http://localhost:3000
```

With no `DATABASE_URL`, the app starts an in-process **PGlite** database and applies migrations on
boot. That is instant and needs no Docker, but the data is thrown away when the process exits. Point
`DATABASE_URL` at a real Postgres (local or Neon) to keep it:

```bash
npm run db:migrate        # explicit; never runs on request
npm run dev
```

```bash
curl http://localhost:3000/health
curl http://localhost:3000/openapi.json

# Create a series first: attendance is derived from it.
curl -X POST http://localhost:3000/v1/series \
  -H "Authorization: Bearer change-me-in-production" \
  -H "X-Actor-Id: admin" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sunday Main English Service",
    "description": "08:00, English",
    "schedule": { "effectiveFrom": "2026-01-04", "rrule": "FREQ=WEEKLY;BYDAY=SU" }
  }'

curl -X POST http://localhost:3000/v1/members \
  -H "Authorization: Bearer change-me-in-production" \
  -H "X-Actor-Id: admin" \
  -H "Content-Type: application/json" \
  -d '{
    "memberNo": "M-1001",
    "firstName": "Ama",
    "lastName": "Mensah",
    "gender": "female",
    "joinedOn": "2026-01-01",
    "contacts": [{ "kind": "email", "value": "ama@example.com" }],
    "ministries": ["CHOIR"]
  }'
```

## Local Docker stack

An optional, production-shaped local path: Postgres, the compiled API, and the built UI behind
nginx. `npm run dev` + `npm run ui:dev` remain the quick loop, and production still deploys to
GitHub Pages + Vercel.

```bash
docker compose build
docker compose up -d        # UI http://localhost:8080, API http://localhost:3000
docker compose exec app node dist/authn/cli.js add local@church.test "Local Officer" local
curl -X POST http://localhost:3000/auth/magic-link -H "Content-Type: application/json" \
  -d '{"email":"local@church.test"}'
```

The magic link is printed by the console mailer in `docker compose logs app`; open it against
`http://localhost:8080/#/connect?token=...`. The volume keeps the seeded officer across
`docker compose down`.

Inspect data with `docker compose exec db psql -U postgres -d member_registrations`; reset with
`docker compose down -v`. Personal tweaks go in a git-ignored `docker-compose.override.yml`; to use
another Postgres, override `DATABASE_URL` for `app` and `migrate` there. Docker is not built in CI:
re-verify with `docker compose build && docker compose up -d`, then `curl -s
http://localhost:3000/health`.

The full walkthrough — seeding an officer, reading the magic link from the log, the CORS checks and
troubleshooting — is [`documents/runbooks/local-docker.md`](documents/runbooks/local-docker.md).

## API

Server-to-server callers use `/v1` with `Authorization: Bearer <API_BEARER_TOKEN>`; every write also
requires `X-Actor-Id`. Browser clients use the session gateway instead and never receive the API
bearer.

### Sign-in and the gateway

| Method | Path               | Result                                                       |
| ------ | ------------------ | ------------------------------------------------------------ |
| `POST` | `/auth/magic-link` | `202`; emails a single-use link to an active officer         |
| `POST` | `/auth/exchange`   | Exchange the link token for a short-lived session credential |
| `GET`  | `/auth/me`         | Officer identity and derived actor id                        |
| `POST` | `/auth/logout`     | Revoke the session                                           |
| `ALL`  | `/gateway/v1/*`    | Validate the session, inject the bearer, rewrite to `/v1/*`  |

The gateway runs in the same Express app and Vercel Function as the API. It derives `X-Actor-Id` from
the officer, so browser requests do not send it. Sessions live in Postgres: 8 hours idle, 12 hours
absolute, revocable. Magic links are single-use and expire after 15 minutes.

Officers are seeded by an operator; there is no self-service enrolment:

```bash
npm run officers:add -- ama@church.org "Ama Mensah" ama
npm run officers:list
npm run officers:deactivate -- ama@church.org
```

### Members

| Method   | Path                                               | Result                                                                 |
| -------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET`    | `/v1/members`                                      | Paged summaries (`q`, `contact`, `includeArchived`, `limit`, `cursor`) |
| `POST`   | `/v1/members`                                      | `201` + `Location`; `409` duplicate member number                      |
| `GET`    | `/v1/members/{memberNo}`                           | Full DTO + `ETag`; `404` unknown/archived unless flagged               |
| `PUT`    | `/v1/members/{memberNo}`                           | Update; stale `If-Match` → `409`                                       |
| `DELETE` | `/v1/members/{memberNo}`                           | Archive (soft delete); `204`                                           |
| `POST`   | `/v1/members/{memberNo}/restore`                   | Un-archive                                                             |
| `POST`   | `/v1/members/{memberNo}/purge`                     | Erase PII; body repeats the member number                              |
| `GET`    | `/v1/members/{memberNo}/attendance`                | Per-series `attended` / `expected` / `remaining` + rows                |
| `POST`   | `/v1/members/{memberNo}/attendance`                | `{ seriesId, date }`; `422` when the series did not meet               |
| `DELETE` | `/v1/members/{memberNo}/attendance/{attendanceId}` | Remove a row (imported rows are suppressed from re-import)             |
| `POST`   | `/v1/members/{memberNo}/contacts`                  | Add contact; `409` on a duplicate value                                |
| `PUT`    | `/v1/members/{memberNo}/contacts/{contactId}`      | Update kind/value/order                                                |
| `DELETE` | `/v1/members/{memberNo}/contacts/{contactId}`      | Remove contact                                                         |
| `POST`   | `/v1/members/{memberNo}/contacts/link`             | Link another member's contact (dependent sharing)                      |
| `DELETE` | `/v1/members/{memberNo}/contacts/link/{contactId}` | Unlink                                                                 |
| `POST`   | `/v1/members/{memberNo}/subscriptions`             | Create subscription (optional coverage)                                |
| `DELETE` | `/v1/members/{memberNo}/subscriptions/{id}`        | End subscription                                                       |
| `POST`   | `/v1/subscriptions/{id}/coverage`                  | Add a covered member                                                   |
| `DELETE` | `/v1/subscriptions/{id}/coverage/{memberNo}`       | Remove a covered member                                                |
| `POST`   | `/v1/members/{memberNo}/ministries`                | Assign by ministry `code`                                              |
| `DELETE` | `/v1/members/{memberNo}/ministries/{code}`         | Unassign                                                               |
| `GET`    | `/v1/members/{memberNo}/relationships`             | Spouse, dependents, guardians (read both ways)                         |
| `POST`   | `/v1/members/{memberNo}/relationships`             | `{ relatedMemberNo, type, isDependent }`                               |
| `DELETE` | `/v1/members/{memberNo}/relationships/{id}`        | Remove the edge                                                        |

### Reference data

| Method       | Path                                | Result                                    |
| ------------ | ----------------------------------- | ----------------------------------------- |
| `GET`/`POST` | `/v1/ministries`                    | List / create (`code`, `name`, …)         |
| `GET`/`PUT`  | `/v1/ministries/{code}`             | Read / rename (code immutable)            |
| `DELETE`     | `/v1/ministries/{code}`             | Delete, or `409` while referenced         |
| `GET`/`POST` | `/v1/series`                        | List / create with its first schedule     |
| `GET`/`PUT`  | `/v1/series/{id}`                   | Read / update, including archive          |
| `POST`       | `/v1/series/{id}/schedule`          | Add a schedule version (history is kept)  |
| `POST`       | `/v1/series/{id}/exceptions`        | Cancel a date, or add a one-off extra     |
| `DELETE`     | `/v1/series/{id}/exceptions/{date}` | Remove an exception                       |
| `GET`        | `/v1/series/{id}/occurrences`       | Resolve the dates the series actually met |

### Imports

| Method | Path                     | Result                                                                                         |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `POST` | `/v1/imports/events`     | Rows `(date, eventno, eventname, ministryName?)`, all-or-nothing                               |
| `POST` | `/v1/imports/attendance` | `{ eventId, sessionDate, rows: [{ memberNo, datetime? }] }`, all-or-nothing; `409` on a repeat |
| `GET`  | `/v1/imports/{batchId}`  | Batch record (`kind`, `actor`, `rowCount`, `checksum`)                                         |

### Shepherding

Presbyters are members with `isPresbyter: true`. Each member has at most one active shepherd; a
presbyter may hold any number. Calls are **append-only**: there is no update and no delete, and an
unanswered call recorded as `unknown` never erases an earlier `yes`/`no`.

| Method   | Path                                               | Result                                                                    |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `POST`   | `/v1/shepherding/assignments`                      | Assign; reassignment needs `replaceAssignmentId` + `reason` (else `409`)  |
| `DELETE` | `/v1/shepherding/assignments/{assignmentId}`       | End an assignment; history is kept                                        |
| `POST`   | `/v1/shepherding/assignments/{assignmentId}/calls` | Log one attempt (`reached` / `no_answer` / `wrong_number`)                |
| `GET`    | `/v1/shepherding/assignments/{assignmentId}/calls` | Full call history                                                         |
| `GET`    | `/v1/shepherding/officers`                         | Presbyters with list size and call totals (`from`, `to`)                  |
| `GET`    | `/v1/shepherding/officers/{memberNo}/members`      | Roster with contacts, attempts, conversations, latest feedback and status |
| `GET`    | `/v1/shepherding/report`                           | Coverage totals plus one row per officer                                  |
| `GET`    | `/v1/members/{memberNo}/shepherding`               | Current shepherd, assignment history and recent calls                     |

A `409` on assignment carries a `currentAssignment` extension (`id`, `officerMemberNo`, `assignedOn`)
so the client can show who the member is currently assigned to before asking for consent.

### Attendance window

- Idempotent by natural key: events upsert on `(seriesId, date)`, attendance on
  `(memberId, seriesId, date)`.
- An `eventname` with no matching series fails the whole import and lists the unknown names. Series
  are created by an administrator, never by an import.
- A manual attendance row shadows an imported one. Deleting an imported row writes a suppression so
  the next import cannot resurrect it.
- JSON bodies are capped at 1 MB (~10k rows); larger files are chunked by the caller.

### Attendance window

```
windowStart = max(first schedule effectiveFrom, member.joinedOn)
windowEnd   = min(endsOn ?? today, today)
expected    = occurrences the series actually held in that window
attended    = the member's attendance rows inside the same window
```

Where an imported event list covers a range, its dates are authoritative for that range; cancelled
exceptions are removed and one-off extras are added.

### Errors

RFC 9457 `application/problem+json` with a stable `code`: `validation_error`, `not_found`,
`conflict`, `unauthorized`, `invalid_json`, `payload_too_large`, `route_not_found`,
`internal_error`, `import_failed`.

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "The member was modified since the supplied ETag",
  "code": "conflict"
}
```

### Concurrency and caching

Member reads return `ETag: "v{n}"`. Send it back as `If-Match` on `PUT` to get optimistic
concurrency: a stale tag yields `409`. Member responses are marked `Cache-Control: no-store`
because the records are personal data. Reassignment uses `replaceAssignmentId` as its consent
checkpoint, so a stale client cannot move a member between shepherds.

### Dates and time

Backend dates are UTC calendar dates. Every default and every "today" is UTC; a series may set an
explicit IANA `timezone` to decide what "today" means for that series. Clients convert to local time.

## Configuration

| Variable                        | Default       | Notes                                                                                             |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | `development` | `production` requires `API_BEARER_TOKEN`, `DATABASE_URL`, `RESEND_API_KEY` and `MAGIC_LINK_FROM`. |
| `PORT`                          | `3000`        | Local listener only; Vercel manages the port.                                                     |
| `DATABASE_URL`                  | —             | Unset → in-process PGlite with automatic migrations (ephemeral).                                  |
| `API_BEARER_TOKEN`              | —             | Server-side bearer; required in production. Never sent to a browser.                              |
| `AUTH_MAGIC_LINK_TTL_MINUTES`   | `15`          | Single-use link lifetime.                                                                         |
| `AUTH_SESSION_IDLE_MINUTES`     | `480`         | Session idle lifetime.                                                                            |
| `AUTH_SESSION_ABSOLUTE_MINUTES` | `720`         | Absolute session cap; must be at least the idle lifetime.                                         |
| `UI_BASE_URL`                   | local Pages   | Magic-link landing page; set to the deployed `/#/connect` URL.                                    |
| `RESEND_API_KEY`                | —             | Production mail delivery.                                                                         |
| `MAGIC_LINK_FROM`               | —             | Verified Resend sender address.                                                                   |
| `CORS_ALLOWED_ORIGINS`          | Pages + local | Comma-separated allowlist for `/auth/*` and `/gateway/v1/*`.                                      |
| `LOG_LEVEL`                     | `info`        | Pino level (`silent` in tests).                                                                   |

## Scripts

| Script                        | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `npm run dev`                 | `tsx watch` with `.env` loaded            |
| `npm run db:migrate`          | Apply pending migrations (`DATABASE_URL`) |
| `npm run officers:add`        | Seed or reactivate an officer             |
| `npm run officers:list`       | List officers and their actor ids         |
| `npm run officers:deactivate` | Deactivate an officer and revoke sessions |
| `npm run build`               | Compile `src` to `dist`                   |
| `npm start`                   | Run the compiled server                   |
| `npm run typecheck`           | `tsc --noEmit`                            |
| `npm test`                    | Vitest run (PGlite, no external services) |
| `npm run test:watch`          | Vitest watch mode                         |
| `npm run test:coverage`       | Coverage report                           |
| `npm run lint`                | ESLint 10 flat config                     |
| `npm run format`              | Prettier write                            |
| `npm run format:check`        | Prettier check                            |
| `npm run verify:fast`         | format:check + lint + typecheck + test    |
| `npm run verify`              | `verify:fast` + build (the required gate) |
| `npm run smoke`               | Build + exercise the compiled server      |
| `npm run hooks:install`       | Install the pre-commit hook               |

## Architecture

```
src/
  index.ts              # Vercel entry: default-exports the app, listens only outside Vercel
  create-app.ts         # app factory: helmet, JSON, request logging, auth, routers, errors
  auth.ts               # bearer token, timing-safe comparison
  actor.ts              # X-Actor-Id extraction for writes
  openapi.ts            # OpenAPI 3.1 built from the Zod schemas
  config/env.ts         # Zod-validated environment
  db/
    sql.ts              # the only database seam: query / exec / transaction
    pg.ts               # production adapter (node-postgres pool, DATE as string)
    pglite.ts           # test adapter (real Postgres in WASM)
    migrations.ts       # embedded SQL, applied by a tracked runner
    migrate.ts          # migration runner; migrate-cli.ts is `npm run db:migrate`
  domain/
    contacts.ts         # normalisation + uniqueness rules
    series.ts           # RRULE validation, schedule expansion, occurrence resolution
    attendance.ts       # the denominator engine
    shepherding.ts      # latest-known status and call summaries
  repos/                # members, ministries, series, occurrences, imports, shepherding
  routes/               # members, subscriptions, ministries, series, imports, shepherding
  schemas/              # Zod request/response schemas (single source of truth)
  errors/               # typed domain errors + problem+json middleware
```

Design rules:

- **Attendance is derived, not transcribed.** Series schedules, exceptions and imported occurrence
  lists produce the denominator; counts and rows are always read through the same window.
- **Behaviour lives with the data it protects.** Repositories enforce uniqueness, the one-spouse
  rule, household coverage, and the "only a held occurrence" rule; routes parse and delegate.
- **One small database port.** Repositories write parameterised SQL against `query` /
  `transaction`; the same code runs on Neon and on PGlite, so tests exercise real constraints
  (`ILIKE`, `any($1::text[])`, `generate_series`-free date logic, partial unique indexes).
- **PII stays private.** Bearer auth on every data route, no-store caching, archive by default,
  and a purge that nulls PII while keeping the member number reserved forever.
- **Shepherding history is append-only.** Calls are never updated or deleted; a reassignment needs
  the current assignment id plus a reason, and only purge may erase pastoral history.
- **The repo rules live in [`AGENTS.md`](AGENTS.md).** Spec first, grill and get explicit sign-off,
  UTC dates, append-only history, and the verification commands.

## Live deployment

- **API:** <https://member-registrations-mind-logs.vercel.app>
- **Project:** `mind-logs/member-registrations` — Node 24, functions in `fra1`
- **Git:** `stayboy/MemberRegistrations`; pushes to `main` deploy production, PRs deploy previews
- **Protection:** Vercel Authentication is **preview-only**; production is public and uses the API
  bearer token
- **Operations:** migrations, token rotation and troubleshooting:
  [`documents/runbooks/vercel-deploy.md`](documents/runbooks/vercel-deploy.md)

## Deploying to Vercel

1. Push the repository to Git and import it in Vercel, or run `vercel link` then `vercel`.
2. Add **Neon Postgres** through the Vercel Marketplace and connect it to the project, so
   `DATABASE_URL` is injected. Use the **pooled** connection string.
3. Set `API_BEARER_TOKEN` (`openssl rand -base64 32`).
4. Set `RESEND_API_KEY` and a verified `MAGIC_LINK_FROM`, plus `UI_BASE_URL` and
   `CORS_ALLOWED_ORIGINS` for the Pages origin.
5. Run `npm run db:migrate` once against the production database, from your machine or CI, with
   `DATABASE_URL` set. Migrations never run on request.
6. Seed at least one officer with `npm run officers:add -- <email> <name> <actorId>`.
7. Deploy. `vercel.json` pins the function region to `fra1`; change it to the region closest to the
   users and to the database.
8. Verify `GET /health`, then request a magic link and complete `/auth/exchange`.

Notes:

- Express runs as **one Vercel Function** with Fluid compute. `vercel.json` builds `src/index.ts`
  with `@vercel/node`; the Express preset alone rejects this entrypoint because `express` is imported
  by `create-app.ts`, not by `index.ts`.
- Vercel Authentication must stay **preview-only**; production is reached by API clients that cannot
  complete Vercel SSO.
- Vercel's request body limit is **4.5 MB**; the app caps JSON at 1 MB, so imports are chunked.
- No cron imports in v1: imports are explicit API calls.
