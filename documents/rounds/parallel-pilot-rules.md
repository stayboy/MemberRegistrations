# Round — parallel-pilot rules

|         |                                                                          |
| ------- | ------------------------------------------------------------------------ |
| Status  | CLOSED                                                                   |
| Tier    | 2 — Reviewed                                                             |
| Base    | `96a31c1`                                                                |
| Spec    | `AGENTS.md` §3a, canonical `references/parallel-workers.md`, repo policy |
| Workers | `single`                                                                 |

Provider: `ollama-cloud` (author parent; reviewer `deepseek-v4-pro:0813`).

## Plan

Encode the pilot's rules in the governing documents (Q99 as corrected: rules in the reference and the
policy, incident evidence in `documents/lessons.md`), and re-record the protected set.

- **Canonical `references/parallel-workers.md`:** eligibility item 5 size parity (an uneven pair is
  slower than serial); persistent worktree slots mandatory; a worker never starts a browser/headless
  harness (e2e stays with the parent/CI post-merge); the 2-worker cap is a memory guard with peak RSS
  recorded; a pointer to the repo's lessons file.
- **`AGENTS.md` §3a:** the same non-negotiables, condensed, with the lessons pointer.
- **Policy `## Parallel workers`:** the same rules; the obsolete 09–11 ‖ 12–16 track map is removed
  because it prescribed the uneven pair the pilot disproved.
- **Record:** every protected file re-recorded after the pro review.

Acceptance criteria:

1. The reference carries size parity, mandatory persistent slots, the no-browser worker scope and the
   peak-RSS memory guard.
2. `AGENTS.md` §3a and the policy agree with the reference and each other.
3. The old track map is gone with no stale governing reference.
4. The lessons pointer is present and does not claim lessons that the owner has not accepted.
5. The protected record is re-recorded (pro:0813) and the guard passes.

## Verification

| Gate               | Command                                                  | Result                                        |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- |
| Protected guard    | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                                |
| Format/lint/types  | `npm run format:check` / `lint` / `typecheck`            | pass                                          |
| Tests              | `npx vitest run --no-file-parallelism`                   | pass — 17 files, 140 passed / 3 skipped (143) |
| Build              | `npm run build`                                          | pass                                          |
| Canonical manifest | `sync-skill.mjs --verify`                                | pass — 6 files                                |

## Review

Independent review on `deepseek-v4-pro:0813`: **Spec FINDINGS met on every item**, **Standards
P2-only**. Fixed: the `0xC0000409`/OOM misattribution (removed from the rule text; it is the
browser-harness incident, kept as evidence), the §3a omissions (persistent slots, peak RSS), the
peak-memory → peak-RSS wording, and the lessons pointer now says "once owner-accepted". The reviewer's
P1 (stale canonical manifest) was a false positive: `sync-skill.mjs --verify` passes and the manifest
hashes equal the post-edit file hashes.

## Acceptance

| #   | Criterion                                                      | Met | Evidence                                      |
| --- | -------------------------------------------------------------- | --- | --------------------------------------------- |
| 1   | Reference: size parity, persistent slots, no-browser, peak RSS | yes | `references/parallel-workers.md`              |
| 2   | §3a and the policy agree with the reference                    | yes | `AGENTS.md` §3a; policy `## Parallel workers` |
| 3   | Track map removed, no stale governing reference                | yes | policy diff                                   |
| 4   | Lessons pointer correct and non-overclaiming                   | yes | reference intro; §3a; policy                  |
| 5   | Protected record re-recorded; guard passes                     | yes | `protected-doc-reviews.json`; guard 7/7       |

Verdict: **ACCEPTED**.

## Deviations

- The pilot lessons remain proposed; `documents/lessons.md` is unchanged and awaits explicit owner
  acceptance (Q100).
- The default parallel `vitest run` flakes locally (PGlite/memory); the serialized run is the evidence
  and CI runs the parallel config.
