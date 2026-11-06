# USSD provider adapters (ticket 24d, slice B1)

|                     |                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                          |
| Tier                | 2 - Reviewed                                                                                  |
| Mode                | `unattended` (subagent slice)                                                                 |
| Base                | `b942d82`                                                                                     |
| Review rounds       | 1                                                                                             |
| Gate runs in parent | 0                                                                                             |
| Workers             | `single (slice B1)`                                                                           |
| Spec                | `documents/specs/member-registrations-ussd.md`; `documents/specs/member-registrations-api.md` |

## Plan

Slice B1 ships the provider-adapter layer only. Slice B2 (the operator USSD section and pages) is out
of scope and follows.

**One pipeline, declarations.** `src/ussd/adapters.ts` declares `{ id, route, authenticator, toFrame,
toWire, maxMsgChars, pageSize }`; `src/ussd/pipeline.ts` holds the session work lifted verbatim out of
the old `/ussd/session` handler; `src/routes/ussd.ts` registers one thin route per adapter over
`executeUssdAdapter`. Adding provider C is one adapter object plus one `buildUssdAdapters` entry. The
machine, glossary, repositories and services do not branch on a provider.

- **HMAC reference adapter** (`id: 'hmac'`, `/ussd/session`). It keeps the same checks in the same
  order (headers, nonce length, five-minute clock window, signature, nonce replay), then the same frame
  validation, rate-limit counters, session load/create, advance and `touchSession`. `maxMsgChars` is
  `182` - the internal budget - so the truncation is a no-op; `pageSize` is `{ events: 3, offerings: 5 }`.
  The wire DTO and `Cache-Control: no-store` are unchanged.
- **Nalo adapter** (`id: 'nalo'`, `/ussd/nalo`). `authenticator` matches `USERID` against
  `USSD_NALO_USER_ID` before any session work; a mismatch or absent id is `401 unauthorized` and
  writes nothing. `toFrame` validates the Nalo body (`USERDATA` over 64 is `422 validation_error`),
  normalises `MSISDN`, resolves `SESSIONID` by `(provider, external_id)`, and assigns
  `stored.lastInputSeq + 1` (there is no Nalo frame counter). `toWire` attaches `SESSIONID` to the
  created session, echoes `USERID`/`MSISDN`, omits `SESSIONID`, sets `MSGTYPE = !done`, and truncates
  `MSG` to `USSD_NALO_MAX_MSG_CHARS` with `…` only when the render is longer. `pageSize` is
  `{ events: 2, offerings: 3 }`.
- **Machine page size.** `renderedSelect` and the `offerings.select` advance path now read
  `session.pageSize.offerings` through `offeringPageSize`; `activityPageSize` already read
  `pageSize.events`. The machine never sees a message cap; it renders exactly the declared rows and
  the screens are laid out to fit 120 with the two/three-row pages.
- **Re-delivery.** Resolving by `(provider, external_id)` means a replayed `SESSIONID` continues the
  same internal session. A money commit is protected by the per-confirmation idempotency key stored in
  the session context when the confirmation screen is rendered; a replayed Accept reuses the key and
  returns the same group. A replayed non-money frame may advance one screen, which is the documented
  Nalo limitation.
- **Dev simulator** (`POST /dev/ussd/session`). Development-only; it returns `404 not_found` when
  `NODE_ENV === 'production'` (checked before body parsing) and the canonical `503 ussd_disabled` when
  `USSD_ENABLED` is false. It builds the provider wire server-side (fresh HMAC timestamp/nonce or Nalo
  JSON) and runs the same adapter execution seam and session pipeline as the provider route. No gateway
  secret or shared-secret signature appears in a response. `seq` is optional for HMAC; Nalo uses
  `sessionId` as its `SESSIONID`.
- **No migration.** Migration `0016` already added `ussd_sessions.provider` and
  `ussd_sessions.external_id` with the partial unique `(provider, external_id)` index in slice A. This
  slice only reads and writes those columns through the existing repository methods.
- **Configuration.** `USSD_NALO_USER_ID` is 1-32 characters with dev default `NALOTest`, required in
  production and rejected when it still equals the default. `USSD_NALO_MAX_MSG_CHARS` is an integer
  1-182, default 120.
- **OpenAPI.** `/ussd/nalo` is documented. `/dev/ussd/session` is deliberately absent: it is a
  development-only tool, refuses in production, and is not part of the browser API surface. It is
  still in the spec route table.
- **Smoke.** `scripts/smoke.mjs` now checks Nalo `USERID` authentication, a wrong-`USERID` `401`,
  both dev-simulator providers producing no secret, and a second boot with `USSD_ENABLED` unset
  answering `ussd_disabled` on both entries. A production refusal is not smoke-tested because a
  production boot requires a real database, email configuration and non-default secrets, and refuses
  `USSD_ENABLED=true`; that gate stays covered by `tests/api/ussd-nalo.test.ts`.

## Verification

| Gate             | Command                                | Result                                  |
| ---------------- | -------------------------------------- | --------------------------------------- |
| Skill            | `node scripts/verify-skill.mjs`        | pass                                    |
| Format           | `npm run format:check`                 | pass                                    |
| Lint             | `npm run lint`                         | pass                                    |
| Typecheck        | `npm run typecheck`                    | pass                                    |
| Tests            | `npm run test`                         | pass - 42 files, 529 passed / 3 skipped |
| Build            | `npm run build`                        | pass                                    |
| Serialized tests | `npx vitest run --no-file-parallelism` | pass - 42 files, 529 passed / 3 skipped |
| Smoke            | `npm run smoke`                        | pass - 72 checks                        |

`node scripts/verify.mjs full` emitted, verbatim:

```text
gate-run 2026-11-06T21:22:05.276Z profile=full steps=6/6 lines=6 bytes=680
```

The signature is from the slice worker's own run; the parent has not re-run the gate, which is why
`Gate runs in parent` is `0`. Format, lint and typecheck were re-run on the final tree after the last
documentation edits and pass.

Parallel runs hit the known Windows/PGlite worker exit `3221226505` four times: two exploratory
`npm run test` runs (`subscriptions`, then `ussd`; 488 and 498 passed before the worker died) and two
later `verify.mjs full` re-runs after the green gate (`ussd-nalo`/`events`, then `payment-groups`). Per
the bounded-gate rule each was retried at most once and recorded, not looped. The serialized run passed
42/42, and the recorded full gate passed every step (its test step: 42 files, 529 passed / 3 skipped).
No test was skipped for this slice.

## Acceptance

TBD by the parent review.

## Interpretations

- **"At session creation".** The pipeline creates the row and `toWire` attaches `SESSIONID` in the same
  first-frame request, because the adapter contract fixes the frame to `{ phone, sessionId?, input,
seq }` and gives the pipeline no provider field. The observable rule is the spec's "stores the
  gateway id there on the first frame"; a continuation resolves it to the internal uuid.
- **`MSGTYPE`.** It is accepted as Nalo's fresh/continue signal but does not decide resolution.
  Resolution is `SESSIONID` plus `(provider, external_id)`, so a re-delivered first frame still resumes
  the session instead of creating a second one. The spec sentence that made `MSGTYPE` the decision was
  corrected.
- **Dev forwarding.** The simulator calls `executeUssdAdapter` directly instead of making an HTTP call
  to the provider route. It still runs the real authenticator, `toFrame`, pipeline and `toWire`, and
  failures propagate as the same problem+json. The spec wording was corrected from "forwards" to "runs
  the matching adapter through the same execution seam".
- **Truncation marker.** `…` is the adapter's `MSG` fallback only. Dynamic field truncation inside the
  machine keeps the pre-existing `.` rule; the two are different budgets.
- **Smoke production refusal.** Not feasible in the smoke stack: `NODE_ENV=production` requires a real
  `DATABASE_URL`, `RESEND_API_KEY` and `MAGIC_LINK_FROM`, non-default secrets, and `USSD_ENABLED=false`.
  The API suite covers it with the app built in test mode and `NODE_ENV` flipped per request.
