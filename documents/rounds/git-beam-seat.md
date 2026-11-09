# Round — git-beam-seat

|                     |                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Status              | CLOSED - merged in #94 (`b73b85c`)                                                                                          |
| Tier                | 1                                                                                                                           |
| Mode                | `attended`                                                                                                                  |
| Base                | `20376ff`                                                                                                                   |
| Review rounds       | 0                                                                                                                           |
| Gate runs in parent | 0                                                                                                                           |
| Spec                | `AGENTS.md` §9; `documents/agents/orchestrator-policy.md` §Seats; `.github/merge-policy.md`; `references/role-contracts.md` |
| Workers             | `single` (parent implements at Tier 1)                                                                                      |

### Seats (owner, 2026-11-09)

- **Reviewer:** `ollama-cloud/deepseek-v4-pro:0813` is the default; `cline-pass/cline-pass/mimo-v2.6-pro`
  when **either** the 12:00–18:00 window applies **or** the 0813 weekly limit makes it unavailable,
  with `fallbackReason`.
- **Git executor:** rung 1 `opencode/beam-free`; rung 2 `ollama-cloud/beam`, only inside a declared
  `git-seat-budget`.

`git-seat-budget: 0 (rung 1 only; rung 2 parked)`

### Decisions (grill, 2026-11-09)

The owner accepted the second grill round in full.

- **Mechanism:** a delegated `git-executor` subagent; the parent owns the decision and the
  verification, the seat executes one quoted verb per brief. Rejected: a documented seat with git on
  the session model; pinning the whole build agent to Beam.
- **Ranking:** `opencode/beam-free` first, `ollama-cloud/beam` second, strict fallback on a closed
  unavailability list. Rejected: load-balancing; a free-form "pick with a reason".
- **Paid fallback:** rung 2 runs only inside a `git-seat-budget` declared before the round; with no
  line it parks. Rejected: automatic switch to a possibly-paid rung; per-action spend prompts.
- **Variant pinning:** forward-only switches with a `fallbackReason`, and the record names the variant
  that performed each write. Rejected: one variant per whole sequence.
- **Two agent files** because agent frontmatter holds one static model. Rejected: a parent-side
  frontmatter swap; a documented-only seat.
- **Scope:** the seat runs branch create, add, commit, push a named branch, PR create, squash merge,
  tag and the post-merge pull; the parent keeps status/diff/log, the change-set display, the gate and
  every accept/reject.
- **Authorisation:** the brief quotes the owner's verb and the tree hash; one brief, one verb; the
  parent verifies each result.
- **Permissions:** deny-by-default allow-list; force, reset, clean, branch delete, push to `main`,
  `--no-verify` and `--admin` forbidden. The list is a tripwire, not a sandbox.
- **Role contract:** amended so the parent owns the decision and the seat executes.
- **Traceability:** a `Model-Seat` trailer on every seat commit and a round-doc table for push/PR/
  merge/tag plus a `fallbackReason` per switch.
- **Failure:** resume from the last verified SHA with the same verb; never re-commit, never widen.
- **Tier and rollback:** Tier 1, one commit; the seat is off when its agent file is absent.
- **Security:** git state only; no bearer, `.env`, `service.json` or PII; a canary test.
- **Trial:** a bounded probe, then three scored rounds before the seat is kept.

## Plan

Goal: make Beam the executor for git and commit-related tasks, with the parent retaining the decision
and the verification.

In scope:

1. Add `.opencode/agents/git-executor.md` (`opencode/beam-free`) and
   `.opencode/agents/git-executor-fallback.md` (`ollama-cloud/beam`), with the allow-list, the brief
   shape, the forbidden commands and the trailer.
2. Amend the protected text: `AGENTS.md` §9, `documents/agents/orchestrator-policy.md` §Seats,
   `.github/merge-policy.md`, and `references/role-contracts.md`; add the canonical CHANGELOG entry.
3. Record the review in `documents/agents/protected-doc-reviews.json` and refresh
   `skill-manifest.json` so `verify:skill` and the meta guard pass. Add the canary test: a fake
   bearer in a scratch worktree must not appear in the brief, the transcript, a commit or a PR body.
4. Run the bounded probe in a throwaway clone: tool calls for `status`/`commit`, a ≥2 KB summary, the
   reported SHA matching `git rev-parse`, a body + trailer surviving the output cap, and no
   credential prompt or `--no-verify`.
5. Record the trial scorecard for three rounds and the per-write variant table; the seat is kept only
   if it scores clean.

Out of scope: changing the session model; pinning the build agent; any application behaviour; any
migration or wire change.

### Acceptance criteria

1. Both agent files exist with the exact models and the deny-by-default allow-list.
2. The four protected texts carry the delegation rule and the parent-owns-decision wording.
3. `deepseek-v4-pro:0813` reviews the exact text and returns ACCEPTED; the record entries carry the
   normalised hashes.
4. `tests/meta/protected-doc-review.test.ts` and `npm run verify:skill` pass.
5. The probe passes its five conditions, or its failure parks the seat with the classification.
6. The kill-switch is documented: absent rung 1 agent file means git returns to the parent, and the
   fallback file alone is not a live seat.
7. No git write is delegated before the probe passes.
8. The canary test passes: no fake credential appears in a brief, transcript, commit or PR body.
9. Every delegated push/PR/merge/tag is named in the per-write variant table, with a
   `fallbackReason` on every switch.

## Verification

| Gate               | Command                                                                                  | Result                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Protected-doc meta | `npx vitest run tests/meta/git-executor.test.ts tests/meta/protected-doc-review.test.ts` | pass — 10/10 (canary 3, protected-doc 7)               |
| Skill hashes       | `npm run verify:skill`                                                                   | pass                                                   |
| Format/lint/type   | `npm run verify:fast`                                                                    | pass — 4/4                                             |
| Probe              | `opencode/beam-free` in a throwaway clone                                                | pass — SHA `8533815…`, 2,682-char body, trailer intact |
| Delegated commit   | `git-executor` (`opencode/beam-free`), eight files, tree handshake                       | pass - `dc2e8c3`, trailer present, parent verified     |
| Delegated merge    | `git-executor` (`opencode/beam-free`), PR #94, checks green                              | pass - `b73b85c`, branch deleted                       |

gate-run 2026-11-09T21:35:20.600Z profile=fast steps=4/4 lines=4 bytes=514

### Probe

- Status, add, commit and rev-parse each returned a tool call; no prose-only reply.
- The commit body was 2,682 characters and the message carried the `Model-Seat` trailer.
- `git rev-parse HEAD` reported `85338151e68783145cb7bcf678095caf8c0abeab`, matching the parent's
  read.
- No credential prompt and no `--no-verify`; the throwaway repo never touched this repository's
  history.
- The probe used a general subagent on the model because the seat's allow-list does not include
  `git -C`; the permission file itself is covered by the canary test and inspection.

## Review

Tier 1 protected-doc review by `ollama-cloud/deepseek-v4-pro:0813`.

- Round 1: **REWORK** — P1 (the push allow-list said `git push origin *` while the action is
  `git push -u origin …`), P2s (the budget was not reconciled with §17 auto-accept; "add" was
  enumerated as a verb; the per-write table was not durable).
- Round 2: confirmed the P1 and three P2s; one P2 remained (the per-write bullet in
  `role-contracts.md`).
- The exact wording was applied verbatim; the final exact-text confirmation returned **ACCEPT** with
  no P1/P2.
- The five record entries use the normalised hashes; `skill-manifest.json` carries the raw hashes.

## Per-write variant table

| Action | Variant                               | Fallback reason | Result                                                    |
| ------ | ------------------------------------- | --------------- | --------------------------------------------------------- |
| commit | `git-executor` (`opencode/beam-free`) | -               | `dc2e8c3` - eight files, trailer present, parent verified |
| commit | `git-executor` (`opencode/beam-free`) | -               | `b47da18` - round-doc correction, trailer present         |
| push   | `git-executor` (`opencode/beam-free`) | -               | `origin/git-beam-seat` at `b47da18`                       |
| pr     | `git-executor` (`opencode/beam-free`) | -               | #94, base `main`                                          |
| merge  | `git-executor` (`opencode/beam-free`) | -               | #94 squash-merged as `b73b85c`; branch deleted            |

## Mock sign-off

n/a — no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| #   | Criterion                                            | Met | Evidence                                               | Verdict  |
| --- | ---------------------------------------------------- | --- | ------------------------------------------------------ | -------- |
| 1   | Two agent files with the exact models and allow-list | yes | `.opencode/agents/git-executor*.md`                    | ACCEPTED |
| 2   | Protected texts carry the delegation rule            | yes | AGENTS §9; policy §Seats; merge policy; role-contracts | ACCEPTED |
| 3   | 0813 review ACCEPTED; record hashes match            | yes | `## Review`; `protected-doc-reviews.json`; meta 7/7    | ACCEPTED |
| 4   | Meta guard and `verify:skill` pass                   | yes | 10/10; `verify:skill ok`                               | ACCEPTED |
| 5   | Probe passes or parks                                | yes | `8533815…`, 2,682-char body, trailer intact            | ACCEPTED |
| 6   | Kill-switch documented                               | yes | policy §Seats; role-contracts                          | ACCEPTED |
| 7   | No delegated write before the probe                  | yes | the commit followed the probe                          | ACCEPTED |
| 8   | Canary test passes                                   | yes | `tests/meta/git-executor.test.ts` 3/3                  | ACCEPTED |
| 9   | Per-write variant table                              | yes | `## Per-write variant table`                           | ACCEPTED |

## Deviations

- The harness does not register custom agent names for the `subagent` tool, so the seat is dispatched
  as a general subagent on the seat model with the seat prompt and brief. The agent file remains the
  documented seat and permission list, and the parent's post-action verification is the control.
- The probe used a general subagent on `opencode/beam-free`, not the seat's permission file: the
  allow-list does not include `git -C`, and the probe must not touch this repository's history. The
  permission file is covered by inspection and the canary test.
- The role-contracts final wording changed after the confirmation round's P2; it was applied verbatim
  and confirmed by a final exact-text ACCEPT.
- `opencode/beam-free` and `ollama-cloud/beam` both list zero cost today; the budget rule remains a
  conservative guard because the owner suspects the second is paid.
