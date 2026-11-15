# Round - capture-in-round

|                     |                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                |
| Tier                | 1 - Plan (process)                                                                  |
| Mode                | attended (owner seated; no worker - two protected docs and their record)            |
| Base                | `9b1b74e`                                                                           |
| Review rounds       | 2 (deepseek-v4-pro 0813: PASS with nits, then PASS)                                 |
| Gate runs in parent | 1                                                                                   |
| Spec                | `AGENTS.md` sections 2 and 10a; `documents/rounds/README.md`; the 2026-11-15 grill  |
| Workers             | `single`                                                                            |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (two protected docs, the record, this doc) |

## Grill

1. **Should a surface change require its capture in the round?** Recommendation: yes, as a line rather than
   a ritual - a round that changes a user-visible surface names the surface's capture in its sign-off, and
   the reviewer reads it beside the mock. Cost: every UI round grows by a file and a review step.
2. **Where does the rule live?** Recommendation: the round template and the mock-build skill - the template
   because `check-round` R6 already reads that section, the skill because that is where a mock is made. Not
   `AGENTS.md`: section 14 already delegates mock procedure to the skill. Cost: one protected edit.
3. **Should it be a regex in `check-round`?** Recommendation: no. There is no mechanical surface-to-baseline
   map, and a guard that guesses fails honest rounds and teaches people to fake rows. Cost: the control is
   the reviewer's reading, which is the same control the Implementer row already relies on.

All three were the owner's answers at the 2026-11-15 grill ("all as recommended").

## Plan

Five defects in this release were invisible to code review, to `npm run verify` and to the test suite, and
visible only in a capture: a status pill over its own text, the raw RRULE in a schedule cell, a clipped
roster actions column, two columns FR-59a requires missing from the mock, and a page's single verb drawn as
a secondary button. The pack found them after every gate had passed. This round makes the picture travel
with the round.

### Scope

- `documents/rounds/README.md` (protected) - the Mock sign-off template gains a `Capture` column, and the
  rules list gains the capture-in-round rule.
- `.opencode/skills/mock-build/SKILL.md` (protected) - procedure step 12, and a pitfalls row naming the
  consequence.
- `documents/agents/protected-doc-reviews.json` - both entries re-recorded at the reviewed hashes.

Acceptance criteria:

1. A round that changes a user-visible surface names the surface's baseline beside the signed mock, and a
   sign-off with no capture is a `P1`.
2. The rule reaches the round template and the skill without giving the rule two full homes.
3. Both protected documents are reviewed by the seat on the exact landing text, and the hashes match.
4. `npm run verify` passes.

## Verification

| Gate          | Command                                                                     | Result          |
| ------------- | --------------------------------------------------------------------------- | --------------- |
| Protected set | `npx vitest run tests/meta/protected-doc-review.test.ts`                    | 7 passed        |
| Round doc     | `node scripts/check-round.mjs --files documents/rounds/capture-in-round.md` | 1 round doc, ok |
| Full gate     | `npm run verify`                                                            | 7/7 steps       |

gate-run 2026-11-15T23:15:09.938Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

n/a — no user-visible surface changed, and no mock was re-cut.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                         | Verdict  | Evidence                                                                 |
| --- | ------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| 1   | Surface change carries its capture, missing is P1 | ACCEPTED | `README.md` rules list and the template's `Capture` column               |
| 2   | One rule, two homes, no duplication               | ACCEPTED | the skill's step 12 points at the capture rather than restating the rule |
| 3   | Reviewed text is the landing text, hashes match   | ACCEPTED | the two record entries; the guard recomputes both hashes                 |
| 4   | `npm run verify` passes                           | ACCEPTED | gate-run signature                                                       |

## Deviations

- Two review rounds, which is the ceiling: the first returned `PASS with nits` plus two P2 wording faults -
  "without either" read as "a mock re-cut is enough", and the re-capture was described as moving the
  evidence to the drawing when it records the build. Both were fixed, then confirmed. The hash is of the
  confirmed text, not the first draft.
- The skill's pitfalls table was realigned by Prettier when a row was added. Formatting only, and the
  reviewer confirmed no content moved.
- A durable lesson is arguably owed to `documents/lessons.md` for the five-defect incident; the reviewer
  raised it as an observation, not a finding. Proposed in the reply, not written: section 10 says a lesson
  lands only when the owner accepts it.
