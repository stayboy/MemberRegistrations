# Spec — MemberRegistrations API: member-registration lookup + CRUD

|            |                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Status     | **Revised 2026-11-02 — stack decision reverted from the .NET minimal API to Node.js + TypeScript + Express; pending owner sign-off** |
| Date       | 2026-11-02                                                                                                                           |
| Repo       | `MemberRegistrations` (standalone repository)                                                                                        |
| Origin     | Conversational feature request, 2026-11-02                                                                                           |
| Supersedes | The 2026-11-02 .NET/School-Collab-signature revision of this spec (decision reverted by the owner)                                   |

---

## Problem Statement

The school keeps member registrations as JSON — ministry-facing records keyed by member number,
carrying personal demographics, contacts, service subscriptions and ministry assignments, with
attendance derived from imported events and attendance registries. There is no API surface to look a
member up, and no CRUD API over that JSON.

From the user's perspective: a ministry leader needs to answer "who is this member, what are they
enrolled in, and what did they attend?" with a single, minimal, well-shaped API call — and needs the
same surface for create / update / delete so the registration JSON can be maintained without bespoke
file handling.

## Solution

A standalone **Express 5 + TypeScript** API on **Node.js 24 LTS**, deployed to Vercel as a single
Vercel Function (zero-config Express support, Fluid compute). The service keeps the same layered
shape the School-Collab signature provided (thin routing layer, behaviour-rich domain, store port,
typed errors), implemented with the current Node ecosystem:

- **Runtime / framework** — Node.js 24 LTS, TypeScript 7, Express 5, ESM.
- **Validation / contract** — Zod 4 schemas as the single source of truth for requests, responses
  and the generated OpenAPI 3.1 document (`zod-openapi`).
- **Domain** — a behaviour-rich `Member` aggregate (factory + behaviour methods, typed domain
  errors), not an anemic DTO bag.
- **Persistence** — a `MemberStore` port with two adapters: local-FS JSON (dev/tests) and
  **Vercel Blob** (production). Member JSON is stored as private blobs; optimistic concurrency uses
  Blob ETag conditional writes.
- **API surface** — lookup, list, create, update, delete, plus a derived attendance read; errors use
  RFC 9457 `application/problem+json`.

## User Stories

1. As a ministry leader, I want to look up a member's registration by member number, so that I can
   open the member's record during a ministry meeting.
2. As a ministry leader, I want the lookup to return the full registration shape — name parts
   (first, last, other names, maiden name, alias), date of birth, gender, place of residence, contact
   lists, service subscriptions (life insurance, credit union), ministry assignments and attendance —
   so that one call answers "who is this?".
3. As a ministry leader, I want attendance on the member record to be resolved from imported events
   (date, event number, event name, by-ministry name) and attendance registries (member number, date,
   event number), so that leaders see real attendance without manual transcription.
4. As a ministry leader, I want to create a member registration, so that a newly identified member can
   be enrolled in ministries.
5. As a ministry leader, I want to update a member's registration (demographics, contacts,
   subscriptions, ministries, attendance), so that corrections and renewals land through one surface.
6. As a ministry leader, I want to delete a member's registration, so that stale records stop resolving.
7. As an administrator, I want to list member registrations with paging and search, so that I can
   browse the register without loading everything at once.
8. As a ministry leader, I want to record attendance for a member against an event, so that the
   attendance registry stays authoritative for reporting.
9. As an API consumer, I want every response documented by OpenAPI and typed, so that a client can be
   generated without guesswork.
10. As an operator, I want the service to run on Vercel with preview deployments and instant rollback,
    so that changes are testable before production and reversible in seconds.
11. As an operator, I want structured logs and request-level observability, so that failures are
    diagnosable without reproducing locally.
12. As a security owner, I want member PII (life-insurance / credit-union subscriptions) behind
    authentication and private storage, so that personal data is never publicly readable.

## Implementation Decisions

### Stack (reverted from .NET)

| Concern         | Choice                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| Runtime         | Node.js 24 LTS                                                                 |
| Language        | TypeScript 5.9.3, `strict`, ESM (TS 7 is ahead of `typescript-eslint` support) |
| HTTP            | Express 5                                                                      |
| Validation      | Zod 4                                                                          |
| API contract    | OpenAPI 3.1 generated from Zod via `z.toJSONSchema`                            |
| Testing         | Vitest 5 + Supertest 7                                                         |
| Logging         | Pino 10 (JSON)                                                                 |
| Lint / format   | ESLint 10 flat config + Prettier 3                                             |
| Package manager | npm 11 (the installed toolchain), lockfile committed                           |

### Project layout (decided)

- `src/index.ts` — default-exports the Express app (the Vercel zero-config entry point).
- `src/create-app.ts` — app factory (testable without listening). Named so it cannot be mistaken for
  a Vercel function entry (`app`/`server`/`index`).
- `src/config/env.ts` — Zod-validated environment at startup.
- `src/domain/` — `Member` aggregate and value objects, behaviour methods, domain errors.
- `src/store/` — `MemberStore` port, local-FS adapter, Vercel Blob adapter.
- `src/routes/` — member routes, attendance route, health route.
- `src/schemas/` — Zod request/response schemas.
- `src/errors/` — problem+json mapping, error middleware.
- `vercel.json` — region, function duration, cron (if scheduled imports are added).

### Domain modelling

- `Member` is an aggregate with a static `create` factory and behaviour methods:
  demographics update, contact add/update/remove, subscription subscribe/unsubscribe,
  ministry assign/remove, and attendance recording. Invalid transitions raise typed domain errors.
- Attendance is **derived from source data** (imported events + attendance registries), not
  duplicated as a writable field on the registration; the aggregate exposes a resolved attendance
  view for reads.
- Member number is the stable external key: used in route templates and store pathnames.

### API contract (v1, decided shape)

| Method   | Path                                        | Result                                                              |
| -------- | ------------------------------------------- | ------------------------------------------------------------------- |
| `GET`    | `/members/{memberNo}`                       | `200` registration DTO, `404` not found                             |
| `GET`    | `/members`                                  | `200` paged listing (`limit`, `cursor`, `q`)                        |
| `POST`   | `/members`                                  | `201` + `Location`, `409` duplicate member number, `422` validation |
| `PUT`    | `/members/{memberNo}`                       | `200`, `404` not found, `409` version conflict, `422` validation    |
| `DELETE` | `/members/{memberNo}`                       | `204`, `404` not found                                              |
| `GET`    | `/members/{memberNo}/attendance`            | `200` derived attendance view, `404` not found                      |
| `POST`   | `/members/{memberNo}/attendance`            | `201` attendance entry, `404` not found                             |
| `POST`   | `/members/{memberNo}/contacts`              | `201` contact, `404`, `409` duplicate contact, `422`                |
| `DELETE` | `/members/{memberNo}/contacts/{contactId}`  | `204`, `404` member or contact not found                            |
| `POST`   | `/members/{memberNo}/subscriptions`         | `201`, `404`, `409` already active, `422`                           |
| `DELETE` | `/members/{memberNo}/subscriptions/{kind}`  | `204`, `404` member or active subscription not found                |
| `POST`   | `/members/{memberNo}/ministries`            | `201`, `404`, `409` already assigned, `422`                         |
| `DELETE` | `/members/{memberNo}/ministries/{ministry}` | `204`, `404` member or assignment not found                         |
| `GET`    | `/health`                                   | `200` liveness                                                      |
| `GET`    | `/openapi.json`                             | `200` generated OpenAPI 3.1 document                                |

- Error bodies are RFC 9457 `application/problem+json` with a stable `code` member.
- Optimistic concurrency: `PUT` accepts `If-Match`; a stale ETag yields `409`.

### Persistence (serverless-correct)

- Vercel Functions have an ephemeral filesystem, so a local JSON directory cannot be the production
  store. The `MemberStore` port therefore has:
  - **LocalFileMemberStore** — dev/tests, one JSON file per member under a configurable root.
  - **BlobMemberStore** — production, `@vercel/blob` private store, `members/{memberNo}.json`.
- Blob overwrites are explicit (`allowOverwrite: true`); concurrency uses the ETag returned by
  `head()` and `ifMatch` on `put` (precondition failure → `409`).
- Listing uses Blob `list({ prefix })` with cursor paging; the local adapter mirrors the contract.
- Attendance sources (imported events, attendance registries) are stored as private JSON blobs and
  resolved on read; if the dataset outgrows document aggregation, move to Marketplace Postgres
  (Neon) behind the same port.
- **Store contract tests run against both adapters**, so the production adapter is not untested.

### Auth

- v1 uses an `Authorization: Bearer <token>` middleware with a timing-safe comparison against an
  env-configured token (per-client tokens optional later).
- Vercel Passport (Enterprise) can front the service with corporate SSO later; Vercel Firewall and
  Attack Challenge Mode are the edge-protection layer.

### Vercel capabilities used by this implementation

| Need                            | Vercel capability                                                        |
| ------------------------------- | ------------------------------------------------------------------------ |
| Run the Express app             | Zero-config Express → one Vercel Function, Fluid compute by default      |
| Persist member JSON             | Vercel Blob, **private** store (PII), conditional writes for concurrency |
| Relational/query workload later | Marketplace Postgres (Neon) behind the store port                        |
| Feature flags / runtime config  | Global Config (formerly Edge Config) — frequent reads, infrequent writes |
| Scheduled event imports         | Cron Jobs calling an Express route, guarded by `CRON_SECRET`             |
| Deploy / test / roll back       | Git-integrated preview deployments, Instant Rollback                     |
| Observability                   | Runtime Logs + Observability; optional OpenTelemetry (`@vercel/otel`)    |
| Secrets / configuration         | Environment Variables (`vercel env pull` for local dev)                  |
| Edge protection                 | Vercel Firewall / Attack Challenge Mode                                  |
| Agent-driven operations         | Vercel CLI + the Vercel MCP server                                       |

### Vercel constraints that shape the design

- **4.5 MB** request/response body limit — bulk event imports must use client-side uploads to Blob or
  chunked import endpoints, not one large `POST`.
- **250 MB** uncompressed function bundle limit.
- Single region by default (`iad1`) — pin a region close to the users.
- `express.static()` is ignored — static assets belong in `public/**`.
- Express error handling: unhandled errors can leave the function in an undefined state; a single
  terminal error middleware is mandatory.
- Blob overwrite/delete propagation can take up to ~60 s; private Blob consistent reads avoid stale
  reads inside the function.

## Testing Decisions

- Proposed seams (confirmed: aggregate → store port → HTTP surface):
  1. **Highest seam** — `Member` aggregate behaviour: pure Vitest unit tests, no infrastructure.
  2. **Persistence seam** — `MemberStore` contract suite executed against the local-FS adapter and a
     Blob adapter fake; no real network or directory writes in unit runs.
  3. **API seam** — Supertest against the app factory with the local store and a test bearer token;
     asserts status codes, problem+json bodies, paging and OpenAPI coverage.
- Good tests target external behaviour (responses, persisted document shape, resolved attendance),
  not internal call sequences.

## Out of Scope

- UI surfaces; multi-tenancy; SSO/Passport; event-import write path beyond what the attendance read
  needs; background workers beyond scheduled cron; Postgres migration until document aggregation is
  outgrown; the .NET/School-Collab implementation (the earlier decision is reverted).

## Further Notes

- **Attendance slot semantics remain an owner decision**: "eventname1 — 2 out of 5" and
  "eventname2 — 3 out of 5" could mean per-member expected counts against named event groups, or
  attendance slots within events. The resolver is shaped to accept either, but the DTO cannot be
  finalised until this is answered.
- Ministry naming ("pemem" and the other ministry labels) and maiden-name / alias handling need
  confirmation against the owner's data vocabulary.
- Member-number format and immutability need confirmation (string key assumed).
- A one-off import must load the existing registration JSON into Blob; it is not part of the API
  surface but is required for the first deployment.
- The tracker issue (`stayboy/School-Collab#467`) still describes the .NET revision; update its body
  once this spec is approved.
