# Spec — MemberRegistrations API

**Author:** Solomon Owoo

|            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | **Approved 2026-11-03**, amended 2026-11-04 - v1, shepherding, and the V2/V3 amendment (events, per-session attendance, offerings, session gateway). Implementation is gated by tickets 01-24 plus 11a and 15a. **2026-11-22 amendment - the event is the parent** (owner decision, 2026-11-22), and the same day's **audience, membership-status and session-offering amendment**; both texts were approved by the owner on 2026-11-22, as recorded in `documents/rounds/event-parent.md`. The audience and the person kinds are specified in `member-registrations-event-audience.md`; the session attachment is specified in `member-registrations-session-offerings.md` |
| Date       | 2026-11-02 (amended 2026-11-03, 2026-11-04 and 2026-11-22)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Repo       | `MemberRegistrations` (standalone repository)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Origin     | Conversational feature request, 2026-11-02; V2/V3 amendment 2026-11-03                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Supersedes | The Blob/local-JSON revision of this spec (persistence replaced by Postgres)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**2026-11-22 amendment - the event is the parent.** The owner settled that an event owns its
recurrence and its dates: the event is the first-class aggregate, a recurrence is its optional
schedule, and an occurrence is one dated child. The **migration and the wire are named hard gates**
for the four-round sequence: this spec round, then the migration/API round, then the UI round, then the
downstream round. No migration or code lands in the spec round.

---

## Change log

- 2026-11-23: **an exception removal deletes directives, not history** (owner: "all as recommended", write round;
  review P1): the data model now says the exception table is append-only _as a date's directive history_ — a write
  appends, the newest row per date is effective, and the `DELETE` removes every directive for that date. An exception is
  a schedule instruction, so nothing with history depends on it; the append-only rule in `AGENTS.md` §5 governs records
  that carry history (attendance, headcounts, offerings, calls). The route table names the route as removal of the
  directives. Rejected: a removal-marker row (a migration and a fourth directive kind for no history benefit).
- 2026-11-23: **the parent write is `PATCH`, and the create body is exactly one of `occurrences`, one `recurrence` or a `period`** (owner:
  "all as recommended", write round). The route table's `PUT` becomes the legacy per-instance write kept only for the
  deployed form, and `PATCH` carries the parent's partial update with the same `If-Match` rule. The create body accepts
  `eventNo` (optional; the server mints it when absent) and exactly one of **one or more** manual occurrences, one recurrence, or a `period { id, cycleMonth }`, never more than one;
  the derived range stays read-only.
- 2026-11-23: **the read transition** (owner: unattended, 2026-11-23): `/v1/events`, `/v1/events/:id` and
  `/v1/series/:id` keep their legacy shapes as the default and serve the parent read with `view=parent`; the legacy
  serialisers retire in the downstream round, when the default flips, while the flag stays accepted as an ignored
  alias (amended 2026-11-24) so the deployed UI needs no change.

- 2026-11-22: **two migration decisions** (owner: "all as recommended"): a legacy `draft` instance keeps a
  `draft` parent status (`draft | active | archived`), and the legacy per-instance offering attachments rekey
  to their occurrence (`event_offerings.occurrence_id`) rather than to the parent alone, preserving the date
  for the offerings round. The event DTO, the parent status, the data model and the migration outline say so.

- 2026-11-22: **the migration/API round is open, and its shape is settled** (owner: "go on to next", then "all as
  recommended"). Two slices: 2a the migrations and the rekey with the existing routes' wire unchanged, 2b the
  events/occurrences API, the three legacy aliases (`GET /v1/series/:id` as the parent read, `seriesId` as `eventId` on
  the members attendance aggregate, `eventNo` on create) and the capture amendment's API half. The event-parent
  migration is `0026_event_parent` and drops the legacy tables after its asserts; the audiences, membership status and
  first-time visitor identities are `0027_event_audience_membership`. `events.ministry_id`/`presbyter_only` stay
  read-only until the downstream round, `event_offerings` rekeys to the occurrence (the date is preserved for the
  offerings round), and the standalone
  import lift and session-offering attachment stay out. The owner's answer names this round's migration and wire gates.

- 2026-11-22: **a capture never ends a session** (owner, 2026-11-22: "import or capture should not end
  session. have admin alternative explicit action to end it... this feature should not be enforced").
  The automatic end on an outside-the-window capture is removed: an import outside the live window is
  still an open capture. The close is the operator's explicit end-only capture (`rows: []` with
  `ended: true`, labelled **End of session**), offered on any open occurrence, and it is optional — nothing
  enforces it and an occurrence may stay open indefinitely. After the explicit close, any capture or
  per-member write still answers `409 session_closed`. FR-6b, the import paragraph, the Headcounts
  paragraph, AC-32 and AC-33a say so; this supersedes the automatic end in the 2026-11-11 capture model.
  The headcount and attendance specs are amended in the same change. No route or schema changes: the
  existing `ended` input carries the explicit action and an end-only capture already accepts no rows.

- 2026-11-22: **the event's applicability is an audience, the member gains a status, and an offering
  attaches per session** (owner, 2026-11-22; the same grill round as the event parent, with the Q5
  amendment). The event carries `audienceId` as its applicability field; the optional ministry and the
  presbyter-only toggle become read-only legacy projections mapped onto seeded or combination audiences,
  and `startDate`/`endDate` return as the parent's overall range. The member read and create carry
  `membershipStatus` (`visitor | active | archived`), a registered visitor is promotable, and a first-time
  visitor can be registered as a registered visitor matched by phone with the giving history kept. FR-1,
  FR-3, FR-13, FR-14,
  FR-42 and the new FR-32–FR-35 say so; the Member, Event and Contribution sections, the Members,
  Reference-data and Offerings route tables and the data models carry the change. The detail is
  `member-registrations-event-audience.md`; the per-session attachment was specified in
  `member-registrations-session-offerings.md` and is **withdrawn (2026-11-24)** — an offering attaches to the
  parent and is collected per session. The standalone attendance import is **settled the same day**: the restriction is lifted, a
  standalone occurrence imports like a recurring one, and `422 series_required` retires. The migration and
  the wire remain the named hard gates; no code or migration lands in this round.

- 2026-11-22: **the event is the parent.** The owner settled that an event owns its recurrence and its
  dates (owner, 2026-11-22: "event should carry ministry (optional), presbyter only as series mock
  shows. all other as recommended"). The `EventSeries` template and the per-instance event stop being
  the model: one **event** aggregate carries identity (`eventNo`, name, optional ministry), when/where
  (dates, times, venue), tracking (`tracksMembers`, `presbyterOnly`), an optional **recurrence** and its
  **occurrences**. Generation is per recurrence and idempotent on `(eventId, date)`; attendance and
  imports scope to one occurrence. FR-1-FR-8, the Event/Recurrence/Occurrence domain sections, the
  attendance rules, the Events and reference-data route tables, the event DTOs and the data models say
  so; the `/v1/series` routes retire or alias the parent read, and the offerings attach to the parent
  (**corrected the same day: the attachment is a per-session session offering, not the parent - see the
  entry above and `member-registrations-session-offerings.md`. **Superseded 2026-11-24:** that correction was
  itself withdrawn; the attachment is at the parent event and the session carries the collection.**).
  The **migration and the wire are named hard gates** for the four-round sequence (this spec round, the
  migration/API round, the UI round, then the downstream round). No migration or code lands in this
  round.

- 2026-11-19: USSD verification is retired. Every channel (email, WhatsApp, phone) sends the code
  and a short link to the member acceptance page; the issue response is `{ destination, expiresAt }` (no
  `entry`) and the public accept route handles any channel's token. The earlier 2026-11-19 entry is
  superseded on that point.

- 2026-11-19: Phase 3 is reshaped to contact verification. A registered number is identified, not gated;
  `MemberDetail` gains `verifiedContacts` (the proven email/WhatsApp/phone contacts, each with a masked
  value and instant) and `confirmedAt` (the officer confirmation, audited), and loses
  `verifiedNumberMasked`. `POST .../verification/otp` returns the resolved destination, the entry route
  (`ussd` or `acceptance-page`) and the expiry; `DELETE .../verification` withdraws every proof and the
  confirmation; `POST`/`DELETE .../confirmation` record and withdraw the officer attestation. The phone
  code is accepted at the public `POST /portal/verification/accept` with a token and the code. Approval
  carries `phoneOwnership` and the pending request keeps the number encrypted until the decision. The
  2026-11-18 entry is superseded.

- 2026-11-18: Phase 3 of the member-record spec adds OTP verification. `verifiedAt` becomes
  read-only, set only by the verification service and bound to `members.verified_number_hash` and
  `members.verified_number_masked`; `MemberDetail` gains `verifiedNumberMasked`;
  `POST /v1/members/{memberNo}/verification/otp` starts a code (`202` with masked destinations and expiry,
  `409 no_own_contact`, `429 too_many_requests`, `503 delivery_unavailable`) and
  `DELETE /v1/members/{memberNo}/verification` revokes (`204`). `createMemberSchema` and
  `updateMemberSchema` drop `verified`. Migration `0025` adds the two columns and
  `member_verification_codes`.

- 2026-11-13: `officerReason` on `POST /v1/pledges` becomes an **optional note**, not a requirement (owner,
  2026-11-13: "Reason should be an instruction note and optional. Not a required field"). The API accepted it
  only alongside an explicit officer and rejected an officer without one, which made every pledge that named
  an officer, and every note on a defaulted shepherd, impossible to record from the UI. It is now trimmed,
  1-500 characters, accepted with or without `followUpOfficerMemberNo`, and stored in `reason`. Reassignment
  keeps its own mandatory reason. This is the named §17 authorisation for the create-contract change: no wire
  field was added or removed, only a validation rule.

- 2026-11-11: capture-contract truth. `DuplicateImportError` is removed (a live capture may repeat, so
  the `409` could never fire), the headcount End action uses the import page's three states, and the
  event session's `capture` is required-nullable on the UI types. No behaviour change beyond the action
  states.

- 2026-11-11: capture precedence settled for two corners, both already implied by AC-33. The shared close
  is checked before the headcount calendar-day rule, so a past session already closed by a late import
  answers `409 session_closed`, not `422 validation_error`. A redeemed `attendance_punch` is a per-member
  write and obeys §Clocking — today-only (`422`) and not after a close (`409`) — and neither refusal
  consumes the code; the USSD glossary reports those as `Closed` / `Not today`, never `Bad code`. No new
  acceptance criterion. Approved by the owner 2026-11-11 after the window-seat grill. **Superseded
  2026-11-22:** "closed by a late import" reads "closed by an explicit end"; no import closes a session
  by timing.

- 2026-11-11: attendance is a **capture** model. An import or headcount stamps `asOf` and carries `ended`;
  live is computed from the session date and its time window in the event timezone, so the user only
  presses End of session. A capture outside the window with no close is the end capture. One close per
  (event, session) is shared across channels; after it every per-member and headcount write answers
  `409 session_closed`. Captures replace the session's imported rows and manual rows survive; live
  captures may repeat. Manual and USSD per-member writes are limited to a session dated today in the
  event timezone and refused after a close. AC-32/AC-33 added; the import and headcount contracts, the
  `Headcount` DTO and the error list say so. The migration `0020_attendance_captures` adds `as_of` nullable
  with a `now()` default, backfills it from each batch's `created_at`, then applies `not null`; it adds
  `ended boolean not null default false` to `import_batches` and `event_session_headcounts`, so existing
  rows read `ended = false`. A headcount after the session's calendar day is refused with
  `422 validation_error`, so only a late import closes a past session. **Superseded 2026-11-22:** a
  capture never ends a session, including one outside the live window; only the operator's explicit end
  action does, and nothing enforces it.

- 2026-11-11: an attendance import is limited to series-backed events; a standalone event answers
  `422 series_required` and writes nothing. Existing standalone attendance history stays visible and
  read-only, and manual and USSD per-member attendance are unchanged. AC-31 added; the import
  paragraph, the endpoint row and the error list say so. **Superseded 2026-11-22:** the restriction is
  lifted; a standalone occurrence imports like a recurring one and `422 series_required` retires.

- 2026-11-11: data-model table name corrected: the attendance table is `attendance`, not
  `event_attendance` (it was renamed when attendance was rekeyed to the generated event instance).
  No behaviour change.

- 2026-11-10: `/health` joins the CORS allowlist. The operator UI probes it before requesting a magic
  link, so without the header the browser refuses to let the probe read the `200` and the connection
  badge reports the gateway down, local compose included. `/health` serves its normal result with the
  header set for an allowed origin and without the header otherwise; `/openapi.json` stays non-CORS.
  (AC-23)

- 2026-11-10: the USSD and payment secrets stop being required when their subsystems are off.
  `USSD_ENABLED=false` (the default) no longer requires `USSD_GATEWAY_SECRET`, `USSD_PHONE_PEPPER`,
  `USSD_CODE_PEPPER` or the `USSD_NALO_USER_ID` client identifier, and the USSD entries
  answer `503 ussd_disabled` before any HMAC check. A new `PAYMENTS_ENABLED` (default `false`) keeps
  `POST /v1/payments/callback` unmounted, answering `404`, and drops `PAYMENT_GATEWAY_SECRET` from
  the required set. `VISITOR_PHONE_PEPPER` stays required: contributions and pledges hash visitor
  phones. (Deployment; AC-29, AC-30)

- 2026-11-09: `q` on `GET /v1/members` narrows to member number and name parts (first, last, other
  names, alias, maiden name), never owned or linked contact values (FR-31a, Q6); the shepherding
  roster DTO carries `contactCount` (owned and linked), not contact values (Q5). The separate
  `contact` filter is unchanged.
- 2026-11-08: the MVP adds the offering-count route (`GET`/`POST /v1/events/{eventId}/offering-counts`)
  and renumbers 24e's expected migration to `0018` after `0017_offering_counts`. The count tables are
  specified in `member-registrations-events-offerings.md` (phase 5); this spec carries the route row.
- 2026-11-06: 24d slice B1 implements both provider adapters over `POST /ussd/session`, with Nalo at
  `POST /ussd/nalo` (the route table already carried the row). `ussd_disabled` is recorded with its
  `503` status in the canonical error list. The dev-only `POST /dev/ussd/session` is not part of the
  browser API surface and stays out of OpenAPI.
- 2026-11-06: 24d slice A review follow-up. The headcount `Location` gains its read target
  `GET /v1/events/{eventId}/headcounts/{headcountId}` (one observation, `no-store`, `404` for an
  unknown id or another event's row). The presbyter-only hiding rule is scoped to the **member**
  surface: the USSD delegate path still answers the hidden `404`, while the officer bearer
  `POST /v1/events/{eventId}/delegations` answers `422 not_presbyter` because the officer supplied
  the member number.
- 2026-11-06: 24d slice A scopes presbyter-only visibility to **member-facing** surfaces: the USSD
  member session and the member-scoped routes hide a presbyter-only event from a non-presbyter, while
  an officer's bearer read is the whole-register back office and sees every event like any other (V2
  has no per-officer authorization, so the bearer surface carries no member identity). An
  implementer-introduced member-identity request header on the bearer event routes is removed before
  merge; it was authorization-shaped and does not belong on that surface. A headcount correction
  keeps the target's `asOf` even when recorded on a later day.
- 2026-11-05: 24c settles the welfare wire contract: `subscription_products` (server-evaluated
  eligibility, `paymentMode`, period and dependent rules), product CRUD with an active-only `PUT`,
  self-subscription that resolves the payer server-side, renew from `max(periodEnd, today)`,
  `subscription_payments` (idempotent, one row per period; premiums recorded, not transacted),
  `subscription_claims` (`pending → approved/rejected`, `approved → paid`), the owned+inherited
  subscription read, and the detail-only `membership_card_no`/`verified_at` fields. Migration 0015 is
  pre-authorised for this round; legacy `life_insurance`/`credit_union` rows stay readable with a null
  `kind` product model.
- 2026-11-05: the operator's "expected headcount" becomes a **headcount** — an actual count, never an
  expected figure — recorded append-only in `event_session_headcounts` with a `mode`, six gender
  buckets, `total`, `asOf` and `supersedesId`; a correction supersedes without deleting. The
  register-derived `expected` keeps its wire name and is labelled **Roster**. `GET`/`POST
/v1/events/{eventId}/headcounts` replace `GET`/`PUT …/expected` (the old route is removed in 24d).
  `presbyterOnly` is added to events and series, and a presbyter-only session's roster is the active
  presbyters. Everything lands in 24d, extending migration 0016; 24c is unaffected and 24e stays at 0018.
- 2026-11-05: 24b adds the attendance/code/registration/clocking/expected/profile seams listed in
  **USSD attendance, codes and clocking (24b)**, and `presbyterRank` on `MemberDetail` (positive
  integer, valid only with `isPresbyter`, cleared with the flag).
- 2026-11-05: presbyter ranks, membership cards and verification are settled. `presbyterRank` is an
  admin-set integer (1 = most senior) valid only with `isPresbyter`; any non-null rank is a senior
  presbyter for clocking, ties are allowed, and clearing the flag clears the rank. `membershipCardNo`
  is 1–32 trimmed characters, unique case-insensitively when present. `confirmedAt` is a nullable timestamp with no expiry, set only by the officer confirmation service and
  audited; the write payload no longer accepts `verified`. `verifiedContacts` lists the proven contacts.
  Both are on `MemberDetail` only; card and verification are independent.
- 2026-11-17: `MemberDetail` gains `shepherd: { memberNo, name, gender, age, assignedOn } | null` and `calls: { attempts, conversations, lastCalledOn: string | null, lastReachedOn: string | null }`, reusing the projection behind `GET /v1/members/{memberNo}/shepherding` for the **current assignment, all-time** (no window). `lastCalledOn` is the latest called date over all outcomes; `lastReachedOn` is the latest over `outcome = reached`; both are null when no such call exists. The overview therefore makes no second read. Each `AttendanceSeries.entries[]` row gains `eventId` (the event instance for that row) and `eventName`; recurring series group by the parent row's `seriesId`. `MemberDetail`, `createMemberSchema` and `updateMemberSchema` gain four nullable membership fields: `assemblyJoinedOn` (UTC date of joining this assembly, distinct from the pre-existing `joinedOn`), `cameFrom`, `movedOutOn` (UTC date) and `movedToAssembly`. They are plain strings/dates, not a history table or a new route. The ministry rows on the detail also carry `position: { code: string, label: string } | null` - the duty assigned by
  `POST /v1/members/{memberNo}/ministries` - so the overview can show the member's role alongside the
  ministry name. The same additive fields appear on `GET /v1/members/{memberNo}/attendance`, which returns the same series shape. Non-series attendance is returned as a row with `seriesId: null` and `seriesName: null`, its entries grouped by `eventId`; the detail projection must include those rows rather than dropping them. 2026-11-17 clarification: the role field is `position: { code, label } | null`, not the write-side `positionCode`; Dates remain UTC calendar dates, append-only calls gain no mutation path, and `Cache-Control: no-store` applies.
- 2026-11-13: `ageMonths` added to `MemberSummary`, derived like `age` but in completed months (null under the
  same rule), so a picker can distinguish an eight-month-old from a one-year-old. It lands on the summary and,
  by extension, `MemberDetail`; the relationship, shepherding and event-attendance DTOs are unchanged and gain
  it only when a surface needs the month form. The UI spec owns the label rule, including the picker's compact
  variant.
- 2026-11-05: member references render a shared `FullName (Gender, Ny)` identity label. `MemberSummary`
  and `MemberDetail` gain a derived `age`; the relationship, shepherding and event-attendance DTOs gain
  `gender` and `age`; `dob` stays detail-only. Age is completed years at today (UTC), null when `dob`
  is null or in the future, and always the current age, never the age at a historical record's date.
  The UI spec owns the label rule and the USSD spec owns the short display glossary.
- 2026-11-05: welfare products gain a payer mode (`paymentMode`: `member`/`church`/`either`), a cover
  period, and dependent rules (`covers`, `maxDependents`, `allowedRelationships`); subscriptions record
  `paidBy`, `periodStart`/`periodEnd` and a per-period `subscription_payments` row for member-paid cover,
  while church-paid cover is started or renewed by the back office. See the USSD spec.
- 2026-11-05: the aggregator-facing USSD entry is `POST /ussd/session`, outside the bearer namespace;
  `/v1/ussd/*` is removed, and the attendance/giving/subscription flow is specified in
  `member-registrations-ussd.md`. The payment-group commit, pledge settle and member attendance/payment
  summaries are listed as ticket-24 bearer seams; the gateway callback is ticket 24.
- 2026-11-05: pledge follow-up is the member's active shepherd or an admin-supplied active presbyter
  with a reason (`422 officer_required` otherwise); `pledge` leaves `OfferingKind` because a pledge is
  a payment mode on an existing offering. Pledges, pledge events and reminders are specified for ticket
  22, and `pledges` gains `terms_version`/`idempotency_key`/`created_at`/`created_by`; `pledge_events`
  records the from/to officer on reassignment.
- 2026-11-05: contributions specified for ticket 21 — idempotent by a globally unique key (identical
  repeat `200`, different payload `409 idempotency_conflict`), accepted only for an active attached
  offering on one of the event's session dates and not after expiry (`422 offering_expired`), recording
  the `termsVersion` and a server-generated `MR-…` reference; visitor phones are HMAC-SHA-256 hashed
  under `VISITOR_PHONE_PEPPER` and never returned; `GET /v1/contributions` is `no-store` and
  `GET /v1/contributions/summary` splits member and visitor totals by currency. The full detail is in
  `member-registrations-events-offerings.md`.
- 2026-11-05: offerings routes reconciled with the ticket-20 phase-1 contract — terms publish via
  `POST /v1/offerings/{id}/terms` with a required `baseVersion` and `reason` (NFR-3 audit), `PUT`
  toggles only `active` and records `updated_by`, attach and
  list are on the collection and detach is a `DELETE` on the item, exception routes nest under the
  attachment, and `terms_version_conflict`/`invalid_exception_date` join the code list. Contributions
  and pledges name `eventId` on the wire. The full detail is in
  `member-registrations-events-offerings.md`.
- 2026-11-05: the per-session attendance report's rows carry their `attendance.id`; `GET /v1/members`
  accepts `unassigned=true`; an `import_failed` body may carry `rows: [{ row, message }]` for
  row-level failures — field validation and unknown attendance members name every offending row, a
  duplicate `memberNo` names each involved row, database-dependent checks name the row they stop at,
  and batch-level failures carry none.
- 2026-11-04: attendance import scoped to a selected session (`eventId` + `sessionDate`) instead of a
  per-row event number; rows are `(memberNo, datetime?)`; the attendance row gains an optional
  `sessionTime`; the checksum covers the occurrence; a repeat is a `409` with the existing batch id;
  the result reports written and skipped counts (suppression or manual shadow).
- 2026-11-03: added `cors_rejected`; clarified gateway topology, session transport and rate-limit
  storage while implementing ticket 11a.

## Context

The church keeps member registrations keyed by member number, carrying personal demographics,
contacts, service subscriptions, ministry assignments and attendance. There is no API surface to look
a member up, no CRUD API over the register, and no trustworthy way to answer "how often did this
member attend the Sunday service this quarter?".

The register and attendance currently arrive as two separate files — a member database export and an
attendance registry (`memberno`, `date`, `eventno`) — and attendance is reported as free text such as
`eventname1 - 2 out of 5`. Nothing defines what the "5" is, so the number cannot be computed, audited
or trusted.

The V2 amendment addresses the next gap: a standalone multi-day event such as the Strategic
Conference (13–15 October 2026, 17:30, Main Auditorium) cannot be represented as a recurring series,
and attendance must be reportable per session. V3 adds offerings, contributions and pledges against
those events.

## Solution

A standalone **Express 5 + TypeScript** API on **Node.js 24 LTS**, persisted in **Postgres (Neon)**,
deployed to Vercel as a single function.

- Attendance is **modelled, not transcribed**: an event declares its own dates, or a recurrence that
  generates them, and a member's record shows `attended` / `expected` per event.
- **The event is the aggregate**: it is the parent of its recurrence and its occurrences. A standalone
  conference records its dates by hand; a recurring event owns a versioned recurrence that generates
  its dates idempotently. There is no series above the event.
- Giving is **modelled, not bolted on**: offerings carry versioned terms, contributions and pledges are
  append-only, and visitor giving never creates a member record.
- The domain is **behaviour-rich**: member, subscription, relationship and event aggregates own their
  invariants; routes only parse input and delegate.
- Shepherding is **historical, not a checkbox**: presbyters own assignment and call histories, a
  reassignment needs explicit consent and a reason, and every call attempt is permanent.
- The API is **typed and documented** from the same Zod schemas that validate requests, generating an
  OpenAPI 3.1 document.
- Personal data sits behind bearer authentication, writes are attributed, and concurrency is
  optimistic.

## User Stories

1. As a ministry leader, I want to look up a member by member number or by any contact value, so that
   I can open the right record during a meeting — including when I only have the household phone.
2. As a ministry leader, I want one lookup to return name parts (first, last, other names, maiden name,
   alias), date of birth, gender, residence, contacts, subscriptions, ministries, relationships and
   attendance, so that one call answers "who is this?".
3. As a ministry leader, I want attendance shown as `attended` out of `expected` per event
   (e.g. "Sunday Main English Service — 2 of 5"), so that the number has a definition I can explain.
4. As an administrator, I want to create, update, archive, restore and purge registrations, so that the
   register stays correct without hand-editing files.
5. As an administrator, I want to record and correct attendance for a member against an event and date,
   so that manual corrections coexist with imported registries.
6. As an administrator, I want to import the member database and attendance registry idempotently, with
   a downloadable Excel template, so that re-running a file is safe and a bad file changes nothing.
7. As an administrator, I want ministries, events and their recurrences managed through the API, so that
   reference data is not hard-coded in a deployment.
8. As an administrator, I want spouse and dependent links between real member records, so that a
   household is visible without duplicating people.
9. As a finance officer, I want a household insurance policy recorded once with an explicit coverage
   list, so that I do not create one subscription per family member.
10. As an auditor, I want every write attributed to an actor and every import recorded, so that changes
    can be traced.
11. As an API consumer, I want a generated OpenAPI 3.1 document, so that a client can be produced
    without guesswork.
12. As a security owner, I want PII behind authentication, never cached, and purgeable, so that the
    church can honour deletion requests.
13. As a presbyter, I want my shepherding list with each member's contacts and last contact, so that I
    know who to call next.
14. As a presbyter, I want to log every call attempt with feedback, any issue, and whether the member
    is still with the church, so that follow-up is recorded once and is not lost.
15. As a pastor, I want coverage and call totals per officer, so that I can see which members are not
    being shepherded and which lists have gone quiet.
16. As an events officer, I want a standalone multi-day event with its own venue, so that a conference
    is not modelled as a dummy recurring series.
17. As an events officer, I want attendance per session, so that "who came on Wednesday?" has an
    answer for a three-day event.
18. As a finance officer, I want offerings with versioned terms attached to an event, so that gifts
    and pledges are recorded against the right appeal.
19. As a member or visitor, I want to give or pledge by app or USSD and receive a receipt, so that
    giving does not require a member record.
20. As a presbyter, I want a pledge follow-up list, so that pledges are honored and not forgotten.

## Functional Requirements

- FR-1: An event MUST be the first-class aggregate and the parent of its recurrence and its dates. It
  MUST carry its identity (`eventNo`, name, `audienceId`), when and where (its overall range, default
  start/end times and venue) and how it is tracked (`tracksMembers`), plus one of two shapes: a
  standalone event with its dates recorded directly, or a recurring event with a recurrence that
  generates them. A standalone event MUST NOT require a recurrence; a recurring event MUST NOT be
  modelled as a series above a child event. `GET /v1/events` and `GET /v1/events/{eventId}` MUST return
  both shapes.
- FR-2: An event MUST record `venueType` as `auditorium`, `virtual` or `hybrid`; `venueName` MAY be
  supplied and MAY differ from the venue type label.
- FR-3: A standalone event MUST carry one or more occurrences with unique dates; a duplicate date MUST
  be rejected. An event MUST expose `startDate`/`endDate` as its overall range, with every occurrence
  inside it: a standalone event's range is the span of its occurrences, and a recurring event's is
  derived from its recurrence and its occurrences (`endsOn` null for an unbounded recurrence). The range
  is derived, never a second stored copy.
- FR-4: Generation MUST run per recurrence and MUST be idempotent on `(eventId, date)`: at most one
  occurrence per date, a cancelled exception generates none, an extra exception generates one, and a
  re-run adds nothing. Creating an event with a recurrence MUST generate its first window atomically.
- FR-5: Attendance MUST be recorded per occurrence; `sessionDate` MUST be the date of one of the
  event's occurrences (`eventId` + `sessionDate`) and the database MUST enforce it.
- FR-6: An attendance import MUST be scoped to **one occurrence chosen by the operator**
  (`eventId` + `sessionDate`), not to an event number carried on every row. Each row MUST name a member
  and MAY repeat the occurrence's date and an optional time; a row whose date does not match the selected
  occurrence MUST fail the whole batch. The batch MUST record the event and occurrence it targeted.
- FR-6a: An import MUST be all-or-nothing, and its batch record MUST carry a checksum over the targeted
  occurrence and the rows so a capture can be audited and compared with another; the checksum no longer
  refuses a repeat, because a live capture may repeat.
- FR-6b: An import MUST be a **capture**: the server stamps `asOf` and records `ended` only when the
  operator explicitly ends the session — a capture never ends it, and a capture outside the live window
  is still an open capture. A capture MAY repeat and replaces the occurrence's imported rows; an
  end-only capture (`rows: []` with `ended: true`) records the close without rows. Once the session is
  closed, any further capture MUST answer `409 session_closed` and create nothing. Nothing ends a
  session automatically: an occurrence may stay open indefinitely, and the close is optional.
  The close is the **attendance** channel's: the end-only capture is an attendance import, offered on
  every member-tracking occurrence, live or past, from the import panel and the headcount dialog alike,
  and its `asOf` is the clock (a closing capture may fall on a later day). A `tracksMembers = false`
  occurrence has no attendance session, is never closed, and offers no end action.
- FR-7: An imported attendance row MUST NOT overwrite a manual row; deleting an imported row MUST
  write a suppression so a later import cannot resurrect it.
- FR-8: `GET /v1/members` MUST support a list-level attendance aggregate
  (`include=attendance&eventId=`) so a page of members is one request, not one request per row. The parameter
  names the parent event; `seriesId` was its legacy name during the transition and retires with `/v1/series/*`
  (the downstream round renames it, and this spec must say so before that round closes).
- FR-8a: `GET /v1/members` MUST accept `unassigned=true`, returning only active members with no active
  shepherding assignment — the same predicate the church report counts as `unassignedMembers` — and MUST
  combine it with `q` and cursor pagination. The server derives the filter; the client MUST NOT filter a
  page locally. `unassigned` accepts only `true`: any other value is a `422 validation_error`, and
  `unassigned=true` combined with `status=archived` is also a `422` (the filter already implies active).
- FR-9: An offering MUST carry versioned terms of reference; published terms MUST be immutable and an
  edit MUST create a new version.
- FR-10: Two or more offerings MAY be attached to one **event** — the attachment is event-level, one active
  row per `(offering, event)`, carrying its own terms version and `availableUntil`; ending an attachment MUST
  keep the row and its history, never delete it. **What a session carries is the collection**, not the
  attachment: an operator records an offering count against a session date. The per-occurrence attachment that
  `member-registrations-session-offerings.md` specified was **withdrawn by the owner on 2026-11-24**, before any
  code was built against it.
- FR-11: An offering's effective expiry MUST be its own `availableUntil`, else its pinned terms date. Expiry
  blocks new gifts; a pending pledge can still be honoured. Skipping one occurrence is expressed by cancelling
  that occurrence, not by detaching the offering from it.
- FR-12: A contribution MUST store an amount in integer minor units and MUST be idempotent on a
  caller-supplied key.
- FR-13: A first-time visitor MUST be able to give with name and phone, receive a receipt or reference,
  and leave no member record; the phone MUST be stored hashed. The giving surfaces MUST distinguish the
  three person kinds (`member-registrations-event-audience.md`): a **first-time visitor** (short form
  **first timer**: name plus hashed phone, no record), a **registered visitor** (a member record with
  `visitor` status, giving as themselves) and a **full member** (`active`). An administrator MUST be able
  to register a first-time visitor as a registered visitor, matched by phone, and later promote the
  registered visitor to `active`, with the giving and attendance history following the person id.
- FR-14: A pledge MUST carry an expected date and exactly one follow-up officer, resolved from the
  member's active shepherd or from the active presbyter the administrator supplies with a reason,
  otherwise rejected with `422 officer_required`.
- FR-15: An administrator MUST be able to assign or reassign a pledge follow-up officer with a reason;
  the history MUST be append-only.
- FR-16: A pledge MUST be honored on payment or dishonored with a reason; a pending pledge MUST
  survive offering expiry.
- FR-17: A reminder MUST be unique per pledge, scheduled date and channel.
- FR-18: Responses containing personal data MUST send `Cache-Control: no-store`.
- FR-19: Every write MUST carry `X-Actor-Id` at the API boundary - supplied by a server caller or
  derived by the gateway - and pledge, contribution and attendance history MUST be append-only.
- FR-20: Money MUST be GHS in integer minor units; a zero or negative amount MUST be rejected.
- FR-21: Browser traffic MUST go through the session gateway. The API bearer MUST NOT reach the
  browser, the bundle, browser storage or a URL.
- FR-22: The gateway MUST authenticate an officer with a single-use magic link and a short-lived
  session, and MUST derive `X-Actor-Id` from that session.
- FR-23: The gateway MUST allow only the Pages origin (the custom domain when configured, otherwise
  the project Pages origin) and local development origins via CORS, and MUST expose only `/v1/*`.
- FR-24: The gateway MUST be an in-process router layer in the same Express app and Vercel function as
  the API; it MUST rewrite internally to the `/v1/*` routers, not proxy over HTTP to a second service.
- FR-25: Only an active officer seeded or deactivated by an operator CLI may sign in. There MUST be no
  self-service enrolment and no email-domain allowlist.
- FR-26: Magic links MUST be delivered through a `Mailer` port. Production MUST use Resend; local
  development and tests MUST use a console/no-op mailer and MUST NOT send mail.
- FR-27: The browser MUST send the session credential as `Authorization: Bearer <session>` and store it
  in `sessionStorage` only. The gateway MUST NOT set an authentication cookie.
- FR-28: Sessions, magic links and rate-limit counters MUST live in Postgres. In-memory auth state MUST
  NOT be relied on, because serverless instances do not share memory.
- FR-29: A member database import MUST upsert members by `memberNo`, all-or-nothing. A duplicate
  `memberNo` in one file, an archived member or a purged member MUST fail the batch; `phone`/`email`
  MUST become contacts without duplicating an existing one.
- FR-30: Every import MUST expose its expected columns through the API and MUST offer an Excel
  (`.xlsx`) template for download; a client that cannot take the file MUST be able to show the same
  column list inline.
- FR-31: `GET /v1/members` MUST return `contactCount` instead of contact values; contact values are
  readable only through the member detail, which the contacts dialog reads with the query issued only
  while that dialog is open (UI spec FR-78, as amended on 2026-11-16: the contacts-only `GET` this line
  used to name was never built).
- FR-31a: The `q` parameter of `GET /v1/members` MUST match only member number and name parts (first,
  last, other names, alias, maiden name), case-insensitively; it MUST NOT match owned or linked
  contact values. Contact-value lookup is the separate `contact` filter.
- FR-32: An event's applicability MUST be an ordered **set** of saved audiences referenced by
  `audienceIds` (at least one, `audienceId` accepted as a one-element alias for one round), each whose rule
  is one `allOf`/`anyOf`/`noneOf` over a closed set of member attributes (ministry membership,
  presbyter, age band, gender, membership status). Composition is **intersection**: a member matches the
  event when they match every audience of the set, which is also how exclusion is expressed (`allOf
[active]` intersected with `noneOf [Youth]`). The roster (`expected`), member-facing visibility,
  the USSD Activities and offering lists and the attendance summary MUST all evaluate that one rule per
  audience and combine, and the server MUST be its only evaluator. `GET`/`POST /v1/audiences`,
  `GET`/`PUT /v1/audiences/{id}` own the reference data; system audiences are seeded and read-only; there
  is no delete. The rule, the seeds and the evaluation are specified in
  `member-registrations-event-audience.md`.
- FR-33: Age MUST be evaluated at the occurrence date. Ministry membership, presbyter status and
  membership status MUST read the current register, with no history: a change today changes what past
  dates report, and that limit MUST be documented on the surfaces that show a roster.
- FR-34: The member read and list MUST carry `membershipStatus` (`visitor | active | archived`), the
  member create MUST accept `visitor` or `active` (default `active`), and
  `POST /v1/members/{memberNo}/promote` MUST move a visitor to `active` with an append-only
  `member_status_events` row. A non-visitor promotion MUST be `409 not_a_visitor`.
- FR-35: `POST /v1/visitors` MUST register a first-time visitor as a registered visitor: normalise and
  hash the phone, create the member with `visitor` status and an owned phone contact, and write an
  append-only `first_time_visitor_identities` link so the giving history follows the person id without
  rewriting any contribution row. A linked phone MUST be `409 visitor_already_registered`. Neither
  registration nor promotion may create a second record for the person.
- FR-36: An event MUST carry `tracksMembers` (boolean, default true) but no separate ministry or
  presbyter flag: applicability is `audienceId` (FR-32), and the retired `ministry`/`presbyterOnly`
  columns are read-only legacy projections during the transition and are refused on write. When
  `tracksMembers` is false (headcount-only), per-member attendance writes, attendance imports, USSD
  clock-ins and one-time attendance codes MUST be rejected with `422 headcount_only` (a closed event or
  occurrence still answers its own `409`/`422` first), while headcounts remain allowed; the audience is
  kept for visibility and no per-member roster is computed.

## Non-Functional Requirements

- NFR-1: Backend dates MUST remain UTC calendar dates; an event's `timezone` MAY override only the
  definition of "today" for that event.
- NFR-2: All failures MUST use the RFC 9457 `application/problem+json` shape with a stable `code`.
- NFR-3: Migrations MUST run identically on Neon Postgres and PGlite, and the repository suite MUST
  pass on both.
- NFR-4: Logs MUST NOT contain contact values, visitor phone numbers or bearer tokens.
- NFR-5: The OpenAPI 3.1 document MUST be generated from the same Zod schemas that validate requests.
- NFR-6: A migration MUST be versioned, re-runnable and applied by the explicit migration step, never
  on request.
- NFR-7: A 25-row list page MUST issue a constant number of queries, independent of row count.
- NFR-8: Event generation, imports, contributions and gateway callbacks MUST be safe to retry without
  duplicating records.

## Domain Model

### Member

| Field                             | Notes                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `memberNo`                        | Immutable, case-insensitively unique, never reused (tombstone survives).                                                    |
| `firstName`, `lastName`           | Required.                                                                                                                   |
| `otherNames`                      | Single free-text field.                                                                                                     |
| `maidenName`, `alias`             | Optional free text.                                                                                                         |
| `dob`                             | Date, nullable.                                                                                                             |
| `gender`                          | `male` \| `female` \| `other` \| `undisclosed`.                                                                             |
| `membershipStatus`                | `visitor` \| `active` \| `archived` (derived from `archivedAt`); default `active`; a visitor is a promotable member record. |
| `age` (derived)                   | Completed years at today (UTC); null when `dob` is null or in the future. Never stored.                                     |
| `ageMonths` (derived)             | Completed months at today (UTC), same null rule; lets a picker say `8m` rather than `0y`.                                   |
| `placeOfResidence`, `addressLine` | Free text.                                                                                                                  |
| `joinedOn`                        | Date; defaults to the registration date when omitted.                                                                       |
| `isPresbyter`                     | Boolean, default `false`; officer eligibility for shepherding.                                                              |
| `presbyterRank`                   | Positive integer (≥ 1), nullable; 1 = most senior. Any non-null rank makes the presbyter senior.                            |
| `title`                           | Presbyter title and its optional `titledOn`; codes from `/v1/presbyter-titles`; see the officers spec.                      |
| `membershipCardNo`                | Free text, nullable; 1–32 characters, trimmed, unique case-insensitively when present.                                      |
| `confirmedAt`                     | Timestamp, nullable; the officer confirmation, audited; read-only.                                                          |
| `verifiedContacts`                | The proven contacts: `{ id, channel, masked, verifiedAt }[]`; read-only.                                                    |
| `archivedAt`                      | Set by archive, cleared by restore.                                                                                         |
| `purgedAt`                        | Tombstone marker; PII is nulled and the number stays reserved.                                                              |

Invariants: `memberNo` never changes; a purged member is read-only and invisible; an archived member
is invisible to default reads but readable with `includeArchived=true`.

`membershipStatus` is the person kind (`member-registrations-event-audience.md`): `visitor` is a real
member record that an administrator promotes to `active`, `archived` is derived from `archivedAt` and is
not a create or update value, and `purged` is the erasure tombstone, not a status. The create accepts
`visitor` or `active` (default `active`); promotion is `POST /v1/members/{memberNo}/promote`. The
members list's `status` filter accepts `visitor`, and the default list stays `active`.

`age` is derived, never stored: completed years at today (UTC), with a 29 February birthday reached on
1 March in a non-leap year. Every member DTO reports the member's **current** age, never the age at a
historical record's date. The members list carries `age` and `ageMonths` but not `dob`; the detail carries all
three. `ageMonths` is the same derivation in months, and the picker uses it only to distinguish an infant from
a year-old (`8m` against `0y`).

`presbyterRank`, `membershipCardNo`, `confirmedAt` and `verifiedContacts` are **detail-only**
back-office fields; the list stays lean. A rank is valid only with `isPresbyter = true` (otherwise `422
validation_error`), must be a positive integer (0 and negatives are `422`), and clearing the flag clears
the rank in the same update. Ranks need not be unique: a tie is allowed, and any non-null rank counts as
a senior presbyter for clocking. `membershipCardNo` is trimmed, 1–32 characters, and unique
case-insensitively when present (a partial unique index), so a second member claiming the same card is
`409 card_in_use`; reissuing a card is two edits (clear, then set). `confirmedAt` and `verifiedContacts`
were **read-only**: the officer confirmation sets `confirmedAt` from the latest non-withdrawn
`member_confirmations` row and the code service sets a contact's `verifiedAt`; `DELETE …/verification` withdraws both. `createMemberSchema` and
`updateMemberSchema` no longer accept `verified`. Card and verification are independent, and neither is
required for the other. The member can start the same code from USSD (`My Profile > Verify contact`); the pipeline calls the
verification `issue` in-process, so no new HTTP route is added. `requires_card` and `requires_verified`
(welfare products) test that the card is present and, for `requires_verified`, that an **email or
WhatsApp** contact proof or an officer
confirmation exists; a phone proven on the member acceptance page alone does not qualify, because
possession of the number is
already the identification and adds no second-channel fact.

### Contact

`{ id, kind: phone | email | whatsapp, value, displayOrder }`. No "primary" flag — order is the
preference.

- `value` is **globally unique** after normalisation (digits only for phone/whatsapp, lower-cased for
  email), so one value belongs to exactly one member.
- A dependent "having" the guardian's number is a **link** to that contact, not a duplicate row.
- The `contact` filter matches any owned or linked contact, so a shared household number returns the
  whole household. The main `q` search does not match contact values (FR-31a).

### Subscription

`{ id, kind: life_insurance | credit_union | null, policyholderMemberId, scope: individual | household,
status, reference?, startedOn, endedOn?, productId?, premiumMinor?, paidBy: member | church | null,
periodStart, periodEnd }`

- `individual`: coverage is the policyholder.
- `household`: explicit `subscription_coverage` rows. Coverage is a financial fact, never derived from
  the relationship graph and never auto-extended when a dependent is linked.
- Coverage removal writes `removedOn`; it does not delete history.
- `productId` is the welfare product when the subscription came from a product; `paidBy` is `member` or
  `church`, and `premiumMinor` is null for a church-paid period. `periodStart`/`periodEnd` are the paid
  cover period; `endedOn` stays the explicit end. A household product allows at most its
  `maxDependents` active members joined by an allowed relationship.
- The member subscription read returns owned and inherited rows; an inherited row carries
  `source: 'inherited'`, the policyholder's member number and name, and the relationship label from the
  covered member to the policyholder (spouse renders Husband/Wife by gender).

### Ministry

`{ id, code, name, description?, active }`

- `code` is immutable and unique, matched case-insensitively (seed: `PEMEM`, `WOMEN`, `CHOIR`,
  `PRAYER`).
- `name` is an editable display label.
- Referenced by id everywhere, so renaming cannot orphan history.
- Delete is refused while referenced; deactivate instead.

### Relationship

`{ id, memberId, relatedMemberId, type: spouse | parent | child | guardian | other, isDependent }`

- One row per pair, read from both directions (spouse symmetric, parent/child inverted).
- A unique index on the unordered pair prevents duplicate edges.
- At most one `spouse` edge per member.
- `parent` describes kinship; `guardian` describes responsibility. A member may hold both edges.
- Every related member is a real member with its own `memberNo`; there are no shadow people.
- The relationship read DTO carries the related member's `gender` and `age` alongside `name`, so the
  UI renders the same identity label as every other member reference. `age` is current, not the age
  when the edge was created.

### Shepherding

A **presbyter** is any member with `isPresbyter = true`. Presbyter is a flag, not a ministry: it grants
officer eligibility without implying a ministry assignment, and it is set through the ordinary member
create/update payloads. A presbyter may also carry `presbyterRank` (1 = most senior): any non-null rank
is a **senior presbyter**, ranks order display and delegation choice, ties are allowed, and the rank is
cleared when `isPresbyter` is cleared.

An **assignment** puts one member on one officer's shepherding list:

`{ id, officerMemberId, memberId, assignedOn, endedOn?, assignedBy, endedBy?, reason?, endedReason? }`

- The officer must be an active member with `isPresbyter = true`; the shepherded member must be an
  active member. Neither may be archived or purged, and a member cannot shepherd themselves.
- A member has **at most one active assignment**. An officer may hold any number.
- Assignments are ended, never deleted. Ending sets `endedOn`, `endedBy` and `endedReason`
  (optional for a plain end, required on reassignment).
- **Reassignment requires consent.** When the member already has an active assignment, the request
  must carry both `replaceAssignmentId` (the active assignment the caller saw) and a free-text
  `reason` (3–500 characters). Missing, mismatched or stale values return `409`; the problem body
  includes a `currentAssignment` extension (`id`, `officerMemberNo`, `assignedOn`) so the client can
  ask the user before retrying. A `replaceAssignmentId` supplied when no active assignment exists is
  also `409`.
- On reassignment the previous assignment is ended on the new assignment's `assignedOn`; the new row
  stores `reason` and the ended row stores the same text as `endedReason`, so the history explains
  itself from either side.
- `assignedOn` defaults to today (UTC), must not be in the future, and a replacement must not start
  before the assignment it replaces.
- Clearing `isPresbyter` or archiving a member is refused (`409`) while they have active assignments
  as officer: the list must be reassigned first. Archiving a _shepherded_ member automatically ends
  their active assignment (reason recorded); restoring them does not revive it.
- Presbyters may themselves be shepherded by another presbyter, and count in coverage totals.

A **call** records one contact attempt:

`{ id, assignmentId, calledOn, outcome: reached | no_answer | wrong_number, stillInChurch: yes | no | unknown, feedback?, issue?, recordedBy, createdAt }`

- Calls are **append-only**: no update and no delete, because a pastoral record with history is not
  editable. A correction is another call on the day the correction is made; feedback and issues
  accumulate across days. Two attempts on the same day are two rows — the API does not deduplicate,
  so clients must not auto-retry a `POST`.
- A call may only be logged against an **active** assignment (an ended assignment is read-only).
- `calledOn` defaults to today (UTC), must not be in the future and must not precede `assignedOn`.
- `stillInChurch` is required when `outcome = reached`; it defaults to `unknown` for `no_answer` and
  `wrong_number`.
- **Current status** is the latest call by `calledOn`, then `createdAt`, whose `stillInChurch` is
  `yes` or `no`. An `unknown` later report never erases a known answer; the status is `null` until
  the first definite report.

Counts for a member and a window:

```
attempts       = |calls|
conversations  = |calls with outcome = reached|
lastCalledOn   = max(calledOn)
```

The **roster** shows one row per active assignment: member identity, a contact count (owned and linked;
never contact values), residence, `attempts`, `conversations`, `lastCalledOn`, `lastOutcome`, current
`stillInChurch`, `latestFeedback` and `latestIssue`. Counts cover the **current assignment only**; the
member's own shepherding view exposes the full history across previous officers, including prior
feedback and issues.

Roster rows, officer rows and the member's shepherding view carry `gender` and `age` alongside the
composed `name`, so every shepherding surface renders the same identity label. Assignment history and
calls show the member's and officer's current age, not the age at the time of the record.

The **church report** aggregates the same data per officer plus totals: officers, active members,
assigned members, unassigned members, attempts, conversations, members never called, and the current
status distribution (`yes`, `no`, `unknown`, never reported).

**Purge** deletes the member's assignments and calls in both roles. This is the one exception to the
append-only rule: purge is a legal PII erasure, not a history-management operation.

### Event (parent)

`{ id, eventNo, name, audienceIds, audiences[], audienceId, audience, period, schedule, timezone, description?, venueType, venueName?, startDate, endDate, startTime, endTime?, tracksMembers, status: draft | active | archived }`

An **event is the parent** of its recurrence and its dates. It owns its identity, when and where it
happens, how it is tracked, and either a recurrence that generates its dates or the dates recorded on
it directly. There is no series above it: a **standalone** event records its occurrences by hand and
has no recurrence; a **recurring** event owns one recurrence and the occurrences it generates.

- `eventNo` is the event's identity: unique, never reused, and the value a person, a report or an export
  names. The wire addresses the event by `eventId`. An occurrence has no number of its own. The
  per-instance `eventNo` of the V2 model is kept as a read-only `legacyEventNo` on the occurrence during
  the transition; no client writes it. **It is minted by the server on create and is never accepted on the
  wire**: `POST` and `PATCH` refuse it by name (`422 validation_error`), because silently stripping it
  let a caller believe a number had changed. The mint year is the earliest occurrence's UTC year for a
  standalone event and the first schedule's year for a recurring one.
- `audienceIds` is the event's **applicability**: an ordered set of saved audiences (each a named group
  with an `allOf`/`anyOf`/`noneOf` rule over ministry, presbyter, age band, gender and membership status),
  at least one, defaulting to the seeded `Everyone`. A member is in the event when they match **every**
  audience of the set - composition is intersection, and it is also how exclusion is said (`allOf [active]`
  intersected with `noneOf [Youth]`). A registered visitor is in the event only when every audience names
  visitors (A-3's per-rule gate). The set decides the roster (`expected`), member-facing visibility, the
  USSD Activities and offering lists and the attendance summary, all through one predicate applied per
  audience and combined. The rule language and the composition are specified in
  `member-registrations-event-audience.md`.
  - **One-round alias:** `audienceId`, a single uuid, is accepted on write as a one-element alias of
    `audienceIds`. If both are sent, `audienceIds` wins and `audienceId` must equal its first element,
    else `422` naming both. The read carries `audiences[]` (each with its rendered `summary`) plus the
    legacy `audienceId` and `audience` for the primary (first) audience.
- `period` is the **provenance of a period-created event** (owner, 2026-11-24): `{ id, name, cycle?, frequency?, day? }` on the
  list read, and the **same object plus `dates` and `definition` on the single event read** (owner, 2026-11-27, amended on
  review): `dates` is `week` or `date`, **derived from the event's own stored dates** (`null` only for an event with no
  occurrence at all), and `definition` is the **snapshot** stored at save beside `period_name`. The list
  carries neither, because it reuses the same schema and would pay both on every row. The rest of the object is unchanged,
  where
  `cycle` is the `YYYY-MM` chosen at create and `name` is the **snapshot** taken at save, so a renamed definition never
  rewrites a stored name or date. `day` is `MON`-`SUN` - three-letter upper case, deliberately not the schedule
  vocabulary's `MO`-`SU`, so a stored period day can never be read as an rrule fragment (owner, 2026-11-25) - and is
  null when the whole week is generated. It is null for an event not created from a period. The create period arm takes
  **one of two forms**: `{ id, cycleMonth }` for a single cycle, or
  `{ id, frequency: 'monthly', day?, effectiveFrom? }` for a period-relative recurrence that generates one date per
  cycle; `effectiveFrom` anchors the 90-day window, is input-only and is never stored, and the first generated date is
  the first matching date **on or after** it. Sending both forms is refused, and so is sending a period alongside
  `occurrences` **or** a `recurrence`. Either form is resolved on the server with the same function
  `POST /v1/events/preview` uses, so preview and create cannot diverge. `GET /v1/events?period=<id>` filters on it.
- `schedule` is the **edit guard's wire form** (owner, 2026-11-25): `{ locked, reasons: [{ code, date }] }`, where
  `code` is one of `occurrence_started`, `offering_attached`, `offering_counted`, `attendance_recorded`,
  `import_suppressed`, and `date` is the occurrence the cause names (null for a bare event-level attachment). It is
  computed by **the same function the write guard calls**, so the UI can never offer an edit the write refuses, and it
  is read-only on the wire. The "today" it compares against is the event's own (UTC unless the event carries a
  timezone), as the occurrence status already uses.
- `ministry` and `presbyterOnly` are **read-only legacy projections** during the transition: the
  migration maps each event's old pair onto a seeded or combination audience and writes the columns from
  that audience. They are no longer accepted on create or update, and a client that sends one is `422
validation_error` with the field named. A recurring event's name and audience are unique among
  non-archived recurring events (`(lower(name), unordered audience set)`); a standalone event is identified by
  `eventNo` alone, so its name is not unique.
- `description` carries free text such as the service time.
- `timezone` is an optional IANA override used only to decide what "today" means for that event. It
  defaults to `UTC`; every other backend default and comparison uses UTC calendar dates.
- `venueType` is required and is `auditorium | virtual | hybrid`; `venueName` is optional free text such
  as "Main Auditorium" or "Auditorium + Zoom". An occurrence inherits the venue and may override its
  type.
- `startDate` and `endDate` are the event's **overall range** and every occurrence date falls inside it.
  They are derived, never a second stored copy: a standalone event's range is the span of its
  occurrences; a recurring event's `startDate` is the earlier of its first occurrence and its
  recurrence's first `effectiveFrom`, and its `endDate` is the later of its last occurrence and the
  recurrence's `endsOn`, or null when the recurrence is unbounded.
- `startTime` and `endTime` are the event's default times; an occurrence inherits them or overrides its
  own.
- `tracksMembers` (boolean, default true): false is headcount-only, so per-member attendance, attendance
  imports, codes and clock-ins are refused with `422 headcount_only` while headcounts still record. The
  audience is kept for visibility; there is no per-member roster.
- `status` is `draft | active | archived`. A **draft** is the legacy publication state preserved by the
  migration: it is visible only to operators as a Draft and never treated as held. `active` is a
  published event; an archived event is read-only and its history stays readable, never deleted.
  Transitions use UTC. The list's held/upcoming/cancelled pill is **derived** from the
  parent and its occurrences, never stored on the parent.
- The parent is the scope for attendance, imports, offerings, contributions and pledges: `eventId` is
  this parent, and `sessionDate` names its occurrence. An offering **attaches to the parent** and is
  **collected against a session**; the per-occurrence attachment was withdrawn on 2026-11-24.
- **Transition.** Until the UI and downstream rounds move, `/v1/events`, `/v1/events/:id` and `/v1/series/:id` serve
  their **legacy shapes by default**, and the parent read with `view=parent` (the window's `from`/`to` apply to
  both; any other `view` value is `422 validation_error`). **The flip (owner, 2026-11-24):** the default becomes the
  parent read, the legacy serialisers retire, and **`view=parent` stays accepted as an ignored alias** rather than
  being removed — the UI sends it on every event read, and removing it would force a UI change into a round that
  carries a migration and a public-route deletion. **After the flip, a request with no `view` and a request
  with `view=parent` both return the parent read, and any other `view` value remains `422 validation_error`.** The
  flag retires in a later UI-only round, with the mock rebuild.
  The `/v1/series` alias retires with the deletion of `/v1/series/*`. This keeps the deployed UI working
  across the migration and is the only additive wire exception on the events read.

### Recurrence

`{ schedules: Array<{ effectiveFrom, rrule, endsOn? }>, exceptions: Array<{ date, kind: cancelled | extra, note? }> }`

A recurring event's optional recurrence is the schedule that generates its occurrences. A standalone
event has none. It belongs to the event and is read and written under it.

- Schedules are **versioned**: `effectiveFrom`, `rrule`, `endsOn?`. Editing a schedule adds a version;
  history is never rewritten.
- `rrule` is the RRULE body (`FREQ=WEEKLY;BYDAY=SU`); `COUNT` and `UNTIL` are rejected inside the body
  — the end date is `endsOn`.
- An **exception** adjusts the rule on one date: `cancelled` generates no occurrence for that date,
  `extra` generates one where the schedule would not. An exception carries an optional `note`; a
  `cancelled` exception MUST carry a non-empty note, and an exception MAY be removed.
- Generation expands the schedule version in force on each date of the window, removes cancelled
  exceptions and adds extras. A schedule change affects future generation only; occurrences already
  generated keep their dates and their history.

### Occurrence

`{ id, date, startTime, endTime, status: scheduled | held | cancelled, note?, venueType?, capture, present, expected, importedRows, source }`

An **occurrence is the event's date**: one child row for each date the event happens, generated from the
recurrence or recorded by hand. The parent owns the name, audience, venue, times and `tracksMembers`; an
occurrence inherits them and carries only its date, its times, its dated status, an optional venue
override and an optional note.

- `date` is a UTC calendar date and is unique within the event. An occurrence has no `eventNo`; it is
  addressed as `(eventId, date)`, and its `id` is the row key, never a second number.
- `startTime` and `endTime` default to the parent's; a blank time inherits.
- `status` is `scheduled | held | cancelled`. The stored row records cancellation; `held` and upcoming
  are derived from the date against the event timezone and the shared capture close, never written by a
  client. A cancelled occurrence carries a non-empty `note`; a legacy cancellation without one reads
  "No reason recorded". A cancelled occurrence is read-only.
- `venueType` optionally overrides the parent's venue; `note` is the cancellation reason.
- `capture`, `present`, `expected`, `importedRows` and `source` are the occurrence's attendance summary,
  defined in **Occurrences and attendance**.

### Occurrences and attendance

The **occurrence is the event's date**. A recurring event's dates are generated from its recurrence in
force on each date within the window; a standalone event's dates are recorded by hand:

1. Expand the schedule version in force on each date within the window.
2. Remove `cancelled` exceptions, add `extra` exceptions.

Generation is **per recurrence and idempotent on `(eventId, date)`**: a second run adds nothing and never
rewrites an existing occurrence, a cancelled exception generates none and an extra generates one. There
is no series above the event.

**Occurrence and attendance wording.** The **occurrence** is the word for a date on the wire (the
`occurrences` array and the `EventOccurrence` type). The attendance, headcount, import and offering-count
contracts keep `sessionDate` as the field that names it, and `eventId` is always the **parent**;
`occurrenceId` is the attendance row's key and is not required in a request.

**Attendance row**: `{ id, memberId, occurrenceId, sessionTime?, source: import | manual }`, unique on
`(occurrenceId, memberId)`. The wire writes and reads it as `eventId` + `sessionDate`, which resolve the
occurrence.

- `sessionDate` MUST name one of the event's occurrences; the API resolves it to `occurrenceId`. The
  database enforces the occurrence's integrity: a cancelled occurrence takes no rows, and an occurrence
  date change is refused while rows reference it (EC-7).
- `sessionTime` is optional and recorded **only when the source carried a time** — an import stores the
  clock time the register supplied. The occurrence's own `startTime` remains the schedule and MUST
  NOT be rewritten by an import.
- A `manual` row shadows an `import` row for the same key; a later import MUST NOT overwrite it.
- Deleting a `manual` row deletes it. Deleting an `import` row writes a **suppression** keyed on
  `(memberId, occurrenceId)`.
- Attendance may only be recorded for an occurrence that was actually held. A write against a cancelled
  occurrence or an archived event is rejected, and a cancelled occurrence is read-only; reads remain
  available.
- The existing per-member attendance endpoints remain for corrections; the event attendance report is
  the V2 read path.

**Per-occurrence attendance report.** `GET /v1/events/{eventId}/attendance?date=` returns
`{ eventId, sessionDate, present, expected, importedRows, rows }`; the occurrence is identified by
`eventId` + `sessionDate`.

- `present` is the number of attendance rows for that occurrence; `rows` lists exactly those members
  with `status: 'present'` and their `import | manual` source. A row names a **member** or a
  **registered visitor** (a member record with `visitor` status); a **first-time visitor** is never a
  row, because there is no member number to name — they are counted only in the headcount's `visitors`
  lane. The data model has no absence row, so the report never invents an absent member;
  `expected - present` is the only absence signal, and because the audience is the expected rather than a
  gate, `present` may exceed `expected` (a row for an existing member the audience does not match is
  accepted).
- Each `rows` entry carries the member's `memberNo`, `name`, `gender` and `age` (current, not the age
  at the occurrence) alongside `id`, the **`attendance.id` primary key** (not the member id), so the UI
  can render the identity label and call `DELETE /v1/events/{eventId}/attendance/{attendanceId}`
  without a second lookup. The report and the delete share the same id; the events route table's `{id}`
  is the event id. The **roster** evaluates a member's age at the occurrence date (the audience rule);
  a row's `age` is the member's **current** age, as every member DTO reports it, and the two are
  deliberately different numbers.
- `expected` is the roster at the occurrence date: the members the event's **audience** matches at that
  date (the audience rule plus `joined_on <= sessionDate`, not archived and not purged). Each occurrence
  is counted on its own date, so a recurring event and a multi-day event may report a different
  denominator per day. The rule and its current-state limit are specified in
  `member-registrations-event-audience.md`.
- A manual `POST` over an imported row for the same key converts it to `source: manual`; a second
  manual post is `409`. `DELETE` removes a manual row and writes a suppression for an imported row.
- The report's three meanings stay separate: `present` (named attendance rows), `expected` (the
  register-derived **Roster**), and the **headcount** (the counted gathering). The report never merges
  them; `expected` keeps its wire name and is labelled **Roster** on the reading surfaces. The roster is
  the event's audience evaluated at the occurrence date, so a `Presbyters` audience counts active
  presbyters and any other group counts what its rule says. A headcount is never derived from `present`
  or `expected`, and never feeds either.
- The operator's **headcount** is actual counted attendance at a moment, recorded per mode (the
  headcount specification's lanes, `member-registrations-headcount.md`); see **Headcounts** in the USSD
  attendance subsection. `event_session_headcounts` is append-only and a correction supersedes the
  earlier observation.
- **The headcount covers the whole gathering, including first-time visitors.** A first-time visitor has
  no member record and therefore no attendance row; they are counted in **Visitor Mode** — the
  `visitors` headcount mode, whose buckets are visitor men, visitor women and visitor children
  (`visitor-male`, `visitor-female`, `visitor-children`). A **registered visitor** is counted in Visitor
  Mode too — not in the demographic lane — for as long as they are not a full member, and may also be an
  attendance row because they are a member record. A member who is counted in a headcount may likewise
  hold an attendance row. **The headcount is independent of the named attendance and never its sum**: the
  two are reconciled (a counted figure against `present` and `expected`), never added, and a difference in
  either direction is explained rather than summed into a fourth number. The full rule is
  `member-registrations-event-audience.md` A-5a.

The member-and-event count is per parent and each held occurrence counts once:

```
windowStart = max(first schedule effectiveFrom or first occurrence, member.joinedOn ?? registration date)
windowEnd   = min(endsOn ?? today, today)
expected    = |occurrences in [windowStart, windowEnd]|
attended    = |occurrences in that window with at least one attendance row|
```

The DTO reports `attended`, `expected`, `remaining` and `status: ongoing | completed | in_progress`.
Extras count when held; cancellations do not.

### USSD attendance, codes and clocking (24b)

The USSD session owns the menu; these are the bearer seams behind it. All writes require `X-Actor-Id`
and are `no-store` on read.

| Method       | Path                                                   | Result                                                                                                    |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `POST`       | `/v1/events/{eventId}/codes`                           | Issue a six-digit code for one session; plain code returned once                                          |
| `GET`        | `/v1/events/{eventId}/codes?sessionDate&status`        | List the session's codes without the plain value                                                          |
| `POST`       | `/v1/codes/{id}/void`                                  | Void an unused code; `{ reason? }`                                                                        |
| `GET`        | `/v1/registration-requests?status&eventId&sessionDate` | Pending/decided anonymous requests                                                                        |
| `POST`       | `/v1/registration-requests/{id}/approve`               | `{ memberNo, guardianMemberNo?, phoneOwnership }`; member, phone and optional guardian in one transaction |
| `POST`       | `/v1/registration-requests/{id}/reject`                | `{ reason }`; never creates a member                                                                      |
| `GET`        | `/v1/events/{eventId}/headcounts?sessionDate`          | List the session's headcount observations, newest first (`no-store`)                                      |
| `GET`        | `/v1/events/{eventId}/headcounts/{headcountId}`        | Read one observation named by `Location` (`no-store`)                                                     |
| `POST`       | `/v1/events/{eventId}/headcounts`                      | Record a headcount observation (`ended?` closes the session); `201` the observation                       |
| `GET`/`POST` | `/v1/events/{eventId}/delegations?sessionDate`         | List or create a clocking delegation                                                                      |
| `GET`        | `/v1/members/{memberNo}/attendance/summary?from&to`    | Windowed attended counts and the attended event rows                                                      |
| `GET`        | `/v1/members/{memberNo}/profile`                       | Identity, ministries, shepherd and attendance regularity                                                  |

- **Codes.** `POST` body `{ purpose: 'attendance_punch' | 'registration', sessionDate }`. The code is
  six digits from a CSPRNG, valid for 15 minutes, single use, bound to that event session and stored
  only as an HMAC-SHA-256 hash under `USSD_CODE_PEPPER`; the plain value appears only in the `201`
  response. A code is refused when it matches no stored hash (`code_invalid`), is expired
  (`code_expired`), used (`code_used`), voided (`code_voided`) or for another session
  (`code_wrong_session`). Five failed attempts per phone hash in 15 minutes answer `429 too_many_tries`
  without revealing whether a code exists; the counter is the shared `auth_rate_limits` key
  `ussd:code:<phoneHash>`. A valid `attendance_punch` writes the attendance row and marks the code used;
  if the member already has a row for that session the answer is `409 already_clocked` and the code is
  not consumed. A valid `registration` code creates the pending request and marks the code used; a
  second use is `409 code_used`. A valid `attendance_punch` obeys §Clocking: the code is refused after
  the session's close (`409 session_closed`) and for a session not dated today in the event timezone
  (`422 validation_error`), and neither refusal consumes the code.
- **Redemption and creation seam.** Code redemption and registration-request creation happen **inside
  `POST /ussd/session`**, through repository methods; there is no bearer route for either. The bearer
  seams are issuance/void/list, request list/approve/reject, delegation, headcounts, the
  attendance summary and the profile.
- **Registration requests.** A request is `pending | approved | rejected`. `POST
/v1/registration-requests/{id}/approve` takes the immutable `memberNo`, a `phoneOwnership` of `own` or
  `borrowed`, and a `guardianMemberNo` when the number is borrowed (or the member has no own contact).
  The request's first and last name seed the member, gender defaults to `undisclosed`, `joinedOn`
  defaults to the approval date. The pending request keeps the caller's number encrypted under
  `REGISTRATION_PHONE_KEY`; approval decrypts it, writes it as an owned phone contact when
  `phoneOwnership = own`, or links it to the guardian when `borrowed` (the member then has no own
  contact and the guardian is validated by MR-40's rules, 18+, reachable, chain). The member, its
  contact and the guardian link are written in one transaction; the ordinary create validation and
  audit still run. A missing guardian where one is required is `422 validation_error` naming the field,
  and an ineligible guardian is refused with MR-40's codes; any refusal leaves the request `pending`.
  The request becomes `approved` with `decidedBy`/`decidedAt` and links the created member, and the
  encrypted number is erased (`reject` and `purge` erase it too). A request is decided once; a second
  decision is `409 registration_not_pending`. The request carries a hash and the encrypted value, never
  the raw phone in a response.
- **Clocking.** The existing `POST /v1/events/{eventId}/attendance` remains the write; the USSD layer
  enforces the actor rules before calling it. A per-member write is accepted only for a session dated
  **today in the event timezone** and before that session is closed (`409 session_closed`); the session's
  time window does not gate a manual write, and a manual or USSD row never carries `ended`. The presence
  read is the event attendance report
  `GET /v1/events/{eventId}/attendance?date=`, whose rows carry `memberNo` (add it to the report DTO if
  it is absent). A presbyter may clock only a member they actively shepherd. A senior presbyter
  (`presbyterRank` non-null) may clock anyone for a session when they are themselves recorded present;
  otherwise they must first delegate. A delegation body is `{ fromMemberNo, toMemberNo, reason }`
  with `sessionDate` supplied only as the query parameter; `fromMemberNo` is the senior presbyter (the
  USSD session's member, or the portal's chosen senior), `toMemberNo` the delegate. Both must be active
  presbyters, the grantor senior, and the delegation is
  unique per `(eventId, sessionDate)` while active. The delegate
  inherits the senior's broad clocking authority for that session only and may clock any member. The
  delegation ends with the session; `ended_at` stays null in V3 and "active" is derived from the session
  date, with no explicit end route. Errors: `not_shepherd`, `not_senior_presbyter`, `delegate_required`,
  `delegation_exists`. The presbyter-only hiding rule is member-facing: the USSD path answers the hidden
  `404` for a non-presbyter grantor, while the officer bearer route — where the caller supplied
  `fromMemberNo` — answers `422 not_presbyter`.
- **Headcounts.** A headcount is an actual count taken at a moment, never an "expected" figure. A
  presbyter or admin records it per session, append-only, in `event_session_headcounts`; the **lane
  model** — the modes, their buckets, one chain per mode, the read map and the correction rules — is
  owned by `member-registrations-headcount.md` and is not restated here. The modes are `adults`,
  `children`, `visitors` (**Visitor Mode**: visitor men, visitor women, visitor children) and
  `presbyters`; `mixed` is readable legacy only and is never a new observation. Each observation carries
  its `mode`, its `lines` — one bucket code from that mode's reference data plus a count, never a fixed
  set of named fields — a derived `total`, an `asOf` timestamp, `ended` (default false) and the
  recorder. **A headcount is a capture too**: it shares the session's explicit close — once an end has
  been recorded for the session, a headcount write answers `409 session_closed` — but a headcount never
  ends the session. A headcount's `asOf` stays inside the session's calendar day, and a headcount after
  that day is refused with `422 validation_error`; the calendar day bounds the stamp, never the close.
  `ended` comes only from the operator's explicit end action, never from a capture's timing. The close
  is checked before the calendar-day rule, so a past session already ended answers `409 session_closed`,
  not `422 validation_error`; the `422` applies only while no close exists.
  The headcount surface offers one **End session** action on any open **member-tracking** occurrence —
  live or past — disabled once the session is closed, where the action is the end-only attendance
  capture; it is optional and nothing enforces it. A `tracksMembers = false` occurrence has no
  attendance session, is never closed and offers no end action. A close carries whatever
  capture is current, so a recorded headcount is not a precondition.
  The register-derived `expected` is a separate thing, labelled **Roster**
  on the reading surfaces, and a headcount never derives from or feeds it.
  **Visitor Mode** is the `visitors` mode: it counts **visitor men**, **visitor women** and **visitor
  children** (`visitor-male`, `visitor-female`, `visitor-children`), and it is where a first-time visitor
  is counted; a registered visitor is counted there too while not a full member, and may also hold an
  attendance row. A headcount is never the sum of the attendance rows (A-5a in the audience spec).
  `GET /v1/events/{eventId}/headcounts?sessionDate&mode` returns
  `{ sessionDate, current, observations }` with `observations` newest first and `no-store`. `current` is
  a map keyed by mode — the four live modes always, `mixed` only when the session holds legacy rows — and
  each entry is that lane's newest non-superseded observation (by `asOf`, then `recordedAt`) or null;
  `?mode=` narrows `current` and `observations` to that one lane. `observations` keeps the superseded
  history. `GET /v1/events/{eventId}/headcounts/{headcountId}`, the `Location` target of a create or
  correction, returns one observation with its supersession links, `no-store`; an unknown id or a row
  belonging to another event is `404 not_found`. A superseded observation is **not** invalid: it remains
  the valid record of the count at its `asOf`, and its `supersededBy` names the correcting row.
  `Headcount` is `{ id, eventId, sessionDate, asOf, mode, total, ended, recordedBy, recordedAt,
supersedesId, supersededBy, lines: [{ code, label, count }] }` (`ended` is legacy read-only: a new
  headcount row always reads `false`), where each line's `label` is joined from
  the mode's bucket reference row. `POST` body `{ sessionDate, mode, lines: [{ code, count }], asOf?,
supersedesId? }` returns `201`; the headcount write carries **no** `ended` — the close is the end-only
  attendance import (FR-6b), so a headcount can never end a session, and the field's removal from this
  request lands with the implementation round as a wire change. `lines` defaults to `[]` (an all-zero observation is a real count
  of zero) and is capped at 16 entries; `total` is derived from the lines and is never accepted from the
  client. `asOf` is required on the row, defaults to now and must fall within the session's calendar day
  in the event timezone. Validation is against the reference data, not a fixed field set: a line's `code`
  MUST be one of the mode's declared buckets, a code MUST NOT repeat in one observation, each count is
  0–10,000 and the derived total at most 30,000; an unknown code or a bucket belonging to another mode
  is `422 validation_error`.
  **Correction is allowed, never deletion:** a correction is a new observation whose `supersedesId`
  names the row it corrects, keeps that row's `asOf` (the moment counted), and records a fresh
  `recordedBy`/`recordedAt`; the corrected row stays in history marked superseded. `supersedesId` is
  unique when present, so one row can be corrected once and corrections form a single chain. A correction
  **may change the mode** (a wrong service mode is itself an erroneous entry) only when the destination
  lane has no current observation; otherwise it is `422 validation_error` naming that lane, and an
  accepted move still keeps the target's `asOf` and leaves the superseded observation's lane reading
  not recorded. `supersededBy` is derived as the unique row whose `supersedesId` points at this
  observation, never stored twice. Errors: a bad or foreign bucket code, a duplicate code, a count out of
  range, a total above 30,000, an out-of-day `asOf`, or a `supersedesId` that is unknown, already
  superseded, from another session or pointing at an occupied destination lane — `422 validation_error`;
  unknown event or session — `404 not_found`. Headcounts are operator-only: no member DTO, profile or summary returns them. Activities reads the current headcount for a headcount-only event through the same
  `GET`; at most three events are shown, so at most three reads. These routes and the table are the 2026-11-05 headcount correction, delivered by 24d; they sit beside the 24b attendance seam and replace its `/expected` route.
- **Attendance summary.** Returns `{ from, to, attended, expected, events: [{ eventId, name,
sessionDate }] }`: `events` lists the member's attended rows in the window newest first, never
  fabricated absences; `expected` is the number of held member-trackable sessions in the same window whose
  event's audience the member matches at that session's date - the register's own join rule is the only floor.
  Headcount-only events never count.
- **Profile.** Returns `{ memberNo, name, gender, age, ministries: [name], shepherd: { memberNo, name,
gender, age } | null, attendance: { status, attended, expected, window: 5, lastAttendedOn } }` exactly
  as the USSD spec defines the regularity window and floors.

### Import batch

Every import is one transaction and one `import_batch` row (`kind`, `actor`, `rowCount`, `checksum`,
`createdAt`). Row-level errors fail the whole request with a `422` report; there is no partial apply.
The problem body keeps the RFC 9457 shape — `detail` carries the human message and stays stable — and
adds `rows: [{ row, message }]` as an extension alongside it; `message` is not a top-level field, and
`row` is the 1-based data-row index. `rows` lists every row rejected by the file's field validation,
which runs before anything is written, and every unknown member number in an attendance import; a
failure that spans rows (a duplicate `memberNo`) emits one entry per involved row with the same
message. Any other check that needs the database — an archived or purged member, a contact value
already owned by another member — reports the row it stopped at. `detail` carries the `Row N: …`
message of the first rejected row, unchanged from the wording before `rows` existed. Batch-level
failures - an unknown or cancelled event, an unlisted or cancelled session, a capture after the session
closed, or a headcount-only event - carry no `rows`. A headcount-only event (`tracksMembers = false`) is rejected with
`422 headcount_only` before any row is read.

A **member import** row `(memberNo, firstName, lastName, otherNames?, gender?, dob?, joinedOn?,
placeOfResidence?, addressLine?, isPresbyter?, phone?, email?)` upserts the member by `memberNo`
(case-insensitive). A duplicate `memberNo` inside one file, an archived member or a purged member fails
the whole batch. A blank optional cell leaves the stored value unchanged. `phone` and `email` become
contacts: an identical contact is skipped, and a value already held by another member is an error.
Ministries, relationships and subscriptions are not imported.

An **attendance import** is scoped to one occurrence. The request names the occurrence —
`{ eventId, sessionDate, rows }` — and each row is `(memberNo, datetime?)`. `datetime` is optional and,
when present, MUST fall on `sessionDate`; a time inside it is stored as the row's `sessionTime`, and its
absence leaves `sessionTime` null. A row on another date fails the whole batch and names the row and the
date.

**Standalone events (settled 2026-11-22).** An occurrence of a **standalone** event imports exactly like
a recurring occurrence: the old restriction is lifted, `422 series_required` is retired from this
contract and from every acceptance criterion, and the event detail's occurrence row offers the Import
action on both shapes. Three rules hold for either shape:

- **The audience is the expected, not a gate.** A row may name an existing member the event's audience
  does not match; the row is accepted, and the `present`/`expected` ratio may therefore exceed 100 %. A
  row still fails for its own reasons — an unknown, archived or purged member, or a duplicate `memberNo`
  in the file — and the batch-level refusals below are unchanged.
- **Who can be a row.** An attendance row names a **member** or a **registered visitor** (a member record
  with `visitor` status). A **first-time visitor** cannot be an attendance row: there is no member record
  to name, and that person is counted only in the headcount's `visitors` lane
  (`member-registrations-event-audience.md` A-5a).
- **The expected is the audience.** `expected` is the event's audience evaluated at the occurrence date
  (`Everyone` = active members), never the file's row count. The detail is A-5a and the attendance report
  above.

A `tracksMembers = false` event still refuses the import with `422 headcount_only` before any row is
read, and the standalone shape gets no exemption. Issuing an attendance code, a per-member clock-in and a
clocking delegation are the same surfaces on a standalone occurrence; nothing in them depends on a
recurrence. **This lands with the event-parent downstream/import round, after the occurrence migration**,
so the route, the detail's Import action and its tests ship together. The tests cover: a successful
standalone import, an unknown member, a row for an existing member outside the audience, a closed or
cancelled occurrence, and an `expected` computed from the audience.

Each import is a **capture**: the server stamps `asOf` with the clock and records `ended` only when the
body sets `ended: true` — an explicit end, never an inference from the clock. A capture that falls
outside the live window — session date today in the event timezone and the clock inside the session's
start/end (a session with no end time is live for its whole date) — is still an open capture and does
not close the session. An end-only capture sends no rows (`rows: []` with `ended: true`). A capture
replaces that session's imported rows; manual rows and suppressions survive. Captures may repeat, and
the same rows may be captured again as a new observation; the close is once per session. **The close
is only the operator's explicit end action — import or headcount —** and any further capture or
per-member write answers `409 session_closed`. Nothing ends a session automatically: an occurrence may
stay open indefinitely and the close is optional. The batch records the event
and session it targeted and the checksum covers the occurrence plus the rows. The result reports rows written and rows skipped — skipped because a
suppression exists or because a manual row already holds that session — so an operator can tell an
import that wrote ten rows from one that skipped ten.

Rejected while settling this (2026-11-04): keeping a per-row event number (the occurrence is chosen once,
so a stray row cannot silently target another event); letting an import rewrite the event session's
`startTime` (the register is evidence of attendance, the event owns the schedule); and a date-only
contract with the time discarded (the owner asked to keep a time when the file carries one).

Every import publishes its column contract at `GET /v1/imports/formats` and serves an Excel template at
`GET /v1/imports/templates/{kind}` (header row, one example row and a notes sheet). The template and
the JSON contract MUST describe the same columns.

### Offering

`{ id, active, terms, createdAt }` with `OfferingTerms`:

`{ version, name?, purpose, kind, currency, targetMinor?, defaultAmountMinor?, startsOn?, endsOn?, availableUntil?, scripture?, gatewayAccount?, gatewayMetadata? }`

- `kind` is `freewill | tithe | building | missions | other`. A pledge is not an offering kind: it is
  a payment mode on any offering.
- `name` is optional. The API resolves the event-scoped display label as the trimmed custom name, else
  `${event.name} · ${kindLabel}` (Freewill, Tithe, Building, Missions, Other); the catalogue
  returns the stored name, which may be null.
- Terms are versioned and immutable after publish. `POST /v1/offerings/{id}/terms` takes a full flat
  terms body, a required `baseVersion` and a required `reason`, and publishes version n+1; a stale base
  is `409 terms_version_conflict`. `PUT /v1/offerings/{id}` changes only `{ active }`; there is no
  delete and archiving is `active: false`.
- Currency is GHS and amounts are integer minor units.
- `availableUntil` resolves per event as the attachment date (event attachments only, on or after the
  event end), else the terms date, else the event end. Expiry blocks new gifts but MUST NOT block
  honoring a pending pledge. That chain is final: the per-session resolution the withdrawn round would have
  introduced is not coming, because a session carries the collection, not its own attachment.
- Two or more offerings MAY be attached to one event, at the **event level**: the attachment carries its own
  pinned terms version and `availableUntil`, and detaching ends it while keeping the row. The events that would
  have replaced this with a per-occurrence **session offering** — declared on the recurrence, one per generated
  occurrence, skippable and adjustable per session — were **withdrawn by the owner on 2026-11-24**; what a session
  carries is the offering **count** recorded against its date. Exceptions stay keyed to the attachment.
- The event aggregate returns each attachment with its resolved name, effective `availableUntil`, `expired`, its
  pinned `terms`, and its stats. The full contract is `member-registrations-events-offerings.md` (catalogue,
  terms, contributions, pledges, the landing).

### Contribution

- A member contribution carries `memberNo`, the offering (`offeringId`, `eventId` and the `sessionDate` it was
  collected against — the per-session attachment's `sessionOfferingId` was withdrawn on 2026-11-24), amount,
  currency, channel (`app | ussd | manual`), status, reference, a
  unique idempotency key and the `termsVersion` it was recorded under. A registered visitor
  (`membershipStatus: visitor`) gives as a member, with their own member number.
- A first-time visitor contribution carries `visitorName` and an HMAC-SHA-256 phone hash (under
  `VISITOR_PHONE_PEPPER`) instead of `memberNo`; it returns a receipt reference and creates no member.
  The raw phone is never stored, returned or logged. An administrator may later register that giver as a
  registered visitor (`POST /v1/visitors`), and the history follows the person id without rewriting the
  row (`member-registrations-event-audience.md`).
- Exactly one of member and first-time visitor is present. Amounts are positive integer minor units; the
  currency defaults to the offering's current terms currency and must equal it. The gift targets an offering
  **attached to the event**: a detached one is `422 offering_not_on_event`, and `offering_not_on_session` retires
  with the withdrawn per-session attachment.
- `POST /v1/contributions` is idempotent by `idempotencyKey`: an identical canonical payload returns
  `200` with the same record and reference, and a different payload under the same key is
  `409 idempotency_conflict`. An unknown event or offering is `404`; an inactive offering is `422`.
- A gift's `sessionDate` must be the date of one of the event's occurrences
  (`422 session_not_in_event`) and on or before the effective expiry; a later date is
  `422 offering_expired`. A backdated manual gift within the window stays recordable, and honoring a
  pending pledge after expiry stays allowed.
- The server generates the unique `reference` (`MR-` plus ten uppercase base32 characters). Reads send
  `Cache-Control: no-store`.
- Member and first-time visitor totals are reported separately, grouped by currency, counting only `paid`
  contribution rows (not distinct givers), with no names or contact values. A registered visitor's row
  counts as a member row, because it carries a member number; only a gift given by a first-time visitor
  is a first-timer row.

### Pledge

- A pledge carries `memberNo`, `offeringId`, an optional session (`sessionDate`, resolved to the
  occurrence), amount, currency, `expectedOn`, exactly one follow-up officer, the `termsVersion` and an
  `idempotencyKey`. A named session must be one of the event's occurrences (`422 session_not_in_event`); a
  pledge with no session is offering-only, and its settlement records the redemption date's collection.
- The officer is the member's active shepherd, or the active presbyter the administrator supplies; otherwise
  the pledge is rejected (`422 officer_required`). The supplied officer carries no justification requirement —
  `officerReason` is an optional note, not a condition of the write. A pledge always targets an
  existing offering attached to the event; it never creates an offering.
- An administrator may assign an officer at creation or reassign later with a reason; both officers and the
  reason remain in `pledge_events` (`fromOfficerMemberNo`/`toOfficerMemberNo`). At creation the officer is
  optional — leaving it out means the member's active shepherd, which needs no justification because the
  assignment is the justification.
- `officerReason` on create is an **optional note to whoever follows up** (trimmed, 1-500 characters), not a
  justification the API demands and not an audit field: it is accepted with or without an explicit
  `followUpOfficerMemberNo` and is stored in the pledge's `reason`. Reassignment keeps its own mandatory
  reason, which is a different thing and stays required.
- `POST /v1/pledges` is idempotent by `idempotencyKey`: an identical canonical payload returns `200`
  with the stored pledge, a different payload is `409 idempotency_conflict`.
- A pledge is dated by `sessionDate`, else today (UTC), and that date must be on or before the
  offering's effective expiry (`422 offering_expired`); `expectedOn` may be later.
- Status is `pending | honored | dishonored | overdue`; `overdue` is derived from `expectedOn`, never
  stored. Honor is appended on payment; dishonor requires a reason.
- A pending pledge survives offering expiry and can still be honored.
- Reminders are unique per pledge, scheduled date and channel. The three auto-created reminders are
  `pending`, except one dated before today (UTC) at creation, which is `cancelled`; a manually scheduled
  reminder before today is `422 invalid_reminder_date`. Delivery and the member opt-out are deferred
  (OS-5).

## API Contracts

Business routes are under `/v1`, with the public `/auth/*` sign-in routes, the USSD entries
(`/ussd/session`, `/ussd/nalo`) and the public verification acceptance route
(`/portal/verification/accept`) outside it; `/health`, `/openapi.json` and the development-only
`/dev/ussd/session` are unversioned too. Bearer auth guards `/v1` except the signature-verified
`/v1/payments/callback`, which exists only when `PAYMENTS_ENABLED=true`; `/gateway/v1` uses the
gateway token; the USSD entries authenticate with the HMAC signature or the Nalo `USERID`. The member acceptance
route is unauthenticated by design: the single-use token and the six-digit code are its credential, it
answers no member data, and it is rate-limited per token and per address. The route keeps `/portal`
as a stable wire namespace, but the surface is the member acceptance page, never the officer Portal. Every
bearer write requires `X-Actor-Id`.

The V2 additions are `GET /v1/events`, `GET /v1/events/{eventId}` and
`GET /v1/events/{eventId}/attendance?date=`; the V3 additions include `POST /v1/contributions` and
`POST /v1/pledges`.

### Members

| Method   | Path                                                | Result                                                                                                                         |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/v1/members`                                       | Paged summary list (`q`, `contact`, `status`, `include`, `seriesId`, `guardianEligible`, `forMemberNo`, `limit`, `cursor`)     |
| `POST`   | `/v1/members`                                       | `201` + `Location`; `409` duplicate member number                                                                              |
| `GET`    | `/v1/members/{memberNo}`                            | Full DTO + `ETag`; `404` unknown/archived unless flagged                                                                       |
| `PUT`    | `/v1/members/{memberNo}`                            | Update; stale `If-Match` → `409`                                                                                               |
| `DELETE` | `/v1/members/{memberNo}`                            | Archive; `204`                                                                                                                 |
| `POST`   | `/v1/members/{memberNo}/restore`                    | Un-archive; `409` when not archived                                                                                            |
| `POST`   | `/v1/members/{memberNo}/promote`                    | Promote a visitor to `active`, append the status event; `409 not_a_visitor`                                                    |
| `POST`   | `/v1/visitors`                                      | Register a first-time visitor as a registered visitor, matched by phone; `201` + `Location`; `409 visitor_already_registered`  |
| `POST`   | `/v1/members/{memberNo}/purge`                      | Hard delete PII; body must repeat the member number                                                                            |
| `POST`   | `/v1/members/{memberNo}/verification/otp`           | Start a code; `202` destination + expiry; `409 no_own_contact`; `429 too_many_requests`; `503 delivery_unavailable`            |
| `DELETE` | `/v1/members/{memberNo}/verification`               | Withdraw every contact proof and the confirmation, audited; `204`                                                              |
| `POST`   | `/v1/members/{memberNo}/confirmation`               | Officer confirmation `{ reason }`; `201` + `confirmedAt`                                                                       |
| `DELETE` | `/v1/members/{memberNo}/confirmation`               | Withdraw the confirmation, audited; `204`                                                                                      |
| `POST`   | `/portal/verification/accept`                       | Public; `{ token, code }` -> `200` `{ channel, masked }`; `400` code errors; `429`                                             |
| `GET`    | `/v1/members/{memberNo}/attendance`                 | Per-event counts + rows (the parent id keeps its `seriesId` wire name during the transition)                                   |
| `GET`    | `/v1/members/{memberNo}/attendance/summary?from&to` | Windowed attendance totals for the member                                                                                      | ticket 24b |
| `GET`    | `/v1/members/{memberNo}/contributions/summary`      | Week/quarter/year paid totals plus the top three events                                                                        | ticket 24a |
| `GET`    | `/v1/members/{memberNo}/profile`                    | Demographics, ministries, attendance regularity and shepherd                                                                   | ticket 24b |
| `GET`    | `/v1/members/{memberNo}/subscriptions`              | Owned and inherited welfare cover with payer, period and claimed total                                                         | ticket 24c |
| `POST`   | `/v1/members/{memberNo}/attendance`                 | `{ seriesId, date }`; `seriesId` is the parent event id, `date` resolves the occurrence; `422` when not held or headcount-only |
| `DELETE` | `/v1/members/{memberNo}/attendance/{attendanceId}`  | Remove a row (writes a suppression for imports)                                                                                |
| `POST`   | `/v1/members/{memberNo}/contacts`                   | Add contact; `409` on duplicate value                                                                                          |
| `PUT`    | `/v1/members/{memberNo}/contacts/{contactId}`       | Update kind/value/order                                                                                                        |
| `DELETE` | `/v1/members/{memberNo}/contacts/{contactId}`       | Remove contact                                                                                                                 |
| `POST`   | `/v1/members/{memberNo}/contacts/link`              | Link another member's contact (dependent sharing)                                                                              |
| `DELETE` | `/v1/members/{memberNo}/contacts/link/{contactId}`  | Unlink                                                                                                                         |
| `POST`   | `/v1/members/{memberNo}/subscriptions`              | Create subscription (optional coverage)                                                                                        |
| `DELETE` | `/v1/members/{memberNo}/subscriptions/{id}`         | End subscription                                                                                                               |
| `POST`   | `/v1/subscriptions/{id}/coverage`                   | Add a covered member                                                                                                           |
| `DELETE` | `/v1/subscriptions/{id}/coverage/{memberNo}`        | Remove a covered member                                                                                                        |
| `POST`   | `/v1/subscriptions/{id}/renew`                      | Renew one period from `max(periodEnd, today)`                                                                                  |
| `GET`    | `/v1/subscriptions/{id}/payments`                   | List recorded member-paid periods (`no-store`)                                                                                 |
| `POST`   | `/v1/subscriptions/{id}/payments`                   | Record one member-paid period (idempotent)                                                                                     |
| `GET`    | `/v1/subscriptions/{id}/claims`                     | List claims (`no-store`)                                                                                                       |
| `POST`   | `/v1/subscriptions/{id}/claims`                     | Record a claim                                                                                                                 |
| `POST`   | `/v1/subscriptions/{id}/claims/{claimId}/decide`    | Decide a claim (`approved`/`rejected`/`paid`)                                                                                  |
| `GET`    | `/v1/subscription-products`                         | List products; active only unless `?includeInactive=true`                                                                      |
| `GET`    | `/v1/subscription-products/{code}`                  | Product detail                                                                                                                 |
| `POST`   | `/v1/subscription-products`                         | Create a product; `201` + `Location`                                                                                           |
| `PUT`    | `/v1/subscription-products/{code}`                  | Set `active` only                                                                                                              |
| `POST`   | `/v1/members/{memberNo}/ministries`                 | Assign by ministry `code`                                                                                                      |
| `DELETE` | `/v1/members/{memberNo}/ministries/{code}`          | Unassign                                                                                                                       |
| `GET`    | `/v1/members/{memberNo}/relationships`              | Spouse, dependents, guardians                                                                                                  |
| `POST`   | `/v1/members/{memberNo}/relationships`              | `{ relatedMemberNo, type, isDependent }`                                                                                       |
| `DELETE` | `/v1/members/{memberNo}/relationships/{id}`         | Remove the edge                                                                                                                |

**Member summary.** `GET /v1/members` returns `MemberSummary` rows: identity, `isPresbyter`,
`membershipStatus`, `archivedAt`, `contactCount` (a count only; contact values are never in the list)
and `ministries`. The identity carries `gender`, the derived `age` (nullable) and `ageMonths` (nullable;
the same derivation in completed months); the list never carries `dob`. The detail adds `dob` and
reports the same `age` and `ageMonths`.

- `status=active|visitor|archived` selects the set; the default is `active` (a visitor is reached
  deliberately by `status=visitor` or `status=all`, so it does not silently inflate the roster), and
  purged members are never returned. `includeArchived=true` is a deprecated alias for active + archived.
- `include=attendance&seriesId=` adds `attendance: { seriesId, seriesName, attended, expected,
remaining, status, lastAttendedOn }`, computed for the page in one aggregate (FR-8). `seriesId` and
  `seriesName` keep their names and now identify the event parent.
- `include=subscriptions` adds `subscriptions: [{ id, kind, scope, status, role,
policyholderMemberNo, coveredCount }]`, computed for the page in one query.

**Member record and reachability (Phase 1).** A member MUST be reachable through at least one own
contact (phone, email or WhatsApp) or at least one active `guardian` relationship to a reachable
member. Create and update refuse a member with neither with `422 no_contact_or_guardian`; a guardian
link must set `isDependent: true` and is refused with `422 guardian_not_eligible`,
`422 guardian_chain_cycle`, `422 guardian_chain_unreachable` or `422 guardian_chain_too_long`; the last
guardian of a member with no own contact cannot be removed (`409 guardian_required`).
`GET /v1/members?guardianEligible=true&forMemberNo=<no>` lists eligible guardians (18+, reachable,
excluding the member and its descendants) with `memberNo`, `name`, `contactMasked` and `via`; the
detail projects `guardian` in the same shape. The create contract accepts `titleCode` and `titledOn`;
`GET /v1/presbyter-titles` lists the active reference titles. See
`member-registrations-member-record.md`.

### Subscriptions, payments and claims (24c)

All 24c routes are bearer-protected, writes carry `X-Actor-Id`, and reads send `Cache-Control: no-store`.

**Products.** `GET /v1/subscription-products` (active only by default; `?includeInactive=true` for
all), `GET /v1/subscription-products/{code}`, `POST /v1/subscription-products`, and
`PUT /v1/subscription-products/{code}` which sets `active` only (no `ETag`; the product is reference
data and eligibility/pricing are fixed at creation). Create body
`{ code, name, description?, premiumMinor, currency, active?, minMembershipDays, requiresCard,
requiresVerified, gender?, minAge?, maxAge?, paymentMode, periodMonths, covers, maxDependents?,
allowedRelationships? }`. `code` is trimmed, stored uppercase and matched case-insensitively (`409
conflict` on a repeat); `premiumMinor > 0` (`422 invalid_amount`); `periodMonths ∈ {1,2,3,6,12}`;
`paymentMode ∈ {member, church, either}`; `covers ∈ {individual, household}`; `maxDependents ≥ 1` is
required for `household` and forced to 0 for `individual`; `allowedRelationships` is a non-empty subset
of `{spouse, child, parent, guardian, other}`, required for `household` and ignored for `individual`
(`422 validation_error`). `201` carries `Location: /v1/subscription-products/{code}`; `PUT` answers
`200` with the product DTO.

**Subscribe.** `POST /v1/members/{memberNo}/subscriptions` body
`{ productCode, paidBy?, coveredMemberNos? }`. Eligibility is evaluated first; a failure is `422
not_eligible` and the product is hidden from USSD rather than offered then refused. `paidBy` is resolved
server-side: forced to `member` for a `member` product, `church` for a `church` product, and required
only for `either` (the back office resolves it per subscription; the member never chooses). The USSD
Subscribe list never contains an `either` product; a direct `either` subscribe is a back-office action
and must supply `paidBy`. The
subscription starts with `periodStart = today (UTC)`, `periodEnd = periodStart + periodMonths`.
Member-paid writes one `subscription_payments` row for the first period and advances `periodEnd` in the
same transaction; church-paid writes no payment and leaves `premiumMinor` null. `household` validates
each `coveredMemberNos` entry (active member, an existing allowed relationship edge to the policyholder,
within `maxDependents`) and writes explicit `subscription_coverage` rows; `individual` requires the
array empty/absent. **Relationship direction:** `allowedRelationships` is read from the policyholder to
the covered member — `child` means the covered member is the policyholder's child, `parent` means the
covered member is the policyholder's parent. The stored edge is normalised to that direction before
matching (a covered-member-declared `child` edge means the policyholder is that member's child and
normalises to `parent` from the policyholder; `spouse`, `guardian` and `other` are direction-neutral).
`201` with `Location: /v1/members/{memberNo}/subscriptions/{id}`. Errors: `422
validation_error` (cap, relationship, inactive member, individual with dependents), `422 not_eligible`,
`409 conflict` (already covered).

**Renew.** `POST /v1/subscriptions/{id}/renew` body `{ paidBy? }`; `paidBy` defaults to the stored payer
and is required for an `either` product. The period extends from `max(periodEnd, today)` by
`periodMonths`; member-paid records the payment row and advances `periodEnd`, church-paid advances with
no payment. `200` with the subscription DTO; `422 not_eligible`; `409 subscription_not_active` when the
subscription has ended. The standalone coverage routes enforce the same product rules: household only,
the `maxDependents` cap, an allowed existing relationship and an active member (`422 validation_error`),
`409 conflict` when already covered, and `409 subscription_not_active` on an ended subscription.

**Payments.** `GET`/`POST /v1/subscriptions/{id}/payments`. Record body
`{ amountMinor, currency, channel: 'app'|'ussd'|'manual', reference?, paidAt?, idempotencyKey }`; `201`
with `Location: /v1/subscriptions/{id}/payments/{paymentId}` (an identical repeat answers `200`), one row
per unpaid period advances `periodEnd` from `max(periodEnd, today)`. `amountMinor > 0` and `currency` must
equal the product/subscription currency (`422 invalid_amount` / `422 validation_error`). `paidAt` is when
the payment was received or recorded and is informational: it never anchors the period, so a back-dated
`paidAt` cannot reopen a lapsed gap. `period_already_paid` means the subscription is not yet expired
(`periodEnd >= today`), so there is no unpaid period to record. Idempotent by `idempotencyKey`: an
identical repeat returns `200` with the stored row and advances nothing; a different payload under the
same key is `409 idempotency_conflict`; a reused `reference` is `409 conflict`; `409
subscription_not_active`; `422 not_eligible`. Welfare premiums are **recorded, not transacted** — no
gateway intent and no `payment_groups` row in V3.

**Claims.** `GET`/`POST /v1/subscriptions/{id}/claims` and `POST
/v1/subscriptions/{id}/claims/{claimId}/decide`. Record body `{ memberNo, amountMinor, reason }`; the
claimant must be the policyholder or an actively covered member (`404 not_covered` otherwise),
`amountMinor > 0`, reason required; stores `recordedBy`/`recordedAt` and `status = 'pending'`; `409
subscription_not_active`. Decide body `{ status: 'approved'|'rejected'|'paid', note? }`; transitions are
`pending → approved`, `pending → rejected` and `approved → paid`, anything else is `409
claim_not_pending`. `201` with `Location: /v1/subscriptions/{id}/claims/{claimId}` for a record and `200`
with the claim for a decision. "Total claimed" is the sum of `approved` and `paid` amounts. There is no payout rail
and no member self-service claim entry.

**Member subscription read.** `GET /v1/members/{memberNo}/subscriptions` returns `{ items: [...] }`
with owned and inherited rows, `no-store`; each row is
`{ id, source: 'owned'|'inherited', role, status: 'active'|'expired'|'ended', kind: string|null,
productCode: string|null, productName: string|null, paidBy: 'member'|'church'|null, premiumMinor:
number|null, currency: string|null, periodStart: string|null, periodEnd: string|null, startedOn,
endedOn, scope, coveredMemberNos, claimedTotalMinor, createdBy, updatedBy, updatedAt, policyholder:
{ memberNo, name, gender, age }|null, relationship: string|null }`. `status` is `ended` when `endedOn` is
set, `expired` when a product row's `periodEnd < today`, and `active` otherwise; a legacy row with null
`periodEnd` is `active` unless ended. Legacy rows carry a `kind` and null product/payer/period fields. An
inherited row labels the relationship from the covered member to the policyholder (spouse renders
Husband/Wife by gender). `createdBy` is the existing `subscriptions.created_by` column. There is no
standalone `GET /v1/subscriptions/{id}`: the member aggregate and the renew response are the reads.

### Shepherding

| Method   | Path                                               | Result                                                                                                                      |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/v1/shepherding/assignments`                      | Assign a member; reassignment needs `replaceAssignmentId` + `reason`                                                        |
| `DELETE` | `/v1/shepherding/assignments/{assignmentId}`       | End an assignment; `409` when already ended                                                                                 |
| `POST`   | `/v1/shepherding/assignments/{assignmentId}/calls` | Log one attempt; `409` when the assignment has ended                                                                        |
| `GET`    | `/v1/shepherding/assignments/{assignmentId}/calls` | Full call history for the assignment                                                                                        |
| `GET`    | `/v1/shepherding/officers`                         | Presbyters with list size and call totals (`from`, `to`)                                                                    |
| `GET`    | `/v1/shepherding/officers/{memberNo}/members`      | The officer's roster with a contact count (owned and linked; never contact values), counts and latest report (`from`, `to`) |
| `GET`    | `/v1/shepherding/report`                           | Church-wide coverage and call totals (`from`, `to`)                                                                         |
| `GET`    | `/v1/members/{memberNo}/shepherding`               | Current shepherd, assignment history, calls and current status                                                              |

Assignment body: `{ officerMemberNo, memberNo, assignedOn?, replaceAssignmentId?, reason? }`.

Call body: `{ calledOn?, outcome, stillInChurch?, feedback?, issue? }`.

There is deliberately no `DELETE` for a call.

**Registration approval (member-record Phase 1/3).** `POST /v1/registration-requests/:id/approve`
requires `{ memberNo, phoneOwnership }` and a `guardianMemberNo` when the caller's number is borrowed;
the guardian is validated (18+, reachable, chain rules) and the member, its phone and the guardian link
are written in one transaction. A missing required guardian is `422 validation_error` naming the field;
an ineligible guardian uses MR-40's codes; any refusal leaves the request `pending`. The encrypted
number is erased on the decision, and a purge erases the member's confirmation rows (or nulls their
`reason`). See `member-registrations-member-record.md` MR-50 and MR-53.

### Reference data

| Method       | Path                    | Result                                                                                                           |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET`/`POST` | `/v1/ministries`        | List / create (`code`, `name`, …)                                                                                |
| `GET`/`PUT`  | `/v1/ministries/{code}` | Read / rename (code immutable)                                                                                   |
| `DELETE`     | `/v1/ministries/{code}` | Deactivate, or `409` while referenced                                                                            |
| `GET`        | `/v1/presbyter-titles`  | Active titles: `code`, `label`, `genderRestriction`, `active`                                                    |
| `GET`/`POST` | `/v1/audiences`         | List (system and custom; `includeArchived`; `countAt=YYYY-MM-DD` adds `memberCount`) or create a custom audience |
| `GET`/`PUT`  | `/v1/audiences/{id}`    | Read an audience with its rule, or edit a custom one; `409 audience_system`                                      |

The audience rule, its seeds and its evaluation are specified in
`member-registrations-event-audience.md`. Audiences are reference data: no route deletes one, and an
archived custom audience is hidden from the event picker while the events that reference it keep
resolving.

The `/v1/series` routes **retire**: an event is the parent (Events below), and its recurrence is read and
written under the event. During the transition `GET /v1/series/{id}` keeps the legacy series read as its
default and serves the parent detail with `view=parent`; once the UI moves, the default flips and the route
is the plain alias. There is no series list, series create or series schedule route.

### Events

| Method   | Path                                                | Result                                                                                                                                                         |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/v1/events?from&to&ministry&venueType&period`      | Parents with their occurrences in the window and attendance/offering summaries                                                                                 |
| `POST`   | `/v1/events`                                        | Create the parent with exactly one of manual occurrences, one recurrence, or a `period` (one cycle, or a monthly rule) the server resolves; `201` + `Location` |
| `GET`    | `/v1/events/{eventId}?from&to`                      | Parent, recurrence, occurrences in the window, offerings and stats                                                                                             |
| `PATCH`  | `/v1/events/{eventId}`                              | Update the parent (partial); refuses `recurrence`/`period` by name; stale `If-Match` → `409`                                                                   |
| `PUT`    | `/v1/events/{eventId}/schedule`                     | Replace the event rule under the edit guard, one arm (`recurrence` or `period`); `409 recurrence_locked` when closed                                           |
| `PUT`    | `/v1/events/{eventId}`                              | The legacy per-instance update during the transition; it retires when the UI moves                                                                             |
| `POST`   | `/v1/events/{eventId}/archive`                      | Archive the parent; history stays readable                                                                                                                     |
| `POST`   | `/v1/events/{eventId}/occurrences/{date}/cancel`    | Cancel one occurrence with a reason; history stays readable                                                                                                    |
| `POST`   | `/v1/events/{eventId}/recurrence/versions`          | Add a schedule version                                                                                                                                         |
| `POST`   | `/v1/events/{eventId}/recurrence/exceptions`        | Cancel or add a date                                                                                                                                           |
| `DELETE` | `/v1/events/{eventId}/recurrence/exceptions/{date}` | Remove the exception directives for one date                                                                                                                   |
| `GET`    | `/v1/events/{eventId}/attendance?date=`             | Present/expected and member rows for one occurrence                                                                                                            |
| `POST`   | `/v1/events/{eventId}/attendance`                   | Manual row `{ memberNo, date }`; `422` when not an occurrence                                                                                                  |
| `DELETE` | `/v1/events/{eventId}/attendance/{id}`              | Remove a row; writes a suppression when the row was imported                                                                                                   |
| `POST`   | `/v1/events/generate?from&to`                       | Refresh: generate the missing occurrences of each recurrence                                                                                                   |
| `POST`   | `/v1/events/preview`                                | Resolve a `recurrence` or a `period` in either create shape to dates; **no persistence**, `{ occurrences[{date, expected}], audienceCounts[{id, count}] }`     |
| `GET`    | `/v1/events/periods`                                | The named periods as `{ id, name, definition, dates: week \| date }`, from the code catalogue                                                                  |

The event-wide cancel becomes an **occurrence cancel** and the **parent archive**: there is no route that
cancels a whole event by rewriting the parent. `POST /v1/events` with a recurrence generates its first
window atomically; `POST /v1/events/generate` is the refresh for later windows and is idempotent on
`(eventId, date)`. The create body carries `audienceId` (default `Everyone`), `eventNo` (optional; the
server mints it when absent) and exactly **one** of **manual `occurrences`**, **one `recurrence`** or a **`period`**
(one cycle, or a monthly rule) the server resolves, never more than one: the derived
range is not accepted, and `startDate`/`endDate` are read-only. `PATCH` carries the parent fields and **refuses
`recurrence` and `period` by name** (`422`), as it refuses `eventNo`, because a stripped key is a lost edit (owner,
2026-11-25); the schedule has its own verb, `PUT /v1/events/{eventId}/schedule`, taking exactly one arm
(`{ recurrence: { rrule, endsOn? } }` or `{ period: { frequency, day? } }`) and answering
`{ recurrence, period, occurrences, generated }` under the edit guard. The legacy `PUT /v1/events/{eventId}` stays only
for the per-instance form until
that form moves. The attendance, headcount, offering-count and import routes keep `{eventId}` as the
**parent** and take the date. The list's `?ministry=` filter selects events whose **legacy projection's** ministry is that code - an `allOf`
over exactly one ministry - not events whose audience merely contains such a clause, which would turn an inclusion
filter into an exclusion one for `noneOf`. The filter is a legacy convenience and dies with the columns. The retired `ministry` and `presbyterOnly` fields are refused with
`422 validation_error`.

```ts
export type VenueType = 'auditorium' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'active' | 'archived';
/**
 * `scheduled` and `cancelled` are the storable values. `held` is a **read-only derived value**
 * (the occurrence's date is on or before today in the event timezone and neither it nor its parent is
 * cancelled, archived or `draft`); it is never stored and never accepted on a write.
 */
export type EventOccurrenceStatus = 'scheduled' | 'held' | 'cancelled';

export interface EventRecurrence {
  /** Versioned schedules, oldest first; an edit appends a version. */
  schedules: Array<{ effectiveFrom: string; rrule: string; endsOn: string | null }>;
  exceptions: Array<{ date: string; kind: 'cancelled' | 'extra'; note: string | null }>;
}

export interface EventOccurrence {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  status: EventOccurrenceStatus;
  venueType?: VenueType;
  /**
   * The occurrence's capture state. `asOf` is the later `asOf` of the current (non-superseded) headcount
   * observation and the latest import batch (latest by `asOf`, then `createdAt`, then `id`); when the
   * two share an `asOf`, the one with the later recorded time (headcount `recordedAt` vs batch
   * `createdAt`) wins, and if those also tie, the import batch wins. `ended` is the occurrence's shared
   * explicit close state: `true` when an end-only attendance import for the occurrence (superseded
   * batches included) carries `ended`, `false` otherwise; a capture never sets it by timing. `asOf` is an ISO-8601 instant, never zone-shifted;
   * the client renders it in the event timezone. Null when the occurrence has no capture.
   */
  capture: { asOf: string; ended: boolean } | null;
  /** A non-empty reason when the occurrence is cancelled; null on a legacy cancellation. */
  note: string | null;
  present: number;
  expected: number;
  importedRows: number;
  source: 'import' | 'manual' | 'mixed' | 'none';
  /** Read-only legacy per-instance number; null once the transition retires it. */
  legacyEventNo: string | null;
}

export interface AudienceSummary {
  id: string;
  name: string;
  /** True for a seeded audience; system audiences are read-only. */
  system: boolean;
  /** Server-rendered, e.g. "Choir · Presbyters - ministry CHR and presbyter". Never composed by a client. */
  summary: string;
}

export interface Event {
  id: string;
  /** The parent's identity; unique and never reused. An occurrence has none. */
  eventNo: string;
  name: string;
  /** The event's applicability: one saved audience (member-registrations-event-audience.md). */
  audienceId: string;
  audience: AudienceSummary;
  /** The edit guard's wire form; computed by the same function the write guard calls. */
  schedule: {
    locked: boolean;
    reasons: Array<{
      code:
        | 'occurrence_started'
        | 'offering_attached'
        | 'offering_counted'
        | 'attendance_recorded'
        | 'import_suppressed';
      /** The occurrence the cause names; null for a bare event-level attachment. */
      date: string | null;
    }>;
  };
  /**
   * The period this event was created from; null when it was not (see the `period` bullet). This is the **list** row's
   * shape; the **single event read** returns `EventDetail`, which adds the period's shape and definition.
   */
  period: EventPeriodProvenance | null;
  /** Read-only legacy projection during the transition; refused on create and update. */
  ministry: { code: string; name: string } | null;
  /** Read-only legacy projection during the transition; refused on create and update. */
  presbyterOnly: boolean;
  timezone: string;
  description: string | null;
  venueType: VenueType;
  venueName: string | null;
  /** The event's overall range, derived; every occurrence date falls inside it. */
  startDate: string;
  /** Null when a recurring event's recurrence is unbounded. */
  endDate: string | null;
  startTime: string;
  endTime: string | null;
  tracksMembers: boolean;
  status: EventStatus;
  /** Null for a standalone event; the schedule for a recurring event. */
  recurrence: EventRecurrence | null;
  occurrences: EventOccurrence[];
  offerings: EventOffering[];
  /** Scoped to the request's `from`/`to` when supplied; the event's lifetime otherwise. */
  stats: OfferingStats;
}

/** The period's provenance as the **list** carries it. */
export interface EventPeriodProvenance {
  id: string;
  /** The name snapshot taken at save, never a live lookup. */
  name: string;
  cycle: string | null;
  frequency: 'monthly' | null;
  day: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN' | null;
}

/** The **single event read**: a list row's `Event` plus the period's shape and definition. */
export type EventDetail = Omit<Event, 'period'> & {
  period:
    | (EventPeriodProvenance & {
        /**
         * The event's stored spacing: its first two dates fall inside one week (`week`) or a month apart
         * (`date`); null only when the event holds no occurrence at all.
         */
        dates: 'week' | 'date' | null;
        /** The catalogue's prose **as it was at save** - the snapshot beside `period_name`. */
        definition: string;
      })
    | null;
};
```

`GET /v1/events` returns one item per parent: its `occurrences` are the occurrences inside the request's
`from`/`to`, each with its own attendance summary, so a row needs no second request. A recurring row's
schedule is `recurrence.schedules`, and its next occurrence is the first returned occurrence on or after
today in the event timezone; the UI MUST NOT expand the RRULE locally. The detail returns the parent, its
recurrence and its occurrences in the requested window. Each `Event` carries its `audience` (the
applicability rule, resolved server-side) and its derived `startDate`/`endDate`; each occurrence's
`expected` is that audience's roster at the occurrence's date. The `offerings` array is per-session
in the withdrawn session-offerings design (`member-registrations-session-offerings.md`); it is and stays the
event-level list it is today.

### Imports

| Method | Path                           | Result                                                                                                                                                                                                       |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/v1/imports/members`          | Rows `(memberNo, firstName, lastName, …)`, all-or-nothing                                                                                                                                                    |
| `POST` | `/v1/imports/attendance`       | Body `{ eventId, sessionDate, rows: [{ memberNo, datetime? }], ended? }`; captures replace the session's imported rows; a standalone or recurring occurrence both import; `409 session_closed` after the end |
| `GET`  | `/v1/imports/formats`          | Column contract for every import kind                                                                                                                                                                        |
| `GET`  | `/v1/imports/templates/{kind}` | `.xlsx` template for `members` or `attendance`                                                                                                                                                               |
| `GET`  | `/v1/imports/{batchId}`        | Batch record                                                                                                                                                                                                 |

- JSON rows, 1 MB cap (~10k rows); larger files are chunked by the caller. The UI parses CSV or the
  downloaded `.xlsx` into these rows.
- Idempotent by natural key: members on `memberNo`; an attendance **row** is unique on
  `(occurrenceId, memberId)`, while a live capture may repeat as a new batch.
- An attendance import fails as a whole when the `eventId` is unknown, the event is `archived` or
  headcount-only (`422 headcount_only`), the `sessionDate` is not an occurrence or its occurrence is
  cancelled, or a row's `datetime` falls on another date. A recurrence is set by an administrator or by
  generation, never by an import. A **standalone** event's occurrence imports like a recurring one (the
  settled rule in the import section); the only shape-based refusal left is `headcount_only`.

### Offerings and giving

| Method       | Path                                                                 | Result                                                                      |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET`/`POST` | `/v1/offerings`                                                      | List (default active) or create with terms v1                               |
| `GET`/`PUT`  | `/v1/offerings/{id}`                                                 | Read the offering; update the active flag only                              |
| `GET`/`POST` | `/v1/offerings/{id}/terms`                                           | List versions or publish one (`baseVersion`)                                |
| `GET`/`POST` | `/v1/events/{eventId}/offerings`                                     | List active attachments or attach                                           |
| `DELETE`     | `/v1/events/{eventId}/offerings/{offeringId}`                        | Detach (end, not delete)                                                    |
| `GET`/`POST` | `/v1/events/{eventId}/offerings/{offeringId}/exceptions`             | List rows or append a skip/opt-in                                           |
| `POST`       | `/v1/contributions`                                                  | Member or first-time visitor contribution (idempotent)                      | ticket 21  |
| `POST`       | `/v1/contributions/groups`                                           | One payment group for a split gift (one charge)                             | ticket 24a |
| `GET`        | `/v1/contributions?memberNo&offeringId&eventId&from&to&limit&cursor` | Contribution history (`no-store`)                                           | ticket 21  |
| `GET`        | `/v1/contributions/summary?from&to`                                  | Member and first-time visitor totals by currency                            | ticket 21  |
| `POST`       | `/v1/pledges`                                                        | Create a pledge with a follow-up officer                                    | ticket 22  |
| `GET`        | `/v1/pledges?status&memberNo&officerMemberNo&from&to&limit&cursor`   | Pledge list (`no-store`)                                                    | ticket 22  |
| `POST`       | `/v1/pledges/{id}/honor`                                             | Append an honor event                                                       | ticket 22  |
| `POST`       | `/v1/pledges/{id}/dishonor`                                          | Append a dishonor event with a reason                                       | ticket 22  |
| `POST`       | `/v1/pledges/{id}/reassign`                                          | Assign or reassign the officer with a reason                                | ticket 22  |
| `GET`/`POST` | `/v1/pledges/{id}/reminders`                                         | List or schedule reminder records                                           | ticket 22  |
| `POST`       | `/v1/pledges/{id}/settle`                                            | Settle with a contribution and append `honored`                             | ticket 24a |
| `GET`        | `/v1/offerings/summary?from&to`                                      | Church landing totals                                                       |
| `GET`/`POST` | `/v1/events/{eventId}/offering-counts?sessionDate&offeringId`        | Read or record/correct the counted offering (`no-store`, MVP)               |
| `POST`       | `/ussd/session`                                                      | USSD gateway entry (HMAC, not bearer); see the USSD spec                    | ticket 24a |
| `POST`       | `/ussd/nalo`                                                         | Nalo USSD entry (`USERID` auth, not bearer); see the USSD spec              | ticket 24d |
| `POST`       | `/dev/ussd/session`                                                  | Dev-only simulator gateway; refuses in production                           | ticket 24d |
| `POST`       | `/v1/payments/callback`                                              | Gateway callback (signature-verified; `404` unless `PAYMENTS_ENABLED=true`) | ticket 24a |

The event-level attachment rows (`GET`/`POST`/`DELETE /v1/events/{eventId}/offerings` and the nested
`exceptions`) are the contract, not a stage: an offering is **defined at the parent event** and **collected
against a session**, and the per-occurrence routes, the recurrence's default set and the session's
`active`/`termsVersion`/`availableUntil` that would have replaced them were **withdrawn on 2026-11-24**. The
routes, the exceptions table and the contribution/count targets are specified in
`member-registrations-events-offerings.md`, and nothing moves them.

```ts
export type OfferingKind = 'freewill' | 'tithe' | 'building' | 'missions' | 'other';
export interface OfferException {
  date: string;
  kind: 'skip' | 'opt_in';
  note: string | null;
}

export interface OfferingStats {
  attachedEvents: number;
  pledgedMinor: number;
  paidMinor: number;
  pendingMinor: number;
  honorRate: number;
  contributionCount: number;
}

export interface OfferingTerms {
  version: number;
  name: string | null;
  purpose: string;
  kind: OfferingKind;
  currency: string;
  targetMinor: number | null;
  defaultAmountMinor: number | null;
  startsOn: string | null;
  endsOn: string | null;
  availableUntil: string | null;
  scripture: string | null;
  gatewayAccount: string | null;
  gatewayMetadata: Record<string, string> | null;
  createdAt: string;
  createdBy: string;
  reason: string | null;
}

export interface EventOffering {
  offeringId: string;
  name: string;
  availableUntil: string | null;
  expired: boolean;
  terms: OfferingTerms;
  exceptions: OfferException[];
  stats: OfferingStats;
}

export interface Contribution {
  id: string;
  memberNo: string | null;
  visitorName: string | null;
  offeringId: string;
  eventId: string;
  sessionDate: string;
  amountMinor: number;
  currency: string;
  channel: 'app' | 'ussd' | 'manual';
  status: 'initiated' | 'paid' | 'failed';
  reference: string;
  idempotencyKey: string;
  termsVersion: number;
  createdAt: string;
}

export interface ContributionSummary {
  from: string;
  to: string;
  items: Array<{
    currency: string;
    memberCount: number;
    memberPaidMinor: number;
    visitorCount: number;
    visitorPaidMinor: number;
  }>;
}

export interface Pledge {
  id: string;
  memberNo: string;
  offeringId: string;
  eventId: string;
  sessionDate: string | null;
  amountMinor: number;
  currency: string;
  expectedOn: string;
  followUpOfficerMemberNo: string;
  status: 'pending' | 'honored' | 'dishonored' | 'overdue';
  reason: string | null;
  termsVersion: number;
  idempotencyKey: string;
  createdAt: string;
}

export interface PledgeEvent {
  id: string;
  pledgeId: string;
  kind: 'created' | 'honored' | 'dishonored' | 'reassigned';
  actor: string;
  reason: string | null;
  fromOfficerMemberNo: string | null;
  toOfficerMemberNo: string | null;
  at: string;
}

export interface Reminder {
  id: string;
  pledgeId: string;
  scheduledFor: string;
  channel: 'sms' | 'whatsapp' | 'ussd' | 'email';
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sentAt: string | null;
}
```

### Session gateway (V2)

Browser traffic does not call the routes above directly. The GitHub Pages UI calls `/auth/*` and
`/gateway/v1/*` on the same Express app and Vercel function that serves the API. The gateway is an
in-process router layer: it validates the session, injects the bearer and derived actor, rewrites the
path to the matching `/v1/*` route, and calls the existing routers. It is not a second project and not
an HTTP hop.

| Method | Path               | Result                                                                       |
| ------ | ------------------ | ---------------------------------------------------------------------------- |
| `POST` | `/auth/magic-link` | `202`; emails a single-use link; identical response for unknown addresses    |
| `POST` | `/auth/exchange`   | Exchange a one-time code for a short-lived session credential                |
| `GET`  | `/auth/me`         | Officer identity and derived actor id                                        |
| `POST` | `/auth/logout`     | Revoke the session                                                           |
| `ALL`  | `/gateway/v1/*`    | Validate the session, inject the bearer and `X-Actor-Id`, rewrite to `/v1/*` |

- The gateway is the only browser-path holder of `API_BEARER_TOKEN`.
- Sessions are Postgres rows with a hashed credential, a `last_used_at`, an expiry and a revoked
  timestamp. Lifetime is 8 hours idle with a 12-hour absolute cap.
- The browser receives a session credential and sends it as a bearer header; the gateway sets no
  authentication cookie.
- `X-Actor-Id` is derived from the authenticated officer; a client-supplied value is ignored.
- CORS allows only the Pages origin (custom domain when configured) and local development origins, on
  `/auth/*`, `/gateway/*`, `/health` and the development-only `/dev`. `/health` is the operator UI's
  pre-flight probe: a request from an allowed origin MUST answer its normal health result (`200`, or
  `503` when the database is unreachable) with `Access-Control-Allow-Origin` set to the caller; a
  request with no `Origin`, or from an unlisted origin, MUST answer the same result **without** the
  header — `/health` is not sensitive and must not be rejected. `/openapi.json` is not a browser
  surface and stays non-CORS.
- Only `/v1/*` is reachable through the gateway; no arbitrary URL is forwarded.
- Officers are seeded and deactivated by CLI; only active officers receive a link.
- Magic links go through a `Mailer` port: Resend in production, console/no-op in development and tests.
- Magic-link rate limits per email and per IP are stored in Postgres.

### Errors

RFC 9457 `application/problem+json` with a stable `code`: `validation_error`, `not_found`, `conflict`,
`unauthorized`, `invalid_json`, `payload_too_large`, `route_not_found`, `internal_error`,
`import_failed`, `event_not_active`, `session_not_in_event`, `offering_already_attached`,
`offering_not_on_event`, `terms_version_conflict`, `invalid_exception_date`, `offering_expired`,
`headcount_only`,
`idempotency_conflict`, `invalid_amount`, `invalid_expected_date`, `invalid_reminder_date`,
`officer_required`, `pledge_already_terminal`, `payment_failed`, `contact_in_use` (`409`),
`already_verified` (`409`), `ussd_disabled` (`503`), `code_invalid`, `code_expired`,
`code_used`, `code_voided`, `code_wrong_session`, `too_many_tries`, `already_clocked`,
`registration_not_pending`, `not_shepherd`, `not_presbyter`, `not_senior_presbyter`,
`delegate_required`, `delegation_exists`, `not_eligible`, `subscription_not_active`,
`period_already_paid`, `not_covered`, `claim_not_pending`, `card_in_use`, `cors_rejected`,
`no_contact_or_guardian`, `guardian_required`, `guardian_not_eligible`, `guardian_chain_cycle`,
`guardian_chain_unreachable`, `guardian_chain_too_long`, `no_own_contact` (`409`),
`too_many_requests` (`429`), `delivery_unavailable` (`503`), `session_closed`,
`audience_system` (`409`), `audience_name_in_use` (`409`), `not_a_visitor` (`409`),
`visitor_already_registered` (`409`),
`event_draft` (`409`, a draft parent's occurrence cannot be cancelled), `status` (`409`, a parent status move the
route refuses, including `archived` outside the archive route), `recurrence` (`409`, a recurrence write on a manually
dated parent), `reason_required` (`422`, a cancellation without a note).

### Concurrency and caching

- `version` on the member row produces `ETag: "v{n}"`; `If-Match` is checked on `PUT`.
- Reassignment uses `replaceAssignmentId` as its consent checkpoint, so a stale client cannot move a
  member between shepherds.
- All member, shepherding and event-attendance responses send `Cache-Control: no-store` — the records
  are personal data.

## Data Models

All money is `bigint` minor units plus an ISO currency. History tables are append-only.
`events` is the parent; `event_occurrences` replaces the JSONB `sessions` array and `event_instances`,
and the attendance and giving rows key to the parent and its occurrence. The event's `startDate`/`endDate`
range is **derived** (from its occurrences, and for a recurring event also from its recurrence), so it has
no column of its own and cannot drift from the dates. `event_instances`, `event_series`,
`series_schedules` and `series_exceptions` are the **legacy source** the event-parent migration replaces;
they are not part of the target model and are dropped after the rekey (below).

| Table                           | Key fields                                                                                                                                                                                                                                                                                                                               | Constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`                        | `id`, `event_no`, `name`, `audience_id`, `ministry_id` (nullable, legacy), `presbyter_only` (legacy), `timezone`, `description`, `venue_type`, `venue_name`, `start_time`, `end_time`, `tracks_members`, `status` (`draft`/`active`/`archived`), `archived_at`, timestamps                                                               | unique `event_no`; `audience_id` references `audiences`; unique `(lower(name), audience_id)` among non-archived recurring events; a legacy `draft` instance keeps `draft` on its parent; the legacy `ministry_id`/`presbyter_only` are read-only projections written from the audience and retired in the downstream round; `tracks_members = false` is headcount-only                                                                                                                                                                                                                                                                             |
| `audiences`                     | `id`, `name`, `system`, `system_key` (nullable), `active`, `rule` (JSONB), `created_at`, `created_by`, `updated_at`, `updated_by`                                                                                                                                                                                                        | unique `system_key` when present; unique `lower(name)`; a system row is read-only; no delete, archiving is `active = false`; the rule is validated by the API, not by a column constraint                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `member_status_events`          | `id`, `member_id`, `kind` (`promoted`), `from_status`, `to_status`, `reason` (nullable), `actor`, `at`                                                                                                                                                                                                                                   | append-only; the only status action this round is promotion, so `kind` has no `demoted` value; a status change is a new row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `first_time_visitor_identities` | `phone_hash` (unique), `member_id`, `linked_by`, `linked_at`                                                                                                                                                                                                                                                                             | append-only; the only link between a first-time visitor gift's phone hash and the person; never rewritten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `event_recurrence_versions`     | `id`, `event_id`, `effective_from`, `rrule`, `ends_on` (nullable), `created_at`, `created_by`                                                                                                                                                                                                                                            | append-only **except a guarded rewrite** - the version in force is the newest `effective_from <= date`, and while the event has no history (no occurrence today or earlier, no offering attached or counted, no headcount, attendance row or import suppression) a rewrite deletes the version in force and inserts its replacement with the same `effective_from` in one transaction, because that row provably carries no history and the append-only rule governs records that do carry it; an extension appends a version whose `effective_from` is after the last generated occurrence and never deletes; `COUNT`/`UNTIL` rejected in `rrule` |
| `event_recurrence_exceptions`   | `id`, `event_id`, `date`, `kind` (`cancelled`/`extra`), `note` (nullable), `created_at`, `created_by`                                                                                                                                                                                                                                    | append-only **as a date's directive history** — a write appends and the newest row per `(event_id, date)` is effective; `note` required for `cancelled`; `DELETE …/recurrence/exceptions/{date}` removes every directive for that date because an exception is a schedule instruction, not a record with history (the append-only rule governs records that carry history: attendance, headcounts, offerings, calls)                                                                                                                                                                                                                               |
| `event_occurrences`             | `id`, `event_id`, `date`, `start_time`, `end_time`, `status` (`scheduled`/`held`/`cancelled`), `note`, `venue_type` (nullable), `legacy_event_no` (nullable), timestamps                                                                                                                                                                 | unique `(event_id, date)`; `event_id` references `events`; a cancelled row carries a note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `attendance`                    | `id`, `occurrence_id`, `member_id`, `session_time`, `source`, `import_batch_id`                                                                                                                                                                                                                                                          | unique `(occurrence_id, member_id)`; a cancelled occurrence takes no rows; its date cannot change while rows reference it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `offerings`                     | `id`, `active`, `created_at`, `updated_at`, `updated_by`                                                                                                                                                                                                                                                                                 | soft archive; no hard delete; `updated_by` records the last active-flag change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `offering_terms`                | `offering_id`, `version`, `name` (nullable), `purpose`, `kind`, `currency`, `target_minor`, `default_amount_minor`, `starts_on`, `ends_on`, `available_until`, `scripture`, `gateway_account`, `gateway_metadata`, `reason`, `created_at`, `created_by`                                                                                  | unique `(offering_id, version)`; immutable after publish; `reason` is null for version 1 and required after                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `event_offerings`               | `id`, `event_id`, `occurrence_id` (nullable), `offering_id`, `available_until`, `attached_on`, `attached_by`, `detached_on`, `detached_by`                                                                                                                                                                                               | a series-level attachment has a null `occurrence_id`; an instance attachment points at its occurrence; unique active pairs `(offering_id, occurrence_id)` when set and `(offering_id, event_id)` when null; the table is the attachment, and no `session_offerings` replaces it                                                                                                                                                                                                                                                                                                                                                                    |
| `offering_exceptions`           | `id`, `attachment_id`, `date`, `kind` (`skip`/`opt_in`), `note`, `created_at`, `created_by`                                                                                                                                                                                                                                              | the per-date skip or opt-in for an attachment, keyed to it; append-only, and nothing replaces it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `session_offerings`             | **not part of this model** - the withdrawn per-session attachment would have lived here; an offering attaches to the parent event and a session carries the collection                                                                                                                                                                   |
| `session_offering_events`       | **not part of this model** - the history of the withdrawn per-session attachment; nothing writes it                                                                                                                                                                                                                                      |
| `contributions`                 | `id`, `member_id` (nullable), `visitor_name`, `visitor_phone_hash`, `event_id`, `offering_id`, `session_date` (the session the gift was collected against; `session_offering_id` was the withdrawn target), `amount_minor`, `currency`, `channel`, `status`, `reference`, `idempotency_key`, `terms_version`, `created_at`, `created_by` | unique `idempotency_key` and unique `reference`; amount > 0; member XOR first-time visitor; `(offering_id, terms_version)` references the published terms; the gift targets an offering attached to the event                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pledges`                       | `id`, `member_id`, `offering_id`, `event_id`, `occurrence_id` (nullable; `session_date` is the collection date it resolves), `amount_minor`, `currency`, `expected_on`, `officer_member_id`, `status`, `reason`, `terms_version`, `idempotency_key`, `created_at`, `created_by`                                                          | unique `idempotency_key`; amount > 0; expected date not past at create; a named session must be one of the event's occurrences; the officer must be an active presbyter                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `pledge_events`                 | `id`, `pledge_id`, `kind` (`created`/`honored`/`dishonored`/`reassigned`), `actor`, `reason`, `from_officer_member_id`, `to_officer_member_id`, `at`                                                                                                                                                                                     | append-only; `from`/`to` are set on `reassigned`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `reminders`                     | `id`, `pledge_id`, `scheduled_for`, `channel`, `status`, `sent_at`                                                                                                                                                                                                                                                                       | unique `(pledge_id, scheduled_for, channel)`; status is `pending`, or `cancelled` for an auto-created past date; no delivery in V3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ussd_sessions`                 | `id`, `phone_hash`, `member_id` (nullable), `anonymous`, `state`, `context` jsonb, `external_id` (nullable), `last_input_seq`, `expires_at`, timestamps                                                                                                                                                                                  | 3-minute idle TTL; no raw phone; `external_id` is the provider session id, partial unique when present; defined in the USSD spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ussd_nonces`                   | `nonce` primary key, `seen_at`, `expires_at`                                                                                                                                                                                                                                                                                             | replay guard; pruned after 10 minutes; defined in the USSD spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `payment_groups`                | `id`, `reference` unique, `idempotency_key` unique, `total_minor`, `currency`, `status` (`pending`/`paid`/`failed`), `pledge_id` nullable, `created_at`, `created_by`                                                                                                                                                                    | one gateway charge per group; never partially paid; `pledge_id` is unique when present (one redemption group per pledge); defined in the USSD spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `payment_intents`               | `id`, `payment_group_id` unique, `gateway`, `reference` unique, `status` (`initiated`/`paid`/`failed`), `raw_callback_hash`                                                                                                                                                                                                              | unique gateway reference; one intent per payment group; defined in the USSD spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `officers`                      | `id`, `email` (lower-cased, unique), `name`, `actor_id`, `active`, timestamps                                                                                                                                                                                                                                                            | only active officers can sign in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `auth_magic_links`              | `id`, `officer_id`, `token_hash`, `expires_at`, `used_at`                                                                                                                                                                                                                                                                                | single use; short TTL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `auth_sessions`                 | `id`, `officer_id`, `token_hash`, `expires_at`, `revoked_at`, `last_used_at`, `created_at`                                                                                                                                                                                                                                               | revocable; credential stored hashed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `auth_rate_limits`              | `key` (`email` or `ip`), `window_start`, `count`                                                                                                                                                                                                                                                                                         | atomic upsert; no in-memory authority                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

The 24b and 24c tables (`attendance_codes`, `registration_requests`, `clocking_delegations`,
`subscription_products`, `subscription_payments`, `subscription_claims`) and the
`members.presbyter_rank`, `membership_card_no` and `verified_at` columns are defined in the USSD spec
and migrations 0014/0015. The 24d correction adds `event_session_headcounts`, `presbyter_only` on
`event_instances` and `event_series`, and `ussd_sessions.external_id` in migration 0016, defined in the
USSD spec. The MVP's `event_session_offering_counts` and `event_session_offering_count_lines` arrive in
migration `0017` and are defined in `member-registrations-events-offerings.md` (phase 5). Phase 3's
migration `0025` adds `member_contacts.verified_at`, `member_confirmations`,
`member_verification_codes` (with `token_hash`, `contact_id` and `destination_value_hash`) and
`registration_requests.phone_encrypted`,
defined in the USSD spec; the request hash remains for the rate limit and the reference, and approval
refuses a number owned elsewhere with `409 contact_in_use`; `members.verified_at` stays inert history; `confirmedAt` and eligibility read the confirmation audit.

### The event-parent migration: tables, rekey and backfill

This is the migration named as a hard gate for the event-parent round; the outline below is its
reviewable contract. It runs in one transaction and is idempotent by natural key.

**Tables.** `events` (the parent), `event_recurrence_versions` and `event_recurrence_exceptions` (from
`series_schedules` and `series_exceptions`, keyed to `event_id`), and `event_occurrences` (one dated
child per occurrence, `unique (event_id, date)`). `event_instances` is the source; its JSONB `sessions`
array is the standalone event's list of dates.

**Parent and occurrence backfill.**

- A series-backed instance (`series_id` not null) becomes an occurrence of that series' parent: the
  parent reuses the series id, the series' schedules and exceptions move to the recurrence tables, and
  the instance's `event_no` is preserved as the occurrence's `legacy_event_no`.
- A standalone instance (`series_id` null) becomes a parent reusing the instance id, with **one
  occurrence per `sessions[]` entry**: `date`, `start_time`, `end_time`, `status`, `venue_type` and
  `note` are copied. The array's unique dates are asserted before the insert; a duplicate aborts the
  migration rather than minting two occurrences for one date.
- The parent's status follows its source: a series parent is `archived` when the series had `archived_at`, else
  `active`; a standalone parent keeps `draft` when its instance was `draft`, `archived` when it was archived, and
  `active` otherwise. A draft occurrence is `scheduled` and the UI shows the parent as a Draft.
- A series parent's `venue_type`, `start_time` and `end_time` come from its **earliest instance** (the lowest
  `start_date`, cancelled ones skipped); an occurrence may override them. The parent is the default, not a copy of
  every instance.
- The parent's `event_no` is the standalone instance's `event_no`, or a freshly minted one for a series
  parent. The occurrence's `legacy_event_no` stays read-only until the downstream round; an occurrence
  has no number of its own.

**Rekey, table by table.** For every child row that will carry an `occurrence_id`, the occurrence is
resolved by the join `parent_id = coalesce(instance.series_id, instance.id)` and
`date = session_date`; contributions and pledges resolve the **parent** only and keep `session_date`
(no session target is ever added: the pair is the identity). The join cannot miss: the old session
guard (and the standalone `sessions[]` list) refused a child whose date was not one of the event's
sessions.

| Table                           | Source key                                              | Target key                                         | Index / unique change                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attendance`                    | `(event_instance_id, session_date, member_id)`          | `(occurrence_id, member_id)`                       | unique `(occurrence_id, member_id)` replaces the triple; index on `occurrence_id`                                                                               |
| `attendance_suppressions`       | `(member_id, event_instance_id, session_date)`          | `(member_id, occurrence_id)`                       | the primary key becomes the pair; the cascade follows the occurrence                                                                                            |
| `event_session_headcounts`      | `(event_instance_id, session_date)` + `id`              | `occurrence_id` + `id`                             | index `(occurrence_id)`; `supersedes_id` and its unique index are unchanged                                                                                     |
| `event_session_offering_counts` | `(event_instance_id, offering_id, session_date)` + `id` | `(occurrence_id, offering_id)` + `id`              | group index `(occurrence_id, offering_id)`; the supersession chain and its lines stay; the pair is the permanent identity, and no `session_offering_id` arrives |
| `registration_requests`         | `(event_instance_id, session_date)`                     | `occurrence_id` (`session_date` kept denormalised) | index `(occurrence_id, status)`; `phone_hash`, `code_id` and `member_id` unchanged                                                                              |
| `attendance_codes`              | `(event_instance_id, session_date)`                     | `occurrence_id` (`session_date` kept)              | the session/purpose index moves to `(occurrence_id, purpose)`                                                                                                   |
| `clocking_delegations`          | `(event_instance_id, session_date)`                     | `occurrence_id`                                    | the active unique index becomes `(occurrence_id)` where `ended_at is null`                                                                                      |
| `import_batches`                | `(event_instance_id, session_date)`, nullable           | `occurrence_id` (nullable)                         | legacy batches with neither stay null; no uniqueness is added                                                                                                   |
| `contributions`, `pledges`      | `(event_instance_id, session_date)`                     | `event_id` (the parent) + `session_date`           | no occurrence column is added here; the event, the offering and the session date are the identity, and no `session_offering_id` arrives                         |

- The append-only chains survive unchanged: headcount and offering-count corrections key row ids
  (`supersedes_id`), not the session pair, so re-pointing a row at an occurrence keeps every chain and
  the one-correction-per-row unique index intact. Attendance suppressions are rekeyed with their rows.
- `session_date` stays as a derived read field on the rows whose wire or count is keyed by the date
  (`headcounts`, `offering counts`, `registration_requests`, `attendance_codes`, `import_batches`,
  `contributions`, `pledges`); it is derived from the occurrence and never independently written. Tables
  that carried the pair as their primary identity (`attendance`, `attendance_suppressions`,
  `clocking_delegations`) drop it.
- The short-lived `ussd_sessions.context` is **not** rekeyed: sessions expire in minutes and no history
  depends on the stored event id or date.
- `event_offerings` is **rekeyed here**, not left legacy: a series-level attachment keeps `event_id` with a
  null `occurrence_id`; an attachment on a **series-backed** instance points at that instance's single-date
  occurrence. A standalone instance's attachment had no date of its own, so it stays event-level (null
  `occurrence_id`). Rows carrying an `occurrence_id` are **legacy history** from the per-instance era; no
  `session_offerings` table is built, because the per-session attachment was withdrawn on 2026-11-24.
  `offering_exceptions` stay keyed to the attachment row and are untouched.

**Idempotency and integrity.**

- A child row whose occurrence cannot be resolved aborts the transaction with the offending key in the
  report; the migration never guesses a date or drops a row. (The old guard made this a data defect, not
  an expected state.)
- Before and after the rekey, the migration asserts the row count of every table is unchanged, that each
  `attendance` unique pair is preserved, and that every `supersedes_id` resolves to a row in the same
  table. A failure rolls the whole migration back.
- A second run adds nothing: each backfill writes through the natural key and `on conflict do nothing`,
  and the parent/occurrence inserts are guarded by the same `unique (event_id, date)`.
- After the backfill it drops `event_instances.sessions`, every `event_instance_id` column, the
  `session_date` columns whose target key replaces them (`attendance`, `attendance_suppressions`,
  `clocking_delegations`), the old indexes and `series_schedules`/`series_exceptions`, and `event_series` (its
  references are all rekeyed); `event_instances` itself goes when no column references it, leaving
  `legacy_event_no` as the only trace of the old per-instance number.

## Acceptance Criteria

### AC-1: **Given** a standalone conference, **When** it is created with three occurrences, **Then** it returns `201` as one event parent with a unique `eventNo` and three occurrence rows, and no recurrence. (FR-1, FR-3)

### AC-2: **Given** an event, **When** `venueType` is `church`, **Then** the request fails with `422` and nothing is written. (FR-2)

### AC-3: **Given** duplicate occurrence dates, **When** the event is created, **Then** the request fails with `422` and nothing is written. (FR-3)

### AC-4: **Given** a cancelled exception and an extra exception, **When** generation runs twice, **Then** no occurrence exists for the cancelled date, one exists for the extra date, and the second run adds nothing. (FR-4)

### AC-5: **Given** an attendance row for a date that is not one of the event's occurrences, **When** it is written, **Then** the database rejects it and the API returns `422`. (FR-5)

### AC-6: **Given** an attendance import with one unknown occurrence date, **When** it is submitted, **Then** the whole batch fails and no row is written. (FR-6)

### AC-7: **Given** a manual row and a later import for the same key, **When** the import runs, **Then** the manual row survives; deleting an imported row writes a suppression. (FR-7)

### AC-8: **Given** a 25-row member page with `include=attendance&seriesId=`, **When** it loads, **Then** the attendance aggregate is one query and no per-member request is issued. (FR-8)

### AC-9: **Given** a published offering, **When** its terms are edited, **Then** a new version is created and the published version is unchanged. (FR-9)

### AC-10: **Given** two offerings attached to one event, **When** one is detached, **Then** it leaves the active attachments and its history remains readable. (FR-10)

### AC-11: **Given** an offering skipped on a date, **When** that date is evaluated, **Then** the offering is not offered; after `availableUntil` a new gift is rejected. (FR-11)

### AC-12: **Given** a contribution with an existing idempotency key, **When** it is posted again, **Then** the same contribution is returned and no second row is created. (FR-12)

### AC-13: **Given** a visitor with a name and phone, **When** they give, **Then** a receipt or reference is returned, no member is created, and the phone is stored hashed; **Given** a registered visitor or a member, **When** they give, **Then** the gift carries their member number and history follows the person through a later promotion. (FR-13)

### AC-14: **Given** a member with no active shepherd and no administrator-supplied officer, **When** they pledge, **Then** the request fails with `422 officer_required`. (FR-14)

### AC-15: **Given** a pledge, **When** an administrator reassigns its officer with a reason, **Then** a `pledge_events` row records both officers and the reason. (FR-15)

### AC-16: **Given** a pending pledge on an expired offering, **When** it is honored, **Then** the honor succeeds while a new gift is rejected. (FR-16)

### AC-17: **Given** a pledge, **When** a reminder is scheduled twice for the same date and channel, **Then** only one reminder row exists. (FR-17)

### AC-18: **Given** a member or event attendance response, **When** its headers are inspected, **Then** `Cache-Control: no-store` is present. (FR-18)

### AC-19: **Given** a direct API write without `X-Actor-Id`, **When** it is submitted, **Then** it is rejected and nothing is written; a correction to a pledge or attendance row appends a new record instead of updating one. (FR-19)

### AC-20: **Given** a zero or negative amount, **When** a contribution is posted, **Then** it fails with `422` and `invalid_amount`. (FR-20)

### AC-21: **Given** the UI, **When** it makes a data request, **Then** it goes to the gateway with a session credential, and the API bearer is absent from the request and browser storage. (FR-21)

### AC-22: **Given** an officer, **When** they sign in, **Then** the magic link is single-use, the session expires and is revocable, and a write carries the derived `X-Actor-Id`. (FR-22)

### AC-23: **Given** an unlisted origin, **When** it calls the gateway, **Then** CORS rejects it; **Given** a path outside `/v1`, **When** it is requested, **Then** the gateway does not proxy it; **Given** the operator UI's health probe, **When** it runs from an allowed origin, **Then** `/health` answers `200` (or `503`) with `Access-Control-Allow-Origin` set to that origin; **Given** a request with no `Origin` or an unlisted origin, **When** it probes `/health`, **Then** the same result is returned without the header. (FR-23)

### AC-24: **Given** a gateway request, **When** it is served, **Then** it is rewritten to the existing `/v1` router in the same process, with no HTTP call to a second deployment. (FR-24)

### AC-25: **Given** an address that is not an active seeded officer, **When** it requests a link, **Then** no link is sent and the response is indistinguishable from a known officer; there is no enrolment form or domain rule. (FR-25)

### AC-26: **Given** the production configuration, **When** a link is sent, **Then** Resend is used through the `Mailer` port; **Given** tests, **When** a link is requested, **Then** nothing is sent and the link is captured in-process. (FR-26)

### AC-27: **Given** a signed-in browser, **When** it calls the gateway, **Then** it sends a bearer session header and the gateway sets no auth cookie; the session is only in `sessionStorage`. (FR-27)

### AC-28: **Given** two serverless instances, **When** a session or rate-limit decision is made, **Then** both read the same Postgres state; no in-memory store is authoritative. (FR-28)

### AC-29: **Given** `PAYMENTS_ENABLED` unset or `false`, **When** `POST /v1/payments/callback` is called even with a signature made with the development secret, **Then** the response is `404` and no contribution or pledge is written. (§ Subscriptions, payments and claims (24c))

### AC-30: **Given** `USSD_ENABLED=false`, **When** `/ussd/session` or `/ussd/nalo` is called with no signature, with a valid signature, and with a signature made with the development default secret, **Then** every response is `503 ussd_disabled` and no HMAC or `USERID` verification or write occurs. (§ USSD attendance, codes and clocking (24b))

### AC-31: **Given** a standalone event and one of its occurrences, **When** an attendance import names that occurrence with a known member, **Then** the batch is accepted exactly as it is for a recurring occurrence; a row naming an unknown member fails the batch with that row named; a row naming an existing member outside the event's audience is accepted and `present` may exceed `expected`; a closed or cancelled occurrence answers its existing `409 session_closed` / `409 event_not_active` and writes nothing; a `tracksMembers = false` event still answers `422 headcount_only`; and `expected` is the audience evaluated at that occurrence's date. (FR-6)

### AC-32: **Given** a live session, **When** an import captures it twice without `ended`, **Then** both are accepted, each stamped with `asOf`, and the second replaces the first's imported rows while manual rows survive; **Given** an import capture outside the live window with no `ended`, **Then** it is accepted as an open capture and the session stays open; **Given** an end-only capture (`rows: []` with `ended: true`), **Then** the session closes; **Given** any later capture, **Then** it is refused with `409 session_closed`. (FR-6)

### AC-33: **Given** a session closed by the explicit end, **When** a per-member manual write, an import or a headcount is attempted, **Then** each answers `409 session_closed` and writes nothing; a per-member manual write for a session not dated today in the event timezone is refused while no close exists. (FR-6, §Clocking)

### AC-33a: **Given** a session dated before today in the event timezone, or a headcount whose `asOf` falls outside the session's calendar day, **When** a headcount is recorded while no close exists, **Then** the API answers `422 validation_error` and writes nothing; **Given** a session dated today or later whose calendar day contains the headcount's `asOf`, **When** it is recorded outside the live window without `ended: true`, **Then** it is accepted as written and does not close the session — no capture closes by timing, only the operator's explicit end does — and a session may stay open indefinitely. (§ Headcounts)

### AC-34: **Given** an event whose audience is `Presbyters`, **When** a non-presbyter and a presbyter read it, **Then** the roster (`expected`) is the active presbyters, the non-presbyter does not see it on the member-facing surface, and the bearer back office reads it for both. **Given** the seeded `Everyone` (`allOf(membershipStatus active)`) and `Visitors only`, **When** an active member and a registered visitor are evaluated, **Then** `Everyone` matches the active member and excludes the visitor, `Visitors only` matches the visitor and excludes the active member, and a rule such as `allOf(ministry CHR)` matches an active choir member but not a visitor in the choir. (FR-32, FR-33)

### AC-35: **Given** an audience whose rule is `anyOf(age 0-12, age 13-17)`, **When** a member's age is evaluated on an occurrence date, **Then** the age is the member's completed years on that date and a member with no `dob` matches neither band. (FR-33)

### AC-36: **Given** a member created as a visitor, **When** the operator promotes them, **Then** `membershipStatus` becomes `active`, a `member_status_events` row records the actor and reason, and a second promotion is `409 not_a_visitor`; a member created `active` cannot be created `archived`. (FR-34)

### AC-37: **Given** a first-time visitor contribution whose phone hash matches, **When** an administrator registers the giver with `POST /v1/visitors`, **Then** a member with `visitor` status and an owned phone contact is created, the giving history follows that member, no contribution row is rewritten, and a second registration of the same phone is `409 visitor_already_registered`. (FR-35)

### AC-38: **Given** a request that sends `ministry` or `presbyterOnly` on event create or update, **When** it is submitted, **Then** the field is refused with `422 validation_error` and the event's applicability is only `audienceId`. (FR-36)

### AC-39: **Given** legacy `event_instances` rows — a standalone event with JSONB sessions and a series-backed instance — with attendance, suppressions, headcounts (including a correction), offering counts and registration requests, **When** the event-parent migration runs, **Then** each child row resolves to its occurrence, every table's row count is unchanged, the supersession chains still resolve, the unique keys are the target keys, and a second run adds nothing. (FR-1, FR-4, FR-5)

### AC-40: **Given** a legacy instance whose status is `draft`, **When** the migration runs, **Then** its parent reads `draft` and its occurrence reads `scheduled` regardless of the copied session status; **Given** a series with `archived_at`, **Then** its parent reads `archived`; **Given** an offering attachment on a series-backed instance, **Then** its `event_offerings` row carries that occurrence's `occurrence_id`, while a series-level attachment and a standalone instance's attachment carry none. (FR-1, FR-10)

## Edge Cases

- EC-1: A multi-day event where one occurrence is cancelled: attendance is allowed for the remaining occurrences only, and the cancelled date is visible but read-only.
- EC-2: An import references an event and date that is not an occurrence: the batch fails, names the event and the date, and leaves the register unchanged.
- EC-3: A pledge's shepherd is archived after the pledge is created: the pledge keeps its officer of record, and a new follow-up requires reassignment.
- EC-4: A visitor gives twice with the same phone: two contributions and two receipts, and still no member record.
- EC-5: An offering expires mid-event: new gifts stop at the expiry instant while pending pledges remain honorable.
- EC-6: An event is archived after generating its occurrences: the occurrences stay readable and no new generation occurs.
- EC-7: An occurrence date is edited after attendance exists: the update is rejected while rows reference that occurrence.

## Implementation Decisions

| Concern         | Choice                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js 24 LTS                                                                                                                                                                                                            |
| Language        | TypeScript 5.9, `strict`, ESM                                                                                                                                                                                             |
| HTTP            | Express 5                                                                                                                                                                                                                 |
| Validation      | Zod 4                                                                                                                                                                                                                     |
| Contract        | OpenAPI 3.1 generated from Zod via `z.toJSONSchema`                                                                                                                                                                       |
| Database        | Postgres — Neon in production, PGlite in tests                                                                                                                                                                            |
| Access layer    | `Db` port (`query`/`exec`/`transaction`) stays the seam; Drizzle is wired by ticket 02 as the CRUD smoke, and wider adoption is gated by the Series trial (03–04); attendance, occurrence and import queries stay raw SQL |
| Migrations      | Embedded SQL applied by a tracked runner; the ORM never owns migrations                                                                                                                                                   |
| Events storage  | `events` (parent), `event_recurrence_versions`/`exceptions`, `event_occurrences`; attendance keyed by occurrence                                                                                                          |
| Money           | GHS, integer minor units (`bigint`)                                                                                                                                                                                       |
| Idempotency     | Unique key on contributions; retry-safe generation, imports and callbacks                                                                                                                                                 |
| Visitor privacy | Name plus hashed phone; no member record; receipt or reference returned                                                                                                                                                   |
| Browser auth    | Same Express app: magic link via Resend, Postgres session, gateway router, bearer server-side, actor derived                                                                                                              |
| Recurrence      | `rrule` package, dates handled as calendar dates                                                                                                                                                                          |
| Date handling   | All defaults and "today" are UTC; the event `timezone` is an optional override                                                                                                                                            |
| Testing         | Vitest 5 + Supertest 7 + PGlite                                                                                                                                                                                           |
| Logging         | Pino 10 (JSON)                                                                                                                                                                                                            |
| Lint / format   | ESLint 10 flat config + Prettier 3                                                                                                                                                                                        |
| Package manager | npm 11, lockfile committed                                                                                                                                                                                                |

### Why these choices

- **Postgres over document storage**: attendance counts are relational aggregation. A document store
  turns "2 of 5" into application-side aggregation over unbounded arrays.
- **A thin SQL port, with an ORM only where it pays**: the denominator engine, occurrence resolution and
  imports are SQL-shaped, and every ORM abstraction had to be escaped to write them. The `Db` port
  stays the seam, with `pg` in production and PGlite in tests. Drizzle is adopted for CRUD repositories
  only, behind the repository boundary: ticket 02 wires the schema and both drivers and migrates the
  Ministries repository as the smoke, while wider adoption is gated by the Series trial (03–04). It
  never owns migrations or the engine queries. This keeps the seam explicit and the revert cheap.
- **Events, not a dummy series**: the event is the parent of its recurrence and its dates. A
  standalone conference records its occurrences directly, and a recurring event owns a recurrence that
  generates them idempotently on `(eventId, date)`. An occurrence is a row, not an array element, so
  attendance keys to it and a date the event does not hold cannot enter the register.
- **Offerings as versioned terms**: the public appeal can change without rewriting what was promised.
  Contributions and pledges are append-only, and visitor giving never creates a member record.
- **PGlite for tests**: real Postgres semantics in-process, so `generate_series`, date arithmetic and
  constraints behave the same as production without Docker.
- **Name search uses `ILIKE`**, not `pg_trgm`: a register of a few thousand members does not justify
  the extension, and PGlite parity is worth more than an index that is invisible at this size.

### Series ORM trial (ticket 03)

The trial measures whether Drizzle earns its place beyond the Ministries smoke. It does not change the
public contract.

- **Scope.** Migrate the Series **CRUD and transaction** operations (`list`, `get`, `create`, `update`,
  `addSchedule`, `setException`, `removeException`, `load`) to Drizzle. The **occurrence engine**
  (`resolveSeriesOccurrences` and `loadCalendar` in `src/repos/occurrences.ts`) stays raw SQL:
  `AGENTS.md` §12 keeps the attendance, occurrence and import queries on the `Db` port, and the trial
  records that fragment as kept raw rather than migrating it.
- **Comparison.** The round doc publishes, for the migrated operations against the raw baseline: code
  size (lines), query count per operation, p95 latency on PGlite over N runs, and every SQL fragment
  kept raw. The measurement is a reproducible trial artefact, not a CI gate.
- **Transaction seam.** Writes inside `db.transaction` use the transaction-scoped `orm` (ticket 02); a
  rolled-back transaction leaves no row.
- **Decision.** The trial publishes the comparison and a recommendation; **the owner decides** adopt or
  revert, and ticket 04 records the ruling with its evidence and the rejected alternative. On adopt,
  ticket 04 adds the ORM-versus-migrations drift check and enforces the repository boundary; on revert,
  Drizzle is removed in one revertible commit and the test suite stays green.
- **Tests.** All series tests pass; new tests cover concurrent version append and exception idempotency.

### ORM gate outcome (ticket 04)

**Adopted.** The Series trial measured the ORM slower on PGlite (p95 ~1.5–1.9× raw), slightly larger,
and with the same round trips. PGlite is in-process WASM, which over-weights the ORM's per-query
overhead versus networked Postgres, and the absolute deltas are sub-3 ms. Drizzle stays the CRUD
repository client, and the gate adds two guards:

- **Drift check:** a test compares the Drizzle schema (`src/db/schema.ts`) to the SQL migrations
  (columns and nullability) and fails on a deliberate mismatch.
- **Boundary:** no ORM type or import appears in a route, Zod schema or OpenAPI output.

The rejected alternative — reverting Drizzle and recording why — is in the round doc.

### Members CRUD trial (ticket 05)

Migrate the `members`-table row operations to Drizzle; everything that crosses into another entity
stays raw.

- **In scope:** `create` (the member row insert), the reads (`findRow`/`findAnyRow`/`findById`),
  `update` (the version-gated update), `archive`/`restore` (the member row update), and `purge` (the
  PII nulling).
- **Raw:** `list` (the cross-entity name search; contact matching is the `contact` filter), every
  related-table read and write (contacts, subscriptions, coverage, ministries, relationships,
  attendance, shepherding), the contact/ministry sub-inserts inside `create`, and the related-table
  deletes inside `purge`. Ticket 06 owns contacts/subscriptions.
- **Attendance and denominator:** the counts, `lastAttended` and the denominator queries stay raw and
  return the same numbers.
- **Concurrency:** the `version = version + 1 where version = $x` gate is preserved; a stale ETag still
  returns the existing `409` problem+json.
- **Verification:** behavioural identity, not speed. The attendance and shepherding tests stay
  unedited; new tests cover CRUD, duplicate `memberNo`, and a stale ETag.

### Contacts, subscriptions and shepherding batch (ticket 06)

Move the contact, coverage, subscription and append-only shepherding-call operations to Drizzle; the
report and aggregate queries stay raw.

- **In scope:** `loadContacts` and the member contact operations (`addContact`, `updateContact`,
  `removeContact`, `linkContact`, `unlinkContact`, `insertContact`); `addCoverage`/`removeCoverage` and
  `insertCoverage`; `addSubscription`/`endSubscription` and `subscriptionsFor`; and the append-only
  shepherding calls (`logCall`, `listCalls`, `loadCallsForMember`).
- **Raw:** the member `list` (the cross-entity name search; contact matching is the `contact` filter),
  the attendance/ministries/relationships loaders, the shepherding assignment lifecycle (`assign`,
  `endAssignment`), and the roster/report/officer aggregates.
- **Contract:** unchanged. The summary contract keeps its contact list (Q65); contact values are not
  removed from list responses in this ticket.
- **Append-only:** shepherding calls remain insert/read-only; no update or delete route appears.
- **Verification:** the existing behavioural tests pass unedited; new tests cover a contact conflict
  and link rule, coverage overlap, subscription end, and the append-only call path.

### Project layout

```
src/
  index.ts              # Vercel entry (default export; listens only outside Vercel)
  create-app.ts         # app factory: helmet, JSON, logging, auth, routes, errors
  auth.ts               # bearer token, timing-safe comparison
  actor.ts              # X-Actor-Id extraction for writes
  openapi.ts            # OpenAPI 3.1 from the Zod schemas
  config/env.ts         # Zod-validated environment
  db/
    sql.ts              # Db port: query / exec / transaction
    pg.ts               # production adapter (node-postgres pool; DATE stays a string)
    pglite.ts           # test adapter (real Postgres in WASM)
    migrations.ts       # embedded SQL applied by a tracked runner
    migrate.ts          # migration runner; migrate-cli.ts is `npm run db:migrate`
  domain/
    contacts.ts         # normalisation + uniqueness rules
    series.ts           # RRULE validation, schedule expansion, occurrence resolution
    events.ts           # event/session validation, status transitions, generation
    attendance.ts       # denominator engine
    offerings.ts        # terms versions, expiry, officer resolution
    auth.ts             # magic-link and session rules
    shepherding.ts      # latest-known status, counts, coverage rules
  repos/                # members, ministries, series, occurrences, events, offerings, auth, imports, shepherding
  routes/               # members, subscriptions, ministries, series, events, offerings, auth, gateway, imports, shepherding
  schemas/              # Zod request/response schemas
  errors/               # domain errors + problem+json middleware
```

## Testing Decisions

1. **Domain unit tests** (pure, no database): contact normalisation, RRULE expansion and exceptions,
   the denominator window, subscription coverage rules, relationship symmetries, and the
   latest-known shepherding status (an `unknown` report never erases `yes`/`no`).
2. **Repository contract tests** against PGlite: constraints (duplicate contact, one spouse edge,
   unique member number, one active shepherd), import idempotency, suppression behaviour,
   archive/purge, and append-only calls surviving assignment end.
3. **HTTP contract tests** (Supertest + PGlite): status codes, problem+json bodies, ETag/`If-Match`,
   actor enforcement, paging, import failure reports, reassignment consent (`409` with
   `currentAssignment`, then success with `replaceAssignmentId` + `reason`), roster and report counts,
   and OpenAPI coverage.
4. **Event and attendance tests**: standalone and multi-session events, venue enum rejection, session
   uniqueness and range, idempotent generation with exceptions, the session-date trigger, and import
   resolution by `eventId` + `sessionDate` with a `409` for a repeated file.
5. **Offering tests**: terms immutability, attach/detach, expiry versus a pending pledge, a visitor
   receipt with a hashed phone, contribution idempotency, pledge officer resolution and reminder
   deduplication.

Tests assert external behaviour — responses, persisted rows, computed counts — not internal call
sequences.

## Deployment

- Vercel Function, region pinned in `vercel.json` (`fra1`; change to the users' region).
- Neon Postgres via the Vercel Marketplace integration; `DATABASE_URL` is injected as an environment
  variable. Use the **pooled** connection string.
- `API_BEARER_TOKEN` is required in production.
- `VISITOR_PHONE_PEPPER` (at least 16 characters) is required in production for the visitor-phone
  HMAC; development and tests may use a local default, and rotating it changes every stored hash.
- `USSD_ENABLED` defaults to `false`. When it is `false`, `USSD_GATEWAY_SECRET`, `USSD_PHONE_PEPPER`,
  `USSD_CODE_PEPPER` and `USSD_NALO_USER_ID` are **not** required, and every USSD entry answers
  `503 ussd_disabled` **before** any HMAC or `USERID` verification; the development simulator answers
  the same `503` when disabled outside production, where its refusal remains the `404` already
  documented in the route table. `USSD_NALO_MAX_MSG_CHARS` is never required. When it is `true`, all
  four are required in production and must differ from their development defaults; a local developer
  must set `USSD_ENABLED=true` to drive the simulator. **The production guard that rejects
  `USSD_ENABLED=true` (`USSD_ENABLED must be false when NODE_ENV=production until a real aggregator
exists`) is retained**, so the `true` requirements apply only once a future aggregator integration
  (OS-3) removes it.
- `PAYMENTS_ENABLED` defaults to `false`. When it is `false`, `POST /v1/payments/callback` is not
  mounted and answers `404` (its raw-body parser is skipped too), and `PAYMENT_GATEWAY_SECRET` is
  **not** required. `createApp` gains `paymentsEnabled?: boolean`, defaulting from the variable, and
  the test helper defaults it **enabled**, as it does for USSD. When it is `true`, a secret of at
  least 16 characters that differs from the development default is required in production, and the
  callback is mounted before the bearer gate with HMAC verification of the raw body. AC-29's `404`
  case is exercised by an app constructed with `paymentsEnabled: false`.
- **Disabled subsystems must not verify.** The `503 ussd_disabled` / `404` gate is the only guard for
  a switched-off subsystem and MUST precede any HMAC or `USERID` verification; a frame or callback
  signed with a public `dev-only-*` default MUST never authenticate. The generated OpenAPI document
  lists the payment callback unconditionally; the runtime answers `404` when it is disabled.
- Migrations run as an explicit step (`npm run db:migrate`), never automatically on request.
- Vercel's 4.5 MB body limit still applies; the app caps JSON at 1 MB, so imports are chunked.

## Out of Scope

- OS-1: The browser UI. It is specified in `documents/specs/member-registrations-ui.md` (V2).
- OS-2: A production payment-gateway integration. The contract is defined; no provider is chosen.
- OS-3: A production USSD aggregator integration. The flow is specified; no shortcode is provisioned.
- OS-4: Currencies other than GHS.
- OS-5: Backfilling events and attendance before the migration cutover; ticket 07 decides the window.
- OS-6: Automatic or scheduled imports (cron).
- OS-7: Duplicate-person merge.
- OS-8: Multi-tenancy, SSO, per-user tokens and rate limiting.
- OS-9: Per-officer authorization and data scoping. V2 authenticates the officer and derives
  `X-Actor-Id`, but every authenticated officer can read and write the whole register.
- OS-10: Shepherding cadence targets and overdue flags; pledge reminders are in scope.
- OS-11: Bulk assignment in one request.
- OS-12: Email/SMS delivery for shepherding.
- OS-13: A named member-list clause, nested audience rules, membership/ministry/presbyter history,
  per-audience reports, per-officer authorization, audiences on offerings and self-service visitor
  registration. They are the exclusions of `member-registrations-event-audience.md`.
- OS-14: The per-session offering attachment - **withdrawn 2026-11-24**. It was to be a separate round after
  the event-parent migration; the owner replaced it with parent-level attachment and per-session collection, so no
  part of it lands. `member-registrations-session-offerings.md` is kept as the record of what was considered.

## Changelog

- **2026-11-03** — Clarifying edit (no behaviour change): ticket 02 wires the Drizzle schema and both
  drivers and migrates only the Ministries repository as the smoke. Wider CRUD adoption stays gated by
  the Series trial (ticket 03) and the adopt/revert gate (ticket 04), and reverting needs no schema
  change.
- **2026-11-04** — Spec-first for ticket 03: the Series ORM trial migrates the Series CRUD and
  transaction operations to Drizzle, keeps the occurrence engine raw per `AGENTS.md` §12, and publishes
  code size, query count, p95 PGlite latency and the kept-raw fragments; the owner decides and ticket
  04 records the ruling.
- **2026-11-04** — ORM gate (ticket 04): adopted Drizzle for CRUD repositories after the Series trial;
  added the schema-vs-migrations drift check and the repository boundary test. The trial's PGlite
  latency finding is recorded and caveated.
- **2026-11-04** — Spec-first for ticket 05: the Members CRUD trial migrates the members-table row
  operations to Drizzle while the `list` search, the related-table reads/writes and the
  attendance/denominator queries stay raw; ticket 06 owns contacts/subscriptions.
- **2026-11-04** — Spec-first for ticket 06: the contacts/coverage/subscriptions/shepherding batch
  migrates those writes and reads to Drizzle, keeps the report and aggregate queries raw, preserves the
  existing summary contact contract (Q65), and keeps shepherding calls append-only.
- **2026-11-04** — Spec-first for ticket 07: the `event_instances` migration evolves
  `event_occurrences` in place (id primary key, nullable `series_id`, dates/venue/status/source and the
  `sessions` JSONB), mints an instance for every attendance-only key, and repoints attendance and
  suppressions to `(event instance, session date)`. Imported-date authority is limited to real imports
  (`import_batch_id` not null).
- **2026-11-04** — Spec-first for ticket 08: `GET /v1/events` returns the `Event` shape for a date-window
  list (filters `from`/`to`/`seriesId`/`ministry`/`venueType`, `limit`/`offset`), with server-derived
  status in UTC, per-session present/imported/source counts, `expected` deferred to ticket 10, zero
  offerings/stats until they land, and `eventNo` nullable for a series-minted instance until ticket 11
  assigns one.
- **2026-11-04** — Spec-first for ticket 10 (grill Q103–Q105): `expected` per session is the register at
  that session date (`joined_on <= sessionDate`, not archived, not purged); the attendance report lists
  only stored rows as `present` and never fabricates absences; a manual post shadows an import row and
  a second manual post is `409`; writes are rejected on a cancelled or archived event and a cancelled
  session is read-only. A database trigger enforces `session_date ∈ sessions`.
- **2026-11-04** — Spec-first for ticket 11: generation covers a `from`/`to` window for every
  non-archived series, inherits the series name/ministry/timezone with the default `auditorium` venue
  and `00:00` start, is idempotent on `(seriesId, startDate)`, and mints `EVT-<year>-<NNN>` from a
  per-year counter.
- **2026-11-04** — Spec-first for the imports amendment (grill Q107–Q110): V2 has exactly two imports —
  the member database (`POST /v1/imports/members`, upsert by `memberNo`, contacts without duplicates)
  and the attendance registry. The event-list import is retired; occurrences come from the schedule and
  exceptions. Every import publishes its column contract (`GET /v1/imports/formats`) and an Excel
  template (`GET /v1/imports/templates/{kind}`).
- **2026-11-04** — Spec-first for ticket 13a: `GET /v1/members` returns `contactCount` instead of
  contact values, supports `status=active|archived`, and adds page-level `include=attendance&seriesId=`
  and `include=subscriptions` aggregates.
- **2026-11-16** - Corrects FR-31 to what ships: the contacts-only
  `GET /v1/members/{memberNo}/contacts` was never added, so contact values are readable only through
  the member detail, which the UI's contacts dialog reads with the query issued only while that dialog
  is open (UI spec FR-78, amended the same day).
