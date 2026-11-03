# 20: Offerings, terms and attachment

**Tier:** 2

**What to build:** Define an offering with versioned terms of reference, attach two or more offerings
to an event, detach by ending rather than deleting, and apply skip/opt-in exceptions on a series date.
Expiry stops new gifts but never blocks honoring a pending pledge.

**Blocked by:** 07 (`event_instances` migration and backfill).

**Status:** ready-for-agent

- [ ] An offering carries kind, currency, target, default amount and available-until, and its terms are versioned.
- [ ] Two or more offerings attach to one event; detaching ends the attachment and keeps history.
- [ ] Series attachment accepts a skip or opt-in on a specific date.
- [ ] After expiry a new gift is rejected but a pending pledge can still be honored.
- [ ] An offering with no custom name displays as the event name plus kind.
- [ ] `npm run verify` and `npm run smoke` pass.
