# Spec — event audience, membership status and visitor identity

**Status:** **Approved 2026-11-22** (owner) - spec review 2026-11-22: `deepseek-v4-pro:0813` **ACCEPT** (base `a71a50e`). Amended 2026-11-22; **amended 2026-11-24** ("all as recommended", audience-predicate round): the regularity window moves onto the predicate, an unauthenticated caller sees `Everyone` only, `?ministry=` resolves through the legacy projection, and A-7 step 5 is all-or-nothing. (clarifying, migration round): the migration seeds **six** fixed system audiences, not seven — the A-2 table is the count of record (`Everyone`, `Presbyters`, `Children 0-12`, `Youth 13-17`, `Adults 18+`, `Visitors only`) plus one per ministry.

**Author:** Solomon Owoo

**Date:** 2026-11-22

**Related:** `member-registrations-api.md`, `member-registrations-ui.md`,
`member-registrations-events-offerings.md`, `member-registrations-session-offerings.md`,
`member-registrations-ussd.md` (the member-facing list it governs).

**Provenance.** Settled by the owner on 2026-11-22 in the event-as-parent grill round (recorded in
`documents/rounds/event-parent.md`), including the Q5 amendment that introduced the three person
kinds. Synthesised with the `to-spec` template into this repository's spec format. This file is the
source of truth for the audience rule, its evaluation, the membership status and visitor identity;
the three area specs point here instead of restating them. No code, migration or mock changes in this
round: the spec is reviewed and approved first.

## Problem Statement

An event's applicability is currently two columns: an optional `ministry_id` and a `presbyter_only`
flag. Those two facts decide three different things — the roster the attendance report calls `expected`,
which events a member sees in USSD and in Activities, and what the event form asks for. Each surface
re-implements the pair, so the rule lives in several places and every new grouping needs another column
and another branch. The member regularity window in the USSD spec also read the pair; the audience-predicate
round (2026-11-24) moves it onto the same rule, so there is one predicate and one read.

The pair cannot express the groups the church actually runs: "children and youth", "everyone except the
choir", "adults", "the choir's presbyters", "our visitors". An operator who needs one of those either
creates a ministry per grouping (polluting reference data that members are assigned to) or accepts that
the event is visible to the wrong people and its roster is wrong.

Visitor identity has the same shape of gap. An offering may be given to by name and phone with no
member record, which is right for a one-off gift. But a regular giver who is not yet a member has no
record to become, so an administrator cannot register them, cannot later promote them, and cannot see
the giving history of the person who is now a member. The church ends the year with first-timer rows and
no way to join them to the person.

Finally, the rules are current-state only and nobody has said so. The roster already reads the current
ministry membership with no history, and the presbyter flag likewise; adding a member to the choir
today silently changes what last quarter's choir events report. That is an acceptable limit, but it must
be written down where the rule is defined rather than discovered in a report.

## Solution

An **audience** is a saved, named group with a rule. An event references one audience by
`audienceId`. The rule is evaluated in one place — one predicate, one implementation — and consumed by
every surface that asks "does this member belong to this event?":

- the roster and therefore the attendance report's `expected` and the summary's ratio;
- member-facing visibility: the USSD Activities list, the USSD offering list, and the member-scoped
  routes;
- the event detail's per-occurrence roster summary.

An officer's back-office read is unaffected: the bearer sees every event.

The rule is a single `allOf` / `anyOf` / `noneOf` over a closed set of member attributes: **ministry
membership**, **presbyter**, **age band**, **gender**, and **membership status**. System audiences are
seeded and not editable (`Everyone` as `allOf(membershipStatus active)`, `Presbyters`,
`Children 0-12`, `Youth 13-17`, `Adults 18+`, one per ministry, and `Visitors only`); custom audiences
are reference data managed on a new **Audiences** page
under Admin. `Choir · presbyters` is `allOf(ministry CHR, presbyter)`; `Children or Youth` is
`anyOf(age 0-12, age 13-17)`; `Everyone except Choir` is `noneOf(ministry CHR)`.

The event form's single **Audience** picker replaces the separate Ministry field and Presbyter-only
toggle. Those two groups survive as options inside the picker (the seeded ministry audiences and
`Presbyters`), in the slot the mock gives the Ministry field.

The member model gains a **membership status**: `visitor`, `active` or `archived`. There are three
person kinds:

- **First-time visitor** (short form **first timer**) — not known. Name plus phone is the identity, the
  phone is stored hashed and rendered masked, and there is no member record.
- **Registered visitor** — a member record with `visitor` status, which an administrator later promotes
  to full membership.
- **Full member** — a member record with `active` status.

The member add accepts the visitor status; registering a first timer as a registered visitor is an
administrator action matched by phone; promoting a registered visitor to full member is an administrator
action. Giving and attendance history follows the person id, so a promotion loses nothing.

The **headcount** is the general count of the gathering and includes first-time visitors, counted in its
`visitors` lane; the named attendance is members and registered visitors only, and a first-time visitor
is never an attendance row. The headcount and the named attendance are reconciled, never added (A-5a).

Age is evaluated **at the occurrence date**. Ministry membership and presbyter status use the current
register, with no history — a stated limit, not a defect. An event with `tracksMembers = false` keeps its
audience for visibility and has no per-member roster. A first-time visitor has no member record and is
outside every audience.

## User Stories

1. As an administrator, I want to save a named group with a rule, so that I define "children and youth"
   once and attach it to every event that needs it.
2. As an administrator, I want seeded groups for everyone, presbyters, children, youth, adults, each
   ministry and visitors, so that the common events need no setup at all.
3. As an administrator, I want the event form to ask for one audience, so that I do not have to reason
   about how a ministry and a presbyter toggle combine.
4. As an administrator, I want the ministry and presbyter groups to appear as options in that picker, so
   that an existing habit still works with one click.
5. As an administrator, I want "the choir's presbyters" expressed as one audience, so that a presbyters'
   study for a ministry is one choice and not a new ministry.
6. As an administrator, I want "everyone except the choir", so that a church-wide event can exclude one
   ministry without listing the other five.
7. As an administrator, I want to see the rule behind an audience in words, so that I can confirm what a
   reused group actually contains before attaching it.
8. As an administrator, I want a system audience to be visibly system-owned and uneditable, so that a
   rename cannot quietly change the meaning of ten events.
9. As an administrator, I want to create and edit a custom audience on an Admin page, so that reference
   data is maintained in the back office and not by a database visit.
10. As an administrator, I want to archive a custom audience that is no longer offered, so that the
    picker stays short without rewriting the events that already use it.
11. As an event officer, I want the event's roster to be the audience evaluated at that date, so that
    "expected" has a definition I can state.
12. As an event officer, I want the attendance report, the event summary and the roster to agree, so that
    two screens cannot disagree about the same evening.
13. As an event officer, I want a headcount-only event to keep its audience for visibility, so that
    restricting who may see a service does not force a per-member roster.
14. As an event officer, I want the back office to show every event whatever its audience, so that I can
    record attendance and counts for a restricted service.
15. As a member, I want the USSD Activities list and its offering list to show only events my audience
    covers, so that I am not offered a presbyters' study or another ministry's meeting.
16. As a member, I want a restricted event to be absent rather than refused, so that the phone flow tells
    me nothing about events I may not see.
17. As a guardian, I want my minor's events visible to me, so that I can see and act on what my child has
    on.
18. As a member, I want my age judged on the occurrence date, so that a youth event on my eighteenth
    birthday is not still offered to me as youth.
19. As a member, I want my ministry and presbyter status read from the current register, so that the
    list follows my assignment today even though history is not kept.
20. As an administrator, I want to register a member as a visitor, so that a person who is not yet a full
    member still has one record.
21. As an administrator, I want to register a first timer as a registered visitor from their gift,
    matching by phone, so that a regular giver stops being a first-timer row.
22. As an administrator, I want the giving history to follow the newly registered person, so that their
    first year of gifts is not orphaned.
23. As an administrator, I want to promote a registered visitor to full membership, so that the record
    grows into a member record without a second record being created.
24. As an administrator, I want a "Visitors only" audience, so that a newcomers' event targets the
    registered visitors without a hand-built rule.
25. As a member, I want my gifts and attendance to stay with me through a promotion, so that my history
    is one history.
26. As a finance officer, I want a visitor's gifts to remain separate from member totals until the person
    is registered, so that the two populations are still reported separately.
27. As a reviewer, I want the migration to map every existing ministry and presbyter-only event onto an
    audience, so that nothing changes meaning on the cutover.

## Implementation Decisions

### A-1. The audience and its rule

- An **audience** is reference data: `{ id, name, system, active, rule, summary, createdAt, createdBy,
updatedAt, updatedBy }`. `summary` is the server-rendered sentence the UI shows ("Choir · Presbyters —
  ministry CHR and presbyter"); the UI MUST NOT compose it. `system` marks a seeded audience.
- The rule is exactly one operator over a flat list of clauses. There is no nesting in this round:

  ```ts
  export type AudienceOperator = 'allOf' | 'anyOf' | 'noneOf';

  export type AudienceClause =
    | { attribute: 'ministry'; ministryCode: string }
    | { attribute: 'presbyter'; value: true }
    | { attribute: 'ageBand'; minYears: number; maxYears: number | null }
    | { attribute: 'gender'; value: 'male' | 'female' }
    | { attribute: 'membershipStatus'; value: 'visitor' | 'active' };

  export interface AudienceRule {
    operator: AudienceOperator;
    clauses: AudienceClause[];
  }
  ```

- `allOf` matches when every clause matches; `anyOf` when at least one does; `noneOf` when none does.
  `noneOf` is **not** the negation of the whole rule — it is "matches none of these clauses", which is
  what "everyone except the choir" means.
- A rule MUST carry at least one clause. The API rejects an empty `allOf`, `anyOf` or `noneOf` with
  `422 validation_error`: an empty `allOf` and an empty `noneOf` would each be vacuously true, while an
  empty `anyOf` is always false — none is a group an operator can see or reason about. **No seeded group
  uses the empty `allOf`**, and an unconstrained group is expressed by the explicit `membershipStatus
active` clause (that is what `Everyone` is). There is no "matches everybody" shorthand.
- `minYears`/`maxYears` are **completed years, inclusive**, at the evaluation date; `maxYears: null` is
  open-ended. A band with `minYears > maxYears` or a negative bound is `422 validation_error`. A member
  with no `dob`, or a `dob` in the future, matches **no** age band; a 29 February birthday is reached on
  1 March in a non-leap year, the derivation the member read already uses.
- `gender` matches the stored value. `other` and `undisclosed` match neither seeded gender clause; a
  group that must include an unknown gender cannot be expressed this round (recorded in Out of Scope).
- `ministry` matches an active `member_ministries` row to an active ministry with that code. An unknown
  or inactive ministry code is `422 validation_error` on write; an audience whose ministry is later
  deactivated keeps its rule and matches nobody until a ministry with that code is active again
  (reference data is deactivated, never deleted).
- `presbyter` matches `members.is_presbyter = true`; the clause's only legal value is `true`, because a
  "not a presbyter" group is `noneOf(presbyter)`.
- `membershipStatus` names `visitor` or `active`. `archived` is deliberately not selectable: an archived
  member is not a target group, and an audience that named it would resurrect archived records.

### A-2. The seeded audiences

| Name          | System key        | Rule                               | Editable |
| ------------- | ----------------- | ---------------------------------- | -------- |
| Everyone      | `everyone`        | `allOf (membershipStatus active)`  | no       |
| Presbyters    | `presbyters`      | `allOf (presbyter)`                | no       |
| Children 0-12 | `age:0-12`        | `allOf (ageBand 0-12)`             | no       |
| Youth 13-17   | `age:13-17`       | `allOf (ageBand 13-17)`            | no       |
| Adults 18+    | `age:18+`         | `allOf (ageBand 18-null)`          | no       |
| `‹Ministry›`  | `ministry:‹code›` | `allOf (ministry ‹code›)`          | no       |
| Visitors only | `status:visitor`  | `allOf (membershipStatus visitor)` | no       |

- `Everyone` is the **active register**: `allOf(membershipStatus active)`. It is the default on the event
  form and the backfill's group for an event with no ministry and no presbyter flag, and it does **not**
  include a registered visitor. `Visitors only` is its counterpart for the visitor population.
- The ministry audiences are seeded one per ministry, including an inactive ministry (so history keeps
  its label); a ministry created after the migration gets its audience in the same transaction as the
  ministry row. The display name follows the ministry's current name; renaming a ministry renames its
  audience label without a new audience.
- `Visitors only` is added to the owner's enumerated seed list: the Q5 amendment names it as the target
  for registered visitors, and it must exist once per register rather than be hand-built.
- System audiences are read-only. `PUT /v1/audiences/{id}` on one answers `409 audience_system`. They
  cannot be archived, and no route deletes an audience.

### A-3. Evaluation: one rule, one predicate

- The rule is evaluated **at a date** (an occurrence's date for the roster and for visibility of that
  occurrence; today for a member-facing summary that asks about "my events").
- A member is **in the evaluated register** when they are not purged, not archived, and their joined date is
  null or `<= date` — where a null `joined_on` falls back to the member record's creation date, so a member
  created after the occurrence is excluded from it. This is the predicate today's roster uses, and it applies to
  visibility too: a member does not see an occurrence dated before they joined.
- **Age is at the date.** Ministry membership, presbyter status and membership status are **current**,
  with no history: a member added to the choir today changes what the choir's audience reports for past
  dates, and a presbyter who steps down stops matching past presbyters' events. The register keeps no
  membership history, so retroactive accuracy is not offered; this limit MUST be stated in the Audiences
  page hint and in the event detail's audience caption.
- Ministry membership carries **no `assigned_on` floor** in the audience rule, for the same reason: the
  register keeps no ministry history. The member regularity window in the USSD spec **moves onto this rule** in
  the audience-predicate round (2026-11-24), so its floor and its general/ministry scope go with it - a member's
  regularity can change as a result.
- The roster and the visibility predicate MUST be the same implementation. A test asserts they agree
  for the same member, date and audience; a second copy of the rule is a defect.
- `expected` is the count of evaluated members matching the rule at the occurrence date. It is not
  computed for a `tracksMembers = false` event, where no per-member roster exists.
- A first-time visitor (no member record) is **outside every audience** and never contributes to
  `expected`. A **registered visitor is evaluated only when the rule names the `visitor` status** — as a
  clause, or as an arm of an `anyOf` — and matches nothing otherwise, whatever other attributes they
  have. A rule that names only `membershipStatus active` (such as `Everyone`) therefore excludes
  registered visitors, and `Visitors only` is the one seeded group that includes them.
- **Roster age is at the occurrence date, but a displayed attendance row is not.** The roster evaluates
  the member's completed years at that occurrence's date; the attendance report and its rows display the
  member's **current** age, as every member DTO does. The two are deliberately different numbers and
  neither is recomputed from the other.

### A-4. Visibility

- **Back office.** Every bearer read sees every event, its roster, its attendance and its offerings.
  The audience is not an authorization control for officers; V2 has no per-officer authorization
  (`AGENTS.md` §6) and this spec does not create one.
- **Member-facing.** The USSD Activities list, the USSD event and offering list, and the member-scoped
  routes show an occurrence when the member matches the event's audience at that occurrence's date. The
  event is visible when at least one occurrence in the read window matches.
- A hidden event is **absent**, not refused: it is omitted from the USSD list and answers the existing
  hidden `404` on a member-scoped route. There is no `403` and no message that implies an event exists.
- **An unauthenticated caller sees the `Everyone` audience and nothing else.** A first-time visitor has no record
  and matches no rule, so applying the rule literally would empty the pre-login Activities list; an anonymous read
  therefore returns the events whose `audienceId` **is** the seeded `Everyone` audience, without evaluating any rule.
  A cancelled occurrence is absent from that list, as it is from every member-facing list. Age-band, `anyOf` and `noneOf` events are therefore
  absent until someone signs in, and a ministry-restricted event is never public - the legacy "general" pair
  derived an age-band event to general, and is not used for this.
- A `Presbyters` audience is therefore hidden from non-presbyters by the ordinary rule; the
  `presbyter_only` special case is retired.
- **Guardian.** An occurrence visible to a member under 18 at its date is also visible to that member's
  **direct guardian** (a `guardian` relationship edge), so a parent sees a child's youth event. A
  chained guardian (the member-record spec allows a chain of three) is out of scope this round; only the
  direct edge is honoured.
- `tracksMembers = false` keeps the audience for visibility and drops only the roster. Attendance
  imports, per-member writes and clock-ins stay refused as they are today.

### A-5. Membership status and the three person kinds

- `membershipStatus` is `visitor | active | archived` on the member read and list. It is stored as
  `members.membership_status` constrained to `visitor | active`, with `archivedAt` still the archive
  marker, so `archived` is **derived** when `archivedAt` is set. `purgedAt` remains the erasure
  tombstone and is not a status. Existing rows backfill `active`.
- The member add accepts `membershipStatus` of `visitor` or `active`, defaulting to `active`;
  `archived` is `422 validation_error` (archive is its own action).
- A **registered visitor is a member record**: it has a member number, may hold contacts, may be clocked
  and may be an attendance row. It matches no audience unless the rule names `membershipStatus visitor`
  (A-3), so `Everyone` — `allOf(membershipStatus active)` — does not include it and a registered visitor
  never silently inflates a church-wide roster.
- **Promotion** is `POST /v1/members/{memberNo}/promote` with an optional `reason`. It sets
  `membership_status = active` and appends a `member_status_events` row (actor, at, reason, from, to). A
  member that is not a visitor answers `409 not_a_visitor`. Promotion changes which audiences match from
  that moment on; it does not rewrite history, because there is none.
- **First-time visitor**: the existing contribution shape — `visitorName` plus an HMAC-SHA-256 phone
  hash, no member record. The raw phone is never stored, returned, logged or cached, and no member is
  created by giving.
- **Registered visitor**: a member record with `visitor` status, created either by the member add or by
  the visitor-registration action.
- **Visitor registration** is `POST /v1/visitors` with a body of `{ phone, firstName, lastName?,
otherNames?, memberNo? }`. The phone is normalised by the existing phone rule and hashed under
  `VISITOR_PHONE_PEPPER`; the raw value is used only to compute the hash. The action creates the member
  with `membershipStatus: visitor` and an owned phone contact, and writes a
  `first_time_visitor_identities` row linking the hash to the member. It returns `201` with `Location` and
  the member. A hash already linked is `409 visitor_already_registered` naming the member; a number owned
  by another member reuses the existing `409 contact_in_use`.
- `first_time_visitor_identities` is `(phone_hash unique, member_id, linked_by, linked_at)` and
  append-only. It is the only link between the first-timer rows and the person: no contribution row is
  rewritten, and the name and hash recorded on the gift stay as they were given.
- The giving history of a member includes the contributions linked through
  `first_time_visitor_identities`, so a promoted member's history is one history. The church-wide visitor
  total counts gifts **given by a first-time visitor** and does not move them when the giver is
  registered: it answers "how much came in at the door", while the member's own history answers "what has
  this person given". Both readings are served from the same rows, and neither is achieved by rewriting
  one.
- The members list `status` filter gains `visitor`. The default list stays `active`, so visitors are
  reached deliberately through the filter, the visitors flow, or an explicit `status=all`.

### A-5a. The headcount, the named attendance and the person kinds

- The **headcount** is the **general count of the gathering**. It is recorded per session and per
  headcount mode (the modes are `adults`, `children`, `visitors` and `presbyters`), it covers everyone
  present, and it is the only figure that includes a person with no member record.
- A **first-time visitor is counted in Visitor Mode** — the `visitors` headcount mode, whose buckets are
  **visitor men**, **visitor women** and **visitor children** (`visitor-male`, `visitor-female`,
  `visitor-children`). Visitor Mode is its own lane and its own observation, never a bucket of `adults` or
  `children`. A first-time visitor is **never an attendance row**: there is no member number to name and
  no record to write.
- A **registered visitor is counted in Visitor Mode too**, not in the demographic lane, for as long as
  they are not a full member. Visitor Mode therefore means "people who are not (yet) full members of this
  congregation", and it holds both first timers and registered visitors. A registered visitor **may**
  also be an attendance row (they are a member record), so the same person appears in both places by
  design. On promotion the person moves to the demographic lane for later counts, and the counts already
  recorded keep the lane they were recorded in.
- **Codes, not spellings.** Visitor Mode's buckets are named by code — `visitor-male`, `visitor-female`,
  `visitor-children` — and the seeded `headcount_buckets` rows MUST carry exactly those codes.
  `member-registrations-headcount.md` owns the labels the surfaces render; an implementer confirms the
  seed codes against that reference data rather than assuming a fourth spelling (or a new mode).
- **The headcount is independent of the named attendance and is never its sum.** A member or registered
  visitor counted in the headcount may also hold an attendance row; adding the two double-counts them.
  The three readings stay separate and are **reconciled**, never added: the headcount is what the operator
  counted, `present` is the named rows, and `expected` is the audience at the occurrence date. A count and
  a present figure may differ in either direction, and the difference is explained rather than summed
  into a fourth number.
- The named attendance is **members and registered visitors only**; a first-time visitor has no row, so a
  session whose named rows are empty can still have a non-zero headcount.

### A-6. API contracts

| Method | Path                 | Result                                                                                        |
| ------ | -------------------- | --------------------------------------------------------------------------------------------- |
| `GET`  | `/v1/audiences`      | `{ items }`, system and custom; `active=false` for archived only, `includeArchived=true` both |
| `POST` | `/v1/audiences`      | Create a custom audience; `201` + `Location`; `409 audience_name_in_use`                      |
| `GET`  | `/v1/audiences/{id}` | One audience with its structured rule and `summary`                                           |
| `PUT`  | `/v1/audiences/{id}` | Edit a custom audience's name, rule or `active`; `409 audience_system` on a seeded one        |

- There is no audience delete. Archiving is `{ active: false }`; an archived audience is hidden from the
  event picker, keeps resolving for the events that already reference it, and cannot be picked as a new
  `audienceId` (`422 validation_error`). An event that already references it keeps it when another field
  is edited.
- `POST /v1/audiences` and `PUT` validate the rule against the closed attribute set; an unknown
  attribute, an unknown key, an empty `allOf`/`anyOf`/`noneOf`, an inverted or negative band, a
  non-`true` presbyter value or an unknown ministry code is `422 validation_error`.
- **The event** carries `audienceId`: required on create, defaulting to the `Everyone` audience when
  omitted; `PATCH /v1/events/{eventId}` may change it (the legacy `PUT` retires with the deployed form). Reads return
  the `audience` summary (`id`, `name`,
  `system`, `summary`) alongside `audienceId`. `ministry` and `presbyterOnly` become **read-only legacy
  projections** during the transition (see A-7); they are no longer accepted on create or update, and a
  client that sends them is `422 validation_error` with the field named.
- The events list's `?ministry=` filter resolves through the **legacy projection**, not through clause presence:
  it selects events whose projection's ministry is that code, which is an `allOf` over exactly one ministry.
  Clause presence would make `noneOf(ministry CHOIR)` match `?ministry=CHOIR` and turn an inclusion filter into
  an exclusion one. The filter is a legacy convenience, cannot express an age-band or `anyOf` event, and dies
  with the columns.
- The event detail carries the resolved roster summary the UI renders: per occurrence, `expected` (the
  audience's roster at that date), and per event the `audience` block above. No new roster route is
  added.
- Every audience route and every event read is `no-store`; audience writes require `X-Actor-Id` like
  every bearer write.
- The audience is evaluated server-side only. The browser MUST NOT evaluate a rule, and the member app
  MUST NOT receive a rule it is not allowed to see.

### A-7. Migration and backfill

The migration lands in the migration/API round, not this one; its number is the implementer's next free
number and is not reserved here. It is one transaction, idempotent by natural key.

1. Create `audiences`, `member_status_events` and `first_time_visitor_identities`; add
   `members.membership_status text not null default 'active'` with a `visitor|active` check; backfill
   every existing row `active`.
2. Seed the six fixed system audiences with their `system_key`, and one ministry audience per ministry row.
3. Add `events.audience_id` nullable, backfill, then `not null` with a foreign key to `audiences`.
4. Backfill every event from its legacy pair. The mapping is by distinct `(ministry_id, presbyter_only)`
   and is created once per distinct pair, with a natural key so a re-run adds nothing:

   | Legacy state                      | Audience                                                                       |
   | --------------------------------- | ------------------------------------------------------------------------------ |
   | no ministry, `presbyter_only = f` | `Everyone`                                                                     |
   | ministry, `presbyter_only = f`    | that ministry's seeded audience                                                |
   | no ministry, `presbyter_only = t` | `Presbyters`                                                                   |
   | ministry, `presbyter_only = t`    | a combination audience `‹Ministry› · Presbyters`, `allOf(ministry, presbyter)` |

   The combination audience is created as a **custom** audience (`system = false`) so an operator can
   see and edit it, with a name derived from the pair and a `system_key`-like natural key
   (`legacy:‹ministryCode›:presbyters`) so the migration can reuse it. Two events with the same pair
   share one audience, because the pair is what the legacy column expressed.

5. The legacy columns are **written by this migration** from each event's audience, **all-or-nothing**:
   `ministry_id` carries a code only when the rule is an `allOf` over exactly one ministry clause and, optionally, the
   presbyter clause; `presbyter_only` is true only for the presbyter clause alone or that same
   ministry-plus-presbyter `allOf`; every other rule projects null/false - a first-clause reading would write
   `ministry_id = CHOIR` for `noneOf(ministry CHOIR)`, which every legacy reader reads as "only CHOIR", the
   opposite of the rule. The columns exist so readers that have not moved (`events.presbyter_only` in the roster SQL
   and the USSD list) keep working until the downstream round deletes them; the `?ministry=` filter is no longer
   one of them, because it resolves through this projection. After the migration no route
   writes them **independently**: slice 2a keeps the legacy `ministryCode`/`presbyterOnly` inputs, maps them
   onto `audience_id`, and derives the two projections from the audience; slice 2b retires the inputs.
   **Stated limit:** an audience the pair cannot express (age, gender, status or a custom
   rule) reads as _general_ to a reader that has not moved; the downstream round removes those readers,
   and until then the member-facing list and the roster are the surfaces to trust.
6. No event, occurrence, attendance or offering row is rewritten.

The backfill is verified by the counts it should preserve: for every occurrence, the roster under the
new audience equals the roster under the old pair, and the set of events each member sees on the
member-facing surface is unchanged.

### A-8. UI surfaces

- **Admin › Audiences** (`#/admin/audiences`, a new sidebar row under Admin, beside Ministries). The
  table lists system and custom audiences with name, a `System` tag, the `summary` sentence, the number
  of events that reference it, and an `Active` state. A system row offers no edit. **New audience** is
  the page verb (one visible control, per the page-verb rule); a custom row opens the edit dialog.
- The audience dialog: a name, an operator select (`All of`, `Any of`, `None of`), and a repeatable
  clause row whose attribute select is the closed set and whose value control follows the attribute
  (ministry select, age min/max, gender select, status select, a presbyter row with no value control).
  The dialog shows the live `summary` sentence before saving; validation mirrors the API and the API's
  `422` is the backstop.
- **Event form.** One **Audience** picker, required, default `Everyone`, in the Identity section at the
  position the mock (`mockups/v2-events/11-series-create.png`, git-ignored) gives the Ministry field. The
  separate **Ministry (optional)** select and **Presbyter only** toggle retire as controls; their groups
  are ordinary picker options (the ministry audiences render as `‹CODE› · ‹Name›`, as the mock renders
  the ministry option; the presbyters group renders as `Presbyters`). The hint reads "Who sees this event
  and who is on its roster." A legacy ministry + presbyter event opens with its combination audience
  selected.
- **Member surfaces.** The Add member form gains a **Membership status** control (`Active` default,
  `Visitor`) with the hint "A visitor has a record and can be promoted to full membership." The member
  detail and list show a `Visitor` tag; a visitor's Actions menu carries **Promote to member** (a
  confirmation naming the effect). The members list filter gains `Visitor`.
- **Visitor registration.** The offerings count page and the contributions list carry **Register as
  visitor** on a first-timer row. The dialog is pre-filled with the name recorded on the gift and asks
  for the phone; it calls `POST /v1/visitors` and, on success, shows the new registered visitor's member
  number and links to the record. The phone is never rendered back.
- **USSD.** No new screen. The Activities list, the current/next event and the offering list follow the
  audience, and a restricted event is absent rather than refused.
- **Errors.** `409 audience_system`, `409 audience_name_in_use`, `409 not_a_visitor`,
  `409 visitor_already_registered` and the existing `409 contact_in_use` map to the shell's conflict
  state and, in a dialog, to the field; `422 validation_error` maps to the field that failed.

## Testing Decisions

- Tests assert **external behaviour** at the existing seams: the API response, the persisted row, the
  computed count. No test reaches into the audience evaluator's internals, and no test asserts a SQL
  fragment.
- **API routes, the `tests/api/events.test.ts` pattern.** A new `tests/api/audiences.test.ts` covers the
  reference data: list with system and custom rows, create, edit, the `audience_system` and
  `audience_name_in_use` conflicts, the rule validation cases (an empty `allOf`, `anyOf` or `noneOf`,
  inverted band, unknown ministry, non-`true` presbyter), and archiving. `tests/api/events.test.ts` (or its
  successor on the parent model) covers `audienceId` on create/update/read, the default `Everyone`, `422`
  for a retired `ministry`/`presbyterOnly` write, and the `?ministry=` filter resolving through the
  audience.
- **The one-predicate agreement.** A test creates an audience, a member and an occurrence, reads the
  event's `expected` and the USSD Activities list for that member, and asserts they agree. It also pins
  the seed semantics: `Everyone` reports the active members only and excludes a registered visitor,
  `Visitors only` reports that visitor and excludes the active member, and a ministry-only rule
  (`allOf` over the choir ministry) matches an active choir member but not a visitor in the choir. This
  is the test that fails if a second copy of the rule appears or the empty-`allOf` reading returns.
- **Visibility.** The `tests/api/ussd-activities.test.ts` and `tests/api/events-presbytery.test.ts`
  patterns: a matching member sees the occurrence, a non-matching member does not, a `Presbyters`
  audience is hidden from a non-presbyter, a guardian sees a minor's occurrence, and a hidden
  member-scoped route answers `404` rather than `403`. Headcount-only events keep visibility and report
  no roster.
- **Member status and visitors.** The `tests/api/members-crud.test.ts` pattern for the create status,
  the `visitor` filter and the promotion (`409 not_a_visitor`, the status event row); a new
  `tests/api/visitors.test.ts` for registration: a matching gift is linked, the history follows the
  member, a repeat phone is `409 visitor_already_registered`, and no contribution row changes.
- **DB migration and backfill, the `tests/db/event-instances.test.ts` pattern.** A new
  `tests/db/event-audience-backfill.test.ts` seeds legacy rows (both columns in every combination), runs
  the migration on PGlite, and asserts the audience each event received, the roster equality per
  occurrence, one shared combination audience per pair, and a second run adding nothing. The existing
  `tests/db/schema-drift.test.ts` covers the new tables against the Drizzle mirror.
- **UI.** The event form's picker (options include the seeded ministry and presbyters groups; the two
  retired controls are absent; the request carries `audienceId`), the Audiences page (system rows
  uneditable, a custom row creates and edits), the member add's status control, the Promote action and
  the Register-as-visitor dialog, at the DOM level and in the existing e2e lane. No new harness is
  introduced; the existing Vitest + RTL + MSW setup and the existing Playwright/axe lane are used.

## Out of Scope

- **A named member list as a clause.** The owner named it as a later addition; this round's closed set
  has no member picker, because it turns an audience into a membership list with its own drift.
- **Nested rule groups** (`anyOf` inside `allOf`). One operator over flat clauses covers the named
  examples; nesting is a later extension with its own UI and tests.
- **Membership, ministry or presbyter history.** The rule reads the current register; a retroactive
  evaluation is not offered and would need new history tables.
- **A third gender value in a rule.** `other` and `undisclosed` cannot be targeted this round.
- **Per-audience attendance or giving reports.** The audience changes who is counted, not what is
  recorded.
- **Per-officer authorization.** The back office still sees everything; the audience is a
  member-facing rule, not a security boundary.
- **Audiences on offerings.** An offering's audience is its event's; a per-offering audience is not
  added.
- **Self-service visitor registration.** Registration and promotion are administrator actions; a visitor
  does not register or promote themselves.
- **Merging two member records.** Registering a giver whose phone already belongs to a member is a
  `409`, not a merge.
- **A chained guardian's visibility.** Only the direct `guardian` edge is honoured.
- **Changing the regularity calculation's scope - reversed 2026-11-24.** The USSD profile's regularity window
  used to keep its general/ministry scope and its `assigned_on` floor; the audience-predicate round moves it onto
  the rule, so there is one predicate and one read. A member's `expected` and regular/non-regular status can
  change as a result.

## Further Notes

- **Why one rule rather than five flags.** The consumers already disagree in small ways today, and
  every new grouping would have to be taught to each of them. Centralising the predicate is the whole
  point of this spec; a second implementation of the rule is the thing to reject in review.
- **The retired columns stay for one round.** Deleting `events.ministry_id` and `events.presbyter_only`
  in the same round would force the roster SQL, the USSD list, the import guard and the `?ministry=`
  filter to move at once. The migration writes them from the audience and the downstream round deletes
  them; the audit of that round is "nothing reads them".
- **The combination audiences are custom, not system.** A church that already has a choir-presbyters
  study may want a different name, so the backfill creates an editable audience per pair rather than a
  seventh system group. Its derived name is a starting point.
- **Visitors and totals.** Keeping a registered visitor's past gifts in the church-wide visitor block
  while showing them in the member's own history is deliberate: the church-wide split answers "how much
  came in at the door from first-time visitors", the member view answers "what has this person given".
- **The three person kinds are one ladder.** First-time visitor → registered visitor → full member. Each
  step is an administrator action, each keeps the prior history, and no step creates a second record for
  the same person.
- **Interaction with the session-offerings round.**
  `member-registrations-session-offerings.md` is a **separate round after the event-parent migration**;
  it consumes the three person kinds defined here (a gift is given by a member of any status or by a
  first-time visitor's name+phone) and the `Visitors only` audience, and it adds no membership rule of
  its own.
- **Standalone attendance imports (settled 2026-11-22).** A standalone event's occurrence imports
  attendance exactly like a recurring occurrence; the old `422 series_required` refusal is retired, and
  the audience is the expected rather than a gate. The detail is in the API spec's import section and in
  `member-registrations-events-offerings.md` FR-8/AC-7.
