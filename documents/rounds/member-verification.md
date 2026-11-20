# Round - member-verification

|                        |                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                                                                                                                                                                                      |
| Tier                   | 2                                                                                                                                                                                                                                           |
| Mode                   | `attended`                                                                                                                                                                                                                                  |
| Base                   | `c35919d` (the branch carries the abandoned first 3a draft; it is reworked, not extended)                                                                                                                                                   |
| Review rounds          | 4                                                                                                                                                                                                                                           |
| Gate runs in parent    | 7                                                                                                                                                                                                                                           |
| Spec                   | `documents/specs/member-registrations-member-record.md` - Phase 3: MR-22..MR-37, MR-43, MR-44, MR-46, MR-47, MR-51..MR-55; AC-MR15..AC-MR23, AC-MR28, AC-MR32, AC-MR35, AC-MR37, AC-MR41..AC-MR46; plus `member-verification-initiation.md` |
| Workers                | `single`                                                                                                                                                                                                                                    |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (3a rework, outside window); parent opencode/deepseek-v4.1-flash-free (specs, record)`                                                                                                        |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                                                                                                     |

`git-seat-budget: 6` - 1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync.

## Seats

| Seat                                      | Picked (local)                                   | Window | Class          | Candidate probed                                 | Basis                                             |
| ----------------------------------------- | ------------------------------------------------ | ------ | -------------- | ------------------------------------------------ | ------------------------------------------------- |
| Spec review (design + portal)             | `ollama-cloud/deepseek-v4-pro:0813`              | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`              | outside-window first; session opened before 12:00 |
| Worker (3a rework)                        | `ollama-cloud/deepseek-v4.1-flash:1017`          | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`          | outside-window first                              |
| Mock builder                              | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | n/a    | `mock-builder` | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | any-window class                                  |
| Build reviewer (pre-feature, frozen diff) | `ollama-cloud/deepseek-v4-pro:0813`              | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`              | outside-window first                              |
| Final whole-round review                  | `ollama-cloud/mimo-v2.6-pro`                     | in     | `reviewer-pro` | `ollama-cloud/mimo-v2.6-pro`                     | inside-window first at 13:20 on 2026-11-19        |
| Fix-pass worker                           | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | in     | `worker-flash` | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | inside-window first at 13:20 on 2026-11-19        |
| Final confirmation                        | `ollama-cloud/deepseek-v4-pro:0813`              | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`              | outside-window first at 06:13 on 2026-11-20       |

**Window note (2026-11-20, 06:25 local).** The round opened before noon on 2026-11-19, so its first
worker and reviewer dispatches used the outside first candidates. Inside 12:00-18:00 the fix-pass
worker used `cline-pass/cline-pass/deepseek-v4.1-flash-1017` and the final whole-round review used
`ollama-cloud/mimo-v2.6-pro`; after 18:00 the confirmation returned to the outside first
`ollama-cloud/deepseek-v4-pro:0813` (06:13 on 2026-11-20). The mock builder is any-window. No further
model dispatch is planned; the merge chain is parent git.

## Gate

Phase 3 is a hard gate in five parts. The owner authorised the phase on 2026-11-18 and the
contact-verification reshape on 2026-11-19 ("all as recommended", plus "keep officer confirmation"):

1. **A migration** (`0025`, re-authored): `member_contacts.verified_at`, `member_confirmations` (audit),
   `member_verification_codes.token_hash`, and `registration_requests.phone_encrypted`.
2. **A wire change**: `POST /verification/otp` (destination, expiry), `DELETE /verification`
   (withdraw proofs and confirmation), `POST`/`DELETE /confirmation`, the public
   `POST /portal/verification/accept`, `MemberDetail` with `verifiedContacts`/`confirmedAt`, and the
   approval `phoneOwnership`.
3. **Authentication behaviour**: the public acceptance page (token + code, no bearer, no member data,
   rate-limited) and the removal of `verified` from the write schemas.
4. **New dependencies**: the three senders, `OTP_PEPPER` and `REGISTRATION_PHONE_KEY`.
5. **USSD behaviour**: the member-initiated `My Profile > Verify contact` action (the owner,
   2026-11-19: "ussd should be able to serve as avenue for user to be able to initiate
   verification"). USSD initiates; the acceptance page remains the entry.

## Grill

The owner settled the phase frontier on 2026-11-19; the independent spec review accepted it after one
rework. The decisions, with the rejected option recorded:

1. **No verification gate.** An owned number identifies; member data is not gated. Rejected: the
   registered-unverified gate and the phone OTP as a gate. Cost: a spoofed MSISDN is the accepted risk.
2. **Proof per contact.** `member_contacts.verified_at`; the badge names the proof. Rejected: a
   member-level number hash.
3. **One channel, chosen by the register.** Email, else WhatsApp, else phone. Rejected: a member/officer
   channel choice, and sending one code to both email and WhatsApp (it over-claims both).
4. **One completion surface.** Every channel links to the public member acceptance page. Rejected:
   USSD for email/WhatsApp (retired by the owner once the link proved sufficient for every channel).
5. **The acceptance page.** `/v#t=<token>`, no member data before acceptance, token hashed/single-use/
   expiring, five attempts, rate-limited. Rejected: a third-party shortener and a link that verifies by
   itself.
6. **Officer confirmation.** `Confirm member` with an audited reason; `Revoke verification` withdraws
   proofs and confirmation but never the contact or identification. Rejected: officer code relay.
7. **Registration.** Encrypted retention, erased on decide/purge; approval binds own or borrowed.
   Rejected: create-at-registration and the hash-only request.
8. **`requires_verified`** = an email/WhatsApp proof or an officer confirmation; a phone proof alone does
   not qualify.
9. **Legacy `verified_at`** is inert history; `confirmedAt` and eligibility read the audit.
10. **One slice** (after the USSD retirement): data/service/officer API+UI/acceptance page, with the
    member-initiated USSD action added on 2026-11-19. Rejected: the earlier 3a/3b split.
11. **The member starts it from USSD.** An identified member opens `My Profile > Verify contact`; the
    register sends the code and link through the same service; the page enters. Rejected: USSD code
    entry. Cost: one USSD state and copy; the shared throttle.

## Plan

Goal (3a): an officer starts a six-digit code on the register-chosen channel; an email/WhatsApp code is
entered on the public acceptance page; the accepted contact gets its proof.
An officer can confirm a member with an audit and withdraw it. A pending registration binds its
encrypted number at approval.

3a scope:

1. `0025` re-authored and the Drizzle mirror; `verifiedContacts`/`confirmedAt` on `MemberDetail`;
   `verified` off the create/update schemas.
2. Domain: code generation/hash, one-channel resolver, masks, country code, the portal token.
3. Service: `issue` (eligibility, sender check, throttle, store, send), `accept(token, code)` for the
   page, `confirm(memberNo, reason)`, `revoke(memberNo)`; the public `accept(token, code)` is the only completion.
4. Repo: per-contact proof, confirmation audit, code store, the encrypted request number, the owned-
   number conflict `409 contact_in_use`, purge of the confirmation rows.
5. Senders and config (`OTP_PEPPER`, `REGISTRATION_PHONE_KEY` 16+).
6. Routes: officer issue/confirm/revoke and the public accept; the acceptance page (FR-25b, outside
   `#/`); OpenAPI.
7. UI: badge naming the proof, `Verify membership`/`Confirm member`/`Revoke verification`, the sent
   dialog naming the channel and route, the approval own/borrowed decision.
8. The USSD registration request writes the encrypted number (the narrow data touch in `src/ussd`
   services); USSD **entry** is retired, and the member-initiated action and notice are added in item 10.
9. Tests: domain, service, API (both drivers), sender, config, migration, UI DOM, the acceptance page,
   the approval, the purge, the conflict; the smoke.
10. The member starts a code from USSD (`My Profile > Verify contact`): the masked destination and the
    link instruction, the shared throttle, the already-proven case, no USSD entry. The member path
    requires an owned phone or WhatsApp; a contactless or email-only member is officer-initiated.
    Specified in `member-verification-initiation.md` (MR-54/55, AC-MR44/45).

USSD **entry** is retired: every channel sends the code and the link to the acceptance page, and the
member can initiate from `My Profile > Verify contact` (item 10). The round is self-contained and can
merge on its own; the USSD spec and its handset mock set carry no verification code-entry screens; the
`Verify contact` notice is the only USSD addition.

## Verification

- **Fast gate:** `npm run verify:fast` PASS, 4/4 steps at 06:23:23Z; `npm test` **964 passed, 20 skipped**
  (982 tests); `npm run build` PASS. The `event-instances` 0005 replay now runs in `beforeAll` and the
  full suite was green twice (Q4); the section-8 park is resolved.

```
gate-run 2026-11-20T06:23:23.389Z profile=fast steps=4/4 lines=4 bytes=686
gate-run 2026-11-20T06:41:57.276Z profile=full steps=7/7 lines=7 bytes=960
```

- **UI:** 504 node tests, 184 DOM tests (20 files); `npm run ui:e2e` 76 passed; `npm run ui:capture`
  **27/27**, including `member-detail-verified` and `acceptance` (the two new baselines; the
  `shell-mobile`/`shepherding-roster` anti-aliasing churn was reverted).
- **Smoke:** `npm run smoke` PASS - the phone OTP issues `202`, the SMS carries the code and the
  acceptance-page link, and no code appears outside the development sender.
- **`pg` lanes:** with a scratch Postgres, `member-verification` 26/26 and `registration-requests` 15/15
  (the new durable approval block), 0 skipped.
- **Member-initiated USSD:** the profile action, the notice (mask/link, no entry), the shared throttle,
  the mixed/all-proven/confirmed/anonymous visibility and `9 Back`; plus the second-contact and
  hourly-limit cases.
- **Fix pass:** second contact (first unproven, `409 already_verified`), accept-time contact binding
  (`contact_id` + `destination_value_hash`), the unique-race mappings, the remaining-attempts copy, the
  country-code mask, the contract nits, the harness replay moved to `beforeAll` (full suite green twice),
  and the two capture entries.
- **Pooled `pg`:** the 10 pooled tests are **unexecuted this pass** - Docker is unavailable on this host
  (no daemon, no local Postgres), so the new concurrency/binding cases have only the PGlite lane. The
  publish step must run `0025` and the approval/concurrency cases against the real Compose Postgres.

### Section 8 - the timeout record

Three 15 s PGlite timeouts in unrelated files, all under the parallel fork load, each passing alone:

1. `tests/api/ussd-welfare.test.ts` (parent fast run) - 1 failed; isolated 9/9 in 6.2 s; the full
   re-run was green (re-run 1).
2. Five files in the worker's fast run (`health`, `ministries`, `series`, `subscription-claims`,
   `contacts-subs-shepherding`) - each passed alone; the full re-run was green (re-run 2).
3. `tests/db/event-instances.test.ts` (0005 backfill) in the parent's final fast run - 1 failed;
   isolated **3/3 in 2.4 s**. This is the third failure, so the round parks by `AGENTS.md` section 8.

The root cause was the `0005` replay inside an `it()` (the 60 s hook timeout cannot protect it). The
owner accepted Q4: the replay moved to `beforeAll`, the global config is untouched, and the full suite
was green twice. No section-8 exception is needed; the park is resolved.

- **Mock signature:** all five portal states are signed by the owner (the badge v4 on 2026-11-20); the
  two USSD handset states are owner-reviewed local artifacts. The full gate is pending.
- **Tier 2 build review:** REWORK on the first pass - the resolver refused email-only members (P1, the
  retired phone/WhatsApp-identity rule surviving the reshape), the acceptance button read "Verify my
  number", the two superseded catalogue states were still `signed`, a dead `verified_at` fetch remained and
  the confirm/revoke 404 asymmetry was undocumented. The confirmation returned ACCEPT: every finding is resolved against the tree (email-only now resolves to email, the button reads Verify my contact, the dead verified_at fetch is gone, the 404 asymmetry is documented, the USSD change log is marked superseded), with no new contradictions. The final review of the whole round, including the member-initiated USSD feature (mimo-v2.6-pro, inside window), then returned REWORK: the catalogue/signature record contradiction (now aligned to target) and AC-MR45's hour-limit copy (P1), plus nine P2s (accept-time proof binding, two unique-race mappings, contact_in_use missing from the error list, remaining-attempts copy, the second-contact predicate, the country-code mask) and five nits. The fix pass landed; the confirmation returned ACCEPT (one round-doc P2 - the badge row and the stale void line - corrected).

## Acceptance

| #   | Criterion                                                                                                                                      | Verdict | Evidence                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------- |
| 1   | `0025` re-authored (per-contact proof, confirmation audit, code `destination`/`token_hash`, encrypted request number), additive and reversible | met     | migration + drift/reversibility tests     |
| 2   | One-channel resolver, token, masks, country code                                                                                               | met     | domain tests                              |
| 3   | `issue`/`accept`/`confirm`/`revoke` with the sender check, throttle, store-before-send and five attempts                                       | met     | service tests                             |
| 4   | Per-contact proof, confirmation audit, code store, encrypted request number, `contact_in_use`, purge                                           | met     | API + repo tests                          |
| 5   | Senders and config (`OTP_PEPPER`, `REGISTRATION_PHONE_KEY`, `VERIFICATION_LINK_BASE`)                                                          | met     | sender/config tests                       |
| 6   | Officer routes, the public accept route and OpenAPI                                                                                            | met     | API tests; the public route outside `/v1` |
| 7   | Badge names the proof; Verify/Confirm/Revoke; approval own/borrowed; the acceptance page                                                       | met     | DOM tests; the page served at `/v`        |
| 8   | The USSD registration request writes the encrypted number                                                                                      | met     | USSD + approval tests                     |
| 9   | Domain, service, API (both drivers), sender, config, migration, UI, smoke                                                                      | met     | counts above; the pg lane below           |
| 10  | Member-initiated USSD action (mask/link, shared throttle, no entry)                                                                            | met     | MR-54/55; 9 unit + 6 API tests            |

Verdict: **ACCEPTED** - the final Tier 2 review, the fix pass and the confirmation all closed on
2026-11-20; the full gate is 7/7 at 06:25:16Z and all five portal mocks are signed. The round is
self-contained and ready to merge.

## Review

Seat: the workers built (outside-bound at the open, `cline-pass` inside for the fix pass); the spec
review and the final confirmation used the reviewer seat for their window (`deepseek-v4-pro:0813`
outside, `mimo-v2.6-pro` inside), independent of the worker.

**Spec review:** REWORK then ACCEPT. The rework caught the stale gate text, the missing error codes and
the absent USSD screens; the reshape review then caught the MR-50 phase dependency, the email+WhatsApp
over-claim, `requires_verified`, the `confirmedAt` source and the terminology. The confirmation
returned ACCEPT with a phase-map note and three copy nits, all fixed.

**Tier 2 build review:** the final review (mimo, inside) returned REWORK; the fix pass and the Q1/Q2
spec changes were confirmed ACCEPT by `deepseek-v4-pro:0813` (outside). The one round-doc P2 was fixed.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                          |
| ----- | --------------------- | ------ | ------------------------------ | ------------------------------------------------------------------------------- |
| 1     | `git-executor rung 1` | branch | `opencode/beam-free`           | Seat unavailable: free usage limit; no write.                                   |
| 2     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Rung-1 fallback; refused `shell-permission-denied`; no write.                   |
| 3     | `parent`              | branch | n/a                            | Both seat rungs unavailable; created `feat/member-verification` from `8e68cf7`. |
| 4     | `parent`              | commit | n/a                            | One squash commit for the round.                                                |
| 5     | `parent`              | push   | n/a                            | Branch pushed with upstream.                                                    |
| 6     | `parent`              | pr     | n/a                            | PR against `main`.                                                              |
| 7     | `parent`              | merge  | n/a                            | Squash merge after the required checks.                                         |
| 8     | `parent`              | sync   | n/a                            | Fast-forward `main` after the merge.                                            |

## Mock sign-off

| Surface                    | Mock                                                  | Capture                                                                          | sha256                                                             | Signer | Date       | Verdict |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| Verified badge and actions | `mockups/v2-shell/23-member-verification-badge.png`   | `ui/e2e/baseline/member-detail-verified.png` (the icon badge; the drawn tooltip) | `d18a16f34d31520a6cd4bbf319d0b7a168305776865fa95941985bab957fc46d` | owner  | 2026-11-20 | signed  |
| Unverified record actions  | `mockups/v2-shell/23-member-verification-actions.png` | n/a (menu-open state; the record is in member-detail-verified)                   | `bbe22ec66bd9c183dafc63e2454c00276ef0e6a9c6948cf008951316ad14829c` | owner  | 2026-11-19 | signed  |
| Sent dialog                | `mockups/v2-shell/23-member-verification-sent.png`    | n/a (dialog; DOM-tested)                                                         | `6bc78de1a14c0377e3e50a2dd1f9cdb9a873e431170f23487af2a26a20cf611a` | owner  | 2026-11-19 | signed  |
| Acceptance page, entry     | `mockups/v2-shell/24-member-acceptance.png`           | `ui/e2e/baseline/acceptance.png`                                                 | `5e4f34b1082331a8ca49866f4dce97a5962e295a7da1ea58cae33aa2f04b16bd` | owner  | 2026-11-19 | signed  |
| Acceptance page, success   | `mockups/v2-shell/24-member-acceptance-verified.png`  | n/a (post-accept state; DOM-tested)                                              | `605fce25d4c04e98c31d21213697bedb02746787daf38c9058b6c509b26f5b83` | owner  | 2026-11-19 | signed  |

**USSD handset states (local review artifacts; the set has no claims catalogue).** The member journey is
`42-verify-profile.png` (`ead0cb3c…`; the `My Profile` screen with `1 Verify contact`, the initiation
point) → `43-verify-sent.png` (`8702b3fc…`; the notice: `A code was sent to <mask>. Open the link we
sent.`) → the portal acceptance states above. The back-office trigger is the record action row in
`23-member-verification-actions.png`/`-badge.png`. Both handset states are listed for the owner review;
the USSD set carries no verification code-entry screen. Both are owner-reviewed with the five states
above (2026-11-19).

Mock coverage: claimed 7 · e2e-only 6 · deferred 1 · prose 2

## Mock parity

n/a - no parity claim until the new states are cut.

## Deviations

- **The first 3a draft is abandoned.** The branch's member-level OTP code (number hash/mask, USSD gate)
  is reworked, not extended; `0025` is re-authored before it ever lands.
- **The badge state is re-cut for the second-contact rule.** `23-member-verification-badge.png` (v4)
  adds `Verify membership` for a proven email with an unproven phone and is signed by the owner
  (2026-11-20); the other four portal states are signed at their current hashes.
- **Worker discrepancies resolved in the spec.** MR-31 now audits the confirmation withdrawal only (a
  proof clear is a column); the public accept code is `code_invalid`; the USSD subscriptions note calls
  `members.verified_at` inert; `Confirm member` is offered to any member without an active confirmation;
  the acceptance-page base is `VERIFICATION_LINK_BASE` (e.g. `/v.html` on static hosting).
- **Prettier reflow.** `documents/specs/member-registrations-ussd.md` was reflowed format-only by the
  worker because `format:check` failed on the parent's amendment; no wording changed.
- **USSD entry retires.** The six gate screens (`42`-`47`) stay archived; the member-initiated
  `My Profile > Verify contact` action and its `verify.sent` notice are the only USSD additions, and the
  page remains the completion.
- **USSD registration write.** The encrypted request number is written by the narrow `src/ussd`
  registration services path.
