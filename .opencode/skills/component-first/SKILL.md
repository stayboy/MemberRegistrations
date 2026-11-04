---
name: component-first
description: Use when adding or changing a UI surface under ui/ (React 19 + Fluent UI v9) — decides when repeated JSX becomes a component, where it lives, and when to keep markup inline. Triggers: a new React component, repeated dialogs/tables/toolbars, a second call site, a design or spec names a component, "extract this", "reuse that", "avoid duplicating this JSX".
---

# Component-first reuse — procedure

The repository policy is `documents/agents/component-first.md`, and the non-negotiables are `AGENTS.md`
§15. Read them first; this skill only runs the procedure and never restates the definitions.

## Procedure

1. **Inventory before writing.** Look in `ui/src/components/`, `ui/src/pages/`, and the Fluent UI
   primitives. If the shape already exists (`PageFrame`, `ContactsDialog`, `Dialog`, `Table`, `Badge`,
   `Tooltip`, `MessageBar`), reuse or compose it. Do not wrap a primitive to restyle it.
2. **Count call sites.** Search the JSX you are about to write against the repo (`grep` the distinctive
   class/structure). One call site with no planned second stays inline; the second call site is the
   trigger.
3. **Decide.** Extract when the policy's trigger fires; otherwise record the reason in the round doc
   ("single call site; no second planned" or "two of the three costs; kept as JSX").
4. **If extracting:**
   - Put cross-page components in `ui/src/components/`, page-local ones in `ui/src/pages/`.
   - Add a doc comment naming **every call site** and the spec/AC it implements.
   - Keep presentational props to primitives or wire types; `className` for parent sizing; no page state.
   - Name the test ids and the accessibility contract (role, label, keyboard). A dialog needs an
     accessible name, a close path and focus handling.
   - A feature component (own query/state) is allowed only for a dialog or a route; say so in the doc
     comment.
5. **Wire both call sites in the same change.** Do not leave a "second call site next round" unless the
   design committed it and the round doc records it.
6. **Verify.** `npm --prefix ui run test`, `build`, `lint`, `typecheck`; no duplicated JSX remains and
   the changed surfaces still pass the ticket's states.
