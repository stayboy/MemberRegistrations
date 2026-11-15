# Round - activity-dialogs-and-settings

|                     |                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                        |
| Tier                | 1 - Plan                                                                                                                                    |
| Mode                | unattended (auto-accept recommendations)                                                                                                    |
| Base                | `eef8f3a`                                                                                                                                   |
| Review rounds       | 0                                                                                                                                           |
| Gate runs in parent | 1                                                                                                                                           |
| Spec                | `member-registrations-events-offerings.md` FR-4/8, AC-3/7; `member-registrations-headcount.md` HC-1/HC-3; owner ruling on the settings card |
| Workers             | `single`                                                                                                                                    |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (mock markup, capture, catalogue, round doc)                                                   |

## Plan

Two things the consolidation left open: the dialogs a session row opens, and the settings card the
owner called unnecessary.

**The dialogs** are the only way the count and the import are reached, so a parity pass that never sees
them cannot judge them. Both are captured over the activity detail with its shell behind a scrim, so
the file stays shell-checked and the dialog is the subject.

**The settings card** - "Members list under this choice" - re-rendered a register to demonstrate a date
format. Its job is done by the Preview card above it, which names the value, the rendering and the kind.

### Scope

- `mockups/v2-events/03-activity-detail.html` - two dialogs, hidden at rest, opened from a session row.
- `mockups/v2-events/capture-activity-dialogs.mjs` - captures them.
- `mockups/v2-settings/01-date-time-settings.html` - the members card removed.
- `documents/mock-claims/v2-events.json` - two states and two claims.
- `documents/mock-claims/v2-settings.json` - the moved state re-signed.

Acceptance criteria:

1. The count dialog offers one field per lane, not a single total.
2. The import panel states the session's capture state and shows the rows before commit.
3. Both open over the shell and are captured without it.
4. Settings explains the choice and no longer re-renders a register.
5. The catalogue validates; no state is stale.
6. `npm run verify` passes.

## Verification

| Gate            | Command                                                         | Result                           |
| --------------- | --------------------------------------------------------------- | -------------------------------- |
| Shell guard     | `node scripts/mock/shell-check.mjs`                             | 21/21 carry the shell            |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                 | 77 passed                        |
| Auto-sign       | `node scripts/mock/sign-unattended.mjs --list <all seven sets>` | 0 to sign, 56 unchanged, 0 stale |

gate-run 2026-11-15T13:18:10.279Z profile=full steps=7/7 lines=7 bytes=1010

## Mock sign-off

Three states cut or moved and **auto-signed**, listed for the reviewer's second look.

| Set / state                            | sha256                                                             |
| -------------------------------------- | ------------------------------------------------------------------ |
| `v2-events/06-record-headcount-dialog` | `dc28201836c80331dd392357ba3f39c2fd4b8fca9e58a3c0579ae17b054fbc4c` |
| `v2-events/07-import-attendance-panel` | `24bd2629929219a167e1b9894e091366b56254836fae49a391d610d2d874f44f` |
| `v2-settings/01-date-time-settings`    | `25a599f600d6a4e8c6d50af24cd7a46cfae76aa04db1a5707d77aebfa39e9e3a` |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0 (activity detail and settings surfaces).

## Mock parity

| Surface         | States | Claimed | e2e-only | Deferred | Probe    |
| --------------- | ------ | ------- | -------- | -------- | -------- |
| activity-detail | 5      | 3       | 1        | 1        | advisory |
| settings        | 1      | 1       | 0        | 1        | advisory |

The two dialog claims are `mock-only`: the lane vocabulary and the capture-state wording are specified
in `member-registrations-headcount.md` and `FR-6f`, which the events catalogue does not declare as a
slice, so claiming them against an AC there would name an anchor outside the denominator.

## Acceptance

| #   | Criterion                                                | Verdict  | Evidence                                                                      |
| --- | -------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| 1   | Count dialog has one field per lane                      | ACCEPTED | Male / Female / Children, Elder / Deaconess / Deacon; `AD-HC-DIALOG`          |
| 2   | Import panel states capture state and rows before commit | ACCEPTED | "Live · recorded 10:42", expected columns, two parsed rows; `AD-IMPORT-PANEL` |
| 3   | Both open over the shell, captured without it            | ACCEPTED | the scrim keeps the shell in the file; `shell-check` 21/21                    |
| 4   | Settings no longer re-renders a register                 | ACCEPTED | the card is gone; the Preview card remains                                    |
| 5   | Catalogue validates, nothing stale                       | ACCEPTED | 77 passed; `0 to sign, 56 unchanged, 0 stale`                                 |
| 6   | `npm run verify` passes                                  | ACCEPTED | gate-run signature above                                                      |

## Deviations

- Tier 1: mock markup, capture and catalogue data; no `src/` or `ui/src/` change.
- The dialog capture keeps a sliver of the scrim in the top-right corner: it is what an element
  screenshot of a rounded box includes, not a design element.
- Phase C (the events list gaining series rows, and dropping `03-series-list` and `06-attendance-rows`)
  is not in this round.
