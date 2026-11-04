# Round — event instances migration

|        |                                                                  |
| ------ | ---------------------------------------------------------------- |
| Status | CLOSED                                                           |
| Tier   | 2 — Reviewed                                                     |
| Base   | `efe9ed6`                                                        |
| Spec   | `documents/specs/member-registrations-api.md` (Event instance)   |
| Ticket | `documents/tickets/v2-events-ui/07-event-instances-migration.md` |

Provider: parent-authored (unattended; self-review, no separate worker — see Deviations).

## Plan

Evolve `event_occurrences` into `event_instances` in place and repoint attendance/suppressions to the
event instance and session date. Keep the public contract unchanged.

Acceptance criteria (ticket 07):

1. Every existing occurrence becomes an event instance with one session and its original `event_no`.
2. Attendance and suppression rows keep their member and date and resolve through the new event
   instance.
3. A standalone event with no series and a three-session event are both accepted; a non-null
   `series_id` still enforces its foreign key.
4. Re-running the migration is safe; a half-applied migration is not left behind.
5. Import resolution by `eventno` + date still works against seeded rows.
6. `npm run verify` and `npm run smoke` pass.

## What changed

- Migration `0005_event_instances`:
  - mints an occurrence for every attendance/suppression `(series_id, date)` key that lacks one;
  - gives each row a stable `id`, moves the primary key off `(series_id, occurs_on)`, makes
    `series_id` nullable;
  - adds `name`, `timezone`, `start_date`, `end_date`, `start_time`, `end_time`, `venue_type`,
    `venue_name`, `description`, `status`, `source` and the `sessions` JSONB; name/timezone/dates are
    backfilled from the series, venue/status/source are defaulted;
  - repoints `attendance` and `attendance_suppressions` to `(event_instance_id, session_date)`, drops
    the old keys/columns, and adds the new unique/PK and FKs;
  - adds the `(series_id, start_date)` idempotency index and renames the table.
- `src/repos/imports.ts`: the event import writes `event_instances` (idempotent on
  `(series_id, start_date)`); the attendance import resolves `event_no → (id, start_date)` and writes
  the new attendance columns.
- `src/repos/occurrences.ts`: `loadCalendar` reads imported dates from `event_instances` and only treats
  real imports (`import_batch_id is not null`) as authoritative.
- `src/repos/members.ts`: `recordAttendance` mints/reuses the event instance, writes the session-dated
  attendance, and clears the matching suppression; `deleteAttendance` writes the new suppression key;
  `attendanceFor` joins `event_instances` to recover the series.

## Verification

| Gate  | Command                | Result                                                       |
| ----- | ---------------------- | ------------------------------------------------------------ |
| Skill | `npm run verify:skill` | pass                                                         |
| Fast  | `npm run verify:fast`  | pass — format, lint, typecheck, 124 passed / 3 skipped (127) |
| Build | `npm run verify`       | pass                                                         |
| Smoke | `npm run smoke`        | pass                                                         |

The 3 skipped tests are the pooled `pg` ministry cases (CI runs them).

## Review

Independent Tier-2 review on `ollama-cloud/deepseek-v4-pro:0813` (Standards + Spec against the merged
diff `efe9ed6..dd1d967`). **Standards: PASS** (no P1; four P2 notes). **Spec: PASS** (criteria 1–6 met).

The P2 notes and their resolution:

- The suppression backfill had no test → a seeded suppression is now repointed and asserted in the
  backfill test.
- The backfill test did not assert the `sessions` array → a one-session-per-instance assertion is now
  present.
- Null-`series_id` uniqueness is not enforced (a plain unique index lets standalone events rely on
  `event_no`); latent until tickets 08–09 write standalone events. Recorded here.
- `description` is not inherited (the spec only requires name/ministry/timezone/venue); the wording is
  corrected above — name/timezone/dates are backfilled, venue/status/source are defaulted.

The one behavioural trap found during implementation: `recordAttendance` now mints an event instance,
and `loadCalendar` initially treated every instance as an authoritative imported date, which dropped a
scheduled date from the denominator. The fix limits imported-date authority to rows with
`import_batch_id is not null`, which the reviewer confirmed preserves the pre-migration behaviour.

## Acceptance

| #   | Criterion                                                          | Met | Evidence                                                |
| --- | ------------------------------------------------------------------ | --- | ------------------------------------------------------- |
| 1   | Existing occurrence → instance with one session and its `event_no` | yes | `0005` backfill; `tests/db/event-instances.test.ts`     |
| 2   | Attendance/suppressions resolve through the new instance           | yes | backfill test; attendance suite passes                  |
| 3   | Standalone/three-session accepted; FK enforced                     | yes | `event-instances.test.ts`                               |
| 4   | Re-run safe; no half-applied migration                             | yes | `migrate.ts` applies each version once in a transaction |
| 5   | Import resolution by `eventno` + date still works                  | yes | imports suite passes; import paths updated              |
| 6   | `verify` and `smoke` pass                                          | yes | Verification table                                      |

Verdict: **ACCEPTED**.

## Deviations

- **Unattended (owner instruction 2026-11-04, risk accepted).** The parent authored this round (no
  separate worker); an independent Tier-2 review on `ollama-cloud/deepseek-v4-pro:0813` was run retro
  against the merged diff and passed (see Review). The durable lesson stands: a pro session should not
  author a Tier 2 implementation — the author split is the fix for tickets 08+.
- The migration is a schema rewrite, not a CRUD refactor; the round is parked here for the events API
  (tickets 08–09) to build on the new shape.
