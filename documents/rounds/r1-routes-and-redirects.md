# Round - r1-routes-and-redirects

|                     |                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                      |
| Tier                | 2 - Reviewed                                                                                              |
| Mode                | unattended (auto-accept recommendations)                                                                  |
| Base                | `0b52d53`                                                                                                 |
| Review rounds       | 0                                                                                                         |
| Gate runs in parent | 1                                                                                                         |
| Spec                | `member-registrations-ui.md` 4.3, AC-51, FR-8a, FR-9; `member-registrations-events-offerings.md` FR-1/4/5 |
| Workers             | `single`                                                                                                  |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (router, navigation, page links, tests, round doc)           |

## Plan

The owner authorised R1 by name (`"agreed to R1 and Phase C"`), which is the §17 hard gate for retiring
four public routes.

R1 is the route consolidation, not yet the page merge: `#/events/:id` dispatches on `kind` to the
component that already does the work, so a series deep link resolves the day the redirect lands instead
of 404ing until the component merge follows.

### Decisions

| #   | Question                                           | Decision                                                                                                                                                                      |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What does `#/events/:id?kind=series` render today? | `SeriesDetailPage`; the default renders `EventDetailPage`. One route, two components, until the merge round                                                                   |
| 2   | What happens to `#/events/series`?                 | Redirects to `#/events`; the page is no longer imported                                                                                                                       |
| 3   | And `#/events/series/:id`?                         | Redirects to `#/events/:id?kind=series`, keeping the id                                                                                                                       |
| 4   | Does the series edit form move?                    | No. `#/events/series/:id/edit` is an edit form, not a retired list, and AC-51 does not name it                                                                                |
| 5   | Which nav items retire?                            | Series (Events), Attendance registry (Imports), Headcount (USSD)                                                                                                              |
| 6   | What retires now and what waits?                   | Series list and the Headcount nav item now; the `#/ussd/headcount` and `#/imports/attendance` redirects wait for R3 and R4, because the screens they land on do not exist yet |

Decision 6 is a deliberate split of AC-51 across two rounds. Shipping the imports redirect today would
make attendance import unreachable, because the dialog arrives in R4.

### Scope

- `ui/src/app/router.tsx` - `SeriesRedirect`, `ActivityPage`, the retired list route, the `kind` dispatch.
- `ui/src/shell/navigation.ts` - three items removed, two icon imports with them.
- `ui/src/shell/navigation.test.ts` - the import test corrected, two new assertions for AC-51.
- `ui/src/shell/navigation.render.test.tsx` - the USSD submenu loses Headcount in both lists.
- `ui/e2e/series.spec.ts` - the list test becomes a redirect test; the detail is addressed by its kind.
- `ui/e2e/responsive.spec.ts`, `ui/e2e/capture.spec.ts` - the same two routes.

Acceptance criteria:

1. `#/events/series` lands on `#/events` and renders no 404.
2. `#/events/series/:id` lands on `#/events/:id?kind=series` and renders that series.
3. No navigation item points at a retired route.
4. The USSD section no longer offers Headcount; the page route still exists until R3.
5. `npm run verify`, `npm run ui:e2e` pass.

## Verification

| Gate      | Command           | Result                  |
| --------- | ----------------- | ----------------------- |
| UI unit   | `npm run ui:test` | 41 files, 451 passed    |
| e2e       | `npm run ui:e2e`  | 66 passed               |
| Full gate | `npm run verify`  | see the signature above |

gate-run 2026-11-15T13:39:47.563Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

No mock changed. This round makes the route reach the design that was already signed, so the row
names the mock it was built against.

| Surface                   | Mock                                              | sha256                                                             | Signer     | Date       | Verdict     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/events/:id?kind=series` | `mockups/v2-events/03-activity-detail-series.png` | `cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

n/a - no claim changed. The activity-detail surface's claims still describe the design; the build's
route now reaches it.

## Review

| Round | Seat                                  | Verdict                                                                                    |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 1 P1 (the series detail's own Back control still targeted the retired list), 5 P2 |

Fixes after the review: the series detail's Back control now reads "Back to events" and goes to
`/events`; SeriesFormPage targets the merged detail and the list; `SeriesListPage` and its baseline are
deleted as orphans; AC-51's two-part shipping and the lost FR-5/FR-6 coverage are recorded in the spec and
the backlog rather than only here. P2 leftovers: the two import actions still target the retired attendance
page until R4, deliberately.

Seat: consistent - the Implementer row names the parent, the Deviations section carries the Tier 2
parent-authored reason, and the reviewer seat stands outside the author.

## Acceptance

| #   | Criterion                                         | Verdict  | Evidence                                                                      |
| --- | ------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| 1   | `#/events/series` redirects to `#/events`, no 404 | ACCEPTED | `ui/e2e/series.spec.ts::the retired series list redirects to the events list` |
| 2   | `#/events/series/:id` redirects with its kind     | ACCEPTED | the same spec's detail test opens `/events/series-1?kind=series`              |
| 3   | No nav item points at a retired route             | ACCEPTED | `navigation.test.ts::advertises no retired route (AC-51)`                     |
| 4   | USSD no longer offers Headcount                   | ACCEPTED | `navigation.render.test.tsx`, both lists                                      |
| 5   | Gates pass                                        | ACCEPTED | 451 unit, 66 e2e, `verify` signature                                          |

## Deviations

- Tier 2 parent-authored: the round is a route table and a navigation list, both read and changed in
  one file each, so the parent wrote it and the reviewer seat stands independent of the author.
- Tier 2 with the parent as implementer: the round is a route table and a nav list, both read and
  changed in one file each; the reviewer seat stands independent of the author as usual.
- AC-51 ships in two parts. The headcount and attendance-import redirects land in R3 and R4, when the
  screens that absorb them exist. Recorded here rather than left as a silent gap.
- The series-list e2e assertions (schedule text, next occurrence, exception counts) are **removed**, not
  ported: their subject is the retired list. The events list gains them in the round that merges it, and
  FR-5 and FR-6 are uncited until then, and the backlog row names them.
