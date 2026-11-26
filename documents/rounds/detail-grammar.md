# Round - detail-grammar

|                        |                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                          |
| Tier                   | 2                                                                                             |
| Mode                   | `attended` (the owner accepted the twelve detail questions "all as recommended")              |
| Base                   | `724679d`                                                                                     |
| Review rounds          | 0                                                                                             |
| Gate runs in parent    | 0                                                                                             |
| Spec                   | `member-registrations-ui.md` (FR-42b/FR-42e, AC-63a), `member-registrations-event-periods.md` |
| Workers                | `single`                                                                                      |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (detail UI, fixtures, capture)`                 |
| Verbs this round needs | `branch, commit, push, pr, merge`                                                             |

## Grill

One `grill-flash` round on the detail's two observations, answered "all as recommended". The seat corrected the brief on three
facts: the preview resolves from the **earliest** stored rule version (January 2025 on the fixture) while the table shows the
90 days ending today, so the two blocks share no dates; `22` is a **different family** from `02`/`13`/`14`, and its only real
delta is the period line; and the form's cycle line has two live defects ("whole period" for a whole week, and a raw cycle on
a one-off edit).

1. **Drop the detail's Preview.** The detail's dates are stored; the occurrence table is the record. State `23` retires.
2. **"Preview, never an inline table" is the authoring rule**: the detail's table is the stored record, not a preview.
3. **The read carries `period.dates`** (`week | date | null`), derived from the resolver's kind, never stored — **its own
   round** (`event-period-dates`), because it is a wire-contract change.
4. **No span claim when the shape is absent** — a sentence true of both shapes beats one true of one.
5. **Re-cut `22` as a variant of `02`**, line inside the identity card, definition list dropped, claims added; `23` retires.
6. **One grammar**: `periodProvenanceLine` serves the form and the detail, and the form's two defects are fixed with it.
7. **Close at `target`** with the capture and hash; the owner signs on return. No auto-sign.
8. **Two rounds**: this one ships what the read supports; `event-period-dates` carries the wire.
9. **The edited one-cycle event**: the line keeps the range it actually holds and drops the cycle claim when the held dates no
   longer fall in `period_cycle`'s month; recorded now, testable when the occurrence date edit lands.
10. **Round doc first**, then the work; Tier 2, one worker, not parallel.
11. **A period fixture and a capture** in the same round, or `22` can only be `never compared`.
12. **The backlog row splits**: this round closes the period line; the audience chips need their own drawing and an AC-60 read.

## Review

`0813` (`reviewer-pro`) plan review: `Seat: consistent`, with one **P1** - FR-42b and FR-42e still required the detail's
preview the round removes, so both clauses are amended in this change rather than left contradicting the code - and two
**P2s**, both applied here: the form's three line call sites are pinned to one function, and the detail's catalogue fetch is
recorded for removal when `period.dates` reaches the read.

Seat: consistent

## Plan

- **UI**: drop the detail's preview; keep the provenance line, placed inside the identity card; **one grammar**:
  `periodProvenanceLine` replaces the form’s edit-time `periodLine` and the create-time `buildCycleLine` period
  branch, including the create summary line that prints "whole period" today; fix the two defects it exposes.
- **Fixtures and capture**: one seeded period parent and an `event-detail-period` capture.
- **Mocks**: `22` re-cut as a `02` variant and brought to the owner as a `target`; `23` retired.
- **Specks**: the authoring/record distinction, the no-span fallback, the edited one-cycle rule.

Acceptance criteria:

1. The detail renders the provenance line in its four shapes and no preview control.
2. One grammar function produces the form's and the detail's line; the form no longer says "whole period" and no longer prints
   a raw cycle.
3. `22` renders `02`'s chrome with the line inside the identity card, and carries claims; `23` is retired.
4. An e2e/capture of a seeded period event shows the line.
5. The detail’s catalogue fetch is recorded for removal when `event-period-dates` lands, rather than left to linger.
6. Gates green; every touched state is `signed` or `target` with a reason.

## Verification

| Gate                          | Command                        | Result                                                                               |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| format, lint, typecheck, test | `npm run verify:fast`          | pass 4/4 (one flake re-run: `subscriptions` and `ussd-verification` passed isolated) |
| UI unit                       | `npm run ui:test`              | 572 passed                                                                           |
| UI DOM                        | `npm --prefix ui run test:dom` | 268 passed                                                                           |
| browser pass                  | `npm run ui:e2e`               | 93 passed                                                                            |
| captures                      | `npm run ui:capture`           | 32 passed; new `event-detail-period.png`                                             |

gate-run 2026-11-26T07:22:05.961Z profile=fast steps=4/4 lines=4 bytes=717

## Git writes

| Brief | Actor | Verb | Variant | Reason |
| ----- | ----- | ---- | ------- | ------ |

## Mock sign-off

| Surface | Mock | Capture | sha256 | Signer | Date | Verdict |
| ------- | ---- | ------- | ------ | ------ | ---- | ------- |

## Mock parity

| Claim | Type | State | Answer (max prob) | Threshold | Confirmed by | Disposition |
| ----- | ---- | ----- | ----------------- | --------- | ------------ | ----------- |

## Acceptance

| Criterion | Met | Evidence | Verdict |
| --------- | --- | -------- | ------- |

## Deviations

- **The branch was cut and the worker's changes made before this doc existed** (§9 wants the round doc first). The doc is
  committed as the branch's first commit and the deviation is recorded here rather than hidden.
- **Part of the worker's first diff is discarded**: the detail's preview, its input builder and the `readOnly` prop were built
  before Q1 dropped the block.
