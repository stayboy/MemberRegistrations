# Round - Fluent UI first, and the React baseline

|        |                                                               |
| ------ | ------------------------------------------------------------- |
| Status | CLOSED                                                        |
| Tier   | 1 - Plan                                                      |
| Base   | `ddccfc9`                                                     |
| Spec   | `AGENTS.md` §15–§16, `documents/agents/component-first.md` §6 |
| Ticket | process work (owner direction, 2026-11-04)                    |

Provider: `ollama-cloud` (parent; protected-doc reviewer `deepseek-v4-pro:0813`).

## Plan

The owner reported that UI pages are built without Fluent UI components — raw elements where a Fluent
component exists — and asked for two additions to the repo instructions: **Fluent UI first, before raw
HTML**, and a **community React best-practice baseline**, with skill discovery starting at the
`awesome-copilot` skills catalogue.

What was found in the tree before writing the rule:

- The members grid already uses Fluent `Table` (`MembersPage.tsx:563`); there are **no** raw `<table>`,
  `<select>`, `<input>` or `<dialog>` elements anywhere under `ui/src`.
- The one raw `<button>` is `ErrorBoundary.tsx:47` — a legitimate exception, because the fallback must
  not depend on the component tree that just failed.
- The real gap is structural: pages compose `<section>`, `<div>`, `<ul>/<li>` and headings with
  `makeStyles` instead of Fluent `Card`, `Divider` and `Text` where those fit. That is where the rule
  bites, and it is a refactor for a ticket, not for this docs change.

Decisions:

- **AGENTS.md §16** (new, protected): Fluent component before any raw element; semantic landmarks,
  headings, lists and `form` stay HTML because their value is semantics, with Fluent `Label` for form
  labels; one component library; React correctness is `react.dev`'s **Rules of React** (Rules of Hooks
  enforced by `eslint-plugin-react-hooks`, Strict Mode on, purity and immutability as review
  obligations); skill discovery starts with the repo's own skills, then the `awesome-copilot` catalogue
  and `microsoft/skills`.
- **`component-first.md` §6**: the policy gains the same precedence ladder as its first rule, pointing
  at §16 for the non-negotiable, so the policy stays the detailed home.

Rejected: adopting `bulletproof-react` or another third-party architecture guide as a baseline — its
folder model would fight this repo's structure; the official Rules of React cover correctness, and the
repo's own component-first policy covers shape. Also rejected: a lint rule banning raw controls — the
rule would need a custom AST plugin to know which Fluent equivalents exist, and the review already
catches it.

Acceptance criteria:

1. `AGENTS.md` §16 states the precedence, the semantic exceptions and the React baseline.
2. The policy's §6 repeats the rule and defers to §16 for the non-negotiable.
3. Both protected docs carry a pro review of the final text and a matching recorded hash.
4. No code changes ride this round; the structural refactor is out of scope.

## Verification

| Gate                | Command                                                  | Result         |
| ------------------- | -------------------------------------------------------- | -------------- |
| Protected-doc guard | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass - 7 tests |
| Format              | `npm run format:check`                                   | pass           |

## Review

`deepseek-v4-pro:0813`, two passes.

- **First pass: ACCEPT** with two P2s and three nits. The P2s were applied: the discovery ladder now
  names the repo's own skills and installed skills before the catalogues (the owner's "point first at
  awesome-copilot" still holds for the catalogue search), and the React sentence no longer claims the
  plugin enforces all the Rules of React — it enforces the Rules of Hooks, with Strict Mode and review
  obligations covering purity and immutability. Nit fixes: `label` replaced by Fluent `Label` in the
  stays-HTML list, the `h1`–`h3` cap replaced by "real headings", and the policy's equivalents list
  stops duplicating §16.
- **Second pass: ACCEPT** — all five fixes verified in the final text, no regression, no cross-file
  contradiction.

## Acceptance

| #   | Criterion                                                                    | Met | Evidence                                 |
| --- | ---------------------------------------------------------------------------- | --- | ---------------------------------------- |
| 1   | §16 states the precedence, the semantic exceptions and the React baseline    | yes | `AGENTS.md` §16                          |
| 2   | The policy's §6 repeats the rule and defers to §16                           | yes | `documents/agents/component-first.md` §6 |
| 3   | Both protected docs carry a pro review of the final text and a matching hash | yes | guard 7/7; `protected-doc-reviews.json`  |
| 4   | No code changes ride this round                                              | yes | the diff is three docs and the record    |

Verdict: **ACCEPTED**.

## Deviations

- The rule is enforceable only by review today; a mechanical check would need a custom rule and is not
  worth it (see above).
- The structural refactor (sections and lists to Fluent `Card`/`Divider`/`Text`) is **not** started
  here; it belongs to a UI ticket with a visual diff.
