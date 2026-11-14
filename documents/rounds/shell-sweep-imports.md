# Round - shell-sweep-imports

|                     |                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                 |
| Tier                | 1 - Plan                                                                                             |
| Mode                | attended                                                                                             |
| Base                | `cd2dae4`                                                                                            |
| Review rounds       | 0                                                                                                    |
| Gate runs in parent | 4                                                                                                    |
| Spec                | `AGENTS.md` section 14; `documents/rounds/ui-mock-parity.md`; `.opencode/skills/mock-build/SKILL.md` |
| Workers             | `single`                                                                                             |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (guard, sweep, mock, round doc)                         |

## Plan

First set of the approved shell sweep, plus the two guards the grill approved, so the sweep is measured
rather than eyeballed.

Scope:

- **`scripts/mock/shell-check.mjs`** - the guard. It answers one question about a mock's HTML: does it
  carry the whole shell (top bar; section head with a collapse control; submenu; Date and time above
  Appearance)? It also catches the wrapper trap: an ancestor of `<main>` that reuses a `mock.css` class
  whose rule sets typography, alignment or colour. It is a checker, not a generator - mocks stay
  hand-written HTML with no build step.
- **`scripts/mock/record.mjs`** - the recorder. Captures to a temporary file, reports `unchanged` when
  the bytes match the live image, and otherwise archives the superseded PNG and appends
  `{ version, at, sha256, change }`. A capture nobody changed is not a version.
- **Shared shell CSS** - the date/time control and the shell's field and switch move from the roster's
  page-local styles into `mockups/mvp-offerings/mock.css`, so every mock can carry them without copying
  CSS. `mockups/` is git-ignored; the move was proved neutral by re-capturing the roster byte-identically.
- **`mockups/v2-imports/`** - the four attendance screens gain the collapse control and the real
  Date and time / Appearance controls, replacing prose. Brand casing follows the shell.

Acceptance criteria:

1. The guard names each missing region and fails a mock that is missing one.
2. The guard fails a page wrapper that reuses `.state` or `.screen`, and passes a layout-only wrapper.
3. `tests/meta/mock-shell-check.test.ts` covers both, with an explicit stylesheet (the real one is
   git-ignored, so CI never reads it).
4. The recorder returns `unchanged` for a byte-identical capture and appends no version.
5. `v2-imports` scores 4/4 on the guard; the four screens differ from the archived capture **only** in
   the shell.
6. `npm run verify` passes and the new tests run inside it.

## Verification

| Gate            | Command                                              | Result                                      |
| --------------- | ---------------------------------------------------- | ------------------------------------------- |
| Guard, v2-shell | `node scripts/mock/shell-check.mjs v2-shell`         | 1/1 - the roster is the reference           |
| Guard, imports  | `node scripts/mock/shell-check.mjs v2-imports`       | 4/4 after the fix (0/4 before)              |
| Guard, all sets | `node scripts/mock/shell-check.mjs`                  | 1/19 in the sweep's sets (the roster only)  |
| Recorder        | `node mockups/v2-shell/capture-roster.mjs "..."`     | `unchanged` - the CSS move changed no pixel |
| Recorder        | `node mockups/v2-imports/capture-attendance.mjs`     | four states recorded at v2, v1 archived     |
| Guard tests     | `npx vitest run tests/meta/mock-shell-check.test.ts` | 14 passed                                   |
| Full gate       | `npm run verify`                                     | see the signature below                     |

gate-run 2026-11-14T14:22:35.425Z profile=full steps=7/7 lines=7 bytes=854

The 1-in-19 baseline is the finding: nineteen mocks in the sweep's sets render no collapse control or a
text-only footer, which is a wider gap than the round that reported "19 of 20".

## Mock sign-off

n/a - no user-visible surface changed; this round repairs review artefacts, not the product.

## Mock parity

n/a - the mocks were refreshed against the shell definition, not against a spec; the set has no claim
catalogue, so nothing is re-signed.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                                       | Met | Evidence                                                           |
| --- | --------------------------------------------------------------- | --- | ------------------------------------------------------------------ |
| 1   | Guard names each missing region                                 | yes | `tests/meta/mock-shell-check.test.ts` - 6 missing-region cases     |
| 2   | Guard fails `.state`/`.screen` wrappers, passes layout wrappers | yes | same suite - 3 wrapper cases                                       |
| 3   | Tests pass an explicit stylesheet                               | yes | `CSS` fixture; `checkShell` reads the file only via its local CLI  |
| 4   | Recorder reports `unchanged` and appends no version             | yes | roster re-capture printed `unchanged (sha256 2e9b0925...)`         |
| 5   | `v2-imports` 4/4 and differs only in the shell                  | yes | guard output; 1:1 sidebar comparison against `_archive/v2-imports` |
| 6   | `npm run verify` passes with the new tests                      | yes | signature above                                                    |

## Deviations

- **Tier 1, not Tier 2.** No product behaviour, wire contract or migration changes; the new code is local
  mock tooling with unit tests. The guard's rules are enforced by its own suite rather than a reviewer.
- **Table headers stay uppercase in this set.** `mock.css`'s `th` is uppercase 11 px; the v2-shell design
  (captured from Fluent) is sentence case 12 px. The roster overrides it, the other sets do not. That is a
  grid drift, not a shell drift, so it is recorded here and belongs to the next pass rather than this one.
- **Only `v2-imports` is swept.** The other five sets remain at the baseline the guard now measures.
- The page head of `v2-imports` has no breadcrumb; the shell captures and the roster do. Out of scope for
  a shell round and recorded for the same next pass.
