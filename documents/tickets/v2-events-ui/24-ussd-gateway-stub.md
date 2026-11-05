# 24: USSD flow and gateway stub — index

Ticket 24 is split into four build parts plus the deferred complaints round. The durable contract is
`documents/specs/member-registrations-ussd.md`; each part has its own ticket with the checklist and its
authorised migration.

| Part | Scope                                                                                                       | Migration |
| ---- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 24a  | identity and HMAC entry, session/menu tree, glossary, events/offerings, splits, payments, pledge/redemption | 0013      |
| 24b  | attendance, one-time codes, registration requests, clocking/delegation, expected headcounts, profile        | 0014      |
| 24c  | welfare products, eligibility, card/verified, subscriptions, inherited cover, claims                        | 0015      |
| 24d  | the USSD admin portal section and the dev-only simulator                                                    | none      |
| 24e  | member complaints and the admin complaint queue (deferred, last V3 round)                                   | next free |

Order: 24a → 24b → 24c → 24d → 23 → 24e. 24a is the only part that must land before the simulator can
be exercised against the real API.

**Status:** 22 complete; 24a ready-for-agent.
