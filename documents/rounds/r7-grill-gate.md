# Round - r7-grill-gate

|                     |                                                                                 |
| ------------------- | ------------------------------------------------------------------------------- |
| Status              | OPEN                                                                            |
| Tier                | 1 - Plan                                                                        |
| Mode                | unattended (auto-accept recommendations)                                        |
| Base                | `6a64701`                                                                       |
| Review rounds       | 1 - protected-doc review of `documents/rounds/README.md`                        |
| Gate runs in parent | 1                                                                               |
| Spec                | `AGENTS.md` 2 and 17; `documents/rounds/README.md`                              |
| Workers             | `single`                                                                        |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (gate, tests, template, round doc) |

## Grill

1. **Should the per-round grill be enforced by the gate, or by discipline?** Recommendation: by the gate,
   as R7 in `check-round`. Cost: a new failure mode on every unattended round doc, and the risk that a
   section written to satisfy a regex is ritual rather than thought - which is why R7 demands a
   **recommendation and a cost**, the two parts a ritual answer tends to omit.
2. **Should the twelve merged rounds without a grill section be backfilled?** Recommendation: no. Writing
   those sections now would invent a record of a frontier nobody asked. Cost: the corpus is uneven, and a
   reader of those docs cannot tell a decision that was grilled from one that was not.
3. **Where does the section sit in the template, and what does it say?** Recommendation: immediately
   before `## Plan`, because the grill precedes the plan in time, and the template text names the three
   parts R7 checks. Cost: every existing template reader sees a new section first.

## Plan

The owner asked whether the repo's own rule - a grill with auto-accepted recommendations opening every
unattended round - was being followed. It was not: 3 of 15 round docs carried a decisions record, and the
rest took decisions (withdrawing claims, splitting rounds, dropping a picker) on the implementer's
judgement.

This round makes the rule mechanical, so the next round cannot repeat the gap.

### Scope

- `scripts/check-round.mjs` - **R7**: an unattended round doc must carry a `## Grill` section with at
  least one numbered question, each naming a recommendation and a cost.
- `tests/meta/check-round.test.ts` - three cases: no section fails; a question without either part fails;
  a complete one passes and an attended round is exempt.
- `documents/rounds/README.md` - the template and the rules list name the section (protected: reviewed).

Acceptance criteria:

1. An unattended doc without `## Grill` fails the gate.
2. A numbered question without a recommendation or without a cost fails it.
3. An attended doc is exempt.
4. This round's own doc satisfies R7, and so does every unattended round after it.
5. `npm run verify` passes.

## Verification

| Gate       | Command                                         | Result    |
| ---------- | ----------------------------------------------- | --------- |
| Guard unit | `npx vitest run tests/meta/check-round.test.ts` | 59 passed |
| Full gate  | `npm run verify`                                | 7/7 steps |

gate-run 2026-11-15T18:24:27.002Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

n/a - no mock and no surface changed.

## Mock parity

n/a - no claim changed.

## Review

| Round | Seat                                  | Verdict                                                                  |
| ----- | ------------------------------------- | ------------------------------------------------------------------------ |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | protected-doc review of the template and its rule; carried in the record |

Seat: consistent - the Implementer row names the parent, and the template's change is reviewed as a
protected document.

## Acceptance

| #   | Criterion                                   | Verdict  | Evidence                           |
| --- | ------------------------------------------- | -------- | ---------------------------------- |
| 1   | An unattended doc without the section fails | ACCEPTED | R7 case 1                          |
| 2   | A question missing either part fails        | ACCEPTED | R7 case 2                          |
| 3   | An attended doc is exempt                   | ACCEPTED | R7 case 3                          |
| 4   | This doc satisfies R7                       | ACCEPTED | `check-round` passes on it         |
| 5   | Gates pass                                  | ACCEPTED | 59 guard tests, `verify` signature |

## Deviations

- Tier 1: a gate rule, its tests and a protected template. No product code.
- The rule fires on the `Mode` row, which the corpus already carries, so it needs no new marker.
- The twelve merged rounds stay unbackfilled, deliberately: a reconstructed grill would be a fabricated
  record, which the last four rounds spent their time correcting.
