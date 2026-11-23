# Round — event-parent migration and API

|                        |                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN — slice 2a in progress                                                                                                                                           |
| Tier                   | 2 — Reviewed (migration, wire, multi-file)                                                                                                                            |
| Mode                   | `unattended (auto-accept recommendations)` from "all as recommended. go unattended" (2026-11-22); scope: this round through 2b conformance and the workflow policy PR |
| Base                   | `0c3cb53`                                                                                                                                                             |
| Review rounds          | 0                                                                                                                                                                     |
| Gate runs in parent    | 0                                                                                                                                                                     |
| Spec                   | `member-registrations-api.md` (the event-parent migration), `member-registrations-event-audience.md`                                                                  |
| Workers                | `single` (worker, slice 2a; a second worker for 2b)                                                                                                                   |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (2a); parent ollama-cloud/deepseek-v4.1-flash:1017 (records, gates)`                                                    |
| Verbs this round needs | `branch, commit, push, pr, merge, sync` (twice, one chain per slice)                                                                                                  |

## Grill

Mode: attended. The owner said "go on to next" (2026-11-22) without naming the gates or the mode; the eight questions
below were put with a recommendation and a cost, and the owner answered **"all as recommended"** (2026-11-22).

1. **The gate.** This round is the one the spec names a **hard gate** — the occurrence migration and the
   events/occurrences wire. §17 parks a migration or wire-contract round unless the instruction names that round and
   that gate.
   Recommendation: treat "go on to next" as naming this round (`event-parent-migration`) and both gates; the
   offerings wire still parks for its own round.
   Cost: the two gates are spent here; a failed migration parks the round rather than rolling forward on a guess.
2. **Slices.** 2a: migration + rekey with the existing routes unchanged (parity). 2b: the events/occurrences API and
   aliases. 2a merges before 2b branches.
   Recommendation: two slices, two PR chains.
   Cost: a longer round and two gate chains.
3. **The capture amendment's home.** The headcount `ended` removal and the explicit end-only import are specified but
   unimplemented.
   Recommendation: the API half in 2b (the import/headcount DTOs are rebuilt there); the panel in the UI round.
   Cost: 2b's wire scope widens; USSD clocking keeps its current path until the downstream round.
4. **The legacy drop.** The approved spec drops `event_instances`, its columns, `sessions` and
   `series_schedules`/`series_exceptions` in the migration after the asserts; an earlier round note said "additive
   first, legacy drop later".
   Recommendation: follow the spec — one migration, drop after the asserts, keeping `events.ministry_id` /
   `presbyter_only` (the audience spec's read-only projections) and `event_offerings` (the offerings round's input).
   Cost: no down-migration; a rollback is a restore.
5. **One migration or two.** 0026 (events, occurrences, rekey) and 0027 (audiences, membership status, first-time
   visitor identities), both in 2a.
   Recommendation: two migrations; the audience backfill needs the parented events.
   Cost: two migration records; the runner applies both in one deploy.
6. **Aliases.** `GET /v1/series/:id` as the parent read, `seriesId` accepted as `eventId` on the members attendance
   aggregate, `eventNo` accepted on create — exactly the spec's list, no other legacy route.
   Recommendation: those three only.
   Cost: alias code in routes until rounds 3-4 retire them.
7. **USSD and the engine.** The rekey lands under the USSD per-member writes and the attendance engine, with no USSD
   route or response change; the USSD surfaces move in the downstream round.
   Recommendation: yes.
   Cost: the USSD code paths are touched by the rekey even though their wire stays identical.
8. **What stays out.** The standalone import lift and the session-offering attachment remain in the downstream and
   offerings rounds; no route or panel changes here.
   Recommendation: yes.
   Cost: a standalone occurrence still refuses the import action until the downstream round.

9. **A legacy `draft` event.** Old instances carry `draft`; the target parent was `active | archived`.
   Recommendation: (a) add `draft` to the parent status and preserve it. Cost: a third parent status, a Draft badge
   and a small mock re-cut. Owner answered (a).
10. **Per-instance offering attachments.** Old rows carry `event_instance_id` (a date).
    Recommendation: (a) occurrence-preserving (`event_offerings.occurrence_id`), not parent-only. Cost: a wider legacy
    table and a rework pass, with the offerings round converting the rows later. Owner answered (a).

## Process decisions (owner grill, 2026-11-22)

The owner answered the worker-throughput grill: **Q1, Q2, Q3, Q7 as recommended; Q4 as recommended (opt-in only);
Q5 no; Q6 no.**

| #   | Decision                                                                                                                      | Applies       |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Q1  | 2a stays one atomic PR (migration + rekey + tests); the gains come from the loop, not from splitting it                       | 2a            |
| Q2  | The worker runs only the touched test files plus `typecheck` while iterating; `verify:fast` and `smoke` are the parent's gate | from 2b       |
| Q3  | A slice over roughly an hour is two dispatches, with the parent gating the first before the second                            | from 2b       |
| Q4  | A parallel test writer is opt-in per round, never the default; §3a file-disjoint eligibility governs                          | when opted in |
| Q5  | **No** brief-size cap                                                                                                         | —             |
| Q6  | **No** heavier-model override for migration rounds; the `worker-flash` standing holds                                         | —             |
| Q7  | The migration test (legacy fixture) is written before the DDL                                                                 | from 2b       |

The durable policy text for Q2, Q3 and Q7 lands as a small protected-doc change with its `0813` review after this
round, so the policy is not edited mid-migration.

**UI sequencing (owner, 2026-11-22: "pipeline it"; the contract-first workflow approved the same day).** The round
opens with a **contract-only** PR for the read surface (schemas, examples, OpenAPI snapshot, no handler). The UI's read
screens then develop in parallel against the generated mocks and merge once the read endpoints are live and pass
conformance. The write surface, the audience writes and the capture amendment follow the same shape. The workflow is
`documents/agents/parallel-ui-api.md`; it binds once its protected policy sentence lands.

## Plan

**Slice 2a — migration and rekey (this slice).**

- `0026_event_parent`: the parent/occurrence tables, the recurrence move from `series_schedules`/`series_exceptions`,
  the per-table rekey, the asserts, and the legacy drop — all per `member-registrations-api.md` § "The event-parent
  migration: tables, rekey and backfill".
- `0027_event_audience_membership`: `audiences` + rules, `members.membership_status`,
  `first_time_visitor_identities`, `events.audience_id` with the legacy-pair backfill, and the legacy
  `ministry_id`/`presbyter_only` columns kept read-only — per `member-registrations-event-audience.md` § "The
  migration".
- Repository and engine rekeyed to occurrences; the existing routes keep their shapes for this slice, except the parent
  `status`, which becomes the spec's three-valued `draft | active | archived` (recorded under Deviations).
- Drizzle schema for the new tables plus the drift check.

**Slice 2b (after 2a merges).** Three dispatches in one chain:

- **2b-read:** `GET /v1/events` (parent + occurrences), the occurrence read, and the audiences read; the three aliases.
- **2b-write:** the event create/update, the audience CRUD writes, and membership status.
- **2b-capture:** the capture amendment's API half.

**The UI pipelines, it does not overlap.** Round 3 starts when **2b-read** merges and the UI can call a real read API; its read screens (list, detail, audience picker options) build against it. The write screens follow **2b-write**, and the import panel follows **2b-capture**. No UI branch is opened against a mock, and no UI screen merges before the endpoint it calls exists.

## Verification

| Gate      | Command               | Result     |
| --------- | --------------------- | ---------- |
| Fast gate | `npm run verify:fast` | pass — 4/4 |
| Smoke     | `npm run smoke`       | PASS       |

gate-run 2026-11-23T04:21:45.974Z profile=fast steps=4/4 lines=4 bytes=691

Tests: 1,021 passed at the worker's first pass; 218 in the rework's touched suites; the parent's gate ran the full suite.

## Review

Tier 2 independent review, `deepseek-v4-pro:0813` (first pass `REWORK`): the export I gave it omitted the untracked
test files, so its P1 ("the 0026 backfill is untested") was a false negative — `tests/db/event-parent-migration.test.ts`
builds the schema through 0025, seeds legacy rows and applies 0026. Two real findings were fixed: the series-parent
`event_no` was minted before the recurrence move (so its year was always the deploy year), and a series parent's
venue/times are now taken from its earliest non-cancelled instance instead of a hard-coded placeholder. The second
pass reads the complete diff.

Seat: consistent — worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.
Verdict after the second pass: **ACCEPT** (two nits: the cancelled-instance skip, since covered by a test, and the
round-doc parity wording, now corrected).

## Git writes

`git-seat-budget: 12` (two chains: `2 × (1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync) = 12`).

| Brief | Actor                 | Verb     | Variant                        | Reason                                        |
| ----- | --------------------- | -------- | ------------------------------ | --------------------------------------------- |
| 1     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/event-parent-migration`; rung 1 429 |
| 2     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | Slice 2a: migrations, rekey, schema, tests    |
| 3     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Slice 2a branch only                          |
| 4     | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | Slice 2a PR against `main`                    |
| 5     | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | Slice 2a, after the checks                    |
| 6     | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull                               |

## Acceptance

Pending.

## Deviations

- **The event `status` is three-valued in 2a.** `EVENT_STATUSES` moves from the instance's five values to the
  parent's `draft | active | archived`; it is the one wire shape that changes in the "parity" slice, and the spec
  defines it. Nothing else changes shape.
- **`offering_exceptions` stay writable only through the event-level attachment routes in 2a.** A migrated
  occurrence-specific attachment is readable but has no 2a write path for an exception; the offerings round gives it
  one.
- **A series parent's venue and times are derived from its earliest non-cancelled instance**; the occurrence may
  override them.
