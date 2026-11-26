# Round — event-notifications-r1

|                        |                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED — implemented, both gates green, reviewed ACCEPT                                                                                       |
| Tier                   | 2 - Reviewed                                                                                                                                  |
| Mode                   | `attended`                                                                                                                                    |
| Base                   | `697e1c8`                                                                                                                                     |
| Review rounds          | 1                                                                                                                                             |
| Gate runs in parent    | 4                                                                                                                                             |
| Spec                   | `documents/specs/member-registrations-event-notifications.md`                                                                                 |
| Workers                | `single`                                                                                                                                      |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017 (queue, worker, probe); parent cline-pass/cline-pass/deepseek-v4.1-flash-1017 (round doc, gates) |
| Verbs this round needs | `commit` now; `push`, `pr` and `merge` only on the owner's separate words                                                                     |

## Git budget

git-seat-budget: 6

Arithmetic at open: 1 round-doc commit now, and — if the owner takes the work to `main` — 1 push, 1 PR and 1
merge, leaving 2 for the `opencode/beam-free` free-usage failures this seat has hit three times this month.
Nothing else may draw on it.

## Seats

| Seat   | Picked (local)                          | Window  | Class          | Candidate probed               | Basis                                                                                    |
| ------ | --------------------------------------- | ------- | -------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| worker | `ollama-cloud/deepseek-v4.1-flash:1017` | outside | `worker-flash` | first outside-window candidate | 19:30 local, so the outside-window order applies: ollama-cloud first, cline-pass second. |

## Grill

Answered by the owner on 2026-11-25 ("all as recommended") in the round that preceded this one. Each answer is applied
below rather than restated.

| #   | Answer                                                                                     |
| --- | ------------------------------------------------------------------------------------------ |
| 1   | This round's first commit also carries the `event-notifications-spec` per-write correction |
| 2   | R1 is **only** `0031_pgboss_schema` + the worker + the probe; `0030` splits into R2 and R3 |
| 3   | A `_probe` queue with a writing job and a failing job; it stays as the smoke's heartbeat   |
| 4   | A `worker` Compose service, no `/internal/notifications/tick` in this round                |
| 5   | The periods-guard amendment moves to R2                                                    |
| 6   | Done means three tests, a Compose drain, and a regeneration script for the vendored DDL    |
| 7   | The pg-boss dashboard lands here, local-only and behind basic auth                         |
| 8   | One branch, one PR: the spec and R1 land together                                          |

## Execution decisions

The owner answered a second frontier on 2026-11-25 ("all as recommended"). These are the choices the implementation runs
against.

| #   | Decision                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dispatch now. The worker edits `src/`, `docker-compose.yml`, `scripts/` and `tests/` only; the first commit also carries the backlog row correction and the spec's `### Mock` section. |
| 2   | `pg-boss` is pinned **exactly `12.39.0`**. The dashboard is invoked by `npx` and is never a dependency. Every upgrade is bump + regenerate + `doctor` + commit.                        |
| 3   | A boot check reads `pgboss.version` and fails with a diagnostic naming the expected version, `scripts/pgboss-schema.mjs` and the file to commit — not pg-boss's own assertion.         |
| 4   | The probe enqueues only when `PGBOSS_PROBE` is set; its handler is always registered so a stray job drains instead of dead-lettering. A test asserts production does not enqueue.      |
| 5   | The dashboard is its own optional service on `node:24.22.3-alpine`, `npx -y @pg-boss/dashboard@1.14.0`, basic auth from an env var, `profiles: ["tools"]`.                             |
| 6   | The worker sets `healthcheck: { disable: true }` (the `api` image's HTTP probe would fail it) and `restart: unless-stopped`, and drains on `SIGTERM` with a bounded wait it logs.      |
| 7   | PGlite proves the queue in the vitest lane; the `pg` backend is proved by `npm run smoke`, which starts the worker and asserts one probe job drains.                                   |

Node is **24.22.3**, above pg-boss's 22.12 floor, so no runtime bump is needed.

## Plan

**Goal.** Prove the queue. This round exists to retire one risk: that pg-boss cannot run under this repository's single
tracked migration runner, on both database drivers, with a vendored schema that stays in sync. It builds no
notification behaviour at all — no plan, no slot, no message, no delivery.

**Scope.**

- `0031_pgboss_schema` — pg-boss's own DDL, generated by its CLI and vendored, so `migrate: false` finds a schema at
  the matching version and the tracked runner remains the only thing that mutates the database (AGENTS §12).
- `src/queue/port.ts` — the narrow surface the domain will use: `enqueue(kind, payload, { singletonKey, startAfter })`,
  `work(kind, handler)`, `start()`, `stop()`. Nothing in it knows what a notification is.
- `src/queue/pgboss.ts` — the adapter, with `backend` chosen from the driver (`pglite` under tests, `postgres` under
  Compose and production) and `migrate: false`.
- `src/worker.ts` — starts the port, registers the probe handlers, stops cleanly on `SIGTERM`. It is the long-lived
  process the local MVP gives us; it registers **no** HTTP route.
- `compose: worker` — the `app` image with `command: ['node','dist/worker.js']`, no ports,
  `restart: unless-stopped`, waiting on `migrate` completing successfully.
- `compose: pgboss-ui` — `@pg-boss/dashboard` behind basic auth, bound to a local port, never deployed and never linked
  from the officer UI (spec FR-43). It reads the same `pgboss` schema.
- `scripts/pgboss-schema.mjs` — regenerates the vendored DDL with `pg-boss plans create` (the `migrate` plan inlines `CREATE INDEX CONCURRENTLY`, which the runner's transaction forbids), so an upgrade is a
  command and a diff rather than a memory.
- `tests/queue/*` — the three proofs below.

**Out of scope, deliberately.** `0030_event_notifications` and every table in it; the `/internal/notifications/tick`
route; the periods-guard amendment; any UI or USSD surface; any mock. They are R2, R3 and R4.

**Expected files.**

| File                                           | Change                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `src/db/migrations.ts`                         | `0031_pgboss_schema` appended to the tracked list          |
| `src/queue/port.ts`                            | New — the queue port                                       |
| `src/queue/pgboss.ts`                          | New — the adapter                                          |
| `src/worker.ts`                                | New — the long-lived worker                                |
| `docker-compose.yml`                           | `worker` and `pgboss-ui` services                          |
| `scripts/pgboss-schema.mjs`                    | New — regenerate the vendored DDL                          |
| `tests/queue/queue.test.ts`                    | New — claim and complete on PGlite                         |
| `tests/queue/dead-letter.test.ts`              | New — five failures, then dead-letter                      |
| `tests/db/pgboss-schema.test.ts`               | New — `pg-boss doctor` clean, and the vendored DDL matches |
| `documents/rounds/event-notifications-r1.md`   | This record                                                |
| `documents/rounds/event-notifications-spec.md` | The per-write row corrected to name the fallback           |

**Acceptance criteria for the round.**

1. `0031` applies on PGlite and on `pg`, and `pg-boss doctor` reports no drift afterwards.
2. The port enqueues, claims and completes a job on PGlite, and the same test passes against `pg` in the smoke lane.
3. A job that always fails is retried five times and dead-letters; the dead letter is readable.
4. `docker compose up` runs the worker and drains one probe job end to end.
5. The vendored DDL is reproducible: running the script against the installed pg-boss produces no diff.
6. The dashboard reads the `pgboss` schema locally and is absent from every production surface.
7. No notification table, route or surface is added.

## Verification

| Gate      | Command               | Result |
| --------- | --------------------- | ------ |
| Format    | `npm run verify:fast` | pass   |
| Lint      | `npm run verify:fast` | pass   |
| Typecheck | `npm run verify:fast` | pass   |
| Test      | `npm run verify:fast` | pass   |

This round adds a migration and a new runtime service, so `npm run smoke` is required, not optional.

gate-run 2026-11-25T20:11:22.063Z profile=fast steps=4/4 lines=4 bytes=701

The signature above is the close gate: `verify:fast` 4/4 with the implementation in the tree. The smoke also passed:
`ok worker drains a probe job end to end` … `smoke: PASS`.

## Git writes

| Brief                                 | Actor                                                     | Verb     | Variant | Reason                                                                     |
| ------------------------------------- | --------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------- |
| round doc + spec per-write correction | `git-executor` **rung 2**, `ollama-cloud/mimo-v2.6-flash` | `commit` | —       | `fallbackReason: free-usage-limit` — rung 1 failed on the spec round brief |

## Review

Seat: consistent — the `Implementer` row names the `worker-flash` seat and this reviewer is `reviewer-pro`, which is the
Tier 2 split AGENTS.md §3 requires.

**`reviewer-pro` / `ollama-cloud/deepseek-v4-pro:0813`, 2026-11-25. Verdict: ACCEPT. No P1s.**

Three P2s and four nits, all fixed in one pass:

| Finding                                                                                               | Fix                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy` was captured for the whole adapter, so a keyless kind could not coexist with the keyed kinds | `policyByKind` added; the port still carries no pg-boss vocabulary (pgboss.ts)                                                                                                                     |
| A drain that threw still exited `0`, telling a supervisor the worker shut down cleanly                | The stop error sets `stopFailed` and the exit code is non-zero (worker.ts)                                                                                                                         |
| The dashboard's read-only mode was asserted, not verified                                             | **The vendor docs were read and the claim was false**: read-only is `PGBOSS_DASHBOARD_READ_ONLY=1`, and the compose file had `'true'`. Fixed to `1`, with the docs' 403 behaviour quoted beside it |
| `dead-letter.test.ts` comment said `retryLimit 5` while the adapter uses 4 (five attempts)            | Corrected                                                                                                                                                                                          |
| The probe comment claimed both kinds "drain"                                                          | Corrected: the failing kind dead-letters, which is the ladder working                                                                                                                              |
| This round doc still said the script uses `plans migrate --dry-run`                                   | Corrected to `plans create`, with the reason                                                                                                                                                       |
| A migration comment pointed at `./pgboss-schema.ts`                                                   | Corrected to `src/db/pgboss-schema.ts`                                                                                                                                                             |

The reviewer also confirmed the three decisions the worker had to make without the brief: `retryLimit: 4` is FR-21's
"at most 5 attempts" read as five runs; the vendored DDL from `plans create` is the correct choice because the `migrate`
plan inlines `CREATE INDEX CONCURRENTLY`, which the runner's transaction forbids; and `exclusive` is what makes a
`singletonKey` dedupe at all.

## Mock sign-off

n/a — no user-visible surface in this round.

## Mock parity

n/a — no mock.

## Acceptance

| Criterion                                              | Met | Evidence                                                                                                              | Verdict |
| ------------------------------------------------------ | --- | --------------------------------------------------------------------------------------------------------------------- | ------- |
| 1. `0031` applies on both drivers, `doctor` clean      | yes | `tests/db/pgboss-schema.test.ts` — PGlite version 47 + `detectSchemaDrift().ok`; `pg` half runs the real `doctor` CLI | pass    |
| 2. Port enqueues, claims, completes on PGlite and `pg` | yes | `tests/queue/queue.test.ts` — the same contract on both, plus `null` on a held singleton key                          | pass    |
| 3. Five failures dead-letter, readable                 | yes | `tests/queue/dead-letter.test.ts` — five runs, dead-letter row carries `data` and `source_output`                     | pass    |
| 4. Compose worker drains a probe job                   | yes | `npm run smoke` — `ok worker drains a probe job end to end`                                                           | pass    |
| 5. Vendored DDL reproducible                           | yes | `tests/db/pgboss-schema.test.ts` regenerates and compares byte-for-byte; `scripts/pgboss-schema.mjs --check`          | pass    |
| 6. Dashboard local-only, absent from production        | yes | loopback bind, `tools` profile, read-only `1` (verified against the vendor docs), no reference outside compose        | pass    |
| 7. No notification table, route or surface             | yes | the diff; the schema test asserts no `0030` migration                                                                 | pass    |

## Deviations

- **The round doc is committed before any code, and with the previous round's correction in the same commit.** The
  owner took that shape (grill 1 and 8), so `documents/rounds/event-notifications-spec.md` and this file land together
  and the spec round's per-write row stops naming the seat that failed.
- **The dashboard's read-only flag was wrong, and the docs caught it.** The compose file carried
  `PGBOSS_DASHBOARD_READ_ONLY: 'true'`; the vendor documents `1`, and anything else leaves the dashboard able to
  send, retry, cancel and delete jobs — which FR-43 forbids. The verification was a `webfetch` of
  `pgboss.io/dashboard`, not an assumption, and the corrected value sits beside the docs' 403 behaviour.
- **`verify:fast` flaked once on socket exhaustion, and the flake is recorded.** At 20:05 the suite failed to _load_
  `tests/api/shepherding.test.ts` with `Error: address ENOBUFS` — all 17 tests skipped, not one assertion failing —
  with 96 vitest workers running and a three-day-old scratch Postgres container up. Isolated re-run: 17 passed in
  3.65 s; the full gate then passed 4/4 at 20:11:22.063Z. That is the round's first re-run (AGENTS.md §8); the
  second remains unused.
- **Two decisions the brief did not settle, confirmed by the reviewer.** `retryLimit: 4` is FR-21's "at most 5
  attempts" read as five runs, and the vendored DDL comes from `plans create` because the `migrate` plan inlines
  `CREATE INDEX CONCURRENTLY`, which cannot run inside the runner's per-migration transaction.
- **The periods guard is not amended here.** It moves to R2 with `0030`, because this round adds no behaviour that would
  justify touching it (grill 5).
