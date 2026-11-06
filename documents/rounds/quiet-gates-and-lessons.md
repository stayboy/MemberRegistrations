# Round — quiet gates and process lessons

|                     |                |
| ------------------- | -------------- |
| Status              | OPEN           |
| Tier                | 1 - Plan       |
| Mode                | attended       |
| Base                | `1a9f9e6`      |
| Review rounds       | 1              |
| Gate runs in parent | 2              |
| Spec                | `AGENTS.md` §7 |

## Plan

Replace the unbounded chained gate with one runner that pays for a verdict, not a transcript.

1. Add `scripts/gates.mjs` and `scripts/verify.mjs`: per-step logs under `.gates/`, one bounded
   summary line per step, the `gate-run` signature, and the `fast`, `precommit` and `full` profiles.
   `precommit` serializes Vitest to avoid the Windows fork-pool crash. Keep the raw chain available
   as `verify:raw`.
2. Point `.githooks/pre-commit` at `verify:precommit`, so the hook can pass in the environment it
   runs in.
3. Extend the round-doc shape with the `Review rounds` and `Gate runs in parent` counters and a
   required `gate-run` signature; enforce it with `scripts/check-round.mjs` and a CI step.
4. Add `documents/rounds/review-brief.md`: one complete delta, one fix pass, at most one
   confirmation round, `P1`/`P2`/`Nits`, an explicit `Verdict:`, and read-only reviewers.
5. Record the six accepted lessons in `documents/lessons.md`, newest first.
6. Add the one-sentence pointer in `AGENTS.md` §7.
7. Record this round.

Three files under the protected set are touched and are reviewed separately by the parent:
`AGENTS.md`, `documents/lessons.md` and `documents/rounds/README.md`. The parent also owns
`documents/agents/protected-doc-reviews.json` and the hash records; this round does not edit that
record.

## Verification

| Gate                            | Command                             | Result                                                                   |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| Precommit profile, first run    | `node scripts/verify.mjs precommit` | 3/4 - the protected-doc tripwire blocked it until the hash record landed |
| Format                          | profile step                        | pass                                                                     |
| Lint                            | profile step                        | pass                                                                     |
| Typecheck                       | profile step                        | pass                                                                     |
| Test, serialized (recorded run) | `node scripts/verify.mjs precommit` | pass - 4/4, 40 files, 509 passed / 3 skipped                             |     |
| Smoke                           | `npm run smoke`                     | pass - build + 67 scenario checks                                        |
| Signature                       | printed by the recorded run         | pasted below                                                             |

The first precommit run stopped on `tests/meta/protected-doc-review.test.ts` because `AGENTS.md`,
`documents/lessons.md` and `documents/rounds/README.md` had moved before their recorded hashes. That
is the tripwire working as designed: the gate goes green again only once the protected review and the
fresh hash records land, which the parent does next. The recorded signature below belongs to the run
after those records.

gate-run 2026-11-06T20:28:26.482Z profile=precommit steps=4/4 lines=4 bytes=522

## Acceptance

The owner accepted all seven items as recommended on 2026-11-06 ("all as recommended"), the tier and
the protected-review flow. Final acceptance follows the merge.

## Deviations

- **The protected-doc tripwire blocked the first gate run.** It was not bypassed: the three protected
  files were sent to the `deepseek-v4-pro` build `0813` review and their hash records were updated in
  the same change, which is the documented `edit -> review -> re-record` flow.
- **One environmental worker exit.** The first serialized run lost `tests/api/series.test.ts` with
  exit `3221226505` (`0xC0000409`); the retry passed. No assertion failed.
- **README and the brief are not round docs.** `scripts/check-round.mjs` skips
  `documents/rounds/README.md` and `documents/rounds/review-brief.md`, and checks the remaining
  `documents/rounds/*.md` files.
- **CI needed full history.** The first CI run failed `Check round docs` with `origin/main...HEAD: no
merge base`: the default shallow checkout has no common ancestor, so the three-dot diff cannot run.
  The job's checkout now uses `fetch-depth: 0`, and `check-round.mjs` falls back to the two-ref diff,
  so a shallow clone elsewhere degrades instead of failing.
- **Hook line corrected.** `AGENTS.md` §7 now says the hook runs `verify:precommit`, matching the hook
  change, alongside the single requested pointer sentence.
