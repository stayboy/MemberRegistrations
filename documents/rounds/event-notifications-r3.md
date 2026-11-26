# Round - event-notifications-r3

|                        |                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN - the send path                                                                                                                                |
| Tier                   | 2 - Reviewed                                                                                                                                        |
| Mode                   | `attended`                                                                                                                                          |
| Base                   | `9845be1`                                                                                                                                           |
| Review rounds          | 0                                                                                                                                                   |
| Gate runs in parent    | 0                                                                                                                                                   |
| Spec                   | `documents/specs/member-registrations-event-notifications.md`                                                                                       |
| Workers                | `single`                                                                                                                                            |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017 (send path); parent cline-pass/cline-pass/deepseek-v4.1-flash-1017 (round doc, spec amendments, gates) |
| Verbs this round needs | `commit`; `push` and `pr` after the gates and the review; `merge` only on a separate word                                                           |

## Git budget

git-seat-budget: 6

Arithmetic at open: **1 commit** for the round doc, then **1 commit** for the implementation, then **1 push** and **1
PR**. The remaining two cover a fallback retry if a rung is unavailable. `0032` and the wire contract are named in
advance by the owner's approval of this round, so neither parks.

## Seats

| Seat   | Picked (local)                          | Window  | Class          | Candidate probed               | Basis                                       |
| ------ | --------------------------------------- | ------- | -------------- | ------------------------------ | ------------------------------------------- |
| worker | `ollama-cloud/deepseek-v4.1-flash:1017` | outside | `worker-flash` | first outside-window candidate | Outside 12:00-18:00, so ollama-cloud first. |
| grill  | `ollama-cloud/deepseek-v4.1-flash:1017` | outside | `grill-flash`  | first outside-window candidate | Same window rule; ran twice and answered.   |

## Grill

The frontier was put twice: once as twelve open questions, then again with instruction to attack its own answers.
The second pass changed seven of the twelve, and found six places where the recommendations contradicted the spec as
written. Those contradictions are amendments to the spec, listed in `## Plan`, and they are the reason this round
touches the spec at all.

| #   | Answer                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`send_at` is the resolved instant, and `delivery_at` is a new column** written when the job is enqueued. The read returns `delivery_at`; it never recomputes it, because N-8 says a policy change applies only to jobs enqueued after it. |
| 2   | **Publish's `If-Match` is a content token over slots, templates and flier**, not `r<highest>`: a draft edits in place, so two different drafts carry one revision number and the revision ETag cannot tell them apart.                      |
| 3   | **Publish enqueues, and the tick sweeps `status = 'scheduled' and send_at <= now()`.** The sweep is the crash repair, not the primary path; the due index exists for exactly this query.                                                    |
| 4   | **The change notice carries its own WhatsApp template name and `parameter_map`, and its own email body.** A template name alone cannot map free text, and N-7 forbids free-form WhatsApp.                                                   |
| 5   | **Cancel sets the revision and its `scheduled` instances to `cancelled`, deletes no job, and handlers claim with a status re-check.** The unique key gains a status predicate so a cancelled instance does not block republishing.          |
| 6   | **Inbox eligibility is "owns at least one contact".** A member with no own contact at all is wholly guardian-routed and gets no inbox row. An email-only member gets a row they cannot yet read over USSD; recorded in the backlog.         |
| 7   | **`NOTIFICATION_TRIGGER_MINUTES` has no default in code.** Compose sets `0`; hosted sets `15`; an unset value fails start-up, so the read and the refusal cannot disagree.                                                                  |
| 8   | **Three real adapters, worker-only, fake in tests.** They are new implementations: `HttpMessageSender` maps 4xx and 5xx to one 503, which FR-21 forbids.                                                                                    |
| 9   | **`POST /v1/notification-deliveries/{id}/retry`**, re-rendering from the revision the instance pinned, audited in `notification_preference_events` with `field = 'delivery_retry'`.                                                         |
| 10  | **Preview gains aggregate excluded counts by reason, and names a sample only for `no_contact`.** FR-16 asks for named exclusions; FR-44 forbids naming members who muted or blocked.                                                        |
| 11  | **One global `generate(from, to)` per maintenance run, then materialise per published plan.** `generate` expands every active event and takes no event id.                                                                                  |
| 12  | **No `Clock` port.** An explicit `now` is threaded through publish, materialisation, fan-out and preference evaluation; `applySendPolicy` stays pure.                                                                                       |

**The sentence this round must not soften:** R3 is _the round where a published plan first reaches a person_.

## Plan

**Goal.** Take a published plan to a delivered message: materialise instances, fan out to recipients, write the inbox
and the deliveries, send through a port, and record honestly what was skipped and why.

**Spec amendments this round carries.** Each is a contradiction the second grill pass found, not a preference:

1. **N-14, `notification_slot_instances`** — `delivery_at timestamptz` added, and the unique index gains
   `where status <> 'cancelled'`. Without the column, N-8's "a policy change applies to jobs enqueued after it" cannot
   be honoured on read; without the predicate, a cancelled instance blocks the same moment for ever, so AC-26's
   return-to-draft and republish cannot work.
2. **N-14, `notification_change_notices`** — `whatsapp_template text`, `whatsapp_parameters jsonb`, `email_subject
text`, `email_body_text text` added. N-7 forbids free-form WhatsApp, and the notice's only content is
   `title`/`body_text`.
3. **N-3 / FR-17** — publish's precondition is a content ETag over slots, templates and flier, not the revision
   number. A draft edits in place, so the revision does not move when the content does.
4. **FR-16 / FR-44** — the preview's exclusion sample names members only for `no_contact`; the other reasons are
   counts. FR-16 asks for named exclusions and FR-44 forbids naming the muted or blocked.
5. **N-2** — the daily `horizon` job calls the global `generate(from, to)` once and then materialises per published
   plan, because `generate` takes no event id.
6. **N-8** — `NOTIFICATION_TRIGGER_MINUTES` has no in-code default; `0` is continuous, Compose sets `0`, hosted sets
   `15`, and the config schema refuses to boot without it.
7. **FR-7 / N-4** — inbox eligibility is "owns at least one contact"; only a member with no own contact at all is
   guardian-routed and inbox-less. This keeps `routed_via = 'own' ⇒ message_id is not null` satisfiable for an
   email-only member.

**Scope.**

- **`0032_notification_send`** — the eight send-side tables, with the amendments above.
- **Publish** — `POST .../notification-plan/publish`, content `If-Match`, instances over a 90-day horizon, the
  `422 slot_in_past` / `422 duplicate_slot_time` / `409 cadence_too_coarse` / `422 template_required` refusals, and
  idempotent republish.
- **Cancel** — `POST .../notification-plan/cancel`.
- **The change notice** — `POST .../notification-plan/change`, writing its own row and one `change` instance.
- **Fan-out** — recipients by the audience intersection at the instance date, inbox in 500-row batches, deliveries per
  permitted channel, the fixed skip precedence, cadence per occurrence.
- **Destination resolution** — verified → lowest `display_order` → oldest; own contact then the guardian chain;
  `contact_id` and a masked destination recorded.
- **The send path** — `NotificationSender` port, three adapters, `channel_unconfigured` terminal, retry to five then
  dead-letter, sanitised codes.
- **The send-time policy** — `always` / `window` / `daily` applied at enqueue; `starts` and `change` bypass a window.
- **Maintenance** — one daily job: global generate, per-plan materialisation, expiry sweep, reconciliation.
- **Retry route** — `POST /v1/notification-deliveries/{id}/retry`.
- **Preview's exclusion counts**, additive.
- **`openapi.json`** regenerated.

**Out of scope, deliberately.** Member preference writes, the inbox read and read-all, the digest, the admin delivery
log and advanced search, the failure digest, every UI and USSD surface, every mock, and the event lock (FR-39 / AC-26,
which is R4's).

**Expected files.**

| File                                           | Change                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| `src/db/migrations.ts`                         | `0032_notification_send`, eight tables                |
| `src/db/schema.ts`                             | The Drizzle mirror                                    |
| `src/domain/notifications/instances.ts`        | Materialisation, the horizon, the two refusals        |
| `src/domain/notifications/recipients.ts`       | Recipient and destination resolution                  |
| `src/domain/notifications/skip.ts`             | The fixed precedence, cadence                         |
| `src/domain/notifications/send-policy.ts`      | `applySendPolicy` as a pure function                  |
| `src/repos/notification-instances.ts`          | Instances, publish, cancel                            |
| `src/repos/notification-deliveries.ts`         | Fan-out batches, delivery state, retry                |
| `src/routes/notification-publish.ts`           | publish / cancel / change                             |
| `src/routes/notification-deliveries.ts`        | The retry route                                       |
| `src/messaging/notification-sender.ts`         | The port, the fake, `createNotificationSender`        |
| `src/queue/handlers.ts`                        | Fan-out and send handlers, claim-time re-check        |
| `src/worker.ts`                                | Tick sweep, maintenance job                           |
| `src/config/env.ts`                            | `NOTIFICATION_TRIGGER_MINUTES`, sender configuration  |
| `src/repos/notification-plans.ts`              | Preview exclusions; `channelReachability` replaced    |
| `openapi.json`                                 | Regenerated                                           |
| `tests/db/notification-send-migration.test.ts` | The eight tables on PGlite and `pg`                   |
| `tests/api/notification-publish.test.ts`       | Preconditions, idempotency, cancel, change notice     |
| `tests/api/notification-fanout.test.ts`        | Inbox-before-delivery, precedence, cadence, guardians |
| `tests/api/notification-delivery.test.ts`      | Sender port, the two failure codes, the retry route   |
| `tests/unit/notification-skip.test.ts`         | Precedence, cadence                                   |
| `tests/unit/notification-send-policy.test.ts`  | Always / window / daily, the bypass                   |

**Acceptance criteria for the round.**

1. `0032` applies on PGlite and `pg`; the eight tables exist with their checks and partial indexes; no other table is
   added.
2. Publish requires an active event and a draft, materialises instances over the 90-day horizon, refuses a past slot,
   a duplicate instant, a coarser-than-15-minute trigger for a `starts` slot, and a missing template; a republish
   returns the same instances and duplicates nothing.
3. Fan-out writes one inbox message per eligible recipient **before any provider call**, and deliveries only for
   permitted channels; a re-run creates no duplicates.
4. The skip reason is the first applicable of `channel_blocked`, `event_muted`, `period_muted`, `cadence_filtered`,
   `no_contact`, decided at delivery time, and a skipped delivery is never retried.
5. Cadence is evaluated per occurrence: `all` delivers everything, `essential` drops every `reminder`, `minimal`
   delivers only `starts` and `last`; the inbox receives every instance in all three.
6. A destination is the verified contact, else the lowest `display_order`, else the oldest; own contact first, then the
   guardian chain; the delivery records `contact_id` and a masked destination, and no raw value appears in a response
   or a log.
7. A member reachable only through a guardian has no inbox row, and their delivery is keyed to the member with
   `routed_via = 'guardian'`.
8. A change notice is its own row and its own instance, and touches no slot and no future instance.
9. Cancel cancels the plan's `scheduled` instances and leaves created messages and sent deliveries; a queued job
   drains as a no-op; a cancelled instance does not block republishing the same moment.
10. `transport_unavailable` backs off through pg-boss for at most five attempts and then dead-letters;
    `provider_rejected` and `channel_unconfigured` are terminal on the first attempt; the stored code is one of the
    three, never a provider body.
11. The send policy is applied at enqueue: `always` sends at the instant, `window` defers outside 08:00-20:00 except for
    `starts` and `change`, `daily` batches at 14:00; `delivery_at` records what the job holds.
12. `openapi.json` is regenerated and served, and the round changes no `ui/` file and cuts no mock.

## Verification

| Gate      | Command               | Result |
| --------- | --------------------- | ------ |
| Format    | `npm run verify:fast` | pass   |
| Lint      | `npm run verify:fast` | pass   |
| Typecheck | `npm run verify:fast` | pass   |
| Test      | `npm run verify:fast` | pass   |

At open, before any send-path code exists, so this is the inherited suite rather than the round's proofs.

gate-run 2026-11-26T08:46:21.527Z profile=fast steps=4/4 lines=4 bytes=702

## Review

Seat: pending - the independent reviewer has not run. At close this line carries the reviewer's verdict and the
findings table replaces this paragraph.

## Git writes

| Brief   | Actor | Verb | Variant | Reason |
| ------- | ----- | ---- | ------- | ------ |
| pending | —     | —    | —       | —      |

## Mock sign-off

n/a — no user-visible surface in this round. The delivery log and the plan detail are R4's, and their mocks are a
precondition of that round.

## Mock parity

n/a — no mock.

## Acceptance

| Criterion | Met | Evidence | Verdict |
| --------- | --- | -------- | ------- |
| pending   | —   | —        | —       |

## Deviations

- **The spec is amended in this round, not around it.** Six contradictions the second grill pass found are fixed in
  `documents/specs/member-registrations-event-notifications.md` in the same commit as the code that depends on them,
  so no decision lives only here.
- **`delivery_at` is a new column on a table the owner had settled.** It is the only way to honour N-8's "a policy
  change applies to jobs enqueued after it" while still showing an officer what an instance holds.
