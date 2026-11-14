# Round - parity-roster

|                     |                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status              | OPEN                                                                                                                                                         |
| Tier                | 2 - Reviewed                                                                                                                                                 |
| Mode                | attended                                                                                                                                                     |
| Base                | `7dec04a`                                                                                                                                                    |
| Review rounds       | 2 - spec REWORK then ACCEPTED; code ACCEPTED, one P2 fixed and re-gated                                                                                      |
| Gate runs in parent | 4                                                                                                                                                            |
| Spec                | `documents/specs/member-registrations-ui.md` (FR-59a, AC-35a)                                                                                                |
| Workers             | `single`                                                                                                                                                     |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (spec, catalogue, mock, round doc); worker ollama-cloud/deepseek-v4.1-flash:1017 (roster build, caption, tests) |

## Plan

Close the Shepherding roster's mock-parity gap: the five elements the v2 design draws and the built page
did not have, specified first and built second.

Scope:

- Spec: FR-59a (officer identity card, five count tiles computed over the full read, search over member name
  and number only, never-called and quiet badges sharing FR-60's predicate, one Fluent row menu with Log
  call still visible, a footer count) and AC-35a.
- Code: `ui/src/pages/ShepherdingRosterPage.tsx`, `ui/src/format/shepherding.ts` (`daysSinceLastCall`,
  `lastCallBadge` beside `isFollowUp`), the DOM suite, two node tests.
- Mock: refresh `mockups/v2-shell/08-shepherding-roster.png` in place, versioned in `history.json`, with
  `mockups/prune.mjs` for stale images.
- Record: `documents/mock-claims/v2-shell.json` (surface `/shepherding/roster`, state `roster`), signed by
  the owner.

Acceptance criteria:

1. FR-59a and AC-35a exist, are implementable as written, and an independent reviewer accepted them.
2. The five elements are built per FR-59a: card, five tiles, search, badges, one Fluent `Menu` overflow.
3. The tiles are computed over the **full** read, not the filtered view; a zero renders `0`; pending shows a
   skeleton; failure suppresses the group.
4. Search matches member name and member number only, combines with the filter as an AND, and resets
   neither the tab nor the window.
5. Badge, tile and filter share one `> 30` predicate and one UTC day count.
6. The catalogue validates, its inventory cites a real test, and the owner signed the mock it names.
7. The mock is one live file per state, versioned, and compares 1:1 with the archived design.

## Verification

| Gate            | Command                                                                     | Result                                    |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| Skill/round     | `npm run verify` (skill, check-round, format, lint, typecheck, test, build) | see signature below                       |
| Root suite      | inside `verify`                                                             | 52 files, 743 passed / 6 skipped (749)    |
| UI unit         | `npm --prefix ui run test`                                                  | 41 files, 444 passed                      |
| UI DOM          | `npm --prefix ui run test:dom`                                              | 6 files, 41 passed (8 in the roster file) |
| e2e             | `npm run ui:e2e`                                                            | 68 passed                                 |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                             | 76 passed                                 |
| Round doc       | `node scripts/check-round.mjs --files documents/rounds/parity-roster.md`    | ok                                        |

gate-run 2026-11-14T08:18:27.942Z profile=full steps=7/7 lines=7 bytes=854

The discrimination proof for criterion 3: substituting `countTiles(filtered)` for `countTiles(entries)` fails
`computes the tiles from the full read, not the filtered view` with `expected '1' to be '5'`; restored, the
file passes 8/8.

## Review

Tier 2. The parent wrote the spec, the catalogue, the mock and this doc; the worker built the page and the
tests; the reviewer seat was independent of both.

- **Spec, round 1 - REWORK (two P1).** A citation to `FR-31a`, a requirement that does not exist, and
  "assignments in view" left indeterminate between the read, the filtered set and the searched set. Both
  fixed in one rewrite, plus seven named gaps (Follow-ups predicate, sums vs members-with-any, search
  composition, skeleton/error/zero, Fluent `Menu`, the plain-date fall-through).
- **Spec, round 2 - ACCEPTED.** P1s closed; the one remaining note (a loose FR-69/FR-75 citation) was
  removed rather than carried.
- **Code - ACCEPTED, no blocking findings.** One P2: the Attempts tile said "This quarter" for a
  window-scoped number. Changed to "In this window" in the page and the mock, then re-gated.

Seat: consistent - the Implementer row matches the split the reviewer read: the parent wrote the spec,
catalogue and mock, the worker wrote the page and tests.

## Mock sign-off

| Surface               | Mock                                         | sha256                                                             | Signer | Date       | Verdict |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/shepherding/roster` | `mockups/v2-shell/08-shepherding-roster.png` | `2e9b09252c198aeef1173f6a0852816e102aaecc50dc63a56a3096951ae938df` | owner  | 2026-11-14 | signed  |

Mock coverage: claimed 0 - e2e-only 1 - deferred 0 - prose 0

## Mock parity

| Claim | Type | State | Answer (max prob) | Threshold | Confirmed by | Disposition                                                                                                   |
| ----- | ---- | ----- | ----------------- | --------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| n/a   | -    | -     | -                 | -         | -            | screen not run; the catalogue inventory row (AC-35a, `e2e-only`, citing the full-read DOM test) is the record |

## Acceptance

**ACCEPTED.**

| #   | Criterion                                                     | Met | Evidence                                                                                                                         |
| --- | ------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | FR-59a and AC-35a accepted by an independent reviewer         | yes | two review rounds recorded above                                                                                                 |
| 2   | The five elements built                                       | yes | `ui/src/pages/ShepherdingRosterPage.tsx:521` (card), `:61` (tiles), `:588` (search), `:666` (badge), `:180` (menu)               |
| 3   | Tiles over the full read; zero, skeleton, error states        | yes | `countTiles(entries)` at `:169`; DOM tests `renders a zero tile as 0`, `shows a tile skeleton`, `suppresses the tiles`           |
| 4   | Search name and number only, AND, non-resetting               | yes | `:386` (`visible` after `filtered`); DOM test `narrows by member name and member number, ANDs with the filter and keeps the tab` |
| 5   | One `> 30` predicate across badge, tile and filter            | yes | `ui/src/format/shepherding.ts` `isFollowUp` / `daysSinceLastCall` / `lastCallBadge`; node tests                                  |
| 6   | Catalogue validates, inventory cites a real test, mock signed | yes | `documents/mock-claims/v2-shell.json`; guard 76/76                                                                               |
| 7   | One live mock, versioned, compared 1:1 with the design        | yes | `mockups/v2-shell/history.json` (13 versions, v1 archived); 1440 x 900                                                           |

## Deviations

- **The mock is HTML on `mock.css`, not a capture of the Fluent prototype.** The prototype
  (`%TEMP%\opencode\v2-shell-mock`) retains the shell only; its pages were not kept. The refresh was
  therefore a reconstruction, which is where the header case, chip fill, icon weight and tile height drifted
  before being corrected against the archived design.
- **The surface's numbers changed from the design's.** The design drew 28 assignments over 7 rows with a
  "7 of 28 ... sample rows" footer. FR-59a forbids the caveat, so the refresh makes one consistent set
  (7 assigned / 15 attempts / 8 conversations / 2 never called / 4 follow-ups) across tiles, chips, footer
  and card.
- **The page still renders its single Refresh inside the one-item `Actions` menu**, while the signed mock
  shows a visible `Assign member` button and a bare refresh glyph. Aligning the code needs the owner's
  ruling on whether FR-9a changes globally (menu for two or more actions) or only here, and whether a
  page-level Assign member is in scope.
- **Shell parity sweep outstanding.** 19 of the 20 HTML mocks still render the sidebar footer as plain text
  with no gear, format field or switch; this round fixed the roster only.
- **The programme state table was not corrected here.** The two spec-required R gaps are closed, but the
  edit to `documents/rounds/mvp-local.md` blocked the pre-commit hook: `check-round` treats every changed
  `documents/rounds/*.md` as a round doc, and a programme doc carries no `Implementer` or sign-off row, so
  R1 and R6 reject it. The correction was reverted rather than given a false signature, and the guard gap is
  recorded in `documents/backlog.md`.
- `documents/mock-claims/v2-shell.json` was created in this round because R6 refuses a `ui/src/**` change
  with no signed catalogue; AC-35a was added in the same change so the inventory had a real AC to cite.
