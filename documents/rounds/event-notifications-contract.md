# Round - event-notifications-contract

|                        |                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED - the contract repaired, review ACCEPT, merged                                                    |
| Tier                   | 2 - Reviewed                                                                                             |
| Mode                   | `attended`                                                                                               |
| Base                   | `545da2b`                                                                                                |
| Review rounds          | 1                                                                                                        |
| Gate runs in parent    | 3                                                                                                        |
| Spec                   | `documents/specs/member-registrations-event-notifications.md`                                            |
| Workers                | `single`                                                                                                 |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017 (contract schemas, paths, openapi.json, sibling amendments) |
| Verbs this round needs | `commit`; `push` and `pr`; `merge`                                                                       |

## Git budget

git-seat-budget: 3

One commit for the contract and the sibling amendments, one push, one PR. The branch is
`feat/notifications-contract` off `origin/main`.

## Grill

The owner answered the way-forward round on 2026-11-27: Q11 "this fits policy. notifications are a specialised
feature", all others as recommended. The decisions this round acts on:

| #   | Decision                                                              | Where it lands   |
| --- | --------------------------------------------------------------------- | ---------------- |
| Q1  | contract repair alone first, then the page and the read API as tracks | this round       |
| Q2  | summary, cross-event deliveries, live preferences, on-demand digest   | this round       |
| Q3  | live aggregates, server-side search                                   | FR-49, recorded  |
| Q4  | retry's audit moves to `notification_delivery_events`                 | the loop         |
| Q5  | `authorised_via` and `reference`, migration `0035`                    | the loop         |
| Q6  | FR-46 enforced at publish                                             | the loop         |
| Q7  | the lock and `return-to-draft` as one slice                           | the loop         |
| Q8  | one digest composer, two triggers                                     | the loop         |
| Q9  | five sibling amendments                                               | this round       |
| Q10 | authoring deferred                                                    | the round after  |
| Q11 | notifications is the specialised set                                  | policy, recorded |
| Q12 | `28`-`33` signed                                                      | done, 13 signed  |
| Q13 | the gates named: this round's wire contract, `0034`, `0035`           | this round       |

## Plan

**Goal.** The contract the page needs, before any UI branches. No handlers and no migration files: `0034` and `0035`
land with the loop that uses them.

1. **The four routes** the page needs and the contract did not have, in `src/openapi.ts` and the regenerated
   `openapi.json`: `GET /v1/notification-summary`, `GET /v1/notification-deliveries`,
   `GET /v1/notification-preferences` and `POST /v1/notification-digest`. The replay and bulk-retry routes and the
   `delivery_not_retryable`, `replay_not_valid` and `batch_too_large` codes join them.
2. **The five sibling amendments**, each naming the behaviour it now shares:
   - `member-registrations-api.md` - the notification routes and the three codes.
   - `member-registrations-ui.md` - FR-42e/AC-62 gain Activate, Return to draft and the Notifications entry.
   - `member-registrations-ussd.md` - the menu, the glossary keys and the pageSize map.
   - `member-registrations-event-periods.md` - the lock replaces the status-blind `409 recurrence_locked`.
   - `member-registrations-event-audience.md` - the locked event refuses earlier with `409 event_locked`.
3. **No handler and no migration.** The snapshot is the seam; the loop implements the routes and lands `0034`/`0035`.

**Out of scope.** The routes' handlers, the migrations, the UI and the R3b member surfaces.

## Verification

| Gate      | Command               | Result |
| --------- | --------------------- | ------ |
| Format    | `npm run verify:fast` | PASS   |
| Lint      | `npm run verify:fast` | PASS   |
| Typecheck | `npm run verify:fast` | PASS   |
| Test      | `npm run verify:fast` | PASS   |

The first run failed `tests/api/event-offering-counts.test.ts` with `connect ENOBUFS 127.0.0.1`, a socket-buffer
exhaustion under load and not an assertion; that file passed 19/19 alone, and the re-run passed. One re-run of the
touched file, one of the gate: two, the round's limit, and no third failure.

```
gate-run 2026-11-27T20:45:00.544Z profile=fast steps=4/4 lines=4 bytes=904
```

Under it: `Test Files 110 passed | 1 skipped (111)`, `Tests 1396 passed | 46 skipped (1442)`.

## Review

Seat: `reviewer` (read-only), on the frozen diff `45394e12…` — model as configured, one round.
**Verdict: ACCEPT**, no P1.

Its P2 was closed before this record: the digest's 409 was the only refusal in `src/openapi.ts` without a stable
code. It now answers `409 digest_unconfigured`, the API spec's error list names it, and AC-51 names it, so the
handler does not invent one. The gate was re-run afterwards.

Its P3s are recorded as the handler round's obligations, not defects here: the Zod `.max(100)` means 101 ids fail
validation before a handler sees them, so answering `422 batch_too_large` rather than a generic
`validation_error` is the handler's job; `reason` is nullable without a refinement tying it to `refused`; and
`scope` is a display name where N-14 stores `scope_id` and `scope_name` separately. The reviewer also flagged that
the thirteen `notifications.*` USSD keys are enumerated here for the first time, with no source-of-truth list to
check them against: the USSD build confirms them.

## Git writes

| Brief | Actor  | Verb   | Variant | Reason                                           |
| ----- | ------ | ------ | ------- | ------------------------------------------------ |
| 1     | parent | commit | direct  | attended; the contract and the siblings          |
| 2     | parent | push   | direct  | the round's branch                               |
| 3     | parent | pr     | direct  | `--base main --head feat/notifications-contract` |
| 4     | parent | merge  | direct  | squash, delete the branch, then pull             |

## Mock sign-off

No new UI this round. The notification set is signed: 13 states, `28`-`33` signed on 2026-11-27.

## Acceptance

| Criterion                                         | Met | Evidence                                                                            |
| ------------------------------------------------- | --- | ----------------------------------------------------------------------------------- |
| The page's reads are contracted                   | yes | the four paths in `openapi.json`; delta check: 6 paths added, 0 removed             |
| Replay, bulk retry and their codes are contracted | yes | both paths; `replay_not_valid`, `batch_too_large` (422), `delivery_not_retryable`   |
| The five siblings agree with the spec             | yes | the five amendments, each with a changelog line                                     |
| No handler and no migration lands here            | yes | the diff touches no `src/routes`, no `src/create-app.ts`, no `src/db/migrations.ts` |

## Deviations

- **The migration numbers moved.** The replay schema is `0034`, because `0033_event_period_definition` already owns
  that number; FR-50's columns are `0035`. The spec was corrected before this round opened.
- **The parent corrected three things in the worker's contract before review** (the worker reported all three as
  its own judgement calls). `kind` left `NotificationDeliveryRow`: the spec's AC-53 and the signed grid name the
  member, the event, the channel, the status and a masked destination, and no kind, and `'change'` cannot occur
  because a change notice has no delivery row. `replay_already_made` became `replay_not_valid` with
  `already_replayed` among the failed checks, because FR-52 gives a refusal one code. And the bulk-retry example's
  comment said twelve of sixteen over an example of one and one.
- **`not_found` is a spec clarification, not a new behaviour.** FR-53 named two refusals; an id that no longer
  exists is neither "no longer failed" nor terminal, so the contract could not answer it. FR-53 now names the third
  and the changelog records it. A narrow clarification, of the kind §2 allows with a changelog line.
- **One refusal gained a code the spec did not name.** AC-51 said "refused with its reason"; the contract now
  answers `409 digest_unconfigured`, and AC-51 and the API spec's error list name it. A refusal without a code is
  a hole a handler fills with its own invention, and this file names a code on every other 409.
- **The USSD glossary keys are named here for the first time.** N-11 requires `menu.notifications` and the
  `notifications.*` keys its completeness test needs but does not enumerate them; this round names thirteen, each
  mapping to a phrase N-11 already states. Renaming them is a spec edit, not a code change.
