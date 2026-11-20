# Spec - member-initiated verification

**Status:** approved 2026-11-19 (owner instruction; independent spec review ACCEPT, 2026-11-19),
synthesised with the `to-spec` skill from the owner's instruction
("amend spec to allow user able to initiate verification. ussd should be able to serve as avenue for
user to to be able to initiate verification"). It amends Phase 3 of
`member-registrations-member-record.md`; the officer-initiated path, the register-chosen channel and
the member acceptance page stand. There is no GitHub issue tracker in this repository
(`AGENTS.md` section 13), so this file is the published spec and the round doc will carry the tier.

## Problem Statement

A member cannot start verification themselves. Only an officer can choose `Verify membership` on the
record, so a member who wants to prove a contact has to wait for an officer at a desk or ask one to
open their record. The member is on USSD, the channel they actually use, and the register already
identifies them there by an owned number; the session has everything needed to start the code, but the
menu offers no way to do it. The result is that the proof exists in the product but the member cannot
reach it.

## Solution

An identified member opens `My Profile > Verify contact` in USSD. The register issues one six-digit
code to the register-chosen contact - **email** when present, else **WhatsApp**, else the **phone** -
sends the code and the short link to the member acceptance page, and renders the masked destination
with "A code was sent to <mask>. Open the link we sent." The member opens the link and enters the code on
the page. There is no six-digit prompt in USSD: the page remains the single completion surface. The
officer's `Verify membership` action and the same throttle apply to both entry points.

## User Stories

1. As a member, I want to start verification from USSD, so that I do not need an officer at a desk.
2. As a member with an email, WhatsApp or phone contact, I want the register to pick the channel, so
   that I do not have to understand delivery channels.
3. As a member, I want to see the masked destination and the instruction to open the link, so that I
   know where the code went and how to finish.
4. As a member who has asked twice in a minute, I want the throttle explained, so that I know when to
   try again.
5. As a member with no owned phone or WhatsApp, I understand the action is not offered and the office
   starts the code, so that the officer path still covers me.
6. As a member whose owned contacts are all proven, or who is officer-confirmed, I do not want a
   pointless action.
7. As a member on a shared or borrowed phone, I want the code sent to my own contact, not the
   guardian's.
8. As an officer, I want the member's sends to share my 60-second and 5-per-hour limits, so that the
   member cannot spam a contact.
9. As a privacy-conscious member, I want no code and no token in the USSD text, so that a shoulder or
   the session log never carries them.
10. As a member whose link expired, I want to ask again once the throttle allows, so that a lost link
    is not a dead end.
11. As an email-only member, I can ask the office to start the code; the link reaches me and the page
    accepts it, so that I can verify without a phone identity.
12. As an officer, I want the member's initiation to leave the record's badge and proofs exactly as my
    own send would, so that there is one model.
13. As a member, I want `9 Back` to return to `My Profile` from the notice, so that the menu behaves
    like the rest of the tree.
14. As a member, I want the action hidden once every owned contact is proven or I am officer-confirmed,
    so that the menu does not offer a no-op.

## Implementation Decisions

- **The USSD profile screen gains one action.** `My Profile` (option 5) gains `1 Verify contact` for an
  identified member (an owned phone or WhatsApp) with any owned contact unproven and no officer
  confirmation. The action
  calls the existing verification `issue` in-process; no new HTTP route, no channel selector, no schema
  change. An email-only or contactless member has no USSD identity; the officer path covers them.
- **The existing issue contract is unchanged.** It resolves one channel (email, else WhatsApp, else
  phone), stores one live code and token, sends the code and the acceptance-page link, and returns the
  destination and expiry. The USSD screen renders the `status.verification_sent` copy - "A code was sent
  to <mask>. Open the link we sent." - and the acceptance page does the entry.
- **The notice is a state, not a prompt.** A `verify.sent` state parented to `profile` shows the
  destination, the instruction, and `9 Back`; it accepts no six-digit code entry. A throttled member or
  a missing sender renders the appropriate message in the same state.
- **The throttle and refusals are shared with the officer action.** The 60-second and 5-per-hour
  counters, `429 too_many_requests` and `503 delivery_unavailable` are the same service path; the USSD
  copy names the wait or the office. A `409 no_own_contact` cannot occur here because identification owns
  the dialing contact; it belongs to the officer path for a contactless member.
- **Anonymous sessions never see the action.** The anonymous menu and the no-gate identification stand;
  the action lives only under `My Profile` for an identified member.
- **The acceptance page is unchanged.** The token and code, five attempts, rate limits, no-data success
  and the masked result are the Phase 3 page.
- **The officer record is unchanged.** The badge, `Verify membership`, `Confirm member` and `Revoke
verification` behave as Phase 3 defines; a member-started send produces the same code row and the
  same proof on acceptance.
- **No USSD entry of the OTP.** The earlier retirement stands; USSD initiates, the page enters.

## Testing Decisions

- **The USSD pipeline seam is the highest seam.** `runUssdFrame` with a fake sender and a PGlite
  member: an identified member with a phone or WhatsApp sees `1 Verify contact`; the action sends
  the code and link to the resolved channel, renders the mask and the link instruction, and never
  shows a code; a second request inside 60 seconds shows the wait; a sixth in an hour shows the limit;
  a member with no owned phone or WhatsApp does not see the action (the office starts the code); a proven
  or confirmed member does not see the action;
  an anonymous session does not see it; `9 Back` returns to `My Profile`.
- **The service seam is the existing verification tests.** The user path calls the same `issue`; no new
  HTTP.
- **The glossary budget and state registry** cover the new action, notice and errors with the existing
  16/60/182-character rules; `PARENTS[verify.sent] = profile`.
- **Prior art:** the USSD pipeline tests and the verification service tests; the acceptance page is
  already DOM-tested.
- **External behaviour only:** assert the rendered USSD text, the captured code/link and the stored
  row, not machine internals.

## Out of Scope

- Entering the six-digit code in USSD; the acceptance page is the only entry.
- A member web or app portal beyond the acceptance page.
- A channel choice by the member or the officer.
- USSD for an anonymous session.
- Re-verification of an already-proven contact; once every owned contact is proven the action is hidden.
- A new migration, HTTP route or UI page.

## Further Notes

- This amends the 2026-11-19 decision that retired USSD verification: only the **initiation** returns;
  the entry stays on the page and the USSD gate stays retired.
- The action and the officer send are two doors to one service; the throttle, the one live code and the
  proof model are shared, so the member's action cannot create a second code or a different outcome.
- The masked destination is the only member data in the notice; no code, token, full address or member
  number appears in the USSD text.
