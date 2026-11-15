# Round - unattended-rules

|                     |                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                          |
| Tier                | 2 - Reviewed                                                                                                                                  |
| Mode                | unattended (auto-accept recommendations)                                                                                                      |
| Base                | `5301b89`                                                                                                                                     |
| Review rounds       | 3 - REWORK (4 P1, 3 P2), PASS on the fixes, PASS on the owner's clarification with one P2 adopted                                             |
| Gate runs in parent | 2 - red on the protected-doc hash before re-recording, green after                                                                            |
| Spec                | `AGENTS.md` (process), `documents/agents/orchestrator-policy.md`, `.github/merge-policy.md`                                                   |
| Workers             | `single`                                                                                                                                      |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (rules, policy, merge policy, catalogue schema, check-round, sign-unattended, record, round doc) |

## Plan

The owner's three answers: (1) "go unattended" carries the work to the MVP local milestone with
auto-accepted recommendations; (2) a mock may be auto-signed so a round can close; (3) auto-sign is
temporary, listed for a second look when the unattended work ends, and **never overrides a signature the
owner gave**.

The rules that make that legal, without weakening any existing gate:

1. **§17 standing unattended to a named milestone.** It states its own supersession of "for that round
   only"; §9 and the merge-policy Verb glossary both name the milestone scope in the same change, because
   the glossary alone would otherwise apply the narrower rule.
2. **§17 auto-signed is a third coverage value**, beside `signed` and `target`. It applies only to a
   `target`, is never the status quo, and never rewrites a state the owner signed. `signed` keeps its
   owner-only meaning in the policy and the mock-build skill.
3. **§17 completion report** says what a reader would notice: `git show --stat` plus one line per file
   group in product terms.
4. **§8 re-run budget**: two automatic re-runs per round in total; a third failure parks the round.
5. **Policy "Pre-flight for unattended rounds"**: four checkable conditions (spec approved, spec reviewed
   by the second seat, mocks signed or auto-signed, no catalogue hash differing from its recorded one - the
   check command reports zero and exits zero), plus the reviewer reads the named mock.

### Decisions (auto-accepted, unattended)

| #   | Question                                                  | Decision                                                                                                                                                                                      |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Does "unattended to a milestone" contradict §9/glossary?  | Yes, in the first draft. §17 now names the supersession and both other texts move in the same commit                                                                                          |
| 2   | Is `by: "unattended"` inside `coverage: "signed"` honest? | No - it redefines `signed`. `auto-signed` is its own coverage value, accepted by the schema, R6 and the tool                                                                                  |
| 3   | Can auto-sign replace an owner signature?                 | No. The tool refuses a `signed` state whose bytes moved: it reports `signed-but-stale` and exits non-zero. A refresh voids a signature through `target` first, and only the owner restores it |
| 4   | Is the fourth pre-flight condition decidable?             | Not as "current" - it is now "no state's file hash differs from its recorded hash", and the tool's exit code is the check                                                                     |
| 5   | Does a stale signed state deadlock an unattended round?   | No: a well-behaved refresh lands on `target` first. A signed-but-stale state is a deliberate hard stop whose remedy is an owner re-sign                                                       |

### Scope

- `AGENTS.md`: §8 one re-run rule, §9 milestone scope, §17 three bullets plus the transient-state clause.
- `documents/agents/orchestrator-policy.md`: `as signed`, the new pre-flight section, the second-look
  sentence.
- `.github/merge-policy.md`: the glossary row's scope.
- `scripts/round/mock-claims.mjs`: `COVERAGE` gains `auto-signed`; the error string names it.
- `scripts/check-round.mjs`: R6 accepts `auto-signed`; the error string names it.
- `scripts/mock/sign-unattended.mjs`: new tool - `--list` prints, the default applies, refuses `signed`.
- `documents/agents/protected-doc-reviews.json`: three re-recorded entries.

Acceptance criteria:

1. No two governing texts disagree about the scope of `go unattended`.
2. `signed` means the owner signed, everywhere, and no tool path rewrites a signed state.
3. `auto-signed` is accepted by the catalogue schema, R6 and the tool, and is listed at the end.
4. The pre-flight's four conditions are each a fact a script or a reader can check.
5. An unattended round cannot swap an owner signature for its own; it parks and says a re-sign is due.
6. The protected-doc guard passes on the exact text that landed.
7. `npm run verify` passes.

## Verification

| Gate              | Command                                                                              | Result                                                 |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Protected docs    | `npx vitest run tests/meta/protected-doc-review.test.ts`                             | 7 passed                                               |
| Round schema      | `npx vitest run tests/meta/check-round.test.ts tests/meta/mock-claims.test.ts`       | 130 passed                                             |
| Auto-sign dry run | `node scripts/mock/sign-unattended.mjs --list headcount offering-grid mvp-offerings` | would auto-sign: 0, unchanged: 15, signed-but-stale: 0 |
| Full gate         | `npm run verify`                                                                     | 7/7 steps; 58 files, 802 passed, 7 skipped             |

gate-run 2026-11-15T07:02:34.230Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

n/a - no user-visible surface. No mock file changed; the catalogue tooling changed, not the images.

## Mock parity

n/a - no surface claim changed. `v2-shell`, `headcount`, `mvp-offerings` and `offering-grid` remain
signed with 0 stale after the tool change.

## Review

| Round | Seat                                  | Verdict                                                                                                                                  |
| ----- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 4 P1 (milestone vs §9/glossary; auto-signed redefined `signed`; one-and-two re-run counts; hard gate lost the round name), 3 P2 |
| 2     | `ollama-cloud/deepseek-v4-pro` (0813) | PASS - all four P1 closed, all three P2 closed, no new blocking risk                                                                     |
| 3     | `ollama-cloud/deepseek-v4-pro` (0813) | PASS on the transient-state clause; no path rewrites a signed state; not deadlocking; one P2 (say "exits zero") adopted                  |

**Standards:** the change follows the repo's own form - every rule states its owner and date, the
supersession is explicit, and each new state has a schema and a guard that can disagree with it.
**Spec:** the three answers became three rules, and the review's four P1s were all fixed rather than
argued down, including the one that changed the design (`auto-signed` as its own value).
Seat: consistent - the Implementer row names the parent for every file, the Deviations section carries the
Tier 2 parent-authored reason, and the reviewer seat stood outside the author across all three rounds.

## Acceptance

| #   | Criterion                                      | Verdict  | Evidence                                                                                                          |
| --- | ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | No two texts disagree on `go unattended` scope | ACCEPTED | `AGENTS.md:119`, `AGENTS.md:258`, `.github/merge-policy.md:37` all name the milestone                             |
| 2   | `signed` means the owner, everywhere           | ACCEPTED | `orchestrator-policy.md:111`, `mock-build/SKILL.md:73`; tool refuses a signed state (`sign-unattended.mjs:55-59`) |
| 3   | `auto-signed` accepted end to end              | ACCEPTED | `mock-claims.mjs:62`, `check-round.mjs:254`, `sign-unattended.mjs:67-69`; 130 schema tests                        |
| 4   | Pre-flight conditions are checkable            | ACCEPTED | `orchestrator-policy.md:151-155` - the fourth is a hash comparison with an exit code                              |
| 5   | Unattended cannot swap an owner signature      | ACCEPTED | `sign-unattended.mjs:55-59` prints `signed but stale`, sets `exitCode = 1`; dry run reports 0 stale               |
| 6   | Protected-doc guard passes on the landed text  | ACCEPTED | `tests/meta/protected-doc-review.test.ts` 7 passed                                                                |
| 7   | `npm run verify` passes                        | ACCEPTED | `gate-run 2026-11-15T07:00:53.507Z profile=full steps=7/7`                                                        |

## Deviations

- Tier 2 parent-authored: the round is process text and gate tooling written from the owner's three
  answers in one conversation; delegating it would have lost the interview context that produced the
  wording, so the parent authored it and the reviewer seat stood independent of the author as usual.
- The protected-doc guard was red between the text change and the record rewrite, by design - the
  sequence is edit, review, re-record, and the guard is what proves the record matches the text.
- The policy's fourth condition said "prints zero" until the tool gained a second non-zero outcome (a
  stale signed state). It now says the command reports zero and exits zero; the wording is the reviewer's
  own P2, adopted verbatim.
- `sign-unattended.mjs` skips `reference` states without correcting their hash, so the pre-flight's
  absolute is enforced for signed, auto-signed and target states only. Backlog.
