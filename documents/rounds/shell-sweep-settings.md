# Round - shell-sweep-settings

|                     |                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                 |
| Tier                | 1 - Plan                                                                                             |
| Mode                | attended                                                                                             |
| Base                | `0f9f4b4`                                                                                            |
| Review rounds       | 0                                                                                                    |
| Gate runs in parent | 1                                                                                                    |
| Spec                | `AGENTS.md` section 14; `documents/rounds/ui-mock-parity.md`; `.opencode/skills/mock-build/SKILL.md` |
| Workers             | `single`                                                                                             |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (rebuild, mock, round doc)                              |

## Plan

Third set of the shell sweep. `v2-settings/01-date-time-settings.html` is the one mock that predated
the product shell entirely: its own header, a dot list in the sidebar, no footer, and its own stylesheet.

Scope:

- Rebuild the screen on `mock.css` and the shell: the app header with the six top-level entries, the
  `Section / Admin` head with its collapse control, the iconed submenu (Ministries, Settings), and the
  pinned **Date and time** above **Appearance**.
- Keep the content: the three preference cards (Appearance, Date and time, Session), the preview table
  and the members list under the chosen format.
- The page declares only what it needs beyond the stylesheet: the three-column card grid, the field
  control, and the switch's on state.

Acceptance criteria:

1. `shell-check` scores `v2-settings` 1/1 (it was 0/1).
2. The content is preserved row for row: three cards, five preview rows, three members.
3. The capture is recorded at v2 with the previous image archived.
4. `npm run verify` passes.

## Verification

| Gate            | Command                                         | Result                      |
| --------------- | ----------------------------------------------- | --------------------------- |
| Guard, this set | `node scripts/mock/shell-check.mjs v2-settings` | 1/1 after the rebuild (0/1) |
| Guard, all sets | `node scripts/mock/shell-check.mjs`             | 9/19 in the sweep's sets    |
| Recorder        | `node mockups/v2-settings/capture-settings.mjs` | recorded v2, v1 archived    |
| Full gate       | `npm run verify`                                | see the signature below     |

gate-run 2026-11-14T17:11:33.663Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

n/a - no user-visible surface changed; the set has no claim catalogue, so nothing is re-signed.

## Mock parity

n/a - the screen was rebuilt against the shell definition, not against a spec.

## Acceptance

**ACCEPTED.**

| #   | Criterion                   | Met | Evidence                             |
| --- | --------------------------- | --- | ------------------------------------ |
| 1   | `v2-settings` 1/1           | yes | guard output shown above             |
| 2   | Content preserved           | yes | capture reviewed against the archive |
| 3   | Recorded at v2, v1 archived | yes | recorder output; `history.json`      |
| 4   | `npm run verify` passes     | yes | signature above                      |

## Deviations

- **This is a page rebuild, not a chrome swap.** The old mock had its own stylesheet and markup, so the
  screen was rewritten on `mock.css`; the content is unchanged but the card titles now use the shared
  `panel-head` at 13.5 px instead of the old `h3`.
- **`v2-settings/02-date-time-sidebar.png` and `02b-display-menu.png` are not swept.** They were captured
  from the Fluent prototype by `shot-datetime.cjs` and have no HTML here, so the guard does not count them.
  `02` is also the shell reference the guard compares against.
- **Table headers stay uppercase**, the deferred grid drift shared with `v2-imports` and `v2-events`.
- The old page was 1440 x 1140; the rebuilt one is 1440 x 994 because the shared cards are more compact.
  The frame width and the content are unchanged.
