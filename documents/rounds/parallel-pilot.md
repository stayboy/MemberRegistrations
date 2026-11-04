# Round — parallel pilot

|         |                                                                                 |
| ------- | ------------------------------------------------------------------------------- |
| Status  | CLOSED                                                                          |
| Tier    | 2 — Reviewed                                                                    |
| Base    | `bac94a4`                                                                       |
| Spec    | `AGENTS.md` §3a, `~/.agents/skills/orchestrator/references/parallel-workers.md` |
| Workers | `parallel (tracks: events-api, ui-workspace)`                                   |

Provider: `ollama-cloud` (workers `deepseek-v4.1-flash:1017`; reviewer/acceptance `deepseek-v4-pro:0813`).

## Plan

The first parallel pilot: two file-disjoint tracks from one base, each in its own worktree, integrated
serially.

- **Track A — `track/events-api`:** ticket 09 (event detail, create, update).
- **Track B — `track/ui-workspace`:** ticket 12 (UI workspace and shell).

## Result

| Track        | Ticket | PR  | Merge     | Gate                                  |
| ------------ | ------ | --- | --------- | ------------------------------------- |
| events-api   | 09     | #24 | `89defbc` | `verify` 155 tests + smoke            |
| ui-workspace | 12     | #25 | `a69da81` | UI build + 16 UI tests; root `verify` |

Post-merge authoritative pass on `main`: `npm run verify` **155 passed / 3 skipped (158)**, build;
`npm run ui:build` pass (after the root `npm ci` installed the new workspace dependencies).

## Lessons (proposed; not written to `documents/lessons.md` without owner acceptance)

1. **Worker scope is unit/API tests only; a browser harness is a dispatch failure.** The UI worker ran
   a headless-Chrome smoke (≈150 orphan processes) and crashed the API track's Vitest worker
   (`0xC0000409`).
2. **Parallel is for similar-sized, genuinely disjoint tracks; an uneven pair is slower than serial.**
   The UI track dominated wall-clock while the API track finished early; each fresh worktree also paid
   a full `npm ci`.
3. **A fresh worktree has no `node_modules`; the merged tree needs its own install.** The post-merge
   `ui:build` failed until the root `npm ci` installed the workspace deps.

## Go-forward

Serial within each cluster for the remaining tickets (10, 11, 13–19); no new parallel tracks. The
parallel-workers rule stays available for a genuinely even, disjoint pair, with the worker-scope guard
and persistent slots.

## Acceptance

The two tickets are accepted; the pilot is accepted as a learning experiment. Verdict: **ACCEPTED**.

## Deviations

- UI deploy workflow, CI UI checks, route splitting and the browser gate are backlogged (ticket 19).
- The lessons are proposed in the reply; the owner's explicit acceptance is required before writing
  `documents/lessons.md` (which is protected).
