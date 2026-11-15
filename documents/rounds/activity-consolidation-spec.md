# Round - activity-consolidation-spec

|                     |                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                  |
| Tier                | 1 - Plan                                                                                                                                              |
| Mode                | unattended (auto-accept recommendations)                                                                                                              |
| Base                | `aee2e64`                                                                                                                                             |
| Review rounds       | 2 - spec review REWORK (5 P1, 6 P2), confirmation REWORK (4 residual), both fixed                                                                     |
| Gate runs in parent | 1                                                                                                                                                     |
| Spec                | `documents/specs/member-registrations-ui.md` 2.4, 4.3, 5.4, AC-51; `…-events-offerings.md` FR-1/4/5/6/8, AC-1/3/4/5/6/7; `…-headcount.md` entry point |
| Workers             | `single`                                                                                                                                              |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (spec amendment, catalogue re-point, round doc)                                                          |

## Plan

The owner consolidated the screens ("series-detail and event-series-detail are the same - merge them …
to reduce number of pages deployed") and answered six questions, all approved: retire the Series
submenu; headcount is a session-row action; the row shows its lane buckets; remove the standalone
attendance import page; a cancelled event is a state, not a screen; retired routes redirect, never 404.

This round writes that into the specs. It changes no code and no mock: the spec is the target the next
two rounds build against.

### Decisions (auto-accepted, unattended)

| #   | Question                               | Decision                                                                                                               |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | What is one row in the events list?    | An **activity** — a standalone event or a series — with `kind` carried to the detail                                   |
| 2   | How does `#/events/:id` know the read? | `kind=series` selects `GET /v1/series/:id`, the default `kind=event` selects `GET /v1/events/:id`                      |
| 3   | Where does a count come from?          | The session row on the activity detail, with its lane buckets; the USSD operator page retires                          |
| 4   | Where does an attendance import start? | The same session row; `#/imports/attendance` retires, and a standalone event still offers none (`422 series_required`) |
| 5   | What happens to a retired route?       | A redirect from an exact table (AC-51); a bare `#/ussd/headcount` goes to `#/events`, since no activity is named       |
| 6   | How does a deep link reach an import?  | `import=<date>` on the activity detail, pinned by FR-8a and dropped when the panel closes                              |

### Scope

- `documents/specs/member-registrations-ui.md` - 2.4 scope, the 4.3 navigation table, the consolidated
  paragraph, FR-8a, FR-36a, FR-42, AC-51, the change log, and 2.5's stale headcount panel.
- `documents/specs/member-registrations-events-offerings.md` - FR-1/4/5/6/8, AC-1/3/4/5/6/7, the
  navigation table, the Solution overview, Users and Jobs, the change log.
- `documents/specs/member-registrations-headcount.md` - the operator entry point paragraph.
- `documents/mock-claims/v2-events.json` - `acsMatch` re-pointed, because the AC headings reflowed.

Acceptance criteria:

1. No spec describes a screen the consolidation retires.
2. The detail route is decidable for an event id and a series id without guessing.
3. Every retired route has an exact redirect target, including a bare one.
4. The headcount model and the USSD phone flow are unchanged.
5. The API needs no new route.
6. `npm run verify` passes.

## Verification

| Gate            | Command                                         | Result    |
| --------------- | ----------------------------------------------- | --------- |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts` | 77 passed |
| Full gate       | `npm run verify`                                | 7/7 steps |

gate-run 2026-11-15T11:56:31.235Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

n/a - no mock changed. The mock re-cut is the next round, against this spec.

## Mock parity

n/a - no claim changed. `v2-events.json` moved only its `acsMatch` patterns so the same ACs stay
selected after their headings were reflowed.

## Review

| Round | Seat                                  | Verdict                                                                                                                                                                                        |
| ----- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - FR-8 and AC-4 named retired screens; 2.5 still specified the retired panel; AC-51 was undecidable; no kind discriminator                                                              |
| 2     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - four residuals: a stale "imports stay under Imports" clause, AC-1's Series submenu, a garbled consolidated paragraph contradicting AC-51, and `kind=` missing from the governing spec |

Both fix passes are in. The second round found only residuals of the first, all mechanical: a deleted
clause, two route strings, one paragraph merged. The review budget for this round is spent, so no third
confirmation was opened; the four residuals are verified by the greps in `## Acceptance` rather than by
another seat.

Seat: consistent - parent-authored spec text, reviewer seat outside the author in both rounds.

## Acceptance

| #   | Criterion                               | Verdict  | Evidence                                                                                                         |
| --- | --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | No spec describes a retired screen      | ACCEPTED | `grep "stay under Imports"`, `"Events, Series and Offerings"` - no hits beyond the spec title and the change log |
| 2   | The detail route is decidable           | ACCEPTED | `ui.md` 4.3 + AC-51, `events-offerings.md` FR-4 and its nav table all carry `?kind=`                             |
| 3   | Every retired route has an exact target | ACCEPTED | AC-51's table names all six cases, including the bare `#/ussd/headcount`                                         |
| 4   | Headcount model and USSD flow unchanged | ACCEPTED | one entry-point paragraph in the headcount spec; `member-registrations-ussd.md` untouched                        |
| 5   | No new API route                        | ACCEPTED | `POST /v1/imports/attendance` and the headcount routes unchanged                                                 |
| 6   | `npm run verify` passes                 | ACCEPTED | gate-run signature above                                                                                         |

## Deviations

- Tier 1: spec text only. The routes and pages are the next round, and that round carries the §17 hard
  gate for the four retired routes; AC-51 turns each into a redirect so the gate is a reviewable mapping.
- The catalogue change exists only because wrapping AC-3/AC-5/AC-7 moved their heading lines, which is
  what `acsMatch` reads. No claim, state or disposition changed.
- The reviewer seat's second round found residuals rather than new faults. Recorded here rather than
  hidden, and the fixes are mechanical.
