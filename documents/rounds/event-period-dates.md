# Round - event-period-dates

|                        |                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                                 |
| Tier                   | 2                                                                                      |
| Mode                   | `attended` (the owner accepted the second parity grill’s thirteen answers, 2026-11-27) |
| Base                   | `d90c31d`                                                                              |
| Review rounds          | 0                                                                                      |
| Gate runs in parent    | 0                                                                                      |
| Spec                   | `member-registrations-event-periods.md`, `member-registrations-api.md`                 |
| Workers                | `single`                                                                               |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (contract, API, detail)`                 |
| Verbs this round needs | `branch, commit, push, pr, merge`                                                      |

## Gate

**GRANTED 2026-11-27.** The owner’s words were **"all as recommended"**, accepting the second parity programme
grill’s **thirteen** answers recorded below - Q2 names the migration and Q5 re-names the wire contract for this round.
The grant therefore names this round and both hard gates it needs:

- the **wire-contract change** - the detail read's `period` gains `dates` and `definition` - re-named here because the
  committed parity audit's Q8 is "the four targets are signature debt", not this round;
- the **migration** - `events.period_definition`, the snapshot the P1 requires.

The committed `openapi.json` snapshot moves with the wire.

## Grill

The second parity grill, answered "all as recommended". Its findings corrected three of the round's own claims: the
`definition` live/snapshot contradiction, `dates` being taken from the catalogue rather than the event, and this round's
gate existing only in a chat transcript.

1. **Best next step**: finish and merge this round, then R1.
2. **The P1**: snapshot `period_definition` at save, backfilled from today's catalogue with the basis recorded.
3. **`dates`**: derive it from the event's own stored dates, not the catalogue's live kind.
4. **Closeable?** No - the doc needs the gate-run line, the seat verdict, a sign-off row and the coverage line, and the
   Tier 2 review.
5. **Traceable authorisation**: this section, plus the specs reviewed.
6. **Order**: this round, then R1, then R2, then `RowActionsMenu`, then R6.
7. **Independence**: R1 and R6 are independent; R2 waits on this round for `02`/`13`; `19` parks.
8. **`01-events-list`**: withdraw `EVA-ACTIONS` and drop the state to `target`; its drawing still shows the menu.
9. **Measure forward** by contradictions removed.
10. **Drop** R6's mechanical check; shrink R2; park `19`.
11. **The auto-signed states** are an owner sitting, not a round.
12. **R1** re-inventories first; its premise (nine cases, two captures) is wrong.
13. **The release's numbers** are false in both directions and get their own docs round.

## Review

`0813` (`reviewer-pro`): contradicted twice, then `Seat: consistent`. The first pass caught the definition-live/snapshot P1 and the
list/detail seam; the second caught the migration number colliding with the notifications `0030` (it now sits at `0033`, the
first number free in both the code and the notifications spec, which reserves `0032` behind a test) and `dates` typed
non-null against its own prose. Its final note - a stale "until `period.dates` lands" clause - is fixed here.

Seat: consistent

## Plan

- **contract**: split the parent schemas so the detail's `period` carries `dates` and `definition` and the list's does
  not; regenerate `openapi.json`.
- **API**: derive `dates` from the event’s **own stored dates** at assembly (first two dates: one week apart or a
  month), and read `definition` from the **snapshot** written at save. Tests pin a whole-week event to `week`, a
  `day`-bearing week period and a single-date period to `date`, and the null case, per driver.
- **UI**: the detail's period block reads both fields from the read, its catalogue fetch is deleted, and the tooltip's
  rule line states "whole week" or the single date exactly. The form still fetches the catalogue for its list.
- **offerings (Q9)**: the detail summary is names only - no money, no currency - and the code comment cites the spec
  rather than only the owner's sentence; a backlog row records the doctrine reading.

Acceptance criteria:

1. The detail read returns `period.dates` and `period.definition`; the list read returns neither.
2. `dates` describes the event’s stored spacing (a `day`-bearing week period derives `date`), pinned on both drivers.
3. The detail no longer calls `GET /v1/events/periods`; the form still does.
4. A whole-week period event's line says "whole week", a single-date one says neither week nor date.
5. The offerings summary carries names only; the spec clause says so and the comment cites it.
6. Gates green, `smoke` included.

## Verification

| Gate                          | Command                        | Result                                                      |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------- |
| format, lint, typecheck, test | `npm run verify:fast`          | pass 4/4 (1346 tests)                                       |
| migration                     | `npm run smoke`                | PASS, 85 checks                                             |
| UI unit                       | `npm run ui:test`              | 571 passed                                                  |
| UI DOM                        | `npm --prefix ui run test:dom` | 274 passed                                                  |
| captures                      | `npm run ui:capture`           | 32 passed; `event-detail-period.png` unchanged (`ec651da2`) |

gate-run 2026-11-27T09:42:10.644Z profile=fast steps=4/4 lines=4 bytes=920

## Git writes

| Brief | Actor | Verb | Variant | Reason |
| ----- | ----- | ---- | ------- | ------ |

## Mock sign-off

| Surface                    | Mock                                           | Capture                                   | sha256     | Signer | Date       | Verdict |
| -------------------------- | ---------------------------------------------- | ----------------------------------------- | ---------- | ------ | ---------- | ------- |
| event detail, period event | `mockups/v2-events/22-event-detail-period.png` | `ui/e2e/baseline/event-detail-period.png` | `185c79d9` | owner  | 2026-11-26 | signed  |

Mock coverage: claimed 6 · e2e-only 0 · deferred 0 · prose 0

The drawing does not move: the block is unchanged on screen. The capture is the control that says so - it reproduces its
committed baseline byte for byte after the definition moved from the catalogue to the event.

## Mock parity

| Claim | Type | State | Answer (max prob) | Threshold | Confirmed by | Disposition |
| ----- | ---- | ----- | ----------------- | --------- | ------------ | ----------- |

## Acceptance

| Criterion                                                                                | Met | Evidence                                                                                                               | Verdict  |
| ---------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| The detail read returns `period.dates` and `period.definition`; the list returns neither | yes | the schema split, `EventDetail` vs `Event`, and the wire test                                                          | ACCEPTED |
| `dates` describes the event’s stored spacing                                             | yes | `periodDatesKind` over the event’s first two dates; a `day`-bearing week period derives `date`, pinned on both drivers | ACCEPTED |
| The detail no longer calls `GET /v1/events/periods`                                      | yes | the query is deleted; two DOM tests assert it is never called                                                          | ACCEPTED |
| A whole-week event says so; a single-date one claims neither                             | yes | the tooltip line switches on `dates`, with the null case claiming nothing                                              | ACCEPTED |
| The offerings summary is names only, with the spec clause and the comment citing it      | yes | the spec’s detail clause; the doctrine reading backlogged with its cost                                                | ACCEPTED |
| Gates green, `smoke` included                                                            | yes | `verify:fast` 4/4, 571 / 274 / 32                                                                                      | ACCEPTED |

## Deviations

- The offerings remark is **narrowed by interpretation** to the display. If the owner meant doctrine - an offering is a
  cause, not a price - the change is a migration on three tables plus the wire and the USSD count currency, and the
  backlog row says so in those words.
