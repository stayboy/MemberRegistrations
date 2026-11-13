# Runbook — local Docker stack

The production-shaped local path: Postgres, the compiled API, and the built UI behind nginx. Use it
when you need to exercise the real browser flow (sign-in, session gateway, CORS) rather than the
`npm run dev` + `npm run ui:dev` loop. Production still deploys to GitHub Pages + Vercel.

Compose file: [`docker-compose.yml`](../../docker-compose.yml). Services: `db` (Postgres 18), `migrate`
(one-shot runner), `app` (compiled API on `:3000`), `ui` (nginx on `:8080`).

## Bring it up

```powershell
docker compose up -d --build
docker compose ps                 # app and ui must be (healthy)
```

The `migrate` service runs the tracked migrations before `app` starts; `app` waits for it to complete.
The `db-data` volume keeps the database across `docker compose down` (it is only dropped by
`docker compose down -v`).

| Surface       | URL                     |
| ------------- | ----------------------- |
| UI            | <http://localhost:8080> |
| API / gateway | <http://localhost:3000> |

Use `localhost`, not `127.0.0.1`: `CORS_ALLOWED_ORIGINS` in compose is an exact match on
`http://localhost:8080`, and an unlisted origin gets no CORS header.

## Seed an officer

There is no HTTP enrolment route; an officer exists because an operator seeded them. Inside the
container the CLI is already built:

```powershell
docker compose exec app node dist/authn/cli.js add skwart@outlook.com "Solomon Owoo" solomon-owoo
docker compose exec app node dist/authn/cli.js list
```

`add` takes `<email> <name> <actorId>`; `actorId` is the audit attribution the gateway derives for that
officer's writes. Re-running `add` for an existing e-mail reactivates it instead of duplicating.

## Sign in through the browser

1. Open <http://localhost:8080>. The Gateway URL field is prefilled with `http://localhost:3000`
   (baked into the image at build time through the `VITE_GATEWAY_URL` build arg).
2. Enter the seeded e-mail and request the link.
3. No mail is sent locally: compose runs `NODE_ENV=development`, which selects the console mailer. Read
   the link from the log:

   ```powershell
   docker compose logs -f app
   # [auth] magic link for skwart@outlook.com (15 min): http://localhost:8080/#/connect?token=...
   ```

4. Open that URL in the **same browser** (the exchange binds the session to it) and continue to
   `/gateway/v1/members`.

## Verify without a browser

```powershell
npm run smoke:local
```

That is the release smoke, not a health ping: it refuses politely if the stack is down (exit 2), then asserts
the CORS matrix, that a protected read refuses an anonymous caller and answers with the bearer, that a member
can be created and read back, that a correctly signed USSD frame renders a menu and a forged or replayed one is
refused, that a correctly signed payment callback reaches the repository and a forged one is refused, that the
UI shell is the built app, and it prints the revision baked into the image. Exit 0 means the stack is a working
release. It creates one throwaway member per run (`SMOKE-<time>`), which is harmless in a local database and
gone after `down -v`.

The three header checks it performs, by hand if you want them:

```powershell
# Health, no Origin: normal result, no CORS header
curl.exe -s -i http://localhost:3000/health | Select-String -Pattern 'HTTP/|access-control-allow-origin'

# Health from the UI origin: 200 with the header
curl.exe -s -i -H "Origin: http://localhost:8080" http://localhost:3000/health |
  Select-String -Pattern 'HTTP/|access-control-allow-origin'

# Health from an unlisted origin: 200, no header (never a 403)
curl.exe -s -i -H "Origin: http://evil.test" http://localhost:3000/health |
  Select-String -Pattern 'HTTP/|access-control-allow-origin'
```

The header is what lets the operator UI's pre-flight probe read the result; without it the connection
badge reports the gateway down even though `app` is healthy.

## The API gate is on locally

Compose sets `API_BEARER_TOKEN` (a local development value), so `/v1` behaves as it does in production: a
direct call without the bearer gets `401`, and the gateway injects the token for the browser. That is what
lets the smoke prove the gate instead of assuming it:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/v1/members            # 401
curl.exe -s -o NUL -w "%{http_code}`n" -H "Authorization: Bearer local-development-bearer-change-me" `
  http://localhost:3000/v1/members                                                 # 200
```

The value is not a secret and must never be reused outside this local stack.

## Which commit is running

The image carries `org.opencontainers.image.revision`, taken from the `GIT_SHA` build arg:

```powershell
$env:GIT_SHA = (git rev-parse --short HEAD)
docker compose build
docker compose up -d
docker image inspect member-registrations-api:local `
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

With `GIT_SHA` unset the label is `dev`. `npm run smoke:local` prints it as its last check, so a release
smoke that passes and names `dev` means the image was not built from a commit — worth knowing.

## Backup and restore

The `db-data` volume is the only copy of the register. Dump it before any upgrade, and rehearse the restore
once per release — an unexercised backup is not a backup.

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'

# Dump inside the container, then copy the file out (never redirect a binary through the shell).
docker compose exec -T db pg_dump -U postgres -d member_registrations -Fc -f /tmp/backup.pgc
docker compose cp db:/tmp/backup.pgc "backups/$ts.pgc"
```

`backups/` is git-ignored; it holds real register data, so it is never committed and never put in `documents/`.

Restore — the destructive step, which is why it is exercised:

```powershell
docker compose cp "backups/20261113-081542.pgc" db:/tmp/restore.pgc
docker compose exec -T db pg_restore -U postgres -d member_registrations --clean --if-exists /tmp/restore.pgc
npm run smoke:local
```

The drill run on 2026-11-13 was: smoke green (11/11), dump 127 368 bytes, `docker compose down -v` (volume
destroyed), `up -d` (fresh migrate), the seeded member answered `404`, `pg_restore`, the same member answered
`200` with its original `id` and `createdAt`, smoke green again (11/11).

## Rollback

Migrations have **no down path**, so a rollback is two steps and the order matters:

1. **Snapshot first** — the dump above, before you start any upgrade. Without it, step 2 meets a forward
   schema with no way back.
2. **Roll the image back** and **restore the snapshot**:

   ```powershell
   git checkout <previous-commit>
   $env:GIT_SHA = (git rev-parse --short HEAD)
   docker compose build
   docker compose up -d
   docker compose cp "backups/<before-upgrade>.pgc" db:/tmp/restore.pgc
   docker compose exec -T db pg_restore -U postgres -d member_registrations --clean --if-exists /tmp/restore.pgc
   npm run smoke:local
   ```

Rebuilding the previous commit **without** restoring the snapshot is safe only when no migration ran between
the two commits; when in doubt, restore. `docker compose down -v` is not a rollback — it is data loss.

Note the order inside step 2: the old image's `migrate` service starts against the forward schema before
`pg_restore` runs. That is a no-op, because the migration runner records what it has applied, but it is why
`pg_restore` — not the image roll — is the step that returns the database to its old shape.

## Configuration

Compose sets everything the API needs for development; nothing has to be exported by hand:

| Name                     | Value in compose                        | Why                                                         |
| ------------------------ | --------------------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`           | `postgresql://postgres:postgres@db:...` | The `db` service                                            |
| `API_BEARER_TOKEN`       | `local-development-bearer-change-me`    | The API gate, on locally as in production                   |
| `CORS_ALLOWED_ORIGINS`   | `http://localhost:8080`                 | The nginx UI origin                                         |
| `UI_BASE_URL`            | `http://localhost:8080/#/connect`       | Magic-link target                                           |
| `NODE_ENV`               | `development`                           | Console mailer, dev defaults, no secrets                    |
| `USSD_ENABLED`           | `true`                                  | Every USSD screen and the simulator are exercisable locally |
| `USSD_GATEWAY_SECRET`    | `local-development-ussd-gateway-secret` | The HMAC the smoke signs USSD frames with                   |
| `PAYMENTS_ENABLED`       | `true`                                  | The HMAC callback is mounted for local testing              |
| `PAYMENT_GATEWAY_SECRET` | `local-development-payment-secret`      | The HMAC the smoke signs the payment callback with          |
| `VITE_GATEWAY_URL`       | `http://localhost:3000` (build arg)     | The UI's default gateway                                    |

Both subsystems are on **for the local MVP only**; production keeps them off, so their secrets are not
required there. Their HMAC secrets are explicit local values (like the bearer) so the stack cannot drift onto a
library default; personal tweaks (another Postgres, extra ports) go in a git-ignored
`docker-compose.override.yml`; override `DATABASE_URL` for **both** `app` and `migrate`.

## Teardown and reset

```powershell
docker compose down            # containers stop; the database volume survives
docker compose down -v         # drop the volume too — next up re-migrates and needs a new seed
```

Inspect data with `docker compose exec db psql -U postgres -d member_registrations`.

## Troubleshooting

| Symptom                                                     | Cause                                                                                            | Fix                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Connection badge says the gateway is down, `app` is healthy | The UI origin is not in `CORS_ALLOWED_ORIGINS`, or you opened `127.0.0.1` instead of `localhost` | Use `localhost:8080`; check the header with the curl above |
| `400` on the connect page                                   | A stale token, or the link was opened after its 15-minute expiry                                 | Request a new link                                         |
| No magic link in the log                                    | `NODE_ENV` is not `development` (console mailer only) or the officer is not active               | `docker compose exec app node dist/authn/cli.js list`      |
| The Gateway URL field shows an old value                    | `VITE_GATEWAY_URL` is baked at image build                                                       | `docker compose build ui`                                  |
| `app` exits at boot                                         | A required variable is missing (the loader fails closed)                                         | `docker compose logs app`                                  |

Docker is not built in CI; after a change to `Dockerfile`, the compose file or the API surface,
re-run `docker compose build && docker compose up -d` and repeat the health check.
