# Spec — session offerings

**Status:** **Withdrawn 2026-11-24** by the owner, before any code was built against it. **The decision that
replaced it:** an offering is **defined at the parent event** — the attachment is event-level, one row per
(offering, event) — and it is **collected against a session**, through the per-session offering count
(`POST`/`GET /v1/events/{eventId}/offering-counts` with a `sessionDate`). The per-occurrence attachment this
spec specified, and the round it named, are **not happening**; the event-level routes stay where they are, and
the five `/v1/series/:id/offerings` aliases are deleted with the rest of `/v1/series/*`. The offering
exceptions remain keyed to the attachment. The rest of this document is kept as the record of what was
considered and rejected. **Owner, 2026-11-24:** "offerings are collected against sessions, but defined at
parent event."

**Previously:** **Approved 2026-11-22** (owner) - spec review 2026-11-22: `deepseek-v4-pro:0813` **ACCEPT** (base `a71a50e`).

**Author:** Solomon Owoo

**Date:** 2026-11-22

**Related:** `member-registrations-events-offerings.md`, `member-registrations-api.md`,
`member-registrations-ui.md`, `member-registrations-event-audience.md`,
`member-registrations-ussd.md`.

**Provenance.** Settled by the owner on 2026-11-22 in the event-as-parent grill round (recorded in
`documents/rounds/event-parent.md`), "all as recommended" with the Q5 amendment that introduced the three
person kinds. Synthesised with the `to-spec` template into this repository's spec format. This file is
the source of truth for the attachment unit, its terms pin, the per-session operator actions and the
money rows; `member-registrations-events-offerings.md` keeps the catalogue, the terms of reference, the
contributions/pledges rules and the landing, and points here for the attachment.

**Round order.** This is a **separate round after the event-as-parent (B) migration and API round**: the
occurrence rows and their ids are its prerequisite. It lands no code until that round has merged, and its
migration and wire are reviewed as that round's gates.

## Problem Statement

Offerings attach to an event today. That is one row per `(event, offering)` with per-date exceptions
layered on top, so a three-day conference has a single attachment and three different answers to "is this
offering on tonight?" — the skip/opt-in exception row, the effective `availableUntil`, and the offering's
terms version at the moment of the gift. Each surface re-derives the answer: the event detail from the
exceptions, the USSD list from the exceptions and the expiry, the count page from `sessionDate` plus the
attachment, and the summary from the contributions' own `session_date` and `terms_version`.

Four things follow that the owner cannot live with:

- **A session cannot carry its own availability.** `availableUntil` is event-level, so one Sunday cannot
  close an offering early, and the "event end" fallback is the end of the whole event.
- **Terms are not pinned per session.** A contribution records the version it was given under, but the
  attachment re-resolves to the current version for every read, so a session's money and its label can
  disagree after a publish.
- **One operator action touches every session.** Skipping or opting in is an exception row, but the
  attachment and its availability stay shared, and there is no "adjust just this Sunday".
- **The count is keyed to a date but not to the offering's state on that date.** The count row carries
  `(event, offering, session_date)` and snapshots the term version, but nothing guarantees that the
  offering was actually present on that date, so a count can exist for a session that never offered it.

The catalogue itself is healthy and must stay that way: an offering is an event-agnostic, versioned
definition that many events reuse. The defect is in the attachment unit, not the catalogue.

## Solution

The **session offering** is the attachment unit: one row per `(occurrence, offering)`, carrying its own
terms version, its own `availableUntil`, and an `active` flag. Everything that used to be asked of the
event is asked of a session:

- the offering's **presence** on that date is the row's `active`;
- its **terms** are the version pinned on the row;
- its **availability** is the row's `availableUntil`;
- its **count** is per row.

A recurring event declares its offering set on its **recurrence**; every generated occurrence receives a
session offering, and re-generation never rewrites an existing one. An operator may **skip**, **opt in**
or **adjust** one session without touching the others. Each change is an appended `session_offering_event`,
so the history explains itself.

The catalogue stays **event-agnostic and reusable**: attaching is not creating. The money rows reference
the session offering — contributions, offering counts and (where a session is named) pledges — so the
USSD list, the operator count page and the summary all read one target and cannot disagree.

The first-time-visitor/registered-visitor/full-member ladder from
`member-registrations-event-audience.md` governs who gives: a member of any status gives as themselves,
a first-time visitor gives by name and hashed phone, and an administrator can later register that giver
and promote them with the history intact.

## User Stories

1. As an event officer, I want an offering to be attached per session, so that "is this offering on
   tonight?" is one row and not a rule I have to re-derive.
2. As an event officer, I want the recurring event to declare its offering set once, so that I do not
   attach six offerings to every Sunday by hand.
3. As an event officer, I want each generated occurrence to receive that set automatically, so that next
   month's Sundays are ready before I open them.
4. As an event officer, I want to skip an offering on one Sunday, so that a one-off programme does not
   remove it from the other Sundays.
5. As an event officer, I want to opt an offering into one extra session, so that a special appeal can
   run at one meeting only.
6. As an event officer, I want to adjust one session's availability date, so that one Sunday closes
   early without closing the rest.
7. As an event officer, I want the change I made last week to survive a re-generation, so that a refresh
   never silently re-opens what I closed.
8. As an event officer, I want each session's terms version pinned, so that the session I recorded keeps
   the terms it was recorded under.
9. As an event officer, I want a later terms publish to apply to future sessions only, so that a
   correction today does not relabel last month's gifts.
10. As an event officer, I want to move one session to the current terms with a reason, so that a
    deliberate correction is possible and recorded.
11. As a member, I want the USSD offering list to be the offerings of the session I am attending, so
    that I am not offered an offering that is skipped tonight.
12. As a member, I want the amount and the confirmation to name the same session, so that my gift is
    recorded against the meeting I attended.
13. As a visitor, I want to give by name and phone without a member record, so that giving does not
    require membership.
14. As a registered visitor, I want to give as myself, so that my gifts accumulate on my record.
15. As an administrator, I want to register a first timer as a registered visitor, so that a regular
    giver stops being a first-timer row.
16. As an administrator, I want their earlier gifts to follow them, so that registration does not orphan
    a year of giving.
17. As an administrator, I want to promote a visitor to membership, so that the record I registered
    becomes the member record.
18. As the operator counting the cash, I want to count per session and per offering, so that the notes
    from the second service are not added to the first.
19. As the operator counting the cash, I want the count page to show only the offerings that session
    actually had, so that I cannot count an offering that was skipped.
20. As a finance officer, I want the reconciliation per session, per offering and per window, so that a
    variance names the service it came from.
21. As a finance officer, I want a session's counted cash compared with that session's own gifts, so that
    a deficit on Sunday evening is not masked by Monday's giving.
22. As an auditor, I want every skip, opt-in, adjustment and re-term recorded with an actor and a reason
    where one is needed, so that the history explains the current state.
23. As an auditor, I want the cutover to map every existing attachment, exception, gift, count and pledge
    onto a session offering, so that nothing is lost and no gift is reattributed.
24. As a reviewer, I want the migration to report rather than guess when a gift has no session offering,
    so that a data defect is visible instead of hidden behind a created row.

## Implementation Decisions

### B-1. The session offering

```ts
export type SessionOfferingOrigin = 'recurrence' | 'added' | 'migrated';

export interface SessionOffering {
  id: string;
  eventId: string;
  occurrenceId: string;
  /** The occurrence's date, denormalised for the money and count wires. */
  sessionDate: string;
  offeringId: string;
  /** The terms version pinned on this session. */
  termsVersion: number;
  /** This session's own expiry; null falls through to the terms, then the session date. */
  availableUntil: string | null;
  active: boolean;
  origin: SessionOfferingOrigin;
  decidedOn: string;
  decidedBy: string;
}
```

- One row per `(occurrence_id, offering_id)`, unique. The row is the **attachment**: presence is
  `active`, the terms are `termsVersion`, the availability is `availableUntil`.
- `sessionDate` is the occurrence's date, denormalised so the attendance, count, contribution and
  reporting wires keep naming a date; it is derived from the occurrence and never independently writable.
- **History is append-only.** `session_offering_events` records every state change with its id, the
  session offering, a kind (`attached` / `skipped` / `opted_in` / `adjusted` / `reterm`), the terms
  version and `availableUntil` at that moment, an optional note, the actor and the instant. The session
  offering row holds the current state; the events explain it. Nothing is deleted, and there is no
  session-offering delete route.
- **Effective expiry** of a session offering is its own `availableUntil`, else the offering's terms
  `availableUntil`, else the **occurrence's date** (the session is the last moment). An `availableUntil`
  before the session date is `422 validation_error`; the effective date is exposed with the `expired`
  flag, which is true when today (UTC) is after the effective date.
- **Presence for a reader** is an `active` row. A skipped row is present in the history and absent from
  every list of offerings.

### B-2. The recurrence's offering set

- A recurring event declares its set on the **recurrence**: `POST /v1/events/{eventId}/recurrence/offerings`
  with `{ offeringIds, availableUntil? }` (a full replacement of the recurrence default). It returns the
  resolved defaults. The `POST /v1/events` create body accepts the same block, so a new recurring event is
  one request; the first window's occurrences receive their session offerings in the same transaction.
- The default set applies to every occurrence **generated after** it is declared. `POST
/v1/events/generate` (the refresh) applies the current defaults to newly generated occurrences and
  never rewrites an existing session offering, so an operator's skip or adjustment survives a refresh.
- A standalone event has no recurrence. Its set is declared on its occurrences: the create body accepts
  `offerings: [{ offeringId, availableUntil? }]`, applied to every occurrence in the request, and each
  occurrence can then be adjusted through the session routes. There is no second attachment table.
- **Attaching is not creating.** The catalogue (`offerings` and its versioned terms) stays
  event-agnostic; a session offering references an existing `offering_id` and never creates one. An
  inactive offering cannot be attached (`422 validation_error`), and a duplicate active session offering
  is `409 offering_already_attached`.
- A past or archived event rejects a new attachment (`409 event_not_active`), and a cancelled occurrence
  rejects one (`409 event_not_active`).

### B-3. Per-session actions

| Method   | Path                                                             | Result                                                            |
| -------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET`    | `/v1/events/{eventId}/occurrences/{date}/offerings`              | The session's offerings, skipped ones included as `active: false` |
| `POST`   | `/v1/events/{eventId}/occurrences/{date}/offerings`              | Opt in or adjust one session; `201`                               |
| `PUT`    | `/v1/events/{eventId}/occurrences/{date}/offerings/{offeringId}` | Adjust `availableUntil` / `termsVersion` / `active`; `200`        |
| `DELETE` | `/v1/events/{eventId}/occurrences/{date}/offerings/{offeringId}` | Skip; `204`, history kept                                         |

- `POST` body `{ offeringId, availableUntil?, termsVersion?, reason? }`. It creates an `added` row when
  the offering is not on the session, and an `adjusted` event when it is.
- `DELETE` sets `active = false` and appends `skipped`; it never deletes the row. Skipping a session whose
  gifts already exist is allowed — the gifts stay and the offering stops being offered — because the
  money is history and the skip is about the future of that session.
- `PUT` is the adjustment path. A `termsVersion` different from the pinned one is a **re-term** and
  requires a `reason` (1-500 characters); it appends `reterm` and re-pins the row. An `active`
  transition through `PUT` appends `opted_in` or `skipped` like the dedicated routes.
- Every action is refused on an archived event or a cancelled occurrence (`409 event_not_active`), and
  an unknown occurrence date is `404 not_found`. A `termsVersion` that is not a published version of that
  offering is `422 validation_error`.
- The operator's change is never undone by generation. A session offering is created only by generation
  (for a new occurrence) and by the explicit `POST`; nothing else adds one.

### B-4. Terms pinning

- The row's `termsVersion` is the offering's **published version in force when the session offering is
  created** — when the occurrence is generated, when the operator declares the set, or when the
  migration maps it.
- A later publish does **not** change an existing session offering. New occurrences take the version
  current at their creation. A session can move to the current (or a named) version only by the
  operator's re-term action, which is recorded with its reason.
- A contribution MUST record the session offering's pinned `termsVersion`, and a gift whose request names
  a different version is `422 terms_version_conflict` (a stale client reloads). The contribution stores
  both the session offering id and the version.
- The terms view of a session shows the pinned version's terms, not the catalogue's current version.
  `GET /v1/events/{eventId}` therefore carries, per session offering, its pinned `terms` block rather
  than re-resolving the latest.

### B-5. Money rows reference the session offering

- **Contributions.** `contributions` replaces `(event_id, offering_id, session_date)` as the target with
  `session_offering_id`; `event_id`, `offering_id` and `session_date` remain denormalised read fields,
  derived from the session offering so the existing reads and reports keep their shape. The giver is
  exactly one of a **member** (`member_id`, any status — `active` or `visitor`, so a registered visitor
  gives as themselves) or a **first-time visitor** (`visitor_name` plus `visitor_phone_hash`, the
  HMAC-SHA-256 hash, no member record, the raw phone never stored). A gift to an inactive (skipped)
  session offering is a `422 offering_not_on_session` refusal; an archived event or cancelled occurrence
  is `409 event_not_active`; a session past its effective expiry is `422 offering_expired`. The
  idempotency, reference, status and append-only rules are unchanged.
- **Offering counts.** `event_session_offering_counts` replaces `(event_id, offering_id, session_date)`
  with `session_offering_id` (the three keep as denormalised read fields). The count page is per session
  offering, so its offering selector lists only that session's offerings. The denomination lines, the
  `asOf`-inside-the-session-day rule, the current-observation rule and supersession are unchanged.
- **Pledges.** A pledge references the `offering_id` and an **optional** session (the wire keeps
  `sessionDate`, stored as `occurrence_id`), not a session offering, because a pledge may be made with no
  service in mind. When a session is named it MUST resolve to an active session offering (`422
offering_not_on_session`), and the pledge records the pinned `termsVersion`. Redemption/settlement
  resolves the session offering for the redemption date (today in the event timezone): the pledge's own
  session when it has one, otherwise that date's session offering. When no active session offering
  exists, the settlement is `422 offering_not_on_session` and the operator names a session; a pledge is
  never settled against a session that did not offer it.
- **The visitor ladder** is `member-registrations-event-audience.md`'s: a first-time visitor can be
  registered as a registered visitor matched by phone and later promoted, and the history follows the
  person id through that spec's append-only first-time visitor link. No gift row is rewritten by
  registration.

### B-6. Reads and reconciliation

- **USSD.** The offering list is the **current session's** active session offerings (the occurrence being
  attended, else the next active one), minus expired ones, at most five plus `0 More`. It never mixes
  another session's offerings. A member gift and a visitor gift target the session offering that was
  listed.
- **Event detail.** Each occurrence row lists its session offerings with a `Skipped` mark for an inactive
  row, its pinned terms version and its effective `availableUntil`. The read-only Active offerings panel
  becomes per session; there is one attach action per session (or, for a recurring event, on the
  recurrence's set).
- **Operator count page.** The event → session → session-offering picker drives the denomination grid,
  the current observation and the correction path; the offering selector offers only that session's
  active session offerings.
- **Summary.** `GET /v1/offerings/summary?from&to` gains a `sessions[]` array — one row per session
  offering in the window — and every `offerings[]`/`events[]`/total row is the sum of those rows. Each
  session row carries the event, the event name, the session date, the offering and its name,
  `paidMinor`, `countedMinor` and `varianceMinor`, and the variance is that session's counted cash minus
  **its own** recorded gifts (member plus visitor). Counted cash is still the current observation of each
  session offering only. The rules for the reporting currency, the pledge measures and the visitor block
  are unchanged, and no figure is attributed to a session other than the one the gift or count names.
- **Church landing.** The per-session rows are exposed on the summary; the landing may keep the
  rolled-up cards and adds the session breakdown as the reconciliation view.

### B-7. Migration and backfill

Lands after the event-parent migration (occurrence ids exist). One transaction, deterministic order,
idempotent by natural key; a second run adds nothing.

1. Create `session_offerings` and `session_offering_events`; add `session_offering_id` to
   `contributions` and `event_session_offering_counts` (nullable, backfill, then `not null`); add
   `pledges.occurrence_id` (nullable).
2. For every `event_offerings` row on event `E`, create one session offering per occurrence of `E` where
   the offering was present under the old rules: present for every occurrence except a date carrying an
   effective `skip` exception. `origin = 'migrated'`.
3. `termsVersion` per session: the contribution `termsVersion` when a contribution exists for that
   `(offering, session date)`; otherwise the offering's current published version. `availableUntil` from
   the old attachment. `active = true`.
4. An attachment that came from the series becomes the event's **recurrence default set**, so newly
   generated occurrences receive it; an attachment made on a single occurrence stays a migrated session
   offering on that date.
5. Contributions: resolve `(event, offering, session date)` to the session offering and set
   `session_offering_id`. Where no session offering exists — money recorded on a date the offering was
   not attached — create one with `origin = 'migrated'` so the gift keeps its target, and report the row;
   a gift is never dropped and never reattributed to another date.
6. Counts: the same resolution, with the same create-and-report rule.
7. Pledges: set `occurrence_id` from `session_date` where present; a pledge with no session stays
   offering-only.
8. First-time visitor gifts: where the phone hash resolves through
   `first_time_visitor_identities` (the audience spec's append-only link), the gift is attributed to that
   member for reads; no member is created and no gift row is rewritten.
9. The old `event_offerings` and `offering_exceptions` tables are **kept read-only** for the transition
   and retired in a later round; this migration does not drop them, so a rollback is a code revert.

The backfill is verified by conservation: the paid total per `(event, offering, date)` before and after
the migration is equal, the set of offerings the USSD list shows for a future session is unchanged, and
every count keeps its current observation.

### B-8. Wire summary

| Surface             | Before                                     | After                                                 |
| ------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Event offering list | `GET /v1/events/{id}/offerings` (event)    | per session, plus `…/recurrence/offerings` defaults   |
| Attachment          | `POST /v1/events/{id}/offerings`           | `POST …/occurrences/{date}/offerings`                 |
| Detach              | `DELETE /v1/events/{id}/offerings/{oid}`   | `DELETE …/occurrences/{date}/offerings/{oid}` (skip)  |
| Exceptions          | `…/offerings/{oid}/exceptions` skip/opt_in | per-session `POST`/`PUT`/`DELETE`; no exception table |
| Contribution target | `eventId` + `offeringId` + `sessionDate`   | `sessionOfferingId` (the three kept as read fields)   |
| Count target        | `eventId` + `offeringId` + `sessionDate`   | `sessionOfferingId` (the three kept as read fields)   |
| Pledge session      | `sessionDate` optional                     | `sessionDate` optional (stored as `occurrence_id`)    |
| Summary             | `offerings[]`, `events[]`                  | plus `sessions[]`; the others sum it                  |

The existing request field names stay valid during the transition: a request that sends `eventId`,
`offeringId` and `sessionDate` resolves the same session offering, so the UI and the USSD flow move in
their own rounds without a flag day.

### B-9. Errors

| Status | Code                        | Where                                                       |
| ------ | --------------------------- | ----------------------------------------------------------- |
| `409`  | `offering_already_attached` | A duplicate active session offering                         |
| `409`  | `event_not_active`          | Archived event, cancelled occurrence                        |
| `422`  | `offering_not_on_session`   | A gift, count or settlement on an inactive session offering |
| `422`  | `offering_expired`          | A gift on a session past its effective expiry               |
| `422`  | `terms_version_conflict`    | A gift or re-term naming a different version                |
| `422`  | `validation_error`          | Bad `availableUntil`, unpublished `termsVersion`, bad body  |
| `404`  | `not_found`                 | Unknown event, occurrence date, offering or id              |

## Testing Decisions

- Tests assert **external behaviour**: the API response, the persisted row, the computed total. No test
  asserts a private helper or a SQL fragment, and no test depends on the row ids the migration happens to
  mint.
- **API routes.** Extend the existing `tests/api/offerings.test.ts`, `tests/api/contributions.test.ts`,
  `tests/api/event-offering-counts.test.ts` and `tests/api/pledges.test.ts` patterns with session cases:
  a recurrence declares a set and each generated occurrence receives it; a skip on one session leaves the
  others; a re-generation does not reopen a skip; an adjustment survives a refresh; a gift to a skipped
  session is `422 offering_not_on_session`; a gift records the pinned version; a later publish leaves the
  session's version and label unchanged; a re-term with a reason moves it and records the event; a
  settlement resolves the redemption date's session. Each case asserts the response and the row.
- **Per-session reconciliation.** A test with two sessions, gifts and counts on each, asserts the
  summary's `sessions[]`, that each variance is that session's counted cash minus its own gifts, and that
  the rolled-up total is the sum. This is the test that fails if a gift is attributed to the wrong date.
- **DB migration and backfill, the `tests/db/event-instances.test.ts` pattern.** A new
  `tests/db/session-offerings-backfill.test.ts` seeds an event-level attachment with a skip, a gift, a
  count and a pledge, runs the migration on PGlite, and asserts: one session offering per occurrence
  except the skipped date, the pinned versions, the contribution/count targets, the recurrence default,
  the offering-only pledge, and that a second run adds nothing. A seeded gift on a date with no
  attachment is reported and keeps its target. `tests/db/schema-drift.test.ts` covers the new tables.
- **USSD.** The `tests/api/ussd-activities.test.ts` / `tests/api/ussd.test.ts` patterns: the list is the
  current session's offerings, a skipped offering is absent, a visitor gift targets the session
  offering, and the confirmation names the same session.
- **UI.** The event detail's per-session offering panel and skip mark, the count page's session →
  offering picker (only that session's offerings), and the register-as-visitor entry, at the DOM level and
  in the existing e2e lane. No new harness.

## Out of Scope

- **A second catalogue.** The offering definition and its versioned terms are unchanged; only the
  attachment moves.
- **Multi-currency and FX.** One currency per offering, as today.
- **Refunds and contribution corrections.** Append-only, as today; a correction is a new record.
- **A per-session pledge schedule.** A pledge names an optional session; it does not split into sessions.
- **Automatic re-terming.** A session moves to a new version only by an operator's action with a reason.
- **A session-level target amount.** The offering's target stays on its terms.
- **Deleting the old attachment tables in this round.** They stay read-only for the transition.
- **Re-opening a closed session or an archived event.** The existing refusals stand.
- **A per-offering audience.** The audience is the event's, as
  `member-registrations-event-audience.md` defines it.
- **Payment-gateway and USSD aggregator integration.** Contracts only, as today.

## Further Notes

- **Why the session, not the event.** The event-level attachment is a projection of "the offering runs
  for the whole event"; every exception is a correction to that projection. Making the session the unit
  deletes the projection and its corrections: presence, availability, terms and count are all facts about
  one date.
- **Why the recurrence declares the set.** Attaching to every occurrence by hand is the thing an operator
  would forget; declaring it once and letting generation materialise it keeps the common case free while
  every session stays individually addressable.
- **Terms pinned per session.** The alternative — resolve the current version on every read — is what the
  spec does today, and it makes a publish rewrite history's label. Pinning costs a re-term action when an
  operator really wants a session on the new version, which is the honest price.
- **The migration reports rather than invents.** A gift on a date the offering was not attached is a data
  defect; the migration creates the session offering so the money survives, and reports the row so the
  round can look at it. Silence would hide a real inconsistency.
- **The visitor ladder is not redefined here.** Giving by a first-time visitor's name+phone, registering
  that giver and promoting a registered visitor are defined in
  `member-registrations-event-audience.md`; this spec only says
  which of those persons a contribution row records and that no row is rewritten by registration.
- **Rollback.** Every migration step is additive in this round: the old tables and columns stay, the new
  ones are additive and nullable until backfilled, and reverting is a code revert plus a down migration
  that drops only the new tables. No money row loses its original target.
- **Round order and gates.** This spec is a separate round after the event-parent migration and API
  round; the occurrence ids are its prerequisite. Its own migration and wire are reviewed as that
  round's gates, and the owner authorises that round by name before any code or data moves.
