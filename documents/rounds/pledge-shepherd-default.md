# Round — pledge-shepherd-default

| Status              | CLOSED                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| Tier                | 2                                                                             |
| Mode                | unattended (auto-accept recommendations — owner, 2026-11-13: "go on to next") |
| Base                | `ce0d0b0`                                                                     |
| Review rounds       | 3                                                                             |
| Gate runs in parent | 3                                                                             |
| Spec                | `documents/specs/member-registrations-events-offerings.md` (FR-26a)           |
| Workers             | single                                                                        |
| Implementer         | worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (implementation)        |

**Seat rule for the worker (owner, 2026-11-13, corrected the same day).** "For implementation, except
user overrides use `deepseek-v4.1-flash-1017` on cline-pass during window, and revert to the same model
from ollama-cloud outside the window." So the worker is now **clock-ranked**, like the grill-me and
reviewer seats: 12:00–18:00 local → `cline-pass/cline-pass/deepseek-v4.1-flash-1017`; outside →
`ollama-cloud/deepseek-v4.1-flash:1017`. An explicit owner override still wins over both. This began as
an owner-directed seat for this round and was then generalised, so
`documents/agents/orchestrator-policy.md` and `AGENTS.md` §17 are amended in this round and reviewed by
the same window seat (`mimo-v2.6-pro`) before the change lands. `fallbackReason`: none applies here —
this is the first-ranked choice for the window, not a degradation.

**Seat window.** Work began 12:56 local (UTC+0, Greenwich Standard Time), inside 12:00–18:00, so
`AGENTS.md` §17 moves the grill-me, reviewer and (from today) worker seats onto the window ranking; a
fallback records its basis in `fallbackReason`. Outside the window the reviewer and grill-me seats revert
to `deepseek-v4-pro:0813` and `ollama-cloud/deepseek-v4.1-flash:1017` respectively.

**Parent does not implement (owner, 2026-11-13).** The plan's first message, "Parent doesn't implement",
is the standing split for this round: the worker writes the code, the parent integrates, verifies and
commits. It also means an empty dispatch is a blocked round, not a licence for the parent to author.

## Plan

**Goal.** A pledge recorded for a member whose shepherd is known needs no officer typing, and a pledge
for a member with **no** active shepherd says so before submit and demands an officer. FR-26a owns the
behaviour; the API already enforces `422 officer_required` as the backstop.

**Scope.** `ui/src/pages/ussd/OfferingGivingForms.tsx` (the pledge dialog), a small follow-up helper and
its unit test, DOM-lane tests for the four states, one e2e assertion, the mock set, and the catalogue.
No wire change: the UI reads `GET /v1/members/{memberNo}/shepherding` and the shepherd's member summary
(`GET /v1/members/{shepherdMemberNo}`) and evaluates the pledge's predicate client-side — the owner's
choice of option (b) on 2026-11-13, whose cost is that the predicate now exists twice.

**Expected files.** `ui/src/format/follow-up.ts` (+ test), `ui/src/pages/ussd/OfferingGivingForms.tsx`,
`ui/src/pages/ussd/OfferingGivingForms.dom.test.tsx` (new), `ui/src/pages/ussd/OfferingGivingForms.test.tsx`,
`ui/e2e/offerings-count.spec.ts`, `documents/mock-claims/mvp-offerings.json`, this round doc.

**Acceptance criteria.**

1. Picking a member with an active shepherd shows the shepherd (name, member number, identity label) and
   leaves the officer **optional**; an empty officer submits no `officerMemberNo`.
2. A member whose shepherding summary names a shepherd that fails the pledge's predicate (`isPresbyter`,
   not archived, **not purged**) is shown as **no active shepherd** — never as a default the API would
   refuse.
3. With no active shepherd the officer is **required**: submit blocks with a message and does not post.
4. While the read is pending the officer field is disabled and submit is blocked; a failed read requires
   an officer rather than dropping the requirement.
5. The requirement is evaluated against the summary current at submit, not the state when the member was
   picked.
6. The mock in `mockups/mvp-offerings/` shows all four states and the catalogue records them.
7. `npm run verify` is green and the node lane keeps its test count (new form tests live in the DOM lane).

## Grill round (auto-accepted)

| #   | Question                                                                                        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where the "active shepherd" evidence comes from, given the owner chose option (b)               | Read the shepherding summary, then the shepherd's member summary; evaluate all three of the pledge's conditions — `isPresbyter`, not archived, not purged — in one helper. Cost: two round trips and the predicate in two places; a backlog row converges it on a server flag.                                                                                                                                                                                                                                                                                                                                       |
| 2   | Where the predicate lives in the UI                                                             | `ui/src/format/follow-up.ts` exporting `isFollowUpEligible(member)` plus a unit test, so a future surface shares one client definition. Cost: a new module.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | Enabled-then-validated vs disabled submit when the officer is required                          | Keep the button enabled and validate at submit, with the reason announced; a disabled button with no explanation is the failure mode. Cost: one more validation branch.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4   | The officer picker is a plain member search, so it offers non-presbyters                        | Leave the picker as it is and let the API's `422 officer_required` answer, with the field caption naming the rule; a client-side filter would need a search filter the API does not expose. Cost: a non-presbyter is still discovered at submit.                                                                                                                                                                                                                                                                                                                                                                     |
| 5   | Staleness of the follow-up read                                                                 | Key the query on the member number, `staleTime: 0` and `retry: false`, so a pick always asks and a failure surfaces instead of retrying behind the operator. Cost: one request per pick.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 6   | Which lane proves which state                                                                   | DOM lane for all four states (real components); e2e drives the shepherd-present pledge only, because the browser fixture has no shepherd-less member. Cost: the absence is never driven in a real browser.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | What the owner's signature binds: the reviewed target, or the pixels the build actually renders | **Sign as the reviewed target** (owner, 2026-11-13); the badge and placeholder placements stay recorded in `## Deviations` with their reason. Cost: the signed PNG and the built dialog differ in two placements, and only the deviation entry says so.                                                                                                                                                                                                                                                                                                                                                              |
| 8   | "Current at submit": the latest completed read, or a forced read inside submit                  | **Latest completed read**; a submit never waits on a fresh request, and the API's `422 officer_required` is the named backstop if the summary moved in between (owner, 2026-11-13). Cost: a shepherd that changed between read and click yields a 422 the operator clears by name.                                                                                                                                                                                                                                                                                                                                   |
| 9   | Whether the follow-up state text is a hint, a placeholder, or unassociated                      | **A hint**: `MemberPicker` gains an optional `hint` prop, and the state text renders through Fluent `Field`'s hint slot so it is programmatically associated with the officer field (owner, 2026-11-13). Cost: a small edit to a nine-call-site component, and the hint still renders below the field rather than inside it.                                                                                                                                                                                                                                                                                         |
| 10  | Is the follow-up officer's "reason" a justification the form must demand?                       | **No: it is an optional instruction note** for whoever follows up — "Add an instruction note, that's needed for instructing how followup is done. Make this field optional for whether followup officer is the shepherd or any other presbyter" (owner, 2026-11-13). It is accepted with or without an explicit officer, stored in the pledge's `reason`, and never blocks a submit; reassignment keeps its own mandatory reason, which is audit. Cost: the create contract's validation changes (a rule, not a wire field), so the API spec and its tests move with it, and a pledge can now carry a null `reason`. |

## Verification

gate-run 2026-11-13T15:36:45.138Z profile=full steps=7/7 lines=7 bytes=854

| Gate                            | Result                                                  |
| ------------------------------- | ------------------------------------------------------- |
| `npm run verify`                | **7/7** (signature above)                               |
| root suite (`.gates/test.log`)  | **743 passed / 6 skipped / 52 files**                   |
| `npm --prefix ui run test`      | **442 passed / 41 files** (was 426 / 40 at round start) |
| `npm --prefix ui run test:dom`  | **24 passed / 2 files** (was 2 / 1)                     |
| `npm --prefix ui run typecheck` | clean                                                   |
| `npm --prefix ui run lint`      | clean                                                   |
| `npm run ui:e2e`                | **68 passed** (41.5 s), incl. the pledge block          |
| `npx prettier --check .`        | clean (`verify` format step)                            |

Two gate failures the worker's own run did not see, because they were mine to fix:

- `format` failed on `documents/mock-claims/mvp-offerings.json` — my catalogue rewrite, not the
  worker's change; reformatted.
- `mock-claims` failed: `coverage` accepts `signed`, `reference` or `target` only, and I had written
  `prose` for the loading and error states. They carry captured images that are neither signed nor
  unbuilt, so they are `reference`.

The two discriminating runs are recorded where they belong, in the review below: the worker removed
the cache key and the `role="status"` and watched the tests fail before restoring them.

## Review

Tier 2, two rounds. Reviewer: window seat `mimo-v2.6-pro` on `ollama-cloud` between 12:00 and 18:00
local (`cline-pass` refused its id with model-not-found on a registry-active listing — recorded
fallback). Implementer: `cline-pass/cline-pass/deepseek-v4.1-flash-1017`. The parent integrated, ran
every gate and wrote no implementation code.

**Round 1 — REWORK.** One blocking P1 and five P2s, plus eight gap findings.

| Finding                                                                                                                                                                                                                          | Outcome                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** the shepherd read shared `['member', baseUrl, memberNo]` with `fetchMemberDetail` (`{ member, etag }`), so an ordinary session could show a false "No active shepherd" and the reverse order could crash `MemberFormPage` | fixed: the read moved to `['member', baseUrl, shepherd, 'follow-up']`, the shepherding read was aligned to the member page's key, and a regression test seeds the poison entry itself |
| P2 `purgedAt` optional let a caller without it pass a purged member                                                                                                                                                              | fixed: required `string \| null`, one unit case per condition                                                                                                                         |
| P2 badge, in-field placeholders and line presentation diverge from the signed mocks unrecorded                                                                                                                                   | recorded under `## Deviations`                                                                                                                                                        |
| P2 the signed mock showed `(M, 41y)` where FR-22a requires the capitalised form outside pickers                                                                                                                                  | mock re-cut to `(Male, 41y)`, awaiting re-signature                                                                                                                                   |
| P2 an officer picked for one member followed the next                                                                                                                                                                            | fixed: both officer states reset on any change of the picked member, pinned by a test                                                                                                 |
| P2 a stale `Gate runs in parent` counter                                                                                                                                                                                         | fixed                                                                                                                                                                                 |
| Gaps 1, 3, 5, 6, 7 (key ownership, unrecorded divergences, officer carry-over, the promised backlog row, weak tests)                                                                                                             | applied or carried, as above                                                                                                                                                          |
| Gaps 2 ("current at submit" wording), 4 (identity form) and 8 (hint position)                                                                                                                                                    | parked for the owner — a gap finding never auto-applies                                                                                                                               |

The fixes were proved by reverting: the worker watched the cache-key test and the officer-carry-over
test fail against the pre-fix code before restoring it.

**Round 2 — ACCEPTED.** `P1: CLOSED` (the four-element key is unreachable from the three-element
entries, and the hook writes nothing under the bare key), `P2 #2: CLOSED`, `P2 #5: CLOSED`,
`Weak tests: CLOSED`, spec rows 1 and 5 met. Three wording-only P2s remained — the round doc's
predicate line (parent, fixed) and two code comments (worker, comment-only pass). Nothing the fix
pass introduced was refused: the `renderWithProviders` `client` option, the shepherding-key
alignment and the over-clearing officer reset were each accepted with reasons.

Seat: consistent — the flash worker implemented both passes, the window pro seat reviewed without
authoring, and the parent never wrote the implementation.

**Scope growth, and its review.** The round's _spec_ review found a P1 in the shipped code: the API
refuses a supplied officer without `officerReason` (`src/repos/pledges.ts:720-724`), and the UI never
sent one — so every pledge with a picked officer, including the path merged in #126, was rejected. The
owner's Q3 answer also required the follow-up state text to reach assistive technology. Both were
built and are under their own focused review; the spec itself went through three review rounds
(REWORK on the remedy sentence and the compound read, REWORK on an absolute I left standing beside its
own qualification, then ACCEPTED).

## Mock sign-off

| Surface        | Mock                                                                 | sha256                                                             | Signer | Date       | Verdict |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| ussd-offerings | `mockups/mvp-offerings/02-offerings-count-pledge.png`                | `78618315981316f38ec2e2e5ce20455709dfd5efa24499f1491e963d27c80eeb` | owner  | 2026-11-13 | signed  |
| ussd-offerings | `mockups/mvp-offerings/02-offerings-count-pledge-no-shepherd.png`    | `537fdb1a45c37620232972254567c7b8140c810960a1c2919ee3246bea465994` | owner  | 2026-11-13 | signed  |
| ussd-offerings | `mockups/mvp-offerings/02-offerings-count-pledge-officer-reason.png` | `9868e5e978ae9c38b07a2302496c037b620ff7acfd8bfd3b90d6556b05405b0f` | owner  | 2026-11-13 | signed  |

Mock coverage: claimed 0 · e2e-only 11 · deferred 1 · prose 1

## Mock parity

n/a — no decision-probe screen ran for this round; the presentation divergences from the signed mocks
are recorded under `## Deviations` with their dispositions.

## Acceptance

| #   | Criterion                                                                                    | Verdict | Evidence                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Active shepherd shown with the identity label, officer optional, empty officer posts nothing | **met** | DOM `names the active shepherd and submits without an officer`; e2e pledge block; after the P1 key fix                                                                                                                                              |
| 2   | A shepherd failing the predicate is shown as no active shepherd                              | **met** | DOM `treats a shepherd who is not a presbyter…` and `treats an archived shepherd…`; `follow-up.test.ts` purged case                                                                                                                                 |
| 3   | No active shepherd → officer required, submit blocked with a message, nothing posted         | **met** | DOM `shows that there is no active shepherd, blocks the submit and accepts a picked officer`                                                                                                                                                        |
| 4   | Pending read → field disabled and submit blocked; failed read → officer required             | **met** | DOM `disables the officer field while the shepherd is being read`, `requires the officer when the shepherd could not be read`                                                                                                                       |
| 5   | Evaluated against the summary current at submit                                              | **met** | DOM `blocks the submit when the shepherd is gone by the time the pledge is submitted`; the stricter reading is parked as Gap 2                                                                                                                      |
| 6   | All four mock states exist and the catalogue records them                                    | **met** | two signed + two reference states in `documents/mock-claims/mvp-offerings.json`                                                                                                                                                                     |
| 7   | `verify` green, node lane keeps its count, form tests in the DOM lane                        | **met** | gate-run signature above; 442 / 41 files, 24 DOM, e2e 68                                                                                                                                                                                            |
| 8   | A supplied officer no longer needs a justification, and the note is optional either way      | **met** | API `accepts a supplied active presbyter with no note`, `accepts an officerReason without a supplied officer…`; DOM `shows the optional note with no officer picked…`, `submits a note without an officer`, `submits a picked officer with no note` |
| 9   | Both officer rejections land on the officer field, not the generic bar                       | **met** | `follow-up.test.ts` claims `officer_required`, `Member … is not an active presbyter`, a note-length detail; leaves a mixed detail in the bar                                                                                                        |
| 10  | The follow-up state text reaches assistive technology                                        | **met** | DOM accessible-description cases for loading, failed and no-shepherd; the live region is mounted for the form's life and changes content                                                                                                            |

Verdict: **ACCEPTED** — the mock is signed, Gaps 2 and 8 are ruled and built, and the scope growth the
spec review forced is closed with its own review pass. Nothing is outstanding before the commit.

## Deviations

- **Badge placement.** Both signed mocks put `Optional`/`Required` beside the _Follow-up officer_
  label; the form renders the badge and line below the field, because `MemberPicker` owns its own
  Fluent `Field` and takes a string label. Accepted: no §15/§16 breach, the shared picker is untouched,
  and FR-26a fixes no position. The parity path — an optional label adornment on `MemberPicker` — is on
  the backlog rather than built speculatively from one call site.
- **State placeholders.** The mocks show "Leave empty for the member's shepherd" / "Choose a
  follow-up officer" inside the control; `MemberPicker` hardcodes its placeholder. The state text
  renders as the field's **hint line**, which the owner's Gap 8 answer allows (FR-26a: the hint
  _may_ be the hint line) and which makes it programmatically associated, so the association half is
  closed and only the position remains a deviation.
- **Scope growth: the officer note.** The round grew a control the signed mocks never showed. The
  spec review found that `resolveOfficer` refused a supplied officer without `officerReason`, so every
  pledge naming an officer — including the path merged in #126 — was rejected by the API. The owner
  then ruled the field an **optional instruction note**, not a required justification, which dropped
  the create contract's condition and left the note as an always-visible optional `Input`. The state
  is mocked as `pledge-officer-reason` and signed. Recorded rather than hidden: the round was planned
  as a default-value change and shipped a wire-rule change and two accessibility fixes.
- **The note stays when the officer changes.** Only a member change clears it, because the note
  instructs whoever follows up — including the member's shepherd — and is no longer tied to the picked
  officer. Deliberate; the alternative duplicated state the form already owns.
- **The identity label.** The mock was re-cut to `Kwesi Boateng (Male, 41y)` because FR-22a makes the
  compact `(M, 41y)` form **picker-only**; the code and both test lanes already render the capitalised
  form. The no-shepherd mock is unaffected.
- **Officer reset over-clears.** Any change of the picked value clears the officer and its validation,
  including `MemberPicker`'s own clear-to-null while typing. Deliberate: carrying a stale officer is
  the direction that harms, and the over-clear costs one re-pick.
- **`purgedAt` on the helper's contract.** The predicate is three conditions, not two, so the helper
  carries all three; the real call site (`MemberDetail`) supplies it.
