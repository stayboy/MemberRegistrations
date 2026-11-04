# Round - UI CI job

|        |                                                              |
| ------ | ------------------------------------------------------------ |
| Status | OPEN                                                         |
| Tier   | 1 - Plan                                                     |
| Base   | `ee0514e`                                                    |
| Spec   | `AGENTS.md` §7, `documents/specs/member-registrations-ui.md` |
| Ticket | process work (Q122)                                          |

Provider: `ollama-cloud`.

## Plan

Q117 accepted the UI CI gate; Q122 fixed its shape. The gap it closes: the root `verify` job runs
`format:check`, `lint`, `typecheck` and `vitest`, but root ESLint ignores `ui/**` and the root Vitest run
covers only the server tests, so a UI change could be green in CI while none of its 87 tests or its build
ever ran.

- A separate `ui` job, parallel to `verify`: the same checkout and `setup-node` (24, npm cache),
  `npm ci`, then `npm run ui:lint`, `ui:typecheck`, `ui:test`, `ui:build`.
- No second install: `ui` is an npm workspace, so the root `npm ci` already supplies its dependencies.
- **Advisory, not required.** The repository is a private Free plan and GitHub returns 403 for branch
  protection, so the job cannot be a required check yet; that stays a backlog item.

Acceptance criteria:

1. A UI lint, type, test or build failure fails the `ui` job.
2. The `verify` job is unchanged and keeps its duration.
3. The job needs no database service and no extra install step.
4. The workflow parses and both jobs appear on a PR.

## Verification

| Gate                            | Command                                              | Result                    |
| ------------------------------- | ---------------------------------------------------- | ------------------------- |
| Workflow parse                  | the PR's check list must show both `verify` and `ui` | pending                   |
| UI gates (local, same commands) | `ui:lint` / `ui:typecheck` / `ui:test` / `ui:build`  | pass - 87 tests, build ok |
| Format                          | `npm run format:check`                               | pass                      |

## Acceptance

Pending the first run.

## Deviations

- The job is advisory: making it required needs branch protection, which the plan does not offer (see
  backlog).
