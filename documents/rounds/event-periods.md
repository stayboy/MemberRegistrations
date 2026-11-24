# Round — event-periods

|                        |                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Status                 | OPEN - spec APPROVED 2026-11-24; gates ungranted; no code yet                                        |
| Tier                   | 2 (wire contract + migration, by inspection: `event_audiences`, event number)                        |
| Mode                   | `attended`                                                                                           |
| Base                   | `b11adae`                                                                                            |
| Review rounds          | 1 (behavioural: four passes, contradicted x3 then consistent)                                        |
| Gate runs in parent    | 0                                                                                                    |
| Spec                   | `documents/specs/member-registrations-event-periods.md` (APPROVED 2026-11-24)                        |
| Workers                | `single`                                                                                             |
| Implementer            | `parent cline-pass/deepseek-v4.1-flash-1017 (grill, integration)`                                    |
| Verbs this round needs | `branch, commit, push, pr, merge` — granted 2026-11-24 by the owner's "go"                           |
| git-seat-budget        | 15 (owner, 2026-11-24: `3 branch + N commits + 3 push + 3 pr + 3 merge` = 12 + N, one commit per PR) |

## Grill

Two `grill-flash` rounds (seat: `cline-pass/deepseek-v4.1-flash-1017`), both relayed and answered.

Round 1 (Q1-Q16) settled: audiences compose by **intersection** (the owner overruled the seat's union); `audienceIds`
on write with a one-round `audienceId` alias; the primary package for the shim; `countAt` on the audiences read; all
eight audience readers move; one schedule builder at both call sites; the closed schedule vocabulary with extra dates
as exceptions; `WKST=SU`; three periods in code; `POST /v1/events/preview`; resolve once at save, standalone, no
provenance; the event number refused by name on both writes; `event_no NOT NULL` with no backfill; one round of three
serial PRs.

Round 2 (Q1-Q7) settled what those answers forced: `event_audiences` is the sole authority and `events.audience_id`
is a write-only revert shim read by nothing new; the intersection fold with an authorable empty result; the form's
headline count is the intersection per date with per-chip audience counts; `GET /v1/events/periods` plus a backlog row
for the authoring screen; the resolver takes a `YYYY-MM` cycle and no clock; the mint year is the earliest
occurrence's UTC year; the budget is 15.

The owner's Q1 correction in round 2 opened one further question (Q8): whether "everyone but youth" needed new rule
syntax. The owner then answered it better than the seat's recommendation: **no exclusion clause type** - intersection
already composes a positive and a negative audience, because `noneOf` is a pure negation
(`src/domain/audience-evaluator.ts:79-80`). "Everyone but youth" is `allOf [active]` intersected with
`noneOf [Youth]`; the audience rule language is unchanged, and one wire item left the round.

## Plan

The amended spec `documents/specs/member-registrations-event-periods.md` carries four changes to one surface. It is
**not approved yet**; the text below is what the implementation will build against once it is.

1. Schedules authored as a set of rules (weekday set, interval, end, positional first/last weekday, explicit
   extra dates), mapping onto the stored `rrule`.
2. An event carrying several audiences, composed by **intersection**, with the intersection count per resolved date
   and each audience's own count beside it.
3. The event number minted by the server, required on read, refused by name on both writes.
4. Named periods (Communion Week, Gospel Week, Home Cells) as declared rules, selectable in the form, resolved at
   save, stored as ordinary occurrences.

Expected files: `src/schemas/events.ts`, `src/db/migrations.ts`, `src/db/schema.ts`, `src/repos/events.ts`,
`src/repos/members.ts`, `src/repos/series.ts`, `src/ussd/services.ts`, `src/domain/` (the composition function, the
rrule mapping, the period resolver, the exclusion-free audience schema), `src/openapi.ts`, `ui/src/format/rrule.ts`,
the event form and `AddScheduleVersionDialog`, their tests, and the two mocks.

Acceptance criteria are the amended spec's AC 1-16; they were written with the text, not after it.

## Deviations

- The audience-composition decision (round 1 Q1) was overruled by the owner: intersection, not the seat's union.
- The exclusion question (round 2 Q8) was **answered by the owner, not by a seat round**: "rather than excluded
  clauses, couldn't we just do multiple selections and ensure member ticks all selections". Recorded per AGENTS.md §2
  (2026-11-24): an owner's direct answer is legal and lives here, not in the grill paragraph. It withdrew a rule-language
  change the seat had recommended and removed one wire item from the round.
- The owner also corrected the reviewer-visible basis that a bare `noneOf` audience is permissive; the spec now records
  the per-rule visitor gate as the true shape.
- **Recorded decision, not a surprise:** the legacy `PUT /v1/events/:id` writes a one-row audience set from its
  `presbyterOnly` derivation, so it **shrinks** a multi-audience event to one audience. That matches AC 9's blessed
  shrink path (`PATCH` to one audience) and is accepted for this round because the legacy route exists only for
  unmoved callers; the route is retired with the shim column in the backlog row that drops `audience_id`.
- Tier 2 parent-authored: the spec text and this round doc were authored by the parent, because the round's worker
  seat builds code and this opening commit carries none.

## Gate: two §17 hard gates

The change adds a migration (`event_audiences`) and changes the event wire contract (create no longer
accepts `eventNo`; reads gain `audiences[]`). AGENTS.md §17 requires the owner to name **this round and that
gate** in the same instruction before either lands. Neither is requested yet.

## Review

Seat: consistent - `reviewer-pro` (`ollama-cloud/mimo-v2.6-pro`), four passes on this spec; its blocking
findings are recorded in the spec text (the per-rule visitor gate, the four event writers with the fail-loud
migration, and the `expected` parameter seam) rather than only here. The Implementer row is `parent`
because this commit carries no code.

## Verification

| Gate                  | Command                    | Result |
| --------------------- | -------------------------- | ------ |
| pre-commit (this doc) | `npm run verify:precommit` | pass   |

gate-run 2026-11-24T16:19:37.474Z profile=precommit steps=4/4 lines=4 bytes=535

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                                                                |
| ----- | --------------------- | ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | refused on a dirty tree: the brief carried no `files:`, so the branch exception could not name the spec; drew nothing |
| 2     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | retry with `files:` naming the round doc and the approved spec, and the parent's `HEAD^{tree}` (`a85f2d5`)            |

## Open

- Owner approval of the amended spec, and the `0813` review verdict on this exact text.
- The two §17 gates are not granted yet; no implementation brief is valid before they are named with the round.
- No git verbs given: the round needs `branch` first (this slot is detached at `b11adae`), then `commit` per PR.
- The original draft copy still sits untracked in `worktree/bf3bc8/ussd-budget`, where another session left it.
