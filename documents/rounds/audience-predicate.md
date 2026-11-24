# Round - audience-predicate

|                        |                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Status                 | OPEN                                                                                 |
| Tier                   | 2                                                                                    |
| Mode                   | `unattended (auto-accept recommendations)` - standing consent to the milestone       |
| Base                   | `32123c5`                                                                            |
| Review rounds          | 0                                                                                    |
| Gate runs in parent    | 0                                                                                    |
| Spec                   | `documents/specs/member-registrations-event-audience.md` (the rule, A-3), `…-api.md` |
| Workers                | `single`                                                                             |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017                                         |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                              |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                           | Basis                       |
| -------- | -------------- | ------ | -------------- | ---------------------------------------------------------- | --------------------------- |
| Worker   | `2026-11-24`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`                    | outside-window order        |
| Reviewer | `2026-11-24`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                        | first choice outside window |
| Git seat | `2026-11-24`   | out    | `git-executor` | `opencode/beam-free` - 429; `ollama-cloud/mimo-v2.6-flash` | rung 1 unavailable          |

## Grill

Run by the `grill-flash` seat on 2026-11-24 (probe answered, outside the window). It replaced the parent's four
questions, which the spec already settled, with the eight the code actually poses.

1. **Does `scopedSessions` move onto the predicate?** It reads both columns, and the audience spec's Out of Scope
   keeps the regularity window's `assigned_on` floor while A-3 says the rule has none. **Recommendation:** amend both
   specs in this round, then move it. **Cost:** every member's `expected` and regular/non-regular status can shift, and
   the amendment needs approval. Owner answered "all as recommended".
2. **What does an anonymous USSD caller see?** A-3 puts a first-time visitor outside every audience, and `Everyone`
   is `allOf(membershipStatus active)`, so the pre-login Activities screen would go blank. **Recommendation:** the seeded
   `Everyone` audience only, written into A-4. **Cost:** age-band, `anyOf` and `noneOf` events leave the public list.
   Owner answered "all as recommended".
3. **Clock-in gating.** The `presbyter_only` arm only picks which refusal a non-presbyter gets. **Recommendation:**
   delete it; clocking is authority, not audience. **Cost:** none observable. Owner answered "all as recommended".
4. **The USSD priority tier.** Match/no-match cannot produce it. **Recommendation:** derive it from `legacyProjection`,
   byte-identical for the four legacy shapes. **Cost:** an age-band event sorts below a ministry one. Owner answered
   "all as recommended".
5. **`?ministry=`.** Clause-presence would turn an inclusion filter into an exclusion one for `noneOf`.
   **Recommendation:** resolve through `legacyProjection` and amend the sentence. **Cost:** it cannot find an age-band
   event; no client sends it. Owner answered "all as recommended".
6. **A-7 against `legacyProjection()`.** A-7's letter writes `ministry_id = CHOIR` for `noneOf(CHOIR)`, which every
   legacy reader reads as "only CHOIR". **Recommendation:** keep the code, amend A-7. **Cost:** a mixed `allOf` reads as
   general, which is already the stated limit. Owner answered "all as recommended".
7. **`attendanceFor` has no date.** **Recommendation:** A-4's rule - the event appears if any occurrence in the window
   matches. **Cost:** one occurrence read per candidate event. Owner answered "all as recommended".
8. **`ui/src/format/ussd.ts` holds a second copy of the rule.** **Recommendation:** leave it this round (it would trip
   R6) and make deleting it the UI round's first task. **Cost:** the preview page can disagree with the phone flow for a
   round. Owner answered "all as recommended".

**Settled by the spec, not asked:** predicate-first ordering; one predicate for visibility; the recurring index
(belongs to the migration round); mock-before-UI; registered visitors see only `Visitors only` events; and visibility
gains a join-date floor, so events before a member joined leave their view.

## Plan

Goal: one predicate answers "does this member match this audience", and every domain reader of the legacy pair uses it.

- `src/domain/audience-evaluator.ts` gains a pure `memberMatchesAudience(rule, member, date)`, beside the counting
  functions, sharing the same clause and operator semantics and the visitor gate.
- Move onto it: `src/repos/clocking.ts` (clock-in gates), `src/repos/members.ts` (`scopedSessions`, `attendanceFor`),
  `src/ussd/services.ts` (Activities tiers), and the parent DTO's `ministry`/`presbyterOnly` derivation plus the
  `?ministry=` filter and its ETag component.
- The dual write stays: `ministry_id`/`presbyter_only` are still written, because the legacy serialiser reads them
  until the flip. This round removes the **domain** readers, not the columns.

Out of scope: the migration, the read flip, the `/v1/series/*` deletion, any `ui/**` change, and the mock work.

Acceptance criteria:

1. `memberMatchesAudience` exists, is pure, and shares the counting functions' semantics — tested per clause kind, per
   operator, and on the visitor gate.
2. Clock-in, member attendance scope, member-detail attendance and USSD Activities read the audience rule, not the
   legacy pair.
3. The parent DTO's `ministry`/`presbyterOnly` and the `?ministry=` filter derive from the rule.
4. The legacy serialiser still works against the columns (it is deleted by the next round, not this one).
5. No migration, no wire shape change, no UI change.

## Verification

| Gate                  | Command               | Result     |
| --------------------- | --------------------- | ---------- |
| Fast gate (round doc) | `npm run verify:fast` | pass — 4/4 |

gate-run 2026-11-24T08:43:39.710Z profile=fast steps=4/4 lines=4 bytes=691

## Review

Seat: consistent - worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                |
| ----- | --------------------- | ------ | ------------------------------ | ----------------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/audience-predicate` at `main` with this doc |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | This round doc                                        |
| 3     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The predicate and its readers                         |
| 4     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                           |
| 5     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                     |
| 6     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                              |
| 7     | `parent`              | sync   | -                              | Main is held by the `ussd-budget` worktree            |

`git-seat-budget: 8` = `1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync`, one brief held.

## Mock sign-off

n/a - no surface and no `ui/src/` change.

## Mock parity

n/a - no drawing changes.

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

- **Seven things this round found and did not improvise around**, all now open items rather than silent gaps:
  1. `addManualAttendance` still reads `events.presbyter_only` to refuse a non-presbyter attendance target. It is a
     domain reader of the retired column and is not in this round's move list; the migration round's "nothing reads
     them" audit must find it.
  2. **The legacy `PUT /v1/events/{id}` derives the audience from the presbyter flag alone**, so editing a ministry
     event through the deployed per-instance form rewrites `audience_id` to `Everyone` and leaves `ministry_id`
     stale. Pre-existing, exposed by this round because the DTO now derives from the audience; the fixture moved to
     `PATCH`. Fixing it needs a decision on what a legacy ministry input means.
  3. `findCurrentEvent()` has no viewer and no audience filter, so the USSD "current/next event" can name a
     restricted event to a member who does not match.
  4. **A-4's guardian clause is unimplemented** - there is no member-scoped route in this round's steps to apply it to.
  5. `attendanceFor` follows A-4, so a recurring event the member attended but whose audience they no longer match
     loses its series row; the standalone attendance-only rows still show the actual records.
  6. A visitor can still sign in to USSD and use the member menus; only their Activities list is rule-bound.
  7. **`sessionCounts`' `session_expected` still counts `presbyter_only`** (`src/repos/events.ts`) and serves it as
     each session's legacy `expected`. It is grandfathered by A-7 step 5 - the columns exist so readers that have
     not moved keep working until the downstream round deletes them - so it is not this round's to move. The
     migration round's "nothing reads them" audit must include it as the seventh reader.
- **The four spec amendments took three review passes, and the first two refusals were mine.** Each was the same fault:
  the rule changed in one place while other sentences kept the old one - A-3 and the Problem Statement still called the
  regularity alignment out of scope, the API spec still defined `?ministry=` as clause presence, and two later
  sentences still scoped the regularity window by ministry. The third pass grep-read the concept across every spec and
  found the set consistent. Amended: `member-registrations-event-audience.md` (A-3, A-4, A-6, A-7, Out of Scope and
  the Problem Statement), `member-registrations-api.md` (the filter and the attendance summary), and
  `member-registrations-ussd.md` (the regularity window).
- **The round first opened on the parent's frontier, without a Grill row in its Seats table.** The owner caught it and
  the seat's eight replaced the parent's four. The rule that makes this a deviation rather than a grill is `AGENTS.md`
  §2's 2026-11-24 bullet, added in the same commit.
- **The round was opened on `feat/downstream-migration`,** a branch cut for the migration round that then blocked; it
  carries no commits of its own, so this round's history starts here under a name that describes its parent rather than
  itself.
