# Round - page-actions-one-verb

|                     |                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                             |
| Tier                | 2 - Reviewed                                                                                                                                                     |
| Mode                | unattended (auto-accept recommendations)                                                                                                                         |
| Base                | `fa9c961`                                                                                                                                                        |
| Review rounds       | 1 - Tier 2 code review ACCEPTED, then one P2 fix pass                                                                                                            |
| Gate runs in parent | 3                                                                                                                                                                |
| Spec                | `documents/specs/member-registrations-ui.md` FR-9a, D12, AC-50                                                                                                   |
| Workers             | `single`                                                                                                                                                         |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (integration, gate, round doc); worker ollama-cloud/deepseek-v4.1-flash:1017 (PageFrame, PageActions, pages, tests) |

## Plan

FR-9a's amendment, built: **a page with exactly one verb renders it visibly; two or more keep the
`Actions` menu; a `Refresh`-class control is a surface utility rendered as a bare trailing icon, never a
menu item and never counted towards the two-or-more rule.** `New session` is a create-side verb, so it
renders visibly.

### Decisions (auto-accepted, unattended)

| #   | Question                                      | Decision                                                                                                                                                                                                           |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | How does a caller say an action is a utility? | An explicit `kind?: 'verb' \| 'utility'` on `PageAction`, defaulting to `verb`. Inferring from the id would make the rule depend on a string, and a new refresh-like control would silently fall on the wrong side |
| 2   | Where does a lone verb render?                | In the action row where the menu sat - the same right edge - so the row's layout does not move                                                                                                                     |
| 3   | What does a lone verb look like?              | A Fluent `Button` with its icon and **visible label**, not an icon-only control: the label is the accessible name, the same reasoning that made the menu trigger a text button (owner, 2026-11-13)                 |
| 4   | What if a page has utilities and no verbs?    | Utilities render at the trailing edge and **no menu** is drawn (AC-50)                                                                                                                                             |
| 5   | Do the 13 one-action pages keep a menu?       | No. Eleven `refresh`, one `refresh-columns` and one `new-session`: the first twelve become a bare icon, `new-session` becomes a visible button                                                                     |

### Scope

- `ui/src/components/PageActions.tsx`: `PageAction` gains `kind`; the menu takes **verbs only** and its
  divider rule loses "Refresh last".
- `ui/src/components/PageFrame.tsx`: renders the action row by the rule - one verb as a button, two or more
  as the menu, utilities as trailing icon buttons.
- The 20 pages that pass `actions`: mark `refresh` and `refresh-columns` as utilities; `new-session` stays a
  verb.
- Tests: component and page DOM tests for one verb, two or more, utilities only, and a verb plus a utility;
  e2e updated where it looks for the `Actions` menu.

Acceptance criteria:

1. A page with one verb renders that verb as a `Button` with its visible label and **no** `Actions` menu.
2. A page with two or more verbs renders one `Actions` menu holding exactly those verbs.
3. A `Refresh`-class control renders as an icon button with an accessible name, never as a menu item, and is
   not counted towards the two-or-more rule.
4. A page with utilities and no verbs renders them and no menu.
5. `New session` renders as a visible button.
6. No page renders an `Actions` menu containing one item.
7. `npm run verify`, `npm run ui:e2e` and `npm run ui:test` pass.

## Verification

| Gate      | Command           | Result                                     |
| --------- | ----------------- | ------------------------------------------ |
| UI unit   | `npm run ui:test` | 41 files, 445 passed                       |
| e2e       | `npm run ui:e2e`  | 68 passed (41.0 s)                         |
| Full gate | `npm run verify`  | 7/7 steps; 56 files, 796 passed, 6 skipped |

gate-run 2026-11-14T23:16:26.093Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

| Surface               | Mock                                         | sha256                                                             | Signer | Date       | Verdict |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/shepherding/roster` | `mockups/v2-shell/08-shepherding-roster.png` | `2e9b09252c198aeef1173f6a0852816e102aaecc50dc63a56a3096951ae938df` | owner  | 2026-11-14 | signed  |

The signed roster is the surface that shows the rule - one visible page verb, no menu, and a bare
refresh icon at the toolbar edge - so the round is recorded against it. The capture baselines are a
separate reviewed pass (backlog).

Mock coverage: claimed 0 · e2e-only 1 · deferred 0 · prose 0

## Mock parity

n/a - no mock changed.

## Review

Tier 2. The worker (`ollama-cloud/deepseek-v4.1-flash:1017`) implemented the rule across every call site;
the parent set the decisions, froze the diff and ran the gates; the reviewer seat is independent.

**Code review - ACCEPTED**, no blocking findings. It checked FR-9a page by page (one verb visible with its
label and no menu; two or more in one menu; utilities trailing and never counted; utilities-only with no
menu; `New session` visible), the accessibility of both shapes, the row's right edge and 860 px wrap, and
the tests - confirming the two rewritten `PageActions` cases would fail if the old rule returned, and that
the e2e changes **strengthened** the checks rather than weakening them (a menu click became a button click
plus an explicit "no `Actions` menu" assertion).

It raised two P2s, both the same defect seen twice, both fixed in the same round:

1. `kind` defaulted to `verb`, and 19 of 21 call sites are utilities - so omitting it silently produced a
   menu item. `kind` is now **required**; all 35 action objects across 21 call sites state it, and omitting
   it is a type error.
2. The classification predicate was written in both `PageFrame` and `PageActions`; it is now one exported
   `isVerb` used by both.

Seat: consistent - the Implementer row matches the split the reviewer read.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                                                  | Met | Evidence                                                                                       |
| --- | -------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------- |
| 1   | One verb renders as a `Button` with its label and no menu                  | yes | `PageFrame.dom.test.tsx`; `ShepherdingReportPage.dom.test.tsx`                                 |
| 2   | Two or more verbs render one `Actions` menu holding exactly those          | yes | `PageFrame.dom.test.tsx`; `PageActions.dom.test.tsx`                                           |
| 3   | A `Refresh`-class control is a trailing icon, never an item, never counted | yes | `PageFrame.dom.test.tsx`; `PageActions` "never renders a Refresh-class utility as a menu item" |
| 4   | Utilities only: rendered, no menu                                          | yes | "renders a utility alone as a named icon button and no menu"                                   |
| 5   | `New session` renders visibly                                              | yes | `UssdSimulatorPage` classification; e2e suite                                                  |
| 6   | No page renders a one-item `Actions` menu                                  | yes | e2e asserts the button and the absence of an `Actions` button on every one-verb page           |
| 7   | `verify`, `ui:e2e`, `ui:test` pass                                         | yes | gate-run line above                                                                            |

## Deviations

- **`Members` does not keep the menu.** The brief predicted it would; under FR-9a it has one verb plus the
  `Refresh` utility, so it renders a visible `Add member` button and no menu. The worker applied the rule
  over the brief, which is the right precedence. The pages that keep a menu are `MemberDetail` and
  `SeriesDetail`.
- **Two refresh entries had no icon** (`Refresh columns`, `Refresh`), so as bare icon buttons they would have
  rendered empty; both gained `ArrowClockwiseRegular`. No verb's handler, icon, label or disabled condition
  changed.
- **Two `PageActions` tests were rewritten, not deleted** - their premise ("keeps `Refresh` last", "separates
  the trailing group without a destructive verb") is the rule FR-9a drops. Every other assertion is kept.
- **The `PageActions` filter survives** as `actions.filter(isVerb)`: the component is exported, so it guards
  FR-9a for any caller that hands it a whole list, and two tests pin that. A required field cannot catch a
  runtime list.
- The count in the worker's first report ("20 pages carry `kind: 'utility'`") was 19; `UssdSimulatorPage`
  and `MemberDetailPage` have no utility, correctly.
