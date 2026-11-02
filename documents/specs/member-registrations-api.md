# Spec — MemberRegistrations API

|            |                                                                              |
| ---------- | ---------------------------------------------------------------------------- |
| Status     | **Approved 2026-11-02** — shepherding amendment approved; v1 in build        |
| Date       | 2026-11-02                                                                   |
| Repo       | `MemberRegistrations` (standalone repository)                                |
| Origin     | Conversational feature request, 2026-11-02                                   |
| Supersedes | The Blob/local-JSON revision of this spec (persistence replaced by Postgres) |

---

## Problem Statement

The church keeps member registrations keyed by member number, carrying personal demographics,
contacts, service subscriptions, ministry assignments and attendance. There is no API surface to look
a member up, no CRUD API over the register, and no trustworthy way to answer "how often did this
member attend the Sunday service this quarter?".

Attendance currently arrives as two unrelated imports — an event list (`date`, `eventno`,
`eventname`, `by_ministryname`) and an attendance registry (`memberno`, `date`, `eventno`) — and is
reported as free text such as `eventname1 - 2 out of 5`. Nothing defines what the "5" is, so the
number cannot be computed, audited or trusted.

## Solution

A standalone **Express 5 + TypeScript** API on **Node.js 24 LTS**, persisted in **Postgres (Neon)**,
deployed to Vercel as a single function.

- Attendance is **modelled, not transcribed**: an event series declares a recurrence, occurrences are
  derived from it and refined by imported event lists, and a member's record shows
  `attended` / `expected` per series.
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
6. As an administrator, I want to import event lists and attendance registries idempotently, so that
   re-running a file is safe and a bad file changes nothing.
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

### Occurrences and attendance

An **occurrence** is a date on which a series actually met:

1. Expand the schedule version in force on each date within the window.
2. Remove `cancelled` exceptions, add `extra` exceptions.
3. Where an imported event list covers a range (the span between its first and last imported date),
   the imported dates are authoritative for that range: a scheduled date absent from the import was
   not held, and an imported date off-schedule was.

**Attendance row**: `{ id, memberId, seriesId, date, source: import | manual }`, unique on
`(memberId, seriesId, date)`.

- A `manual` row shadows an `import` row for the same key; a later import must not overwrite it.
- Deleting a `manual` row deletes it. Deleting an `import` row writes a **suppression** so the next
  import cannot resurrect it.
- Attendance may only be recorded for an occurrence that was actually held.

**Attendance count** for a member and series:

```
windowStart = max(first schedule effectiveFrom, member.joinedOn ?? registration date)
windowEnd   = min(endsOn ?? today, today)
expected    = |occurrences in [windowStart, windowEnd]|
attended    = |attendance rows in that window|
```

The DTO reports `attended`, `expected`, `remaining` and `status: ongoing | completed | in_progress`.
Extras count when held; cancellations do not.

### Import batch

Every import is one transaction and one `import_batch` row (`kind`, `actor`, `rowCount`, `checksum`,
`createdAt`). Row-level errors fail the whole request with a `422` report; there is no partial apply.

## API Surface

All routes are under `/v1` except `/health` and `/openapi.json`. Every route requires bearer auth;
every write requires `X-Actor-Id`.

### Members

| Method   | Path                                               | Result                                                                    |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET`    | `/v1/members`                                      | Paged summary list (`q`, `contact`, `includeArchived`, `limit`, `cursor`) |
| `POST`   | `/v1/members`                                      | `201` + `Location`; `409` duplicate member number                         |
| `GET`    | `/v1/members/{memberNo}`                           | Full DTO + `ETag`; `404` unknown/archived unless flagged                  |
| `PUT`    | `/v1/members/{memberNo}`                           | Update; stale `If-Match` → `409`                                          |
| `DELETE` | `/v1/members/{memberNo}`                           | Archive; `204`                                                            |
| `POST`   | `/v1/members/{memberNo}/restore`                   | Un-archive; `409` when not archived                                       |
| `POST`   | `/v1/members/{memberNo}/purge`                     | Hard delete PII; body must repeat the member number                       |
| `GET`    | `/v1/members/{memberNo}/attendance`                | Per-series counts + rows                                                  |
| `POST`   | `/v1/members/{memberNo}/attendance`                | `{ seriesId, date }`; `422` when not a held occurrence                    |
| `DELETE` | `/v1/members/{memberNo}/attendance/{attendanceId}` | Remove a row (writes a suppression for imports)                           |
| `POST`   | `/v1/members/{memberNo}/contacts`                  | Add contact; `409` on duplicate value                                     |
| `PUT`    | `/v1/members/{memberNo}/contacts/{contactId}`      | Update kind/value/order                                                   |
| `DELETE` | `/v1/members/{memberNo}/contacts/{contactId}`      | Remove contact                                                            |
| `POST`   | `/v1/members/{memberNo}/contacts/link`             | Link another member's contact (dependent sharing)                         |
| `DELETE` | `/v1/members/{memberNo}/contacts/link/{contactId}` | Unlink                                                                    |
| `POST`   | `/v1/members/{memberNo}/subscriptions`             | Create subscription (optional coverage)                                   |
| `DELETE` | `/v1/members/{memberNo}/subscriptions/{id}`        | End subscription                                                          |
| `POST`   | `/v1/subscriptions/{id}/coverage`                  | Add a covered member                                                      |
| `DELETE` | `/v1/subscriptions/{id}/coverage/{memberNo}`       | Remove a covered member                                                   |
| `POST`   | `/v1/members/{memberNo}/ministries`                | Assign by ministry `code`                                                 |
| `DELETE` | `/v1/members/{memberNo}/ministries/{code}`         | Unassign                                                                  |
| `GET`    | `/v1/members/{memberNo}/relationships`             | Spouse, dependents, guardians                                             |
| `POST`   | `/v1/members/{memberNo}/relationships`             | `{ relatedMemberNo, type, isDependent }`                                  |
| `DELETE` | `/v1/members/{memberNo}/relationships/{id}`        | Remove the edge                                                           |

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

### Imports

| Method | Path                     | Result                                                           |
| ------ | ------------------------ | ---------------------------------------------------------------- |
| `POST` | `/v1/imports/events`     | Rows `(date, eventno, eventname, ministryName?)`, all-or-nothing |
| `POST` | `/v1/imports/attendance` | Rows `(memberno, date, eventno)`, all-or-nothing                 |
| `GET`  | `/v1/imports/{batchId}`  | Batch record                                                     |

- JSON, 1 MB cap (~10k rows); larger files are chunked by the caller.
- Idempotent by natural key: events upsert on `(seriesId, date)`, attendance on
  `(memberId, seriesId, date)`.
- An `eventname` with no matching series fails the import and returns the unknown names. Series are
  created by an administrator, never by an import.

### Errors

RFC 9457 `application/problem+json` with a stable `code`: `validation_error`, `not_found`, `conflict`,
`unauthorized`, `invalid_json`, `payload_too_large`, `route_not_found`, `internal_error`,
`import_failed`.

### Concurrency and caching

- `version` on the member row produces `ETag: "v{n}"`; `If-Match` is checked on `PUT`.
- Reassignment uses `replaceAssignmentId` as its consent checkpoint, so a stale client cannot move a
  member between shepherds.
- All member and shepherding responses send `Cache-Control: no-store` — the records are personal data.

## Implementation Decisions

| Concern         | Choice                                                                      |
| --------------- | --------------------------------------------------------------------------- |
| Runtime         | Node.js 24 LTS                                                              |
| Language        | TypeScript 5.9, `strict`, ESM                                               |
| HTTP            | Express 5                                                                   |
| Validation      | Zod 4                                                                       |
| Contract        | OpenAPI 3.1 generated from Zod via `z.toJSONSchema`                         |
| Database        | Postgres — Neon in production, PGlite in tests                              |
| Access layer    | Parameterised SQL behind a two-method `Db` port (`pg` / PGlite)             |
| Migrations      | Embedded SQL applied by a tracked runner                                    |
| Recurrence      | `rrule` package, dates handled as calendar dates                            |
| Date handling   | All defaults and "today" are UTC; `series.timezone` is an optional override |
| Testing         | Vitest 5 + Supertest 7 + PGlite                                             |
| Logging         | Pino 10 (JSON)                                                              |
| Lint / format   | ESLint 10 flat config + Prettier 3                                          |
| Package manager | npm 11, lockfile committed                                                  |

### Why these choices

- **Postgres over document storage**: attendance counts are relational aggregation. A document store
  turns "2 of 5" into application-side aggregation over unbounded arrays.
- **A thin SQL port over an ORM**: the denominator engine and the occurrence queries are SQL-shaped,
  and every ORM abstraction had to be escaped to write them. The port is two methods (`query`,
  `transaction`) with `pg` in production and PGlite in tests; repository methods own the SQL and the
  row-to-DTO mapping, so the seam that matters stays explicit.
- **PGlite for tests**: real Postgres semantics in-process, so `generate_series`, date arithmetic and
  constraints behave the same as production without Docker.
- **Name search uses `ILIKE`**, not `pg_trgm`: a register of a few thousand members does not justify
  the extension, and PGlite parity is worth more than an index that is invisible at this size.

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
    attendance.ts       # denominator engine
    shepherding.ts      # latest-known status, counts, coverage rules
  repos/                # members, ministries, series, occurrences, imports, shepherding
  routes/               # members, subscriptions, ministries, series, imports, shepherding
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

Tests assert external behaviour — responses, persisted rows, computed counts — not internal call
sequences.

## Deployment

- Vercel Function, region pinned in `vercel.json` (`fra1`; change to the users' region).
- Neon Postgres via the Vercel Marketplace integration; `DATABASE_URL` is injected as an environment
  variable. Use the **pooled** connection string.
- `API_BEARER_TOKEN` is required in production.
- Migrations run as an explicit step (`npm run db:migrate`), never automatically on request.
- Vercel's 4.5 MB body limit still applies; the app caps JSON at 1 MB, so imports are chunked.

## Out of Scope (v1)

- UI of any kind, including the import upload screen (V2).
- Migration of existing registrations (V2, through that UI).
- Automatic/scheduled imports (cron).
- Duplicate-person merge.
- Multi-tenancy, SSO, per-user tokens, rate limiting.
- Per-officer authorization or data scoping: v1 keeps one shared bearer token, and `X-Actor-Id` is
  audit attribution, not identity. Any authenticated actor can assign or log for any officer.
- Shepherding cadence targets, overdue flags, reminders, or SMS/email notification; the API exposes
  `lastCalledOn` and `membersNeverCalled` instead.
- Bulk assignment in one request.
- Email/SMS notification, reporting exports.
