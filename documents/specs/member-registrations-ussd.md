# Spec — USSD attendance, giving and subscriptions

**Status:** Draft 2026-11-05. Owner-approved direction; spec review pending. Ticket 24 expands into
24a–24d. Supersedes the narrow USSD bullets in `member-registrations-events-offerings.md` (FR-31,
FR-41); the offering, contribution and pledge contracts there still govern the money paths.

## Problem Statement

A large part of the congregation has no smartphone and no data bundle. The web app is unusable for
them, so giving, pledging, attendance and welfare subscriptions happen on paper or not at all. At the
same time the church cannot prove who was actually present at an event: attendance is imported from the
registry, manually recorded by staff, or claimed verbally, and an anonymous caller has no way to join
the register on the spot. Staff also lack a lightweight way to capture an expected headcount and to
delegate clocking duty when the senior presbyter is not at the event.

## Solution

A USSD menu tree served by the existing API through a USSD gateway stub. The caller is identified by
their phone number against stored member contacts; an unknown number is an anonymous caller. Members
can give to today's offerings (one or several, split by amount), pledge on an offering and redeem it
later, subscribe to welfare services they are eligible for, check their attendance for a day or a
period, and — when they were present but not clocked in — redeem a one-time code issued by an admin.
Presbyters can clock in members and capture expected headcounts (male, female, children); a senior
presbyter who is not present delegates clocking duty to another presbyter. Anonymous callers can
request registration while attending, using a one-time code tied to the event.

Every prompt is short, numeric and rendered in lay terms. Every money action returns a confirmation
code. No raw phone number is stored or logged.

## User Stories

1. As an anonymous caller, I want to dial the church code and get a short menu, so that I can register,
   give or check attendance without an account.
2. As an anonymous caller, I want to request registration while I am at an event by entering a one-time
   code the admin gave me, so that my presence is proven and my details can be captured.
3. As an anonymous registration requester, I want a reference code to show at the desk, so that I can
   follow up on my request.
4. As a member, I want the menu to recognise my phone number, so that I do not type my member number.
5. As a member, I want to see today's valid events and pick one, so that my gift is recorded against the
   right event.
6. As a member, I want to enter an amount and choose one or more offerings, so that one payment can
   cover several appeals.
7. As a member giving to several offerings, I want to split the amount in the order I selected them, so
   that each appeal receives the right share.
8. As a member, I want the split restated in plain words before I accept, so that I know exactly where
   the money goes.
9. As a member giving to one offering, I want the whole amount sent to it without a split prompt, so
   that the flow stays short.
10. As a member, I want to pledge on an offering when I have no funds, so that I can redeem it later.
11. As a member, I want to see my pending pledges and pay one, so that it is honored when I have money.
12. As a member, I want a confirmation code for a gift or pledge, so that I have a receipt.
13. As a member, I want to check whether I was recorded present at an event today, so that I know my
    attendance is correct.
14. As a member who was present but not clocked in, I want to enter a one-time code from the admin, so
    that my attendance is punched without a paper register.
15. As a member, I want to check my attendance for a specific day, so that I can confirm a past service.
16. As a member, I want a quarter, month or year summary of my attendance, so that I can see my trend.
17. As a member, I want to see only the welfare subscriptions I am eligible for, so that I do not apply
    for something I cannot get.
18. As a member, I want to subscribe to an eligible service, so that my cover starts immediately.
19. As a member, I want to check my subscription status and total claimed, so that I know my cover.
20. As a member, I want an expiring subscription to show as expired, so that I know to renew.
21. As a presbyter, I want to clock in a member I shepherd from USSD, so that I can record attendance at
    the door.
22. As a senior presbyter, I want to delegate clocking duty to another presbyter when I am not at the
    event, so that the door is not left unstaffed.
23. As a senior presbyter, I want the delegation to be limited to the event session, so that it cannot
    be reused later.
24. As an admin, I want to issue a one-time attendance or registration code against an event session, so
    that presence is provable.
25. As an admin, I want each code to expire and be single-use, so that it cannot be shared.
26. As an admin, I want to see and void issued codes, so that a leaked code can be stopped.
27. As an admin, I want to review anonymous registration requests and approve or reject them, so that
    the register stays clean.
28. As a presbyter, I want to capture expected male, female and children counts in one entry, so that
    the headcount is recorded in seconds.
29. As an admin, I want to correct an expected headcount, so that a typo does not persist.
30. As a finance officer, I want a split gift to be one gateway charge and one receipt, so that
    reconciliation is simple.
31. As a finance officer, I want a repeated USSD retry or gateway callback to reconcile once, so that no
    money is double-counted.
32. As a finance officer, I want the gateway terms payload to carry each offering and its terms version,
    so that the charge matches what was promised.
33. As a back-office officer, I want to record subscription claims and see the total claimed, so that
    cover is tracked.
34. As a subscription product owner, I want eligibility rules (card, membership age, verification,
    gender, age), so that only valid members can subscribe.
35. As a member, I want an ineligible service hidden rather than refused after entry, so that the menu
    stays honest.
36. As an auditor, I want every clock-in, code redemption, delegation, claim and gift attributed to an
    actor and timestamp, so that the record is defensible.
37. As an operator, I want USSD disabled in production until an aggregator and gateway are chosen, so
    that the stub cannot be dialled.
38. As an operator, I want an expired session to restart cleanly without a partial charge, so that a
    dropped call is safe.
39. As a member, I want to see my payments for this week, this quarter and this year, and my top three
    events for the year, so that I know how much I have given.
40. As a member, I want to see my profile — gender, age, ministries, attendance regularity and my
    shepherd — so that I can check my record at a glance.
41. As a covered dependent, I want to see the welfare plan I inherit from my spouse or parent, labelled
    by the relationship, so that I know I am covered.

## Implementation Decisions

### Identity and channel authentication

- The USSD aggregator calls the API, not the browser. It is mounted **outside the bearer-protected
  `/v1` namespace**, at `POST /ussd/session`, and authenticates with an HMAC-SHA-256 signature over
  `timestamp + nonce + body` using `USSD_GATEWAY_SECRET`, valid for five minutes; a replayed nonce is
  refused. Nonces are stored in Postgres and pruned after ten minutes. The member is identified by the
  MSISDN in the request, never by the bearer.
- The MSISDN is normalised to digits and matched against **owned** `member_contacts` of kind `phone` or
  `whatsapp`. A linked contact alone does not identify the caller (household numbers are shared), so a
  linked-only match is an anonymous session. The session stores an HMAC-SHA-256 phone hash under
  `USSD_PHONE_PEPPER` for binding and rate limiting; the raw number is never stored, returned or logged.
  The contribution's `visitor_phone_hash` uses `VISITOR_PHONE_PEPPER`; the two hashes are never
  interchanged.
- No match means an anonymous session. An archived or purged member is treated as anonymous for giving
  and registration but cannot be clocked in.
- Session creation is rate-limited per phone hash (10 per minute) and per client address (30 per
  minute).

### USSD session and menu tree

- One route, one seam: `POST /ussd/session` with `{ phone, sessionId?, input, seq }` returns
  `{ sessionId, text, done, state, options? }`. The gateway sends each keypress; the server owns the
  menu tree, validation and the lay-terms rendering. `seq` is a per-session monotonically increasing
  frame number: a repeated frame returns the same prompt without advancing, so an aggregator retry
  cannot double-advance or double-charge.
- Sessions live in `ussd_sessions` (Postgres), idle-expire after 3 minutes and are bound to the phone
  hash. An expired or unknown session restarts from the main menu with "Session expired"; no partial
  charge exists because only the final commit writes money.
- The menu tree: `main` → `offerings` (give → events → amount → choices → split → confirm → pay |
  pledge → amount → expected date → confirm | my pledges → redeem | my payments → week / quarter / year
  and the top three events) → `activities` (opens **today's** event list; `0 More` → this week,
  `8 A date`; an event links to attendance and giving) → `attendance` (opens **today's** status; a day /
  period / code; presbyters also `clocking` → clock in | expected | delegate) → `welfare & services`
  (opens the **top three eligible services**; `0 More` → all; `8 My services` → status and claimed
  total) → `my profile` (demographics, ministries, attendance and shepherd) → `register` (code → name →
  reference, anonymous only). Every top-level domain opens its primary content, never a choice screen;
  extra actions sit on that screen. On the Attendance status screen the extra actions are `1` a specific
  day, `2` period summary, `3` I was present (code) and, for presbyters, `4` clocking. There is one
  top-level entry per domain — no duplicate "my …" item beside its action. The anonymous main menu is
  Register, Offerings, Activities, Attendance, Exit; the member menu replaces Register with Welfare &
  Services.
- **Navigation keys.** `9` goes back one level (and exits at the main menu, `done: true`); `0` means
  **More** — the next page, or the next window where the screen offers one (Activities: this week) — and
  never elsewhere; `00` returns to the main menu from any prompt.
- The final commit is idempotent by session id: a repeated keypress or gateway retry returns the same
  confirmation code and never creates a second gift.

### Giving: events, offerings, splits

- "Valid events for the day" are events whose sessions include today in the event's timezone, that are
  not cancelled or archived, ordered by start time; at most five are shown plus `0 More`.
- Offerings are the active attachments of the chosen event and its series, minus detached, expired,
  skipped on that date or opted-out; at most five are shown plus `0 More`. The resolved display name is
  the API's, never composed by USSD.
- The caller enters the amount first, then selects one or more offerings (`1,2`). One offering takes the
  whole amount silently. Several offerings trigger a split prompt (`20,30`), which must sum to the
  amount and follow the selection order.
- Before acceptance the server renders the split in lay terms, for example: "You split GHS 20.00 to
  Welfare Fund, GHS 30.00 to Building Fund. Total GHS 50.00. 1 Accept, 2 Change." The text is returned
  by the API so it is testable and identical on every channel.
- A split commit creates all contributions in one transaction under one payment group. The **group**
  has the unique idempotency key; each contribution row gets a deterministic child key
  (`<groupKey>:<n>`), because `contributions.idempotency_key` is unique per row. One gateway charge is
  requested for the total, and the confirmation code is the group reference.
- An anonymous giver is prompted for a name before the amount; the gift is a visitor contribution with
  that name and the hashed MSISDN. A member gift never prompts for a name.
- **My payments.** Inside Offerings a member sees their own paid totals for the week to date (Monday
  start), the quarter to date and the year to date, and the three events with the highest paid amount
  this year, in one prompt. The API returns one member-scoped aggregate:
  `GET /v1/members/{memberNo}/contributions/summary` →
  `{ currency, week: Window, quarter: Window, year: Window, topEvents: [{ eventId, name, paidMinor }] }`,
  where `Window = { from, to, paidMinor }` for all three. The windows are UTC calendar dates ending
  today. Only `paid` member contributions count; visitor gifts never appear; totals are in the offering
  currency (GHS in v3, no FX); `topEvents` is ordered by paid amount then name and holds at most three.
- A single-offering gift uses the same group path (a group of one), so there is one money code path.

### Pledges and redemption

- A pledge is made on one existing offering of the chosen event, with an amount and an expected date.
  A pledge is never an offering and never creates one.
- The follow-up officer is the member's active shepherd, or an active presbyter the back office supplies
  with a reason; otherwise the pledge is refused with the existing `officer_required` code.
- "Redeem later": the member lists pending pledges and pays one. Settling creates a contribution and
  appends the `honored` event in one transaction; a pledge may be honored after the offering's expiry,
  as the existing pledge contract allows.
- The expected date is prompted as a date and confirmed in lay terms; a past date is refused before any
  write.

### Attendance: check, punch, clock, delegate, expected counts

- A member checks attendance for today, a specific day, or a period (month, quarter, year). The answer
  is a count and a per-event list, never fabricated absences. Checks, codes and clock-ins apply only to
  member-trackable events; a headcount-only event (`tracksMembers = false`) is listed in Activities with
  its expected headcount and takes no per-member attendance.
- Attendance is normally recorded by the back office, by an import, or by a presbyter clocking the
  member in. USSD clock-in is a USSD-authenticated act attributed to the presbyter's member identity.
- **One-time codes.** An admin issues a **six-digit** code from a CSPRNG against one event session with a
  purpose (`attendance_punch` or `registration`), a 15-minute TTL and a single use. Only an HMAC-SHA-256
  hash under `USSD_CODE_PEPPER` is stored; the plain code is shown once. A member who was present but not
  clocked in enters the code; the API punches attendance for that member and session. A code is refused
  when expired, used, voided or for another session, and five failed attempts per phone in 15 minutes
  answer "Too many attempts" without revealing whether the code exists.
- **Anonymous registration request.** An anonymous caller enters a `registration` code, then first and
  last name; the API creates a pending registration request tied to the event session and the code, and
  returns a reference to show at the desk. No member row is created. The back office approves — supplying
  the immutable member number — through the existing member create path, or rejects it. Approval is the
  only path that creates the member.
- **Presbyter clocking and delegation.** Any presbyter may clock in a member they actively shepherd.
  A senior presbyter (a rank in `members.presbyter_rank`, 1 = most senior, set by an admin through the
  member update and valid only with `isPresbyter`) may clock in any member for a session. If that senior
  presbyter is not themselves recorded present at the session, they must first delegate clocking duty for
  that session to another presbyter; the delegation is recorded with the grantor, delegate, session and
  reason, and expires with the session. The delegate may then clock in members for that session only.
- **Expected headcounts.** A presbyter or admin captures `male,female,children` for one session in a
  single entry; `children` is a separate bucket, not a gender value. The API stores them per event
  session, restates the total in lay terms ("20 males,
  30 females, 40 children — 90 expected"), and the back office can correct them. The register-derived
  `expected` count stays separate; this is the operator's expected headcount.
- Attendance summaries are read through one member-scoped aggregate for a window and a day, with the
  USSD rendering counts and the latest event first.

### Subscriptions and claims

- Welfare services become **products** (`subscription_products`): code, name, description, premium,
  currency, active flag, and eligibility rules — minimum days since `joinedOn`, a membership card on
  file, a verified member, gender, and age from `dob`.
- Members gain `membership_card_no` and `verified_at` (null = unverified); both are back-office fields
  and appear in the member DTO.
- A product also carries **how it is paid and who is covered**: `paymentMode` (`member`, `church` or
  `either`), `periodMonths` (1, 3, 6 or 12), `covers` (`individual` or `household`), `maxDependents`
  and `allowedRelationships` (a subset of `spouse`, `child`, `parent`, `guardian`, `other`).
- A subscription records the **payer** (`paidBy`: `member` or `church`), the covered period
  (`periodStart`, `periodEnd`) and the premium (`premiumMinor`, null for a church-paid period).
  `startedOn` is when the relationship began and `endedOn` the explicit end; `periodEnd` is when cover
  lapses unless renewed. A product priced `either` chooses the payer per subscription.
- **Church-paid** cover is started or renewed by the back office for a period; there is no member
  payment. **Member-paid** cover has one `subscription_payments` row per period (amount, period,
  channel, reference, paid on, recorded by); paying advances `periodEnd`. An unpaid period leaves the
  subscription expired at `periodEnd`, and the USSD "My services" shows it as expired.
- **Coverage.** A household product covers the member plus up to `maxDependents` active members joined by
  an allowed relationship (an existing explicit relationship edge, never derived). Adding a dependent
  beyond the cap, with a disallowed relationship, or a non-active member is `422 validation_error`. An
  individual product covers the member only. Coverage is explicit `subscription_coverage` rows — a
  financial fact, never inferred from the household.
- USSD lists **only eligible products** for the caller and shows the premium, period, payer and cover in
  lay terms. A household product asks "Cover dependents? 1 Yes 2 No" and lists the eligible dependents
  up to the cap; a church-paid product says "Paid by the church" and takes no payment. "My services"
  shows status, paid by, period and expiry. An ineligible product is hidden, never refused after entry.
- **Inherited cover.** A member covered by another member's subscription sees it in "My services" as
  inherited, labelled with the relationship from the covered member to the policyholder: `spouse`
  renders Husband or Wife from gender, otherwise the relationship type — for example
  "Life Cover (Husband · Solomon)". Inherited rows are read-only in USSD (the policyholder manages the
  plan); the list and detail show status, payer, period and total claimed. The member subscription read
  (`GET /v1/members/{memberNo}/subscriptions`) returns owned and inherited rows with `source: 'owned' |
'inherited'`, `policyholder: { memberNo, name } | null` and `relationship: string | null`.
- Claims are back-office records (`subscription_claims`): amount, reason, status, recorded by and
  decided by. "Total claimed" is the sum of approved/paid claims for the subscription.

### My profile

- **My profile.** The member menu's last entry shows a compact profile: name (`first + last`, the DTO
  convention) and member number, gender and age (from `dob`; `age` is null when `dob` is unknown), up to
  three ministry names, the attendance line and the shepherd. The API returns one aggregate: `GET
/v1/members/{memberNo}/profile` → `{ memberNo, name, gender, age: number | null, ministries: [name],
shepherd: { memberNo, name } | null, attendance: { status: 'regular' | 'non_regular', attended,
expected, window: 5, lastAttendedOn: string | null } }`. `attendance` counts the member's **tracked** attendance
  across the events that apply to them: every **general** event (its series has no ministry, or it has no
  series) and every event whose ministry the member belongs to — a `member_ministries` row to an active
  ministry, with the member active (not archived or purged) — and only where the event is
  **member-trackable**
  (`tracksMembers = true`). The window is the last five **held** scoped sessions ending today: a session
  is held when its date is on or before the event's today in the event's timezone and the session is not
  cancelled; sessions are ordered by date, then event start time, then event id. `regular` when
  `attended / expected >= 0.6` (60%), otherwise `non_regular`; `expected` is the window size (up to 5)
  and `attended` is the number present. `lastAttendedOn` is the most recent attended date in scope. A
  headcount-only event never counts, and neither does attendance at an event whose ministry the member
  does not belong to. With no scoped sessions the status is `non_regular`, `attended` and `expected` are
  `0`, the date is null, and the screen says "No attendance yet". The shepherd is the active shepherding
  assignment's officer, or null ("Not assigned"). One request, `no-store`.

### Payments and the gateway stub

- A payment group is created for every USSD money commit: one total, one currency, one idempotency key,
  and the contributions underneath it. The gateway receives the terms payload — payer (member number or
  phone hash), total, currency, reference, and each offering with name, amount and terms version — and
  returns initiated. A callback verifies the shared secret, is idempotent by gateway reference, and
  marks the group and its contributions paid.
- The stub gateway is an in-process adapter behind a `PaymentGateway` port: it records an intent and can
  be driven from the simulator. The callback is a **new** route at `/v1/payments/callback`, signature-
  verified and idempotent by gateway reference. No card data is stored, ever.
- USSD is disabled in production by configuration until a real aggregator and gateway exist.

## Data model additions

| Table / column                    | Shape                                                                                                                                                                                                                                                                | Constraints                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `members.presbyter_rank`          | `integer` nullable                                                                                                                                                                                                                                                   | admin-set; requires `is_presbyter`                     |
| `members.membership_card_no`      | `text` nullable                                                                                                                                                                                                                                                      | back-office field                                      |
| `members.verified_at`             | `timestamptz` nullable                                                                                                                                                                                                                                               | null = unverified                                      |
| `ussd_sessions`                   | `id`, `phone_hash`, `member_id` nullable, `anonymous`, `state`, `context` jsonb, `last_input_seq`, `expires_at`, timestamps                                                                                                                                          | 3-minute idle TTL; no raw phone                        |
| `attendance_codes`                | `id`, `code_hash`, `purpose`, `event_instance_id`, `session_date`, `issued_by`, `issued_at`, `expires_at`, `used_at`, `used_by_member_id`, `registration_request_id`, `voided_at`                                                                                    | hash only; single use; TTL                             |
| `registration_requests`           | `id`, `reference` unique, `first_name`, `last_name`, `phone_hash`, `event_instance_id`, `session_date`, `code_id`, `status`, `created_at`, `decided_by`, `decided_at`                                                                                                | no member until approved                               |
| `clocking_delegations`            | `id`, `event_instance_id`, `session_date`, `from_member_id`, `to_member_id`, `reason`, `created_at`, `ended_at`                                                                                                                                                      | one active per session; ends with the session          |
| `event_session_expected`          | `event_instance_id`, `session_date`, `male`, `female`, `children`, `recorded_by`, `recorded_at`                                                                                                                                                                      | unique `(event_instance_id, session_date)`; counts ≥ 0 |
| `payment_groups`                  | `id`, `reference` unique, `idempotency_key` unique, `total_minor`, `currency`, `status`, `created_at`, `created_by`                                                                                                                                                  | one gateway charge per group                           |
| `payment_intents`                 | `id`, `payment_group_id`, `gateway`, `reference`, `status`, `raw_callback_hash`                                                                                                                                                                                      | unique gateway reference; one per group                |
| `contributions.payment_group_id`  | `uuid` nullable                                                                                                                                                                                                                                                      | FK to `payment_groups`                                 |
| `pledges.settled_contribution_id` | `uuid` nullable                                                                                                                                                                                                                                                      | set when settled by USSD                               |
| `subscription_products`           | `id`, `code` unique, `name`, `description`, `active`, `premium_minor`, `currency`, `payment_mode`, `period_months`, `covers`, `max_dependents`, `allowed_relationships`, `min_membership_days`, `requires_card`, `requires_verified`, `gender`, `min_age`, `max_age` | rules evaluated server-side                            |
| `subscriptions.product_id`        | `uuid` nullable                                                                                                                                                                                                                                                      | existing rows stay valid                               |
| `subscriptions.premium_minor`     | `bigint` nullable                                                                                                                                                                                                                                                    | null for a church-paid period                          |
| `subscriptions.paid_by`           | `text` (`member` / `church`)                                                                                                                                                                                                                                         | chosen per subscription                                |
| `subscriptions.period_start`      | `date` not null                                                                                                                                                                                                                                                      | cover period start                                     |
| `subscriptions.period_end`        | `date` not null                                                                                                                                                                                                                                                      | cover lapses here unless renewed                       |
| `subscription_payments`           | `id`, `subscription_id`, `period_start`, `period_end`, `amount_minor`, `currency`, `channel`, `reference`, `paid_at`, `recorded_by`, `status`                                                                                                                        | member-paid periods; one row per paid period           |
| `subscription_coverage`           | `subscription_id`, `member_id`                                                                                                                                                                                                                                       | existing: explicit covered members, never derived      |
| `subscription_claims`             | `id`, `subscription_id`, `member_id`, `amount_minor`, `reason`, `status`, `recorded_by`, `recorded_at`, `decided_by`, `decided_at`                                                                                                                                   | approved + paid sum to "total claimed"                 |

## Testing Decisions

- **Good tests** assert external behaviour only: the exact menu text and next state from
  `POST /v1/ussd/session`, the persisted rows behind it, HTTP status and problem codes, and the
  confirmation code. No test reaches into the state machine's internals.
- **Seams.** One new seam at the USSD router — `POST /ussd/session` — covering identity, menus, giving,
  pledges, attendance, codes and subscriptions end to end. Behind it the shipped repository rules are
  reused, but three operations are new and get their own bearer-route seams: the payment-group commit
  (split contributions plus one intent), pledge settlement, the windowed member attendance and payment
  summaries, and the profile aggregate.
  The gateway callback is a new signature-verified seam at `/v1/payments/callback` with its own
  idempotency tests. Code issuance, registration approval, delegation, expected counts and claims are
  bearer-protected admin seams, tested there.
- **Prior art.** Route-level Supertest + PGlite tests like `tests/api/attendances`,
  `contributions` and `offerings`: one app instance, real migrations, real rows asserted by query.
  The USSD tests drive the menu as a sequence of input frames and assert the prompts.
- **Mocks are not tests.** The simulator in `mockups/` is a review artifact.

## Out of Scope

- A production USSD aggregator or shortcode, and a production payment gateway (both stubs).
- Card data, PCI scope, refunds and settlement (unchanged from the offerings spec).
- The mobile app and the richer mobile views (V5).
- Self-service profile editing, contact changes or member-number creation from USSD.
- Per-officer web authorization; the web app keeps the shared bearer, USSD derives the actor from the
  phone-matched presbyter.
- Claim approval policy, payout rails and provider integrations (claims are recorded, not paid out).
- Reminder delivery and member reminder opt-out (deferred with the delivery integration).
- Multi-currency FX; one currency per offering.

## Further Notes

- **Menu compactness.** One top-level entry per domain, and each opens its primary content rather than
  another choice screen: Offerings → give | pledge | my pledges | my payments; Activities → today's
  events, with More (this week) and A date; Attendance → today's status, with a day | period | code |
  clocking (presbyters); Welfare & Services → the top three eligible services, with More and My
  services. `9` is back one level (exit at main), `0` is More (next page or next window), and `00` is the
  main menu.

- **Ticket split.** 24a — USSD core (identity, session, events/offerings, splits, lay text, payment
  group, pledge and redemption, confirmation code, stub gateway). 24b — attendance (check, summaries,
  one-time codes, anonymous registration, clocking/delegation, expected headcounts). 24c —
  subscriptions (products, eligibility, member card/verified fields, claims, USSD flows). 24d — the
  simulator and back-office mocks for review. 24a is the only ticket that must land before the simulator
  can be exercised against the real API.
- **V5 candidates** (identified, not in the USSD app): a mobile app with the full event calendar,
  offering browse beyond five, recurring gifts, family/group giving, profile editing, subscription
  claim history and uploads, notifications, pledge reminders, and richer attendance analytics. The
  spec's API decisions (payment groups, product eligibility, codes, delegations) are channel-neutral so
  V5 reuses them.
- **The mock index** in `mockups/ussd/` shows the simulator and the back-office surfaces; the committed
  durable record is this spec and the round docs, never the mock files.
