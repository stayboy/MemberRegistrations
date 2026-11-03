# Round docs

One Markdown file per Tier 1–2 change: `documents/rounds/<slug>.md`. The folder is committed but
**ephemeral** — after the round closes it can be bulk-deleted; the spec, lessons and git history are
the durable record.

## Template

```md
# Round — <slug>

|        |                                                               |
| ------ | ------------------------------------------------------------- |
| Status | OPEN / CLOSED / PARKED                                        |
| Tier   | 0 / 1 / 2                                                     |
| Base   | `<short sha>`                                                 |
| Spec   | `documents/specs/<file>.md` (or `AGENTS.md` for process work) |

## Plan

Goal, scope, expected files, acceptance criteria (numbered).

## Verification

| Gate | Command          | Result    |
| ---- | ---------------- | --------- |
| ...  | `npm run verify` | pass/fail |

## Mock parity (when a mock exists)

| Claim | Type | State | Answer (max prob) | Threshold | Confirmed by | Disposition |
| ----- | ---- | ----- | ----------------- | --------- | ------------ | ----------- |

## Acceptance

One row per criterion: met/not met, evidence (`file:line` or test name), and the verdict
(`ACCEPTED`, `REWORK`, `PARKED`).

## Deviations

Scope changes, skipped gates, residuals.
```

Rules:

- The parent is the only writer. Workers/reviewers return blocks; the parent persists them.
- Tier 2 records the reviewer's Standards and Spec verdicts under `## Review`.
- Tier 0 records only in the commit body.
- Never put a round doc in `documents/specs/`.
- A round with no mock records "no mock"; it never skips silently.
