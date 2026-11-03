# Round — mock-parity skill

|        |                                                                       |
| ------ | --------------------------------------------------------------------- |
| Status | CLOSED                                                                |
| Tier   | 2 — Reviewed                                                          |
| Base   | `356c83f`                                                             |
| Spec   | `~/.agents/skills/orchestrator/references/mock-parity.md` (canonical) |
| Ticket | process work (`AGENTS.md`, `documents/agents/orchestrator-policy.md`) |

Provider: `ollama-cloud` (author `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`; DM
screen `clef:27b`, advisory).

## Plan

Adopt the settled mock-parity screen into the orchestrator skill: derive a claim list mechanically
from a mock, score or check it against the built surface, and let a different seat confirm each flagged
atom. It is advisory — it can force `REWORK` on a confirmed spec-required miss, but never writes
`ACCEPTED`. No runtime code or API change.

Scope:

- Canonical skill: `references/mock-parity.md`, `SKILL.md` (procedure 4b, Tiers note, confirmer role,
  `DM:` rule), `references/models.md` (the `clef:27b` screen row), `references/role-contracts.md` (the
  confirmer), `CHANGELOG.md`; `sync-skill.mjs` adds the new file to the manifest.
- MR: `documents/agents/orchestrator-policy.md` (trigger, advisory boundary, optional probe, hard-gate
  conditions), `documents/rounds/README.md` (`## Mock parity` shape + "no mock" rule),
  `scripts/round/decision-probe.mjs` (ported harness), one backlog row.

Acceptance criteria:

1. The canonical `references/mock-parity.md` carries the settled screen: one-way authority,
   spec-required vs mock-only atoms, 0.80/0.90 thresholds and fail-closed, ≥3 absent controls,
   stability re-run, flag → confirm → rework, calibration before any hard gate, and the record shape.
2. `SKILL.md` references it from procedure step 4b, a Tiers note, a Confirmer role, and the `DM:` rule.
3. `references/models.md` records the `clef:27b` screen (HTTPS route, 64K, ≤4 images, `output_tokens:
0`) and the `DM:` rule; `role-contracts.md` records the confirmer; `CHANGELOG.md` records the entry.
4. The MR policy states the trigger, the advisory boundary, the optional probe, and the hard-gate
   conditions; the rounds README carries the record shape and the "no mock" rule.
5. `scripts/round/decision-probe.mjs` is ported with the cloud auth header and fail-closed scoring and
   passes lint.
6. `npm run verify` passes; the canonical manifest verifies (5 files).
7. The labeled calibration set is recorded in the backlog, not built here.

## Verification

| Gate      | Command                                                              | Result                                             |
| --------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| Skill     | `npm run verify:skill`                                               | pass — canonical manifest (5 files) + repo pointer |
| Format    | `npm run format:check`                                               | pass                                               |
| Lint      | `npm run lint`                                                       | pass                                               |
| Types     | `npm run typecheck`                                                  | pass                                               |
| Tests     | `npm test`                                                           | pass — 102 passed, 3 skipped (105)                 |
| Build     | `npm run verify`                                                     | pass                                               |
| Canonical | `node ~/.agents/skills/orchestrator/scripts/sync-skill.mjs --verify` | pass — 5 files                                     |

The 3 skipped tests are the pooled `pg` ministry cases (no `TEST_DATABASE_URL` locally); they run in
CI, where the `verify` job provisions Postgres.

## Review

Tier 2: the flash worker authored the canonical and MR files; the pro session reviewed the diff.

**Standards — PASS.** The screen is advisory in every file; the hard gate is explicitly deferred to a
calibration set and a protected-doc round; the probe is fail-closed and adds the cloud auth header; the
manifest covers the new reference. Two cosmetic notes, accepted: the `4b` sub-step renders as a
continuation of step 4 (consistent with School-Collab's `2b` convention), and the canonical markdown
was formatted with Prettier defaults (style-only churn, hashes regenerated).

**Spec — PASS.** Criteria 1–7 met by the canonical files, the MR policy/README/probe, and the gate
numbers above.

## Acceptance

| #   | Criterion                                                  | Met | Evidence                                                                |
| --- | ---------------------------------------------------------- | --- | ----------------------------------------------------------------------- |
| 1   | Canonical mock-parity reference carries the settled screen | yes | `references/mock-parity.md`                                             |
| 2   | `SKILL.md` references it (4b, Tiers, Confirmer, `DM:`)     | yes | `SKILL.md:32-33,51-52,76-81,114-115`                                    |
| 3   | `models.md`/`role-contracts.md`/`CHANGELOG.md` updated     | yes | `models.md:18,61-62`; `role-contracts.md:31-35`; `CHANGELOG.md`         |
| 4   | MR policy + rounds README carry trigger/boundary/record    | yes | `documents/agents/orchestrator-policy.md`; `documents/rounds/README.md` |
| 5   | Probe ported with cloud auth and fail-closed scoring       | yes | `scripts/round/decision-probe.mjs`; lint pass                           |
| 6   | `verify` passes; manifest verifies (5 files)               | yes | Verification table                                                      |
| 7   | Calibration set recorded in the backlog                    | yes | `documents/backlog.md`                                                  |

Verdict: **ACCEPTED**.

## Deviations

- The screen ships **advisory only**. The hard gate waits for the labeled calibration set (≥100 rows,
  false-pass 0, false-rework ≤10 %, ≥3 rounds) and a protected-doc round.
- School-Collab adoption is deferred to its own spec + protected repo-skill round.
- `decision-probe.mjs` is not wired into `verify`/CI — a model endpoint is not a repo precondition.
