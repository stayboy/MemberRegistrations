# Member registrations - headcount

**Status:** draft, 2026-11-14 (rework after review). This spec owns the headcount observation model. The
USSD surface spec (`member-registrations-ussd.md`, "Attendance: check, punch, clock, delegate,
headcounts") keeps the phone rendering, the prompt grammar and the glossary; where the two disagree, this
document wins on the model and that one wins on the screen.

Purpose: a headcount is the operator's counted attendance at a moment, for one session, recorded **by
mode**. Today a session has one chain of observations and a count in any mode supersedes the previous one;
the operator therefore cannot hold an adults count and a children count at once. This spec makes each mode
its own lane, retires `mixed`, and adds two specialised lanes plus the vocabularies they need.

## User Stories

1. As an operator, I want to count adults and children in the same session without one wiping the other,
   so that a service with both groups is recorded once.
2. As an operator, I want to record a visitors count beside the members' count, so that a service with
   guests is not under-counted.
3. As an operator, I want to count presbyters present by office, so that the church knows how many
   officers attended.
4. As an operator, I want to correct the children's count without touching the adults' count, so that a
   typo in one lane does not restate another.
5. As an operator, I want each lane to show when it was counted and by whom, so that an older lane cannot
   be read as the session's total.
6. As an operator, I want the screen to name the mode I am reading, so that "142" is never ambiguous.
7. As an operator, I want an all-zero count to be a real count of zero rather than "not recorded", so that
   an empty children's session is distinguishable from an uncounted one.
8. As an operator, I want a session's history to keep the retired mixed counts readable, so that last
   year's record still makes sense.
9. As a church administrator, I want the presbyters' count to reflect our offices, so that elders,
   deaconess and deacons are counted as the church recognises them.
10. As a reader of a report, I want it to say which mode it counted, so that two figures that are not
    comparable are never added together.
11. As a maintainer, I want a new mode to be a data change, so that a specialised service does not need a
    release.

## 1. The observation

- **HC-1** An observation records exactly one **mode**, one `asOf`, one line per bucket the mode declares,
  the recorder and the time it was recorded. It is append-only: a superseded observation is not invalid,
  it stays the record of the count at its `asOf`.
- **HC-2** A session holds **one chain per mode**, enforced by a partial unique index on
  `(event_instance_id, session_date, mode) where supersedes_id is null`. **Both** a plain new count and a
  correction supersede the current observation of **that mode**; a correction additionally keeps the
  superseded row's `asOf` (the moment counted) while a new count takes `asOf` now. Neither ever touches
  another lane.
- **HC-3** Several modes **MAY** be current in the same session at the same time. Reading the children's
  count uses the `children` lane; reading the adult count uses the `adults` lane.
- **HC-4** `asOf` MUST fall within the session's calendar day in the event timezone. The window is
  evaluated per observation: recording one lane never restates another lane's `asOf`.
- **HC-5** Each bucket is an integer 0-10,000; a mode's `total` is the sum of its buckets and at most
  30,000; an all-zero observation is allowed and is a real count of zero.
- **HC-6** `ended` is a **session-level** fact, not a lane's: an ended attendance capture closes every
  lane for writing, and the history of every lane stays readable.

## 2. Modes and buckets are reference data

- **HC-7** This change performs **one** schema migration (HC-19) that moves the six fixed bucket columns
  into a lines table and the mode/bucket vocabularies into reference tables. **After** that migration,
  adding a mode or a bucket is a data change and MUST NOT require another migration. The absolute reading
  - "modes are data today" - is false and would contradict HC-19.
- **HC-8** The declared modes are:

| Code         | Label            | Buckets                                                                    |
| ------------ | ---------------- | -------------------------------------------------------------------------- |
| `adults`     | Adult service    | adult male, adult female, child unspecified (labelled "children" on entry) |
| `children`   | Children service | child male, child female, adult unspecified (labelled "adults" on entry)   |
| `visitors`   | Visitors         | visitor male, visitor female, visitor children                             |
| `presbyters` | Presbyters       | elders, deaconess, deacons                                                 |

- **HC-9** `mixed` is **retired**. No new observation may be recorded in it: the write path rejects the
  code, `HEADCOUNT_MODES`/`HeadcountMode` in the code stop accepting it, and the USSD surface stops
  offering it, which retires the glossary row `headcount.mixed_service` and the mock state
  `12-mixed-service`. Existing observations stay readable, labelled **Mixed (retired)**, and are never
  rewritten or hidden.
- **HC-10** A bucket is named by its mode, and a mode arrives with its buckets or not at all; a mode's
  bucket set is what defines its entry line.
- **HC-26** A specialised mode is its own lane and is addressed on its own: `visitors` and `presbyters` are
  counted at different moments and by different people, so no surface may fold either into another mode's
  prompt. The surface detail - the USSD menu entry, the prompt grammar and the portal control - is the USSD
  and UI specs'; this rule exists so an implementer does not treat a specialised mode as a variation of
  adults or children.

## 3. Presbyter titles (owned by the officers spec)

- **HC-11** The title vocabulary - Pastor, Apostle, Elder (male only), Deaconess (female only), Deacon
  (male only) - its gender restrictions and its write surface are specified in
  `member-registrations-officers.md` and are not restated here.
- **HC-12** A headcount write never sets or changes a title; the gender restriction is that spec's write
  path, and this spec only reads the titles it declares.
- **HC-13** The `presbyters` lane counts people by **office** in three buckets. The mapping is declared
  with the mode:

| Bucket    | Title that fills it |
| --------- | ------------------- |
| elders    | Elder               |
| deaconess | Deaconess           |
| deacons   | Deacon              |

**Pastor and Apostle are not counted in this lane.** They are heads: their number is zero or one at most
services, and only rarely more than one, so their attendance is recorded **against their membership** as
members present rather than as a headcount bucket (owner, 2026-11-14). The lane counts the three offices.

## 4. Ministry positions (owned by the officers spec)

- **HC-14** The position vocabulary - Ministry Leader, Asst. Leader, Secretary, Organising Secretary,
  Financial Secretary, Executive Member - and its write surface are specified in
  `member-registrations-officers.md`.
- **HC-15** A headcount surface MAY read a member's position for attribution - who was on duty at a
  counted service. A position is never arithmetic: it changes no count, bucket, total or report.

## 5. Reading

- **HC-16** `GET /v1/events/{id}/headcounts?sessionDate=` returns `current` as a map keyed by mode (each
  nullable) plus `observations`, and accepts an optional `mode` filter that limits `observations` to one
  lane and sets `current` to that lane alone.
- **HC-17** One request MUST serve a page that shows every lane. A page MUST NOT issue one request per
  mode.
- **HC-18** Every lane a page shows carries its own `asOf` and recorder, so an older lane cannot be read
  as the session's total.
- **HC-24** A consumer that needs the session's **capture time** uses the latest observation across all
  lanes - a timestamp, not a figure - and `capture.asOf` in the events surface follows this rule. A
  consumer that needs a **count** names a mode (HC-22).

## 6. Legacy rows and the migration

- **HC-19** The migration is a **mechanical, lossless reshape**: every existing headcount row becomes one
  observation plus one line per **non-zero** bucket. It rewrites no chain and creates no **additional**
  observation. An all-zero observation carries no lines and keeps its total of zero.
- **HC-20** A retired `mixed` observation migrates to its lines - at most four, because both unspecified
  buckets were forced to zero - and keeps its `asOf`; it is readable and immutable.
- **HC-21** Where a legacy chain had a `mixed` observation supersede an `adults` one, the `adults` lane
  has **no** current observation afterwards and reads **not recorded**. It MUST NOT fall back to the
  superseded adults row. This is what "no data migration for legacy chains" means: the reshape in HC-19
  is a column-to-line move, not a chain rewrite and not a lane backfill.

## 7. Reports

- **HC-22** A read that needs a single figure MUST name a mode. No read sums lanes, and no report derives
  one lane from another.
- **HC-23** The register-derived **expected** figure stays separate and labelled **Roster**; it is never
  written by a headcount and never summed with one.
- **HC-25** A correction MAY change the mode of the observation it supersedes - the allowance the API spec
  already records - but **only when the destination lane has no current observation**; otherwise it is
  refused with a validation error naming that lane. When it is accepted, the correction becomes the
  destination lane's current and the superseded observation's lane reads **not recorded**, under HC-21's
  rule. The partial unique index is the invariant behind the refusal, but the operator gets the named
  error, not a constraint violation.

## Acceptance Criteria

### AC-H1: **Given** a session with an adults count, **When** a children count is recorded, **Then** both lanes are current, each with its own `asOf`, and the adults observation is neither superseded nor hidden. (HC-2, HC-3)

### AC-H2: **Given** a current children count, **When** it is corrected, **Then** the correction supersedes the children lane only, keeps the original `asOf`, records who corrected it, and leaves every other lane untouched. (HC-2)

### AC-H3: **Given** a retired `mixed` observation, **When** the history is read, **Then** it is labelled Mixed (retired), its buckets are unchanged, and both the API write path and the USSD surface refuse a new `mixed` count. (HC-9)

### AC-H4: **Given** a `visitors` mode, **When** an observation is recorded, **Then** it carries visitor male, visitor female and visitor children and no adult or child buckets. (HC-8, HC-10)

### AC-H5: **Given** a `presbyters` mode, **When** an observation is recorded, **Then** it carries elders, deaconess and deacons and no other buckets, and no Pastor or Apostle bucket exists. (HC-8, HC-13)

### AC-H6: **Given** a title restricted to one gender, **When** it is set on a member of the other gender, **Then** the write is refused with a validation error naming the title and nothing is stored - the behaviour is specified as AC-O2 in the officers spec, and the headcount lane only reads the titles it declares. (HC-12)

### AC-H7: **Given** a headcount page, **When** it loads, **Then** one request returns every lane's current observation, each with its `asOf`, and the page issues no second request for another mode. (HC-16, HC-17, HC-18)

### AC-H8: **Given** an ended session, **When** a headcount is submitted for any lane, **Then** it is refused and every lane's history remains readable. (HC-6)

### AC-H9: **Given** a migrated legacy session, **When** its lanes are read, **Then** a lane whose only row was superseded by a `mixed` observation reads not recorded, and no stale figure appears. (HC-19, HC-20, HC-21)

### AC-H10: **Given** a report that needs a headcount figure, **When** it reads, **Then** it names a mode and returns that lane alone; no report sums lanes. (HC-22)

### AC-H11: **Given** a lane that already has a current observation, **When** a plain new count is recorded in that mode, **Then** it supersedes that lane's current, takes `asOf` now, and the session never holds two current rows of the same mode. (HC-2)

### AC-H12: **Given** two lanes in one session, **When** the second lane is recorded, **Then** the first lane's observation, `asOf` and recorder are unchanged. (HC-4)

### AC-H13: **Given** an all-zero observation, **When** it is read back, **Then** it carries no bucket lines, a total of zero, and is `current` for its lane - it is not treated as "not recorded". (HC-5, HC-19)

### AC-H14: **Given** `?mode=children`, **When** the headcounts are read, **Then** `observations` holds only that lane's history and `current` holds only that lane. (HC-16)

### AC-H15: **Given** a headcount-only session, **When** its capture time is read, **Then** it is the latest observation across all lanes, while any count shown names its mode; the Roster figure is never added to a lane. (HC-23, HC-24)

### AC-H16: **Given** a correction that names an observation in another mode, **When** the destination lane has no current observation, **Then** the correction becomes that lane's current and the superseded observation's lane reads not recorded; **When** the destination lane already has a current, **Then** the response is a validation error naming that lane and nothing is written. (HC-25)

## Settled with the owner (2026-11-14)

The accepted rulings live in the rules they changed (HC-13, HC-26). This section records only the
**rejected** decisions, which no rule carries:

- **Visitors having identity** - withdrawn: the existing model settles it, a visitor count is a number,
  not a register.
- **Positions gating anything** - withdrawn: `AGENTS.md` section 6 states there is no per-officer
  authorization in V2.

## Out of scope

- Per-member attendance, the roster-derived expected count and clock-in are unchanged.
- Who may record a headcount (presbyter or admin, delegation rules) stays in the USSD spec.
- The write surface for presbyter titles and ministry positions is a follow-up round; this spec fixes the
  vocabularies, the gender restriction and the read the headcount surface needs.
- Offering counts share the "observation, correction, retired mode" vocabulary but are a separate
  surface and are not re-specified here.
