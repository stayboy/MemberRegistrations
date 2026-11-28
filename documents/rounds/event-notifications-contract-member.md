# Round - event-notifications-contract-member

|                        |                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Status                 | OPEN - the member-scoped contract the drawer and the lift call                                 |
| Tier                   | 2 - Reviewed                                                                                   |
| Mode                   | `attended`                                                                                     |
| Base                   | `bff247a`                                                                                      |
| Review rounds          | 1                                                                                              |
| Gate runs in parent    | 3                                                                                              |
| Spec                   | `documents/specs/member-registrations-event-notifications.md`                                  |
| Workers                | `single`                                                                                       |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017 (member read/revoke schemas, paths, openapi.json) |
| Verbs this round needs | `commit`; `push` and `pr`; `merge`                                                             |

## Git budget

git-seat-budget: 3

One commit, one push, one PR. Branch `feat/notifications-contract-member` off `origin/main` at `bff247a`.

## Grill

The owner answered the build-step round on 2026-11-27: **"all as recommended"**, the whole eleven-question
frontier. Recorded here in full, because a decision must not live only in a chat transcript:

| #   | Decision                                                                                                       | Where it lands                  |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Q1  | the contract round closes to `main` before the next branches                                                   | done - `bff247a`                |
| Q2  | the five member-scoped endpoints are contracted before either track branches, with the contract-shaped P3s     | this round                      |
| Q3  | the page's verbs ride with its reads; one round                                                                | the page round                  |
| Q4  | two tracks: every page handler in one, the page and its dialogs in the other                                   | the page round                  |
| Q5  | the lock, `return-to-draft`, the publish acknowledgement and the event-detail card go with authoring           | the authoring round             |
| Q6  | a failure-report block (digest recipient and on/off) beside the send button, as a new signed state             | the page round, mock gate first |
| Q7  | FR-34's full-history message search is deferred; the grid's `q` is this round's search                         | `documents/backlog.md`          |
| Q8  | **the gates named:** round `event-notifications-page` - the contract amendment, `0034` and `0035` are approved | this round and the page round   |
| Q9  | Q4's audit fix-forward rides in the page round, with `0034`, as AC-47's actor row                              | the page round                  |
| Q10 | three API proofs: the counts partition a seeded range, `q` filtered in SQL, the drawer never sets `read_at`    | the page round                  |
| Q11 | the UI mocks extend `ui/e2e/fixtures.ts` from the contract's examples, recorded as a deviation                 | the page round                  |

The reviewer found the gap in the previous round and called the member routes "a separate round's surface". The drawer
is a signed state and the lift is the only early release a mute has, so the page cannot be whole without them.

The reviewer found the gap in the previous round and called the member routes "a separate round's surface". The drawer is a signed state and the lift is the only early release a mute has, so the page cannot be whole without them.

## Plan

**Goal.** Contract the five member-scoped endpoints the page's drawer and mute-lift call, so the page round's tracks have nothing left to invent. No handlers: the page round implements them.

1. **Reads.** `GET /v1/members/{memberNo}/notifications` (the inbox: pending first then read, each with its **rendered body**, cursor-paged, and **never** setting `read_at`); `GET /v1/members/{memberNo}/notification-deliveries` (that member's deliveries, masked, cursor-paged, carrying enough to group by event); `GET /v1/members/{memberNo}/notification-settings` (cadence plus that member's live mutes and blocks).
2. **Revokes.** `POST /v1/members/{memberNo}/notification-mutes/{id}/revoke` and `POST /v1/members/{memberNo}/channel-blocks/{id}/revoke`, both carrying FR-50's `authorised_via` and `reference` and the actor header.
3. **The P2/P3s the reviewer raised** that are contract-shaped rather than handler-shaped: the preference row's scope, and the bulk-retry refinement that must not answer a generic `validation_error`.

**Out of scope.** Every handler, `0034`, `0035`, the UI, USSD.

## Verification

| Gate      | Command               | Result |
| --------- | --------------------- | ------ |
| Format    | `npm run verify:fast` | PASS   |
| Lint      | `npm run verify:fast` | PASS   |
| Typecheck | `npm run verify:fast` | PASS   |
| Test      | `npm run verify:fast` | PASS   |

The worker's first run timed out `tests/db/pgboss-schema.test.ts` at 15 000 ms under load (the file passes alone in
3.3 s) and its second passed. The parent's run below is the one of record.

```
gate-run 2026-11-27T23:42:51.406Z profile=fast steps=4/4 lines=4 bytes=702
```

## Review

Seat: `reviewer` (read-only), one round on the frozen diff. **Verdict: ACCEPT**, no P1.

Both P2s are answered rather than waved through. Its first — that the 100-id cap is prose only, since `.max(100)` fails Zod before
a handler sees the body — is now a `documents/backlog.md` row with the page round's handler track as its trigger, so the
obligation cannot be lost between rounds. Its second, that `eventId` amends a component the previous round contracted,
is the deliberate change this round's Deviations already record, and the owner ruled these routes contracted now. Its
out-of-scope note, that the inbox example never showed a `system` message, is fixed: the example now carries a pending
event message, a read one and a system notice, so the null branch is drawn rather than inferred.

## Git writes

| Brief | Actor  | Verb   | Variant | Reason                               |
| ----- | ------ | ------ | ------- | ------------------------------------ |
| 1     | parent | commit | direct  | attended; the member-scoped contract |
| 2     | parent | push   | direct  | the round's branch                   |
| 3     | parent | pr     | direct  | `--base main`                        |
| 4     | parent | merge  | direct  | squash, delete the branch, then pull |

## Mock sign-off

No new UI this round. The notification set is signed: 13 states.

## Acceptance

| Criterion                                     | Met | Evidence                                                                                        |
| --------------------------------------------- | --- | ----------------------------------------------------------------------------------------------- |
| The drawer's three reads are contracted       | yes | the three paths in `openapi.json`                                                               |
| Both revokes carry FR-50's fields             | yes | `NotificationPreferenceRevoke`: `required: [authorisedVia, reference]`, `reference` minLength 1 |
| The reviewer's contract-shaped P3s are closed | yes | `scopeId` beside `scope`; the retry description names `422 batch_too_large`                     |
| No handler and no migration lands             | yes | the diff touches no `src/routes`, no `src/db/migrations.ts`                                     |

## Deviations

- **The lift's refusal gained a code, like the digest's.** FR-50 named no code for a lift of a dead row, so the two
  revokes answered an untyped 409 - the same gap the last reviewer raised as a P2 on the digest. They now answer
  `409 preference_not_live`, FR-50 says so, and the API spec's error list carries it.
- **The worker's judgement calls, recorded because the spec does not decide them.** `kind` is N-14's message kind
  (`event|system`) and the slot kind is a separate `slotKind`, because the signed drawer titles a message "Carols by
  Candlelight - Reminder". `sentAt` is the instance's due instant, since the message row stores only `created_at`;
  a system message has none. Settings split `mutes` from `blocks` so the drawer's two lines map directly. `reference`
  is trimmed and non-blank - stricter than the spec's "required", and the stricter reading is the one that records an
  authorisation rather than a blank. `eventId` is required on the delivery row, the one deliberate change to a
  component the previous round contracted, because FR-51's grouping needs a stable key.
- **`flier_id` is deliberately not on the inbox message.** N-14 stores it, but the signed drawer's body says "A flier
  is in your email" in its own text and draws no attachment, so the contract carries what the surface shows. Recorded
  rather than silently narrowed.
- **The page round needs an eleventh state.** Q6's answer puts a failure-report block (digest recipient and on/off) beside the send button, because nothing today sets `failure_digest_to` and the button would be permanently refused. That is a new drawing, and the mock-first gate needs the owner's signature before the page round's first code commit.
