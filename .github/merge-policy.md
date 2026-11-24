# Merge policy

`main` is the delivery branch. Changes reach it through a pull request. Direct pushes to `main`,
force pushes, and deletion of `main` are not part of the workflow.

## Required path

1. Create a branch from `main`: `feat/<slug>`, `fix/<slug>` or `chore/<slug>`.
2. Add or update tests for behavioural changes. Tier 2 runs the `code-review` skill against the base
   and resolves every P1 before the PR.
3. Commit **only after the owner explicitly says "commit"** — or as part of an authorised `merge`
   chain (see Verb glossary). Show the change set first unless the owner named it.
4. Push only after the owner explicitly says "push", or as part of an authorised `merge` chain.
5. Open a PR targeting `main` only after the owner asks for a PR, or as part of an authorised `merge`
   chain.
6. Wait for the `verify`, `ui` and `ui-e2e` GitHub Actions checks to pass - the ruleset refuses the
   merge until all three are green.
7. Merge only after the owner says "merge": **squash merge, delete the source branch**.
8. Switch to `main` and pull the merged result.

Each action is separately authorised: "create a branch" or "fix X" does not authorise a commit, a
push, a PR or a merge. Keep working-tree changes uncommitted by default. `merge` is the one exception,
defined in the Verb glossary below.

## Verb glossary

What each owner verb authorises, and nothing more. An action outside this list needs its own
instruction.

| Verb                  | What it authorises                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branch`              | Create `feat/`, `fix/` or `chore/` from `main`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `commit`              | Stage and commit the named change set. Never pushes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `push`                | Push the current branch. Never opens a PR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pr` / `pull request` | Open the pull request to `main`. Never merges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `merge`               | Merge **only when green**. If the work is uncommitted, this one verb covers the whole chain: commit the change set, push the branch, open the PR, wait for `verify`, `ui` and `ui-e2e`, squash merge, delete the branch, pull `main`. If the PR for the current branch already exists, it covers waiting and merging. It never authorises merging a blocked PR, a `--admin` merge, or a force push.                                                                                                                                                                              |
| `sync`                | Switch to `main` and pull the merged result (`git switch main`, then `git pull --ff-only`). Never merges, never pushes.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tag`                 | Create an annotated tag on the current commit. Never pushes it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `restore`             | Undo a bad edit to named paths: `git checkout <revision> -- <paths>`, used only to undo the parent's own **uncommitted** edit, with the revision, the exact paths and the reason stated in the brief. Never a bare pathspec, never a glob, never outside the named paths, and never a discard the owner has not seen.                                                                                                                                                                                                                                                            |
| `publish`             | Dispatch the `publish-executor` seat on a brief that quotes the owner's `publish`: rebuild the local Docker Compose stack from `main` (`docker compose build`, then `docker compose up -d`), run its migrations, and report each service’s health and the local URLs. Only after the merge chain has finished and `main` is clean - on `main`, `HEAD` at the merged commit, and `git status --porcelain` empty; a dirty tree or another branch is a refusal. Never commits, pushes, opens a PR or deploys to Vercel, and never stages, stashes or discards working-tree changes. |
| `go unattended`       | Pre-authorises commit, push, PR and merge for that round, or for every round up to the milestone the instruction names (`AGENTS.md` §17).                                                                                                                                                                                                                                                                                                                                                                                                                                        |

"Merge" implies its prerequisites because the merged result cannot exist otherwise; the reverse never
holds — "commit", "push" or "pr" never implies a merge. A blocked or failing check is a stop: fix on
the branch and wait again.

`publish` is a local action, not a git write, and it runs through its own seat
(`.opencode/agents/publish-executor.md`, class `publish-executor`). It runs only on clean `main`
after a merge, so what it publishes is the merged tree rather than a branch; the seat refuses on
any other branch, on a non-empty `git status --porcelain`, or when `HEAD` is not the commit the
brief names as merged. It takes no `git-executor` brief, so draws nothing from
`git-seat-budget:`, and it leaves the tree exactly as it found it. Only the owner dispatches it,
and `go unattended` never pre-authorises it.

An action may be executed by the `git-executor` seat (`.opencode/agents/git-executor.md`) on a brief
that quotes the owner's verb; the parent verifies the result. Delegation changes who runs the
command, never who authorises it. What the seat may not do — infer consent, or carry more than one verb
per brief — is `AGENTS.md` §9 and `.opencode/agents/git-executor.md`; a `merge` brief still carries
one verb even though that verb expands to several commands.

**Seat, budget and record.** A brief carries the shape the seat's own file defines: the owner's verb, or
the round doc's owner-approved `Verbs this round needs:` line that contains it; `branch:`; `files:` and
`message:` for a commit; `tree:`; and `checks:` for a merge — plus the round's budget as its own literal
`git-seat-budget: <amount>` line, which the seat's budget section requires before any other check. The
seat's refusal logic then verifies the tree hash and that the staged list is exactly `files:`; it runs no
further pre-check, and the parent supplies those values and verifies the outcome. A seat that runs a
command the brief never named is refusing, not flaking. The standing default, the `0`-parks rule, the
single retry, the `Actor` column and the probe live in `documents/agents/orchestrator-policy.md`, with
the model ids in `documents/agents/seats.json`; this section owns what a brief contains and who is
accountable for it.

## Status checks

`.github/workflows/ci.yml` runs on every pull request that targets `main`, and on `main` itself, with
no path filters, so the `verify`, `ui` and `ui-e2e` jobs always report. All three are **required** to merge: the repository
ruleset `main - require verify` (id `26950867`) requires a pull request, those three checks and a
squash merge, and blocks force pushes and deletion, with **no bypass actors** — administrators
included (`current_user_can_bypass: never`). It was created on 2026-11-10 after PR #101 merged
before its checks finished. The earlier finding that rulesets return HTTP 403 belonged to a private
Free repository; this one is public, so the gate is available and is now on.

Do not merge while a check is running or red. Auto-merge is disabled on this repository
(`enablePullRequestAutoMerge: false`), so `gh pr merge --auto` is not an available gate here: it errors
and never waits for the checks. The wait is explicit — `gh pr checks <n> --watch`, then merge on
green. What refuses a premature merge is the ruleset at the server: on 2026-11-10 it refused #102 with
"the base branch policy prohibits the merge" while the checks ran. PR #101 merged at 13:38:37 before
its `verify` finished only because no ruleset existed yet. A failing branch is fixed on the branch
and re-run.

A red `main` is an incident:

- failure in the change just merged → fix forward on a new branch, through a PR;
- failure caused by another session's change → report it, do not revert unilaterally;
- reverting a merged PR is an owner decision.

## Merge strategy

Squash merge by default, source branch deleted:

```bash
gh pr merge <pr-number> --squash --delete-branch
```

Use merge or rebase only when the owner explicitly asks. `--delete-branch` can no-op when `main` is
checked out in another worktree; verify with `git ls-remote --heads origin <branch>` and delete by
hand if the branch survived.

## Local guard

`.githooks/pre-commit` runs `npm run verify:precommit` and blocks the commit on failure.
`.githooks/pre-push` blocks direct pushes to `main`; feature-branch pushes are allowed. Install both
with `npm run hooks:install`. They are tripwires, not a security boundary: `--no-verify` bypasses
them, and this policy remains the primary control.

Hooks are per clone and `core.hooksPath` can be cleared without leaving a record — it was found empty
on 2026-11-10 — and they cannot see a merge at all: git has no merge hook, and `gh pr merge` is an API
call that never touches the local repository. The ruleset above is the control on merging; the hooks
protect only commits and pushes.
