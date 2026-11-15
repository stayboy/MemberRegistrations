# Round - lesson-admission

|                     |                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                              |
| Tier                | 1 - Plan                                                                                          |
| Mode                | unattended (auto-accept recommendations)                                                          |
| Base                | `c0f3073`                                                                                         |
| Review rounds       | 1 - protected-doc review PASS (three P2)                                                          |
| Gate runs in parent | 1                                                                                                 |
| Spec                | `documents/lessons.md` (admission); `AGENTS.md` section 10                                        |
| Workers             | `single`                                                                                          |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (lesson preamble, research notes, record, round doc) |

## Plan

The owner ruled that **a lesson which is a consequence of a technical failure must not be admitted**, and
that **every proposed lesson first takes a `grill-me` round** weighing durable rule against note. This
round writes that rule into the file that lessons enter through.

The proposition it refuses is the typecheck-lanes one: a rule derived from a single build failure. It is
kept as a **note** in `documents/research/`, with its evidence and its own overstatements recorded.

### Scope

- `documents/lessons.md` - the **Admission** preamble paragraph.
- `documents/agents/protected-doc-reviews.json` - the re-recorded hash and the review's attestation.
- `documents/research/typecheck-lanes.md` - headed as a note, not a lesson.
- `documents/research/clef-lesson-durability.md` - the CLEF investigation.

Acceptance criteria:

1. The file states both halves of the ruling - failure-consequence is a note, and the grill round is mandatory.
2. The distinction is decidable by a later round without re-arguing.
3. The typecheck proposition is recorded as a note and does not enter the lessons file.
4. The protected-doc guard passes on the exact landed text.
5. `npm run verify` passes.

## Verification

| Gate           | Command                                                  | Result    |
| -------------- | -------------------------------------------------------- | --------- |
| Protected docs | `npx vitest run tests/meta/protected-doc-review.test.ts` | 7 passed  |
| Full gate      | `npm run verify`                                         | 7/7 steps |

gate-run 2026-11-15T16:57:24.720Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

n/a - no mock and no surface changed.

## Mock parity

n/a - no claim changed.

## Review

| Round | Seat                                  | Verdict                               |
| ----- | ------------------------------------- | ------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | PASS - no blocking findings; three P2 |

The P2s: the wording said the grill's recommendations were "auto-accepted" where the owner wrote
"auto-recommendations" (aligned to the owner's words); `documents/research/` as the note home is an
interpretation to confirm; and the mandatory-grill pointer belongs in `AGENTS.md` section 10 as well,
which is a follow-up because that file needs its own protected round.

Seat: consistent - the Implementer row names the parent, the reviewer seat stands outside the author, and
the record carries the reviewed hash.

## Acceptance

| #   | Criterion                            | Verdict  | Evidence                                                                                                                                         |
| --- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Both halves of the ruling are stated | ACCEPTED | the Admission paragraph's two steps                                                                                                              |
| 2   | The distinction is decidable         | ACCEPTED | "does this change how the next piece of work is judged, or only explain a failure"; the reviewer offered the sharper "from now on, when X, do Y" |
| 3   | The typecheck proposition is a note  | ACCEPTED | `documents/research/typecheck-lanes.md` head; it is absent from the lessons file                                                                 |
| 4   | The guard passes on the landed text  | ACCEPTED | 7 protected-doc tests                                                                                                                            |
| 5   | `npm run verify` passes              | ACCEPTED | gate-run signature above                                                                                                                         |

## Deviations

- Tier 1: one protected file, two research notes and the record. No code.
- The reviewer's second P2 - that the mandatory grill belongs in `AGENTS.md` section 10 too - is carried
  rather than done, because that file needs its own protected round and the same commit cannot hold two
  independent reviews.
- `documents/research/` as the home for a note is the parent's reading of "note this"; the owner can move
  it without touching the rule.
