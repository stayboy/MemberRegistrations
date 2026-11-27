# Spec — event notifications, publication and member alert preferences

**Status:** **APPROVED by the owner on 2026-11-25.** Five grill rounds (37 questions) are answered and written into
this text; the answers are summarised under **Decided**. Approval authorises the build only after the reviewer seat
has passed this text (AGENTS.md §2), and it does not authorise a commit (AGENTS.md §9). The round record is
`documents/rounds/event-notifications-spec.md`.

**Author:** Solomon Owoo (synthesised by the agent with the `to-spec` template, into this repository's spec format)

**Date:** 2026-11-25

**Related:** `member-registrations-events-offerings.md` (events, occurrences, offerings),
`member-registrations-event-audience.md` (the audience predicate and visibility rule),
`member-registrations-event-periods.md` (named periods, `period_id`, `period_cycle`, the schedule write),
`member-registrations-ussd.md` (the member menu, its sessions and the display glossary),
`member-registrations-member-record.md` (contacts, reachability, guardians, verification, purge),
`member-registrations-api.md` (the route, error and audit conventions),
`member-registrations-ui.md` (the shell, page-action rule and Admin section).

**Provenance.** Synthesised on 2026-11-25 from the owner's brief ("publishing events, notifications for events, and
member subscription to receive events or mute"), the follow-up that a member may opt out of a recurring event's
notifications and still see it in the notifications area, and the owner's answers to the first grill round. The
scheduler and storage options were researched against the deployment this repository actually uses; the findings are
in **Further Notes**.

## Problem Statement

An event can be created, scheduled, activated and seen in the USSD Activities list, but **nothing tells a member it
exists**. The church announces by hand: a WhatsApp broadcast here, an SMS there, an email, a flier printed for the
door. The register knows the audience, the dates, the venues and every member's contacts, so the announcement is the
one part of the loop the system does not own.

That costs five things:

1. **No record.** Nobody can answer "was M-1042 told about the Convention, on which channel, and did it arrive?" The
   register holds the event and the member but not the message between them.
2. **No preference.** A member on roaming cannot stop SMS for a month; a member who knows the weekly service cannot
   say "only the start and the last call"; a member who has stopped attending a recurring event cannot stop its
   blasts without also losing the record that the church tried to reach them.
3. **No per-channel truth.** One text cannot serve email, WhatsApp, SMS and a 120-character USSD screen. SMS bills
   per 160-character segment, a WhatsApp business-initiated message needs a pre-approved template outside the
   24-hour service window, email carries HTML and a plain-text alternative, and USSD is a paginated plain screen.
   Today each is retyped.
4. **No flier discipline.** The flier and the write-up are the announcement; a flier attached to an email is not
   visible in USSD, and neither is tracked.
5. **No future client.** There is no member-facing read a mobile portal or app could use. USSD is the only member
   surface, and it renders the event list, not the messages.

## Solution

Make the **inbox** the system of record, and treat every channel as a delivery of an inbox message.

- An officer authors a **notification plan** on the event: a small set of **slots** (`announce`, `reminder`,
  `starts`, `last`, `change`), a template per channel, and an optional **flier**.
- **Publishing** the plan is the only send trigger. Activating an event never sends. A plan is published as a
  **revision**, so a later edit cannot rewrite a message that was already sent.
- **pg-boss** carries the queued work: one job per slot instance (fan-out) and one job per delivery. The vendor is
  behind a small port so the queue can move to a Vercel-native trigger later without touching the domain.
- A due slot becomes one **inbox message per targeted member**, then one **delivery per channel the member permits**.
  The inbox message is always written; a mute, a channel block or a cadence filter changes the deliveries, never the
  inbox.
- **Preferences expire.** A mute and a channel block both carry a duration — 30 days, 90 days or a year — so a member
  who silences SMS while roaming is not silenced for ever.
- The member reads the inbox in **USSD**, manages cadence and mutes there, asks the office to block a channel, and
  the same inbox is a member-scoped API for a future app.
- **Fliers are attached images**, held in an S3-compatible store (MinIO locally, R2 or any S3 target later), and
  attached to email, **shown as the image itself in WhatsApp**, absent from SMS and USSD by nature.

## Vocabulary

- **Notification plan** — the officer's authored schedule and content for one event. It is not the event's status.
- **Slot** — a rule in the plan: `announce`, `reminder`, `starts`, `last` or `change`, with an anchor and an offset.
- **Slot instance** — a slot resolved to one date and time (one per occurrence for occurrence-anchored slots). The
  unit the fan-out job turns into inbox messages.
- **Inbox message** — the member-facing record of one slot instance. It is written for every targeted member, before
  any delivery, and is what USSD and a future app read.
- **Delivery** — one channel attempt for one inbox message. A skipped delivery is a recorded outcome, not an absence.
- **Mute** — a member's instruction to stop **deliveries** for one event or one named period, **for a stated
  duration**. The inbox message still exists.
- **Channel block** — an officer-recorded switch that stops one channel's deliveries for a member, **for a stated
  duration**, set at the member's request.
- **Cadence** — `all`, `essential` or `minimal`.
- **Alert settings** — the member's cadence and mutes. Deliberately **not** called a "subscription": in this register
  `subscription` is a welfare product (USSD spec, "Subscriptions and claims").
- **Flier store** — the `FlierStore` port; the `s3` adapter (MinIO, R2, any S3) or the `db` adapter (`bytea`).

## User Stories

1. As an events officer, I want to write one announcement for an event, so that I do not retype it into four
   applications.
2. As an events officer, I want to see the announcement exactly as each channel will render it, so that I catch a
   truncated SMS or a broken variable before it is sent.
3. As an events officer, I want to see how many members will receive each channel before I publish, so that I can
   judge the cost of an SMS blast.
4. As an events officer, I want a typed confirmation above a large SMS count, so that a mis-click cannot spend a
   month's messaging budget.
5. As an events officer, I want to schedule an announcement for a future time, so that I can prepare it on Friday for
   a Sunday service.
6. As an events officer, I want a daily run-up, a reminder three days out and a last call, so that a big event is not
   forgotten.
7. As an events officer, I want the same plan to repeat its start and last call for each occurrence, so that a weekly
   service does not need a weekly copy.
8. As an events officer, I want to cancel a plan before it sends, so that a wrong date does not go out.
9. As an events officer, I want to send a short "tonight is cancelled" or "venue changed" to everyone already told,
   so that nobody travels to a cancelled service.
10. As an events officer, I want a plan edit after publishing to create a new revision, so that a sent message is
    never rewritten under the member's eyes.
11. As an events officer, I want to attach one flier image and a short write-up, so that the announcement carries the
    poster the church already made.
12. As an events officer, I want the flier attached to the email and sent as the WhatsApp image, and the write-up to
    carry SMS and USSD, so that the poorest channel is still a complete message.
13. As an events officer, I want the channel templates to share one closed variable set, so that "first name" cannot
    mean four different things.
14. As an events officer, I want a preview of the recipient count per channel, so that I know which channels are
    worth authoring.
15. As an events officer, I want to see which deliveries failed, so that a provider outage does not silently lose the
    Convention announcement.
16. As an events officer, I want a failed-send digest emailed to the address in settings, so that I learn about a
    failure without opening the page.
17. As an events officer, I want the event detail to say "Not announced" when an active event has no published plan,
    so that activation is not mistaken for publication.
18. As a church administrator, I want to set the standard slot template, signature, SMS confirmation threshold,
    digest recipient and WhatsApp template names, so that every officer starts from the same shape.
19. As a church administrator, I want a cross-event delivery log, so that I can answer "did the notices go out?"
    without opening every event.
20. As a church administrator, I want an advanced search over every message, so that a member's claim can be
    checked.
21. As a church administrator, I want to block a channel for a member for 30 days, 90 days or a year at their
    request, so that a roaming member is not charged, and I want the member to be able to do it themselves.
22. As a member, I want a Notifications area in USSD, so that I can read what the church sent me without a
    smartphone.
23. As a member, I want to open one notification and see the event, date, venue and write-up, so that I know what it
    is about.
24. As a member, I want to open a notification and have it marked read, so that a future app can show me what is new.
25. As a member, I want to mute one event for 30 days, 90 days or a year, so that a fundraiser I am not attending
    stops messaging me and then stops being muted.
26. As a member, I want to mute a named period such as Communion Week for a stated duration, so that a season stops
    messaging me without muting each event in it.
27. As a member, I want a muted event to still appear in my Notifications area, so that I can catch up when I choose
    to.
28. As a member, I want to choose "essential only" when an officer schedules a daily run-up, so that a chatty plan
    does not blast me.
29. As a member, I want to choose "start and last" or "essential" instead of everything, so that a weekly service
    does not message me five times.
30. As a member, I want every notification in my inbox whatever my cadence, so that I can catch up on the ones I
    skipped.
31. As a member, I want my mute on a recurring event to last the duration I chose, so that I do not have to mute it
    again next week.
32. As a member, I want to mark a notification read without opening it, so that my pending list stays the thing I work through.
33. As a member, I want to see the event's current details on the notification, so that a postponed service does not
    leave a stale date in my inbox.
34. As a member, I want the verification code the register sends me even when I have blocked every channel for
    announcements, so that I can still prove my number.
35. As a member, I want my choices to be auditable, so that a change I did not make can be found.
36. As a guardian, I want my child's event notifications to reach me when the child has no phone of their own, so
    that a youth event is not invisible to the household.
37. As a member with no email or WhatsApp, I want SMS or USSD to carry the whole announcement, so that I am not a
    second-class recipient.
38. As a future mobile-app user, I want the same notifications the USSD inbox shows, so that the app is not a second
    system.
39. As a future mobile-app user, I want unread state, so that the app can badge new messages.
40. As a reviewer, I want the inbox message to be written before any delivery, so that "the church tried to reach
    this member" is a fact even when every provider failed.
41. As a reviewer, I want one skip precedence, so that two surfaces cannot report different reasons for the same
    skipped delivery.
42. As a reviewer, I want a slot whose time has passed at publish to be refused, so that a plan cannot back-date an
    announcement.
43. As a reviewer, I want the fan-out and the send to be idempotent under a retried job, so that a member does not
    receive the same announcement twice.
44. As a reviewer, I want a schedule rewrite to reconcile the instances it removes, so that a moved service does not
    send from a stale date.
45. As a reviewer, I want a flier served from a store this repository can swap, so that the local MVP and a hosted
    deployment run the same code.
46. As a reviewer, I want a member purge to erase alert settings, mutes, blocks and inbox messages, so that PII
    erasure stays complete.

## Implementation Decisions

### N-1. Publication is a plan, not a change to the event

- `events.status` remains `draft | active | archived`. Activating an event does **not** announce it.
- A **notification plan** is the only send trigger. It owns its **revisions**: `notification_plans` carries the event
  and the next revision number, and `notification_plan_revisions` carries each revision's `status`
  (`draft | published | superseded | cancelled`) with its publish and cancel stamps. An event has at most one plan, so
  a second announcement is a slot or a new revision. Publishing revision N+1 supersedes N in the same transaction, so
  exactly one revision is published at a time while an existing instance keeps the revision it pinned.
- **Activation stays the existing transition**: `PATCH /v1/events/{id}` with `status: "active"`, which UI AC-56 already
  defines. The lock below begins at that write and does not change it; `return-to-draft` is the one new verb.
- Publishing requires an `active` event. A `draft` or `archived` event's plan may be authored, previewed and
  validated, but `POST .../publish` answers `409 event_not_active`.
- The event detail shows **Not announced** when an active event has no published plan, and **Announced** with the
  latest publish time when it has one.
- A published plan can be **cancelled**: future instances stop, existing inbox messages and sent deliveries remain.
- **A published event is locked from edit** (owner, 2026-11-25: "published event is out of edit and ready for
  notification or view by member even when notification sent"). Publication is the **event's own `active` state**, not
  the plan's: activating takes it out of edit, makes it notification-ready and member-visible, and sending a
  notification changes none of that. The event record, schedule, audience and venue therefore answer
  `409 event_locked` once active; plan authoring stays available because the plan is not the event, and cancelling a
  single occurrence stays available because that is the calendar telling the truth.
- **Two guards, in a stated precedence.** A schedule write checks the notifications lock first: on an `active` event
  it answers `409 event_locked`. On a `draft` event the periods guard applies unchanged, including its
  `409 recurrence_locked` once the event has history. `return-to-draft` therefore reopens the record, audience and venue
  at once, and reopens the schedule only as far as that guard allows — an event with attendance history keeps its
  generated occurrences, which is what the guard exists to protect.
- **The lock reverses the current model, deliberately.** Today an `active` event is editable; the owner asked for the
  reversal on 2026-11-25. UI FR-42e is the text that must follow, and it is named in the sibling section.
- **`Return to draft` is the release** (owner, 2026-11-25). An audited `POST /v1/events/{id}/return-to-draft` returns
  an active event to draft so it can be corrected; it answers `409 plan_published` while its plan is published, so the
  officer cancels the plan first and nothing can be scheduled from an event being edited. `Save and activate`
  republishes, and the next notification publish is a new revision.

### N-2. Slots and resolution

| Kind       | Allowed anchors                                | Default offset | Repeats per occurrence?                  | Cadence tier |
| ---------- | ---------------------------------------------- | -------------- | ---------------------------------------- | ------------ |
| `announce` | `publish`, `event_start`                       | `0`            | no                                       | essential    |
| `reminder` | `event_start`, `occurrence_start`, `event_end` | `-1440`        | yes, when anchored to `occurrence_start` | frequent     |
| `starts`   | `occurrence_start`                             | `0`            | yes                                      | essential    |
| `last`     | `occurrence_end`, `event_end`                  | `-1440`        | yes, when anchored to `occurrence_end`   | essential    |

- `offsetMinutes` is an integer in `[-10080, 10080]` (one week either way). Time is computed in `events.timezone`
  (the only override for "today", events FR-12) and stored as `timestamptz`; the queue is UTC.
- A slot resolves to **one instance per occurrence** when its anchor is `occurrence_*`, and to one instance otherwise.
  Repetition is derived from the anchor and nothing else: there is no repeat flag to store, so a `reminder` anchored to
  `occurrence_start` repeats and one anchored to `event_start` does not. A cancelled occurrence produces no instance.
- A slot that resolves into the past **at publish** is refused with `422 slot_in_past`, naming the slot. The
  exception is `announce` and `change` at offset 0, which are "now" by construction.
  A **change notice** is one-off and publish-anchored. It is a `notification_change_notices` row, **not a slot**: it exists so an officer can tell everyone already notified that
  a service is cancelled, moved or postponed. Its body is officer-written; the event's fields cannot supply "what
  changed".
- Two slots that resolve to the same instant for the same occurrence are `422 duplicate_slot_time`.
- A plan may have at most **12 slots**.
- The plan's horizon is the event's occurrences from the publish instant to the event's end, capped at **90 days**;
  the queue extends the horizon as time moves, through a daily `horizon` job: it calls the occurrence generation the
  events API uses (`POST /v1/events/generate`) **once for the whole register** - that call takes no event id and
  expands every active recurring event - then materialises instances for any occurrence that has none, per published
  plan. Without that job a weekly series would fall silent after 90 days, which is why it is part of the queue rather
  than the publish.

### N-3. Revisions

- A plan has a monotonically increasing `revision`. The first publish is revision 1.
- A draft revision is editable in place. A published revision is **frozen**: any edit writes `revision + 1` with its
  own slots and templates.
- **The ETag a draft carries is a content token, not its revision number.** A draft edits in place, so two different
  drafts share one revision and a revision-shaped ETag cannot tell them apart; publish pins the content token it was
  asked to publish, which is what makes "publish what you previewed" true.
- **Slots are revision-keyed** (`notification_plan_slots.revision`, unique `(plan_id, revision, sort_order)`), so a
  new revision carries a complete slot set and an old one keeps its own. Templates already carry `revision`.
- Every slot instance pins the revision it was created from. An instance already created keeps its revision; future
  instances use the latest published revision.
- No revision with a created instance is deleted, and no sent message is rewritten.
- **A large SMS blast needs a typed confirmation in the UI.** When the SMS recipient count exceeds
  `notification_defaults.sms_confirm_threshold` (default 250), the publish request carries `confirmed: true`; the UI
  requires the officer to type the count before it sends one. The threshold is a UI guard, not a server-side cap,
  because the officer owns the spend.

### N-4. Recipients

- The recipients of an instance are the members the event's **audience intersection** covers at the instance's date
  (audience A-2a and A-3), deduplicated, excluding purged and archived members and members who had not joined. This is
  the same predicate that answers member-facing visibility, so a `tracksMembers = false` event — the Sunday service —
  is announced from that predicate and not from a roster (`expected` stays uncomputed for it).
- A first-time visitor has no member record and therefore no inbox message. A registered visitor is a recipient only
  when the audience names visitors.
- **Reachability picks the destination, not age.** A member's delivery may use their own owned contact or, when they
  have none or none for that channel, the resolved `guardian` chain (member-record MR-39 makes a guardian mandatory for
  any member with no own contact; MR-46 forbids age deciding contact eligibility). The guardian's message names the
  member. A member is never delivered twice for one channel.
- **A member who cannot authenticate has no inbox row, and that is why a delivery is not a message.** USSD identifies
  a caller only by an owned contact, so a member reachable only through a guardian cannot open an inbox. For them the
  register writes a **delivery with no `message_id`** (`routed_via = 'guardian'`), addressed to the guardian's contact
  but keyed to that member and that instance. The delivery row therefore hangs off `(instance_id, member_id)` rather
  than off a message, which is the schema's shape in N-14. A guardian who is themselves in the audience receives their
  own message and their own deliveries independently.
- FR-7's "inbox always written" therefore means _every otherwise-eligible member who owns at least one contact_. A
  member who owns no contact at all is reachable only through their guardian and is the single inbox-less case. An
  email-only member does own a contact and therefore has a row, even though USSD cannot yet authenticate them to read
  it - a read-path gap, not a row that should be withheld (`documents/backlog.md`).
- The recipient count is computed at preview and recomputed at each instance. A member who joins between preview and
  instance receives it; a member who leaves does not.

### N-5. Channel resolution and skip precedence

- Channels are exactly `email`, `sms`, `whatsapp`. A fourth render, `ussd`, is the inbox body, not a delivery channel.
- Email resolves to an owned `email` contact, WhatsApp to an owned `whatsapp` contact and SMS to an owned `phone`
  contact, falling back to the guardian chain when the member owns none. A verified contact is preferred; otherwise the
  lowest `display_order`, then the oldest.
- Each delivery records `routed_via` (`own | guardian`), the `contact_id` it used and a `destination_masked` snapshot.
  The raw value is read to send and never written to a log, an error, a response or a metric.
- **The decision is taken at delivery time, against live state.** A mute or a block applies only while
  `expires_at > now()` and `revoked_at is null`, so an expiring block stops applying without anyone's action.
- **Expiry is swept, not merely read.** The queue's daily maintenance run revokes rows whose `expires_at` has passed
  (`revoked_at` set, `revoked_by` `system`) so the partial indexes self-heal and a member's next block never collides
  with a lapsed row. The read filters `expires_at > now()` as well, so a lapsed row is invisible even between sweeps.
- **Setting a mute or a block revokes the live one for the same scope in the same transaction.** A member re-blocking
  SMS after thirty days, or re-muting an event, revokes the previous row before inserting the new one. Nothing is
  updated in place and nothing is deleted (AGENTS §5), so the history reads as a sequence of periods.
- **Skip precedence is fixed and tested**: `channel_blocked` → `event_muted` → `period_muted` → `cadence_filtered` →
  `no_contact`. The first applicable reason is the one recorded; a skipped delivery is never retried.
- **Two failure codes, two fates.** `channel_unconfigured` is terminal on the first attempt (no provider is wired);
  `transport_unavailable` is retryable and backs off (a provider 5xx, a timeout, an unreachable flier store). Collapsing
  them into one code would either retry a missing provider for ever or drop a transient outage.

### N-6. Cadence

Three values, all evaluated **per occurrence**:

| Cadence     | Delivers                                 | Skips                                  |
| ----------- | ---------------------------------------- | -------------------------------------- |
| `all`       | every instance                           | none                                   |
| `essential` | `announce`, `change`, `starts`, `last`   | every `reminder` (the daily run-up)    |
| `minimal`   | the occurrence's `starts` and its `last` | `announce`, `change`, every `reminder` |

- `essential` is the answer to a chatty plan: an officer may schedule a daily run-up for a fortnight, and the member
  keeps the announcement, the start, the last call and any change notice without the run-up.
- `minimal` is the "start and last" the owner asked for. With no `starts` (or no `last`) in the plan, the occurrence's
  first (or last) instance of any kind stands in, so the member is never silent.
- The **inbox receives every instance whatever the cadence**. Cadence filters deliveries only.
- A standalone event with one occurrence collapses all three settings to "two or three messages", which is the point:
  the difference only matters for a plan that repeats.

### N-7. Templates, the renderer and the WYSIWYG editor

- A published revision carries one template per channel that has recipients, and always the `ussd` inbox template
  (`422 template_required` otherwise).
- **Three of the four channels are plain, and the fourth is a template.** Email is the only rich surface (TipTap JSON
  rendered to HTML); SMS and USSD are plain text; WhatsApp is an **approved template**, not free-form content and not
  HTML. Saying "email and WhatsApp may be rich" was the draft's error and is withdrawn.
- **Email** — HTML from the structured body in an inline-styled shell, a required subject, a plain-text alternative,
  and the **flier attached** (inline `cid:` plus a downloadable attachment). The footer carries the church name, a
  "Manage alerts in USSD" line and a reply-to.
- **WhatsApp** — an approved template with an **image header**: `template_name` names it, and `parameter_map` maps each
  closed variable to its ordered body slot (`{"firstName": 1, "eventName": 2, …}`), so the provider receives
  `{{1}}…{{n}}` rather than prose. The flier is the header media, so the poster is **shown in the chat, never pasted as
  a link** (owner, 2026-11-25). A plan with no flier uses the text-only variant of the same template.
- **SMS** — plain text, GSM-7 or UCS-2 detected, segment count computed (160/153 or 70/67) and shown.
- **USSD / inbox** — plain text rendered as a paginated screen sequence under the whole-screen budget, with the
  adapter's own cap and `pageSize` applied (Nalo 120, `{2,3}`).
- **Variables.** Closed and server-substituted: `{{firstName}}`, `{{fullName}}`, `{{eventName}}`, `{{eventDate}}`,
  `{{startTime}}`, `{{endTime}}`, `{{venue}}`, `{{periodName}}`, `{{memberNo}}`, `{{churchName}}`. `{{flierUrl}}` is
  available to email's plain-text alternative only: no channel body carries the flier as a link, because the image is
  attached (email) or shown as the template header (WhatsApp), and SMS and USSD cannot show it. Unknown is
  `422 unknown_variable`; a null field renders empty; `{{firstName}}` falls back to `{{fullName}}`, then "friend". Each
  channel escapes for its own syntax.
- **The editor.** Fluent UI v9 has no rich-text editor, so a bespoke one is a §16 finding. The engine is **TipTap**
  (MIT core, headless, ProseMirror) with a closed extension set: paragraph, heading 2 and 3, bold, italic, underline,
  strike, bullet list, ordered list, link, image, hard break, history. The toolbar composes Fluent `Button`,
  `ToggleButton`, `Menu` and `Tooltip`; no second component library.
- **SMS, USSD and WhatsApp are not HTML surfaces.** Plain composers with a variable palette, a live character and
  segment counter, and a preview; WhatsApp shows the approved template it will send, its ordered parameters and the
  header image, and offers no formatting buttons because the channel's formatting lives in the template.

### N-8. The queue: pg-boss behind a port

- **pg-boss v12** (MIT) owns the queued work: one fan-out job per slot instance, one send job per delivery. It gives
  retries with backoff, dead-letter queues, concurrency and `SKIP LOCKED` claiming, so this spec does not hand-roll a
  lease, a reclaim sweep or a backoff ladder.
- **The backend follows the driver**, which is what keeps the repo vendor-neutral: `backend: 'pglite'` with
  `fromPglite` in tests and the embedded path, `backend: 'postgres'` against Neon. All three drivers must pass the
  same repository and queue tests (AGENTS §12).
- **Schema.** pg-boss installs its own `pgboss` schema. To keep AGENTS §12's single tracked runner, its DDL is
  generated with `pg-boss plans migrate --dry-run`, committed as a tracked migration, and pg-boss runs with
  `migrate: false`; `pg-boss doctor` runs in CI as the drift check, mirroring the Drizzle drift test. (The alternative
  — letting `start()` install its own schema — is put to the owner in the follow-up round.)
- **The worker** is `src/worker.ts`: it starts pg-boss and registers the two handlers. Compose runs it as the
  `worker` service; the local MVP is a long-lived process, which is what "local first" buys. The Vercel path is a
  later adapter that runs the same handlers inside a bounded `/internal/notifications/tick` call, so the domain code
  never learns which trigger it runs under. The cadence is the deployment value `NOTIFICATION_TRIGGER_MINUTES`, which
  has **no default in code**: `0` means continuous, Compose sets `0`, the hosted deployment sets `15`, and the config
  schema refuses to boot when it is unset. It is surfaced read-only on the Admin page through
  `GET /v1/notification-defaults` as a decoded `{ kind, minutes }`, so the coarse-cadence refusal and the UI cannot
  disagree.
- **The cadence is a hosting fact, not a rule.** The local stack polls **continuously** because its Postgres is a
  container in the same Compose file: always on, no per-hour meter, so cadence buys nothing there (owner,
  2026-11-25). The **hosted** trigger runs **every 15 minutes**, because a managed Postgres sleeps after five idle
  minutes and a one- or five-minute poll keeps it awake for ~182 CU-hours (~$19/month) instead of ~$1. The two
  cadences deliver the same messages; only the worst-case lateness differs.
- **A `starts` slot needs a cadence of 15 minutes or finer.** Publishing a plan that contains one is refused
  `409 cadence_too_coarse` when the deployed trigger is coarser, so the register never promises a start alert it cannot
  honour. The deployed cadence is shown read-only on the Admin page.
- **The pg-boss dashboard is a local operations tool.** `@pg-boss/dashboard` (MIT) ships in Compose behind basic auth,
  is never deployed to production, and is never linked from the officer UI. It can retry, cancel and delete jobs, which
  is a second path to an outcome this spec audits (FR-32) and whose counts the plan detail reports, so an operational
  requeue goes through the audited API retry and the dashboard stays a monitor.
- **Idempotency.** `boss.send` uses a singleton key per unit: `instance:<id>` for the one fan-out job of that instance
  (the job pages its 500-row batches itself), and `delivery:<id>` for a send. A retried job therefore cannot duplicate a
  message or a delivery, and `sent` is terminal.
- **Retry.** `transport_unavailable` (a timeout, a provider 5xx, an unreachable flier store) uses pg-boss's exponential
  backoff for at most 5 attempts, then dead-letters; the dead letter is the "failed" list an officer sees.
  `provider_rejected` (a 4xx naming the destination) and `channel_unconfigured` (no provider wired) are terminal on the
  first attempt. The stored code is from that closed set, never the provider's body.
- **Fan-out is paged.** A slot instance's fan-out creates inbox messages in batches of 500 inside one transaction per
  batch, so a large audience does not hold one long transaction, and a re-run resumes from the rows that do not yet
  exist (`unique (instance_id, member_id)`).
- **Provider port.** A **`NotificationSender`** port beside the existing `MessageSender`/`EmailSender`:
  `send(to, { subject?, html?, text?, mediaUrl?, template?, attachments? })`. The existing `WHATSAPP_SEND_URL`,
  `SMS_SEND_URL` and `MESSAGE_SEND_TOKEN` are reused; `NOTIFICATIONS_EMAIL_FROM` defaults to `MAGIC_LINK_FROM`. An
  unconfigured channel is `null`, and its deliveries are `failed/channel_unconfigured` on the first attempt, never
  silently `sent` and never retried.
- **Concurrency.** Per-channel provider concurrency is 5. SMS throughput is the provider's.
- **Why not a hand-rolled queue.** It was the draft's first answer, and the owner replaced it: pg-boss is MIT,
  Postgres-backed, has a first-class PGlite backend, and its retry/dead-letter/concurrency behaviour is the part most
  worth not writing. The cost is a dependency, its schema, and the vendored-DDL discipline above.

#### The send-time policy

An officer sets **when the church is willing to be messaged**, and the policy is applied **when a job is enqueued**
(`startAfter`), not when it is claimed, so the worker stays dumb and the behaviour is testable. The setting is a mode
plus its hours, all wall-clock in `church_timezone` (owner, 2026-11-25: the officer may "toggle between all 3 windows
per budget reasons").

| Mode     | Delivery instant                                                                                                                                                                       | Trigger the mode wants | Bill    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| `always` | the slot's resolved instant, any hour                                                                                                                                                  | continuous             | highest |
| `window` | inside `send_from`-`send_to` (default 08:00-20:00); later hours defer to the next opening. A deferred `starts`/`change` needs an acknowledgement; `announce`/`reminder` defer silently | continuous             | high    |
| `daily`  | one batch at `send_hour` (default 14:00); everything due that day waits                                                                                                                | daily                  | lowest  |

- **`starts` and `change` bypass a `window`.** A 06:00 start alert and a "tonight is cancelled" notice are
  time-critical, and an eleven-hour-late start alert is worse than an early one (owner, 2026-11-25: "as-is").
- **`daily` batches every kind, including `starts`**, because that is the mode's whole purpose: the preview and the
  plan detail warn that a 06:00 service is announced at 14:00.
- **The trigger and the policy are different things, and the Admin page says so.** On Vercel the cron entry is
  deployed configuration, so a mode cannot change it at runtime; the Admin page shows the deployed cadence read-only
  and warns when a mode cannot realise its saving until the trigger changes. The mode always governs _delivery_; it
  governs the _bill_ only when the trigger agrees.
- **A policy change applies to jobs enqueued after it.** The plan detail shows the resolved send instant per instance,
  so an officer sees what the current mode does before publishing.
- **Two zones, two jobs.** A slot's **instant** is computed in `events.timezone` (events FR-12). The **window** is then
  applied in `church_timezone`, and only asks one question: does that instant fall inside the sending hours of the
  church's own day? A per-event zone that differs from the church zone therefore shifts when a slot is due, not how the
  window is read, and the preview shows both the instant and the UTC time it will send. The hours are wall-clock in
  `church_timezone`, displayed beside their UTC equivalent. Multi-zone
  tenancy is V2's problem (owner, 2026-11-25), so v1 carries one church zone.

### N-9. The flier: attached image, swappable store

- One active flier per **plan revision**: `image/webp`, `image/jpeg` or `image/png`, at most **2 MB**, magic-byte
  sniffed as the member photo is (`src/domain/photos.ts`).
- **Storage is a port, not a table.** `FlierStore` has two adapters:
  - `s3` — any S3-compatible target: **MinIO** in Compose (AGPL-3.0, self-hosted, no account) and **Cloudflare R2**
    in a hosted deployment (10 GB-month, 1 M Class A and 10 M Class B operations free, zero egress — verified
    2026-11-25). The same adapter serves both because both speak S3.
  - `db` — `bytea` in the register, the fallback when no store is configured, so a clone with no bucket still runs.
- The **storage key** is `fliers/<token>`, the token 32 random bytes, and the row records `storage`, `storage_key`,
  `content_type`, `byte_size` and `sha256`.
- **A flier is a poster, never a record.** It MUST NOT contain member data — a name, a number, a photograph of a
  register page — because the URL is public and forwarded with every email (AGENTS §14's rule for mocks, applied to a
  public asset). The upload dialog says so.
- **Serving.** `GET /fliers/{token}` is public, outside `/v1` (AGENTS §6 reserves `/v1` for bearer routes; `/ussd/*`
  is the existing precedent), with `Content-Type` from the stored type, `X-Content-Type-Options: nosniff`,
  `Content-Disposition: inline` and `Cache-Control: public, max-age=31536000, immutable`. The app streams from the
  store, so the URL is stable whichever adapter is configured and no bucket is ever exposed directly.
- **Delivery.** Email attaches the image (inline `cid:` plus an attachment); WhatsApp sends it as the template's
  **header media** — the provider fetches it from `GET /fliers/{token}`, so the poster renders in the chat and no
  message body contains a URL (owner, 2026-11-25); SMS has no MMS and USSD cannot show an image, so both carry the
  write-up and details instead.
- Replacing the flier on a draft revision replaces the object. On a published revision it writes a new revision and a
  new token, so a sent message's URL keeps resolving to the image it was sent with.
- No resizing or conversion; the upload dialog warns that a large image is fetched by every mail client.

### N-10. Member preferences, mutes, blocks and the inbox

- **Settings.** `member_notification_settings` holds one row per member: `cadence` (`all | essential | minimal`).
  Default `all`. A read with no row returns the default and creates nothing; a first write creates the row. Channel
  state is **not** here — it is the block table.
- **Mutes carry a duration.** `notification_mutes` holds `scope_type` `event | period`, `scope_id` (**text** — period
  ids are constants such as `communion-week`; `events.period_id` is `text`), `scope_name` snapshot, `duration_days`
  ∈ {30, 90, 365}, `expires_at`, `created_at`, `created_by`, `source` (`ussd | admin`), `revoked_at`/`revoked_by`.
  A period mute names the period and covers **every event whose `period_id` is that period, now and later** (owner,
  2026-11-25). An event with no `period_id` can only be muted by event. There is **no permanent mute**: every mute
  states its length, and it ends silently at `expires_at` with the end date shown wherever it is listed.
- **A mute suppresses deliveries only.** The inbox message is still written.
- **Channel blocks are self-service or officer-set.** `member_channel_blocks` holds `channel`, `duration_days`
  ∈ {30, 90, 365}, `expires_at`, `created_by`, `source` (`ussd | admin`), `revoked_at`/`revoked_by`. A member sets one
  in USSD, or an officer sets one at their request; both paths write the same row, the same audit entry and the same
  confirmation. Re-blocking a channel revokes the live row first (N-5).
- **Adding a block sends a confirmation notice.** On creation — from either path — the member receives a **system
  inbox message** (`kind = 'system'`, no instance and no event; N-14's check allows this) plus a delivery on the best
  channel that is **not** blocked (email, then WhatsApp, then SMS, then none), naming the channel, the reason and the
  end date. If every channel is blocked, the notice is inbox-only.
- **Audit.** Every settings, mute and block write appends a `notification_preference_events` row (`field`,
  `from_value`, `to_value`, `source`, `actor`, `at`). The current state is a projection; the history is the audit.
- **Inbox.** `notification_messages` stores the rendered body, `kind` (`event | system`), the instance id and event id
  (both null for a system notice), the flier reference, `created_at` and `read_at`. It stores the **rendered** body so
  the inbox shows what was sent, and joins the event for live name/date/venue.
- **Pending and read, not deleted.** A message is **pending** until `read_at` is set. Opening it sets it; a member may
  also mark a pending message read without opening it, so the pending list stays the focus — the owner's LinkedIn-style
  model. Nothing is deleted by a member; a read message moves to **Earlier** and stays retrievable.
- `GET /v1/members/{memberNo}/notifications?cursor=&limit=` returns `{ items, nextCursor, pendingCount }`, **pending
  first then read**, and within each by `created_at desc, id desc`. The cursor is the triple
  `(readAtIsNull, createdAt, id)` and the index is `(member_id, (read_at is not null), created_at desc, id desc)`, so
  the ordering is served rather than sorted. `POST .../{id}/read` sets `readAt` once (idempotent) and
  `POST .../read-all` sets it for every pending message. Both are `Cache-Control: no-store`.
- This read is the future app's read: member-scoped, no other member, no destination, no template internals.
- **Purge** runs in one transaction, **in this order**: stamp `anonymised_at` and clear `destination_masked`/`contact_id`
  on the delivery rows **first**, then delete the settings, mutes, blocks and inbox rows. The order matters because
  `message_id` is `on delete set null` and the routed check accepts a null message only once `anonymised_at` is set;
  deleting the inbox first would trip the check mid-transaction. In short: clears `destination_masked` and nulls
  `contact_id` on their delivery rows (the row keeps its status, attempts, error code and times, so the register still
  knows a send was attempted without knowing to whom); and keeps `notification_preference_events` with `member_id` set
  null. `contact_id` is `on delete set null` so removing a contact never blocks (N-14).

### N-11. USSD surfaces

- The identified member's main menu gains **Notifications** immediately **before My Profile** (owner, 2026-11-25);
  the anonymous menu does not.
- The USSD display glossary gains the `menu.notifications` and `notifications.*` keys in this round, because its
  completeness and budget property test renders every reachable state and fails on an unknown key.
- **Inbox.** The latest five messages, newest first, each a line with the event and date (`0 More` pages older);
  opening one shows the body as a screen sequence, with the event date, venue and a "A flier is in your
  email/WhatsApp" line where applicable. Opening sets `read_at`.
- **Item actions.** `1 Open event`, `2 Mute this event`, `3 Mute ‹period›` when the event carries a `period_id`,
  `4 Mark read`, `9 Back`. Muting asks the duration (`1` 30 days, `2` 90 days, `3` a year), confirms, and returns to
  the inbox. `4 Mark read` clears a pending item without opening it.
- **Settings.** `8 Alert settings`: `1` Cadence (All / Essential / Start & last), `2` Muted items, `3` Blocked
  channels (each with its end date, `1` to add a block, and an unpick to end one), `9` Back.
- **Muted items.** Current mutes, newest first, each with its end date; opening one offers `Unmute`.
- The USSD session service calls the same domain service as the API.

### N-12. The Notifications page, the event card, and defaults

- **Notifications is a standalone page under the Events section** (`#/notifications`), not a panel on the event
  detail (owner, 2026-11-27: "merging notifications to event detail puts too much on the form; event detail currently
  also has its own cards"). The event detail carries a **summary card only**: plan status and revision, the next send,
  and a link to the plan. Nothing is authored from the detail.
- **The page is the operations home.** It shows, per channel, four counts over a chosen range (default seven days,
  dates in UTC): **sent**, **skipped**, **failed**, **queued**. A skipped delivery is never counted as a failure.
  Below the counts sits a **grid of deliveries** - event, kind, channel, status, attempts, masked destination, created
  and sent - filtered by **channel tabs, status and date range**, and searchable by event name and member number.
  Failed rows carry the same one audited retry as the API (`POST /v1/notification-deliveries/{id}/retry`).
- **The failure digest can be sent on demand** from the page, composed by the same code the daily job uses, refused
  when `failure_digest_to` is unset, and audited with the actor so a manual send is not mistaken for the scheduled one.
- **Plan authoring is its own event-scoped page** (`#/events/:id/notifications`): slots, the channel editors with
  preview, the flier, **Preview**, **Publish**, **Cancel**, the change notice, and that plan's own per-instance counts
  and failed deliveries.
- **The lock is visible.** While the event is `active`, the detail carries a locked banner naming the publish time and
  the revision with a **Return to draft** action (refused `409 plan_published` while a plan is published), so the lock
  has a stated, findable release. The events list shows the lock beside the Announced mark.
- **Mute and block counts are aggregate only.** The event's card shows "12 muted · 4 blocked", never a list of names
  (owner, 2026-11-25): a named list of who declined the Convention is a privacy breach dressed as an explanation. The
  named list lives on the member record, one member at a time.
- **Defaults** stay on the page as its settings section: the standard slot template, `churchName`, the email signature
  and reply-to, `sms_confirm_threshold`, the send mode and its hours, `church_timezone`, the **deployed trigger
  cadence** (read-only, from config), the **failure-digest recipient** and switch, the USSD cap (read-only) and the
  approved WhatsApp template names per variant.
- **Message search** - an advanced search across every inbox message by member, event, date range, read state and
  text - also lives here. Nothing is ever removed by a member, so this searches the full history rather than a hidden
  subset.
- There is **no reusable template library** in v1; the per-event plan is the authoring surface.

### N-13. The failure digest

- The queue sends a **compiled failed-send digest** by email to the address in `notification_defaults`
  (`failure_digest_to`), on a daily schedule, listing each failed delivery since the previous digest: event, slot,
  channel, masked destination, attempts, sanitised error code and time.
- It sends once a day at `notification_defaults.digest_hour` (default 09:00, church timezone), **only when there is at
  least one failure**, and it records `last_digest_at` so a quiet day is silent
  rather than an empty email.
- An unconfigured address turns it off. The digest is an officer message, not a member message: it ignores member
  settings, blocks and mutes.

### N-14. Data model

Migrations `0030_event_notifications` (the plan side: plans, plan revisions, slots, templates, fliers, defaults),
`0031_pgboss_schema` (generated from pg-boss's own DDL) and `0032_notification_send` (the send side: instances,
messages, deliveries, settings, blocks, mutes, preference events). The schema is split across two rounds because a table
lands with the code that uses it: R2 cannot publish, so it has no instances, and R3 builds the send path against the
tables it consumes.

```sql
create table notification_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events(id),
  next_revision int not null default 1 check (next_revision > 0),
  created_by text not null, created_at timestamptz not null default now(),
  updated_by text not null, updated_at timestamptz not null default now()
);

-- One row per revision: this is what "published" means, and what pins an instance.
create table notification_plan_revisions (
  plan_id uuid not null references notification_plans(id),
  revision int not null check (revision > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded', 'cancelled')),
  published_by text, published_at timestamptz,
  cancelled_by text, cancelled_at timestamptz,
  acknowledgement jsonb,           -- the typed publish acknowledgement, when one was required
  created_by text not null, created_at timestamptz not null default now(),
  updated_by text not null, updated_at timestamptz not null default now(),
  primary key (plan_id, revision),
  constraint notification_plan_revisions_published_check
    -- A superseded or cancelled revision keeps the time it was published, so the
    -- check is one-way: a published row must carry a stamp, the others need not.
    check (status <> 'published' or published_at is not null)
);
create unique index notification_plan_one_published
  on notification_plan_revisions (plan_id) where status = 'published';
-- Publishing revision N+1 supersedes N in the same transaction: one published at a
-- time, while an already-created instance keeps the revision it pinned.

create table notification_plan_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  revision int not null,
  kind text not null check (kind in ('announce', 'reminder', 'starts', 'last')),
  anchor text not null check (anchor in
    ('publish', 'event_start', 'event_end', 'occurrence_start', 'occurrence_end')),
  offset_minutes int not null check (offset_minutes between -10080 and 10080),
  sort_order int not null,
  unique (plan_id, revision, sort_order),
  foreign key (plan_id, revision) references notification_plan_revisions (plan_id, revision)
);

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  revision int not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'ussd')),
  subject text,                     -- email: required, the message subject
  body_json jsonb,                  -- TipTap document, email only
  body_text text,                   -- the sms/ussd body, and email's plain-text alternative (stored, not derived at send)
  template_name text,               -- whatsapp: the approved template
  parameter_map jsonb,              -- whatsapp: variable -> ordered slot, e.g. {"firstName": 1}
  created_by text not null, created_at timestamptz not null default now(),
  unique (plan_id, revision, channel),
  foreign key (plan_id, revision) references notification_plan_revisions (plan_id, revision),
  check (channel = 'email' or body_json is null),
  check (channel <> 'email' or (subject is not null and body_json is not null and body_text is not null)),
  check (channel <> 'whatsapp' or body_text is null),
  check ((channel = 'whatsapp') = (template_name is not null))
);

create table event_fliers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  revision int not null,
  token text not null unique,
  storage text not null check (storage in ('s3', 'db')),
  storage_key text,
  bytes bytea,
  content_type text not null check (content_type in ('image/webp', 'image/jpeg', 'image/png')),
  byte_size int not null check (byte_size > 0 and byte_size <= 2097152),
  sha256 text not null,
  uploaded_by text not null, uploaded_at timestamptz not null default now(),
  unique (plan_id, revision),
  foreign key (plan_id, revision) references notification_plan_revisions (plan_id, revision),
  check ((storage = 'db') = (bytes is not null) and (storage = 's3') = (storage_key is not null))
);

create table notification_change_notices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references notification_plans(id),
  title text not null,
  body_text text not null,
  -- The notice's own channel bodies. N-7 forbids free-form WhatsApp, so the
  -- template name and its ordered parameters are chosen per notice; email needs a
  -- subject and a body of its own, because a published revision's templates are
  -- frozen and cannot be expected to carry content authored after them.
  whatsapp_template text,
  whatsapp_parameters jsonb not null default '[]'::jsonb,
  email_subject text,
  email_body_text text,
  published_by text not null,
  published_at timestamptz not null default now()
);

create table notification_slot_instances (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references notification_plans(id),
  slot_id uuid references notification_plan_slots(id),
  change_notice_id uuid references notification_change_notices(id),
  kind text not null check (kind in ('announce', 'reminder', 'starts', 'last', 'change')),
  revision int not null,
  occurrence_id uuid references event_occurrences(id) on delete set null,
  occurrence_date date,             -- snapshot: survives the occurrence row
  send_at timestamptz not null,     -- the resolved instant, before the send policy
  delivery_at timestamptz,          -- computed at materialisation; the job is enqueued here
  status text not null default 'scheduled'
    check (status in ('scheduled', 'fanning_out', 'sent', 'cancelled', 'failed')),
  check ((slot_id is not null) <> (change_notice_id is not null)),
  check ((kind = 'change') = (change_notice_id is not null)),
  started_at timestamptz, finished_at timestamptz,
  recipient_count int not null default 0,
  sent_count int not null default 0,
  skipped_count int not null default 0,
  failed_count int not null default 0
);
-- Keyed on the date and the resolved instant, NOT on the slot: a revision bump or a
-- re-materialised slot must not create a second instance for the same moment. A
-- cancelled instance is exempt, or a plan cancelled and later republished could never
-- claim the same moment again (AC-26's return-to-draft depends on it).
create unique index notification_slot_instances_key
  on notification_slot_instances (plan_id, coalesce(occurrence_date, '0001-01-01'::date), send_at)
  where status <> 'cancelled';
create index notification_slot_instances_due
  on notification_slot_instances (status, send_at) where status = 'scheduled';

create table notification_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event', 'system')),
  instance_id uuid references notification_slot_instances(id) on delete cascade,
  event_id uuid references events(id),
  member_id uuid not null references members(id),
  title text not null,              -- derived: the event name and slot kind, or the system notice title
  body_text text not null,
  flier_id uuid references event_fliers(id),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (kind <> 'event' or (instance_id is not null and event_id is not null)),
  check (kind <> 'system' or (instance_id is null and event_id is null))
);
create unique index notification_messages_instance_member
  on notification_messages (instance_id, member_id) where instance_id is not null;
create index notification_messages_inbox
  on notification_messages (member_id, (read_at is not null), created_at desc, id desc);

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references notification_slot_instances(id) on delete cascade,
  member_id uuid not null references members(id),
  message_id uuid references notification_messages(id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  routed_via text not null default 'own' check (routed_via in ('own', 'guardian')),
  contact_id uuid references member_contacts(id) on delete set null,
  destination_masked text,
  anonymised_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason text check (skip_reason in
    ('channel_blocked', 'event_muted', 'period_muted', 'cadence_filtered', 'no_contact')),
  attempts int not null default 0,
  last_error_code text check (last_error_code in ('channel_unconfigured', 'transport_unavailable', 'provider_rejected')),
  provider_ref text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (instance_id, member_id, channel),
  check (routed_via <> 'own' or message_id is not null or anonymised_at is not null)
);
create index notification_deliveries_failed
  on notification_deliveries (created_at desc) where status = 'failed';

create table member_notification_settings (
  member_id uuid primary key references members(id),
  cadence text not null default 'all' check (cadence in ('all', 'essential', 'minimal')),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  updated_source text not null check (updated_source in ('ussd', 'admin'))
);

create table member_channel_blocks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  reason text,
  duration_days int not null check (duration_days in (30, 90, 365)),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  source text not null check (source in ('ussd', 'admin')),
  revoked_at timestamptz, revoked_by text
);
create unique index member_channel_blocks_live
  on member_channel_blocks (member_id, channel) where revoked_at is null;

create table notification_mutes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  scope_type text not null check (scope_type in ('event', 'period')),
  scope_id text not null,
  scope_name text not null,
  duration_days int not null check (duration_days in (30, 90, 365)),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  source text not null check (source in ('ussd', 'admin')),
  revoked_at timestamptz, revoked_by text
);
create unique index notification_mutes_live
  on notification_mutes (member_id, scope_type, scope_id) where revoked_at is null;

create table notification_preference_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id),   -- nulled on purge
  field text not null,
  from_value text, to_value text,
  source text not null check (source in ('ussd', 'admin')),
  actor text not null,
  at timestamptz not null default now()
);

create table notification_defaults (
  id text primary key default 'church' check (id = 'church'),
  slots jsonb not null,
  church_name text not null,
  email_signature text not null default '',
  email_reply_to text,
  sms_confirm_threshold int not null default 250 check (sms_confirm_threshold >= 0),
  whatsapp_templates jsonb not null default '{}'::jsonb,
  send_mode text not null default 'window' check (send_mode in ('always', 'window', 'daily')),
  send_from time not null default '08:00',
  send_to time not null default '20:00',
  send_hour time not null default '14:00',
  church_timezone text not null default 'Africa/Lagos',
  digest_hour time not null default '09:00',
  failure_digest_to text,
  failure_digest_enabled boolean not null default true,
  last_digest_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text not null
);
```

**Why the deliveries hang off the instance, not the message.** N-4's uncontactable member has no inbox row, so
`message_id` cannot be the key; `(instance_id, member_id, channel)` is the unit that is unique whichever route the
delivery took. `routed_via` names the **destination** (own contact or the guardian's), not the record: a delivery to a
member who does have an inbox row is `guardian`-routed and still carries its `message_id`. `message_id` is null only
when there is no message to point at — the uncontactable member, or a row a purge has anonymised and stamped with
`anonymised_at` — which is exactly what the check allows and nothing more.

Every new table carries the Drizzle mirror in `src/db/schema.ts` for the drift check; the SQL migration stays the owner.
The `pgboss` schema is the documented exception (N-8) and has its own drift check.

| Method   | Path                                                    | Result                                                                                                                            |
| -------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/v1/events/{eventId}/notification-plan`                | Plan, revisions, slots, templates, flier meta, counts                                                                             |
| `PUT`    | `/v1/events/{eventId}/notification-plan`                | Create or edit the draft revision; `If-Match` on the revision                                                                     |
| `POST`   | `/v1/events/{eventId}/notification-plan/preview`        | Four rendered bodies, per-channel counts, segments, exclusions                                                                    |
| `POST`   | `/v1/events/{eventId}/notification-plan/publish`        | Publish; `409 event_not_active`, `409 cadence_too_coarse`, `422 slot_in_past`, `422 duplicate_slot_time`, `422 template_required` |
| `POST`   | `/v1/events/{eventId}/notification-plan/cancel`         | Cancel the published revision; future instances stop                                                                              |
| `POST`   | `/v1/events/{eventId}/notification-plan/change`         | Publish a one-off `change` slot                                                                                                   |
| `GET`    | `/v1/events/{eventId}/notification-plan/deliveries`     | Delivery log, `?status=`, cursor-paged                                                                                            |
| `POST`   | `/v1/notification-deliveries/{id}/retry`                | One audited retry of a `failed` delivery                                                                                          |
| `PUT`    | `/v1/events/{eventId}/flier`                            | Binary upload (max 2 MB, multipart)                                                                                               |
| `DELETE` | `/v1/events/{eventId}/flier`                            | Remove the draft revision's flier                                                                                                 |
| `GET`    | `/v1/events/{eventId}/flier`                            | Flier meta (type, size, hash, URL)                                                                                                |
| `GET`    | `/fliers/{token}`                                       | Public immutable image; no bearer, outside `/v1`                                                                                  |
| `POST`   | `/v1/events/{eventId}/return-to-draft`                  | Release the lock; `409 plan_published` while a plan is published                                                                  |
| `GET`    | `/v1/members/{memberNo}/notifications`                  | Inbox, pending first then read, cursor-paged, `no-store`                                                                          |
| `POST`   | `/v1/members/{memberNo}/notifications/{id}/read`        | Mark read once                                                                                                                    |
| `POST`   | `/v1/members/{memberNo}/notifications/read-all`         | Mark every pending message read                                                                                                   |
| `GET`    | `/v1/members/{memberNo}/notification-settings`          | Cadence, live mutes, live blocks                                                                                                  |
| `PUT`    | `/v1/members/{memberNo}/notification-settings`          | Set the cadence; audited                                                                                                          |
| `POST`   | `/v1/members/{memberNo}/notification-mutes`             | Mute an event or a period for 30/90/365 days                                                                                      |
| `POST`   | `/v1/members/{memberNo}/notification-mutes/{id}/revoke` | Revoke a mute                                                                                                                     |
| `POST`   | `/v1/members/{memberNo}/channel-blocks`                 | Block a channel for 30/90/365 days; sends the notice                                                                              |
| `POST`   | `/v1/members/{memberNo}/channel-blocks/{id}/revoke`     | Revoke a block                                                                                                                    |
| `GET`    | `/v1/notification-messages`                             | Admin advanced search over the full history                                                                                       |
| `GET`    | `/v1/notification-defaults`                             | Church defaults, including the trigger cadence (read-only)                                                                        |
| `PUT`    | `/v1/notification-defaults`                             | Edit defaults                                                                                                                     |
| `GET`    | `/internal/notifications/tick`                          | The hosted worker entry; `CRON_SECRET`                                                                                            |

## Functional Requirements

- **FR-1 (separation).** An event's status and its notification plan MUST be separate. Activating an event MUST NOT
  send a message.
- **FR-2 (one plan).** An event MUST have at most one notification plan. Each revision MUST carry a `status`
  (`draft | published | superseded | cancelled`), its own slots and templates, and exactly one revision per plan MAY be
  `published` at a time.
- **FR-3 (slots).** A plan MUST have 1–12 slots of a kind in `announce | reminder | starts | last`, each with
  an allowed anchor, an offset in `[-10080, 10080]` and an order. No two slots of one plan MAY resolve to the same
  instant for the same occurrence.
- **FR-4 (resolution).** A slot MUST resolve in `events.timezone` and be stored as `timestamptz`. A slot resolved into
  the past at publish MUST be refused `422 slot_in_past`, except `announce` at offset 0 and a change notice, which is published at "now" by construction.
- **FR-5 (instances).** A published plan MUST materialise one instance per slot and occurrence (or per slot for
  event-anchored slots), capped to a 90-day horizon. A cancelled occurrence MUST NOT produce an instance.
- **FR-6 (recipients).** Recipients MUST be the members the event's audience intersection covers at the instance's
  date, deduplicated, excluding purged and archived members and members who had not joined. A `tracksMembers = false`
  event MUST use the visibility predicate, not a roster. A first-time visitor MUST NOT receive an inbox message.
- **FR-7 (inbox).** Every eligible recipient who owns at least one contact MUST receive exactly one inbox message per
  instance, written before any delivery, regardless of blocks, mutes or cadence. A member who owns no contact at all is
  reachable only through a guardian and MUST NOT receive an inbox row (N-4).
- **FR-8 (deliveries).** A delivery row MUST exist for every inbox message and every channel, with status
  `pending | sending | sent | failed | skipped`; every `skipped` row MUST carry a `skipReason` from the closed set.
- **FR-9 (precedence).** The skip reason MUST be the first applicable of `channel_blocked`, `event_muted`,
  `period_muted`, `cadence_filtered`, `no_contact`, evaluated at delivery time. A skipped delivery MUST NOT be
  retried.
- **FR-10 (cadence).** `all` MUST deliver every instance; `essential` MUST deliver `announce`, `change`, `starts` and
  `last` and skip every `reminder`; `minimal` MUST deliver only the occurrence's `starts` and `last`. All three are
  per occurrence, and the inbox MUST receive every instance.
- **FR-11 (channel resolution).** Email MUST resolve to an owned email contact, WhatsApp to an owned WhatsApp contact
  and SMS to an owned phone contact, falling back to the resolved guardian chain. A verified contact MUST be
  preferred, then the lowest display order. The delivery MUST record the contact id and a masked destination.
- **FR-12 (templates).** A published revision MUST carry one template per channel with recipients and MUST always
  carry the `ussd` template; a missing one MUST be `422 template_required`.
- **FR-13 (renderer).** The server MUST render email as HTML plus a plain-text alternative **with the flier
  attached**, WhatsApp as an approved template whose **header is the flier image itself** (no URL in the body),
  SMS as plain text with an encoding and segment count, and USSD as a plain screen sequence within the screen
  budget.
- **FR-14 (variables).** The variable set MUST be closed and server-substituted; an unknown variable MUST be `422`; a
  null value MUST render empty; each channel MUST escape for its own syntax.
- **FR-15 (no client HTML).** The browser MUST send structured JSON or plain text, never HTML; the server MUST
  validate and render.
- **FR-16 (preview).** A preview MUST return the four rendered bodies, the per-channel recipient count, the SMS
  segment count, the excluded counts **by reason**, and a named sample **only of the `no_contact` exclusions** - FR-44
  forbids naming the members who muted or blocked - and MUST write nothing and call no provider.
- **FR-17 (publish).** Publishing MUST require an active event and a valid plan, MUST pin the draft's content token so
  a stale preview cannot be published, and MUST be idempotent per revision.
- **FR-18 (cancel).** Cancelling MUST cancel future instances; created inbox messages and sent deliveries MUST remain.
- **FR-19 (change notice).** An officer MUST be able to publish a one-off `change` notice to an already-published
  plan's audience without editing the slots.
- **FR-20 (queue).** The queued work MUST run on pg-boss with the backend selected by the driver (PGlite or
  Postgres), MUST be idempotent per unit under a retried job, and MUST be driven by a long-lived worker locally and a
  bounded authenticated entry on the hosted path.
- **FR-21 (retry).** `transport_unavailable` MUST back off through pg-boss for at most 5 attempts, then dead-letter;
  provider_rejected and channel_unconfigured MUST be terminal on the first attempt; a stored error MUST be one of
  those closed codes, never the provider body.
- **FR-22 (flier).** A plan revision MUST carry at most one flier of the three accepted types at most 2 MB, held in
  the configured `FlierStore` and served at an unguessable immutable public URL outside `/v1`. Email MUST attach it
  and WhatsApp MUST **display it as the template header**, never as a link; SMS and USSD MUST NOT carry an image.
- **FR-23 (inbox read).** The inbox read MUST be member-scoped, cursor-paged, `no-store`, return **pending items
  first and then read** within each group by `created_at desc, id desc`, and carry the event summary, the rendered
  body, the read state and the pending count. The cursor MUST be `(readAtIsNull, createdAt, id)` and an index MUST
  serve that order. Marking read MUST be idempotent, for one message and for all.
- **FR-24 (pending).** A member MUST be able to move a pending message to read without opening it, so the pending
  list stays the focus. Nothing MUST be deleted by a member; a read message stays in the inbox history and in an
  administrator's search.
- **FR-25 (USSD).** An identified member's menu MUST carry Notifications immediately before My Profile; it MUST list
  the latest five with `0 More`, open an item as a screen sequence, and offer the settings screen. The glossary MUST
  carry the notification keys.
- **FR-26 (settings).** A member MUST be able to set the cadence and mute an event or a period. Every mute MUST state a
  duration of 30, 90 or 365 days.
- **FR-27 (mute scope).** A mute MUST be `event` or `period`, with a text scope id and a name snapshot, and MUST NOT
  suppress the inbox message.
- **FR-28 (channel block).** A channel block MUST be settable by the member in USSD **or** by an officer, MUST carry
  a duration of 30, 90 or 365 days, MUST send a confirmation notice on creation from either path, and MUST NOT
  suppress the inbox message or a verification code.
- **FR-29 (expiry).** A mute or block MUST stop applying at its `expires_at` without an officer's action, and MUST be
  evaluated at delivery time.
- **FR-30 (verification exempt).** Verification and OTP messages MUST bypass settings, blocks and mutes.
- **FR-31 (defaults).** The church defaults (slot template, church name, signature, reply-to, SMS threshold, digest
  recipient and switch, WhatsApp template names) MUST be editable on the Admin page and copied into a new plan.
- **FR-32 (delivery log).** The **Notifications page** MUST show per-instance counts and a grid of deliveries with
  channel, status and search filters, and MUST offer one audited retry per failed delivery through `POST
/v1/notification-deliveries/{id}/retry`. The event-scoped plan page shows that plan's own counts and failures.
- **FR-33 (digest).** The queue MUST email a compiled failed-send digest to the configured officer address, daily,
  only when failures exist; the **Notifications page MUST offer the same digest on demand**, composed by the same
  code, refused when no address is configured, and audited with the actor.
- **FR-34 (advanced search).** An administrator MUST be able to search every inbox message by member, event, date
  range, read state and text, from the **Notifications page**.
- **FR-35 (privacy).** Destinations MUST be masked in every response, log and error; the flier URL MUST be
  unguessable; the hosted worker entry MUST use `CRON_SECRET`, not the API bearer.
- **FR-36 (purge).** A member purge MUST erase settings, mutes, blocks and inbox messages, clear delivery destinations,
  and null the member id on preference events.
- **FR-37 (audit).** Publishing, cancelling, a change notice, preference writes, mute and block writes, retries and
  removals MUST record the actor and time.
- **FR-38 (no per-officer authorization).** Any authenticated officer MAY author, publish and block; the UI MUST NOT
  imply a permission model V2 does not have.
- **FR-39 (edit lock).** An `active` event MUST be locked from edit: a write to its record, schedule, audience or
  venue MUST answer `409 event_locked`. Activating MUST be the transition that locks it, and publishing or sending a
  notification MUST NOT change the lock either way. The event MUST remain notification-ready and member-visible while
  locked, MUST still be archivable, and MUST still allow a single occurrence to be cancelled. `POST
/v1/events/{id}/return-to-draft` MUST release the lock, MUST refuse `409 plan_published` while the plan is published,
  and MUST be audited.

- **FR-40 (send-time policy).** The church defaults MUST carry a `send_mode` of `always`, `window` or `daily`, the
  window's `send_from`/`send_to`, `send_hour`, and `church_timezone`. Each job's `startAfter` MUST be the resolved
  instant adjusted by the mode in that zone: `window` defers every kind except `starts` and `change` to the next
  opening, and `daily` defers every kind to `send_hour`.
- **FR-41 (policy visibility).** The Admin page MUST offer the three modes with their precision and cost, MUST show
  the deployed trigger cadence read-only, MUST warn when a mode cannot realise its saving until the trigger changes,
  and the plan detail MUST show the resolved send instant per instance.
- **FR-42 (cadence floor).** Publishing a plan that contains a `starts` slot MUST be refused `409
cadence_too_coarse` when the deployed trigger cadence is coarser than 15 minutes. The local stack MUST poll
  continuously; the hosted trigger MUST be a 15-minute cron.
- **FR-43 (dashboard scope).** The pg-boss dashboard MUST run only in the local Compose stack, MUST sit behind basic
  auth, MUST NOT be deployed to production, and MUST NOT be linked from the officer UI; an operational requeue MUST use
  the audited API retry.

- **FR-44 (aggregate only).** The **event** surface MUST show mute and block **counts**, never a list of the members who
  set them. The named list MUST exist on the member record, one member at a time, and - as one exception - on the
  **Notifications page**, which lists live mutes and channel blocks with name, member number, scope or channel, end date
  and how it was set, because lifting one early means finding the person who asked (owner, 2026-11-27). That page's list
  MUST NOT be reachable from an event, and no other surface may name who declined.
- **FR-50 (lifting a mute or block).** Lifting a live mute or block before its end date MUST require the member's
  authorisation, and the request MUST record **how** it was given - in person, by phone, or by USSD code - with the
  actor, the reference and the time, in `notification_preference_events`. The row is revoked, never deleted, and the
  member's next matching instance reaches them again. An unconfigured channel is unaffected: this lifts a preference,
  it does not wire a provider.
- **FR-45 (retry route).** `POST /v1/notification-deliveries/{id}/retry` MUST accept only a `failed` delivery, MUST
  re-enqueue it through the audited path, and MUST record the actor.
- **FR-46 (acknowledgement).** When a **`starts` or `change`** slot's resolved send instant differs from its anchor
  instant — `daily` mode, or a `window` deferral of a time-critical slot — publishing MUST record a typed
  acknowledgement on the revision (`acknowledgement`) and MUST refuse the publish without it. A routine `announce` or
  `reminder` deferral needs none: the officer chose the window.
- **FR-47 (guardian-routed delivery).** A delivery to a member who cannot authenticate MUST exist as a delivery with
  `routed_via = 'guardian'` and a null `message_id`, keyed by `(instance_id, member_id, channel)`. The schema MUST
  allow it and MUST reject a null `message_id` on an `own`-routed delivery.
- **FR-48 (gates declared).** The migration, the wire contract, the public `/fliers/{token}` surface and the queue
  library's own schema MUST each be declared as a hard gate under AGENTS.md §17; publishing approval MUST NOT be
  read as pre-authorising them.
- **FR-49 (Notifications page).** Notifications MUST have a **standalone page under the Events section**, not a panel
  on the event detail. Its top row MUST carry the overall counts across all channels over the chosen range - **sent**,
  **delivered**, **queued**, **failures** - and a right-hand rail MUST show, per channel (`email`, `sms`, `whatsapp`) in
  an accordion, **sent**, **delivered**, **skipped**, **failed** and **queued**. `sent` is what a provider accepted and
  `delivered` what it confirmed, so failures are `sent - delivered`. A skipped delivery MUST NOT be counted as a
  failure: a mute is a member's choice, not an outage. The deliveries grid MUST name the **member** - name and member
  number - beside the event, channel, status and **masked** destination, because a masked destination says what number
  failed but not who to ask. Below it the page MUST list live **mutes and channel blocks** (FR-44's exception) and offer
  to lift one under FR-50. The page MUST offer the failure digest on demand. The event
  detail carries a **summary card only**: plan status, the next send, and a link to the plan. Plan authoring, preview,
  publish, cancel and the change notice live at `#/events/:id/notifications`.

## Acceptance Criteria

### AC-1: **Given** an active event with no plan, **When** the detail loads, **Then** it reads "Not announced", and activating, editing or viewing sends nothing and creates no delivery. (FR-1, FR-2)

### AC-2: **Given** a published plan with an `announce`, a `starts` and a `last`, **When** each instance falls due, **Then** one inbox message per recipient per instance exists before any provider call, and deliveries exist only for permitted channels. (FR-5, FR-7, FR-8)

### AC-3: **Given** a member with a live SMS block and a live event mute, **When** an instance falls due, **Then** the inbox message exists, SMS is `skipped/channel_blocked`, every other channel is `skipped/event_muted`, no provider is called, and the precedence is FR-9's. (FR-9, FR-26)

### AC-4: **Given** a weekly plan and a member on `minimal`, **When** five occurrences fire, **Then** each occurrence's `starts` and `last` are delivered, `announce` and every `reminder` are `skipped/cadence_filtered`, and every inbox message exists. (FR-10)

### AC-5: **Given** a plan with a daily `reminder` run-up and a member on `essential`, **When** the run-up fires, **Then** the reminder is `skipped/cadence_filtered`, the `announce`, `starts`, `last` and any `change` are delivered, and the inbox holds every instance. (FR-10)

### AC-6: **Given** a member who muted Communion Week for 30 days, **When** an event carrying that `period_id` fires inside the window, **Then** its deliveries are `period_muted`; **When** the 30th day passes without action, **Then** the deliveries resume because the mute has expired. (FR-27, FR-29)

### AC-7: **Given** a member with a verified email and an unverified phone, **When** a message is delivered, **Then** email uses the verified contact, SMS uses the phone, both are masked, and no raw value appears in a response or log. (FR-11, FR-35)

### AC-8: **Given** a member with no contact for a channel and no guardian, **When** the delivery is created, **Then** it is `skipped/no_contact`; **Given** a guardian chain to a reachable adult, **Then** the delivery uses that contact and names the member. (FR-11, N-4)

### AC-9: **Given** a member reachable only through a guardian, **When** an instance fires, **Then** the guardian's channel receives the message, **no** inbox row exists for the member, and the guardian's own audience membership is unaffected. (FR-7, N-4)

### AC-10: **Given** two slots resolving to the same instant for one occurrence, **When** publish is attempted, **Then** `422 duplicate_slot_time` names both and no instance is created. (FR-3)

### AC-11: **Given** a slot whose time has passed, **When** publish is attempted, **Then** `422 slot_in_past` names it and the plan stays draft. (FR-4)

### AC-12: **Given** a published revision, **When** publish is called again, **Then** the same instances are returned and nothing is duplicated. (FR-17)

### AC-13: **Given** an officer publishes a `change` notice on a published plan, **When** it sends, **Then** the plan's audience receives it once, the slots and their future instances are untouched, and the notice is recorded as its own `notification_change_notices` row, not as a slot. (FR-19)

### AC-14: **Given** a worker job that is retried after completing, **When** it runs again, **Then** no second inbox message and no second delivery is created, because the singleton key and the unique indexes hold. (FR-20)

### AC-15: **Given** a provider 503, **When** the delivery is attempted, **Then** pg-boss retries with backoff and the delivery dead-letters after five attempts; **Given** a 4xx naming the destination, **Then** it fails immediately; **Given** any failure, **Then** the stored error is a sanitised code. (FR-21)

### AC-16: **Given** one authored body per channel, **When** the preview renders, **Then** email is HTML plus text with the flier attached, WhatsApp is the approved template whose header **shows the flier image** with ordered body parameters and no URL, SMS carries 160/153 or 70/67 segmentation, USSD is a screen sequence within budget, and a variable with no value renders empty. (FR-13, FR-14)

### AC-17: **Given** a template with an unknown variable or a client HTML body, **When** it is saved, **Then** the API answers `422` and stores nothing. (FR-14, FR-15)

### AC-18: **Given** a flier over 2 MB or of an unaccepted type, **When** it is uploaded, **Then** it is refused and nothing is stored; **Given** an accepted flier, **Then** it is held in the configured store, its URL is unguessable and immutable, the email carries it as an attachment and the USSD body carries no image. (FR-22)

### AC-19: **Given** the same upload with `s3` configured and with `db` configured, **When** the flier is fetched, **Then** both paths serve the same bytes and the same headers. (FR-22)

### AC-20: **Given** an identified member in USSD, **When** they open Notifications, **Then** the menu entry sits before My Profile, the latest five are listed with `0 More`, opening one paginates and marks it read, and the settings screen changes the cadence that the next send honours. (FR-23, FR-25, FR-26)

### AC-21: **Given** a member has three pending messages, **When** they mark two read without opening them, **Then** those two move to Earlier, one stays pending, nothing is deleted, and the pending count reads one. (FR-23, FR-24)

### AC-22: **Given** a member blocks SMS for 90 days in USSD, or an officer blocks it at their request, **When** the block is saved, **Then** a confirmation notice is sent on the best unblocked channel and in the inbox naming the channel and the end date, the audit records the source (`ussd` or `admin`), and the next SMS delivery is `channel_blocked`. (FR-28)

### AC-23: **Given** a member with every channel blocked and every event muted, **When** the register issues a verification code, **Then** the code is still sent and the block notification is not confused with it. (FR-30)

### AC-24: **Given** a settings, mute or block write from USSD or the back office, **When** it commits, **Then** a preference-event row records the field, both values, the source and the actor, and nothing is hard-deleted. (FR-26, FR-37)

### AC-25: **Given** a plan with failed deliveries, **When** the digest window closes, **Then** one email lists each failure with its masked destination and sanitised code to the configured officer, and a day with no failure sends nothing. (FR-33)

### AC-26: **Given** an `active` event, **When** a schedule write is attempted, **Then** it answers `409 event_locked` and no occurrence is replaced, so no instance can be orphaned; **Given** the event is returned to draft after its plan is cancelled, **Then** the write succeeds and the cancelled instances remain as history. (FR-5, FR-39)

### AC-27: **Given** a member purge, **When** it completes, **Then** settings, mutes, blocks and inbox rows are gone, delivery rows carry no destination, and preference events survive with a null member id. (FR-36)

### AC-28: **Given** the hosted worker entry, **When** it is called without `CRON_SECRET`, **Then** it answers `401` and claims nothing. (FR-35)

### AC-29: **Given** a published plan, **When** an officer edits a template, **Then** a new revision is written with its own slots, instances already created keep theirs, and no sent message changes. (FR-2, N-3)

### AC-30: **Given** an anonymous USSD caller, **When** the main menu renders, **Then** it carries no Notifications entry. (FR-25)

### AC-31: **Given** the USSD glossary, **When** the completeness and budget property test renders every reachable state, **Then** every notification key resolves and every screen fits its budget. (FR-25)

### AC-32: **Given** an `active` event, **When** an officer attempts to edit its record, its schedule, its audience or its venue, **Then** the write answers `409 event_locked` and nothing changes; **When** the event is a draft, **Then** the same write succeeds; **When** the event is active and a notification is sent, **Then** it stays active, locked and visible to members; **When** `return-to-draft` is called on an active event with a published plan, **Then** it answers `409 plan_published` and stays locked; **When** the plan is cancelled and `return-to-draft` is called, **Then** the event becomes editable and reactivation republishes it. (FR-39)

### AC-33: **Given** `send_mode = window` with 08:00–20:00 in Africa/Lagos, **When** an `announce` resolves to 02:00, **Then** its job is enqueued for 08:00; **When** a `starts` resolves to 06:00, **Then** it is enqueued for 06:00 because `starts` bypasses the window. (FR-40)

### AC-34: **Given** `send_mode = daily` at 14:00, **When** a `starts` and a `change` resolve to 06:00 and 09:00, **Then** both are enqueued for 14:00, and the preview and plan detail say the start alert will not arrive at the service time. (FR-40)

### AC-35: **Given** a mode chosen on the Admin page while the deployed trigger is continuous, **When** the page loads, **Then** the deployed cadence is shown read-only and the saving is stated as unavailable until the trigger changes. (FR-41)

### AC-36: **Given** a deployed trigger coarser than 15 minutes, **When** an officer publishes a plan containing a `starts` slot, **Then** the API answers `409 cadence_too_coarse` and nothing is scheduled; **Given** a 15-minute trigger, **Then** the same publish succeeds. (FR-42)

### AC-37: **Given** the local Compose stack, **When** the worker starts, **Then** it polls continuously regardless of the hosted cadence; **Given** production, **Then** the trigger is a 15-minute cron. (FR-42)

### AC-38: **Given** a production deployment, **When** it is inspected, **Then** the pg-boss dashboard is not served and no officer page links to it; **Given** a failed delivery requeued operationally, **Then** it went through the audited API retry and the plan counts moved. (FR-43)

### AC-39: **Given** a published plan, **When** it is cancelled, **Then** future instances stop, existing inbox messages stay readable, sent deliveries keep their rows, and no new delivery is created. (FR-18)

### AC-40: **Given** the church defaults with a standard slot template, **When** an officer creates a plan, **Then** the slots are copied from the defaults and can be edited, and the defaults row is unchanged. (FR-31)

### AC-41: **Given** an administrator searches messages by member, event, date range, read state and text, **Then** the response is cursor-paged, `no-store` and includes read and pending messages alike. (FR-34)

### AC-42: **Given** a publish, a cancel, a `change` notice and a retry, **When** each commits, **Then** the actor and time are recorded for each, and the audit names which one it was. (FR-37)

### AC-43: **Given** a channel with recipients and no template, **When** publish is attempted, **Then** the API answers `422 template_required` and creates no instance; **Given** an `ussd` template is missing, **Then** the same refusal stands even when no other channel has recipients. (FR-12)

### AC-44: **Given** a member reachable only through a guardian, **When** the instance fans out, **Then** a delivery row exists with a null `message_id`, `routed_via = 'guardian'` and a non-null `instance_id`, no inbox row exists for that member, and an `own`-routed delivery with a null `message_id` is rejected by the check. (FR-47)

### AC-45: **Given** `daily` mode, **or** a `window` that defers a `starts` or `change` slot, **When** the publish carries no acknowledgement, **Then** it is refused `422 acknowledgement_required`; **When** it carries one naming the resolved instant, **Then** it is stored on the revision and returned by the plan read; **Given** a `window` that defers only an `announce` or `reminder`, **Then** no acknowledgement is required. (FR-46)

### AC-46: **Given** twelve members muted an event and four blocked SMS, **When** the event detail renders, **Then** it shows those counts and no member names. (FR-44)

### AC-47: **Given** a `failed` delivery, **When** the audited retry route is called, **Then** it is re-enqueued once, the actor is recorded, and a `sent` delivery is refused. (FR-45)

### AC-48: **Given** a member with both pending and read messages, **When** the first inbox page is read, **Then** every pending item precedes every read item, the page carries `pendingCount`, and the cursor resumes at the right group boundary. (FR-23)

### AC-49: **Given** the Notifications page, **When** it loads over the default seven days, **Then** the top row shows sent, delivered, queued and failures across all channels, the right rail shows each channel's sent, delivered, skipped, failed and queued, and every channel's five counts sum to that channel's deliveries in the range while skipped is not counted as a failure. (FR-49)

### AC-53: **Given** the deliveries grid, **When** it lists a row, **Then** it names the member and their number beside the event, channel, status and a masked destination, so a failed row can be traced to the person without exposing a contact value. (FR-49)

### AC-54: **Given** a live mute or channel block, **When** the Notifications page lists it, **Then** it shows the member, the kind, the scope or channel, the end date and how it was set; **When** an officer lifts it, **Then** the dialog records how the member authorised it and the actor, the row is revoked rather than deleted, and the audit entry names both. (FR-44, FR-50)

### AC-50: **Given** the deliveries grid, **When** the officer picks a channel tab and types an event name, **Then** only that channel's matching rows are listed, and a failed row offers the audited retry. (FR-32, FR-49)

### AC-51: **Given** failures exist and a digest recipient is configured, **When** the officer sends the failure report on demand, **Then** the same digest the daily job would send is emailed once, the actor is recorded, and a second click while it is in flight does not send twice; **Given** no recipient is configured, **Then** the action is refused with its reason and nothing is sent. (FR-33)

### AC-52: **Given** an active event with a published plan, **When** its detail loads, **Then** it carries a summary card - status, revision, next send, a link to the plan - and no authoring controls, because authoring lives on the event's notifications page. (FR-49)

## Edge Cases

- **EC-1.** An event is archived after its plan is published: future instances are cancelled, inbox messages remain
  readable, and no new delivery is created.
- **EC-2.** An occurrence is cancelled after its `starts` instance was created: the future instance is cancelled and
  the inbox message is not deleted; the officer sends a `change` notice instead.
- **EC-3.** A plan is published with zero recipients: it succeeds, the counts are zero, and the detail says "No member
  matches the audience at these dates". No empty inbox rows are written.
- **EC-4.** A member's contact is removed between message creation and delivery: the delivery becomes
  `skipped/no_contact`; if already `sent`, the row keeps its masked snapshot.
- **EC-5.** A provider is unconfigured for a channel: its deliveries are `failed/channel_unconfigured` on the first
  attempt, never retried, and the plan detail names the channel.
- **EC-6.** The digest address is unset: no digest is sent, and the failed rows stay in the log.
- **EC-7.** A template's WhatsApp approved name is missing or rejected: preview and publish refuse the WhatsApp
  channel while the others remain publishable.
- **EC-8.** An event's timezone changes after publish: created instances keep their instant; future resolution uses
  the new zone.
- **EC-9.** A member mutes a period and the event later loses its `period_id`: the mute row keeps its snapshot name and
  no longer matches, and the inbox is unaffected.
- **EC-10.** A member's mute is revoked early: the next instance delivers normally and the audit records the revoke.
- **EC-11.** A guardian has two dependants in the same event: the guardian contact receives one **delivery** per
  dependant, and neither dependant gets an inbox row (N-4). The guardian's own messages, if they are in the audience,
  are separate again.
- **EC-12.** The USSD body exceeds one screen: it paginates with the fixed `0 More` key, never a silent truncation and
  never a new navigation key, because the glossary property test asserts the fixed set.
- **EC-13.** An SMS body contains one emoji: the counter switches to UCS-2 (70/67) and the segment count doubles
  before publish.
- **EC-14.** A member purges while a send job is running: the purge removes their inbox row; an in-flight delivery is
  allowed to finish and its row is anonymised.
- **EC-15.** The flier is replaced on a published revision: the sent message's URL still resolves to the old object;
  the new revision carries a new token.
- **EC-16.** The mode changes after a plan is published: already-enqueued jobs keep their instant, later instances
  use the new mode, and the plan detail shows which instant each instance holds.
- **EC-17.** A `window` opening falls in a DST-shifted zone: the wall-clock hour is preserved in `church_timezone`, and
  the stored instant moves with the offset.
- **EC-18.** An officer tries `Return to draft` on an announced event: `409 plan_published` names the plan, and the
  officer cancels it first, accepting that the cancellation stops future sends.
- **EC-19.** The S3 store is unreachable when an email attachment is rendered: the delivery is
  `failed/transport_unavailable` and retried with backoff, rather than sent with a broken image.

## Testing Decisions

- **What makes a good test here.** Assert external behaviour: the API response, the persisted rows, the rendered
  string, the computed count, the provider call that did or did not happen. The fake providers count calls and capture
  `{ to, subject, html, text, mediaUrl, template, attachments }`, so "no SMS was sent" is a fact.
- **Domain, `tests/domain/notification-slots.test.ts` and `tests/unit/notification-renderer.test.ts`.** Anchors,
  offsets, `events.timezone` resolution, past-slot refusal, duplicate resolution, the `change` kind, the 90-day
  horizon; variable substitution and escaping, SMS encoding and segments, USSD screen pagination, attachments.
- **API plans, `tests/api/notification-plans.test.ts`.** Create, edit, `If-Match`, slot validation, preview, publish,
  idempotent republish, cancel, the change notice, revision pinning.
- **API queue, `tests/api/notification-queue.test.ts`.** Seed a due instance, run the worker handler on PGlite, and
  assert inbox rows, the skip precedence, provider calls, the singleton-key idempotency, the dead letter after five
  attempts, and the schedule rewrite's cancellation.
- **API preferences, `tests/api/notification-preferences.test.ts`.** Cadence, expiring mutes, officer-set blocks with
  the confirmation notice, the audit rows, and expiry at delivery time (freeze the clock).
- **API inbox, `tests/api/notification-inbox.test.ts`.** `no-store`, pending-before-read ordering, the pending
  count, read-once, read-all, and the administrative search over the full history.
- **API flier, `tests/api/notification-flier.test.ts`.** 2 MB cap, magic bytes, the public route outside `/v1`, and
  the same bytes through the `s3` (MinIO or a fake) and `db` adapters.
- **Digest, `tests/api/notification-digest.test.ts`.** One email per failure window, none on a quiet day.
- **USSD, `tests/api/ussd-notifications.test.ts`.** The entry before My Profile, its absence for an anonymous caller,
  the latest five with `0 More`, the duration prompt, the settings toggles, and the audit source `ussd`.
- **DB, `tests/db/event-notifications-migration.test.ts` and `tests/db/schema-drift.test.ts`.** The migration on
  PGlite, the unique indexes, the check constraints, the defaults row, the Drizzle mirror, and `pg-boss doctor` for
  the vendored schema.
- **UI, `ui/src/pages/NotificationPlanPage.dom.test.tsx`, `ui/src/components/RichTextEditor.dom.test.tsx` and
  `ui/src/pages/MemberNotificationsTab.dom.test.tsx`.** The channel tabs, the TipTap toolbar's structured output, the
  variable palette, the live preview, the publish confirmation, the change form, the digest settings, the block
  dialog with its duration, and the absence of client HTML in the request.
- **End to end, `ui/e2e/notifications.spec.ts`.** One publish-to-inbox path with the fake provider and one axe pass
  over the plan page and the member settings.
- The queue test is the one that must fail before the feature and pass after; a suite that runs zero tests is a
  failure (AGENTS §8).

## Out of Scope

- **A native mobile app or public member web portal.** The inbox API is designed for it; the client is not built.
- **Push notifications** (APNs/FCM/Web Push).
- **Two-way replies, inbound WhatsApp/SMS, delivery receipts and provider webhooks.** A provider 2xx is the delivery
  fact.
- **A reusable template library, A/B testing, send-time optimisation and per-member personalisation beyond the closed
  variable set.**
- **A separate approver or per-officer permission for publishing.**
- **Image resizing, cropping, CDN transforms or signed upload URLs.** The flier is stored and served as uploaded.
- **A permanent mute and a global "all notifications off" switch.** Mutes and blocks always expire.
- **Unifying the pledge `reminders` table or birthday wishes with this pipeline.**
- **A public, signed email-preferences page.**
- **WhatsApp template submission and approval automation.**
- **Member-to-member or ministry-leader messaging.**

## Sibling specs this round must amend

This spec changes behaviour that other specs already define. They are named here so the build round amends them in the
same change, rather than leaving two texts that disagree (AGENTS.md §1).

- **`member-registrations-event-periods.md`** — its schedule guard is status-blind and answers `409 recurrence_locked`;
  FR-39 now locks the schedule of an `active` event and answers `409 event_locked`. The later text must name the
  notifications lock, or the guard must be retired in its favour.
- **`member-registrations-ui.md`** — FR-42e and AC-62 give the activity detail its write verbs; they gain
  **Activate**, **Return to draft** and the Notifications panel, and the 2026-11-23 "archived is terminal" ruling is
  untouched by this round.
- **`member-registrations-api.md`** — the route list gains the plan, preferences, inbox, flier, search and retry
  routes, and `/fliers/{token}` sits outside `/v1` with `/ussd/*`.
- **`member-registrations-ussd.md`** — the identified menu gains Notifications before My Profile, and the display
  glossary gains the `menu.notifications` and `notifications.*` keys that its completeness test requires, and its
  `pageSize` map gains the inbox list (5 at 182, 3 at Nalo's 120).
- **`member-registrations-event-audience.md`** — A-6 names the refusal for an archived audience on `PATCH`; the locked
  event now refuses that write earlier, with `409 event_locked`.

## Gates

Under AGENTS.md §17 these are **hard gates**: they park for the owner unless the owner names _that round_ and the gate.
Approving this spec is not that authorisation, and this section says so plainly rather than leaving it implied.

- **A migration** — `0030_event_notifications` and `0031_pgboss_schema`.
- **A wire contract** — the plan, preference, inbox, flier, search and retry routes, and the two event transitions.
- **A new unauthenticated surface** — `GET /fliers/{token}`, outside `/v1`.
- **Security-adjacent** — the queue library installing its own schema under the one-tracked-runner rule (§12), handled
  by the vendored DDL in N-8 but still a gate.

## Decided

The owner's answers to the first frontier, 2026-11-25. Each is written into the text above.

| #   | Decision                                                                                                                                                                    | Where        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | Publication is a separate plan; activation never sends                                                                                                                      | N-1          |
| 2   | One plan per event; a second announcement is a revision                                                                                                                     | N-1, N-3     |
| 3   | Not opt-in. Members opt out for a stated duration — 30 days, 90 days or a year — and the inbox is still written                                                             | N-6, N-10    |
| 4   | A plan may be dense (daily run-up, every 3 days); the member opts out of that frequency with `essential`                                                                    | N-6          |
| 5   | Period mutes use a text scope id; the mute covers the definition for its duration                                                                                           | N-10         |
| 6   | A channel block may be set by the member in USSD or by an officer, is confirmed by a notice, and expires after 30/90/365 days                                               | N-10         |
| 7   | Reachability, not age, picks the destination; a member who cannot authenticate has no inbox row                                                                             | N-4          |
| 8   | A **change notice** ships in v1 for cancellation and venue changes; it is its own record, not a slot kind                                                                   | N-2, N-14    |
| 9   | Instances key on `occurrence_id`; slots are revision-keyed; a schedule rewrite reconciles them                                                                              | N-3, N-14    |
| 10  | Email, SMS and WhatsApp all ship; WhatsApp is an approved template plus values                                                                                              | N-7          |
| 11  | Fliers are attached images in a swappable S3 store (MinIO locally, R2 hosted), served outside `/v1`, attached in email and **shown as the WhatsApp template header**        | N-7, N-9     |
| 12  | Only aggregate mute counts on the event; the named list stays on the member record                                                                                          | N-12         |
| 13  | Purge deletes settings, mutes, blocks and inbox rows and nulls the member id on preference events                                                                           | N-10         |
| 14  | pg-boss, local-first, with the backend following the driver so the vendor stays swappable                                                                                   | N-8          |
| 15  | A member moves a notification from pending to read (LinkedIn-style); nothing is deleted, and advanced search covers every message                                           | N-10, N-12   |
| 16  | A compiled failed-send digest is emailed to an officer address held in settings                                                                                             | N-13         |
| 17  | Notifications sits immediately before My Profile in the USSD menu                                                                                                           | N-11         |
| 18  | Cadence has three values — `all`, `essential`, `minimal` — evaluated per occurrence                                                                                         | N-6          |
| 19  | A period mute covers every event whose `period_id` is that period, now and later, for the stated duration                                                                   | N-10         |
| 20  | A mute expires silently; the end date is shown wherever the mute is listed                                                                                                  | N-10         |
| 21  | pg-boss's DDL is vendored as a tracked migration, run with `migrate: false`, with `pg-boss doctor` as the drift check                                                       | N-8          |
| 22  | `s3` (MinIO) in Compose by default, `db` when `FLIER_STORE` is unset                                                                                                        | N-9          |
| 23  | One failed-send digest a day at a fixed hour, only on a day with a failure, to one address in settings                                                                      | N-13         |
| 24  | Pending/read replaces removal; `read-all` clears the pending list                                                                                                           | N-10         |
| 25  | The edit lock anchors to the event's own publication (`active`), not the plan: activation takes it out of edit and makes it notification-ready and member-visible           | N-1, FR-39   |
| 26  | The lock covers the record, schedule, audience and venue; plan authoring and single-occurrence cancellation stay available                                                  | N-1          |
| 27  | `Return to draft` releases the lock; it refuses while a plan is published, because an active event may have no plan at all                                                  | N-1, FR-39   |
| 28  | Archiving and cancelling stay available; a locked banner names the publish time and revision                                                                                | N-12         |
| 29  | The release is audited, records the actor, and leaves the cancelled instances as history                                                                                    | FR-37, FR-39 |
| 30  | The officer toggles among three send-time modes — `always`, `window` (08:00-20:00), `daily` (14:00) — choosing precision against the hosting budget                         | N-8, FR-40   |
| 31  | `starts` and `change` bypass a `window`; `daily` batches every kind; hours are wall-clock in `church_timezone`, with multi-zone tenancy deferred to V2                      | N-8, FR-40   |
| 32  | The hosted trigger is a 15-minute cron (~$1/month of database against ~$19 at one minute); the local worker polls continuously because Compose Postgres has no hourly meter | N-8, FR-42   |
| 33  | The cadence is deploy-time and shown read-only; the mode governs delivery times at once, the bill on the next deploy                                                        | N-8, FR-41   |
| 34  | A `starts` slot is refused `409 cadence_too_coarse` when the deployed cadence is coarser than 15 minutes                                                                    | FR-42        |
| 35  | `daily` with a `starts` slot is allowed behind a typed acknowledgement naming the resolved instant, **recorded on the revision**                                            | FR-46, N-14  |
| 36  | The pg-boss dashboard is local Compose only, behind basic auth, never in production; requeues go through the audited API                                                    | FR-43        |
| 37  | The local stack does not mirror the hosted cadence; lateness is tested with a frozen clock                                                                                  | AC-37        |

## Round Two (answered)

Owner, 2026-11-25, verbatim: "member can also opt-out in self service. not only officer", "I'll prefer not a link in
whatsapp message to flier, but shown (visible)", "Q19: Eg. opt-out of all events setup with 'communion-week' period
name", "Q24: Can we adopt linkedLn style of removing notifications from pending to read, to keep unread focussed",
"all other as recommended".

What changed:

- **Channel blocks are self-service as well as officer-set.** One table, one audit entry, two sources; a USSD settings
  screen that adds and ends them, and the same confirmation notice either way (N-10, FR-28).
- **WhatsApp shows the flier.** The approved template carries an image header and the provider fetches
  `/fliers/{token}`; no message body carries a URL, and `{{flierUrl}}` is now for email's plain-text alternative only
  (N-7, N-9, FR-13, FR-22).
- **A period mute is definition-wide.** It covers every event whose `period_id` is that period, now and later, for the
  stated duration (N-10).
- **Pending and read, not removed.** A message is pending until `read_at`; a member may mark one read without opening
  it, and `read-all` clears the list. Nothing is deleted, so the administrative search covers the full history rather
  than a hidden subset (N-10, N-12, FR-23, FR-24, FR-34).
- Rounds 18, 20, 21, 22 and 23 taken as recommended: three cadence values, silent expiry, vendored pg-boss DDL with
  `migrate: false` and `doctor` as the drift check, MinIO with the `db` fallback, and one digest a day.

## Round Three (answered)

Owner, 2026-11-25: "published event is out of edit and ready for notification or view by member even when notification
sent", and "all other as recommended".

- **The lock anchors to the event's own publication**, not the plan's: `active` takes the event out of edit, makes it
  notification-ready and member-visible, and sending a notification changes none of that (N-1, FR-39).
- **What it covers, taken as recommended:** the record, schedule, audience and venue answer `409 event_locked`; plan
  authoring stays available (the plan is not the event), and cancelling a single occurrence stays available.
- **What it does not stop, taken as recommended:** the event stays archivable and cancellable, the detail shows a
  locked banner naming the publish time and the revision, and the list shows the lock beside the Announced mark.
- **Q27's answer cannot survive the new anchor.** "Cancelling the plan is the unlock" only works when a plan exists,
  and an `active` event may have no plan at all. That is the single open question left.

## Round Four (answered)

Owner, 2026-11-25: "as recommended". `Return to draft` is the release: an audited
`POST /v1/events/{id}/return-to-draft` returns an active event to draft, refuses `409 plan_published` while a plan is
published, and `Save and activate` republishes with the next notification publish as a new revision. It is written
into N-1, FR-39, AC-32, the route table and EC-17.

**The frontier is empty.** Every question the four rounds raised is answered and recorded, and each answer is written
into the text above rather than only into the round doc. What remains is not a decision: the owner's explicit approval
of this amended spec, then the reviewer seat's pass, then a build round with a mock.

## Round Five (answered)

Owner, 2026-11-25: "Note: Neon doesn't run locally. this doesn't apply to docker compose, right?", "all other as
recommended". The note was correct and is now explicit in the text rather than implied:

- **The cadence is a hosting fact.** Compose polls continuously because its Postgres is a container — always on, no
  hourly meter — while the hosted trigger runs every 15 minutes because a managed database sleeps after five idle
  minutes and a one- or five-minute poll keeps it awake for ~182 CU-hours (~$19/month) against ~$1 (N-8, FR-42).
- **`starts` needs a cadence of 15 minutes or finer**, refused `409 cadence_too_coarse` otherwise (FR-42, AC-36).
- **`daily` with a `starts` slot is allowed behind a typed acknowledgement** naming the resolved instant, recorded on
  the publish.
- **The pg-boss dashboard is local-only**, behind basic auth, absent from production and never linked from the officer
  UI; an operational requeue goes through the audited API retry (FR-43, AC-38).
- **The local stack does not mirror the hosted cadence**; a lateness test freezes the clock (AC-37).

**The frontier is empty.** Every question the five rounds raised is answered and written into the text above rather
than only into the round doc. What remains is not a decision: the owner's explicit approval of this amended spec, then
the reviewer seat's pass, then a build round with a mock.

## Further Notes

### The scheduler research

Facts checked on 2026-11-25 against the vendors' current documentation.

- **pg-boss 12** runs on stock PostgreSQL and has first-class backends for **PGlite** (embedded, via `fromPglite`),
  CockroachDB and Citus; `backend` is the only setting, and the PGlite profile needs no compatibility flags because
  PGlite is real PostgreSQL. It needs Node 22.12+. It provides retries with exponential backoff, priority, dead
  letters, singleton keys, cron and job dependencies, and ships a CLI that can print its own schema
  (`pg-boss plans migrate --dry-run`) and check drift (`pg-boss doctor`). `migrate: false` skips migrations but
  **throws if any are pending**, which is why the schema must be vendored at the matching version. The v11/v12 line
  repartitioned job storage, and there is no direct migration path from v10, so the version is pinned.
  Sources: <https://pgboss.io/database-backends>, <https://pgboss.io/api/constructor>, <https://pgboss.io/cli>.
- **Vercel Cron** stays the hosted trigger when it arrives: UTC, production only, `Authorization: Bearer
$CRON_SECRET`, no retries, possible duplicate invocations (which the singleton keys absorb). One minute on Pro,
  once a day on Hobby; **Vercel Schedules** (beta) allow 15 minutes with a 1–15 minute jitter.
  Sources: <https://vercel.com/docs/cron-jobs>, <https://vercel.com/docs/schedules>.
- **The local MVP is a long-lived worker**, which is why the "local first" answer fits pg-boss: a process that runs
  the handlers is exactly what Compose gives, and it removes the need for a tick endpoint to exist at all until the
  hosted path needs one.
- **The fifteen-minute choice is a managed-Postgres fact, not a product rule.** A Compose Postgres is always on and
  costs nothing per hour, so the local worker polls continuously; only a managed database that bills by active compute
  makes a slow poll cheaper. The trigger cadence is therefore an environment value, and the same code serves both.

### The flier storage research

- **MinIO** — AGPL-3.0, S3-compatible, self-hosted, one container. The default for the local MVP because it needs no
  account and no bill, and it makes the storage path identical to production.
- **Cloudflare R2** — S3-compatible, **10 GB-month storage, 1 M Class A and 10 M Class B operations free each month,
  with zero egress fees** (verified 2026-11-25). A 2 MB poster fetched ten thousand times is 20 GB of egress for
  nothing; the free operation allowance covers a parish for years.
- **Backblaze B2** — S3-compatible, small free allowance, paid beyond it; a credible second managed target because
  the adapter is the same.
- **Vercel Blob** — convenient inside Vercel, but it is neither free at this volume nor available to the Compose
  build, so it does not satisfy the vendor-neutral requirement.
- The adapter is the point: whichever target, the app serves `/fliers/{token}` itself, so the public URL never
  changes and no bucket is exposed.

### Why the inbox is the system of record

The owner's follow-up settles the model: a member may opt out of a recurring event's notifications and still see the
event in the notifications area. That is only coherent if the inbox message is written independently of delivery. It
also gives the future app one read and makes "the church tried to reach this member" a fact under provider failure.
The one exception the owner's answers created is a member who cannot authenticate at all (N-4).

### Why the plan is separate from the event

The event's `active` state answers "is this on the calendar?". A published plan answers "has the church told
anyone?". Folding them together makes every activation a potential blast and every edit a potential re-send, and it
removes the only place to record a revision, a cancellation and a delivery log.

### The WYSIWYG options

- **TipTap** — MIT core, headless, React bindings, ProseMirror JSON. Chosen: the headless model lets the toolbar be
  Fluent controls, and JSON is the structured form the server can validate and render without trusting HTML.
- **Lexical** — MIT, React-first, JSON state; still pre-1.0 with a smaller extension set. Credible, not chosen.
- **Quill** — BSD, mature, Delta format; the React wrapper is unmaintained. Not chosen.
- **CKEditor 5 / TinyMCE** — full editors with their own UI and GPL/commercial licensing. Not chosen.
- Fluent UI v9 has no rich-text editor, so an external headless engine is not a §16 violation; wrapping a Fluent
  primitive to restyle it would be.

### Why four templates, not one with a channel switch

The channels have different syntax, different limits and different external approval rules. One body with a "strip
the formatting" switch produces a worse SMS than a plain composer and cannot express the WhatsApp template's ordered
parameters. Four variants make the cost and the truncation visible at authoring time.

### The vocabulary collision

`subscription` in this register means a welfare product with a payer, a period and coverage (USSD spec). The brief's
"member subscription to receive events" is a different thing, so this spec calls it **alert settings**. A future
reader should not have to guess which subscription is meant.

### Deferred decisions

- The rich body's node set (`image`, `link`) and how a variable is represented in the stored JSON — email only, and
  deferred because the closed extension set is fixed above.
- A reusable template library with naming and versioning.
- A test send that calls a provider.
- One-click unsubscribe, `List-Unsubscribe` and a public signed preferences page.
- Whether a retry of a failed delivery re-evaluates mutes and blocks set after the failure.
- A monthly SMS spend cap or budget alarm.
- A ministry or category mute scope (follow-up 19).
- Push notifications.

### Mock

The surfaces are user-visible, so the build obeys the mock-first gate in `documents/agents/orchestrator-policy.md`
("Mock parity"): a comparison mock and an owner sign-off **before the UI round's first code commit**. R1 to R3 are
migration and API rounds and are exempt, because none of them alters a screen.

- **Where the mocks sit.** Inside the UI round (R4): it opens, cuts them, parks for the owner's signature, and only
  then writes code. One round, one gate, one record. Owner, 2026-11-25.
- **Which set each surface joins.** The policy forbids a new folder per feature, so they join the sets that already
  own their routes: the event detail, the plan form, the preview, the publish acknowledgement and the change notice go
  into `mockups/v2-events/` (which owns `/events/:id`); the Admin defaults, the delivery log and the member's
  notifications view go into `mockups/v2-shell/` (which owns `/members` and `/admin/audiences`); the member USSD
  screens go into `mockups/ussd/`.
- **Which states.** Success where a table can be empty, an empty state where the list is genuinely empty, and no
  loading or error images: those states are reviewed in code. The USSD set is cut at the 182 budget, with the item
  body and the settings list also cut at Nalo's 120 as `target` states, because those two are the ones that overflow.
- **The sign-off row carries two artefacts.** `documents/rounds/README.md` makes the signed mock and the re-run
  baseline under `ui/e2e/baseline/` non-substitutes, so R4's `## Mock sign-off` row names the mock first and the
  baseline behind it, added when the screen exists.
- The durable record is the spec and the round doc; `mockups/` is git-ignored, so the sha pin in the catalogue is a
  tripwire over an untracked artefact, not proof.

## Change log

- **2026-11-25** — initial draft, synthesised from the owner's brief and the follow-up on recurring-event opt-out.
  Scheduler options researched; the first grill round opened.
- **2026-11-25** — first round answered. Mutes and blocks now expire (30/90/365 days); channel blocks are officer-set
  with a confirmation notice; cadence gains `essential`; a `change` kind is added; pg-boss replaces the hand-rolled
  queue (PGlite and Postgres backends); fliers are attached images in a swappable S3 store (MinIO locally, R2
  hosted); inbox removal is a soft delete that advanced search retrieves; a failed-send digest is emailed to an
  officer address in settings; Notifications sits before My Profile. Eight defects from the first round are fixed:
  the period scope id is `text`, slots are revision-keyed, instances key on `occurrence_id`, the message title is
  derived, the flier route is outside `/v1`, the USSD body cap is separated from the screen budget, the glossary keys
  are added, and N-7's stray marker is gone. A follow-up round of seven questions is open.
- **2026-11-25 (second round answered).** Channel blocks are self-service as well as officer-set. WhatsApp shows the
  flier as the template's image header, so no channel body carries a URL and `{{flierUrl}}` is confined to email's
  plain-text alternative. A period mute is definition-wide across every event carrying that `period_id`. Removal is
  replaced by a pending→read model with `read-all`; nothing is deleted, and the administrative search covers the full
  history instead of a hidden subset. Cadence keeps its three values, expiry stays silent, pg-boss's DDL is vendored
  with `migrate: false` and `pg-boss doctor` as the drift check, MinIO is the default flier store with `db` as the
  fallback, and the digest stays daily. The `notification_messages.deleted_at` column is dropped with the soft delete.
- **2026-11-25 (edit lock added).** The owner's instruction "published event should be locked from edit" is recorded as
  FR-39, AC-32 and an N-1 bullet. Round Three fixed its reach: the lock anchors to `active`, covers the record,
  schedule, audience and venue, and leaves plan authoring and occurrence cancellation available. Its release is Round
  Four's single question, because anchoring at `active` removes the plan-cancel unlock the round-three recommendation
  assumed.
- **2026-11-25 (frontier closed).** Round Four answered "as recommended": `Return to draft` is the lock's release,
  audited and refusing while a plan is published. The frontier is empty; the spec awaits the owner's approval and the
  reviewer seat's pass.
- **2026-11-25 (three reviewer passes).** `reviewer-pro` inside the window (`mimo-v2.6-pro`) returned REWORK twice:
  the first pass found three unbuildable schema clauses (the guardian-routed delivery had no message to point at, the
  block confirmation had no instance, a re-block after silent expiry broke a unique index) and a missing per-revision
  publication state; the confirmation found purge still tripping the message FK and `change` having no representable
  state. A cold pass outside the window (`deepseek-v4-pro:0813`) then found what the first two had missed: `change` was
  still a slot kind in three places while the table had moved it out, email's plain-text alternative had no column,
  `/activate` duplicated the existing `PATCH status: active`, and the two schedule guards were unreconciled. All fixed:
  change notices are their own table with `kind` on the instance, email stores `body_text` as its alternative,
  activation stays the PATCH, the lock and the periods guard have a stated precedence, and the horizon, fan-out
  granularity, purge order, USSD `pageSize`, expiry sweep and flier-PII rules are now written down.
- **2026-11-26 (R3 amendments).** Seven contradictions found while scoping the send path, each fixed where it lives:
  (1) `notification_slot_instances` gains `delivery_at`, because N-8 says a policy change applies only to jobs
  enqueued after it and a recomputed read would apply it to all of them; (2) its unique index gains
  `where status <> 'cancelled'`, because a cancelled instance otherwise blocks the same moment for ever and AC-26's
  return-to-draft could never republish; (3) `notification_change_notices` gains its own WhatsApp template and
  parameters, and its own email subject and body, because N-7 forbids free-form WhatsApp and a frozen revision's
  templates cannot carry content authored after them; (4) FR-17 pins the draft's **content** token rather than its
  revision, because a draft edits in place and the revision does not move when the content does; (5) FR-16 names an
  exclusion sample only for `no_contact`, because FR-44 forbids naming the members who muted or blocked; (6) N-2's
  horizon job calls the global generation once and then materialises per plan, because that call takes no event id;
  (7) `NOTIFICATION_TRIGGER_MINUTES` has no in-code default and the config refuses to boot without it, because a
  default of 15 made the local read disagree with the locally continuous stack. FR-7's inbox rule is restated as
  "owns at least one contact" so an email-only member has a row the USSD read cannot yet show them.
- **2026-11-27 (Notifications becomes a page).** The owner withdrew the panel on the event detail - "puts too much on
  the form; event detail currently also has its own cards" - and asked for a standalone landing page. N-12 now puts
  **Notifications under Events** (`#/notifications`), carrying the per-channel counts, the filtered deliveries grid, the
  on-demand failure digest, the defaults and the message search. The event detail keeps a summary card only, and plan
  authoring moves to `#/events/:id/notifications`. FR-32, FR-33 and FR-34 are restated against the new page, FR-49 is
  added, and AC-49..AC-52 record the page, the grid, the on-demand digest and the summary card. The digest and the admin
  surfaces move out of R3b into this round.
- **2026-11-27 (page layout).** The owner rejected the first drawing - "cards not well done and drifted too far from
  patterns in other places" - and asked for the overall counts across the top and the per-media stats in an accordion on
  the right. FR-49 and AC-49 now say so: the top row is sent, delivered, queued and failures; the rail is an accordion
  per channel with sent, delivered, skipped, failed and queued; and `sent - delivered` is what failures means. The page
  composes the set's own pieces - `.kpis`, `.panels.wide-left`, `.grid-table`, `.badge`, `.chip` and a rail of `.panel`s
  with an `.expander` chevron - rather than inventing a layout.
- **2026-11-27 (cards, member column, lifted preferences).** The owner asked for the member landing's tinted cards, a
  tidier grid head, the member on each delivery row, a list of muted members with the reason, and an unmute that needs
  the member's authorisation (grill Q1-Q4, and their own question "should we not show a little bit of member on delivery
  report"). FR-44 gains its one carve-out: the **Notifications page** may name live mutes and blocks, and no event
  surface may. FR-50 is added for lifting one, which records _how_ the member authorised it. FR-49 gains the member
  column and the list, AC-53 and AC-54 record them, and the top row is drawn as `.ov-stat`-shaped cards tinted per
  measure rather than plain tiles.
- **2026-11-26 (R3 amendment 8).** `notification_plan_revisions_published_check` becomes one-way
  (`status <> 'published' or published_at is not null`). The biconditional made `cancel` unrepresentable: setting a
  published revision to `cancelled` while retaining the publish stamp failed `(false) = (true)`, so the only way to
  cancel would have been to erase when the plan was published. `delivery_at` is written at materialisation rather than
  left null until enqueue, so the plan detail can show the instant immediately after publish and the sweep enqueues at
  the stored value.
