# Round - activity-detail-mock

|                     |                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                              |
| Tier                | 1 - Plan                                                                                                          |
| Mode                | unattended (auto-accept recommendations)                                                                          |
| Base                | `b7b2dc8`                                                                                                         |
| Review rounds       | 0                                                                                                                 |
| Gate runs in parent | 1                                                                                                                 |
| Spec                | `member-registrations-ui.md` 4.3, AC-50, AC-51; `member-registrations-events-offerings.md` FR-4/5/6/8, AC-3/5/6/7 |
| Workers             | `single`                                                                                                          |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (mock markup, capture, catalogue, round doc)                         |

## Plan

Phase A of the consolidation: the merged **activity detail**, cut from the spec rather than from the
five screens it replaces.

One source (`mockups/v2-events/03-activity-detail.html`) produces three states: `kind=series`,
`kind=event` and the cancelled row. Per Q4 the cancelled _screen_ retires into a row state, and per Q1 a
state is complete when it has a source, a shell check, a catalogue entry and at least one claim.

### What each state carries

| State                          | Shows                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `03-activity-detail-series`    | four summary tiles, schedule versions, exceptions, and session rows with **View rows**, **Record headcount** and **Import** |
| `04-activity-detail-event`     | Strategic Conference, `Held`, standalone: its own crumb, title and three conference dates, **no** schedule, tiles or import |
| `05-activity-detail-cancelled` | the same page with the cancelled session row carrying its reason, and the other sessions still readable                     |

Every counted session shows its total **with its lane buckets** - `150` over
`V 22 (12 M · 8 F · 2 C) · P 8` - because a bare number is the ambiguity the lanes round removed.

### Scope

- `mockups/v2-events/03-activity-detail.html` - new, built on the shell the signed roster defines.
- `mockups/v2-events/capture-activity-detail.mjs` - captures the three states in place.
- `documents/mock-claims/v2-events.json` - one `activity-detail` surface, three new states, seven entries;
  the three superseded states and their entries are dropped.

Acceptance criteria:

1. One page serves both kinds, and the event state is not a series with panels hidden.
2. Each session row carries the controls FR-8 and AC-3 name.
3. A counted row shows its total with its lanes.
4. A standalone event offers no import, and the mock says so.
5. The catalogue validates; no state is stale.
6. `npm run verify` passes.

## Verification

| Gate            | Command                                                         | Result                           |
| --------------- | --------------------------------------------------------------- | -------------------------------- |
| Shell guard     | `node scripts/mock/shell-check.mjs`                             | 21/21 carry the shell            |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                 | 77 passed                        |
| Auto-sign       | `node scripts/mock/sign-unattended.mjs --list <all seven sets>` | 0 to sign, 54 unchanged, 0 stale |

gate-run 2026-11-15T13:06:38.151Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

Three states cut and **auto-signed** for this unattended stretch, listed for the reviewer's second look.

| Set / state                              | sha256                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `v2-events/03-activity-detail-series`    | `cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af` |
| `v2-events/04-activity-detail-event`     | `bcb0c03c6e28bf4270e73ada34d4517fcbe192cd207836297aa7bcfef03cadaf` |
| `v2-events/05-activity-detail-cancelled` | `a7621b8390b222710d74a9b4acb971aa2e877c0db369172b2b2e6e53143927cb` |

### Retired with this round

Three states leave the catalogue on Q3 (drop the state, keep the picture in `mockups/_archive/`):
`event-detail-series`, `event-detail-cancelled` and `series-detail`. Each named a screen the
consolidation merges into the activity detail; keeping them would pin two designs for one page.

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0.

## Mock parity

| Surface         | States | Claimed | e2e-only | Deferred | Probe    |
| --------------- | ------ | ------- | -------- | -------- | -------- |
| activity-detail | 3      | 3       | 1        | 1        | advisory |

The probe is advisory because only one ABSENT spec control is genuinely visible (`AD-NO-IMPORT-EVENT`);
the rest of the absence lives in behaviour, not pixels.

## Acceptance

| #   | Criterion                                                                | Verdict  | Evidence                                                                                      |
| --- | ------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| 1   | One page serves both kinds; the event is not a series with panels hidden | ACCEPTED | `04-activity-detail-event.png` carries its own crumb, title, venue and three conference dates |
| 2   | Session rows carry the spec's controls                                   | ACCEPTED | `View rows`, `Record headcount`, `Import`; `AD-HEADCOUNT` and `AD-IMPORT` claim them          |
| 3   | A counted row shows total with lanes                                     | ACCEPTED | `150 / V 22 (12 M · 8 F · 2 C) · P 8`; `AD-LANES`                                             |
| 4   | A standalone event offers no import                                      | ACCEPTED | the event state removes the control; `AD-NO-IMPORT-EVENT` asserts its absence                 |
| 5   | Catalogue validates, nothing stale                                       | ACCEPTED | 77 passed; `0 to sign, 54 unchanged, 0 stale`                                                 |
| 6   | `npm run verify` passes                                                  | ACCEPTED | gate-run signature above                                                                      |

## Deviations

- Tier 1: mock markup, capture and catalogue data; no `src/` or `ui/src/` change.
- The headcount dialog and the import panel are **not** cut here. They are Phase A's remaining two
  states, and cutting them needs a dialog frame rather than the page frame; doing them in the same pass
  would have doubled the review surface for one round.
- `06-attendance-rows` is kept as an adopted capture even though the activity detail's session rows now
  carry that content: it is the record of a screen that has not been formally retired, and dropping it
  without a decision would be the same silent loss this stretch was correcting.
