# Round — every open question gets a grill

|                        |                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                                                                                 |
| Tier                   | 1 — Plan                                                                                                                               |
| Mode                   | `attended`                                                                                                                             |
| Base                   | `65f1950`                                                                                                                              |
| Review rounds          | 1                                                                                                                                      |
| Gate runs in parent    | 1                                                                                                                                      |
| Spec                   | `AGENTS.md` §2                                                                                                                         |
| Workers                | `single`                                                                                                                               |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (AGENTS.md §2); parent ollama-cloud/deepseek-v4.1-flash:1017 (round doc, record, gates)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                |

## Instruction

Owner, 2026-11-22, verbatim: "always grill-me on open questions" — the standing rule that an open
question in a spec, a round or a design is settled by a grill round, never by a binary choice, a silent
deferral or the agent's own resolution. This is the first application: the standalone-import question was
grilled rather than answered yes/no.

## Plan

Add one sentence to `AGENTS.md` §2: **every open question is settled by a grill round** — the numbered
frontier with a recommendation and a cost per question; a binary choice, a silent deferral or a unilateral
resolution is not a settlement (owner, 2026-11-22). The `0813` protected review reads the exact text; the
hash is recorded.

Acceptance:

1. `AGENTS.md` §2 carries the rule with the owner attribution.
2. The protected-doc guard passes with the re-recorded `AGENTS.md` hash.
3. The `0813` protected review accepts the exact text; no product code changes.
4. No user-visible surface; mock sign-off `n/a`.

## Verification

| Gate                | Command                                                  | Result         |
| ------------------- | -------------------------------------------------------- | -------------- |
| Protected-doc guard | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests |
| Fast gate           | `npm run verify:fast`                                    | pass — 4/4     |
| Code                | none this round                                          | n/a            |

gate-run 2026-11-22T20:08:03.251Z profile=fast steps=4/4 lines=4 bytes=703

## Review

The protected review is this round's gate: a separate `deepseek-v4-pro:0813` session; ACCEPT, then a
confirmation ACCEPT after the five refinements, with two cosmetic nits left for a later touch.

Seat: consistent — author parent/worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer
`ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

`git-seat-budget: 12` (this round `1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync = 6 of 12`).

| Brief | Actor                 | Verb     | Variant                        | Reason                                                   |
| ----- | --------------------- | -------- | ------------------------------ | -------------------------------------------------------- |
| 1     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Cut `chore/grill-open-questions` from `main`; rung 1 429 |
| 2     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | The rule and its record                                  |
| 3     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Feature branch only                                      |
| 4     | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                        |
| 5     | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | After the checks                                         |
| 6     | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull                                          |

## Mock sign-off

n/a — no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                                            | Met | Evidence          |
| --- | -------------------------------------------------------------------- | --- | ----------------- |
| 1   | `AGENTS.md` §2 carries the rule with the owner attribution           | yes | `AGENTS.md:18-24` |
| 2   | The protected-doc guard passes with the re-recorded `AGENTS.md` hash | yes | 7 tests           |
| 3   | The `0813` protected review accepts the exact text; no product code  | yes | `## Review`       |
| 4   | No user-visible surface; mock sign-off `n/a`                         | yes | the diff          |

Verdict: **ACCEPTED**.

## Deviations

- **The five review gaps were auto-accepted** under the owner's unattended standing: the definition of an
  "open" question, the owner's direct answer, the agent's framing versus the owner's binary answer, the
  §17 auto-accept as standing consent, and the trivial-clarification exemption. Two cosmetic nits were
  left for a later touch: the qualifier attaches to the nearest noun, and the bold lead-in says "settled"
  while the body says "default, not a gate".
- **First application:** the standalone-import question was grilled rather than answered yes/no, and the
  answer changed the headcount (Visitor Mode) and the visitor semantics.
