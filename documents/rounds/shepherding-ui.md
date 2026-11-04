# Round - shepherding screens (16)

|        |                                                                |
| ------ | -------------------------------------------------------------- |
| Status | OPEN                                                           |
| Tier   | 2 - Reviewed                                                   |
| Mode   | `unattended (auto-accept recommendations)`                     |
| Base   | `e15fd7c`                                                      |
| Spec   | `documents/specs/member-registrations-ui.md` §5.6, FR-58–FR-68 |
| Ticket | 16                                                             |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

The three shepherding screens become real, with the shared UTC window (default today−90 → today) kept in
the URL.

- **Officers** (`/shepherding/officers`) — one row per officer with assigned, attempts, conversations,
  last called and never called, linking into that officer's roster.
- **Roster** (`/shepherding/roster?officer=…`) — the officer's members with identity, residence,
  contact **count**, attempts, conversations, last called/outcome, still-in-church, latest feedback and
  issue. Filters: All / Never called / Follow-up (never called or last called more than 30 days ago).
- **Report** (`/shepherding/report`) — church totals, coverage, the still-in-church breakdown and the
  per-officer rows.
- **Log call** — append-only, from the roster; outcome, still-in-church when reached, called-on (UTC,
  not future, not before the assignment), feedback and issue.
- **Assign / Reassign / End** — from the member detail's shepherding tab and the roster; `reason` 3–500
  on a reassignment, a `409 currentAssignment` shows the current shepherd and requires an explicit
  confirm before the retry, and ending keeps the history readable.
- **Contacts on the roster** (Q157) — the response carries values, the UI renders a count and opens the
  read-only dialog. FR-59 was amended to say so, with a changelog line.

## Verification

| Gate                              | Command                                | Result                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| UI tests                          | `npm --prefix ui run test`             | pass - 17 files, 187 tests              |
| Typecheck / lint / build / format | `npm --prefix ui run ...`              | pass                                    |
| Root tests (serialized)           | `npx vitest run --no-file-parallelism` | pass - 17 files, 206 passed / 3 skipped |

The three shepherding routes are separate lazy chunks (3.3–12.4 kB); `vendor` is unchanged apart from
the new Fluent imports.

## Review

`deepseek-v4-pro:0813`: **ACCEPT**, no P1, two P2 and seven nits.

- **P2 applied** — an archived member's detail still offered Assign/Reassign/End; the server refuses
  with a `404`, not the `409/422` FR-65 promises. The tab now hides the actions and says why.
- **P2 parked** — the officer picker cannot filter to active presbyters: `MemberPickerCandidate` has no
  `isPresbyter` and no endpoint lists presbyters, so the dialog relies on the API's `422`. Backlogged;
  fixing it needs a members filter, which is a wire-contract change.
- **Nits applied** — dead `listCalls` removed, the coverage percentage annotated (it derives from the
  full aggregate, not partial pages), the stale-409 copy states the wire carries no name, the window
  control moved to `components/` (three call sites), router `Link` used for "Back to officers",
  `isPresbyter` made optional so the roster stops asserting `false`, and "Never reported" unified.

## Acceptance

| #   | Criterion                                                              | Met      | Evidence                                                                                                      |
| --- | ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Officers, roster and report match the API totals                       | yes      | three pages, client parity tests                                                                              |
| 2   | Logging a call appends and refreshes the roster; no edit or delete     | yes      | `LogCallDialog`, append-only; invalidation                                                                    |
| 3   | Unassigned members and members never called are visible and filterable | partly   | never-called and follow-up filters on the roster; **unassigned is a count only** — no list endpoint (backlog) |
| 4   | Contact values are not exposed outside the explicit action             | yes      | roster shows a count; dialog fetches on open                                                                  |
| 5   | Screens match the local mocks                                          | deferred | pixel parity is ticket 19                                                                                     |

Verdict: **ACCEPTED**.

## Deviations

- **Unassigned members cannot be listed.** The report exposes a count and `GET /v1/members` has no
  unassigned filter; adding one is a wire-contract change, which parks. The report says so in a line
  rather than implying a list, and the backlog records it.
- **Officer selection is not presbyter-filtered** for the same reason (backlog).
- **Roster responses carry contact values** to the browser even though the UI renders none; backlogged
  as a DTO concern.
- Pixel-level mock parity stays with ticket 19.
