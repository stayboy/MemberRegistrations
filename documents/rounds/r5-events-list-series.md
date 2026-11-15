# Round - r5-events-list-series

|                     |                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                |
| Tier                | 2 - Reviewed                                                                                        |
| Mode                | unattended (auto-accept recommendations)                                                            |
| Base                | `9df058e`                                                                                           |
| Review rounds       | 1                                                                                                   |
| Gate runs in parent | 1                                                                                                   |
| Spec                | `member-registrations-events-offerings.md` FR-5, FR-2, AC-2, AC-4; `member-registrations-ui.md` 4.3 |
| Workers             | `single`                                                                                            |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (row component, list wiring, tests, round doc)         |

## Grill

1. **Is a series a row in the events list, or a second list?** Recommendation: a row, as the owner ruled
   and the signed list mock draws; the retired series list's assertions move here. Cost: the list now
   issues one occurrences read per series for the next occurrence.
2. **Where does the next occurrence come from?** Recommendation: a bounded per-series read of
   `GET /v1/series/:id/occurrences` over 90 days, because `SeriesDto` carries no `nextOccurrence`.
   Cost: one request per series on the list, recorded rather than hidden.
3. **How do the tests disambiguate two "Sunday Service" rows?** Recommendation: by href, so the series
   row and the event row are each addressed by the route they open. Cost: the tests stop reading like
   prose.

## Plan

FR-5 has been unbuilt since the consolidation: the list rendered events only, so the signed list mock's
series rows were unbuilt and FR-5/FR-6 had no test. This round makes a series an activity row.

### Scope

- `ui/src/components/SeriesActivityRow.tsx` - new: the schedule, the next occurrence, ministry and status
  of one series, linking to `/events/:id?kind=series`.
- `ui/src/pages/EventsListPage.tsx` - series rows lead the table, from the read the filter already made.
- `ui/e2e/events.spec.ts` - the schedule and next-occurrence assertions the retired series list held, and
  href-scoped links for the two rows named "Sunday Service".

Acceptance criteria:

1. A series appears as a row with its schedule and next occurrence.
2. It links to the activity detail with `kind=series`.
3. An archived series reads Archived.
4. The event rows are unchanged and still addressable.
5. `npm run verify` and `npm run ui:e2e` pass.

## Verification

| Gate      | Command          | Result            |
| --------- | ---------------- | ----------------- |
| e2e       | `npm run ui:e2e` | 63 passed         |
| Full gate | `npm run verify` | see the signature |

gate-run 2026-11-15T19:17:22.578Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

No mock changed; the list this round builds is the one `01-events-list` already carries.

| Surface   | Mock                                   | sha256                                                             | Signer     | Date       | Verdict     |
| --------- | -------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/events` | `mockups/v2-events/01-events-list.png` | `16a6249fb9c59aa87737734d78b0e6478ecf3c975f6be48058e3da7e760c0699` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

| Surface     | States | Claimed | e2e-only | Deferred | Probe |
| ----------- | ------ | ------- | -------- | -------- | ----- |
| events-list | 1      | 3       | 0        | 0        | full  |

## Review

| Round | Seat                                  | Verdict                                                                                                                                                           |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 1 P1: FR-5 still said the series data came from one read while the row reads its next occurrence from a second, so the spec and the code disagreed; 5 P2 |

Fixes: FR-5 now names both reads, the series timezone for "today", the archived skip and the fan-out
that must be revisited; the row calls `nextOccurrenceLabel` and `ministryLabel` instead of re-deriving
them, so a series row and an event row read the same way; series rows survive an empty event window;
an archived series is not read at all; and the next-occurrence label is "next <date>" as the mock draws.

Seat: consistent - the Implementer row names the parent, the reviewer seat stands outside the author,
and the review preceded the merge.

## Acceptance

| #   | Criterion                                             | Verdict  | Evidence                                                           |
| --- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| 1   | A series row carries its schedule and next occurrence | ACCEPTED | the events e2e case asserts "Weekly on Sunday" and a "next …" line |
| 2   | It links to `kind=series`                             | ACCEPTED | the row's link is asserted by href                                 |
| 3   | An archived series reads Archived                     | ACCEPTED | `seriesStatusLabel` in the row                                     |
| 4   | Event rows unchanged and addressable                  | ACCEPTED | the case asserts `#/events/event-1` and the Leaders retreat row    |
| 5   | Gates pass                                            | ACCEPTED | 63 e2e, `verify` signature                                         |

## Deviations

- Tier 2 parent-authored: one component, one wiring line and the tests.
- The next occurrence costs one read per series. That is the price of not adding a field to
  `SeriesDto` (a wire change), and it is recorded here rather than left for a reader to notice.
- Part two of R5 - the three members atoms - is not in this round.
