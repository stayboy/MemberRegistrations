# Round — event-parent UI mocks

|                        |                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN (owner sign-off pending)                                                                                                               |
| Tier                   | 1 — Plan                                                                                                                                    |
| Mode                   | `unattended (auto-accept recommendations)`                                                                                                  |
| Base                   | `28f67b2`                                                                                                                                   |
| Review rounds          | 1                                                                                                                                           |
| Gate runs in parent    | 1                                                                                                                                           |
| Spec                   | the event-parent specs (`member-registrations-ui.md`, `member-registrations-events-offerings.md`, `member-registrations-event-audience.md`) |
| Workers                | `single` (mock-builder)                                                                                                                     |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (mocks); parent ollama-cloud/deepseek-v4.1-flash:1017 (round doc, catalogue, sign-off)`       |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                     |

## Grill

Mode: unattended (the owner's "go unattended all the work to mock seeking signoff", 2026-11-22).

1. **The re-cut set:** the `v2-events` states (`01-events-list` one New event, `10-event-create` with Repeats + Audience, the activity-detail states with occurrences and the standalone import, the headcount dialog with Visitor Mode) plus the admin/visitor states (the Admin Audiences page, the member add visitor/promotion)?
   Recommendation: yes, one mock round across the two sets; the owner's sign-off is the milestone.
   Cost: the owner reviews every auto-signed state; a rejected state drops to `target`.
2. **The coverage:** each re-cut is `auto-signed` under §17 so the round closes; the owner's sign-off flips the list to `signed`.
   Recommendation: yes.
   Cost: the owner reviews the list at the end; a reject re-cuts.

## Plan

Re-cut the mocks to the approved event-parent spec: the events list with **one** New event verb and one row per event (recurring/standalone, the audience badge); the event form with **Repeats** and the **Audience** picker (no ministry/presbyter fields); the activity detail with the recurrence and the occurrence rows (the standalone import); the headcount dialog with **Visitor Mode**; the Admin Audiences page; the member add's visitor status and promotion. The mock artefacts are local (git-ignored); the catalogue carries the `auto-signed` coverage.

## Verification

| Gate                | Command                                                  | Result     |
| ------------------- | -------------------------------------------------------- | ---------- |
| Mocks shell-check   | `node scripts/mock/shell-check.mjs v2-events v2-shell`   | 34/34      |
| Mock-claims guard   | `npx vitest run tests/meta/mock-claims.test.ts`          | 77 passed  |
| Protected-doc guard | `npx vitest run tests/meta/protected-doc-review.test.ts` | 7 passed   |
| Fast gate           | `npm run verify:fast`                                    | pass — 4/4 |

gate-run 2026-11-22T20:37:57.688Z profile=fast steps=4/4 lines=4 bytes=703

## Review

The protected review of the two catalogues (`deepseek-v4-pro:0813`, first choice): the first pass ACCEPTed with three P2s — the events-list entries filed under the detail story, two mixed present/absent atoms, and the rule-builder/promotion atoms unreachable from the inventory. All three were fixed (a new `EVA-LIST` story, `EVC-NO-MINISTRY`, `AD-HC-NO-SUM`, the two atoms made mock-only) and the confirmation ACCEPTed. Two pre-existing nits (three stale auto-signed bases; three orphan states) are out of scope.

Seat: consistent — mock-builder/parent `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

`git-seat-budget: 12` (this round `1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync = 6 of 12`).

| Brief | Actor                 | Verb     | Variant                        | Reason                                                |
| ----- | --------------------- | -------- | ------------------------------ | ----------------------------------------------------- |
| 1     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/event-parent-mocks` from `main`; rung 1 429 |
| 2     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | The re-cut catalogue and the round doc                |
| 3     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Feature branch only                                   |
| 4     | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                     |
| 5     | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | After the checks                                      |
| 6     | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull                                       |

## Mock sign-off

| Surface | State                          | sha256      | Signer | Date    | Verdict                       |
| ------- | ------------------------------ | ----------- | ------ | ------- | ----------------------------- |
| Events  | `01-events-list`               | `876bbec4…` | owner  | pending | auto-signed, pending sign-off |
| Events  | `10-event-create`              | `5f5d7194…` | owner  | pending | auto-signed, pending sign-off |
| Events  | `03-activity-detail-series`    | `366a23b5…` | owner  | pending | auto-signed, pending sign-off |
| Events  | `04-activity-detail-event`     | `a4404b25…` | owner  | pending | auto-signed, pending sign-off |
| Events  | `05-activity-detail-cancelled` | `1b5af370…` | owner  | pending | auto-signed, pending sign-off |
| Events  | `06-record-headcount-dialog`   | `0ff059ff…` | owner  | pending | auto-signed, pending sign-off |
| Events  | `07-import-attendance-panel`   | `4140f134…` | owner  | pending | auto-signed, pending sign-off |
| Admin   | `25-admin-audiences`           | `c6a7efed…` | owner  | pending | auto-signed, pending sign-off |
| Admin   | `26-audience-rule-builder`     | `0024461a…` | owner  | pending | auto-signed, pending sign-off |
| Admin   | `27-add-member-visitor`        | `91d28c70…` | owner  | pending | auto-signed, pending sign-off |
| Admin   | `28-member-visitor-promote`    | `ce8c80ec…` | owner  | pending | auto-signed, pending sign-off |

Mock coverage: claimed 11 · e2e-only 0 · deferred 0 · prose 0 (for the re-cut states; the full catalogue line is in `documents/mock-claims/`).

## Mock parity

Pending at the owner's sign-off.

## Acceptance

| #   | Criterion                                              | Met     | Evidence                |
| --- | ------------------------------------------------------ | ------- | ----------------------- |
| 1   | The re-cut states match the approved spec              | yes     | the eleven states above |
| 2   | The catalogue records each `auto-signed` with its hash | yes     | the sign-off table      |
| 3   | The protected review accepts the two catalogues        | yes     | `## Review`             |
| 4   | The owner signs the states                             | pending | the milestone           |

Verdict: **PENDING OWNER SIGN-OFF**.

## Deviations

- **Every re-cut state is `auto-signed`** under §17 (owner, 2026-11-15), with `by: "unattended"` and a pending-owner basis; none claims the owner signed. The owner's sign-off flips each to `signed`, or drops it to `target` for a re-cut.
- **Pre-existing auto-signed states:** `02-event-detail`, `05-offerings-landing` and `07-offering-terms` keep their earlier basis and are not part of this re-cut; the `v2-shell` shell/shepherding/member states predate this round.
- **The form is drawn with Repeats on**, so the Sessions section carries the "the API generates the window" note; the standalone date table is the same form with Repeats off (no second form state).
- **The member add and the promotion are two states** because FR-83 puts **Promote to member** on the record's Actions menu.
