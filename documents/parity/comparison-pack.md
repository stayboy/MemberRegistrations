# Parity comparison pack

**2026-11-15.** The release's DoD item 5 claims parity for surfaces with a live source and a signed mock.
This pack is the comparison that claim needs: baseline beside mock, with my read of each. The verdicts
here are the release gate's inputs, not the gate itself — a `drift` row is a finding, not a decision.

**How to use it.** Rows marked `read` were compared image-to-image in this pass. Every row with a baseline
and a signed mock has now been read; the rows marked `not claimable` have no signed mock, so parity cannot
be claimed for them at all.

| #      | Surface                                           | Baseline                                      | Mock                                       | Hash          | Read                                                                                  |
| ------ | ------------------------------------------------- | --------------------------------------------- | ------------------------------------------ | ------------- | ------------------------------------------------------------------------------------- |
| 1      | members list                                      | `members-list.png`                            | `v2-shell/01-shell-expanded-light.png`     | `4bfb1888…`   | **read — matches**                                                                    |
| 2      | events list                                       | `events-list.png`                             | `v2-events/01-events-list.png`             | `16a6249f…`   | **read — matches**                                                                    |
| 2a     | new event form                                    | `events-new.png`                              | `v2-events/10-event-create.png`            | `97312ae3…`   | **stale - the drawing was re-cut after this read (parity-audit, 2026-11-25)**         |
| 2b     | new series form                                   | -                                             | -                                          | -             | **retired: the series screens are gone**                                              |
| 3      | activity detail, event kind                       | -                                             | -                                          | -             | **retired with the activity-detail states (parity-audit, 2026-11-25)**                |
| 4      | activity detail, series kind                      | -                                             | -                                          | -             | **retired with the activity-detail states (parity-audit, 2026-11-25)**                |
| 5      | headcount dialog                                  | `event-headcount-dialog.png`                  | `v2-events/06-record-headcount-dialog.png` | `c65614ec…`   | **read — the mock was stale, re-cut**                                                 |
| 6      | import panel                                      | `event-import-panel.png`                      | `v2-events/07-import-attendance-panel.png` | `24bd2629…`   | **read — matches**                                                                    |
| 7      | settings                                          | `settings.png`                                | `v2-settings/01-date-time-settings.png`    | `f6b66b7f…`   | **read — mock re-cut to the build**                                                   |
| 8–12   | shell ×5 (light, dark, collapsed, mobile, meadow) | `shell-*.png`                                 | `v2-shell/01…06`                           | see catalogue | **read — matches; the rail gained support**                                           |
| 13–15  | shepherding officers, roster, report              | `shepherding-*.png`                           | `v2-shell/07…09`                           | see catalogue | **read — 4 defects and 2 spec gaps, fixed**                                           |
| 16–17  | imports members, batches                          | `imports-*.png`                               | `v2-imports/01-members-import.png`; none   | see catalogue | **outside parity** (DoD item 5)                                                       |
| 18, 21 | member detail, attendance dialog                  | `member-*.png`, `event-attendance-dialog.png` | **no signed mock state**                   | —             | not claimable                                                                         |
| 19     | add member                                        | `member-add.png`                              | `v2-shell/11-add-member.png`               | `c204e606…`   | **read — signed 2026-11-16; rebuilt on mock.css with the Contacts section (FR-29a)**  |
| 20     | contacts dialog                                   | `contacts-dialog.png`                         | `v2-shell/16-contacts.png`                 | `6b154603…`   | **read — signed 2026-11-16; listview re-cut, the build moved to the drawing (FR-78)** |

## 1. Members list — matches

The build draws the signed design: the **Archived** switch where the dropdown was, the ministries/status
filters, the row identity `FullName (Gender, Ny)`, `Contacts · n`, the `⋯` row menu, and Prev/Next in the
footer. Differences the mock draws and the build does not: the **ministries filter** (queued — needs a
read), and seven rows rather than the fixture's two. Both are recorded, neither is drift.

## 2. Events list — matches (row 2b retired)

Series rows lead the table: schedule text with `next <date>`, the `Series` subtitle, the ministry in the
same `CODE - name` shape as an event row, and an Active badge. Events follow with ranges, venue, counts
and status. The mock's **New event** / **New series** menu is built (round `events-add`, 2026-11-22): the
menu opens `#/events/new` and `#/events/series/new`; the new event and series forms are read against
`10-event-create.png` and `11-series-create.png` as rows 2a and 2b. **2b is retired** (parity-audit, 2026-11-25): the
series screens are gone, and row 2a’s hash is stale after the drawing was re-cut.

## 3. Activity detail, event kind — drift, and one real defect **— section retired (parity-audit, 2026-11-25): the

activity-detail states were pruned; the findings below are history, not a live claim.**

| #   | What         | Mock                                                     | Build                                                                                                                  |
| --- | ------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 3a  | Row controls | one right-aligned run: `View rows · Record headcount`    | three controls distributed across cells: `Record headcount` and `Import` under Headcount, `View rows` under Attendance |
| 3b  | Columns      | Date · Start · Attendance · Headcount · Source · Session | Date · Start · End · Status · Source · Present/expected · Headcount · Attendance                                       |
| 3c  | Panels       | the occurrences panel only                               | a definition card and the Active offerings panel as well                                                               |
| 3d  | **Defect**   | a single status pill per row                             | **the `Held` pill and the `Mixed` source label overlap** in the session row, reading as one clipped chip               |

**3d is a rendering bug, not a design difference.** The session row's status cell and its source cell
collide at this width. It is the kind of thing a capture cannot assert and only a reader sees, which is
why it survived three rounds of code review.

## 4. Activity detail, series kind — drift **— section retired (parity-audit, 2026-11-25): the series screens are gone.**

| #   | What          | Mock                                              | Build                                                                                                                                              |
| --- | ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4a  | Schedule cell | `Weekly on Sunday`                                | `Weekly on Sunday` **plus `FREQ=WEEKLY;BYDAY=SU`** — the raw RRULE the triage marked **retire** ("developer-facing text; keep the human schedule") |
| 4b  | Occurrences   | session rows with `Record headcount` and `Import` | dates only (Date · Exception · Events), because `OccurrenceListDto` carries no event ids — the parked R2b                                          |
| 4c  | Panels        | tiles and schedule only                           | a definition card (Ministry/Timezone/Status/Archived/Description) as well                                                                          |

4a was fixed after this pack was written: the cells read `scheduleLabel(rrule)` (`SeriesActivityRow.tsx`,
`SeriesDetailPage.tsx`), so the readable label renders without the raw string. This paragraph used to say
the code still rendered the RRULE; that verdict was stale, and the release claim's "fixed" rests on the
second reading.

## 5. Headcount dialog — the mock is the stale artefact

| #   | What     | Mock                                                                                                 | Build                                                                                                         |
| --- | -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 5a  | The form | **two lane groups at once**: VISITORS (Male/Female/Children) and PRESBYTERS (Elder/Deaconess/Deacon) | a **mode** choice (Adult service · Children service · Visitors · Presbyters) and the fields for that one mode |
| 5b  | Labels   | Male / Female / Children                                                                             | Adult men / Adult women / Children (for the adults mode)                                                      |
| 5c  | As-of    | a static note                                                                                        | a real `As of` field, because a record takes its own instant                                                  |

**The mock contradicts the model.** HC-1 says an observation records exactly one mode; HC-3 says several
modes may be current in one session _as separate observations_. A form that captures two lane groups at
once cannot be what the API accepts. The build is right and the mock needs a re-cut — the opposite verdict
to row 3.

## 6. Import attendance panel — the build is ahead

| #   | What                | Mock                                                                                                                                                                     | Build                                                                                                                                                                              |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6a  | Title and shape     | `Import attendance` dialog                                                                                                                                               | same title, same dialog, five regions                                                                                                                                              |
| 6b  | Selected occurrence | one line: the occurrence and "this capture will end it"                                                                                                                  | a bordered card: event number, date and time, a `held` badge, "Past session - this capture will end it", and a note that the file carries member numbers and never an event column |
| 6c  | Expected columns    | one sentence: `memberNo` required, `datetime` optional, must fall on that date                                                                                           | a two-card row: an `Expected columns` table (column / required / notes) and an `Excel template` card with a Download button                                                        |
| 6d  | Choose file         | a dashed drop zone, `Choose file - CSV or XLSX`                                                                                                                          | the same zone, with the size limits stated (`up to 10,000 rows`, `1 MB` of serialised JSON)                                                                                        |
| 6e  | Parsed rows         | a `Row / Member / Date and time / Result` table with two `Valid` rows and a footer `2 rows parsed. Nothing is written until you import.` plus `Cancel` / `Import 2 rows` | not visible in this capture: the build shows the parsed-rows table and the import verb only once a file is chosen, so the capture is the pre-file state                            |

**The build is ahead of this drawing, and what it adds is detail a caller needs at the moment of
choosing a file.** The panel's shape - the title, the dialog, the fixed occurrence, the chooser - is
the signed design in both. The build writes the occurrence as a bordered card with its event number, its
date and time and a `held` badge, states the size limits on the drop zone, and says in words that the
file carries member numbers and never an event column. Nothing here contradicts the mock.

The `Excel template` card is a build addition the mock predates: the 2026-11-04 amendment added the
templates, and the drawing was signed before them.

**6e is a state difference, not a gap.** The two captures sit at different points in the same flow - the
mock after a file was parsed, with two `Valid` rows and `Import 2 rows` armed; the build before any file
is chosen, where the parsed-rows table and the import verb do not exist yet. A reader is comparing two
moments, not two designs.

Nothing in this row is a defect.

## 7. Settings — routed, and the mock was re-cut to the build

| #   | What            | Mock                                                                                                      | Build                                                                                     |
| --- | --------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 7a  | Format controls | two **dropdowns** (date format, time format)                                                              | two **radio groups** with the same options                                                |
| 7b  | Preview         | a **separate full-width card**, six rows (record created, archived, last call, session start, birth date) | inside the Date and time card, **three rows** (record created, birth date, session start) |
| 7c  | Appearance card | accent and scheme only                                                                                    | an extra `APPEARANCE` overline duplicating the card's own title                           |

**Routed and resolved** (owner, 2026-11-15; `mock-recuts-parity`). The mock was re-cut to the build:
the dropdowns became radio groups, and the preview folded into the Date and time card as three rows. Here
the build was ahead of the drawing, which is the mirror image of the roster and officers findings - not
every drift means the build is wrong.

7c is a design difference a reader routes: the build's card carries both an `APPEARANCE` overline and the
card's own title. Accepted, with the overline as the residue to revisit if the card is next touched.

## 8–12. Shell — five states, one source

All five states - expanded light, expanded dark, collapsed light, mobile and the meadow accent - carry
the same shell: the brand block, the section rail with its overline, the top-level cluster, and the
pinned rail footer. What changes between them is the neutral ramp, the rail width and the accent, never
the structure.

The collapsed footer carries all three controls: the date and time format control, the support link (the
headphones icon) and the dark toggle. All three are present in the mock and in the build since the rail
change, which closes 8a's mismatch.

Meadow applies the accent to the active nav underline, the brand verb and the focus ring; light and dark
swap the neutral ramp and leave the accent alone.

The page inside the frame carries the differences already recorded in section 1: the ministries filter is
queued, and the attendance column shows the not-available dash under FR-69 while the mock draws counts.

| #   | What                   | Mock                                          | Build                                                             |
| --- | ---------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| 8f  | The page's single verb | a filled **primary** button carrying its icon | a **secondary** button with no icon - Fluent's default appearance |

**8f is a real difference, not a taste note.** It holds on every surface with exactly one verb: `Add
member` on the members page, and the same verb in each of the five shell states. The mock is the signed
artefact, and a page's one verb is meant to be the loudest control on the screen - a secondary outline
reads as an optional action beside the table. The fix is one appearance prop in
`ui/src/components/PageFrame.tsx` and a re-capture.

**Disposition: declared, not fixed** (owner, 2026-11-16: "cut the drifts and focus on the MVP"). The fix is
an appearance judgement with two directions - change the build, or re-cut five mocks - and neither buys a
line of behaviour. It ships as a named difference in the release claim, and the claim says so in the
sentence that makes it, not in a footnote. The residual is recorded rather than carried: if the next
release touches `PageFrame`, the prop is one line.

## 13–15. Shepherding — the roster read

| #   | What          | Mock                                                          | Build                                                                                                                        |
| --- | ------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 13a | Row actions   | a phone control (log call) and a `⋯` menu on every row        | **built but clipped**: `RowActionMenu` exists, and the table overflows its panel so the column sits outside the visible area |
| 13b | Column order  | Member · Contacts · Residence · …                             | Member · **Residence · Contacts** · …                                                                                        |
| 13c | Status column | `Status`, reading In church / Unknown / Not reported          | `Still in church`, reading Still in church / Never reported                                                                  |
| 13d | Filter chips  | counts beside the labels (All 7, Never called 2, Follow-up 4) | labels only                                                                                                                  |
| 13e | Footer        | 7 assignments in this view                                    | 4 assignments in this view (fixture size)                                                                                    |

**13a is a layout defect, not a missing feature — corrected after checking the source.** My first read of
the capture said the actions were absent; `ShepherdingRosterPage` has a `RowActionMenu` (FR-59a: Contacts,
Reassign, End, with Log call visible) at line 185. What the capture shows is that the **table overflows
its panel** at 1440 px, so the actions column falls outside the visible area. The requirement is built
and unreachable at this width, which is worse than either a gap or a difference: a reader cannot tell
it is there.

**Fixed** (`roster-eleven-columns`): the trailing actions column is pinned, so `Log call` and the `⋯`
menu are reachable at any width without scrolling to find them.

13b–13d are design differences a reader routes: the mock is the signed artefact, and the build reordered
the columns and renamed the status header. Accepted as differences with these lines (owner, 2026-11-15);
the mock was re-cut to FR-59a's eleven columns in the same round, so 13b–13d are the residue.

## 13–15b. Shepherding — the officers page

| #   | What            | Mock                                                                                          | Build                                                                                                      |
| --- | --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 14a | Church totals   | **five tiles**: assigned, unassigned, attempts, conversations, never called                   | **fixed**: five tiles above the table, from `GET /v1/shepherding/report`                                   |
| 14b | Coverage        | a banner: "1,054 active members are not on a shepherding list. Coverage is 12% (142 of 1196)" | **fixed**: the line is always written, `warning` when members are unassigned, `success` when none are      |
| 14c | Rows            | avatars, `Presbyter` in the caption, an `Open roster ›` affordance                            | no avatar, no Presbyter caption, a plain link on the name                                                  |
| 14d | **Defect**      | the officer column is wide enough for the identity                                            | **fixed**: the identity no longer collides - the width sits on the header cell, which a fixed layout reads |
| 14e | Nav in the mock | the pre-consolidation nav (Attendance, no USSD)                                               | the consolidated nav - **the build is right**                                                              |

**14a and 14b were FR-58.** The shepherding home "MUST ... show church totals (officers, active,
assigned, unassigned, attempts, conversations, never called), coverage and one row per officer". The build
showed the rows and none of the totals or coverage, so this was a second spec gap of the same shape as the
roster columns - and the mock, which drew them, was the record that caught it.

**Fixed** (`officers-church-totals`). FR-58 now names the shape it always implied: five count tiles, with
`officers` as the row count and `active` written in the coverage line, so all seven figures are on the
screen without a second request. The line is present in both states, because a percentage that only
appears with bad news cannot be read.

14c is a difference a reader routes: the identity is a link with the member number beneath it, and no
avatar. Accepted.

14e is owed, and cannot be paid in place: the officers mock is an image-only state with no live source,
so correcting its nav means drawing it afresh. The backlog carries it.

## 15. Shepherding — the church report

| #   | What            | Mock                                                                           | Build                                                                                                                                     |
| --- | --------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 15a | Totals          | six tiles: active, assigned, unassigned, attempts, conversations, never called | seven figures in one card: officers, active, assigned, unassigned, attempts, conversations, never called - **the build is more complete** |
| 15b | Window control  | a `This quarter` dropdown                                                      | `From` / `To` date pickers - **the build follows the spec's window** (FR-58)                                                              |
| 15c | Primary verb    | `Assign member`, top right                                                     | none; only `Refresh`. Assignment starts from the roster (`AssignShepherdDialog`)                                                          |
| 15d | Still in church | a stacked bar with a four-part legend                                          | four counts, no bar                                                                                                                       |
| 15e | Officer rows    | avatars, `Presbyter` caption, a quiet badge, a trailing `Open roster ›`        | name, member number, six columns; the name links to the roster                                                                            |
| 15f | Footer          | "Counts cover current assignments only"                                        | absent from the report; the sentence sits on the officers page                                                                            |

**15a is the one place the build is ahead of the drawing.** The mock folds `officers` away and splits the
figures across two cards; the build writes all seven in one place. Nothing to fix - the signed mock is
narrower than the requirement, which is the opposite of the roster and officers findings.

**15b is the build being right.** FR-58 names a `from` / `to` window; a quarter dropdown is a different
control that happens to produce a window. The mock predates that requirement.

**15c is a mock control the build does not have on this page.** The ability exists - `AssignShepherdDialog`
is real and reachable from the roster - but the mock offers it as a page-level primary verb. That is a
placement difference, not an invented feature; accepted, with the roster as the build's entry point.

15d–15f are presentation differences. FR-60 says the church report "shows aggregate counts only", which
the build's four counts satisfy; a stacked bar is one way to draw the same numbers.

**The report row is read, and it found no defect.** That is worth stating plainly: four of the five
defects in this pack came from surfaces where the drawing was ahead of the build, and this one - where
the build is ahead - had nothing wrong with it.

## 16–17. Imports — outside parity

"imports-members" pairs with `v2-imports/01-members-import.png`, one of the nine **legacy prototype
captures** with no live source: DoD item 5 names it outside parity. "imports-batches" has no mock at all.
Both can be reviewed for consistency with the design language, never claimed as parity.

## What the pack found

1. **Five build defects.** Two fixed before this pass (`Held`/`Mixed` overlap and the status-pill overlap),
   the raw RRULE in the series schedule cell fixed after the pass was written (see section 4), and two fixed
   here: the roster's clipped row actions (`roster-eleven-columns`) and the officers page's missing FR-58
   totals and colliding identity (`officers-church-totals`).
2. **One spec gap per surface, both the same shape.** The roster drew nine columns against FR-59a's
   eleven, and the officers page drew none of FR-58's totals. In both the mock was ahead of the build,
   and in both the fix was to move the build to the drawing.
3. **One stale mock** (the headcount dialog) — the drawing must follow the model, not the other way.
4. **One mock corrected backwards** (settings): the drawing's dropdowns became the radios the build had,
   and its preview folded into the card. Not every drift means the build is wrong.
5. **No row is owed.** The church report is read above and found no defect: the build is ahead of that
   drawing on the totals and follows the spec on the window.
6. **Four surfaces with no signed mock at all** (member detail, add member, the attendance
   dialog, and the import batch list) - they can be reviewed for consistency with the design language,
   never claimed as parity. **Contacts left this list on 2026-11-16**: `v2-shell/16-contacts.png` was
   rebuilt from a live source, re-cut to FR-78 and signed, and its build baseline sits beside it.

## The recommendation

The pack is read end to end. Its verdict is two sentences: **every surface with a live source and a signed
mock has been compared**, and **the surfaces without one cannot be claimed**. The milestone's parity claim
should name the compared rows, the five defects it found, and the five surfaces it deliberately excludes —
rather than claim parity it did not check.
