---
name: mock-build
description: Use when building, refreshing or auditing a visual mock under mockups/ - keeps one live image per state, matches the defined shell, makes the surface's numbers add up, and hands a signed catalogue entry to the round. Triggers - "build a mock", "refresh the mock", "update the mock", "the mock looks different from the design", "drift", "new mock state", "duplicate mock", "version the mocks", "prune stale mocks", "sidebar is missing", "topbar is missing", "date picker in the sidebar".
---

# Mock build and refresh - procedure

A mock is a local, git-ignored review artifact (`AGENTS.md` section 14) whose **durable record is the
signed catalogue entry** (`documents/mock-claims/<set>.json`), not the image. This skill runs the
build-and-refresh procedure. It does not own:

- **what to build** - the spec and the grill decide that;
- **whether the built surface carries the mock's atoms** - that is the canonical
  `orchestrator/references/mock-parity.md` screen and the AC-coverage guard;
- **the component rules** - `component-first` and `AGENTS.md` sections 15-16 own those.

The repository policy for this skill is `documents/rounds/ui-mock-parity.md` (surface plan and adopt/queue
ledger) plus `mockups/<set>/README.md` (what each image shows).

## The shell is fixed and complete

Every mock carries the whole shell, never a subset of it:

| Region         | Content                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Top bar        | brand mark + name, top nav with the section active, account avatar                                                  |
| Sidebar head   | `Section` label + section name, collapse control                                                                    |
| Sidebar nav    | the section's submenu, active item marked, **an icon on every item**                                                |
| Sidebar footer | **Date and time** (gear, current format, chevron) then **Appearance** (format field, switch, `Dark`), in that order |

The definition is the Fluent prototype (`%TEMP%\opencode\v2-shell-mock`, `Sidebar.tsx` +
`DateTimeControl.tsx` + `ThemeControl.tsx`) as captured in `mockups/v2-settings/02-date-time-sidebar.png`;
`mockups/mvp-offerings/mock.css` mirrors it. A missing **Date and time** block is drift, even when the page
under it is right - a text-only footer (`Date and time` / `Day Month Year, 24-hour` as prose) is a
different shell from the built one.

## Procedure

1. **Find the one live file for the state.** `mockups/<set>/<NN>-<state>.png` with its `.html` and the set's
   `history.json`. If a sibling like `-v2`, `-reduced`, `-copy` or a second number for the same state exists,
   that duplicate **is** the defect: fold it back into the live file and delete it.
2. **Read the design before writing.** Open the design image (for `v2-shell`, the archived original) and the
   shell reference. Note the frame, the page-head shape, and how many actions the header carries.
3. **Build from the stylesheet, not from the design's pixels.** Compose `mock.css` classes for the shell, page
   head, KPI cards, panel, table, badges and chips. Then declare **only** the differences the design itself
   has, each with a one-line comment saying why. Every override is a place the mock can drift.
4. **Never name a page wrapper after a class the stylesheet already owns.** Check `grep` before naming:
   `.state` is the dashed annotation card (`padding: 28px 20px`, `text-align: center`, muted text) and
   `.screen` is the monospace `pre-wrap` USSD preview. Either one silently restyles a whole page - inset,
   centred, 233px rows - while the markup still looks correct.
5. **Make the numbers add up.** Tiles, chips, footer and any card count derive from the same rows the grid
   shows: tiles are sums and counts over the read, the chips use the same predicate as the filter, the footer
   states the rows in view. A number too large to draw **changes the number**; it never gets a "sample rows"
   caveat. Mark attention counts in the design's own red; they are not ink.
6. **Run the guard, then capture.** `node scripts/mock/shell-check.mjs <set>` names every missing shell
   region and every submenu item without an icon, and the recorder refuses to capture a mock that fails
   it. Capture at the design's frame: 1440 x 900, `deviceScaleFactor: 1`, target the page wrapper
   (`[data-state~="<state>"]`), and fail on any page or console error. Keep the recorder next to the
   mock; it is the only way to regenerate the PNG.
7. **Compare 1:1 before calling it done.** Stack the archived previous version and the new capture, and the
   shell against `02-date-time-sidebar.png`. Check the frame, then in this order: table header case, row
   height, chip shape and fill, icon weight, **nav icons**, tile height, value colours, vertical rhythm.
   Every fault in this list is invisible in code and obvious in a crop. The guard only catches what its
   rules name - the crop catches the rest.
8. **Version in place.** The recorder archives the superseded PNG to `mockups/_archive/<set>/` and appends
   `{ version, at, sha256, change }` to `history.json`, taking the change note from the command line. A
   version whose image was not kept is recorded with `discarded: true` - never imply a file that is gone.
9. **Prune deliberately.** `node mockups/prune.mjs` reports orphans and archived images and deletes nothing;
   `--archive` and `--orphans` delete. It never removes a PNG a state names.
10. **Hand off to the catalogue.** Write `mock.path`, `mock.sha256` and `mock.source` into
    `documents/mock-claims/<set>.json` with `coverage: "target"`. The owner's sign-off flips it to `signed`
    with `{ by, at, sha256 }`; the round doc then carries a `## Mock sign-off` row naming the same
    `mockups/<set>/<state>.png` and a `Mock coverage:` line (`check-round` R6).

## Drift checklist

| Check                  | Reference value (`v2-shell` roster, 1440 x 900)                |
| ---------------------- | -------------------------------------------------------------- |
| Top bar height         | 56 px                                                          |
| Sidebar width          | 260 px                                                         |
| Sidebar nav icons      | one per item, 16 viewBox at 1.2 stroke - a bare label is drift |
| Page frame             | 1440 x 900, `main` padding 20/26                               |
| KPI tile               | 98-100 px, label 12.5 muted, value 28 px, caption 11 muted     |
| Attention value colour | `#c43501`, not `--bad` and not ink                             |
| Table header           | sentence case 12 px, ink-2 - not `mock.css`'s uppercase 11 px  |
| Table row              | 45 px, member number and flag on one line                      |
| Filter chips           | 26 px; selected `#ebebeb` fill, unselected white + 1 px border |
| Icon buttons           | bare glyph, muted, no border                                   |
| Shell switch           | 40 x 20 (not `mock.css`'s 32 x 16)                             |
| Shell format field     | 128 px                                                         |
| Dropdown chevrons      | drawn glyphs, not a text character                             |

## Pitfalls this skill exists to prevent

| Pitfall                                      | Symptom                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| A wrapper class the stylesheet owns          | page inset, text centred, muted colours, 233 px rows                          |
| Overriding instead of composing              | each override fixes one thing and breaks the shared rhythm                    |
| Numbers that do not describe the rows        | 28 assigned over 7 rows, or a chip count that disagrees with its tile         |
| A second image for one state                 | two "targets" and no way to say which was signed                              |
| Refreshing without the archive in view       | uppercase headers, bordered icon buttons, blue chips - all "plausible" alone  |
| Reconstructing Fluent by hand                | chevrons as text characters, wrong switch size, wrong chip radius             |
| A guard that names the box, not its contents | `side-nav` present but every item icon-less, so two sets shipped without them |
| Trusting the guard instead of the picture    | a check can only catch what its rules name; the owner's eye caught the icons  |

## Done means

The live PNG is the only image for that state; the frame and shell match, and `shell-check` passes for
the set; the numbers add up; the 1:1 comparison shows only intended differences; `history.json` names
this cut; the catalogue carries the hash; `npx vitest run tests/meta/mock-claims.test.ts` passes. A
refresh that has not been compared is not done.
