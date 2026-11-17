# Round — seat-health-and-budget

|                        |                                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                       |
| Tier                   | 1 (governing documents; protected → pro review)                              |
| Mode                   | `attended`                                                                   |
| Base                   | `067befd`                                                                    |
| Review rounds          | 2 (pro review, then the confirmation)                                        |
| Gate runs in parent    | 1                                                                            |
| Spec                   | n/a — process; the ride-along correction is the contacts FR-78 amendment     |
| Workers                | `single`                                                                     |
| Implementer            | parent opencode/deepseek-v4.1-flash-free (policy, seats, README, seat files) |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                      |

`git-seat-budget: 12 briefs` — declared at open under the rule this round replaces, with the
arithmetic: 1 branch + 2 commits (the uncommitted contacts correction, then this fix) + 1 push + 1 pr

- 1 merge + 1 sync = 7 briefs, leaving 5 for probe/retry headroom.

## Seats

| Seat                   | Picked (local)   | Window  | Class          | Candidate probed                                              | Basis                                  |
| ---------------------- | ---------------- | ------- | -------------- | ------------------------------------------------------------- | -------------------------------------- |
| Grill-me (round 1)     | 2026-11-17 06:25 | outside | `grill-flash`  | `ollama-cloud/deepseek-v4.1-flash:1017` — answered            | outside the window, ollama-cloud first |
| Grill-me (round 2)     | 2026-11-17 06:31 | outside | `grill-flash`  | same candidate — answered                                     | same day, probe holds                  |
| Pro review (protected) | 2026-11-17 06:52 | outside | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813` — answered                | first choice outside the window        |
| Confirmation           | 2026-11-17 06:56 | outside | `reviewer-pro` | same candidate — answered                                     | the single permitted confirmation pass |
| Git executor           | 2026-11-17 07:0x | —       | `git-executor` | `opencode/beam-free` — the branch brief is this round's probe | one dispatch serves as the day's probe |

## Grill

Two grill-me rounds on 2026-11-17, both answered "all as recommended". The subject: the
`git-seat-budget` mechanism, after a day in which three declarations were needed, one arrived after its
round had begun, two branches had to be cut by the parent, and two briefs were refused on wording.

1. **Spend, not consent.** A standing default of 12 briefs per round; the owner may lower it or raise
   it; `0` parks. **Cost:** one protected paragraph; an ordinary round can spend twelve metered briefs
   before the owner sees a number, so the per-write table becomes the after-the-fact record.
2. **Verbs declared at open.** The round doc lists the verbs it needs, so the owner's go names them and
   the brief quotes an approval containing the verb. **Cost:** a template row and a brief-shape field.
3. **Meter briefs, publish the arithmetic.** **Cost:** the same paragraph; "verb" stops meaning
   different work in different rounds.
4. **Branch from a round-doc-only dirty tree.** **Cost:** one line per seat file; any other dirty path
   still refuses.
5. **Every write names its actor.** **Cost:** a template table; a bypass becomes a visible row rather
   than a Deviations footnote.
6. **One retry on `shell-permission-denied`.** **Cost:** two lines per seat file; never after a refusal.
7. **Default is per round (12).** **Cost:** none beyond Q1; no second, milestone-scoped pool.
8. **Probe seat health once per round.** **Cost:** one dispatch per class per day; a dead model is not
   retried all day, a recovered one returns tomorrow.
9. **Three candidates per class, metered last.** **Cost:** an honest gap — only one _free_ git executor
   exists, so the second and third rungs are metered.
10. **Classes in the protected text, models in `seats.json`.** **Cost:** one protected pass now; a model
    rename costs one unprotected line afterwards — except the reviewer class, whose first candidate
    stays pinned by §10a.
11. **Replace after too many failures.** Twice in a day ⇒ substitution recorded + mapping edit; two
    consecutive days ⇒ the owner decides. **Cost:** a sentence; without it, replacing a dead model
    stays folklore.
12. **`0` survives; docs-only commits use the same brief shape.** **Cost:** one clause; a short brief
    would need its own refusal rules, which is how the wording refusals happened.

## Plan

Goal: a round no longer pays for the same dead model all day, and no longer needs the owner to retype a
number before git can move.

1. `documents/agents/orchestrator-policy.md` — the seats table becomes four capability classes; two new
   paragraphs (classes + the mapping, with the §10a pin; seat health probed once per round, with the
   replacement threshold); the git-executor paragraph gains the 12-brief default with its arithmetic,
   the verbs declaration, the dirty-tree branch exception, the actor column requirement and the denial
   retry; the window prose and the reviewer paragraph move to classes.
2. `AGENTS.md` — §9's git-executor bullet states the class, the default cap, the verbs declaration and
   the actor rule; §17's grill-me and worker bullets move to classes (§10a keeps its deliberate model
   pin).
3. `documents/rounds/README.md` — the template gains a `Verbs this round needs` row, a `## Seats`
   section and a `## Git writes` table with an `Actor` column and the arithmetic line.
4. `documents/agents/seats.json` — the class→model mapping, three candidates per class, the metered
   rungs last, per-class `probedAt`, and the honest note that only one free git candidate exists.
5. `.opencode/agents/git-executor.md` and `git-executor-fallback.md` — the verbs-or-round-doc brief
   source, the branch exception, the single denial retry, and the fallback file no longer calling rung 2
   the end of the ranking (operational; no review owed).
6. The reviewed contacts correction (seven files) rides as this branch's first commit.
7. `documents/agents/protected-doc-reviews.json` — fresh hashes and attestations for the three protected
   files, written after the review.

Acceptance criteria:

1. The twelve decisions are in the text, and no protected file hard-codes a model id outside §10a's pin
   and the 0813 output-limit note.
2. `protected-doc-reviews.json` carries a fresh hash and an attestation for each of the three protected
   files this round edited.
3. `npm run verify` green, including `tests/meta/protected-doc-review.test.ts`.

## Verification

| Gate                   | Command                                                  | Result                                                                |
| ---------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Protected-doc tripwire | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass - 7/7, the three re-recorded hashes match the reviewed text      |
| Full gate              | `npm run verify`                                         | pass - skill, check-round, format, lint, typecheck, test, build (7/7) |
| Skill hashes           | `npm run verify:skill`                                   | pass - seat model-id resolution skipped (opencode CLI unavailable)    |

gate-run 2026-11-17T06:58:51.126Z profile=full steps=7/7 lines=7 bytes=1025

## Review

Seat: the pro review (protected document) ran twice on `ollama-cloud/deepseek-v4-pro:0813`, outside the
window. First pass **REWORK** with two P1s and four P2s — the git-executor paragraph was unreadable (a
line break inside the arithmetic code span, eight spans without their spaces), and the classes section
silently unwound §10a's named pin of the reviewer seat's first candidate; the P2s were protected prose
still naming model ids, a "twice in a day" threshold contradicting the once-per-round probe, singular
"the metered one last" against two metered git rungs and a fallback file ending the ranking, and a
template with no Seats section. All ten were fixed; the confirmation closed every finding and returned
**ACCEPT with no P1, P2 or nit**.

Review record: "Confirmed the protected-document change to AGENTS.md, documents/agents/orchestrator-policy.md
and documents/rounds/README.md (plus the new documents/agents/seats.json mapping): the re-typeset
git-executor paragraph is stable and readable with every inline code span intact, all twelve prior
findings are closed, no protected text hard-codes a model id outside the §10a pin (deepseek-v4-pro 0813
/ mimo-v2.6-pro) and the deepseek-v4-pro:0813 output-limit note, and the fixes introduce nothing new —
ACCEPT."

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                                                                                                                         |
| ----- | --------------------- | ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `parent`              | branch | -                              | the seat's `branch` precondition refuses a tree carrying this round's thirteen files; the owner's Q4 exception covers only the round doc and is not in force until this commit |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | the contacts correction, seven files                                                                                                                                           |
| 3     | `git-executor rung 2` | commit | same                           | this fix                                                                                                                                                                       |
| 4     | `git-executor rung 2` | push   | same                           | -                                                                                                                                                                              |
| 5     | `git-executor rung 2` | pr     | same                           | -                                                                                                                                                                              |
| 6     | `git-executor rung 2` | merge  | same                           | after `verify`, `ui` and `ui-e2e` are green                                                                                                                                    |
| 7     | `git-executor rung 2` | sync   | same                           | -                                                                                                                                                                              |

Seven of the twelve declared briefs; the seat's probe is brief 1's dispatch under the old rule, and the
rung-2 fallback reason is this round's own rule in practice: `opencode/beam-free` answered "Free usage
limit reached" on 2026-11-16 and again at 17:04 that day.

## Mock sign-off

n/a — no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                                                      | Evidence                                                                   | Verdict  |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------- |
| 1   | Twelve decisions in the text; no stray model id outside §10a and the 0813 note | policy, AGENTS.md and rounds/README.md diffs; `seats.json` carries the ids | ACCEPTED |
| 2   | Fresh hash + attestation for each of the three protected files                 | `documents/agents/protected-doc-reviews.json`; tripwire 7/7                | ACCEPTED |
| 3   | `npm run verify` green including the protected-doc test                        | `gate-run 2026-11-17T06:58:51.126Z profile=full steps=7/7 ...`             | ACCEPTED |

## Deviations

- **The parent cuts this round's branch.** Q4's exception permits `branch` only when the sole dirty path
  is the round's own document; this tree carries thirteen files (the seven-file contacts correction plus
  the six policy files) and the exception is not in force until this commit lands. Recorded as brief 1's
  `parent` row above, which is the column this round also introduces.
- **The protected-doc review was dispatched before the hashes existed**, in the only order §10a allows:
  edit → review → re-record. `tests/meta/protected-doc-review.test.ts` failed on the stale hashes
  between those steps - the tripwire working, not a defect.
- **Two seat files changed without a review**, as §10a intends: `.opencode/agents/git-executor.md` and
  `git-executor-fallback.md` are operational, not governing.
- **A seat-file/policy drift surfaced on first use.** The policy now makes the 12-brief default apply
  with no owner-typed line, but the fallback seat file still demanded a literal `git-seat-budget:`
  line, so the first commit brief of this round was refused (`REFUSED: no git-seat-budget`). The seat
  file now states the default and keeps its mechanical check (`0` parks; a missing amount still
  refuses), and every brief of this round carries the literal amount. The pro review read the seat
  files as context only — they are operational — which is why it did not catch the drift; the refusal
  did.
