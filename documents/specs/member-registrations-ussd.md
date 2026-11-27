# Spec — USSD attendance, giving and subscriptions

**Status:** Draft 2026-11-05. Owner-approved direction; a **scoped** review of §24d (the
provider-adapter layer) was recorded on 2026-11-24 by `mimo-v2.6-pro` against `ad6c028` plus the
`chore/ussd-adoption-cost` working tree, verdict consistent; the wider spec review is still pending.
Ticket 24 expands into
24a-24d. Supersedes the narrow USSD bullets in `member-registrations-events-offerings.md` (FR-31,
FR-41); the offering, contribution and pledge contracts there still govern the money paths.

## Problem Statement

A large part of the congregation has no smartphone and no data bundle. The web app is unusable for
them, so giving, pledging, attendance and welfare subscriptions happen on paper or not at all. At the
same time the church cannot prove who was actually present at an event: attendance is imported from the
registry, manually recorded by staff, or claimed verbally, and an anonymous caller has no way to join
the register on the spot. Staff also lack a lightweight way to capture a headcount and to
delegate clocking duty when the senior presbyter is not at the event.

## Solution

A USSD menu tree served by the existing API through a USSD gateway stub. The caller is identified by
their phone number against stored member contacts; an unknown number is an anonymous caller. Members
can give to today's offerings (one or several, split by amount), pledge on an offering and redeem it
later, subscribe to welfare services they are eligible for, check their attendance for a day or a
period, and — when they were present but not clocked in — redeem a one-time code issued by an admin.
Presbyters can clock in members and capture headcounts by mode (adults or children); a senior
presbyter who is not present delegates clocking duty to another presbyter. Anonymous callers can
request registration while attending, using a one-time code tied to the event.

Every prompt is short, numeric and rendered in lay terms. Every money action returns a confirmation
code. No raw phone number is stored or logged.

## Vocabulary

- **USSD (the mock set)** — the phone-frame simulator: a dark handset frame that renders the menu
  text as the caller sees it, generated from `mockups/ussd/simulator.html` by
  `mockups/ussd/capture.mjs`. It is a separate surface from the web portal and its `v2-*` mock sets;
  "the USSD screens" always means this handset set, and the Display glossary below is its copy
  contract.
- **Portal** — the web officer application and its `mockups/v2-*` shell sets; a portal mock is never a
  USSD screen and never the public member acceptance page.

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
29. As an admin, I want to correct a headcount, so that a typo does not persist.
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
- A registered number is **identified** by an owned phone or WhatsApp contact; the member menu opens
  and there is no verification gate. The register proves "this number", not "this person"; a spoofed
  MSISDN is an accepted risk of trusting the gateway's number assertion. Verification is a badge and an
  eligibility fact (a proven email, WhatsApp or phone contact, or an officer confirmation), not an
  access gate. An anonymous number keeps the anonymous menu and visitor giving.
- Session creation is rate-limited per phone hash (10 per minute) and per client address (30 per
  minute). The counters use the shared `auth_rate_limits` table, keyed `ussd:phone:<hash>` and
  `ussd:ip:<address>`, so no instance holds them in memory.

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
  total) → `notifications` (the latest five messages, newest first, `0 More` → older, an item opening or marking
  itself read and offering a mute; `8 Alert settings` → cadence, muted items, blocked channels) → `my profile`
  (demographics, ministries, attendance and shepherd) → `register` (code → name →
  reference, anonymous only). Every top-level domain opens its primary content, never a choice screen;
  extra actions sit on that screen. On the Attendance status screen the extra actions are `1` a specific
  day, `2` period summary, `3` I was present (code) and, for presbyters, `4` clocking. There is one
  top-level entry per domain — no duplicate "my …" item beside its action. The anonymous main menu is
  Register, Offerings, Activities, Attendance, Exit; the member menu replaces Register with Welfare &
  Services and gains **Notifications** immediately before My Profile. `My Profile` gains `1 Verify contact` for an identified member (an owned phone or WhatsApp)
  with any owned contact unproven and no officer confirmation; the `verify.sent` notice renders the `status.verification_sent`
  copy ("A code was sent to <mask>. Open the link we sent."), parents to `profile` and accepts no
  six-digit code entry (only `9 Back`).
  The tree arrives incrementally (see **Ticket split**): 24a ships Offerings and Exit, and
  each later part adds its entries.
- **Navigation keys.** `9` goes back one level (and exits at the main menu, `done: true`); `0` means
  **More** — the next page, or the next window where the screen offers one (Activities: this week) — and
  never elsewhere; `00` returns to the main menu from any prompt.
- The final commit is idempotent by session id: a repeated keypress or gateway retry returns the same
  confirmation code and never creates a second gift.

### Display glossary

USSD screens are short; every static display string has a `full` form for the web and the admin portal
and a `short` form for USSD. The glossary is a typed, code-owned map in the USSD module, reviewed in
this spec; it is not a database table in V3. `short` defaults to `full` when the full text already
fits.

- **Static copy only.** Menus, prompts, confirmations, errors, statuses and field labels use the
  glossary. Dynamic values (member, event and offering names, amounts, dates, references) keep the
  API's value and are never renamed. Dynamic field widths are fixed per kind: member and event name
  **24** characters, offering name **20**, reference **16**, amount **14** and date **12**; a longer
  value is truncated to that width with `…`, never replaced by a synonym.
- **Budgets.** A short menu label is at most **16** characters, a prompt line at most **60**, and a
  whole screen at most **182** characters including the menu and footer. `9 Back`, `0 More` and
  `00 Main` are fixed copy and count toward the budget. A test renders every screen and fails on a
  missing key, an exceeded budget, or a changed fixed key. The screen registry is the state list in
  `USSD session and menu tree` plus the flows below; the test iterates it.
- **Maintenance.** English only in V3; keys are stable so a later locale can add variants. Wording
  changes are spec-first. The table lists the shared keys; 24a uses the giving, navigation and shared
  menu keys, 24b adds the attendance and profile keys it renders, and 24c adds the welfare keys. The
  completeness test covers every key the shipped screens use, and a key no shipped screen uses is
  allowed until its part lands. An admin-editable glossary is a backlog item, not V3.

| Key                            | Full                                                         | Short           |
| ------------------------------ | ------------------------------------------------------------ | --------------- |
| `menu.offerings`               | Offerings                                                    | Offerings       |
| `menu.activities`              | Activities                                                   | Activities      |
| `menu.attendance`              | Attendance                                                   | Attendance      |
| `menu.welfare`                 | Welfare & Services                                           | Welfare         |
| `menu.notifications`           | Notifications                                                | Notifications   |
| `menu.profile`                 | My Profile                                                   | Profile         |
| `menu.register`                | Register                                                     | Register        |
| `menu.exit`                    | Exit                                                         | Exit            |
| `action.verify_contact`        | Verify contact                                               | Verify          |
| `status.verification_sent`     | A code was sent to <mask>. Open the link we sent.            | Code sent       |
| `error.verify_too_soon`        | A code was just sent. Try again shortly.                     | Too soon        |
| `error.verify_limit`           | Too many codes this hour. Try again later or ask the office. | Hour limit      |
| `error.not_sent`               | The code could not be sent. Ask the office.                  | Not sent        |
| `error.code_expired`           | That code has expired                                        | Expired         |
| `nav.back`                     | Back                                                         | Back            |
| `nav.more`                     | More                                                         | More            |
| `nav.main`                     | Main menu                                                    | Main            |
| `action.give`                  | Give                                                         | Give            |
| `action.pledge`                | Pledge                                                       | Pledge          |
| `action.my_pledges`            | My pledges                                                   | Pledges         |
| `action.my_payments`           | My payments                                                  | Payments        |
| `action.redeem`                | Redeem                                                       | Redeem          |
| `action.accept`                | Accept                                                       | Accept          |
| `action.change`                | Change                                                       | Change          |
| `action.pay`                   | Pay                                                          | Pay             |
| `prompt.amount`                | Enter amount                                                 | Amount          |
| `prompt.offerings`             | Choose offering(s)                                           | Offering(s)     |
| `prompt.split`                 | Split amount                                                 | Split           |
| `prompt.date`                  | Enter date DDMMYYYY                                          | Date (DDMMYYYY) |
| `prompt.expected_date`         | Expected date                                                | Due date        |
| `prompt.phone`                 | Enter phone number                                           | Phone           |
| `prompt.code`                  | Enter code                                                   | Code            |
| `prompt.name`                  | Enter name                                                   | Name            |
| `label.total`                  | Total                                                        | Total           |
| `label.reference`              | Reference                                                    | Ref             |
| `label.code`                   | Confirmation code                                            | Code            |
| `label.event`                  | Event                                                        | Event           |
| `label.day`                    | Day                                                          | Day             |
| `label.offering`               | Offering                                                     | Offering        |
| `label.amount`                 | Amount                                                       | Amount          |
| `label.currency`               | Currency                                                     | Currency        |
| `activities.today`             | Today                                                        | Today           |
| `activities.this_week`         | This week                                                    | This week       |
| `activities.a_date`            | A date                                                       | Date            |
| `activities.summary`           | Attendance summary                                           | Attendance      |
| `activities.give`              | Give to an offering                                          | Give            |
| `attendance.day`               | A specific day                                               | Day             |
| `attendance.period`            | Period summary                                               | Period          |
| `attendance.present`           | I was present                                                | Present         |
| `attendance.clocking`          | Clocking                                                     | Clock           |
| `attendance.clock_in`          | Clock in                                                     | Clock in        |
| `attendance.headcount`         | Headcount                                                    | Headcount       |
| `attendance.delegate`          | Delegate                                                     | Delegate        |
| `attendance.no_data`           | No attendance yet                                            | No attendance   |
| `label.attended`               | Attended                                                     | Present         |
| `label.roster`                 | Roster                                                       | Roster          |
| `label.male`                   | Male                                                         | Male            |
| `label.female`                 | Female                                                       | Female          |
| `label.children`               | Children                                                     | Children        |
| `label.window`                 | Last 5                                                       | Last 5          |
| `label.month`                  | This month                                                   | Month           |
| `prompt.reason`                | Enter reason                                                 | Reason          |
| `status.registered`            | Registration sent                                            | Registered      |
| `status.attendance_recorded`   | Attendance recorded                                          | Recorded        |
| `error.code_invalid`           | Invalid code                                                 | Bad code        |
| `error.code_used`              | Code already used                                            | Code used       |
| `error.session_closed`         | Session already closed                                       | Closed          |
| `error.session_not_today`      | Attendance is only for today                                 | Not today       |
| `error.not_shepherd`           | Not your member                                              | Not yours       |
| `error.not_senior`             | Not a senior presbyter                                       | Not senior      |
| `error.delegate_required`      | Delegate first                                               | Delegate        |
| `error.already_clocked`        | Already clocked in                                           | Clocked         |
| `status.regular`               | Regular                                                      | Regular         |
| `status.non_regular`           | Non-Regular                                                  | Non-reg         |
| `status.not_enough_data`       | Not enough data                                              | No data         |
| `welfare.my_services`          | My services                                                  | My plans        |
| `welfare.subscribe`            | Subscribe                                                    | Join            |
| `welfare.eligible`             | Eligible                                                     | Eligible        |
| `welfare.not_eligible`         | Not eligible                                                 | Not eligible    |
| `welfare.premium`              | Premium                                                      | Premium         |
| `welfare.payer_member`         | You pay                                                      | You pay         |
| `welfare.payer_church`         | Church pays                                                  | Church          |
| `welfare.cover`                | Cover                                                        | Cover           |
| `welfare.claimed`              | Total claimed                                                | Claimed         |
| `welfare.expired`              | Expired                                                      | Expired         |
| `welfare.until`                | Until                                                        | Until           |
| `welfare.paid_by_church`       | Paid by the church                                           | Church          |
| `welfare.cover_dependents`     | Cover dependents? 1 Yes 2 No                                 | Dependents?     |
| `welfare.no_dependents`        | No dependents                                                | None            |
| `welfare.no_services`          | No services                                                  | None            |
| `action.yes`                   | Yes                                                          | Yes             |
| `action.no`                    | No                                                           | No              |
| `label.spouse_husband`         | Husband                                                      | Husband         |
| `label.spouse_wife`            | Wife                                                         | Wife            |
| `profile.member_no`            | Member no.                                                   | Member no.      |
| `profile.gender`               | Gender                                                       | Gender          |
| `profile.age`                  | Age                                                          | Age             |
| `profile.dob`                  | Date of birth                                                | DOB             |
| `profile.ministries`           | Ministries                                                   | Ministries      |
| `profile.shepherd`             | Shepherd                                                     | Shepherd        |
| `profile.not_assigned`         | Not assigned                                                 | Not assigned    |
| `error.session_expired`        | Session expired                                              | Session expired |
| `error.too_many_tries`         | Too many attempts                                            | Too many tries  |
| `error.invalid_amount`         | Invalid amount                                               | Bad amount      |
| `error.invalid_date`           | Invalid date                                                 | Bad date        |
| `error.invalid_choice`         | Invalid choice                                               | Invalid         |
| `error.one_offering`           | Choose one offering                                          | One only        |
| `error.no_event`               | No event today                                               | No event        |
| `error.no_offering`            | No offerings today                                           | No offering     |
| `error.officer_required`       | No follow-up officer                                         | No officer      |
| `error.no_pledges`             | No pending pledges                                           | No pledges      |
| `status.payment_pending`       | Payment pending                                              | Pending         |
| `label.week`                   | This week                                                    | Week            |
| `label.adults`                 | Adults                                                       | Adults          |
| `label.as_of`                  | As of                                                        | As of           |
| `headcount.adult_service`      | Adult service                                                | Adult           |
| `headcount.children_service`   | Children service                                             | Children        |
| `headcount.visitors_service`   | Visitors                                                     | Visitors        |
| `headcount.presbyters_service` | Presbyters                                                   | Presbyters      |
| `prompt.headcount_visitors`    | Enter male,female,children                                   |                 |
| `prompt.headcount_adults`      | Enter male,female,children                                   |                 |
| `prompt.headcount_children`    | Enter male,female,adults                                     |                 |
| `label.last_mode`              | Last mode                                                    |                 |
| `prompt.headcount_presbyters`  | Enter elders,deaconess,deacons                               |                 |
| `label.elders`                 | Elders                                                       |                 |
| `label.deaconess`              | Deaconess                                                    |                 |
| `label.deacons`                | Deacons                                                      |                 |
| `notifications.empty`          | You have no notifications                                    | No messages     |
| `notifications.open_event`     | Open event                                                   | Open            |
| `notifications.mute_event`     | Mute this event                                              | Mute            |
| `notifications.mute_period`    | Mute this period                                             | Mute            |
| `notifications.mark_read`      | Mark read                                                    | Read            |
| `notifications.duration`       | How long? 1 30 days 2 90 days 3 A year                       | How long?       |
| `notifications.muted_until`    | Muted until                                                  | Muted           |
| `notifications.flier`          | A flier is in your email or WhatsApp                         | Flier sent      |
| `notifications.settings`       | Alert settings                                               | Settings        |
| `notifications.cadence`        | Cadence                                                      | Alerts          |
| `notifications.muted_items`    | Muted items                                                  | Muted           |
| `notifications.blocked`        | Blocked channels                                             | Blocked         |
| `notifications.unmute`         | Unmute                                                       | Unmute          |

- **Zero events today.** When the selected day has no applicable event, the screen says `0 events today`
  and names the next applicable day within a **14-day** horizon: day 1 renders `1 event tomorrow`/`2
events tomorrow`, days 2–14 render `in N days` (`2 events in 2 days` ... `2 events in 14 days`), and
  beyond 14 days it says `No upcoming events`. The line offers `1 View` those events and `2 This week`
  for the week list; an empty week says `0 events this week` (`activities.zero_week`) with `1 A date` and
  `9 Back`. The count and day phrase are computed values; the static words come from `label.event`,
  `label.events`, `label.tomorrow`, `label.in_days` and `label.no_upcoming`, composed
  with the count (`1 event`, `2 events`). The week list is always reachable, even when today is empty.
- Offerings are the active attachments of the chosen event and its series, minus detached, expired,
  skipped on that date or opted-out; at most five are shown plus `0 More` on the 182 reference, three on
  a channel whose offerings page size is three. The resolved display name is
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
  A pledge is never an offering and never creates one. If the caller selected more than one offering,
  the pledge path does not split: it re-prompts with "Choose one offering" and keeps the selection
  screen. The confirmation reference is the USSD-generated idempotency key, shown as the reference; no
  separate pledge reference is stored.
- The follow-up officer is the member's active shepherd, or an active presbyter the back office supplies
  with a reason; otherwise the pledge is refused with the existing `officer_required` code.
- "Redeem later": the member lists **their own** pending pledges and pays one. Redemption creates a
  single-offering payment group that carries the pledge. The callback marks the group and its
  contribution paid, sets `pledges.settled_contribution_id`, appends the `honored` event and flips the
  status in the **same** transaction; a failed or absent callback leaves the pledge pending. Because
  the pledge already passed the event/offering checks at creation, redemption reuses its offering,
  event, amount and currency and is exempt from the event-active, attachment, offering-expiry and
  session-date gates; a cancelled event after the pledge does not block honoring. A pledge settles at
  most once: the `payment_groups.pledge_id` partial unique index stops a second redemption group, and a
  second settlement is `409 pledge_already_terminal`. `POST /v1/pledges/{id}/settle` applies an existing
  **paid** contribution for back-office settlement: an identical repeat returns `200` with the stored
  settlement and appends no second event, while a different contribution on an already-settled pledge is
  `409 pledge_already_terminal`.
- The expected date is prompted as a date and confirmed in lay terms; a past date is refused before any
  write.

### Attendance: check, punch, clock, delegate, headcounts

- A member checks attendance for today, a specific day, or a period (month, quarter, year). The answer
  is a count and a per-event list, never fabricated absences. Checks, codes and clock-ins apply only to
  member-trackable events; a headcount-only event (`tracksMembers = false`) is listed in Activities with
  its current headcount and takes no per-member attendance.
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
- **Headcounts.** A presbyter or admin records a headcount for one session, shown as a labelled service
  mode: **Adult service** (`male,female,children`) or **Children service** (`male,female,adults`), with the
  session's last mode preselected. Two **specialised modes** are their own entries in the headcount menu
  rather than options inside those prompts, because they are counted at different moments and by different
  people: **Visitors** (`male,female,children`) and **Presbyters** (`elders,deaconess,deacons`). **Mixed
  service** is retired: no new count may be recorded in it, and an existing one stays readable and labelled
  **Mixed (retired)**. A session may hold one current count per mode, so an adults count and a children
  count coexist; the observation model, the reference data and the lane rules are
  `member-registrations-headcount.md`. The current observation screen names the mode, its `asOf` time and
  its count. USSD offers `1 New count` and
  `2 Correct`: a new count appends an observation with `asOf` now; a correction supersedes the current
  observation of that mode and keeps its original `asOf` (the moment counted), recording who corrected it
  and when.
  The entry is one labelled three-number line, accepting comma, slash or space separators, with a re-prompt
  on a malformed or out-of-range value and a lay restatement before save. Each bucket is 0–10,000 and the
  total at most 30,000; an all-zero observation is allowed. The model is append-only: a superseded
  observation is **not invalid** — it stays the valid record of the count at its `asOf` — and only the
  newest non-superseded row of a mode is "current" for that mode. The register-derived `expected` stays
  separate and is labelled
  **Roster**. A headcount is never derived from or fed into per-member attendance or regularity, and it
  is operator-only: a member never sees the aggregate headcount.
- Attendance summaries are read through one member-scoped aggregate for a window and a day, with the
  USSD rendering counts and the latest event first.

**24b screens.** Activities opens the applicable events for today (at most three plus `0 More` for the
week — two when the channel's declared `pageSize.events` is two; ordered date → priority tier → start time →
event number; `8 A date` accepts `DDMMYYYY`). With no
event today it shows `0 events today`, the next applicable day's count within a **two-week** horizon
(`2 events in 2 days`, or `1 event tomorrow`), and `1 View` those events, plus `2 This week`; beyond two
weeks it says `No upcoming events`. An empty week says `0 events this week` with `1 A date` and `9 Back`.
The week list is always reachable. A selected
event offers `1 Give` (the 24a giving flow with that event) and `2 Attendance`. Attendance opens today's
status; `1` a day, `2` a period (`1 Month`, `2 Quarter`,
`3 Year`), `3` I was present (six-digit code) and, for presbyters, `4` Clocking. Clocking offers `1`
Clock in (member number), `2` Headcount and `3` Delegate (member number then
reason). Headcount opens a menu naming the four lane entries - `1 Adult service`, `2 Children service`,
`3 Visitors`, `4 Presbyters` - and the chosen entry shows that lane's current count with its own `asOf`
time, then offers `1 New count` and `2 Correct`, and one labelled three-number prompt follows. A new count
appends with `asOf` now and supersedes that lane's current; a correction keeps the corrected observation's
`asOf` and supersedes it. The two ordinary modes remember the session's last mode and preselect it; a
specialised entry neither reads nor writes that memory, because it is counted at a different moment.
`Mixed service` is retired: no new count is recorded in it, and an existing one stays readable. My Profile renders the
shared identity label, member number, up to three ministries, the
attendance line and the shepherd. The anonymous Register entry prompts code, first name, last name and
returns the request reference. Registration approval and code issuance are portal actions (24d), not
USSD.

### Subscriptions and claims

- Welfare services become **products** (`subscription_products`): code, name, description, premium,
  currency, active flag, and eligibility rules — minimum days since `joinedOn`, a membership card on
  file, a verified member, gender, and age from `dob`.
- Members gain `membership_card_no` and `verified_at`; both are back-office fields. `members.verified_at`
  is inert history (the officer confirmation lives in `member_confirmations`); a proven email or
  WhatsApp contact lives on `member_contacts.verified_at`, and `requires_verified` accepts an
  email/WhatsApp proof or an active confirmation (member-record spec, Phase 3).
- A product also carries **how it is paid and who is covered**: `paymentMode` (`member`, `church` or
  `either`), `periodMonths` (1, 2, 3, 6 or 12), `covers` (`individual` or `household`), `maxDependents`
  and `allowedRelationships` (a subset of `spouse`, `child`, `parent`, `guardian`, `other`).
- A subscription records the **payer** (`paidBy`: `member` or `church`), the covered period
  (`periodStart`, `periodEnd`) and the premium (`premiumMinor`, null for a church-paid period).
  `startedOn` is when the relationship began and `endedOn` the explicit end; `periodEnd` is when cover
  lapses unless renewed. A product priced `either` is never offered for USSD self-subscription; the back
  office starts it and sets the payer on each subscription policy. The member never chooses `member` or
  `church`.
- **Church-paid** cover is started or renewed by the back office for a period; there is no member
  payment. **Member-paid** cover has one `subscription_payments` row per period (amount, period,
  channel, reference, paid on, recorded by); paying advances `periodEnd`. An unpaid period leaves the
  subscription expired at `periodEnd`, and the USSD "My services" shows it as expired.
- **Coverage.** A household product covers the member plus up to `maxDependents` active members joined by
  an allowed relationship (an existing explicit relationship edge, never derived). `allowedRelationships`
  is read from the policyholder to the covered member, and the stored edge is normalised to that
  direction (a covered-member-declared `child` edge normalises to `parent` from the policyholder;
  spouse/guardian/other are neutral). Adding a dependent beyond the cap, with a disallowed relationship,
  or a non-active member is `422 validation_error`. An individual product covers the member only.
  Coverage is explicit `subscription_coverage` rows — a financial fact, never inferred from the
  household.
- USSD lists **only eligible products** for the caller and shows the premium, period, payer and cover in
  lay terms. A household product asks "Cover dependents? 1 Yes 2 No" and lists the eligible dependents
  up to the cap. The **Subscribe** list contains only products whose `paymentMode` is `member`; a
  self-subscription to one of those resolves `paid_by` to `member` automatically. A `church`-paid plan
  is started or renewed by the back office, never self-started by the member, and appears in "My
  services" as "Paid by the church" with no payment. A product priced `either` is never offered for
  self-subscription: the back office starts it and resolves the payer per subscription. The member flow
  follows the resolved payer and never asks who pays. "My services" shows status, paid by, period and
  expiry. An ineligible product is hidden, never refused after entry.
- **Inherited cover.** A member covered by another member's subscription sees it in "My services" as
  inherited, labelled with the relationship from the covered member to the policyholder: `spouse`
  renders Husband or Wife from gender, otherwise the relationship type. The policyholder's identity
  uses the shared label inside the same parentheses, never a nested pair — for example
  "Life Cover (Husband · Solomon, Male, 32y)". Inherited rows are read-only in USSD (the policyholder
  manages the plan); the list and detail show status, payer, period and total claimed. The member
  subscription read (`GET /v1/members/{memberNo}/subscriptions`) returns owned and inherited rows with
  `source: 'owned' | 'inherited'`, `policyholder: { memberNo, name, gender, age } | null` and
  `relationship: string | null`.
- Claims are back-office records (`subscription_claims`): amount, reason, status, recorded by and
  decided by. "Total claimed" is the sum of approved/paid claims for the subscription.

### My profile

- **My profile.** The member menu's last entry shows a compact profile: the shared identity label
  `FullName (Gender, Ny)` (the UI label rule: `undisclosed` omitted, `age` null when `dob` is unknown
  or in the future), the member number, up to three ministry names, the attendance line and the
  shepherd. The label is composed from the DTO by the channel; the separate gender/age line is never
  repeated. The API returns one aggregate: `GET
/v1/members/{memberNo}/profile` → `{ memberNo, name, gender, age: number | null, ministries: [name],
shepherd: { memberNo, name, gender, age } | null, attendance: { status: 'regular' | 'non_regular' |
'not_enough_data', attended,
expected, window: 5, lastAttendedOn: string | null } }`. `attendance` counts the member's **tracked** attendance
  across the events that apply to them: a session is in scope when the member **matches that event's
  audience at the session's date** - the same predicate the roster and every other member-facing read use
  (`member-registrations-event-audience.md`, A-3 and A-4), so there is one rule and one read - and only where the
  event is **member-trackable** (`tracksMembers = true`). The window is the last five **held** scoped sessions
  ending today: a session is held when its date is on or before the event's today in the event's timezone and the
  session is not cancelled; sessions are ordered by date, then event `start_time`, then event id. **Floor:** the
  register's own join rule applies and nothing else - a member is in the register from its member record's creation
  date when `joined_on` is null - so the ministry `assigned_on` floor this calculation used to apply is **gone**
  (2026-11-24), as is the "general event" scope it used to combine with. The floor applies to this regularity
  calculation only; the day, period and per-event views keep showing the actual records. A presbyter-only session is
  no longer special-cased: the audience decides, so a non-presbyter is out of scope by the rule rather than by a
  branch. With **fewer
  than three** held scoped sessions the status is `not_enough_data`; otherwise `regular` when
  `attended / expected >= 0.6` (60%) and `non_regular` when below it. `expected` is the window size (up
  to 5) and `attended` is the number present, both reported in every status. `lastAttendedOn` is the most recent attended date in scope. A
  headcount-only event never counts, and attendance at an event whose audience the member does not match at that
  session's date does not count either - the audience decides, not a ministry the member may or may not hold.
  With no scoped sessions the status is `not_enough_data`, `attended` and `expected`
  are `0`, the date is null, and the screen says "No attendance" (`attendance.no_data`); with one or two
  it shows "No data" (`status.not_enough_data`) with the ratio and, when `lastAttendedOn` is set, the
  date (for example, "No data · 2 of 2 · 5 Oct 2026"); when nothing was attended it shows "No data · 0
  of 1". A
  floored session is dropped from the held-session window entirely, so it is neither an `expected` nor
  an `attended` session. The shepherd is the active shepherding
  assignment's officer, or null ("Not assigned"). One request, `no-store`.

### Payments and the gateway stub

- A payment group is created for every USSD money commit: one total, one currency, one idempotency key,
  and the contributions underneath it. The group is `pending` until the callback marks it `paid`, or
  `failed` from the gateway; a group is never partially paid. Its reference is the confirmation code.
  A split commit writes all child contributions in one transaction under the group, so the rows are
  all-or-nothing; they start `initiated`.
- The gateway receives the terms payload — payer (member number or phone hash), total, currency,
  reference, and each offering with name, amount and terms version — as one intent per group (status
  `initiated`, `paid` or `failed`), and returns initiated. The callback body is
  `{ reference, status: 'paid' | 'failed', amountMinor, currency, occurredAt }`, signed with the shared
  secret over the raw body.
- **Callback results.** An invalid or missing signature is `401 unauthorized`; a malformed body is `422
validation_error`; an unknown gateway reference is `404 not_found`; an amount or currency that differs
  from the group is `422 validation_error` and writes nothing. A `paid` callback marks the intent, the
  group and every child contribution `paid` in one transaction and answers `200 { status: 'paid',
duplicate: false }`; when the group carries `pledge_id`, the same transaction also applies the
  redemption branch in **Pledges and redemption** (set `settled_contribution_id`, append `honored`,
  flip the status). A repeated `paid` callback answers `200 { status: 'paid', duplicate: true }`
  without a second write. A `failed` callback marks the intent and group `failed` and every child
  contribution `failed`, and is idempotent the same way. A terminal intent never moves to another
  status.
- The stub gateway is an in-process adapter behind a `PaymentGateway` port: it records an intent and can
  be driven from the simulator. The callback is a **new** route at `/v1/payments/callback`, signature-
  verified and idempotent by gateway reference. No card data is stored, ever.
- USSD is disabled in production by configuration until a real aggregator and gateway exist.

### 24d: the operator app, the simulator and provider adapters

**Scope.** This subsection specifies the operator-app simulator and the provider-adapter layer. The
operator pages themselves — **Codes**, **Registrations**, **Clocking**, **Headcount**,
**Products** and **Claims** (Complaints once 24e lands) — are scoped in ticket 24d and specified there;
only their existence as one USSD nav section is fixed here.

**One pipeline, per-provider adapters.** A USSD provider is reached through a thin adapter route. The
adapter converts the provider's wire format into the internal frame `{ phone, sessionId?, input, seq }`
— an absent `sessionId` means a fresh session, existing behaviour — runs the **same** session pipeline
as `POST /ussd/session` (the route handler is factored to expose that pipeline; the session machine,
glossary, repositories and services are untouched) and converts the internal render `{ sessionId, text,
done, state, options? }` back into the provider's wire DTO. An adapter is a declaration — `{ id, route,
authenticator, toFrame, toWire, maxMsgChars, pageSize }` — not a branch in the machine. Adding provider C is one
adapter plus one line in `buildUssdAdapters`; the machine, the glossary, the repositories and the services do not
change. The wiring around the declaration does, and it is priced **per configuration knob** so "one adapter"
is not read as "one file": each setting a provider needs adds a schema entry and a default in
`src/config/env.ts` (plus a production check when the default is unsafe), a field threaded through
`src/create-app.ts`, a read in `src/index.ts` and a `.env.example` line — Nalo's two settings meant each of
those twice and one production check — plus the surfaces that describe or probe the routes: the
per-route OpenAPI descriptions, `scripts/smoke.mjs` and the tests. The Nalo adoption is the measured
precedent, read with care: `e532812` changed nineteen files, and much of that commit built the
declaration contract itself (the new `src/ussd/pipeline.ts`, the rewritten route module, the dev gateway
and the adapter tests), with the adapter and its registry line in one file, `src/ussd/adapters.ts`. What
provider C repeats is the adapter, the registry line and the wiring priced above.

- `id` — a stable provider identifier (`nalo`, `hmac`).
- `route` — the mount path the provider's gateway calls.
- `authenticator` — verifies the inbound request against configured secrets before any session work; a
  failure answers `401 unauthorized` and writes nothing.
- `toFrame` — maps the provider wire to the internal frame.
- `toWire` — maps the internal render to the provider wire DTO.
- `maxMsgChars` — the provider's published per-message character cap, overridable in configuration.
  It is also the **budget** the machine renders that provider's screens to (see "Message limits and
  truncation").
- `pageSize` — how many paged rows the channel renders, per list: `{ events, offerings, notifications }` is
  `{ 3, 5, 5 }` for the 182 reference and `{ 2, 3, 3 }` for Nalo's 120. The machine renders exactly the
  supplied size; it never inspects a message cap.

**The two adapters.** Two adapters ship: the **Nalo** adapter (below) and the existing **HMAC reference
adapter** — the current `POST /ussd/session` entry, which authenticates with the HMAC-SHA-256 signature
over `timestamp + nonce + body` using `USSD_GATEWAY_SECRET` and keeps its nonce replay guard. The
simulator offers both in a provider dropdown.

**Provider table.** Every provider the pipeline can be pointed at, with the one number that decides
whether a screen fits. `ships` is what the code declares today; `option` is a prospective row — its
route and config names are the ones adoption would use, and nothing by those names exists yet —
specified so the next provider is one adapter and one registry line — plus the config and documentation
wiring the declaration contract prices — rather than a redesign.

| id       | route                             | auth                                                                 | `maxMsgChars`                                    | `pageSize`    | status |
| -------- | --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ | ------------- | ------ |
| `hmac`   | `POST /ussd/session`              | HMAC-SHA-256 over `timestamp + nonce + body` (`USSD_GATEWAY_SECRET`) | 182 — the 7-bit payload cap (see the note below) | `{ 3, 5, 5 }` | ships  |
| `nalo`   | `POST /ussd/nalo`                 | configured `USERID`, no signature                                    | 120, `USSD_NALO_MAX_MSG_CHARS` (1–182)           | `{ 2, 3, 3 }` | ships  |
| `hubtel` | when adopted: `POST /ussd/hubtel` | **not settled** — see the option below                               | 182; planned `USSD_HUBTEL_MAX_MSG_CHARS` (1–182) | `{ 3, 5, 5 }` | option |

**Hubtel (option, not adopted).** Hubtel is a candidate aggregator, specified here so the choice is a
row rather than a rediscovery. This row adds **no route, no migration and no config of its own** to what
ships today. Adoption is one adapter, one registry line, the config wiring the declaration contract above
prices (a schema entry and default per setting, its `create-app` fields, its `index` reads, its `.env`
lines) and the descriptive surfaces (the route's OpenAPI description, a smoke probe, the tests) — none of
which this row writes.

- **The number is 182, and it is published.** Hubtel's Mobile Messaging Terms define a USSD message as
  a "182-character alphanumeric (including spaces) session-based message" and require that anything
  longer "will be cut off at the valid number of characters" — an enforced ceiling, not a style guide.
  The v1 API reference is read here **through a mirror**: `code.hubtel.com` answered 403 to the network
  that did this reading, so every claim about that reference in this row is a mirror claim, not a
  direct quotation. On that reading the reference states no cap for the `Message` field at all, which
  leaves the terms as the only attested figure; 120 is **not** a Hubtel number and must not be cited
  as one.
- **182 is also the channel baseline.** USSD user data is 160 octets, which is 182 characters under
  GSM 7-bit packing (`(160 × 8) / 7 = 182.8`). That is why the HMAC reference and the machine's
  internal budget already use 182; Hubtel coincides with the reference rather than narrowing it.
- **7 bit is the assumption, and the shipped screens already leave it.** The same 160 octets hold only
  80 characters outside GSM-7, so a screen with a non-GSM glyph cannot be carried in 7 bits at all and is
  either rejected or sent in UCS-2, whatever `maxMsgChars` says; `truncateMessage` counts code units and
  would not notice. That is not a Hubtel-side rule an adapter can keep on its own: the screens that ship
  today already contain `·`, which `src/ussd/machine.ts` composes into six strings — the confirm screen's
  amount-and-total subject, the welfare cover line, the payer line, the activity attendance line (two
  separators, one rendered line) and the headcount stamp — and `…`, from `truncate()` in
  `src/ussd/format.ts` and `truncateMessage` in `src/ussd/adapters.ts`. Neither glyph is in the GSM 7-bit
  alphabet, and neither comes from `src/ussd/glossary.ts`, whose strings are the static half. Staying
  inside the 7-bit budget is therefore a change to the **shared screen composition** (an
  ASCII-or-representable rule with a per-screen budget to match). It is recorded in
  `documents/backlog.md`, and on 2026-11-24 the owner placed the fix as the **next USSD round**; this
  row promises none of it. That round is wider than composition, because the spec names the marker in
  places a fix must move with it: the Nalo adapter's "To the wire" bullet (`MSG` "truncated … with `…`
  when it is longer"), the "A screen that reaches the cut at a declared budget is a defect" paragraph,
  where `truncateMessage`'s marker is the documented fallback for a deliberately narrowed cap, the
  display glossary's rule that a long value is "truncated to that width with `…`", which binds
  `truncate()`, and the Nalo route's OpenAPI description; the compact-subject example under "Fixed order
  under pressure" prescribes the `·` this bullet indicts. The mirrored v1 guide reports a `UUE`
  invalid-response for a single `É` in `Message`; `É` is itself a GSM 7-bit character, so that is evidence
  about the platform's own validation, not about the 7-bit boundary this bullet describes.
- **No prefix tax.** The wire shape assumed here is `Type`, `Sequence`, `ClientState`, `SessionId`,
  `Message` — taken from Hubtel's .NET SDK README and a third-party Ghanaian developer doc, **not**
  from the mirrored reference, so it is a working assumption to confirm. On that shape Hubtel
  continues or releases with a JSON `Type` (`response` or `release`; requests are `Initiation`,
  `Response` or `Timeout`), not with a `CON `/`END ` prefix, so the whole 182 characters are display
  text; `\n` is the line break and is assumed to spend one character, which the open items below
  test. `Sequence` and the echoed `ClientState` carry session state, and the gateway `SessionId`
  maps to `ussd_sessions.external_id` under `(provider, external_id)`, as `nalo` does with
  `SESSIONID`.
- **Open until a sandbox answers them.** The exact cut-off (send 150, 182, 183 and 200 characters and
  see whether Hubtel truncates or paginates — at least one Ghanaian platform answers a long screen
  with a "99. Next" page); whether a newline spends one character or none; the inbound authentication
  contract, which the mirrored reference does not describe; and the five-second response deadline the
  SDK README states for the application. Until the first and third are answered the row is an option,
  not a decision.

**Nalo adapter** (`POST /ussd/nalo`, provider Nalo Solutions). The inbound request is JSON and carries
`USERID` (the Nalo-issued client id), `MSISDN` (the caller number), `USERDATA` (the keypress/text, at
most 120 characters, empty or absent on the first request), `MSGTYPE` (a boolean — `true` on a
first-time request, `false` on a continuation), `NETWORK` and `SESSIONID` (the gateway session id,
reliably present). There is no signature and no HMAC; trust is the configured `USERID` alone, and no
shared-secret header is invented.

- **Authentication.** `USERID` is matched against the configured `USSD_NALO_USER_ID` (1–32 characters,
  dev default `NALOTest`, production required and must differ from the default; this is a client
  identifier, not a secret, so it does not use the `.min(16)` secret rule). A mismatch answers `401
unauthorized`; a malformed body answers `422 validation_error`; neither writes anything.
- **To the internal frame.** `MSISDN` becomes `phone` (normalised); `USERDATA` becomes `input`.
  `MSGTYPE` is accepted as the provider's fresh/continue signal, but resolution is by `SESSIONID`
  against `(provider, external_id)`: a present id that resolves to a live session continues it even
  on a re-delivered first frame, and only an unresolvable id starts a fresh session. `USERDATA`
  longer than the pipeline's 64-character input cap is `422 validation_error` - a documented
  narrowing of Nalo's 120-character allowance. Nalo sends no frame counter, so the adapter assigns the
  next sequence number from the stored session counter.
- **Session correlation.** The gateway `SESSIONID` is the session's identity. Migration `0016` adds
  `ussd_sessions.external_id` (`text`, partial unique when present); the adapter stores the gateway id
  there when it creates the session (the first frame) and resolves it to the internal uuid on
  continuations, so replay and duplicate semantics match the gateway. The response omits `SESSIONID`
  exactly as the provider documents; the gateway correlates server-side.
- **Re-delivery.** Nalo's frames carry no counter, so the pipeline's `seq` replay guard cannot
  distinguish a gateway re-delivery from a repeated keypress. Each continuation advances exactly once.
  A re-delivered money commit is still safe: the pending commit key is created when the confirmation
  screen is rendered and stored in the session context, so every Accept frame for that confirmation
  reuses the same key and returns the same payment group. A re-delivered non-money frame may advance
  one screen; this provider limitation is documented, not papered over.
- **To the wire.** The response is JSON and carries `USERID` (echo, mandatory), `MSISDN` (optional
  echo), `MSG` (mandatory) and `MSGTYPE` (boolean). `MSG` is the internal `text` truncated to
  `maxMsgChars` (Nalo publishes 120) with `…` when it is longer. `MSGTYPE` is `!done`: `true` keeps the
  session open, `false` releases it.

**Message limits and truncation.** The screen budget is **not** a constant: the adapter that owns a
frame supplies its `maxMsgChars` as the frame's `budget`, so the machine lays every screen out to the
provider it is answering, within the internal ceiling (menu label ≤ 16, prompt line ≤ 60, screen
≤ 182 including the footer). `budget` is **per frame and never persisted**: it belongs beside
`pageSize` on the session info the adapter rebuilds on every call, not on the stored session context,
so a session that began on one provider cannot carry a stale budget into another. A frame with no
declared cap renders to 182, which is the HMAC reference's budget. The channel also supplies its
declared `pageSize` (`{ 3, 5, 5 }` at 182, `{ 2, 3, 3 }` at Nalo's 120): `pageSize` is an adapter field, **not**
derived from `budget`, and the machine renders exactly the supplied size. The machine receives both
numbers as supplied and reads no cap to derive either. Fitting `maxMsgChars` is not by itself a
delivered screen: the shipped screens also carry glyphs outside the GSM 7-bit alphabet (`·`, `…`), and
a channel that cannot represent them encodes the frame as UCS-2 or rejects it, where 160 octets hold 80
characters instead of 182 (see the provider table's 7-bit note and `documents/backlog.md`).

**A screen that reaches the cut at a declared budget is a defect.** `truncateMessage` stays: an adapter
must still fit its `MSG` to the provider's cap, and `USSD_NALO_MAX_MSG_CHARS` lets an operator lower
Nalo's 120 (1–182). At the two **declared** budgets, 182 and 120, a renderer is expected to fit the
budget it was given, so a delivered screen ending in the truncation marker is a layout bug, not a
provider limitation — and the guard below pins exactly those two. A configured cap below a screen's
minimum re-admits the cut, and there the marker is the documented fallback rather than a bug; that
configuration is a deliberate narrowing, not the shipped layout. The 2026-11-22 defect that made this
a rule: the profile screen emitted 169 characters in its short form, a Nalo frame cut it at 120
mid-word, and `1 Verify contact` — the only route to a member's verification — was the line the cut
removed, so on the default provider the action was undiscoverable.

**Fixed order under pressure.** Every screen declares its line order, and four sections are protected:
the action lines, the navigation footer (`9 Back`, `00 Main menu`, `0 More`), the `done` screen's
confirmation and the **subject of a confirm screen** — the amount, or the amounts, it is confirming and
their total. The profile renders its identity line (name, gender, age), then the action lines
(`1 Verify contact`), then the data lines (member number, ministries, attendance, shepherd). When a
budget cannot hold every line, whole lines are dropped from the **end of the data section upward**;
no line is cut mid-word, and neither the action lines nor the footer are ever dropped to make room. A
screen whose protected sections alone exceed a declared budget is a defect in that screen's design,
not a truncation. A confirm screen whose full sentence does not fit renders its **compact** subject
instead: the amounts in selection order, then the total, on one line (`GHS 30.00, GHS 20.00 · Total
GHS 50.00`). The offering names may be omitted there — the selection screen named them a keypress
earlier — but an amount and the total are never dropped, and a confirm screen never shows its actions
without its subject. The same rule binds every action-bearing screen — Offerings, Activities, Attendance,
Welfare & Services, Payments — where the action line precedes the data it would otherwise compete
with, and it binds the screens without actions by dropping their data lines whole.

**The guard.** A property test renders every state the menu tree can reach at budgets 182 and 120 and
asserts two things: the text fits the budget, and every **action the state accepts** — every key in the
rendered `options`, navigation keys included — is named in the text. A state that accepts no keys
(`done`, a terminal `error`) passes the action half vacuously and is still held to the budget. A new screen, or a longer label, fails it before a member
meets the cut. Nalo's published cap remains 120, overridable by `USSD_NALO_MAX_MSG_CHARS` (integer
1–182, default 120).

**`POST /dev/ussd/session` — the dev-only gateway.** This entry plays the gateway for the simulator. Its
request is `{ provider: 'nalo' | 'hmac', phone, input, sessionId?, seq? }`, where `sessionId` is the value
the previous response returned (omitted on the first frame) and `seq` is the optional HMAC frame counter
(absent → the next stored sequence); its response is `{ provider, sessionId, text, done, state, wire }`,
where `text` is the provider's display text (`MSG` for Nalo, `text` for HMAC) and `wire` is the exact
provider wire object the adapter produced (for Nalo
`{ USERID, MSISDN?, MSG, MSGTYPE }`; for the HMAC adapter the canonical render the signed entry
returns). It builds the provider wire **server-side** — a fresh HMAC timestamp and nonce per forwarded
frame, or the Nalo JSON — runs the matching adapter through the same execution seam as its provider
route, and does not rewrite the route's status: `401`, `422`, `429` and `503 ussd_disabled` propagate
as the same problem+json. It refuses when `NODE_ENV=production` (`404 not_found`), independent of the
`USSD_ENABLED` switch. The gateway secret is never sent to the browser. It is a development-only tool,
not part of the browser API surface, so it stays out of OpenAPI.

**Production off-switch.** Every provider route sits behind `USSD_ENABLED`, which defaults to `false`;
when off the route answers `503 ussd_disabled` and writes nothing. USSD is forced off in production
until a real aggregator contract exists. `POST /dev/ussd/session` additionally refuses in production as
above. Both gates are tested.

**The Simulator page.** A dev-only page in the operator app offers a provider dropdown (Nalo, HMAC
reference) and a handset-style display. It opens on `nalo` — the provider whose budget shapes the
layout — and HMAC stays selectable; the default is a demonstration choice, not a cap. It posts each keypress to `POST /dev/ussd/session`, renders the
returned screen text as a caller would see it — including the provider's real truncation — and exposes
the stub payment gateway's callback so a commit can be completed end to end: it shows the commit
reference, the callback body and a signed-callback shell template, while the signature itself stays
server-side (the browser never holds `PAYMENT_GATEWAY_SECRET`). It drives the real adapters
and the real session pipeline; it is never a mock for acceptance. The static `mockups/ussd` simulator
remains a review artifact.

## Data model additions

| Table / column                    | Shape                                                                                                                                                                                                                                                                                                          | Constraints                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `members.presbyter_rank`          | `integer` nullable                                                                                                                                                                                                                                                                                             | admin-set; requires `is_presbyter`                                                                                                                                                                                                                                                                                                                                                    |
| `members.membership_card_no`      | `text` nullable                                                                                                                                                                                                                                                                                                | back-office field                                                                                                                                                                                                                                                                                                                                                                     |
| `members.verified_at`             | `timestamptz` nullable                                                                                                                                                                                                                                                                                         | inert history; the officer confirmation lives in `member_confirmations`, never this column                                                                                                                                                                                                                                                                                            |
| `ussd_sessions`                   | `id`, `phone_hash`, `member_id` nullable, `anonymous`, `state`, `context` jsonb, `provider`, `external_id` nullable, `last_input_seq`, `expires_at`, timestamps                                                                                                                                                | 3-minute idle TTL; no raw phone; `provider` defaults to `hmac`; `(provider, external_id)` is partial unique when `external_id` is present                                                                                                                                                                                                                                             |
| `ussd_nonces`                     | `nonce` primary key, `seen_at`, `expires_at`                                                                                                                                                                                                                                                                   | replay guard; pruned after 10 minutes                                                                                                                                                                                                                                                                                                                                                 |
| `attendance_codes`                | `id`, `code_hash`, `purpose`, `event_instance_id`, `session_date`, `issued_by`, `issued_at`, `expires_at`, `used_at`, `used_by_member_id`, `registration_request_id`, `voided_at`                                                                                                                              | hash only; single use; TTL                                                                                                                                                                                                                                                                                                                                                            |
| `registration_requests`           | `id`, `reference` unique, `first_name`, `last_name`, `phone_hash`, `phone_encrypted` nullable, `event_instance_id`, `session_date`, `code_id`, `status`, `created_at`, `decided_by`, `decided_at`                                                                                                              | no member until approved; the number is retained encrypted under `REGISTRATION_PHONE_KEY` and erased on approve/reject/purge; the hash remains for the rate limit and the reference; never returned raw                                                                                                                                                                               |
| `clocking_delegations`            | `id`, `event_instance_id`, `session_date`, `from_member_id`, `to_member_id`, `reason`, `created_at`, `created_by`, `ended_at`                                                                                                                                                                                  | one active per session; ends with the session                                                                                                                                                                                                                                                                                                                                         |
| `event_session_headcounts`        | `id`, `event_instance_id`, `session_date`, `as_of`, `mode` (`adults`/`children`/`mixed`), `ended` (boolean, default false), `adult_male`, `adult_female`, `adult_unspecified`, `child_male`, `child_female`, `child_unspecified`, `total`, `recorded_by`, `recorded_at`, `supersedes_id` nullable              | append-only; buckets check against `mode`, each 0–10,000, `total` = sum of six and ≤30,000; `as_of` within the session day; `ended` marks a historical explicit close (legacy rows) — a new close is the end-only attendance import and is never set automatically; `supersedes_id` unique when present, same session, non-superseded; a superseded row remains valid for its `as_of` |
| `event_instances.presbyter_only`  | `boolean` not null default `false`                                                                                                                                                                                                                                                                             | non-presbyters cannot attend or open; the roster is the active presbyters                                                                                                                                                                                                                                                                                                             |
| `event_series.presbyter_only`     | `boolean` not null default `false`                                                                                                                                                                                                                                                                             | templates generated instances                                                                                                                                                                                                                                                                                                                                                         |
| `payment_groups`                  | `id`, `reference` unique, `idempotency_key` unique, `total_minor`, `currency`, `status` (`pending`/`paid`/`failed`), `pledge_id` nullable, `created_at`, `created_by`                                                                                                                                          | one gateway charge per group; never partially paid; `pledge_id` is unique when present (one redemption group per pledge)                                                                                                                                                                                                                                                              |
| `payment_intents`                 | `id`, `payment_group_id` unique, `gateway`, `reference` unique, `status` (`initiated`/`paid`/`failed`), `raw_callback_hash`                                                                                                                                                                                    | unique gateway reference; one per group                                                                                                                                                                                                                                                                                                                                               |
| `contributions.payment_group_id`  | `uuid` nullable                                                                                                                                                                                                                                                                                                | FK to `payment_groups`                                                                                                                                                                                                                                                                                                                                                                |
| `pledges.settled_contribution_id` | `uuid` nullable                                                                                                                                                                                                                                                                                                | unique when present; set once when settled by USSD                                                                                                                                                                                                                                                                                                                                    |
| `subscription_products`           | `id`, `code` unique, `name`, `description`, `active`, `premium_minor`, `currency`, `payment_mode`, `period_months`, `covers`, `max_dependents`, `allowed_relationships`, `min_membership_days`, `requires_card`, `requires_verified`, `gender`, `min_age`, `max_age`, `created_by`, `updated_by`, `updated_at` | rules evaluated server-side; code unique case-insensitively; product active-toggle is audited                                                                                                                                                                                                                                                                                         |
| `subscriptions.kind`              | `text` nullable                                                                                                                                                                                                                                                                                                | legacy `life_insurance`/`credit_union` rows keep it; product rows leave it null (exactly one of `kind`/`product_id` is set)                                                                                                                                                                                                                                                           |
| `subscriptions.product_id`        | `uuid` nullable                                                                                                                                                                                                                                                                                                | existing rows stay valid                                                                                                                                                                                                                                                                                                                                                              |
| `subscriptions.premium_minor`     | `bigint` nullable                                                                                                                                                                                                                                                                                              | null for a church-paid period and legacy rows                                                                                                                                                                                                                                                                                                                                         |
| `subscriptions.paid_by`           | `text` (`member` / `church`), nullable                                                                                                                                                                                                                                                                         | product rows set `member` or `church`; legacy rows stay null; never the member's choice                                                                                                                                                                                                                                                                                               |
| `subscriptions.period_start`      | `date` nullable                                                                                                                                                                                                                                                                                                | cover period start; null on legacy rows                                                                                                                                                                                                                                                                                                                                               |
| `subscriptions.period_end`        | `date` nullable                                                                                                                                                                                                                                                                                                | cover lapses here unless renewed; null on legacy rows                                                                                                                                                                                                                                                                                                                                 |
| `subscriptions.updated_by`        | `text` nullable                                                                                                                                                                                                                                                                                                | officer or actor that last changed the subscription                                                                                                                                                                                                                                                                                                                                   |
| `subscriptions.updated_at`        | `timestamptz` nullable                                                                                                                                                                                                                                                                                         | set on create, renew, end and coverage changes                                                                                                                                                                                                                                                                                                                                        |
| `subscription_payments`           | `id`, `subscription_id`, `period_start`, `period_end`, `amount_minor`, `currency`, `channel` (`app`/`ussd`/`manual`), `reference`, `paid_at`, `recorded_by`, `idempotency_key`                                                                                                                                 | member-paid periods; unique `(subscription_id, period_start)`; unique `idempotency_key`; premiums recorded, not transacted                                                                                                                                                                                                                                                            |
| `subscription_coverage`           | `subscription_id`, `member_id`                                                                                                                                                                                                                                                                                 | existing: explicit covered members, never derived                                                                                                                                                                                                                                                                                                                                     |
| `subscription_claims`             | `id`, `subscription_id`, `member_id`, `amount_minor`, `reason`, `status` (`pending`/`approved`/`rejected`/`paid`), `recorded_by`, `recorded_at`, `decided_by`, `decided_at`, `decision_note`                                                                                                                   | `pending → approved/rejected`, `approved → paid`; approved + paid sum to "total claimed"                                                                                                                                                                                                                                                                                              |

## Testing Decisions

- **Good tests** assert external behaviour only: the exact menu text and next state from
  `POST /ussd/session`, the persisted rows behind it, HTTP status and problem codes, and the
  confirmation code. No test reaches into the state machine's internals.
- **Seams.** One new seam at the USSD router - `POST /ussd/session` - covering identity, menus, giving,
  pledges, attendance, codes and subscriptions end to end. Behind it the shipped repository rules are
  reused, but the new operations get their own bearer-route seams: the payment-group commit (split
  contributions plus one intent), pledge settlement, the windowed member attendance and payment
  summaries, and the profile aggregate. Code redemption and registration-request creation stay inside
  `POST /ussd/session`. The 24d provider routes (`POST /ussd/nalo`) and the dev-only
  `POST /dev/ussd/session` are tested through the real app: the Nalo wire in and out, the `USSD_ENABLED`
  `503 ussd_disabled` gate, the production refusal, `maxMsgChars` truncation at the exact cap, the
  `external_id` mapping, and a re-delivered Accept returning the same group. The gateway callback is a
  new signature-verified seam at
  `/v1/payments/callback` with its own idempotency tests. Code issuance/void, registration
  approval/rejection, delegation, headcounts and claims are bearer-protected admin seams, tested
  there.
- **Prior art.** Route-level Supertest + PGlite tests like `tests/api/attendances`,
  `contributions` and `offerings`: one app instance, real migrations, real rows asserted by query.
  The USSD tests drive the menu as a sequence of input frames and assert the prompts.
- **Mocks are not tests.** The simulator in `mockups/` is a review artifact.

## Out of Scope

- A production USSD aggregator or shortcode, and a production payment gateway (both stubs).
- Card data, PCI scope, refunds and settlement (unchanged from the offerings spec).
- The mobile app and the richer mobile views (V5).
- Self-service profile editing, contact changes or member-number creation from USSD.
- Complaints (Change of Profile, General Report, Event / Event Day, Offering) and the admin complaint
  queue — parked for a later round by the owner (2026-11-07; ticket 24e).
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
  group, pledge and redemption, confirmation code, stub gateway, display glossary). 24b — attendance
  (check, summaries, one-time codes, anonymous registration, clocking/delegation, headcounts)
  and the profile aggregate. 24c — subscriptions (products, eligibility, member card/verified fields,
  claims, USSD flows). 24d — the **real** USSD section of the operator app (Codes, Registrations,
  Clocking, Headcount, Products, Claims, and Complaints once 24e lands) plus the dev-only
  simulator page and `/dev/ussd/session`, never a mock for acceptance. 24e — complaints and the admin
  complaint queue, parked for a later round by the owner (2026-11-07), after 24d and 23 landed. 24a
  is the only ticket that must land before the simulator can be exercised against the real API. The
  menu arrives incrementally: 24a ships
  Offerings and Exit, 24b adds Register (anonymous), Activities, Attendance and My Profile, and 24c adds
  Welfare & Services; the anonymous and member menus above are the completed 24c shape.
- **V5 candidates** (identified, not in the USSD app): a mobile app with the full event calendar,
  offering browse beyond five, recurring gifts, family/group giving, profile editing, subscription
  claim history and uploads, notifications, pledge reminders, and richer attendance analytics. The
  spec's API decisions (payment groups, product eligibility, codes, delegations) are channel-neutral so
  V5 reuses them.
- **The mock index** in `mockups/ussd/` shows the simulator and the back-office surfaces; the committed
  durable record is this spec and the round docs, never the mock files.

## Change log

- 2026-11-27: the notifications surfaces join this spec, from `member-registrations-event-notifications.md`
  (N-11): the identified member's menu gains **Notifications** immediately before My Profile (the anonymous menu
  does not), the display glossary gains `menu.notifications` and the `notifications.*` keys its completeness test
  requires, and the per-list `pageSize` map gains the inbox list — 5 rows at 182, 3 at Nalo's 120. No screen is
  built here; the keys and the sizes are declared so the completeness and budget tests can cover them when it is.

- 2026-11-19: the member can start verification from USSD. An identified member with an owned contact
  and no proof opens `My Profile > Verify contact`; the register sends the code and the acceptance-page
  link to the resolved channel and renders the `verify.sent` notice (masked destination and the link
  instruction). The entry stays on the page; the officer path and the throttle are shared. This entry
  supersedes the retirement entry's no-action/no-state point. See `member-verification-initiation.md`.

- 2026-11-19: USSD verification is retired. Every channel (email, WhatsApp, phone) sends the code and
  a short link to the member acceptance page, where the member enters it; there is no `Verify contact`
  action, no `verify.*` state and no `0 Exit` exception. The earlier 2026-11-19 entry is superseded on
  that point; the identification/no-gate and registration-retention decisions stand.

- 2026-11-19: Phase 3's verification is reshaped. A registered number is identified, not gated; the
  email/WhatsApp code is entered in USSD at `My Profile > Verify contact`, and the phone code is
  accepted in the member acceptance page (SMS link). Proof is per contact (`member_contacts.verified_at`);
  `members.verified_at` is the officer confirmation with an audit. `registration_requests.phone_encrypted`
  retains the caller's number until the decision. The 2026-11-18 gate entry is superseded, and this entry's USSD step is superseded by the retirement
  entry above.

- 2026-11-19: vocabulary. "USSD" in this repository names the **phone-frame simulator** - the dark
  handset mock set (`mockups/ussd`, `simulator.html` + `capture.mjs`) - never the web portal or its
  `v2-*` sets; a new **Vocabulary** section records it. Clarifying only; no behaviour changes.

- 2026-11-18: the member-record spec's Phase 3 adds OTP verification and the USSD gate: a registered
  but unverified number sees `Verify your membership` (`1 Send code`, `2 Enter code`, `0 Exit`) and no
  member services until the code is accepted; the gate runs every frame; an anonymous number keeps the
  anonymous menu and visitor giving. `members.verified_at` gains a number hash and mask, and
  `member_verification_codes` stores one live code. The `0` key is Exit on the verification screen only.
  See `member-registrations-member-record.md` (MR-22..MR-35).

- 2026-11-11: a code punch obeys the clocking rule: a session already closed answers `409 session_closed`
  (`Closed`) and a session not dated today in the event timezone `422 validation_error` (`Not today`);
  neither refusal consumes the code. The glossary table carries both keys.

- 2026-11-11: the shared attendance capture model adds `ended` to `event_session_headcounts`: live is
  computed from the session date and window, the presbyter's End of session closes the session, and a
  headcount after the close answers `409 session_closed`. Migration `0020_attendance_captures`; 24e's
  expected migration keeps `0018`. **Superseded 2026-11-22:** a capture never ends a session; only the
  operator's explicit **End session** does, it is optional, and nothing enforces it.

- 2026-11-08: the MVP's offering-count migration takes `0017`, so 24e's expected migration moves to
  `0018`; nothing behavioural changes in this spec.
- 2026-11-07: the owner parked ticket 24e (USSD complaints and the admin queue) for a later round
  instead of opening it after 24d and 23. Nothing behavioural changes: the out-of-scope list and the
  ticket split now say "parked" rather than "deferred to the last round". The ticket keeps its settled
  shape; its expected migration (0018) and the wire routes still need explicit authorisation when a
  round is scheduled.
- 2026-11-06: 24d slice B1 implements the adapter layer. `POST /ussd/nalo` and
  `POST /ussd/session` are thin declarations over one shared session pipeline; the Nalo adapter
  authenticates on `USERID` alone, stores `SESSIONID` as `external_id` under provider `nalo`, assigns
  the next stored sequence on each continuation, omits `SESSIONID` from the reply and truncates `MSG`
  to `USSD_NALO_MAX_MSG_CHARS` (default 120) with `…` only when needed. The declared `pageSize` now
  reaches both paged lists: Activities renders `events` rows and the offering list renders `offerings`
  rows. `POST /dev/ussd/session` plays the gateway server-side and accepts an optional `seq` for the
  HMAC frame counter; its production refusal is `404 not_found`. The response `text` is the provider's
  display text (Nalo `MSG`, HMAC `text`), so the simulator shows the real truncation.
- 2026-11-06: 24d slice A lands the headcount/activities/presbyter-only refinements. `ussd_sessions`
  gains `provider` (default `hmac`) alongside `external_id`, so the gateway session id is resolved on
  `(provider, external_id)`; the reference adapter is the only provider in slice A. Headcount
  corrections always keep the corrected observation's `asOf`, including a correction recorded on a
  later day. The USSD empty-week action uses the glossary's short `Date` form for
  `activities.a_date`; the prose's "A date" is its full form.
- 2026-11-05: 24c adds the Welfare & Services wire surface: products with server-side eligibility, a
  member-paid-only self-subscription list, renew/payments/claims routes, the owned+inherited subscription
  read, and the glossary keys `welfare.paid_by_church`, `welfare.cover_dependents`,
  `welfare.no_dependents`, `welfare.no_services`, `action.yes`/`action.no` and the spouse labels.
  Premiums are recorded, not transacted; legacy `life_insurance`/`credit_union` rows stay readable with a
  null `kind` product model.
- 2026-11-05: headcount entry is refined. The current screen names **Adult service**, **Children
  service** or **Mixed service**; USSD offers `1 New count` and `2 Correct`; a correction keeps the
  corrected observation's `asOf` and supersedes exactly one row (`supersedes_id` unique when present);
  the session remembers the last mode; entry is one labelled three-number line with tolerant separators;
  buckets are 0–10,000 with a 30,000 total and all-zero is allowed; a superseded observation remains
  valid for its `asOf`, and headcounts are operator-only. Activities uses a two-week next-events horizon,
  an empty-week state, and a declared per-list `pageSize` (`{ events, offerings, notifications }` = `{ 3, 5, 5 }` reference, `{ 2, 3, 3 }` Nalo).
- 2026-11-05: the operator's "expected headcount" becomes a **headcount** — an actual count, never an
  expected figure — append-only with a mode (`adults`/`children`/`mixed`), six gender buckets, `total`,
  `asOf` and `supersedesId`; a correction supersedes without deleting. The register-derived `expected`
  keeps its wire name and is labelled **Roster**. Activities shows only events the caller may attend
  (general, active ministries, presbyter-only for presbyters), ordered date → priority tier → start
  time → event number, three plus `More`; with none today it shows `0 events today`, the next applicable
  day's count and `1 View` / `2 This week`. Events and series gain `presbyterOnly`. This lands in 24d,
  extending migration 0016; 24c is unaffected and 24e stays at 0018.
- 2026-11-05: the provider-adapter layer is settled. USSD is served through per-provider thin adapter
  routes behind a declaration contract (`{ id, route, authenticator, toFrame, toWire, maxMsgChars, pageSize }`);
  the Nalo adapter maps the Nalo Solutions wire (`USERID`-only auth against `USSD_NALO_USER_ID`,
  `MSGTYPE`/`SESSIONID` session correlation, `MSG` ← `text` with `MSGTYPE` ← `!done`) and the existing
  HMAC entry is the reference adapter. Migration `0016` adds `ussd_sessions.external_id` so the gateway
  session id is the session identity; the internal uuid stays the pipeline key. The machine renders to
  the internal budget and each adapter truncates to its own `maxMsgChars` (Nalo 120 via
  `USSD_NALO_MAX_MSG_CHARS`, config-overridable) with `…`. Each Nalo continuation advances once — there
  is no frame counter to replay-guard — while a re-delivered money commit reuses the per-confirmation
  key stored in the session context, so it cannot double-charge. Provider routes sit behind
  `USSD_ENABLED` (default off → `503 ussd_disabled`, no writes), and `/dev/ussd/session` refuses in
  production; the gateway secret never reaches the browser.
- 2026-11-05: Activities pages at most four events plus `0 More` (the fifth is reachable through More),
  because the screen also carries a headcount-only event's current headcount inside the 182-character
  budget. This narrows the earlier "at most five" wording for the Activities list only. Superseded the
  same day by the three-event ordering and zero-events state below.
- 2026-11-05: 24b render adds two display keys its done screens need:
  `status.attendance_recorded` (Recorded) for a code punch, clock-in, headcount and
  delegation confirmation, and `error.code_used` (Code used) for a reused registration code. Both are
  clarifying additions to the 24b table; no behaviour changes.
- 2026-11-05: 24b adds the attendance, activities, profile and anonymous-registration screens; the
  glossary table carries every key those screens use (including `label.attended`,
  `label.expected_count`, the gender buckets, `prompt.reason`, `status.registered` and the 24b code /
  clocking errors).
- 2026-11-05: 24a adds the shared error and status keys it renders (`invalid_choice`, `one_offering`,
  `no_event`, `no_offering`, `officer_required`, `no_pledges`, `payment_pending`, `week`, `quarter`,
  `year`) to the display glossary.
- 2026-11-05: 24a redemption creates a payment group carrying the pledge (`payment_groups.pledge_id`,
  unique when present); the paid callback sets `settled_contribution_id`, appends `honored` and flips
  the status in one transaction. `/v1/pledges/{id}/settle` is idempotent for an identical paid
  contribution and `409 pledge_already_terminal` for a different one. Redemption is member-scoped and
  reuses the pledge's creation-time event/offering validation.
- 2026-11-05: the portal and simulator decision is settled. 24d builds the real **USSD** section of the
  operator app (Codes, Registrations, Clocking, Headcount, Products, Claims, and Complaints
  once 24e lands) plus a dev-only `POST /dev/ussd/session` and Simulator page; the static mock is a
  review artifact only, and the gateway secret never reaches the browser. The profile aggregate and its
  screen move to 24b.
- 2026-11-05: presbyter ranks, membership cards and verification are settled. Any non-null
  `presbyterRank` is a senior presbyter, ties are allowed, and clearing `isPresbyter` clears the rank.
  `membershipCardNo` is 1–32 trimmed characters and unique case-insensitively when present.
  `verifiedAt` is a nullable officer-set timestamp with no expiry and refreshes on re-verification; card
  and verification are independent. All three are detail-only fields.
- 2026-11-05: a USSD pledge takes exactly one offering (multiple selected re-prompts), shows the
  USSD-generated idempotency key as its reference, and settles at most once. Payment groups and intents
  carry explicit statuses; a group is never partially paid.
- 2026-11-05: the display-glossary table is shared across 24a–24c; each part ships the keys its screens
  use and the completeness test covers the shipped set.
- 2026-11-22: 24d gains a **provider table** and a **Hubtel** row marked `option`. Hubtel publishes 182
  characters in its messaging terms as an enforced truncation point (its API reference, read through a
  mirror, states no cap),
  which coincides with the GSM 7-bit USSD payload the HMAC reference already models; the row adds no
  route, config or migration, and its inbound authenticator and exact cut-off behaviour are recorded as
  open until a sandbox probe answers them. Nalo's 120 and the reference 182 are unchanged.
- 2026-11-22: the screen budget becomes per-provider. An adapter supplies its `maxMsgChars` as the render
  frame's `budget` (default 182) and the machine lays out to it; a screen that reaches the cut at a
  declared budget is a defect rather than a provider limitation (a configured cap below a screen's
  minimum keeps the cut as the documented fallback), because Nalo's 120-character frame cut the profile
  at `Shepherd Kwame …` and removed `1 Verify contact`. The profile renders identity, then
  the action, then the data, dropping whole lines instead of cutting them, and a property test pins
  every reachable state to 182 and 120 with its actions named. The console opens on `nalo` again; HMAC
  stays selectable.
- 2026-11-24: the 24d **adoption-cost claim is corrected in place.** "One adapter plus one registration;
  nothing else changes" and "one `.env` entry" understated what the Nalo adoption actually needed, so the
  declaration contract now prices the config **per knob** (a schema entry, a default, a production check
  where needed, a `create-app` field, an `index` read, an `.env.example` line — Nalo added two settings,
  so each of those items twice and one production check) and the descriptive surfaces (OpenAPI
  descriptions, smoke, tests) a new provider still touches; the Hubtel row repeats that price instead of
  promising a single file. The reading of `e532812`
  is stated carefully: nineteen files, much of them the declaration contract's own first build, with the
  adapter and its registry line in one file. The **7-bit** bullet also gained a finding: the shipped
  screens already compose `·` and `…`, neither in the GSM 7-bit alphabet, so "Message limits and
  truncation" now says that fitting `maxMsgChars` does not by itself deliver a screen. The fix is wider
  than screen composition — it also amends the mandated `…` wire marker and the compact-subject example
  that prescribes `·` — so the owner placed it as the **next USSD round** (2026-11-24);
  `documents/backlog.md` carries it, and the resolved Nalo truncation row left the backlog. No behaviour
  changes with this entry: the code and the `ships` rows already agreed before it.
