# Round — orchestrator skill repair

|        |                                                        |
| ------ | ------------------------------------------------------ |
| Status | CLOSED                                                 |
| Tier   | 2 — Reviewed                                           |
| Base   | `de00239`                                              |
| Spec   | `AGENTS.md`, `documents/agents/orchestrator-policy.md` |

Provider: `ollama-cloud` (author/acceptance `deepseek-v4-pro:0813`; reviewer gate `glm-5.3`).

## Plan

Move the orchestrator procedure to the shared, owner-authored skill at
`~/.agents/skills/orchestrator/` and leave only the repo delta here. No runtime or API behaviour
changes.

Acceptance criteria:

1. `.opencode/skills/orchestrator/SKILL.md` is removed; the canonical skill at
   `~/.agents/skills/orchestrator/` is the only procedure source.
2. `documents/agents/orchestrator-policy.md` records the repo delta: tiers 0–2, the seats, the gates,
   the non-adoption list, and the superseded pinned-seat wording.
3. `AGENTS.md` points at the canonical skill and the policy, and Tier 2 separates the worker
   (implementer) from the reviewer gate.
4. `.opencode/agents/reviewer.md` pins `ollama-cloud/deepseek-v4-pro:0813`.
5. `scripts/verify-skill.mjs` checks the canonical files/hashes, the seat model ids, and the repo
   pointer; `npm run verify` runs it; CI inherits it through `npm run verify`.
6. Every rule in the removed local skill is preserved in the canonical skill, the policy, or recorded
   as superseded (map below).
7. `npm run verify` passes and the canonical manifest verifies.
8. `documents/backlog.md` records the School-Collab fork, packaging, and the CI canonical gap.

## Rule preservation map

| Local skill rule                                                        | Destination                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Tiers table (0–2)                                                       | Canonical `Tiers` (Tier 3 catalogued); policy runs 0–2                     |
| "Default to the lowest safe tier"                                       | Canonical `Tiers`                                                          |
| "Tier 3 + UI tester deferred"                                           | Policy `Tiers`                                                             |
| Roles: parent / reviewer / owner                                        | Canonical `Roles` (worker added at Tier 2+)                                |
| Procedure steps 0–6                                                     | Canonical `Procedure`                                                      |
| Reviewer brief template                                                 | Canonical `Reviewer brief template`                                        |
| Round docs and lessons                                                  | Canonical `Round docs and lessons`                                         |
| Full Tier 3 + UI tester deferred                                        | Policy `Deliberately not adopted`                                          |
| Unattended rounds not adopted                                           | Policy `Deliberately not adopted`                                          |
| Protected-doc hash gates not adopted                                    | Policy `Deliberately not adopted`                                          |
| Parallel workers/worktrees not adopted                                  | Policy `Deliberately not adopted`                                          |
| GitHub issue/triage labels not adopted                                  | Policy `Deliberately not adopted`                                          |
| Pinned model seats (inherit session; never fail on an unavailable seat) | **Superseded** — policy `Superseded: pinned model seats` + canonical seats |

## Verification

| Gate      | Command                                                              | Result                                                  |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| Skill     | `npm run verify:skill`                                               | pass — canonical files/hashes + seat ids + repo pointer |
| Fast      | `npm run verify:fast`                                                | pass — format, lint, typecheck, 97 tests                |
| Full      | `npm run verify`                                                     | pass — `verify:skill` + `verify:fast` + build           |
| Canonical | `node ~/.agents/skills/orchestrator/scripts/sync-skill.mjs --verify` | pass — 4 files                                          |

## Review

Independent Tier 2 review on `ollama-cloud/glm-5.3` (the author is the pro session, so the gate is a
different family). Findings adjudicated against the source; both P2s fixed.

**Standards — FINDINGS (2 P2, both fixed).**

- **P2** `AGENTS.md:75` — §7 still described `verify` as `verify:fast` + build, contradicting
  `package.json` and the policy. Fixed: §7 now lists `verify:skill` and the full `verify` chain.
- **P2** the round-doc header omitted the provider/seat traceability line the adopted skill requires.
  Fixed: added below the header.

**Spec — PASS.** All eight criteria met, with evidence in the reviewer's verdict: the removed skill,
the policy contents, the `AGENTS.md` pointers and Tier 2 split, the reviewer pin, the `verify:skill`
wiring, the preservation map checked against the base skill, the manifest + `verify:skill` pass, and
the backlog entries.

## Acceptance

| #   | Criterion                                                         | Met | Evidence                                                      |
| --- | ----------------------------------------------------------------- | --- | ------------------------------------------------------------- |
| 1   | Local SKILL.md removed; canonical is the only source              | yes | `.opencode/skills` empty; `AGENTS.md:4`; policy `:3-4`        |
| 2   | Policy records the repo delta                                     | yes | `documents/agents/orchestrator-policy.md`                     |
| 3   | AGENTS.md points at canonical + policy; Tier 2 splits worker/gate | yes | `AGENTS.md:3-5,26-28,37-38`                                   |
| 4   | `reviewer.md` pins the pro seat                                   | yes | `.opencode/agents/reviewer.md:4`                              |
| 5   | `verify:skill` checks files/hashes/ids/pointer; `verify` + CI     | yes | `scripts/verify-skill.mjs`; `package.json:19-20`; `ci.yml:30` |
| 6   | Every local rule preserved or superseded                          | yes | preservation map; reviewer Spec #6                            |
| 7   | `verify` passes; manifest verifies                                | yes | Verification table                                            |
| 8   | Backlog records fork/packaging/CI gap                             | yes | `documents/backlog.md:15-17`                                  |

Verdict: **ACCEPTED**.

## Deviations

- The branch is based on `feat/drizzle-ministries`, whose ticket 02 is still uncommitted. Stack
  registration and submit are deferred until ticket 02 commits; this repair commit is rebased on top
  then.
- In CI the canonical skill is absent, so `verify:skill` checks only the repo pointer there; the
  canonical file/hash check is local. Recorded in the backlog.
- Owner directive 2026-11-03 pins `ollama-cloud/deepseek-v4-pro:0813` as the reviewer in all tiers;
  this round's gate ran on `glm-5.3` before that directive, and the policy and skill were updated
  after.
