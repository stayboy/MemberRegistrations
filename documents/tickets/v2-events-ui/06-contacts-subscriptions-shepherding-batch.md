# 06: Contacts, subscriptions and shepherding batch

**Tier:** 2

**What to build:** Move contacts, coverage, subscriptions and append-only shepherding calls to the
chosen style. Report and aggregate queries stay raw. Contact values remain available only through the
explicit contacts action.

**Blocked by:** 04 (Gate outcome and drift check).

**Status:** done — 2026-11-04

- [x] Contact search behaviour is unchanged; the existing summary contract (including its contact list) is preserved — this ticket does not change the response shape.
- [x] Coverage overlap and subscription rules are unchanged.
- [x] Shepherding calls remain append-only: no update or delete route appears.
- [x] Shepherding report totals are unchanged on the existing fixture.
- [x] `npm run verify` and `npm run smoke` pass.
