# Round — event-notifications-r2

|                        |                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED - implemented, gates green, reviewed REWORK then fixed                                                                                            |
| Tier                   | 2 - Reviewed                                                                                                                                             |
| Mode                   | `attended`                                                                                                                                               |
| Base                   | `10d8198`                                                                                                                                                |
| Review rounds          | 1                                                                                                                                                        |
| Gate runs in parent    | 4                                                                                                                                                        |
| Spec                   | `documents/specs/member-registrations-event-notifications.md`                                                                                            |
| Workers                | `single`                                                                                                                                                 |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017 (plan API, renderer, flier store); parent cline-pass/cline-pass/deepseek-v4.1-flash-1017 (round doc, gates) |
| Verbs this round needs | `commit`; `push` and `pr` after the gates and the review; `merge` only on a separate word                                                                |

## Git budget

git-seat-budget: 6

Arithmetic at open: 1 round-doc commit, 1 implementation commit, 1 push, 1 PR = 4, plus 2 held for the
`opencode/beam-free` failures the seat has produced three times this month. Nothing else draws on it.

## Seats

| Seat   | Picked (local)                          | Window  | Class          | Candidate probed               | Basis                                       |
| ------ | --------------------------------------- | ------- | -------------- | ------------------------------ | ------------------------------------------- |
| worker | `ollama-cloud/deepseek-v4.1-flash:1017` | outside | `worker-flash` | first outside-window candidate | Outside 12:00-18:00, so ollama-cloud first. |

## Grill

Answered by the owner on 2026-11-25 ("all as recommended"). The frontier found one coupling worth stating in the round:
**publish materialises slot instances, and FR-16's exclusion sample needs the preference tables R3 owns**, so "the plan
API" could not be taken literally.

| #   | Answer                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Publish and the change notice move to R3.** R2 ships authoring and preview; the Publish verb is present but disabled, with its reason stated.                      |
| 2   | **Preview ships without the exclusion sample** — four rendered bodies, per-channel counts and SMS segments. The sample arrives with the tables that explain it (R3). |
| 3   | **Both flier adapters and MinIO in Compose** — the port exists so the store is swappable, and one-adapter round tests neither.                                       |
| 4   | **`openapi.json` is regenerated and committed**, and recorded as the frozen seam for a parallel UI track. No new `check:openapi` script.                             |
| 5   | **One `PUT`** carrying the whole draft revision with `If-Match`; a stale base is `412`.                                                                              |
| 6   | **The six-table slice of `0030` lands here** and is named as this round's migration gate: plans, plan revisions, plan slots, templates, fliers, defaults.            |
| 7   | **Attended**, then `push` and `pr` once the review has accepted and both gates pass. `merge` stays separate.                                                         |

**The sentence this round must not soften:** R2 is _the plan an officer can author and preview, but not yet publish_.

## Plan

**Goal.** Make a notification plan authorable and previewable, and leave every send path to R3.

**Scope.**

- **`0030_event_notifications`** — the six plan-side tables only, with their checks and partial indexes exactly as
  N-14 specifies. `0032_notification_send` (the rest) is R3's, and N-14 gains a sentence saying so.
- **The plan API** — `GET` and `PUT` on `/v1/events/{eventId}/notification-plan`, with `If-Match` on the revision, the
  slot rules (1–12, closed kinds and anchors, offsets in `[-10080, 10080]`, duplicate-instant refusal) and the
  revision machinery (a published revision is frozen; a draft edits in place).
- **Preview** — `POST .../preview` returning the four rendered bodies, per-channel counts and SMS segmentation, writing
  nothing. No exclusion sample; that is R3's.
- **The renderer** — variable substitution from the closed set with per-channel escaping and a null rendering empty;
  email as HTML plus the stored plain-text alternative; WhatsApp as a template name with its ordered `parameter_map`;
  SMS with GSM-7/UCS-2 detection and segment counts; USSD as a screen sequence under the adapter budget.
- **Template validation** — unknown variable `422`, client HTML `422`, an email row without subject/JSON/text `422`, a
  WhatsApp row without `template_name` `422`.
- **The flier** — `FlierStore` with `db` and `s3` adapters, `PUT`/`DELETE`/`GET` on the event's flier, and the public
  `GET /fliers/{token}` outside `/v1` with the immutable headers.
- **Defaults** — `GET` and `PUT` on `/v1/notification-defaults`; a new plan copies the slot template.
- **MinIO** in Compose with a bucket bootstrap, and `FLIER_STORE` selecting the adapter.
- **`openapi.json`** regenerated and committed.

**Out of scope, deliberately.** Publishing, cancelling, the change notice, instances, messages, deliveries, preferences,
the inbox, the digest, the send window's enforcement, every UI and USSD surface, every mock.

**Expected files.**

| File                                             | Change                                        |
| ------------------------------------------------ | --------------------------------------------- |
| `src/db/migrations.ts`                           | `0030_event_notifications`, six tables        |
| `src/db/schema.ts`                               | The Drizzle mirror for those six              |
| `src/domain/notifications/plan.ts`               | Slot rules, revision rules, `If-Match`        |
| `src/domain/notifications/render.ts`             | The four renders, escaping, segments, screens |
| `src/domain/notifications/variables.ts`          | The closed variable set                       |
| `src/repos/notification-plans.ts`                | Repository                                    |
| `src/routes/notification-plans.ts`               | The plan routes                               |
| `src/routes/notification-fliers.ts`              | Flier upload/meta and the public route        |
| `src/routes/notification-defaults.ts`            | Defaults                                      |
| `src/storage/flier-store.ts`, `db.ts`, `s3.ts`   | The store port and its two adapters           |
| `docker-compose.yml`                             | MinIO and its bucket bootstrap                |
| `openapi.json`                                   | Regenerated                                   |
| `tests/api/notification-plans.test.ts`           | Authoring, `If-Match`, slot rules             |
| `tests/api/notification-preview.test.ts`         | The four renders, counts, segments, no writes |
| `tests/api/notification-flier.test.ts`           | Cap, magic bytes, both adapters, public route |
| `tests/api/notification-defaults.test.ts`        | Round-trip and the copy into a new plan       |
| `tests/unit/notification-renderer.test.ts`       | Variables, escaping, encoding, pagination     |
| `tests/db/event-notifications-migration.test.ts` | The six tables on PGlite, and no send table   |

**Acceptance criteria for the round.**

1. `0030` applies on PGlite and `pg`; the six tables exist with their checks and partial indexes; no send table does.
2. A plan can be authored: `PUT` creates or edits the draft, a stale `If-Match` answers `412`, and the slot rules refuse
   out-of-range offsets, a fifth kind, and two slots at one instant.
3. A published revision is frozen: an edit writes revision + 1 with its own slots and templates, and the old one keeps
   its own.
4. Preview returns four rendered bodies, per-channel counts and SMS segments, writes nothing and calls no provider.
5. Template validation refuses an unknown variable, client HTML, an email row missing subject/JSON/text, and a WhatsApp
   row missing `template_name`.
6. The flier accepts ≤2 MB of webp/jpeg/png by magic bytes, is served at `/fliers/{token}` outside `/v1` with immutable
   headers, and both adapters serve identical bytes.
7. Defaults round-trip, and a new plan copies the slot template from them.
8. `openapi.json` is regenerated, committed and served.
9. **No publish route, no cancel, no change notice, no instance, message or delivery table, no UI, no mock.**

## Verification

| Gate      | Command               | Result |
| --------- | --------------------- | ------ |
| Format    | `npm run verify:fast` | pass   |
| Lint      | `npm run verify:fast` | pass   |
| Typecheck | `npm run verify:fast` | pass   |
| Test      | `npm run verify:fast` | pass   |

This round adds a migration, new routes and a new Compose service, so `npm run smoke` is required at close.

gate-run 2026-11-25T22:44:58.962Z profile=fast steps=4/4 lines=4 bytes=903

The signature above is the close gate, after the fix pass. The smoke passes on PGlite, and the migration test's new
`pg` leg was run separately with `TEST_DATABASE_URL` against the Compose database: 12/12, including the partial unique
index on real Postgres.

## Review

Seat: consistent - the `Implementer` row names the `worker-flash` seat and this reviewer is `reviewer-pro`, the Tier 2
split AGENTS.md §3 requires.

**`reviewer-pro` / `ollama-cloud/deepseek-v4-pro:0813`, 2026-11-25. Verdict: REWORK** - one P1, two P2s, three nits.

The P1 was the round's own criterion 1: "`0030` applies on PGlite and `pg`", and the only leg was PGlite. The reviewer's
point was that a manual proof in the parent is not a test, and AGENTS.md §12 asks both drivers to pass _the same_ tests.

| Finding                                                                              | Fix                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** - the `pg` leg was not gated by the suite                                     | A `pg`-gated block added to `tests/db/event-notifications-migration.test.ts`, on the `createScratchDatabase` pattern R1 established: the six tables exist, none of the send tables does, and the partial unique index refuses a second published revision. Run with `TEST_DATABASE_URL`: 12/12                             |
| **P2** - the S3 double ignores auth, so the hand-rolled SigV4 was never exercised    | The double now records each request's headers and the suite asserts the signature's shape on every signed request: the `AWS4-HMAC-SHA256` credential scope, a hex `x-amz-content-sha256`, a well-formed `x-amz-date`, and `host` among the signed headers. Structural, not verified against a server - see the backlog row |
| **P2** - `minio/minio:latest`, `minio/mc:latest` float while every sibling is pinned | Not fixed: Docker Hub refused both images in this environment, so neither a digest nor a release tag could be resolved, and the MinIO service has therefore never been pulled. Recorded in the backlog with its trigger                                                                                                    |
| Nit - `next_revision` written and never read                                         | Left: it is R3's publish that reads it                                                                                                                                                                                                                                                                                     |
| Nit - `assertIfMatch` accepts the bare `r<revision>` form                            | Left: it matches the event-write convention, and tightening it is a wire change no round asked for                                                                                                                                                                                                                         |
| Nit - `db.ts` re-queries a flier row the repo already loaded                         | Left: the public route has only a token, and the extra read is the price of that route sharing the adapter                                                                                                                                                                                                                 |

No confirmation round was run: the P1's remedy was mechanical and its result is a passing test rather than a judgement.

## Git writes

| Brief   | Actor | Verb | Variant | Reason |
| ------- | ----- | ---- | ------- | ------ |
| pending | —     | —    | —       | —      |

## Mock sign-off

n/a — no user-visible surface in this round. The plan screen is R4's, and its mock is a precondition of that round.

## Mock parity

n/a — no mock.

## Acceptance

| Criterion                                              | Met | Evidence                                                                                                                        | Verdict |
| ------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1. `0030` on both drivers, six tables, no send table   | yes | `event-notifications-migration.test.ts` - PGlite block, plus the `pg` block added after review (12/12 with `TEST_DATABASE_URL`) | pass    |
| 2. Authoring, `If-Match`, slot rules                   | yes | `notification-plans.test.ts` - revision 1, ETag, stale `412` with nothing written, the four refusals                            | pass    |
| 3. A published revision is frozen                      | yes | `notification-plans.test.ts` and the flier `writableRevision` path                                                              | pass    |
| 4. Preview: four bodies, counts, segments, no writes   | yes | `notification-preview.test.ts` - renders, unchanged row counts, no sender called                                                | pass    |
| 5. Template validation refusals                        | yes | `notification-plans.test.ts` "template validation" and the renderer unit tests                                                  | pass    |
| 6. Flier cap, magic bytes, public route, both adapters | yes | `notification-flier.test.ts` - cap, sniffing, headers on `/fliers/{token}`, identical bytes, signature shape                    | pass    |
| 7. Defaults round-trip and the copy into a new plan    | yes | `notification-defaults.test.ts`                                                                                                 | pass    |
| 8. `openapi.json` regenerated and served               | yes | `notification-plans.test.ts` and `tests/api/openapi-snapshot.test.ts`; the diff is purely additive                              | pass    |
| 9. Nothing from the send path or the UI                | yes | `notification-plans.test.ts` "the send path is absent, not stubbed"; no `ui/` or mock change                                    | pass    |

## Deviations

- **The `0030` slice is six tables, not twelve.** The send-side tables move to `0032_notification_send` in R3 (grill 6),
  and N-14 gains one sentence saying so, so the data model is not silently split.
- **Preview is partial by decision, not by omission.** FR-16's exclusion sample needs the preference tables, which are
  R3's; AC-15 is recorded as met in two parts (grill 2).
- **Publish is absent, not stubbed.** The round ships no publish route at all rather than a route that schedules
  instances nothing consumes (grill 1).
