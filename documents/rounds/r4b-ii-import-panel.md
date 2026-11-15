# Round - r4b-ii-import-panel

|                     |                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                     |
| Tier                | 2 - Reviewed                                                                                             |
| Mode                | unattended (auto-accept recommendations)                                                                 |
| Base                | `086b0da`                                                                                                |
| Review rounds       | 1                                                                                                        |
| Gate runs in parent | 1                                                                                                        |
| Spec                | `member-registrations-ui.md` FR-36a, FR-8a, AC-51; `member-registrations-events-offerings.md` FR-8, AC-7 |
| Workers             | `single`                                                                                                 |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (panel, mount, retirement, tests, round doc)                |

## Grill

1. **Panel and page in one round, or the panel first?** Recommendation: one round. Cost: the largest
   single diff left, so its review reads a mount and a retirement together.
2. **What happens to the picker, the date window and the `?event=&date=` seeding?** Recommendation: all
   three go; in a panel the session is fixed by the row. Cost: an operator can no longer start an import
   from Imports, only from the activity.
3. **Where does a landed batch go?** Recommendation: the row shows its source and count, **Batch lookup**
   stays for later retrieval. Cost: no import history on the activity, which FR-38 forbids claiming.
4. **What replaces the deep link?** Recommendation: AC-51's mapping to `import=<date>`, which FR-8a
   already obliges the activity detail to read. Cost: the detail honours a query parameter it did not.
5. **What happens to the seven withdrawn claims?** Recommendation: re-point one at a time, only where a
   test now asserts it. Cost: a claim with no assertion stays withdrawn, recorded in the backlog.
6. **How do we avoid the defect the last reviews found?** Recommendation: the panel **calls** the
   workspace and `endActionState` rather than re-deriving them, and the reviewer diffs the panel against
   the page. Cost: the panel inherits the workspace's props shape, which suits a page better than a dialog.

## Plan

The attendance import becomes a panel on the session row, and the page that hosted it retires.

The workspace moved to a feature module in R4b-i so it could be mounted twice; this round fixes its
occurrence instead of picking one, mounts it from the row, and turns `/imports/attendance` into a
redirect that lands on the activity with the date it named.

### Scope

- `ui/src/components/SessionImportPanel.tsx` - new: the workspace in a dialog, with the occurrence fixed.
- `ui/src/features/attendance-import/AttendanceWorkspace.tsx` - `fixedOccurrence` hides the picker path;
  the occurrence type and builder are exported.
- `ui/src/components/SessionHeadcount.tsx` - an **Import** action, offered only when the caller passes one.
- `ui/src/pages/EventDetailPage.tsx` - builds the occurrence from its own row, owns the panel, derives
  `import=<date>`, and drops the page-level import verb (the row owns the import now).
- `ui/src/app/router.tsx` - `/imports/attendance` → the activity with `import=<date>`, or the member
  import when no event is named.
- `ui/src/pages/ImportsAttendancePage.tsx` - deleted.
- `ui/src/pages/SeriesDetailPage.tsx` - its Import action removed: occurrences are dates, so it cannot
  name a session (the parked R2b).
- Tests: a panel DOM case, a rewritten events e2e case, and the series case removed with its action.

Acceptance criteria:

1. A series-backed session row opens the panel for that session, and offers no picker.
2. A standalone event's row offers no import (FR-8).
3. `/imports/attendance?event=<id>&date=<d>` lands on `#/events/<id>?kind=event&import=<d>` and the
   panel opens for that date; a bare link lands on the member import.
4. The page is gone and no navigation entry points at it.
5. `npm run verify` and `npm run ui:e2e` pass.

## Verification

| Gate      | Command               | Result               |
| --------- | --------------------- | -------------------- |
| UI unit   | `npm run ui:test`     | 41 files, 440 passed |
| DOM lane  | `npm run ui:test:dom` | 10 files, 71 passed  |
| e2e       | `npm run ui:e2e`      | 61 passed            |
| Full gate | `npm run verify`      | see the signature    |

gate-run 2026-11-15T18:57:41.449Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

No mock changed; the import panel is the control the signed activity detail draws on each session row.

| Surface                   | Mock                                              | sha256                                                             | Signer     | Date       | Verdict     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/events/:id?kind=series` | `mockups/v2-events/03-activity-detail-series.png` | `cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

| Set          | Change                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `v2-imports` | the four attendance states remain signed design; their page retired, so their claims stay advisory |

## Review

| Round | Seat                                  | Verdict                                                                                                                                                                                                                                    |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 3 P1: `occurrenceFrom` exported and then hand-copied twice; a landed batch did not invalidate the events, series and imports queries (FR-8/AC-7); and the `import=` deep link survived a successful import, so the panel reopened |

Fixes: both occurrence literals call `occurrenceFrom`; a successful batch invalidates the five query
roots the retired page invalidated and drops `import=`; the panel shares the formats cache with the
member import page; the panel's case now asserts the picker card itself rather than one of its
controls; the redirect has two e2e cases; and the capture case for the retired page is gone.

Seat: consistent - the Implementer row names the parent, the reviewer seat stands outside the author,
and the review preceded the merge.

## Acceptance

| #   | Criterion                                             | Verdict  | Evidence                                                                             |
| --- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| 1   | A row opens the panel for its session, no picker      | ACCEPTED | the events e2e case and the panel's DOM case                                         |
| 2   | A standalone event offers no import                   | ACCEPTED | the row gets no `onImport` when `seriesId` is absent; the e2e case asserts no Import |
| 3   | The retired route lands on the activity with the date | ACCEPTED | `AttendanceImportRedirect`; the detail derives the occurrence from `import=`         |
| 4   | The page is gone, nothing points at it                | ACCEPTED | deleted; the nav entry went in R1                                                    |
| 5   | Gates pass                                            | ACCEPTED | 440 unit, 71 DOM, 61 e2e, `verify` signature                                         |

## Deviations

- Tier 2 parent-authored: the panel, the mount and the retirement, with the reviewer independent.
- **The series detail's import action is gone**, not re-pointed: its occurrences are dates, so no session
  can be fixed. The backlog row that parks R2b now carries this second consequence.
- The panel is mounted only while open: a closed Fluent dialog stays in the DOM and made every other
  test's `getByRole('dialog')` ambiguous, which is how this was found.
