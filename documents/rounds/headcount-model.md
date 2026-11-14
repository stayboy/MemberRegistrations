# Round - headcount-model

|                     |                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                                      |
| Tier                | 2 - Reviewed                                                                                                                                                              |
| Mode                | attended                                                                                                                                                                  |
| Base                | `c80cb27`                                                                                                                                                                 |
| Review rounds       | 2 - REWORK on the lane lock, then ACCEPTED                                                                                                                                |
| Gate runs in parent | 4                                                                                                                                                                         |
| Spec                | `documents/specs/member-registrations-headcount.md` (HC-1..HC-26, AC-H1..AC-H16)                                                                                          |
| Workers             | `single`                                                                                                                                                                  |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (integration, gate, round doc); worker ollama-cloud/deepseek-v4.1-flash:1017 (migration, repository, wire, consumers, tests) |

## Plan

The headcount model: modes become independent lanes, the six fixed bucket columns become lines, `mixed` is retired and two specialised modes arrive.

This round changes the **model and the wire**; the four-entry USSD navigation, the lane UI and the mocks are the next round.

Scope:

- **Migration `0022_headcount_lanes`**: `headcount_modes (code, label, entry_label, retired)` seeded with
  `adults`, `children`, `visitors`, `presbyters` and `mixed` retired; `headcount_buckets (code, mode_code,
label, sort_order)` seeded with the ten live buckets; `headcount_lines (headcount, bucket, count)`;
  backfill from the six columns; drop the six columns and the per-mode check. **No index claims one tip**:
  a superseded root keeps `supersedes_id` null, so such an index would guard roots, not tips (HC-2), and
  legacy duplicate tips are tolerated and read newest-first (HC-27).
- **Repository**: one chain per lane, a new count and a correction both supersede their own lane's tip, and
  a mode-changing correction is allowed only when the destination lane has no current (HC-25).
- **Wire**: `headcountSchema` carries `lines: [{ code, label, count }]` in place of the six fields;
  `headcountListSchema.current` becomes a map keyed by mode; the list accepts `?mode=`.
- **Consumers**: the events capture aggregate already takes the latest current row across lanes, so it
  needs no logic change (prove it with a test); the USSD service and the page read the lane they name.

Acceptance criteria:

1. Migration applies on a clean PGlite database and the drift test passes.
2. Two lanes are current at once; recording one leaves the other's observation, `asOf` and recorder intact.
3. A correction supersedes its own lane only; a mode-changing correction is refused when the destination
   lane has a current.
4. An all-zero observation carries no lines, total zero, and is still that lane's current.
5. `?mode=children` returns that lane's history and a `current` map holding only it.
6. A legacy session whose `adults` row was superseded by a `mixed` row reads that lane as not recorded.
7. A new `mixed` observation is refused; a legacy one renders labelled Mixed (retired).
8. `visitors` and `presbyters` observations carry their declared buckets and no others.
9. `npm run verify`, `npm run smoke` and `npm run ui:test` pass.

## Verification

| Gate           | Command                               | Result                                    |
| -------------- | ------------------------------------- | ----------------------------------------- |
| Backend suite  | `npm run verify` (test step)          | 56 files, 796 passed, 6 skipped           |
| Lane model     | `tests/api/event-headcounts.test.ts`  | 29 cases: lanes, tips, mode moves, wiring |
| Reshape        | `tests/db/headcount-backfill.test.ts` | applies 0001-0021, seeds, applies 0022    |
| Schema drift   | `tests/db/schema-drift.test.ts`       | the new tables and FKs mirror the SQL     |
| Smoke (PGlite) | `npm run smoke`                       | PASS, including both headcount flows      |
| UI             | `npm run ui:test`                     | 41 files, 445 passed                      |

gate-run 2026-11-14T22:45:56.228Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

| Surface           | Mock                                     | sha256                                                             | Signer | Date       | Verdict |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/ussd/headcount` | `mockups/headcount/10-capture-state.png` | `c58d01e70e6936e6f0d866931642627c5e6798a1fed5ea902ad190ca9c44f5ba` | owner  | 2026-11-14 | signed  |

This round changes the model behind the surface and the page reads the lane it names; the rendered rows
do not change, so the signed states remain the surface's target. The mocks that depict the four entries
follow in the UI round.

Mock coverage: claimed 0 · e2e-only 2 · deferred 0 · prose 1

## Mock parity

n/a - no mock changed.

## Review

Tier 2. The worker (`ollama-cloud/deepseek-v4.1-flash:1017`) wrote the migration, repository, wire and
consumers; the parent amended the spec twice and ran the gates; the reviewer seat is independent of both.

**Round 1 - REWORK, one P1.** The lane lock was a row lock, and a lane's first count has no row to lock, so
two concurrent first counts could each insert a tip. The spec was wrong too: it prescribed a partial unique
index on `supersedes_id is null`, which guards a lane's **root**, not its current row - a superseded root
keeps that column null. Both were corrected (HC-2 rewritten, HC-27 added for legacy duplicate tips), and
the write path now takes a per-lane advisory lock inside the transaction, both lanes in sorted order for a
mode move.

**Round 2 - ACCEPTED.** It confirmed the lock precedes every tip read on all three paths, the total guard
fires only on a legitimate overflow, the glossary row is retired with no dangling reference, and the fix
introduced no deadlock or session-scoped lock. It also confirmed the worker's honesty about the tests: on
PGlite one connection serves every query under a mutex, so the two-POST race test passes with or without
the lock, and the discriminating test is the statement assertion that the advisory lock is taken before the
`not exists` tip query.

Seat: consistent - the Implementer row matches the split the reviewer read.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                                                       | Met | Evidence                                                                                    |
| --- | ------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------- |
| 1   | Migration applies on a clean PGlite database; drift test passes                 | yes | `npm run smoke`; `tests/db/schema-drift.test.ts`                                            |
| 2   | Two lanes current at once; recording one leaves the other untouched             | yes | "two live lanes keep their own asOf and recording one leaves the other"                     |
| 3   | Correction supersedes its own lane; mode move refused when destination occupied | yes | "a correction follows its own lane"; "a mode move is refused naming the lane when occupied" |
| 4   | All-zero observation carries no lines, total zero, still current                | yes | "an all-zero observation carries no lines and is its lane's current"                        |
| 5   | `?mode=children` returns that lane only                                         | yes | "filters to one lane and keeps the current map to it"                                       |
| 6   | Legacy adults lane superseded by mixed reads not recorded                       | yes | "reads a legacy mixed session with the adults lane not recorded"                            |
| 7   | New `mixed` refused; legacy renders labelled                                    | yes | "refuses a new mixed observation"; glossary retirement test                                 |
| 8   | `visitors` and `presbyters` carry their declared buckets only                   | yes | "records visitors and presbyters with their declared buckets"                               |
| 9   | `verify`, `smoke` and `ui:test` pass                                            | yes | gate-run line above; smoke PASS; 445 UI tests                                               |

## Deviations

- **The prescribed index was wrong and was removed.** HC-2 now says no index claims one tip; the invariant
  is the in-transaction advisory lock. Legacy duplicate tips are tolerated and read newest-first (HC-27).
- **Four legacy `mixed` buckets were seeded** in `headcount_buckets` beyond the ten live ones, because the
  backfill writes a retired mixed row's lines and the composite foreign key needs them to exist. They are
  never offered for entry.
- **The phone no longer shows a legacy `mixed` observation.** It reads only the adults or children lane it
  names; the portal history still carries the mixed row, labelled Mixed (retired). The four-entry navigation
  is the next round.
- **The portal history lists every lane but offers `Correct` only on adults and children** this round; the
  lane UI follows with the mocks.
- **A correction naming an older duplicate legacy tip is refused**, because "the" current resolves to the
  newest; consistent with HC-25 and HC-27 and recorded rather than special-cased.
- The `23514` mapping is a backstop with no direct test: with three buckets capped at 10,000 an over-large
  total is unreachable through the guard above it.
