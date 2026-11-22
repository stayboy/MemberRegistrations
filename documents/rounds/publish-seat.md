# Round — publish seat

|                        |                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                             |
| Tier                   | 1 — Plan                                                                                                                                                         |
| Mode                   | `attended`                                                                                                                                                       |
| Base                   | `7afa338`                                                                                                                                                        |
| Review rounds          | 0                                                                                                                                                                |
| Gate runs in parent    | 1                                                                                                                                                                |
| Spec                   | `documents/agents/orchestrator-policy.md` (Seats) + `documents/agents/seats.json`                                                                                |
| Workers                | `single`                                                                                                                                                         |
| Implementer            | `worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (seat files and meta test); parent ollama-cloud/deepseek-v4.1-flash:1017 (round doc, integration, gates)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                          |

## Grill

Mode: attended. The owner answered **“all as recommended”** on 2026-11-22.

❓ **Q1 — Scope:** fix the whole seat-health drift (pin + title + publish fallback + guard), with the
worktree precondition as a runbook line, not the pin alone.
➡️ Yes. Cost: a new operational seat file and a meta test; a pin-only fix recurs at the next 429.

❓ **Q2 — Model id:** keep `model:` in the frontmatter and remove the model id from the title and body, so
`seats.json` owns the ranking.
➡️ Yes. Cost: a title edit; the guard checks the frontmatter only.

❓ **Q3 — Fallback:** add `publish-executor-fallback.md` on `ollama-cloud/mimo-v2.6-flash`, mirroring
`git-executor-fallback`.
➡️ Yes. Cost: a metered rung on a rare, owner-dispatched publish.

❓ **Q4 — `main` precondition:** a runbook line (the publish runs from a clean `main` checkout and refuses
elsewhere) rather than a dedicated worktree or a new `directory:` field.
➡️ Yes. Cost: docs; the seat cannot retarget itself.

❓ **Q5 — Guard:** a meta test that each seat file's `model:` is in its class list, with a recorded exception
for the git seat the owner kept.
➡️ Yes. Cost: a test and a `seats.json` note; without the exception the git file fails today.

❓ **Q6 — Process:** a short Tier 1 round on a `chore/` branch, worker implements, parent gates.
➡️ Yes. Cost: one worker and a written acceptance; no independent product review (no product behaviour).

❓ **Q7 — Current edit:** revert the uncommitted one-line pin so `main` stays clean; the round re-applies it.
➡️ Yes. Cost: the one-line diff is redone.

## Plan

Goal: make the publish seat robust when its free candidate is exhausted, and stop the seat-model drift from
recurring silently.

- **In:** `publish-executor.md` (pin to the free candidate, title without a model, runbook line);
  `publish-executor-fallback.md` (metered candidate, mirroring the git fallback); a `seats.json` exception
  for the git seat the owner kept; a meta test that fails on an unlisted seat model and honours the
  exception.
- **Out:** any product behaviour, the git seat's model (owner's keep), the `main` worktree topology, and a
  new `directory:` brief field.

Expected files:

- `.opencode/agents/publish-executor.md`
- `.opencode/agents/publish-executor-fallback.md` (new)
- `documents/agents/seats.json` (the git exception note)
- `tests/meta/seat-model.test.ts` or the existing `tests/meta/seat-rule-agreement.test.ts`

Acceptance:

1. `publish-executor.md` pins `opencode/deepseek-v4.1-flash-free`, its title/body do not restate a model,
   and it states the clean-`main` precondition.
2. `publish-executor-fallback.md` pins `ollama-cloud/mimo-v2.6-flash`, mirrors the git fallback's
   permissions, brief, refusals and return shape, and keeps the publish's no-git-write rule.
3. `seats.json` records the git seat's `opencode/beam-free` exception with the owner's basis.
4. The meta test fails for a model outside its class list, passes with the recorded exception, and passes
   for every current seat file.
5. `npm run verify:skill` and `npm run verify:fast` pass; the full `npm run verify` passes with the pooled
   lane.
6. No user-visible surface; mock sign-off is `n/a`.

No behavioural spec is amended, so the 0813 spec review does not apply; the seat files are operational, not
governing.

## Verification

| Gate        | Command                                                                                                               | Result                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Meta guard  | `npx vitest run tests/meta/seat-model.test.ts tests/meta/seat-rule-agreement.test.ts tests/meta/git-executor.test.ts` | pass — 3 files, 14 tests |
| Skill check | `npm run verify:skill`                                                                                                | pass                     |
| Fast gate   | `npm run verify:fast`                                                                                                 | pass — 4/4               |
| Full gate   | `TEST_DATABASE_URL=… npm run verify`                                                                                  | pass — 7/7               |

gate-run 2026-11-22T16:47:22.883Z profile=full steps=7/7 lines=7 bytes=966

## Git writes

`git-seat-budget: 12` (this round `1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync = 6 of 12`).

| Brief | Actor                 | Verb     | Variant                        | Reason                                                                      |
| ----- | --------------------- | -------- | ------------------------------ | --------------------------------------------------------------------------- |
| 1     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Rung 1 429; cut `chore/publish-seat` from `main` in the events-add worktree |
| 2     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | One round commit; the round doc is the record                               |
| 3     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Feature branch only                                                         |
| 4     | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                                           |
| 5     | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | Only after `verify`, `ui` and `ui-e2e` are green                            |
| 6     | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull, the merge policy's chain                                   |

## Mock sign-off

n/a — no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                                                                                                         | Met | Evidence                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------ |
| 1   | `publish-executor.md` pins the free candidate, its title/body do not restate a model, and the clean-`main` precondition is stated | yes | `.opencode/agents/publish-executor.md:4,32,58`               |
| 2   | `publish-executor-fallback.md` pins the metered candidate and mirrors the git fallback's shape                                    | yes | `.opencode/agents/publish-executor-fallback.md`              |
| 3   | `seats.json` records the git seat's `opencode/beam-free` exception with the owner's basis                                         | yes | `documents/agents/seats.json` `modelExceptions.git-executor` |
| 4   | The meta test rejects an unlisted model, honours the scoped exception, and passes every current file                              | yes | `tests/meta/seat-model.test.ts` (4 cases)                    |
| 5   | `verify:skill`, `verify:fast` and the full `verify` pass                                                                          | yes | 4/4 and 7/7 above                                            |
| 6   | No user-visible surface                                                                                                           | yes | mock sign-off `n/a`                                          |

Verdict: **ACCEPTED**.

## Deviations

- **The publish class list changed with the pin.** `seats.json` had `opencode/beam-free` first for
  `publish-executor`; the round replaced it with `opencode/deepseek-v4.1-flash-free` so the pin, the
  ranking and the guard agree. `beam-free` was not added to any ranked list; the git class keeps its rung
  through the recorded exception.
- **The fallback title omits the model id**, following Q2 (the frontmatter and `seats.json` own it); the
  git fallback's title still names its model, which is a later cleanup.
- **The guard's teeth are the synthetic unlisted-model and mapping-coverage cases plus the exception's
  scope.** The real publish files would have passed before the fix because `beam-free` was a listed
  candidate; the durable control is the exception record and the mapping.
- **No independent review:** Tier 1 has no reviewer gate, and no behavioural spec is amended, so the 0813
  spec review does not apply. The seat files are operational, not governing.
