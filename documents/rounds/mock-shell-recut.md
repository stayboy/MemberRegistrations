# Round - mock-shell-recut

|                     |                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                     |
| Tier                | 1 - Plan                                                                                                                                 |
| Mode                | unattended (auto-accept recommendations)                                                                                                 |
| Base                | `187b62b`                                                                                                                                |
| Review rounds       | 0                                                                                                                                        |
| Gate runs in parent | 1                                                                                                                                        |
| Spec                | `documents/specs/member-registrations-ui.md` 4.1-4.3, AC-1, AC-2, AC-4, AC-5, AC-23, AC-50; AC-11a, AC-41, AC-47 for the members content |
| Workers             | `single`                                                                                                                                 |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (mock markup, capture, catalogue, round doc)                                                |

## Plan

The owner's ruling: **follow the spec, and a mock that contradicts it is stale**. The five shell captures
were prototype screenshots with no source, so they could never be refreshed, shell-checked or signed -
and the one that did have a source contradicted the current spec.

This round rebuilds them from the spec on the shared shell, as one page with one source.

### What the old captures got wrong

| #   | Old capture                                                                | Spec                                                                                         | Fixed by                            |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | Nav read `Members · Attendance · Imports · Shepherding · Admin`            | 4.3: `Members · Events · Imports · Shepherding · USSD · Admin`                               | the nav map                         |
| 2   | The Members page offered `Import attendance` beside `Add member`           | FR-9a + the 2026-11-15 lesson: Import attendance belongs to the event and series detail only | one verb, `Add member`              |
| 3   | Two verbs as two buttons, Refresh between them                             | AC-50: one verb visible, or a single `Actions` menu; Refresh leads the row                   | Refresh, then `Add member`, no menu |
| 4   | Toolbar: search, `Include archived`, `Find by contact`, ministries, series | the build: search, status, series, `Find by contact`                                         | the toolbar is the build's controls |
| 5   | Row read `Ama Mensah` + `Presbyter`                                        | AC-11a: `FullName (Gender, Ny)`; AC-47: `Contacts · n`                                       | `Ama Mensah (F, 34y)`               |
| 6   | Row action was a `...` menu                                                | the build: one open button per row                                                           | a single open icon                  |

The signed roster had the same class of drift: its Refresh sat in the toolbar, while AC-50 and the
build's own DOM test put it **first in the page action row**. That state was re-cut too.

### Scope

- `mockups/v2-shell/01-shell-expanded-light.html` - new, the page that carries the shell.
- `mockups/v2-shell/capture-members.mjs` - captures the five states in place.
- `mockups/v2-shell/08-shepherding-roster.html` - Refresh moved into the action row.
- `documents/mock-claims/v2-shell.json` - a `shell` surface, five states, eight entries.

Acceptance criteria:

1. Every rebuilt state carries the shell (`shell-check` 20/20).
2. The nav, the action row, the toolbar and the row shape follow the spec, not the old capture.
3. The five states look like the design: same shell, same rhythm, only chrome differs.
4. The roster's action row matches AC-50 and the build's DOM test.
5. The catalogue validates, and no state is stale.
6. `npm run verify` passes.

## Verification

| Gate            | Command                                                         | Result                           |
| --------------- | --------------------------------------------------------------- | -------------------------------- |
| Shell guard     | `node scripts/mock/shell-check.mjs`                             | 20/20 carry the shell            |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                 | 77 passed                        |
| Auto-sign       | `node scripts/mock/sign-unattended.mjs --list <all seven sets>` | 0 to sign, 36 unchanged, 0 stale |
| Full gate       | `npm run verify`                                                | see the signature                |

gate-run 2026-11-15T10:45:39.580Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

Every state below is **auto-signed** for this unattended stretch (AGENTS.md section 17) and listed here
with its hash for the reviewer's second look. The roster's owner signature was **voided, not
overwritten**: the catalogue took the documented `signed -> target` step before the tool could sign it.

| Set / state                         | Mock                                            | sha256                                                             |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `v2-shell/01-shell-expanded-light`  | `mockups/v2-shell/01-shell-expanded-light.png`  | `c2d1e0113ba13b8fed84fbf76995d613d13747360ded47b572d30524eee1da61` |
| `v2-shell/02-shell-collapsed-light` | `mockups/v2-shell/02-shell-collapsed-light.png` | `d3940ebb4d23f2c792083ceb62d30e1b38592fa7a4cdf99a32109d863d5c0392` |
| `v2-shell/03-shell-expanded-dark`   | `mockups/v2-shell/03-shell-expanded-dark.png`   | `d4da12b2e4be617fb4eabd0c32f937d91db8dd9186ceda153b5599c8a7f1547d` |
| `v2-shell/05-meadow-accent`         | `mockups/v2-shell/05-meadow-accent.png`         | `35eb77f092f6bd054f82b558a0c437587f4b011a877b13e10cfc92a6f683d60a` |
| `v2-shell/06-mobile`                | `mockups/v2-shell/06-mobile.png`                | `456e7f73e27973e687dd3f77bd1d279c0582a39c109314577b899edcad74332e` |
| `v2-shell/roster`                   | `mockups/v2-shell/08-shepherding-roster.png`    | `b5cc237e98942743bb856a1f3945c5d9a5b894eb59e379bbf6c9511fe8c23e99` |

Mock coverage: claimed 1 · e2e-only 5 · deferred 1 · prose 0

### 1:1 against the archived versions

`mockups/_archive/v2-shell/01-shell-expanded-light-v1.png` against the new state: the shell frame, the
sidebar rhythm and the table card are unchanged; the nav label set, the action row, the toolbar and the
identity cell are the six differences in the table above. The collapsed state now shows **two 34 px icon
buttons** in the footer instead of a squeezed switch, and the 360 px state shows the `Sections` button
with the table scrolling inside its card - neither existed as a live state before.

## Mock parity

| Surface | States | Claimed | e2e-only | Deferred | Probe    |
| ------- | ------ | ------- | -------- | -------- | -------- |
| shell   | 5      | 1       | 5        | 1        | advisory |

AC-4 (collapse survives a reload) stays deferred: the state renders, but nothing asserts the reload. The
probe is advisory because the five states are one page in five chrome states, so AC-50 yields three
genuine absence controls rather than a set of independent ones.

## Acceptance

| #   | Criterion                                              | Verdict  | Evidence                                                   |
| --- | ------------------------------------------------------ | -------- | ---------------------------------------------------------- |
| 1   | Every rebuilt state carries the shell                  | ACCEPTED | `shell-check: 20/20 mocks carry the shell`                 |
| 2   | Nav, action row, toolbar and row shape follow the spec | ACCEPTED | the six-row table above, each line traced to an AC or 4.3  |
| 3   | The five states look like the design                   | ACCEPTED | read against the archived cut; only chrome differs         |
| 4   | The roster's action row matches AC-50                  | ACCEPTED | `08-shepherding-roster.png` v14, Refresh ahead of the verb |
| 5   | The catalogue validates, no state stale                | ACCEPTED | 77 passed; `0 to sign, 36 unchanged, 0 stale`              |
| 6   | `npm run verify` passes                                | ACCEPTED | gate-run signature above                                   |

## Deviations

- Tier 1: mock markup and capture only; no `src/` or `ui/src/` change. The catalogue addition is data.
- The five shell states are one page with one source, so `06-mobile` and `02-shell-collapsed-light` share
  `01-shell-expanded-light.html` and differ by a class, an attribute and a viewport. That is the "one live
  image per state, never a duplicate file" rule satisfied at the source level rather than by five clones.
- `04-shell-collapsed-dark` and the remaining prototype captures (`10-members-refined`, `11-add-member`,
  `12-subscriptions`, `13-add-subscription`, `14-add-coverage`, `16-contacts`, `17-find-contact`) are not
  cut here. The members screens are the next parity round's subject, and cutting them twice would be waste.
