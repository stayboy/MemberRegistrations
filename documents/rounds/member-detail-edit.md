# Round - member detail edit, subscriptions and coverage

|        |                                                   |
| ------ | ------------------------------------------------- |
| Status | CLOSED                                            |
| Tier   | 2 - Reviewed                                      |
| Base   | `42501b0`                                         |
| Spec   | `documents/specs/member-registrations-ui.md` §5.3 |
| Ticket | 14 (passes 1 and 2)                               |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 14 in two passes on one branch, agreed in the Q113–Q118 round:

- **Pass 1 — identity.** Member detail route, add/edit form with ETag/`If-Match` and the 409
  duplicate-member-number path, archive/restore, and the typed-purge confirmation.
- **Pass 2 — subscriptions, coverage and contacts.** Subscription add/end, household coverage
  add/remove, and contact add/remove behind the explicit contacts action.
- **Component-first (Q115).** `ContactsDialog` extracted at its second call site into
  `ui/src/components/`; `ConfirmDialog` extracted for the destructive confirmations (archive, end
  subscription, remove coverage, remove contact); purge's typed confirmation stays page-local because
  it needs an input.
- **Not in this pass.** Contact link/unlink and in-place edit; relationships and ministries (ticket 16);
  the pixel-level live-vs-mock comparison and the Playwright/axe gate (ticket 19).

Acceptance criteria (the ticket's own bullets):

1. Add and edit member validate and persist; a duplicate member number returns 409 shown on the field.
2. Add subscription and add coverage work; overlapping coverage is rejected with the documented reason.
3. Contacts are edited only from the explicit contacts dialog, never inline in the grid.
4. A successful save refreshes the members list without a full reload.
5. The dialogs match their mock screenshots at the recorded viewport.

## Verification

| Gate                | Command                                                  | Result                                        |
| ------------------- | -------------------------------------------------------- | --------------------------------------------- |
| UI tests            | `npm --prefix ui run test`                               | pass - 8 files, 87 tests                      |
| Typecheck           | `npm --prefix ui run typecheck`                          | pass                                          |
| Lint                | `npm --prefix ui run lint`                               | pass                                          |
| Build               | `npm --prefix ui run build`                              | pass - 942 kB bundle (chunk warning only)     |
| Format              | `npm --prefix ui run format:check`                       | pass                                          |
| Tests (serialized)  | `npx vitest run --no-file-parallelism`                   | pass - 17 files, 195 passed / 3 skipped (198) |
| Protected-doc guard | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass - 7 tests                                |

The default parallel `vitest run` flakes on this machine (PGlite hook timeouts / the known
`0xC0000409` worker crash); the serialized root run is the evidence and CI runs the parallel config.

## Mock parity

Pixel-level comparison is deferred to ticket 19 by the accepted deferral; the local mocks under
`mockups/v2-shell/` were the reference for structure, states and labels only.

## Review

Independent Tier-2 review on `deepseek-v4-pro:0813` (first attempt transport-timed out with no
response headers; retried once, same brief, shorter output contract). Verdict **ACCEPT**, no P1, three
P2 and six nits. All three P2 and five nits were applied before this doc closed:

- **FR-78 breach.** The shared `ContactsDialog` rendered add/remove at both call sites, but the list
  dialog must be read-only. Now `editable` defaults to `false`; only the detail passes `editable`, and
  the read-only branch mounts no mutations (`ContactsDialog.tsx:313`, `:395`, `:452`, `:476`).
- **FR-26 dead end.** "Keep my changes" kept stale values with the stale ETag. Now it captures the
  values, refetches, and re-applies them with the fresh ETag via `mergeKeptValues`
  (`MemberFormPage.tsx:246`); the form keys on `memberNo` so the remount cannot wipe them.
- **Double submit.** Enter-key paths bypassed the disabled buttons; every submit early-returns while
  its mutation is pending.
- **FR-73/AC-44 gap (raised as a nit, fixed).** Household subscriptions now carry `coveredMemberNos`;
  individual payloads omit the key (`MemberDetailPage.tsx:412-426`).
- Also: one cache key for the member detail, purge cannot dismiss mid-flight, a redundant
  `aria-label` removed, and `updateMember` fails closed with a `428` when the ETag is missing instead
  of sending an unconditional update.

## Acceptance

| #   | Criterion                                                                         | Met      | Evidence                                                                                                                  |
| --- | --------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Add/edit validate and persist; duplicate member number shows 409 on the field     | yes      | `MemberFormPage.tsx:185`; `members.test.ts`                                                                               |
| 2   | Add subscription and coverage work; overlapping coverage rejected with the reason | yes      | `MemberDetailPage.tsx:500` (`inlineActionError`, 409 "Member is already covered"); household `coveredMemberNos` at `:412` |
| 3   | Contacts edited only from the explicit dialog, never inline in the grid           | yes      | `ContactAddForm`/`ContactRemoveDialog` render only under `editable` (`ContactsDialog.tsx:452`, `:476`)                    |
| 4   | A successful save refreshes the list without a reload                             | yes      | invalidation at `MemberFormPage.tsx:177`, `:206-207`                                                                      |
| 5   | Dialogs match the mock screenshots at the recorded viewport                       | deferred | Pixel comparison is ticket 19 by the accepted deferral; structure, states and labels follow `mockups/v2-shell/`           |

Verdict: **ACCEPTED**.

## Deviations

- Contact link/unlink and in-place editing are out of this pass (add/remove only); recorded as deferred
  work rather than silently dropped.
- The coverage and covered-members pickers take a member-number input, not a member search. A search
  picker is deferred with the same note.
- Pixel-level mock parity and the Playwright/axe gate stay in ticket 19.
- `MemberDetailPage.tsx` is 1,263 lines. Splitting the subscription section into a page-local sibling
  is a candidate for ticket 16, when ministries and relationships land there; the component-first
  policy's second-call-site trigger does not fire today.
