---
name: orchestrator
description: >-
  Tiered workflow for features and fixes in this repo. Tier 0 is solo with a
  self-review; Tier 1 adds an approved plan and a written acceptance; Tier 2 adds
  an independent read-only reviewer. The parent implements at every tier. Use for
  any behavioural change; docs-only chores may stay at Tier 0.
---

# Orchestrator — tiered workflow

This skill owns the procedure. `AGENTS.md` owns the non-negotiables and points here. When they
disagree, `AGENTS.md` wins and this file is amended in the same change.

## Tiers

| Tier         | Use when                                                                                 | Who runs                                               | Output             |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ |
| 0 — Solo     | Docs, config, or a contained change the owner explicitly places at Tier 0                | Parent implements, self-reviews, self-accepts          | Commit body only   |
| 1 — Plan     | A behavioural change in one area, tests exist or are added                               | Approved spec + parent implements + written acceptance | Round doc          |
| 2 — Reviewed | A behavioural change spanning files, a migration, auth, wire contract, or anything risky | Tier 1 + an independent reviewer subagent              | Round doc + review |

Default to the lowest safe tier. If the tier is genuinely ambiguous, put it to the owner in the grill
round; do not guess. Record the tier in the round-doc header table (Tier 0: in the commit body).
Tier 3 and a dedicated UI tester are **deferred**; the V2 gate is the minimal Playwright/axe/
live-vs-mock check in ticket 19.

## Roles

- **Parent (implementer and plan author).** Reads the spec, plans, implements, runs the authoritative
  verification, and writes the acceptance verdict. The parent is the only source of test numbers.
- **Reviewer (Tier 2 only).** Normally the `code-review` skill's Standards and Spec seats. The
  repo's `.opencode/agents/reviewer.md` is the fallback: a read-only subagent that receives the spec
  path, the diff and the acceptance criteria, never edits/builds/tests, and returns `Standards:` and
  `Spec:` verdicts with P1/P2 findings at `file:line`. An empty verdict means **no review**, never
  "clean".
- **Owner.** Owns every decision the repo cannot answer; approves the spec, the tier if ambiguous,
  the lesson entries, and each commit/push/PR/merge action.

## Procedure

0. **Classify.** Choose Tier 0/1/2 and say so. If the tier is genuinely ambiguous, put it to the
   owner in grill format rather than guessing.
1. **Plan.** For a feature, the approved spec is the plan gate. Write `documents/rounds/<slug>.md`
   with `Status`, `Tier`, `Base` (`git rev-parse --short HEAD`), `Spec`, and `## Plan` (goal, scope,
   expected files, acceptance criteria). A plan with an unresolved fork is not ready: grill it.
2. **Implement.** The parent writes the code and the tests. A behavioural change needs a test that
   fails before it and passes after it. Do not widen scope silently; if scope grows, bump the tier
   and record it.
3. **Verify.** Run `npm run verify` (format, lint, typecheck, tests, build). For migrations, auth,
   wire-contract or cross-cutting diffs also run `npm run smoke`. Record the numbers in
   `## Verification`. The reviewer's numbers, if any, are discarded.
4. **Review (Tier 2).** Freeze the diff (`git diff` and `git status --short`). Run the
   `code-review` skill against the round's base commit: its Standards and Spec sub-agents review in
   parallel, and its report is transcribed under `## Review` in the round doc. If the parallel seats
   cannot be dispatched, use `.opencode/agents/reviewer.md` for the same two verdicts. Adjudicate
   every P1 against the source before dispatching a rework; a severity is a claim, not a fact. At most
   one rework iteration.
5. **Accept.** Check every criterion in `## Plan` against the diff (file:line) or a named test, using
   the parent's authoritative numbers. Write `## Acceptance` with `ACCEPTED`, `REWORK`, or `PARKED`.
   No acceptance means unaccepted work, never "done".
6. **Report.** Summarise the tier, changed paths, verification table, findings, and residuals. Stop.
   Commit, push, PR and merge each require a separate explicit owner instruction.

## Reviewer brief template

```text
Role: read-only reviewer. Do not edit, build or test.
Spec: <path>. Acceptance criteria: <paste from the round doc>.
Diff: read it with `git diff` and `git status --short`; the base is <sha>.
Return:
Standards: PASS | FINDINGS — P1/P2 with file:line.
Spec: PASS | FINDINGS — each criterion, met or not, with evidence.
No build/test numbers. An empty verdict is no review.
```

## Round docs and lessons

- One `documents/rounds/<slug>.md` per Tier 1–2 round. It is committed but ephemeral; the diff lives
  in git, so no patch files. Format: `documents/rounds/README.md`.
- Durable lessons go to `documents/lessons.md`, newest first, each with date, rule, evidence and the
  trigger that should have caught it. Propose an entry in the reply; write it only when the owner
  accepts it.
- Deferred work goes to `documents/backlog.md`, not to silent scope cuts.

## Deliberately not adopted

- **Full Tier 3 and a dedicated UI tester** - deferred; the V2 gate is the minimal Playwright/axe/
  live-vs-mock check in ticket 19. Revisit with a full mock gate and tester when the UI is stable.
- **Unattended rounds** — every round is owner-attended.
- **Protected-doc hash gates** — the approved spec and git history are the control.
- **Parallel workers and worktrees** — one writer per working tree; the parent is the only writer.
- **GitHub issue/triage labels** — use `documents/backlog.md` until a tracker is adopted.
- **Pinned model seats** — inherit the session model. Prefer a different model for the reviewer when
  the environment offers one, but never make the workflow fail because a seat is unavailable.
