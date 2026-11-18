# Member registrations - member record actions, add/edit form, photo and membership verification

**Status:** approved by the owner, 2026-11-18; independent spec review ACCEPT, 2026-11-18, and
re-reviewed for the approval-guardian amendment and the ETag byte-length amendment the same day. Three
phases: **Phase 1** is a wire-contract gate: a small additive surface (a titles read endpoint, the
title create fields, a guardian eligibility filter and a guardian projection) plus new refusals on
the existing member and relationship endpoints (reachability); **Phase 2** (photo) adds a migration,
a wire endpoint and PII handling; **Phase 3** (OTP verification and the USSD gate) adds a migration,
a wire change, new outbound WhatsApp and SMS dependencies, an email sender, authentication behaviour
and a USSD behaviour change. Phases 1, 2 and 3 are hard gates under `AGENTS.md` §17: each parks
until the owner authorises that round and that gate by name.

**Amendments (2026-11-18, during the Phase 2 build):** the `PUT` photo response is `200` with the
body; the endpoint block had said `204`, which cannot carry one. The photo `ETag` includes the byte
length (MR-17), so a replacement in the same millisecond differs when its length differs.

**Provenance:** the owner's requests of 2026-11-18, synthesised with the `to-spec` skill into this
repo's spec format. It supersedes FR-29a's "The edit form MUST NOT gain contact fields", FR-71's
assembly-join-date field, FR-25a's bare `verified` checkbox, and the USSD spec's open access for any
phone. It adds `titleCode`/`titledOn` to the create schema, a titles read endpoint, the title control to both
forms, and the guardian eligibility filter and projection. The create form still collects came-from, move-out and moved-to assembly. Like the
other area specs, this file is the source of truth for the surfaces it names.

## Problem Statement

The member record's action row has shrunk to `Edit`, `Archive`/`Restore` and `Purge`. The actions an
officer actually performs on this page - open the contacts, assign a shepherd, add a ministry, link a
relationship, add a subscription, verify or revoke a membership - are scattered across tabs and
sections, so the menu is a list of destructive verbs and the useful ones are undiscoverable.

The add/edit form still carries the shape the first release gave it. It asks for an assembly join date
even though `Joined on` already exists, it cannot set the membership card number or the presbyter
title that the record displays, and it drops the operator out of the form to manage contacts,
ministries and shepherding on the record afterwards. An officer creating a member therefore performs
three or four separate visits to finish one registration.

Nothing in the register can show a face. Every avatar is initials, so a large register cannot be
scanned by sight, and an officer who has just met a member has no way to attach the photograph they
took.

A member's phone is recorded as a contact but nothing proves that the person holding it is the member.
The record shows a `Verified` badge that only a seed or a direct API call can set, and the USSD service
accepts any phone, member or not, so the register cannot answer "is this phone this member?" and the
member's short code is a public menu.

The presbyter title is displayed on the record and accepted by the update wire, but the add and edit
forms cannot set it, so a title arrives only from an import or a database visit, and the create schema
does not accept one at all.

A member may have no phone, email or WhatsApp of their own - a child, or an adult such as a maid who
relies on the family she lives with. The form asks every member for contacts, OTP verification has
nothing to send to, and the guardian relationship lives only in the record’s panel. The register
cannot say who is reachable through whom, cannot reach such a member through the record, and cannot
verify someone who has no contact.

## Solution

**Phase 1 - the form, the titles and the action row, no migration.** `Edit` becomes the single visible
primary action; the `Actions` menu is repopulated with the page’s actions (`View contacts`,
`Assign shepherd`, `Add ministry`, `Add relationship`, `Add subscription`) and the vital ones
(`Archive`/`Restore`, `Purge`). The form loses the assembly join date and gains the membership card
number, the presbyter title with its optional date, contacts, ministries and a shepherd - on create and
on edit. The title list is read from a new reference endpoint, and the create schema accepts the title.
Reachability is the rule, not age: a member may give their own contacts or name a guardian (a reachable
adult) instead, and the form gains relationship management for that link. Contacts are recorded when
the member has them; none are invented for a member who has none.

**Phase 2 - the profile photo, a hard gate.** A member can have one square photograph, uploaded from a
file or taken live with the device camera. It is stored in the register, served only to an
authenticated session, and shown wherever the member's avatar appears; initials remain the fallback.
The original file never leaves the browser: the client crops and re-encodes it, so no EXIF and no
filename reach the register.

**Phase 3 - membership verification by OTP, a hard gate.** A registered number that has not verified
opens a **verification menu** in USSD. The register itself chooses where the code goes, from the
contacts recorded on the member: **WhatsApp first, email second, phone (SMS) third**, and when both
WhatsApp and email exist it sends the same code to both, so the member uses whichever arrives. The
member enters the code in the same session; neither the member nor the officer picks a channel. An
officer can start the same delivery from the record and see where it went and when it expires, and
can revoke a verification; the officer never sees or enters the code. Registration requires a
reachable member - their own contact or a guardian - so every member is either verifiable or
reachable through someone who is. Verification follows the number: a member with their own phone or WhatsApp
number verifies and uses USSD; a member without one is reached through their guardian, so the record shows
`Via <guardian>` rather than a `Verified` badge. Age is not the test; having a phone or WhatsApp number is. An unregistered phone can still
self-register (the register’s existing USSD flow) but cannot use member services until it verifies.
Changing or removing the verified number clears it.

## User Stories

1. As a church administrator, I want `Edit` to stay one visible button, so that the record's main verb
   is never hidden in a menu.
2. As a church administrator, I want the `Actions` menu to list the things I can do on this record, so
   that I do not have to hunt through tabs to find them.
3. As a church administrator, I want `View contacts` in the menu, so that the contact values are one
   action away without leaving the record.
4. As a church administrator, I want `Assign shepherd` in the menu, so that coverage can be set from
   the record I am already reading.
5. As a church administrator, I want `Add ministry` and `Add relationship` in the menu, so that the
   two most common record edits do not depend on scrolling to a panel.
6. As a church administrator, I want `Add subscription` in the menu, so that welfare cover is one
   action from the record.
7. As a church administrator, I want `Archive`, `Restore` and `Purge` at the bottom of the menu, so
   that the destructive verbs stay available but never sit beside the everyday ones.
8. As a church administrator, I want an archived member's menu to offer `Restore` instead of
   `Archive`, so that the menu always names the action that applies.
9. As a church administrator, I want the add form to stop asking for an assembly join date, so that I
   am not asked for two join dates that mean the same thing to me.
10. As a church administrator, I want to enter the membership card number when I create a member, so
    that the card in my hand is recorded at the same time as the person.
11. As a church administrator, I want to correct the membership card number later, so that a typo does
    not need a database visit.
12. As a church administrator, I want to set a member's presbyter title when I create them, so that
    the office is recorded from the first day.
13. As a church administrator, I want to change or clear the title later, and record the date the
    office began, so that the register matches the church's own record.
14. As a church administrator, I want only titles that fit the member's gender offered, so that I
    cannot choose an Elder for a woman or a Deaconess for a man.
15. As a church administrator, I want to see the member's current contacts while I am editing the
    member, so that I can check I am editing the right record.
16. As a church administrator, I want a `Manage contacts` action on the edit form, so that I can add,
    correct, remove or unlink a value without leaving the form.
17. As a church administrator, I want to add and remove ministries from the edit form, so that a
    ministry change is one visit to one page.
18. As a church administrator, I want to choose a shepherd when I create a member, so that the member
    does not enter the register uncovered.
19. As a church administrator, I want to change the shepherd while editing the member, so that a
    reassignment does not require the Shepherding area.
20. As a church administrator, I want a failed shepherd assignment after a successful create to leave
    the member created and tell me what to do next, so that I do not lose the registration.
21. As a church administrator, I want to upload a member's photograph when I have a file, so that the
    register shows a face rather than initials.
22. As a church administrator, I want to take a photograph with the device camera, so that a member
    standing in front of me can be recorded without a separate camera and transfer.
23. As a church administrator, I want the photograph reduced to a square before it is stored, so that
    every avatar on every surface looks the same.
24. As a church administrator, I want to remove a photograph, so that initials return when the photo
    is wrong or no longer wanted.
25. As a reader of the register, I want the photograph wherever a member's avatar appears, so that I
    recognise people rather than reading initials.
26. As a member, I want the USSD menu to send the code for me, so that I do not have to understand
    delivery channels.
27. As a member, I want the code on the contact I actually use, WhatsApp first, then email, then my
    phone, so that it reaches me without a choice I should not have to make.
28. As a member with both WhatsApp and email, I want the code on both, so that whichever I open first
    works.
29. As a member, I want to enter the code in the same USSD session, so that I do not need a
    smartphone app or a second channel.
30. As a member whose code was started by an officer, I want to open the USSD menu and enter it, so
    that an officer can begin the process and I can finish it.
31. As a member, I want the main menu to open after I verify, so that I can check events, offerings
    and my welfare cover in the same session.
32. As a member who has verified before, I want the main menu to open immediately, so that I am not
    asked for a code on every dial.
33. As a person whose number is not registered, I want the USSD service to offer registration rather
    than a dead end, so that I can join the register.
34. As a member who has just registered by USSD, I want to verify on my next session, so that the
    register knows the number is mine before it shows me member data.
35. As a member, I want a code that expires and a limited number of tries, so that a guessed code
    cannot open my record.
36. As a member, I want a resend after a short wait, so that a lost message does not lock me out
    for the day.
37. As a church administrator, I want to start a verification from the member record, so that a
    member at the desk can be sent a code without dialling first.
38. As a church administrator, I want the register to choose the channel, so that I do not have to
    ask the member which one they have.
39. As a church administrator, I want to see which destinations the code went to and when it
    expires, so that I can tell the member what to expect without ever seeing the code.
40. As a church administrator, I want to revoke a verification when a phone changes hands, so that
    the old number immediately loses member access.
41. As a church administrator, I want the `Verified` badge and its date on the record, so that I can
    see at a glance whether the member can use USSD.
42. As a registration officer, I want the contact values captured before the member is created, so
    that no member enters the register without a way to verify.
43. As a privacy-conscious officer, I want a code never written to a production log or returned by
    an API, so that possession of the WhatsApp number, inbox or phone is the only way in.
44. As a maintainer, I want the original photo file to stay in the browser, so that no filename,
    EXIF data or full-resolution image enters the register or its logs.
45. As a maintainer, I want Phase 1 to need no migration, so that the form improvements can land
    without a database gate.

46. As a registration officer, I want to record a member who has no phone or WhatsApp number, so that a child or a
    maid is not forced to invent one.
47. As a registration officer, I want to name a guardian for a member with no contact, so that the
    register knows who is reachable for them.
48. As a registration officer, I want to record contacts when the member has them, so that those
    who can be reached directly are.
49. As a church administrator, I want the record to show the guardian’s name and phone when the
    member has no contact of their own, so that I can reach them.
50. As a church administrator, I want to add and remove relationships on the add/edit form, so that
    the guardian link is one visit.
51. As a church administrator, I want the last guardian of a member with no own contact to be
    unremovable, so that nobody becomes unreachable.
52. As a church administrator, I want to change a guardian on the edit form, so that a family
    change is recorded where I am working.
53. As a church administrator, I want no `Verified` badge or verify action for a member with no
    phone or WhatsApp number, so that the register does not claim a verification that cannot exist.
54. As a member who later gets a phone or WhatsApp number, I want to add it and verify, so that I gain USSD access
    when I can.
55. As a church administrator, I want a member with contacts and a guardian to keep both, so that
    direct and proxy reachability can coexist.
56. As a church administrator, I want a member with neither a contact nor a guardian to be refused,
    so that no one enters the register unreachable.

## Implementation Decisions

### Phase 1 - action row, form and titles

- **`PageActions` gains a primary kind.** An action marked primary renders as a visible Fluent
  `Button` beside the `Actions` menu; the rest render as menu items in the given order, with a divider
  before the destructive group. The one-or-many rule stays for pages that mark nothing primary. The
  member record marks `Edit` primary and passes the other actions.
- **The menu reuses the surfaces that already exist.** `View contacts` opens the record's
  `ContactsDialog`; `Assign shepherd` opens `AssignShepherdDialog`; `Add ministry` and
  `Add relationship` switch to the Overview tab and focus the section's own `Add` control;
  `Add subscription` switches to the `Welfare & Services` tab and focuses `Add subscription`. The menu
  never duplicates a mutation form.
- **No assembly join date in the form.** The input is removed from create and edit. The form model
  keeps the field so an edit diff leaves an existing value untouched and a create sends null; the
  record's Membership grid and the API field are unchanged.
- **Membership card number.** A nullable 32-character input in the Church section on both forms, with
  the same blank-becomes-null rule as the other optional fields. It rides `membershipCardNo` on create
  and on the edit diff; the wire already accepts it (FR-25a).
- **Presbyter title on both forms.** A `Title` select and an optional `Titled on` date in the Church
  section. The options are the active titles from the new `GET /v1/presbyter-titles`, filtered by the
  member's selected gender and the title's gender restriction. A title already held that the edited
  gender no longer allows is cleared with an inline note when the gender changes, and the server still
  returns `422 validation_error` if a stale value reaches it. The date is optional and may not be in
  the future. Both fields ride `titleCode`/`titledOn`; `updateMemberSchema` already accepts them and
  `createMemberSchema` gains them.
- **Titles are read, not hard-coded.** `GET /v1/presbyter-titles` returns the active reference rows as
  `{ code, label, genderRestriction, active }`, ordered by label. It is additive and read-only; no
  migration.
- **Contacts on edit are read, then managed.** The edit form renders a `Contacts` section listing the
  current phone, email and WhatsApp values (or `No contacts`), with a `Manage contacts` button that
  opens the existing editable `ContactsDialog`. The form's save never carries contact values; the
  dialog's own endpoints stay the only write path. The member query is invalidated when the dialog
  closes.
- **Ministries on edit apply immediately.** The edit form renders the record's ministry list with
  `Add` by code and `Remove` (with its confirmation), calling the existing member-ministry endpoints.
  These are separate writes, not part of the form's save, and the section says so. On create the
  existing multiselect still rides the create payload (FR-71).
- **Shepherd on create is a value; on edit it is the dialog.** The create form carries a `Shepherd`
  select of active officers plus an optional assigned date (defaulting to today, UTC). The member is
  saved first; if a shepherd was chosen, the assignment is attempted afterwards. A failed assignment
  leaves the member created and shows a warning with a link to the record. The edit form shows the
  current assignment and opens `AssignShepherdDialog`.
- **Reachability decides, not age.** Every member must be reachable: at least one own contact
  (phone, email or WhatsApp) or at least one active `guardian` relationship to a reachable adult.
  The form requires one of the two; the API refuses a create or update that leaves neither with
  `422 no_contact_or_guardian`. Age is not a factor: a child may have a phone and an adult may have
  none.
- **Contacts are optional and recorded when present.** The form shows the three contact fields for
  every member; a value entered is validated and the phone or WhatsApp number is the USSD identity. A member with no
  contact records none.
- **A guardian is reachable directly or through a chain.** The `guardian` relationship points to a member aged 18 or over who is reachable and MUST carry
  `isDependent: true` (the schema makes it optional and the insert defaults false today, so the API
  enforces the invariant for `guardian` links): they have an own contact,
  or they have a guardian of their own that ends at one. The chain must terminate at an own contact,
  must not cycle, and is limited to three links. A cycle, an unreachable chain or a longer chain is
  refused with `422 guardian_chain_cycle`, `422 guardian_chain_unreachable` or
  `422 guardian_chain_too_long`; an under-age, self or descendant guardian is `422 guardian_not_eligible`.
  The picker reads `GET /v1/members?guardianEligible=true&forMemberNo=<no>` (member number, name,
  resolved masked contact, intermediates) and excludes the member and its descendants; the detail
  projects the active guardian and the resolved contact. On create the guardian rides the create payload as
  `guardianMemberNo` and is linked in the same transaction; on edit it applies immediately. Removing the last guardian of a member with no own
  contact is refused with `409 guardian_required`, and so is a removal that would leave a dependant
  reachable only through the removed link.
- **Relationships on the form.** A `Relationships` section on create and edit lists the existing
  rows with add and remove through the endpoints that already exist. The guardian rides the create
  payload; the other relationships link after the member exists. Edit applies immediately. The
  record’s relationship panel is unchanged.
- **The form is a step flow.** The add and edit forms render a semantic step rail (`nav` around an ordered list of Fluent
  `Button`s, each carrying `aria-current="step"` when active) with two required content steps, a
  conditional `Relationships` step and a final `Review`: `Person and contact` (Identity, Residence, Contacts), `Church
and involvement` (the membership facts, title, card, ministries, shepherd), `Relationships`
  (shown when the member has no contact or already has relationships), and `Review`. `Next` validates
  only the current step; `Back` never validates; `Save` on Review validates everything and runs the
  same payloads. On create the relationships step carries only the guardian (`guardianMemberNo`); the
  full relationship editor is an edit-time control. The immediate edit writes (contacts, ministries,
  relationships) are labelled "Saved as you go": they carry no unsaved state and are not part of the
  Review save. The stepper is horizontal and sits directly beneath the breadcrumb at every width; its labels
  hide below 600 px and the numbered bubbles remain, with connector lines between them and a check
  on completed steps; the active step’s heading takes
  focus; `?step=` keeps the step across a reload; a step beyond the first invalid one is disabled.
  Fluent v9.75.1 ships no Wizard or Stepper, so this composes the semantic rail, `Field` and `Button`; the round records that gap. The rail uses step semantics, not tab roles: `TabList` is
  not used because `tablist`/`tab` would declare peer tabs rather than a sequence. The visual
  reference is the Fluent UI Blazor `Wizard` sample (`StepperPosition="Top"`, numbered bubbles, a
  check on completed steps, `Previous`/`Next` bottom-right, `Previous` disabled on the first step and
  `Next` accented); this app is React and Fluent v9, so it is a pattern, not an importable component,
  and the sample's own accessibility note means the semantic list, not its markup, carries the step
  semantics.

- **Identity names.** The add and edit forms render `First name` and a second required field
  labelled `Other names`; the separate `Other names` input is retired. The second field writes
  `lastName`, so the wire and existing data are unchanged; `otherNames` stays on the API for imports
  and existing records but is no longer edited in the form.

- **Approval requires a guardian.** The USSD registration request stores only a one-way phone hash,
  so approving it cannot reuse the phone. `POST /v1/registration-requests/:id/approve` MUST carry
  `guardianMemberNo`; the approval MUST validate it like any guardian (18+, reachable, chain rules)
  and write the member and the guardian link in one transaction. Without a guardian the approval is
  refused; an ineligible guardian is `422 guardian_not_eligible`. The approvals screen MUST require
  the guardian too.

- **No migration, but a wire-contract change.** Phase 1 adds the titles endpoint, the title create
  fields, the guardian filter and the guardian projection, and it adds refusals to existing member and
  relationship endpoints (reachability). No schema change and no data rewrite, but the new refusals
  make Phase 1 a §17 wire-contract gate: the owner authorises the round by name.

### Phase 2 - photo (hard gate)

- **Storage is the register.** Three nullable columns on `members`: the bytes, the stored content type
  (`image/webp`, `image/jpeg` or `image/png`) and `photo_updated_at`. No external blob store, no
  public URL, no filename column. The columns are additive and nullable; the Drizzle schema and the SQL migration change in lockstep and
  the drift check covers them. Photo CRUD uses the Drizzle repository (CRUD-only); the attendance,
  occurrence and import engine stays on raw SQL (`AGENTS.md` §12).
- **The client normalises the image.** The form centre-crops to a square, scales to 512 x 512 and
  re-encodes to WebP at quality 0.85 (JPEG where WebP encoding is unavailable) on a canvas. The
  re-encode strips EXIF and the original filename. The client rejects a source over 10 MiB before
  decoding. The form control sits on the **left of the Identity panel**: a square photo whose height matches
  the bottom of the last input in the right-hand field column, sized to that column rather than
  stretching the panel; the dialog is where the 512 crop is previewed before the upload.
- **One photo endpoint.** `PUT /v1/members/:memberNo/photo` accepts raw bytes with an image content
  type, sniffs the magic bytes (`RIFF....WEBP`, `FF D8 FF`, `89 50 4E 47`), rejects a mismatch, an
  empty body or more than 2 MiB, stores the bytes and returns the new `photoUpdatedAt`.
  `GET /v1/members/:memberNo/photo` returns the bytes with an `ETag` derived from the member number,
  `photoUpdatedAt` and the byte length, honours `If-None-Match` with 304, and 404s when there is no photo.
  `DELETE` clears the three columns and returns 204. All three sit behind the bearer like every other
  `/v1` route; the browser reaches them through the session gateway.
- **The photo is private and short-lived in caches.** `Cache-Control: private, max-age=300`,
  `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`. No log line carries the bytes, the
  original filename or a data URL; a log line carries the member number and the byte length only.
- **The browser fetches the photo as a blob.** The session credential travels in a header, so an
  `<img src>` cannot carry it. A shared `MemberAvatar` fetches the photo through the API client,
  creates an object URL, revokes it on unmount and falls back to the Fluent initials avatar when the
  member has no photo or the request fails.
- **The DTO carries a timestamp, not a URL.** `MemberDetail` and `MemberListItem` gain
  `photoUpdatedAt: string | null`; the client builds the URL. A member without a photo is
  distinguishable from a failed fetch.
- **Camera capture is a second source.** `Take photo` opens a dialog that requests `getUserMedia` with
  `facingMode: 'user'`, shows the live frame and captures to the same canvas pipeline. A denied
  permission, a missing camera or an insecure context explains itself and leaves the file input as the
  path.
- **One avatar component.** The header, the members list, the contacts dialog header, the member
  pickers and the shepherding rosters use the same `MemberAvatar`; initials are the fallback.

### Phase 3 - OTP verification and the USSD gate (hard gate)

- **Verification binds the member and the number.** `members.verified_at` (already present) gains a
  companion `verified_number_hash`; a member is verified only while the calling number’s HMAC matches
  that hash, and the calling number may be a phone **or** a WhatsApp number, because `findOwnedMember`
  resolves both. Changing or removing the verified number clears both. A member-level `Verified` badge
  means "this member has a verified number"; its title names the masked number (the country code and the last two digits, e.g. `+233 *** 01`) and
  the date.
- **The code.** Six digits from `crypto.randomInt`, hashed at rest with HMAC-SHA256 under an
  `OTP_PEPPER` secret, never stored in clear and never logged outside the development console
  senders. Valid for 10 minutes, five attempts, one code live at a time. A resend is allowed after
  60 seconds and at most five in an hour per member. The counters live in Postgres
  (`consumeRateLimit`), so they survive a restart and a second instance.
- **The register chooses the destinations; nobody else does.** `issue(memberId, now)` resolves the
  contacts recorded on the member: if WhatsApp exists it sends there, and if email also exists it
  sends the same code there too; otherwise email if it exists; otherwise SMS to the number. A member with no phone or WhatsApp has no
  USSD identity and is refused earlier with `409 no_own_contact`. One code is generated per issue and
  every destination receives that same code.
- **Three delivery ports.** The new `WhatsAppSender.send(to, body)`, a new `EmailSender.send(to, body)`
  (the current `Mailer` exposes only `sendMagicLink`, so email needs its own generic method or a
  sibling port), and the new `SmsSender.send(to, body)`. All have console implementations outside
  production and provider adapters in production; production never logs a code. The providers are
  deployment choices; the interfaces are fixed.
- **One verification service.** `issue(memberId, now)` resolves, sends and records the destinations;
  `verify(memberId, number, code, now)` compares in constant time, counts the attempt, consumes the
  row and sets `verified_at` and `verified_number_hash`. Completion is always the member entering the
  code in USSD; `revoke(memberId)` clears both and consumes any live code.
- **The USSD verification menu has no channel choice.** On a registered but unverified number the
  first screen is `Verify your membership`: `1 Send code`, `2 Enter code`, `0 Exit`. Choosing 1
  issues the code, renders `We sent a code to <masked destinations>` and then prompts for the six
  digits; choosing 2 accepts a code an officer started. A correct code verifies and moves to the main
  menu in the same session. A wrong code re-prompts with the remaining attempts; after the fifth the
  session ends with `Too many attempts`. An expired code renders `That code has expired` and offers a
  resend.
- **The gate.** A verified number goes straight to the menu. An unregistered number gets the existing
  `Register` flow and nothing else; a member created that way is unverified and must verify next
  session. Registered and unverified cannot see events, offerings, welfare, profile or shepherding
  until the code is accepted. The pipeline checks the gate on every frame, so a revoke takes effect
  mid-session.
- **Contacts exist before the member does.** The create form requires a phone or WhatsApp contact, because the
  phone or WhatsApp number is the USSD identity and a delivery channel; email is recorded on the
  create form when the member has them, never added later as a prerequisite for verification. The edit
  form can still correct them.
- **The officer’s controls.** The `Actions` menu gains `Verify membership` when the member is
  unverified: choosing it sends immediately, with no channel selector, and shows the masked
  destinations and the expiry. It gains `Revoke verification` when verified, behind a confirmation
  that names the consequence. The `Verified` badge stays a display; there is no officer-side "mark
  verified" action and the officer never sees or types the code.
- **A member without a phone or WhatsApp is not verified by OTP.** They have no USSD identity, so `issue`
  refuses with `409 no_own_contact`; the record shows `Via <guardian>` instead of the `Verified`
  badge and `Verify membership` is not offered. A member with a phone or WhatsApp number verifies normally, whatever
  their age; adding a phone or WhatsApp later enables the flow. A legacy member with a number keeps the
  standard gate.
- **The bare `verified` input leaves the wire.** `createMemberSchema` and `updateMemberSchema` drop
  `verified`; `verifiedAt` becomes read-only and is set only by the verification service. The UI never
  sent it; the import parser does not use it; no seed depends on it in production.
- **No anonymous member menu.** The USSD machine’s anonymous lanes (`memberPresent: false`) are
  removed for member services; registration is the one anonymous path.

### Options explored - membership verification

The conversation explored five shapes; the spec builds the hybrid in the first.

1. **The register picks the contact; the member or an officer starts it; the member completes in
   USSD (chosen).** WhatsApp first, email second, phone third, and WhatsApp plus email when both
   exist. Chosen because it needs no channel decision from either person, covers the desk and the
   handset, and proves possession of a contact the member actually uses. **Cost:** three delivery
   ports, a reachability requirement at registration, and a code that must survive between an
   officer’s send and the member’s next session.
2. **Member or officer chooses SMS or email** (the earlier draft). Rejected by the owner: the choice
   belongs to the register, not to the member or the officer.
3. **Officer-assisted completion** (the officer reads the code to the member and types it). Rejected:
   you confirmed the member completes verification in USSD, and an officer who types the code is a
   relay rather than a control.
4. **A code entered in a member web or app portal.** Rejected: no member portal exists, and USSD is
   the member’s only channel.
5. **The membership card number or the date of birth as the second factor.** Rejected: both are
   guessable or shared, and neither proves possession.

Within the chosen shape the spec settles four sub-decisions: verification is bound to the number (a
second number must verify), the code is six digits (a million values with five attempts), it is stored
as HMAC-SHA256 under a pepper rather than a slow hash (the attempt and rate limits are the control),
and registration stays the one anonymous path so a new member can still join.

### API contracts

```ts
// Phase 1: reference titles.
// GET /v1/presbyter-titles  -> 200
interface PresbyterTitle {
  code: string;
  label: string;
  genderRestriction: 'male' | 'female' | null;
  active: boolean;
}

// Phase 1: two optional fields join the create contract (the update contract already has them).
interface MemberInput {
  titleCode?: string | null;
  titledOn?: string | null; // calendar date, never in the future
  membershipCardNo?: string | null;
  guardianMemberNo?: string | null; // create only: linked atomically when the member has no contact
}

// Phase 2: the photo endpoints.
type PhotoContentType = 'image/webp' | 'image/jpeg' | 'image/png';

// PUT /v1/members/:memberNo/photo
// request  Content-Type: PhotoContentType; body: raw bytes (1..2 MiB)
// 200      { photoUpdatedAt: string }
// 400      unsupported_photo
// 404      not_found
// 413      photo_too_large

// GET /v1/members/:memberNo/photo
// 200      the stored bytes; ETag: "<memberNo>-<photoUpdatedAt epoch ms>-<byte length>"
//          Cache-Control: private, max-age=300
// 304      If-None-Match matched; 404 when absent

// DELETE /v1/members/:memberNo/photo  -> 204

// Phase 3: the officer starts a code; the member completes it in USSD. No channel is chosen.
// POST /v1/members/:memberNo/verification/otp
// 202      { destinations: [{ channel: 'whatsapp' | 'email' | 'sms', masked }], expiresAt }
// 409      no_own_contact       // the member has no phone or WhatsApp (no USSD identity)
// 429      too_many_requests    // resend throttle
// DELETE /v1/members/:memberNo/verification  -> 204
// Phase 1: the guardian surface (no migration).
// GET /v1/members?guardianEligible=true&forMemberNo=<no>
//   -> 200 { items: [{ memberNo, name, contactMasked, via: string[] }] }
//   (active members aged 18+, reachable through an own contact or a chain, excluding the member
//    and its descendants; via names the intermediates between the guardian and the contact)
// MemberDetail gains: guardian: { memberNo, name, contactMasked, via: string[] } | null

// Reachability rules (Phase 1; no new endpoint)
// POST/PATCH a member with neither a contact nor a guardian -> 422 no_contact_or_guardian
// POST a guardian relationship to a member under 18, the member itself
//   or a descendant                                              -> 422 guardian_not_eligible
// POST a guardian link that would cycle                          -> 422 guardian_chain_cycle
// POST a guardian link with no terminal own contact              -> 422 guardian_chain_unreachable
// POST a guardian link longer than three                         -> 422 guardian_chain_too_long
// DELETE the last guardian of a member with no own contact -> 409 guardian_required
// POST /v1/members/:memberNo/verification/otp with no phone or WhatsApp -> 409 no_own_contact
interface MemberDetail {
  photoUpdatedAt: string | null;
  verifiedAt: string | null; // set only by a successful OTP
  verifiedNumberMasked: string | null; // the masked calling number (phone or WhatsApp)
  guardian: { memberNo: string; name: string; contactMasked: string; via: string[] } | null;
}

interface MemberListItem {
  photoUpdatedAt: string | null;
}
```

## Requirements

**Phase map.** Phase 1 owns MR-1..MR-13, MR-38..MR-42, MR-45, MR-48, MR-49 and MR-50; Phase 2 owns MR-14..MR-20; Phase 3
owns MR-22..MR-35 and MR-37, plus MR-43, MR-44, MR-46 and MR-47. MR-21 is shared by Phases 2 and 3 (photo and
OTP logging), and MR-36 constrains all three. Where a requirement names a later phase, it says so.

- MR-1: `PageActions` MUST support one action marked primary, rendered as a visible button beside the
  `Actions` menu; the remaining actions MUST render as menu items, destructive ones after a divider.
- MR-2: The member record MUST mark `Edit` primary and MUST place `View contacts`, `Assign shepherd`,
  `Add ministry`, `Add relationship`, `Add subscription`, `Verify membership` when the member has a
  phone or WhatsApp and is unverified (Phase 3), `Revoke verification` when verified (Phase 3), `Archive`/`Restore`
  and `Purge` in the menu.
- MR-3: Each menu action MUST invoke the surface that already owns the mutation; it MUST NOT
  duplicate that surface's form.
- MR-4: The menu MUST show `Restore` for an archived member and `Archive` otherwise, and `Purge` in
  both states.
- MR-5: The add and edit forms MUST NOT render an assembly join date input, and an edit MUST leave an
  existing value untouched.
- MR-6: The add and edit forms MUST carry `membershipCardNo`, trimmed, at most 32 characters, blank
  becoming null.
- MR-7: The edit form MUST show the current contact values and MUST offer `Manage contacts`, which
  opens the existing editable contacts dialog.
- MR-8: The edit form MUST add and remove ministries through the member-ministry endpoints,
  immediately, with the existing confirmation on remove; the create form MUST keep the create-time
  multiselect.
- MR-9: The create form MUST offer a shepherd (active officers only) and an optional assigned date;
  the member MUST be created first and the assignment attempted second, and a failed assignment MUST
  NOT undo the member.
- MR-10: The edit form MUST show the current shepherd and MUST reassign through the existing assign
  dialog, including its conflict and reason handling.
- MR-11: The add and edit forms MUST carry `titleCode` and an optional `titledOn` date that is not in
  the future; the create schema MUST accept both and the create repository MUST store them.
- MR-12: The title options MUST come from `GET /v1/presbyter-titles`, MUST be active titles only, and
  MUST be filtered by the member's selected gender and the title's restriction.
- MR-13: A title that the edited gender no longer allows MUST be cleared in the form, and the server
  MUST still return `422 validation_error` naming the title if a stale value is submitted.
- MR-14: Phase 2 MUST store at most one photo per member in the register, with its content type and
  update instant; it MUST NOT store a filename or the original bytes.
- MR-15: The client MUST crop to a square, scale to 512 x 512 and re-encode before upload, and MUST
  reject a source over 10 MiB.
- MR-16: The photo endpoint MUST accept only WebP, JPEG or PNG, verified by magic bytes, at most
  2 MiB, with the bearer required.
- MR-17: The photo response MUST be `Cache-Control: private`, MUST carry an `ETag` that includes the
  byte length (so two uploads inside one millisecond differ when their lengths differ), MUST answer 304 to
  a matching `If-None-Match`, and MUST 404 when the member has no photo.
- MR-18: `MemberDetail` and `MemberListItem` MUST carry `photoUpdatedAt`; the client MUST fetch the
  bytes as an authenticated blob and MUST revoke the object URL.
- MR-19: Every surface that shows a member avatar MUST use the photo when present and the initials
  otherwise.
- MR-20: Camera capture MUST use `getUserMedia`, MUST degrade to the file input when unavailable, and
  MUST reuse the same crop and encode path.
- MR-21: No log line, error message or stored value MUST contain the photo bytes, the source filename
  or EXIF data, and no production log line MUST contain an OTP code.
- MR-22: A registered number (phone or WhatsApp) without a live verification MUST see the verification
  menu and MUST NOT reach member services until the code is accepted; a verified number MUST pass
  straight to the menu.
- MR-23: Neither the member nor the officer MUST choose a delivery channel. The register MUST resolve
  the destinations from the member’s contacts.
- MR-24: The resolver MUST try WhatsApp first, email second and the number (SMS) third; when both
  WhatsApp and email exist it MUST send the same code to both; when only one exists it MUST use that
  one. A member with no phone or WhatsApp MUST be refused earlier with `409 no_own_contact`, so the
  SMS fallback always has a number.
- MR-25: A code MUST be six digits, single-use, valid for ten minutes and limited to five attempts,
  and MUST be stored only as an HMAC.
- MR-26: A correct code MUST set `verified_at` and the verified number hash for the calling number
  (phone or WhatsApp); a wrong code MUST decrement the attempts; an expired or consumed code MUST be
  refused.
- MR-27: A resend MUST be allowed after 60 seconds and at most five times an hour per member; the
  counters MUST live in Postgres.
- MR-28: An unregistered number MUST see only the registration flow and MUST NOT reach member services.
  A member created by that flow MUST be unverified.
- MR-29: An officer MUST be able to start a code from the member record with no channel choice, and
  MUST see the masked destinations and the expiry but never the code.
- MR-30: The create form MUST record the contacts the member has and MUST NOT require a contact the
  member does not have when a guardian supplies reachability; it MUST refuse a member with neither
  (MR-38).
- MR-31: An officer MUST be able to revoke a verification; the next frame from that number MUST require
  a new code.
- MR-32: Changing or removing the verified number contact MUST clear the verification.
- MR-33: `createMemberSchema` and `updateMemberSchema` MUST no longer accept `verified`; `verifiedAt`
  MUST be read-only and set only by the verification service.
- MR-34: The `Verified` badge MUST render only when `verifiedAt` is set, and its title MUST name the
  masked number and the date.
- MR-35: WhatsApp, email and SMS MUST be delivered through their ports only; the console
  implementations MUST exist only outside production, and production MUST never log a code.
- MR-36: Phase 1 MUST NOT require a migration; Phase 2 and Phase 3 migrations MUST be additive and
  reversible without changing the ORM contract.
- MR-37: A code an officer started MUST be completable in USSD through the menu’s `Enter code`
  option.

- MR-38: Every member created through the member API MUST be reachable: at least one own contact or at
  least one active `guardian` relationship. Bulk imports and seeds are outside this create rule; an
  officer completes such a record. A create with no own contacts MUST carry `guardianMemberNo` and MUST write the member, its contacts
  and the guardian link in one transaction; a failure MUST write none of them, and a create with
  neither MUST be refused with `422 no_contact_or_guardian`. Removing a member’s last own contact
  (by remove or unlink) while they have no guardian MUST be refused with `409 guardian_required`.
- MR-39: A member with no own contact MUST have at least one guardian; the last one MUST NOT be
  removable, and neither MUST a link whose removal would leave a dependant unreachable. The refusal
  MUST be `409 guardian_required`.
- MR-40: A guardian MUST be aged 18 or over and reachable through an own contact or a guardian chain
  that terminates at one. The chain MUST NOT cycle and MUST NOT exceed three links; an under-age, self
  or descendant guardian MUST be refused with `422 guardian_not_eligible`, a cycle with
  `422 guardian_chain_cycle`, an unreachable chain with `422 guardian_chain_unreachable`, and a longer
  chain with `422 guardian_chain_too_long`. The picker MUST list only eligible adults, excluding the
  member and its descendants.
- MR-41: The record of a member with no own contact MUST show the immediate guardian and the resolved
  contact, naming the intermediate members when the chain is longer than one link.
- MR-42: The add and edit forms MUST manage relationships. The create form’s guardian rides the
  create payload; other relationships are added after the member exists through the existing
  endpoints; on edit every change applies immediately.
- MR-43: A member with no own phone or WhatsApp MUST NOT be offered OTP verification; the service MUST
  refuse with `409 no_own_contact` and no `Verified` badge MUST render for them.
- MR-44: Adding a phone or WhatsApp later MUST enable the standard verification; the guardian relationship MAY
  remain.
- MR-45: A member with both contacts and a guardian MUST keep both; either alone MUST satisfy
  reachability.
- MR-46: Age MUST NOT determine contact or verification eligibility. A member of any age with a
  phone or WhatsApp verifies; a member without one is reached through the guardian.
- MR-47: A legacy member with a phone or WhatsApp number MUST keep the standard gate.
- MR-48: The add and edit forms MUST present the horizontal stepper described in the Phase 1
  decisions, directly beneath the breadcrumb, with numbered bubbles, a check on completed steps and
  connector lines:
  `Person and contact`, `Church and involvement`, a conditional `Relationships` step, and `Review`;
  `Next` MUST validate the current step, `Back` MUST NOT validate, and `Save` on `Review` MUST
  validate everything and submit the same payloads. No Fluent Wizard or Stepper exists in v9.75.1,
  so the rail MUST be composed from a semantic `nav`/ordered list of Fluent `Button`s with
  `aria-current="step"`, plus `Field` and `Button`. `TabList` MUST NOT be used for the
  stepper because its tab roles declare peer tabs, not a sequence. The stepper labels MUST hide below
  600 px while the numbered bubbles remain; `Back` MUST be disabled on the first step and `Next` MUST
  carry the accent, with `Create member`/`Save changes` accented on `Review`.
- MR-49: The add and edit forms MUST render `First name` and one required field labelled
  `Other names`; the separate `otherNames` input MUST be removed, and the `Other names` field MUST
  write `lastName`. Existing `otherNames` values MUST remain untouched.

- MR-50: Approving a registration request MUST require `guardianMemberNo`, validate the guardian by
  MR-40's rules and write the member and the guardian link in one transaction; the approval endpoint
  and the approvals screen MUST both require the guardian. A missing guardian MUST be
  `422 validation_error` naming the field; a guardian refusal MUST use MR-40’s codes
  (`guardian_not_eligible`, `guardian_chain_cycle`, `guardian_chain_unreachable`,
  `guardian_chain_too_long`); a refusal MUST leave the request `pending`.

## Acceptance Criteria

**Phase map.** Phase 1 owns AC-MR1..AC-MR11, AC-MR24..AC-MR27, AC-MR29, AC-MR30, AC-MR33, AC-MR38, AC-MR39 and AC-MR40; Phase 2 owns
AC-MR12..AC-MR14, AC-MR31 and AC-MR34; Phase 3 owns AC-MR15..AC-MR23, AC-MR28, AC-MR32, AC-MR35
and AC-MR37; AC-MR36 is shared by Phases 2 and 3. The verify and revoke items inside AC-MR1 belong
to Phase 3.

### AC-MR1: **Given** the member record, **When** it renders, **Then** `Edit` is a visible button and the `Actions` menu holds `View contacts`, `Assign shepherd`, `Add ministry`, `Add relationship`, `Add subscription`, `Verify membership` when the member has a phone or WhatsApp and is unverified (Phase 3), `Revoke verification` when verified (Phase 3), then `Archive` or `Restore`, then `Purge`. (MR-1..MR-4)

### AC-MR2: **Given** the `View contacts` menu item, **When** it is chosen from any tab, **Then** the contacts dialog opens and the values are visible; **Given** `Add subscription`, **Then** the Welfare & Services tab is active and its add control has focus. (MR-3)

### AC-MR3: **Given** an archived member, **When** the menu renders, **Then** it offers `Restore` and not `Archive`; **Given** an active member, **Then** it offers `Archive` and not `Restore`. (MR-4)

### AC-MR4: **Given** the add form, **When** it renders, **Then** there is no `Assembly joined` input and `Joined on` remains; **Given** an edit of a member whose assembly date is set, **When** the form is saved without touching it, **Then** the value is unchanged. (MR-5)

### AC-MR5: **Given** the add or edit form, **When** `MC-1001` is entered as the membership card and saved, **Then** the member detail returns `membershipCardNo: "MC-1001"`; **When** it is cleared and saved, **Then** the value is null. (MR-6)

### AC-MR6: **Given** the add form, **When** a title is chosen and an in-date entered, **Then** the created member returns that `title` and `titledOn`; **Given** no title, **Then** both are null. **Given** a future `titledOn`, **Then** the response is `422 validation_error` and the member is not created. (MR-11)

### AC-MR7: **Given** a female member, **When** the title picker opens, **Then** `Elder` and `Deacon` are not offered and `Deaconess` is; **Given** a male member, then the reverse. **Given** a title held and the gender edited to one the title forbids, **Then** the title is cleared with a note and a stale submit is refused by the API. (MR-12, MR-13)

### AC-MR8: **Given** an edit form, **When** it renders for a member with contacts, **Then** the values are listed and `Manage contacts` opens the editable dialog; **When** a value is added there and the dialog closes, **Then** the list shows it without a page reload. (MR-7)

### AC-MR9: **Given** an edit form, **When** a ministry is added by code, **Then** the member detail contains it before the form is saved; **When** it is removed and confirmed, **Then** the detail no longer contains it and the ministry itself still exists. (MR-8)

### AC-MR10: **Given** the add form with a shepherd chosen, **When** the member is saved, **Then** the member exists and the assignment is created; **Given** the assignment fails, **Then** the member still exists and the page shows a warning linking to the record. (MR-9)

### AC-MR11: **Given** an edit form for an assigned member, **When** the shepherd is changed, **Then** the old assignment ends and a new one starts with the stated reason. (MR-10)

### AC-MR12: **Given** a member with no photo, **When** the header renders, **Then** the initials avatar shows; **Given** a photo is uploaded, **Then** the header and every member avatar show it and `MemberDetail.photoUpdatedAt` is set. (MR-14, MR-18, MR-19)

### AC-MR13: **Given** a 12 MiB image, **When** it is chosen, **Then** the client refuses it; **Given** a 3 MiB image, **When** uploaded, **Then** the API answers 413 and stores nothing; **Given** a text file renamed to `.png`, **Then** the API answers 400. (MR-15, MR-16)

### AC-MR14: **Given** a stored photo, **When** requested with its `ETag`, **Then** the response is 304; **Given** no `If-None-Match`, **Then** 200 with `Cache-Control: private, max-age=300`; **Given** the photo is removed, **Then** 404 and the avatars fall back to initials. (MR-17)

### AC-MR15: **Given** a registered, unverified number, **When** it dials USSD, **Then** it sees `Verify your membership` with `1 Send code`, `2 Enter code` and `0 Exit`, no channel choice, and no member data before the code is accepted. (MR-22, MR-23)

### AC-MR16: **Given** the correct code, **When** it is entered, **Then** the member is verified for that number, the main menu opens in the same session, and the record shows `Verified` with the masked number and date; **Given** the same number dials again, **Then** the menu opens without a code. (MR-26, MR-34)

### AC-MR17: **Given** a wrong code, **When** it is entered, **Then** the prompt names the remaining attempts; **Given** five wrong codes, **Then** the session ends and the code is refused; **Given** an expired code, **Then** the prompt offers a resend. (MR-25, MR-26, MR-27)

### AC-MR18: **Given** an unregistered number, **When** it dials, **Then** it sees only `Register`; **When** it completes the registration, **Then** the new member is unverified and its next session shows the verification menu. (MR-28)

### AC-MR19: **Given** an officer revokes a verification, **When** the same number dials, **Then** a new code is required; **Given** the verified number contact is removed or replaced, **Then** the verification is cleared. (MR-31, MR-32)

### AC-MR20: **Given** an update request carrying `verified`, **When** it is submitted, **Then** the field is ignored or refused and `verifiedAt` does not change; **Given** a verification in production, **When** it is logged, **Then** no code appears. (MR-21, MR-33, MR-35)

### AC-MR21: **Given** an unverified member, **When** the officer chooses `Verify membership`, **Then** the register sends with no channel selector, the response lists the masked destinations and the expiry, never the code, and the member receives it; **Given** no phone or WhatsApp, **Then** the response is `409 no_own_contact` and nothing is sent. (MR-29, MR-24)

### AC-MR22: **Given** a code the officer started, **When** the member chooses `2 Enter code` in USSD and enters it, **Then** the member is verified and the menu opens; **When** the same code is entered a second time, **Then** it is refused. (MR-37)

### AC-MR23: **Given** a member with WhatsApp and email, **When** a code is issued, **Then** both destinations receive the same code; **Given** a number and email with no WhatsApp, **Then** email receives it; **Given** phone only, **Then** SMS receives it; **Given** no phone or WhatsApp, **Then** the issue is refused with `409 no_own_contact`. (MR-24)

### AC-MR24: **Given** the add form, **When** a member with no contact and no guardian is saved, **Then** the save is refused with `422 no_contact_or_guardian` and the guardian field is named; **When** a guardian is chosen, **Then** `guardianMemberNo` rides the create payload, the member and the relationship are written in one transaction, and a failed link writes neither; **When** contacts are entered, **Then** they are recorded and no guardian is required. (MR-38, MR-30)

### AC-MR25: **Given** the guardian picker for a member, **When** it opens, **Then** it lists only reachable members aged 18 or over and excludes the member and its descendants; **Given** a direct API call linking a younger member, the member itself, a descendant, a cycle, an unreachable chain or a fourth link, **Then** the response is `422 guardian_not_eligible`, `422 guardian_chain_cycle`, `422 guardian_chain_unreachable` or `422 guardian_chain_too_long`. (MR-40)

### AC-MR26: **Given** a member with no own contact and a guardian, **When** the record renders, **Then** it shows `Via <guardian>` with the resolved contact and no contact values of its own; **Given** a chain of two links, **Then** the intermediate member is named. (MR-41)

### AC-MR27: **Given** a member with no own contact and one guardian, **When** the officer removes it, **Then** the response is `409 guardian_required` and the link remains; **Given** the link is the only path for a dependant, **Then** the removal is refused with the same code; **Given** the member has an own contact and no dependant relies on the link, **Then** the guardian can be removed; **Given** a member with one contact and no guardian, **When** that contact is removed, **Then** the response is `409 guardian_required`. (MR-38, MR-39, MR-45)

### AC-MR28: **Given** a proxy-only member, **When** the OTP endpoint is called directly, **Then** the response is `409 no_own_contact`; **When** a phone or WhatsApp contact is added, **Then** the standard verification menu sends a code and the member can verify, whatever their age. (MR-43, MR-44, MR-46)

### AC-MR29: **Given** a member with both contacts and a guardian, **When** the record renders, **Then** both are shown and either alone satisfies reachability. (MR-45)

### AC-MR30: **Given** a member with no contact, **When** the guardian is changed on the edit form, **Then** the new guardian’s contact is the inherited one and the old link is removed through the existing relationship endpoint. (MR-42)

### AC-MR31: **Given** a browser without camera permission, **When** `Take photo` is chosen, **Then** the dialog explains the denial and the file input remains usable; **Given** a granted camera, **Then** a captured frame is cropped and encoded by the same path as a file. (MR-20)

### AC-MR32: **Given** a legacy member with a phone or WhatsApp number, **When** that number dials USSD, **Then** the standard verification menu applies and the member verifies. (MR-47)

### AC-MR33: **Given** the Phase 1 change set, **When** it is checked, **Then** no migration file is added or changed and the ORM/migration drift check passes. (MR-36)

### AC-MR34: **Given** a photo upload, **When** it is stored and logged, **Then** no filename, EXIF value or byte payload appears in the row or the log; the log carries the member number and byte length only. (MR-21)

### AC-MR35: **Given** a send, **When** another is requested within 60 seconds, **Then** the response is 429; **When** a sixth is requested in an hour, **Then** the response is 429. (MR-27)

### AC-MR36: **Given** the Phase 2 and Phase 3 change sets, **When** each migration is applied and reverted, **Then** it is additive and reversible and the ORM/migration drift check passes. (MR-36)

### AC-MR37: **Given** a member with no own phone or WhatsApp, **When** the record renders, **Then** there is no `Verified` badge and no `Verify membership` action; **Given** a member with both an own number and a guardian, **When** a code is issued, **Then** it goes to the own number, not the guardian’s. (MR-43, MR-24)

### AC-MR38: **Given** a create with a contact and no relationships, **When** the form opens, **Then** the rail shows `Person and contact`, `Church and involvement` and `Review`, and `Next` from step 2 reaches `Review`; **Given** no contact, **Then** the `Relationships` step is present and `Next` is blocked until a guardian is chosen; **Given** an invalid field on a step, **When** `Next` is chosen, **Then** the error shows and the step stays; **Given** `Back`, **Then** no validation runs; **Given** the stepper, **Then** it is horizontal directly beneath the breadcrumb at every width, its labels hide below 600 px and its numbered bubbles, completed checks and connectors remain; **Given** the first step, **Then** `Back` is disabled; **Given** a non-final step, **Then** `Next` carries the accent, and on `Review` the accent is `Create member`/`Save changes`; **Given** the future steps beyond the first invalid, **Then** they are disabled, and the active step’s heading takes focus; **Given** a reload of `?step=`, **Then** that step is restored; **Given** the edit-time contacts, ministries or relationships, **Then** they carry no unsaved state and are not part of the Review save; **Given** `Review`, **When** `Create member` is chosen, **Then** the same atomic payloads run. (MR-48)

### AC-MR39: **Given** the add or edit form, **When** the Identity section renders, **Then** there is no separate `Other names` input and the second required field is labelled `Other names`; **When** it is saved, **Then** the value lands in `lastName` and any existing `otherNames` is unchanged. (MR-49)

### AC-MR40: **Given** a pending registration request, **When** the approve dialog is submitted without a guardian, **Then** the save is refused and the guardian is named; **When** an eligible adult is chosen, **Then** the member and the guardian link are written in one transaction and the approved member is reachable; **Given** a guardian that MR-40's rules refuse (for example under 18), **Then** the response uses MR-40's code for that refusal and nothing is written. (MR-50)

## Testing Decisions

- **Seams, highest first.** (1) The USSD pipeline seam: `runUssdFrame` with fake WhatsApp, email and
  SMS senders and a PGlite member, asserting the verification menu with no channel choice, the
  resolver for WhatsApp plus email, a number with email and no WhatsApp, phone only and no contact, a code started by an
  officer and completed by `Enter code`, a correct code, a wrong code, expiry, the attempt limit,
  resend throttling, an unregistered number and a revoke mid-session. (2) The HTTP seam: route tests
  for `GET /v1/presbyter-titles`, the create payload with a title and contacts, the photo
  `PUT`/`GET`/`DELETE` (magic bytes, size, ETag/304, cache header, auth),
  `POST /v1/members/:memberNo/verification/otp` (the resolved destinations, `409 no_own_contact`, the
  throttle) and `DELETE /v1/members/:memberNo/verification`. (3) The page seam: DOM tests for the
  form (no assembly field, card, title picker and its gender filter, required contacts, ministries,
  shepherd, photo actions), the detail action row (verify, revoke) and `MemberAvatar`. (4) One browser
  case: create a member with a title, contacts, a ministry and a shepherd, upload a photo, and verify
  through the USSD harness. (5) The migration seam: PGlite migration tests and `npm run smoke`.
- **Reachability and guardian seam.** Route tests for `422 no_contact_or_guardian`,
  `409 guardian_required`, `422 guardian_not_eligible`, `422 guardian_chain_cycle`,
  `422 guardian_chain_unreachable`, `422 guardian_chain_too_long` and `409 no_own_contact`; members
  with a contact, a guardian only, both, neither, and a two-link chain; the guardian picker (18+,
  reachable, excluding self and descendants); page tests for the optional contact fields, the guardian
  picker and the `Via <guardian>` line with its intermediates; a member with a phone or WhatsApp number verifies
  regardless of age.
- **External behaviour only.** USSD tests assert the rendered text and the persisted `verified_at`, not
  machine state. Route tests assert status, headers, stored bytes and DTOs. DOM tests assert visible
  text, accessible names, focus and API-client calls with the right payload.
- **Fake senders are the test doubles.** The fake `SmsSender` and the fake `EmailSender` capture the code so
  the pipeline can enter it; no test reads a real provider, and no test asserts a code from a log.
- **Prior art.** `src/ussd` pipeline tests, `ui/src/pages/MemberFormPage.dom.test.tsx`,
  `MemberDetailPage.dom.test.tsx`, the contacts dialog e2e, and `tests/db` migration tests.
- **What makes a good test here.** Each acceptance criterion above becomes at least one
  failing-then-passing test; the image encoder is a pure function tested for size and type before any
  canvas work, and the canvas path is covered by the browser seam.

## Out of Scope

- **Presbyter rank** on the form. It was not requested; it stays in the backlog with the title work
  that this spec now covers.
- **Removing the assembly join date from the record or the API.** Only the form input goes.
- **Subscriptions on the edit form.** The create-time single subscription stays as FR-29a defines it.
- **Inline contact editing in the form.** The dialog is the one write path.
- **A zoom/pan cropper**, multiple photos, galleries, image moderation or a CDN.
- **Photo import/export, CSV or print surfaces.**
- **A channel choice for the member or the officer.** The register resolves WhatsApp, then email, then
  phone; a manual override is explored and rejected.
- **Officer completion of the code.** The officer starts the code and reads where it went; the member
  enters it in USSD.
- **A member web or app portal**, a code in an app, or verification by membership card or date of
  birth alone.
- **More than one verified number per member.** One number verifies at a time; changing it re-verifies.
- **Requiring any contact from a member who has none.** A guardian supplies reachability; the member’s
  own contacts are recorded only when they exist.
- **Verification for imported or seeded members.** An imported `verified_at` remains valid; the spec
  does not re-verify history.
- **USSD access for a proxy-only member.** They have no number to dial from; the guardian’s USSD
  access is the adult’s.
- **Inherited contacts in the members list, exports or pickers.** Only the record shows the
  guardian’s contact.
- **More than one guardian, an unbounded chain (the limit is three links), or a guardian history
  beyond the relationship rows.**
- **Forcing a contact on a member who has none.** The guardian path exists for that member.
- **A live camera or USSD session in the automated capture suite.**

## Further Notes

- **Phase split.** Phase 1 is a wire-contract gate with no migration (titles, the title create fields,
  the guardian filter and projection, and the reachability refusals). Phase 2 carries the photo
  migration and endpoint. Phase 3 carries the verification migration, the WhatsApp and SMS ports, the
  email sender, the USSD gate and the removal of the `verified` input. The owner authorises each phase
  by naming the round and its gate when the time comes.
- **Three delivery ports, three vendor questions.** WhatsApp is the new `WhatsAppSender`; SMS is the
  new `SmsSender`; email is the new `EmailSender`, backed by the existing mailer transport (Resend in
  production, console in development). Each needs a production account and a secret; the USSD vendor
  may cover SMS or WhatsApp. `ConsoleMailer` and the console senders print the code only outside
  production, `NullMailer` is the test default, and the test fakes capture the code; production never
  logs one. WhatsApp and email delivery, and the member’s contact quality, are the cost of the richer
  channels.
- **The USSD gate removes anonymous member services.** Registration stays open; events, offerings,
  welfare, profile and shepherding do not. This is a behaviour change for every existing unverified
  member and is the cost of "only verified members have USSD access".
- **Removing `verified` is a breaking wire change** for any caller other than this UI. No repository
  code or import sets it, but a deployed integration could; the release notes must say so.
- **Reachability replaced the age rule (owner, 2026-11-18).** Age is not a valid test: a child may
  have a phone and an adult may have none, as with a maid who relies on the household. The rule is
  reachability - an own contact or a guardian - and verification follows the number. A guardian may
  themselves be proxy-only (owner, 2026-11-18), so a chain is allowed: it must terminate at an adult
  with an own contact, must not cycle, and is limited to three links. A member with no phone or WhatsApp number has no
  USSD identity and is reached through the chain; adding a number later enables the standard flow.
- **Catalogue amendments.** Phase 1 amends the UI spec's FR-29 (action row), FR-29a (contacts on
  edit), FR-71 (the assembly date leaves the form; the membership card and title join it; the shepherd
  is a post-create step) and the API spec with the titles endpoint, the create fields, the guardian
  filter and projection and the reachability refusals. Phase 2 amends the API spec with the photo
  entity, migration and endpoints and the UI spec's avatar clauses. Phase 3 amends the API spec's `verified` create/update input and the UI spec's FR-25a checkbox, badge
  and action row, and `member-registrations-ussd.md` with the verification state and the gate.
- **Mocks and baselines.** One mock cut covers the add/edit form (populated, validation, title,
  contacts, shepherd, photo dialog) and the detail action row and header. The affected baselines are
  `member-add`, `member-detail`, `member-detail-overview`, `members-list` and `contacts-editable`. The
  USSD verification screens are text states in the USSD spec's glossary, not web mocks.
- **Why a spec file and not an issue.** This repository deliberately does not use a GitHub issue
  tracker or triage labels (`AGENTS.md` §13); the area specs under `documents/specs/` are its
  equivalent, and this file follows the same `to-spec` shape as the officers and headcount specs.
