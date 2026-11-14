# Round - officers-titles-positions

|                     |                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                             |
| Tier                | 2 - Reviewed                                                                                                                                                     |
| Mode                | attended                                                                                                                                                         |
| Base                | `2f2a912`                                                                                                                                                        |
| Review rounds       | 1 - Tier 2 code review ACCEPTED, then one P2 fix pass                                                                                                            |
| Gate runs in parent | 3                                                                                                                                                                |
| Spec                | `documents/specs/member-registrations-officers.md` (O-1..O-8, AC-O1..AC-O7)                                                                                      |
| Workers             | `single`                                                                                                                                                         |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (integration, gate, round doc); worker ollama-cloud/deepseek-v4.1-flash:1017 (migration, repository, routes, tests) |

## Plan

First build round from the headcount grill's sequencing: the two reference vocabularies the `presbyters`
lane depends on, plus the dated title.

Scope:

- **Migration `0021_officer_titles`**: `presbyter_titles (code, label, gender_restriction, active)` and
  `ministry_positions (code, label, active)`, seeded with the five titles and six positions;
  `members.title_code` + `members.titled_on`; `member_ministries.position_code`.
- **Drizzle schema** gains the two tables and the three columns, so `tests/db/schema-drift.test.ts` keeps
  the ORM and the SQL migrations in step.
- **Repository**: title write (sets `is_presbyter`, keeps a separately-set flag, clears the date with the
  title), the gender restriction, the future-date refusal, the one-position-per-membership replace.
- **Routes**: the title rides the existing member update; a position is
  `PUT /v1/members/:memberNo/ministries/:code`, whose path value is a ministry code.
- **Tests**: the four date cases, the gender refusal, the one-per-ministry replace, the retired-entry read,
  and extensibility by inserting a row in the test database.

Acceptance criteria:

1. The migration applies on a clean PGlite database and the drift test passes.
2. `PUT /v1/members/:memberNo` accepts `titleCode` and `titledOn`, returns them, sets `is_presbyter`, and
   clears the date when the title is cleared.
3. A title whose gender restriction excludes the member is refused with `422 validation_error` naming the
   title, and nothing is written.
4. A `titledOn` in the future is refused with `422`; a null date is accepted.
5. `PUT /v1/members/:memberNo/ministries/:code` sets or replaces the position; a second call replaces
   the first; an unknown ministry or position is `404`/`422` as the existing routes are.
6. A retired title or position still renders on records that hold it and is not offered for assignment.
7. `npm run verify` and `npm run smoke` pass.

## Verification

| Gate           | Command                            | Result                                                                       |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Format         | `npm run verify`                   | format, skill, check-round, lint, typecheck, test and build pass (7/7 steps) |
| API tests      | `npm run verify` (test step)       | 55 files, 778 passed, 6 skipped                                              |
| Officer-title  | `tests/api/officer-titles.test.ts` | 14 tests: titles, dates, gender, independence, positions, retirement, data   |
| Schema drift   | `tests/db/schema-drift.test.ts`    | passes with `presbyter_titles` and `ministry_positions` added                |
| Smoke (PGlite) | `npm run smoke`                    | migration `0021_officer_titles` applies and the compiled server answers      |

gate-run 2026-11-14T20:13:43.240Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

n/a - no user-visible surface changed; the headcount and officers specs are the record.

## Mock parity

n/a - no mock changed.

## Review

Tier 2. The worker (`ollama-cloud/deepseek-v4.1-flash:1017`) wrote the migration, repository, routes and
tests; the parent integrated, ran the gates and wrote the round doc; the reviewer seat is independent of
both.

**Code review - ACCEPTED**, no blocking findings. It checked O-1..O-8 clause by clause, the wire shape
(`title: null` is a required key, OpenAPI generated from Zod), atomicity (all checks before one write,
the position replace is a single UPDATE) and the tests (the extensibility case inserts real rows). It
raised three P2s, all fixed in the same round:

1. `src/routes/members.ts` named the path param `:ministryId` while it carries a ministry **code**; it is
   now `:code`, matching the sibling DELETE.
2. A single request carrying a title and `isPresbyter: false` silently let the title win; it now answers
   `422` and a test covers it.
3. The `isPresbyter: false` refusal was an uninvited invariant; it is now O-4's reverse rule, recorded in
   the spec and in Further Notes.

Seat: consistent - the Implementer row matches the split the reviewer read.

The owner reversed the title/`isPresbyter` coupling on 2026-11-14, after this review and for the reason
recorded in the deviations below; O-4 and AC-O3 are amended accordingly and the two refusal tests are
gone.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                                                              | Met | Evidence                                                                                  |
| --- | -------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------- |
| 1   | Migration applies on a clean PGlite database; drift test passes                        | yes | `npm run smoke` PASS; `tests/db/schema-drift.test.ts`                                     |
| 2   | Member update accepts `titleCode`/`titledOn`, returns them, keeps the flag independent | yes | 14 tests in `tests/api/officer-titles.test.ts`                                            |
| 3   | Gender mismatch refused naming the title, nothing written                              | yes | "refuses a title whose gender restriction excludes the member"                            |
| 4   | Future `titledOn` refused; null accepted                                               | yes | "refuses a future titledOn and writes nothing"; "stores an undated title"                 |
| 5   | Position sets/replaces; unknown ministry 404, unknown position 422                     | yes | "answers 404 for a ministry the member does not serve in and 422 for an unknown position" |
| 6   | Retired title or position renders, is not assignable                                   | yes | "renders a retired position on its holder and refuses it for a new assignment"            |
| 7   | `npm run verify` and `npm run smoke` pass                                              | yes | gate-run line above; smoke PASS                                                           |

## Deviations

- The brief expected an existing `memberMinistries` Drizzle table to extend; `src/db/schema.ts` has no
  mirror for `member_ministries` (that slice is raw SQL in the members repository, as its other queries
  are). The `position_code` column is therefore written and read with parameterised SQL, and the
  migration is checked by `tests/db/schema-drift.test.ts` through a foreign-key assertion instead of a
  table mirror.
- `PUT /v1/members/{memberNo}/ministries/{code}` resolves the path value as a **ministry code**
  (case-insensitive), because the wire shape carries `code` and `name` and no ministry id, and the
  sibling `DELETE .../ministries/{code}` uses the same identifier. The OpenAPI entry says so.
- `isPresbyter` is independent of the title (owner, 2026-11-14): a member can hold the office of Elder
  while not being a presbyter of this assembly, so writing or clearing a title never changes the flag and
  setting or clearing the flag never changes the title. The earlier coupling (a title set the flag, and
  clearing the flag while titled was refused) was reversed by the owner after the review. Multi-assembly
  tenancy is not modelled yet: the flag is per assembly in the real world, and the register has one
  assembly today.
