# 24d: USSD admin portal and simulator

**Tier:** 2

**What to build:** A new top-level **USSD** section in the existing operator app with the operational
pages behind the 24a–24c seams, plus a dev-only simulator that drives the real API. The dev-only
simulator drives the **real per-provider adapters** (Nalo and the HMAC reference adapter, chosen by a
provider dropdown) and the real session pipeline; `/dev/ussd/session` plays the gateway for the selected
provider, signing/authenticating server-side. The gateway secret never reaches the browser.

**Blocked by:** 24a, 24b, 24c. Migration **0016** (`ussd_sessions.external_id`, text, partial unique
when present) is authorised by name for this round (owner, 2026-11-05); 24e's expected migration is now 0017. Uses the existing shell, session and officer gate. The Nalo adapter follows the published provider
protocol (https://documenter.getpostman.com/view/7705958/UyrEhaLQ).

**Status:** ready-for-agent

- [ ] The operator app gains one **USSD** nav section (same shell and session, no separate app) with
      **Codes**, **Registrations**, **Clocking**, **Headcount**, **Products** and **Claims**;
      24e adds **Complaints**.
- [ ] **Codes** issues an `attendance_punch` or `registration` code against one event session, shows the
      plain code once with its TTL, lists active/used/expired/voided codes, and voids one with a reason.
- [ ] **Registrations** lists pending requests with the event, session, name and reference, and approves
      (supplying the immutable member number through the existing member create path) or rejects with a
      reason.
- [ ] **Clocking** shows session attendance and delegations, records a clock-in for a member, and records
      a delegation from a senior presbyter to another presbyter for one session.
- [ ] **Headcount** records the operator's actual counted attendance per session: a mode selector
      (Adults / Children / Mixed), an `asOf` timestamp defaulting to now, the three-number entry (four in
      Mixed), the observation history newest first, and a **Correct** action on the current observation
      that supersedes it without deleting it. The register-derived `expected` is shown alongside as
      **Roster** and never merged with the headcount; the USSD presbyter flow uses the same seam.
- [ ] **Activities** mirrors the USSD eligibility and ordering: general events, the officer's active
      ministries, and presbyter-only events for presbyters; date → priority tier → start time → event
      number, three plus `More`, with the zero-events-today next-events prompt (`0 events today`,
      `2 events in 2 days`, `1 View` / `2 This week`).
- [ ] **Events** gains `presbyterOnly` on the event form and the series template; non-presbyters never
      see or open such an event, and its roster is the active presbyters.
- [ ] **Products** manages welfare products and their eligibility, payer, period, cover and dependent
      rules.
- [ ] **Claims** records a claim (amount, reason) and moves it through its statuses with a decision note.
- [ ] Member detail/form edits `presbyterRank` (only when presbyter), `membershipCardNo` and `verified`
      with the API's validation; rank clears when the presbyter flag clears.
- [ ] A dev-only `POST /dev/ussd/session` computes the HMAC server-side and forwards to the real entry;
      it is **disabled in production** and the gateway secret is never sent to the browser.
- [ ] A **Simulator** page drives the dev-only entry, renders the returned screen text and exposes the
      stub gateway's callback for a commit; the static `mockups/ussd` simulator stays a review artifact.
- [ ] Tests cover the pages' rendering, the officer gate, the production guard on `/dev/ussd/session`,
      and one end-to-end simulate → pay → callback journey against the stub gateway.
- [ ] (addition) A provider-adapter layer: a declaration
      `{ id, route, authenticator, toFrame, toWire, maxMsgChars }` plus a thin route per provider, all
      over the existing session pipeline (machine, glossary, repos and services untouched). Adding a
      provider is one adapter + one registration.
- [ ] (addition) Migration `0016` adds `ussd_sessions.external_id` (`text`, partial unique when
      present); the Nalo adapter stores the gateway `SESSIONID` there and resolves it to the internal
      uuid, so the gateway id is the session identity. The same migration adds `event_session_headcounts`
      (append-only observations, mode/buckets/`asOf`/`supersedesId`), `presbyter_only` on
      `event_instances` and `event_series`, and drops `event_session_expected` from 0014. Authorised by
      name for this round (owner, 2026-11-05); 24e's expected migration is 0017.
- [ ] (addition) The headcount seam replaces the expected seam: the pair
      `GET`/`POST /v1/events/{eventId}/headcounts?sessionDate` (current + observations, `no-store`), mode/bucket
      validation, an `asOf` within the session day, and a `supersedesId` from the same session.
      **Authorised route deletion:** `GET`/`PUT /v1/events/{eventId}/expected` is removed this round
      (owner, 2026-11-05). The register-derived `expected` keeps its wire name and is labelled
      **Roster**.
- [ ] (addition) The **Nalo** adapter at `POST /ussd/nalo`: `USERID`-only auth against
      `USSD_NALO_USER_ID` (1–32 chars, dev default `NALOTest`, production required and distinct;
      mismatch `401 unauthorized`, malformed body `422 validation_error`), `MSGTYPE` → fresh/continue,
      `SESSIONID` → `external_id`, `USERDATA` over 64 → `422 validation_error`, response `MSG` ←
      truncated `text` and `MSGTYPE` ← `!done`, response omits `SESSIONID`.
- [ ] (addition) Nalo re-delivery semantics: each continuation advances once (no frame counter to
      replay-guard); the per-confirmation commit key in the session context makes a re-delivered money
      commit idempotent, and a non-money re-delivery may advance one screen — documented.
- [ ] (addition) The **HMAC reference adapter** is the existing `/ussd/session` entry, unchanged, exposed
      as the second simulator provider.
- [ ] (addition) `POST /dev/ussd/session` plays the gateway for a selected provider: request
      `{ provider, phone, input, sessionId? }`, response `{ provider, sessionId, text, done, state, wire }`,
      builds the wire server-side (fresh HMAC nonce/timestamp per frame, or Nalo JSON), propagates the
      provider route's status unchanged, and refuses in production (`NODE_ENV=production` → 503)
      regardless of the switch.
- [ ] (addition) Provider routes sit behind `USSD_ENABLED` (default false → `503 ussd_disabled`, no
      writes); both the switch gate and the production refusal on `/dev/ussd/session` are tested.
- [ ] (addition) The **Simulator** page gains a provider dropdown (Nalo / HMAC reference), a
      handset-style display that shows the provider's **real** truncation, and the stub-gateway callback
      for a commit. Use Fluent `Dropdown` and `Label`; the single-use handset display stays an inline
      presentational block (component-first §15), with the provider limit shown next to it.
- [ ] (addition) Per-adapter `maxMsgChars` (Nalo 120 via `USSD_NALO_MAX_MSG_CHARS`, integer 1–182) with
      a config override; the adapter truncates with `…` only when its cap is smaller than the internal
      render. The gateway secret and `USSD_NALO_USER_ID` stay server-side.

**Out of scope:** production aggregator or gateway credentials, real shortcodes, and any card data.

## Spec record (to-spec, 2026-11-05)

### Problem Statement

The USSD menu tree is complete and testable at `POST /ussd/session`, but a real aggregator does not call
an HMAC-signed internal frame. Each provider speaks its own wire dialect, authenticates its own way, and
imposes its own message length. Hand-testing the menu by crafting signed frames is awkward, and nothing
in the codebase yet models "provider A maps to our pipeline, provider B maps differently" without
forking the session machine. In production USSD must stay off until a real aggregator contract exists,
and the gateway secret must never reach the browser.

### Solution

A thin per-provider adapter layer over the existing session pipeline, plus a dev-only simulator that
drives the real adapters. Each provider is a declaration `{ id, route, authenticator, toFrame, toWire,
maxMsgChars }` that maps its wire to the internal frame `{ phone, sessionId?, input, seq }` (an absent
`sessionId` means a fresh session), runs the
untouched session pipeline, and maps the internal render `{ sessionId, text, done, state, options? }`
back to its own DTO. Two adapters ship: **Nalo** (`POST /ussd/nalo`, `USERID`-only auth) and the
existing **HMAC reference** entry (`POST /ussd/session`, unchanged). The machine renders to its internal
budget; each adapter truncates to its own `maxMsgChars`. Provider routes sit behind `USSD_ENABLED`
(default off), and the dev-only `POST /dev/ussd/session` plays the gateway server-side, refusing in
production. A Simulator page offers a provider dropdown, a handset-style display, and the stub gateway's
callback. The gateway secret never leaves the server.

### User Stories

1. As a developer, I want the simulator to drive the real provider adapters and the real session
   pipeline, so that what I test is what a caller experiences.
2. As a developer, I want a provider dropdown in the simulator, so that I can exercise the Nalo adapter
   and the HMAC reference adapter from one surface.
3. As a developer, I want the simulator to render the returned screen in a handset-style display, so
   that I read the menu exactly as a caller would.
4. As a developer, I want the simulator to show the provider's real message truncation, so that I see
   precisely where a long screen is cut, not an idealised copy.
5. As a developer, I want the simulator to expose the stub payment gateway's callback for a commit, so
   that I can complete a simulate → pay → callback journey end to end.
6. As a developer, I want `POST /dev/ussd/session` to build the provider wire server-side, so that the
   gateway secret and `USSD_NALO_USER_ID` never reach the browser.
7. As a developer, I want `POST /dev/ussd/session` to refuse in production, so that no deployed UI can
   drive USSD.
8. As a developer, I want to add a third provider as one adapter declaration plus one registration, so
   that the session machine, glossary, repositories and services are never touched for a new dialect.
9. As a developer, I want each adapter to declare its own message cap, overridable in configuration, so
   that a provider's published limit is honoured without changing the machine.
10. As a developer, I want an adapter to truncate with `…` only when its cap is smaller than the
    internal render, so that a screen within the internal budget passes through unchanged.
11. As a developer, I want a first-time Nalo request (`MSGTYPE: true`) to start a fresh session and a
    continuation (`MSGTYPE: false`) to resume it, so that the session boundary is the gateway's, not the
    server's.
12. As a developer, I want the Nalo adapter to store the gateway `SESSIONID` as the session's external
    identity (`external_id`) and resolve it to the internal uuid, so that replay and duplicate semantics
    match the gateway while the pipeline keeps its uuid key.
13. As a developer, I want the Nalo response to omit `SESSIONID`, so that it matches the published
    contract exactly.
14. As a developer, I want the Nalo response `MSGTYPE` to be `!done`, so that a terminal screen releases
    the session and a live screen keeps it open.
15. As a developer, I want a mismatched Nalo `USERID` to answer `401 unauthorized`, so that no invented
    shared-secret header is introduced.
16. As a developer, I want a malformed Nalo body to answer `422 validation_error`, so that bad frames
    fail loudly at the edge and write nothing.
17. As an operator, I want USSD disabled in production until a real aggregator contract exists, so that
    no provider route can be dialled before it is ready.
18. As an operator, I want the configured `USSD_NALO_USER_ID` to gate the Nalo route, so that only the
    real aggregator's client id is accepted.
19. As an operator/back-office officer, I want one USSD nav section (Codes, Registrations, Clocking,
    Expected headcounts, Products, Claims) behind the existing shell and officer gate, so that USSD
    operations reuse the app's authentication rather than a separate app.
20. As an admin, I want the USSD operations that are otherwise handset-only (codes, registrations,
    clocking, headcounts, products, claims) to have a back-office home in the portal, so that a
    back-office officer can manage them without dialling.
21. As a member, I want the menu I read on a real handset to match the simulator's rendering, so that a
    long screen is never silently clipped past the provider's cap in a way the simulator did not show.
22. As an anonymous caller, I want the first request to be recognised as a fresh session by any
    provider, so that an empty first keypress opens the main menu rather than an error.

### Implementation Decisions

#### Adapter declaration and the seam

- A provider is a declaration, not a code branch. The declaration holds `id`, `route`,
  `authenticator`, `toFrame`, `toWire` and `maxMsgChars`. Adding a provider is one declaration plus one
  registration; the session machine, glossary, repositories and services are never modified.
- The internal frame is `{ phone, sessionId?, input, seq }`; an absent `sessionId` means a fresh
  session. The internal render is `{ sessionId, text, done, state, options? }`. The adapter is the only
  place that knows a provider's wire shape, and the route handler is factored to expose the pipeline
  without touching the machine.

#### The two adapters

- The **Nalo** adapter is mounted at `POST /ussd/nalo`. The **HMAC reference** adapter is the existing
  `POST /ussd/session` entry — HMAC-SHA-256 over `timestamp + nonce + body` under `USSD_GATEWAY_SECRET`,
  with the existing nonce replay guard — unchanged and re-exposed as a second provider.

#### Nalo wire mapping

- Inbound JSON fields: `USERID`, `MSISDN`, `USERDATA` (≤ 120 chars, empty/absent first), `MSGTYPE`
  (boolean; `true` = first-time, `false` = continuation), `NETWORK` (ignored), `SESSIONID` (reliably
  present). Outbound JSON fields: `USERID` (mandatory echo), `MSISDN` (optional echo), `MSG`
  (mandatory), `MSGTYPE` (boolean).
- `MSISDN` → `phone` (normalised as elsewhere); `USERDATA` → `input` (over 64 characters is `422
validation_error`); `MSGTYPE` → the fresh/continue signal (`true` → no `sessionId`; `false` → the
  resolved `external_id`). `MSG` ← the internal `text`; response `MSGTYPE` ← `!done`. The response omits
  `SESSIONID`.

#### Authentication

- Nalo authenticates on `USERID` alone, matched against the configured `USSD_NALO_USER_ID` (1–32
  characters, dev default `NALOTest`, production required and distinct — a client identifier, not a
  secret). A mismatch is `401 unauthorized`; a malformed body is `422 validation_error`; both write
  nothing. No signature, no HMAC, no shared-secret header is invented for Nalo.

#### Session correlation and replay

- The gateway `SESSIONID` is the session identity. Migration `0016` adds `ussd_sessions.external_id`
  (`text`, partial unique when present); the adapter stores the gateway id there and resolves it to the
  internal uuid, so replay and duplicate semantics match the gateway while the pipeline keeps its uuid
  key.
- Nalo sends no frame counter, so the adapter assigns the next sequence number from the stored session
  counter. Each continuation advances exactly once: the `seq` replay guard cannot distinguish a
  re-delivery from a repeated keypress. A re-delivered money commit is safe because the per-confirmation
  commit key is stored in the session context and reused, returning the same group; a re-delivered
  non-money frame may advance one screen, documented as a provider limitation.

#### Message limits and truncation

- The machine renders to the internal budget (menu label ≤ 16, prompt line ≤ 60, screen ≤ 182 including
  the footer) and is unaware of any provider cap.
- Each adapter truncates its outgoing `MSG` to its own `maxMsgChars` with `…`, and only when the cap is
  smaller than the rendered text. Nalo's published cap is 120, overridable by `USSD_NALO_MAX_MSG_CHARS`
  (integer 1–182). The simulator shows the real, truncated result.

#### Dev entry and production gating

- `POST /dev/ussd/session` is the dev-only gateway player: request
  `{ provider, phone, input, sessionId? }`, response `{ provider, sessionId, text, done, state, wire }`.
  It builds the provider wire server-side (a fresh HMAC nonce/timestamp per frame, or Nalo JSON),
  forwards to the matching provider route, and propagates that route's status unchanged.
- Every provider route sits behind `USSD_ENABLED` (default `false`); off → `503 ussd_disabled`, no
  writes. `POST /dev/ussd/session` additionally refuses whenever `NODE_ENV=production`, independent of
  the switch. Both gates are the tested off posture until a real aggregator contract exists.

#### Simulator

- The Simulator page holds a provider dropdown (Nalo, HMAC reference) and a handset-style display; it
  posts each keypress to `POST /dev/ussd/session` and renders the returned text, including real
  truncation, and exposes the stub payment gateway's callback for a commit. The gateway secret never
  reaches the browser.

### Testing Decisions

- **External behaviour only.** Tests assert the exact response of the provider routes and
  `/dev/ussd/session` — HTTP status, problem codes, and the rendered `text`/`done`/`state` — plus the
  persisted rows behind a completed journey. No test reaches into the machine's internals.
- **Seams.** The highest seam is the provider routes plus `/dev/ussd/session`, exercised through the
  real app (one app instance, real migrations, real rows asserted by query). The Nalo route is driven
  with Nalo JSON; the HMAC reference route with signed frames as today. Both the `USSD_ENABLED` gate
  (`503 ussd_disabled`, no writes) and the `/dev/ussd/session` production refusal (`NODE_ENV=production`)
  are tested. Truncation is tested by a frame whose internal render exceeds the provider cap and is
  asserted to end with `…` at the exact cap, and by a within-budget frame passing through unchanged.
- **Prior art.** Route-level Supertest + PGlite tests like the existing USSD route tests (signed frames,
  `tests/api/ussd*.test.ts`), which drive the menu as a sequence of frames and assert the prompts, and
  the display-glossary budget unit test (`tests/unit/ussd-glossary.test.ts`) which renders every screen
  and fails on an exceeded internal budget.
- **Migration and re-delivery.** The Nalo journey stores `external_id` on the first frame and resolves it
  on a continuation; the same gateway id cannot attach to a second live session. A re-delivered Accept
  returns the same payment group (one group, one intent) because the per-confirmation key is reused.
  `USERDATA` over 64 is `422 validation_error`.

### Out of Scope

- The detail of the operator pages (Codes, Registrations, Clocking, Expected headcounts, Products,
  Claims) beyond the checklist items above.
- The payment gateway and money paths — unchanged, already specified.
- Real aggregator certification, credentials, shortcodes or deployment — the adapters and routes remain
  behind `USSD_ENABLED` until a real contract exists.
- Any provider beyond the two shipped adapters (Nalo and the HMAC reference); the declaration contract
  makes a third a mechanical addition, but it is not built now.
- Complaints and the admin complaint queue (24e).

### Further Notes

- **Two adapters, one pipeline.** The HMAC reference adapter is the existing entry re-labelled, not a
  second implementation; the simulator's two-provider dropdown is what proves the declaration contract
  is real.
- **The simulator is not a mock.** It drives the real adapters and the real session pipeline; the static
  `mockups/ussd` simulator stays a review artifact and is never the acceptance path.
- **Secret server-side.** The gateway secret and `USSD_NALO_USER_ID` live only in configuration and are
  consumed by `/dev/ussd/session` and the routes; neither value is ever returned to or derivable from the
  browser.

## Spec record — headcount and activities (to-spec, 2026-11-05)

### Problem Statement

The operator-entered figure for a session has been called an "expected headcount", conflating it with the
register-derived `expected` (the computed roster of eligible members). That conflation means two
different numbers share one name, an operator's count cannot be corrected without overwriting, and a
presbyter cannot see which events they may actually attend. The current model stores one
`male/female/children` row per session, upserted in place, so a typo destroys the prior reading and there
is no history. The Activities list is unfiltered, so members are offered ministry events they do not
serve and presbyter-only events they cannot enter; when a day is empty it simply says so with no route
to the next applicable events, and it shows four entries where three fit the handset budget.

### Solution

Rename the operator's figure a **headcount** — an actual count taken at a moment — and keep the
register-derived `expected` as a distinct, relabelled **Roster**. Model headcounts as an append-only
`event_session_headcounts` table of observations, each with a `mode`, six gender buckets, a `total`, an
`asOf` timestamp and a recorder; a correction is a new observation whose `supersedesId` points at the row
it corrects, never a delete or overwrite. Expose `GET`/`POST /v1/events/{eventId}/headcounts` and remove
the old `/expected` route. Gate Activities to events the caller may attend — general, the member's
active ministries, and presbyter-only events for presbyters — ordered by date, then priority tier, then
start time, then event number, showing three events plus More; when today is empty, show `0 events today`
and the next applicable day's count with `1 View` and `2 This week`. Add `presbyterOnly` to events and
their series template, and keep headcounts fully independent of per-member attendance and regularity.

### User Stories

1. As a presbyter, I want to record a headcount in three numbers selected by mode (adults or children),
   so that a count takes seconds at the door.
2. As a presbyter, I want the entry to ask the mode first (`1 Adults`, `2 Children`) and then a single
   three-number prompt, so I never key more than three figures.
3. As a presbyter, I want a corrected headcount to supersede the earlier observation without deleting it,
   so a typo is fixed and the history stays auditable.
4. As an admin, I want to record and correct a headcount from the back-office admin UI in all three modes
   (adults, children, mixed), so the office can capture a mixed gathering and fix a wrong entry.
5. As an admin, I want the headcount model to be append-only with an `asOf` time on every observation, so
   many counts per session coexist and the latest is unambiguous.
6. As an auditor, I want the headcount kept entirely separate from per-member attendance and regularity,
   so one number can never be derived from or feed the other.
7. As an admin, I want the attendance report to show `present` (per-member rows), `roster`
   (register-derived `expected`) and `headcount` (latest as-of) side by side, so the three meanings are
   never conflated.
8. As an admin, I want the roster to keep its wire field name but be labelled **Roster**, so the
   operator's count is the only thing called a "headcount".
9. As a member, I want the Activities list to show only events I may attend, so I am never offered a
   ministry event I do not serve or a presbyter-only event I cannot enter.
10. As a presbyter, I want my ministry events and my presbyter-only events to rank before general events,
    so the list opens with what is relevant to me.
11. As a member, I want the Activities list ordered by date, then relevance, then start time, so today's
    relevant events come first.
12. As a member, I want three events plus More on the Activities screen, so the screen stays within the
    handset budget.
13. As a member, I want a day with no events to say `0 events today` and tell me when the next applicable
    events are (`2 events in 2 days`), with `1 View` to open them and `2 This week` for the week, so I am
    never stranded on an empty screen.
14. As an anonymous caller, I want Activities to show only general events, so I am not offered
    members-only or ministry events.
15. As an admin, I want a presbyter-only event flagged on the event and its series template, so
    eligibility is explicit and inherited by generated occurrences.
16. As a presbyter, I want the roster for a presbyter-only session to be the active presbyters, so the
    expected count reflects who may actually attend.
17. As an operator, I want the operator activity list to mirror the same eligibility, ordering and
    zero-state prompt, so the back office and the handset agree.
18. As an operator, I want the Headcount panel to show mode, `asOf`, the observation history and a correct
    action, so corrections are visible and auditable.
19. As a developer, I want the old `/expected` route removed and replaced by the `/headcounts` routes, so
    there is a single headcount seam.
20. As an operator, I want the route deletion authorised and the migration extended in 0016, so the
    correction lands in one round without touching 24c.
21. As a member, I want my profile regularity to exclude presbyter-only events I cannot attend, so my
    regularity score stays honest.

### Implementation Decisions

- **Terminology.** "Headcount" names the operator's actual count; "Roster" labels the register-derived
  `expected`, whose wire field name is unchanged. "Expected headcount" is retired everywhere.
- **Append-only observations.** Headcounts live in `event_session_headcounts`, many per session; no hard
  delete and no in-place overwrite. `total` is the sum of the six buckets.
- **Mode and buckets.** `adults` splits adult male/female and counts children as one `childUnspecified`
  (child gender buckets zero); `children` splits child male/female and counts adults as one
  `adultUnspecified` (adult gender buckets zero); `mixed` splits both (both unspecified buckets zero).
- **`asOf`.** Required on the row, defaults to now, and must fall within the session's calendar day in the
  event timezone.
- **Correction.** A correction is a new observation with `supersedesId` naming the row it corrects; the
  corrected row stays marked superseded. The current observation is the newest non-superseded row by
  `asOf`, then `recordedAt`. USSD correction is re-entry; the portal offers an explicit Correct action
  and, separately, appending a fresh observation. Corrections are available in the back-office admin UI.
- **Who records.** A presbyter or admin; the USSD actor rules apply. No senior/delegate rule for
  headcounts.
- **API.** `GET`/`POST /v1/events/{eventId}/headcounts`; the `/expected` route is deleted this round.
  Malformed counts or a mode-violating bucket, an out-of-day `asOf`, or a bad `supersedesId` are `422
validation_error`; an unknown event or session is `404 not_found`.
- **Entry stays simple.** USSD asks mode then one three-number prompt (never `asOf`); `mixed` is
  portal-only.
- **Activities eligibility and ordering.** Only events the caller may attend; ordered date (today first),
  then priority tier (the member's ministry events, and a presbyter's own presbyter-only events, before
  general), then start time, then event number; three events plus More. Anonymous callers see general
  events only.
- **Zero-events state.** When the selected day has no applicable event, show `0 events today`, the next
  applicable day's count (`2 events in 2 days` or `1 event tomorrow`), `1 View` those events and `2 This
week`; the week list is always reachable.
- **Presbyter-only events.** `presbyterOnly` (default false) on events and series templates;
  non-presbyters never see or open them and they are excluded from a non-presbyter's roster and
  regularity; the roster for a presbyter-only session is the active presbyters.
- **Independence.** Headcounts never derive from or feed per-member attendance or regularity.
- **Round placement.** All of this lands in 24d, extending migration 0016; 24c is unaffected and 24e
  stays at 0017.

### Testing Decisions

- **External behaviour only.** Assert the exact HTTP response, problem codes and persisted
  `event_session_headcounts` rows; assert the USSD screens' exact text and next state. No test reaches
  into internals.
- **Seams.** The highest seam is the events/headcount routes plus the USSD activities/clocking screens,
  exercised through the real app (one instance, real migrations, real rows asserted by query). Cover:
  `GET`/`POST /headcounts` (create, list newest-first, `current` resolution, `no-store`), mode-mismatch
  `422`, out-of-day `asOf` `422`, superseding across sessions, an unknown or already-superseded
  `supersedesId` `422`, unknown event/session `404`,
  append-only correction (the original stays, marked superseded), independence (a headcount changes
  neither `present` nor `expected` nor regularity), the `/expected` route returning `404`, the USSD
  Activities filtering/ordering (general, active ministry, presbyter-only; three + More), the
  zero-events-today next-events prompt, and the headcount mode/entry/correction screens.
- **Prior art.** Route-level Supertest + PGlite tests like the existing attendance and USSD tests
  (`tests/api/attendances`, `tests/api/ussd*.test.ts`), which drive the menu as a sequence of frames and
  assert prompts, and the display-glossary budget test that renders every screen and fails on an exceeded
  budget.

### Out of Scope

- Welfare products and claims (24c), and complaints (24e, migration 0017) — unchanged.
- Deleting any headcount observation; correction is supersession, never a hard delete, by design.
- Per-officer web authorization and a separate headcount permission — a presbyter or admin records, and
  no senior/delegate rule applies.
- A handset prompt for `asOf`; USSD always records "now", and the `mixed` four-number entry is
  portal-only.

### Further Notes

- **Two independent flags.** `tracksMembers` (headcount-only, no per-member attendance) and
  `presbyterOnly` (eligibility) are orthogonal; a presbyter-only event is still member-trackable, its
  roster being the presbyters.
- **Wire name preserved.** `expected` keeps its wire name; only the reading-surface label changes to
  "Roster". The headcount is the only new wire concept, and the only deletion is the `/expected` route,
  authorised by the owner this round.
- **Glossary renames.** `attendance.expected` → `attendance.headcount`, `label.expected_count` →
  `label.roster`; the mode labels, the as-of label, the zero-events copy and the headcount-recorded
  status are new keys, all within the ≤16/≤60 budgets.
