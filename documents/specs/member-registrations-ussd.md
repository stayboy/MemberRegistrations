# Spec — USSD attendance, giving and subscriptions

**Status:** Draft 2026-11-05. Owner-approved direction; spec review pending. Ticket 24 expands into
24a–24d. Supersedes the narrow USSD bullets in `member-registrations-events-offerings.md` (FR-31,
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
  total) → `my profile` (demographics, ministries, attendance and shepherd) → `register` (code → name →
  reference, anonymous only). Every top-level domain opens its primary content, never a choice screen;
  extra actions sit on that screen. On the Attendance status screen the extra actions are `1` a specific
  day, `2` period summary, `3` I was present (code) and, for presbyters, `4` clocking. There is one
  top-level entry per domain — no duplicate "my …" item beside its action. The anonymous main menu is
  Register, Offerings, Activities, Attendance, Exit; the member menu replaces Register with Welfare &
  Services. The tree arrives incrementally (see **Ticket split**): 24a ships Offerings and Exit, and
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

| Key                          | Full                         | Short           |
| ---------------------------- | ---------------------------- | --------------- |
| `menu.offerings`             | Offerings                    | Offerings       |
| `menu.activities`            | Activities                   | Activities      |
| `menu.attendance`            | Attendance                   | Attendance      |
| `menu.welfare`               | Welfare & Services           | Welfare         |
| `menu.profile`               | My Profile                   | Profile         |
| `menu.register`              | Register                     | Register        |
| `menu.exit`                  | Exit                         | Exit            |
| `nav.back`                   | Back                         | Back            |
| `nav.more`                   | More                         | More            |
| `nav.main`                   | Main menu                    | Main            |
| `action.give`                | Give                         | Give            |
| `action.pledge`              | Pledge                       | Pledge          |
| `action.my_pledges`          | My pledges                   | Pledges         |
| `action.my_payments`         | My payments                  | Payments        |
| `action.redeem`              | Redeem                       | Redeem          |
| `action.accept`              | Accept                       | Accept          |
| `action.change`              | Change                       | Change          |
| `action.pay`                 | Pay                          | Pay             |
| `prompt.amount`              | Enter amount                 | Amount          |
| `prompt.offerings`           | Choose offering(s)           | Offering(s)     |
| `prompt.split`               | Split amount                 | Split           |
| `prompt.date`                | Enter date DDMMYYYY          | Date (DDMMYYYY) |
| `prompt.expected_date`       | Expected date                | Due date        |
| `prompt.phone`               | Enter phone number           | Phone           |
| `prompt.code`                | Enter code                   | Code            |
| `prompt.name`                | Enter name                   | Name            |
| `label.total`                | Total                        | Total           |
| `label.reference`            | Reference                    | Ref             |
| `label.code`                 | Confirmation code            | Code            |
| `label.event`                | Event                        | Event           |
| `label.day`                  | Day                          | Day             |
| `label.offering`             | Offering                     | Offering        |
| `label.amount`               | Amount                       | Amount          |
| `label.currency`             | Currency                     | Currency        |
| `activities.today`           | Today                        | Today           |
| `activities.this_week`       | This week                    | This week       |
| `activities.a_date`          | A date                       | Date            |
| `activities.summary`         | Attendance summary           | Attendance      |
| `activities.give`            | Give to an offering          | Give            |
| `attendance.day`             | A specific day               | Day             |
| `attendance.period`          | Period summary               | Period          |
| `attendance.present`         | I was present                | Present         |
| `attendance.clocking`        | Clocking                     | Clock           |
| `attendance.clock_in`        | Clock in                     | Clock in        |
| `attendance.headcount`       | Headcount                    | Headcount       |
| `attendance.delegate`        | Delegate                     | Delegate        |
| `attendance.no_data`         | No attendance yet            | No attendance   |
| `label.attended`             | Attended                     | Present         |
| `label.roster`               | Roster                       | Roster          |
| `label.male`                 | Male                         | Male            |
| `label.female`               | Female                       | Female          |
| `label.children`             | Children                     | Children        |
| `label.window`               | Last 5                       | Last 5          |
| `label.month`                | This month                   | Month           |
| `prompt.reason`              | Enter reason                 | Reason          |
| `status.registered`          | Registration sent            | Registered      |
| `status.attendance_recorded` | Attendance recorded          | Recorded        |
| `error.code_invalid`         | Invalid code                 | Bad code        |
| `error.code_used`            | Code already used            | Code used       |
| `error.not_shepherd`         | Not your member              | Not yours       |
| `error.not_senior`           | Not a senior presbyter       | Not senior      |
| `error.delegate_required`    | Delegate first               | Delegate        |
| `error.already_clocked`      | Already clocked in           | Clocked         |
| `status.regular`             | Regular                      | Regular         |
| `status.non_regular`         | Non-Regular                  | Non-reg         |
| `status.not_enough_data`     | Not enough data              | No data         |
| `welfare.my_services`        | My services                  | My plans        |
| `welfare.subscribe`          | Subscribe                    | Join            |
| `welfare.eligible`           | Eligible                     | Eligible        |
| `welfare.not_eligible`       | Not eligible                 | Not eligible    |
| `welfare.premium`            | Premium                      | Premium         |
| `welfare.payer_member`       | You pay                      | You pay         |
| `welfare.payer_church`       | Church pays                  | Church          |
| `welfare.cover`              | Cover                        | Cover           |
| `welfare.claimed`            | Total claimed                | Claimed         |
| `welfare.expired`            | Expired                      | Expired         |
| `welfare.until`              | Until                        | Until           |
| `welfare.paid_by_church`     | Paid by the church           | Church          |
| `welfare.cover_dependents`   | Cover dependents? 1 Yes 2 No | Dependents?     |
| `welfare.no_dependents`      | No dependents                | None            |
| `welfare.no_services`        | No services                  | None            |
| `action.yes`                 | Yes                          | Yes             |
| `action.no`                  | No                           | No              |
| `label.spouse_husband`       | Husband                      | Husband         |
| `label.spouse_wife`          | Wife                         | Wife            |
| `profile.member_no`          | Member no.                   | Member no.      |
| `profile.gender`             | Gender                       | Gender          |
| `profile.age`                | Age                          | Age             |
| `profile.dob`                | Date of birth                | DOB             |
| `profile.ministries`         | Ministries                   | Ministries      |
| `profile.shepherd`           | Shepherd                     | Shepherd        |
| `profile.not_assigned`       | Not assigned                 | Not assigned    |
| `error.session_expired`      | Session expired              | Session expired |
| `error.too_many_tries`       | Too many attempts            | Too many tries  |
| `error.invalid_amount`       | Invalid amount               | Bad amount      |
| `error.invalid_date`         | Invalid date                 | Bad date        |
| `error.invalid_choice`       | Invalid choice               | Invalid         |
| `error.one_offering`         | Choose one offering          | One only        |
| `error.no_event`             | No event today               | No event        |
| `error.no_offering`          | No offerings today           | No offering     |
| `error.officer_required`     | No follow-up officer         | No officer      |
| `error.no_pledges`           | No pending pledges           | No pledges      |
| `status.payment_pending`     | Payment pending              | Pending         |
| `label.week`                 | This week                    | Week            |
| `label.adults`               | Adults                       | Adults          |
| `label.as_of`                | As of                        | As of           |
| `headcount.adult_service`    | Adult service                | Adult           |
| `headcount.children_service` | Children service             | Children        |
| `headcount.mixed_service`    | Mixed service                | Mixed           |
| `action.new_count`           | New count                    | New             |
| `action.correct`             | Correct                      | Correct         |
| `activities.zero_today`      | 0 events today               | None today      |
| `activities.zero_week`       | 0 events this week           | None this week  |
| `label.event`                | Event                        | Event           |
| `label.events`               | Events                       | Events          |
| `label.tomorrow`             | Tomorrow                     | Tomorrow        |
| `label.in_days`              | in {n} days                  | {n} days        |
| `label.no_upcoming`          | No upcoming events           | None upcoming   |
| `action.view`                | View                         | View            |
| `status.headcount_recorded`  | Headcount recorded           | Recorded        |
| `label.quarter`              | This quarter                 | Quarter         |
| `label.year`                 | This year                    | Year            |
| `error.not_eligible`         | Not eligible                 | Not eligible    |
| `error.already_paid`         | Already paid                 | Already paid    |
| `error.try_again`            | Try again                    | Try again       |

### Giving: events, offerings, splits

- "Valid events for the day" are events the caller may attend: general events, ministry events only when
  the member holds an active assignment to that ministry (the assignment-date floor), and presbyter-only
  events only for presbyters; an anonymous caller sees general events only. They are ordered by date
  (today first, then ascending), then **priority tier** — the member's ministry events, and a presbyter's
  own presbyter-only events, before general events — then start time, then event number. At most three
  are shown plus `0 More` for the week. An assignment to a deactivated ministry does not count;
  deactivating a ministry drops its events from scope like removing the membership. Paged lists render
  the channel's declared `pageSize.events`: three for the 182 reference, two for Nalo's 120, so a declared page
  never drops an action; message truncation stays a fallback, not the pagination rule. Mixed service
  headcounts are portal-only.
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
  mode: **Adult service** (`male,female,children`), **Children service** (`male,female,adults`) or
  **Mixed service** (portal-only four numbers: `adult male,adult female,child male,child female`). The
  current observation screen names the mode, the `asOf` time and the count. USSD offers `1 New count` and
  `2 Correct`: a new count appends an observation with `asOf` now; a correction supersedes the current
  observation and keeps its original `asOf` (the moment counted), recording who corrected it and when.
  The session remembers the last mode for that event/session and preselects it on the mode prompt. The
  entry is one labelled three-number line, accepting comma, slash or space separators, with a re-prompt
  on a malformed or out-of-range value and a lay restatement before save. Each bucket is 0–10,000 and the
  total at most 30,000; an all-zero observation is allowed. The model is append-only: a superseded
  observation is **not invalid** — it stays the valid record of the count at its `asOf` — and only the
  newest non-superseded row is "current". The register-derived `expected` stays separate and is labelled
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
reason). Headcount shows the current observation as `Adult service` / `Children service` /
`Mixed service` with its `asOf` time, then offers `1 New count` and `2 Correct`; the mode prompt labels
the two handset modes clearly and preselects the session's last mode, then one labelled three-number
prompt follows. A new count appends with `asOf` now; a correction keeps the corrected observation's
`asOf` and supersedes it. Mixed service is portal-only. My Profile renders the
shared identity label, member number, up to three ministries, the
attendance line and the shepherd. The anonymous Register entry prompts code, first name, last name and
returns the request reference. Registration approval and code issuance are portal actions (24d), not
USSD.

### Subscriptions and claims

- Welfare services become **products** (`subscription_products`): code, name, description, premium,
  currency, active flag, and eligibility rules — minimum days since `joinedOn`, a membership card on
  file, a verified member, gender, and age from `dob`.
- Members gain `membership_card_no` and `verified_at` (null = unverified); both are back-office fields
  and appear in the member DTO.
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
  across the events that apply to them: every **general** event (its series has no ministry, or it has no
  series) and every event whose ministry the member belongs to — a `member_ministries` row to an active
  ministry, with the member active (not archived or purged) — and only where the event is
  **member-trackable**
  (`tracksMembers = true`). The window is the last five **held** scoped sessions ending today: a session
  is held when its date is on or before the event's today in the event's timezone and the session is not
  cancelled; sessions are ordered by date, then event `start_time`, then event id. **Floors:** a session
  before the member's `joined_on` never counts (a null `joined_on` imposes no floor), and a ministry-event
  session before that membership's `assigned_on` never counts. The floors apply to this regularity
  calculation only; the day, period and per-event views keep showing the actual records. Removing a
  ministry membership drops that ministry's events from the scope retroactively (the current-affiliation
  limitation recorded in Q4). A presbyter-only session is dropped entirely for a non-presbyter, so it is
  neither an `expected` nor an `attended` session; for a presbyter it counts like any other event they
  may attend. With **fewer
  than three** held scoped sessions the status is `not_enough_data`; otherwise `regular` when
  `attended / expected >= 0.6` (60%) and `non_regular` when below it. `expected` is the window size (up
  to 5) and `attended` is the number present, both reported in every status. `lastAttendedOn` is the most recent attended date in scope. A
  headcount-only event never counts, and neither does attendance at an event whose ministry the member
  does not belong to. With no scoped sessions the status is `not_enough_data`, `attended` and `expected`
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
adapter plus one registration; nothing else changes.

- `id` — a stable provider identifier (`nalo`, `hmac`).
- `route` — the mount path the provider's gateway calls.
- `authenticator` — verifies the inbound request against configured secrets before any session work; a
  failure answers `401 unauthorized` and writes nothing.
- `toFrame` — maps the provider wire to the internal frame.
- `toWire` — maps the internal render to the provider wire DTO.
- `maxMsgChars` — the provider's published per-message character cap, overridable in configuration.
- `pageSize` — how many paged rows the channel renders, per list: `{ events, offerings }` is
  `{ 3, 5 }` for the 182 reference and `{ 2, 3 }` for Nalo's 120. The machine renders exactly the
  supplied size; it never inspects a message cap.

**The two adapters.** Two adapters ship: the **Nalo** adapter (below) and the existing **HMAC reference
adapter** — the current `POST /ussd/session` entry, which authenticates with the HMAC-SHA-256 signature
over `timestamp + nonce + body` using `USSD_GATEWAY_SECRET` and keeps its nonce replay guard. The
simulator offers both in a provider dropdown.

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

**Message limits and truncation.** The machine renders to the internal budget (menu label ≤ 16, prompt
line ≤ 60, screen ≤ 182 including the footer). It is unaware of provider message caps; the channel
supplies its declared `pageSize`, and an adapter truncates its `MSG` to its own `maxMsgChars` with `…`
**only** as a fallback when the cap is smaller than the rendered text. Screens are laid out so a
correctly declared page size never drops an action. Nalo's published cap is 120, overridable by
`USSD_NALO_MAX_MSG_CHARS` (integer 1–182, default 120). The simulator shows the real truncation, not an
idealised one.

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
reference) and a handset-style display. It posts each keypress to `POST /dev/ussd/session`, renders the
returned screen text as a caller would see it — including the provider's real truncation — and exposes
the stub payment gateway's callback so a commit can be completed end to end: it shows the commit
reference, the callback body and a signed-callback shell template, while the signature itself stays
server-side (the browser never holds `PAYMENT_GATEWAY_SECRET`). It drives the real adapters
and the real session pipeline; it is never a mock for acceptance. The static `mockups/ussd` simulator
remains a review artifact.

## Data model additions

| Table / column                    | Shape                                                                                                                                                                                                                                                                                                          | Constraints                                                                                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `members.presbyter_rank`          | `integer` nullable                                                                                                                                                                                                                                                                                             | admin-set; requires `is_presbyter`                                                                                                                                                                                                            |
| `members.membership_card_no`      | `text` nullable                                                                                                                                                                                                                                                                                                | back-office field                                                                                                                                                                                                                             |
| `members.verified_at`             | `timestamptz` nullable                                                                                                                                                                                                                                                                                         | null = unverified                                                                                                                                                                                                                             |
| `ussd_sessions`                   | `id`, `phone_hash`, `member_id` nullable, `anonymous`, `state`, `context` jsonb, `provider`, `external_id` nullable, `last_input_seq`, `expires_at`, timestamps                                                                                                                                                | 3-minute idle TTL; no raw phone; `provider` defaults to `hmac`; `(provider, external_id)` is partial unique when `external_id` is present                                                                                                     |
| `ussd_nonces`                     | `nonce` primary key, `seen_at`, `expires_at`                                                                                                                                                                                                                                                                   | replay guard; pruned after 10 minutes                                                                                                                                                                                                         |
| `attendance_codes`                | `id`, `code_hash`, `purpose`, `event_instance_id`, `session_date`, `issued_by`, `issued_at`, `expires_at`, `used_at`, `used_by_member_id`, `registration_request_id`, `voided_at`                                                                                                                              | hash only; single use; TTL                                                                                                                                                                                                                    |
| `registration_requests`           | `id`, `reference` unique, `first_name`, `last_name`, `phone_hash`, `event_instance_id`, `session_date`, `code_id`, `status`, `created_at`, `decided_by`, `decided_at`                                                                                                                                          | no member until approved                                                                                                                                                                                                                      |
| `clocking_delegations`            | `id`, `event_instance_id`, `session_date`, `from_member_id`, `to_member_id`, `reason`, `created_at`, `created_by`, `ended_at`                                                                                                                                                                                  | one active per session; ends with the session                                                                                                                                                                                                 |
| `event_session_headcounts`        | `id`, `event_instance_id`, `session_date`, `as_of`, `mode` (`adults`/`children`/`mixed`), `adult_male`, `adult_female`, `adult_unspecified`, `child_male`, `child_female`, `child_unspecified`, `total`, `recorded_by`, `recorded_at`, `supersedes_id` nullable                                                | append-only; buckets check against `mode`, each 0–10,000, `total` = sum of six and ≤30,000; `as_of` within the session day; `supersedes_id` unique when present, same session, non-superseded; a superseded row remains valid for its `as_of` |
| `event_instances.presbyter_only`  | `boolean` not null default `false`                                                                                                                                                                                                                                                                             | non-presbyters cannot attend or open; the roster is the active presbyters                                                                                                                                                                     |
| `event_series.presbyter_only`     | `boolean` not null default `false`                                                                                                                                                                                                                                                                             | templates generated instances                                                                                                                                                                                                                 |
| `payment_groups`                  | `id`, `reference` unique, `idempotency_key` unique, `total_minor`, `currency`, `status` (`pending`/`paid`/`failed`), `pledge_id` nullable, `created_at`, `created_by`                                                                                                                                          | one gateway charge per group; never partially paid; `pledge_id` is unique when present (one redemption group per pledge)                                                                                                                      |
| `payment_intents`                 | `id`, `payment_group_id` unique, `gateway`, `reference` unique, `status` (`initiated`/`paid`/`failed`), `raw_callback_hash`                                                                                                                                                                                    | unique gateway reference; one per group                                                                                                                                                                                                       |
| `contributions.payment_group_id`  | `uuid` nullable                                                                                                                                                                                                                                                                                                | FK to `payment_groups`                                                                                                                                                                                                                        |
| `pledges.settled_contribution_id` | `uuid` nullable                                                                                                                                                                                                                                                                                                | unique when present; set once when settled by USSD                                                                                                                                                                                            |
| `subscription_products`           | `id`, `code` unique, `name`, `description`, `active`, `premium_minor`, `currency`, `payment_mode`, `period_months`, `covers`, `max_dependents`, `allowed_relationships`, `min_membership_days`, `requires_card`, `requires_verified`, `gender`, `min_age`, `max_age`, `created_by`, `updated_by`, `updated_at` | rules evaluated server-side; code unique case-insensitively; product active-toggle is audited                                                                                                                                                 |
| `subscriptions.kind`              | `text` nullable                                                                                                                                                                                                                                                                                                | legacy `life_insurance`/`credit_union` rows keep it; product rows leave it null (exactly one of `kind`/`product_id` is set)                                                                                                                   |
| `subscriptions.product_id`        | `uuid` nullable                                                                                                                                                                                                                                                                                                | existing rows stay valid                                                                                                                                                                                                                      |
| `subscriptions.premium_minor`     | `bigint` nullable                                                                                                                                                                                                                                                                                              | null for a church-paid period and legacy rows                                                                                                                                                                                                 |
| `subscriptions.paid_by`           | `text` (`member` / `church`), nullable                                                                                                                                                                                                                                                                         | product rows set `member` or `church`; legacy rows stay null; never the member's choice                                                                                                                                                       |
| `subscriptions.period_start`      | `date` nullable                                                                                                                                                                                                                                                                                                | cover period start; null on legacy rows                                                                                                                                                                                                       |
| `subscriptions.period_end`        | `date` nullable                                                                                                                                                                                                                                                                                                | cover lapses here unless renewed; null on legacy rows                                                                                                                                                                                         |
| `subscriptions.updated_by`        | `text` nullable                                                                                                                                                                                                                                                                                                | officer or actor that last changed the subscription                                                                                                                                                                                           |
| `subscriptions.updated_at`        | `timestamptz` nullable                                                                                                                                                                                                                                                                                         | set on create, renew, end and coverage changes                                                                                                                                                                                                |
| `subscription_payments`           | `id`, `subscription_id`, `period_start`, `period_end`, `amount_minor`, `currency`, `channel` (`app`/`ussd`/`manual`), `reference`, `paid_at`, `recorded_by`, `idempotency_key`                                                                                                                                 | member-paid periods; unique `(subscription_id, period_start)`; unique `idempotency_key`; premiums recorded, not transacted                                                                                                                    |
| `subscription_coverage`           | `subscription_id`, `member_id`                                                                                                                                                                                                                                                                                 | existing: explicit covered members, never derived                                                                                                                                                                                             |
| `subscription_claims`             | `id`, `subscription_id`, `member_id`, `amount_minor`, `reason`, `status` (`pending`/`approved`/`rejected`/`paid`), `recorded_by`, `recorded_at`, `decided_by`, `decided_at`, `decision_note`                                                                                                                   | `pending → approved/rejected`, `approved → paid`; approved + paid sum to "total claimed"                                                                                                                                                      |

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

- 2026-11-07: the owner parked ticket 24e (USSD complaints and the admin queue) for a later round
  instead of opening it after 24d and 23. Nothing behavioural changes: the out-of-scope list and the
  ticket split now say "parked" rather than "deferred to the last round". The ticket keeps its settled
  shape; its expected migration (0017) and the wire routes still need explicit authorisation when a
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
  an empty-week state, and a declared per-list `pageSize` (`{ events, offerings }` = `{ 3, 5 }` reference, `{ 2, 3 }` Nalo).
- 2026-11-05: the operator's "expected headcount" becomes a **headcount** — an actual count, never an
  expected figure — append-only with a mode (`adults`/`children`/`mixed`), six gender buckets, `total`,
  `asOf` and `supersedesId`; a correction supersedes without deleting. The register-derived `expected`
  keeps its wire name and is labelled **Roster**. Activities shows only events the caller may attend
  (general, active ministries, presbyter-only for presbyters), ordered date → priority tier → start
  time → event number, three plus `More`; with none today it shows `0 events today`, the next applicable
  day's count and `1 View` / `2 This week`. Events and series gain `presbyterOnly`. This lands in 24d,
  extending migration 0016; 24c is unaffected and 24e stays at 0017.
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
