# Round — member-overview-api

|                        |                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                          |
| Tier                   | 2                                                                                                                                                             |
| Mode                   | `unattended (auto-accept recommendations)`                                                                                                                    |
| Base                   | `b17c16e`                                                                                                                                                     |
| Review rounds          | 0                                                                                                                                                             |
| Gate runs in parent    | 0                                                                                                                                                             |
| Spec                   | `documents/specs/member-registrations-api.md` (2026-11-17 amendment)                                                                                          |
| Workers                | `single`                                                                                                                                                      |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (migration, schema, DTO, repo, API tests); parent opencode/deepseek-v4.1-flash-free (round doc, gates, record)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                       |

`git-seat-budget: 8` — 1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync + 1 retry.

## Seats

| Seat        | Picked (local)   | Window | Class          | Candidate probed                    | Basis                                                         |
| ----------- | ---------------- | ------ | -------------- | ----------------------------------- | ------------------------------------------------------------- |
| Worker      | pending          | out    | `worker-flash` | pending                             | outside-window first candidate                                |
| Spec review | already accepted | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813` | the grill's spec decisions were accepted with this round's go |

## Grill

The grill-me round of 2026-11-17 produced the frontier; the owner answered "all as recommended" to a go
sentence that named this round and migration `0023_member_membership_fields`. Every recommendation is
auto-accepted; the decisions are recorded in `member-create-completeness.md` under "Unattended go".

1. **Scope.** Recommendation: two serial rounds, API then impl. **Cost:** one extra review and PR cycle.
2. **Sequence.** Recommendation: this round starts from the merged `main`, not a stack. **Cost:** none.
3. **Migration.** Recommendation: `0023_member_membership_fields`, four nullable columns on `members`,
   no default, no backfill, no check constraint, mirrored in Drizzle; no down migration, a forward
   reversal if ever needed. **Cost:** the named gate; the `pg` lane may be unproven.
4. **Wire.** Recommendation: the four fields on detail, create and update; `shepherd` and `calls` on the
   detail; `eventId` and `eventName` on attendance entries. **Cost:** two sub-queries and their tests.
5. **Copy clarifications.** Recommendation: follow the signed drawing's empty copy and the verified
   badge's accessible name. **Cost:** one changelog line and one DOM assertion (the impl round).
6. **Form fields.** Recommendation: Church section, create and edit, blank to `null`, no default for
   `assemblyJoinedOn`. **Cost:** two DOM cases (the impl round).
7. **Tab bodies.** Recommendation: reuse the ministry and relationship bodies as sections. **Cost:**
   rename and style churn (the impl round).
8. **Card derivation.** Recommendation: a pure module with unit tests. **Cost:** a new module (impl).
9. **Baselines.** Recommendation: three new overview baselines, parent captures. **Cost:** three PNGs (impl).
10. **Records.** Recommendation: close the old docs round; each round owns its record. **Cost:** bookkeeping.
11. **Seats.** Recommendation: outside-window workers, git on the second rung, budgets 8 and 9. **Cost:**
    the exhausted free rung is named in each brief.
12. **Limits.** Recommendation: no other hard gate, no mock re-cut or new signature, no protected-doc
    edit, no bypass. **Cost:** stop rather than redraw.
13. **Close.** Recommendation: verbatim gate-run line, Tier 2 verdict, acceptance rows, product-terms
    commit body. **Cost:** record discipline.

## Plan

Goal: make the member detail carry the data the signed overview drawing shows, with the database,
Drizzle schema, zod contracts and repository all agreeing.

Acceptance criteria:

1. Migration `0023` adds `assembly_joined_on date`, `came_from text`, `moved_out_on date` and
   `moved_to_assembly text`, all nullable, with no backfill.
2. `src/db/schema.ts` mirrors the columns and `tests/db/schema-drift.test.ts` passes.
3. `MemberDetail`, create and update carry the four fields; the detail also carries `shepherd`, `calls`
   and attendance `eventId`/`eventName`.
4. `tests/api/members.test.ts` proves the fields round-trip and that the detail's new reads are correct.
5. `npm run verify` and `npm run smoke` pass; PGlite is the gate, the `pg` lane is recorded if unproven.

## Verification

| Gate          | Command                                                                  | Result                           |
| ------------- | ------------------------------------------------------------------------ | -------------------------------- |
| Full gate     | `npm run verify`                                                         | pass - 7/7, 846 tests, 7 skipped |
| Server smoke  | `npm run smoke`                                                          | pass - compiled server on PGlite |
| Drift and API | `npx vitest run tests/db/schema-drift.test.ts tests/api/members.test.ts` | pass - 39 tests                  |
| Typecheck     | `npx tsc --noEmit`                                                       | pass                             |

gate-run 2026-11-17T19:15:36.504Z profile=full steps=7/7 lines=7 bytes=1025

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason |
| ----- | --------------------- | ------ | ------------------------------ | ------ |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | -      |

## Mock sign-off

n/a - no user-visible surface; no drawing changes.

## Mock parity

n/a - no mock; the five overview states were signed in the previous round.

## Acceptance

Pending.

## Review

Seat: consistent - the `Implementer` row names the worker for the migration and API work; the Tier 2
review runs on a different candidate.

Standards: ACCEPT. Spec: ACCEPT. Verdict: ACCEPT, no P1, no P2, three nits.

Review record: "Tier 2 review of member-overview-api (deepseek-v4-pro:0813, outside window):
Migration 0023 is additive, nullable, correctly sequenced and mirrored exactly; drift and API gates
are meaningful. The four fields round-trip through create/detail/update with no list, summary, import
or route leakage; lastCalledOn and lastReachedOn match the amendment. Standalone attendance renders
as null-series rows grouped by eventId, and the manual write names its event instance. The purge
addition is an accepted, recorded section-5 privacy fix. Eight external-behaviour cases, none
vacuous; R1-R7, gate line, declared pg gap, unattended mode and named migration gate all present.
Nits: the ministry role shape wording (corrected in the spec), the ungrilled purge extension
(recorded), and the two extra detail queries (deferred). Seat consistent."

## Deviations

- **The `pg` lane was not run.** `TEST_DATABASE_URL` is unset and the only `pg` case is skipped by
  `describe.skipIf`; migration 0023 is proven on PGlite and the compiled server only. §12 is not fully
  satisfied, and this round does not claim it is.
- **Purge clears the two new free-text fields.** The worker added `cameFrom` and `movedToAssembly` to
  the PII-erase list beyond the brief. Kept: a whitelist that omitted them would leave newly typed free
  text on an erased row, against the exception in AGENTS.md section 5.
- Standalone attendance rows use the same count/status derivation as series rows, with null series
  identity and per-event grouping; the arithmetic is a derived decision for the reviewer.
- `lastReachedOn` follows the source projection: `calls` are per member across assignment history, not
  per current assignment, so the detail always agrees with `GET …/shepherding`.
- The UI client still types `seriesName` as non-null; standalone rows will arrive with null names until
  the impl round updates that surface. Out of scope here by the round split.
