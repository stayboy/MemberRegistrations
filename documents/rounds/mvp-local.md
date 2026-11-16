# Round — mvp-local

|                     |                                                                       |
| ------------------- | --------------------------------------------------------------------- |
| Status              | OPEN — current target                                                 |
| Tier                | 1 (planning); each build inside it is its own round                   |
| Mode                | attended (owner, 2026-11-10)                                          |
| Base                | `6425d1e`                                                             |
| Review rounds       | 0                                                                     |
| Gate runs in parent | 0                                                                     |
| Spec                | `documents/runbooks/local-docker.md`; the UI and API specs as written |
| Workers             | `single`                                                              |

### Decisions (owner, 2026-11-10)

- **The MVP is the Docker Compose stack.** Docker Compose is the delivery target; production is a
  separate round, postponed until the local stack is stable and every feature is delivered.
- The production cutover (`mvp-release-cutover`), its three secrets, the Pages deploy and the
  `v0.1.0-mvp` tag are **parked**, not cancelled.
- "Stable and complete" means: a clean volume boots, an officer signs in, every implemented screen is
  reachable and exercisable, and the two spec-required parity gaps are closed.
- No production secret is needed: the stack runs `NODE_ENV=development` with the console mailer.
- The local stack must enable the switched-off subsystems so their screens can be tested.

## Definition of done

1. `docker compose down -v` then `docker compose up --build -d` on a clean volume: `db` healthy,
   `migrate` exits 0, `app` and `ui` up.
2. `/health` answers `200`, an officer is seeded by CLI, and sign-in completes through the console
   mailer on `http://localhost:8080`.
3. Compose sets `USSD_ENABLED=true` and `PAYMENTS_ENABLED=true` for the local stack, so the USSD
   **channel**, the simulator and the payment callback are all exercisable. The operator headcount
   page is retired (owner, 2026-11-15): a count is recorded from the activity detail’s session row,
   and the phone flow is unchanged.
4. Both spec-required parity gaps are closed: the series-detail attendance/offering summary (FR-6,
   AC-5) and the contextual Import-attendance entry on event and series detail (FR-8, AC-7).
5. The adopted mock-parity items are built for every surface the consolidation keeps, each with an
   assertion per adopted element and a capture refresh: **activity list, activity detail (both
   kinds), its two dialogs, members list, roster, reports, imports and settings**, plus the five
   shell states. **One exception is named rather than implied:** the series activity’s occurrence row
   carries no headcount until `GET /v1/series/:id/occurrences` returns event ids, so that one row is
   outside parity and is parked in the backlog. Parity is claimed for the surfaces that have a **live
   source and a signed mock**;
   the nine screens that exist only as prototype captures are outside it and are named in
   `documents/backlog.md` (owner, 2026-11-15).
6. `npm run verify`, `npm run smoke`, `npm run ui:test` and `npm run ui:e2e` are green.
7. `documents/runbooks/local-docker.md` matches what the stack actually does, including the retired
   routes and their redirects (AC-51).

Out of scope: Vercel, GitHub Pages, production secrets, the release tag, PITR and alerting.

**Drifts are cut (owner, 2026-11-16).** Any mock-versus-build difference still open when the tag is cut
ships as a **named exclusion in the release claim**, not as a fix round: the claim says what was compared
and what was not, in the sentence that makes it. The first entry is 8f, the page's single verb drawn as a
secondary button in the build and a filled primary in five mocks
(`documents/parity/comparison-pack.md`). This is a scope ruling, not a quality bar: the difference is
recorded, and the next release that touches `PageFrame` pays one line for it.

**The accessibility claim names its route and state scope (owner, 2026-11-16).** `ui/e2e/axe.spec.ts`
audits: the members list, the events list, the offerings list and one event detail; the shell in four
accents × two schemes; the Offerings count page and its record dialog; and the **sign-in gate** in three
states - idle, link sent, and expired session - in both schemes. It does **not** audit: the
signing-you-in and signed-in states of the gate, its transport-error bar, member detail, member add/edit,
archived members, the series form, the imports pages, the three shepherding pages, the USSD pages other
than offerings, admin ministries, settings, or the not-found route. The sentence is the claim: anything
added to that suite joins this list, and anything left out is named here rather than implied.

## Current state

| Item                    | State                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean boot              | works — migrations run in the `migrate` service, app waits for it                                                                                                               |
| Health                  | `200`                                                                                                                                                                           |
| Sign-in                 | works locally; the link is printed by `ConsoleMailer`                                                                                                                           |
| CORS                    | `/health`, `/auth`, `/gateway` all answer the allowlist                                                                                                                         |
| USSD screens            | exercisable — compose sets `USSD_ENABLED=true`; `/ussd/session` answers `401` without a signature                                                                               |
| Payments callback       | mounted — `PAYMENTS_ENABLED=true`; the callback answers `401` without a signature                                                                                               |
| Series detail summary   | built — the activity detail reads `GET /v1/series/:id/summary` for its four tiles                                                                                               |
| Contextual import entry | built — the activity detail imports attendance for a chosen session                                                                                                             |
| Mock parity builds      | in progress — shell, roster, activity list, activity detail and its dialogs, events rows and settings are signed; the series occurrences row and the three members atoms remain |

## Plan

1. Compose: add `USSD_ENABLED=true` and `PAYMENTS_ENABLED=true` to the `app` service, keeping the
   development mailer and the dev-default secrets. Update the runbook in the same change.
2. Build the two R gaps, series summary first.
3. Run the parity builds in the agreed order, each with assertions and a capture.
4. Re-run the four gates on a clean volume and record the result here.

### Acceptance criteria

1. A clean `down -v` plus `up --build -d` reaches a signed-in session with no manual step beyond seeding.
2. Every screen listed in `ui-mock-parity.md`'s screen index is reachable and usable locally, including
   the USSD screens and the simulator.
3. The two R gaps are closed with tests.
4. The four gates are green on the base commit.
5. The runbook matches the stack.

## Verification

| Gate       | Command            | Result                                                      |
| ---------- | ------------------ | ----------------------------------------------------------- |
| Clean boot | `compose down -v`  | pending                                                     |
| Sign-in    | compose + console  | pass (2026-11-10)                                           |
| Subsystems | USSD + payments    | pass — both `401` without a signature                       |
| Gates      | `verify` / `smoke` | format/lint/typecheck pass; test 2 worker exits, 0 failures |

gate-run 2026-11-10T19:22:42.771Z profile=fast steps=3/4 lines=28 bytes=6224

## Review

n/a — planning round; the builds are reviewed on their own.

## Mock sign-off

n/a — no new surface; the parity builds sign their own reduced mocks.

## Mock parity

Inherited from `ui-mock-parity.md`; this round builds the adopted items.

## Acceptance

| #   | Criterion                           | Met     | Evidence | Verdict |
| --- | ----------------------------------- | ------- | -------- | ------- |
| 1   | Clean boot to a signed-in session   | pending |          | PARKED  |
| 2   | Every indexed screen usable locally | pending |          | PARKED  |
| 3   | Two R gaps closed with tests        | pending |          | PARKED  |
| 4   | Four gates green                    | pending |          | PARKED  |
| 5   | Runbook matches                     | pending |          | PARKED  |

## Deviations

- Production is postponed by owner decision (2026-11-10); the cutover round and its secrets stay
  parked until this round closes.
