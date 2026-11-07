# Orchestrator policy — MemberRegistrations

The procedure is the shared `orchestrator` skill (canonical:
`~/.agents/skills/orchestrator/SKILL.md`, version in its `CHANGELOG.md`). This file is the repo
delta: what this repository enables, the gates it runs, and what it deliberately does not adopt.
`AGENTS.md` owns the non-negotiables; this file records the local choices the skill defers to.

## Tiers in this repo

- **Tier 0 (Solo)** — docs, config, or a contained change the owner explicitly places at Tier 0. The
  parent implements, self-reviews and self-accepts; the commit body is the record.
- **Tier 1 (Plan)** - a behavioural change. Approved spec + parent implements + written acceptance.
- **Tier 2 (Reviewed)** — multi-file behaviour, migrations, auth, wire contracts or risk. Tier 1 plus
  an independent reviewer (`code-review` Standards + Spec; fallback: the read-only `reviewer` agent).
- **Tier 3 and a dedicated UI tester are not adopted here.** The V2 UI gate is the minimal
  Playwright/axe/live-vs-mock check in ticket 19.

The skill catalogues the Tier 3 seats for repos that enable them; this policy disables the tier.

**Spec review (all tiers).** Every behavioural spec, new or amended, is reviewed by a **separate**
`ollama-cloud/deepseek-v4-pro:0813` session - never the author - **before the implementer builds
against it** (the parent at Tier 0-1, the worker at Tier 2). The procedure is the canonical skill's
Procedure step 1b; this paragraph records the repo's model choice and record.
`cline-pass/cline-pass/mimo-v2.6-pro` is admissible only when no provider answers 0813, with the
reason recorded. The verdict and the reviewed revision go
in the spec's status line plus the round doc, or the commit body at Tier 0. A typo, formatting or
clarifying edit keeps only its changelog line. This is separate from the plan gate and the code review:
the spec is the contract the implementer reads, so it is reviewed before the work starts, not after it
lands.

## Seats

| Seat                                                        | Model                                   |
| ----------------------------------------------------------- | --------------------------------------- |
| Worker (Tier 2+ implementer)                                | `ollama-cloud/deepseek-v4.1-flash:1017` |
| Reviewer / plan gate / spec review / acceptance (all tiers) | `ollama-cloud/deepseek-v4-pro:0813`     |

The reviewer is `deepseek-v4-pro:0813` in every tier. The gate must not be the author, so at Tier 2+
the flash worker implements and the pro session reviews; a pro session does not both implement and
review. An unavailable gate **parks** the round; a fallback needs the owner's recorded approval.

`deepseek-v4-pro:0813` dispatches only with the output-limit override in
`~/.config/opencode/opencode.json` (`limit.output = 65536`); the skill's `references/models.md` records
why (the catalog conflates the 1M context window with the output cap).

## Gates

- `npm run verify:fast` = `format:check` + `lint` + `typecheck` + `test`.
- `npm run verify` = `verify:skill` + `verify:fast` + `build`; this is the required gate.
- `npm run smoke` = build + compiled-server PGlite exercise; run it for migrations, auth,
  wire-contract or cross-cutting changes.
- `npm run verify:skill` checks the installed canonical skill (files, hashes, seat model ids) and the
  repo pointer below. In CI the canonical is absent, so CI checks only the repo-side pointer and the
  script reports the canonical check as skipped.

## Mock parity

- Applies at Tiers 1–3 when a round changes a surface with a mock under the local, git-ignored
  `mockups/**`; otherwise record "no mock".
- The screen is advisory: it flags atoms, the reviewer confirms each with `path:line`, and only
  confirmed misses on **spec-required** atoms force `REWORK`; mock-only atoms are mock corrections.
- `clef:27b` is optional; `scripts/round/decision-probe.mjs` is the harness. It is not wired into
  `verify`/CI — a model endpoint is not a repo precondition.
- A hard gate needs the labeled calibration set (≥100 rows, false-pass 0, false-rework ≤10%, ≥3
  rounds) and a protected-doc round.

## Parallel workers

- Opt-in per round, recorded as `Workers: parallel (tracks: …)` or `(slices: …)`.
- Tracks must be similar-sized and genuinely disjoint; an uneven pair runs serially, because the
  slowest track plus setup and integration dominates the wall-clock.
- Persistent worktree slots are mandatory; a fresh slot pays a full install.
- The parent owns every shared file and all git; migrations serialize. Two building workers by default;
  workers run unit/API tests on PGlite only (never a browser/headless harness — e2e belongs to the
  parent/CI post-merge); the parent's merged `verify` is the gate. The 2-worker cap is a memory guard:
  record the peak RSS.
- Each round verifies only its own track; the cross-track integration is a post-merge pass on `main`.
- Full rules: `~/.agents/skills/orchestrator/references/parallel-workers.md`.
- Incident evidence (once the owner accepts it): `documents/lessons.md`.

## Protected documents

`AGENTS.md`, `documents/agents/orchestrator-policy.md`, `documents/agents/component-first.md`,
`documents/lessons.md`, `documents/rounds/README.md`, `.github/merge-policy.md`, and the canonical
orchestrator skill's markdown
are review-gated: a change lands only after `deepseek-v4-pro:0813` reviews the exact text, with
`cline-pass/cline-pass/mimo-v2.6-pro` only as a recorded fallback. The record is `documents/agents/protected-doc-reviews.json`; the
guard is `tests/meta/protected-doc-review.test.ts`. The amended document, its record entry and any
guard change land in one commit; the canonical checks skip in CI (the skill is not installed there),
while the repo checks always run.

## Unattended rounds

Adopted 2026-11-04 as a modifier on a round, never a tier. `AGENTS.md` §17 owns the rule. The local
choices:

- The go-forward `grill-me` round at the end of a round defaults to **auto-accept**; the owner can still
  run a round attended by saying so.
- A migration, a wire-contract change, security/auth, tenant isolation, or deleting a public route still
  parks for the owner unless they pre-authorised that specific round by name. "Go unattended" authorises
  the round's commit/push/PR/merge, not those gates.
- The round doc records `Mode: unattended (auto-accept recommendations)`, and every accepted decision is
  written into the owning **spec** as well as the round doc — a pin never lives only in a round doc.

## Deliberately not adopted

- **Full Tier 3 and a dedicated UI tester** - deferred; the V2 gate is the minimal Playwright/axe/
  live-vs-mock check in ticket 19. Revisit when the UI is stable.
- **GitHub issue/triage labels** - use `documents/backlog.md` until a tracker is adopted.

### Superseded: pinned model seats

The previous local skill carried this rule:

> **Pinned model seats** — inherit the session model. Prefer a different model for the reviewer when
> the environment offers one, but never make the workflow fail because a seat is unavailable.

**Superseded 2026-11-03** by the shared skill: the seats are named, the gate must differ from the
author's family, and an unavailable gate **parks** the round rather than silently degrading. The old
wording is kept here so the ruling that changed stays visible, not an absence.
