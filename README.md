# MemberRegistrations API

Member registration lookup + CRUD for the school register, with attendance derived from imported
events and attendance registries. Built with **Express 5**, **TypeScript**, and **Node.js 24**, and
deployed as a single Vercel Function.

- Spec: [`documents/specs/member-registrations-api.md`](documents/specs/member-registrations-api.md)
- Contract: `GET /openapi.json` (OpenAPI 3.1, generated from the Zod schemas)
- Tests: 40 Vitest + Supertest cases across the aggregate, store, and HTTP surface

## Quick start

```bash
npm install
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
npm run dev               # http://localhost:3000
```

```bash
curl http://localhost:3000/health
curl http://localhost:3000/openapi.json

curl -X POST http://localhost:3000/members \
  -H "Authorization: Bearer change-me-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "memberNo": "M-1001",
    "firstName": "Ama",
    "lastName": "Mensah",
    "ministries": ["choir"],
    "subscriptions": ["life-insurance"],
    "contacts": [{ "channel": "email", "value": "ama@example.com" }]
  }'
```

## API

All `/members` routes require `Authorization: Bearer <API_BEARER_TOKEN>`.

| Method   | Path                                        | Result                                              |
| -------- | ------------------------------------------- | --------------------------------------------------- |
| `GET`    | `/members`                                  | Paged listing (`limit`, `cursor`, `q`)              |
| `POST`   | `/members`                                  | `201` + `Location`; `409` duplicate member number   |
| `GET`    | `/members/{memberNo}`                       | Registration DTO with `ETag`; `404` unknown member  |
| `PUT`    | `/members/{memberNo}`                       | Update; `If-Match` stale → `409`                    |
| `DELETE` | `/members/{memberNo}`                       | `204`; `404` unknown member                         |
| `GET`    | `/members/{memberNo}/attendance`            | Entries + per-event summary                         |
| `POST`   | `/members/{memberNo}/attendance`            | Record attendance; duplicate event/date → `409`     |
| `POST`   | `/members/{memberNo}/contacts`              | Add contact; duplicate channel/value → `409`        |
| `DELETE` | `/members/{memberNo}/contacts/{contactId}`  | Remove contact                                      |
| `POST`   | `/members/{memberNo}/subscriptions`         | Activate `life-insurance` / `credit-union`          |
| `DELETE` | `/members/{memberNo}/subscriptions/{kind}`  | Deactivate a subscription                           |
| `POST`   | `/members/{memberNo}/ministries`            | Assign `pemem`, `women-ministry`, `choir`, `prayer` |
| `DELETE` | `/members/{memberNo}/ministries/{ministry}` | Remove a ministry assignment                        |
| `GET`    | `/health`                                   | Liveness (no auth)                                  |
| `GET`    | `/openapi.json`                             | OpenAPI 3.1 document (no auth)                      |

Errors use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json` with a stable
`code` (`validation_error`, `not_found`, `conflict`, `unauthorized`, `invalid_json`,
`payload_too_large`, `route_not_found`, `internal_error`).

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Member M-1001 was modified by another request",
  "code": "conflict"
}
```

### Concurrency

`GET`, `POST`, and `PUT` return an `ETag`. Send it back as `If-Match` on `PUT` (or any mutation) to
get optimistic concurrency: a stale tag yields `409`. Responses are marked `Cache-Control: no-store`
because the records contain personal data.

## Configuration

| Variable                | Default          | Notes                                                                    |
| ----------------------- | ---------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`              | `development`    | `production` requires `API_BEARER_TOKEN`.                                |
| `PORT`                  | `3000`           | Local listener only; Vercel manages the port.                            |
| `STORE_DRIVER`          | `local`          | `local` (dev/tests) or `blob` (production).                              |
| `MEMBER_STORE_ROOT`     | `./data/members` | Directory used by the local adapter.                                     |
| `API_BEARER_TOKEN`      | —                | Required in production; the dev default in `.env.example` is not secret. |
| `LOG_LEVEL`             | `info`           | Pino level (`silent` in tests).                                          |
| `BLOB_READ_WRITE_TOKEN` | —                | Set by Vercel when a Blob store is connected; OIDC also works.           |

## Scripts

| Script                  | Purpose                        |
| ----------------------- | ------------------------------ |
| `npm run dev`           | `tsx watch` with `.env` loaded |
| `npm run build`         | Compile `src` to `dist`        |
| `npm start`             | Run the compiled server        |
| `npm run typecheck`     | `tsc --noEmit`                 |
| `npm test`              | Vitest run                     |
| `npm run test:watch`    | Vitest watch mode              |
| `npm run test:coverage` | Coverage report                |
| `npm run lint`          | ESLint 10 flat config          |
| `npm run format`        | Prettier write                 |

## Architecture

```
src/
  index.ts          # Vercel entry: default-exports the app, listens only outside Vercel
  create-app.ts     # app factory: helmet, JSON, request logging, auth, errors
  auth.ts           # bearer token, timing-safe comparison
  openapi.ts        # OpenAPI 3.1 built from the Zod schemas
  config/env.ts     # Zod-validated environment
  domain/member.ts  # Member aggregate: invariants + behaviour, not an anemic DTO
  schemas/          # request/response Zod schemas (single source of truth)
  routes/members.ts # thin HTTP layer over the aggregate
  errors/           # typed domain errors + problem+json middleware
  store/            # MemberStore port, local-FS adapter, Vercel Blob adapter
```

Design rules:

- **Behaviour lives in the aggregate.** Contacts, subscriptions, ministries, and attendance each go
  through a method that enforces uniqueness and preferred-contact rules; routes only parse and
  delegate.
- **The store is a port.** `MemberStore` is implemented by `LocalFileMemberStore` (dev/tests) and
  `BlobMemberStore` (production); the same contract is tested against the local adapter.
- **Attendance is derived, not duplicated.** Entries are recorded once and summarised per event;
  imported event/registry data is the source of truth for reporting.
- **PII stays private.** Blob storage is private and reads bypass the CDN cache; only the bearer
  token can reach member data.

## Deploying to Vercel

1. Push the repository to Git and import it in Vercel, or run `vercel link` then `vercel`.
2. Create a **private** Vercel Blob store and connect it to the project (Project → Storage).
3. Set production environment variables:
   - `STORE_DRIVER=blob`
   - `API_BEARER_TOKEN=<generated secret>` (`openssl rand -base64 32`)
4. Deploy. `vercel.json` pins the function region to `fra1`; change it to the region closest to the
   users and to the Blob store.
5. Verify `GET /health`, then exercise a `POST /members` with the bearer token.

Notes:

- Express runs as **one Vercel Function** with Fluid compute. `express.static()` is ignored — static
  assets belong in `public/**`.
- Vercel's request body limit is **4.5 MB**; bulk event imports must be uploaded to Blob directly or
  chunked, not posted in one request. The app additionally caps JSON bodies at 1 MB.
- Vercel Functions have an **ephemeral filesystem**, so `STORE_DRIVER=local` is for development and
  tests only.
- The function bundle limit is 250 MB uncompressed; current dependencies are far below it.
- Use **Preview Deployments** to test changes and **Instant Rollback** to revert production in
  seconds. Runtime Logs and Observability cover the Pino request logs; `@vercel/otel` can be added
  later for traces.

## Open decisions

These are owner decisions that do not block the current contract but will shape the next revision:

1. **Attendance slot semantics** — does "eventname1 — 2 out of 5" mean an expected count against a
   named event group, or slots within an event? The summary endpoint aggregates by event name today.
2. **Member-number format and immutability** — a 1–32 character string is assumed, immutable after
   creation.
3. **Ministry vocabulary** — `pemem`, `women-ministry`, `choir`, `prayer` are the current enum; the
   owner's real labels may differ.
4. **Maiden name / alias** — both are optional free text; the lookup query matches alias but not
   maiden name.
5. **Initial import** — the existing registration JSON must be loaded into Blob once; that one-off
   script is not part of this API.
