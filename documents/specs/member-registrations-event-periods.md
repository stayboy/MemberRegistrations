# Spec - event scheduling, audiences and named periods

**Status:** **APPROVED 2026-11-24** by the owner, after two grill rounds and four behavioural review passes
(`reviewer-pro`, `mimo-v2.6-pro`, verdict `consistent` on the fourth). The review's verdict and this approval apply to
this exact text. **Two hard gates remain ungranted** (AGENTS.md §17): the `event_audiences` / `event_no` migration and
the event wire contract land only when an instruction names this round and both gates. No code may land before that.

**Author:** Solomon Owoo (synthesised by the agent; amended after the grill)

**Date:** 2026-11-24

**Related:** `member-registrations-api.md` (event parent, recurrence, audiences),
`member-registrations-event-audience.md` (the rule language, A-1, A-4, A-6),
`member-registrations-ui.md` (FR-42a-42g, FR-43, AC-56, AC-60, AC-62-65),
`documents/agents/parallel-ui-api.md` (contract-first seam),
`documents/rounds/event-periods.md` (this round).

## Problem Statement

The event form can express one recurrence shape and one audience, and it cannot name the church calendar at all.

- **A schedule is one cadence.** Weekly, fortnightly and monthly-on-day, with the weekday or day-of-month taken
  from the start date. A pattern the parish runs - Monday, Thursday and Friday in one event; the last Saturday
  before the month turns - cannot be authored, although `rrule` accepts both.
- **An event has one audience.** A service for the choir _and_ the youth has to be duplicated rather than reused from
  two saved audiences, and a service for **everyone except the youth** has to be hand-built as a bespoke rule: the
  rule language applies **one** operator over its clauses, so "active members who are not in Youth" is not a shape
  anyone can reuse, even though a bare `noneOf` does restrict correctly (it excludes visitors through A-3's gate).
  Two audiences intersected can say it, and today an event cannot hold two.
- **The event number is typed.** The operator may supply one and the server mints one when blank, so the
  register carries operator-invented numbers beside minted ones.
- **Named periods do not exist.** Communion Week, Gospel Week and the Home Cells Monday that follows them are
  described in every planning conversation and in no document the system can read.

## Solution

Four changes to the event surface, and none to the money, attendance or import paths.

1. **Schedules are authored as a set of rules**: a weekday set, an interval, an end, an optional positional rule
   for monthly schedules, and explicit extra dates alongside.
2. **An event carries several audiences, and they compose by intersection.** A member is in the event when they
   match **every** audience. That is also how exclusion is said: "everyone but youth" is `allOf [active]`
   intersected with `noneOf [Youth]`. **The audience rule language is unchanged** - no clause type is added.
3. **The event number is minted by the server and is read-only**; a client that sends one is refused by name.
4. **Named periods are first-class**: three declared rules, selectable in the event form, resolved to dates
   before saving and stored as ordinary occurrences.

## User Stories

1. As an events officer, I want one event on Monday, Thursday and Friday, so a thrice-weekly service is one event.
2. As an events officer, I want the last Saturday of a month, so a monthly vigil lands on the day the parish holds it.
3. As an events officer, I want extra dates alongside a rule, so a regular series can carry one without a second event.
4. As an events officer, I want to see the resolved dates before saving, so I can check the rule produced what I meant.
5. As an events officer, I want one event for the choir **and** the youth, so it is not duplicated - and I want the
   roster to be the members who are in both.
6. As an events officer, I want a service for everyone **except** one group, by intersecting two audiences.
7. As an events officer, I want to see how many members an event actually covers at each resolved date.
8. As an events officer, I want the event number generated, so I cannot invent one that collides.
9. As an events officer, I want to choose Communion Week, Gospel Week or Home Cells, so the parish calendar is a choice.
10. As an events officer, I want to see the dates a period resolves to before I save.
11. As a member, I want to see an event only when I am in **all** of its audiences.

## Implementation Decisions

### Audiences

- **An event carries an ordered set of audiences**; the first is the **primary**, which exists for ordering and the
  revert shim, not for meaning. Composition is **intersection**: a member is in the event iff they match every
  audience's rule at the occurrence date.
- **The rule language is untouched.** Composition, not a clause type, is what makes exclusion expressible:
  `allOf [membershipStatus=active]` intersected with `noneOf [ministry=Youth]` is "active members who are not in
  Youth", and "(choir or youth) and not presbyter" is `anyOf [choir, youth]` intersected with
  `noneOf [presbyter]`. A disjunction _with_ negation inside one audience stays unexpressible, and no case has asked
  for it.
  - **The visitor dimension is asymmetric, and the fold inherits it.** A-3's gate is evaluated **per rule**: a rule
    that names no `visitor` clause excludes registered visitors. A visitor is therefore in an event only when
    **every** selected audience names visitors, so `Visitors only` intersected with any visitor-silent audience
    (`Choir`, `Adults 18+`, a bare `noneOf`) is empty by construction. That is correct, not a defect: the factor that
    does not mention visitors does not admit them. The composition claim is scoped accordingly - intersection gives
    any conjunction of single-operator rules **over non-visitor members**; visitor-inclusive audiences compose only
    with other visitor-naming audiences, and saving an empty result is allowed because the emptiness is data.
  - There is no per-audience warning about "no positive constraint": a bare `noneOf` is **restrictive**, not
    permissive (the gate already keeps visitors out, and the register holds no inactive population), so warning on it
    would fire on exactly the audiences that need no warning. The only composition an operator can get wrong is a
    visitor-inclusive audience beside a visitor-silent one, and the empty-result warning below is what covers it.
- **Storage:** `event_audiences`, columns `(event_id, audience_id, sort_order)`, primary key `(event_id, audience_id)`,
  foreign keys to `events` and `audiences`, cascade on event delete. It is the **only authority** for who an event
  is for.
- **Every writer of an event writes the set, in the same transaction.** The named ones, because "only authority" is
  false the moment one of them is missed - a missed writer produces an event that rosters 0 and disappears from
  member-facing surfaces:
  - `createParent` and `updateParent` (`src/repos/events.ts`), the create/patch path;
  - the **series** create and update (`src/repos/series.ts`), which keep writing `events.audience_id` today and are
    kept live by AC-65 - they gain a one-row `event_audiences` write while series stay single-audience;
  - the legacy `PUT /v1/events/:id` (`src/routes/events.ts` → `src/repos/events.ts`), which today even rewrites
    `audience_id` from `presbyterOnly` - it writes the set from that same derivation, one row;
  - `seedEvent` (`tests/helpers/event-fixtures.ts`), for fixtures and dev seeds - its `eventNo` mint is named below,
    and its audience write is the same obligation.
  - **The migration asserts before it constrains:** it refuses to run while an event has no `event_audiences` row,
    exactly as it refuses while `event_no` is null, so a missed writer fails the deploy rather than shipping a
    zero-roster event. No backfill is written, because there are no events to backfill.
- **`events.audience_id` becomes a write-only shim.** It is written in the same transaction as the primary row and
  **read by nothing new**; it exists so this round can be reverted without a data migration, and
  `documents/backlog.md` carries its removal (`event-parent-downstream`, amended).
- **The legacy projections keep their readers for one round, and that is a stated inaccuracy.** `ministry_id` and
  `presbyter_only` are still derived from the **primary** audience and still read by the legacy `EventItem`/`SeriesDto`
  projections, the series summary, the member attendance-series `ministry` label and the attendance/`expected` SQL, so
  a multi-audience event reads as its primary there - an **over-report**, since the primary is a superset. The manual
  attendance **write gate** (`presbyter_only`) is undefined for a multi-audience event until then and stays
  primary-derived, which is why attendance is listed as unchanged only in the sense of not being reworked. Moving
  those readers is the same backlog row as the column drop, not this round; the round that moves them must delete the
  columns in one change.
- **Wire:** create and patch take `audienceIds: string[]`, ordered, minimum 1, default `[Everyone]`; duplicates are
  refused; an archived audience is refused unless the event already holds it (A-6). `PATCH` replaces the whole set.
  `audienceId` stays accepted as a **one-element alias** for this round, because Zod strips unknown keys and a silent
  fallback to `Everyone` would be a wrong answer. **Precedence:** if both keys are sent, `audienceIds` wins and
  `audienceId` must equal its first element, else `422` naming both. The alias is write-only and never echoed as an
  instruction. Reads carry `audiences[]` (each with its rendered `summary`) **and** the legacy `audienceId` +
  `audience` alias for the primary.
- **Derived readers move in this round** - all of them: the parent read (which replaces the `ministry` /
  `presbyterOnly` projection with `audiences[]`), the roster and window summary, the occurrence `expected`, the two
  member-scoped reads, the legacy series summary, `?ministry=` (now "has an audience projecting to this ministry"),
  and the USSD tier. A reader left on the primary would over-report, because the primary is a **superset** of the
  intersection.
- **USSD's anonymous rule** becomes "the whole audience set is `Everyone`". An authenticated caller's tier is the
  **lowest rank across the set** on the existing ladder — ministry match, then presbyter, then `everyone`
  (`src/ussd/services.ts:153-160`), which is kept, not retired. An audience that projects no ministry contributes the
  rank its rule implies (presbyter for a presbyter clause, otherwise `everyone`); `Everyone` is not a neutral element:
  it adds active status and excludes registered visitors.
- **Duplicates and identity:** the recurring-name uniqueness key becomes `(lower(name), unordered audience set)`; the
  parent ETag hashes the ordered audience ids, so a secondary-audience edit moves it.
- **The composition lives in one function** beside the evaluator, and the roster, occurrence read, member reads and
  USSD all call it. No second evaluator, and no merged rule: the rule language is flat, so two audiences cannot be
  folded into one clause list in general.
  - **The `expected` seam is raw SQL today** (`session_expected`), so the fold cannot run inside it unchanged. The
    round computes the intersection count through the composition function and passes it in as a parameter - it does
    **not** evaluate rules in SQL, which would be the second evaluator this spec forbids - tested with a
    multi-audience event whose second audience removes members the SQL alone would count.
- **An empty intersection is authorable.** The preview shows 0 with the warning "no member matches every audience at
  these dates"; saving is allowed and the detail shows 0. A custom audience's emptiness is data, not syntax, so no
  static check is attempted.
- **Counts:** `GET /v1/audiences?countAt=YYYY-MM-DD` returns `memberCount` per audience. The form's headline is the
  **intersection** count per resolved date; each audience's own count is a secondary label on its chip at the first
  resolved date. There is no union total and no "contributes" wording, because the parts do not sum.

### Schedules

- **The vocabulary is closed:** daily with an interval of 1-7 (one date every day at 1, so every other day is
  `INTERVAL=2`, which labels "Every 2 days"); weekly with a weekday set (any of `MO`-`SU`), an interval of 1-4, an
  end date; monthly on a day-of-month; monthly positional (`BYSETPOS=1|-1` with exactly one weekday); and explicit
  extra dates carried as `recurrence.exceptions[{ kind: 'extra' }]` - the existing contract, not a new field. **Daily
  is authored, not refused** (owner, 2026-11-24): the vocabulary refused it for one round and the form could not
  express a daily meeting, while the list already rendered "Every 3 days" for a stored rule. A daily rule carries
  `INTERVAL`, which is optional and defaults to 1, and **admits no other key** - `BYDAY`, `BYMONTHDAY` and `BYSETPOS`
  are refused on it. The builder offers it as a fourth cadence with a number
  field beside it.
- **`WKST=SU` is emitted on every interval-bearing weekly rule and accepted on read**, because RFC 5545 counts
  `INTERVAL` weeks from `WKST` (default Monday) while the church week is Sunday-to-Saturday; a daily rule carries no
  `WKST`, where it would be meaningless. Stored rules without `WKST` keep their Monday meaning and are never rewritten;
  a stored rule the vocabulary cannot express still renders read-only.
- **Explicit dates are unbounded by the preview window** (owner, 2026-11-24): a standalone event's rows are
  occurrences, not a generated window, so a date a year out is legitimate even though `POST /v1/events/preview`
  reports only the create's 90-day horizon; the form marks the rows beyond the window, so the officer is not surprised
  by the table and the preview disagreeing.
- `effectiveFrom` need not fall on a chosen weekday: the first occurrence is the first matching date on or after it,
  and the preview shows it. A monthly day-of-month of 31 skips short months.
- **One builder, both call sites.** `EventFormPage` and `AddScheduleVersionDialog` share one builder component;
  weekly, fortnightly and monthly-on-day remain as presets that fill it.
- **The event's type is fixed at create** (owner, 2026-11-24). Recurring and standalone are two event types, chosen by
  the form's **Repeats** switch on the create only; the edit form does not offer the switch at all - not disabled, not
  inert, absent - because turning a recurrence into a list of dates (or the reverse) is a different event, not an edit.
  A standalone event's edit form edits its rows; a recurring event's edit form edits its rule within F1's guard.
- **The rule is editable from the edit form, under a guard** (owner, 2026-11-24). It is editable only while the event
  is **untouched by history**; any one of these closes the guard:
  - an occurrence **dated today or earlier** in UTC - the event has started (there is no "started" column:
    `event_occurrences.status` is `scheduled | held | cancelled`, so the test is the occurrence's date against the
    UTC calendar date, and a same-day edit is refused rather than split by a wall-clock time the form does not
    collect);
  - an **offering attached** to any occurrence, or a **recorded offering count** for one (money is history);
  - a **headcount or attendance row**, or an **import suppression**, for any occurrence (attendance evidence is
    history).
    When the guard is closed the builder renders read-only with the specific cause named.
  - **"Rewrite" and "extend" are pinned by `effectiveFrom` against the last generated occurrence** (reviewer,
    2026-11-24). A version whose `effectiveFrom` is **on or before** the last generated occurrence **rewrites** dates
    the calendar already holds - that is the edit form's save, and it answers `409 recurrence_locked` once the guard is
    closed. A version whose `effectiveFrom` is **after** it **extends** the series - that is
    `AddScheduleVersionDialog`, allowed with or without history, because it adds dates ahead of the record and replaces
    none. The same split governs the exception writes: an exception on a generated date is a rewrite, one on a future
    date is an extension.
  - **A locked event's parent `PATCH` omits `recurrence` entirely**, and an unchanged rule is not a write: editing a
    name, description, audience or time on a locked event succeeds, and `409 recurrence_locked` fires only on an actual
    recurrence write.
- **Saving the edited rule replaces the version in force, and it never rewrites a past date.** The write is
  `POST /v1/events/{id}/recurrence/versions` with `{ rrule, endsOn? }` - **`effectiveFrom` is not part of the edit
  request body; the server derives it**, and the schema requires the field today, so the edit's input is a distinct
  shape that omits it. In **one transaction** the server **deletes the version in force - the newest `effective_from` at or before today
  (api.md) - and inserts the new one with the same `effective_from`**, then regenerates the window, so the preview and the calendar agree. That delete is
  permitted precisely because the guard is open: the guard is the test for "nothing has happened against these dates
  yet", so the version being replaced is not history (§5 protects records that have history, and this one provably has
  none). The `(event_id, effective_from)` unique index is satisfied because the old row is gone in the same
  transaction, not shadowed by a duplicate; the version-in-force rule ("newest `effective_from` at or before the date")
  is unaffected because the replacement carries the same start. The officer is told what happens ("this replaces the
  nine dates from Mon 30 Nov"), the response carries `generated: false` when the window could not be produced, and the
  form then reports the rule as saved and the dates as not yet generated rather than failing silently or twice. No
  occurrence on or before the last generated date is ever deleted or moved, and the guard is what makes the replacement
  safe rather than merely stated. **A version with no occurrences behind it cannot be a rewrite; an extension never
  replaces a row** - it appends one whose `effectiveFrom` is after the last generated date.

### The event number

- Minted by the server on create; **required on read** and immutable on edit. `POST` no longer accepts `eventNo` and
  a guard refuses it **by name** (`422`, the `refuseLegacyProjections` pattern); `PATCH` adds `eventNo` to that same
  refusal list instead of silently stripping it. The read schema becomes non-null in the same change as the migration
  that makes the column `NOT NULL`, so "required on read" is a property of the response, not of an optional field. The
  form carries no number control.
- The mint year is the **earliest occurrence's UTC year** for a standalone event (not the deploy year) and the first
  schedule's year for a recurring one. The mint-collision `409` surfaces as a banner, not a field error.
- There are no events in the register yet, so no backfill: the migration sets `event_no NOT NULL` and replaces the
  partial unique index with a plain one, and the Drizzle schema follows (the drift check enforces it). `seedEvent`
  mints through the same counter when `eventNo` is omitted.

### Named periods

**A period is a position in the calendar, and the position is ordinal** (owner, 2026-11-24, adopting the
pentecostal basis). Every period is one rule:

```
cadence            every month  |  quarterly
month in quarter   1st | 2nd | 3rd            (quarterly only)
month              this month | the month before
week               1 | 2 | 3 | 4 | last
week starts on     Monday | Sunday
weekday            Sunday ... Saturday
```

**The week-start convention is a field on each period** (owner, 2026-11-24), defaulting to Monday for the seeded
calendar: Monday-start makes Communion Week 30 Nov - 6 Dec 2026 and Home Cells 30 Nov, while Sunday-start makes the same
week 6-12 Dec with Home Cells on 7 Dec. The **Communion Sunday is the same either way** - the month's first Sunday -
and only the week's span moves. **A week belongs to the month its Sunday falls in**, so "week 1" is the week containing the
month's first Sunday and "last" is the final such week - no week-4-versus-week-5 arithmetic, and a month with five
Sundays does not create a fifth week. A **week** period returns seven dates from its Sunday; a **single-date** period
returns the named weekday inside that week.

**The three seeded periods are an example calendar, not the system's opinion** (owner, 2026-11-24): they are the
Church of Pentecost's pattern - Communion Week, Gospel Week and Home Cells - shipped so a parish starts with a working
calendar. The engine is denomination-agnostic; another church edits, archives or replaces all three, and nothing in the
code assumes this set exists. In this vocabulary:

- **Communion Week** - every month, week 1, Sunday. The pentecostal basis: the communion service is the Sunday of the
  first week, so the week itself is week 1 - which under the seeded Monday-start is 30 Nov - 6 Dec 2026.
- **Gospel Week** - every month, **the month before**, week last, Sunday: the week before Communion Week, when
  ministries hold their meetings.
- **Home Cells** - every month, week 1, Monday: **the Monday in Communion Week**, one date. It is expressed as week
  1 rather than as a reference to the other period, because under either week-start convention week 1's Monday _is_ the
  Monday inside Communion Week - so the two agree without one depending on the other.

**Two order rules the model needs** (owner, 2026-11-24): **`week 4` is not `last`** — in a five-Sunday month the fourth
week and the final week are different weeks, and `last` is never an alias for 4; and for a **quarterly** rule the
month-in-quarter test happens **before** `monthOffset`, so "quarterly, 1st month, the month before" resolves in the
previous quarter rather than in the quarter's third month.

**Exceptions are the event admin's, not the period's** (owner, 2026-11-24). A period never carries a per-cycle override:
when a month's service moves, the officer adjusts or creates **that event** in the event admin with the existing
occurrence machinery, and the period keeps its rule. If exceptions turn out to be frequent rather than annual, a
per-cycle override on the period becomes its own round, with its own resolution order to explain.

**The names are the parish's own vocabulary, not system jargon.** A reader who does not know the calendar cannot infer
what "Communion Week", "Gospel Week" or "Home Cells" mean, so the catalogue carries the parish's description of each
beside its rule, and the system never reinterprets a name: a period name is a label for a **rule**, and a name that
stops describing its rule is renamed with it.

- **Three periods, declared in code** in `src/domain/periods.ts`, resolved by one pure function
  `resolve(period, cycle)`. The catalogue is shaped so a data table would be a mechanical move; a fourth period is the
  trigger to make that move (backlog row added).

- **The cycle is the calendar month the period resolves in**, written `YYYY-MM` (owner, 2026-11-24): cycle `2027-01`
  resolves Communion Week to the week containing January 2027's first Sunday, and Gospel Week to the last week of
  December 2026. The form defaults it to **the next cycle, never a past one** (owner,
  2026-11-24): the start date's month is preferred only when that cycle has not already run, otherwise the next cycle,
  so opening the form on 24 November 2026 offers December rather than November's already-run cycle. It
  always shows the resolved range, because a cycle can cross a month boundary.
- **Dates are UTC calendar dates server-side and are formatted, never shifted, by the UI** (AGENTS.md §4 and
  `ui-date-time-formatting.md`): the resolver takes no clock and no `events.timezone`, which keeps its current job of
  deciding "today" and held status.
- **A period resolves once, at save, and the event keeps its provenance** (owner, 2026-11-24 - this reverses the
  earlier "no provenance" decision). The dates are materialised as ordinary occurrences, so nothing ever re-resolves
  and `POST /v1/events/generate` cannot touch them; **and the event records what it was created from**:
  `period_id`, `period_cycle` (`YYYY-MM`) and `period_name` as it was written at save. The name is a **snapshot**, not
  a live lookup - a renamed definition leaves the event reading as it did, which is the truthful rendering of what
  happened - and the id is what makes "every Communion Week event" answerable.
  - **A period's dates are materialised as resolved, not clamped to the 90-day preview window** - they are a fixed
    week, not a generated horizon, exactly as F4 holds explicit dates unbounded; uniqueness is the resolver's, since it
    returns distinct dates.
  - **The server resolves at create.** Create accepts `period: { id, cycleMonth }` instead of the client's
    `occurrences[]`, and the server resolves it with the same function the preview uses, so preview and create cannot
    diverge; a create that sends both a period and explicit dates is refused. `POST /v1/events/preview` keeps taking
    the same shape, so the form previews exactly what the create will store.
  - **The read and the list carry it.** The event read gains `period: { id, name, cycle?, frequency?, day? }` (null for events not
    created from one), `GET /v1/events?period=<id>` filters on it, and the event detail shows one line directly under its **identity** (not beside when and where): for a one-off period
    event it is "Communion Week - 29 Nov - 5 Dec 2026", and for a recurring period event it is the **period - day or span - frequency**: "Communion Week - Sundays - monthly" when
    `day` is given, "Communion Week - whole week - monthly" when it is not, and "Home Cells - monthly" for a
    single-date period (which cannot take a day). A recurring period event names no single cycle.
  - **A period can recur, not only resolve once** (owner, 2026-11-24): an event may be scheduled **by period** instead of
    on literal dates — the create's period arm takes either `{ id, cycleMonth }` (one cycle, resolved once, as above) or
    `{ id, frequency: 'monthly', day?, effectiveFrom? }`, which **generates** one date per cycle. The optional
    `effectiveFrom` anchors the 90-day window the generator walks - defaulting to today, so "Miracle Sunday from January"
    means what the officer chose rather than whatever the clock says this morning. **It is input-only and never
    stored**: it anchors the initial window, and once occurrences exist `generate` walks `from&to` instead; it is not
    derivable from the first occurrence, because the anchor may precede it. With `day` given it is that weekday
    inside each cycle's period ("Miracle Sunday" is the Sunday of Communion Week, every month); without it the whole
    period is generated (seven dates for Communion Week). Home Cells is a single date, so `day` is refused there.
    - **`frequency` is a closed enum that starts with `monthly`** — every named period is cycle-month based today — but
      the field exists so a genuinely annual period arrives as a new value, not a new shape. The preview and the generator use the **same 90-day horizon the create and `generate` already use**, so a monthly
      period recurrence previews and materialises every cycle falling inside that window - typically three - never a
      different span, and the generated occurrences materialise
      through the same forward window every recurrence uses, so past dates are never rewritten.
    - **The period rule is stored on the event, not as an rrule version** (owner, 2026-11-24): field-based rules
      (`period_id`, `period_frequency`, `period_day`) live with the event because they are not an RFC 5545 string, and
      `event_recurrence_versions` stays what it is - the version history of **rrule** schedules. There is **one generator**:
      `POST /v1/events/generate` walks both kinds through a common expand step (rrule version, or period rule), over the
      same forward window, so a period event materialises exactly as a recurrence does and past dates are never rewritten.
    - **The period rule is editable under the same guard, and replaced rather than versioned** (AC 19): while the event
      has no history the stored `frequency`/`day` may change, and saving replaces those fields in one transaction because
      there is no version row to supersede; once the guard closes the rule is read-only and a write answers
      `recurrence_locked`. There is no "extend" operation for a period rule - a future change is a new event.
    - **Provenance for a recurring period event** records what generates it: `period { id, name, frequency, day? }`,
      with no single `cycle` — the cycle belongs to each occurrence, not to the event. A one-off period event keeps
      `period { id, name, cycle }` and no frequency.
  - **A period can still be added, edited or removed without rewriting an event**: the reference is to what was
    chosen, so editing a definition is not retroactive and removing one only stops the form offering it. The date
    columns and the name snapshot mean neither operation can orphan an event. When the catalogue becomes data and gets
    a screen (backlog: "named-period catalogue and authoring screen"), the rule is the one audiences already follow:
    **archive, never delete**, so a form open across the change cannot fail on submit against an id that vanished
    between render and save.
- **Two read-only contract entries:** `GET /v1/events/periods` (id, name, definition) served from the code
  constants, registered before `/:id`; and `POST /v1/events/preview` - no persistence - accepting either the create's
  `recurrence` or `period: { id, cycleMonth }`, returning
  `{ occurrences: [{ date, expected }], audienceCounts: [{ id, count }] }` within the create's 90-day window.
- **Creating and editing named periods is another round**: an admin screen and a catalogue table are deferred, with
  the backlog row "named-period catalogue and authoring screen", triggered by a fourth period or a definition change
  that must not need a deploy.

## Managing the period catalogue (draft, 2026-11-24)

**Status: DRAFT - not approved.** This section is the trigger the backlog row named ("a fourth period is named, or a
definition must change without a deploy"). It moves the catalogue from code constants into data and adds the screen
that manages it. It needs its own grill round, the owner's approval, a `0813` review, and **both §17 gates** — a
migration and a wire contract — before any of it is built.

**The move is mechanical, and that is why it was designed for.** The three periods today are code constants with a
quoted definition; they become rows in a `named_periods` table seeded from those constants, each row carrying:

| field         | meaning                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | the wire id, stable and never reused (`communion-week`, `gospel-week`, `home-cells`, any added later)                          |
| `name`        | the parish's name for it — the label an officer picks                                                                          |
| `definition`  | the rule **in plain words**, shown beside the choice and in the admin list                                                     |
| `rule_kind`   | the resolver's shape: `week-before-first-weekday` or `single-date`                                                             |
| `rule_params` | what the kind needs: the weekday and `weeksBack` (0, 1, 2) for the week kind, or the weekday and its ordinal for a single date |
| `active`      | archived rather than deleted, so a form open across the change cannot fail on submit                                           |

**Names are free text; there is no enum of periods** (owner, 2026-11-24). A period is a row an officer creates, with an
opaque `id` minted at creation and a **free-text name** — "Communion Week" is seed data, not a type, and the system never
enumerates periods or branches on their names. `EVENT_PERIOD_IDS` therefore **retires with this move**: the create's
`period.id` becomes an opaque id validated against the table, and the compile-time "a fourth id fails the build"
guarantee is replaced by a data check. The **rule kinds stay a closed set** (`week-before-first-weekday`,
`single-date`), because those are resolver shapes rather than parish vocabulary; a new shape is a code change.

**The screen lives at `#/admin/calendar-periods`** (owner, 2026-11-24), in the Admin section beside audiences.

**The rules that keep it honest:**

- **A period is a declarative rule, never code.** The admin screen offers `rule_kind` and its parameters; it cannot
  hold a script or an arbitrary date list, because a rule only the database understands cannot be previewed, and the
  preview is what the officer trusts. A shape the resolver does not have is a new `rule_kind` in code with its own
  change — not a data entry.
- **The `definition` is optional, and the rule is the authority** (owner, 2026-11-24). It is **the note that explains the period** - one free-text textarea, the only documentation field in the dialog -
  kept for comprehension and shown when present; a blank one is accepted, because the
  `rule_kind` and its parameters are what the resolver evaluates and what the preview renders. **Field explanations live in
  tooltips**, not inline prose (owner, 2026-11-24): each control that needs one carries an info affordance beside its
  label, and the dialog keeps a short vertical rhythm rather than a column of sentences. The list shows the
  definition under the name when there is one, and the rule in words always, so a period is legible either way.
- **The parameters are asked in sentences, never in resolver arithmetic** (owner, 2026-11-24). An officer does not type
  an offset: the week kind asks **which week** — "the week before the month's first _[weekday]_", "the week before
  that", "two weeks before that" — and stores `weeksBack` 0-2; the rule kind itself is chosen from human labels rather
  than `week-before-first-weekday`. The raw values live in the API and in the list's rule-in-words line, never in a
  form field.
- **Archive, never delete.** `active = false` removes it from the create form; `GET /v1/events/periods` serves active
  rows by default and `includeArchived=true` for the admin list. A stored `period_id` on an event is never validated
  against the live catalogue after save.
- **Nothing is retroactive.** Editing a `definition`, `rule_kind` or `rule_params` changes what **future** resolutions
  produce; an event already created keeps its stored dates and its `period_name` snapshot. The Named periods section
  already states this; it is restated here because the admin screen is where an officer would expect otherwise.
- **Removing a period never touches an event** — there is no foreign key from events to periods, since the event holds
  dates and a snapshot.

**Each row can start an event from its period** (owner, 2026-11-24): a **Create event** row action opens the event
create form with that period preselected (`#/events/new?period=<id>`) and its cycle defaulted to the next one, so an
officer who is looking at a period can add the event it describes without re-finding the period in the form. The action
is offered on an **active** period only - an archived one cannot start an event - and it does not prefill anything else:
name, audience and times stay the officer's, because a period says when, not what.

**The events list gains the matching filter** (owner, 2026-11-24): `#/events?period=<id>` shows the events created
from that period, in the list's existing shape, with the period shown as a removable filter chip so the officer can see
why the list is short and clear it. The count on the landing page and the filter's result must agree - both read the
same `period_id` - so a click never lands on an empty list while the count says otherwise.

**Routes** (officer-authenticated, through the same gateway): `GET /v1/periods?includeArchived`, `POST /v1/periods`,
`GET /v1/periods/{id}`, `PUT /v1/periods/{id}` (edit name, definition, rule, active). The event form keeps reading
`GET /v1/events/periods`, which now reads the table.

**The screen.** A list of periods — name, definition, the rule in words, active/archived, and **how many events use it** - the count is a link that opens the events
list filtered to that period (owner, 2026-11-24), at `#/events?period=<id>`, so the landing page answers "which events
is this period for?" in one click rather than making an officer filter by hand — with one **New period** verb, and each row opening an
edit dialog carrying **only** name, rule kind and its parameters, with the optional **definition last** (owner,
2026-11-24) - it follows the weekday-of-cycle-month control and adds no explaining text of its own. **Archiving is a row action on the list,
not part of the dialog** (owner, 2026-11-24): the dialog was stretching taller than the page it opens over, and the
lifecycle of a period belongs with its row, beside Show archived. It follows the
It follows the **events landing page** (owner, 2026-11-25): the same grid, the same
header and filter row, and the same **kebab row menu** for actions — so a period row and an event row read the same way
and one learned menu serves both. The create and edit dialog follows `FR-42c`'s shape.

## Acceptance Criteria

1. One event authors Monday, Thursday and Friday and resolves to those three weekdays.
2. A monthly positional rule resolves to the first or last named weekday of the month.
3. An extra date outside the rule appears in the resolved set and is stored as an exception.
4. The preview shows the same dates the create then stores.
5. An event with two audiences rosters and counts only members matching **both**; a member in one is absent from the
   roster, uncounted, and does not see the event.
6. An event whose audiences are `allOf [active]` and `noneOf [Youth]` rosters active members not in Youth, excludes
   visitors, and counts that intersection.
7. The form shows the intersection count per resolved date and each audience's count on its chip.
8. `POST /v1/events` with `eventNo` is refused `422` naming the field; the created event carries a minted
   `EVT-<year>-<NNN>`; `PATCH` refuses `eventNo` by name; a mint collision (`409`) renders as a banner, not a field
   error, and the create form has no number control at any point.
9. `audienceId` alone still creates a one-audience event; `audienceIds` with duplicates is refused; both keys
   together with a mismatched first element is refused `422`; `PATCH` with `audienceIds` of length 1 after a
   multi-audience event replaces the set (the shrinking path) and the read then reports one audience.
10. Each of the three periods resolves to the dates named in its definition for a table of month boundaries, both
    leap and non-leap, including the year boundary - the table is written into
    `tests/domain/periods.test.ts` with the expected dates enumerated per cycle month, not derived by the same code.
11. Selecting a period and saving stores ordinary occurrences **and the provenance** - `period_id`, `period_cycle` and the `period_name` snapshot - resolves the dates **on the server** from `period { id, cycleMonth }`, refuses a create that sends both a period and explicit dates, reports `period` on the read, filters by `?period=`, and shows one line on the detail; a renamed definition leaves the stored name and dates unchanged.
12. The USSD anonymous screen shows an event only when its whole audience set is `Everyone`.
13. A registered visitor is in an event only when every selected audience names visitors, so
    `Visitors only` intersected with `Choir` resolves to zero members and the preview says so.
14. Editing only the second audience of an event moves the parent `ETag`, and `?ministry=` returns the event when
    any of its audiences projects to that ministry.
15. Saving an event whose intersection is empty succeeds, the detail reports 0 expected, and the preview carried the
    warning first.
16. The USSD anonymous screen answers an event only when its whole set is `Everyone`; an authenticated caller gets the
    lowest tier among the projecting audiences.
17. A daily rule with `INTERVAL=3` resolves every third day from its start date, the list labels it "Every 3 days", and
    a daily rule with `INTERVAL=1` labels "Daily"; both are authorable in the builder.
18. A **period-relative recurrence** (`period { id, frequency: 'monthly', day }`) generates one date per cycle —
    Communion Week's Sunday in every month for "Miracle Sunday" — previews across several months rather than one
    window, and materialises forward without rewriting past dates. It is refused when sent alongside `occurrences` or
    a `recurrence`, and refused when both `cycleMonth` and `frequency` are sent; without `day` it generates the whole
    period, and `day` is refused on Home Cells.
19. The event type is chosen at create and the edit form offers no Repeats switch at all. **For an rrule schedule** the rule is editable while no occurrence is dated today or earlier, no offering is attached or counted,
    and no headcount, attendance row or import suppression exists; saving it replaces the version in force - the
    current row is deleted and the replacement inserted with the same `effective_from` in one transaction, allowed
    because the guard means nothing has happened against those dates - then
    regenerates the window so the calendar matches the preview; once the guard is closed the builder is read-only
    with the cause named, rewriting the rule answers `409 recurrence_locked`, appending a version that starts after the
    last generated occurrence still succeeds through the dialog, and a locked parent `PATCH` that omits `recurrence`
    succeeds. A **period rule** is governed the same way but replaces stored fields rather than a version row (AC 18).

## Testing Decisions

- Tests assert external behaviour: the dates an event resolves to, the roster and `expected` a multi-audience event
  reports, the resolved dates of a period for a date table, the refusal of `eventNo`, and the counts on the form's
  submitted payload.
- Seams, highest first: the event create/read contract; the composition function and the period resolver and the
  rrule mapping as pure functions with date tables; the event form (DOM). No new seam below those.
- Prior art: `tests/domain/audience-evaluator.test.ts` (pure function), `tests/api/events-write.test.ts` (wire),
  `EventFormPage.dom.test.tsx` (form).

## Sibling specs this round must amend

§1 forbids a spec and the code disagreeing, so the same change must edit these, and the reviewer should treat a
missing one as blocking:

- `member-registrations-api.md` - the event create/patch body (`audienceIds`, the `audienceId` alias, no `eventNo`),
  the event read (`audiences[]`, the alias), `GET /v1/audiences?countAt=`, `GET /v1/events/periods`,
  `POST /v1/events/preview`, and the `event_audiences` table with its uniqueness.
- `member-registrations-event-audience.md` - A-4's anonymous `Everyone` rule becomes "the whole set is `Everyone`";
  A-6's archived-audience rule per row; and a note that composition is intersection with the visitor asymmetry above.
- `member-registrations-ui.md` - FR-42a/b/g (no event-number control, the 409 as a banner), FR-42f (the builder and
  the period choice), FR-43 (the preview is server-side), AC-56, AC-60 and AC-64 lose or gain the clauses this
  changes.
- `member-registrations-api.md` - FR-32's "one saved **audience**" wording becomes a set, and the event uniqueness
  key `(lower(name), audienceId)` is restated as the unordered set, in the same table that documents the
  create/patch body.
- **The committed contract's own vocabulary description** - `src/schemas/events.ts`'s `recurrenceRuleInputSchema`
  description (rendered into `openapi.json`) enumerated WEEKLY/MONTHLY only and bounded `INTERVAL` to 1-4;
  **this change amends it** to name daily with its optional 1-7 interval, so the contract and this spec agree.
- **`member-registrations-api.md`'s `event_recurrence_versions` row** - it called the table "append-only" with no
  carve-out, while §24d's guarded rewrite deletes the version in force. The row now states the carve-out and the
  reason, matching the `event_recurrence_exceptions` row's existing reasoning about records that carry no history.

## Out of Scope

- Per-occurrence audience or venue; offerings stay parent-level.
- Retrofitting a changed period definition onto events already saved.
- A calendar screen; periods are choices, not a month view.
- An intersection **static** check for emptiness (a data property, not syntax).
- Any change to offerings, attendance, imports or payments beyond what the audience multiplicity forces.

## Further Notes

- **Order it lands in, and why:** spec -> **the wire design** (`10-event-create` and its edit state drawn as `target`
  and signed by the owner, or `auto-signed` under §17 if the round is unattended) -> contract (schemas, `openapi.json`
  snapshot, examples) authored from both -> API, migration and the readers -> UI built to the frozen contract and the
  signed design -> capture and the 1:1 comparison that closes the mock row. Design-first, per the owner's 2026-11-24
  ruling recorded in `documents/agents/parallel-ui-api.md`: the wire design is an input to the contract because the
  screen is its first consumer, and the frozen-contract seam never licenses building a screen whose states are
  unsigned.
  **Debt carried by this round:** the contract merged in PR #233 (the contract PR) before any wire design existed, so
  the design is drawn now and any gap it exposes is a small spec amendment plus a contract change before the UI PR,
  not a UI workaround.
- **Gates:** the migration (`event_audiences`, `event_no NOT NULL`) and the wire contract both park until the owner
  names this round and the gate in one instruction (AGENTS.md §17).
- **Changelog 2026-11-24 (post-approval, owner rulings):** the landing order changed twice in one day, in one
  direction. First the **wire design** was placed before the UI code instead of the states being re-cut from the build;
  then the owner adopted **design-first** outright, so the wire design is now an input to the **contract** as well:
  spec -> wire design (signed) -> contract -> API -> UI. "Mock" in these decisions means the UI wire design, not an API
  handler mock. Recorded in `documents/agents/parallel-ui-api.md`, which separates the two meanings and states the
  gap rule (a field the design needs after the freeze is a spec amendment plus a contract change). The round carries
  four PRs and its contract froze before any design existed, so that re-order is recorded as debt on the round. No
  behaviour changes.
- **Changelog 2026-11-24 (post-approval, owner ruling - behaviour):** **daily is authored, not refused.** The closed
  vocabulary shipped without daily in PR #234 and refused `FREQ=DAILY` on writes, while the list already rendered
  "Every 3 days" for a stored rule and the form could express no daily meeting. Daily is now in the vocabulary with an
  `INTERVAL` of 1-7 (so "every other day" is `INTERVAL=2`), a fourth cadence in the builder with a number field, and
  label branches for "Daily" / "Every N days"; `member-registrations-ui.md` FR-42f and AC-63 are amended to match, and
  AC 17 here pins the behaviour. A stored daily rule no longer has to be read-only, and the test fixtures that used it
  stay valid. This is a behavioural amendment to an approved spec, so it carries its own review.
- **Changelog 2026-11-24 (post-approval, owner ruling - behaviour):** **a period event keeps its provenance.** The earlier decision - resolve once, store dates, store nothing about the period - is reversed: the event now records `period_id`, `period_cycle` and a `period_name` snapshot, the **server** resolves the dates from `period { id, cycleMonth }` at create so preview and create share one authority, the read and the list expose it (`?period=`), and the detail shows one line. The name is a snapshot, so a renamed definition leaves the event reading as it was. This adds columns and changes the create body, which is why it re-enters both §17 gates.
- **Changelog 2026-11-24 (post-approval, owner ruling — behaviour):** the period model becomes **ordinal**. The boundary
  definition ("the week ending before the month's first Sunday") is **superseded**: on the pentecostal basis the communion
  service is the Sunday of the **first week**, so a period is now a position — cadence, month in quarter, this month or
  the month before, week 1–4 or last, weekday — and a week belongs to the month its Sunday falls in. This changes
  Communion Week's dates in months that begin on a Sunday, which is the point of the ruling, and the code catalogue and
  its date table change with it. Per-cycle exceptions stay in the event admin; the period carries none.
- **Rejected by the owner or the grill**, recorded so they are not rediscovered: a new exclusion clause type
  (`excludeClauses`) - intersection composes a positive and a negative audience instead; union composition; a set-based
  replacement of the primary in this round (the shim keeps it revertible); a period authoring screen in this round;
  **provenance for period events - reversed 2026-11-24, the event now keeps it, see the changelog**;
  `COUNT`/`BYMONTH`/`BYSETPOS` beyond ±1 in the authored vocabulary; rewriting stored
  rrules to add `WKST`.
