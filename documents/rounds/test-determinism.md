# Round — test-determinism

|                     |                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                       |
| Tier                | 2                                                                                                          |
| Mode                | attended (owner: "yes" to the five-question grill, 2026-11-13)                                             |
| Base                | `0e635ed`                                                                                                  |
| Review rounds       | 0                                                                                                          |
| Gate runs in parent | 0                                                                                                          |
| Spec                | no behavioural spec change; the diagnosis below is the record, and `documents/backlog.md` carries the item |
| Workers             | `single`                                                                                                   |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (config, CI image, .nvmrc, parent runs the flash worker model)    |

## Plan

The local `verify` gate failed 6 times on 2026-11-12 with exit `3221226505` and **zero failed assertions**, which
forced one `--no-verify` commit. Investigation on 2026-11-13 separated two failure modes and measured both.

### Mode A — Node 24.15.0's V8 aborts on Wasm code GC

`0xC0000409` is a V8 fail-fast from `Check failed: jit_page_->allocations_.erase(addr) == 1`
(nodejs/node#66366): Node 24's V8 double-frees a wasm→JS import wrapper when Wasm code GC races worker
teardown. Every test file instantiates PGlite (Postgres in Wasm), so the suite frees Wasm code dozens of
times per run — the worst-case trigger. The V8 backport (nodejs/node#66376) shipped in the 24.22.x line:
this host was `24.15.0` with V8 `-node.48`; `24.22.3` is `-node.63`.

Measured, same suite, 16-core host:

| Node    | Workaround                     | Runs | Failed | Signature                                                                                                                |
| ------- | ------------------------------ | ---- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| 24.15.0 | none                           | 5    | 3      | worker abort, random file                                                                                                |
| 24.15.0 | `--execArgv=--no-wasm-code-gc` | 5    | 2      | same abort (the flag reaches the workers — proved with a throwaway `process.execArgv` test — it does not stop this host) |
| 24.22.3 | none                           | 5    | 1      | **no abort at all**; 13 × `Hook timed out in 20000ms`                                                                    |

CI (`node-version: 24`) and the Dockerfile (`node:24.22.2-alpine`) were already on fixed builds; only the
developer host had drifted.

### Mode B — the 20 s hook timeout is too tight for Wasm Postgres init

With the abort gone, the remaining failure is `Hook timed out in 20000ms` in `beforeAll`: each file runs
`createTestApp()` → PGlite instantiation + migrations, and with ~16 files starting a Wasm Postgres at once on a
loaded machine that exceeds 20 s. The timed-out files then close their engines under in-flight queries, which
surfaces as 13 files failing with `Error: PGlite is closed` and 286 tests skipped. The origins are scattered
across `src/routes/members.ts`, `events.ts` and `series.ts` — no handler is at fault.

### Changes

1. `.nvmrc` = `24.22.3`; `engines.node` = `>=24.22.3`. A stale patch becomes impossible to miss.
2. `vitest.config.ts`: `hookTimeout: 20000` → `60000`. It is a liveness guard, not a performance budget.
3. `.github/workflows/ci.yml`: the `postgres` service `16` → `18`, so the `pg` lane tests the major the local
   MVP stack runs (`docker-compose.yml` pins `postgres:18.6-alpine`).
4. `.prettierignore` gains `.nvmrc` (`.nvmrc` has no parser, and `format:check` runs over the repository root).

Review-time additions (P2s, all accepted):

5. `Dockerfile` `node:24.22.2-alpine` → `24.22.3-alpine`, so the image satisfies the floor this round declares.
6. `.npmrc` with `engine-strict=true`, so `engines` binds rather than warns; without it the floor is advisory.
7. CI service pinned `postgres:18.6` (not the floating `18`) to match `docker-compose.yml`'s `18.6-alpine`.

**Rejected, on measured grounds:** a gate retry keyed on the exit code (there is nothing left to retry once the
patch is current, and a retry that can swallow a transient failure is the one thing a gate must not do), and
`--no-wasm-code-gc` (it did not stop the abort on 24.15.0; the patch did).

### Out of scope, and next

The `pg` lane (run the API suite against a real Postgres, with per-file database isolation) is its own round:
it is a migration-sized change with a daemon precondition for that lane, and it is not needed to unblock the
MVP. The 4 existing `pg` contract tests already run in CI against the service step 3 now moves to 18.

## Verification

Host `node v24.22.3`, V8 `13.6.233.17-node.63`. Ten consecutive `npm run verify` runs, all `7/7`, **zero
aborts and zero hook timeouts**; the final run's `.gates/test.log` reads `52 passed (52)` files and
`735 passed | 6 skipped (741)` tests (the 6 skips are the `pg` contract suites without `TEST_DATABASE_URL`).

```
run 1  gate-run 2026-11-13T06:16:32.438Z profile=full steps=7/7 lines=7 bytes=1054
run 2  gate-run 2026-11-13T06:17:48.452Z profile=full steps=7/7 lines=7 bytes=1054
run 3  gate-run 2026-11-13T06:18:57.124Z profile=full steps=7/7 lines=7 bytes=854
run 4  gate-run 2026-11-13T06:19:48.674Z profile=full steps=7/7 lines=7 bytes=854
run 5  gate-run 2026-11-13T06:20:42.403Z profile=full steps=7/7 lines=7 bytes=854
run 6  gate-run 2026-11-13T06:21:35.660Z profile=full steps=7/7 lines=7 bytes=854
run 7  gate-run 2026-11-13T06:22:28.130Z profile=full steps=7/7 lines=7 bytes=854
run 8  gate-run 2026-11-13T06:23:21.504Z profile=full steps=7/7 lines=7 bytes=854
run 9  gate-run 2026-11-13T06:24:11.015Z profile=full steps=7/7 lines=7 bytes=854
run 10 gate-run 2026-11-13T06:25:04.305Z profile=full steps=7/7 lines=7 bytes=854
```

Gate signature — all code final; this record's own prose moved after it, and `format:check` and `check-round`
were re-run on the final text:

gate-run 2026-11-13T06:26:35.283Z profile=full steps=7/7 lines=7 bytes=854

For contrast, the same suite on `24.15.0` before the change: 3 of 5 runs aborted. The acceptance signature is
run 10, above.

A first attempt at this proof was discarded because I edited `Dockerfile`/`.npmrc`/`ci.yml` mid-run (runs 3 and
4 failed `format:check` on a half-written file). The ten above ran on a frozen tree; only the round doc changed
afterwards.

## Review

Tier 2, independent seat `ollama-cloud/deepseek-v4-pro:0813` (06:1x local, outside the window, so no fallback).

**Verdict: ACCEPTED.** `Standards: FINDINGS (P2 only)`, `Spec: PASS` (all nine Plan claims met, measurements
consistent), `Seat: consistent`.

P2s and their disposition:

| P2                                                                     | Disposition                                                                                                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile` pinned `24.22.2`, below the declared floor                | fixed — both stages now `24.22.3-alpine`                                                                                                                                  |
| `engines` is advisory without `engine-strict`                          | fixed — `.npmrc` sets `engine-strict=true`                                                                                                                                |
| `postgres:18` floats within the major while compose pins `18.6-alpine` | fixed — CI pinned to `18.6`                                                                                                                                               |
| `hookTimeout` loosens the only hook guard                              | accepted with the reserve recorded in Deviations (cap `maxWorkers` before raising further); `testTimeout` does not cover hooks, so a genuine deadlock still fails at 60 s |
| `documents/backlog.md` still listed the rejected candidates as live    | reconciled with this round's diagnosis                                                                                                                                    |

The reviewer also settled `AGENTS.md` §12: the deferred `pg` lane is **not** a rule breach — §12 requires the
same _repository_ contracts on both drivers, and the four `pg` contract suites already run in CI against the
service. The lane is strictly more than the rule asks.

Seat: consistent — the Implementer row names the parent's flash model and the Deviations state the
Tier 2 parent-authored reasoning; the reviewer is a different model family and reviewed its own reading.

## Mock sign-off

n/a — no visual surface.

## Mock parity

n/a — no surface changed.

## Acceptance

**ACCEPTED.**

| Criterion                           | Evidence                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Mode A removed                      | ten runs, zero `3221226505`; V8 `-node.63`                                                          |
| Mode B removed                      | zero `Hook timed out`; `hookTimeout: 60000`                                                         |
| `.nvmrc` + binding floor            | `.nvmrc` `24.22.3`, `engines >=24.22.3`, `.npmrc` `engine-strict=true`, Dockerfile `24.22.3-alpine` |
| CI Postgres matches the local stack | `postgres:18.6` in `ci.yml`, `18.6-alpine` in `docker-compose.yml`                                  |
| Suite unchanged                     | 741 tests, 52 files, 0 failed, every run                                                            |
| Reviewer                            | `ACCEPTED` on `0813`, four P2s fixed or recorded                                                    |

Not covered, and named for honesty: the `pg` lane is not built here (its own round), CI has not yet run on
`postgres:18.6`, and `engine-strict` has not been exercised by a `npm ci` on an under-floor Node — the floor is
declared, not yet demonstrated against a wrong version.

## Git writes

Rung 1 (`opencode/beam-free`) is at its free-usage limit and rung 2 needs a `git-seat-budget:` the owner did not
declare for this round, so the owner's `land it` (2026-11-13) is executed by the **parent**:

| Verbs                                                      | Variant | Basis                                                                                                                                 |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| branch create, commit, push, PR create, squash merge, sync | parent  | rung 1 unavailable (provider quota), rung 2 unbudgeted; one verb per step, and the commit trailer plus the PR body record each result |

## Deviations

- Tier 2 parent-authored: the parent runs the `flash` worker model (`deepseek-v4.1-flash`), which is the worker
  seat in the policy's ranking, so the implementer and the worker role are the same model; the reviewer gate is
  the independent `pro` seat, never this session. The change itself is four config/metadata edits with no
  behavioural surface, so the parent's authorship is proportionate.
- Mode B was found only because Mode A was removed; it predates this round and was hidden behind the abort.
- `hookTimeout` is the only hook guard, and `testTimeout` (15 s) does not cover hooks: the loosened 60 s still
  fails a genuine `beforeAll` deadlock, only later. If it ever trips again, the reserve is to cap
  `maxWorkers` (the backlog's pool-change candidate) and record the measurement, not to raise it further.
