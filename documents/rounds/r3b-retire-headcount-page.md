# Round - r3b-retire-headcount-page

|                     |                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                           |
| Tier                | 2 - Reviewed                                                                                                   |
| Mode                | unattended (auto-accept recommendations)                                                                       |
| Base                | `a542972`                                                                                                      |
| Review rounds       | 0                                                                                                              |
| Gate runs in parent | 2 - one flake on a PGlite DB test, one green re-run                                                            |
| Spec                | `member-registrations-ui.md` 4.3, AC-51; `member-registrations-headcount.md` entry point; events FR-4, AC-3    |
| Workers             | `single`                                                                                                       |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (router, deletions, component move, tests, catalogues, round doc) |

## Plan

`/ussd/headcount` retires. A count is recorded from the activity detail's session row, because it needs
the event it is counted against — the owner's words, and now the code's shape.

### Scope

- `ui/src/app/router.tsx` - `HeadcountRedirect`: `?event=` lands on that activity, a bare link on the list.
- Deleted: `UssdHeadcountPage.tsx`, `HeadcountReadFirst.tsx`, `headcount.render.test.tsx`.
- `HeadcountDialogs.tsx` → `ui/src/components/HeadcountDialog.tsx` — the row depended on a page directory that
  is now gone, which the R3a review flagged.
- `ui/e2e/headcount.spec.ts` - rewritten against the activity detail: the row carries the column and the
  action, and the retired route lands where it should.
- `ui/e2e/axe.spec.ts` - the headcount audit goes; the activity detail is already audited in both schemes.
- `documents/mock-claims/headcount.json` - **seven claims withdrawn**. Their e2e titles named the retired
  page's controls, and those controls (`End of session`, the live/ended copy) now belong to the import
  panel R4 builds. Re-pointing them at a test that does not assert them would be a false claim.
- `documents/backlog.md` - the destination of the withdrawn controls, with the round that restores them.

Acceptance criteria:

1. `/ussd/headcount?event=<id>` lands on that activity; a bare one lands on the list.
2. No page, nav entry or test references the retired route as a screen.
3. The row's dialog no longer lives in a page directory.
4. No catalogue entry cites a test that does not exist.
5. `npm run verify` and `npm run ui:e2e` pass.

## Verification

| Gate      | Command               | Result               |
| --------- | --------------------- | -------------------- |
| UI unit   | `npm run ui:test`     | 41 files, 440 passed |
| DOM lane  | `npm run ui:test:dom` | 10 files, 68 passed  |
| e2e       | `npm run ui:e2e`      | 62 passed            |
| Full gate | `npm run verify`      | see the signature    |

The first `verify` run failed `tests/db/event-instances.test.ts` — the known PGlite/WASM flake on this
machine. The file passes alone (3/3) and the re-run is green; one of the two automatic re-runs was used.

gate-run 2026-11-15T16:43:07.015Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

No mock changed; three states and one surface lost their claims, which is the opposite of a sign-off.

| Surface                   | Mock                                              | sha256                                                             | Signer     | Date       | Verdict     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/events/:id?kind=series` | `mockups/v2-events/03-activity-detail-series.png` | `cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

| Set         | Change                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| `headcount` | seven e2e claims withdrawn; the capture-state mock states stay signed as design |

## Review

| Round | Seat    | Verdict                                                         |
| ----- | ------- | --------------------------------------------------------------- |
| 1     | pending | the page deletion and its withdrawn coverage go to the R4 brief |

Seat: consistent - the Implementer row names the parent, the Deviations section carries the reason, and the reviewer seat stands outside the author.

## Acceptance

| #   | Criterion                                            | Verdict  | Evidence                                                                              |
| --- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| 1   | The retired route lands on its activity, or the list | ACCEPTED | `headcount.spec.ts` second case; `HeadcountRedirect`                                  |
| 2   | No page, nav entry or test names it as a screen      | ACCEPTED | the page, its read-first component and its test are deleted; the nav entry went in R1 |
| 3   | The row's dialog is not in a page directory          | ACCEPTED | `ui/src/components/HeadcountDialog.tsx`                                               |
| 4   | No catalogue cites a missing test                    | ACCEPTED | 77 catalogue tests pass after the withdrawal                                          |
| 5   | Gates pass                                           | ACCEPTED | 440 unit, 68 DOM, 62 e2e, `verify` signature                                          |

## Deviations

- Tier 2 parent-authored: a route, three deletions, one file move and the tests.
- **Coverage was withdrawn, not moved.** The retired page's four e2e cases asserted the read-first table,
  the state copy and the correction; the row keeps the last two as DOM cases, and the first is gone with
  the page. What the row does not yet have — `End of session`, the live/ended copy — is R4's import panel,
  and the backlog row names it.
- One flake on a DB test, re-run once per the budget.
