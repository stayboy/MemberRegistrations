# Round - phase-c-events-list

|                     |                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                     |
| Tier                | 1 - Plan                                                                                                 |
| Mode                | unattended (auto-accept recommendations)                                                                 |
| Base                | `be4a380`                                                                                                |
| Review rounds       | 0                                                                                                        |
| Gate runs in parent | 1                                                                                                        |
| Spec                | `member-registrations-ui.md` 4.3, AC-50; `member-registrations-events-offerings.md` FR-2/FR-5, AC-2/AC-4 |
| Workers             | `single`                                                                                                 |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (mock markup, capture, catalogue, round doc)                |

## Plan

Phase C, the last mock job inside the cutoff: the events list becomes a live screen with one row per
**activity**, and the two screens it absorbs leave the catalogue.

The list is what makes "fewer pages" true: a standalone event and a series are the same kind of row,
differing only in what the `When` column says — a date range, or a schedule with its next occurrence.
That is also where FR-5's coverage comes back, which R1's review flagged as lost.

### Scope

- `mockups/v2-events/01-events-list.html` - new, on the shared shell.
- `mockups/v2-events/capture-events-list.mjs` - captures it in place.
- `documents/mock-claims/v2-events.json` - an `events-list` surface with three claims; `01-events-list`
  becomes a sourced state; `03-series-list` and `06-attendance-rows` retire.

Acceptance criteria:

1. One row per activity, with a kind badge and the `When` column carrying a range or a schedule.
2. The page's two verbs sit in one Actions menu, with Refresh leading.
3. Status reads by colour and word: held, active, upcoming, cancelled.
4. The two retired screens leave the catalogue.
5. The catalogue validates; no state is stale.
6. `npm run verify` passes.

## Verification

| Gate            | Command                                                         | Result                           |
| --------------- | --------------------------------------------------------------- | -------------------------------- |
| Shell guard     | `node scripts/mock/shell-check.mjs`                             | 22/22 carry the shell            |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                 | 77 passed                        |
| Auto-sign       | `node scripts/mock/sign-unattended.mjs --list <all seven sets>` | 0 to sign, 54 unchanged, 0 stale |

gate-run 2026-11-15T14:17:52.265Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

`01-events-list` re-cut and **auto-signed**; listed for the reviewer's second look.

| Set / state                | sha256                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| `v2-events/01-events-list` | `16a6249fb9c59aa87737734d78b0e6478ecf3c975f6be48058e3da7e760c0699` |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0.

Three defects were found by looking rather than by the gate: the toolbar chips inherited mock.css's
stacked `.field` and dropped their chevron below the box (renamed to `filter-chip`), every status pill
rendered green (the pill now colours by status), and the chevron glyph misbehaved before it became an
inline text node.

## Mock parity

| Surface         | States | Claimed | e2e-only | Deferred | Probe    |
| --------------- | ------ | ------- | -------- | -------- | -------- |
| events-list     | 1      | 3       | 0        | 0        | full     |
| activity-detail | 5      | 3       | 1        | 1        | advisory |

## Acceptance

| #   | Criterion                                                              | Verdict  | Evidence                                                                                                                     |
| --- | ---------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | One row per activity, kind badge, `When` carries a range or a schedule | ACCEPTED | the capture: Strategic Conference and Leaders Retreat standalone, two series rows with `Weekly on Sunday · next 15 Nov 2026` |
| 2   | Two verbs in one menu, Refresh leading                                 | ACCEPTED | `EVA-ACTIONS`                                                                                                                |
| 3   | Status by colour and word                                              | ACCEPTED | Held green, Active green, Upcoming brand, Cancelled red                                                                      |
| 4   | Two retired screens leave the catalogue                                | ACCEPTED | `03-series-list` and `06-attendance-rows` deleted from the states                                                            |
| 5   | Catalogue validates, nothing stale                                     | ACCEPTED | 77 passed; `0 to sign, 54 unchanged, 0 stale`                                                                                |
| 6   | `npm run verify` passes                                                | ACCEPTED | gate-run signature above                                                                                                     |

## Deviations

- Tier 1: mock markup, capture and catalogue data; no `src/` or `ui/src/` change.
- The backlog row "Series schedule and next occurrence have no test" stays open: the mock now shows what
  FR-5 requires, but the **build** does not yet render series as rows, so the e2e assertion R1 removed
  returns in R2.
- `06-attendance-rows` is retired without its picture being kept in `mockups/_archive/`; the adopted
  capture was never signed by the owner and the activity detail's session rows carry the same content.
  Recorded here as the reason rather than left as a silent delete.
