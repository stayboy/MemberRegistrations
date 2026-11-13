# Round — mvp-page-actions

| Status              | CLOSED                                                    |
| ------------------- | --------------------------------------------------------- |
| Tier                | 2                                                         |
| Mode                | unattended (auto-accept recommendations — owner)          |
| Base                | `d8bfc4f`                                                 |
| Review rounds       | 1                                                         |
| Gate runs in parent | 3                                                         |
| Spec                | `documents/specs/member-registrations-ui.md` (D12, FR-9a) |
| Workers             | single                                                    |
| Implementer         | worker cline-pass/cline-pass/deepseek-v4.1-flash-1017     |

**Seat.** Tier 2, so the parent did not author the implementation: the worker above wrote every line of
`ui/**`, and the parent integrated, ran the gates, cut the mock and wrote this record.

## Plan

Every page's **action-row** verbs move into one `Actions` menu at the right edge of the breadcrumb row;
filters, date windows and view switches stay visible. The contract is FR-9a, settled with the owner over
four rounds of rulings and two review passes before any code was written:

| Decision (owner, 2026-11-13)                                                                                                         | Recorded in FR-9a as                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A page action is a verb on the page's action row that acts on the page or its collection                                             | the scope sentence, with the MUST scoped to that row so body, row and message-bar controls stay put |
| The trigger is a text `Actions` button, not a kebab ("kebab dots are too not visible")                                               | the trigger sentence, which bans an icon-only trigger by name                                       |
| `Save`/`Cancel` are not page actions ("main page action buttons like these do not apply")                                            | the commit/cancel carve-out, role-based so their labels can change                                  |
| `Refresh` is a page action even when it is the page's only verb                                                                      | the one-item-menu sentence (D12 already allowed it)                                                 |
| Ordering: create-side, edit-side, separator, destructive, `Refresh` last                                                             | the ordering sentence                                                                               |
| `Back` is navigation and stays visible, left of the menu                                                                             | the `Back` clause                                                                                   |
| Filters stay visible, never inside or right of the menu                                                                              | harmonised with D8, so they may sit on the row's left or on their own row                           |
| At ≤ 860 px the menu stays right-aligned and wraps below the breadcrumb                                                              | the wrap clause                                                                                     |
| Misfit verbs placed by function: import → create-side, contacts → edit-side, `Purge` last destructive, `New session` → refresh-class | the placement sentence                                                                              |

**Shape.** `PageActions` composes Fluent `Menu`/`MenuTrigger`/`MenuPopover`/`MenuList`/`MenuItem`/
`MenuDivider` over a Fluent `Button` — the shape `AccountMenu`, `DateTimeMenu`, `TopNav` and
`ThemeControl` already use. That is now a repo rule as well as the spec: `AGENTS.md` §16 gained the
owner's "the Fluent component comes before a rewrite" bullet during this round, with a hand-built
equivalent a blocking (P1) finding.

`PageFrame` gains `actions?: readonly PageAction[]` and `controls?: ReactNode`; the breadcrumb row spans
the content width (breadcrumb, controls, menu at the right edge) with the title and connection badge on
the next row.

## Verification

gate-run 2026-11-13T17:14:35.409Z profile=full steps=7/7 lines=7 bytes=1054

| Gate                            | Result                                |
| ------------------------------- | ------------------------------------- |
| `npm run verify`                | **7/7** (signature above)             |
| root suite (`.gates/test.log`)  | **743 passed / 6 skipped / 52 files** |
| `npm --prefix ui run test`      | **442 passed / 41 files**             |
| `npm --prefix ui run test:dom`  | **33 passed / 5 files** (was 24 / 2)  |
| `npm --prefix ui run typecheck` | clean                                 |
| `npm --prefix ui run lint`      | clean                                 |
| `npm run ui:e2e`                | **68 passed** (43.3 s)                |
| `npm --prefix ui run build`     | clean                                 |

Three gate runs in the parent. The first two failed on `format` for reasons that were mine, not the
worker's: `documents/specs/member-registrations-ui.md` and `documents/mock-claims/mvp-offerings.json` were
unformatted when the worker started (outside its writable scope, correctly refused), and this record itself
was unformatted after it was written. Formatted, then the full gate above.

The discriminating runs are recorded in the review below: removing `disabled={action.disabled}` from
`PageActions` turned the mirroring case red (`aria-disabled` expected `"true"`, received null), a hand-set
`aria-expanded={false}` turned the closed-state case red, and swapping `MembersPage`'s array to `Refresh`
first turned the ordering case red. Each was restored and re-run green.

## Review

Tier 2, one round. Reviewer: window seat `mimo-v2.6-pro` on `ollama-cloud` between 12:00 and 18:00 local
(`cline-pass` refuses that id with model-not-found on a registry-active listing — recorded fallback).
Implementer: `cline-pass/cline-pass/deepseek-v4.1-flash-1017`. The parent integrated, ran every gate, cut the
mock and wrote no implementation code.

Seat: consistent — the worker wrote every line under `ui/**`, the window pro seat reviewed the frozen diff
without authoring, and the parent's only code-adjacent actions were the spec, the mock, the catalogue and
the round doc.

**Verdict: ACCEPTED**, no blocking findings, six P2s. Criterion by criterion: FR-9a conformance PASS,
layout PASS, trigger PASS, mirroring PASS, ordering PASS, `Back` PASS, form pages PASS, divider PASS,
`controls` slot PASS, §16 PASS, tests FINDINGS, smuggled behaviour PASS. The reviewer spot-checked ten call
sites for drift and found none: every `disabled` expression and handler body is byte-identical to the
button it replaced, and every `Refresh` keeps its `*.isFetching` condition.

| P2                                                                                                                         | Disposition                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The closed-state assertion (`not.toHaveAttribute('aria-expanded', 'true')`) passes when the attribute is absent            | fixed, but **not** as briefed: Fluent's `MenuTrigger` omits `aria-expanded` while closed, so the test now pins the **absence**, which is stricter (it fails on `"false"`, `"true"` or any stray value) |
| The divider fixture used `[Refresh, Archive, Purge]`, an order FR-9a forbids, and nothing pinned call-site ordering        | fixed: spec-legal fixtures, a `keeps Refresh last, after the destructive group` case, and a `MembersPage` call-site ordering test                                                                      |
| `destructive`'s doc comment said "last in the list" while `Refresh` is last                                                | fixed: it names the trailing destructive group                                                                                                                                                         |
| `openActions`'s doc said it returns the item; it returns `void`                                                            | fixed in the comment: no caller uses a return value                                                                                                                                                    |
| A stale `build: "0813"` on the `component-first.md` record, belonging to the deepseek reviewer rather than the window seat | fixed: the field is absent, matching the `AGENTS.md` entry (the window seat publishes no build id)                                                                                                     |
| The `controlsTrailing` rule lived only in this ephemeral document                                                          | fixed in the spec: FR-9a now says remaining header controls keep the trailing edge when a page renders no menu                                                                                         |

**The fix pass found a spec defect, not just a test nit.** The brief said to assert `aria-expanded="false"`; the
worker ran it, it failed, and the reason is in the library: `@fluentui/react-menu` sets
`'aria-expanded': !open && !isSubmenu ? undefined : open`, so the closed state is the attribute's **absence**.
Hand-setting `"false"` would have contradicted FR-9a's own "supplied rather than hand-wired" clause — and §16
makes a hand-wired trigger a blocking finding. FR-9a's trigger clause was therefore **corrected**, and a
hand-set `aria-expanded="false"` is now explicitly forbidden, because it would fight the library's state. The
test documents the platform's real behaviour instead of a value the library never sets.

The three discriminating runs, each restored and re-run green: removing `disabled={action.disabled}` from
`PageActions` failed the mirroring case (`aria-disabled` expected `"true"`, received null); adding
`aria-expanded={false}` to the trigger failed the closed-state case; swapping `MembersPage`'s array to
`Refresh` first failed the ordering case with the diff the reviewer predicted (`- "Add member"`).

## Mock sign-off

| Surface        | Mock                                        | sha256                                                             | Signer | Date       | Verdict |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| ussd-offerings | `mockups/mvp-offerings/03-page-actions.png` | `8b27b520ffd883c6e684a4c06b05e1496802c2fa0485dc1806fcd73704151a64` | owner  | 2026-11-13 | signed  |

Mock coverage: claimed 0 · e2e-only 0 · deferred 0 · prose 0

The state carries no decision-probe entries: it is shell chrome (where the menu sits and what it holds),
not a decision screen a model scores. Its contract is asserted in the DOM and e2e lanes instead.

## Mock parity

n/a — no decision-probe screen ran. The layout the mock fixes (breadcrumb row, `Actions` at its right
edge, filters still visible) is what the frame now renders; the one regression the mock caught during the
round is recorded under `## Deviations`.

## Acceptance

| #   | Criterion                                                                                                    | Verdict | Evidence                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One `Actions` menu per page with verbs, at the right edge of a breadcrumb row spanning the content width     | **met** | `PageFrame`'s `actionRow` (full width, `flexWrap`) with the menu pinned by `marginInlineStart: auto`; 21 menus across 23 sites                                         |
| 2   | Filters, date windows and view switches stay visible and never enter the menu                                | **met** | `OfferingsPage` quick ranges + `DateWindowControl` moved to `controls`; `MembersPage`/`SeriesListPage` body toolbars and the shepherding/events date windows untouched |
| 3   | The trigger is Fluent's `MenuTrigger` over a `Button` labelled `Actions`, disclosure supplied by the library | **met** | `names the trigger Actions and opens a menu`; the closed state pins the attribute's **absence**, which is what Fluent renders                                          |
| 4   | Items mirror the replaced button's name, icon and disabling condition                                        | **met** | `disables Refresh while the roster query is in flight and enables it after`; the reviewer compared ten call sites and found no drift                                   |
| 5   | Ordering: create-side, edit-side, separator, destructive, `Refresh` last; `Purge` last of destructive        | **met** | `keeps Refresh last, after the destructive group`; `MembersPage action menu > renders its verbs in FR-9a order`                                                        |
| 6   | `Back` stays visible outside the menu                                                                        | **met** | `Back to events` / `Back to series` travel through `controls`, left of the menu                                                                                        |
| 7   | Form pages render no menu and keep their commit/cancel pair visible                                          | **met** | `MemberFormPage`/`SeriesFormPage` pass `controls` and no `actions`; `PageActions` returns null                                                                         |
| 8   | A page with no verb action renders no menu                                                                   | **met** | `renders no trigger for a page with no verb action`; `ImportBatchesPage`, `SettingsPage`, `NotFoundPage`, `PlaceholderPage` have none                                  |
| 9   | `verify` green; the DOM lane grows; e2e keeps its count                                                      | **met** | gate-run signature above; 442 / 41 UI, 33 / 5 DOM, 68 e2e                                                                                                              |

Verdict: **ACCEPTED** — the review accepted with no blocking findings, all six P2s are closed, and the
mock is signed.

## Deviations

- **The mock caught the frame's first mistake.** Anchoring the menu to the narrow heading block put it
  over the page title. The frame now spans the breadcrumb row across the content width, which is what the
  signed mock shows; FR-9a records the requirement rather than leaving it to the CSS.
- **`controls` takes the trailing edge when a page has no menu.** A form's commit/cancel pair has to keep
  the position it had, and the settled frame has no third slot. The review found this rule living only in
  this document, which is ephemeral, so it was **promoted into FR-9a**: a page with no menu keeps its
  remaining header controls at the trailing edge, and a control never moves merely because a page has no
  verbs.
- **The divider rule is derived, not declared.** `PageAction` exposes only `destructive`, so the component
  draws the divider before the first destructive item, or before the final item of a multi-item list when
  there is none. FR-9a's ordering implies that divider; the interface does not state it, and adding a
  field to the settled interface to say so would be a larger change than the round needs.
- **`Add member` is no longer a link.** It was `as="a" href`; a Fluent menu item is not an anchor. The
  handler now calls `navigate('/members/new')`, the same SPA route. Recorded because the DOM shape changed,
  not just the surface.
- **`Contacts · n` stayed a table-row control.** The worker briefly moved it into a page menu and reverted:
  FR-9a scopes the MUST to the action row, and a row control is not one.
- **`EventDetailPage` has no `Archive`/`Restore`.** The round brief listed one; the code has none, and the
  worker reported it instead of inventing a verb.
- **e2e baselines are now stale.** The shared header changed, so `ui/e2e/baseline/*.png` no longer matches.
  Regenerating committed binaries is a reviewed capture pass, not a side effect of this round; the backlog
  row about the stale baseline set already covers it.
