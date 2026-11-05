# Round - UI release harness, smoke and axe (19a)

|        |                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------- |
| Status | OPEN                                                                                              |
| Tier   | 2 - Reviewed                                                                                      |
| Mode   | `attended`                                                                                        |
| Base   | `4ba2db2`                                                                                         |
| Spec   | `documents/tickets/v2-events-ui/19a-ui-release-harness.md`; UI NFR-1, NFR-6, NFR-11, AC-24, AC-30 |
| Ticket | 19a                                                                                               |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 19 was split: **19a** (this round) builds the browser harness, the smoke flows, axe and the CI
job; **19b** owns the committed screenshot baseline, the mock-index comparison and the Pages deploy.

- **Harness**: Playwright 1.64.1 runs the production build through `vite preview` at
  `/MemberRegistrations/`; the session is seeded in `sessionStorage`; every `/gateway/v1/**` and
  `/auth/**` request is stubbed with fixture payloads that match the DTOs; an unstubbed request fails
  the run at teardown; the suite is deterministic (fixed locale, UTC, reduced motion, fixed dates).
- **Smoke**: shell navigation (including the 360 px sections menu), the members list and contacts
  dialog, the add-member flow (201 + `Location`), event detail with the attendance dialog, and series
  detail.
- **Axe**: WCAG 2.2 AA tags, contrast included, on the shell, members and events screens in light and
  dark, and on the shell for all four accents in both schemes; each audit asserts the seeded theme
  actually applied before running.
- **Responsive**: seven screens at 360/768/1440 with `documentElement` and `#main-content` scroll-width
  checks, plus the mobile navigation.
- **CI**: a `ui-e2e` job installs chromium for the pinned Playwright and runs the suite on every PR.

## Verification

| Gate                              | Command                                | Result                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| E2E                               | `npm run ui:e2e`                       | pass - 46 tests in 6 files              |
| UI unit tests                     | `npm --prefix ui run test`             | pass - 25 files, 288 tests              |
| Typecheck / lint / build / format | `npm --prefix ui run ...`              | pass                                    |
| Root tests (serialized)           | `npx vitest run --no-file-parallelism` | pass - 17 files, 206 passed / 3 skipped |

One flake was recorded: the first unit run, launched concurrently with the build and the root suite,
reported two failed files with no failing assertion; isolated re-runs passed twice, and the gates then
ran sequentially.

## Review

`deepseek-v4-pro:0813`.

- **First pass: CHANGES REQUIRED.** The harness, fixtures, smoke, axe and CI were sound. Two P2s: the
  worker's contrast fix punched non-monotonic stops into the Ocean/Meadow/Plum ramps (inverting Fluent's
  hover/pressed tokens and altering the approved look), and the accent/dark axe matrix was configured
  but never verified — a wrong seed would silently audit Fluent four times.
- **Applied:** the ramps were re-derived as monotonic families with white-text AA on the background
  stops, guarded by a luminance/contrast unit test and recorded in FR-49; every axe audit now asserts
  `data-scheme` and the resolved `--colorBrandBackground` before running; the responsive matrix gained
  the detail routes and a content-column check; the no-op axe option was removed.
- **Second pass: ACCEPT.** The reviewer recomputed the ramps and ran the suites; the dark custom
  accents and the member-detail route were the only nits, both closed afterwards.
- **The added member-detail check found a real defect**: at 360 px the six-tab `TabList` was 601 px wide
  inside a 305 px column, clipping Subscriptions onward. The tabs now wrap, and all widths pass.

## Accessibility fixes the gate forced

- `EventDetailPage`: the attendance action's accessible name now matches its visible "View rows".
- `AppShell`: the brand's accessible name includes the visible subtitle.
- `AccountMenu`: the avatar initials are part of the button's accessible name, and the avatar receives
  the same initials.
- `brand.ts`: Ocean, Meadow and Plum mid-tones darkened to meet AA, with the ramp kept monotonic.

## Acceptance

| #   | Criterion                                                                                      | Met | Evidence                                           |
| --- | ---------------------------------------------------------------------------------------------- | --- | -------------------------------------------------- |
| 1   | Playwright runs the production build against stubbed routes with a seeded session; no real API | yes | `ui/playwright.config.ts`, `ui/e2e/fixtures.ts`    |
| 2   | Smoke covers shell, members + contacts, add member, event + attendance, series detail          | yes | 6 spec files, 46 tests                             |
| 3   | Responsive at 360/768/1440; mobile navigation usable                                           | yes | `responsive.spec.ts`, 22 tests                     |
| 4   | Axe WCAG 2.2 AA incl. contrast, light/dark and each accent                                     | yes | `axe.spec.ts`, 14 tests, theme asserted            |
| 5   | A failing rule fails the run and names it                                                      | yes | violation id/impact/target in the message          |
| 6   | CI runs the suite on every PR, chromium only                                                   | yes | `ui-e2e` job (not executed by GitHub before merge) |
| 7   | Zero tests or a missing fixture fails                                                          | yes | no `pass-with-no-tests`; unmatched requests throw  |

Verdict: **ACCEPTED**.

## Deviations

- **Fixtures, not the live API.** The smoke exercises the built UI against stubbed gateway responses;
  it proves the UI contract, not the server. The live-vs-mock probe and the committed baseline are 19b.
- **The CI job was validated locally but not executed by GitHub** before this round closed.
- **The accent palettes changed visually** (Ocean/Meadow/Plum mid-tones darkened for AA); recorded in
  FR-49, and 19b's mock comparison must treat the accent screenshots as an intentional difference.
- Pixel-level mock comparison and the Pages deploy stay with 19b.
