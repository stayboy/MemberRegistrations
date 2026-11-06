# Round - local Docker stack

|        |                      |
| ------ | -------------------- |
| Status | OPEN                 |
| Tier   | 2 - Reviewed         |
| Base   | `f0eba0d`            |
| Spec   | none - local tooling |
| Ticket | none                 |

## Plan

An optional, production-shaped local path: Postgres, the compiled API and the built UI behind
nginx. `npm run dev` + `npm run ui:dev` stay the default quick loop; production (GitHub Pages +
Vercel) is untouched, and no host port is published for Postgres.

The settled decisions:

1. Compose is an optional parallel local path; the npm dev loop stays the default.
2. Local data lives in a container Postgres with a named volume and no host port.
3. The UI is the built artifact, not the Vite dev server; no HMR service.
4. Sign-in is the real path: console magic link plus one officer seeded through the compiled CLI.
5. The backend runs compiled (`node dist/index.js`); no bind mounts and no `tsx` in the container.
6. One root `Dockerfile` with final targets `api` and `ui`; `migrate` reuses the `api` image.
7. Migrations run in a one-shot `migrate` service; `app` waits with
   `service_completed_successfully`.
8. Ports: UI `8080` to nginx `80`, API `3000`, Postgres unpublished.
9. Compose env uses literal values, never `${VAR}` interpolation, so a stray repo `.env` cannot
   redirect `DATABASE_URL`.
10. `.dockerignore` excludes build output, local data, tests, documents and every `.env*` file.
11. Images are pinned to the versions in use (Node 24.22.2, Postgres 18.6, nginx 1.31.2) so a later
    rebuild produces the same runtime.
12. CI does not build the stack; the README carries the local re-verify command.
13. The `ui` nginx container has a healthcheck, and the README documents a
    `docker-compose.override.yml` override (git-ignored) for pointing at another Postgres.

## Verification

| Gate               | Command                                                  | Result                                                                         |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Install            | `npm ci`                                                 | pass                                                                           |
| Compose build      | `docker compose build`                                   | pass - `api` and `ui` images built                                             |
| Pinned images      | `docker compose build` (re-run)                          | Node 24.22.2, Postgres 18.6, nginx 1.31.2                                      |
| UI healthcheck     | `docker compose ps -a`                                   | `ui` healthy after the nginx probe                                             |
| Image default      | `docker run --rm member-registrations-api:local`         | fails closed: `API_BEARER_TOKEN is required when NODE_ENV=production`          |
| Compose override   | `docker compose exec app printenv NODE_ENV`              | `development`                                                                  |
| Database           | `docker compose ps -a`                                   | `db` healthy, Postgres 18.6                                                    |
| Migrations         | `docker compose logs migrate`                            | exit 0 - `0001_init` through `0015_welfare_products`                           |
| API wait           | `docker compose up -d`                                   | `app` started only after `migrate` exited 0                                    |
| API health         | `curl -s http://localhost:3000/health`                   | `{"status":"ok",...}`                                                          |
| OpenAPI            | `curl -s http://localhost:3000/openapi.json`             | `{"openapi":"3.1.0",...}`                                                      |
| Built UI           | `curl -s http://localhost:8080/`                         | `<html>` referencing `/assets/`, base `/`                                      |
| UI CSP             | built `index.html`                                       | `connect-src` includes `http://localhost:3000`                                 |
| Officer seed       | `docker compose exec app node dist/authn/cli.js add ...` | `Added local@church.test`                                                      |
| Magic link         | `POST /auth/magic-link`                                  | 202, link printed in `docker compose logs app`                                 |
| Exchange / session | `POST /auth/exchange`, then `GET /auth/me`               | exchange ok, `me` 200 for `Local Officer`                                      |
| Teardown           | `docker compose down`                                    | containers removed, `db-data` volume kept                                      |
| Root gate          | `npm run verify`                                         | verify:skill, format, lint, typecheck pass; vitest pool crash (see Deviations) |
| Root tests, serial | `npx vitest run --no-file-parallelism`                   | pass - 37 files, 471 passed / 3 skipped                                        |
| Build              | `npm run build`                                          | pass                                                                           |

Compose evidence: four services, three of them one image. `migrate` is `Exited (0)` while `app`
reports `(healthy)` and `ui` is `Up` on `8080`. No port is published for `db`.

## Acceptance

TBD.

## Review

Tier 2, independent: `deepseek-v4-pro` build `0813`, **ACCEPT**, with one P2 and three nits. The P2
(baked `NODE_ENV=development`) was fixed by baking `NODE_ENV=production` and leaving `development` to
compose; the two size/style nits are recorded above as accepted, and the tier nit is settled by
recording this round as Tier 2.

## Deviations

- **Postgres 18 volume path.** The brief's implied `/var/lib/postgresql/data` does not persist on
  `postgres:18-alpine`: the image sets `PGDATA=/var/lib/postgresql/18/docker` and declares its volume
  at `/var/lib/postgresql`. The named volume is mounted at the parent, which is the documented 18+
  path. `18-alpine` exists (18.6), so no fallback to `17-alpine` was needed.
- **UI build mode.** `npx vite build --mode development` is kept as briefed; it produces a built
  artifact with base `/` (a development-mode bundle), not the dev server.
- **`NODE_ENV` default is production; compose sets development.** The `api` image bakes
  `NODE_ENV=production` (review P2) so a bare `docker run` of the image fails closed: `env.ts`
  validation applies and the mailer is Resend, not the console. Both `migrate` and `app` set
  `NODE_ENV=development` explicitly in compose, which is what the local stack needs. Production
  still builds Vercel's own bundle; nothing here reaches it.
- **Pruning.** `npm prune --omit=dev` leaves every runtime import. PGlite is a devDependency and is
  loaded only when `DATABASE_URL` is absent, so the container requires `DATABASE_URL` (compose
  supplies it); that is recorded rather than keeping PGlite in the production layer.
- **README override sentence.** The earlier draft pointed at `docker-compose.override.yml` as the
  place for personal overrides, but that path was not git-ignored. `.gitignore` now lists
  `docker-compose.override.yml` and the README sentence is restored, so personal overrides are safe
  and never committed; the file itself is still not created.
- **Vitest pool crash on Windows.** Both parallel `npm run verify` runs reached the test stage and
  completed 468 tests, then a worker exited once with `0x80000003` (STATUS_BREAKPOINT) and once with
  `0xC0000409` (STATUS_STACK_BUFFER_OVERRUN); the failing file differed between runs (`shepherding`,
  `member-attendance`, `payment-groups`), and no assertion failed. The serialized re-run passed all 37
  files. This is an environment flake in the parallel fork pool, not a source change: the round touches
  no `src/` or `tests/` file.
- **`api` image keeps the UI workspace's production dependencies.** `npm prune --omit=dev` drops dev
  dependencies only, so React/Fluent UI remain in the `api` layer even though `dist/index.js` never
  loads them. Accepted: it costs image size, not correctness, and splitting the workspace install is
  not worth the build complexity for a local image.
- **README `curl` continuation.** The magic-link example keeps the shell `\` continuation used by the
  README's existing blocks; it is not copy-paste-safe in PowerShell, but consistency with the file
  won over a one-line variant.
- **Pre-commit hook bypassed on the commit.** `.githooks/pre-commit` runs `verify:fast`; the hook hit
  the Windows fork-pool crash twice with no failing assertion, so after the single allowed retry the
  commit was made with `--no-verify` and the PR's `verify` job is the gate. §7 permits the bypass; it
  is recorded here rather than left implicit.
