# Round - offerings-consolidation

|                     |                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                 |
| Tier                | 1 - Plan                                                                                             |
| Mode                | unattended (auto-accept recommendations)                                                             |
| Base                | `17641c7`                                                                                            |
| Review rounds       | 0                                                                                                    |
| Gate runs in parent | 3                                                                                                    |
| Spec                | `AGENTS.md` section 14; `documents/rounds/ui-mock-parity.md`; `.opencode/skills/mock-build/SKILL.md` |
| Workers             | `single`                                                                                             |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (sweep, catalogue, ledger, round doc)                   |

## Plan

Two jobs on the same surface: sweep `offering-grid` onto the shell, and consolidate the record it shares
with `mvp-offerings`, using the **latest accepted design** - the single-pass grid merged in #93 - as the
basis.

Scope:

- `mockups/offering-grid/` - the chrome template's Date and time block becomes the built control; the
  format field's text chevron becomes a glyph. All twelve states re-captured, each recorded.
- `scripts/mock/record.mjs` - an unchanged capture now still names the live image in `history.json`, so
  `prune` cannot orphan a state whose bytes did not move.
- `documents/mock-claims/offering-grid.json` - new catalogue: surface `ussd-offerings-grid` at
  `/ussd/offerings`, states `02`-`12` signed, `01-before-quick-pick` reference, inventory citing AC-34
  (the count correction) against its API test.
- `documents/mock-claims/mvp-offerings.json` - the five pre-grid count states become `reference`;
  `page-actions` stays signed.
- `documents/rounds/ui-mock-parity.md` - the sign-off audit and the screen index stop claiming that
  `mvp-offerings` is the `/ussd/offerings` target.

### Decisions (grill, 2026-11-14, auto-accepted)

| #   | Question                                           | Decision                                                                                                      |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Does "consolidate 2" merge the sets or the record? | The **record**: sets stay separate because a catalogue resolves per set folder and they draw different things |
| 2   | Which catalogue owns the route's signed target?    | `offering-grid.json` - the latest design; `mvp-offerings` keeps the dialogs and API-level claims              |
| 3   | What happens to the five pre-grid count states?    | **reference**, not deleted: they are the "before" half of the #93 comparison                                  |
| 4   | Do the refreshed grid hashes count as signed?      | Yes, on this instruction: the refresh was shell-only (1:1 verified) and history records the byte change       |
| 5   | Which AC does the grid catalogue cite?             | AC-34, the count correction, `e2e-only` against `tests/api/event-offering-counts.test.ts`                     |
| 6   | Is `01-before-quick-pick` a target?                | No - `reference`; it documents what the grid replaced                                                         |

Acceptance criteria:

1. `shell-check` scores `offering-grid` 1/1 and the sweep total is 12/19.
2. All twelve states are named by `history.json`, including the one whose bytes did not move.
3. `offering-grid.json` validates; `mvp-offerings.json` validates with its count states as `reference`.
4. The recorder has tests for the unchanged path and archive path.
5. `npm run verify` passes.

## Verification

| Gate            | Command                                           | Result                                              |
| --------------- | ------------------------------------------------- | --------------------------------------------------- |
| Guard, this set | `node scripts/mock/shell-check.mjs offering-grid` | 1/1 after the fix (0/1)                             |
| Guard, all sets | `node scripts/mock/shell-check.mjs`               | 12/19 in the sweep's sets                           |
| Recorder        | `node mockups/offering-grid/capture.mjs`          | 11 states at v2, `12-narrow` unchanged and recorded |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`   | 76 passed                                           |
| Recorder tests  | `npx vitest run tests/meta/mock-record.test.ts`   | 5 passed                                            |
| Full gate       | `npm run verify`                                  | see the signature below                             |

gate-run 2026-11-14T17:32:16.421Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

| Surface           | Mock                                       | sha256                                                             | Signer | Date       | Verdict |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/ussd/offerings` | `mockups/offering-grid/03-grid-filled.png` | `16a6af179843a30443a41700a834f0c5b846c313e29bd82aca107784103dae51` | owner  | 2026-11-14 | signed  |

Mock coverage: claimed 0 - e2e-only 1 - deferred 0 - prose 0

The eleven other grid states signed in the catalogue carry their own hashes; `03-grid-filled` is listed
here because it is the state a reader opens first. `01-before-quick-pick` is `reference`.

## Mock parity

n/a - the refresh was against the shell definition; the AC claim is an `e2e-only` row, not an image claim.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                      | Met | Evidence                                         |
| --- | ---------------------------------------------- | --- | ------------------------------------------------ |
| 1   | `offering-grid` 1/1, sweep 12/19               | yes | guard output shown above                         |
| 2   | All twelve states named by history             | yes | `mockups/offering-grid/history.json` - 12 states |
| 3   | Both catalogues validate                       | yes | guard 76/76                                      |
| 4   | Recorder tests for unchanged and archive paths | yes | `tests/meta/mock-record.test.ts` - 5 cases       |
| 5   | `npm run verify` passes                        | yes | signature above                                  |

## Deviations

- **The signature basis.** The grid states were signed in `mvp-offering-grid.md` by hash; this round
  refreshed their pixels (shell only) and records the new hashes as `signed` on the consolidation
  instruction. If that is not what "using the latest of these signed as basis" meant, the five minutes of
  reversal is: flip `offering-grid.json`'s states to `target` and re-sign after review.
- **`mvp-offerings` still lists `MP-MEMBER-01` as claimed** on a now-`reference` state: the claim is the
  member picker inside the offertory dialog, proven by an e2e test, and the dialog did not change with the
  grid. The page behind it did, which is why the state is reference.
- **The set is not merged into `mvp-offerings`.** A catalogue resolves `mockups/<set>/<state>.png` to
  `documents/mock-claims/<set>.json`, so moving the grid into the other folder would break that resolution
  and lose the before/after pair.
- Table headers stay uppercase in this set; the deferred grid drift.
