# Round — parallel-workers amendment

|         |                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Status  | CLOSED                                                                                                 |
| Tier    | 2 — Reviewed                                                                                           |
| Base    | `d15df38`                                                                                              |
| Spec    | `AGENTS.md` §3a, `documents/agents/orchestrator-policy.md`, canonical `references/parallel-workers.md` |
| Workers | `single`                                                                                               |

Provider: `ollama-cloud` (author parent; reviewer `deepseek-v4-pro:0813`).

## Plan

Adopt opt-in parallel workers (cross-ticket tracks + within-round slices) in the shared skill and the
repo governance, with the Q78–Q83 corrections, and re-record the protected-doc hashes.

- **Canonical:** new `references/parallel-workers.md`; `role-contracts.md`/`SKILL.md` say one writer
  per worktree, the parent integrates, parallel writers opt-in; `CHANGELOG.md`; `sync-skill.mjs` adds
  the new file to the manifest (6 files).
- **MR:** `AGENTS.md` §3a (the non-negotiables) and the §13 removal; the policy `## Parallel workers`
  section with the track map (the events API cluster owns `src/openapi.ts`; the UI workspace owns
  `ui/**` and its root config) and the non-adoption bullet removed; the rounds-README `Workers` row and
  the parallel acceptance rule.
- **Record:** `protected-doc-reviews.json` re-recorded for all 11 protected files after the pro review.

Acceptance criteria:

1. The canonical reference carries both models, the L1–L3 guards plus the per-slice build, merged
   pass and 2-worker bound, parent-owned git, base materialization, unit-tests-only workers and the
   post-merge acceptance.
2. `AGENTS.md` §3a states the non-negotiables and §13 no longer lists parallel workers/worktrees.
3. The policy carries the track map and the shared-file ownership; the non-adoption bullet is gone.
4. The rounds README records `Workers:` and the track-only acceptance.
5. Every protected file is re-recorded (pro:0813) with the new hashes; the guard passes.

## Verification

| Gate               | Command                                                  | Result                                        |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- |
| Protected guard    | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                                |
| Tests (serialized) | `npx vitest run --no-file-parallelism`                   | pass — 17 files, 140 passed / 3 skipped (143) |
| Format/lint/types  | `npm run format:check` / `lint` / `typecheck`            | pass                                          |
| Build              | `npm run build`                                          | pass                                          |
| Canonical manifest | `sync-skill.mjs --verify`                                | pass — 6 files                                |

## Review

Independent protected-doc review on `deepseek-v4-pro:0813`: **Spec PASS** (all accepted items met),
**Standards FINDINGS (P2 only)**. The P2s were fixed: the `role-contracts` Worker and Brief-discipline
sections now point at the opt-in variant; the reference's acceptance wording covers slices as well as
tracks; the changelog no longer over-claims L1–L6 labels. Attestation recorded for every protected
file.

## Acceptance

| #   | Criterion                                                | Met | Evidence                                |
| --- | -------------------------------------------------------- | --- | --------------------------------------- |
| 1   | Canonical reference carries both models + the guards     | yes | `references/parallel-workers.md`        |
| 2   | AGENTS.md §3a + §13 removal                              | yes | `AGENTS.md` §3a, §13                    |
| 3   | Policy track map + shared-file ownership; bullet removed | yes | policy `## Parallel workers`            |
| 4   | Rounds README `Workers:` + track-only acceptance         | yes | `documents/rounds/README.md`            |
| 5   | All protected files re-recorded; guard passes            | yes | `protected-doc-reviews.json`; guard 7/7 |

Verdict: **ACCEPTED**.

## Deviations

- The two tracks are not started in this round; this round is the governance amendment and the
  re-record. The pilot (the actual 09–11 ‖ 12–16 run) follows.
- The default parallel `vitest run` flakes on this machine (PGlite/memory); the serialized run is the
  evidence and CI runs the parallel config.
