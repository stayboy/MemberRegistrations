# Spec — Events, Series and Offerings

**Author:** Solomon Owoo

**Date:** 2026-11-03

**Status:** **Approved 2026-11-03.** Events/series V2 and offerings V3; implementation is gated by
tickets 07–11 and 20–24. The Strategic Conference is the reference event.

|         |                                                                                       |
| ------- | ------------------------------------------------------------------------------------- |
| Repo    | `MemberRegistrations`                                                                 |
| Related | `documents/specs/member-registrations-api.md`, `member-registrations-ui.md`           |
| Mockup  | `documents/mockups/v2-events/` (review artifact)                                      |
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
  imported-row source, attached offerings (2+), offering totals and a link to the attendance import.
- **Series**: list and detail with schedule versions, exceptions, generated events, attendance summary
  and attached offerings. Adding a schedule version and adding/removing an exception use the existing
  endpoints; archiving is a soft end.
- **Attendance import** remains in `Imports`; the import rows `(memberno, date, eventno)` resolve the
  event by `eventno` and the date to one of its `sessions`. The event/series screen links to the
  import and invalidates the affected queries after the batch succeeds.
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
  offering's default officer; an administrator can assign or reassign.
- **Reminders**: scheduled for pending/overdue pledges, with a channel and delivery record. No
  duplicate reminder for the same pledge/date/channel.
- **USSD**: member or visitor identification, the current/next active event, a short offering list
  (max five plus `0 More`), multi-select, combined total, pay or pledge with expected date, and a
  confirmation code. The flow is specified but not implemented in the mock.
- **Payment gateway**: terms of reference are sent to the gateway in the future; the gateway callback
  reconciles a contribution. No card data is stored by this application.
- **Church offerings landing**: totals by member, offering and event; honors/dishonors; pending
  reminders; visitor totals separate. Financial visibility is gated to officers (Q9).

### Navigation

| Top-level | Submenu         | Route                    | API                                    | Slice |
| --------- | --------------- | ------------------------ | -------------------------------------- | ----- |
| Events    | Events          | `#/events`               | `GET /v1/events` (proposed)            | E1    |
| Events    | Series          | `#/events/series`        | `GET /v1/series`                       | E2    |
| Events    | Offerings       | `#/events/offerings`     | `GET /v1/offerings/summary` (proposed) | O4    |
| Events    | Event detail    | `#/events/:eventId`      | `GET /v1/events/:eventId` (proposed)   | E1    |
| Events    | Series detail   | `#/events/series/:id`    | `GET /v1/series/:id` + occurrences     | E2    |
| Events    | Offering detail | `#/events/offerings/:id` | `GET /v1/offerings/:id` (proposed)     | O1    |

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
  start time, venue, series/standalone, status, per-date attendance, imported-row source, offerings
  attached and stats.
- FR-5: The series list MUST use `GET /v1/series` and show name, ministry, a human-readable schedule,
  next occurrence and archived state.
- FR-6: The series detail MUST show each schedule version (`effectiveFrom`, `rrule`, `endsOn`),
  exceptions (`cancelled` / `extra`), a date-window occurrence list and the attendance/offering
  summary for the series.
- FR-7: “Add schedule version”, “Add exception”, “Remove exception” and “Archive series” MUST use the
  documented series endpoints. Archive MUST confirm; the API preserves history and does not hard
  delete.
- FR-8: “Import attendance” on an event/series MUST link to the existing import flow; after a
  successful batch the event/series queries MUST be invalidated.
- FR-9: An event MUST show all offerings attached to it (two or more) and their totals. This data MUST
  come from the offerings API; the UI MUST NOT aggregate contributions client-side from partial pages.
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
- FR-18: A pledge MUST use the member's active shepherd as follow-up; otherwise the offering's default
  officer; otherwise it MUST be rejected. An administrator MAY assign or reassign the officer with a
  reason.
- FR-19: An offering's display name MAY be omitted; it then falls back to `${event.name} · ${kind}`.
  Special offerings MAY carry a custom name. `availableUntil` is the event end or an explicit date;
  expiry blocks new gifts but MUST NOT block honoring a pending pledge.
- FR-20: The USSD menu MUST show the current/next active event and at most five offerings plus a
  “More” option, so the member is not asked to page through the full catalogue. Visitors identify with
  name + phone.
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
- FR-39: Selecting an active event MUST display every offering attached to it, including its terms,
  default amount (if any), exceptions and stats.
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

### AC-3: **Given** an event row, **When** it opens, **Then** the detail shows series, date, status, present/expected, imported-row source and all attached offerings with stats. (FR-4, FR-9, FR-39)

### AC-4: **Given** the series list, **When** it loads, **Then** each series shows a human-readable schedule, next occurrence and archived state. (FR-5)

### AC-5: **Given** a series detail, **When** it opens, **Then** schedule versions, exceptions, occurrences and attendance/offering summary are visible. (FR-6)

### AC-6: **Given** a series detail, **When** the operator adds a schedule version or exception, **Then** the documented endpoint is called and the occurrence list refreshes. (FR-7)

### AC-7: **Given** an event or series, **When** “Import attendance” is chosen, **Then** the import flow opens and a successful batch invalidates the event/series queries. (FR-8)

### AC-8: **Given** an event attendance report, **When** it loads, **Then** one aggregate request returns present/expected and optional member rows; no per-member requests are made. (FR-10, FR-11)

### AC-9: **Given** the attendance report endpoint is unavailable, **When** the event loads, **Then** the UI shows “attendance report not available” and the imported-row count, not fabricated absences. (FR-10)

### AC-10: **Given** an archived series or cancelled event, **When** the operator opens it, **Then** attendance/offering writes are disabled and history is readable. (FR-13)

### AC-11: **Given** an offering definition, **When** it is created, **Then** name, purpose, kind, currency, target, dates, active flag and gateway metadata are persisted with a version. (FR-20, FR-33)

### AC-12: **Given** an active event, **When** two or more offerings are attached, **Then** the event displays all of them; an offering MAY be skipped on a specific series day via an exception. (FR-22, FR-23, FR-39)

### AC-13: **Given** an active member, **When** they give to an offering, **Then** the contribution records amount in minor units, currency, event, channel, status and idempotency reference. (FR-21, FR-25)

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

### AC-25: **Given** an archived or purged member, **When** a contribution or pledge is attempted, **Then** the API rejects it and historical records remain readable. (FR-24)

### AC-26: **Given** a pledge with an expected date in the past, **When** it is submitted, **Then** it is rejected with an inline date error before any gateway call. (FR-37)

### AC-27: **Given** a USSD/payment commit with a zero amount, unsupported currency, expired session or an offering not attached to the event, **When** it is submitted, **Then** it is rejected before a charge or pledge is created. (FR-38)

### AC-28: **Given** an event, **When** it is created or displayed, **Then** `venue_type` is one of `auditorium`, `virtual`, `hybrid` and appears as a badge in the list and detail; `venue_name` is optional; a series-generated event inherits the default unless overridden. (FR-15)

### AC-29: **Given** the Strategic Conference, **When** it is created standalone, **Then** it has no `series_id`, a unique `event_no`, three sessions on the `event_instances` row, and imports resolve its `eventno` and each session date. (FR-16)

### AC-30: **Given** a visitor, **When** they give, **Then** the contribution records name + phone hash, returns a receipt/reference, creates no member record, and appears only in the separate visitor total. (FR-17)

### AC-31: **Given** a USSD pledge, **When** the member's shepherd is active, **Then** that presbyter is the follow-up officer; otherwise the offering default officer is used; if neither exists the pledge is rejected. An admin can assign or reassign with a reason. (FR-18)

### AC-32: **Given** an offering with no custom name, **When** it is displayed, **Then** the label falls back to the event name + kind; `availableUntil` is event end or the explicit date; after expiry new gifts are rejected but a pending pledge can still be honored. (FR-19)

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
  status: EventDateStatus;
  present: number;
  expected: number;
  importedRows: number;
  source: 'import' | 'manual' | 'mixed' | 'none';
}

export interface Event {
  id: string;
  eventNo: string;
  name: string;
  seriesId: string | null;
  seriesName: string | null;
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
  sessions: EventSession[];
  offerings: EventOffering[];
  stats: {
    pledgedMinor: number;
    paidMinor: number;
    pendingMinor: number;
    currency: string;
  };
}

export interface EventList {
  items: Event[];
  nextCursor?: string;
}

export interface EventAttendanceRow {
  memberNo: string;
  name: string;
  status: 'present' | 'absent';
  source: 'import' | 'manual';
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

**Event fields and storage.** `event_instances` holds `id`, `event_no` (unique), `name`, `series_id`
(nullable), `ministry_code` (nullable), `timezone`, `start_date`, `end_date`, `start_time`, `end_time`,
`venue_type`, `venue_name`, `description`, `status`, `source`, `sessions` (JSONB), timestamps.
`sessions` is an array of `{ date, startTime, endTime, status, venueType? }`; dates are unique, inside
`start_date`/`end_date`, and non-empty. Attendance and pledge rows carry `session_date`, not a child
table id. A generated event
inherits the series name/ministry/timezone and the default venue; a standalone event supplies its own.
The event `event_no` is the key used by the import rows; the import date must match one of the event's
dates. The `venue_type` field is required and is one of `auditorium`, `virtual`, `hybrid`; `venue_name`
is optional (for example “Main Auditorium” or “Auditorium + Zoom”).

### Proposed offerings

```ts
export type OfferingKind = 'freewill' | 'tithe' | 'pledge' | 'building' | 'missions' | 'other';
export type ContributionStatus = 'initiated' | 'paid' | 'failed';
export type PledgeStatus = 'pending' | 'honored' | 'dishonored' | 'overdue';

export interface OfferingTerms {
  version: number;
  name: string;
  purpose: string;
  kind: OfferingKind;
  currency: string;
  targetMinor: number | null;
  defaultAmountMinor: number | null;
  startsOn: string | null;
  endsOn: string | null;
  scripture: string | null;
  gatewayAccount: string | null;
  gatewayMetadata: Record<string, string> | null;
}

export interface Offering {
  id: string;
  active: boolean;
  terms: OfferingTerms;
  createdAt: string;
}

export interface EventOffering {
  offeringId: string;
  name: string;
  kind: OfferingKind;
  currency: string;
  attachedOn: string;
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
  memberNo: string;
  offeringId: string;
  seriesId: string;
  date: string;
  amountMinor: number;
  currency: string;
  channel: 'app' | 'ussd' | 'manual';
  status: ContributionStatus;
  reference: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface Pledge {
  id: string;
  memberNo: string;
  offeringId: string;
  seriesId: string;
  date: string;
  amountMinor: number;
  currency: string;
  expectedOn: string;
  followUpOfficerMemberNo: string;
  status: PledgeStatus;
  reason: string | null;
  createdAt: string;
}

export interface PledgeEvent {
  id: string;
  pledgeId: string;
  kind: 'created' | 'honored' | 'dishonored' | 'reassigned' | 'reminded' | 'corrected';
  actor: string;
  reason: string | null;
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

export interface ChurchOfferingSummary {
  from: string;
  to: string;
  currency: string;
  totalPaidMinor: number;
  totalPledgedMinor: number;
  totalOutstandingMinor: number;
  offeredCount: number;
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
  }>;
  pledges: { pending: number; honored: number; dishonored: number; overdue: number };
}
```

### Endpoints

| Method          | Path                                             | Purpose                                            | Status   |
| --------------- | ------------------------------------------------ | -------------------------------------------------- | -------- |
| `GET`           | `/v1/events?from&to&seriesId&ministry&venueType` | Event list + attendance/offering summaries         | proposed |
| `GET`           | `/v1/events/{eventId}`                           | Event detail with sessions and offerings           | proposed |
| `GET`           | `/v1/events/{eventId}/attendance?date=`          | Attendance rows for one event date                 | proposed |
| `GET`/`POST`    | `/v1/offerings`                                  | List/create offering                               | proposed |
| `GET`/`PUT`     | `/v1/offerings/{id}`                             | Read/update (new terms version)                    | proposed |
| `POST`          | `/v1/offerings/{id}/terms`                       | Publish a new terms version                        | proposed |
| `GET`/`POST`    | `/v1/events/{eventId}/offerings`                 | Attach/list event offerings                        | proposed |
| `DELETE`        | `/v1/events/{eventId}/offerings/{offeringId}`    | Detach (end, not delete)                           | proposed |
| `POST`/`DELETE` | `/v1/offerings/{id}/exceptions`                  | Skip/opt in an event/series date                   | proposed |
| `POST`          | `/v1/contributions`                              | Member or visitor contribution (idempotent)        | proposed |
| `GET`           | `/v1/contributions?memberNo&offeringId&from&to`  | Contribution history                               | proposed |
| `POST`          | `/v1/pledges`                                    | Create pledge with follow-up officer               | proposed |
| `GET`           | `/v1/pledges?status&memberNo&officerMemberNo`    | Pledge list                                        | proposed |
| `POST`          | `/v1/pledges/{id}/honor`                         | Append honor event                                 | proposed |
| `POST`          | `/v1/pledges/{id}/dishonor`                      | Append dishonor event with reason                  | proposed |
| `POST`          | `/v1/pledges/{id}/reassign`                      | Admin assigns/reassigns follow-up officer + reason | proposed |
| `POST`          | `/v1/pledges/{id}/reminders`                     | Schedule reminder                                  | proposed |
| `GET`           | `/v1/offerings/summary?from&to`                  | Church landing totals                              | proposed |
| `POST`          | `/v1/ussd/session`                               | Start USSD session                                 | future   |
| `POST`          | `/v1/ussd/session/{id}/select`                   | Select offerings                                   | future   |
| `POST`          | `/v1/ussd/session/{id}/commit`                   | Pay or pledge                                      | future   |
| `POST`          | `/v1/payments/callback`                          | Gateway callback                                   | future   |

### Error mapping additions

| Status  | Code                        | UI response                     |
| ------- | --------------------------- | ------------------------------- |
| 409     | `offering_already_attached` | Show the existing attachment    |
| 409     | `pledge_already_terminal`   | Refresh; no duplicate event     |
| 409     | `event_not_active`          | Disable attachment/contribution |
| 422     | `offering_not_on_event`     | Show valid offerings            |
| 422     | `invalid_amount`            | Inline amount error             |
| 422     | `invalid_expected_date`     | Inline date error               |
| 402/409 | `payment_failed`            | Keep `initiated`, allow retry   |

## Data Models

All money is `bigint` minor units plus an ISO currency. All history tables are append-only.

| Table                      | Key fields                                                                                                                                                                                                                                                                                                        | Constraints                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `event_instances`          | `id`, `event_no`, `name`, `series_id` (nullable), `ministry_code`, `timezone`, `start_date`, `end_date`, `start_time`, `end_time`, `venue_type` (`auditorium`/`virtual`/`hybrid`), `venue_name`, `description`, `status`, `source`, `sessions` (JSONB `{date,startTime,endTime,status,venueType?}[]`), timestamps | unique `event_no`; end >= start; sessions non-empty, unique dates inside range  |
| `event_attendance`         | `id`, `event_instance_id`, `session_date`, `member_no`, `source` (`import`/`manual`)                                                                                                                                                                                                                              | unique `(event_instance_id, session_date, member_no)`; session_date in sessions |
| `offerings`                | `id`, `active`, `created_at`                                                                                                                                                                                                                                                                                      | soft archive; no hard delete                                                    |
| `offering_terms`           | `offering_id`, `version`, `name` (nullable), `purpose`, `kind`, `currency`, `target_minor`, `default_amount_minor`, `starts_on`, `ends_on`, `available_until`, `scripture`, `gateway_account`, `gateway_metadata`                                                                                                 | unique `(offering_id, version)`; immutable after publish                        |
| `event_instance_offerings` | `id`, `event_instance_id` (nullable), `series_id` (nullable), `offering_id`, `available_until`, `attached_on`, `detached_on`                                                                                                                                                                                      | exactly one of event_instance/series; unique active attachment                  |
| `offering_exceptions`      | `offering_id`, `event_instance_id`/`series_id`, `date`, `kind` (`skip`/`opt_in`), `note`                                                                                                                                                                                                                          | unique `(offering_id, event_instance_id, date)` or series variant               |
| `contributions`            | `id`, `member_no` (nullable), `visitor_name`, `visitor_phone_hash`, `offering_id`, `event_instance_id`, `session_date`, `amount_minor`, `currency`, `channel`, `status`, `reference`, `idempotency_key`                                                                                                           | unique `idempotency_key`; amount > 0; member XOR visitor                        |
| `pledges`                  | `id`, `member_no`, `offering_id`, `event_instance_id`, `session_date` (nullable), `amount_minor`, `currency`, `expected_on`, `officer_member_no`, `status`, `reason`                                                                                                                                              | amount > 0; expected date not past at create                                    |
| `pledge_events`            | `id`, `pledge_id`, `kind`, `actor`, `reason`, `at`                                                                                                                                                                                                                                                                | append-only                                                                     |
| `reminders`                | `id`, `pledge_id`, `scheduled_for`, `channel`, `status`, `sent_at`                                                                                                                                                                                                                                                | unique `(pledge_id, scheduled_for, channel)`                                    |
| `ussd_sessions`            | `id`, `phone_hash`, `member_no` (nullable), `visitor_name`, `event_instance_id`, `state`, `selected_offerings`, `amount_minor`, `action`, `expires_at`                                                                                                                                                            | short TTL; no raw phone in logs                                                 |
| `payment_intents`          | `id`, `contribution_id`, `gateway`, `reference`, `status`, `raw_callback_hash`                                                                                                                                                                                                                                    | unique gateway reference                                                        |

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

| ID  | Decision                 | Answer                                                                                                                                                                                |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Event identity           | First-class dated **Event**; `EventSeries` remains the recurring template. A standalone multi-day event needs no dummy series.                                                        |
| Q2  | Event attendance         | `event_instances` with a `sessions` JSONB array; attendance is per session date; `GET /v1/events` and `GET /v1/events/{eventId}/attendance?date=`.                                    |
| Q3  | Offering money/name      | GHS, integer minor units; kinds freewill/tithe/pledge/building/missions/other; name optional, defaults to event + kind; expiry at event end or later; pending pledges survive expiry. |
| Q4  | Who may give             | Active members and visitors. Visitors give name + phone, receive a receipt, and have no member record; archived/purged members keep history only.                                     |
| Q5  | Pledge follow-up         | One active presbyter per pledge. Use the member's current shepherd, then the offering default officer, then reject; an admin may assign or reassign with a reason.                    |
| Q6  | Honor/dishonor/reminders | Honor when paid; dishonor only with an explicit reason; pending/overdue reminders at 7 days before, due date and 7 days after; opt-out and quiet hours.                               |
| Q7  | USSD/payment             | Specify the flow now; integrate a Ghanaian gateway and USSD aggregator later. No card data in the app.                                                                                |
| Q7b | USSD listing             | Show the current/next active event, at most five offerings plus `0 More`; visitors identify with name + phone.                                                                        |
| Q8  | Terms of reference       | Versioned: name, purpose, scripture, kind, currency, target, default amount, start/end, available-until, gateway account and metadata.                                                |
| Q9  | Financial privacy        | Member totals behind the officer connect gate; visitors aggregated separately; no contact values.                                                                                     |
| Q10 | Corrections/refunds      | Append-only correction/refund records with actor and reason; no edits or deletes.                                                                                                     |
| Q11 | Offering exceptions      | Attach to an event or a series; `skip`/`opt_in` on specific dates; available until event end or an explicit later date.                                                               |
| Q12 | Navigation               | Add **Events** as a top-level and replace the old Attendance calendar; attendance recording is an event action, imports stay under Imports.                                           |
| Q13 | Venue                    | `events.venue_type` is required and one of `auditorium`, `virtual`, `hybrid`; `venue_name` is optional (e.g. “Main Auditorium”, “Auditorium + Zoom”).                                 |

The frontier is empty. Any new question must be added here and settled before implementation; do not
decide it only in chat.

## Definition of Done

- Q1–Q12 answered and recorded, including rejected options.
- The events/series UI is implemented against the existing series/occurrence/import contracts.
- The event attendance aggregate and offerings APIs are specified, approved and implemented before
  their UI ships.
- Offerings V3 is feature-flagged; no payment gateway or USSD provider is live until Q7/Q8 are settled.
- Every FR has an AC; every AC has a test or a documented manual check.
- Money is integer minor units and reconciles; contributions/pledges are append-only and idempotent.
- The church landing shows totals by member/offering/event subject to Q9; no contact values.
- The mock at `documents/mockups/v2-events/` is reviewed and the layout decisions are folded into this
  spec.
