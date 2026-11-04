# Backlog

Deferred work, most important first. Round docs and lessons point here instead of silently cutting
scope. Move an item to a GitHub issue only when the tracker is adopted.

| Item                                      | Why deferred                                                                                              | Revisit when                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Full Tier 3 round and dedicated UI tester | A UI is planned; ticket 19 ships a minimal Playwright + axe + live-vs-mock gate instead                   | The V2 UI is stable and the flake cost is acceptable                   |
| Per-officer authorization                 | v1 uses one shared bearer token; `X-Actor-Id` is audit only                                               | Officers need scoped access                                            |
| Shepherding cadence and overdue flags     | Policy differs per church; the API exposes `lastCalledOn` and `membersNeverCalled`                        | A reporting UI or a cadence rule is agreed                             |
| Bulk assignment                           | One member per request keeps the consent gate simple                                                      | A UI needs multi-select assignment                                     |
| Notifications (email/SMS)                 | Out of v1                                                                                                 | A delivery provider and consent model exist                            |
| Server-side branch protection             | GitHub returns 403 for rulesets/branch protection on a private Free repository                            | A second contributor or a merge queue needs enforcement                |
| Coverage threshold                        | A number without a policy invites gaming                                                                  | The owner sets a target                                                |
| Labeled mock-parity calibration set       | The screen is advisory until calibrated; a hard gate needs false-pass 0 on ≥100 rows                      | A UI round needs the hard gate                                         |
| Member detail page split                  | `MemberDetailPage.tsx` is 1,263 lines; splitting it inside a reviewed diff would reopen the change        | Ticket 16 adds ministries and relationships to it                      |
| Contact link/unlink and a member picker   | Ticket 14 shipped add/remove only; coverage and covered members take a typed member number                | A ticket first needs a picker (16 or 17), so one serves attendance too |
| Orchestrator skill packaging              | The canonical lives at `~/.agents/skills/orchestrator`; a second machine does not need it yet             | A second machine or repo needs the shared skill                        |
| School-Collab orchestrator fork           | Its `.pi/skills/...` is a protected doc with a higher-model review gate; migrating it needs its own round | That repo opens a docs round                                           |
| `verify:skill` canonical check in CI      | CI has no `~/.agents/skills`; only the repo-side pointer is checked there                                 | CI gains a way to install the canonical skill                          |

## V2 events, UI and ORM ticket set

`documents/tickets/v2-events-ui/` holds 26 tickets in dependency order. Tickets 01-19 plus 11a and 15a
deliver V2 (specs and ORM gate, events API, session gateway, shell, members, imports, shepherding,
events, series); tickets 20-24 are the gated V3 offerings/USSD phase. Start at 01. The ORM decision gate
is 03-04, 11a is the magic-link session gateway that blocks the UI shell in 12, 15a is the attendance
import contract that blocks the imports UI in 15, and ticket 19 is the live-vs-mock release probe.

After approval, run **11a first**, then **02 → 03 → 04**, then **05–11**, then **12–19**. Approval
covers the V3 contracts too, but tickets 20–24 still need their own go before any code.

11a, 02-14 and 12 are implemented and accepted (2026-11-04); the next serial ticket is **15a**
(attendance import contract), then 15 (imports UI), then 16-19.

UI gaps backlogged: the Pages deploy workflow and the ticket-19 browser gate. The CI UI checks and
route-level code splitting are done (PRs after ticket 14); the `ui` job is advisory until GitHub
branch protection is available on the plan.
