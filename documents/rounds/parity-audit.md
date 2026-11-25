# Round - parity-audit

|                        |                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                           |
| Tier                   | 1                                                                                |
| Mode                   | `attended` (the owner accepted the twelve parity questions "all as recommended") |
| Base                   | `786d735`                                                                        |
| Review rounds          | 0                                                                                |
| Gate runs in parent    | 0                                                                                |
| Spec                   | `member-registrations-ui.md`, `ui-patterns.md`                                   |
| Workers                | `single`                                                                         |
| Implementer            | parent ollama-cloud/deepseek-v4.1-flash:1017 (docs, specs, catalogue)            |
| Verbs this round needs | `branch, commit, push, pr, merge`                                                |

## Grill

One `grill-flash` round, answered "all as recommended". Its inventory is the reason the round exists: **21 signed, 6
paired with a capture, 3 with a capture but no pairing, 10 with no capture, 11 signed states with no claims** - and at
image level none of the 21 demonstrably matches. The twelve answers are recorded here and in the specs.

1. **What "matches" means.** Both a probe set and a whole-image read, with every visible control claimed or annotated.
2. **A signed state names a capture.** `baseline` non-null becomes a precondition of `signed`; an uncapturable state is
   `target`.
3. **`01-events-list`.** AC-55 is amended to AC-50's one-verb rule; the drawing is re-cut and `EVA-ROW-MENU` withdrawn.
4. **`06-record-headcount-dialog`.** AC-61 names the shared dialog's `Visitors` mode, not a chip row; the chip atom is
   withdrawn and the dialog stays shared with the USSD console.
5. **The detail's grammar.** `22`'s top half is adopted, `02`'s occurrence table kept, and `22` re-cut.
6. **`03/04/05`** are pruned as drawings of a retired surface.
7. **`19-event-edit-standalone`** becomes `target`: a standalone event's dates are managed from the detail (FR-42b
   amended); the occurrence write is backlogged.
8. **The four targets** are signature debt, not parity rows.
9. **The parity pack is hash-guarded**, and its events rows marked stale.
10. **Order**: spec contradictions, then the detail grammar, then the capture-and-pair pass.
11. **One parity-audit round** (this one), then one UI round per surface; every round doc carries a per-state table
    (state, hash, capture + hash, mechanism, verdict) and **R6 requires a capture** in the sign-off row.
12. **P-1 is approved**, the extraction deferred to the first round that needs a row menu.

## Plan

This round settles the contradictions and the ledger; it changes no product code.

- **specs**: AC-55 gains AC-50's one-verb rule and retires the menu clause; AC-61 names the shared dialog's `Visitors`
  mode; FR-42b makes a standalone event's edit date rows read-only; `ui-patterns.md` is approved and P-1 is `current`.
- **catalogue**: `EVA-ROW-MENU` and the headcount chip atom are withdrawn; `03/04/05` are pruned; `19` drops to
  `target`; the pairings that exist are recorded.
- **the next slice** (Q9 and Q11): the parity pack's hash guard and its stale rows, the per-state table and R6's
  capture requirement. They are a separate round because each changes a protected document (`rounds/README.md`) or a
  meta test, and this one is already the ledger surgery - the order the owner accepted puts them after the detail
  grammar, not beside it.

Acceptance criteria:

1. No signed state's drawing contradicts a spec clause it cites (the `01` menu and the `06` chips are resolved).
2. The catalogue asserts no control the specs withdrew (the events-list menu, the headcount chip row).
3. Gates green; no product code touched.
4. The next slice is named (parity pack guard, per-state table, R6 capture rule) rather than silently dropped.

## Verification

| Gate                          | Command                                                                                  | Result    |
| ----------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| format, lint, typecheck, test | `npm run verify:fast`                                                                    | pass 4/4  |
| meta                          | `tests/meta/mock-claims.test.ts`, `parity-claim.test.ts`, `protected-doc-review.test.ts` | 92 passed |

gate-run 2026-11-25T20:14:12.139Z profile=fast steps=4/4 lines=4 bytes=717

## Git writes

| Brief | Actor | Verb | Variant | Reason |
| ----- | ----- | ---- | ------- | ------ |

## Mock sign-off

n/a - this round withdraws and prunes claims; it draws and builds nothing.

## Mock parity

| Claim | Type | State | Answer (max prob) | Threshold | Confirmed by | Disposition |
| ----- | ---- | ----- | ----------------- | --------- | ------------ | ----------- |

## Acceptance

| Criterion                                       | Met | Evidence                                                                                                                       | Verdict  |
| ----------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| No signed drawing contradicts a clause it cites | yes | AC-55 aligned to AC-50 and FR-42/FR-42a propagated; AC-61 names the shared `Visitors` mode; `EVA-ACTIONS` re-anchored to AC-50 | ACCEPTED |
| No claim asserts a withdrawn control            | yes | `EVA-ROW-MENU` and `AD-HC-DIALOG` withdrawn; `AD-HC-VISITOR` reworded to the Mode control                                      | ACCEPTED |
| Gates green; no product code touched            | yes | `verify:fast` 4/4; two API flakes passed in isolation and on the re-run                                                        | ACCEPTED |
| The next slice is named                         | yes | the parity pack guard, the per-state table and R6’s capture rule are recorded as the next round                                | ACCEPTED |

## Deviations

- **Tier 1 parent-authored:** this round is documents only - no product code - so the parent wrote it and the diff is
  reviewed rather than built.
- The inventory's "never compared" verdicts are recorded as such rather than smoothed; the capture pass that closes
  them is a later round by the owner's order (Q10).
