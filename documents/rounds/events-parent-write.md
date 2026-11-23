# Round - events-parent-write

|                        |                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                    |
| Tier                   | 2                                                                                                                       |
| Mode                   | `unattended (auto-accept recommendations)` — the owner's Q8 answer, this round only                                     |
| Base                   | `4496884`                                                                                                               |
| Review rounds          | 0                                                                                                                       |
| Gate runs in parent    | 0                                                                                                                       |
| Spec                   | `documents/specs/member-registrations-api.md` (Event parent, recurrence, occurrences), `…-event-audience.md`, `…-ui.md` |
| Workers                | `single` (two dispatches: the contract, then the handlers)                                                              |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (contract, handlers, member field)`                                       |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                 |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                                      | Basis                        |
| -------- | -------------- | ------ | -------------- | --------------------------------------------------------------------- | ---------------------------- |
| Worker   | `2026-11-23`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` — answered                    | outside-window order, probed |
| Reviewer | `2026-11-23`   | out    | reviewer       | `ollama-cloud/deepseek-v4-pro:0813` — answered                        | first choice, outside window |
| Git seat | `2026-11-23`   | out    | git-executor   | `opencode/beam-free` — 429; `ollama-cloud/mimo-v2.6-flash` — answered | rung 1 unavailable           |

## Grill

1. **Is 2b-write the whole parent-and-recurrence write surface?** The routes are `POST /v1/events`,
   `PATCH /v1/events/:id`, `archive`, `occurrences/{date}/cancel`, `recurrence/versions` and
   `recurrence/exceptions`, plus the audience writes and `eventNo` on create — not capture, not offerings.
   Recommendation: yes, one write slice for the parent and its recurrence, two dispatches with a gate between.
   Cost: the largest API slice left, with a big review. Owner answered "all as recommended" (2026-11-23).
2. **One form for both shapes, or keep a separate series form?** The contract takes an optional recurrence, so a
   standalone and a recurring event are one payload. Recommendation: one form; the series form retires with its route.
   Cost: the series create route and its e2e case change in the UI write round. Owner answered "all as recommended".
3. **Contract first, as the now-binding workflow says?** Recommendation: yes — contract-only PR, handlers second.
   Cost: two PRs and two CI runs. Owner answered "all as recommended".
4. **Does the audience picker include inline creation of a custom audience?** Recommendation: yes, with a dialog.
   Cost: one more dialog and its error paths. Owner answered "all as recommended".
5. **`eventNo` on create: client-optional, server-minted otherwise, `409` on a duplicate?** Recommendation: yes.
   Cost: the minting rule needs a test and a format decision. Owner answered "all as recommended".
6. **Create as `draft` with an explicit Activate, or create already `active`?** Recommendation: `draft`, with
   "Save draft" and "Save and activate". Cost: two calls on the published path. Owner answered "all as recommended".
7. **Does membership status land here, on the member record?** Recommendation: yes, on the member form.
   Cost: a member-form change inside an event round. Owner answered "all as recommended".
8. **Unattended for this round, ending at its close?** Recommendation: yes. Cost: the change set is seen after the
   merge; a migration, auth or wire gate would still park. Owner answered "all as recommended".
9. **When does the seat-file `git add -A` clause land?** Four refusals on the UI round traced to `git add --` not
   staging a deletion. Recommendation: in this round, one clause in both seat files. Cost: the seat files carry it
   ahead of the next protected review. Owner answered "all as recommended".

## Plan

Goal: the write half of the event-parent API, contract first.

Dispatch 1 (contract): the Zod request/response schemas for `POST /v1/events` (parent + optional recurrence),
`PATCH /v1/events/:id`, `POST /v1/events/:id/archive`, `POST /v1/events/:id/occurrences/:date/cancel`,
`POST /v1/events/:id/recurrence/versions`, `POST /v1/events/:id/recurrence/exceptions`, the audiences `POST`/`PUT`, and
`membershipStatus` on the member write; one realistic success example per operation; the regenerated `openapi.json`
and its snapshot equality test. No handler in this dispatch.

Dispatch 2 (handlers): the routes and repositories behind those schemas, the `eventNo` minting rule (client value,
server default, `409` on duplicate), the draft-to-active transition, the legacy projections derived from the audience,
and the route tests. The audience writes refuse a system audience (`409 audience_system`).

Out of scope: capture and the import panel (2b-capture), offering attachments, the UI write screens, USSD, and any
migration.

Acceptance criteria:

1. The contract documents every write above with one success example each; the snapshot test passes.
2. `POST /v1/events` creates a draft parent, with or without a recurrence, and mints `eventNo` when absent.
3. `PATCH` accepts the parent fields and refuses the legacy `ministry`/`presbyterOnly` inputs with `422`.
4. Archive, occurrence cancel and the recurrence writes behave as their read models show, and history stays readable.
5. A system audience refuses a write with `409 audience_system`; a custom one accepts it.
6. `membershipStatus` is a validated member field with the spec's three values.
7. No migration, no UI change, no capture change.

## Verification

| Gate              | Command                                             | Result         |
| ----------------- | --------------------------------------------------- | -------------- |
| Fast gate         | `npm run verify:fast`                               | pass — 4/4     |
| Contract snapshot | `npx vitest run tests/api/openapi-snapshot.test.ts` | pass — 2 tests |

gate-run 2026-11-23T07:17:26.224Z profile=fast steps=4/4 lines=4 bytes=691

## Review

Seat: consistent — worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                       |
| ----- | --------------------- | ------ | ------------------------------ | -------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/events-parent-write`               |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The contract PR                              |
| 3     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                  |
| 4     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | Contract PR against `main`                   |
| 5     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | Contract PR, after the checks                |
| 6     | `parent`              | sync   | -                              | `main` is held by the `ussd-budget` worktree |

`git-seat-budget: 6` for the contract chain; the handlers PR opens a second chain in this round and raises the line
to 11 when it does (`6 + 1 commit + 1 push + 1 pr + 1 merge + 1 sync`), with the arithmetic recorded then.

## Mock sign-off

n/a - no user-visible surface.

## Mock parity

n/a - no mock.

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

- **The handlers PR opens a second chain in this round**; the budget line is raised to 11 at that point, with the
  arithmetic in this table.
- **The contract-first window is real and deliberate.** `POST /v1/events` documents the parent-create payload while the
  current handler still validates the legacy payload until the handlers dispatch; no UI client calls the parent write
  in between.
- **`PATCH` replaces `PUT` for the parent write**, and the spec's route table says so: `PUT` is relabelled the legacy
  per-instance write that retires when the form moves. The contract keeps both, with the legacy one bound to its old
  schema.
- **FR-34 is half in this slice: the write carries `membershipStatus`, the read does not.** The create/update
  payload accepts `visitor | active` (default `active`), and `archived` stays derived from `archivedAt` and is never
  a write value — that is the spec's intent, not a gap. Two read-side gaps remain, both deferred to the member-read
  follow-up and covered by the backlog row "Member reads do not expose membership status": (1) `GET /v1/members` and
  the member detail do not return `membershipStatus`, so the field the write accepts cannot be shown; (2) the list's
  `status` filter still accepts only `active`/`archived`, not `visitor` (or `all`). Neither is a write-side behaviour,
  so neither belongs in this slice.
- **The delete-exception route is in the contract.** The round's scope list named the two recurrence POSTs; the spec's
  route table also has `DELETE …/recurrence/exceptions/{date}`, so it is documented with a `200` recurrence response
  rather than left out of the seam.
