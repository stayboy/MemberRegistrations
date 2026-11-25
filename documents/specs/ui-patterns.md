# Spec — UI patterns

**Status:** **DRAFT for approval, 2026-11-25.** A pattern is behaviour — it decides what a surface must look like —
so this file takes the spec gate: owner approval, then a `0813` review of the exact text. It is **not** in the
`AGENTS.md` §10a protected set, deliberately: patterns are added more often than any other spec, and a hash record per
pattern would make the gate the bottleneck.

**Read this before drawing or building a repeated shape.** One row, grid, dialog or form region that recurs is a
pattern here; a shape that appears once is not a pattern and belongs in its own FR.

## What admits a pattern

An entry needs all four. Anything failing one is not a pattern:

1. **It recurs** — the shape appears on at least two surfaces. A design that names a shape nothing then builds does not
   admit it; criterion 4 settles that.
2. **It is grammar, not data** — it decides what control sits where, which element carries the navigation, what a
   dialog's footer holds. A rule about which fields exist, who may read them or how they are calculated is an FR and
   stays in its own spec. The test is a pair: _"the row's identity is a link"_ is grammar; _"the row's identity shows
   the member's name"_ is data. If a sentence would survive moving the field to a different surface, it is data.
3. **Nothing already owns it** — the shell contract (§4 of the UI spec), the mock-build skill's shell and drift values,
   `ui-date-time-formatting.md` and the data FRs own their own domains. Where one of them already rules, an entry here
   is a **pointer**, not a second copy.
4. **It has at least one live instance.** A pattern with no instance is speculation; the register records shapes that
   exist, it does not invent them.

## What every entry carries

`id` and title · the rule in one sentence · its **variants** · the **Fluent composition** (component, trigger,
accessibility contract: role, name, keyboard, focus return) · its **anti-patterns**, naming the shape it replaced ·
its **instances** (surface, FR/AC, claim id) · its **provenance** (round, date, owner ruling) · its **status**
(`current` / `superseded by P-n` / `retired (date, reason)`).

Images are never cited, not even for illustration: a mock is a git-ignored local artefact, so a drawn example would
not resolve for anyone else. The instance list is the checkable record.

## Who enforces what

Four layers, and none of them can prove a pattern was followed — only that it was cited:

| layer                            | owns                                                  | mechanism                                                          | exists today?        |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| spec owner                       | approving the pattern and its variants                | the spec gate (owner + `0813`)                                     | yes                  |
| round parent                     | recording the instances a round adds or changes       | the round doc's instance line                                      | yes                  |
| `tests/meta/mock-claims.test.ts` | the claim → pattern link                              | a `pattern` field on an atom, which must resolve to a heading here | **no — to be built** |
| the build                        | the shape itself                                      | one shared `RowActionsMenu` with a `dom` accessibility test        | **no — to be built** |
| the reviewer                     | that a changed surface's instances appear in the diff | review, not a test                                                 | yes                  |
| the mock image screen            | depiction only                                        | **advisory**, never cited as enforcement                           | yes                  |

Two rows are **targets, not facts**, and are marked so: no `pattern` field exists on a claim yet, and no
`RowActionsMenu` exists — `RowActionMenu` is local to `ShepherdingRosterPage.tsx`. Until they are built, the link and the
shape are enforced by review alone, and a reader must not believe otherwise.

## Retirement

Append-only. A pattern is **superseded** (a new variant replaces the grammar) or **retired** (the shape leaves the
product); the entry keeps its id so existing `pattern:` references still resolve, and the round that retires it
migrates every instance in the same change. A live surface citing a dead pattern is a defect — and it is a **review
obligation, not a mechanical one**: a retired entry keeps its id so old references still resolve, which means the meta
test cannot tell a stale citation from a current one.

---

## P-1 — Data row

**Status:** **proposed — awaiting the owner's approval and a `0813` pass on this file.** Nothing may cite it as
binding until then. **Provenance:** owner rulings 2026-11-13 (page trigger), 2026-11-25 (row shape, after the periods
landing page was re-cut three times for want of this entry).

**Rule.** A row in a data grid presents its **identity as a link** and its **row actions in a trailing icon-only menu**;
it never carries a separate `Open` control, and its menu never repeats the navigation the identity already provides.

**Variants.**

- **`navigational`** — the row has no dominant task verb: the identity links to the record and the trailing menu holds
  whatever secondary actions exist. When there are none, the menu **column is omitted** rather than drawn empty; an
  empty menu advertises actions that do not exist.
- **`primary-action`** — the row has one dominant task verb (the roster's `Log call`): that verb renders as a **visible
  button**, the trailing menu holds the rest, and the identity still links.

**Choosing between them.** One dominant task verb the officer performs _from the row_ → `primary-action`; otherwise
`navigational`. A verb that belongs to the page, not the row, is a page action and stays in the page's `Actions` button
(FR-9a).

**Fluent composition.** Identity: a Fluent `Link` (or the table's anchor) carrying the record's name. Trailing menu:
Fluent `Menu` with a `MenuTrigger` wrapping a Fluent `Button` whose content is an icon-only affordance — **an icon-only
trigger is correct at row scope** and forbidden at page scope (FR-9a). The trigger must expose `aria-haspopup` and, while
open, `aria-expanded`, both supplied by the Fluent trigger; a hand-set `aria-expanded="false"` is not added. Items are
Fluent `MenuItem`s; the destructive item follows a separator; focus returns to the trigger when the menu closes.

**Component.** `RowActionsMenu` in `ui/src/components/` — required, not optional: two hand-rolled row menus exist today
(`MembersPage.tsx`'s inline menu, `ShepherdingRosterPage.tsx`'s `RowActionMenu`), so `component-first.md` §2's second call
site has arrived. Its `dom` test **will assert** the accessibility contract above, not its appearance, once it exists.

**Anti-patterns.**

- a separate `Open` link at the row's end (retired: `EVA-NO-OPEN`);
- a text `Actions` trigger on a row (that is the page grammar, FR-9a);
- an empty kebab: a menu with no items must be omitted;
- duplicating the identity's navigation inside the menu.

**Instances.**

| surface      | FR / AC                                                                  | claim                                                                                         |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| events list  | FR-42a, AC-56                                                            | `EVA-ROW-MENU`, `EVA-NO-OPEN` (`mock-only`)                                                   |
| roster       | FR-59a, **AC-35a**                                                       | **no atom yet** — the overflow and `Log call` live in FR-59a only                             |
| members list | FR-29                                                                    | `ML-ROW-MENU` (`mock-only`: "each row ends in an overflow menu rather than a bare open icon") |
| periods list | `member-registrations-event-periods.md`, "Managing the period catalogue" | none yet — the admin surface is unapproved                                                    |

**Known gap.** The roster's `Log call` button is the `primary-action` variant and is **not yet** rewired to
`RowActionsMenu`; the extraction and rewire are owed by the next UI round, which records them in its plan.
