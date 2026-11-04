# Round — members list UI

|         |                                                   |
| ------- | ------------------------------------------------- |
| Status  | CLOSED                                            |
| Tier    | 1 — Plan (plus an independent UI review)          |
| Base    | `c8ed2da`                                         |
| Spec    | `documents/specs/member-registrations-ui.md` §5.3 |
| Workers | `single`                                          |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 13: the refined members grid against the ticket-13a contract.

- **Grid:** identity + presbyter status, `Contacts · n` as the only contact path, ministry codes,
  subscription pills (two + overflow), one-line attendance `4/5 (26-Oct-26)` over a bar, and plain
  Active/Archived status with a tooltip. No contact values in the grid.
- **Toolbar:** 300 ms debounced search, Active/Archived status, a series filter that drives
  `include=attendance&seriesId=`, and Refresh / Add member.
- **States:** loading skeleton, distinct empty states, error with retry, cursor "Load more".
- **Contacts dialog:** fetches the member detail only when opened, groups phone/email/WhatsApp, shows
  owner/linked; no page-level contact fetch.
- **Routing:** `#/members` and `#/members/archived`; `#/members/:memberNo` stays a placeholder for
  ticket 14.

Acceptance criteria:

1. The grid shows presbyter status, the attendance form, subscription pills and `Contacts · n`.
2. No contact value appears in the grid; the dialog is the only route to values.
3. Attendance is only `4/5 (26-Oct-26)` / `4/5` / `No attendance yet`, with no second date line.
4. Loading, empty and error states; status comes from the server, not local dates.
5. The structure matches the local mock at 1440×900.

## Verification

| Gate              | Command                                  | Result                                        |
| ----------------- | ---------------------------------------- | --------------------------------------------- |
| Root tests        | `npx vitest run --no-file-parallelism`   | pass — 17 files, 195 passed / 3 skipped (198) |
| UI tests          | `npm --prefix ui run test`               | pass — 6 files, 40 tests                      |
| UI build          | `npm --prefix ui run build`              | pass (pre-existing 897 kB chunk warning)      |
| UI lint/typecheck | `npm --prefix ui run lint` / `typecheck` | pass                                          |
| Root format       | `npm run format:check`                   | pass                                          |

## Review

Independent UI review on `deepseek-v4-pro:0813`: **Standards PASS**, **Spec PASS**, no P1. Fixed:

- The focusable tooltip triggers now carry `role="note"`.
- "Add member" uses the router instead of a raw `href`.
- The status dropdown now navigates between `#/members` and `#/members/archived`, so the route and the
  filter cannot desync; the breadcrumb follows the live status.
- `membersListPath`/`memberDetailPath` and the remaining formatter edge cases now have node tests
  (UI 32 → 40 tests).

The reviewer could not read the PNG (image input), so mock parity was assessed against the mock README
and the spec's AC-41/47/49; the pixel-level gate belongs to ticket 19.

## Acceptance

| #   | Criterion                                                    | Met | Evidence                                        |
| --- | ------------------------------------------------------------ | --- | ----------------------------------------------- |
| 1   | Grid: presbyter, attendance, pills, `Contacts · n`           | yes | `MembersPage.tsx`; UI tests                     |
| 2   | No contact value in the grid; dialog only                    | yes | `contactCount`; dialog fetch on open            |
| 3   | Attendance form only                                         | yes | `formatAttendance` tests                        |
| 4   | Loading/empty/error; server-derived status                   | yes | page states; `archivedAt`                       |
| 5   | Structure matches the mock; pixel gate deferred to ticket 19 | yes | local `mockups/v2-shell/10-members-refined.png` |

Verdict: **ACCEPTED**.

## Deviations

- No jsdom render test: the UI Vitest environment is node-only; pure helpers and the build carry the
  coverage, and component behaviour is exercised in ticket 19's Playwright gate.
- The live capture against the mock needs a running gateway, a signed-in officer and seeded data; the
  structure follows the mock now and the pixel comparison lands in ticket 19.
- `#/members/:memberNo` is a placeholder until ticket 14 (member detail/edit).
- The Imports nav still lists the retired "Event list"; ticket 15 replaces the two import screens.
