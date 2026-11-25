# Round docs

One Markdown file per Tier 1–2 change: `documents/rounds/<slug>.md`. The folder is committed but
**ephemeral** — after the round closes it can be bulk-deleted; the spec, lessons and git history are
the durable record.

## Template

```md
# Round — <slug>

|                        |                                                                            |
| ---------------------- | -------------------------------------------------------------------------- |
| Status                 | OPEN / CLOSED / PARKED                                                     |
| Tier                   | 0 / 1 / 2                                                                  |
| Mode                   | `attended` / `unattended (auto-accept recommendations)`                    |
| Base                   | `<short sha>`                                                              |
| Review rounds          | 0 / 1 / 2                                                                  |
| Gate runs in parent    | 0                                                                          |
| Spec                   | `documents/specs/<file>.md` (or `AGENTS.md` for process work)              |
| Workers                | `single` / `parallel (tracks: A, B)` / `parallel (slices: A, B)`           |
| Implementer            | `parent <provider>/<model> (<scope>); worker <provider>/<model> (<scope>)` |
| Verbs this round needs | `branch, commit, push, pr, merge` (or `n/a — no git writes`)               |

## Seats

| Seat | Picked (local) | Window | Class          | Candidate probed            | Basis |
| ---- | -------------- | ------ | -------------- | --------------------------- | ----- |
| ...  | `YYYY-MM-DD`   | in/out | `worker-flash` | `provider/model` — answered | ...   |

One row per dispatch, with the class, the candidate the day's probe chose, and the basis. The probe
outcome holds for the local day, and a substitution records why (see
`documents/agents/orchestrator-policy.md`, "Seat health is probed once per round").

## Grill

The numbered frontier, each question naming its **recommendation** and its **cost** (AGENTS.md section 2).
An unattended round must carry this section (R7); a Tier 0 record lives only in the commit body and has
none. **The gate proves a grill opened** - at least one numbered question naming both parts - and nothing
more: whether the frontier was whole, and whether the answers are worth anything, is the reviewer's
control, exactly as it is for the Implementer row.

## Plan

Goal, scope, expected files, acceptance criteria (numbered).

## Verification

| Gate | Command          | Result    |
| ---- | ---------------- | --------- |
| ...  | `npm run verify` | pass/fail |

A round that changes any seat rule adds a verification row to the table above saying the seat files and
`.github/merge-policy.md` were re-read against the new paragraph, because the hash tripwire never
proves two files agree (see `documents/agents/orchestrator-policy.md`, "A drift is asymmetric").

The section ends with the gate-run signature line, pasted verbatim:

    gate-run <ISO-8601 UTC> profile=<name> steps=<passed>/<total> lines=<n> bytes=<n>

## Git writes

| Brief | Actor                 | Verb   | Variant             | Reason |
| ----- | --------------------- | ------ | ------------------- | ------ |
| 1     | `git-executor rung 2` | branch | `<class candidate>` | -      |

One row per brief. The row count **is** the round's git spend; the default cap is 12 briefs and the
arithmetic is `1 branch + N commits + 1 push + 1 pr + 1 merge` (see
`documents/agents/orchestrator-policy.md`). An `Actor` of `parent` carries the reason the seat could
not run that verb, and a variant switch carries its `fallbackReason`.

## Mock sign-off

| Surface | Mock | Capture | sha256 | Signer | Date | Verdict |
| ------- | ---- | ------- | ------ | ------ | ---- | ------- |

The **Mock** cell names the design as mockups/<set>/<file>.png - the set folder is part of the record. A signature
request additionally names the **absolute folder on the owner’s machine**, which is a working location (the folder is
git-ignored and per-worktree) and does not belong in this record; the state, its hash and what changed do (AGENTS.md
section 14).

## Mock parity

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

The `Implementer` row is a **declaration, not attestation**: `check-round.mjs` enforces its shape and,
at Tier 2, a `worker` segment (or a `Tier 2 parent-authored: <reason>` line in `## Deviations`, bare or
bulleted with `-`/`*`, with at least 20 characters of reason). The cell is split on `;` with each
segment trimmed; a segment is `parent|worker <provider>/<model>` with an optional `(<scope>)`. A typed
string cannot prove a dispatch — the reviewer's reading of the diff is the control. Only a round doc
changed by a round carries the row; there is no historical backfill.

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
- An **unattended** round carries `## Grill` (R7): at least one numbered question, each naming a
  recommendation and a cost. The gate proves a grill opened; whether the frontier was whole is the
  reviewer's control, because no regex can tell a whole frontier from a satisfied one.
- Every round doc carries `## Mock sign-off` (or `n/a — no user-visible surface`) and `## Mock parity`
  (or `n/a — no mock`).
- A round with no mock records "no mock"; it never skips silently.
- **A round that changes a user-visible surface commits the picture.** The `## Mock sign-off` row names
  the surface's re-run baseline under `ui/e2e/baseline/` as well as the signed mock, so the reviewer reads
  the build against the drawing instead of the diff statistics. A sign-off that names no capture, on a
  round whose diff carries none, is a `P1` finding (owner, 2026-11-15). The rule travels in two directions
  and they are not substitutes: a **mock re-cut** moves the drawing to the build, a **baseline re-capture**
  (`npm run ui:capture`) records the build so it can be set against the drawing, and a round that says
  "matches" without the capture is a claim with no artefact. A new screen has no baseline until its entry
  is added to the capture spec, and that entry is part of the same round. Five defects in the MVP release
  were invisible to code review, to `npm run verify` and to the test suite, and visible only in a
  photograph.
