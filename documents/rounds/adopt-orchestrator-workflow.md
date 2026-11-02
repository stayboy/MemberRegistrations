# Round — adopt orchestrator workflow

|        |                                                       |
| ------ | ----------------------------------------------------- |
| Status | CLOSED                                                |
| Tier   | 2 — Reviewed                                          |
| Base   | `221b6aa`                                             |
| Spec   | `AGENTS.md`, `.opencode/skills/orchestrator/SKILL.md` |

## Plan

Adopt the School-Collab orchestrator lessons as a lean local workflow: skill + reviewer + rules +
merge policy + CI + verification + round/lesson/backlog docs. No API behaviour changes.

Acceptance criteria:

1. A lean skill defines tiers 0–2, the parent as implementer at every tier, the `code-review` skill
   for Tier 2 (read-only reviewer as fallback), and Tier 3/UI tester deferred to V2.
2. `.opencode/agents/reviewer.md` denies edits and build/test commands and allows reading the diff.
3. `AGENTS.md` keeps spec-first and grill-then-approve and records tiers, UTC, append-only history,
   security scope, verification, test policy, explicit commit/push/PR/merge authority, round docs,
   lessons, backlog and the non-adoption list.
4. `.github/merge-policy.md` and `.github/workflows/ci.yml` implement branch → PR → `verify` →
   squash merge + delete.
5. `package.json` defines `verify:fast`, `verify`, `smoke` and `hooks:install`; the pre-commit hook
   runs `verify:fast`.
6. `scripts/smoke.mjs` exercises the compiled server with PGlite and always kills the child.
7. Round docs are committed but ephemeral with Plan/Verification/Acceptance; lessons are
   owner-accepted only; deferred work is in the backlog.
8. No behavioural API change and no spec drift.
9. The GitHub repository exists, the branch is pushed, a PR is opened, `verify` is green, and the PR
   is squash-merged with the source branch deleted.

## Verification

| Gate  | Command                 | Result                                                                           |
| ----- | ----------------------- | -------------------------------------------------------------------------------- |
| Fast  | `npm run verify:fast`   | pass — format, lint, typecheck, 64 tests                                         |
| Full  | `npm run verify`        | pass — `verify:fast` + build                                                     |
| Smoke | `npm run smoke`         | pass — health, 401, presbyter, member, assignment, call, roster, report, OpenAPI |
| CI    | `verify` workflow on PR | pending at commit time; required before merge                                    |

## Review

`code-review` (Pocock skill), fixed point `221b6aa`, Standards and Spec axes in parallel.

**Standards — FINDINGS, all resolved.**

- **P1** `documents/lessons.md` was committed as “owner-accepted” with no acceptance evidence. Fixed:
  the file records the owner's acceptance (2026-11-02, grill Q16 “all as recommended”).
- **P2** The round doc carried a `Commit` row filled only after the commit. Removed.
- **P2** `## Review`/`## Acceptance` were empty at commit time. Filled in this follow-up commit.
- Judgement calls kept with reasons: the `dist/index.js` guard protects direct invocation; the
  duplicated `2.1.0` literal is a deliberate wire-contract assertion; `run` was renamed
  `runScenario`; the non-adoption list is intentionally repeated (rules vs procedure vs backlog).

**Spec — FINDINGS, resolved or explicitly deferred.**

- **AC9** (repo/PR/merge) was not yet met at the review point. Completed by this PR and merge.
- **AC4** The `verify` check cannot be enforced server-side: GitHub returns 403 for rulesets and
  branch protection on a private Free repository. The policy is a process gate; the backlog records
  the plan upgrade.
- **AC2** The review claimed `permissions` must be singular. That is wrong for v2.2.5: a private
  standalone server rooted at the repo lists `reviewer` with the `permissions` array as written. The
  shared service was still rooted at `C:\Users\skwar`, which is why the agent was not listed
  in-session; a fresh session opened in the repo loads it.
- **AC3** Tier 0 wording differed between `AGENTS.md` and the skill. Both now say “a contained change
  the owner explicitly places at Tier 0”.

## Acceptance

| #   | Criterion                                                               | Met                                | Evidence                                                                                                |
| --- | ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Lean skill, tiers 0–2, parent implements, code-review gate, V2 deferral | yes                                | `.opencode/skills/orchestrator/SKILL.md`                                                                |
| 2   | Reviewer denies edits/builds and reads the diff                         | yes                                | `.opencode/agents/reviewer.md`; `opencode api get /api/agent --standalone`                              |
| 3   | `AGENTS.md` non-negotiables and pointers                                | yes                                | `AGENTS.md` §1–12                                                                                       |
| 4   | Merge policy + CI                                                       | yes (process, not server-enforced) | `.github/merge-policy.md`, `.github/workflows/ci.yml`                                                   |
| 5   | Scripts and pre-commit hook                                             | yes                                | `package.json`; `.githooks/pre-commit` (100755)                                                         |
| 6   | Compiled-server smoke                                                   | yes                                | `scripts/smoke.mjs`; `npm run smoke` pass                                                               |
| 7   | Rounds/lessons/backlog                                                  | yes                                | `documents/rounds/README.md`, `documents/lessons.md`, `documents/backlog.md`                            |
| 8   | No API change or spec drift                                             | yes                                | `git diff 221b6aa...HEAD --name-only` has no `src/` or spec file                                        |
| 9   | Repo, PR, green CI, squash merge                                        | yes after merge                    | [PR #1](https://github.com/stayboy/MemberRegistrations/pull/1); `verify` check; `main` at squash commit |

Verdict: **ACCEPTED** for criteria 1–8; criterion 9 completes with the PR merge this round exists to
exercise.

## Deviations

- Vercel MCP has no team scope (`list_teams` returns empty), so no Vercel project can be linked from
  this session. GitHub was created with `gh`; Vercel linking is in the backlog.
- Server-side branch protection/rulesets are unavailable on the private Free plan (HTTP 403). The
  `verify` check is a required process gate; the backlog records the upgrade.
- The repo-specific `reviewer` agent could not be dispatched in this shared-service session because
  the service remained rooted at `C:\Users\skwar` after the session move. It was verified with
  `opencode api get /api/agent --standalone`, and the review ran on the `general` subagent under a
  read-only brief.
