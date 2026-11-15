# Round - claim-scope-lesson

|                     |                                                                                  |
| ------------------- | -------------------------------------------------------------------------------- |
| Status              | OPEN                                                                             |
| Tier                | 1 - Plan (process)                                                               |
| Mode                | attended (owner seated; no worker - one protected doc, its check and the record) |
| Base                | `282cd55`                                                                        |
| Review rounds       | 2 (deepseek-v4-pro 0813: REWORK, then PASS with nits; nits applied)              |
| Gate runs in parent | 1                                                                                |
| Spec                | `documents/lessons.md` Admission paragraph; the 2026-11-11 entry; the Q6 answer  |
| Workers             | `single`                                                                         |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (lesson, check, record, this doc)       |

## Grill

1. **Is the five-defect lesson durable?** Recommendation: **no - a note.** It is a consequence of defects
   that shipped past green gates, it duplicated the capture rule already enforced in the round template and
   the mock-build skill, and it was disqualified by the file's own 2026-11-11 entry, since the capture rule
   has no failing check. Cost: the incident keeps no narrative in the policy file; the rule and its evidence
   live where they are read.
2. **If it is a note, does it need a `documents/research/` file?** Recommendation: no - the pack tabulates
   the five defects and the template carries the rule; a fourth account has no index to lead anyone to it.
   Cost: the incident is read across three files, and the round doc is the ephemeral one.
3. **Is there a narrower rule that is adoptable beyond screens?** Recommendation: **yes, one** - a claim
   names its scope: what was compared and what was not. Cost: one more policy line, and it must be kept
   distinct from the 2026-11-04 gate-scope entry.

The owner answered "all as recommended": the proposal is a note, and the claim-scope rule lands.

## Plan

The grill found that the durable thing was not the incident but the discipline the parity pack had been
applying by hand: it could say "every row was compared" only because it also listed five surfaces it cannot
claim. Nothing enforced that sentence, and until the close the pack carried five `owed` rows with nothing
failing.

### Scope

- `documents/lessons.md` (protected) - the "A claim names its scope" entry, and the acceptance clause in the
  header paragraph recording that the rule was admitted and the incident was not.
- `tests/meta/parity-claim.test.ts` - the failing artefact the entry names: the pack must leave no row
  `owed` and must keep its "not claimable" list.
- `documents/agents/protected-doc-reviews.json` - the `lessons.md` entry re-recorded at the reviewed hash.

Acceptance criteria:

1. A claim of coverage, parity or verification names what was compared and what was not.
2. The rule names its failing artefact, and that artefact fails when the rule is skipped.
3. The entry stays distinct from the 2026-11-04 gate-scope entry and does not restate the capture rule.
4. `npm run verify` passes.

## Verification

| Gate          | Command                                                                       | Result          |
| ------------- | ----------------------------------------------------------------------------- | --------------- |
| Meta suite    | `npx vitest run tests/meta`                                                   | 177 passed      |
| Protected set | `npx vitest run tests/meta/protected-doc-review.test.ts`                      | 7 passed        |
| Round doc     | `node scripts/check-round.mjs --files documents/rounds/claim-scope-lesson.md` | 1 round doc, ok |
| Full gate     | `npm run verify`                                                              | 7/7 steps       |

gate-run 2026-11-15T23:47:31.067Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

n/a — no user-visible surface changed, and no mock was re-cut.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                   | Verdict  | Evidence                                                              |
| --- | ------------------------------------------- | -------- | --------------------------------------------------------------------- |
| 1   | A claim names what was and was not compared | ACCEPTED | the entry's Rule and Trigger; the acceptance clause in the header     |
| 2   | The rule names a check that can fail        | ACCEPTED | `tests/meta/parity-claim.test.ts` - three cases, one per failure mode |
| 3   | Distinct from the gate-scope entry          | ACCEPTED | the Rule says so in one sentence; the review confirmed it             |
| 4   | `npm run verify` passes                     | ACCEPTED | gate-run signature                                                    |

## Deviations

- The first draft failed its own rule. Its Evidence claimed the accessibility suite covers every route but
  `/connect`; the suite also audits `/ussd/offerings`, so the example made a false scope claim inside the
  entry about scope claims. The reviewer returned `REWORK`; the example was removed rather than repaired,
  because it was also pulling the entry back into gate-scope territory.
- The reviewer also refused the entry as it stood on the file's 2026-11-11 test - a rule with no failing
  artefact is a preference - so the check was written in this round rather than promised for a later one.
  It is narrow on purpose: it guards the release claim, which is an artefact, and the Trigger says plainly
  that every other claim stays the reviewer's control.
- The confirmation round caught one robustness fault - the check read the pack's status cell without
  stripping its bold markers, so a bolded `**owed**` would have slipped through. Fixed, and the third case's
  duplicate assertion removed.
