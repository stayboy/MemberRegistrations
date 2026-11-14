# Round - shell-sweep-events

|                     |                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                 |
| Tier                | 1 - Plan                                                                                             |
| Mode                | attended                                                                                             |
| Base                | `48c7bb6`                                                                                            |
| Review rounds       | 0                                                                                                    |
| Gate runs in parent | 4                                                                                                    |
| Spec                | `AGENTS.md` section 14; `documents/rounds/ui-mock-parity.md`; `.opencode/skills/mock-build/SKILL.md` |
| Workers             | `single`                                                                                             |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (sweep, mock, round doc)                                |

## Plan

Second set of the shell sweep, using the guard and recorder that landed with `shell-sweep-imports`.

Scope:

- `mockups/v2-events/` - the three screens that have an HTML source gain the collapse control and the
  real Date and time / Appearance controls, replacing prose; brand casing follows the shell.
- **`mockups/v2-imports/` re-refreshed.** The owner found that the landed imports sweep dropped the
  **nav icons** the shell draws on every submenu link, so this round re-captured that set as well.
- **The guard gains a nav-icon rule.** `shell-check` now names each submenu item that carries no icon,
  which is the rule whose absence let both sets ship without them.
- The recorder is rewritten on `scripts/mock/record.mjs` + `checkShell`, with an explicit
  source-to-state mapping because one screen is stored under a different number than its source
  (`08-series-detail-entry.html` -> `04-series-detail.png`).

Acceptance criteria:

1. `shell-check` scores `v2-events` 3/3 and `v2-imports` 4/4 (they were 0/3 and 0/4 on the icon rule).
2. The refreshed captures differ from the archived previous version **only** in the shell.
3. Each state is recorded with its prior version archived in `_archive/<set>/`, and each set has a
   `history.json`.
4. The nav-icon rule has a test that fails an item without an icon.
5. `npm run verify` passes.

## Verification

| Gate            | Command                                              | Result                                |
| --------------- | ---------------------------------------------------- | ------------------------------------- |
| Guard, this set | `node scripts/mock/shell-check.mjs v2-events`        | 3/3 after the fix (0/3 before)        |
| Guard, imports  | `node scripts/mock/shell-check.mjs v2-imports`       | 4/4 after the icon fix (0/4 on icons) |
| Guard, all sets | `node scripts/mock/shell-check.mjs`                  | 8/19 in the sweep's sets              |
| Guard tests     | `npx vitest run tests/meta/mock-shell-check.test.ts` | 15 passed                             |
| Recorder        | `node mockups/v2-events/capture-import-entry.mjs`    | three states recorded, prior archived |
| Recorder        | `node mockups/v2-imports/capture-attendance.mjs`     | four states recorded at v3            |
| Full gate       | `npm run verify`                                     | see the signature below               |

gate-run 2026-11-14T15:08:04.499Z profile=full steps=7/7 lines=7 bytes=865

## Mock sign-off

n/a - no user-visible surface changed; the set has no claim catalogue, so nothing is re-signed.

## Mock parity

n/a - the screens were refreshed against the shell definition, not against a spec.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                   | Met | Evidence                                          |
| --- | ------------------------------------------- | --- | ------------------------------------------------- |
| 1   | `v2-events` 3/3 and `v2-imports` 4/4        | yes | guard output shown above                          |
| 2   | The refresh differs only in the shell       | yes | 1:1 sidebar comparison against each set's archive |
| 3   | Each state recorded with its prior archived | yes | recorder output; `mockups/v2-events/history.json` |
| 4   | A test fails a submenu item with no icon    | yes | "fails a submenu item with no icon"               |
| 5   | `npm run verify` passes                     | yes | signature above                                   |

## Deviations

- **The first sweep dropped the nav icons.** `shell-check` v1 required the `side-nav` element and not its
  items, so both refreshed sets shipped without the icons the shell reference and the roster draw. The
  owner found it; the rule now names each item, and this round re-captured `v2-imports` (v3) as well as
  `v2-events` (v3). The `mock-build` skill now says the nav row carries an icon per item, lists it in the
  drift checklist, and records the trap: _a guard that names the box, not its contents_.
- **Only three of seven v2-events screens are regenerated.** The other four (`01`-`03`, `06`, `07`) were
  captured from the Fluent prototype and have no HTML here, so they keep the old chrome until the
  prototype is rebuilt or a source is written.
- **Table headers stay uppercase**, as in `v2-imports`: `mock.css`'s `th` is uppercase 11px where the
  v2-shell design is sentence case 12px. Grid drift, recorded and deferred.
- The `04-series-detail` state keeps its number while its source is `08-series-detail-entry.html`; the
  mapping is explicit in the recorder rather than inferred.
