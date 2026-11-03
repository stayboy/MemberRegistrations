# Round - session-gateway

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| Status | CLOSED                                                             |
| Tier   | 2                                                                  |
| Base   | `6d07f59`                                                          |
| Spec   | `documents/specs/member-registrations-api.md` (FR-21–28, AC-21–28) |
| Ticket | `documents/tickets/v2-events-ui/11a-session-gateway.md`            |

## Plan

Replace the browser-entered church bearer with a magic-link session gateway in the same Express app
and Vercel function as the API. The gateway holds `API_BEARER_TOKEN`, derives `X-Actor-Id`, and reuses
the `/v1` routers; the browser holds only a short-lived, revocable session credential.

Scope: migration `0004_session_gateway`; `src/repos/auth.ts` and `officers.ts`; `src/authn/*` (crypto,
mailer, service, router, CLI); `create-app` wiring; Zod/OpenAPI auth surface; operator CLI; tests.
No UI and no custom domain.

Acceptance criteria:

1. `/auth/*` and `/gateway/v1/*` run in the same app; gateway rewrites in-process to `/v1`.
2. Magic-link requests return the same 202 for known, unknown, inactive and rate-limited addresses.
3. Officers are seeded and deactivated by CLI; no self-service or domain allowlist.
4. Magic links are single-use, 15 minutes, hashed, and replay-safe.
5. Sessions are hashed Postgres rows: 8h idle, 12h absolute, `last_used_at` maintained.
6. `/auth/me` returns identity; logout revokes; expired/revoked sessions return 401.
7. Browser sends `Authorization: Bearer <session>`; no auth cookie is set.
8. Gateway injects the API bearer and derived actor; spoofed actor is discarded; only `/v1` is exposed.
9. Mail delivery is a `Mailer` port: Resend in production, no mail in development/tests.
10. Magic-link rate limits per email and per IP are enforced from Postgres.
11. CORS allowlist, `OPTIONS` before the session gate, `Vary: Origin`.
12. The API bearer never reaches the browser or logs; magic-link and session credentials are redacted.
13. Tests cover enumeration parity, replay, idle/absolute expiry, revocation, spoofing, CORS, path scope, rate limits, redaction.
14. Migrations are versioned SQL and apply on PGlite.
15. `npm run verify` and `npm run smoke` pass; routes do not import the mailer or gateway internals.

## Verification

| Gate            | Command                                                        | Result          |
| --------------- | -------------------------------------------------------------- | --------------- |
| Format          | `npm run format:check`                                         | pass            |
| Lint            | `npm run lint`                                                 | pass            |
| Types           | `npm run typecheck`                                            | pass            |
| Full suite      | `npm test`                                                     | pass — 97 tests |
| Auth + officers | `vitest run tests/api/auth.test.ts tests/api/officers.test.ts` | pass — 33 tests |
| Build           | `npm run verify`                                               | pass            |
| Smoke           | `npm run smoke`                                                | pass — 9 checks |

## Review

### Standards

Hard findings fixed:

- SQL lived in `src/authn`; moved to `src/repos/auth.ts` and `src/repos/officers.ts` per AGENTS §11.
- `createMailer` used Resend whenever keys existed; now `NODE_ENV=test` returns `NullMailer`, development
  always uses the console mailer, and production requires Resend credentials (FR-26).
- `addOfficer` select-then-insert raced the unique index; replaced with an atomic upsert.
- Console mailer could print a credential; tests now use `NullMailer`, and the console mailer is
  development-only (production uses Resend).

Judgement calls addressed: `gatewayAuth` throws `UnauthorizedError`; bearer parsing uses a regex;
deactivation revokes sessions and unused links; `trust proxy` is one hop; the duplicate session index
was removed and a `check (absolute_expires_at >= expires_at)` added; OpenAPI gained auth paths and an
`x-gateway` extension; CORS rejection has a real-request test and a documented `cors_rejected` code.

Residual judgement calls: `auth_rate_limits` rows are not purged (indexed for a later job); the
development console mailer intentionally prints the link; the CLI is tested through
`OfficerRepository`, not as a subprocess.

### Spec

Missing/partial items fixed: `last_used_at` and idle-window tests, per-IP limit test, CORS rejection on
an actual request, and OpenAPI documentation of the auth surface and gateway.

Wrong items fixed: mailer selection ignored `NODE_ENV`; console logged the code; IP limits trusted a
spoofable forwarded header; a missing bearer was forwarded as the session credential.

Scope creep kept deliberately: `officers:list` (operator convenience), `Access-Control-Max-Age`, and
`Cache-Control: no-store` on auth responses.

## Acceptance

| #   | Verdict | Evidence                                                                                                                      |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | MET     | `src/create-app.ts` mounts the same `v1` router at `/v1` and `/gateway/v1`; “proxies a read with a session credential”        |
| 2   | MET     | “returns the same accepted response…” and “does not send a link to an inactive officer”                                       |
| 3   | MET     | `OfficerRepository`; “adds an officer and lists them”, “re-adding an officer updates and reactivates them”                    |
| 4   | MET     | “issues a session for a valid single-use link”, “rejects a replayed link”, “rejects an expired link”                          |
| 5   | MET     | “extends the idle window and caps it at the absolute deadline”, “rejects a session past its absolute expiry”                  |
| 6   | MET     | “returns the derived actor from /auth/me”, “revokes the session on logout”, “revokes sessions when an officer is deactivated” |
| 7   | MET     | Test asserts no `set-cookie` on exchange and gateway responses                                                                |
| 8   | MET     | “injects the bearer and the derived actor, discarding a spoofed actor”; “does not expose paths outside /v1”                   |
| 9   | MET     | “never sends from tests even when provider keys are present”; “uses Resend in production…”                                    |
| 10  | MET     | “rate-limits repeated requests…” and “enforces the per-IP limit across different addresses”                                   |
| 11  | MET     | “answers an allowed preflight before the session gate”; “rejects an unlisted origin on an actual request”                     |
| 12  | MET     | “never logs the magic-link token”; responses assert the API bearer is absent                                                  |
| 13  | MET     | 29 auth tests covering the listed cases                                                                                       |
| 14  | MET     | Migration `0004_session_gateway`; full suite and smoke both run on PGlite                                                     |
| 15  | MET     | `npm run verify` and `npm run smoke` pass; routes import repositories/services only                                           |

## Deviations

- The gateway reuses the `v1` Router at two mount points instead of mutating `req.url`; this is the
  in-process rewrite the spec describes, with no HTTP hop.
- Smoke proves the auth surface is in OpenAPI, not a full magic-link round trip. Auth is covered by
  Supertest on PGlite; a Neon deployment migration is still required.
- The custom domain remains deferred; the session is short-lived and revocable.
- `officers:list` was added beyond seed/deactivate.
- The rate-limit table is indexed but not purged yet.
