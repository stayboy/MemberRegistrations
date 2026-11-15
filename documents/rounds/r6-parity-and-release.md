# Round - r6-parity-and-release

|                     |                                                                                   |
| ------------------- | --------------------------------------------------------------------------------- |
| Status              | OPEN                                                                              |
| Tier                | 2 - Reviewed                                                                      |
| Mode                | unattended (auto-accept recommendations)                                          |
| Base                | `b0ea78d`                                                                         |
| Review rounds       | 1                                                                                 |
| Gate runs in parent | 1                                                                                 |
| Spec                | `documents/rounds/mvp-local.md` items 5 and 7; `member-registrations-ui.md` AC-51 |
| Workers             | `single`                                                                          |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (captures, runbook, gate, round doc) |

## Grill

1. **What does "parity" mean for the release?** Recommendation: a capture per consolidated surface,
   compared against the signed mock, with the hash named - and the comparison's verdict recorded per
   surface rather than asserted in prose. Cost: the comparison is visual, so it needs a reader, not a
   script.
2. **Should the retired headcount capture be re-pointed or removed?** Recommendation: removed with its
   baseline and its catalogue pairing, because a state cannot pair with a screen that is gone. Cost: that
   mock state now has no build baseline, so its parity is advisory only.
3. **Do the four gates run before or after the clean-volume check?** Recommendation: the clean volume
   first, then the gates on the tree that will land - the volume proves the stack, the gates prove the
   code. Cost: a failure in the volume test wastes the earlier green gates.

## Plan

The last round: refresh a capture for every consolidated surface, put the runbook's routes in order,
and prove the stack from an empty volume.

### Scope

- `ui/e2e/capture.spec.ts` - two cases added (the headcount dialog and the import panel), one removed
  (the retired USSD headcount page).
- `ui/e2e/baseline/` - 21 refreshed images plus the two new ones; the two retired pages' baselines and
  its README row are gone.
- `documents/mock-claims/headcount.json` - the state that paired with the retired screen no longer does.
- `documents/runbooks/local-docker.md` - "Where the screens are", and where the four retired routes go.
- `documents/backlog.md` - the parked deep-link assertion, and the panel-opening gap it leaves.

Acceptance criteria:

1. A capture exists for every surface the consolidation keeps.
2. The runbook names the consolidated screens and the redirects.
3. A clean volume comes up: `db` healthy, `migrate` exits 0, `app` and `ui` up.
4. `/health` answers 200 and `smoke:local` passes 16/16.
5. `verify`, `ui:test`, `ui:test:dom` and `ui:e2e` pass.

## Verification

| Gate         | Command                                   | Result                                    |
| ------------ | ----------------------------------------- | ----------------------------------------- |
| Captures     | `npm run ui:capture`                      | 21 passed, 22 images                      |
| Clean volume | `docker compose down -v && up --build -d` | db healthy, migrate exit 0, app and ui up |
| Health       | `curl /health`                            | 200                                       |
| Smoke        | `npm run smoke:local`                     | 16/16 checks, sample member created       |
| UI unit      | `npm run ui:test`                         | 440 passed                                |
| DOM lane     | `npm run ui:test:dom`                     | 72 passed                                 |
| e2e          | `npm run ui:e2e`                          | 64 passed                                 |
| Full gate    | `npm run verify`                          | 7/7 steps                                 |

gate-run 2026-11-15T20:18:01.377Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

No mock changed this round. The parity table names, per surface, the mock each capture was compared
against - `compared` where a reader has looked at both, `captured` where the image exists and the
comparison is still owed.

| Surface                                         | Baseline                                                             | Mock                                               | sha256        | Read                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- | ------------- | ------------------------------------------------------------ |
| members list                                    | `members-list.png`                                                   | `mockups/v2-shell/01-shell-expanded-light.png`     | `4bfb1888…`   | **compared** - switch, pager, row menu, identity label       |
| events list                                     | `events-list.png`                                                    | `mockups/v2-events/01-events-list.png`             | `16a6249f…`   | **compared** - series rows with schedule and next occurrence |
| activity detail, event kind                     | `event-detail.png`                                                   | `mockups/v2-events/04-activity-detail-event.png`   | `bcb0c03c…`   | captured                                                     |
| activity detail, series kind                    | `series-detail.png`                                                  | `mockups/v2-events/03-activity-detail-series.png`  | `cccb7001…`   | captured                                                     |
| headcount dialog                                | `event-headcount-dialog.png`                                         | `mockups/v2-events/06-record-headcount-dialog.png` | `dc282018…`   | captured                                                     |
| import panel                                    | `event-import-panel.png`                                             | `mockups/v2-events/07-import-attendance-panel.png` | `24bd2629…`   | captured                                                     |
| shell ×5                                        | `shell-*.png`                                                        | `mockups/v2-shell/0*.png`                          | see catalogue | captured                                                     |
| roster, officers, report                        | `shepherding-*.png`                                                  | `mockups/v2-shell/08…09…07…`                       | see catalogue | captured                                                     |
| imports members, batches                        | `imports-*.png`                                                      | `mockups/v2-imports/01-members-import.png`         | see catalogue | captured                                                     |
| settings                                        | `settings.png`                                                       | `mockups/v2-settings/01-date-time-settings.png`    | `25a599f6…`   | captured                                                     |
| member detail, add, contacts, attendance dialog | `member-*.png`, `contacts-dialog.png`, `event-attendance-dialog.png` | no signed mock state                               | —             | captured, no mock to compare                                 |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0 (events list).

## Mock parity

| Surface         | States | Claimed | e2e-only | Deferred | Probe    |
| --------------- | ------ | ------- | -------- | -------- | -------- |
| events-list     | 1      | 3       | 0        | 0        | full     |
| members-list    | 5      | 4       | 0        | 0        | full     |
| activity-detail | 5      | 3       | 1        | 1        | advisory |

## Review

| Round | Seat                                  | Verdict                                                                                                                                                                                                                                                               |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 2 P1: the baseline index did not list the two new captures and still listed a retired surface; and the parity table paired the standalone-event capture with the **series** mock while omitting the series detail entirely. 3 P2, including two wrong counts |

Fixes: both retired baselines and their index rows are gone, the two dialog captures are indexed, the
parity table names both kinds with the mock of the same kind, and the counts are corrected. The review
also confirmed the honest core: the round refuses to call the captured rows parity, and the runbook
matches the routes exactly.

Seat: consistent - the Implementer row names the parent, the reviewer seat stands outside the author,
and the review preceded the merge.

## Acceptance

| #   | Criterion                                       | Verdict  | Evidence                                    |
| --- | ----------------------------------------------- | -------- | ------------------------------------------- |
| 1   | A capture per consolidated surface              | ACCEPTED | 21 cases, 22 images, including both dialogs |
| 2   | The runbook names the screens and the redirects | ACCEPTED | "Where the screens are"                     |
| 3   | A clean volume comes up                         | ACCEPTED | db healthy, migrate exit 0, app and ui up   |
| 4   | `/health` 200 and `smoke:local` 16/16           | ACCEPTED | both run above                              |
| 5   | The four gates pass                             | ACCEPTED | 440 / 72 / 64 / `verify` 7/7                |

## Deviations

- Tier 2 parent-authored: captures, runbook and the round doc.
- **Most of the parity rows are `captured`, not `compared`.** The images exist and the mocks are signed,
  but a reader has looked at only the two lists. That is the honest state of item 5: the build is done,
  the comparison is owed, and calling it parity without the look would be the exact failure this stretch
  kept correcting.
- The retired headcount page's baseline is gone and its catalogue state no longer pairs, so that state's
  parity is advisory until the activity detail's own capture is compared.
- One e2e assertion remains parked (the deep-link panel opening), recorded in the backlog with its two
  attempts.
