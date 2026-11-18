# Round — member-overview-refinements

|                        |                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                                                                                                                 |
| Tier                   | 2                                                                                                                                                                      |
| Mode                   | `attended`                                                                                                                                                             |
| Base                   | `3a248e8`                                                                                                                                                              |
| Review rounds          | 2                                                                                                                                                                      |
| Gate runs in parent    | 8                                                                                                                                                                      |
| Spec                   | `documents/specs/member-registrations-ui.md` (FR-29, FR-10, FR-29a, AC-12, AC-41)                                                                                      |
| Workers                | `single`                                                                                                                                                               |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (header, sections, card module, labels, tests); parent opencode/deepseek-v4.1-flash-free (spec, mock, captures, record)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync, publish`                                                                                                                       |

`git-seat-budget: 8` — 1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync + 1 retry.

## Seats

| Seat        | Picked (local)                                   | Window | Class          | Candidate probed                         | Basis                                                                                        |
| ----------- | ------------------------------------------------ | ------ | -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Spec review | `ollama-cloud/deepseek-v4-pro:0813`              | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`      | outside-window first candidate                                                               |
| Mock        | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | n/a    | `mock-builder` | `cline-pass/…flash-1017` (owner default) | any-window class                                                                             |
| Grill       | `ollama-cloud/deepseek-v4.1-flash:1017`          | out    | `grill-flash`  | `ollama-cloud/deepseek-v4.1-flash:1017`  | outside-window first candidate; the owner asked it to settle the Shepherd-calls count string |
| Worker      | `ollama-cloud/deepseek-v4.1-flash:1017`          | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`  | outside-window first candidate                                                               |
| Reviewer    | `ollama-cloud/deepseek-v4-pro:0813`              | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`      | outside-window first candidate                                                               |

## Grill

Owner rulings, 2026-11-18. Each item records the recommendation put to the owner and its cost.

1. **Rename scope.** Recommendation: member-record copy only. **Cost:** the list keeps an inconsistent
   label. **Ruling:** presentation only, UI and labels, everywhere - so the Members column header changes
   too; the wire and internal identifiers do not. Settled in spec review: the V3 USSD claims error title
   keeps its copy, because a claim names its subject, not this surface.
2. **Label casing.** Recommendation: your exact string. **Cost:** breaks the shell's sentence case.
   **Ruling:** `Welfare & Services`, as typed.
3. **Moved badges.** Recommendation: one `PageFrame` accessory slot after the `h1`. **Cost:** a shared
   component gains a prop. **Ruling:** accepted, and the avatar leads the heading.
4. **Avatar.** Recommendation: drop it. **Cost:** the record loses its only visual identity cue.
   **Ruling:** keep the avatar; also replace the header's `API connected` pill with the Presbyter tag.
5. **Identity contents.** Recommendation: joined, date of birth, residence, address. **Cost:** a sparse
   four-cell grid. **Ruling:** accepted.
6. **Attended card.** Recommendation: three labelled cells. **Cost:** card-specific markup.
   **Ruling:** accepted, label underneath the number, reviewed in the mock.
7. **Periods.** Recommendation: UTC calendar year, quarter, month with exact periods in the accessible
   name and tooltip. **Cost:** one more count and its tests. **Ruling:** accepted.
8. **Drawings.** Recommendation: re-cut all five states and sign once. **Cost:** a mock pass.
   **Ruling:** accepted; the mock is part of this round, not a separate review.
9. **Ceremony.** Recommendation: Tier 2 with a separate spec review. **Cost:** the usual round.
   **Ruling:** accepted, without a separate mock-review sitting.
10. **The pill.** Recommendation: hide it on the member record only. **Cost:** one exception line.
    **Ruling:** remove it everywhere - "users don't have to see API connected".
11. **Baselines.** Recommendation: re-capture five. **Cost:** five PNGs and rows. **Ruling:** accepted.

## Plan

Goal: the member record matches the page header it now sits under, the Attended card becomes three
readable counts, and the surface is named `Welfare & Services`.

Acceptance criteria:

1. `PageFrame` carries an optional `titleAddon` (`leading`, `trailing`); the member record passes a
   32 px avatar leading the `h1` and, trailing, the verified check badge (accessible name and tooltip
   carrying `verifiedAt`), the `Presbyter` tag when `isPresbyter`, and the Active/Archived badge whose
   title carries the archived instant.
2. The `ConnectionBadge` component is retired: no pill on any page; `hideBadge` and its landing usage
   are removed; the health hook and the failure message bar remain, in `shell/gatewayHealth.ts`.
3. The overview's name-and-avatar block is gone; the Identity grid holds `Joined`, `Date of birth`,
   `Place of residence`, `Address line` only. Membership, shepherd, ministries, Welfare & Services and
   relationships are unchanged apart from the label.
4. All four cards share one shape - a value line at the regular weight over a muted subtext at the
   Attended cells' label size, no caption, no added height. `Attended` holds three labelled cells with the exact
   periods in its accessible name and tooltip; `Last attended` puts the date under the event name;
   `Shepherd calls` carries two labelled cells - `<attempts>×` over `Number of calls`, and the last
   reached date over `Last reached` (a muted `No one reached` when nobody was reached, a muted `0` and
   `—` when there are no calls); `Most attended` reads `<label> (<n>×)`.
5. Every surface label reads `Welfare & Services`: tab, tab heading, overview heading, foot copy, the
   create form's pointer copy and help text, and the Members list column header. Domain nouns, API names,
   the tab's internal value and the V3 USSD claims copy are unchanged.
6. Five signed states re-cut and the affected baselines re-captured: `member-detail`, the three overview
   states and `members-list` carry the round's content; every other baseline moves only because the pill
   left the shared title row.
7. Unit, DOM and e2e cases updated and green; the full gate passes.

## Verification

- **Gate:** `npm run verify` → `skill`, `check-round`, `format`, `lint`, `typecheck`, `test`, `build`
  all PASS, 7/7 steps, at 09:47:03Z (`gate-run` log in `.gates/`).

```
gate-run 2026-11-18T09:47:03.022Z profile=full steps=7/7 lines=7 bytes=1025
```

- **Unit + DOM:** `npm --prefix ui run test` 479 passed; `npm --prefix ui run test:dom` 113 passed,
  including `shows the failure message bar as the only health surface` (a rejected probe renders the
  bar and no status role or `API connected` text - AC-29's error half).
- **Test flake (one, resolved):** the first `verify` after the seat change timed out in
  `tests/db/event-instances.test.ts` at 98 s; the file then passed alone in 2.4 s (3/3) and the full
  gate passed. One re-run, nothing parked.
- **Browser suite:** `npm run ui:e2e` 75 passed, including the new
  `responsive.spec.ts` case `the overview cards wrap to two rows below the desktop breakpoint and stay
level` (two level rows at 860 px, one row at 1440 px, no clipped overflow).
- **Baselines:** full `npm run ui:capture` pass (25 screens), then the three overview states
  re-captured after the narrow fix. The three states were captured once more after the Tier 2 fixes and
  came back **byte-identical** - the accessible name and the hover-only tooltip change no pixel. 24
  baseline PNGs moved: the three overviews, `member-detail` and `members-list` carry this round's
  content; every other screen moved only because the `API connected` pill left the shared title row
  (FR-10). The README records that rule so a future unexplained move reads as a regression.
- **Mock parity, wide:** header avatar, verified check with `Verified · <date>`, `Presbyter` tag and
  Active badge; four cards in one row; four-cell Identity with sentence-case labels; Membership
  two-column; `Welfare & Services` heading and foot copy. Matches the signed drawing. Card dates read
  `Nov 14, 2025` and `Dec 21, 2025` because they pass through the shared formatter under the officer's
  locale preference; the drawing's `14 Nov 2025` is the owner's handwriting, and the grill ruled the
  format is formatter-owned, not a mock string.
- **Mock parity, narrow (860 px):** the first capture drew 3 + 1 cards with `Shepherd calls` stretched,
  and three-column Identity/Membership grids. Fixed to the drawing's 2 × 2 and two columns; the
  re-capture shows level rows and matching structure.
- **Card values:** rank against the muted labels survives the regular weight; the four cards are 111 px
  in the wide states and 111/91 px in narrow, as drawn.
- **Published locally** on the owner's `publish` (2026-11-18): `docker compose build` then
  `docker compose up -d` from the working tree; `migrate` exited 0, `app` and `ui` are healthy on
  ports 3000 and 8080, `GET /health` answers `ok`, the detail endpoint answers, and the served bundle
  carries `Welfare & Services` and `No calls logged` with no `API connected`. A browser pass signed in
  with a magic link against the published stack and read the member record: tabs `Overview | Attendance
| Welfare & Services | Shepherding`, the four empty cards, the four-cell Identity at sentence case,
  and no pill. The local database holds one smoke member and no events, so the cards open empty.
- **Tier 2 review:** ACCEPT.

## Git writes

| Brief | Actor                 | Verb | Variant                        | Reason |
| ----- | --------------------- | ---- | ------------------------------ | ------ |
| -     | `git-executor rung 2` | -    | `ollama-cloud/mimo-v2.6-flash` | -      |

## Mock sign-off

| Surface                  | Mock                                                    | Capture                                             | sha256                                                             | Signer | Date       | Verdict |
| ------------------------ | ------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| Overview (collapsed)     | `mockups/v2-shell/19-member-overview-collapsed.png`     | `ui/e2e/baseline/member-detail-overview.png`        | `ab2e955476169920757f483cc736580e1fae56c4d3b2c1256bd32f26df5487ae` | owner  | 2026-11-18 | signed  |
| Overview (subscriptions) | `mockups/v2-shell/19-member-overview-subscriptions.png` | pending                                             | `dddbad19e94ee3ec69ac78faef31a94021814b5761b8418bb0b5bbb0ca837b2c` | owner  | 2026-11-18 | signed  |
| Overview (relationships) | `mockups/v2-shell/19-member-overview-relationships.png` | pending                                             | `880c3e48d72d5c26188d9776d6d5e40b916da258e9cdeb7d4687dd3e583e1d8d` | owner  | 2026-11-18 | signed  |
| Overview (empty)         | `mockups/v2-shell/19-member-overview-empty.png`         | `ui/e2e/baseline/member-detail-overview-empty.png`  | `e8be589b985c020377d1b369fe133e4dfd7ac19f3f15c177e4012fab2bf527c0` | owner  | 2026-11-18 | signed  |
| Overview (narrow)        | `mockups/v2-shell/19-member-overview-narrow.png`        | `ui/e2e/baseline/member-detail-overview-narrow.png` | `97cd90605e9d0ec73c1656751aacee49035847318cc0ec55bb6eb90a1ab2b44d` | owner  | 2026-11-18 | signed  |

The first signature covered the semibold cut; the owner then found the value text too strong, the five
states were re-cut at the regular weight (medium resolves to the semibold face on the system font
stack), and the owner re-signed the refreshed set above.

Mock coverage: claimed 5 · e2e-only 0 · deferred 0 · prose 0.

## Acceptance

| #   | Criterion                                                                                            | Verdict | Evidence                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `titleAddon` leading/trailing; avatar, verified badge, Presbyter tag, status badge on every tab      | met     | `ui/src/components/PageFrame.tsx`, `ui/src/pages/MemberDetailPage.tsx`; `PageFrame.dom.test.tsx` bracket case + `MemberDetailPage.dom.test.tsx` header case, including the badgeless member |
| 2   | Pill retired everywhere; `hideBadge` gone; health hook and failure bar survive in `gatewayHealth.ts` | met     | `ConnectionBadge.tsx` deleted, `PageFrame.tsx`, `OfferingsPage.tsx`, `ConnectPage.tsx`; `shows the failure message bar as the only health surface`                                          |
| 3   | Identity four cells, no name/avatar/member-number block                                              | met     | `MemberOverviewTab.tsx`; `MemberDetailPage.dom.test.tsx` four-cell case                                                                                                                     |
| 4   | Four card shapes, empty branches, accessible names, tooltip periods                                  | met     | `ui/src/overview/cards.ts` + `cards.test.ts`; `MemberDetailPage.dom.test.tsx` cards and empty cases; tooltip hover case                                                                     |
| 5   | `Welfare & Services` on every surface label, USSD untouched                                          | met     | `MemberDetailPage.tsx`, `MemberSubscriptionsTab.tsx`, `MemberOverviewTab.tsx`, `MemberFormPage.tsx`, `MembersPage.tsx`; list, form and detail DOM cases                                     |
| 6   | Five signed states and the affected baselines                                                        | met     | `documents/mock-claims/v2-shell.json` (signed), `ui/e2e/baseline/*`; final capture byte-identical after the Tier 2 fixes                                                                    |
| 7   | Unit, DOM and e2e green; full gate                                                                   | met     | 479 unit, 113 DOM, 75 e2e; `gate-run 2026-11-18T08:12:54.631Z profile=full steps=7/7`                                                                                                       |

Verdict: **ACCEPTED** (Tier 2 confirmation ACCEPT). The code is uncommitted: the git chain waits on the
owner's verb.

## Review

Seat: consistent - the `Implementer` row names the worker for the build and the parent for the spec,
the mock and the captures; the Tier 2 review runs on a different candidate.

**Spec review** (`ollama-cloud/deepseek-v4-pro:0813`, outside window; two rounds): first pass REWORK
with three P1s - a stale `Subscriptions view` in AC-52, the USSD claims title reaching into a V3
surface the spec does not own, and an unspecified header location and scope - plus four P2s and three
nits; all applied in one pass. Second pass ACCEPT.

Spec review record: "The 2026-11-18 amendment is now internally consistent: AC-52, the label clause,
the PageFrame title-row header (with its 4.2 rule-1 sentence), the verified-badge accessible name,
'labels stay muted', and AC-29's pill assertion all carry the agreed text, and the USSD claims surface
is explicitly left untouched. The remaining unasserted 32 px avatar is a mock-owned visual correctly
kept out of acceptance criteria, and the double 'Welfare & Services' on Overview is a deliberate,
correct rendering of two distinct positions."

Two later passes covered the owner's card revisions. The first rejected an over-generalised "every card
is one value line" lead (Attended has three cells), an unstated set of card labels, an ungoverned
no-subtext height and a "the event name" gloss that ignored series groups; all were rewritten. The
second asked for the multiplication sign to be dropped from `<attempts>×` as a wrong string, and its
companion findings - the zero-attempt vs null-date overlap, the `no calls logged` name branch and
AC-12's missing `Last attended` assertion - were fixed in the next pass.

**Grill decision** (`grill-flash`, `ollama-cloud/deepseek-v4.1-flash:1017`, 2026-11-18, at the owner's
instruction "grill-me to follow spec definition by user"): option C. The owner's `6×` over
`Number of calls` stands verbatim, and the accessible name is the only place the glyph is spelled -
`Shepherd calls: 6 times · last reached 14 November 2025` - so one glyph has one pronunciation on the
page and the name asserts one noun. The visible label is not announced because `aria-label` replaces
the card's descendants. No re-cut: the drawing already carries that shape.

Final spec review record: "The option C ruling is carried consistently: the visible 6× over Number of
calls and the date over Last reached match the owner's drawing, the aria-label now supplies 'times' as
the single spoken noun so the two-noun contradiction is structurally removed, the zero and no-date
branches are explicit with No calls logged carrying no number, and the date stays on the shared
calendar formatter rather than the owner's example spelling. The cards clause is internally consistent
and buildable."

Weight review record: "The card value weight is now regular and stated once, with the semibold reference
removed except in the rationale, which correctly records that Segoe UI resolves 500 to the 600 face so
medium is a silent no-op - a durable, attributed reason a future worker will not undo. FR-49 governs
colour contrast only, not weight, so the regular weight neither weakens AA compliance nor collapses the
value-versus-label hierarchy."

Standards and Spec verdicts: spec ACCEPT (re-approved after the Tier 2 fix); Tier 2 confirmation
ACCEPT.

**Tier 2 review** (`ollama-cloud/deepseek-v4-pro:0813`, outside window): REWORK with one P1 and three
P2s, plus three nits. P1: the `Attended` accessible name had dropped the exact periods that the owner's
periods ruling put in both the name and the tooltip. The name now reads
`Attended: <n> this year (<year>) · <n> this quarter (<quarter label>) · <n> this month (<month label>)`
and the spec sentence matches it. P2s: the Attended tooltip became a Fluent `Tooltip` (matching the
verified badge), AC-29 gained a rejected-probe case proving the message bar is the only health surface,
and the stale `Subscriptions` comment in the tab was corrected. Nits: `FR-71a` was a typo for `FR-29a`
and the header is fixed; the suggestion to mute the Attended empty `0`s is **answered, not applied** -
the signed empty drawing draws them in dark ink while the Shepherd calls `0`/`—` are muted, so muting
would contradict the cut. A final capture after these fixes was byte-identical.

Tier 2 review record: "One P1 - FR-29 contradicts itself on where the Attended card's exact periods live
('in the accessible name and its tooltip' vs the 'Accessible names read' enumeration), and the code +
spec both silently drop 'in the accessible name' from the owner's grill ruling #7, which accepted exact
periods in both places; the tooltip-only implementation must be reconciled with the ruling before merge.
Three P2s (native title vs Fluent Tooltip on the Attended card; AC-29 error-state pill absence untested;
MemberSubscriptionsTab doc comment still says 'Subscriptions') and three nits. Everything else - header
on every tab, four-cell Identity, four card shapes and empty branches, Welfare & Services label scope
with USSD untouched, pill removal, AC-12/41/52, 4.2 rule 1 - is implemented and asserted, and the
responsive 2x2/one-row geometry is pinned by test even though the binary PNG parity is not
independently verifiable."

Spec re-approval record: "The Attended-card accessible name now carries each exact period beside its
short label - '5 this year (2026) · 5 this quarter (Q4 2026) · 4 this month (November 2026)' -
reconciling the clause's 'name and tooltip' wording with the enumeration, and the change log records the
reason without contradiction. No other sentence in FR-29, AC-12 or AC-41 still implies the periods are
tooltip-only."

**Tier 2 confirmation** (`ollama-cloud/deepseek-v4-pro:0813`): ACCEPT, no remaining P1 or P2. Record:
"Confirmation ACCEPT. The P1 is resolved in both spec and code - the Attended accessible name now
carries each exact period beside its short label (`Attended: 5 this year (2026) · 5 this quarter (Q4
2026) · 4 this month (November 2026)`), matching the amended 'Accessible names read' sentence and
reconciling the 'name and tooltip' wording without contradiction; the Fluent Tooltip P2 and the AC-29
error-half P2 are applied and tested, the stale comment nit is fixed, and the two answered-not-applied
nits (dark empty zeros per the signed drawing; FR-71a to FR-29a) are documented with sound reasons."

## Deviations

- **Card values are regular weight, not semibold.** After signing the drawings the owner found the value
  text too strong. The system font stack has no 500 face - `font-weight: 500` resolves to the 600 face
  and the image does not move - so 400 is the only lighter step; semibold would have been a no-op dressed
  as a refinement. The mock was re-cut at 400 and re-signed.
- The members-list column header changes with the label, per the owner's "everywhere" ruling; the V3
  USSD claims surface keeps its own copy because a claim names its subject, not this surface.
- **The card row is 4 across at 1280 px and wider, 2 x 2 below, 1 below 560 px**, and the detail grid is
  two columns collapsing at 560 px. The drawing fixes the two ends (1440 = 4 across, 860 = 2 x 2) and
  the spec fixes "full-width row" and "same two-column detail grid"; the 1280 switch keeps a four-across
  row wide enough for `Sunday Service (9×)` at 20 px, and the 560 collapse keeps a 20 px value from
  overflowing a phone-width card.
- **Detail labels are sentence case**, as drawn (`Joined`, `Membership card`), not the app's earlier
  uppercase treatment. The class is used only by the overview's Identity and Membership grids.
- All 24 baselines moved, not only the member five: the `API connected` pill sat in the shared title row
  on every screen. The member five carry this round's content; the rest differ only where the pill was.
- **Protected-document change in the same change set.** At the owner’s instruction to add a
  `publish` verb, `AGENTS.md` §9 and `.github/merge-policy.md`’s Verb glossary gained it as a local
  Compose rebuild, not a git write. The owner then refined it: publish is a seat that runs after the
  merge, on clean `main`. The rebuild now runs through the `publish-executor` seat, only after the
  merge chain, with `HEAD` at the merged commit and an empty `git status --porcelain`. The first
  publish in this round ran before that rule existed, on the owner’s explicit `deploy to local`;
  from now on the same check happens post-merge. The three protected files - `AGENTS.md`, the merge
  policy and the orchestrator policy - were reviewed by the pro seat and re-recorded in
  `documents/agents/protected-doc-reviews.json`; the seat itself is
  `.opencode/agents/publish-executor.md`, with its class in `documents/agents/seats.json`.
