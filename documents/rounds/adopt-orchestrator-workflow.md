# Round — adopt orchestrator workflow

|        |                                                       |
| ------ | ----------------------------------------------------- |
| Status | OPEN                                                  |
| Tier   | 2 — Reviewed                                          |
| Base   | `221b6aa`                                             |
| Spec   | `AGENTS.md`, `.opencode/skills/orchestrator/SKILL.md` |
| Commit | _(filled after commit)_                               |

## Plan

Adopt the School-Collab orchestrator lessons as a lean local workflow: skill + reviewer + rules +
merge policy + CI + verification + round/lesson/backlog docs. No API behaviour changes.

Acceptance criteria:

1. A lean skill defines tiers 0–2, the parent as implementer at every tier, the `code-review` skill
   for Tier 2 (with the read-only reviewer as fallback), and Tier 3/UI tester deferred to V2.
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

| Gate  | Command                 | Result                                   |
| ----- | ----------------------- | ---------------------------------------- |
| Fast  | `npm run verify:fast`   | pass (format, lint, typecheck, 64 tests) |
| Full  | `npm run verify`        | pass (+ build)                           |
| Smoke | `npm run smoke`         | pass (9 checks)                          |
| CI    | `verify` workflow on PR | _(filled after PR)_                      |

## Review

_(filled from the `code-review` skill)_

## Acceptance

_(filled after review)_

## Deviations

- Vercel MCP has no team scope, so no Vercel project can be linked from this session. The GitHub
  repository is created with `gh`; Vercel linking is deferred to the backlog.
