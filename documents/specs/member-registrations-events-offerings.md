# Spec — Events, Series and Offerings

**Author:** Solomon Owoo

**Date:** 2026-11-03

**Status:** **Approved 2026-11-03; ticket-23 amendment (23-Q1–23-Q10, R1–R8) accepted 2026-11-07;
MVP offering-count amendment (phase 5, Q18–Q24) accepted 2026-11-08**, both by the fallback reviewer
seat (first-choice `0813` unavailable: weekly usage limit). The **offering-denomination grid
amendment (slice A, 2026-11-09)** was accepted by the owner from the grill round and reviewed by
`ollama-cloud/deepseek-v4-pro:0813`: REWORK (2 P1, 4 P2) → fixes → **ACCEPT**. The **series-summary
amendment (2026-11-11, round `series-detail-summary`)** adds `GET /v1/series/{id}/summary?from&to` and
fixes what the series summary counts; it was reviewed by `ollama-cloud/deepseek-v4-pro:0813` across
two rounds — REWORK (2 P1, 7 P2) → REWORK (1 P1, 1 P2) → **ACCEPT**. Events/series V2 and
offerings V3; implementation is gated by tickets 07–11, 20–24 and the MVP capture round. The
Strategic Conference is the reference event.

|         |                                                                                       |
| ------- | ------------------------------------------------------------------------------------- |
| Repo    | `MemberRegistrations`                                                                 |
| Related | `documents/specs/member-registrations-api.md`, `member-registrations-ui.md`           |
| Mockup  | local `mockups/v2-events/` (git-ignored review artifact)                              |
| Scope   | V2 events/series screens (existing API) and V3 offerings/USSD/payment (new, upcoming) |

---

## Context

The register has event **series**, derived **occurrences**, attendance imports and per-member attendance
counts. It has no screen that answers “what happened at the event on 2 November?”, “which series are
running?”, “which attendances were imported?”, or “what offerings were attached to that event?”.

The API is authoritative for series and occurrences:

- `GET /v1/series` and `GET /v1/series/{id}` expose the series, schedule versions and exceptions.
- `GET /v1/series/{id}/occurrences?from&to` returns the dates the series actually met.
- `POST /v1/imports/events` and `POST /v1/imports/attendance` import the two source files.
- `GET /v1/members/{memberNo}/attendance` returns per-member, per-series counts.
- There is **no event-level attendance report** and no first-class event. `EventSeries` is a recurring
  template; an occurrence is only a date.

The example **Strategic Conference** exposes the gap: a standalone three-day event, Tuesday 13 to
Thursday 15 October 2026, starting at 17:30 in the Main Auditorium. It has one event identity, three
dated sessions, per-date attendance and a venue. The current series/occurrence model cannot represent
that without creating a dummy recurring series and hiding the event name, span, start time and venue
in free text.

Offerings are a new domain. They attach to events (two or more per event), may be skipped on specific
dates, and can be one-off gifts or pledges with a presbyter follow-up officer. Visitors may give with
name + phone and receive a receipt. The future USSD flow shows the current/next event and a short
offering list, combines selections, and pays or pledges with an expected date; pledges are honored or
dishonored, reminders chase the pending ones, and a church landing page shows totals by member. The
payment gateway and USSD aggregator are future integrations; this spec defines the domain and wire
contracts they will use.

## Solution

### V2 — Events and series screens (existing API)

- A new top-level **Events** section with **Events**, **Series** and **Offerings** (upcoming) views.
- **Events** are first-class dated instances, not series occurrences. `EventSeries` remains the
  recurring template; a series occurrence generates an event, and a standalone conference is an event
  with no `series_id`.
- **Event fields**: `event_no`, name, optional `series_id`, ministry, timezone, start/end date,
  start/end time, **venue type (`auditorium` / `virtual` / `hybrid`)**, venue name, description,
  status and source. `event_instances.sessions` is a JSONB array of dated sessions; a three-day
  conference has three session objects on one event row.
- **Events list**: event name, date range, series/standalone, venue, per-date attendance summary,
  offerings summary and status. Selecting a row opens the event detail.
- **Event detail**: series/standalone, date range, 17:30 start, venue, per-date present/expected,
  imported-row source, the read-only Active offerings panel and a link to the attendance import.
- **Series**: list and detail with schedule versions, exceptions, generated events, attendance summary
  and attached offerings. The detail summary is one aggregate read, `GET /v1/series/{id}/summary`, and
  renders as four tiles above the schedule versions: next occurrence, occurrences in the window,
  attendance over held member-tracking sessions, and the window's offering totals. Adding a schedule
  version and adding/removing an exception use the existing endpoints; archiving is a soft end.
- **Attendance import** remains in `Imports`; it is scoped to one event session (`eventId` +
  `sessionDate`), and its rows are `memberNo` plus an optional `datetime` checked against that session.
  The event/series screen links to the import with the occurrence preselected.
- **Event stats** require the event aggregate:
  `GET /v1/events?from&to` and `GET /v1/events/{eventId}/attendance?date=`. Until it ships, the event
  screen shows imported-row counts and a clear “attendance report not available” state, never a
  fabricated present/expected number.

### V3 — Offerings (upcoming)

- **Offering definition** with a versioned **terms of reference** (name, purpose, kind, currency,
  target, start/end, payment-gateway metadata). The name is optional; the display defaults to
  `${event.name} · ${kind}`. Special offerings may have their own name.
- **Event attachment**: two or more offerings per event; an offering may be attached to a series with
  **exceptions** on specific dates. `availableUntil` is the event end or an explicit later date.
  Expiry blocks new gifts; a pending pledge can still be honored.
- **Contributions**: active members and visitors can give to an attached offering, by app, USSD or
  manual entry; amount is stored in integer minor units.
- **Visitors**: name + phone, receipt/reference, no member record. Visitor totals are aggregated
  separately on the landing and never expose phone numbers.
- **Pledges**: a member may pledge instead of paying, with an expected date and a required active
  presbyter as follow-up officer. The member's current shepherd is used first; otherwise the
  administrator supplies an active presbyter with a reason; a pledge always targets an existing offering,
  never a standalone one.
- **Reminders**: scheduled for pending/overdue pledges, with a channel and delivery record. No
  duplicate reminder for the same pledge/date/channel.
- **USSD**: member or visitor identification, the current/next active event, a short offering list
  (max five plus `0 More`), multi-select, combined total, pay or pledge with expected date, and a
  confirmation code. The flow is specified but not implemented in the mock.
- **Payment gateway**: terms of reference are sent to the gateway in the future; the gateway callback
  reconciles a contribution. No card data is stored by this application.
- **Church offerings landing**: totals by member, offering and event; honors/dishonors; pending
  reminders; visitor totals separate. Financial visibility is gated to officers (Q9).

### V3 phase 1 — offering definitions and attachments (ticket 20)

Ticket 20 ships the offering domain and its wire contract. Contributions, pledges, reminders, the USSD
flow, the gateway and the offerings UI are tickets 21–24; the contribution route is where the expiry
rule becomes an HTTP rejection.

- **Definition and versions.** `POST /v1/offerings` takes the terms flat — `name?`, `purpose`, `kind`,
  `currency`, `targetMinor?`, `defaultAmountMinor?`, `startsOn?`, `endsOn?`, `availableUntil?`,
  `scripture?`, `gatewayAccount?`, `gatewayMetadata?` — creates the offering with `active: true` and
  terms version 1, and returns `201` + `Location` and the `Offering`. `GET /v1/offerings` returns
  `{ items }`, defaulting to active offerings, `active=false` for archived only and
  `includeArchived=true` for both, ordered by `createdAt` descending; the catalogue is small and is not
  cursor-paged. Every later terms change publishes version n+1 through `POST
/v1/offerings/{id}/terms` with the same flat body plus a required `baseVersion` and a required
  `reason` for the change; the body is a full
  replacement, not a merge, and a stale base is `409 terms_version_conflict`. A published version is
  immutable. `PUT /v1/offerings/{id}` takes `{ active: boolean }` and never edits terms. There is no
  offering delete; archiving is `active: false`. `GET /v1/offerings/{id}/terms` returns
  `{ items: OfferingTerms[] }`, newest first.
- **Name.** `terms.name` is nullable. The API resolves the display name as the trimmed custom name when
  it is non-empty, otherwise `${event.name} · ${kindLabel}`, where the labels are Freewill, Tithe,
  Building, Missions and Other. `EventOffering.name` is always the resolved name and the UI
  MUST NOT compose it. In the catalogue, where no event exists, `Offering.terms.name` is returned as
  stored (null when unnamed) and a UI label falls back to the kind label.
- **Attachment.** An offering attaches to exactly one of an event or a series. `POST
/v1/events/{eventId}/offerings` takes `{ offeringId, availableUntil? }` and returns `201` +
  `Location`; `POST /v1/series/{id}/offerings` mirrors it. `GET` on either path lists the active
  attachments. An active duplicate is `409 offering_already_attached`; a past, cancelled or archived
  event, or an archived series, is `409 event_not_active`; an inactive offering is `422
validation_error`. Detaching is `DELETE /v1/events/{eventId}/offerings/{offeringId}` (series
  equivalent): it sets `detachedOn`, keeps the row and returns `204`; a detach with no active
  attachment is `404`. A re-attach after a detach is a new attachment row, and exceptions belong to
  that row, so they do not carry over.
- **Effective expiry.** The effective expiry of an attachment is its own `availableUntil`, else the
  offering's `terms.availableUntil`, else the event's `endDate` — for a series attachment, the
  occurrence's end date. An attachment-level `availableUntil` is allowed only on an event attachment
  and MUST be on or after that event's `endDate` (`422 validation_error` otherwise); a series
  attachment MUST omit it. The `expired` flag is true when today (UTC) is after the effective date and
  tells the UI and USSD not to offer the offering. A contribution whose `sessionDate` falls after the
  effective date MUST be rejected, while a backdated manual gift dated within the window stays
  recordable; honoring a pending pledge MUST still succeed. Ticket 20 exposes the resolved date, the
  `expired` flag and the predicate; ticket 21 enforces the rejection on the contribution route.
- **Exceptions.** A `skip` or `opt_in` is recorded against one attachment row through `POST
/v1/events/{eventId}/offerings/{offeringId}/exceptions` or the series equivalent, body `{ date, kind:
'skip' | 'opt_in', note? }`, returning `201`; `GET` on the same path returns
  `{ items: [{ id, date, kind, note, createdAt, createdBy }] }`, newest first, and both routes answer
  `404` when the offering has no active attachment. Rows are append-only and the effective exception
  for a date is the newest row, so reversing a skip is another row; there is no exception delete route.
  For an event attachment the date MUST be one of the event's session dates and the kind MUST be
  `skip`; for a series attachment `skip` MUST name a date the series meets and `opt_in` MUST name an
  extra date the series records. Anything else is `422 invalid_exception_date`.
- **Event aggregate.** `GET /v1/events/{eventId}` returns `offerings` in the same request (FR-39): the
  resolved `name`, the effective `availableUntil`, `expired`, the current `terms`, the effective
  exception per date that falls on one of the event's session dates, and stats. `stats` is
  `OfferingStats`; before contributions exist, `attachedEvents` counts the offering's active **event**
  attachments (a series-only attachment counts `0`), every money field is `0` and `honorRate` is `0`.

### V3 phase 2 — contributions and visitor gifts (ticket 21)

Ticket 21 records gifts; pledges, reminders, the landing and the USSD/gateway flows are tickets 22–24.
A contribution is append-only and has no update or delete route.

- **Create.** `POST /v1/contributions` takes `{ memberNo? | visitorName? + visitorPhone?, offeringId,
eventId, sessionDate, amountMinor, currency?, channel, status?, idempotencyKey }`. Exactly one of the
  member and the visitor pair is present. An unknown event or offering is `404`; an inactive offering is
  `422 validation_error`. `amountMinor` is a positive integer. `currency` defaults to the offering's
  current terms currency and MUST equal it (`422 validation_error` otherwise). `channel` is `app | ussd
| manual`. `status` is `paid` (the default) or `initiated`; `failed` is rejected on create because
  only a gateway callback may fail a gift. `idempotencyKey` is required, 1–128 characters.
- **Gift target.** A gift is recorded against the offering only when it is actively attached to the
  event, directly or through the event's series; otherwise `422 offering_not_on_event`. The
  `sessionDate` MUST be one of the event's session dates and not a cancelled one
  (`422 session_not_in_event`). A cancelled or archived event is `409 event_not_active`. These checks
  apply to member and visitor gifts alike.
- **Member.** The member MUST exist, not be archived and not be purged (`404` otherwise).
- **Expiry.** A gift's `sessionDate` MUST be on or before the offering's effective expiry for that event
  (see below); a later date is `422 offering_expired`. The `expired` flag (today past the date) only
  tells the UI and USSD not to offer the offering; a manual, backdated gift dated within the window is
  still recordable for audit. When an offering is attached both directly and through the event's
  series, the earliest active attachment's effective expiry governs. Honoring a pending pledge after
  expiry stays allowed (ticket 22).
- **Terms snapshot.** The contribution records the offering's current `termsVersion`, so a later terms
  publish does not rewrite history (FR-33).
- **Visitor.** `visitorName` is 1–128 characters. `visitorPhone` is normalised by the phone contact
  rule (digits only) and hashed with HMAC-SHA-256 under `VISITOR_PHONE_PEPPER`; only the hash is
  stored. The raw phone MUST NOT be stored, returned, logged or cached, and no member row is created.
- **Idempotency.** `idempotencyKey` is globally unique. The "identical payload" test compares the
  canonical request: the member number or the visitor name plus the phone hash, `offeringId`, `eventId`,
  `sessionDate`, `amountMinor`, the currency after defaulting, `channel`, and the status after
  defaulting. An identical repeat returns the stored contribution with `200` and the same `reference`; a
  different payload under the same key is `409 idempotency_conflict`. A concurrent duplicate resolves
  through the unique index and the same re-read.
- **Reference.** The server generates a unique `reference` (`MR-` plus ten uppercase base32 characters)
  on creation and returns it as the visitor's receipt. It is never client-supplied.
- **Read.** `GET /v1/contributions?memberNo&offeringId&eventId&from&to&limit&cursor` lists
  contributions newest first as `{ items, nextCursor? }` with `Cache-Control: no-store`. Visitor rows
  expose `visitorName` only — never the phone or its hash.
- **Totals.** `GET /v1/contributions/summary?from&to` requires both bounds and returns
  `{ from, to, items: [{ currency, memberCount, memberPaidMinor, visitorCount, visitorPaidMinor }] }`,
  counting only `status = 'paid'` and grouping by currency. `memberCount`/`visitorCount` are the number
  of paid contribution rows, not distinct givers. Member and visitor totals are separate and no member
  name, contact value or phone hash appears.

### V3 phase 3 — pledges and reminders (ticket 22)

Ticket 22 records pledges against an existing offering and their reminder records; the landing, the
offerings UI and the USSD/gateway flows are tickets 23–24. A pledge is **never an offering**: it
references an offering attached to the event and never creates one.

- **Create.** `POST /v1/pledges` takes `{ memberNo, offeringId, eventId, sessionDate?, amountMinor,
currency?, expectedOn, followUpOfficerMemberNo?, officerReason?, idempotencyKey }`. The member exists,
  is active and not purged (`404`). The offering exists (`404`), is active (`422`) and is actively
  attached to the event or its series (`422 offering_not_on_event`); the pledge records the current
  `termsVersion`. The event exists (`404`) and is not cancelled or archived (`409 event_not_active`);
  `sessionDate` is optional but, when present, MUST be one of the event's sessions and not a cancelled
  one (`422 session_not_in_event`). `amountMinor` is positive; `currency` defaults to the terms
  currency and MUST equal it. `expectedOn` MUST not be before today (UTC) (`422 invalid_expected_date`)
  and MAY be after the offering's expiry. The pledge is dated by `sessionDate`, else today (UTC), and
  that date MUST be on or before the effective expiry (`422 offering_expired`); pending pledges
  themselves survive expiry. The pledge starts `pending`.
- **Idempotency.** `idempotencyKey` (1–128 characters) is globally unique. An identical canonical
  payload returns the stored pledge with `200`; a different payload under the same key is `409
idempotency_conflict`; a concurrent duplicate resolves through the unique index and a re-read. The
  three default reminders are created once, inside the creating transaction.
- **Officer.** A supplied `followUpOfficerMemberNo` MUST be an active presbyter and wins over the
  shepherd; `officerReason` is an optional note of 1–500 characters, accepted with or without a supplied
  officer and stored in the pledge's `reason`. Without a supplied officer, the member's active shepherd is
  used. If neither exists, `422 officer_required`. A `created` event is appended with the actor.
- **Honor, dishonor, reassign.** `POST /v1/pledges/{id}/honor` appends `honored`;
  `.../dishonor` requires `{ reason }` and appends `dishonored`; `.../reassign` requires
  `{ officerMemberNo, reason }`, validates an active presbyter and appends `reassigned` with
  `fromOfficerMemberNo`/`toOfficerMemberNo`, so both officers stay in history (FR-34). A terminal pledge
  (`honored` or `dishonored`) rejects another transition with `409 pledge_already_terminal`. A pending
  pledge MAY be honored after the offering's expiry; the expiry gate never applies to honor.
- **Overdue.** `overdue` is derived on read (`status = 'pending'` and `expectedOn` before today, UTC);
  it is never stored. The list accepts it as a `status` filter value and computes the same predicate.
- **List.** `GET /v1/pledges?status&memberNo&officerMemberNo&from&to&limit&cursor` returns
  `{ items, nextCursor? }`, newest first, with `Cache-Control: no-store`. `from`/`to` filter
  `expectedOn` (inclusive).
- **Reminders.** Creation automatically writes three `sms` reminders inside the same transaction: 7
  days before `expectedOn`, on it, and 7 days after. A reminder whose date is before today (UTC) at
  creation is written `cancelled` and is never sent; the others are `pending`. `POST
/v1/pledges/{id}/reminders` adds `{ scheduledFor, channel }` (both required); a duplicate
  `(pledge, scheduledFor, channel)` is `409 conflict`, and a `scheduledFor` before today (UTC) is `422
invalid_reminder_date`. `GET /v1/pledges/{id}/reminders` lists them.
  Reminders are records only: the pending ones stay `pending` in V3 and cancelled ones never send.
  Delivery is out of scope (OS-5), and the member-level opt-out preference is deferred to the delivery
  round.
- **Append-only.** Pledges are never deleted; every transition is a `pledge_events` row with actor,
  timestamp and reason.

### V3 phase 4 — church offerings landing (ticket 23)

Ticket 23 builds the landing at `#/events/offerings` behind the existing session connect gate (Q9).
The mock at local `mockups/v2-events/05-offerings-landing.png` (git-ignored) is the layout reference;
its divergences are recorded in the ticket 23 grill table below. The landing makes one new totals
request — `GET /v1/offerings/summary?from&to`, whose endpoint row moves from `proposed` to ticket 23
(23-Q1, the named §17 pre-authorisation for that wire addition) — and reuses the existing events list
(for the USSD preview) and the existing pledges list (the worklist below).

- **Window.** The default window is the current UTC calendar year to date; the operator adjusts it
  with the existing `DateWindowControl` (23-Q5).
- **Headline cards.** Member-only money totals — paid, pledged and outstanding — plus the pledge
  counts (pending, honored, dishonored, overdue) and the Visitors card. The mock's "All members +
  visitors" footer row repeats the card numbers and is a drafting error; the by-member footer is
  relabelled member-only (23-Q10). Visitor figures come from the summary's `visitors` block (R1):
  `visitors.count` is the number of paid visitor contribution rows in the window and
  `visitors.paidMinor` their sum in the reporting currency. `GET /v1/contributions/summary` remains
  the ticket-21 member/visitor split by currency, not the landing's source.
- **Currency.** The largest paid currency in the window is the reporting currency; money in other
  currencies is excluded from the totals and recorded in this spec rather than converted (23-Q8;
  precedent: the member summary in `src/repos/members.ts`). The same rule filters the visitor block.
- **Measures.** `totalPaidMinor` is paid member contributions in the window. `totalPledgedMinor` is
  every pledge meeting the relevance predicate below that is not dishonored, with its status as at
  the report date — `min(to, today)` — read from `pledge_events.at` rather than the current status,
  with the boundary inclusive (`at < report date + 1 day`). `totalOutstandingMinor` is the stored
  `pending` set as at the report date (pending plus overdue-derived items), so
  `pledged = outstanding + honored` holds by construction. `offeredCount` is dropped. For a relevant
  pledge settled by a contribution, the money counts once in paid (through the contribution) and once
  in pledged (as the promise); a pledge outside the relevance predicate counts in paid only (R2, R7).
- **Pledge relevance.** A pledge counts in the window when `expectedOn` falls inside it, or when it is
  still `pending` as at the report date with `expectedOn` before `from`. The predicate feeds the
  headline cards and the by-member table; the pledge worklist below is not windowed (23-Q9, R3).
  Pledged and outstanding are as at the report date, paid is window-only.
- **By-member table.** The top 10 members by paid, tiebroken by member number. Columns are member
  number and name only (no contact values), paid, pledged, outstanding and last given (the member's
  latest paid contribution `session_date` inside the window — never null when paid > 0, matching the
  `lastAttendedOn` precedent). There is no Follow-up column, and the mock's "Top 6 shown" caption
  differs from the decided top 10; both divergences are recorded in the grill table (23-Q4, R6).
- **Pledge worklist.** "Pledges and follow-up" reads `GET /v1/pledges` with no window filter, newest
  first, the returned rows rendered as-is (pending, overdue, honored and dishonored alike) and bounded
  by the route's limit; the caption states the worklist scope, not the window. Columns are member,
  offering, amount, expected date, officer, status and next reminder. The member, officer and offering
  names come from the new `memberName`/`officerName`/`offeringName` fields on the pledge list rows
  (R5, whose acceptance is the named §17 pre-authorisation for that addition). The card counts are
  window-scoped and are not the worklist's row count (R3). The card counts are as at the report date,
  while the worklist's derived `overdue` badge is as at today, so the two can differ when `to` is
  earlier than today.
- **By-event totals** come from the summary's `events[]` (23-Q2); the landing reads only
  `summary.members[]`, `summary.offerings[]` and `summary.events[]`, and reuses the events list solely
  for the USSD preview (event and offering names, the current/next event). The events list and event
  detail return FR-29 `stats` zeroed (`src/repos/events.ts`), the event detail's attached-offering rows
  zero their money fields (`src/repos/offerings.ts`), and the offering detail has no `stats` field; the
  landing must not render them. Real FR-29 stats on those screens are a backlog row, not this ticket
  (R8).
- **Terms dialog.** Renders `GET /v1/offerings/{id}/terms` client-side, including the gateway account
  and metadata the contract already returns; the browser holds no gateway secret.
- **USSD preview.** Composed in the browser from the events list and the ticket 24d format helpers:
  at most five offerings plus `0 More` (Q7b).
- **Pledge follow-up.** Reassignment reuses `POST /v1/pledges/{id}/reassign` with the existing
  `ReasonDialog`; no new endpoint.
- **Deferred:** the mock's `+ Add offering` button (23-Q6) and the Reminders card — scheduled,
  overdue, opted out (23-Q7) — are backlog entries, not this ticket. Materialising these totals in a
  summary table or a NoSQL read model, and the pub/sub mechanics around it, is parked in the backlog
  for a later round (owner, 2026-11-07); Redis is parked for the MVP release (owner, 2026-11-08), so
  MVP ships on compute-on-read. This round reads the source tables and adds no aggregate
  store or migration.

### V3 phase 5 — offering cash counts and announced gifts (MVP, 2026-11-08)

The MVP adds the operator's **bulk offering capture**: the physical cash counted after a service, per
event, offering and session, entered by denomination. It follows the headcount pattern — an
append-only observation with an `asOf`, corrected by a superseding row — and stays separate from
member/visitor contributions and pledges.

- **Scope.** A count belongs to one event instance + offering + session date; multiple observations may
  exist for the group, and `current` is the newest non-superseded observation by `asOf`, then
  `recordedAt`, matching headcounts. `lines` are denomination amounts in minor units with a positive
  piece count; `totalMinor = Σ(denominationMinor × pieces)`, and the count snapshots the offering's
  `termsVersion`. The offering's current terms currency is the count currency; a different currency is
  rejected. A count for an offering not attached to the event is rejected (`offering_not_on_event`), a
  session date outside the event's sessions is `session_not_in_event`, and a cancelled session date is
  rejected (`event_not_active`), matching contributions.
- **Capture.** `POST /v1/events/{eventId}/offering-counts` with `{ sessionDate, offeringId, currency?,
lines, asOf?, supersedesId? }` (bearer, `no-store`) returns `201` with the created observation. A
  plain POST appends a new observation and defaults `asOf` to now; it must fall within the session day
  in the event timezone. A correction carries `supersedesId`, which must name the group's current
  non-superseded row — unknown, already-superseded, other-group or second-supersede targets are `422
validation_error`. A correction keeps the corrected row's `asOf`, replaces its lines, and leaves the
  earlier row readable and valid for its `asOf`. An all-zero count (zero total) is rejected — unlike
  headcounts, which allow all-zero. The list route is the sole read target; there is no item GET.
- **Read.** `GET /v1/events/{eventId}/offering-counts?sessionDate=&offeringId=` (both required) returns
  `{ current, observations }`; `observations` includes the current row and the superseded history,
  newest first, with `supersededBy` derived from the unique superseding row.
- **Member-announced gifts.** The operator records an announced member contribution through the
  existing `POST /v1/contributions` (`channel: manual`) and a pledge through the existing
  `POST /v1/pledges` (member, offering, amount, `expectedOn`, follow-up officer). Neither route changes,
  and neither is tied to the cash count.
- **Reconciliation.** The landing keeps the recorded member/visitor gifts and adds the counted cash and
  the variance: `countedMinor` on the summary and on every `offerings[]`/`events[]` row, and
  `varianceMinor = countedMinor − (totalPaidMinor + visitors.paidMinor)` on the summary. `countedMinor`
  sums **only the current observation** of each group, windowed by `sessionDate`, so the superseded
  history is never added; counts in another currency are excluded from the reporting-currency totals,
  matching 23-Q8. The variance is captioned "cash counted − all recorded gifts" and includes every paid
  channel (`app`/`ussd`/`manual`), so it is a reconciliation indicator, not a cash-only variance. A
  positive value means counted cash exceeds recorded gifts; a negative one means the reverse. Counted
  cash is never added to recorded gifts (no double counting).
- **UI.** `#/ussd/offerings` sits beside Headcount: the shared event/session picker, an offering
  selector, the current observation, a single-pass **denomination grid**, a live total,
  record/correct, the observation history, plus the announced-gift and pledge forms and the
  offering's terms link. The grid shows one number input per configured denomination, notes before
  coins and descending within each group, so every value is on screen before any number is typed;
  blank means not counted. GHS notes are 200, 100, 50, 20, 10, 5, 2 and 1 and coins are 0.50, 0.20,
  0.10 and 0.05 (the 1 and 2 cedi coins collapse into the note group and are not listed separately). A
  free-form add covers a one-off non-standard value (a withdrawn note or an odd lot; foreign cash is a
  different currency and is out of scope for a single-currency count) and never joins the catalogue; a
  value that matches a configured row merges into it (sums the piece counts), and one that matches a
  hidden row is pinned as a one-off. A currency with no catalogue, or with every denomination hidden,
  shows no grid but keeps free-form rows, and the message names which condition applies. On a
  correction, an observed line whose denomination is hidden by the configuration or absent from the
  catalogue re-renders as a pre-filled, editable free-form row (pinned as a one-off) and submits with
  the correction unless the operator blanks it; blanking removes the line. The API keeps no
  denomination whitelist, so the catalogue narrows the grid only in slice A (the slice B setting
  narrows it the same way) and never rejects a value. The offerings landing (`#/events/offerings`)
  stays read-only and gains the counted/variance figures.

#### Denomination entry and ordering (2026-11-09)

The owner accepted this amendment from the grill round. Decisions, with the rejected options:

- Entry is one pass: an always-visible grid of number inputs, not click-to-add rows. Rejected: a
  second "type the counts" mode; keeping add-a-row and reordering only the buttons.
- The catalogue is per-currency data (`minor`, kind, default order, default enabled), seeded in code
  for slice A and overlaid by the register setting in slice B. Rejected: one flat GHS constant; a
  server-only catalogue before slice B.
- The setting is one ordered list per currency, each entry `{denominationMinor, enabled, position}`;
  hidden and ordered-last are distinct. It is register-wide and server-backed in slice B. Rejected:
  browser-local settings (per-device); per-offering settings (drift); separate enable and order lists.
- The setting is UI-only; `POST` keeps accepting any positive `denominationMinor`. Rejected: API
  rejection, which would break corrections and the replay of existing observations.
- Custom values stay one-off rows and never change the catalogue. Rejected: dropping free-form entry;
  promoting a custom value into the order.
- A currency with no catalogue shows free-form only and names the condition. Rejected: a generic
  1-2-5 ladder.
- The slice B admin screen is `#/admin/offering-denominations`, linked from Settings, not a panel on
  the browser-local Settings page and not inline on the counting page.
- Delivery is split: slice A is the grid (UI-only, no migration or wire change); slice B is the
  server-backed setting, parked behind 24e and taking migration `0019`. Rejected: one round with the
  migration; settings first.
- Default order is notes before coins, descending within each group, for every currency from its
  catalogue. A value that exists as both note and coin (1 and 2 GHS) appears once, in the note group.
- `0.01` is not seeded until the live Bank of Ghana set is confirmed; if it is confirmed, it enters
  catalogue-only and hidden by default.
- **Migration.** `0017_offering_counts`; 24e's expected migration moves to `0018`.

### Navigation

| Top-level | Submenu         | Route                    | API                                          | Slice |
| --------- | --------------- | ------------------------ | -------------------------------------------- | ----- |
| Events    | Events          | `#/events`               | `GET /v1/events` (proposed)                  | E1    |
| Events    | Series          | `#/events/series`        | `GET /v1/series`                             | E2    |
| Events    | Offerings       | `#/events/offerings`     | `GET /v1/offerings/summary` (ticket 23)      | O4    |
| Events    | Event detail    | `#/events/:eventId`      | `GET /v1/events/:eventId` (proposed)         | E1    |
| Events    | Series detail   | `#/events/series/:id`    | `GET /v1/series/:id` + summary + occurrences | E2    |
| Events    | Offering detail | `#/events/offerings/:id` | `GET /v1/offerings/:id` (proposed)           | O1    |

The current **Attendance** top-level is replaced by **Events**; attendance recording is an action on
an event/series detail, and attendance imports stay under **Imports**. If the owner prefers to keep a
separate Attendance section, that is Q1.

## Users and Jobs

| User              | Job                                                               | Surface                  |
| ----------------- | ----------------------------------------------------------------- | ------------------------ |
| Administrator     | See which series met, what was imported and who attended          | Events, Series           |
| Administrator     | Add a schedule version, cancel or add a date, archive a series    | Series detail            |
| Administrator     | Import an attendance registry and confirm the batch               | Imports -> event/series  |
| Ministry leader   | Review event attendance and offering totals                       | Event detail             |
| Member            | Give to one or more offerings, or pledge with an expected date    | USSD (future)            |
| Presbyter         | Follow up pledges assigned to them and report the outcome         | Offerings / pledges      |
| Pastor / auditor  | See offering totals by member, event and offering; honor/dishonor | Offerings landing        |
| Finance / gateway | Receive terms of reference and reconcile payments                 | Payment gateway (future) |

## Functional Requirements

`MUST` / `MUST NOT` / `SHOULD` / `MAY` follow RFC 2119.

### Events and series

- FR-1: The shell MUST add an **Events** top-level section with Events, Series and Offerings
  (upcoming) submenus; the current Attendance screen MUST become an event/series action rather than a
  duplicate calendar.
- FR-2: The events list MUST request a date window and show event name, date range, series/standalone,
  ministry, venue type/name, status (`held`, `upcoming`, `cancelled`), per-date attendance summary and
  offering summary.
- FR-3: Event status MUST be derived by the API; the UI MUST NOT classify an event by comparing dates
  locally.
- FR-4: Selecting an event MUST open `#/events/:eventId` with the event detail: name, date range,
  start time, venue, series/standalone, status, per-date attendance, imported-row source and the
  read-only Active offerings panel (FR-39).
- FR-4a: An event session written with `status = 'cancelled'` MUST carry a non-empty reason in
  `sessions[].note`; the API rejects one without it with `422 reason_required`. A legacy row without a
  reason is displayed as "No reason recorded".
- FR-4b: The event detail MUST show, per session, the latest capture's time and whether it ended the
  session — "Live · 11 Nov 10:42" while the session's window is current, "Not started · 11 Nov 10:42" for
  an open session on or after today whose window has not begun, "Past session · 11 Nov 10:42" for an open
  session whose window has passed, or "End of session · 11 Nov 11:05" once ended. The day is always shown
  because the closing capture may fall on a later day, and the stamp is the event timezone's wall clock
  with no zone suffix (the header names the zone), never the browser's. The time and ended-ness come from
  the session's `capture` field (the latest capture of either channel, import or headcount); the
  live/not-started/past split is computed from the session's date and start/end window against the clock
  in the event timezone, per the live definition in the API spec's import section. A session with no
  capture shows "No capture yet", and a
  cancelled session never shows "Live"; one that is not ended shows "Cancelled · 10:42 GMT" with its
  capture time. The UI MUST NOT read a stored live flag or ask the operator to
  declare "live".
- FR-5: The series list MUST use `GET /v1/series` and show name, ministry, a human-readable schedule,
  next occurrence and archived state.
- FR-6: The series detail MUST show each schedule version (`effectiveFrom`, `rrule`, `endsOn`),
  exceptions (`cancelled` / `extra`), a date-window occurrence list and the attendance/offering
  summary for the series.
- FR-6a: The summary MUST come from **one** request, `GET /v1/series/{id}/summary?from&to`. `from` and
  `to` are required UTC dates with `from <= to` (400 otherwise); an unknown series answers 404; the
  response is `no-store`. The UI MUST NOT build the summary by summing the paginated events list, the
  church-wide offering summary or per-offering reads (NFR-1, NFR-5).
- FR-6b: The summary window is the page's single UTC `from`/`to`, shared with the occurrence list;
  attendance and offering money are bounded by it. "Today" is the date in the **series timezone**
  (FR-12). The Occurrences tile is the count of dates the schedule generates inside that window — the
  same list the occurrence table renders (cancelled exceptions removed, extras added) — so an
  unbounded series (no `endsOn`) never has a lifetime total. `nextOccurrence` is the first generated
  date on or after that today, capped at 90 days, and null when there is none. `lastHeld` is the latest
  held **member-tracking** session inside the window.
- FR-6c: A session is **held** when its date is on or before today in the series timezone and neither
  the session nor its event is cancelled or archived; **upcoming** when its date is after that today;
  **cancelled** when the session or its event is cancelled or archived (the `scopedSessions` predicate
  in `src/repos/members.ts`; the stored session status records cancellation, never the clock). The
  attendance ratio is `present / expected` over **held** sessions of member-tracking events in the
  window, where `expected` is the register count for that date under the event detail's rule
  (`joined_on <= date`, not archived, not purged, and presbyters only for a `presbyter_only` event) and
  `present` is the attendance-row count. `cancelled` and `upcoming` are reported as counts and excluded
  from the ratio. Held headcount-only sessions are reported as a count in their own block and never
  enter the ratio; no expected headcount exists, so none is invented. The ratio is null when
  `expected` is 0.
- FR-6d: The summary's offering money reuses the church-summary semantics scoped to the series: the
  largest paid currency in the window is the reporting currency, counted cash is reported beside the
  gifts and never added to them, pledges are as at `min(to, today)` with today in the series timezone,
  and visitor gifts are reported separately.
- FR-6e: The summary MUST render as four tiles above Schedule versions: **Next occurrence** (the date;
  caption "None in 90 days" when null), **Occurrences** (the window count; caption "in this window"),
  **Attendance** (the ratio as a percentage; caption "{present} of {expected} on {lastHeld.date}", or
  "No held sessions in this window"), and **Offerings** (the attached count; caption "{currency} {paid}
  paid this window", or "No offerings attached"). The attached count is the number of active
  attachments made to the series itself; offerings attached per event are not counted. An archived
  series still shows the tiles, read-only (AC-10). The mock's attached-offerings rail and the
  per-occurrence attendance/offering columns are separate queued work, not part of this requirement.
- FR-6f: An attendance import MUST be a capture. The page MUST show the computed state — "Live · recorded
  10:42" with one **End of session** action while live, "Not started - this capture will end it" for an open session on or after today whose window has not begun, "Past session — this capture will end it" for an
  open session whose window has passed, or "End of session · recorded 11:05" once closed with the action
  disabled; with no capture yet the state shows without a time — "Live", "Not started — this capture will
  end it" or "Past session — this capture will end it". It MUST NOT ask the
  operator to choose "live". An import capture outside the live window is the end capture (a headcount never auto-ends), live captures may
  repeat, and after the close the page MUST refuse another capture with the API's `409 session_closed`. A cancelled session is read-only and offers no capture.
- FR-7: “Add schedule version”, “Add exception”, “Remove exception” and “Archive series” MUST use the
  documented series endpoints. A `cancelled` exception MUST carry a non-empty reason in `note`; the API
  rejects one without it with `422 reason_required`. Archive MUST confirm; the API preserves history
  and does not hard delete.
- FR-8: “Import attendance” MUST appear on the series detail and on a series-backed event's detail,
  and MUST link to the existing import flow. A standalone event MUST NOT offer it. The link carries
  `event=<id>` from an event and `series=<id>` from a series; `date` stays optional. After a successful
  batch the events, series and imports queries MUST be invalidated (AC-7). The API refuses an import
  for a standalone event with `422 series_required` (API spec).
- FR-9: An event MUST show all offerings attached to it (two or more) in the read-only Active
  offerings panel. This data MUST come from the event aggregate or the offerings API; the UI MUST NOT
  aggregate contributions client-side from partial pages.
- FR-10: The event attendance report MUST show present/expected per event date and, when the API
  supports it, the member rows for that date with `import`/`manual` source. If the report endpoint is
  unavailable, the UI MUST show “attendance report not available” plus the imported-row count; it MUST
  NOT invent absent members.
- FR-11: Event attendance stats MUST be one aggregate request per event (or page), not one request per
  member. A multi-day event MUST keep attendance per `session_date`.
- FR-12: All dates are UTC calendar dates. A series `timezone` is the only override for deciding
  “today” for that series; the UI formats but never shifts dates.
- FR-13: Archived series and cancelled events are read-only: no attendance recording, no offering
  attachment, no new contribution.
- FR-15: An event MUST record `venue_type` as `auditorium`, `virtual` or `hybrid`, and an optional
  venue name. The venue MUST appear in the list and detail and may be inherited from the series when
  the event is generated.
- FR-16: A standalone event MUST NOT require a dummy series. `series_id` is nullable; generated events
  keep the series link. `event_no` is unique and is the key used by imports.
- FR-17: Visitors MUST be able to give with name + phone and receive a receipt/reference without a
  member record; visitor totals MUST be aggregated separately from member totals.
- FR-18: A pledge MUST use the member's active shepherd as follow-up, or the active presbyter an
  administrator supplies with a reason; if neither exists it MUST be rejected with `422
officer_required`. An administrator MAY assign at creation or reassign later with a reason.
- FR-19: An offering's display name MAY be omitted; it then falls back to `${event.name} · ${kind}`.
  Special offerings MAY carry a custom name. `availableUntil` is the event end or an explicit date;
  expiry blocks new gifts but MUST NOT block honoring a pending pledge.
- FR-41: The USSD menu MUST show the current/next active event and at most five offerings plus a
  “More” option, so the member is not asked to page through the full catalogue. Visitors identify with
  name + phone.
- FR-42: An event MUST carry `tracksMembers` (boolean, default true; optional on create/update, exposed
  in list and detail, and included in the ETag). When false (headcount-only), per-member attendance
  writes, attendance imports, USSD clock-ins and one-time attendance codes MUST be rejected with `422
headcount_only` (a closed event or session still answers its own `409`/`422` first), while expected
  headcounts remain allowed. An event's ministry is its series' ministry; a standalone event is
  general. The profile counts general events and events whose ministry the member belongs to.
- FR-43: The system MUST record an offering cash count per event, offering and session as an
  append-only observation of denomination lines (`denominationMinor × pieces`), corrected only by a
  superseding row that names the current observation; the landing MUST report the current counted cash
  and the variance against all recorded gifts without adding the two together.

- FR-14: Every events/series surface MUST implement loading, empty, error and success states and map
  `401`/`404`/`409`/`422` as the shell spec does.

### Offerings

- FR-20: An **offering** MUST have a versioned terms-of-reference: name, purpose/description, kind,
  currency, target amount (optional), start/end dates, active flag and payment-gateway metadata.
- FR-21: Amounts MUST be stored as integer minor units with an explicit currency; the UI MUST NOT use
  floating-point arithmetic. The default currency is GHS; Q3.
- FR-22: An event MUST support two or more attached offerings. An offering MAY be attached to a
  series (all its occurrences) with date-specific exceptions.
- FR-23: An **offering exception** MUST be able to skip an offering on a series day (cancelled or
  otherwise), and an extra occurrence MUST be able to opt in. Exceptions are additive history, never
  destructive edits.
- FR-24: Any active member MAY give to an attached offering. Archived or purged members MUST NOT
  create new contributions; their historical contributions and pledges remain readable.
- FR-25: A **contribution** MUST record member, offering, event, amount, currency, channel
  (`app`/`ussd`/`manual`), status (`initiated`/`paid`/`failed`), gateway reference and timestamps.
  Creation MUST be idempotent by an idempotency key.
- FR-26: A **pledge** MUST record member, offering, event, amount, currency, expected date, follow-up
  officer (an active presbyter), status (`pending`/`honored`/`dishonored`) and a reason for any
  dishonor. The follow-up officer is required.
- FR-26a: The operator UI **MUST** identify the member with the shared member picker (search by member
  number or name parts — never contact values, per `member-registrations-api.md` FR-31a — showing the member's
  name), for a contribution, a pledge and the pledge's follow-up officer. The officer must still satisfy FR-26
  (an active presbyter); the picker shows the member's name and the API's `422 officer_required` remains the
  backstop. A free-typed member number **MUST NOT** be the only way to name a member: the API's `404` for an
  unknown number is a backstop, not the interaction. Only **picking an option** sets the member number — typed
  text alone never becomes the selection — and an empty result says so ("No matching members"), while an
  unreachable search says the search is unavailable rather than looking empty.
  Once a member is picked, the pledge form **MUST** show that member's follow-up default, read from
  `GET /v1/members/{memberNo}/shepherding` (`shepherd: … | null`). The default is the **active shepherd**,
  using the same predicate the pledge applies when it resolves the officer — the assignment's member
  `is_presbyter`, not archived, not purged — so a summary shepherd that fails it **MUST** be shown as _no
  active shepherd_; otherwise the form names someone the API will refuse, which is the failure this paragraph
  exists to prevent. The read follows FR-14's states, evaluated as **one state** over the follow-up
  evidence — today the shepherding summary plus, where it names a shepherd, that shepherd's member detail, and
  tomorrow whatever single value supplies the same answer; the _states_ below are the contract, not the request
  sequence: while no read has
  completed for the picked member the officer field is disabled with a loading hint and submit is refused, and
  a failed read says the default is unavailable and requires an officer rather than silently dropping the
  requirement. The hint **MAY** render as the field's hint line; the loading hint, the no-active-shepherd
  statement and the failed-read statement **MUST** be announced to assistive technology — by any association the
  control or its validation exposes (an associated description, a field validation message, an error
  association) where the control can receive focus, or by a live-region announcement where the control is
  disabled and therefore unreachable — because a disabled control with an unannounced reason is not a state,
  it is a dead end. Decorative status adornments, such as a badge or a static caption, carry no such
  obligation. With an active shepherd the officer field stays **optional** — an empty field means "that
  shepherd", which the API persists as the follow-up officer — and without one it becomes **required**, so the
  API's `422 officer_required` is not the first the operator hears of it, except in the stale-read race
  described below. Supplying an officer **MUST NOT** require a justification, and an officer **MAY** be named
  explicitly even when a shepherd exists. The pledge **MAY** carry an **optional note for whoever follows up**
  (trimmed, 1-500 characters) — an instruction such as a day or a time, accepted with or without an explicit
  officer, stored with the pledge and never required; it is not the audit reason reassignment demands. The
  requirement is evaluated **at submit
  against the latest completed read** — never against the state when the member was picked, and never by
  waiting on a fresh request, so a submit never depends on a network round trip. Focus and mount refetches are
  permitted and simply become the latest completed read; there is no maximum age, because the rejection path is
  the staleness answer. Both officer rejections are in scope — `422 officer_required` when there is no default
  and none was supplied, and `422 validation_error` when the supplied member is not an active presbyter or the
  reason is missing — and the form **MUST** route either to the officer field's own error rather than to a
  generic failure. Showing the absence is the point: the operator learns the member has no shepherd before
  submitting, not after — the one exception being a summary that moved between the last read and the submit,
  which the rejection path answers. Each option **MUST** carry the picker's compact identity
  variant of the UI spec's FR-22a — `M-1042 · Adjoa Mensah (M, 12y)` — so two members with the same name stay
  distinguishable; the variant, its codes and its month boundary are defined there, not here.
- FR-27: Pledges MUST be honored when paid, or dishonored with an explicit reason. Honors and
  dishonors MUST be append-only events with actor and timestamp; a pledge MUST NOT be hard-deleted.
- FR-28: Pending and overdue pledges MUST be eligible for reminders. A reminder MUST record pledge,
  scheduled time, channel, sent time and status. The same pledge/date/channel MUST NOT be reminded
  twice.
- FR-29: An event MUST expose offering stats: attached count, total pledged, total paid, outstanding
  and honor rate, from the API.
- FR-30: The church offerings landing MUST show totals by member, offering and event, plus pending,
  honored and dishonored pledges. Financial visibility MUST follow Q9.
- FR-31: The USSD flow MUST let a member identify, choose one or more active offerings, combine the
  total, pay or pledge with an expected date, and receive a confirmation code. Sessions expire; a
  repeated request MUST be idempotent.
- FR-32: The future payment gateway integration MUST send the offering terms of reference and receive
  a callback that reconciles the contribution. The app MUST NOT store card data or gateway secrets.
- FR-33: Terms of reference MUST be versioned. A change after an event/offering has contributions MUST
  create a new version; historical contributions keep the version they were made under.
- FR-34: A pledge follow-up officer MUST be reassignable to another active presbyter with a reason;
  the old and new officer remain in the history.
- FR-35: Contributions, pledges and pledge events MUST be append-only. Refunds/corrections are new
  records, never destructive edits.
- FR-36: Offering attachment MUST be possible only on an active event/series; cancelled, archived or
  past events MUST reject new attachments.
- FR-37: A pledge expected date MUST NOT be in the past when created; overdue is a status derived from
  the date, not a manual edit.
- FR-38: The USSD/payment flow MUST reject zero/negative amounts, unsupported currencies, expired
  sessions and offerings not attached to the selected active event.
- FR-39: Selecting an active event MUST display every offering attached to it in a read-only **Active
  offerings** panel — active meaning not detached; an expired attachment remains listed and marked —
  with the resolved name, kind, currency, effective available-until, status, the current terms version
  (from the event aggregate's `EventOffering.terms.version`) and a **View terms** action (reusing
  `GET /v1/offerings/{id}/terms`). The terms view carries the default amount; the full offering detail,
  including its per-date exceptions, is O1 post-MVP.
- FR-40: The church landing MUST be usable without exposing individual contact data; member totals
  show member number/name only, not phone/email.

## Non-Functional Requirements

- **NFR-1 Financial accuracy** — Integer minor units; no floating-point money. Totals reconcile to
  the sum of contributions and honored pledges. A one-cent discrepancy is a defect.
- **NFR-2 Idempotency** — Contribution and pledge creation, USSD retries and gateway callbacks MUST
  be idempotent by a client key/reference.
- **NFR-3 Audit** — Every honor, dishonor, reassignment, refund and terms version records actor,
  timestamp and reason. Reads of member totals are not audited in v3 (Q9).
- **NFR-4 Privacy** — Financial data is personal data. No card data, no gateway secret in the bundle,
  no contribution values in logs or web storage. The landing page obeys Q9.
- **NFR-5 Performance** — Event and offering aggregates MUST be batched; 100 events MUST page and
  render without N+1. The USSD flow SHOULD answer within the aggregator timeout (Q7).
- **NFR-6 Security** — USSD sessions are short-lived and bound to the member/phone; payment callbacks
  are signature-verified; no card data is handled.
- **NFR-7 Reliability** — Gateway timeouts leave a contribution `initiated`, never `paid`. A callback
  can be retried safely. Reminder failure is recorded and retried per policy.
- **NFR-8 Compliance** — Reminders respect opt-out and quiet hours; the USSD flow shows the amount and
  confirmation before charging.
- **NFR-9 Testability** — Vitest + RTL + MSW for the screens, and contract tests for contribution,
  pledge, reminder and gateway idempotency. No test touches real money.
- **NFR-10 Observability** — Log counts and statuses, never amounts tied to a member or contact
  values. Alert on gateway failures and reminder backlog.
- **NFR-11 Accessibility** — WCAG 2.2 AA; event/series tables, dialogs and the offerings landing are
  keyboard and screen-reader usable.
- **NFR-12 Rollout** — Events/series V2 ships first. Offerings V3 is feature-flagged; the mock is a
  target, not a production surface.

## Acceptance Criteria

### AC-1: **Given** the Events top-level, **When** it loads, **Then** Events, Series and Offerings (upcoming) are the submenus, and the old Attendance calendar is not duplicated. (FR-1)

### AC-2: **Given** a date window, **When** the events list loads, **Then** it shows held/upcoming/cancelled/extra occurrences with series, ministry, attendance and offering summaries from the API. (FR-2, FR-3)

### AC-3: **Given** an event row, **When** it opens, **Then** the detail shows series, date, status, present/expected, imported-row source and the read-only Active offerings panel (name, kind, currency, effective available-until, status, terms version from the aggregate, View terms reusing the terms route; expired marked). (FR-4, FR-9, FR-39)

### AC-4: **Given** the series list, **When** it loads, **Then** each series shows a human-readable schedule, next occurrence and archived state. (FR-5)

### AC-5: **Given** a series detail, **When** it opens, **Then** schedule versions, exceptions, occurrences and the four summary tiles are visible; the three window figures come from one `GET /v1/series/{id}/summary` request and the Occurrences tile counts the same occurrence list the table renders. (FR-6, FR-6a, FR-6b, FR-6e)

### AC-5a: **Given** a window containing held, cancelled, upcoming and headcount-only sessions, **When** the summary is read, **Then** the ratio counts held member-tracking sessions only, the cancelled/upcoming counts are reported separately, headcount-only sessions never enter the ratio, and the ratio is null when expected is 0. (FR-6c)

### AC-5b: **Given** a window whose events carry paid, pledged, counted and visitor money, **When** the summary is read, **Then** the offering figures follow the church-summary rules scoped to the series (largest paid currency, counted beside gifts, pledges as at the report date, visitors separate); an empty window returns zeros and a null `lastHeld`, and `nextOccurrence` is null when the schedule has no date in the next 90 days. (FR-6d, FR-6e)

### AC-6: **Given** a series detail, **When** the operator adds a schedule version or exception, **Then** the documented endpoint is called and the occurrence list refreshes. (FR-7)

### AC-6a: **Given** a cancelled series exception or an event session written as cancelled, **When** it is submitted without a reason, **Then** the API answers `422 reason_required` and nothing is written; a legacy row without a reason is shown as "No reason recorded". (FR-4a, FR-7)

### AC-4a: **Given** a session with captures, **When** the event detail opens, **Then** its row shows the latest capture's time and whether it ended the session, the time and ended-ness taken from the session's `capture` field (latest of either channel) and the live/not-started/past split computed from the session window in the event timezone, never from a stored live flag; **Given** an open session whose window has passed, **Then** the row reads "Past session · …"; **Given** no capture, **Then** the row reads "No capture yet"; **Given** an open session on or after today whose window has not begun, **Then** the row reads "Not started · …"; **Given** a cancelled session, **Then** the row never reads "Live" and, when the session is not ended, reads "Cancelled · …". (FR-4b)

### AC-7: **Given** a series-backed event or a series, **When** “Import attendance” is chosen, **Then** the import flow opens at `/imports/attendance?event=<id>` seeded with that event, or at `?series=<id>` with the picker filtered to that series (`date` optional), a successful batch invalidates the events, series and imports queries, and a standalone event shows no entry. (FR-8)

### AC-7a: **Given** a live session, **When** an import is captured without ending it, **Then** the page shows "Live" with the capture time and one **End of session** action, and another capture may replace it; **Given** a past open session, **Then** the page reads "Past session — this capture will end it"; **Given** an import captured outside the live window with no prior close, **Then** it is accepted as the end capture and the session closes; **Given** an ended session, **Then** the page shows "End of session" with the action disabled and a further capture is refused; **Given** a not-yet-started open session, **Then** the page reads "Not started — this capture will end it"; **Given** no capture yet, **Then** the state shows without a time; **Given** a cancelled session, **Then** the page offers no capture. (FR-6f)

### AC-8: **Given** an event attendance report, **When** it loads, **Then** one aggregate request returns present/expected and optional member rows; no per-member requests are made. (FR-10, FR-11)

### AC-9: **Given** the attendance report endpoint is unavailable, **When** the event loads, **Then** the UI shows “attendance report not available” and the imported-row count, not fabricated absences. (FR-10)

### AC-10: **Given** an archived series or cancelled event, **When** the operator opens it, **Then** attendance/offering writes are disabled and history is readable. (FR-13)

### AC-11: **Given** an offering definition, **When** it is created, **Then** name, purpose, kind, currency, target, dates, active flag and gateway metadata are persisted with a version. (FR-20, FR-33)

### AC-12: **Given** an active event, **When** two or more offerings are attached, **Then** the event displays all of them; an offering MAY be skipped on a specific series day via an exception. (FR-22, FR-23, FR-39)

### AC-13: **Given** an active member, **When** they give to an offering, **Then** the contribution records amount in minor units, currency, event, session date, channel, status, terms version and idempotency reference. (FR-21, FR-25)

### AC-14: **Given** a member chooses to pledge, **When** the pledge is created without an active presbyter, **Then** it is rejected; with one, it is `pending` with an expected date. (FR-26)

### AC-15: **Given** a pledge, **When** it is honored or dishonored, **Then** an append-only event records actor, timestamp and reason; no hard delete occurs. (FR-27, FR-35)

### AC-16: **Given** a pending pledge, **When** reminders are scheduled, **Then** each reminder has a channel and sent status, and no duplicate is created for the same pledge/date/channel. (FR-28)

### AC-17: **Given** an event, **When** its stats load, **Then** attached count, pledged, paid, outstanding and honor rate come from the offerings API. (FR-29)

### AC-18: **Given** the church offerings landing, **When** it loads, **Then** totals by member, offering and event are visible, with no contact values. (FR-30, FR-40)

### AC-19: **Given** the USSD flow, **When** a member selects several offerings, **Then** the combined total is shown, and payment or a pledge with expected date returns a confirmation code. (FR-31)

### AC-20: **Given** a gateway callback, **When** it is replayed, **Then** the contribution is reconciled once and remains idempotent. (FR-32, NFR-2)

### AC-21: **Given** a pledge follow-up officer, **When** it is reassigned, **Then** the reason and both officers remain in history. (FR-34)

### AC-22: **Given** a past or cancelled event, **When** a new offering attachment is attempted, **Then** it is rejected. (FR-36)

### AC-23: **Given** a series timezone, **When** dates are displayed, **Then** they remain UTC calendar dates, formatted locally; the series timezone is used only to decide “today” for that series. (FR-12)

### AC-24: **Given** an events/series request, **When** it returns 401/404/409/422, **Then** the shell’s connection/not-found/conflict/validation states are applied and no fabricated data is shown. (FR-14)

### AC-25: **Given** an archived or purged member, **When** a contribution or pledge is attempted, **Then** the API rejects it (a contribution with `404`) and historical records remain readable. (FR-24)

### AC-26: **Given** a pledge with an expected date in the past, **When** it is submitted, **Then** it is rejected with an inline date error before any gateway call. (FR-37)

### AC-27: **Given** a USSD/payment commit with a zero amount, unsupported currency, expired session or an offering not attached to the event, **When** it is submitted, **Then** it is rejected before a charge or pledge is created. (FR-38)

### AC-28: **Given** an event, **When** it is created or displayed, **Then** `venue_type` is one of `auditorium`, `virtual`, `hybrid` and appears as a badge in the list and detail; `venue_name` is optional; a series-generated event inherits the default unless overridden. (FR-15)

### AC-29: **Given** the Strategic Conference, **When** it is created standalone, **Then** it has no `series_id`, a unique `event_no`, and three sessions on the `event_instances` row. (FR-16)

### AC-30: **Given** a visitor, **When** they give, **Then** the contribution records name + phone hash, returns a receipt/reference, creates no member record, and appears only in the separate visitor total. (FR-17)

### AC-31: **Given** a USSD pledge, **When** the member's shepherd is active, **Then** that presbyter is the follow-up officer; otherwise the administrator-supplied active presbyter is used; if neither exists the pledge is rejected with `422 officer_required`. An admin can assign or reassign with a reason. (FR-18)

### AC-32: **Given** an offering with no custom name, **When** it is displayed, **Then** the label falls back to the event name + kind; `availableUntil` is event end or the explicit date; after expiry new gifts are rejected but a pending pledge can still be honored. (FR-19)

### AC-33: **Given** a headcount-only event, **When** per-member attendance, an attendance import, a USSD clock-in or an attendance code is attempted, **Then** it is rejected and no per-member row is created, while headcounts still record. (FR-42)

### AC-34: **Given** a current count with lines `20 × 39` and `10 × 40`, **When** it is corrected to `20 × 40` and `10 × 40`, **Then** the current total is GHS 1,200, the earlier observation stays readable and valid for its `asOf`, the landing's `countedMinor` uses only the current observation, and the recorded-gifts total is unchanged. (FR-43)

## Edge Cases

- EC-1: Series has no schedule, or the schedule is archived: show an empty state; do not invent occurrences.
- EC-2: Occurrence is cancelled or extra: status is explicit; attendance writes are disabled for cancelled.
- EC-3: Attendance import contains an unknown `eventname`: all-or-nothing failure with the names.
- EC-4: Event report endpoint is missing: show the imported-row count and an explicit “not available” state.
- EC-5: Event has no offerings attached: show an empty offerings state and “Attach offering” only for active events.
- EC-6: Offering is attached to a series but skipped on a day: the event does not show it that day; the exception is visible in the series detail.
- EC-7: Member is archived/purged: no new contribution/pledge; historical totals remain.
- EC-8: Pledge expected date is past on creation: reject with an inline date error.
- EC-9: Pledge overdue: status becomes overdue/pending per policy; reminder is scheduled; no silent dishonor.
- EC-10: Follow-up officer is not a presbyter or is archived: reject/reassign.
- EC-11: Pledge is honored twice: second attempt is idempotent or `409`; no duplicate event.
- EC-12: Pledge is dishonored after being honored: `409`; create a correction event instead.
- EC-13: Contribution/gateway timeout: `initiated`, retry idempotently; never `paid` without a callback.
- EC-14: Gateway callback arrives twice or out of order: reconcile once by reference; late callback does not overwrite a terminal state.
- EC-15: USSD session expires mid-selection: restart; no partial charge.
- EC-16: USSD selects an offering not attached to the event: reject with the valid offering list.
- EC-17: USSD retries the same confirmation: idempotent; same confirmation code.
- EC-18: Amount is zero/negative, currency unsupported, or minor-unit overflow: reject before gateway.
- EC-19: Reminder job runs twice: unique constraint prevents duplicate; failure is recorded.
- EC-20: Member opts out of reminders: no new reminders; pending pledge remains visible to the officer.
- EC-21: Offering terms change after contributions: new version; history keeps the old version.
- EC-22: Event/series is archived while a contribution is in flight: contribution completes or fails cleanly; no new attachments.
- EC-23: Church landing is opened by an unauthorised actor: shared token still gates it; Q9 decides member-level totals.

## API Contracts

The existing API spec remains authoritative for series, occurrences, members, attendance and imports.
This section defines the event aggregate and the proposed offerings surface. The proposed calls are
GET /v1/events, GET /v1/events/{eventId}, GET /v1/events/{eventId}/attendance?date=,
POST /v1/offerings, POST /v1/contributions and POST /v1/pledges.

### Existing types used by the UI

```ts
export interface Series {
  id: string;
  name: string;
  ministry: { code: string; name: string } | null;
  timezone: string;
  description: string | null;
  archivedAt: string | null;
  schedules: Array<{ effectiveFrom: string; rrule: string; endsOn: string | null }>;
  exceptions: Array<{ date: string; kind: 'cancelled' | 'extra'; note: string | null }>;
}

export interface OccurrenceList {
  seriesId: string;
  from: string;
  to: string;
  dates: string[];
}
```

### Proposed event aggregate

`EventSeries` is the recurring template. `Event` is the dated instance; a series occurrence generates
one event, while a standalone conference is an event with `seriesId = null`. The `sessions` JSONB
array on `event_instances` makes a multi-day event and per-date attendance possible without a child
table. The REST resource is `/v1/events`; the storage table is `event_instances`, and `Event` is the
API resource shape. `EventSession` is the API shape of one session object.

```ts
export type VenueType = 'auditorium' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
export type EventDateStatus = 'scheduled' | 'held' | 'cancelled';

export interface EventSession {
  date: string;
  startTime: string;
  endTime: string | null;
  /** 'held' is reserved and never written to a session; held/upcoming are date-derived (FR-6c). */
  status: EventDateStatus;
  venueType?: VenueType;
  /**
   * The session's capture state. `asOf` is the later `asOf` of the current (non-superseded) headcount
   * observation and the latest import batch (latest by `asOf`, then `createdAt`, then `id`); when the
   * two share an `asOf`, the one with the later recorded time (headcount `recordedAt` vs batch
   * `createdAt`) wins, and if those also tie, the import batch wins. `ended` is the session's shared
   * close state: `true` when any capture for the session (import or headcount, superseded rows
   * included) carries `ended`, `false` otherwise. `asOf` is an ISO-8601 instant, never zone-shifted;
   * the client renders it in the event timezone. Null when the session has no capture. The detail takes
   * the capture time and ended-ness from it and computes live/past from the session's date and window
   * (FR-4b).
   */
  capture: { asOf: string; ended: boolean } | null;
  /** A non-empty reason when the session is cancelled; null on a legacy cancellation. */
  note: string | null;
  present: number;
  expected: number;
  importedRows: number;
  source: 'import' | 'manual' | 'mixed' | 'none';
}

export interface Event {
  id: string;
  eventNo: string | null;
  name: string;
  seriesId: string | null;
  ministry: { code: string; name: string } | null;
  timezone: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string | null;
  venueType: VenueType;
  venueName: string | null;
  description: string | null;
  status: EventStatus;
  source: 'series' | 'manual' | 'import';
  /** False = headcount-only; no per-member attendance, imports, codes or clock-ins. */
  tracksMembers: boolean;
  sessions: EventSession[];
  offerings: EventOffering[];
  stats: OfferingStats;
}

export interface EventList {
  items: Event[];
  nextCursor?: string;
}

export interface EventAttendanceRow {
  id: string;
  memberNo: string;
  name: string;
  /** Current identity label parts; age is null when dob is unknown or in the future. */
  gender: 'male' | 'female' | 'other' | 'undisclosed';
  age: number | null;
  status: 'present';
  source: 'import' | 'manual';
  sessionTime: string | null;
}

export interface EventAttendance {
  eventId: string;
  sessionDate: string;
  present: number;
  expected: number;
  importedRows: number;
  rows: EventAttendanceRow[];
}
```

`EventAttendance.rows` lists only the stored attendance rows (`status: 'present'`); the data model has
no absence record, so absent members are never fabricated. `expected` is the register at the session
date (`joined_on <= sessionDate`, not archived, not purged, and for a `presbyter_only` event only the
members who are presbyters).

**Event fields and storage.** `event_instances` holds `id`, `event_no` (unique), `name`, `series_id`
(nullable), `timezone`, `start_date`, `end_date`, `start_time`, `end_time`,
`venue_type`, `venue_name`, `description`, `status`, `source`, `sessions` (JSONB), timestamps.
`sessions` is an array of `{ date, startTime, endTime, status, venueType?, note? }`; dates are unique,
inside `start_date`/`end_date`, and non-empty. `note` is a non-empty reason when `status` is
`cancelled`, and null on a legacy cancellation. Attendance and pledge rows carry `session_date`, not a child
table id. A generated event
inherits the series name/ministry/timezone and the default venue; a standalone event supplies its own.
The event `event_no` is the key used by the import rows; the import date must match one of the event's
dates. The `venue_type` field is required and is one of `auditorium`, `virtual`, `hybrid`; `venue_name`
is optional (for example “Main Auditorium” or “Auditorium + Zoom”).

### Proposed offerings

```ts
export type OfferingKind = 'freewill' | 'tithe' | 'building' | 'missions' | 'other';
export type ContributionStatus = 'initiated' | 'paid' | 'failed';
export type PledgeStatus = 'pending' | 'honored' | 'dishonored' | 'overdue';

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
  /** Audit (NFR-3): who published this version, when, and why. `reason` is null for version 1. */
  createdAt: string;
  createdBy: string;
  reason: string | null;
}

export interface Offering {
  id: string;
  active: boolean;
  terms: OfferingTerms;
  createdAt: string;
}

export interface EventOffering {
  offeringId: string;
  /** Resolved by the API: the custom name, or `${event.name} · ${kindLabel}`. */
  name: string;
  /** Effective expiry; the API sets it for every attachment. */
  availableUntil: string | null;
  /** True when today (UTC) is after `availableUntil`: gifts are rejected, pledges survive. */
  expired: boolean;
  /** The current published terms (FR-39), so the event view needs no per-offering fetch. */
  terms: OfferingTerms;
  exceptions: Array<{ date: string; kind: 'skip' | 'opt_in'; note: string | null }>;
  stats: OfferingStats;
}

export interface OfferingStats {
  attachedEvents: number;
  pledgedMinor: number;
  paidMinor: number;
  pendingMinor: number;
  honorRate: number;
  contributionCount: number;
}

export interface Contribution {
  id: string;
  /** Exactly one of member and visitor is present. */
  memberNo: string | null;
  visitorName: string | null;
  offeringId: string;
  eventId: string;
  sessionDate: string;
  amountMinor: number;
  currency: string;
  channel: 'app' | 'ussd' | 'manual';
  status: ContributionStatus;
  reference: string;
  idempotencyKey: string;
  /** The terms version the gift was recorded under (FR-33). */
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
  /** Resolved current display name (R5); same rule as `EventOffering.name`. */
  memberName: string;
  offeringId: string;
  offeringName: string;
  eventId: string;
  sessionDate: string | null;
  amountMinor: number;
  currency: string;
  expectedOn: string;
  followUpOfficerMemberNo: string;
  /** Resolved current display name of the follow-up officer (R5). */
  officerName: string;
  status: PledgeStatus;
  reason: string | null;
  /** This pledge's next pending reminder `scheduledFor`, or null (23-Q3, ticket 23). */
  nextReminder: string | null;
  /** The terms version the pledge was recorded under (FR-33). */
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
  /** Set on `reassigned`: the officer before and after, so both stay in history (FR-34). */
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

export interface OfferingCountLine {
  /** Denomination value in minor units, e.g. GHS 20 = 2000. */
  denominationMinor: number;
  pieces: number;
}

export interface OfferingCount {
  id: string;
  eventId: string;
  offeringId: string;
  sessionDate: string;
  asOf: string;
  currency: string;
  termsVersion: number;
  lines: OfferingCountLine[];
  totalMinor: number;
  recordedAt: string;
  recordedBy: string;
  supersedesId: string | null;
  /** Derived from the unique row whose supersedesId points at this observation. */
  supersededBy: string | null;
}

export interface OfferingCountList {
  current: OfferingCount | null;
  /** Newest first; includes the current row and the superseded history. */
  observations: OfferingCount[];
}

export interface ChurchOfferingSummary {
  from: string;
  to: string;
  currency: string;
  totalPaidMinor: number;
  totalPledgedMinor: number;
  totalOutstandingMinor: number;
  /** Counted cash in the window (phase 5), reporting currency only. */
  countedMinor: number;
  /** countedMinor − (totalPaidMinor + visitors.paidMinor); never added to the gifts. */
  varianceMinor: number;
  /** Visitor gifts in the window (R1): paid visitor contribution rows, summed in `currency`. */
  visitors: { count: number; paidMinor: number };
  members: Array<{
    memberNo: string;
    name: string;
    paidMinor: number;
    pledgedMinor: number;
    outstandingMinor: number;
    lastGivenOn: string | null;
  }>;
  offerings: Array<{
    offeringId: string;
    name: string;
    paidMinor: number;
    pledgedMinor: number;
    outstandingMinor: number;
    countedMinor: number;
  }>;
  /** Totals by event in the window (23-Q2), serving FR-30's by-event totals. */
  events: Array<{
    eventId: string;
    name: string;
    paidMinor: number;
    pledgedMinor: number;
    outstandingMinor: number;
    countedMinor: number;
  }>;
  pledges: { pending: number; honored: number; dishonored: number; overdue: number };
}
```

`GET /v1/series/{id}/summary?from&to` returns the series window summary (FR-6a–FR-6d). It is one read
and is `no-store`.

```jsonc
{
  "from": "2026-08-13", // the occurrence window, echoed
  "to": "2026-11-11",
  "nextOccurrence": "2026-11-15", // first generated date >= today, <= 90 days; null when none
  "attendance": {
    "memberSessions": { "held": 11, "expected": 1980, "present": 1564, "rate": 0.79 },
    "lastHeld": { "date": "2026-11-08", "expected": 180, "present": 142 },
    "headcountSessions": { "held": 2 },
    "cancelled": 1,
    "upcoming": 1,
  },
  "offerings": {
    "attachedCount": 2,
    "currency": "GHS",
    "paidMinor": 560000,
    "pledgedMinor": 3400000,
    "outstandingMinor": 3400000,
    "countedMinor": 0,
    "visitors": { "count": 0, "paidMinor": 0 },
  },
}
```

`rate` is a ratio in [0, 1] or null; the UI formats it as a percentage. `lastHeld` is null when the
window holds no held member-tracking session. `memberSessions.expected` is the register count for each
held date under the event detail's rule (`joined_on <= date`, not archived, not purged, presbyters
only for a `presbyter_only` event), `present` is the `attendance` row count for that date, and both are
bounded by `session_date` and the window — never a sum over the events list.
`headcountSessions.held` counts held sessions on headcount-only events; no expected headcount exists,
so the block carries a count only. `attachedCount` counts active attachments made to the series
itself, not offerings attached to its events. `countedMinor` follows the church summary's
current-observation rule; `visitors` is `{ count, paidMinor }` and never carries contact data.

### Endpoints

| Method       | Path                                                                 | Purpose                                                                   | Status           |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------- |
| `GET`        | `/v1/events?from&to&seriesId&ministry&venueType`                     | Event list + attendance/offering summaries                                | proposed         |
| `GET`        | `/v1/series/{id}/summary?from&to`                                    | Series window summary: attendance, offerings, next occurrence             | MVP — this round |
| `GET`        | `/v1/events/{eventId}`                                               | Event detail with sessions and offerings                                  | proposed         |
| `GET`        | `/v1/events/{eventId}/attendance?date=`                              | Attendance rows for one event date                                        | proposed         |
| `GET`/`POST` | `/v1/offerings`                                                      | List (default active; `active`/`includeArchived`) or create with terms v1 | ticket 20        |
| `GET`/`PUT`  | `/v1/offerings/{id}`                                                 | Read the offering; update the active flag only                            | ticket 20        |
| `GET`/`POST` | `/v1/offerings/{id}/terms`                                           | List versions, newest first, or publish one (`baseVersion`)               | ticket 20        |
| `GET`/`POST` | `/v1/events/{eventId}/offerings`                                     | List active attachments, or attach                                        | ticket 20        |
| `DELETE`     | `/v1/events/{eventId}/offerings/{offeringId}`                        | Detach (end the attachment)                                               | ticket 20        |
| `GET`/`POST` | `/v1/series/{id}/offerings`                                          | List active attachments, or attach for every occurrence                   | ticket 20        |
| `DELETE`     | `/v1/series/{id}/offerings/{offeringId}`                             | Detach                                                                    | ticket 20        |
| `GET`/`POST` | `/v1/events/{eventId}/offerings/{offeringId}/exceptions`             | List rows, or append a skip/opt-in                                        | ticket 20        |
| `GET`/`POST` | `/v1/series/{id}/offerings/{offeringId}/exceptions`                  | List rows, or append a skip/opt-in                                        | ticket 20        |
| `POST`       | `/v1/contributions`                                                  | Member or visitor contribution (idempotent)                               | ticket 21        |
| `GET`        | `/v1/contributions?memberNo&offeringId&eventId&from&to&limit&cursor` | Contribution history (`no-store`)                                         | ticket 21        |
| `GET`        | `/v1/contributions/summary?from&to`                                  | Member and visitor totals by currency                                     | ticket 21        |
| `POST`       | `/v1/pledges`                                                        | Create pledge with follow-up officer                                      | ticket 22        |
| `GET`        | `/v1/pledges?status&memberNo&officerMemberNo&from&to&limit&cursor`   | Pledge list (`no-store`)                                                  | ticket 22        |
| `POST`       | `/v1/pledges/{id}/honor`                                             | Append honor event                                                        | ticket 22        |
| `POST`       | `/v1/pledges/{id}/dishonor`                                          | Append dishonor event with reason                                         | ticket 22        |
| `POST`       | `/v1/pledges/{id}/reassign`                                          | Admin assigns/reassigns follow-up officer + reason                        | ticket 22        |
| `GET`/`POST` | `/v1/pledges/{id}/reminders`                                         | List or schedule reminder records                                         | ticket 22        |
| `GET`        | `/v1/offerings/summary?from&to`                                      | Church landing totals (gifts + counted/variance)                          | ticket 23 / MVP  |
| `GET`/`POST` | `/v1/events/{eventId}/offering-counts?sessionDate&offeringId`        | Read or record/correct the counted offering (`no-store`)                  | MVP              |
| `POST`       | `/ussd/session`                                                      | USSD entry, HMAC, **not bearer**; see the USSD spec                       | ticket 24a       |
| `POST`       | `/ussd/nalo`                                                         | Nalo USSD entry, `USERID` auth, **not bearer**; see the USSD spec         | ticket 24d       |
| `POST`       | `/dev/ussd/session`                                                  | Dev-only simulator gateway, not bearer; refuses in production             | ticket 24d       |
| `POST`       | `/v1/payments/callback`                                              | Gateway callback, signature-verified                                      | ticket 24a       |

The former `/v1/ussd/session/{id}/select` and `…/commit` routes are retired: the USSD flow is one
server-owned route at `POST /ussd/session` with a `seq` frame number, specified in
`member-registrations-ussd.md`.

### Error mapping additions

| Status  | Code                        | UI response                                |
| ------- | --------------------------- | ------------------------------------------ |
| 409     | `offering_already_attached` | Show the existing attachment               |
| 409     | `terms_version_conflict`    | Reload the offering; base stale            |
| 409     | `idempotency_conflict`      | Reload by idempotency key                  |
| 409     | `pledge_already_terminal`   | Refresh; no duplicate event                |
| 409     | `event_not_active`          | Disable attachment/contribution            |
| 422     | `offering_not_on_event`     | Show valid offerings                       |
| 422     | `session_not_in_event`      | Pick one of the event's sessions           |
| 409     | `session_closed`            | The session is closed; no further captures |
| 422     | `headcount_only`            | This event has no member attendance        |
| 422     | `reason_required`           | Ask for a reason                           |
| 422     | `series_required`           | Use a series-backed event                  |
| 422     | `offering_expired`          | Show the closed offering                   |
| 422     | `invalid_exception_date`    | Inline date error                          |
| 422     | `officer_required`          | Assign an active presbyter                 |
| 422     | `invalid_amount`            | Inline amount error                        |
| 422     | `invalid_expected_date`     | Inline date error                          |
| 422     | `invalid_reminder_date`     | Inline reminder date error                 |
| 402/409 | `payment_failed`            | Keep `initiated`, allow retry              |

## Data Models

All money is `bigint` minor units plus an ISO currency. All history tables are append-only.

| Table                                | Key fields                                                                                                                                                                                                                                                                                                                                       | Constraints                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `event_instances`                    | `id`, `event_no`, `name`, `series_id` (nullable), `timezone`, `start_date`, `end_date`, `start_time`, `end_time`, `venue_type` (`auditorium`/`virtual`/`hybrid`), `venue_name`, `description`, `status`, `source`, `tracks_members` (boolean, default true), `sessions` (JSONB `{date,startTime,endTime,status,venueType?,note?}[]`), timestamps | unique `event_no`; end >= start; sessions non-empty, unique dates inside range; `tracks_members = false` means headcount-only; ministry is the series' ministry (a standalone event is general)                                                                                                  |
| `attendance`                         | `id`, `event_instance_id`, `session_date`, `member_id`, `source` (`import`/`manual`)                                                                                                                                                                                                                                                             | unique `(event_instance_id, session_date, member_id)`; session_date in sessions                                                                                                                                                                                                                  |
| `offerings`                          | `id`, `active`, `created_at`, `updated_at`, `updated_by`                                                                                                                                                                                                                                                                                         | soft archive; no hard delete; `updated_by` records the last active-flag change                                                                                                                                                                                                                   |
| `offering_terms`                     | `offering_id`, `version`, `name` (nullable), `purpose`, `kind`, `currency`, `target_minor`, `default_amount_minor`, `starts_on`, `ends_on`, `available_until`, `scripture`, `gateway_account`, `gateway_metadata`, `reason`, `created_at`, `created_by`                                                                                          | unique `(offering_id, version)`; immutable after publish; `reason` is null for version 1 and required after                                                                                                                                                                                      |
| `event_instance_offerings`           | `id`, `event_instance_id` (nullable), `series_id` (nullable), `offering_id`, `available_until`, `attached_on`, `attached_by`, `detached_on`, `detached_by`                                                                                                                                                                                       | exactly one of event_instance/series; one active attachment per (offering, event) and per (offering, series) when `detached_on` is null                                                                                                                                                          |
| `offering_exceptions`                | `id`, `attachment_id`, `date`, `kind` (`skip`/`opt_in`), `note`, `created_at`, `created_by`                                                                                                                                                                                                                                                      | append-only; the newest row per (attachment_id, date) is effective; index `(attachment_id, date, created_at desc)`                                                                                                                                                                               |
| `contributions`                      | `id`, `member_id` (nullable), `visitor_name`, `visitor_phone_hash`, `offering_id`, `event_instance_id`, `session_date`, `amount_minor`, `currency`, `channel`, `status`, `reference`, `idempotency_key`, `terms_version`, `created_at`, `created_by`                                                                                             | unique `idempotency_key` and unique `reference`; amount > 0; member XOR visitor; `(offering_id, terms_version)` references the published terms                                                                                                                                                   |
| `event_session_offering_counts`      | `id`, `event_instance_id`, `offering_id`, `session_date`, `currency`, `terms_version`, `as_of`, `recorded_by`, `recorded_at`, `supersedes_id`                                                                                                                                                                                                    | multiple observations per `(event_instance_id, offering_id, session_date)` are allowed; `current` is the newest non-superseded by `as_of`, `recorded_at`; `session_date` in sessions; the offering must be attached; `supersedes_id` unique when present; at least one line and a positive total |
| `event_session_offering_count_lines` | `count_id`, `denomination_minor`, `pieces`                                                                                                                                                                                                                                                                                                       | primary key `(count_id, denomination_minor)`; `denomination_minor > 0`; `pieces > 0`                                                                                                                                                                                                             |
| `pledges`                            | `id`, `member_id`, `offering_id`, `event_instance_id`, `session_date` (nullable), `amount_minor`, `currency`, `expected_on`, `officer_member_id`, `status`, `reason`, `terms_version`, `idempotency_key`, `created_at`, `created_by`                                                                                                             | unique `idempotency_key`; amount > 0; expected date not past at create; the offering must be attached; the officer must be an active presbyter                                                                                                                                                   |
| `pledge_events`                      | `id`, `pledge_id`, `kind` (`created`/`honored`/`dishonored`/`reassigned`), `actor`, `reason`, `from_officer_member_id`, `to_officer_member_id`, `at`                                                                                                                                                                                             | append-only; `from`/`to` are set on `reassigned`                                                                                                                                                                                                                                                 |
| `reminders`                          | `id`, `pledge_id`, `scheduled_for`, `channel`, `status`, `sent_at`                                                                                                                                                                                                                                                                               | unique `(pledge_id, scheduled_for, channel)`; status is `pending`, or `cancelled` for an auto-created past date; no delivery in V3                                                                                                                                                               |
| `ussd_sessions`                      | `id`, `phone_hash`, `member_id` (nullable), `visitor_name`, `event_instance_id`, `state`, `selected_offerings`, `amount_minor`, `action`, `expires_at`                                                                                                                                                                                           | short TTL; no raw phone in logs                                                                                                                                                                                                                                                                  |
| `payment_intents`                    | `id`, `contribution_id`, `gateway`, `reference`, `status`, `raw_callback_hash`                                                                                                                                                                                                                                                                   | unique gateway reference                                                                                                                                                                                                                                                                         |

## Out of Scope

- OS-1: A production payment-gateway integration. V3 defines the contract; the gateway choice is Q8.
- OS-2: A production USSD aggregator integration. The flow is specified; no shortcode is provisioned.
- OS-3: Card data storage, PCI scope and refunds. The app never stores card data; refunds are Q10.
- OS-4: A full accounting ledger, bank reconciliation, fees and settlement reports.
- OS-5: SMS/WhatsApp/email provider integration; reminders are records and schedules, not delivered SMS
  in V3.
- OS-6: Multi-currency FX. One currency per offering; GHS default (Q3).
- OS-7: Contribution editing/deletion. Corrections/refunds are new records.
- OS-8: A mobile app. The responsive web app and USSD are the member channels.
- OS-9: Public/anonymous giving. Only active members may give in V3 (Q4).
- OS-10: Per-officer financial roles in v1. Access is the shared token unless Q9 chooses a gate.
- OS-11: Automatic dishonor without a reminder/grace policy; Q6 decides.
- OS-12: Reporting exports (CSV/PDF) and tax receipts.
- OS-13: A separate event entity outside a series; event = series occurrence unless Q1 says otherwise.
- OS-14: Attendance report rows if the event aggregate endpoint is not approved.
- OS-15: USSD offline/feature-phone menus beyond the specified flow.

## Open Decisions (Grill Round) — settled 2026-11-03

| ID  | Decision                 | Answer                                                                                                                                                                                                                   |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Event identity           | First-class dated **Event**; `EventSeries` remains the recurring template. A standalone multi-day event needs no dummy series.                                                                                           |
| Q2  | Event attendance         | `event_instances` with a `sessions` JSONB array; attendance is per session date; `GET /v1/events` and `GET /v1/events/{eventId}/attendance?date=`.                                                                       |
| Q3  | Offering money/name      | GHS, integer minor units; kinds freewill/tithe/building/missions/other (a pledge is a payment mode, not a kind); name optional, defaults to event + kind; expiry at event end or later; pending pledges survive expiry.  |
| Q4  | Who may give             | Active members and visitors. Visitors give name + phone, receive a receipt, and have no member record; archived/purged members keep history only.                                                                        |
| Q5  | Pledge follow-up         | One active presbyter per pledge. Use the member's current shepherd, or the active presbyter an admin supplies with a reason, else reject; an admin may assign or reassign. A pledge always targets an existing offering. |
| Q6  | Honor/dishonor/reminders | Honor when paid; dishonor only with an explicit reason; pending/overdue reminders at 7 days before, due date and 7 days after; opt-out and quiet hours.                                                                  |
| Q7  | USSD/payment             | Specify the flow now; integrate a Ghanaian gateway and USSD aggregator later. No card data in the app.                                                                                                                   |
| Q7b | USSD listing             | Show the current/next active event, at most five offerings plus `0 More`; visitors identify with name + phone.                                                                                                           |
| Q8  | Terms of reference       | Versioned: name, purpose, scripture, kind, currency, target, default amount, start/end, available-until, gateway account and metadata.                                                                                   |
| Q9  | Financial privacy        | Member totals behind the officer connect gate; visitors aggregated separately; no contact values.                                                                                                                        |
| Q10 | Corrections/refunds      | Append-only correction/refund records with actor and reason; no edits or deletes.                                                                                                                                        |
| Q11 | Offering exceptions      | Attach to an event or a series; `skip`/`opt_in` on specific dates; available until event end or an explicit later date.                                                                                                  |
| Q12 | Navigation               | Add **Events** as a top-level and replace the old Attendance calendar; attendance recording is an event action, imports stay under Imports.                                                                              |
| Q13 | Venue                    | `events.venue_type` is required and one of `auditorium`, `virtual`, `hybrid`; `venue_name` is optional (e.g. “Main Auditorium”, “Auditorium + Zoom”).                                                                    |

The frontier is empty. Any new question must be added here and settled before implementation; do not
decide it only in chat.

### Ticket 23 grill — settled 2026-11-07

The offerings-landing design tree was grilled in one round; the owner accepted every recommendation
("all as recommended", 2026-11-07). IDs are `23-Qn` so they cannot be confused with the 2026-11-03
grill above.

| ID     | Decision            | Answer                                                                                                                                                                                                                                                                                          |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23-Q1  | Summary endpoint    | Build the spec-proposed `GET /v1/offerings/summary?from&to`; the endpoint row moves from `proposed` to ticket 23. This answer is the named §17 pre-authorisation for the wire addition; 23-Q3 rides the same pre-authorisation, though its field lands on `GET /v1/pledges`, not this endpoint. |
| 23-Q2  | Summary shape       | Amend `ChurchOfferingSummary` with `visitors { count, paidMinor }` and `events[]`, so one request serves the landing.                                                                                                                                                                           |
| 23-Q3  | Pledges list        | Add `nextReminder` (this pledge's next pending `scheduledFor`, or null) to the `GET /v1/pledges` list response.                                                                                                                                                                                 |
| 23-Q4  | By-member table     | Top 10 members by paid, tiebroken by member number; no Follow-up column (mock divergence recorded).                                                                                                                                                                                             |
| 23-Q5  | Window default      | Current UTC calendar year to date, adjustable with the existing `DateWindowControl`.                                                                                                                                                                                                            |
| 23-Q6  | Add offering button | Omit the mock's `+ Add offering` button this round; deferred to the backlog.                                                                                                                                                                                                                    |
| 23-Q7  | Reminders card      | Defer the Reminders card (scheduled, overdue, opted out); deferred to the backlog.                                                                                                                                                                                                              |
| 23-Q8  | Currency            | The largest paid currency in the window is the reporting currency; other currencies are excluded from the totals (precedent: `src/repos/members.ts`).                                                                                                                                           |
| 23-Q9  | Pledge relevance    | `expectedOn` in the window, or still `pending` with `expectedOn` before `from`; the same predicate for the cards and the table; pledged/outstanding as of window end, paid window-only.                                                                                                         |
| 23-Q10 | Headline scope      | Headline cards are member-only and the by-member footer is relabelled member-only; the mock's "All members + visitors" footer row repeats the member numbers and is a drafting error.                                                                                                           |

Settled without a question and recorded in the phase-4 section above: the officer gate is the
existing session connect gate (Q9), the route is `#/events/offerings` under Events, the terms dialog
renders the terms payload client-side, the USSD preview is client-composed from the events list
(≤5 + `0 More`), pledge reassignment reuses the existing route and `ReasonDialog`, and the by-event
totals come from the summary's `events[]` (R8).

#### Follow-up decisions — settled 2026-11-07

A second grill round answered the review's open forks; the owner accepted every recommendation
("all as recommended"). These refine, and do not reopen, the 23-Qn answers.

| ID  | Decision                | Answer                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Visitor totals source   | The landing reads the summary's `visitors` block; `GET /v1/contributions/summary` remains the contributions surface's split. `visitors.count` counts paid visitor contribution rows in the window; `visitors.paidMinor` sums them in the reporting currency.                                                                      |
| R2  | Summary total scope     | `totalPaidMinor`/`totalPledgedMinor`/`totalOutstandingMinor` are member-only and `offeredCount` is dropped. Pledged = relevance-predicate pledges, not dishonored, status as at the report date from `pledge_events.at`; outstanding = the pending subset; a contribution-settled pledge counts once in paid and once in pledged. |
| R3  | Pledge relevance scope  | The predicate covers the headline cards and the by-member table only; the pledge worklist is unwindowed (`GET /v1/pledges`, newest first, limit-bounded). `pending` (not yet overdue) and `overdue` are disjoint; the card caption reads pending + overdue.                                                                       |
| R4  | Protected-document list | `documents/agents/component-first.md` joins the protected list in `orchestrator-policy.md`, matching `AGENTS.md` §10a, the record and the guard.                                                                                                                                                                                  |
| R5  | Pledge-row names        | `GET /v1/pledges` rows gain `memberName`, `officerName` and `offeringName`, resolved server-side with current names (same rule as `EventOffering.name`); this acceptance is the named §17 pre-authorisation for that wire addition.                                                                                               |
| R6  | Last-given scope        | The by-member "last given" is the member's latest paid contribution `session_date` **inside the window** (never null when paid > 0), matching the `lastAttendedOn` precedent.                                                                                                                                                     |
| R7  | Outstanding vs counts   | `totalOutstandingMinor` is the stored `pending` set as at the report date (`min(to, today)`, inclusive event boundary); the cards split it into `pending` (not yet overdue, `expectedOn >= as-of`) and `overdue` (`< as-of`), so `pledged = outstanding + honored` holds and outstanding rows = pending + overdue.                |
| R8  | FR-29 stats scope       | The landing reads only `summary.members[]`/`offerings[]`/`events[]`; the events list is reused only for the USSD preview. Real FR-29 stats on the events list, event detail and attached-offering rows (currently zeroed) are a backlog row, and the landing must not render them.                                                |

A third exploration — materialising these totals in a summary table, a pub/sub projection and a NoSQL
read model — was **parked for a later round** (owner, 2026-11-07) and is recorded in
`documents/backlog.md`. The owner **parked Redis for the MVP release** on 2026-11-08, so MVP ships on
compute-on-read; this round reads the source tables and adds no aggregate store or migration.

### Series-summary grill — settled 2026-11-11

The series-summary design tree was grilled in two rounds against the local, unsigned
`mockups/v2-events/04-series-detail.png`; the owner accepted every recommendation ("all as
recommended"). Ids are `S-Qn`.

| ID    | Decision            | Answer                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-Q1  | Read shape          | A dedicated `GET /v1/series/{id}/summary?from&to`, not a windowed field on the detail and not a browser-side composition. This answer is the named §17 pre-authorisation for that wire addition in round `series-detail-summary`.                                                                                                                                                                   |
| S-Q2  | Summary shape       | The read returns the three window figures the tiles need: `nextOccurrence`, window attendance (member sessions, last held session, headcount-only held count, cancelled, upcoming) and window offering money. The Occurrences tile counts the occurrence list the page already fetches, so the DTO carries no occurrence count. Per-offering rows and per-occurrence attendance stay queued (S-Q6). |
| S-Q3  | Ratio scope         | Held member-tracking sessions only; cancelled and upcoming excluded from the ratio; headcount-only reported as a held count and never in the ratio; null when expected is 0.                                                                                                                                                                                                                        |
| S-Q4  | Money semantics     | Reuse the church summary's rules scoped by series: largest paid currency in the window is the reporting currency, counted cash reported beside the gifts, pledges as at `min(to, today)`, visitors separate.                                                                                                                                                                                        |
| S-Q5  | Window              | One window for occurrences, attendance and money (the page's `DateWindowControl`, default last 90 UTC days). `nextOccurrence` looks forward at most 90 days from today in the **series timezone**; `lastHeld` is inside the window. The mock's "this quarter"/"last Sunday"/"this month" mix is rejected. The series list's UTC-based forward window is a backlog row, not fixed here.              |
| S-Q6  | Surface             | Four tiles above Schedule versions, per the mock; the rail and per-row columns stay queued; an archived series shows the tiles read-only; explicit zeros, never a hidden card. The tile captions are enumerated in FR-6e so the e2e assertion does not depend on the mock.                                                                                                                          |
| S-Q7  | Process             | Tier 2 round `series-detail-summary`; spec review by a separate `0813` session before code; independent code review; the wire addition pre-authorised by name.                                                                                                                                                                                                                                      |
| S-Q8  | Mock                | The mock exists and is the design reference for the tiles but was never signed; `ui-mock-parity.md`'s "no mock exists for series-detail" line is corrected in the same round.                                                                                                                                                                                                                       |
| S-Q9  | Cancellation reason | A cancelled meeting date carries a reason on both surfaces: the series exception (`note` required for `kind='cancelled'`) and an event session written with `status='cancelled'` (`sessions[].note` required). Enforced at the API boundary with `422 reason_required`, not by a database constraint, so append-only history with legacy null reasons survives and displays "No reason recorded".   |
| S-Q10 | Infinite series     | The Occurrences tile is period-bound: it counts the dates generated inside the requested window (the same list the table shows). A series with no `endsOn` never has a lifetime total; a bounded series counts the intersection of its schedule and the window. Only `nextOccurrence` looks forward, capped at 90 days.                                                                             |

## Definition of Done

- Q1–Q12 answered and recorded, including rejected options.
- The events/series UI is implemented against the existing series/occurrence/import contracts.
- The event attendance aggregate and offerings APIs are specified, approved and implemented before
  their UI ships.
- Offerings V3 is feature-flagged; no payment gateway or USSD provider is live until Q7/Q8 are settled.
- Every FR has an AC; every AC has a test or a documented manual check.
- Money is integer minor units and reconciles; contributions/pledges are append-only and idempotent.
- The church landing shows totals by member/offering/event subject to Q9; no contact values.
- The mock at local `mockups/v2-events/` (git-ignored) is reviewed and the layout decisions are folded into this
  spec.

## Change log

- 2026-11-13: FR-26a settled two questions its own review raised (owner: "all as recommended"). "Current at
  submit" now means the **latest completed read** of the follow-up evidence — not the request sequence, which the
  spec deliberately leaves open so a server-computed value can replace the two reads — a submit never waits on a
  fresh request, focus and mount refetches are permitted and become that read, and the API's rejection is the
  staleness answer. The loading hint may be the field's hint line, and the hint, the no-active-shepherd statement
  and the failed-read statement MUST reach assistive technology, by any association the control or its validation
  exposes or a live region where the control is disabled. This entry is **behavioural, not a clarification**,
  which §2 requires: the owner's re-approval is recorded in the round doc's grill rows 8-9 and in the spec
  review. One rule is stated rather than invented and one is new: supplying an officer requires `officerReason`,
  which the API already refused to accept without — **superseded later the same day**: the owner ruled the note
  optional, so no justification is required and only the routing of the API's officer rejections remains from
  that pair.
- 2026-11-13: the entry above was corrected to the text that actually landed, after a confirmation review found
  it still describing two forms the body had de-normed: the "compound read" sequence, which the body now names as
  today's evidence rather than the contract, and an association mechanism narrower than the body's "any
  association … or a live region". A change log records what the contract says, not the first draft of it.
- 2026-11-13: the officer's "reason" is an **optional instruction note**, not a justification the form demands
  (owner: "Reason should be an instruction note and optional. Not a required field"). FR-26a no longer requires
  it alongside a named officer; the pledge may carry a note of 1-500 characters with or without an explicit
  officer, and reassignment keeps its own mandatory reason, which is audit and stays. The API's create contract
  is amended in `member-registrations-api.md` in the same change — a validation rule, not a wire field.
- 2026-11-13: FR-26a added - the operator identifies a member with the shared member picker for a
  contribution, a pledge and the pledge's follow-up officer, instead of making a typed member number the only
  route. Owner request: a free-typed member number is unrealistic for the person recording it.
- 2026-11-11: the FR-4b/FR-6f examples are corrected to the rendered, owner-signed form: the event detail
  line always carries the day and renders in the event timezone with no zone suffix, the import page says
  "recorded", and the ended action is **disabled** (not absent). The wording, not the behaviour, changed;
  the signed `v2-imports/03` mock is corrected on its next refresh.

- 2026-11-11: attendance becomes a capture model: live is computed from the session date and window, the
  operator only ends the session, one close is shared across channels, and the event detail shows the
  latest capture per session. The event session DTO gains `capture: { asOf, ended } | null` (latest of
  either channel; `asOf` an ISO-8601 instant rendered in the event timezone) — the named §17 pre-authorisation for that wire addition. FR-4b/FR-6f and
  AC-4a/AC-7a added; the capture time shows in the event timezone, End is offered only while live, and the
  page carries a past-open label. The API spec carries the contract and migration
  `0020_attendance_captures`.

- 2026-11-11: the Import-attendance entry is placed on the series detail and on a series-backed
  event's detail, links with `event=<id>` or `series=<id>`, and a standalone event shows no entry; the
  API's `422 series_required` is the backstop. FR-8 and AC-7 updated; the error map gains the code.

- 2026-11-11: clarifies the summary's `attachedCount`: it is the number of active attachments made to
  the series itself, not offerings attached per event. FR-6e and the DTO note say so; no behaviour
  changes. (S-Q2.)

- 2026-11-11: series summary specified (round `series-detail-summary`) from a two-round grill
  (S-Q1–S-Q10, all "as recommended"), after the 0813 spec review returned REWORK (2 P1, 7 P2) and the
  fixes below. `GET /v1/series/{id}/summary?from&to` is a new request — the named §17 pre-authorisation
  — returning the three window figures: a forward `nextOccurrence` (≤ 90 days, series timezone),
  window attendance split into held member sessions, the last held session and a headcount-only held
  count, and window offering money under the church-summary rules scoped by series. The Occurrences
  tile counts the occurrence list the page already fetches and is period-bound, so an infinite series
  never has a lifetime total. Held/upcoming/cancelled are date-derived in the series timezone (the
  `scopedSessions` precedent), not read from the stored status, which never becomes `held`. One window
  drives occurrences, attendance and money; the mock's mixed periods are rejected. The tiles render
  above Schedule versions with enumerated captions and stay visible read-only on an archived series;
  the rail and per-row columns stay queued. A cancelled series exception and a cancelled event session
  now require a reason (`422 reason_required`, checked at the API boundary). FR-4a and FR-7 gain that
  rule; FR-6 gains FR-6a–FR-6e; AC-5 is tightened and AC-5a/AC-5b/AC-6a added. The attendance table is
  named `attendance` (not `event_attendance`) in both specs' data models.
- 2026-11-09: FR-39/AC-3 narrowed (Option B, owner re-approved) to the read-only Active-offerings
  panel; the default amount is carried by the terms view, and per-date exceptions/full detail are O1.
  FR-4/FR-9/AC-3 "stats" wording aligned with R8 (zeroed on the event detail).
- 2026-11-08: MVP phase 5 specified — **offering cash counts** per event + offering + session, entered
  as denomination lines, append-only with an `asOf` and corrected by a superseding row; the landing
  gains `countedMinor` and `varianceMinor`; the operator page `#/ussd/offerings` follows the headcount
  pattern and also carries the member-announced gift and pledge forms. Migration
  `0017_offering_counts`; 24e's expected migration moves to `0018`.
- 2026-11-08: the owner parked **Redis** for the MVP release, so the MVP ships the offerings landing on
  compute-on-read; the aggregate/NoSQL exploration stays a post-MVP backlog row. No behavioural change;
  the phase-4 text and the backlog row now say so.
- 2026-11-07: V3 phase 4 specified for ticket 23 from its grill round (23-Q1–23-Q10, all accepted
  "as recommended"). `GET /v1/offerings/summary?from&to` moves from `proposed` to ticket 23 — the
  named §17 pre-authorisation for the wire addition — `ChurchOfferingSummary` gains
  `visitors { count, paidMinor }` and `events[]`, and the `GET /v1/pledges` rows gain `nextReminder`.
  The landing window defaults to the current UTC calendar year to date; headline cards and the
  by-member footer are member-only; the table is the top 10 by paid (tiebreak member number) with no
  Follow-up column; the largest paid currency is the reporting currency and others are excluded; a
  pledge is in-window when `expectedOn` falls inside it or it is still pending with `expectedOn`
  before `from`, with pledged/outstanding as at the report date and paid window-only. The mock's
  `+ Add offering` button and the Reminders card are deferred to the backlog. A second round settled
  the follow-ups (R1–R5): visitors come from the summary's `visitors` block (the
  contributions-summary line is demoted), the `total*` measures are member-only with `offeredCount`
  dropped and pledged/outstanding defined as at the report date, the relevance predicate covers the cards
  and the by-member table only (the pledge worklist is unwindowed), `component-first.md` joins the
  protected list, and the pledge list rows gain `memberName`/`officerName`/`offeringName` under the
  named §17 pre-authorisation. Materialising the totals in a summary table or a NoSQL read model was
  parked for a later round; ticket 23 reads the source tables and adds no migration. A third round
  settled R6–R8: last-given is window-scoped, outstanding is the stored pending set as at the report
  date with the cards splitting pending/overdue, and the landing reads only the summary arrays (the
  zeroed FR-29 event/offering stats are backlogged).
- 2026-11-05: pledge follow-up is the member's active shepherd or an active presbyter the administrator
  supplies with a reason (`422 officer_required` otherwise); the offering-level default officer is
  removed because no such field exists. `pledge` leaves `OfferingKind` — a pledge is a payment mode on
  an existing offering, never a standalone offering. V3 phase 3 (ticket 22) specifies pledge creation
  with a unique idempotency key and a date gate, honor/dishonor/reassign with both officers in history,
  derived `overdue`, three auto-created reminders with dedupe, and the pledge tables.
- 2026-11-05: V3 phase 2 specified for ticket 21. Contributions are idempotent by a globally unique
  key (identical repeat `200`, different payload `409 idempotency_conflict`), bind to an active
  attached offering and one of the event's session dates, are rejected after the effective expiry
  (`422 offering_expired`), record the `termsVersion`, and carry a server-generated `MR-…` reference.
  Visitor gifts store only an HMAC-SHA-256 phone hash and create no member; `GET /v1/contributions` is
  `no-store`; `GET /v1/contributions/summary` reports member and visitor totals separately by currency.
  The `contributions` table gains `terms_version`, `created_at`, `created_by` and a unique `reference`.
  The API spec is reconciled in the same change.
- 2026-11-05: V3 phase 1 specified for ticket 20. Offering versions publish through a terms POST with
  a required `baseVersion`, a required `reason` and a full flat body (the `PUT` now changes only the
  active flag and records `updated_by`); event and
  series attach/list routes and item `DELETE` detach routes exist; exception routes are nested under
  the attachment and keyed to the attachment row, with `skip` only on an event session date and
  `skip`/`opt_in` on a series occurrence/extra date; the effective expiry is the attachment date
  (events only, on or after the event end), then the terms date, then the event end; the API resolves
  the display name; and the event aggregate carries the current `terms` and an `expired` flag.
  Corrected the DTOs: `eventNo` nullable, no `seriesName`, `stats` is `OfferingStats`; attendance rows
  are `present`-only with `id`/`sessionTime`; `OfferingTerms.name` is nullable; `EventOffering` nests
  `terms`; contributions carry `memberNo | visitorName` and `eventId`. Renumbered the USSD menu FR-20
  to FR-41 so FR-20 is the offering definition. The DTO debt recorded in the backlog is closed here,
  and the API spec is reconciled in the same change.
