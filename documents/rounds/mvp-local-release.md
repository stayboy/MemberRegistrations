# Round — mvp-local-release

|                     |                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                  |
| Tier                | 2                                                                                                                                     |
| Mode                | attended (owner: "yes" to the five-question grill, 2026-11-13)                                                                        |
| Base                | `c315688`                                                                                                                             |
| Review rounds       | 0                                                                                                                                     |
| Gate runs in parent | 0                                                                                                                                     |
| Spec                | no behavioural spec change; the release contract is `documents/runbooks/local-docker.md`                                              |
| Workers             | `single`                                                                                                                              |
| Implementer         | worker ollama-cloud/deepseek-v4.1-flash:1017 (this session, the ranked worker seat: compose, Dockerfile label, smoke script, runbook) |

## Plan

The local MVP target is the Docker Compose stack. Standing it up on 2026-11-13 found the artefact sound and
the release contract incomplete: no backup, a smoke set that only asks `/health`, no rollback, no record of
which commit is running, and — the serious one — **the stack runs with the API bearer gate switched off**.

### What the stack actually does today

`src/create-app.ts:260` installs the bearer gate only when a token is configured, and `src/config/env.ts:70`
requires one only when `NODE_ENV=production`. `docker-compose.yml` sets none, so on the local stack:

```
GET /v1/members  (no Authorization) -> 200 {"items":[]}
GET /v1/events   (no Authorization) -> 200
GET /gateway/v1/members (no Authorization) -> 401
```

The gateway still refuses, so a browser flow is not obviously broken, but the local release does not model the
auth posture it ships with, and no smoke can prove a `401` because there is nothing to prove it against.

### Changes

1. `docker-compose.yml`: set `API_BEARER_TOKEN` for the `app` service (a local development value, documented).
   The browser path is unchanged because `gatewayAuth` injects the configured bearer exactly as production
   does; direct `/v1` callers must now send it.
2. `scripts/smoke-local.mjs` (new, no dependencies): refuses politely when the stack is down; asserts `/health`
   and the CORS matrix; asserts `401` without a bearer and `200` with it on a protected read; writes a member
   and reads it back; prints the image revision. Exits non-zero on the first failure.
3. `Dockerfile`: `ARG GIT_SHA` + `LABEL org.opencontainers.image.revision`, so `docker inspect` and the smoke
   can say which commit an image is.
4. `docker-compose.yml`: pass `GIT_SHA` as a build arg, defaulting to `dev`.
5. `documents/runbooks/local-docker.md`: the smoke command, the backup/restore drill (exercised), the rollback
   procedure (snapshot and restore exercised, the image-roll leg described) and the version stamp, each
   recorded with the output it produced where it was run.

### Backup, restore and rollback

`pg_dump -Fc` from the `db` container into a git-ignored `backups/` directory; restore with
`pg_restore --clean --if-exists`. Migrations have **no down path**, so rollback is: snapshot the database,
roll the image back to the previous commit, restore the snapshot. Rebuilding the previous commit without a
snapshot is documented as safe only when no migration ran between the two commits.

### Proof

Exercised on the running stack, in order: build, up, smoke green; seed through the smoke; `pg_dump`; destroy
the volume with `down -v`; `up -d` (fresh migrate); `pg_restore`; the seeded member is present again.

**What is exercised and what is not.** The backup/restore half is exercised end to end and recorded with its
output. The rollback's image-roll leg (`git checkout <previous-commit>` → rebuild) is **described, not
exercised**: this round has no earlier image to roll back to, because the working tree is the only build in
play, and a synthetic rollback would prove the commands, not the release. The claim is narrowed to that.

## Verification

`npm run verify` **7/7** on the final code:

gate-run 2026-11-13T08:18:31.461Z profile=full steps=7/7 lines=7 bytes=854

The stack, exercised after the compose/Dockerfile change:

| Step                                                              | Output                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `docker compose build` (`GIT_SHA=c315688`, base `24.22.3-alpine`) | `member-registrations-api:local` and `-ui:local` built                                                  |
| `docker compose up -d`                                            | `db`, `app`, `ui` healthy; `migrate` exited 0                                                           |
| `npm run smoke:local`                                             | **11/11 checks passed**, sample member `SMOKE-MWEPCDEO`                                                 |
| gate                                                              | `GET /v1/members` without a bearer → `401`; with it → `200`                                             |
| dump                                                              | `pg_dump -Fc` inside `db`, copied out; `backups/20261113-081542.pgc`, 127,368 bytes                     |
| destroy                                                           | `docker compose down -v` removed `member-registrations_db-data`                                         |
| fresh up                                                          | `up -d` re-migrated; the seeded member answered `404`                                                   |
| restore                                                           | `pg_restore --clean --if-exists`; the same member answered `200` with its original `id` and `createdAt` |
| smoke again                                                       | **11/11 checks passed** on the restored stack                                                           |

Before the change the same stack answered `200 {"items":[]}` on `/v1/members` with no bearer, and the runbook's
"verify" was three health curls.

## Review

Tier 2, independent seat `ollama-cloud/deepseek-v4-pro:0813` (08:2x local, outside the window).

**Round 1: REWORK**, two blocking findings, both fair:

1. The Implementer row named `opencode/deepseek-v4.1-flash-free`, which is not the ranked worker seat and
   carried no fallback reason. The session's actual model is `ollama-cloud/deepseek-v4.1-flash:1017`, the
   ranked first choice, so the row is corrected to that and the Deviations explain the split.
2. Plan item 5 claimed the rollback was "exercised rather than described"; only its restore leg was.

Two P2s in the same review: the runbook did not say that the old image's `migrate` runs against the forward
schema before the restore, and the Proof section promised verbatim output that lived only in the runbook.

**Round 2 confirmation: REWORK on one item.** Blocker 1 closed, both P2s closed; blocker 2 was closed only in
the Proof and Review paragraphs, while plan item 5 still carried the over-claim. The confirmation named the
exact sentence, it was corrected, and that closes the finding without a third round — the remaining change was
the wording the reviewer specified, not a judgement call.

Seat: consistent — the flash worker seat implemented, the pro seat reviewed, and the reviewer never authored.

## Mock sign-off

n/a — no visual surface.

## Mock parity

n/a — no surface changed.

## Acceptance

**ACCEPTED** (round 2; see Review).

| Criterion                                | Evidence                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Q5 — the API gate is on locally          | compose sets `API_BEARER_TOKEN`; smoke asserts `401` anonymous and `200` with the bearer; the gateway still injects for the browser |
| Q2 — a real smoke set                    | `scripts/smoke-local.mjs`, 11 external checks, exit 2 when the stack is down, exit 1 on a failed check, `npm run smoke:local`       |
| Q3 — logical backup and restore, drilled | dump 127,368 bytes, `down -v`, fresh migrate, `404`, `pg_restore`, `200` with the original id                                       |
| Q4 — rollback ordering                   | runbook: snapshot → roll image → restore; the image-roll leg is described, the restore leg exercised                                |
| Q1 — version stamp                       | `GIT_SHA` build arg → OCI `revision` label on both images; the smoke prints it                                                      |

Not covered: the rollback's image-roll leg (no earlier image exists in this round), and the USSD and payment
subsystems locally, which are enabled but not smoked — they need their own secrets and a phone/gateway
counterpart.

## Deviations

- The parent session **is** the ranked worker seat (`ollama-cloud/deepseek-v4.1-flash:1017`), so the Tier 2
  split is satisfied by model family: the flash worker implements, the pro seat (`0813`) reviews, and the
  reviewer never authored. An earlier draft of this row named `opencode/deepseek-v4.1-flash-free`, which was
  wrong; the reviewer caught it.
- The rollback's image-roll leg is described rather than exercised; the round has no earlier image to roll
  back to. The restore leg — the one that saves the data — is exercised and recorded.
- While writing the runbook I briefly deleted the `## Configuration` heading (an edit whose boundary ran past
  the section it was inserting into); it was restored before any gate ran.
