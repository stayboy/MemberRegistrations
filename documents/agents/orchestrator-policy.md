# Orchestrator policy — MemberRegistrations

The procedure is the shared `orchestrator` skill (canonical:
`~/.agents/skills/orchestrator/SKILL.md`, version in its `CHANGELOG.md`). This file is the repo
delta: what this repository enables, the gates it runs, and what it deliberately does not adopt.
`AGENTS.md` owns the non-negotiables; this file records the local choices the skill defers to.

## Tiers in this repo

- **Tier 0 (Solo)** — docs, config, or a contained change the owner explicitly places at Tier 0. The
  parent implements, self-reviews and self-accepts; the commit body is the record.
- **Tier 1 (Plan)** — a behavioural change. Approved spec + implementation + written acceptance.
- **Tier 2 (Reviewed)** — multi-file behaviour, migrations, auth, wire contracts or risk. Tier 1 plus
  an independent reviewer (`code-review` Standards + Spec; fallback: the read-only `reviewer` agent).
- **Tier 3 and a dedicated UI tester are not adopted here.** The V2 UI gate is the minimal
  Playwright/axe/live-vs-mock check in ticket 19.

The skill catalogues the Tier 3 seats for repos that enable them; this policy disables the tier.

## Seats

| Seat                                          | Model                                   |
| --------------------------------------------- | --------------------------------------- |
| Worker (Tier 2+ implementer)                  | `ollama-cloud/deepseek-v4.1-flash:1017` |
| Reviewer / plan gate / acceptance (all tiers) | `ollama-cloud/deepseek-v4-pro:0813`     |

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

## Deliberately not adopted

- **Full Tier 3 and a dedicated UI tester** — deferred; the V2 gate is the minimal Playwright/axe/
  live-vs-mock check in ticket 19. Revisit when the UI is stable.
- **Unattended rounds** — every round is owner-attended.
- **Protected-doc hash gates** — the approved spec and git history are the control.
- **Parallel workers and worktrees** — one writer per working tree; the parent is the only writer.
- **GitHub issue/triage labels** — use `documents/backlog.md` until a tracker is adopted.

### Superseded: pinned model seats

The previous local skill carried this rule:

> **Pinned model seats** — inherit the session model. Prefer a different model for the reviewer when
> the environment offers one, but never make the workflow fail because a seat is unavailable.

**Superseded 2026-11-03** by the shared skill: the seats are named, the gate must differ from the
author's family, and an unavailable gate **parks** the round rather than silently degrading. The old
wording is kept here so the ruling that changed stays visible, not an absence.
