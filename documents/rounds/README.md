# Round docs

One Markdown file per Tier 1–2 change: `documents/rounds/<slug>.md`. The folder is committed but
**ephemeral** — after the round closes it can be bulk-deleted; the spec, lessons and git history are
the durable record.

## Template

```md
# Round — <slug>

|                     |                                                                  |
| ------------------- | ---------------------------------------------------------------- |
| Status              | OPEN / CLOSED / PARKED                                           |
| Tier                | 0 / 1 / 2                                                        |
| Mode                | `attended` / `unattended (auto-accept recommendations)`          |
| Base                | `<short sha>`                                                    |
| Review rounds       | 0 / 1 / 2                                                        |
| Gate runs in parent | 0                                                                |
| Spec                | `documents/specs/<file>.md` (or `AGENTS.md` for process work)    |
| Workers             | `single` / `parallel (tracks: A, B)` / `parallel (slices: A, B)` |

## Plan

Goal, scope, expected files, acceptance criteria (numbered).

## Verification

| Gate | Command          | Result    |
| ---- | ---------------- | --------- |
| ...  | `npm run verify` | pass/fail |

The section ends with the gate-run signature line, pasted verbatim:

    gate-run <ISO-8601 UTC> profile=<name> steps=<passed>/<total> lines=<n> bytes=<n>

## Mock parity (when a mock exists)

| Claim | Type | State | Answer (max prob) | Threshold | Confirmed by | Disposition |
| ----- | ---- | ----- | ----------------- | --------- | ------------ | ----------- |

## Acceptance

One row per criterion: met/not met, evidence (`file:line` or test name), and the verdict
(`ACCEPTED`, `REWORK`, `PARKED`).

## Deviations

Scope changes, skipped gates, residuals.
```

`Review rounds` and `Gate runs in parent` are counters, and they are self-reported. The `gate-run`
signature is the exception: the gate runner prints it and the round doc must paste it verbatim.

Every review is dispatched against `documents/rounds/review-brief.md`: one complete delta, findings
batched into one fix pass, at most one confirmation round, `P1`/`P2`/`Nits` and an explicit verdict.

Rules:

- The parent is the only writer and integrator. Workers/reviewers return blocks; the parent persists
  them. Parallel workers run only under `references/parallel-workers.md`; a parallel round records
  `Workers: parallel (…)` and verifies only its own track's diff, and the cross-track integration is a
  post-merge pass on `main`.
- Tier 2 records the reviewer's Standards and Spec verdicts under `## Review`.
- Tier 0 records only in the commit body.
- Never put a round doc in `documents/specs/`.
- A round with no mock records "no mock"; it never skips silently.
