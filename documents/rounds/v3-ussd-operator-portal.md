# Round — v3-ussd-operator-portal

|                     |                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                    |
| Tier                | 2 - Reviewed                                                                            |
| Mode                | `unattended (auto-accept recommendations)`                                              |
| Base                | `e532812`                                                                               |
| Review rounds       | 2                                                                                       |
| Gate runs in parent | 0                                                                                       |
| Workers             | `single (slice B2)`                                                                     |
| Spec                | `documents/specs/member-registrations-ui.md`; `member-registrations-ussd.md`; `-api.md` |

## Plan

Ticket 24d slice B2: the operator pages and the dev-only simulator. Slice B1 (`#78`) already shipped the
provider adapter contract/registry, the HMAC and Nalo adapters, `POST /dev/ussd/session`, the environment
keys, the API tests, smoke checks and the spec records. This slice adds the surface those seams were
built for. No migration and no new API route is in scope.

**One section in the existing shell.** `ui/src/shell/navigation.ts` gains a top-level `ussd` section
between Shepherding and Admin with Codes, Registrations, Clocking, Headcount, Activities, Products,
Claims and the development-only Simulator. It uses the existing `AppShell`, `RequireSession` officer gate
and `PageFrame`; there is no second app. The mobile `Sections` menu is the same `SECTIONS` list, so it is
included by construction.

**Pages and their real routes.**

- **Codes** — `GET/POST /v1/events/:id/codes`, `POST /v1/codes/:id/void`. Issue an
  `attendance_punch` or `registration` code against one session, show the plain code once with its
  15-minute TTL, list active/used/expired/voided with a status filter, void an active code with a reason.
- **Registrations** — `GET /v1/registration-requests?status=pending`, approve with the immutable member
  number (`POST …/:id/approve`), reject with a reason (`POST …/:id/reject`). Event names resolve through
  the existing `GET /v1/events/:id` read, never a second invented endpoint.
- **Clocking** — `GET /v1/events/:id/attendance`, `POST /v1/events/:id/attendance`,
  `GET/POST /v1/events/:id/delegations?sessionDate`. Present rows and roster alongside; manual clock-in
  through the member picker; senior-presbyter delegation for one session.
- **Headcount** — `GET/POST /v1/events/:id/headcounts?sessionDate` plus the attendance report's
  register-derived `expected`. Adult service / Children service / Mixed service labels, `asOf` defaulting
  to now, three numbers (four in Mixed), observation history newest first, and a Correct action that sends
  `supersedesId` and keeps the corrected `asOf`. The roster is a separate card and never merged.
- **Activities** — `GET /v1/events?from&to` plus `GET /v1/members/:memberNo` for the eligibility view.
  Same eligibility (general, active ministries, presbyter-only for presbyters) and ordering (date →
  priority tier → start time → event number) as `src/ussd/services.ts`, the same three-plus-More page
  (two at Nalo's 120-character cap), the zero-events-today two-week prompt (`1 View` / `2 This week`),
  `No upcoming events` beyond two weeks and the `0 events this week` / `1 A date` / `9 Back` state.
- **Products** — `GET/POST/PUT /v1/subscription-products`. List eligibility, payer, period, cover and
  dependent rules; create with the same validation as `createSubscriptionProductSchema`; toggle active.
- **Claims** — `GET/POST /v1/subscriptions/:id/claims` and `POST …/:claimId/decide`, reached through the
  member's welfare subscription read (`GET /v1/members/:memberNo/subscriptions`). Record an amount and
  reason; offer only the legal next statuses (pending → approved/rejected, approved → paid) with a
  decision note.
- **Simulator** — `POST /dev/ussd/session` with a Nalo/HMAC provider dropdown, a handset-style display of
  the returned text (provider truncation included), the provider wire, and the stub-gateway callback
  reference/body/template for a completed commit. Unavailable in a production build and when the entry
  answers `404`/`503`.

**Code shape.** Cross-page components are `EventSessionPicker` (Codes, Clocking, Headcount) and
`ReasonDialog` (Codes, Registrations); everything else is page-local under `ui/src/pages/ussd/`. Pure
activity/headcount/code rules live in `ui/src/format/ussd.ts`; product/claim form rules in
`ui/src/format/welfare.ts`. API clients are `ui/src/api/ussd.ts` and `ui/src/api/welfare.ts`; the event
client gains the manual clock-in call and the `presbyterOnly`/`tracksMembers` wire fields.

**Acceptance criteria.**

1. One top-level USSD section between Shepherding and Admin, rendering the eight submenu items in the
   shared sidebar and the mobile section menu.
2. Codes issue, show once with TTL, list by status and void with a reason.
3. Registrations list pending requests with event/session/name/reference, approve with a member number,
   reject with a reason.
4. Clocking shows attendance and delegations, records a clock-in and a senior→presbyter delegation.
5. Headcount records Adult/Children/Mixed with an `asOf`, shows the newest-first history, corrects the
   current observation without deleting it, and shows Roster separately.
6. Activities mirrors USSD eligibility, ordering, page sizes and zero/empty states.
7. Products list/create/toggle with eligibility, payer, period, cover and dependent rules.
8. Claims record an amount and reason and move through the legal statuses with a note.
9. The Simulator drives the dev entry, shows real truncation, exposes the commit callback and is
   unavailable in production.
10. No new API endpoint and no migration; the existing routes and the officer gate are reused.
11. A USSD section render test covers the top-level link, the eight submenu items and route resolution.
12. UI and repo gates pass; five pre-existing UI formatting offenders are reformatted (formatting only).

## Verification

| Gate         | Command                            | Result                                                    |
| ------------ | ---------------------------------- | --------------------------------------------------------- |
| UI format    | `npm --prefix ui run format:check` | pass                                                      |
| UI lint      | `npm --prefix ui run lint`         | pass — 0 errors, 0 warnings                               |
| UI typecheck | `npm --prefix ui run typecheck`    | pass                                                      |
| UI tests     | `npm --prefix ui run test`         | pass — 27 files, 317 tests                                |
| UI build     | `npm --prefix ui run build`        | pass                                                      |
| Skill        | `npm run verify:skill`             | pass                                                      |
| Format       | `npm run format:check`             | pass                                                      |
| Lint         | `npm run lint`                     | pass                                                      |
| Typecheck    | `npm run typecheck`                | pass                                                      |
| Tests        | `npm run test`                     | pass — 42 files, 529 passed / 3 skipped (single-fork run) |
| Build        | `npm run build`                    | pass                                                      |
| Smoke        | `npm run smoke`                    | pass — 72 checks                                          |

`node scripts/verify.mjs full` emitted, verbatim:

```text
gate-run 2026-11-06T22:16:04.673Z profile=full steps=6/6 lines=6 bytes=680
```

The first three default-parallel test runs hit the known Windows/PGlite worker exit `3221226505` on a
random file (`attendance`, then a PGlite close/time-out, then `member-attendance`/`offerings`); each run
had 41–42 of 42 files and 507–518 passing tests before the worker died. Per the bounded-gate rule the
suite was re-run once serially and once with a temporary single-fork config: 42/42 files, 529 passed /
3 skipped. The recorded full gate then passed every step on a later default-parallel run. No test was
skipped for this slice.

`format:check` was red on `main` for five untouched UI files (`src/api/members.test.ts`,
`src/format/member.test.ts`, `src/format/member.ts`, `src/pages/MemberRelationshipsTab.tsx`,
`src/pages/MembersPage.tsx`); a pristine `member.ts` from `main` fails the same check, and the CI `ui`
job does not run `format:check`. They were reformatted here (39 lines, formatting only, no behaviour
change) so the UI gate is green. No migration.

## Review

- **Tier 2 pass (pro:0813, first pass): CHANGES REQUIRED.** Findings: no P1; one P2 — the UI spec §2.5
  Activities sentence still said "the officer's active ministries" while the same section's Eligibility
  view clarification (lines 124-126) said the chosen member's; and one nit — the Headcount correction hint
  said the mode and numbers stay editable while the mode `RadioGroup` was disabled during a correction.
- **Fix pass (parent, same change set):** reworded the spec sentence to "the selected member's active
  ministries"; enabled the mode `RadioGroup` during a correction (`disabled={recordMutation.isPending}`),
  matching the copy and the settled design that a correction keeps `asOf` and may change the mode. Gates
  re-run green (UI format/lint/typecheck/test/build/e2e; repo verify full 6/6; smoke 72).
- **Confirmation round (pro:0813, fallback reviewer `glm-5.3` — the `deepseek-v4-pro:0813` seat was
  unavailable by weekly usage limit during the round): ACCEPT.** The P2 and the nit both resolved; no new
  findings. The fix delta was re-read against the full B2 delta, the cross-referenced specs and the
  implemented code.

## Acceptance

TBD by the parent review.

## Interpretations

- **Activities has an explicit eligibility view.** The operator session carries no member link (officers
  have `id`/`name`/`email`/`actorId`, not a member number), so "the officer's active ministries" cannot be
  resolved from the session. The page exposes a member picker labelled **Eligibility view**; with no
  member it is the anonymous general-events view, and the chosen member's `isPresbyter` and active
  ministry codes drive exactly the USSD rules. The UI spec's §2.5 was clarified to say so rather than
  leaving code and spec disagreeing. The member detail exposes current active ministries without the
  assignment date, so the preview cannot reproduce the USSD assignment-date floor for a historical
  session; it filters on the member's current active ministries, which is exact for a current session.
- **The simulator callback is exposed, not browser-signed.** `POST /v1/payments/callback` requires an
  HMAC over the exact raw body under `PAYMENT_GATEWAY_SECRET`, which stays server-side; B2 is barred from
  adding a route, so the page shows the commit reference (prefilled from the rendered `Reference …` line),
  the callback body and a signed-callback shell template using `$PAYMENT_GATEWAY_SECRET`. The USSD spec's
  Simulator paragraph was clarified to state this. A developer completes the journey from the shell; the
  browser never holds the secret.
- **CORS for the dev entry.** The operator UI and API are different origins in development, and
  `/dev/ussd/session` was outside the existing `/auth` and `/gateway` CORS scopes. `src/create-app.ts`
  mounts the existing `corsMiddleware` on `/dev` only. This is not a new endpoint; the route still
  refuses with `404` in production and `503` when USSD is disabled.
- **Channel selector on Activities.** The handset's page size comes from the adapter declaration, so the
  operator list offers a **Channel** choice (Nalo 120 → two rows, HMAC reference 182 → three rows)
  instead of guessing; `More` pages by that size.
- **Codes reason.** The API accepts a null void reason; the portal requires one because the ticket says
  "voids one with a reason" and the reason is the only audit context recorded.
- **Headcount `asOf`.** The `datetime-local` value is converted to an ISO instant in the browser and the
  API validates that it falls inside the session day in the event timezone. A correction sends
  `supersedesId` and omits `asOf`, so the repository keeps the corrected observation's moment.
- **Claims entry.** Claims are reached through a member's welfare subscriptions because that is the only
  existing read that yields a subscription id; there is no claim-by-id or all-claims route. Subscription
  creation/renewal stays outside this slice (24c's surface), so the page records and decides claims only.

## Deviations

- **Complaints** is not built — it belongs to ticket 24e.
- No migration, no new backend endpoint, no OpenAPI change.
- Five pre-existing UI files were reformatted (formatting only) to make the UI `format:check` gate green;
  no behaviour changed.
