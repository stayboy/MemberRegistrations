# Member registrations - member record actions, add/edit form, photo and membership verification

**Status:** approved by the owner, 2026-11-18; independent spec review ACCEPT, 2026-11-18, and
re-reviewed for the approval-guardian amendment and the ETag byte-length amendment, for the
Phase 3 verification amendment (grill answers of 2026-11-18), and for the 2026-11-19
contact-verification reshape (the member portal, per-contact proof and officer confirmation). Three
phases: **Phase 1** is a wire-contract gate: a small additive surface (a titles read endpoint, the
title create fields, a guardian eligibility filter and a guardian projection) plus new refusals on
the existing member and relationship endpoints (reachability); **Phase 2** (photo) adds a migration,
a wire endpoint and PII handling; **Phase 3** (contact verification, the member portal and officer confirmation) adds a
migration, a wire change, new outbound WhatsApp and SMS dependencies, an email sender, a public
acceptance page and encrypted pending storage. Phases 1, 2 and 3 are hard gates under `AGENTS.md` §17: each parks
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

A member's phone is recorded as a contact, and the USSD service can tell whether the dialing number
belongs to a member - but it cannot prove that the person holding the phone is that member. The record's
`Verified` badge can be set only by a seed or a direct API call, and it cannot show which of the
member's contacts was actually proven. The product deliberately answers "is this number one of the
member's?" rather than "is this phone this person?"; a second contact (email or WhatsApp) is the extra
proof, and an officer can attest when a member has no usable channel.

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

**Phase 3 - contact verification, the member acceptance page and officer confirmation, a hard gate.** The USSD session
identifies a member by an owned phone or WhatsApp number; that is possession of the number, not proof of
the person. The register still chooses where the code goes: **email** when present, else **WhatsApp**,
else the **phone**; every message carries the code and a short link to the public member acceptance
page, where the code is entered. A proven contact sets that
contact's `verified_at` and the badge names the channel; an officer can also **confirm** a member with an
audit, for a member with no usable channel, and `Revoke verification` withdraws every proof and the
confirmation. The officer never sees or types the code. Anonymous registration keeps the anonymous menu;
the request retains the caller's number encrypted and approval binds it as owned or borrowed, so an
approved member is identified next session and can verify. Age is not the test; having a contact is.

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
26. As a member, I want the register to send the code to me, so that I do not have to understand
    delivery channels.
27. As a member, I want the code on the contact the register picks - email first, then WhatsApp, then
    my phone - so that it reaches me without a choice I should not have to make.
28. As a member with both email and WhatsApp, I want the register to pick one reliably and tell me
    which, so that I know where to look.
29. As a member, I want to open the link in the message and enter the code there, so that I do not
    need to remember a menu path.
30. As a member whose code was started by an officer, I want to enter it on the member acceptance
    page, so
    that an officer can begin the process and I can finish it.
31. As a member, I want the main menu to open without a verification prompt, so that I can check
    events, offerings and my welfare cover in the same session.
32. As a member, I want the main menu to open as soon as I dial, so that I am not stopped by a
    verification prompt.
33. As a person whose number is not registered, I want the USSD service to offer registration rather
    than a dead end, so that I can join the register.
34. As a member who has just registered by USSD, I want to be identified by my own number next session
    and able to verify, so that I can complete my contact proof.
35. As a member, I want a code that expires and a limited number of tries, so that a guessed code
    cannot open my record.
36. As a member, I want a resend after a short wait, so that a lost message does not lock me out
    for the day.
37. As a church administrator, I want to start a verification from the member record, so that a
    member at the desk can be sent a code without dialling first.
38. As a church administrator, I want the register to choose the channel, so that I do not have to
    ask the member which one they have.
39. As a church administrator, I want to see which destination the code went to, how the member
    completes it and when it expires, so that I can tell them what to expect without ever seeing the
    code.
40. As a church administrator, I want to revoke a verification when a phone changes hands, so that
    the old number immediately loses member access.
41. As a church administrator, I want the `Verified` badge, its proof and its date on the record, so
    that I can see at a glance which contact is proven.
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
53. As a church administrator, I want no code send for a member with no email, phone or WhatsApp, and
    a `Confirm member` action instead, so that the register offers only a proof that can exist.
54. As a member who later gets an email, phone or WhatsApp number, I want to add it and verify, so
    that I gain the badge and eligibility when I can.
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

- **Approval binds the number, and a guardian only when needed.** The USSD registration request
  retains the caller's number encrypted (Phase 3, MR-53), so approving it can bind that number.
  `POST /v1/registration-requests/:id/approve` MUST carry `phoneOwnership` (`own` or `borrowed`) and a
  `guardianMemberNo` only when the number is borrowed (or the member has no own contact). `own` writes
  the decrypted number as an owned contact and needs no guardian; `borrowed` links the number to the
  guardian and validates it like any guardian (18+, reachable, chain rules), writing the member, its
  contact and the guardian link in one transaction. A missing required guardian is `422
validation_error` naming the field; an ineligible guardian is `422 guardian_not_eligible`. The
  approvals screen MUST ask the own/borrowed question and require the guardian only when borrowed.

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

### Phase 3 - contact verification, the member acceptance page and officer confirmation (hard gate)

- **Identification is possession, not identity.** An owned `phone` or `whatsapp` contact match identifies
  the member for the USSD session and opens the member menu; the register proves "this number", never
  "this person". An identified member uses the menu whether or not any contact is verified: there is no
  verification gate. An anonymous number keeps the anonymous menu and visitor giving. A spoofed MSISDN
  is an accepted, documented risk of trusting the gateway's number assertion; the register does not
  claim to defend it.
- **Proof is per contact.** `member_contacts.verified_at` records that a code sent to that one contact
  was accepted. The `Verified` badge names the most recent proof - `Email verified`, `WhatsApp
verified`, `Phone verified` or `Officer confirmed` - with the masked value and the date; its title
  lists every proof. Changing or removing a contact clears its proof. The officer confirmation lives in
  the append-only `member_confirmations` table; the DTO's `confirmedAt` and `requires_verified` read the
  latest non-withdrawn row, never the legacy `members.verified_at`, which stays inert history. An
  imported or seeded `verified_at` with no audit row is history only: no badge and no eligibility.
- **The register picks the channel; the page completes it.** `issue(memberId, now)` resolves one channel
  from the member's own contacts: **email** when present, else **WhatsApp**, else the **phone**, skipping any contact that is already
  proven; when every owned contact is proven the action is not offered and `issue` refuses `409
already_verified`. Every channel is completed on the **member acceptance page**: the message carries the six-digit code and the
  short link. Neither the member nor the officer chooses. A member with no email, WhatsApp or phone is
  refused with `409 no_own_contact`.
- **The code.** Six digits from `crypto.randomInt`, HMAC-SHA-256 under `OTP_PEPPER`, valid for ten
  minutes, five attempts, one live code per member. A resend is allowed after 60 seconds and at most
  five in an hour per member; the refusal is `429 too_many_requests`; the fifth wrong code ends the
  attempt with `Too many attempts`. The counters live in Postgres.
- **The member acceptance page.** A public page at `/v#t=<token>` (base `VERIFICATION_LINK_BASE`, e.g.
  `/v` locally or `/v.html` on static hosting), served outside the officer app's `#/` router, with no
  member data before acceptance. The token is random, stored only as a hash, single-use and expiring with
  the code; the page asks for the six digits and posts `{ token, code }` to an unauthenticated endpoint
  rate-limited per token and per address, with the five-attempt cap. Success shows only the masked
  destination and the outcome. **Every** message (email, WhatsApp, SMS) carries the code and the link;
  the link never verifies by itself.
- **The member starts it too.** An identified member (an owned phone or WhatsApp) opens `My Profile >
1 Verify contact`; the register issues through the same service, sends the code and link to the
  resolved channel, and renders `status.verification_sent` - "A code was sent to <mask>. Open the link
  we sent." The action is hidden once a proof or officer confirmation exists, and it shares the officer
  throttle. The page remains the only entry; no six-digit prompt is added to USSD. An email-only or
  contactless member has no USSD identity and is officer-initiated. The feature is specified in
  `member-verification-initiation.md`.
- **The officer's controls.** `Verify membership` on an unverified member sends to the resolved channel
  and shows the masked destination, the **completion route** (`open the link we sent to <channel>`), and
  the expiry; never the code. `Confirm member` records an audited
  confirmation with a reason and is the path for a member with no own contact or a failed channel.
  `Revoke verification` withdraws every contact proof and the confirmation, audited; it never removes a
  contact and never blocks an identified phone. The officer never sees or types the code.
- **Registration.** The pending request retains the caller's number **encrypted** under
  `REGISTRATION_PHONE_KEY` (AES-256-GCM) and erases it on approve, reject or purge. Approval decrypts it
  and writes it as an owned phone contact, or, on the officer's `borrowed` choice, links it to the
  guardian and requires the guardian; the member then has no own number. An approved member with an own
  number is identified next session and can verify on the member acceptance page. The
  officer sees the masked number only.
- **Email-only and contactless members.** A member whose only contact is email verifies on the
  acceptance page like any other channel; a contactless member is reached through the guardian and
  officer-confirmed.
- **The bare `verified` input leaves the wire.** `createMemberSchema` and `updateMemberSchema` drop
  `verified`; `confirmedAt` and `verifiedContacts` are read-only, set only by the verification and
  confirmation services. The UI never sent `verified`; the import parser does not use it.
- **Anonymous features remain.** An unregistered number keeps today's anonymous menu (`Register`,
  `Offerings`, `Activities`, `Attendance`, `Exit`) and visitor giving; the gate never applies to an
  anonymous session. The real flag is `session.anonymous`.
- **Data model.** `member_contacts.verified_at`; `member_confirmations` (append-only: `id`, `member_id`,
  `confirmed_by`, `confirmed_at`, `reason`, `withdrawn_at`, `withdrawn_by`); `member_verification_codes`
  with `token_hash`, `contact_id` and `destination_value_hash` (always present); `registration_requests.phone_encrypted`; `members.verified_at` stays
  inert history and the confirmation audit is the source. `0025` is re-authored in place; the member-level
  number hash and mask never land.

### Options explored - membership verification

The conversation explored the shapes; the spec now builds the hybrid.

1. **The register picks one channel; every channel uses the member acceptance page (chosen).** The
   register chooses one channel and the message carries the code and a short link; the page accepts the
   code for any channel. Cost: a public page and a token.
2. **USSD for email/WhatsApp and the page for the phone** (the earlier draft). Rejected by the owner:
   the link reaches every channel, so one completion surface is simpler and USSD verification retires.
3. **A channel choice by the member or the officer.** Rejected: the register chooses, not either person.
4. **Officer-assisted code completion** (the officer reads or types the code). Rejected: the officer
   confirmation is an attestation, not a relay, and the officer never sees the code.
5. **The membership card number or the date of birth as the factor.** Rejected: guessable or shared.

Sub-decisions: proof is per contact; the register sends one code to one channel; the phone uses the
member acceptance page; the
officer confirmation is audited; registration retains the number encrypted and binds it at approval.

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

// Phase 3: the officer starts a code; the member completes it on the member acceptance page.
// POST /v1/members/:memberNo/verification/otp
// 202      { destination: { channel: 'email' | 'whatsapp' | 'phone', masked }, expiresAt }
// 409      no_own_contact
// 429      too_many_requests
// 503      delivery_unavailable
// DELETE /v1/members/:memberNo/verification  -> 204  // withdraw every contact proof and the confirmation
// POST /v1/members/:memberNo/confirmation   { reason } -> 201 { confirmedAt }
// DELETE /v1/members/:memberNo/confirmation -> 204

// Public member acceptance page (unauthenticated; the token and the code are the credential):
// POST /portal/verification/accept { token, code } -> 200 { channel: 'email' | 'whatsapp' | 'phone', masked }
// 400      code_invalid | code_expired | too_many_tries
// 429      too_many_requests

// Approval of an anonymous registration:
// POST /v1/registration-requests/:id/approve { guardianMemberNo, phoneOwnership: 'own' | 'borrowed' }

// MemberDetail gains:
// verifiedContacts: [{ id, channel: 'phone' | 'whatsapp' | 'email', masked, verifiedAt }]
// confirmedAt: string | null

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
// POST /v1/members/:memberNo/verification/otp with no email, WhatsApp or phone -> 409 no_own_contact
interface MemberDetail {
  photoUpdatedAt: string | null;
  verifiedContacts: {
    id: string;
    channel: 'phone' | 'whatsapp' | 'email';
    masked: string;
    verifiedAt: string;
  }[];
  confirmedAt: string | null; // the officer confirmation
  guardian: { memberNo: string; name: string; contactMasked: string; via: string[] } | null;
}

interface MemberListItem {
  photoUpdatedAt: string | null;
}
```

## Requirements

**Phase map.** Phase 1 owns MR-1..MR-13, MR-38..MR-42, MR-45, MR-48, MR-49 and the guardian-required part of MR-50;
Phase 2 owns MR-14..MR-20; Phase 3 owns MR-22..MR-35, MR-37, MR-51..MR-55, the `phoneOwnership` part of
MR-50, plus MR-43, MR-44, MR-46 and MR-47. Phase 1's approval stays guardian-required until Phase 3's
encrypted retention lands; Phase 3 adds the own/borrowed choice. MR-21 is shared by Phases 2 and 3 (photo and
OTP logging), and MR-36 constrains all three. Where a requirement names a later phase, it says so.

- MR-1: `PageActions` MUST support one action marked primary, rendered as a visible button beside the
  `Actions` menu; the remaining actions MUST render as menu items, destructive ones after a divider.
- MR-2: The member record MUST mark `Edit` primary and MUST place `View contacts`, `Assign shepherd`,
  `Add ministry`, `Add relationship`, `Add subscription`, `Verify membership` when the member has an owned
  contact that is not yet proven and no active confirmation (Phase 3), `Confirm member` when no active confirmation
  exists (Phase 3), `Revoke verification` when any proof or confirmation exists (Phase 3),
  `Archive`/`Restore` and `Purge` in the menu.
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
- MR-22: An owned phone or WhatsApp contact MUST identify the member and MUST open the member menu; an
  anonymous number MUST keep the anonymous menu. There is no verification gate. A spoofed MSISDN MUST be
  recorded as an accepted risk, not defended by a code to the same number.
- MR-23: Neither the member nor the officer MUST choose a delivery channel. The register MUST resolve
  one channel from the member's own contacts.
- MR-24: The resolver MUST choose the first **unproven** channel: email when present, else WhatsApp, else
  the phone; a proven contact MUST be skipped. When every owned contact is proven the issue MUST be
  refused with `409 already_verified`. Every channel MUST be completed on the member acceptance page, and
  the message MUST carry the code and the short link. A member with no email, WhatsApp or phone MUST be
  refused with `409 no_own_contact`. A
  stored number of at most 10 digits MUST be prefixed with `DEFAULT_COUNTRY_CODE` when it does not
  already start with it; a longer number MUST be used as stored.
- MR-25: A code MUST be six digits, single-use, valid for ten minutes and limited to five attempts, and
  MUST be stored only as an HMAC.
- MR-26: A correct code MUST set `member_contacts.verified_at` on the one contact the code was sent to;
  a wrong code MUST decrement the attempts; an expired or consumed code MUST be refused. A second entry
  of the same code MUST be refused.
- MR-27: A resend MUST be allowed after 60 seconds and at most five times an hour per member, officer
  sends included; the refusal MUST be `429 too_many_requests`; the counters MUST live in Postgres.
- MR-28: An unregistered number MUST see the anonymous menu (`Register`, `Offerings`, `Activities`,
  `Attendance`, `Exit`) and MUST NOT reach member-only data or actions. Approval MUST bind the
  registration number as an owned contact, or as the guardian's when the officer records it borrowed.
- MR-29: An officer MUST be able to start a code from the member record with no channel choice, and MUST
  see the masked destination, the completion route (the link sent to that channel) and the expiry, but
  never the code.
- MR-30: The create form MUST record the contacts the member has and MUST NOT require a contact the
  member does not have when a guardian supplies reachability; it MUST refuse a member with neither
  (MR-38).
- MR-31: An officer MUST be able to withdraw every contact proof and the confirmation. The confirmation
  withdrawal MUST be audited (actor and instant); clearing a contact proof is a column clear with no
  separate audit. Neither MUST remove a contact or block an identified phone. The USSD session remains
  identified.
- MR-32: Changing or removing a contact MUST clear that contact's proof; removing the last contact is
  still governed by the guardian rule (MR-39).
- MR-33: `createMemberSchema` and `updateMemberSchema` MUST no longer accept `verified`; `confirmedAt`
  and `verifiedContacts` MUST be read-only and set only by the verification and confirmation services.
- MR-34: The `Verified` badge MUST render only when a contact proof or an officer confirmation exists,
  MUST name the proof (`Email`, `WhatsApp`, `Phone` or `Officer confirmed`) and
  the date, and its title MUST list every proof. An imported `verified_at` with no audit row MUST NOT
  render the badge.
- MR-35: Email, WhatsApp and SMS MUST be delivered through their ports only; email MUST use Resend
  behind a generic method, WhatsApp and SMS a provider-neutral HTTP adapter, and a destination with no
  configured sender MUST be refused with `503 delivery_unavailable`; the console implementations MUST
  exist only outside production, and production MUST never log a code.
- MR-36: Phase 1 MUST NOT require a migration; Phase 2 and Phase 3 migrations MUST be additive and
  reversible without changing the ORM contract.
- MR-37: A code an officer started MUST be completable exactly once, on the member acceptance page.
- MR-51: The member acceptance page MUST be public and served outside the officer router, with no
  member data before acceptance; its token MUST be random, stored only as a hash, single-use and
  expiring with the code; the link MUST NOT verify by itself, and every message MUST carry the code and the
  link. Its accept endpoint MUST enforce the five-attempt cap and a per-token and per-address rate
  limit, answering `429 too_many_requests` when either is exceeded.
- MR-52: `Confirm member` MUST record an append-only audit (actor, reason, instant) and `Revoke
verification` MUST withdraw it with an audit; the officer MUST never see or type a code.
- MR-53: A pending registration request MUST retain the caller's number encrypted under
  `REGISTRATION_PHONE_KEY` (at least 16 characters, required in production), show only the mask, and
  erase the encrypted value on approve, reject or purge; approval MUST bind it as owned or borrowed,
  and a number already owned by another member MUST be refused with `409 contact_in_use` naming the
  owner, leaving the request pending. The existing hash remains for the rate limit and the reference;
  the encrypted value exists only to bind the contact at approval. Purge MUST erase the member's
  confirmation rows (or null their `reason`).
- MR-54: An identified member (an owned phone or WhatsApp) with at least one unproven owned contact and
  no officer confirmation MUST be able to start a code from `My Profile > 1 Verify contact` in
  USSD; the register MUST resolve one channel, send the code and the acceptance-page link, and render
  the masked destination and the link instruction. USSD MUST NOT prompt for the six-digit code.
- MR-55: The member-initiated send MUST share the officer's 60-second and 5-per-hour limits, the one
  live code and the 503 `delivery_unavailable`; a member with every owned contact proven, or an active
  officer confirmation, MUST NOT see the action; an anonymous session MUST NOT see it. An email-only or contactless member has no USSD identity and is
  officer-initiated; the 409 belongs to the officer path.

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
- MR-43: A member with no own email, phone or WhatsApp MUST NOT be offered a code; the service MUST
  refuse with `409 no_own_contact`, and the officer MAY confirm the member instead, in which case the
  badge reads `Officer confirmed`.
- MR-44: Adding an email, phone or WhatsApp later MUST enable the standard send and completion; the
  guardian relationship MAY remain.
- MR-45: A member with both contacts and a guardian MUST keep both; either alone MUST satisfy
  reachability.
- MR-46: Age MUST NOT determine contact or verification eligibility. A member of any age with a
  phone or WhatsApp verifies; a member without one is reached through the guardian.
- MR-47: A legacy member with a phone or WhatsApp number MUST keep the standard identification and MAY
  verify an email or WhatsApp contact, or the phone on the member acceptance page.
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

- MR-50: Approving a registration request MUST require `phoneOwnership`; `own` MUST write the
  decrypted number as an owned contact, and `borrowed` MUST link it to a `guardianMemberNo` validated
  by MR-40's rules, writing the member, its contact and the guardian link in one transaction. A missing
  guardian when one is required MUST be `422 validation_error` naming the field; a guardian refusal
  MUST use MR-40's codes (`guardian_not_eligible`, `guardian_chain_cycle`, `guardian_chain_unreachable`,
  `guardian_chain_too_long`); a refusal MUST leave the request `pending`.

## Acceptance Criteria

**Phase map.** Phase 1 owns AC-MR1..AC-MR11, AC-MR24..AC-MR27, AC-MR29, AC-MR30, AC-MR33, AC-MR38, AC-MR39 and AC-MR40; Phase 2 owns
AC-MR12..AC-MR14, AC-MR31 and AC-MR34; Phase 3 owns AC-MR15..AC-MR23, AC-MR28, AC-MR32, AC-MR35
and AC-MR37; AC-MR36 is shared by Phases 2 and 3. The verify and revoke items inside AC-MR1 belong
to Phase 3.

### AC-MR1: **Given** the member record, **When** it renders, **Then** `Edit` is a visible button and the `Actions` menu holds `View contacts`, `Assign shepherd`, `Add ministry`, `Add relationship`, `Add subscription`, `Verify membership` when the member has an email, WhatsApp or phone and no proof (Phase 3),

`Confirm member` when no active confirmation exists (Phase 3), `Revoke verification` when verified or
confirmed (Phase 3), then `Archive` or `Restore`, then `Purge`. (MR-1..MR-4)

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

### AC-MR15: **Given** an owned phone or WhatsApp number, **When** it dials USSD, **Then** the member menu opens with no verification gate; **Given** an anonymous number, **Then** it sees the anonymous menu and no member data. (MR-22, MR-28)

### AC-MR16: **Given** an email or WhatsApp member, **When** the officer sends and the member enters the code on the member acceptance page, **Then** the one contact the code was sent to is verified, the badge names the proof and the date, and a second entry of the same code is refused. (MR-24, MR-26, MR-34)

### AC-MR17: **Given** a wrong code, **When** it is entered, **Then** the prompt names the remaining attempts; **Given** five wrong codes, **Then** the code is refused; **Given** an expired code, **Then** the prompt offers a resend. (MR-25, MR-26, MR-27)

### AC-MR18: **Given** an unregistered number, **When** it dials, **Then** it sees the anonymous menu (`Register`, `Offerings`, `Activities`, `Attendance`, `Exit`) and no member data; **When** the registration is approved with its own number, **Then** the member is identified next session and can verify; **When** it is approved as borrowed, **Then** the number links to the guardian, the member has no own number, and the guardian is required. (MR-28, MR-53)

### AC-MR19: **Given** an officer revokes verification, **When** the record renders, **Then** every contact proof and the confirmation are withdrawn with an audit and the badge is gone; **Given** the member's phone is still owned, **Then** it still identifies the member at USSD; **Given** a verified contact is changed or removed, **Then** its proof is cleared. (MR-31, MR-32)

### AC-MR20: **Given** an update request carrying `verified`, **When** it is submitted, **Then** the field is ignored or refused and `confirmedAt` does not change; **Given** a verification in production, **When** it is logged, **Then** no code appears. (MR-21, MR-33, MR-35)

### AC-MR21: **Given** an unverified member, **When** the officer chooses `Verify membership`, **Then** the register sends to the resolved channel with no selector, the response lists the masked destination, the completion route and the expiry, never the code; **Given** no email, WhatsApp or phone, **Then** the response is `409 no_own_contact` and nothing is sent. (MR-29, MR-24)

### AC-MR22: **Given** a code the officer started, **When** the member completes it on the member acceptance page, **Then** it is accepted once; **When** the same code is entered a second time, **Then** it is refused. (MR-37)

### AC-MR23: **Given** a member with email and WhatsApp, **When** a code is issued, **Then** email receives it and the message carries the link; **Given** WhatsApp only, **Then** WhatsApp receives it and the message carries the link; **Given** email only, **Then** email receives it and the link; **Given** phone only, **Then** the SMS carries the code and the link; **Given** none, **Then** the issue is refused with `409 no_own_contact`. (MR-24)

### AC-MR24: **Given** the add form, **When** a member with no contact and no guardian is saved, **Then** the save is refused with `422 no_contact_or_guardian` and the guardian field is named; **When** a guardian is chosen, **Then** `guardianMemberNo` rides the create payload, the member and the relationship are written in one transaction, and a failed link writes neither; **When** contacts are entered, **Then** they are recorded and no guardian is required. (MR-38, MR-30)

### AC-MR25: **Given** the guardian picker for a member, **When** it opens, **Then** it lists only reachable members aged 18 or over and excludes the member and its descendants; **Given** a direct API call linking a younger member, the member itself, a descendant, a cycle, an unreachable chain or a fourth link, **Then** the response is `422 guardian_not_eligible`, `422 guardian_chain_cycle`, `422 guardian_chain_unreachable` or `422 guardian_chain_too_long`. (MR-40)

### AC-MR26: **Given** a member with no own contact and a guardian, **When** the record renders, **Then** it shows `Via <guardian>` with the resolved contact and no contact values of its own; **Given** a chain of two links, **Then** the intermediate member is named. (MR-41)

### AC-MR27: **Given** a member with no own contact and one guardian, **When** the officer removes it, **Then** the response is `409 guardian_required` and the link remains; **Given** the link is the only path for a dependant, **Then** the removal is refused with the same code; **Given** the member has an own contact and no dependant relies on the link, **Then** the guardian can be removed; **Given** a member with one contact and no guardian, **When** that contact is removed, **Then** the response is `409 guardian_required`. (MR-38, MR-39, MR-45)

### AC-MR28: **Given** a proxy-only member, **When** the OTP endpoint is called directly, **Then** the response is `409 no_own_contact`; **When** an email, phone or WhatsApp contact is added, **Then** the standard send applies and the member can complete it, whatever their age. (MR-43, MR-44, MR-46)

### AC-MR29: **Given** a member with both contacts and a guardian, **When** the record renders, **Then** both are shown and either alone satisfies reachability. (MR-45)

### AC-MR30: **Given** a member with no contact, **When** the guardian is changed on the edit form, **Then** the new guardian’s contact is the inherited one and the old link is removed through the existing relationship endpoint. (MR-42)

### AC-MR31: **Given** a browser without camera permission, **When** `Take photo` is chosen, **Then** the dialog explains the denial and the file input remains usable; **Given** a granted camera, **Then** a captured frame is cropped and encoded by the same path as a file. (MR-20)

### AC-MR32: **Given** a legacy member with a phone or WhatsApp number, **When** that number dials USSD, **Then** the member menu opens and the member can verify any contact on the member acceptance page. (MR-47)

### AC-MR33: **Given** the Phase 1 change set, **When** it is checked, **Then** no migration file is added or changed and the ORM/migration drift check passes. (MR-36)

### AC-MR34: **Given** a photo upload, **When** it is stored and logged, **Then** no filename, EXIF value or byte payload appears in the row or the log; the log carries the member number and byte length only. (MR-21)

### AC-MR35: **Given** a send, **When** another is requested within 60 seconds, **Then** the response is `429 too_many_requests`; **When** a sixth is requested in an hour, **Then** the response is `429 too_many_requests`; **Given** a destination with no configured sender, **When** a code is issued, **Then** the response is `503 delivery_unavailable` and nothing is stored. (MR-27, MR-35)

### AC-MR36: **Given** the Phase 2 and Phase 3 change sets, **When** each migration is applied and reverted, **Then** it is additive and reversible and the ORM/migration drift check passes. (MR-36)

### AC-MR37: **Given** a member with no own email, phone or WhatsApp, **When** the record renders, **Then** there is no `Verify membership` send and `Confirm member` is offered instead; **Given** an imported `verified_at` with no audit row, **Then** no badge renders; **Given** an own number and a guardian, **When** a code is issued, **Then** it goes to the own contact, not the guardian's. (MR-43, MR-24, MR-34)

### AC-MR38: **Given** a create with a contact and no relationships, **When** the form opens, **Then** the rail shows `Person and contact`, `Church and involvement` and `Review`, and `Next` from step 2 reaches `Review`; **Given** no contact, **Then** the `Relationships` step is present and `Next` is blocked until a guardian is chosen; **Given** an invalid field on a step, **When** `Next` is chosen, **Then** the error shows and the step stays; **Given** `Back`, **Then** no validation runs; **Given** the stepper, **Then** it is horizontal directly beneath the breadcrumb at every width, its labels hide below 600 px and its numbered bubbles, completed checks and connectors remain; **Given** the first step, **Then** `Back` is disabled; **Given** a non-final step, **Then** `Next` carries the accent, and on `Review` the accent is `Create member`/`Save changes`; **Given** the future steps beyond the first invalid, **Then** they are disabled, and the active step’s heading takes focus; **Given** a reload of `?step=`, **Then** that step is restored; **Given** the edit-time contacts, ministries or relationships, **Then** they carry no unsaved state and are not part of the Review save; **Given** `Review`, **When** `Create member` is chosen, **Then** the same atomic payloads run. (MR-48)

### AC-MR39: **Given** the add or edit form, **When** the Identity section renders, **Then** there is no separate `Other names` input and the second required field is labelled `Other names`; **When** it is saved, **Then** the value lands in `lastName` and any existing `otherNames` is unchanged. (MR-49)

### AC-MR40: **Given** a pending registration request, **When** the approve dialog is submitted without a guardian, **Then** the save is refused and the guardian is named; **When** an eligible adult is chosen, **Then** the member and the guardian link are written in one transaction and the approved member is reachable; **Given** a guardian that MR-40's rules refuse (for example under 18), **Then** the response uses MR-40's code for that refusal and nothing is written. (MR-50)

### AC-MR41: **Given** a phone-only member, **When** the officer sends, **Then** the SMS carries the code and a short link to the member acceptance page; **When** the member opens the link and enters the code, **Then** the phone contact is verified and the badge names `Phone verified`; **Given** the token, **Then** it is single-use, it expires with the code, it never appears in the URL as the code, and a second use is refused. (MR-51)

### AC-MR42: **Given** a member with no own contact, **When** the officer chooses `Confirm member` with a reason, **Then** an audit row records the actor, reason and instant and the badge reads `Officer confirmed`; **When** `Revoke verification` is chosen, **Then** the confirmation and every contact proof are withdrawn with an audit; **Given** the member's phone is still owned, **Then** it still identifies the member. (MR-52, MR-31)

### AC-MR43: **Given** a pending registration request, **When** it is stored, **Then** the caller's number is encrypted under `REGISTRATION_PHONE_KEY` and the list shows only the mask; **When** it is approved as own, **Then** the number becomes an owned contact; **When** it is approved as borrowed, **Then** it links to the guardian and the guardian is required; **When** it is approved, rejected or purged, **Then** the encrypted value is erased. (MR-53, MR-28)

### AC-MR44: **Given** an identified member (an owned phone or WhatsApp) with at least one unproven owned contact and no officer confirmation, **When** they choose `My Profile > Verify contact`, **Then** the register sends the code and the acceptance-page link to the resolved channel and renders the masked destination and the link instruction, with no six-digit prompt in USSD; **Given** the member opens the link, **Then** the page accepts the code once and the contact is proven. (MR-54)

### AC-MR45: **Given** a member who asked within 60 seconds or six times in an hour, **When** they choose the action, **Then** the notice names the wait or the limit; **Given** a member with every owned contact proven, or an active officer confirmation, **Then** the action is absent; **Given** an anonymous session, **Then** the action is absent. (MR-55)

### AC-MR46: **Given** one proven contact and another owned unproven contact, **When** the officer or the member starts a code, **Then** the resolver picks the unproven channel and, once accepted, the badge lists both proofs; **Given** every owned contact is proven or the member is officer-confirmed, **Then** the action is absent and a direct issue is `409 already_verified`. (MR-24, MR-54, MR-55)

## Testing Decisions

- **Seams, highest first.** (1) The portal seam: the public accept route with a token and a code -
  single use, expiry, attempts, the rate limit, any channel, and no member data before acceptance. (2)
  The HTTP seam: route tests for `GET /v1/presbyter-titles`, the create payload with a title and
  contacts, the photo `PUT`/`GET`/`DELETE`, `POST /v1/members/:memberNo/verification/otp` (the resolved
  channel and link, `409 no_own_contact`, the throttle, `503 delivery_unavailable`), `DELETE
…/verification`, `POST`/`DELETE …/confirmation`, and approval with `phoneOwnership`. (3) The page
  seam: DOM tests for the form, the detail action row (verify, confirm, revoke), the member acceptance
  page and `MemberAvatar`. (4) The USSD seam: the identified member menu, the anonymous menu with no
  verification gate, and the member-initiated `Verify contact` action (channel, mask, link, throttle,
  contactless, hidden when proven). (5) The migration seam: PGlite migration tests, the encryption
  round-trip and `npm run smoke`.
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
- **A channel choice for the member or the officer.** The register resolves email, then WhatsApp, then
  phone; a manual override is explored and rejected.
- **Officer completion of the code.** The officer never types the code; `Confirm member` is an audited
  attestation, not a relay.
- **A full member portal beyond the OTP acceptance page**, a code in an app, or verification by
  membership card or date of birth alone. The acceptance page shows no member data and dies with its
  token.
- **More than one proof at a time is allowed.** A member may prove several contacts; the badge names the
  most recent and its title lists them all.
- **Requiring any contact from a member who has none.** A guardian supplies reachability; the member’s
  own contacts are recorded only when they exist.
- **Verification for imported or seeded members.** A `verified_at` with no audit row stays as history:
  no badge and no eligibility; a fresh contact proof or an officer confirmation replaces it.
- **USSD access for a proxy-only member.** They have no number to dial from; the guardian’s access is
  the adult’s, and the officer confirmation covers the member.
- **Inherited contacts in the members list, exports or pickers.** Only the record shows the
  guardian’s contact.
- **More than one guardian, an unbounded chain (the limit is three links), or a guardian history
  beyond the relationship rows.**
- **Forcing a contact on a member who has none.** The guardian path exists for that member.
- **A live camera or USSD session in the automated capture suite.**

## Further Notes

- **Phase split.** Phase 1 is a wire-contract gate with no migration (titles, the title create fields,
  the guardian filter and projection, and the reachability refusals). Phase 2 carries the photo
  migration and endpoint. Phase 3 carries the verification migration (per-contact proof, the code store, the
  confirmation audit and the encrypted registration number), the three senders, the public portal, the
  officer confirmation and the removal of the `verified` input. The owner authorises each phase
  by naming the round and its gate when the time comes.
- **Three delivery ports, three vendor questions.** WhatsApp is the new `WhatsAppSender`; SMS is the
  new `SmsSender`; email is the new `EmailSender`, backed by the existing mailer transport (Resend in
  production, console in development). Each needs a production account and a secret; the USSD vendor
  may cover SMS or WhatsApp. `ConsoleMailer` and the console senders print the code only outside
  production, `NullMailer` is the test default, and the test fakes capture the code; production never
  logs one. WhatsApp and email delivery, and the member’s contact quality, are the cost of the richer
  channels.
- **Identification, not a gate.** An owned number opens the member menu and verification is a badge and
  an eligibility fact, not an access gate; registration and the anonymous menu (Offerings, Activities,
  Attendance and visitor giving) stay open. The cost is that member data is protected by possession of
  an owned number, not by proof of the person; a spoofed MSISDN is the accepted risk and a second
  channel or an officer confirmation is the extra proof.
- **Removing `verified` is a breaking wire change** for any caller other than this UI. No repository
  code or import sets it, but a deployed integration could; the release notes must say so.
- **Reachability replaced the age rule (owner, 2026-11-18).** Age is not a valid test: a child may
  have a phone and an adult may have none, as with a maid who relies on the household. The rule is
  reachability - an own contact or a guardian - and verification follows the contact. A guardian may
  themselves be proxy-only (owner, 2026-11-18), so a chain is allowed: it must terminate at an adult
  with an own contact, must not cycle, and is limited to three links. A member with no email, phone or
  WhatsApp has no USSD identity and is reached through the chain; adding a contact later enables the
  flow.
- **Catalogue amendments.** Phase 1 amends the UI spec's FR-29 (action row), FR-29a (contacts on
  edit), FR-71 (the assembly date leaves the form; the membership card and title join it; the shepherd
  is a post-create step) and the API spec with the titles endpoint, the create fields, the guardian
  filter and projection and the reachability refusals. Phase 2 amends the API spec with the photo
  entity, migration and endpoints and the UI spec's avatar clauses. Phase 3 amends the API spec ('verified' off the wire, `verifiedContacts` and `confirmedAt`, the
  verification, confirmation and public portal routes, the approval `phoneOwnership`), the UI spec
  (FR-25a, the badge, the action row, the member acceptance page and the approve dialog) and
  `member-registrations-ussd.md` (identification, the anonymous menu and the no-gate decision).
- **Mocks and baselines.** One mock cut covers the add/edit form (populated, validation, title,
  contacts, shepherd, photo dialog) and the detail action row and header. The affected baselines are
  `member-add`, `member-detail`, `member-detail-overview`, `members-list` and `contacts-editable`. The USSD
  handset set carries no verification screens; the member acceptance page is an acceptance-page mock,
  and the officer record badge/actions and the sent dialog are portal mocks.
- **Member-initiated verification.** The 2026-11-19 instruction amends the phase: the member starts the
  code from USSD (`My Profile > Verify contact`), the page enters it, and the officer path and throttle
  are shared. See `member-verification-initiation.md`.
- **Why a spec file and not an issue.** This repository deliberately does not use a GitHub issue
  tracker or triage labels (`AGENTS.md` §13); the area specs under `documents/specs/` are its
  equivalent, and this file follows the same `to-spec` shape as the officers and headcount specs.
