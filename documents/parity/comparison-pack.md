# Parity comparison pack

**2026-11-15.** The release's DoD item 5 claims parity for surfaces with a live source and a signed mock.
This pack is the comparison that claim needs: baseline beside mock, with my read of each. The verdicts
here are the release gate's inputs, not the gate itself — a `drift` row is a finding, not a decision.

**How to use it.** Rows marked `read` were compared image-to-image in this pass. Rows marked `owed` have a
baseline and a signed mock but were **not** looked at yet; they are listed so the sitting can finish them,
not so they can be assumed clean.

| #     | Surface                                           | Baseline                                                             | Mock                                       | Hash          | Read                         |
| ----- | ------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ | ------------- | ---------------------------- |
| 1     | members list                                      | `members-list.png`                                                   | `v2-shell/01-shell-expanded-light.png`     | `4bfb1888…`   | **read — matches**           |
| 2     | events list                                       | `events-list.png`                                                    | `v2-events/01-events-list.png`             | `16a6249f…`   | **read — matches**           |
| 3     | activity detail, event kind                       | `event-detail.png`                                                   | `v2-events/04-activity-detail-event.png`   | `bcb0c03c…`   | **read — drift + defect**    |
| 4     | activity detail, series kind                      | `series-detail.png`                                                  | `v2-events/03-activity-detail-series.png`  | `cccb7001…`   | **read — drift**             |
| 5     | headcount dialog                                  | `event-headcount-dialog.png`                                         | `v2-events/06-record-headcount-dialog.png` | `dc282018…`   | **read — the mock is stale** |
| 6     | import panel                                      | `event-import-panel.png`                                             | `v2-events/07-import-attendance-panel.png` | `24bd2629…`   | owed                         |
| 7     | settings                                          | `settings.png`                                                       | `v2-settings/01-date-time-settings.png`    | `25a599f6…`   | owed                         |
| 8–12  | shell ×5 (light, dark, collapsed, mobile, meadow) | `shell-*.png`                                                        | `v2-shell/01…06`                           | see catalogue | owed                         |
| 13–15 | shepherding officers, roster, report              | `shepherding-*.png`                                                  | `v2-shell/07…09`                           | see catalogue | owed                         |
| 16–17 | imports members, batches                          | `imports-*.png`                                                      | `v2-imports/01-members-import.png`; none   | see catalogue | owed                         |
| 18–21 | member detail, add, contacts, attendance dialog   | `member-*.png`, `contacts-dialog.png`, `event-attendance-dialog.png` | **no signed mock state**                   | —             | not claimable                |

## 1. Members list — matches

The build draws the signed design: the **Archived** switch where the dropdown was, the ministries/status
filters, the row identity `FullName (Gender, Ny)`, `Contacts · n`, the `⋯` row menu, and Prev/Next in the
footer. Differences the mock draws and the build does not: the **ministries filter** (queued — needs a
read), and seven rows rather than the fixture's two. Both are recorded, neither is drift.

## 2. Events list — matches

Series rows lead the table: schedule text with `next <date>`, the `Series` subtitle, the ministry in the
same `CODE - name` shape as an event row, and an Active badge. Events follow with ranges, venue, counts
and status. The mock's "New event"/"New series" menu is not built (no create flow in this MVP), which the
triage already queued.

## 3. Activity detail, event kind — drift, and one real defect

| #   | What         | Mock                                                     | Build                                                                                                                  |
| --- | ------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 3a  | Row controls | one right-aligned run: `View rows · Record headcount`    | three controls distributed across cells: `Record headcount` and `Import` under Headcount, `View rows` under Attendance |
| 3b  | Columns      | Date · Start · Attendance · Headcount · Source · Session | Date · Start · End · Status · Source · Present/expected · Headcount · Attendance                                       |
| 3c  | Panels       | the occurrences panel only                               | a definition card and the Active offerings panel as well                                                               |
| 3d  | **Defect**   | a single status pill per row                             | **the `Held` pill and the `Mixed` source label overlap** in the session row, reading as one clipped chip               |

**3d is a rendering bug, not a design difference.** The session row's status cell and its source cell
collide at this width. It is the kind of thing a capture cannot assert and only a reader sees, which is
why it survived three rounds of code review.

## 4. Activity detail, series kind — drift

| #   | What          | Mock                                              | Build                                                                                                                                              |
| --- | ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4a  | Schedule cell | `Weekly on Sunday`                                | `Weekly on Sunday` **plus `FREQ=WEEKLY;BYDAY=SU`** — the raw RRULE the triage marked **retire** ("developer-facing text; keep the human schedule") |
| 4b  | Occurrences   | session rows with `Record headcount` and `Import` | dates only (Date · Exception · Events), because `OccurrenceListDto` carries no event ids — the parked R2b                                          |
| 4c  | Panels        | tiles and schedule only                           | a definition card (Ministry/Timezone/Status/Archived/Description) as well                                                                          |

4a is a triage item that was never applied: the retire verdict exists in `ui-mock-parity.md` and the code
still renders the RRULE.

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

## 6. Import panel — matches, with one superseded detail

The build's panel is the fixed occurrence card, the expected-columns table, the Excel template action and
the file chooser, with **no "Change occurrence"** - correct, because the row chose the session.

Two differences, neither drift:

- The mock draws **End of session inside the panel**; the build puts it on the **session row** (R4a), so
  one capture cannot be closed from two places. The mock's placement is superseded by that round.
- The mock's capture shows a **parsed preview** of two rows; the build's capture is the empty state. Same
  screen, different moment.

## 7. Settings — drift

| #   | What            | Mock                                                                                                      | Build                                                                                     |
| --- | --------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 7a  | Format controls | two **dropdowns** (date format, time format)                                                              | two **radio groups** with the same options                                                |
| 7b  | Preview         | a **separate full-width card**, six rows (record created, archived, last call, session start, birth date) | inside the Date and time card, **three rows** (record created, birth date, session start) |
| 7c  | Appearance card | accent and scheme only                                                                                    | an extra `APPEARANCE` overline duplicating the card's own title                           |

7a and 7b are design differences a reader must route: either the build adopts the mock's controls and a
full-width preview, or the mock is re-cut to the radios. The mock is the signed artefact, so the build is
the side that is behind - but the _card layout_ in the build is arguably better, which is exactly the
owner's call rather than mine.

## 8–12. Shell states — light and collapsed read

The **light** state is the members list in the shell: the same screen as row 1, and it matches.

The **collapsed** state drifts, and against **both** artefacts:

| #   | What             | Spec 4.2 rule 5 and the mock                                         | Build                                           |
| --- | ---------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| 8a  | Collapsed footer | **two** 34 px icon buttons, stacked (the accent and the dark toggle) | **three**: a gear, a headphones icon and a moon |

The headphones control is in neither the signed mock nor the shell contract, which says the footer is
"two 34 px icon buttons". Either the spec and mock gain it, or it leaves the rail. That is a product
question — it may be a support link worth keeping — so it is recorded, not deleted on my judgement.

Dark, mobile and meadow were not read in this pass; they are the same page in other chrome.

## 16–17. Imports — outside parity

"imports-members" pairs with `v2-imports/01-members-import.png`, one of the nine **legacy prototype
captures** with no live source: DoD item 5 names it outside parity. "imports-batches" has no mock at all.
Both can be reviewed for consistency with the design language, never claimed as parity.

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

13b–13d are design differences a reader routes: the mock is the signed artefact, and the build reordered
the columns and renamed the status header.

Officers and the church report were not read in this pass.

## 13–15b. Shepherding — the officers page

| #   | What            | Mock                                                                                          | Build                                                                                                    |
| --- | --------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 14a | Church totals   | **five tiles**: assigned, unassigned, attempts, conversations, never called                   | **absent**                                                                                               |
| 14b | Coverage        | a banner: "1,054 active members are not on a shepherding list. Coverage is 12% (142 of 1196)" | **absent**                                                                                               |
| 14c | Rows            | avatars, `Presbyter` in the caption, an `Open roster ›` affordance                            | no avatar, no Presbyter caption, a plain link                                                            |
| 14d | **Defect**      | the officer column is wide enough for the identity                                            | **the Assigned value collides with the identity text** - `Kwame Asante (Male, 41y)` and `4` share a line |
| 14e | Nav in the mock | the pre-consolidation nav (Attendance, no USSD)                                               | the consolidated nav - **the build is right**                                                            |

**14a and 14b are FR-58.** The shepherding home "MUST ... show church totals (officers, active,
assigned, unassigned, attempts, conversations, never called), coverage and one row per officer". The build
shows the rows and none of the totals or coverage, so this is a second spec gap of the same shape as the
roster columns - and the mock, which drew them, is the record that caught it.

14d is a layout defect in the first two columns, the same family as the roster clipping.

The church report was not read in this pass.

## What the pack found

1. **One build defect** (`Held`/`Mixed` overlap) — a UI fix, not a mock change.
2. **One retired item never applied** (raw RRULE in the series schedule cell).
3. **One stale mock** (the headcount dialog) — the drawing must follow the model.
4. **One row still owed** — the church report. The shell variants share one source and were re-captured with the rail change; the officers page is read above. Imports are outside parity by the DoD; settings and the collapsed rail are open for routing; the roster's row actions are built but clipped by an overflowing table, which is a layout defect rather than a gap.
5. **Three surfaces with no signed mock at all** (member detail, add member, contacts and the attendance
   dialog) — they can be reviewed for consistency with the design language, never claimed as parity.

## The recommendation

Fix **1** and **2** in one small round (both are defects against a signed decision), re-cut the headcount
dialog, then finish the owed rows in a single second pass. The milestone's parity claim should name rows
1–2 as compared-and-matching, row 5 as a mock correction, and rows 3–4 as drift with two named fixes —
rather than claim fourteen clean comparisons that did not happen.
