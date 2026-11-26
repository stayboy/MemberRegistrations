# Round - event-notifications-r4-mocks

|                        |                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Status                 | CLOSED - five states cut, auto-signed, catalogue recorded                                        |
| Tier                   | 0 - Solo                                                                                         |
| Mode                   | `unattended (auto-accept recommendations)`                                                       |
| Base                   | `8b6715a`                                                                                        |
| Review rounds          | 0                                                                                                |
| Gate runs in parent    | 2                                                                                                |
| Spec                   | `documents/specs/member-registrations-event-notifications.md`                                    |
| Workers                | `single`                                                                                         |
| Implementer            | parent cline-pass/cline-pass/deepseek-v4.1-flash-1017 (mocks, round doc)                         |
| Verbs this round needs | `commit`; `push` and `pr`; `merge` - all pre-authorised by "go unattended to mock building step" |

## Git budget

git-seat-budget: 3

One commit for the catalogue and this record, one push, one PR. No branch verb: the round cuts
`docs/notification-mocks` from `origin/main` because `main` is checked out in another worktree.

## Grill

The frontier for a mock cut is short: what to draw, and how to record what the drawing claims.

1. **Which screens to cut.** R4 owns twelve states across three sets. Recommendation: cut the five officer-facing notification screens that R3 made real, and leave the USSD and admin states uncut. Cost: the milestone is reached with five of twelve, and R4 must cut the rest before it writes those screens.
2. **Whether to promote the new states to `auto-signed`.** Recommendation: yes, under §17, with the basis and the hash in the catalogue. Cost: the owner must confirm or drop each at the end of the unattended work; an `auto-signed` state that is never reviewed is a signature nobody gave.
3. **Whether to declare surfaces and AC slices now.** Recommendation: no. A surface binds a screen to an AC slice and a baseline; these screens have no baseline, so declaring a slice would claim coverage that cannot be compared. Cost: the set's coverage line stays at its existing six, and the notification surfaces land with R4.

## Plan

**Goal.** The mock step the owner named as the milestone: the officer-facing notification screens as drawings, before
R4 writes any of them.

**Scope.** Five states in the existing `mockups/v2-events/` set, cut from the notification spec (N-12, FR-16, FR-17,
FR-19) and the R3 send path:

| State                            | What it draws                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `27-event-detail-notifications`  | the panel on an active published event: plan status, per-instance counts, the aggregate mute and block line, the failed list with retry |
| `28-notification-plan-form`      | the slots table and the four channel editors, the flier dropzone                                                                        |
| `29-notification-preview`        | four rendered bodies, per-channel counts, excluded counts by reason with `no_contact` named                                             |
| `30-notification-publish-dialog` | instance counts, the `daily` deferral list, the acknowledgement                                                                         |
| `31-notification-change-notice`  | the notice as its own body per channel, slots untouched                                                                                 |

**Out of scope, deliberately.** The USSD inbox, item, settings and muted list; the admin notification defaults, the
delivery log and member notifications. Their payloads are R3b's, and R3b parks on its wire-contract gate. A signed mock
for an API that is blocked is the drift the backlog already carries rows about, so those stay uncut and are recorded
there.

**The numbers, because a mock whose numbers do not describe its rows is the defect.** Audience 150, excluded 22
(blocked 4, muted 12, period 0, no contact 6), recipients 128. Channels email 97, WhatsApp 54, SMS 128 = 279 deliveries.
Two completed announce instances: 96 sent + 28 skipped + 4 failed = 128, and 128 + 0 + 0 = 128. Tiles 224 sent, 28
skipped, 4 failed sum over those two rows.

## Verification

| Gate      | Command               | Result |
| --------- | --------------------- | ------ |
| Format    | `npm run verify:fast` | pass   |
| Lint      | `npm run verify:fast` | pass   |
| Typecheck | `npm run verify:fast` | pass   |
| Test      | `npm run verify:fast` | pass   |

`npx vitest run tests/meta/mock-claims.test.ts` also passes (77 assertions), and every state passes
`scripts/mock/shell-check.mjs` before it is captured.

gate-run 2026-11-26T09:49:34.629Z profile=fast steps=4/4 lines=4 bytes=903

## Review

Seat: pending - a mock cut is not a behavioural change, and the catalogue's protected-doc review is recorded in
`documents/agents/protected-doc-reviews.json` rather than here.

## Git writes

| Brief   | Actor  | Verb   | Variant | Reason                                    |
| ------- | ------ | ------ | ------- | ----------------------------------------- |
| pending | parent | commit | direct  | unattended; the catalogue and this record |

## Mock sign-off

| State | Image                                                  | Basis                     |
| ----- | ------------------------------------------------------ | ------------------------- |
| 27    | `mockups/v2-events/27-event-detail-notifications.png`  | auto-signed · `0b5e5958…` |
| 28    | `mockups/v2-events/28-notification-plan-form.png`      | auto-signed · `247939aa…` |
| 29    | `mockups/v2-events/29-notification-preview.png`        | auto-signed · `3bbf8aac…` |
| 30    | `mockups/v2-events/30-notification-publish-dialog.png` | auto-signed · `4e10817a…` |
| 31    | `mockups/v2-events/31-notification-change-notice.png`  | auto-signed · `bb3d1560…` |

Mock coverage: claimed 6 · e2e-only 0 · deferred 0 · prose 0

`auto-signed` is AGENTS.md §17's unattended value: `by: "unattended"`, the basis and the hash are in
`documents/mock-claims/v2-events.json`, and the owner's review at the end of the unattended work confirms each or drops
it to `target`.

## Mock parity

No baseline pairs yet: these screens are not built, so `ui/e2e/baseline/` has nothing to compare against and the parity
probe refuses a selection with no paired state. That is the correct state before R4, not an omission - the baseline is
captured from the build in the round that writes it.

## Acceptance

| Criterion                                               | Met | Evidence                                                                    |
| ------------------------------------------------------- | --- | --------------------------------------------------------------------------- |
| Five officer-side notification states cut from the spec | yes | the five images above, built by `mockups/v2-events/build-notifications.mjs` |
| The complete shell in every state                       | yes | `shell-check` passes for each before capture                                |
| The numbers describe the rows                           | yes | audience 150 − 22 = 128; 96 + 28 + 4 = 128; 97 + 54 + 128 = 279             |
| The catalogue carries each hash                         | yes | `documents/mock-claims/v2-events.json`, coverage `auto-signed`              |
| No mock for a surface whose API is blocked              | yes | the USSD and admin states are uncut; recorded in the backlog                |

## Deviations

- **The set gains no surface entries.** A surface declares an AC slice, and these screens have no build to bind one to
  yet. Declaring a slice now would claim AC coverage the drawing cannot be compared against, so the surfaces land in R4
  with their baselines. The coverage line therefore still reads the set's existing six.
- **`main` could not be checked out locally.** Another worktree holds it, so the round branches from `origin/main`
  instead, and the merged branch is deleted by the merge policy's own cleanup.
