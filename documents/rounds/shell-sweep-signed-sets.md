# Round - shell-sweep-signed-sets

|                     |                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                 |
| Tier                | 1 - Plan                                                                                             |
| Mode                | attended                                                                                             |
| Base                | `14c6e85`                                                                                            |
| Review rounds       | 0                                                                                                    |
| Gate runs in parent | 2                                                                                                    |
| Spec                | `AGENTS.md` section 14; `documents/rounds/ui-mock-parity.md`; `.opencode/skills/mock-build/SKILL.md` |
| Workers             | `single`                                                                                             |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (sweep, recorders, round doc)                           |

## Plan

The last two sets in the sweep, and the only two whose catalogues hold signed states. Six `headcount`
screens and three `mvp-offerings` screens gain the shell; every capture is recorded; the four signed
states whose bytes changed become a **signing request** rather than a silent re-record.

Scope:

- `mockups/headcount/` - six screens: the collapse control where missing, **eight submenu icons**
  (Codes, Registrations, Clocking, Headcount, Offerings count, Activities, Products, Claims), and the
  real Date and time / Appearance controls in place of prose.
- `mockups/mvp-offerings/` - `01` and `02` gain the date control; `03-page-actions` loses the `.state`
  annotation wrapper (it was insetting and muting the page), gains the `.brand` wrapper and the
  Date and time block.
- All four recorders move onto `recordMock` + `checkShell`, so a capture that fails the shell never
  writes a PNG.

Acceptance criteria:

1. `shell-check` scores `headcount` 6/6 and `mvp-offerings` 3/3; the sweep total is **19/19**.
2. Every state is recorded through `recordMock`, with the prior image archived.
3. The four signed states' new hashes are handed to the owner as a signing table; the catalogues keep
   the signed record until that signature arrives.
4. `npm run verify` passes.

## Verification

| Gate             | Command                                           | Result                             |
| ---------------- | ------------------------------------------------- | ---------------------------------- |
| Guard, headcount | `node scripts/mock/shell-check.mjs headcount`     | 6/6 (was 0/6)                      |
| Guard, offerings | `node scripts/mock/shell-check.mjs mvp-offerings` | 3/3 (was 0/3)                      |
| Guard, all sets  | `node scripts/mock/shell-check.mjs`               | **19/19** in the sweep's sets      |
| Recorders        | four scripts                                      | 14 headcount + 27 offerings states |
| Catalogue guard  | `npx vitest run tests/meta/mock-claims.test.ts`   | 76 passed                          |
| Full gate        | `npm run verify`                                  | see the signature below            |

gate-run 2026-11-14T18:11:24.036Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

Pending. Four states changed pixels; their catalogues still carry the hashes of the images the owner
signed, and this round does not re-record them.

| Set / state                  | PNG                         | sha256 (new)                                                       |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------ |
| `headcount/live`             | `10-capture-state.png`      | `c58d01e70e6936e6f0d866931642627c5e6798a1fed5ea902ad190ca9c44f5ba` |
| `headcount/ended`            | `13-headcount-ended.png`    | `a139dc760cc3f8698fa597f5c717fd1279184f14be750b469895da8cdaf0c4af` |
| `headcount/not-live`         | `14-headcount-not-live.png` | `15b27e4f73c457d478d93eaf51333da1bc46cc779e8ac393d894307935659a00` |
| `mvp-offerings/page-actions` | `03-page-actions.png`       | `56ed50ccae71bc2b09a515693fad9b768877de14db09e6ad0e6b6eaaa09fd355` |

Mock coverage: claimed 0 - e2e-only 0 - deferred 0 - prose 0

The coverage line is zero because this round adds no catalogue rows; it changes the bytes four signed
states point at.

## Mock parity

n/a - shell refresh, no spec claim changed.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                     | Met | Evidence                                  |
| --- | --------------------------------------------- | --- | ----------------------------------------- |
| 1   | headcount 6/6, mvp-offerings 3/3, sweep 19/19 | yes | guard output                              |
| 2   | Every state recorded through `recordMock`     | yes | four recorders, archives under `_archive` |
| 3   | The four new hashes handed over as a table    | yes | `## Mock sign-off` above                  |
| 4   | `npm run verify` passes                       | yes | signature above                           |

## Deviations

- **The four signed states are refreshed but not re-signed.** Their catalogues keep the pre-sweep
  hashes, so the recorded hash no longer matches the file until the owner signs the table above. The
  alternatives were worse: `signed` would assert a signature nobody gave, and `target` is rejected by
  the guard for `not-live`, which carries a baseline pair.
- **`mvp-offerings` is only partly swept.** Its 22 states come from three HTML files; the rest are
  older captures of the same screens in states the sweep does not touch. Only the three sources were
  re-captured.
- **Table headers stay uppercase** in both sets; the deferred grid drift.
