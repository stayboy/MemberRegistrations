# 11a: Session gateway and magic-link sign-in

**Tier:** 2

**What to build:** A session gateway in the **same Express app and Vercel function** as the API.
Officers sign in with a single-use email magic link delivered by Resend and receive a short-lived,
revocable Postgres session. The gateway holds `API_BEARER_TOKEN`, derives `X-Actor-Id` from the
authenticated officer, and rewrites `/gateway/v1/*` internally to `/v1/*`. The GitHub Pages UI never
sees or asks for the bearer.

**Blocked by:** 01 (Freeze specs and boundaries). Independent of 02–11; must land before 12. Runs first
after approval.

**Status:** done — 2026-11-03

- [x] `/auth/*` and `/gateway/v1/*` are mounted in `create-app.ts`; the gateway rewrites to the existing `/v1` routers in-process, with no second deployment and no HTTP proxy hop.
- [x] `POST /auth/magic-link` returns the same status, body and timing shape for known, unknown and inactive addresses; only an active officer receives mail.
- [x] Officers are seeded and deactivated by an operator CLI; there is no self-service enrolment and no email-domain allowlist.
- [x] The magic link is single-use, expires in 15 minutes, is stored hashed, and a replay returns a generic failure without creating a session.
- [x] `POST /auth/exchange` issues a session credential stored hashed in Postgres, expiring after 8 hours idle with a 12-hour absolute cap; `last_used_at` is updated.
- [x] `GET /auth/me` returns the officer and derived actor id; `POST /auth/logout` revokes the session; a revoked or expired session returns `401`.
- [x] The browser sends `Authorization: Bearer <session>`; the gateway sets no auth cookie.
- [x] `ALL /gateway/v1/*` requires a valid session, injects `Authorization: Bearer $API_BEARER_TOKEN` and the derived `X-Actor-Id`, discards a client-supplied `X-Actor-Id`, and exposes no path outside `/v1/*`.
- [x] Magic-link delivery goes through a `Mailer` port: Resend in production, console/no-op in development and tests. Tests assert no mail is sent.
- [x] Magic-link rate limits per email and per IP are enforced from Postgres counters; no in-memory limit is authoritative.
- [x] CORS accepts only `CORS_ALLOWED_ORIGINS`, allows `Authorization, Content-Type, If-Match`, handles `OPTIONS` before the session gate and sends `Vary: Origin`.
- [x] The API bearer never appears in a browser response; authorization headers, magic-link codes and session credentials are redacted from logs.
- [x] Tests on PGlite + Supertest cover enumeration parity, replay, idle and absolute expiry, revocation, actor spoofing, CORS rejection, gateway path scope, rate limiting and log redaction.
- [x] Migrations for `officers`, `auth_magic_links`, `auth_sessions` and `auth_rate_limits` are versioned SQL.
- [x] `npm run verify` and `npm run smoke` pass; no route imports the mailer or gateway internals directly.
