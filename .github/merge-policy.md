# Merge policy

`main` is the delivery branch. Changes reach it through a pull request. Direct pushes to `main`,
force pushes, and deletion of `main` are not part of the workflow.

## Required path

1. Create a branch from `main`: `feat/<slug>`, `fix/<slug>` or `chore/<slug>`.
2. Add or update tests for behavioural changes. Tier 2 runs the `code-review` skill against the base
   and resolves every P1 before the PR.
3. Commit **only after the owner explicitly says "commit"**. Show the change set first unless the
   owner named it.
4. Push only after the owner explicitly says "push".
5. Open a PR targeting `main` only after the owner asks for a PR.
6. Wait for the `verify` GitHub Actions check to pass.
7. Merge only after the owner says "merge": **squash merge, delete the source branch**.
8. Switch to `main` and pull the merged result.

Each action is separately authorised: "create a branch" or "fix X" does not authorise a commit, a
push, a PR or a merge. Keep working-tree changes uncommitted by default.

An action may be executed by the `git-executor` seat (`.opencode/agents/git-executor.md`) on a brief
that quotes the owner's verb; the parent verifies the result. Delegation changes who runs the
command, never who authorises it.

## Status checks

`.github/workflows/ci.yml` runs the `verify` job on every PR and on `main`. It is the required check
for merging, enforced by the repository ruleset `main - require verify` when configured; treat it as
required either way. Do not merge while it is running or failing. A failing branch is fixed on the
branch and re-run.

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

`.githooks/pre-commit` runs `npm run verify:fast` and blocks the commit on failure.
`.githooks/pre-push` blocks direct pushes to `main`; feature-branch pushes are allowed. Install both
with `npm run hooks:install`. They are tripwires, not a security boundary: `--no-verify` bypasses
them, and this policy remains the primary control.
