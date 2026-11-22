# Round — events add

|                        |                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                           |
| Tier                   | 2 — Reviewed                                                                                                                                                   |
| Mode                   | `attended`                                                                                                                                                     |
| Base                   | `8fa9e7b`                                                                                                                                                      |
| Review rounds          | 2                                                                                                                                                              |
| Gate runs in parent    | 2                                                                                                                                                              |
| Spec                   | `documents/specs/member-registrations-ui.md` (FR-42, FR-42a, FR-42b)                                                                                           |
| Workers                | `single`                                                                                                                                                       |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (form, client, page, tests); parent ollama-cloud/deepseek-v4.1-flash:1017 (round doc, spec, integration, gates)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                        |

## Seats

| Seat            | Picked (local) | Window | Class          | Candidate probed                                   | Basis                                                              |
| --------------- | -------------- | ------ | -------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| Grill-me        | `2026-11-22`   | out    | `grill-flash`  | `ollama-cloud/deepseek-v4.1-flash:1017` — answered | First candidate outside 12:00–18:00 local (06:30 UTC)              |
| Worker          | `2026-11-22`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` — answered | First candidate; the session itself                                |
| Reviewer (spec) | `2026-11-22`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813` — ACCEPT       | First candidate, pinned by `AGENTS.md` §10a; one confirmation pass |
| Git executor    | `2026-11-22`   | n/a    | `git-executor` | `opencode/beam-free` — 429; rung 2 answered        | Rung 1 failed before a token; rung 2 cut the branch                |

## Grill

Mode: attended. The owner answered **“all as recommend”** on 2026-11-22.

❓ **Q1 — Round scope:** both creation flows (restore **New series**, build **New event**), deferring event
edit/archive and generation.
➡️ Yes: both in one Tier 2 round; edit/archive and generation stay out. Cost: a route, page, client and e2e
fixture work; everything in one round would need write surfaces we have not designed.

❓ **Q2 — Entry-point shape:** the mock's `Refresh` plus one `Actions` menu holding **New event** and **New
series**, not new sidebar items.
➡️ Yes: mock shape only; it makes the existing EVA-ACTIONS claim true under AC-50. Cost: none.

❓ **Q3 — Event number:** the operator types `eventNo`; a duplicate `409` is shown inline.
➡️ Yes: mirrors `memberNo`; no wire change. Cost: one required field.

❓ **Q4 — Event form contents:** eventNo, name, dates, times, timezone, venue, description,
`tracksMembers`, `presbyterOnly` and a sessions editor; no status/source/offerings.
➡️ Yes. Cost: the sessions editor is the bulk.

❓ **Q5 — Sessions editor:** repeatable rows, one default row on the start date, blank times inherit, client
validation mirrors the repo (unique dates, in range, `endDate >= startDate`).
➡️ Yes. Cost: the largest single component.

❓ **Q6 — Series `presbyterOnly`:** expose the toggle on create and edit.
➡️ Yes: the API and DTO already carry it and a presbyter-only series is hidden on member surfaces. Cost:
touches the UI `SeriesDto`, both payloads, the form and tests.

❓ **Q7 — Generation:** a **Generate events** verb on the series detail, as a separate slice.
➡️ Yes, separate slice after the create flows. Cost: a write action with a result surface.

❓ **Q8 — Mock parity:** cut and sign a `v2-events` create-form state before code.
➡️ Yes. Cost: a mock cut and the owner's sign-off; the policy parks a UI round without one.

❓ **Q9 — Spec and process:** amend the UI spec, update parity/backlog/catalogue, spec review on
`reviewer-pro:0813`, then worker → Tier 2 review, branch from `origin/main`.
➡️ Yes. Cost: one spec review, one worker, one independent review; commit/push/PR/merge remain separate
verbs.

## Spec review

`ollama-cloud/deepseek-v4-pro:0813`, 2026-11-22, base `8fa9e7b`, uncommitted diff. First pass: **ACCEPT**
with five P2 gap-pass items (create routes, per-session status, toggle/timezone defaults, the
sole-conflict binding, the venue enum). All five were applied; the confirmation pass returned
**SPEC: PASS / VERDICT: ACCEPT** with no P1 or P2 remaining. The reviewed content is the amended
FR-42/FR-42a/FR-42b and AC-55–AC-57; a prettier pass re-padded the front-matter table without changing
the text. Owner approval is the next gate and is recorded below.

## Plan

Goal: make the Events section able to add a series and a standalone event from the UI, without a deep
link, and make the existing `EVA-ACTIONS` mock claim true.

Scope:

- **In:** the Events list action row (Refresh + `Actions` menu with **New event** and **New series**); a
  `EventFormPage` at `/events/new` with a `createEvent` client and pure format/validation helpers; a
  sessions editor; `presbyterOnly` on the series create/edit form; e2e fixtures for `POST /v1/events` and
  `POST /v1/series`; unit, DOM and e2e tests; the spec, parity doc, backlog and catalogue updates.
- **Out:** event edit/archive (`PUT /v1/events/:id` stays API-only), series→event generation (a backlog
  row), event status/search filters, and the offerings rail.

Expected files:

- `ui/src/pages/EventsListPage.tsx` — the two verbs.
- `ui/src/pages/EventFormPage.tsx` — new feature component.
- `ui/src/format/event-form.ts` and `event-form.test.ts` — new pure helpers.
- `ui/src/api/events.ts` — `createEvent` and the input types.
- `ui/src/app/router.tsx` — `/events/new`.
- `ui/src/format/series-form.ts` and its test, `ui/src/pages/SeriesFormPage.tsx`, `ui/src/api/series.ts` —
  `presbyterOnly`.
- `ui/e2e/fixtures.ts` — the two POST stubs.
- `ui/e2e/events.spec.ts` — the entry points and the event create flow.
- `ui/e2e/capture.spec.ts` — the new `events-new` baseline entry.
- `documents/specs/member-registrations-ui.md`, `documents/parity/comparison-pack.md`,
  `documents/backlog.md`, `documents/mock-claims/v2-events.json`.

Acceptance criteria:

1. The Events list renders `Refresh` as a bare icon and one `Actions` menu holding **New event** and **New
   series**; each opens its form.
2. The **New event** form creates a standalone event with eventNo, name, start/end date, start/end time,
   timezone, venue type, optional venue name and description, `tracksMembers`, `presbyterOnly` and one or
   more unique sessions inside the range; it never sends status or source; a duplicate eventNo shows the
   `409` against the field; success lands on the event detail.
3. The **New series** form creates a series and lands on the series detail (existing behaviour, now
   reachable).
4. The series form offers and sends `presbyterOnly` on create and edit.
5. Tests: unit for the event form helpers, DOM for the form, e2e for both entry points and the create
   flow; the fixtures answer `POST /v1/events` and `POST /v1/series`.
6. Fluent UI primitives only, no new dependency, no `X-Actor-Id` from the browser, and no change to the
   gateway's `no-store` contract.
7. The spec, parity doc, backlog and catalogue are updated; `comparison-pack.md` §2 no longer says the
   create flows are not built.

## Verification

| Gate           | Command                                                          | Result                                                                                                                 |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| UI unit        | `npm --prefix ui run test`                                       | pass — 45 files, 532 tests                                                                                             |
| UI DOM         | `npm --prefix ui run test:dom`                                   | pass — 22 files, 195 tests; first run 194/195 (`ContactsDialog` remove), isolated re-run 1/1 pass, full re-run 195/195 |
| UI typecheck   | `npm --prefix ui run typecheck`                                  | pass                                                                                                                   |
| UI lint        | `npm --prefix ui run lint`                                       | pass                                                                                                                   |
| UI build       | `VITE_GATEWAY_URL=… npm --prefix ui run build`                   | pass                                                                                                                   |
| Root gate      | `TEST_DATABASE_URL=… npm run verify`                             | pass — 7/7 (pooled Postgres 18.6 lane)                                                                                 |
| Browser        | `npm --prefix ui run e2e`                                        | pass — 80 tests                                                                                                        |
| Capture        | `npm --prefix ui run capture -- --grep "events new\|series new"` | pass — 2 tests, `events-new.png` and `series-new.png`                                                                  |
| Mock catalogue | `validateCatalogues` (local node)                                | pass — `Mock coverage: claimed 9 · e2e-only 1 · deferred 1 · prose 0`                                                  |

gate-run 2026-11-22T07:41:01.061Z profile=full steps=7/7 lines=7 bytes=964

## Git writes

`git-seat-budget: 12` (default; this round `1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync = 6 of 12`).

| Brief | Actor                 | Verb     | Variant                        | Reason                                                                                               |
| ----- | --------------------- | -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Rung 1 `opencode/beam-free` answered HTTP 429 before a token; `fallbackReason` recorded in the brief |
| 2     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | One round commit; the round doc carries the record                                                   |
| 3     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Feature branch only                                                                                  |
| 4     | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | Adopt an existing PR for this head if one exists                                                     |
| 5     | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | Only after `verify`, `ui` and `ui-e2e` report green                                                  |
| 6     | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull, the merge policy's chain                                                            |

## Mock sign-off

| Surface             | Mock                                     | Capture                           | sha256      | Signer | Date         | Verdict |
| ------------------- | ---------------------------------------- | --------------------------------- | ----------- | ------ | ------------ | ------- |
| Events → New event  | `mockups/v2-events/10-event-create.png`  | `ui/e2e/baseline/events-new.png`  | `97312ae3…` | owner  | `2026-11-22` | signed  |
| Events list         | `mockups/v2-events/01-events-list.png`   | `ui/e2e/baseline/events-list.png` | `16a6249f…` | owner  | `2026-11-22` | signed  |
| Events → New series | `mockups/v2-events/11-series-create.png` | `ui/e2e/baseline/series-new.png`  | `2e872ec7…` | owner  | `2026-11-22` | signed  |

Mock coverage: claimed 9 · e2e-only 1 · deferred 1 · prose 0

## Review

Independent Tier 2 review on `ollama-cloud/deepseek-v4-pro:0813` (base `8fa9e7b`): **ACCEPT**, Standards
and Spec both pass, no P1. Two catalogue-integrity findings, both applied:

- **P2** — the `series-create` inventory named `SYC-PRESBYTER` before its entry existed. The `SYC-PRESBYTER`
  entry was added.
- **Nit** — a duplicate `ac` key on `AD-MENU`. AC-55 now sits only on `EVA-ACTIONS`.

The reviewer's model could not read images, so its mock parity was structural; the parent read
`01-events-list.png`, `10-event-create.png` and `11-series-create.png` and their baselines directly.

The owner's later timezone ruling triggered one fix pass. The confirmation round on the same seat
returned **Standards PASS / Spec PASS / ACCEPT**, with both catalogue findings resolved and no
remaining P1/P2/Nit.

Seat: consistent — worker and parent `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer
`ollama-cloud/deepseek-v4-pro:0813`.

## Mock parity

| Claim         | Type          | State              | Answer (max prob) | Threshold | Confirmed by                      | Disposition |
| ------------- | ------------- | ------------------ | ----------------- | --------- | --------------------------------- | ----------- |
| EVA-ACTIONS   | spec-required | `01-events-list`   | PRESENT           | -         | parent (image), reviewer (source) | match       |
| EVC-FIELDS    | spec-required | `10-event-create`  | PRESENT           | -         | parent (image), reviewer (source) | match       |
| SYC-PRESBYTER | spec-required | `11-series-create` | PRESENT           | -         | parent (image), reviewer (source) | match       |

## Acceptance

| #   | Criterion                                                                                                                                 | Met | Evidence                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------- |
| 1   | Events list: bare Refresh and one Actions menu holding New event/New series; each opens its form                                          | yes | `EventsListPage.tsx:149-174`; `events.spec.ts:114-135`                                       |
| 2   | New event creates a standalone event from the FR-42a fields, unique in-range sessions, no status/source; 409 on eventNo; opens the detail | yes | `EventFormPage.tsx`; `event-form.ts`; `events.spec.ts:137-186`; `EventFormPage.dom.test.tsx` |
| 3   | New series creates a series and lands on the series detail                                                                                | yes | `router.tsx:186`; `SeriesFormPage.tsx`; `events.spec.ts:132-134`                             |
| 4   | Series form offers and sends `presbyterOnly` on create and edit                                                                           | yes | `SeriesFormPage.tsx:337-347`; `series-form.ts`; `series.spec.ts:17-36`                       |
| 5   | Unit, DOM and e2e tests; fixtures answer both POST routes                                                                                 | yes | 532 unit; 195 DOM; 80 e2e; `fixtures.ts` POST handlers                                       |
| 6   | Fluent primitives, no new dependency, no `X-Actor-Id`, no `no-store` change                                                               | yes | reviewer Standards PASS                                                                      |
| 7   | Spec, parity doc, backlog and catalogue updated; §2 no longer says the flows are not built                                                | yes | `member-registrations-ui.md`; `comparison-pack.md` 2a/2b; `backlog.md`; `v2-events.json`     |

Verdict: **ACCEPTED**.

## Deviations

- **Owner ruling 2026-11-22:** the timezone field is handled globally; it was removed from both create
  forms, the spec was re-reviewed and the mocks were re-cut and re-signed.
- **Series form drawing added:** the `presbyterOnly` control changes the series form, so `11-series-create`
  was cut and signed rather than leaving the changed surface undrawn.
- **Build-versus-drawing affordances:** the build adds Fluent's required asterisks, the series form's field
  hints and the series header button icons; the parity pack records them as corrections, not misses.
- **DOM flake:** `ContactsDialog`'s remove-confirmation test failed once under the parallel DOM lane, passed
  in isolation, and the full re-run passed 195/195; recorded under Verification.
- **Deferred:** series→event generation has no UI caller; `documents/backlog.md` carries the row.
