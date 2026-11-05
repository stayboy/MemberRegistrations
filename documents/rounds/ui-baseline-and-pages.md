# Round - UI baseline, mock comparison and Pages (19b)

|        |                                                               |
| ------ | ------------------------------------------------------------- |
| Status | OPEN                                                          |
| Tier   | 2 - Reviewed                                                  |
| Mode   | `attended`                                                    |
| Base   | `3b95b2f`                                                     |
| Spec   | `documents/tickets/v2-events-ui/19b-ui-baseline-and-pages.md` |
| Ticket | 19b                                                           |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan (Q187–Q193)

- **Scope:** the capture set the harness can drive; V3, stale and missing screens are named, not faked.
- **Mechanism:** committed PNGs as review artifacts plus this comparison; no pixel gate yet, because a
  Windows-generated baseline cannot match Linux CI and the calibration set is still backlogged.
- **Location:** `ui/e2e/baseline/` with a README, next to the harness.
- **Comparison:** the `clef:27b` decision screen on the complex screens, recorded below with `DM:`;
  below-bar rows are confirmed by eye.
- **Pages:** workflow now, with the one-time owner setting named here and in `ui/README.md`.
- **Stale mocks:** moved to `mockups/old/`; the spec beats the mock, so the app was not changed back.

## Captures

21 captures at each mock's own viewport, from the production build, with fixed fixtures, a pinned clock
(`2026-01-05T12:00:00Z`), `deviceScaleFactor: 1`, reduced motion and animations settled:

`shell-light`, `shell-dark`, `shell-collapsed`, `shell-mobile`, `shell-meadow`, `members-list`,
`member-detail`, `member-add`, `contacts-dialog`, `events-list`, `event-detail`,
`event-attendance-dialog`, `series-list`, `series-detail`, `shepherding-officers`,
`shepherding-roster`, `shepherding-report`, `imports-members`, `imports-attendance`,
`imports-batches`, `settings`.

Two runs can differ by roughly 6–30 antialiased border/corner pixels; content and state are identical
(the date-dependent screens are byte-identical). No pixel gate exists yet, so the baseline is a review
artifact and any future gate must calibrate against that drift.

## Mock parity (advisory)

`DM: clef:27b-cloud`, `scripts/round/decision-probe.mjs`, one probe per pair with a closed claim list.

| Screen        | Claims                                                        | Result                                                                             |
| ------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Members list  | same title, member table, add-member action, nav labels       | title 0.899, table 0.928, action 0.922 **answered**; nav `PARTIAL` 0.767 below bar |
| Events list   | same title, events table with date range + status, nav labels | title 0.876 **answered**; table 0.642 and nav 0.469 below bar                      |
| Series detail | schedule-versions section, exceptions list, nav labels        | exceptions `PARTIAL` 0.888 **answered**; schedule 0.734 and nav 0.780 below bar    |

Below-bar rows were confirmed by eye: each live capture shows the events table with date ranges and
status badges, the series schedule-versions and exceptions sections, and the navigation labels differ
only by the `Attendance` → `Events` rename.

## Intentional differences (spec beats mock)

| Screen                     | Difference                                                                                                               | Decision                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Every shell-bearing screen | Nav reads **Events**, the mocks say **Attendance**                                                                       | The rename; the app's navigation is the source of truth |
| Member detail              | Six **tabs** (Overview, Attendance, Subscriptions, Ministries, Relationships, Shepherding) instead of one scrolling page | FR-29 requires tabs or a member route; Q155             |
| Settings                   | **RadioGroups** and a sidebar **Date and time** entry above Appearance; no inline dropdowns                              | Q169–Q178                                               |
| Imports attendance         | Session preselected, rows are `memberNo` + optional `datetime`, no `eventno` column                                      | 15a/Q128; its old mock is in `mockups/old/`             |
| Events list                | Ministry column, offset paging and "Load more"                                                                           | FR-2 and NFR-5, added after ticket 17                   |
| Event detail               | Times carry the event's IANA zone; the session table names it in the header                                              | 18c                                                     |
| Attendance dialog          | Wall-clock `sessionTime` column and source                                                                               | 15a/18c                                                 |
| Series detail              | Create/edit/archive actions and zone-aware schedule labels                                                               | 18/18b                                                  |
| Members grid               | Attendance annotation stays `4/5 (26-Oct-26)`; the preference does not touch it                                          | FR-76/AC-41 exception in the date/time spec             |
| Shell (Meadow)             | Ocean/Meadow/Plum mid-tones are darker                                                                                   | FR-49 AA contrast; ramp re-derived monotonically        |
| Add member                 | "Joined on" defaults to the pinned capture date                                                                          | Harness determinism, not a UI rule                      |

## Not captured, with the reason

- **Offerings landing and terms** — the V3 phase (tickets 20–24); the mocks are kept, not stale.
- **Find by contact** — the feature does not exist: FR-79/AC-48 specify it and the API accepts
  `contact`, but the members page has no control. It parks because the spec also requires the value to
  stay out of the URL, web storage and request logs, so the API request logger must stop logging raw
  query strings first. Backlogged with that prerequisite.
- **Stale imports mocks** — the attendance import and the preview-errors screenshots moved to
  `mockups/old/`; the retired per-row `eventno` errors no longer exist.
- **Settings menu-open state** — the sidebar entry is captured; the open menu is a transient state and
  ticket 19a's axe run already exercises the control.

## Pages deploy

`.github/workflows/deploy-pages.yml` builds the UI, uploads `ui/dist` and deploys on `main` and on
`workflow_dispatch` (`pages: write`, `id-token: write`, `github-pages` environment, concurrency
`pages`). The base is already `/MemberRegistrations/`, correct for project Pages.

**Owner step (one time):** Settings → Pages → Source: **GitHub Actions**. Before it is enabled the
deploy step fails after a successful build; the build itself is unaffected. CORS needs nothing — the
gateway echoes the request origin (`src/router.ts:55`).

## Verification

| Gate                              | Command                                | Result                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| Captures                          | `npm run ui:capture`                   | pass - 21 screenshots                   |
| E2E                               | `npm run ui:e2e`                       | pass - 46 tests (capture excluded)      |
| UI unit tests                     | `npm --prefix ui run test`             | pass - 25 files, 288 tests              |
| Typecheck / lint / build / format | `npm --prefix ui run ...`              | pass                                    |
| Root tests (serialized)           | `npx vitest run --no-file-parallelism` | pass - 17 files, 206 passed / 3 skipped |

## Acceptance

| #   | Criterion                                                                 | Met    | Evidence                                                                       |
| --- | ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| 1   | Every mock-index screen has a live capture at its viewport, committed     | mostly | 21 captures; the three exceptions are named above (V3, missing feature, stale) |
| 2   | Each capture is compared; every difference is intentional or a regression | yes    | the parity and intentional-difference tables                                   |
| 3   | The baseline regenerates deterministically                                | yes    | pinned clock, fixed fixtures, jitter measured and recorded                     |
| 4   | A Pages workflow deploys on `main`, with the owner step named             | yes    | `deploy-pages.yml`, `ui/README.md`, this doc                                   |
| 5   | Build plus smoke run in CI                                                | yes    | `verify`, `ui`, `ui-e2e` on every PR                                           |

Verdict: **ACCEPTED**, with the three named gaps.

## Deviations

- **No pixel gate.** The baseline is a review artifact; a gate needs Linux-generated baselines and the
  backlogged calibration set.
- **Three mock-index screens are not captured** (V3 offerings, Find by contact, the stale imports pair).
- **The parity screen's below-bar rows are confirmed by eye**, not by the model.
- **A fixture nit remains:** a linked WhatsApp contact is Ama's third contact while the fixtures report
  two. It predates this round, no assertion or capture depends on the count, and it is left for the next
  fixture change rather than triggering a recapture.
