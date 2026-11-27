# Round - event-notifications-landing

|                        |                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Status                 | CLOSED - spec amended, set re-cut, 24 states awaiting the owner's signature              |
| Tier                   | 1 - Plan                                                                                 |
| Mode                   | `attended`                                                                               |
| Base                   | `a12cccc`                                                                                |
| Review rounds          | 1                                                                                        |
| Gate runs in parent    | 2                                                                                        |
| Spec                   | `documents/specs/member-registrations-event-notifications.md`                            |
| Workers                | `single`                                                                                 |
| Implementer            | parent cline-pass/cline-pass/deepseek-v4.1-flash-1017 (spec amendment, mocks, round doc) |
| Verbs this round needs | `commit`; `push` and `pr`; `merge`                                                       |

## Git budget

git-seat-budget: 3

One commit for the spec, the catalogue and this record, one push, one PR. The branch is
`feat/notifications-landing` off `origin/main`.

## Grill

The owner withdrew the panel on the event detail on 2026-11-27. Eight questions, answered in one round:
Q1 "keep notifications under the Events menu", Q2-Q8 "all other as recommended".

1. **One page or two?** The spec already had `Admin › Notifications`. Recommendation: one page, because two homes
   for the same counts is how they start disagreeing. Cost: the admin page absorbs the overview rather than sitting beside it.
2. **Where does plan authoring go?** Recommendation: `#/events/:id/notifications`, reached from a summary card. Cost:
   two screens where there was one, and the card has to stay short or the problem returns.
3. **What counts as success?** Recommendation: four buckets per channel - sent, skipped, failed, queued - because a
   skipped delivery is a member's choice, not an outage. Cost: one more number per channel than asked for.
4. **What window?** Recommendation: Today / 7 days / 30 days / custom, default seven, dates in UTC. Cost: a control
   on the page.
5. **The grid's filters.** Recommendation: channel tabs with their counts, status, range, and a search over event name
   and member number. Cost: the search is a join over messages and events.
6. **The on-demand failure report.** Recommendation: compose with the same code the daily job uses, refuse when no
   recipient is set, audit the actor. Cost: the digest moves from R3b into this work.
7. **The gate.** A landing page adds read routes and a write. Cost: it parks without the owner naming the wire contract;
   they did.
8. **The shell.** Adding `Notifications` to the Events submenu changes every events drawing. Recommendation: re-cut the
   whole set now rather than leave it inconsistent. Cost: 22 states are re-cut, and **18 approvals stop standing** -
   13 owner signatures and 4 `auto-signed` states void to `target`, and one retired state's approval leaves with it.

## Plan

**Goal.** Replace the event-detail panel with a standalone Notifications page under Events, and re-cut the set so the
drawings agree with the new shell.

**Spec amendments.** `N-12` is rewritten: the page carries the per-channel counts, the filtered grid, the failure
block with its on-demand report, the defaults and the message search; the event detail keeps a summary card and no
authoring controls; authoring moves to `#/events/:id/notifications`. `FR-32`, `FR-33` and `FR-34` are restated against
the page, `FR-49` is added, and `AC-49`..`AC-52` record the page, the grid, the on-demand report and the card.

**The drawings.**

| State                               | What changed                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `27-notifications-landing`          | new, replacing `27-event-detail-notifications`; redrawn 2026-11-27 as overall tiles across the top, a per-channel accordion in the right rail, and the filtered grid beside it |
| `28`..`31`                          | re-cut: the plan pages keep their content and gain the submenu item                                                                                                            |
| `32-event-detail-notification-card` | new: the summary card the detail keeps                                                                                                                                         |
| the other 22 events states          | re-cut for the shell only: the Events submenu gains Notifications                                                                                                              |

**Out of scope.** Any code. This round is the spec and the drawings; the page itself is the next round and starts only
after the drawings are signed.

## Verification

| Gate      | Command               | Result |
| --------- | --------------------- | ------ |
| Format    | `npm run verify:fast` | pass   |
| Lint      | `npm run verify:fast` | pass   |
| Typecheck | `npm run verify:fast` | pass   |
| Test      | `npm run verify:fast` | pass   |

Each state passes `scripts/mock/shell-check.mjs` before capture, and every captured hash in
`documents/mock-claims/v2-events.json` equals the bytes on disk (checked with `crypto.createHash` over all 27).

gate-run 2026-11-27T10:28:41.764Z profile=fast steps=4/4 lines=4 bytes=703

## Review

Seat: pending - a mock and spec round carries its review in the protected-doc record, not here.

## Git writes

| Brief   | Actor  | Verb   | Variant | Reason                                    |
| ------- | ------ | ------ | ------- | ----------------------------------------- |
| pending | parent | commit | direct  | attended; spec, catalogue and this record |

## Mock sign-off

`mockups/v2-events/` holds every state. **24 are `target`** because their bytes changed and a refresh voids a signature
(AGENTS.md §17); 3 remain `signed` because nothing moved in them. Of the voided ones, one was
retired (`27-event-detail-notifications`), four were `auto-signed` from the previous round, and the rest carried the
owner's signature. Every voided state keeps its old Playwright pairing in `previousBaseline`.

| State | Image                                                     | Coverage |
| ----- | --------------------------------------------------------- | -------- |
| 01    | `mockups/v2-events/01-events-list.png`                    | target   |
| 10    | `mockups/v2-events/10-event-create.png`                   | target   |
| 02    | `mockups/v2-events/02-event-detail.png`                   | target   |
| 05    | `mockups/v2-events/05-offerings-landing.png`              | signed   |
| 07    | `mockups/v2-events/07-offering-terms.png`                 | signed   |
| 06    | `mockups/v2-events/06-record-headcount-dialog.png`        | target   |
| 07    | `mockups/v2-events/07-import-attendance-panel.png`        | signed   |
| 12    | `mockups/v2-events/12-audience-dialog.png`                | target   |
| 13    | `mockups/v2-events/13-event-detail-draft.png`             | target   |
| 14    | `mockups/v2-events/14-event-detail-archived.png`          | target   |
| 10    | `mockups/v2-events/10-event-create-daily.png`             | target   |
| 10    | `mockups/v2-events/10-event-create-monthly.png`           | target   |
| 10    | `mockups/v2-events/10-event-create-period.png`            | target   |
| 10    | `mockups/v2-events/10-event-create-no-match.png`          | target   |
| 16    | `mockups/v2-events/16-event-edit.png`                     | target   |
| 17    | `mockups/v2-events/17-event-edit-locked.png`              | target   |
| 18    | `mockups/v2-events/18-event-create-standalone.png`        | target   |
| 19    | `mockups/v2-events/19-event-edit-standalone.png`          | target   |
| 20    | `mockups/v2-events/20-event-preview-dialog.png`           | target   |
| 21    | `mockups/v2-events/21-event-create-period-recurring.png`  | target   |
| 22    | `mockups/v2-events/22-event-detail-period.png`            | target   |
| 28    | `mockups/v2-events/28-notification-plan-form.png`         | target   |
| 29    | `mockups/v2-events/29-notification-preview.png`           | target   |
| 30    | `mockups/v2-events/30-notification-publish-dialog.png`    | target   |
| 31    | `mockups/v2-events/31-notification-change-notice.png`     | target   |
| 27    | `mockups/v2-events/27-notifications-landing.png`          | target   |
| 32    | `mockups/v2-events/32-event-detail-notification-card.png` | target   |

Mock coverage: claimed 6 · e2e-only 0 · deferred 0 · prose 0

## Mock parity

No baselines pair while the states are `target`. The five that had one record it in `previousBaseline`; the rest are
drawings with no built screen yet.

## Acceptance

| Criterion                                                   | Met | Evidence                                                                                 |
| ----------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------- |
| Notifications is a standalone page under Events             | yes | N-12, FR-49, `27-notifications-landing`                                                  |
| The event detail keeps a summary card only                  | yes | FR-49, `32-event-detail-notification-card`                                               |
| Overall sent, delivered, queued and failures across the top | yes | 1,920 = 1,904 delivered + 16 failed; 39 queued; skipped 175 is neither                   |
| The grid filters by channel and searches                    | yes | the channel tabs carry their counts, and the search is over event name and member number |
| The failure report can be sent on demand                    | yes | FR-33 and AC-51                                                                          |
| The whole set agrees with the new shell                     | yes | every state re-cut; the hash check over all 27 passes                                    |

## Deviations

- **18 approvals stopped standing when the shell changed**, as the grill's Q8 cost said: 13 owner signatures and four
  `auto-signed` states became `target`, and one retired state's approval left with it. They stay `target` until the
  owner signs again, and the round is honest that this is the price of a consistent set rather than a defect.
- **`27-event-detail-notifications` is retired.** It drew exactly the panel the owner rejected, so it is deleted rather
  than left as a second image for one state.
- **The digest moves out of R3b.** R3b keeps the inbox read and the preference writes; the failure report and the admin
  surfaces are now this work.
- **The page was redrawn once.** The first drawing invented a stat row and a failure banner; the owner rejected it as
  drifting from the set's patterns and asked for the overall counts across the top and an accordion rail. The second
  drawing composes `.kpis`, `.panels.wide-left`, `.grid-table`, `.badge`, `.chip` and a rail of `.panel`s, and the spec's
  FR-49 and AC-49 were amended in the same change because `sent` and `delivered` are now distinct numbers.
