# Round - member detail tabs, ministries, relationships and shepherd summary (16a)

|        |                                                                  |
| ------ | ---------------------------------------------------------------- |
| Status | OPEN                                                             |
| Tier   | 2 - Reviewed                                                     |
| Mode   | `unattended (auto-accept recommendations)`                       |
| Base   | `c86a25d`                                                        |
| Spec   | `documents/specs/member-registrations-ui.md` FR-29, FR-30, FR-66 |
| Ticket | 16a                                                              |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Go-forward grill before this round (unattended, auto-accepted)

- **Q154 — 16 split.** 16a (member detail) and 16 (shepherding screens). Accepted.
- **Q155 — FR-29.** The detail must use tabs or a member-scoped route; it was one inline page. Fluent
  `TabList` tabs in 16a, sections as page-local siblings.
- **Q156 — member picker.** A shared `MemberPicker` now serves relationships, add-coverage and
  covered-members.
- **Q157 — roster contacts.** The roster shows a contacts action, never values; the spec clarification
  lands with ticket 16.
- **Q158 — assignment management** stays in 16. **Q159 — "Log call"** is a roster row dialog in 16.
- **Q160 — FR-31 attendance deletion** lands in ticket 17, not on the detail summary.
- **Q161 — backlog.** The picker row is consumed; contact link/unlink is re-recorded on its own.

## Plan

- `MemberDetailPage.tsx` becomes the shell: header, actions, the detail query, every mutation and the
  shared dialogs, plus a six-tab `TabList`.
- Tab bodies move to page-local siblings: Overview, Attendance, Subscriptions, Ministries, Relationships,
  Shepherding. Each carries a doc comment naming its tab and the FR it implements.
- Ministries: list the reference data, add and remove with confirmation.
- Relationships: add through `MemberPicker` with the API's type and dependent flag, remove with
  confirmation.
- Shepherding: current shepherd, assignment history and recent calls, read-only (logging is 16's roster).
- The coverage dialogs stop taking typed member numbers and use `MemberPicker`.

## Verification

| Gate                              | Command                                | Result                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| UI tests                          | `npm --prefix ui run test`             | pass - 15 files, 161 tests              |
| Typecheck / lint / build / format | `npm --prefix ui run ...`              | pass                                    |
| Root tests (serialized)           | `npx vitest run --no-file-parallelism` | pass - 17 files, 206 passed / 3 skipped |

`MemberDetailPage.tsx` went from **1,263** to **438** lines; the detail chunk is 34.9 kB.

## Review

`deepseek-v4-pro:0813`: **ACCEPT**, no P1, two P2 and four nits.

- **P2 applied** — the backlog row bundled "contact link/unlink" with the member picker; removing it
  would have silently dropped a still-open deferral. Contact link/unlink is re-recorded on its own.
- **P2 applied** — the covered-members error lost its Fluent `Field` validation state during the move;
  `MemberPicker` now forwards `validationState`/`validationMessage` and the field is red and
  `aria-invalid` again.
- **Nits applied** — the picker debounce matches the grid's 300 ms, and exclusion happens before the
  10-row cap so an excluded member never costs an option.
- **Nits recorded** — the picker's debounce/Combobox interaction and the tab routing are browser-level
  and belong to ticket 19; the server's `q` also matches contact values (pre-existing, and the picker
  renders no contact value).

## Acceptance

| #   | Criterion                                                                          | Met | Evidence                                      |
| --- | ---------------------------------------------------------------------------------- | --- | --------------------------------------------- |
| 1   | Subscriptions and relationships live in tabs; mutations invalidate detail and list | yes | `MemberDetailPage` shell + tab siblings       |
| 2   | Attendance tab unchanged; shepherding tab shows shepherd, history and calls        | yes | `MemberAttendanceTab`, `MemberShepherdingTab` |
| 3   | Ministries add/remove against real reference data, with confirmation               | yes | `MemberMinistriesTab`, client tests           |
| 4   | Relationships add/remove with the API's fields and a member picker                 | yes | `MemberRelationshipsTab`, `MemberPicker`      |
| 5   | Coverage dialogs use the picker, validation unchanged                              | yes | `MemberSubscriptionsTab`                      |
| 6   | No behaviour lost in the move (archive/restore, purge, contacts, coverage)         | yes | review confirmed each handler survives        |

Verdict: **ACCEPTED**.

## Deviations

- The contact link/unlink UI remains deferred (its own backlog row); the detail's contacts dialog stays
  read-only per FR-78.
- Browser-level tests for the tabs and the picker stay with ticket 19.
- Pixel parity with the mocks remains ticket 19.
