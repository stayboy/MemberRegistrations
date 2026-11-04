# Spec — MemberRegistrations API

**Author:** Solomon Owoo

|            |                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | **Approved 2026-11-03** - v1, shepherding, and the V2/V3 amendment (events, per-session attendance, offerings, session gateway). Implementation is gated by tickets 01-24 plus 11a |
| Date       | 2026-11-02 (amended 2026-11-03)                                                                                                                                                    |
| Repo       | `MemberRegistrations` (standalone repository)                                                                                                                                      |
| Origin     | Conversational feature request, 2026-11-02; V2/V3 amendment 2026-11-03                                                                                                             |
| Supersedes | The Blob/local-JSON revision of this spec (persistence replaced by Postgres)                                                                                                       |

---

## Change log

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

- Attendance is **modelled, not transcribed**: an event series declares a recurrence, occurrences are
  derived from it and refined by imported event lists, and a member's record shows
  `attended` / `expected` per series.
- Events are **first-class instances**: a standalone conference is an event with its own venue and
  sessions, while a series occurrence generates an event idempotently.
- Giving is **modelled, not bolted on**: offerings carry versioned terms, contributions and pledges are
  append-only, and visitor giving never creates a member record.
- The domain is **behaviour-rich**: member, subscription, relationship and series aggregates own their
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
3. As a ministry leader, I want attendance shown as `attended` out of `expected` per event series
   (e.g. "Sunday Main English Service — 2 of 5"), so that the number has a definition I can explain.
4. As an administrator, I want to create, update, archive, restore and purge registrations, so that the
   register stays correct without hand-editing files.
5. As an administrator, I want to record and correct attendance for a member against a series and date,
   so that manual corrections coexist with imported registries.
6. As an administrator, I want to import the member database and attendance registry idempotently, with
   a downloadable Excel template, so that re-running a file is safe and a bad file changes nothing.
7. As an administrator, I want ministries, series and their schedules managed through the API, so that
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

- FR-1: An event MUST be a first-class dated instance. A standalone event MUST NOT require a series;
  `GET /v1/events` and `GET /v1/events/{eventId}` MUST return both standalone and series-generated
  events.
- FR-2: An event MUST record `venueType` as `auditorium`, `virtual` or `hybrid`; `venueName` MAY be
  supplied and MAY differ from the venue type label.
- FR-3: An event MUST carry a non-empty `sessions` array with unique dates inside
  `startDate`/`endDate`; a duplicate or out-of-range session MUST be rejected.
- FR-4: A series occurrence MUST generate at most one event instance. Generation MUST be idempotent
  and MUST honour cancelled and extra exceptions.
- FR-5: Attendance MUST be recorded per event session; `sessionDate` MUST be one of the event's
  sessions and the database MUST enforce it.
- FR-6: An attendance import MUST resolve `(eventno, date)` to one event session and MUST be
  all-or-nothing.
- FR-7: An imported attendance row MUST NOT overwrite a manual row; deleting an imported row MUST
  write a suppression so a later import cannot resurrect it.
- FR-8: `GET /v1/members` MUST support a list-level attendance aggregate
  (`include=attendance&seriesId=`) so a page of members is one request, not one request per row.
- FR-9: An offering MUST carry versioned terms of reference; published terms MUST be immutable and an
  edit MUST create a new version.
- FR-10: Two or more offerings MAY attach to one event; detaching MUST end the attachment
  (`detachedOn`), never delete it.
- FR-11: An offering MAY be skipped or opted in on a specific event or series date; `availableUntil`
  MUST be the event end or an explicit later date.
- FR-12: A contribution MUST store an amount in integer minor units and MUST be idempotent on a
  caller-supplied key.
- FR-13: A visitor MUST be able to give with name and phone, receive a receipt or reference, and leave
  no member record; the phone MUST be stored hashed.
- FR-14: A pledge MUST carry an expected date and exactly one follow-up officer, resolved from the
  member's active shepherd, then the offering default officer, otherwise rejected.
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

## Non-Functional Requirements

- NFR-1: Backend dates MUST remain UTC calendar dates; `series.timezone` MAY override only the
  definition of "today" for that series.
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

| Field                             | Notes                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| `memberNo`                        | Immutable, case-insensitively unique, never reused (tombstone survives). |
| `firstName`, `lastName`           | Required.                                                                |
| `otherNames`                      | Single free-text field.                                                  |
| `maidenName`, `alias`             | Optional free text.                                                      |
| `dob`                             | Date, nullable.                                                          |
| `gender`                          | `male` \| `female` \| `other` \| `undisclosed`.                          |
| `placeOfResidence`, `addressLine` | Free text.                                                               |
| `joinedOn`                        | Date; defaults to the registration date when omitted.                    |
| `isPresbyter`                     | Boolean, default `false`; officer eligibility for shepherding.           |
| `archivedAt`                      | Set by archive, cleared by restore.                                      |
| `purgedAt`                        | Tombstone marker; PII is nulled and the number stays reserved.           |

Invariants: `memberNo` never changes; a purged member is read-only and invisible; an archived member
is invisible to default reads but readable with `includeArchived=true`.

### Contact

`{ id, kind: phone | email | whatsapp, value, displayOrder }`. No "primary" flag — order is the
preference.

- `value` is **globally unique** after normalisation (digits only for phone/whatsapp, lower-cased for
  email), so one value belongs to exactly one member.
- A dependent "having" the guardian's number is a **link** to that contact, not a duplicate row.
- Filters match any owned or linked contact, so a shared household number returns the whole household.

### Subscription

`{ id, kind: life_insurance | credit_union, policyholderMemberId, scope: individual | household,
status, reference?, startedOn, endedOn? }`

- `individual`: coverage is the policyholder.
- `household`: explicit `subscription_coverage` rows. Coverage is a financial fact, never derived from
  the relationship graph and never auto-extended when a dependent is linked.
- Coverage removal writes `removedOn`; it does not delete history.

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

### Shepherding

A **presbyter** is any member with `isPresbyter = true`. Presbyter is a flag, not a ministry: it grants
officer eligibility without implying a ministry assignment, and it is set through the ordinary member
create/update payloads.

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

The **roster** shows one row per active assignment: member identity, owned and linked contacts,
residence, `attempts`, `conversations`, `lastCalledOn`, `lastOutcome`, current `stillInChurch`,
`latestFeedback` and `latestIssue`. Counts cover the **current assignment only**; the member's own
shepherding view exposes the full history across previous officers, including prior feedback and
issues.

The **church report** aggregates the same data per officer plus totals: officers, active members,
assigned members, unassigned members, attempts, conversations, members never called, and the current
status distribution (`yes`, `no`, `unknown`, never reported).

**Purge** deletes the member's assignments and calls in both roles. This is the one exception to the
append-only rule: purge is a legal PII erasure, not a history-management operation.

### EventSeries

`{ id, name, ministryId?, timezone, description?, archivedAt? }`

- `description` carries free text such as the service time.
- `timezone` is an optional IANA override used only to decide what "today" means for that series. It
  defaults to `UTC`; every other backend default and comparison uses UTC calendar dates.
- Unique on `(lower(name), ministryId)` among non-archived series.
- Schedules are **versioned**: `series_schedule(effectiveFrom, rrule, endsOn?)`. Editing a schedule
  adds a version; history is never rewritten.
- `rrule` is the RRULE body (`FREQ=WEEKLY;BYDAY=SU`); `COUNT` and `UNTIL` are rejected inside the body
  — the end date is the `endsOn` column.
- `series_exception(date, kind: cancelled | extra)` records a cancelled service or a one-off extra.
- Archived, never deleted.

### Event instance

`{ id, eventNo?, name, seriesId?, ministryCode?, timezone, startDate, endDate, startTime, endTime?, venueType, venueName?, description?, status, source, sessions }`

- An **event instance** is one dated event. It is generated from a series occurrence (`source = series`,
  `seriesId` set) or created directly (`source = manual`, `seriesId` null). The Strategic Conference is
  a standalone three-day event with no series.
- `eventNo` is unique, is the key used by imports, and is never reused; a series-minted instance may have none until ticket 11 assigns one.
- `venueType` is required and is `auditorium | virtual | hybrid`; `venueName` is optional free text such
  as "Main Auditorium" or "Auditorium + Zoom".
- `sessions` is a JSONB array of `{ date, startTime, endTime, status, venueType? }`. The array is
  non-empty, its dates are unique, and every date falls inside `startDate`/`endDate`. A three-day
  conference has three sessions on one row; there is no child table.
- `status` is `draft | scheduled | held | cancelled | archived`. Transitions use UTC. A cancelled or
  archived event is read-only.
- A generated event inherits the series name, ministry, timezone and default venue; an explicit
  override is allowed.
- Generation runs over a `from`/`to` window for every non-archived series. A generated event is
  single-session (its occurrence date), `source = series`, `startTime '00:00'`, `venueType
'auditorium'`, and gets a unique `eventNo` of the form `EVT-<year>-<NNN>` from a per-year counter.
  Re-running adds nothing and never overwrites an existing event; it fills a missing `eventNo` so an
  attendance import can target an instance created by a manual attendance entry.
- `event_instances` is the evolved `event_occurrences` table: the primary key moves from
  `(series_id, occurs_on)` to `id`, and `event_no` remains unique.

### Occurrences and attendance

An **occurrence** is still a date on which a series actually met:

1. Expand the schedule version in force on each date within the window.
2. Remove `cancelled` exceptions, add `extra` exceptions.

A **series occurrence generates at most one event instance**, idempotently on `(seriesId, date)`. A
cancelled occurrence suppresses generation; an extra exception creates an event.

**Attendance row**: `{ id, memberId, eventInstanceId, sessionDate, source: import | manual }`, unique
on `(eventInstanceId, sessionDate, memberId)`.

- `sessionDate` MUST be one of the event's sessions. A database trigger enforces this, so a direct
  write cannot bypass the API.
- A `manual` row shadows an `import` row for the same key; a later import MUST NOT overwrite it.
- Deleting a `manual` row deletes it. Deleting an `import` row writes a **suppression** keyed on
  `(memberId, eventInstanceId, sessionDate)`.
- Attendance may only be recorded for a session that was actually held. A write against a cancelled or
  archived event is rejected, and a cancelled session is read-only; reads remain available.
- The existing per-member attendance endpoints remain for corrections; the event attendance report is
  the V2 read path.

**Per-session attendance report.** `GET /v1/events/{eventId}/attendance?date=` returns
`{ eventId, sessionDate, present, expected, importedRows, rows }`.

- `present` is the number of attendance rows for that session; `rows` lists exactly those members with
  `status: 'present'` and their `import | manual` source. The data model has no absence row, so the
  report never invents an absent member; `expected - present` is the only absence signal.
- `expected` is the register at the session date: members with `joined_on <= sessionDate`, not archived
  and not purged. Each session is counted on its own date, so a multi-day event may report a different
  denominator per day.
- A manual `POST` over an imported row for the same key converts it to `source: manual`; a second
  manual post is `409`. `DELETE` removes a manual row and writes a suppression for an imported row.

The member-and-series count is unchanged; each held session counts once:

```
windowStart = max(first schedule effectiveFrom, member.joinedOn ?? registration date)
windowEnd   = min(endsOn ?? today, today)
expected    = |occurrences in [windowStart, windowEnd]|
attended    = |occurrences in that window with at least one attendance row|
```

The DTO reports `attended`, `expected`, `remaining` and `status: ongoing | completed | in_progress`.
Extras count when held; cancellations do not.

### Import batch

Every import is one transaction and one `import_batch` row (`kind`, `actor`, `rowCount`, `checksum`,
`createdAt`). Row-level errors fail the whole request with a `422` report; there is no partial apply.

A **member import** row `(memberNo, firstName, lastName, otherNames?, gender?, dob?, joinedOn?,
placeOfResidence?, addressLine?, isPresbyter?, phone?, email?)` upserts the member by `memberNo`
(case-insensitive). A duplicate `memberNo` inside one file, an archived member or a purged member fails
the whole batch. A blank optional cell leaves the stored value unchanged. `phone` and `email` become
contacts: an identical contact is skipped, and a value already held by another member is an error.
Ministries, relationships and subscriptions are not imported.

An **attendance import** row `(memberno, date, eventno)` resolves `eventno` to the event instance and
`date` to one of its sessions. A date outside `sessions` fails the whole batch and names the event and
date; attendance is never written against an unlisted date.

Every import publishes its column contract at `GET /v1/imports/formats` and serves an Excel template at
`GET /v1/imports/templates/{kind}` (header row, one example row and a notes sheet). The template and
the JSON contract MUST describe the same columns.

### Offering

`{ id, active, terms, createdAt }` with `OfferingTerms`:

`{ version, name?, purpose, kind, currency, targetMinor?, defaultAmountMinor?, startsOn?, endsOn?, availableUntil?, scripture?, gatewayAccount?, gatewayMetadata? }`

- `kind` is `freewill | tithe | pledge | building | missions | other`.
- `name` is optional; the display label falls back to `${event.name} · ${kind}`.
- Terms are versioned and immutable after publish. An edit publishes a new version; history is not
  rewritten.
- Currency is GHS and amounts are integer minor units.
- `availableUntil` is the event end or an explicit later date. Expiry blocks new gifts but MUST NOT
  block honoring a pending pledge.
- Two or more offerings attach to one event; a series attachment may carry `skip` or `opt_in`
  exceptions on a date.
- Detaching ends the attachment; it never deletes the offering or its history.

### Contribution

- A member contribution carries `memberNo`, `offeringId`, `eventInstanceId`, optional `sessionDate`,
  amount, currency, channel (`app | ussd | manual`), status (`initiated | paid | failed`), reference and
  a unique idempotency key.
- A visitor contribution carries `visitorName` and a hashed phone instead of `memberNo`; it returns a
  receipt or reference and creates no member.
- Exactly one of member or visitor is present.
- Amounts are positive integer minor units.

### Pledge

- A pledge carries `memberNo`, `offeringId`, `eventInstanceId`, optional `sessionDate`, amount,
  currency, `expectedOn` and exactly one follow-up officer.
- The officer is the member's active shepherd; otherwise the offering's default officer; otherwise the
  pledge is rejected.
- An administrator may assign or reassign the officer with a reason; both officers and the reason
  remain in `pledge_events`.
- Status is `pending | honored | dishonored | overdue`. Honor is appended on payment; dishonor requires
  a reason.
- A pending pledge survives offering expiry and can still be honored.
- Reminders are unique per pledge, scheduled date and channel; opt-out is honoured.

## API Contracts

All routes are under `/v1` except `/health` and `/openapi.json`. Every route requires bearer auth;
every write requires `X-Actor-Id`.

The V2 additions are `GET /v1/events`, `GET /v1/events/{eventId}` and
`GET /v1/events/{eventId}/attendance?date=`; the V3 additions include `POST /v1/contributions` and
`POST /v1/pledges`.

### Members

| Method   | Path                                               | Result                                                                                  |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET`    | `/v1/members`                                      | Paged summary list (`q`, `contact`, `status`, `include`, `seriesId`, `limit`, `cursor`) |
| `POST`   | `/v1/members`                                      | `201` + `Location`; `409` duplicate member number                                       |
| `GET`    | `/v1/members/{memberNo}`                           | Full DTO + `ETag`; `404` unknown/archived unless flagged                                |
| `PUT`    | `/v1/members/{memberNo}`                           | Update; stale `If-Match` → `409`                                                        |
| `DELETE` | `/v1/members/{memberNo}`                           | Archive; `204`                                                                          |
| `POST`   | `/v1/members/{memberNo}/restore`                   | Un-archive; `409` when not archived                                                     |
| `POST`   | `/v1/members/{memberNo}/purge`                     | Hard delete PII; body must repeat the member number                                     |
| `GET`    | `/v1/members/{memberNo}/attendance`                | Per-series counts + rows                                                                |
| `POST`   | `/v1/members/{memberNo}/attendance`                | `{ seriesId, date }`, resolved to the event session; `422` when not held                |
| `DELETE` | `/v1/members/{memberNo}/attendance/{attendanceId}` | Remove a row (writes a suppression for imports)                                         |
| `POST`   | `/v1/members/{memberNo}/contacts`                  | Add contact; `409` on duplicate value                                                   |
| `PUT`    | `/v1/members/{memberNo}/contacts/{contactId}`      | Update kind/value/order                                                                 |
| `DELETE` | `/v1/members/{memberNo}/contacts/{contactId}`      | Remove contact                                                                          |
| `POST`   | `/v1/members/{memberNo}/contacts/link`             | Link another member's contact (dependent sharing)                                       |
| `DELETE` | `/v1/members/{memberNo}/contacts/link/{contactId}` | Unlink                                                                                  |
| `POST`   | `/v1/members/{memberNo}/subscriptions`             | Create subscription (optional coverage)                                                 |
| `DELETE` | `/v1/members/{memberNo}/subscriptions/{id}`        | End subscription                                                                        |
| `POST`   | `/v1/subscriptions/{id}/coverage`                  | Add a covered member                                                                    |
| `DELETE` | `/v1/subscriptions/{id}/coverage/{memberNo}`       | Remove a covered member                                                                 |
| `POST`   | `/v1/members/{memberNo}/ministries`                | Assign by ministry `code`                                                               |
| `DELETE` | `/v1/members/{memberNo}/ministries/{code}`         | Unassign                                                                                |
| `GET`    | `/v1/members/{memberNo}/relationships`             | Spouse, dependents, guardians                                                           |
| `POST`   | `/v1/members/{memberNo}/relationships`             | `{ relatedMemberNo, type, isDependent }`                                                |
| `DELETE` | `/v1/members/{memberNo}/relationships/{id}`        | Remove the edge                                                                         |

### Shepherding

| Method   | Path                                               | Result                                                                      |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `POST`   | `/v1/shepherding/assignments`                      | Assign a member; reassignment needs `replaceAssignmentId` + `reason`        |
| `DELETE` | `/v1/shepherding/assignments/{assignmentId}`       | End an assignment; `409` when already ended                                 |
| `POST`   | `/v1/shepherding/assignments/{assignmentId}/calls` | Log one attempt; `409` when the assignment has ended                        |
| `GET`    | `/v1/shepherding/assignments/{assignmentId}/calls` | Full call history for the assignment                                        |
| `GET`    | `/v1/shepherding/officers`                         | Presbyters with list size and call totals (`from`, `to`)                    |
| `GET`    | `/v1/shepherding/officers/{memberNo}/members`      | The officer's roster with contacts, counts and latest report (`from`, `to`) |
| `GET`    | `/v1/shepherding/report`                           | Church-wide coverage and call totals (`from`, `to`)                         |
| `GET`    | `/v1/members/{memberNo}/shepherding`               | Current shepherd, assignment history, calls and current status              |

Assignment body: `{ officerMemberNo, memberNo, assignedOn?, replaceAssignmentId?, reason? }`.

Call body: `{ calledOn?, outcome, stillInChurch?, feedback?, issue? }`.

There is deliberately no `DELETE` for a call.

### Reference data

| Method       | Path                                | Result                                             |
| ------------ | ----------------------------------- | -------------------------------------------------- |
| `GET`/`POST` | `/v1/ministries`                    | List / create (`code`, `name`, …)                  |
| `GET`/`PUT`  | `/v1/ministries/{code}`             | Read / rename (code immutable)                     |
| `DELETE`     | `/v1/ministries/{code}`             | Deactivate, or `409` while referenced              |
| `GET`/`POST` | `/v1/series`                        | List / create                                      |
| `GET`/`PUT`  | `/v1/series/{id}`                   | Read / update name, ministry, description, archive |
| `POST`       | `/v1/series/{id}/schedule`          | Add a schedule version                             |
| `POST`       | `/v1/series/{id}/exceptions`        | Cancel or add a date                               |
| `DELETE`     | `/v1/series/{id}/exceptions/{date}` | Remove an exception                                |

### Events

| Method   | Path                                             | Result                                                       |
| -------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `GET`    | `/v1/events?from&to&seriesId&ministry&venueType` | Date-window list with attendance and offering summaries      |
| `POST`   | `/v1/events`                                     | Create a standalone event; `201` + `Location`                |
| `GET`    | `/v1/events/{eventId}`                           | Event detail, sessions, offerings and stats                  |
| `PUT`    | `/v1/events/{eventId}`                           | Update; stale `If-Match` → `409`                             |
| `POST`   | `/v1/events/{eventId}/cancel`                    | Cancel the event; history stays readable                     |
| `GET`    | `/v1/events/{eventId}/attendance?date=`          | Present/expected and member rows for one session             |
| `POST`   | `/v1/events/{eventId}/attendance`                | Manual row `{ memberNo, date }`; `422` when not a session    |
| `DELETE` | `/v1/events/{eventId}/attendance/{id}`           | Remove a row; writes a suppression when the row was imported |
| `POST`   | `/v1/events/generate?from&to`                    | Idempotent generation from series occurrences                |

```ts
export type VenueType = 'auditorium' | 'virtual' | 'hybrid';
export type EventStatus = 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';

export interface EventSession {
  date: string;
  startTime: string;
  endTime: string | null;
  status: 'scheduled' | 'held' | 'cancelled';
  venueType?: VenueType;
  present: number;
  expected: number;
  importedRows: number;
  source: 'import' | 'manual' | 'mixed' | 'none';
}

export interface Event {
  id: string;
  /** Null for a series-minted instance until ticket 11 assigns one. */
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
  sessions: EventSession[];
  offerings: EventOffering[];
  stats: OfferingStats;
}
```

### Imports

| Method | Path                           | Result                                                    |
| ------ | ------------------------------ | --------------------------------------------------------- |
| `POST` | `/v1/imports/members`          | Rows `(memberNo, firstName, lastName, …)`, all-or-nothing |
| `POST` | `/v1/imports/attendance`       | Rows `(memberno, date, eventno)`, all-or-nothing          |
| `GET`  | `/v1/imports/formats`          | Column contract for every import kind                     |
| `GET`  | `/v1/imports/templates/{kind}` | `.xlsx` template for `members` or `attendance`            |
| `GET`  | `/v1/imports/{batchId}`        | Batch record                                              |

- JSON rows, 1 MB cap (~10k rows); larger files are chunked by the caller. The UI parses CSV or the
  downloaded `.xlsx` into these rows.
- Idempotent by natural key: members on `memberNo`, attendance on
  `(eventInstanceId, sessionDate, memberId)`.
- An unknown `eventno` or a date outside the event's `sessions` fails the attendance import. Series are
  created by an administrator or by generation, never by an import.

### Offerings and giving

| Method          | Path                                            | Result                                              |
| --------------- | ----------------------------------------------- | --------------------------------------------------- |
| `GET`/`POST`    | `/v1/offerings`                                 | List/create offering                                |
| `GET`/`PUT`     | `/v1/offerings/{id}`                            | Read/update; a change publishes a new terms version |
| `POST`          | `/v1/offerings/{id}/terms`                      | Publish a terms version                             |
| `GET`/`POST`    | `/v1/events/{eventId}/offerings`                | List/attach offerings                               |
| `DELETE`        | `/v1/events/{eventId}/offerings/{offeringId}`   | Detach (end, not delete)                            |
| `POST`/`DELETE` | `/v1/offerings/{id}/exceptions`                 | Skip or opt in a specific date                      |
| `POST`          | `/v1/contributions`                             | Member or visitor contribution (idempotent)         |
| `GET`           | `/v1/contributions?memberNo&offeringId&from&to` | Contribution history                                |
| `POST`          | `/v1/pledges`                                   | Create a pledge with a follow-up officer            |
| `GET`           | `/v1/pledges?status&memberNo&officerMemberNo`   | Pledge list                                         |
| `POST`          | `/v1/pledges/{id}/honor`                        | Append an honor event                               |
| `POST`          | `/v1/pledges/{id}/dishonor`                     | Append a dishonor event with a reason               |
| `POST`          | `/v1/pledges/{id}/reassign`                     | Assign or reassign the officer with a reason        |
| `POST`          | `/v1/pledges/{id}/reminders`                    | Schedule a reminder                                 |
| `GET`           | `/v1/offerings/summary?from&to`                 | Church landing totals                               |
| `POST`          | `/v1/ussd/session`                              | Start a USSD session (future)                       |
| `POST`          | `/v1/ussd/session/{id}/select`                  | Select offerings (future)                           |
| `POST`          | `/v1/ussd/session/{id}/commit`                  | Pay or pledge (future)                              |
| `POST`          | `/v1/payments/callback`                         | Gateway callback (future)                           |

```ts
export type OfferingKind = 'freewill' | 'tithe' | 'pledge' | 'building' | 'missions' | 'other';
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
  availableUntil: string | null;
  scripture: string | null;
  gatewayAccount: string | null;
}

export interface EventOffering {
  offeringId: string;
  name: string;
  kind: OfferingKind;
  currency: string;
  availableUntil: string | null;
  exceptions: OfferException[];
  stats: OfferingStats;
}

export interface Contribution {
  id: string;
  memberNo: string | null;
  visitorName: string | null;
  offeringId: string;
  eventInstanceId: string;
  sessionDate: string | null;
  amountMinor: number;
  currency: string;
  channel: 'app' | 'ussd' | 'manual';
  status: 'initiated' | 'paid' | 'failed';
  reference: string;
  idempotencyKey: string;
}

export interface Pledge {
  id: string;
  memberNo: string;
  offeringId: string;
  eventInstanceId: string;
  sessionDate: string | null;
  amountMinor: number;
  currency: string;
  expectedOn: string;
  followUpOfficerMemberNo: string;
  status: 'pending' | 'honored' | 'dishonored' | 'overdue';
  reason: string | null;
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
- CORS allows only the Pages origin (custom domain when configured) and local development origins.
- Only `/v1/*` is reachable through the gateway; no arbitrary URL is forwarded.
- Officers are seeded and deactivated by CLI; only active officers receive a link.
- Magic links go through a `Mailer` port: Resend in production, console/no-op in development and tests.
- Magic-link rate limits per email and per IP are stored in Postgres.

### Errors

RFC 9457 `application/problem+json` with a stable `code`: `validation_error`, `not_found`, `conflict`,
`unauthorized`, `invalid_json`, `payload_too_large`, `route_not_found`, `internal_error`,
`import_failed`, `event_not_active`, `session_not_in_event`, `offering_already_attached`,
`offering_not_on_event`, `invalid_amount`, `invalid_expected_date`, `officer_required`,
`pledge_already_terminal`, `payment_failed`, `cors_rejected`.

### Concurrency and caching

- `version` on the member row produces `ETag: "v{n}"`; `If-Match` is checked on `PUT`.
- Reassignment uses `replaceAssignmentId` as its consent checkpoint, so a stale client cannot move a
  member between shepherds.
- All member, shepherding and event-attendance responses send `Cache-Control: no-store` — the records
  are personal data.

## Data Models

All money is `bigint` minor units plus an ISO currency. History tables are append-only.
`event_instances` is the evolved `event_occurrences`; the attendance rows move with it.

| Table                      | Key fields                                                                                                                                                                                                                       | Constraints                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `event_instances`          | `id`, `event_no`, `name`, `series_id` (nullable), `ministry_code`, `timezone`, `start_date`, `end_date`, `start_time`, `end_time`, `venue_type`, `venue_name`, `description`, `status`, `source`, `sessions` (JSONB), timestamps | unique `event_no` (nullable until ticket 11 assigns one); end >= start; sessions non-empty, unique dates inside range |
| `event_attendance`         | `id`, `event_instance_id`, `session_date`, `member_id`, `source`, `import_batch_id`                                                                                                                                              | unique `(event_instance_id, session_date, member_id)`; session date in sessions                                       |
| `offerings`                | `id`, `active`, `created_at`                                                                                                                                                                                                     | soft archive; no hard delete                                                                                          |
| `offering_terms`           | `offering_id`, `version`, `name`, `purpose`, `kind`, `currency`, `target_minor`, `default_amount_minor`, `available_until`, `scripture`, `gateway_account`, `gateway_metadata`                                                   | unique `(offering_id, version)`; immutable after publish                                                              |
| `event_instance_offerings` | `id`, `event_instance_id` (nullable), `series_id` (nullable), `offering_id`, `available_until`, `attached_on`, `detached_on`                                                                                                     | exactly one of event instance or series; unique active attachment                                                     |
| `offering_exceptions`      | `offering_id`, `event_instance_id`/`series_id`, `date`, `kind` (`skip`/`opt_in`), `note`                                                                                                                                         | unique `(offering_id, event_instance_id, date)` or series variant                                                     |
| `contributions`            | `id`, `member_id` (nullable), `visitor_name`, `visitor_phone_hash`, `offering_id`, `event_instance_id`, `session_date`, `amount_minor`, `currency`, `channel`, `status`, `reference`, `idempotency_key`                          | unique `idempotency_key`; amount > 0; member XOR visitor                                                              |
| `pledges`                  | `id`, `member_id`, `offering_id`, `event_instance_id`, `session_date` (nullable), `amount_minor`, `currency`, `expected_on`, `officer_member_id`, `status`, `reason`                                                             | amount > 0; expected date not past at create                                                                          |
| `pledge_events`            | `id`, `pledge_id`, `kind`, `actor`, `reason`, `at`                                                                                                                                                                               | append-only                                                                                                           |
| `reminders`                | `id`, `pledge_id`, `scheduled_for`, `channel`, `status`, `sent_at`                                                                                                                                                               | unique `(pledge_id, scheduled_for, channel)`                                                                          |
| `ussd_sessions`            | `id`, `phone_hash`, `member_id` (nullable), `visitor_name`, `event_instance_id`, `state`, `selected_offerings`, `amount_minor`, `action`, `expires_at`                                                                           | short TTL; no raw phone in logs                                                                                       |
| `payment_intents`          | `id`, `contribution_id`, `gateway`, `reference`, `status`, `raw_callback_hash`                                                                                                                                                   | unique gateway reference                                                                                              |
| `officers`                 | `id`, `email` (lower-cased, unique), `name`, `actor_id`, `active`, timestamps                                                                                                                                                    | only active officers can sign in                                                                                      |
| `auth_magic_links`         | `id`, `officer_id`, `token_hash`, `expires_at`, `used_at`                                                                                                                                                                        | single use; short TTL                                                                                                 |
| `auth_sessions`            | `id`, `officer_id`, `token_hash`, `expires_at`, `revoked_at`, `last_used_at`, `created_at`                                                                                                                                       | revocable; credential stored hashed                                                                                   |
| `auth_rate_limits`         | `key` (`email` or `ip`), `window_start`, `count`                                                                                                                                                                                 | atomic upsert; no in-memory authority                                                                                 |

## Acceptance Criteria

### AC-1: **Given** a standalone conference, **When** it is created with three sessions, **Then** it returns `201`, carries no `seriesId`, and has a unique `eventNo`. (FR-1, FR-3)

### AC-2: **Given** an event, **When** `venueType` is `church`, **Then** the request fails with `422` and nothing is written. (FR-2)

### AC-3: **Given** duplicate session dates or a session outside the date range, **When** the event is created, **Then** the request fails with `422`. (FR-3)

### AC-4: **Given** a cancelled exception and an extra exception, **When** generation runs twice, **Then** no event exists for the cancelled date, one exists for the extra date, and the second run adds nothing. (FR-4)

### AC-5: **Given** an attendance row for a date not in `sessions`, **When** it is written, **Then** the database rejects it and the API returns `422`. (FR-5)

### AC-6: **Given** an attendance import with one unknown session date, **When** it is submitted, **Then** the whole batch fails and no row is written. (FR-6)

### AC-7: **Given** a manual row and a later import for the same key, **When** the import runs, **Then** the manual row survives; deleting an imported row writes a suppression. (FR-7)

### AC-8: **Given** a 25-row member page with `include=attendance&seriesId=`, **When** it loads, **Then** the attendance aggregate is one query and no per-member request is issued. (FR-8)

### AC-9: **Given** a published offering, **When** its terms are edited, **Then** a new version is created and the published version is unchanged. (FR-9)

### AC-10: **Given** two offerings attached to one event, **When** one is detached, **Then** it leaves the active attachments and its history remains readable. (FR-10)

### AC-11: **Given** an offering skipped on a date, **When** that date is evaluated, **Then** the offering is not offered; after `availableUntil` a new gift is rejected. (FR-11)

### AC-12: **Given** a contribution with an existing idempotency key, **When** it is posted again, **Then** the same contribution is returned and no second row is created. (FR-12)

### AC-13: **Given** a visitor with a name and phone, **When** they give, **Then** a receipt or reference is returned, no member is created, and the phone is stored hashed. (FR-13)

### AC-14: **Given** a member with no active shepherd and an offering with no default officer, **When** they pledge, **Then** the request fails with `422` and an officer-required code. (FR-14)

### AC-15: **Given** a pledge, **When** an administrator reassigns its officer with a reason, **Then** a `pledge_events` row records both officers and the reason. (FR-15)

### AC-16: **Given** a pending pledge on an expired offering, **When** it is honored, **Then** the honor succeeds while a new gift is rejected. (FR-16)

### AC-17: **Given** a pledge, **When** a reminder is scheduled twice for the same date and channel, **Then** only one reminder row exists. (FR-17)

### AC-18: **Given** a member or event attendance response, **When** its headers are inspected, **Then** `Cache-Control: no-store` is present. (FR-18)

### AC-19: **Given** a direct API write without `X-Actor-Id`, **When** it is submitted, **Then** it is rejected and nothing is written; a correction to a pledge or attendance row appends a new record instead of updating one. (FR-19)

### AC-20: **Given** a zero or negative amount, **When** a contribution is posted, **Then** it fails with `422` and `invalid_amount`. (FR-20)

### AC-21: **Given** the UI, **When** it makes a data request, **Then** it goes to the gateway with a session credential, and the API bearer is absent from the request and browser storage. (FR-21)

### AC-22: **Given** an officer, **When** they sign in, **Then** the magic link is single-use, the session expires and is revocable, and a write carries the derived `X-Actor-Id`. (FR-22)

### AC-23: **Given** an unlisted origin, **When** it calls the gateway, **Then** CORS rejects it; **Given** a path outside `/v1`, **When** it is requested, **Then** the gateway does not proxy it. (FR-23)

### AC-24: **Given** a gateway request, **When** it is served, **Then** it is rewritten to the existing `/v1` router in the same process, with no HTTP call to a second deployment. (FR-24)

### AC-25: **Given** an address that is not an active seeded officer, **When** it requests a link, **Then** no link is sent and the response is indistinguishable from a known officer; there is no enrolment form or domain rule. (FR-25)

### AC-26: **Given** the production configuration, **When** a link is sent, **Then** Resend is used through the `Mailer` port; **Given** tests, **When** a link is requested, **Then** nothing is sent and the link is captured in-process. (FR-26)

### AC-27: **Given** a signed-in browser, **When** it calls the gateway, **Then** it sends a bearer session header and the gateway sets no auth cookie; the session is only in `sessionStorage`. (FR-27)

### AC-28: **Given** two serverless instances, **When** a session or rate-limit decision is made, **Then** both read the same Postgres state; no in-memory store is authoritative. (FR-28)

## Edge Cases

- EC-1: A multi-day event where one session is cancelled: attendance is allowed for the remaining sessions only, and the cancelled date is visible but read-only.
- EC-2: An import references an `event_no` whose date is not a session: the batch fails, names the event and the date, and leaves the register unchanged.
- EC-3: A pledge's shepherd is archived after the pledge is created: the pledge keeps its officer of record, and a new follow-up requires reassignment.
- EC-4: A visitor gives twice with the same phone: two contributions and two receipts, and still no member record.
- EC-5: An offering expires mid-event: new gifts stop at the expiry instant while pending pledges remain honorable.
- EC-6: A series is archived after generating events: the generated events stay readable and no new generation occurs.
- EC-7: A session date is edited after attendance exists: the update is rejected while rows reference that session.

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
| Events storage  | `event_instances` with `sessions` JSONB; attendance keyed by event instance and session date                                                                                                                              |
| Money           | GHS, integer minor units (`bigint`)                                                                                                                                                                                       |
| Idempotency     | Unique key on contributions; retry-safe generation, imports and callbacks                                                                                                                                                 |
| Visitor privacy | Name plus hashed phone; no member record; receipt or reference returned                                                                                                                                                   |
| Browser auth    | Same Express app: magic link via Resend, Postgres session, gateway router, bearer server-side, actor derived                                                                                                              |
| Recurrence      | `rrule` package, dates handled as calendar dates                                                                                                                                                                          |
| Date handling   | All defaults and "today" are UTC; `series.timezone` is an optional override                                                                                                                                               |
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
- **Events, not a dummy series**: a standalone conference is an event with no `seriesId`. Sessions live
  in one JSONB array because they are read and written as a set, and a three-day event is one row, not
  three parent-child round trips. A trigger keeps attendance honest when a date is not a session.
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
- **Raw:** `list` (the cross-entity name/contact search), every related-table read and write (contacts,
  subscriptions, coverage, ministries, relationships, attendance, shepherding), the contact/ministry
  sub-inserts inside `create`, and the related-table deletes inside `purge`. Ticket 06 owns
  contacts/subscriptions.
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
- **Raw:** the member `list` (the cross-entity contact search), the attendance/ministries/relationships
  loaders, the shepherding assignment lifecycle (`assign`, `endAssignment`), and the roster/report/
  officer aggregates.
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
   resolution by `eventno` + date.
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
