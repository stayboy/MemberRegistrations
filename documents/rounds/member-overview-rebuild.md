# Round — member-overview-rebuild

|                        |                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                      |
| Tier                   | 2                                                                                                                                                         |
| Mode                   | `attended`                                                                                                                                                |
| Base                   | `feat/member-create-completeness` (stacked; see Deviations)                                                                                               |
| Review rounds          | 0                                                                                                                                                         |
| Gate runs in parent    | 0                                                                                                                                                         |
| Spec                   | `documents/specs/member-registrations-ui.md` (FR-29, AC-12)                                                                                               |
| Workers                | `single`                                                                                                                                                  |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (overview, accordion, styles, tests); parent opencode/deepseek-v4.1-flash-free (spec, mock, record, gates)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                   |

`git-seat-budget: 10` — 1 branch + 3 commits + 1 push + 1 pr + 1 merge + 1 sync + 2 retries.

## Seats

| Seat        | Picked (local)   | Window | Class          | Candidate probed                                         | Basis                                                                |
| ----------- | ---------------- | ------ | -------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Spec review | 2026-11-17 15:2x | in     | `reviewer-pro` | `ollama-cloud/mimo-v2.6-pro` — REWORK twice, then ACCEPT | in-window first candidate; the frontier was not whole the first time |

## Grill

Eight questions (F1-F8), answered by the owner on 2026-11-17: **F1 amended** (drop the Ministries tab),
**all others as recommended**.

1. **Tabs.** The **Ministries tab is removed** - ministries are minimal, so they live only in the
   overview's collapsed section. Attendance, Subscriptions, Relationships and Shepherding tabs stay as
   they are. **Cost:** the tab's add/remove controls must move into the overview's expanded section, or
   that capability disappears.
2. **Collapsed shape.** A summary line plus a chevron - ministries `3 · Choir, Ushering, +1`,
   subscriptions `2 active · next ends 12 Dec` - expanding **in place**. **Cost:** an expanded layout,
   an empty state and tests for both.
3. **Modern look.** Two columns at >=1024 px - identity left, the two summary cards right - one column
   below; Fluent v9 tokens only, no new library, no hand-rolled control. **Cost:** a styles pass and a
   responsive case.
4. **Data.** No wire change: the detail payload already carries ministries and subscriptions.
   **Cost:** none.
5. **Mock states for signoff.** Five: both collapsed, ministries expanded, subscriptions expanded, empty
   ministries and subscriptions, and the narrow one-column state. **Cost:** five captures to review.
6. **Components.** Fluent `Accordion`/`AccordionItem` (collapsible) for both disclosures; a summary card
   extracted at the second call site. **Cost:** Fluent accordion styling through `makeStyles`.
7. **Empty states.** One line each - "No ministries recorded" / "No active subscriptions" - with the same
   _View all_ link, so nothing disappears and the layout does not jump. **Cost:** two mock states.
8. **Spec.** FR-29 gains the overview clause (two collapsed summaries, their _View all_ link, the empty
   copy, the removed Ministries tab); AC-12 is extended. **Cost:** the pro seat reviews it before the
   mock is cut.

### Revision after the first drawing (owner, 2026-11-17)

The five signed-target states were shown but not signed. The owner then revised the surface:
ministries must **always show**, Relationships joins the overview and its tab is collapsed, a
`View Contacts (3)` button (exact label) opens the Contacts dialog, the member's shepherd appears on the
overview, and the four attendance cards become attended (quarter/month), last attended with event and
date, shepherd calls with last reached, and the most-attended event with a count. `dto can carry
shepherd`: the member detail gains the shepherd and call fields, and each attendance entry gains
`eventId`/`eventName`. Both are additive and the owner authorised them in this round; no second read.

| Decision                  | Source         | Effect on the earlier grill                              |
| ------------------------- | -------------- | -------------------------------------------------------- |
| Ministries always shown   | owner revision | supersedes F1/F2's "collapsed ministries accordion"      |
| Relationships tab retired | owner revision | extends F1 to a third retired tab                        |
| `View Contacts (3)`       | owner revision | new control, no values rendered on the overview          |
| Shepherd from the DTO     | owner revision | supersedes G4's second read                              |
| Four specific stats       | owner revision | supersedes G5's series/attended/expected/remaining cards |

The first set of five PNGs stays in `_archive` when re-cut; nothing was signed, so no signature is voided.

### Revision v5 - the fixed left panels (owner, 2026-11-17)

The owner reviewed the v4 drawings and moved the two remaining disclosures left, so the overview reads
identity, shepherd and relationships down one column and the recording actions down the other.

| Decision                           | Effect on the drawing                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards stay a full-width row        | The four cards span both panes above the columns; the first still carries quarter and month counts.                                                |
| Shepherd is a **fixed left panel** | Not a strip: it carries the shared identity label plus the presbyter record (title, rank, membership card, verified) already on the detail DTO.    |
| Relationships is a **fixed panel** | Left column, always visible, rows with add and remove; the `relationships` state draws the inline add row instead of an expanded accordion header. |
| Right column keeps the actions     | Ministries still always shown, subscriptions still collapsed, then `View Contacts (3)`.                                                            |

Drawn at v5, all five `target` and unsigned. Readings the spec does not fix, recorded so the reviewer
can reject them: the relationships panel's empty copy is `No relationships recorded` (FR-29 gives none
for that panel); the `empty` state draws a member **without** the presbyter flag, so the panel shows
`No presbyter title recorded` and no rank or card; `verifiedAt` is drawn equal to the joined date
(3 Mar 2019) on the owner's instruction, which reads like a copy error at a glance; and a zero contact
count renders the plain `No contacts` with no button (EC-41).

### Revision v6 - the detail moves into the member section (owner, 2026-11-17)

| Decision                      | Effect on the drawing                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presbyter detail moves home   | The identity card gains a compact second row - `Membership card · MC-1001`, `Presbyter title · Elder ELD`, `Verified · 12 Jun 2024` - so the main member section carries it. |
| `presbyterRank` is dropped    | Gone from every state; the owner judged it unnecessary.                                                                                                                      |
| Shepherd panel is the label   | The `PRESBYTER RECORD` block and its definition list are removed; the panel is the identity label and assigned date.                                                         |
| Ministry rows carry the role  | `Choir · CHOIR · Member`, `Ushering · USH · Leader`, `Hospitality · HOSP · Member`, from the additive `positionCode`.                                                        |
| Card values carry the brand   | The four card values are `var(--brand)` at semibold; captions and labels stay muted.                                                                                         |
| Contacts moves to the tab row | `View Contacts (3)` sits at the tab row's trailing edge; the right column is ministries then subscriptions.                                                                  |

Drawn at v6, all five `target` and unsigned, superseding v5's hashes. Two readings recorded for the
reviewer: the `empty` state shows the membership card as an explicit em dash (`Membership card · —`)
because FR-29 asks for "an explicit blank" without saying how it is drawn; and the empty attendance
copies (`No attendance recorded`, `No calls logged`) render in the brand value slot, since the owner's
"card values are brand" rule has no separate style for the placeholder. FR-29's layout sentence still
reads "ministries, subscriptions and the Contacts button on the right" after the same amendment moved
that button to the tab row - the drawing follows the amendment and the button's own bullet; the spec
residue is for the next spec pass.

### Revision v7 - the main member section and the fixed subscriptions (owner, to-spec 2026-11-17)

| Decision                   | Effect on the drawing                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Verification is a badge    | The text `Verified · <date>` is gone; a blue check sits beside the name with `Verified 12 Jun 2024` as its tooltip and accessible name.        |
| Shepherd joins the section | The left Shepherd panel is removed; `Shepherd: Efua Boateng (Female, 44y) · assigned 2 Jan 2025` closes the main member section.               |
| Membership history         | Four labelled lines - `Assembly joined · 3 Mar 2019`, `Came from · Accra Central`, `Moved out · —`, `Moved to · —` - below the card and title. |
| Subscriptions are fixed    | No accordion header and no chevron: the summary line, every row and `View all` sit in a right-column card under ministries.                    |
| Cards read as a dashboard  | Ink values at semibold on a `brand-soft` wash with a 2px `brand` top edge; labels, captions and the empty copy stay muted.                     |
| Left column narrows        | Identity (with the whole member section) then the fixed Relationships panel; contacts still on the tab row.                                    |

Drawn at v7, all five `target` and unsigned, superseding v6's hashes. Three readings recorded for the
reviewer: the membership-history blanks are an em dash in the populated states and `Not recorded` in
the `empty` state, which follows the owner's wording but is looser than FR-29's "`Not recorded` when
absent"; the verified badge carries the date in both a `title` attribute (tooltip) and an `aria-label`
(accessible name); and the `subscriptions` state draws the summary's **lapsed** branch
(`0 active · 2 ended or expired`, one ended and one expired row) because the section is fixed now and
any resting drawing would be byte-identical to `collapsed` - if the owner wants the duplicate or a
different distinction, the state's branch is one flag in the generator.

### Revision v8 - the headed Membership grid (owner, to-spec 2026-11-17)

| Decision                         | Effect on the drawing                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A **Membership** heading         | The group sits between the Identity grid and the shepherd line, separated by the section's hairline rhythm.                                                                    |
| The same detail grid as Identity | Six labelled cells in two columns: membership card, presbyter title, assembly joined, came from, moved out, moved to - never an inline row.                                    |
| Empty copies                     | A populated record states an absent field as `—` (moved out, moved to); the `empty` state reads `Not recorded` per field, with the membership card kept as `—`.                |
| Everything else held             | The verified check, the shepherd line, the right column, the cards, the tab-row Contacts button, the fixed relationships panel and the five state names are unchanged from v7. |

Drawn at v8, all five `target` and unsigned, superseding v7's hashes. One reading recorded: the
`empty` state's presbyter-title cell keeps `No presbyter title recorded` rather than joining the
`Not recorded` run, because FR-29 gives that cell its own copy for a null `title` and the specific rule
reads as the exception to "each field". If the reviewer wants the `Not recorded` run unbroken, it is a
one-word change in the generator.

## Plan

Goal: the overview carries the whole member at a glance, and ministries and subscriptions are readable
without leaving it.

Scope:

- `ui/src/pages/MemberOverviewTab.tsx` - the two-column layout and the two disclosures.
- `ui/src/pages/MemberDetailPage.tsx` - the Ministries tab leaves the tab list.
- `ui/src/pages/member-detail-styles.ts` - the layout.
- A summary-card component, extracted at its second call site.
- Tests: DOM cases for both disclosures (collapsed, expanded, empty) and an e2e case for the tab list.
- The spec, the mock set, and this document.

Acceptance criteria:

1. The overview shows ministries and subscriptions collapsed, each with a summary line and a chevron.
2. Expanding either shows the same data as the detail payload, ordered as the existing tab ordered it.
3. Each section carries _View all_: ministries opens the overview's expanded section (the tab is gone),
   subscriptions routes to its tab.
4. The Ministries tab is absent; the other four tabs are unchanged.
5. Empty members show the empty copy, not a missing section.
6. Gates green, including a re-captured `member-detail` baseline.

## Verification

| Gate                 | Command                                      | Result                     |
| -------------------- | -------------------------------------------- | -------------------------- |
| Full gate            | pm run verify                                | pass - 7/7                 |
| UI unit              | pm --prefix ui run test                      | pass - 41 files, 456 tests |
| UI DOM lane          | pm --prefix ui run test:dom                  | pass - 14 files, 96 tests  |
| UI e2e               | px playwright test                           | pass - 74 tests            |
| Mock catalogue guard | px vitest run tests/meta/mock-claims.test.ts | pass - 77 tests            |

gate-run 2026-11-17T18:05:37.842Z profile=full steps=7/7 lines=7 bytes=1165

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason |
| ----- | --------------------- | ------ | ------------------------------ | ------ |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | -      |

## Mock sign-off

| Surface                         | Mock                                                    | Capture                                               | sha256         | Signer | Date       | Verdict |
| ------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- | -------------- | ------ | ---------- | ------- |
| Member overview (collapsed)     | `mockups/v2-shell/19-member-overview-collapsed.png`     | build baseline re-capture is part of the build commit | `10fb130ff8e3` | owner  | 2026-11-17 | signed  |
| Member overview (subscriptions) | `mockups/v2-shell/19-member-overview-subscriptions.png` | build baseline re-capture is part of the build commit | `b37dc1ac8c64` | owner  | 2026-11-17 | signed  |
| Member overview (relationships) | `mockups/v2-shell/19-member-overview-relationships.png` | build baseline re-capture is part of the build commit | `9703777555b0` | owner  | 2026-11-17 | signed  |
| Member overview (empty)         | `mockups/v2-shell/19-member-overview-empty.png`         | build baseline re-capture is part of the build commit | `241f8a4bf2a2` | owner  | 2026-11-17 | signed  |
| Member overview (narrow)        | `mockups/v2-shell/19-member-overview-narrow.png`        | build baseline re-capture is part of the build commit | `f0110ac43c49` | owner  | 2026-11-17 | signed  |

## Mock parity

Mock coverage: claimed 7 · e2e-only 6 · deferred 1 · prose 2 (v2-shell; unchanged - the five new
states are now `signed` by the owner on 2026-11-17 and carry no claims). The mock guard passes 77/77. No drawing was re-cut for the
create form or the contacts dialog; this round's five states are new, and the owner's instruction to
sign them suspends "no more signing" for this surface only.

## Acceptance

Pending.

## Review

Seat: consistent - the `Implementer` row names the worker for the overview and the parent for the spec,
mock and record; the Tier 2 review will run on a different class candidate.

Standards and Spec verdicts: pending.

## Spec record (to-spec, 2026-11-17)

### Problem Statement

An officer opening a member record cannot tell whether the member is verified without reading a text
row, cannot see where the member came from or which assembly they moved to, and must open separate tabs
to read ministries, relationships and subscriptions. The overview itself does not look like the rest of
a modern dashboard, so the information that matters is visually quiet.

### Solution

The overview becomes the member's whole record at a glance: a full-width row of four prominent cards,
a main member section carrying identity, membership card, presbyter title, verification badge, shepherd
and membership history, always-visible ministries and subscriptions, and a fixed relationships panel.
The Contacts button sits on the tab row. Membership movement is recorded on the member through four
additive fields and can be entered on the create and edit forms.

### User Stories

1. As an officer, I want a verified check beside the member's name, so that I can trust the record at a glance.
2. As an officer, I want the verification date in the badge's accessible name and tooltip, so that the exact date is still available.
3. As an officer, I want the member's assembly join date shown, so that I know how long they have belonged here.
4. As an officer, I want the assembly they came from recorded, so that transfers in are traceable.
5. As an officer, I want their move-out date recorded, so that a former member's departure is not lost.
6. As an officer, I want the assembly they moved to recorded, so that a transfer out has a destination.
7. As an officer, I want to enter those four facts on the create form, so that tracking starts at registration.
8. As an officer, I want to correct them on the edit form, so that a late transfer can be recorded.
9. As an officer, I want the membership card shown for every member, so that a card number is never mistaken for a presbyter-only field.
10. As an officer, I want the presbyter title on the main member section and no rank, so that the section stays short.
11. As an officer, I want the shepherd in the main member section, so that I do not scan a separate panel for them.
12. As an officer, I want the member's role on each ministry row, so that a leader is distinguishable from a member.
13. As an officer, I want subscriptions always visible, so that cover is not hidden behind a chevron.
14. As an officer, I want relationships always visible in a fixed panel, so that household links are obvious.
15. As an officer, I want the four statistic cards to stand out, so that attendance and calls read as a dashboard.
16. As an officer, I want empty values stated rather than sections vanishing, so that the layout never jumps.
17. As an officer, I want the Contacts button on the tab row, so that the dialog is reachable without scrolling.

### Implementation Decisions

- Four additive member fields: assembly join date, came-from assembly, move-out date and moved-to assembly, all nullable; they live on the member detail and on create and update. The existing `joinedOn` stays as the original membership date, distinct from the assembly-specific date.
- The verification badge replaces the text row: a check glyph beside the identity label, with the date in the accessible name and a tooltip. `verifiedAt` itself is unchanged.
- The main member section carries identity, membership card, presbyter title, verification badge, shepherd and the membership history; presbyter rank is not rendered anywhere.
- The fixed left column carries identity and relationships; the right carries always-visible ministries and always-visible subscriptions. The Contacts button moves to the trailing edge of the tab row.
- The overview cards use strong ink values, muted labels, a faint brand-tinted wash and a brand top edge instead of coloured value text.
- Ministry rows carry the additive duty code recorded during assignment; subscriptions keep their add/end controls in the surviving tab.
- No new routes, no membership-history table, no change to the contacts dialog, and no rebuild of the four-card data derivation.
- The mock is built with the `mock-builder` class default (`deepseek-v4.1-flash-1017`) and is signed before implementation.

### Testing Decisions

- A good test asserts only what the operator sees or sends: rendered labels, accessible names, request bodies and empty-state copy; never component structure or class names.
- Highest seam: DOM cases on the member form and overview for the four new fields, the badge's accessible name, the fixed panels and the card values; one API case for the additive request body. The existing member-create e2e is the end-to-end seam and is extended only if the new form fields change its flow.
- Prior art: `MemberFormPage.dom.test.tsx`, `ContactsDialog.dom.test.tsx`, `tests/api/members.test.ts` and `ui/e2e/members.spec.ts`.

### Out of Scope

Presbyter rank display, a separate membership-history table or endpoint, changes to the contacts dialog,
reordering contacts, and any override of the earlier "no more signing" ruling outside this surface.

### Further Notes

The tracker step of the to-spec skill is skipped: AGENTS.md section 13 deliberately does not adopt
GitHub issues or triage labels, so this record lives in the round doc and the two spec files are the
source of truth. Test seams were not separately confirmed with the owner; they follow the existing
forms and DOM tests named above.

## Deviations

- **Stacked on `feat/member-create-completeness`.** Both rounds amend the same spec file, so this branch
  starts from the create round's spec commit rather than from `main`; the create branch merges first.
- **The spec review took three passes.** The first returned REWORK with two P1s: "the next end date"
  named no contract field (`periodEnd` is nullable and `endedOn` is separate), and the settled chevron
  and Fluent `Accordion` decisions were not in the text at all. The rework gave the summary a
  computable definition and named the component; the confirmation then caught a residue the API has a
  third status for - `expired`, neither active nor ended - and that "the retired tab" misnamed the
  order source for a list whose tab stays. Both closed; the third pass accepted.
- **F1 moves a capability.** Dropping the Ministries tab would remove the only place ministries are added
  or removed, so the overview's expanded section inherits those controls. The mock draws them.
