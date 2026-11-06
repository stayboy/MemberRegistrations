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
      **Codes**, **Registrations**, **Clocking**, **Expected headcounts**, **Products** and **Claims**;
      24e adds **Complaints**.
- [ ] **Codes** issues an `attendance_punch` or `registration` code against one event session, shows the
      plain code once with its TTL, lists active/used/expired/voided codes, and voids one with a reason.
- [ ] **Registrations** lists pending requests with the event, session, name and reference, and approves
      (supplying the immutable member number through the existing member create path) or rejects with a
      reason.
- [ ] **Clocking** shows session attendance and delegations, records a clock-in for a member, and records
      a delegation from a senior presbyter to another presbyter for one session.
- [ ] **Expected headcounts** captures and corrects `male`, `female` and `children` for one session,
      restating the total, and keeps the register-derived expected count visually separate.
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
      uuid, so the gateway id is the session identity. Authorised by name for this round (owner,
      2026-11-05); 24e's expected migration becomes 0017.
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
