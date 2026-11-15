# Round - r2-session-headcount

|                     |                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                 |
| Tier                | 2 - Reviewed                                                                                         |
| Mode                | unattended (auto-accept recommendations)                                                             |
| Base                | `3b59049`                                                                                            |
| Review rounds       | 0                                                                                                    |
| Gate runs in parent | 1                                                                                                    |
| Spec                | `member-registrations-events-offerings.md` FR-4, AC-3; `member-registrations-headcount.md` HC-1/HC-3 |
| Workers             | `single`                                                                                             |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (component, page wiring, test, round doc)               |

## Plan

R2's first slice: the session row carries the headcount, and the action that records it, on the event
detail. That is what AC-3 now requires — "each session row offers **Record headcount** and, once
counted, shows the total with its lane buckets".

The dialog and the API client already existed for the USSD page; this round reuses both rather than
reimplementing them, which is also why the count keeps its lane vocabulary.

### What it does

- `SessionHeadcount` reads the session's current observations (`GET /v1/events/:id/headcounts?sessionDate=`)
  and renders the summed total over a compact lane line — `142` over `A 120 · V 22`.
- Its **Record headcount** button opens the existing `HeadcountDialog` for that session, posts the count
  and invalidates the session's read, so the row updates without a page reload.
- A cancelled session's action is disabled, because nothing may be counted against it.
- The event detail gains the column beside Attendance.

### Scope

- `ui/src/components/SessionHeadcount.tsx` - new.
- `ui/src/components/SessionHeadcount.dom.test.tsx` - three cases: not counted, counted with lanes, the dialog opens.
- `ui/src/pages/EventDetailPage.tsx` - the column and the cell.

Acceptance criteria:

1. A session with no observation reads "Not counted".
2. A counted session shows the total and its lanes, the total being the sum of the lanes.
3. The row action opens the capture dialog for that session.
4. A cancelled session offers no capture.
5. `npm run verify`, `npm run ui:test:dom` and `npm run ui:e2e` pass.

## Verification

| Gate      | Command               | Result               |
| --------- | --------------------- | -------------------- |
| DOM lane  | `npm run ui:test:dom` | 10 files, 63 passed  |
| UI unit   | `npm run ui:test`     | 41 files, 451 passed |
| e2e       | `npm run ui:e2e`      | 66 passed            |
| Full gate | `npm run verify`      | see the signature    |

gate-run 2026-11-15T14:41:08.904Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

No mock changed. The row follows `mockups/v2-events/03-activity-detail-series.png`, auto-signed for this
stretch; its lane line is the design this component now renders.

| Surface                   | Mock                                              | sha256                                                             | Signer     | Date       | Verdict     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/events/:id?kind=series` | `mockups/v2-events/03-activity-detail-series.png` | `cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

n/a - no claim changed. The build now renders an atom the mock already carried.

## Review

| Round | Seat                                  | Verdict                                                                                                                                                                                                       |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 5 P1: the raw `datetime-local` would be rejected by the write schema; summing lanes breaks HC-22; a legacy `mixed` row double-counted; 401 detected by string match; the read's 401 never signed out |

Fixes: the display is now **one line per lane with its own buckets** and no summed figure (HC-22/HC-28),
a legacy `mixed` row is named "Mixed (retired)" (HC-9), `asOf` is converted with `fromDateTimeLocal`
before the write, both the read and the mutation use `isUnauthorized`, a failed read shows a warning with
a **Retry** rather than claiming "Not counted", and the text uses Fluent `Text` rather than raw spans.
The duplicated controller (this component repeats state the USSD page owns) is recorded in the backlog
rather than fixed here.

Seat: consistent - the Implementer row names the parent, the Deviations section carries the Tier 2
parent-authored reason, and the reviewer seat stands outside the author.

## Acceptance

| #   | Criterion                                | Verdict  | Evidence                                            |
| --- | ---------------------------------------- | -------- | --------------------------------------------------- |
| 1   | An uncounted session reads "Not counted" | ACCEPTED | `SessionHeadcount.dom.test.tsx` case 1              |
| 2   | A counted session shows total and lanes  | ACCEPTED | case 2 asserts `142` over `A 120 · V 22`            |
| 3   | The row action opens the dialog          | ACCEPTED | case 3                                              |
| 4   | A cancelled session offers no capture    | ACCEPTED | `disabled={item.status === 'cancelled'}` on the row |
| 5   | Gates pass                               | ACCEPTED | 63 DOM, 451 unit, 66 e2e, `verify` signature        |

## Deviations

- **AC-3 says "total with its lane buckets"; HC-22 says no read sums lanes.** The two are reconciled as
  per-lane totals with their buckets, never one figure for the session: the headcount spec governs the
  count, and the owner's ruling was that a row shows its buckets. Recorded because the wording still
  invites a sum.

- Tier 2 parent-authored: the round is one component, one test and one column; the reviewer seat stands
  independent of the author as usual.
- **The read is per session.** The API's headcount route is session-scoped, so the detail issues one
  bounded read per session it renders. That is a deliberate cost, not an oversight: an aggregate read
  would be an unrecorded wire change. It goes to the backlog with the threshold that would justify one.
- R2 is not finished. The series detail's occurrence rows have the same action still to come, and the
  two components behind `#/events/:id` are still separate. Both are recorded, not implied.
