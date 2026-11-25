# Round — event-notifications-r2

|                        |                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                     |
| Tier                   | 2 - Reviewed                                                                                                                                             |
| Mode                   | `attended`                                                                                                                                               |
| Base                   | `10d8198`                                                                                                                                                |
| Review rounds          | 0                                                                                                                                                        |
| Gate runs in parent    | 1                                                                                                                                                        |
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

gate-run 2026-11-25T22:12:41.619Z profile=fast steps=4/4 lines=4 bytes=701

The signature above is the round-doc gate: the tree still passes with this record in it. The implementation gate and
the smoke are run at close.

## Review

Seat: pending - the independent reviewer has not run. At close this line carries the reviewer's verdict and the
findings that produced it.

## Git writes

| Brief   | Actor | Verb | Variant | Reason |
| ------- | ----- | ---- | ------- | ------ |
| pending | —     | —    | —       | —      |

## Mock sign-off

n/a — no user-visible surface in this round. The plan screen is R4's, and its mock is a precondition of that round.

## Mock parity

n/a — no mock.

## Acceptance

| Criterion                                              | Met | Evidence | Verdict |
| ------------------------------------------------------ | --- | -------- | ------- |
| 1. `0030` on both drivers, six tables, no send table   | no  | —        | pending |
| 2. Authoring, `If-Match`, slot rules                   | no  | —        | pending |
| 3. A published revision is frozen                      | no  | —        | pending |
| 4. Preview: four bodies, counts, segments, no writes   | no  | —        | pending |
| 5. Template validation refusals                        | no  | —        | pending |
| 6. Flier cap, magic bytes, public route, both adapters | no  | —        | pending |
| 7. Defaults round-trip and the copy into a new plan    | no  | —        | pending |
| 8. `openapi.json` regenerated and served               | no  | —        | pending |
| 9. Nothing from the send path or the UI                | yes | the diff | pending |

## Deviations

- **The `0030` slice is six tables, not twelve.** The send-side tables move to `0032_notification_send` in R3 (grill 6),
  and N-14 gains one sentence saying so, so the data model is not silently split.
- **Preview is partial by decision, not by omission.** FR-16's exclusion sample needs the preference tables, which are
  R3's; AC-15 is recorded as met in two parts (grill 2).
- **Publish is absent, not stubbed.** The round ships no publish route at all rather than a route that schedules
  instances nothing consumes (grill 1).
