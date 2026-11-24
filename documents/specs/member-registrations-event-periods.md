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
- `effectiveFrom` need not fall on a chosen weekday: the first occurrence is the first matching date on or after it,
  and the preview shows it. A monthly day-of-month of 31 skips short months.
- **One builder, both call sites.** `EventFormPage` and `AddScheduleVersionDialog` share one builder component;
  weekly, fortnightly and monthly-on-day remain as presets that fill it.

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

- **Three periods, declared in code** in `src/domain/periods.ts`, resolved by one pure function
  `resolve(period, cycle: 'YYYY-MM') → YYYY-MM-DD[]`. The catalogue is shaped so a data table would be a mechanical
  move; a fourth period is the trigger to make that move (backlog row added).
  - **Communion Week** - the Sunday-to-Saturday week whose last day is the Saturday before the first Sunday of the
    cycle month.
  - **Gospel Week** - that window shifted back seven days (so it ends on the Saturday eight days before the cycle
    month's first Sunday).
  - **Home Cells** - the single Monday of Communion Week.
- **The cycle is the month of the Communion Sunday the week precedes**, written `YYYY-MM`: cycle `2027-01` is the
  week 27 Dec 2026 - 2 Jan 2027, which is the week **before** January 2027's first Sunday; cycle `2026-12` would be
  the week before December 2026's first Sunday. The form defaults it to the month of the start date, else the server's
  current UTC month, and always shows the resolved range, because a cycle can cross a month boundary.
- **Dates are UTC calendar dates server-side and are formatted, never shifted, by the UI** (AGENTS.md §4 and
  `ui-date-time-formatting.md`): the resolver takes no clock and no `events.timezone`, which keeps its current job of
  deciding "today" and held status.
- **A period resolves once, at save, into an ordinary standalone event.** The form submits the previewed dates as
  `occurrences[]`; no period id and no rule are stored, so nothing ever re-resolves and
  `POST /v1/events/generate` cannot touch it. The period's name may prefill the description.
- **Two read-only contract entries:** `GET /v1/events/periods` (id, name, definition) served from the code
  constants, registered before `/:id`; and `POST /v1/events/preview` - no persistence - accepting either the create's
  `recurrence` or `period: { id, cycleMonth }`, returning
  `{ occurrences: [{ date, expected }], audienceCounts: [{ id, count }] }` within the create's 90-day window.
- **Creating and editing named periods is another round**: an admin screen and a catalogue table are deferred, with
  the backlog row "named-period catalogue and authoring screen", triggered by a fourth period or a definition change
  that must not need a deploy.

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
11. Selecting a period and saving stores ordinary occurrences and no provenance.
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
- **Rejected by the owner or the grill**, recorded so they are not rediscovered: a new exclusion clause type
  (`excludeClauses`) - intersection composes a positive and a negative audience instead; union composition; a set-based
  replacement of the primary in this round (the shim keeps it revertible); a period authoring screen in this round;
  provenance for period events; `COUNT`/`BYMONTH`/`BYSETPOS` beyond ±1 in the authored vocabulary; rewriting stored
  rrules to add `WKST`.
