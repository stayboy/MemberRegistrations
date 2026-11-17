# Round — contacts-dialog-parity

|                     |                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | CLOSED                                                                                                                                                    |
| Tier                | 2 - Reviewed                                                                                                                                              |
| Mode                | `attended`                                                                                                                                                |
| Base                | `96a043b`                                                                                                                                                 |
| Review rounds       | 3                                                                                                                                                         |
| Gate runs in parent | 4                                                                                                                                                         |
| Spec                | `documents/specs/member-registrations-ui.md`                                                                                                              |
| Workers             | `single`                                                                                                                                                  |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (grill, spec, mock, gates); worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (FR-78 contacts dialog, tests) |

## Seats

The 12:00-18:00 local window in `documents/agents/orchestrator-policy.md` is evaluated at **pick
time**, not at round open. A dispatch that crosses 18:00 re-picks under the outside-window ranking,
and the change and its reason are recorded here.

| Seat                       | Picked (local)   | Window | Ranked first choice                              | Drawn                        | Basis                                                                                                                                                                                                               |
| -------------------------- | ---------------- | ------ | ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grill-me                   | 2026-11-16 13:46 | inside | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | same                         | inside the window the cline-pass provider is first (AGENTS.md section 17)                                                                                                                                           |
| Spec review                | 2026-11-16 13:57 | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro` | first choice answered **model not found**, which the policy counts as unavailable; choice 1's fallback provider was drawn (spec review round 1, REWORK)                                                             |
| Spec review (confirmation) | 2026-11-16 14:02 | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro` | same unavailability; the one permitted confirmation round returned ACCEPT                                                                                                                                           |
| Worker                     | 2026-11-16 14:04 | inside | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | same                         | inside the window the cline-pass provider is first                                                                                                                                                                  |
| Tier 2 code review         | 2026-11-16 14:29 | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro` | same unavailability; Standards ACCEPT, Spec ACCEPT, verdict ACCEPT with five P2s (fixed in one pass) and five nits; the confirmation pass was drawn on the same seat at 14:44 and returned ACCEPT, P1 none, P2 none |
| Acceptance                 | pending          | —      | —                                                | —                            | —                                                                                                                                                                                                                   |

## Grill

The owner accepted all seven recommendations on 2026-11-16 ("Q1-Q7: yes"). Each decision and its cost
is recorded here as asked; the specification changes live in FR-78, AC-47, R6 and the change log.

1. **Signed decisions beat the stale mock.** The age label (#64) and the WhatsApp/linked row (FR-31,
   Q65) stay; the mock is re-cut and the code is never reverted to the 2026-11-03 drawing.
   **Recommendation:** yes. **Cost:** a real redraw plus supersede notes in
   `documents/rounds/ui-mock-parity.md` and the parity pack.
2. **Note bar: port the mock.** Leading glyph and the full two-sentence copy restored.
   **Recommendation:** yes. **Cost:** the copy becomes FR-78 text and the e2e assertion changes.
3. **Group information affordance.** Fluent `InfoLabel` on each rendered group heading, one shared
   owned/linked description. **Recommendation:** yes. **Cost:** a new control, so spec text plus
   accessibility assertions.
4. **Geometry.** 600 px surface (capped at the viewport) and a 42 px row minimum, from the drawing.
   **Recommendation:** yes. **Cost:** a token change can drift it; the 1:1 comparison is redone.
5. **Spec first.** FR-78/AC-47/R6 amended with a change-log line and the separate spec review before
   any code. **Recommendation:** yes. **Cost:** one review round before edits land (and one
   confirmation round, used).
6. **Resolve the auto-signed state.** `16-contacts` re-cut, catalogue `auto-signed` → `target` →
   owner `signed`, with the baseline named. **Recommendation:** yes. **Cost:** the owner signs the new
   image in this round.
7. **Editable contacts stays out.** Scope is the read-only dialog; the editable detail dialog's missing
   mock goes to the backlog. **Recommendation:** yes. **Cost:** the parity matrix keeps a documented
   hole. _(Since answered: the state was drawn the same day as `18-contacts-editable` and catalogued at
   `target`; the backlog row now tracks its missing baseline and comparison instead.)_

## Plan

Goal: make the build and the drawing agree about the read-only contacts dialog, on the specification
rather than on whichever artefact is older.

Scope:

1. Spec amendment (FR-78, AC-47, R6, change log) - reviewed, ACCEPT with one cosmetic nit.
2. Mock `16-contacts` rebuilt from a live source (`mockups/v2-shell/16-contacts.html`, recorder
   `capture-contacts.mjs`), re-cut with the shield-lock glyph, the identity label and the linked
   WhatsApp value; catalogue set to `target`, then owner `signed`.
3. `ui/src/components/ContactsDialog.tsx`: privacy note glyph and exact copy, `InfoLabel` per rendered
   group heading with the exact accessible description, 600 px surface capped at the viewport, 42 px
   row minimum.
4. Tests: `ui/e2e/members.spec.ts` dialog case extended, new
   `ui/src/components/ContactsDialog.dom.test.tsx`.
5. Baseline re-capture for the dialog only (`capture.spec.ts -g "contacts dialog"`).

Acceptance criteria:

1. The dialog's note renders the exact two-sentence copy with a leading shield-lock glyph.
2. Every rendered group heading offers a focusable information button whose accessible name is the
   owned/linked description.
3. The surface is 600 px at 1440 px wide and never wider than the viewport.
4. Rows keep a 42 px minimum height.
5. Read-only behaviour is unchanged: no copy or edit affordance from the grid, roster or
   find-by-contact; the editable detail variant keeps Remove and Add contact.
6. The mock is signed and the baseline capture is committed beside it.

## Verification

| Gate                 | Command                                                                          | Result                                                                                            |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Full gate            | `npm run verify`                                                                 | pass - skill, check-round, format, lint, typecheck, test, build (7/7)                             |
| UI unit              | `npm run ui:test`                                                                | pass - 41 files, 443 tests                                                                        |
| UI DOM lane          | `npm run ui:test:dom`                                                            | pass - 12 files, 76 tests (2 new in `ContactsDialog.dom.test.tsx`)                                |
| UI end-to-end        | `npm run ui:e2e`                                                                 | pass - 66 tests                                                                                   |
| UI build             | `VITE_GATEWAY_URL=https://… npm run ui:build`                                    | pass (pre-existing chunk-size warning); without the variable the build refuses, as FR-13 requires |
| Baseline capture     | `npx playwright test --config playwright.capture.config.ts -g "contacts dialog"` | pass - 1 test, `contacts-dialog.png` rewritten (73,956 to 78,394 bytes)                           |
| Mock catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                                  | pass - 77 tests                                                                                   |

gate-run 2026-11-16T14:58:20.005Z profile=full steps=7/7 lines=7 bytes=1025

## Review

Seat: consistent (Tier 2 code review by `ollama-cloud/mimo-v2.6-pro`, the in-window reviewer seat,
drawn as choice 1's fallback after `cline-pass/cline-pass/mimo-v2.6-pro` answered model not found;
picked 2026-11-16 14:29, inside the window, and a different model from both recorded authors).

Standards: ACCEPT - Fluent-first and component-first hold, no P1.
Spec: ACCEPT - FR-78 and AC-47 satisfied exactly: both copy strings byte-identical, the shield-lock
glyph leading the note, one `InfoLabel` per rendered group heading with the exact accessible name and
heading semantics preserved, 600 px capped at the viewport, 42 px row floor, read-only at the four
call sites.
Verdict: ACCEPT with five P2s and five nits; findings batched into one fix pass. The test P2s (the
glyph was pinned by no assertion; "no copy" was claimed by a title but never asserted; the
information button was scoped to the region rather than the heading row) were fixed by the worker in
the two test files, each mutation-checked. The artefact P2s were fixed by the parent: the round doc's
stale `target` paragraph, the backlog row that contradicted the new `18-contacts-editable` state, and
the catalogue's missing FR-78 claim atoms (six `control: "spec"` entries under story `CT-DIALOG`, so
the generator emits the signed pair and the coverage line moves to `claimed 6 · e2e-only 5 · deferred
1 · prose 1`). The confirmation round returned **ACCEPT, P1 none, P2 none**; four of five nits
closed in that pass and the fifth (comparison-pack row punctuation) is closed in the same change.

Spec review record: "Confirmation 2026-11-16 (mimo-v2.6-pro via ollama-cloud, the Tier 2 reviewer's
single permitted confirmation pass, covering the FR-29a clarifying edits): all five code-review P2s
and all three FR-29a spec-review P2s are closed and verified - the shield-lock pin bites (an
InfoRegular mutation fails it), no-copy is asserted, 16-contacts is owner-signed with 6 emitted claims
(3 ABSENT spec controls: CT-NO-COPY, CT-NO-MARK, CT-NO-VALUE; the floor holds without --allow-short)
and the catalogue guard is 77/77. Standards ACCEPT, Spec ACCEPT, verdict ACCEPT."

## Mock sign-off

| Surface         | Mock                               | Capture                               | sha256                                                             | Signer | Date       | Verdict                             |
| --------------- | ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ----------------------------------- |
| Contacts dialog | `mockups/v2-shell/16-contacts.png` | `ui/e2e/baseline/contacts-dialog.png` | `7b2f4248df430343f9f2704d61ecdaac4baeb242a97eb55a656612486b873207` | owner  | 2026-11-16 | signed ("signed", owner 2026-11-16) |

## Mock parity

Mock coverage: claimed 6 · e2e-only 5 · deferred 1 · prose 1

`16-contacts` is `signed` (owner, 2026-11-16) and now carries the FR-78 claim atoms the Tier 2 review
asked for, so `node scripts/round/mock-claims.mjs --set v2-shell --states 16-contacts` emits the pair
instead of refusing it, and `documents/parity/comparison-pack.md` sheet 20 is corrected in the same
change. The mock side of the pair is attested by the owner's signature above.

## Acceptance

**Superseded 2026-11-16 by round `contacts-authoring`:** criteria 1–2 below describe the grouped
presentation (a heading and an `InfoLabel` per kind) that the listview replaced. The dialog's current
contract is FR-78 as amended and AC-53, and that round's record carries the acceptance for it.

| #   | Criterion                                                                             | Evidence                                                                                                                                                          | Verdict |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Note renders the exact two-sentence copy with a leading shield-lock glyph             | `ContactsDialog.tsx` `CONTACT_PRIVACY_NOTE` + `ShieldLockRegular`; e2e exact-text assertion; `ContactsDialog.dom.test.tsx`                                        | met     |
| 2   | Every rendered group heading offers a focusable information button named owned/linked | `InfoLabel` with `infoButton.aria-label`; e2e `getByRole('button', { name: GROUP_INFO, exact: true })`; DOM test asserts three, and no default "information" name | met     |
| 3   | Surface 600 px at 1440 px and never wider than the viewport                           | `dialogSurface` `width: 600px; maxWidth: 100%`; baseline at 1440 × 900                                                                                            | met     |
| 4   | Rows keep a 42 px minimum height                                                      | `contactRow` `minHeight: '42px'` (Fluent has no 42 px step)                                                                                                       | met     |
| 5   | Read-only behaviour unchanged; editable variant keeps Remove + Add                    | DOM test "stays read-only"; the editable branch untouched                                                                                                         | met     |
| 6   | Mock signed and baseline committed beside it                                          | owner signature 2026-11-16 on `7b2f4248...`; catalogue `coverage: signed`, baseline `ui/e2e/baseline/contacts-dialog.png`                                         | met     |

## Deviations

- The drawing abbreviates the identity label (`Ama Mensah (F, 34y)`) while the build renders the full
  gender word (`Kwame Asante (Male, 41y)`). That is a mock-wide convention pre-dating this round and was
  left alone; it is recorded here rather than silently changed across six states.
- `npm run ui:build` without `VITE_GATEWAY_URL` refuses by design (FR-13), so the gate above sets the
  same origin the Playwright webServer bakes in.
- The contacts dialog still has no axe screen of its own; FR-78/FR-81 coverage is the role/name
  assertions in both lanes, and the accessibility sweep backlog row stands.
- **`git-seat-budget: 16 verbs`, declared by the owner on 2026-11-16** (rung 2 only), with the owner's
  sentence: _"branch, commit, push, PR, merge and sync both rounds; git-seat-budget: 16 verbs."_ It was
  first declared after this round had started because rung 1 (`opencode/beam-free`) returned "Free
  usage limit reached" - recorded here as the owner's after-the-fact override of the "before the round
  starts" rule (owner sentence: "Declare the budget now (Recommended)"). Round 2 carries the same
  budget line in its round doc, declared before that round starts. The owner also directed the branch
  to be cut from `96a043b` rather than `main` ("Stack round 1 on #190 (Recommended)"), which deviates
  from the seat's documented `branch` action shape and is the reason the stacking is recorded here.
