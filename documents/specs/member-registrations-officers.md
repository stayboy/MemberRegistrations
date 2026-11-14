# Member registrations - officers, titles and ministry positions

**Status:** draft, 2026-11-14. New spec, produced from the headcount round's grill. It owns the two
vocabularies the headcount's `presbyters` lane depends on; `member-registrations-headcount.md` points here
rather than owning them.

## Problem Statement

The register knows that a member **is** a presbyter (`members.is_presbyter`) and how senior that presbyter
is (`presbyter_rank`), but not **what kind**. A church officer is a Pastor, an Apostle, an Elder, a
Deaconess or a Deacon, and those are different offices with different rules - an Elder and a Deacon are
men, a Deaconess is a woman. Nothing records which one a member holds, so a roster cannot say "Elder
Mensah", a counted service cannot say how many deacons attended, and the headcount's new `presbyters`
lane has no offices to count.

The same gap exists below the officer level. A member belongs to ministries (`member_ministries`), but the
row records only that they belong: not whether they lead the ministry, keep its minutes, or sit on its
executive. A counted service therefore cannot record who was on duty.

## Solution

Two small pieces of reference data, each extensible without a migration:

- **Presbyter titles** - Pastor, Apostle, Elder (male only), Deaconess (female only), Deacon (male only).
  A member holds at most one, and a title's gender restriction is enforced wherever the title is written.
- **Ministry positions** - Ministry Leader, Asst. Leader, Secretary, Organising Secretary, Financial
  Secretary, Executive Member. A member holds at most one per ministry.

Both are vocabularies, not permissions: they change no count, report or access rule. They exist so a
register can name an office and a duty.

## User Stories

1. As a church administrator, I want to record that a member is an Elder rather than merely "a presbyter",
   so that the register names the office the church actually recognises.
2. As a church administrator, I want to record that a member is a Deaconess, so that women officers are
   recorded with their own title rather than as generic presbyters.
3. As a church administrator, I want the register to refuse an Elder title for a woman, so that a title's
   rule is enforced by the system and not by memory.
4. As a church administrator, I want the register to refuse a Deaconess title for a man, for the same
   reason.
5. As a church administrator, I want to add a title the church adopts later, so that a new office does not
   need a code change.
6. As a church administrator, I want to record that a member is the Ministry Leader of a ministry, so that
   the register shows who leads it.
7. As a church administrator, I want to record that a member is the Secretary of one ministry and an
   Executive Member of another, because duties differ by ministry.
8. As a church administrator, I want a second position in the same ministry to be refused, so that one
   member does not appear to hold two offices there.
9. As a church administrator, I want to add a position the church adopts later, so that a new duty does not
   need a code change.
10. As an operator counting a service, I want the presbyters lane to count elders, deaconess and deacons,
    so that the count mirrors the offices the church recognises.
11. As an operator, I want a counted service to show which officer or officer-elect was on duty, so that
    the record says who attested the count.
12. As a reader of the roster, I want a member's title shown beside their name, so that an office is
    visible without opening the record.
13. As a maintainer, I want both vocabularies to be data, so that adding an office or a duty is a row, not
    a release.
14. As a church administrator, I want to record the date a member took an office when I know it, so that the
    register says when the office began rather than only that it is held.
15. As a church administrator, I want an undated office to be recorded anyway, so that a register written
    from memory is still usable.

## Implementation Decisions

- **Two reference tables.** `presbyter_titles (code, label, gender_restriction, active)` and
  `ministry_positions (code, label, active)`. Codes are stable, lowercase, and immutable; labels are
  display strings; `active` retires an entry without deleting it, because a member may still hold it.
- **Title on the member.** `members.title_code` is nullable and references `presbyter_titles.code`. A
  member holds at most one. `is_presbyter` remains the boolean the API already exposes, and it is
  **independent** of the title: neither write path changes the other, so a member can hold an office
  without being a presbyter of this assembly.
- **Date the title was taken.** `members.titled_on` is a nullable UTC calendar date beside the title,
  because the church often knows the office and not its date. It is optional and independent: a title with
  no date is complete. A date in the future is refused, and clearing the title clears the date, so a stale
  date never outlives its office.
- **Gender restriction.** `gender_restriction` is `male`, `female` or null. The write path validates the
  member's `gender` against it and answers `422 validation_error` naming the title; the check lives in the
  repository beside the existing bucket and rank validations, not in the form.
- **Position on the membership.** `member_ministries.position_code` is nullable and references
  `ministry_positions.code`, giving at most one position per ministry for free under the existing primary
  key.
- **Extensibility.** After the migration that creates the two tables, adding a title or a position is an
  insert. Retiring one is `active = false`; existing references stay valid and render with the label they
  had.
- **No permissions.** Neither vocabulary grants access. V2 has no per-officer authorization: every
  authenticated officer reads and writes the whole register.
- **Headcount mapping.** The `presbyters` lane's three buckets map to titles - elders to Elder, deaconess
  to Deaconess, deacons to Deacon - and the mapping is declared with the mode. Pastor and Apostle are not
  counted in that lane: they are heads, recorded against their membership as members present (owner,
  2026-11-14).

## Requirements

- **O-1** Titles MUST be reference data with stable codes, mutable labels, an optional gender restriction
  and an active flag; positions MUST be reference data with stable codes, mutable labels and an active
  flag.
- **O-2** A member MUST hold at most one title and at most one position per ministry.
- **O-3** A title whose gender restriction excludes the member's gender MUST be refused with a validation
  error naming the title, and nothing MUST be written.
- **O-4** A title and `is_presbyter` MUST be independent. Writing or clearing a title MUST NOT change
  `is_presbyter`, and setting or clearing `is_presbyter` MUST NOT change the title. A member MAY hold a
  title while `is_presbyter` is false, because an office can be held without presbyter status in that
  assembly.
- **O-5** Adding or retiring a title or a position MUST be a data change, not a schema change.
- **O-6** A retired title or position MUST keep rendering on records that hold it, and MUST NOT be
  offered for new assignment.
- **O-7** Neither vocabulary MUST affect a count, a report total or an access decision; a headcount surface
  MAY read a position for attribution only.
- **O-8** A title MAY carry the UTC calendar date it was taken. The date MUST be optional, MUST NOT be in
  the future, MUST be cleared with the title, and MUST NOT be required by any surface.

## Acceptance Criteria

### AC-O1: **Given** the title list, **When** a member is given a title, **Then** the member carries exactly one title and the API returns its code and label. (O-1, O-2)

### AC-O2: **Given** an Elder title restricted to men, **When** it is set on a female member, **Then** the response is `422 validation_error` naming the title and the member row is unchanged. (O-3)

### AC-O3: **Given** a member with a title, **When** the title is cleared, **Then** `is_presbyter` is unchanged and the member shows no title; **Given** a titled member, **When** `is_presbyter` is set false, **Then** the flag persists as false and the title is unchanged; **Given** a member whose flag changes, **Then** the title is unchanged. (O-4)

### AC-O4: **Given** a member in two ministries, **When** a position is set in each, **Then** both are stored; **When** a second position is set in the same ministry, **Then** it replaces the first and no two positions exist for that membership. (O-2)

### AC-O5: **Given** a retired title held by a member, **When** the member is read, **Then** the title renders and it is not offered for assignment to anyone else. (O-5, O-6)

### AC-O6: **Given** a headcount `presbyters` lane, **When** it is recorded, **Then** its elders, deaconess and deacons buckets follow the declared title mapping and no position changes any count. (O-7)

### AC-O7: **Given** a member is given a title with a date, **When** the member is read, **Then** the title and its date are returned; **Given** the same title with no date, **Then** it is stored and returned with a null date; **Given** a date in the future, **Then** the response is `422 validation_error` and nothing is written; **Given** the title is cleared, **Then** the date is cleared with it. (O-8)

## Testing Decisions

- Test at the **HTTP boundary**, not through the repository: the title and position write routes, the
  gender refusal, the one-per-ministry replacement, and the retired-entry read. These are external
  behaviours and the API suite already tests members this way (`tests/api/members.test.ts`).
- Test **extensibility** by inserting a row in the test database and asserting it is offered, then retiring
  it and asserting it is not - that proves "data, not code" without touching the schema.
- Test the **date** at the same boundary: a dated title, an undated title, a future date refused, and the
  date cleared by clearing the title. Four cases, no unit test of the parser.
- Test the **headcount mapping** once, in the headcount suite, by recording a `presbyters` observation and
  reading the three buckets back; do not duplicate it in the members suite.
- Do not unit-test the gender rule in isolation: the meaningful assertion is the refused write.

## Out of Scope

- **Who may set a title or a position.** V2 has no per-officer authorization.
- **History of a title or position.** This spec stores the current value only; if the church needs a
  record of promotions and demotions, that is an append-only events table and its own spec.
- **Ordination workflow, dates, or certificates.**
- **Reporting beyond attribution.** No report groups by title or position yet.
- **The member form's layout.** Where the fields sit is a UI round.

## Further Notes

- This spec exists because the headcount's `presbyters` lane needs offices; splitting it out keeps the
  headcount spec about counting. `member-registrations-headcount.md` names the mapping and defers the
  vocabulary here.
- `members.presbyter_rank` (seniority, 1 = most senior) already exists and is unaffected. It orders
  presbyters; it does not say what office they hold.
- The two lists are deliberately small. A church that adopts an office the vocabulary lacks should add a
  row, and the register should not need a release to learn a word.
- O-4's independence rule is the owner's ruling (2026-11-14): a member can hold the office of Elder while
  not being a presbyter of this assembly, so the title and the flag are separate facts. Multi-assembly
  tenancy is not modelled yet: the flag is per assembly in the real world, and the register has one
  assembly today.
