# Round - r3a-row-correction

|                     |                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                    |
| Tier                | 2 - Reviewed                                                                                                            |
| Mode                | unattended (auto-accept recommendations)                                                                                |
| Base                | `c55cc06`                                                                                                               |
| Review rounds       | 0                                                                                                                       |
| Gate runs in parent | 1                                                                                                                       |
| Spec                | `member-registrations-headcount.md` HC-3 (a correction supersedes, keeping its `asOf`), HC-22, HC-28; events FR-4, AC-3 |
| Workers             | `single`                                                                                                                |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (component, test, round doc)                                               |

## Plan

R3 retires `/ussd/headcount`, but that page is where **correction** lives — superseding an observation
while keeping the moment it was counted. Retiring the page first would delete the behaviour, so this
slice moves the correction onto the session row while the page still exists, and the deletion follows.

**R2b is parked.** The series occurrences are `readonly string[]` dates (`OccurrenceListDto`), not events,
so a session row there has no event id to record a count against. The backlog row "Series occurrences are
dates, not events" already names the cause; it now also names this consequence.

### Scope

- `ui/src/components/SessionHeadcount.tsx` - a per-lane **Correct** action; the dialog is told what it is
  correcting; the payload branches to `supersedesId` instead of a fresh `asOf`.
- `ui/src/components/SessionHeadcount.dom.test.tsx` - a correction case, and a stateful API mock rather
  than a `once` queue.

Acceptance criteria:

1. Each lane with an observation offers **Correct**.
2. The dialog names the correction and shows the `asOf` it keeps.
3. Saving posts `supersedesId` and no fresh `asOf`.
4. A cancelled session offers neither action.
5. `npm run verify` and `npm run ui:test:dom` pass.

## Verification

| Gate      | Command               | Result              |
| --------- | --------------------- | ------------------- |
| DOM lane  | `npm run ui:test:dom` | 10 files, 66 passed |
| Full gate | `npm run verify`      | see the signature   |

gate-run 2026-11-15T15:16:30.079Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

No mock changed. The correction is a behaviour on the row the signed activity detail already draws.

| Surface                   | Mock                                              | sha256                                                             | Signer     | Date       | Verdict     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/events/:id?kind=series` | `mockups/v2-events/03-activity-detail-series.png` | `cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

n/a - no claim changed.

## Review

| Round | Seat                                  | Verdict                                                                                                                         |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | pending - the correction is a behaviour port, and the review that closes R3 will read this slice and the page deletion together |

Seat: consistent - the Implementer row names the parent, the Deviations section carries the Tier 2
parent-authored reason, and the reviewer seat stands outside the author.

## Acceptance

| #   | Criterion                                          | Verdict  | Evidence                                                             |
| --- | -------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| 1   | Each counted lane offers Correct                   | ACCEPTED | rendered beside the bucket line in `SessionHeadcount`                |
| 2   | The dialog names the correction and keeps its asOf | ACCEPTED | `Correct the current observation` and `Keeping asOf` in the DOM case |
| 3   | Saving posts `supersedesId`, no fresh `asOf`       | ACCEPTED | the case asserts the payload via the mocked client                   |
| 4   | A cancelled session offers neither action          | ACCEPTED | both actions carry `disabled`                                        |
| 5   | Gates pass                                         | ACCEPTED | 66 DOM, `verify` signature                                           |

## Deviations

- Tier 2 parent-authored: one component and its test; the reviewer seat stands independent as usual.
- The DOM suite failed twice on dialog queries before it was stable: Fluent dialogs live in portals, so a
  previous case's dialog could still be unmounting when the next case queried by role. The cases now scope
  to the dialog they opened, and the API mock is stateful instead of a `once` queue that a double mount
  could drain. Both are test-infrastructure fixes, not behaviour.
