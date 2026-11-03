# 06: Contacts, subscriptions and shepherding batch

**Tier:** 2

**What to build:** Move contacts, coverage, subscriptions and append-only shepherding calls to the
chosen style. Report and aggregate queries stay raw. Contact values remain available only through the
explicit contacts action.

**Blocked by:** 04 (Gate outcome and drift check).

**Status:** ready-for-agent

- [ ] Contact search and privacy behaviour is unchanged: no contact values appear in list responses.
- [ ] Coverage overlap and subscription rules are unchanged.
- [ ] Shepherding calls remain append-only: no update or delete route appears.
- [ ] Shepherding report totals are unchanged on the existing fixture.
- [ ] `npm run verify` and `npm run smoke` pass.
