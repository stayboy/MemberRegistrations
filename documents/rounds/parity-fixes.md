# Round - parity-fixes

|                     |                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                      |
| Tier                | 2 - Reviewed                                                                                              |
| Mode                | unattended (auto-accept recommendations)                                                                  |
| Base                | `d8e2a4d`                                                                                                 |
| Review rounds       | 1                                                                                                         |
| Gate runs in parent | 1                                                                                                         |
| Spec                | `member-registrations-headcount.md` HC-1, HC-3; `ui-mock-parity.md`'s **retire** verdict on the raw RRULE |
| Workers             | `single`                                                                                                  |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (two defects, one mock re-cut, round doc)                    |

## Grill

1. **Fix the overlap where it shows or where it started?** Recommendation: where it started - the status
   cell reused the member-name stack, whose 180 px minimum stretched a four-letter badge across the next
   column. Cost: a new style rather than a margin.
2. **Does the mock or the build lose the headcount-dialog argument?** Recommendation: the **mock**, because
   HC-1 records one mode per observation and the drawing showed two groups at once. Cost: a re-cut and a
   re-sign rather than a code change.
3. **Should the RRULE stay as a secondary line?** Recommendation: no - the triage marked it **retire**
   ("developer-facing text; keep the human schedule") and it was never applied. Cost: one less piece of
   detail for a developer reading the screen.

## Plan

The comparison pack found three things the round docs did not. Two are build defects; one is a stale mock.

### Scope

- `ui/src/pages/events-styles.ts` - a `statusStack` with no minimum width, and the badge told not to
  stretch.
- `ui/src/pages/EventDetailPage.tsx` - the status cell uses it.
- `ui/src/pages/SeriesDetailPage.tsx` - the raw RRULE line is gone from the schedule cell.
- `mockups/v2-events/03-activity-detail.html` (git-ignored) - the count dialog draws a **mode** choice,
  its fields and one total.
- `documents/mock-claims/v2-events.json` - the re-cut state's new hash, auto-signed.

Acceptance criteria:

1. The session row's status pill no longer overlaps or stretches over the source label.
2. The series schedule cell shows the human label only.
3. The count dialog's mock draws one mode at a time, matching the build and HC-1.
4. `npm run ui:capture` and `npm run verify` pass.

## Verification

| Gate      | Command              | Result            |
| --------- | -------------------- | ----------------- |
| Captures  | `npm run ui:capture` | 21 passed         |
| Full gate | `npm run verify`     | see the signature |

gate-run 2026-11-15T20:45:10.827Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

One state re-cut and **auto-signed**; listed for the reviewer's second look.

| Surface          | Mock                                               | sha256                                                             | Signer     | Date       | Verdict     |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| headcount dialog | `mockups/v2-events/06-record-headcount-dialog.png` | `c65614ecf3bba3482d6cced3208ac971d92a942266d8662c947adb9c0f89e641` | unattended | 2026-11-15 | auto-signed |

| Set / state                            | sha256                                                             |
| -------------------------------------- | ------------------------------------------------------------------ |
| `v2-events/06-record-headcount-dialog` | `c65614ecf3bba3482d6cced3208ac971d92a942266d8662c947adb9c0f89e641` |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

| Row | Surface                      | Before                                 | After                   |
| --- | ---------------------------- | -------------------------------------- | ----------------------- |
| 3d  | activity detail, event kind  | the `Held` pill overlapped `Mixed`     | fixed in the build      |
| 4a  | activity detail, series kind | `FREQ=WEEKLY;BYDAY=SU` under the label | removed                 |
| 5   | headcount dialog             | the mock drew two lane groups at once  | re-cut to a mode choice |

## Review

| Round | Seat    | Verdict                                                                      |
| ----- | ------- | ---------------------------------------------------------------------------- |
| 1     | pending | the reviewer reads these three with the pack, which is where they were found |

Seat: consistent - the Implementer row names the parent, and the reviewer reads these alongside the pack.

## Acceptance

| #   | Criterion                                    | Verdict  | Evidence                                    |
| --- | -------------------------------------------- | -------- | ------------------------------------------- |
| 1   | The pill neither overlaps nor stretches      | ACCEPTED | the re-captured `event-detail.png`          |
| 2   | The schedule cell shows the human label only | ACCEPTED | the re-captured `series-detail.png`         |
| 3   | The count dialog's mock draws one mode       | ACCEPTED | the re-cut `06-record-headcount-dialog.png` |
| 4   | Gates pass                                   | ACCEPTED | 21 captures, `verify` signature             |

## Deviations

- Tier 2 parent-authored: two style/markup fixes and one mock re-cut.
- The mock's dialog title reads `Record headcount` where the build says `Record a headcount`. That is a
  copy difference, not drift; it is recorded here rather than fixed in a third pass.
- The overlap took three attempts: the first two changed the cell's width but not the inner stack that
  caused it. The lesson is the one this stretch keeps teaching - look at the picture, not the diff.
