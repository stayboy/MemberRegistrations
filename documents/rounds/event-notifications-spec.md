# Round — event-notifications-spec

|                        |                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED — spec approved, three review passes, committed by this round                                |
| Tier                   | 1 - Plan                                                                                            |
| Mode                   | `attended`                                                                                          |
| Base                   | `997b245`                                                                                           |
| Review rounds          | 3                                                                                                   |
| Gate runs in parent    | 16                                                                                                  |
| Spec                   | `documents/specs/member-registrations-event-notifications.md`                                       |
| Workers                | `single`                                                                                            |
| Implementer            | parent cline-pass/cline-pass/deepseek-v4.1-flash-1017 (spec synthesis, in-session)                  |
| Verbs this round needs | `commit` — the owner's "all as recommended" (2026-11-25) took go-forward answer 1, "one commit now" |

## Git budget

git-seat-budget: 3

Arithmetic at open: **1 commit** for the spec, its record and the backlog rows. The three allow one rung-1 brief
(spent — `opencode/beam-free` returned its free usage limit) and one fallback retry. No branch, push, PR or merge is
needed this round.

## Seats

| Seat        | Picked (local)                          | Window  | Class          | Candidate probed               | Basis                                                                                                                                                                                                                             |
| ----------- | --------------------------------------- | ------- | -------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| grill-flash | `ollama-cloud/deepseek-v4.1-flash:1017` | outside | `grill-flash`  | first outside-window candidate | Dispatched at 10:16 (outside the 12:00-18:00 window, so ollama-cloud first). The owner then ruled "keep to current session model"; the frontier is authored in this session and the dispatch is recorded as superseded, not used. |
| spec-review | two seats                               | mixed   | `reviewer-pro` | three passes                   | `mimo-v2.6-pro` inside the window returned REWORK twice; the owner took a cold pass, `deepseek-v4-pro:0813` outside it, also REWORK. All findings fixed; no fourth pass run (review brief: one fix pass, one confirmation).       |

## Grill

Frontier put in one round on 2026-11-25; the full text is in the spec's **Open Decisions**. Each question names a
recommendation and its cost (AGENTS.md §2).

1. **Publish is not activation.** Separate the calendar state from a published plan? _Recommend:_ separate;
   activation never sends, "Not announced" beside the status. _Cost:_ two verbs on one screen, and forgetting to
   publish is warned, not prevented.
2. **One plan per event.** `event_id` is unique, so a second announcement has no home. _Recommend:_ one plan; a
   changed announcement is a revision with an immediate slot. _Cost:_ every announcement, including a venue change,
   must go through the revision machinery.
3. **Consent: opt-out or opt-in.** _Recommend:_ opt-out, with "Manage alerts in USSD" in the first message. _Cost:_
   members who never dial USSD are messaged without an explicit act of consent; opt-in would empty the first blast.
4. **What `start_and_last` covers.** _Recommend:_ **per occurrence** — that occurrence's `starts` and its `last`,
   skipping its `announce` and `reminder`. _Cost:_ a cadence member never gets the announcement by SMS or email,
   only in the inbox; reverses the draft's N-10 and FR-10.
5. **Period mutes: storage and scope.** `scope_id` is `uuid` but `events.period_id` is `text`; and does a mute
   cover every cycle? _Recommend:_ `scope_id text`; definition-wide, with an optional `period_cycle` to narrow.
   _Cost:_ one mute in November silences Communion Week forever; per-cycle would make the member re-mute monthly.
6. **A channel block has no end.** _Recommend:_ keep the boolean, and make the confirmation say "until you turn it
   back on". _Cost:_ a forgotten block loses SMS indefinitely; a time-boxed block needs a fourth field and an
   expiry sweep.
7. **The inbox for a member with no owned contact.** A guardian-only member cannot authenticate in USSD. _Recommend:_
   deliver to the guardian with the member named, and write no inbox row for the member. _Cost:_ FR-7 gains an
   exception, and that member has no notification history.
8. **The cancellation and change notice.** No slot kind can say "tonight is cancelled". _Recommend:_ add a `change`
   kind in v1, publish-anchored and one-off. _Cost:_ a fifth kind, a publish-now path, and the officer supplies
   what changed.
9. **A schedule rewrite orphans instances.** Occurrences are deleted and replaced; instances key on
   `occurrence_date`; slots have no `revision` column. _Recommend:_ key on `occurrence_id`, cancel removed
   occurrences' instances in the same transaction, give slots a `revision`. _Cost:_ a nullable FK, a reconciliation
   hook inside the schedule write, slots copied forward per revision.
10. **Which channels ship in v1.** _Recommend:_ email, SMS **and** WhatsApp — the provider wiring exists — with
    WhatsApp as an approved template plus values. _Cost:_ every new wording needs Meta approval (up to 24 h).
11. **The flier's public route.** Unauthenticated inside `/v1` breaks AGENTS §6. _Recommend:_ keep `bytea`, mount at
    `/fliers/{token}` outside `/v1`. _Cost:_ no CDN, no resize, a 2 MB poster through the function, and the URL is
    forwarded with the email.
12. **Who may see who muted.** _Recommend:_ aggregate counts on the event; the named list only on the member
    record. _Cost:_ an officer cannot ring a muter to ask why.
13. **Purge versus the preference audit.** _Recommend:_ delete settings, mutes and inbox rows; null the member id on
    `notification_preference_events` and keep the rest. _Cost:_ audit rows become unattributable after a purge.
14. **The scheduler and the Vercel plan.** _Recommend:_ own the queue, Vercel Cron on Pro, Compose `ticker`; pg-boss
    at >3 job kinds or 10,000 deliveries/day. _Cost:_ we own the lease, backoff and reclaim; Pro is paid, and Hobby
    delays a start alert by up to 30 minutes.
15. **Inbox retention.** _Recommend:_ prune nothing in v1; revisit at one million rows or a 200 ms member read.
    _Cost:_ unbounded growth; only a purge removes an old message.
16. **How an officer learns a send failed.** _Recommend:_ pull-only, plus a failed-count badge on the event row.
    _Cost:_ an officer who never opens the page learns nothing.
17. **The USSD surface.** Placement, missing `notifications.*` glossary keys, and a body cap (1–182) confused with
    the 182 whole-screen budget. _Recommend:_ after Activities; add the keys in this round; treat the body as a
    paginated screen sequence under the screen budget. _Cost:_ the main menu is near its ceiling, so the next domain
    entry needs main-menu pagination; longer bodies cost more screens and airtime.

## Answers

The owner answered the first frontier on 2026-11-25. Fourteen were taken as recommended; three changed the model.

| #   | Answer (owner)                                                                                                                                                                                                         | Effect                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | As recommended                                                                                                                                                                                                         | N-1                                                                                                       |
| 2   | As recommended                                                                                                                                                                                                         | N-1                                                                                                       |
| 3   | "not opt-in now. but they can opt-out from future ones. Or opt-out of other catogories. notifications are delivered but muted. user must indicate length - next 30 days, 90 days or a year"                            | Mutes gain a duration and `expires_at` (N-10); the inbox is unaffected (N-6)                              |
| 4   | "user can set up notification to announce daily, 3 days to event, and once every 3 days 2 weeks to event. That'll be a lot to receive. so user can opt out of such frequency"                                          | Cadence gains `essential` beside `all` and `minimal` (N-6); follow-up 18 confirms the reading             |
| 5   | As recommended                                                                                                                                                                                                         | `scope_id` is `text`, definition-wide mute (N-10)                                                         |
| 6   | "user can request back office to make exception to block certain channels for them, this list when user added must send out a confirmation notice, and when this opt-out expires - next 30 days, next 90 days, a year" | Channel blocks become an officer-set, expiring row with a confirmation notice (N-10, FR-28)               |
| 7   | As recommended                                                                                                                                                                                                         | Reachability decides; no inbox row for a member who cannot authenticate (N-4)                             |
| 8   | As recommended                                                                                                                                                                                                         | A `change` kind ships (N-2, FR-19)                                                                        |
| 9   | As recommended                                                                                                                                                                                                         | `occurrence_id`, revision-keyed slots, rewrite reconciliation (N-3, N-14)                                 |
| 10  | As recommended                                                                                                                                                                                                         | Email, SMS and WhatsApp all ship; WhatsApp is a template (N-7)                                            |
| 11  | "fliers are attached images. research open CDN we can use"                                                                                                                                                             | Email attaches, WhatsApp links, `FlierStore` port with MinIO locally and R2 hosted (N-9)                  |
| 12  | As recommended                                                                                                                                                                                                         | Aggregate counts only (N-12)                                                                              |
| 13  | As recommended                                                                                                                                                                                                         | Purge nulls the member id on preference events (N-10)                                                     |
| 14  | "for our local first mvp, adopt pg_boss. repo keeps platform vendor neutral for later plugin to vercel"                                                                                                                | pg-boss replaces the hand-rolled queue; backend follows the driver (N-8); follow-up 21 settles its schema |
| 15  | "allow for purging, but retrievable with advanced search"                                                                                                                                                              | Member removal is a soft delete; Admin gains an advanced message search (N-10, N-12)                      |
| 16  | "compiled list of fail sends, is sent by email to officer defined in settings"                                                                                                                                         | A daily failed-send digest to an address in settings (N-13)                                               |
| 17  | "keep before profile menu"                                                                                                                                                                                             | Notifications sits immediately before My Profile (N-11)                                                   |

## Answers — Round Two

Owner, 2026-11-25, verbatim: "member can also opt-out in self service. not only officer", "I'll prefer not a link in
whatsapp message to flier, but shown (visible)", "Q19: Eg. opt-out of all events setup with 'communion-week' period
name", "Q24: Can we adopt linkedLn style of removing notifications from pending to read, to keep unread focussed",
"all other as recommended".

| #   | Answer                                                                                         | Effect                                                                        |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 18  | As recommended                                                                                 | Three cadence values (N-6)                                                    |
| 19  | "opt-out of all events setup with 'communion-week' period name"                                | The period mute is definition-wide across events (N-10)                       |
| 20  | As recommended                                                                                 | Silent expiry, end date shown (N-10)                                          |
| 21  | As recommended                                                                                 | Vendored pg-boss DDL, `migrate: false`, `doctor` drift check (N-8)            |
| 22  | As recommended                                                                                 | MinIO default, `db` fallback (N-9)                                            |
| 23  | As recommended                                                                                 | One digest a day, only on a failure (N-13)                                    |
| 24  | "adopt linkedLn style of removing notifications from pending to read, to keep unread focussed" | Removal is replaced by pending→read; `read-all`; nothing deleted (N-10, N-12) |
| —   | "member can also opt-out in self service. not only officer"                                    | Channel blocks are self-service **or** officer-set (N-10, FR-28)              |
| —   | "not a link in whatsapp message to flier, but shown (visible)"                                 | WhatsApp sends the flier as the template's image header (N-7, N-9, FR-22)     |

## Answers — Round Three

Owner, 2026-11-25: "published event is out of edit and ready for notification or view by member even when notification
sent", "all other as recommended".

| #   | Answer                                                                                                  | Effect                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 25  | Publication is the event's own `active` state, not the plan's; it stays locked and visible after a send | N-1, FR-39, AC-32                                                                          |
| 26  | As recommended                                                                                          | Record, schedule, audience and venue lock; plan authoring and occurrence cancellation stay |
| 27  | Cannot stand with 25                                                                                    | Cancelling the plan is not a release when no plan exists — Round Four                      |
| 28  | As recommended                                                                                          | Archiving and cancelling stay; a locked banner names the publish time                      |

## Answers — Round Four

Owner, 2026-11-25: "as recommended".

| #   | Answer                                                                                       | Effect                                    |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 29  | `Return to draft` releases the lock; audited; `409 plan_published` while a plan is published | N-1, FR-39, AC-32, EC-17, the route table |

## Answers — The send-time round (30-31)

Owner, 2026-11-25: "allow officer ability to toggle between all 3 windows per budget reasons", "as-is. V2 will
include tenancy to solve regional timezones issue".

| #   | Answer                                                                                                                             | Effect                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 30  | The officer toggles among `always`, `window` and `daily`, trading precision against the hosting bill                               | N-8, FR-40, FR-41, AC-33-35 |
| 31  | `starts`/`change` bypass a window; `daily` batches everything; hours are wall-clock in `church_timezone`; multi-zone tenancy is V2 | N-8, EC-19                  |

## Answers — Round Five (32-37)

Owner, 2026-11-25: "Note: Neon doesn't run locally. this doesn't apply to docker compose, right?", "all other as
recommended".

| #   | Answer                                                                                                                    | Effect            |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 32  | A 15-minute hosted cron; the local worker polls continuously (the note was correct: Compose Postgres has no hourly meter) | N-8, FR-42, AC-37 |
| 33  | Deploy-time cadence, shown read-only                                                                                      | FR-41             |
| 34  | `409 cadence_too_coarse` for a `starts` slot below a 15-minute cadence                                                    | FR-42, AC-36      |
| 35  | `daily` + `starts` allowed behind a typed acknowledgement                                                                 | N-8               |
| 36  | Dashboard is local Compose only, behind basic auth; requeues go through the audited API                                   | FR-43, AC-38      |
| 37  | Local does not mirror the hosted cadence; lateness is tested with a frozen clock                                          | AC-37             |

**The frontier is empty.** Five rounds, 37 questions, each answered and written into the spec text. What remains is
the owner's explicit approval and the reviewer seat's pass.

## Review

**Round 1 — `reviewer-pro` / `ollama-cloud/mimo-v2.6-pro`, 2026-11-25. `Seat: consistent`. Verdict: REWORK.**

Ten P1s, fifteen P2s and five nits. The P1s were substantive: three schema clauses could not be built as written (a
guardian-routed delivery with no message id against a `not null` column; a block-confirmation notice with no instance
against two `not null` columns; a live-block unique index that a re-block after silent expiry violates), and the
rest were model gaps rather than typos (no per-revision publication state; instances keyed on a revision-scoped
`slot_id`; a schedule-rewrite reconciliation that the period spec's delete-and-reinsert makes impossible; the lock
contradicting `recurrence_locked`; three owner answers that lived only in the `Decided` table).

Fixed in one batched pass:

| Finding                                                                 | Fix                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deliveries keyed to a message that a guardian-routed member cannot have | `notification_deliveries` now hangs off `(instance_id, member_id, channel)`, `message_id` nullable, `routed_via`, and a check that only `guardian` may omit it (N-4, N-14, FR-47, AC-44) |
| System notices had no instance or event                                 | `notification_messages.kind` (`event \| system`) with a paired check, so a block confirmation is storable (N-10, N-14)                                                                   |
| No per-revision state                                                   | `notification_plan_revisions` (status, published/cancelled by and at, acknowledgement), one published per plan (N-14)                                                                    |
| Instances keyed on a revision-scoped slot                               | Unique on `(plan_id, occurrence_date, send_at)`, `occurrence_id` `on delete set null` with a date snapshot (N-14)                                                                        |
| AC-26 impossible under delete-and-reinsert                              | Restated: the lock refuses the rewrite on an `active` event, so nothing can be orphaned; reconciliation only on the draft path (AC-26, FR-39)                                            |
| Lock vs `recurrence_locked`                                             | New `## Sibling specs this round must amend` names periods, UI, API, USSD and audience (FR-39)                                                                                           |
| Re-block after silent expiry violated the unique index                  | Setting a mute or block revokes the live row in the same transaction (N-5, N-10)                                                                                                         |
| Decided #12, #28, #35 were table-only                                   | Mute/block counts, the locked banner and the typed acknowledgement are now normative (N-12, FR-44, FR-46, AC-45, AC-46)                                                                  |
| WhatsApp described as both rich and plain; no parameter map             | Email is the only rich surface; WhatsApp is a template with `parameter_map` (N-7, N-14)                                                                                                  |
| No retry route for FR-32                                                | `POST /v1/notification-deliveries/{id}/retry` (FR-32, FR-45, AC-47)                                                                                                                      |
| `delivery_unavailable` meant two fates                                  | `transport_unavailable` (retryable), `provider_rejected`, `channel_unconfigured` (terminal) (N-5, FR-21)                                                                                 |
| `reminder`/`last` claimed "author's choice" with no column              | Repetition is derived from the anchor alone (N-2)                                                                                                                                        |
| `1 More` clashed with the fixed `0 More`                                | Uses `0 More` (EC-12)                                                                                                                                                                    |
| "Latest five" ignored the adapter `pageSize`                            | The adapter's `pageSize` applies (5 at 182, 3 at Nalo 120) (N-7)                                                                                                                         |
| `Save and activate` named no route; no activate verb                    | `POST /v1/events/{eventId}/activate` and `/return-to-draft` in the route table                                                                                                           |
| `cadence_too_coarse` had no source                                      | `NOTIFICATION_TRIGGER_MINUTES` (default 15), read-only via the defaults read (N-8)                                                                                                       |
| `sms_confirm_threshold` had no behaviour                                | Typed confirmation recorded as `confirmed: true` above the threshold (N-3)                                                                                                               |
| Pending-first ordering had no cursor                                    | Cursor `(readAtIsNull, createdAt, id)` with a matching index (N-10, FR-23, AC-48)                                                                                                        |
| Purge vs `contact_id` FK                                                | `on delete set null`, and purge nulls `contact_id` and `destination_masked` (N-10, N-14)                                                                                                 |
| Hard gates declared but not stated as parking                           | New `## Gates` (FR-48)                                                                                                                                                                   |
| FRs without an AC (18, 31, 34, 37, 12)                                  | AC-39 to AC-43                                                                                                                                                                           |

Nits also fixed: the duplicated "why not a hand-rolled queue" paragraph, the missing Decided row 29, AC-32 out of
sequence, the stale deferral that outlived answer 10, the digest hour, and the zone in AC-33/34.

**Round 2 — confirmation, same seat. `Seat: consistent`. Verdict: REWORK** on two surviving P1s and four P2s:

- **Purge still tripped a FK.** Deleting inbox rows while keeping delivery rows needed `message_id on delete set
null`; the earlier fix had only covered `contact_id`. Fixed, and `anonymised_at` added so "anonymised" is a
  column rather than a promise, with the routed check widened to allow it.
- **`change` had no representable state.** One published revision per plan collided with a `change` notice landing
  on the next revision, and `cancelled` was already FR-18's plan-cancel. Fixed by taking change notices **out of**
  the revision model into `notification_change_notices`, adding `superseded` to the revision enum, and superseding
  N when N+1 publishes.
- **FR-46 over-reached.** It demanded an acknowledgement for every deferral; narrowed to a `starts` or `change`
  slot, matching your answer.
- **The "null exactly when guardian" prose** contradicted a guardian-routed delivery for a member who does have an
  inbox row. Corrected: `routed_via` names the destination, not the record.
- **N-1 and FR-2** still said the plan held `status` and `revision`; corrected to the revision table.
- **The acceptance table** still cited the old FR/AC counts and a section that no longer exists; corrected.
- Nits: `ransport_unavailable` (a shell-escape casualty on an earlier edit) and a duplicated EC-5 fragment.

**Parked.** The brief allows one fix pass and one confirmation, and the confirmation did not accept. Per
`documents/rounds/review-brief.md` the round parks rather than looping a third time; the findings above are all
fixed, and the next session should either re-review from scratch or take the owner's decision on the parked state.

**Round 3 — cold first pass, `deepseek-v4-pro:0813`, 2026-11-25 18:21 (after the window). `Seat: contradicted`. Verdict: REWORK.**
The owner took option 2 rather than a third confirmation, so this reviewer read the spec cold. It found four things
neither earlier pass raised:

| Finding                                                                                                                                                                                                                            | Fix                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `change` lived in two incompatible models — a slot kind in N-2, FR-3 and the slot check, but a `notification_change_notices` row everywhere else, so a `change` slot could never materialise and N-6's tier for it was underivable | `change` is removed from the slot kinds; `notification_slot_instances` carries its own `kind`, with a check tying `change` to a notice and every other kind to a slot (N-2, FR-3, N-14, AC-13)                                                                                                               |
| Email's plain-text alternative had no storage, though N-7, FR-13 and AC-16 all require it                                                                                                                                          | `body_text` is that alternative, stored; a check requires `subject`, `body_json` and `body_text` on email and forbids `body_text` on WhatsApp (N-14)                                                                                                                                                         |
| `POST /v1/events/{id}/activate` duplicated the existing `PATCH { status: "active" }` that UI AC-56 already defines                                                                                                                 | The route is removed; activation stays the PATCH and the lock begins at it (N-1, route table)                                                                                                                                                                                                                |
| The lock contradicted periods' `recurrence_locked`, and `return-to-draft` did not reopen the schedule                                                                                                                              | Precedence stated: `event_locked` first on an `active` event, the periods guard unchanged on a draft; `return-to-draft` reopens record/audience/venue at once and the schedule only as far as that guard allows; the reversal of today's editable-active model is named as deliberate (N-1, sibling section) |

It also caught that two fixes the earlier record claims were **not in the text** — `ransport_unavailable` in FR-21
and a duplicated EC-5 tail. Both are real now. Its P2s are fixed too: the two timezones are separated (slot instant in
`events.timezone`, window in `church_timezone`), fan-out is one job per instance, the horizon has a daily mechanism,
purge order is stated, the USSD `pageSize` map gains the inbox list, expiry is swept as well as read, and a flier may
not carry member data.

**Not re-reviewed.** The brief allows one fix pass and one confirmation; this was a fresh first pass, so all three
passes were first passes and none was a confirmation of the last. A fourth would be the loop the brief forbids. The
round therefore leaves PARKED only on the owner's word, and the honest statement is: three independent reviews, every
finding fixed, no pass yet reading the final text.

## Go-forward (answered)

Owner, 2026-11-25: "all as recommended".

| #   | Answer                                                                                                                                                   | Effect                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | One commit now: spec, round doc and the backlog rows                                                                                                     | this commit                                                                       |
| 2   | The fourth review pass is carried to the first build PR                                                                                                  | backlog row; no fourth pass here                                                  |
| 3   | The build is **Tier 2**                                                                                                                                  | worker + independent reviewer + acceptance, per round                             |
| 4   | **Four rounds**: R1 migrations + pg-boss + queue + horizon; R2 plan API + flier store; R3 send path + preferences + inbox + digest; R4 UI + USSD + mocks | the next four round docs                                                          |
| 5   | Pre-authorised: the migration for **R1**, the wire contract and the public `/fliers/{token}` route for **R2**. Nothing further                           | R1 may migrate without parking; R2 still parks on the contract unless named again |
| 6   | The mock lands in R4                                                                                                                                     | screens after the wire freezes                                                    |
| 7   | Serial for R1-R3; a parallel UI track is evaluated only after R2's contract is frozen                                                                    | no persistent worktrees yet                                                       |
| 8   | Every round uses the fake senders and MinIO; no round blocks on credentials                                                                              | "it works" means against a fake until providers are configured                    |
| 9   | Sibling specs are amended in the round that touches them, starting with the periods guard in R1                                                          | each round grows by its amendment                                                 |
| 10  | **R1 is attended**; R2 onward is decided later                                                                                                           | R1 waits on the owner; a later unattended run needs its gates named               |

**Consequence worth naming.** R1 delivers no user-visible behaviour: two migrations, a vendored `pgboss` schema, the
queue and the horizon job. It is the right round to get wrong, and it is the round that will look like nothing happened.

## Plan

**Goal.** Write the behavioural spec for event publication, per-channel event notifications, the queue, the flier, and
member alert preferences (cadence, expiring mutes, officer-set channel blocks, the always-on inbox and soft removal),
including the USSD and future-app reads. This round writes no code, migration or mock.

**Scope.**

- `documents/specs/member-registrations-event-notifications.md` — the spec, synthesised with the `to-spec` template
  into this repository's format, then amended with the owner's answers to the first grill round.
- This round doc.
- No `src/`, `ui/`, migration, OpenAPI or mock change.

**Expected files.**

| File                                                          | Change                                   |
| ------------------------------------------------------------- | ---------------------------------------- |
| `documents/specs/member-registrations-event-notifications.md` | New draft spec, amended with the answers |
| `documents/rounds/event-notifications-spec.md`                | This round record                        |

**Acceptance criteria for the round.**

1. The spec names the problem, the solution, the vocabulary collision with welfare subscriptions, and the
   inbox-as-system-of-record model.
2. It carries implementation decisions for the plan, slots, revisions, recipients, channel resolution, cadence,
   templates, the renderer, the flier, preferences, the inbox, USSD, the queue and the admin surfaces.
3. It carries functional requirements and acceptance criteria that trace to the brief, the follow-up, and the owner's
   answers recorded under `## Answers`.
4. The queue decision is backed by current pg-boss facts, names the PGlite and Postgres backends, and keeps the
   vendor swappable.
5. The flier decision is backed by storage research and is swappable between a local store and a hosted one.
6. Every answer that changed the model is written into the spec text, not only into this doc.
7. No code, migration, wire or mock change is made.

## Verification

| Gate      | Command               | Result |
| --------- | --------------------- | ------ |
| Format    | `npm run verify:fast` | pass   |
| Lint      | `npm run verify:fast` | pass   |
| Typecheck | `npm run verify:fast` | pass   |
| Test      | `npm run verify:fast` | pass   |

Docs-only round: no migration, wire contract, auth or cross-cutting code changed, so `npm run smoke` is not required.

gate-run 2026-11-25T19:15:48.983Z profile=fast steps=4/4 lines=4 bytes=700

## Git writes

| Brief                                  | Actor                                       | Verb     | Variant | Reason                                         |
| -------------------------------------- | ------------------------------------------- | -------- | ------- | ---------------------------------------------- |
| commit brief (spec + record + backlog) | `git-executor` rung 1, `opencode/beam-free` | `commit` | —       | Go-forward answer 1: one commit now, docs only |

## Mock sign-off

n/a — the spec round builds no user-visible surface.

## Mock parity

n/a — no mock.

## Acceptance

| Criterion                                                        | Met | Evidence                                                    | Verdict        |
| ---------------------------------------------------------------- | --- | ----------------------------------------------------------- | -------------- |
| 1. Problem, solution, vocabulary and inbox model                 | yes | spec, Problem Statement / Solution / Vocabulary / N-4, N-10 | pending review |
| 2. Implementation decisions cover the pipeline                   | yes | spec, N-1 to N-14                                           | pending review |
| 3. FRs and ACs trace to the brief, the follow-up and the answers | yes | spec, FR-1 to FR-48, AC-1 to AC-48, `## Decided`            | reviewed twice |
| 4. Queue research, backends and the vendor-swap path             | yes | spec, N-8, Further Notes "The scheduler research"           | pending review |
| 5. Flier storage research and the swappable store                | yes | spec, N-9, Further Notes "The flier storage research"       | pending review |
| 6. Every answer that changed the model is in the spec text       | yes | spec, N-4, N-6, N-8, N-9, N-10, N-11, N-12, N-13            | pending review |
| 7. The frontier is numbered with recommendation and cost         | yes | this doc, `## Grill` and the four answer sections           | reviewed twice |
| 8. No code, migration, wire or mock change                       | yes | `git status --short`                                        | pending review |

## Deviations

- **The frontier is authored in-session, not by a dispatched seat** (owner, 2026-11-25: "keep to current session
  model"). A `grill-flash` dispatch had already launched on `ollama-cloud/deepseek-v4.1-flash:1017` before that
  instruction landed; it is recorded in `## Seats` as superseded. Its output was not relayed: every factual claim it
  made was re-checked against `member-registrations-event-periods.md`, `member-registrations-event-audience.md`,
  `member-registrations-member-record.md`, `member-registrations-ussd.md` and `src/db/migrations.ts`, and only the
  verified findings were kept. Under AGENTS.md §2 this is a parent-authored frontier and the record says so.
- **Two of the draft's own decisions did not survive the check.** N-10/FR-10's `start_and_last` is now put to the
  owner as per-occurrence rather than per-plan (grill 4), because the draft's version silences a weekly service
  after two messages. N-4's "minors only" guardian fallback is withdrawn: MR-39 makes a guardian mandatory for any
  member with no own contact and MR-46 forbids age deciding contact eligibility, so reachability — not age — picks
  the destination (grill 7).
- **Eight defects are recorded in the spec, not fixed silently** (`## Defects found while grilling`): the period mute's
  `uuid` scope, the missing slot `revision`, instances keyed on `occurrence_date`, the unauthored message `title`, the
  flier route inside `/v1`, the USSD body cap, the missing glossary keys, and N-7's stray marker (that one is fixed).
- **The spec was rewritten, not patched, after the answers.** Three answers (3, 6, 15) changed the preference model
  from a boolean to an expiring row, answer 4 added a third cadence value, answer 14 replaced the queue, answer 11
  replaced the storage, and answers 16 and 17 added a surface each. Patching N-8 to N-13 in place would have left the
  FRs and ACs describing the old model, so the whole document was re-issued as one draft and the change log records
  what moved. The spec's `## Decided` table is the trace from answer to requirement.
- **Answers 3, 4, 6, 11, 14, 15, 16 and 17 needed interpretation, and the interpretation is put back to the owner**
  rather than settled here: the follow-up round (18–24) is open, and the spec marks each place it is taken
  (`## Follow-up Round`). The model still holds without those answers; only their detail changes.
- **The git seat failed twice before it could run, and the round records why.** Rung 1 (`opencode/beam-free`)
  returned `Free usage limit reached` on the commit brief — the same 429 the backlog already carries from
  2026-11-22 — so the standing-approved fallback was dispatched with the same brief. It refused with `REFUSED: no
git-seat-budget`, and it was right: this document had no `git-seat-budget:` line, which the policy requires the
  parent to write at open. The line is now present with its arithmetic. Neither refusal staged anything, so the tree
  was untouched throughout.
- **One gate run flaked on contention, and is recorded rather than hidden** (2026-11-25 18:24). erify:fast failed at
  ests/db/event-audiences-migration.test.ts > refuses an event without an event number, a 15 s timeout while applying
  migrations on PGlite, with the cold-review subagent running concurrently. Isolated re-run: 3 passed in 3.65 s. This is
  the first of the round's two allowed re-runs (AGENTS.md §8); the full gate is re-run in the fix pass.
- **A cold pass is deferred to 18:05 GMT on the owner's instruction** (option 2, 2026-11-25). The two passes
  already run were mimo-v2.6-pro inside the window; the park stands until a reviewer that has not read this
  document's ## Review section reads the spec first. The dispatch is scheduled (ut_212d40b83001NT9Fr08m4D6HSD),
  and until it reports the round stays PARKED.
- **The spec is a draft for the owner's approval and the reviewer seat; no implementation has started.** The other
  worktree on `feat/edit-guard-ui` carries uncommitted UI work from a prior round and was not touched.
