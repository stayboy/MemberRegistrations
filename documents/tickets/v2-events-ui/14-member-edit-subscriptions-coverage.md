# 14: Member edit, subscriptions and coverage

**Tier:** 2

**What to build:** Add and edit a member, add a subscription, and add coverage through the approved
dialogs. Contact editing stays behind the explicit contacts action. Server conflicts are shown inline,
not as a generic failure.

**Blocked by:** 13 (Members list UI).

**Status:** ready-for-agent

- [ ] Add and edit member validate and persist; a duplicate member number returns 409 shown on the field.
- [ ] Add subscription and add coverage work; overlapping coverage is rejected with the documented reason.
- [ ] Contacts are edited only from the explicit contacts dialog, never inline in the grid.
- [ ] A successful save refreshes the members list without a full reload.
- [ ] The dialogs match their mock screenshots at the recorded viewport.
