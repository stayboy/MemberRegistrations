# Round — member-overview-impl

|                        |                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                              |
| Tier                   | 2                                                                                                                                                                 |
| Mode                   | `unattended (auto-accept recommendations)`                                                                                                                        |
| Base                   | `160f43c`                                                                                                                                                         |
| Review rounds          | 0                                                                                                                                                                 |
| Gate runs in parent    | 0                                                                                                                                                                 |
| Spec                   | `documents/specs/member-registrations-ui.md` (FR-29, AC-12, FR-71)                                                                                                |
| Workers                | `single`                                                                                                                                                          |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (overview, sections, cards, form fields, tests); parent opencode/deepseek-v4.1-flash-free (capture, gates, record)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                           |

`git-seat-budget: 9` — 1 branch + 3 commits + 1 push + 1 pr + 1 merge + 1 sync + 1 retry.

## Seats

| Seat        | Picked (local)   | Window | Class          | Candidate probed                                   | Basis                          |
| ----------- | ---------------- | ------ | -------------- | -------------------------------------------------- | ------------------------------ |
| Worker      | 2026-11-17 19:3x | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` — answered | outside-window first candidate |
| Spec review | already accepted | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                | accepted decisions             |

## Grill

Decisions from the earlier feature grill, the to-spec round and the unattended grill-me round were all
accepted; the full record is in `member-overview-rebuild.md` and `member-create-completeness.md`.

1. **Layout.** Recommendation: four full-width cards on top, Identity and Membership grids left, fixed
   ministries and subscriptions right, fixed relationships left, Contacts button on the tab row.
   **Cost:** a layout pass and three baselines.
2. **Components.** Recommendation: Fluent `Accordion`/`Badge` and reuse of the ministry and relationship
   **Cost:** rename and style churn. Review finding: the four stat cards are static surfaces, not
   controls, so Fluent `Card` is not mandated by §16; they are shaped with makeStyles for the signed
   brand top edge and tinted wash. Recorded rather than rewritten.
3. **Data.** Recommendation: no new route; the API round added the additive fields. **Cost:** the UI
   client types must catch up with `position`, `shepherd`, `calls` and event identity.
4. **Cards.** Recommendation: a pure module with unit tests for UTC quarter/month, both tie-breaks, the
   call-copy prefix and `contactCount`. **Cost:** one new module.
5. **Form.** Recommendation: the four membership fields in Church on create and edit, blank to `null`.
   **Cost:** two DOM cases.
6. **Copy.** Recommendation: follow the signed drawing's empty strings and the verified badge's
   accessible name. **Cost:** one DOM assertion.
7. **Captures.** Recommendation: parent captures three new baselines; the worker never runs Playwright.
   **Cost:** three PNGs and README rows.
8. **Limits.** Recommendation: no mock re-cut, no new signature, no protected-doc edit, no bypass, no
   change beyond the drawing. **Cost:** stop rather than redraw.
9. **Close.** Recommendation: verbatim gate-run line, Tier 2 verdict, acceptance rows, product-terms
   commit body. **Cost:** record discipline.

## Plan

Goal: the member overview matches the five states the owner signed on 2026-11-17.

Acceptance criteria:

1. Four full-width cards with ink values on a brand-tinted wash; all four stats and their empty copies.
2. Identity and Membership grids, verified check badge, shepherd and membership history in the main
   member section; no `presbyterRank`.
3. Ministries and subscriptions fixed; relationships fixed in the left column; tabs reduced to Overview,
   Attendance, Subscriptions and Shepherding; `View Contacts (n)` on the tab row.
4. Create and edit carry the four membership fields, blank to `null`; edit still has no contact fields.
5. DOM, unit, e2e and mock-claims gates green; three new baselines captured and linked to the signed states.

## Verification

| Gate                 | Command                                                                                 | Result                     |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| Full gate            | `npm run verify`                                                                        | pass - 7/7                 |
| UI unit              | `npm --prefix ui run test`                                                              | pass - 42 files, 477 tests |
| UI DOM lane          | `npm --prefix ui run test:dom`                                                          | pass - 15 files, 106 tests |
| UI e2e               | `npx playwright test`                                                                   | pass - 74 tests            |
| Overview captures    | `npx playwright test --config playwright.capture.config.ts -g "member detail overview"` | pass - 3 baselines         |
| Mock catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                                         | pass - 77 tests            |

gate-run 2026-11-17T20:17:57.170Z profile=full steps=7/7 lines=7 bytes=1370

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason |
| ----- | --------------------- | ------ | ------------------------------ | ------ |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | -      |

## Mock sign-off

| Surface                  | Mock                                                    | Capture                                             | sha256          | Signer | Date       | Verdict |
| ------------------------ | ------------------------------------------------------- | --------------------------------------------------- | --------------- | ------ | ---------- | ------- |
| Overview (collapsed)     | `mockups/v2-shell/19-member-overview-collapsed.png`     | `ui/e2e/baseline/member-detail-overview.png`        | `10fb130ff8e3…` | owner  | 2026-11-17 | signed  |
| Overview (subscriptions) | `mockups/v2-shell/19-member-overview-subscriptions.png` | pending                                             | `b37dc1ac8c64…` | owner  | 2026-11-17 | signed  |
| Overview (relationships) | `mockups/v2-shell/19-member-overview-relationships.png` | pending                                             | `9703777555b0…` | owner  | 2026-11-17 | signed  |
| Overview (empty)         | `mockups/v2-shell/19-member-overview-empty.png`         | `ui/e2e/baseline/member-detail-overview-empty.png`  | `241f8a4bf2a2…` | owner  | 2026-11-17 | signed  |
| Overview (narrow)        | `mockups/v2-shell/19-member-overview-narrow.png`        | `ui/e2e/baseline/member-detail-overview-narrow.png` | `f0110ac43c49…` | owner  | 2026-11-17 | signed  |

## Mock parity

Mock coverage: claimed 7 · e2e-only 6 · deferred 1 · prose 2 (unchanged; the five overview states carry
no claims). The signed drawings are not re-cut; only baselines are added.

## Acceptance

Pending.

## Review

Seat: consistent - the `Implementer` row names the worker for the UI work and the parent for capture and
record; the Tier 2 review runs on a different candidate.

Standards: ACCEPT. Spec: REWORK -> declarations and record corrections applied; the underlying build
was unchanged apart from a CSS comment.

Review record: "Tier 2 (deepseek-v4-pro:0813, outside window): Standards ACCEPT, Spec REWORK on one
P1 - the subscriptions product-name/periodEnd divergence from the signed drawing was reported as
undeclared, but the declaration had landed before the verdict; it stays in Deviations. One P2 - the
four stat cards are styled surfaces rather than Fluent Cards, recorded with the limitation. Nits: the
360 px comment and the Seats row, both corrected. Badge, four tabs, contactCount, empty copies, pure
card module and the reuse of ministry/relationship bodies are correct. Seat consistent."

## Deviations

- **The stat cards are styled surfaces, not Fluent `Card`s.** The signed drawing fixes a 2 px brand
  top edge and a tinted wash; `Card` was tried against its appearance options and cannot own that edge
  without the same makeStyles layer. They carry no interaction, so §16's blocking rewrite clause for
  controls does not apply. Recorded for the reviewer rather than left unsaid.
- The 360 px tab fix is a horizontal scroll area; the old comment described wrapping and was corrected.
- **Review chronology:** the reviewer read a pre-edit copy of `## Deviations` and reported the subscriptions product-name/`periodEnd` gap as undeclared. The declaration was in the file before the verdict arrived; this pass keeps it and records the timing.

- The `subscriptions` state's drawing shows the lapsed branch so it stays distinct from `collapsed`,
  which is now byte-identical to it in the resting state.
- **One visible difference from the signed drawing is declared, not redrawn.** The subscriptions panel
  in the drawing shows `next ends <date>` and product names, but the member-detail DTO carries neither
  `periodEnd` nor `productName` - only `reference` and the legacy `kind`. The build renders
  `Active · no end date` from today's payload; `periodEnd` is typed as an optional forward-compatible
  field and the `next ends` line activates when it arrives. No mock was re-cut, under the unattended go.
