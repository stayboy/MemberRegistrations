# Round - parity-guard

|                        |                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                             |
| Tier                   | 1                                                                                  |
| Mode                   | `attended` (the owner's "all as recommended" on the parity grill, then "continue") |
| Base                   | `126f447`                                                                          |
| Review rounds          | 0                                                                                  |
| Gate runs in parent    | 0                                                                                  |
| Spec                   | `documents/parity/comparison-pack.md`, `documents/rounds/README.md`                |
| Workers                | `single`                                                                           |
| Implementer            | `parent ollama-cloud/deepseek-v4.1-flash:1017 (pack guard, README)`                |
| Verbs this round needs | `branch, commit, push, pr, merge`                                                  |

## Grill

The parity grill's Q9 and Q11, answered "all as recommended":

9. **The parity pack is hash-guarded**, and its stale rows marked.
10. **The per-state table** and the rule that a sign-off row names a capture.

## Plan

Two changes, both about making a parity claim checkable rather than rhetorical.

- **the pack's hashes are checked against the catalogue** by a meta test, because the images are git-ignored and CI
  cannot hash them; a row whose drawing moved must say **stale** instead of keeping a hash.
- **`documents/rounds/README.md` gains the per-state table** and states that a sign-off row names a capture.

Acceptance criteria:

1. A pack row can no longer claim a hash the catalogue does not record for that drawing - it fails the test.
2. A row that cannot be checked is marked **stale** with a reason, not left claiming.
3. `rounds/README.md` defines the parity table, `never compared` as a legal verdict, and the capture rule.
4. Gates green.

## Verification

| Gate                          | Command                                          | Result   |
| ----------------------------- | ------------------------------------------------ | -------- |
| format, lint, typecheck, test | `npm run verify:fast`                            | pass 4/4 |
| pack guard                    | `npx vitest run tests/meta/parity-claim.test.ts` | 9 passed |

gate-run 2026-11-25T22:20:37.115Z profile=fast steps=4/4 lines=4 bytes=917

## Git writes

| Brief | Actor | Verb | Variant | Reason |
| ----- | ----- | ---- | ------- | ------ |

## Mock sign-off

n/a - this round draws and builds nothing.

## Mock parity

| Claim | Type | State | Answer (max prob) | Threshold | Confirmed by | Disposition |
| ----- | ---- | ----- | ----------------- | --------- | ------------ | ----------- |

## Acceptance

| Criterion                                                    | Met | Evidence                                                                            | Verdict  |
| ------------------------------------------------------------ | --- | ----------------------------------------------------------------------------------- | -------- |
| A pack row cannot claim a hash the catalogue does not record | yes | the guard compares each row to the catalogue state's `mock.sha256`; row 2 failed it | ACCEPTED |
| An uncheckable row says **stale** with a reason              | yes | rows 2 and 19 marked stale (hash moved; no catalogue state records the drawing)     | ACCEPTED |
| The README defines the parity table and the capture rule     | yes | the `## Parity` section, sharpened after review                                     | ACCEPTED |
| Gates green                                                  | yes | `verify:fast` 4/4; pack guard 9 passed                                              | ACCEPTED |

## Deviations

- **R6's capture requirement is stated in the README, not yet enforced in `check-round.mjs`.** Enforcing it would fail
  the historical round docs whose sign-off rows predate the rule, so the gate change needs a migration story of its own;
  the rule is written down now so every new round follows it, and the mechanical check is backlogged.
