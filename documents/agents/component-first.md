# Component-first reuse policy (UI)

**Status:** ADOPTED 2026-11-04 (owner instruction; adapted from the School-Collab policy).
**Owner:** every surface under `ui/` (React 19, Vite, Fluent UI v9).
**Relates to:** `AGENTS.md` §15, `documents/specs/member-registrations-ui.md`,
`.opencode/skills/component-first/SKILL.md` (the procedure).

---

## 1. The policy in one paragraph

**Prefer a component over repeated markup.** When the same visual or interaction pattern appears — or is
about to appear — in more than one place, extract it as a named component rather than copying JSX,
because a component makes the call site read as intent (`<ContactsDialog … />`) instead of structure
(`<Dialog><DialogSurface>…`). Extraction is **not** unconditional: it must earn its keep, it must never
be speculative, and a component that fetches its own data or owns application state is a **feature**
component, not a presentational one. When the cost is likely to outweigh the gain — a list row rendered
hundreds of times, a single call site with no planned second — advise the owner against it with the
reason, rather than extracting anyway.

---

## 2. When to extract (the trigger)

Extract at the **second** occurrence, not the first:

| Trigger                                                                                            | Extract?                      | Why                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| The pattern is in **≥2 call sites** today                                                          | **Yes**                       | Repetition is the only evidence that a shape is stable.                                             |
| A **design (mock) or spec** names the surface                                                      | **Yes, after approval** (§4)  | The design already treats it as a unit; copying it by hand guarantees drift.                        |
| **≥2 call sites are planned in the same round**                                                    | **Yes**                       | The second call site is committed work, not a guess.                                                |
| **One** call site, no second in sight                                                              | **No**                        | Speculative abstraction carries props nobody uses and changes shape when the second caller arrives. |
| The shape is **already a shared primitive** (`PageFrame`, `ContactsDialog`, a Fluent UI component) | **Reuse it — do not wrap it** | A wrapper is a second name for the same box; compose the primitive instead.                         |

A **CSS class or a formatting helper** is not a component: four uses on one surface are still one call
site. Extract a component only when the call sites are separate surfaces with the same semantics.

---

## 3. Where it goes

| Reach                                               | Location                          | Requirements                                                                                                                                   |
| --------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-page (the shell, a dialog used by two routes) | `ui/src/components/`              | A doc comment naming **every call site** and the spec/AC it implements; props are primitives or the API's wire types — no page-specific state. |
| One page only, genuinely not reused                 | inline in `ui/src/pages/`         | State the reason in the round doc ("single call site; no second planned").                                                                     |
| Page-local but large and self-contained             | a sibling file in `ui/src/pages/` | Same naming and doc-comment rule.                                                                                                              |

A component **must not** be created in `ui/src/components/` to serve one page "for symmetry". Symmetry
is not a call site.

---

## 4. Approval gate for design- and spec-named components

A component that exists because a **mock or a spec** named the surface goes through the same gate the
mock does:

1. **Grill round first.** The component's shape, name, parameter set and call sites are put to the owner
   in one numbered round with recommendations — never decided inside implementation.
2. **The mock draws its states** (rest / empty / blocked / dense) and the viewport, because a component's
   contract is invisible in prose.
3. **The round doc records** the name, every prop with its call site, the test ids it owns, and its
   accessibility contract (role, labels, keyboard).
4. **Two-call-site rule at birth.** A design-named component may start with one implemented call site if
   the design commits a second in the same or the next round; otherwise the owner grants an exemption.

---

## 5. The cost side — when to advise against a component

React gives three real costs. Each is a reason to **report and recommend against**, with the reason:

1. **Render cost in lists.** A component rendered once per row re-renders on every list state change.
   Memoize (`React.memo`) only after measuring; a static cell is often plain JSX. The honest test is a
   render count in the browser (React DevTools profiler), not intuition.
2. **Styling reach.** Griffel/`makeStyles` class names do not cross a component boundary: a parent cannot
   style a child's root. Every shared component that a parent will size must expose a `className` prop, a
   documented CSS variable, or compose the layout itself.
3. **Indirection.** A component that calls `useQuery`, `useSession`, or owns side effects is a feature
   with a lifecycle. That belongs to a page, a route, or an explicitly named feature component (a dialog
   that fetches its own data is the sanctioned case), never to a "reusable presentational" component.

**Advice rule.** If two of those three are present, recommend **against** extraction and name the
alternative (plain JSX, a local helper, or a class) with the reason.

---

## 6. Fluent UI rules

- **Compose, do not wrap.** Use `Dialog`, `Table`, `Button`, `Badge`, `Tooltip`, `MessageBar`,
  `SearchBox`, `Dropdown` directly. Do not create `AppDialog`/`AppButton` wrappers to restyle them.
- **Tokens, not literals.** `makeStyles` + `tokens` from `@fluentui/react-components`; no third-party UI
  library and no raw colours.
- **One box language.** Cards, dialogs, page frames and toolbars reuse `PageFrame` and the Fluent
  primitives; a new box shape is a component decision (§2), not a CSS decision.
- **Test ids** for interaction seams (`data-testid`) only where ticket 19's Playwright gate needs them.

---

## 7. Current call sites

| Component                                             | Call sites                  | Note                                                                                    |
| ----------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| `PageFrame`                                           | every routed page           | The shell's page header/breadcrumb slot; do not duplicate it.                           |
| `ContactsDialog`                                      | members list, member detail | Extracted at the second call site; a feature component that fetches the detail on open. |
| `MembersPage` / `MemberDetailPage` / `MemberFormPage` | one route each              | Pages, not components; they own queries and state.                                      |

---

## 8. What this policy does not do

- It does not mandate a design-system rewrite or a component library.
- It does not create a CI gate: extraction is a judgement call, and a lint rule cannot see a call site
  that does not exist yet. The mechanical parts (a component in `components/` with no call site) are
  review findings, not build failures.
- It does not restate the UI spec; where the two meet, the spec's contract wins.
