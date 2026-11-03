# 01: Freeze specs and boundaries

**Tier:** 0

**What to build:** Amend the API spec so `event_instances` (evolved from `event_occurrences`), its
`sessions` array, per-session attendance and the offerings/pledges/contributions contracts are the
source of truth. Record the ORM boundary in `AGENTS.md`. Confirm V2 UI scope (shell, members, imports,
shepherding, events, series) and mark offerings/USSD as V3. This ticket writes no production code.

**Blocked by:** None (can start immediately).

**Status:** done — approved 2026-11-03

- [x] The API spec documents `event_instances` fields, nullable `series_id`, `sessions`, the venue enum, the attendance key and import resolution by `eventno` + date.
- [x] The API spec documents offerings, terms versions, event attachment, contributions (member and visitor), pledges, reminders and their error codes.
- [x] The API and UI specs document the session gateway (Q2 = A): magic-link sign-in, short-lived Postgres session, bearer server-side, derived `X-Actor-Id`, gateway-only CORS.
- [x] The gateway topology is settled: same Express app, in-process rewrite, Resend via a `Mailer` port, officers seeded by CLI, rate limits in Postgres.
- [x] `AGENTS.md` states the ORM is allowed only in repositories; migrations stay SQL; the attendance/occurrence/import engine stays raw; both drivers run on PGlite and Neon.
- [x] `AGENTS.md` records that the browser never holds the API bearer and that V2 has authentication but no per-officer authorization.
- [x] `AGENTS.md` records the post-approval change control: behavioural edits need re-approval, clarifications need a changelog line.
- [x] All three specs pass the spec validator at 100/100.
- [x] The owner explicitly approves the amended specs before ticket 02 or 11a starts.
