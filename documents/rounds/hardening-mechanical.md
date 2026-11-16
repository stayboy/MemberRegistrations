# Round - hardening-mechanical

|                     |                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                      |
| Tier                | 1 - Plan (config, ops script, mechanical reformat; no product behaviour)                  |
| Mode                | attended (owner seated; no worker)                                                        |
| Base                | `301adc3`                                                                                 |
| Review rounds       | 0                                                                                         |
| Gate runs in parent | 1                                                                                         |
| Spec                | the go-forward grill (2026-11-16); `AGENTS.md` section 7                                  |
| Workers             | `single`                                                                                  |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (gate wiring, drill script, reformat, round doc) |

## Grill

The go-forward grill was answered "all as recommended", with one override: **"cut the drifts and focus on
the MVP"**. That answer is why this round is the mechanical half of hardening and not all of it.

1. **Does hardening start before the sitting?** Recommendation: the sitting first, with 8f as a fork.
   The owner cut the drifts instead, which removes the fork: 8f is declared, not fixed, so nothing moves a
   picture and this round can run while the sitting is open. Cost: the release ships a page verb that reads
   as optional, named in the claim.
2. **One round or three?** Recommendation: three - mechanical, claim edges, shell. Cost: three PRs for five
   small items.
3. **Is the backup drill a script or a document?** Recommendation: a script, run once and dated, because a
   runbook nobody runs is a preference with a heading. Cost: it proves the procedure, not a destination, and
   no gate runs it.

## Plan

Two of the five hardening items, the ones that touch no screen.

### Scope

- `package.json` - `format:check` now runs `prettier --check .` **and** the UI workspace's own check, so the
  27 files that had drifted are caught from now on.
- `scripts/drill/backup.mjs` and `npm run drill:backup` - dump the local Compose database, restore it into a
  scratch database, compare four tables, drop the scratch copy, non-zero on any mismatch.
- 28 files reformatted by the UI's own config (mechanical, no behaviour).
- `documents/parity/comparison-pack.md` - 8f records the owner's ruling: declared, not fixed.

Acceptance criteria:

1. The UI workspace is inside `format:check`, and a drifted UI file fails the gate.
2. `npm run drill:backup` restores a dump into an empty database and compares row counts, failing on mismatch.
3. The reformat changes no behaviour: unit, DOM and e2e tests pass unchanged.
4. `npm run verify` passes.

## Verification

| Gate      | Command                        | Result                                                   |
| --------- | ------------------------------ | -------------------------------------------------------- |
| Drill     | `npm run drill:backup`         | PASS - 4 tables restored exactly in 3.1s (90.2 KiB dump) |
| Format    | `npm run format:check`         | both trees clean (27 UI files fixed by this round)       |
| Unit      | `npm --prefix ui run test`     | 440 passed                                               |
| DOM       | `npm --prefix ui run test:dom` | 74 passed                                                |
| Full gate | `npm run verify`               | 7/7 steps                                                |

gate-run 2026-11-16T00:06:45.760Z profile=full steps=7/7 lines=7 bytes=1226

## Mock sign-off

The 27 reformatted files include components behind captured surfaces, so R6 asks for a row. No surface
**rendered** a change: the diff is whitespace, and every baseline under `ui/e2e/baseline/` is byte-identical
to `main` (none appears in this round's change set).

| Surface                             | Mock                                         | Capture                                              | sha256                                                             | Signer     | Date       | Verdict                 |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------------------- |
| officer roster (reformatted source) | `mockups/v2-shell/08-shepherding-roster.png` | `ui/e2e/baseline/shepherding-roster.png` (unchanged) | `098a2999ccf4e380b17228e6ce9b984d19887b08cf39e49b013722770b8a0647` | unattended | 2026-11-16 | auto-signed (unchanged) |

Mock coverage: claimed 1 · e2e-only 0 · deferred 0 · prose 0

## Mock parity

n/a — no mock change, and no rendered change. The pack's 8f row records the owner's ruling that the drift
ships as a named difference.

## Acceptance

| #   | Criterion                         | Verdict  | Evidence                                                          |
| --- | --------------------------------- | -------- | ----------------------------------------------------------------- |
| 1   | The UI is inside `format:check`   | ACCEPTED | `format:check` chains the workspace check; 27 drifted files fixed |
| 2   | The drill restores and compares   | ACCEPTED | the run above; a mismatch exits non-zero                          |
| 3   | The reformat changes no behaviour | ACCEPTED | 440 unit and 74 DOM pass without test edits                       |
| 4   | `npm run verify` passes           | ACCEPTED | gate-run signature                                                |

## Deviations

- The item was larger than it read. The root check silently passed `ui/` because `.prettierignore` lists
  `ui/`, and the workspace's own `format:check` disagreed with 27 files - so "the UI is outside the gate"
  had been hiding real drift, not merely a missing line.
- The drill runs against a thin local stack (1 member; three of the four probed tables empty). It prints
  that note rather than pretending the tables prove data, and it fails only when **every** table is empty,
  because two empty databases matching proves nothing.
- 8f is **cut, not fixed**, on the owner's instruction. The claim names it; the code does not change.
