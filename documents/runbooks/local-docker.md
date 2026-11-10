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

## Configuration

Compose sets everything the API needs for development; nothing has to be exported by hand:

| Name                   | Value in compose                        | Why                                      |
| ---------------------- | --------------------------------------- | ---------------------------------------- |
| `DATABASE_URL`         | `postgresql://postgres:postgres@db:...` | The `db` service                         |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:8080`                 | The nginx UI origin                      |
| `UI_BASE_URL`          | `http://localhost:8080/#/connect`       | Magic-link target                        |
| `NODE_ENV`             | `development`                           | Console mailer, dev defaults, no secrets |
| `VITE_GATEWAY_URL`     | `http://localhost:3000` (build arg)     | The UI's default gateway                 |

The USSD and payment subsystems are off by default, so their secrets are not required. Personal tweaks
(another Postgres, extra ports) go in a git-ignored `docker-compose.override.yml`; override
`DATABASE_URL` for **both** `app` and `migrate`.

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
