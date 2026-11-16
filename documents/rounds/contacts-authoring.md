# Round — contacts-authoring

|                     |                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | CLOSED                                                                                                                                                                |
| Tier                | 2 - Reviewed                                                                                                                                                          |
| Mode                | `attended`                                                                                                                                                            |
| Base                | `9cac2b5`                                                                                                                                                             |
| Review rounds       | 2 (FR-29a cycle, FR-78 cycle; dispatches counted in Seats)                                                                                                            |
| Gate runs in parent | 6                                                                                                                                                                     |
| Spec                | `documents/specs/member-registrations-ui.md` (FR-29a, FR-78)                                                                                                          |
| Workers             | `single`                                                                                                                                                              |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (docs, spec, catalogue, round doc); worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (ui implementation, capture cases) |

`git-seat-budget: 16 verbs` — declared by the owner on 2026-11-16 **before this round started**, with
the owner's sentence: _"branch, commit, push, PR, merge and sync both rounds; git-seat-budget: 16
verbs."_ Round 1 spent seven briefs; this round draws on what remains. Git runs on rung 2
(`ollama-cloud/mimo-v2.6-flash`) because rung 1 (`opencode/beam-free`) returned "Free usage limit
reached".

## Seats

The 12:00-18:00 local window is evaluated at **pick time** (AGENTS.md §17).

| Seat                         | Picked (local)    | Window | Ranked first choice                              | Drawn                          | Basis                                                                                                                                                                             |
| ---------------------------- | ----------------- | ------ | ------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grill-me                     | 2026-11-16 13:46  | inside | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | same                           | inside the window the cline-pass provider is first (both grill rounds ride this seat)                                                                                             |
| Spec review — FR-29a         | 2026-11-16 14:24  | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro`   | first choice answered **model not found** (third time today); choice 1's fallback drawn → ACCEPT with three P2 clarifying edits                                                   |
| Spec confirmation 1          | 2026-11-16 14:44  | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro`   | same unavailability; closed all three P2s                                                                                                                                         |
| Spec review — FR-78 listview | 2026-11-16 ~15:33 | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro`   | same unavailability → REWORK (read-only/editable MUST collision, undefined sort, editable MUSTs without an AC)                                                                    |
| Spec confirmation 2          | 2026-11-16 15:31  | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro`   | same unavailability → REWORK: pass 1's fix introduced a modal contradiction (`MAY be editable` vs AC-53's unconditional Given)                                                    |
| Spec review — FR-78 pass 3   | 2026-11-16 ~16:02 | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro`   | same unavailability; **owner-quoted authorisation** "Authorise a third dispatch", exceeding the one-confirmation guidance; **ACCEPT**, no P1/P2/Nits                              |
| Worker — FR-29a form         | 2026-11-16 15:13  | inside | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | same                           | in-window cline-pass first                                                                                                                                                        |
| Worker — drawing gaps        | 2026-11-16 15:21  | inside | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | same                           | same seat; closes the two gaps its own report flagged                                                                                                                             |
| Worker — capture case        | 2026-11-16 15:26  | inside | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | same                           | same seat; adds the editable dialog's capture case                                                                                                                                |
| Worker — FR-78 listview      | 2026-11-16 ~16:05 | inside | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | same                           | same seat; dispatched AFTER pass 3 returned ACCEPT - an earlier draft of this table transposed these two times, which is the Tier 2 P1.1 correction in Deviations                 |
| Git executor                 | 2026-11-16 14:58  | —      | `opencode/beam-free`                             | `ollama-cloud/mimo-v2.6-flash` | rung 1 "Free usage limit reached"; rung 2 inside the declared budget (owner sentence quoted in every brief)                                                                       |
| Tier 2 code review           | 2026-11-16 16:15  | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro`   | same unavailability; independent of all four worker passes                                                                                                                        |
| Tier 2 confirmation          | 2026-11-16 16:27  | inside | `cline-pass/cline-pass/mimo-v2.6-pro`            | `ollama-cloud/mimo-v2.6-pro`   | same unavailability; first pass REWORK (1 P1, 4 P2s) then a confirmation that closed every finding except two record citations; Standards ACCEPT, Spec ACCEPT, `Seat: consistent` |
| Acceptance                   | pending           | —      | —                                                | —                              | —                                                                                                                                                                                 |

## Grill

Two grill rounds, both answered by the owner on 2026-11-16. Each kept its recommendation and its
cost; every decision below is written into FR-29a / FR-78, not only into this record.

### Round A — contacts on registration ("all as recommended")

1. **One round or two.** Run the editable-dialog drawing and the registration contacts entry together.
   **Recommendation:** one round. **Cost:** a bigger diff for the reviewer; if one half is sent back the
   other waits with it.
2. **Shape of the entry.** Three fixed optional fields — `Phone`, `Email`, `WhatsApp` — rather than
   repeatable rows. **Recommendation:** three fixed fields. **Cost:** a second phone number cannot be
   captured at registration.
3. **Duplicate value fails the create.** Keep it atomic: one request, `409` against the offending field,
   every other value preserved. **Recommendation:** keep atomic. **Cost:** one mistyped number means
   re-submitting rather than a half-done record.
4. **Section and spec text.** FR-29a with the order Identity → Residence → Contacts → Church, both
   retired help strings replaced, the ledger flip. **Recommendation:** yes. **Cost:** the separate spec
   review, and the edit path's asymmetry must be stated or the next reader files it as a bug.
5. **One editable-dialog drawing.** `18-contacts-editable` populated, add form and Remove visible;
   empty/loading/error undrawn. **Recommendation:** yes. **Cost:** three states stay behind the backlog
   wall.
6. **Draw first, then build.** **Recommendation:** yes. **Cost:** one owner sign-off before code, and a
   deliberate re-cut if the build moves from the drawing.
7. **Tests.** Extend the add-member case, add a `409` case, add a DOM case. **Recommendation:** yes.
   **Cost:** stub work in `ui/e2e` and fixture data.

### Round B — the listview ("Q1a: adopt only presentation to fit existing code. no new fields / all other as recommended")

1. **Scope.** Compact the dialog's listing — both variants, one component, one list style; the create
   form's three-field row is already compact and stays. **Recommendation:** both variants. **Cost:** both
   dialog drawings re-cut and re-signed.
2. **Shape.** A list view with the input row at the top and an Add button, adopting School-Collab's
   `ContactsEditor` presentation. **Recommendation:** adopt it — the owner proposed it; the source was
   read at `School-Collab/src/Students/SchoolCollab.Students.Application/Components/Contacts/ContactsEditor.razor`.
   **Cost:** ≈190 px saved; the editable add form moves from below the list to above it.
3. **What we don't take.** Label field, country-code dropdown, verification flag, subscription,
   primary/preferred badge, reorder, per-row edit — none exist in our contract. **Recommendation:** drop
   all seven (the owner's "no new fields"). **Cost:** a value change stays remove-and-add; order stays
   insertion order.
4. **The information affordance.** One affordance beside the privacy note (the per-group heading it sat
   on no longer exists), same exact `aria-label`. **Recommendation:** yes. **Cost:** FR-78's clause is
   rewritten and re-reviewed — three spec dispatches were needed.
5. **Row floor.** Keep 42 px. **Recommendation:** keep. **Cost:** none; compaction comes from removing
   label lines, not shrinking targets.
6. **Round or fold.** Fold the compaction into this round rather than opening a round 3.
   **Recommendation:** fold — a separate round 3 would need six more git verbs and only three remained
   after this round's chain, so it would park without a fresh budget. **Cost:** one bigger diff; a round
   doc carrying two amendments.
7. **Re-cut and re-sign.** Both dialog drawings re-cut before any dialog code moves, signed again.
   **Recommendation:** yes. **Cost:** one more look at two images — both signed 2026-11-16.

## Plan

Goal: registration captures contacts in the one create request, and both contacts surfaces have a
drawing that the build is measured against.

Scope:

1. Spec: **FR-29a / AC-52** (create-form contacts) and **FR-78 / AC-47 / AC-53 / R6** (the listview
   presentation), each reviewed before implementation.
2. Drawings: `11-add-member` rebuilt from an image-only capture onto `mock.css` and the current shell
   with the Contacts section; `18-contacts-editable` created; both dialog drawings re-cut to the
   listview; all three signed by the owner.
3. Build: `MemberFormPage` gains the `Contacts` section (three fields, one request, `409` against the
   field); `ContactsDialog` becomes a flat list with the note's single affordance and the add row above
   the list in the editable variant.
4. Tests: add-member e2e (contacts in the body), a `409` e2e, a create-form DOM file, the dialog DOM
   file rewritten for both states, the e2e contacts case rewritten, two capture cases re-pointed.
5. Baselines: `member-add` recaptured at 1440×1400 (the form gained a section); `contacts-dialog` and the
   new `contacts-editable` captured after the listview landed.
6. Catalogue: three signed states with their baselines, and claim atoms for each (34 entries).

Acceptance criteria:

1. One `POST /v1/members` carries the three fields as `contacts[]`; blank fields contribute no row.
2. A value owned by another member returns `409`, shows against that field, names the value and keeps
   every other entered value.
3. The edit form carries no contact fields.
4. Both create-form strings that said contacts come later are gone from the create path.
5. The dialog is one flat list ordered by kind then `displayOrder`, note with its single affordance,
   add row above the list in the editable variant, and no add/remove/copy/edit at the read-only sites.
6. All three drawings signed, their baselines captured beside them, the ledger `retire` row reading
   `adopt`, and `npm run verify`, `ui:e2e`, `ui:test`, `ui:test:dom`, `mock-claims` all passing.

## Verification

| Gate                 | Command                                                                                       | Result                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Full gate            | `npm run verify`                                                                              | pass - skill, check-round, format, lint, typecheck, test, build (7/7)                             |
| UI unit              | `npm run ui:test`                                                                             | pass - 41 files, 449 tests                                                                        |
| UI DOM lane          | `npm run ui:test:dom`                                                                         | pass - 13 files, 81 tests                                                                         |
| UI end-to-end        | `npm run ui:e2e`                                                                              | pass - 67 tests                                                                                   |
| UI build             | `VITE_GATEWAY_URL=https://… npm run ui:build`                                                 | pass (pre-existing chunk-size warning); without the variable the build refuses, as FR-13 requires |
| Baseline captures    | `npx playwright test --config playwright.capture.config.ts -g "contacts"` / `-g "add member"` | pass - `contacts-dialog` and `contacts-editable` at 1440×900, `member-add` at 1440×1400           |
| Mock catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                                               | pass - 77 tests; generator emits both dialog pairs (12 claims) and the add-member pair (7 claims) |

gate-run 2026-11-16T16:34:13.369Z profile=full steps=7/7 lines=7 bytes=1025

## Review

Seat: consistent — every spec pass precedes its implementation, every fallback is the documented
model on the documented provider, and the four worker passes named in Seats are exactly the ones the
`Implementer` row claims.

Standards: ACCEPT. Spec: ACCEPT.

Spec review record: "Tier 2 (reviewer `ollama-cloud/mimo-v2.6-pro`, 2026-11-16 16:15; `cline-pass` first
choice unavailable) plus the single permitted confirmation pass. First pass REWORK — P1.1 transposed
Seats times, P2.2 false prettier claim, P2.3 no Implementer row, P2.4 an evidence-free `CE-FAILED-ADD`
atom, P2.5 non-semantic list markup, four nits. Confirmation: every finding closed — the times are
corrected with the transposition recorded as a Deviation (pass 3 ACCEPT ~16:02 precedes the FR-78 worker
~16:05), the prettier claim is replaced by the `fc.exe /B` no-difference result with `.prettierignore:1`
as the real divergence, the Implementer row is honest for all four worker passes, `CE-FAILED-ADD` is
deferred rather than re-typed (guard 77/77), the dialog list is a real `ul`/`li` with implicit roles,
the mock/build drifts are recorded verbatim, AC-52's detail clause is asserted in the add-member e2e and
the owned row is pinned to its single Remove button. Two new P2 record slips and two nits remain, all in
this document: the gate-run signature and the catalogue count (35 → 34) — both corrected here, with the
signature now `2026-11-16T16:34:13.369Z`. Seat consistent: every spec pass precedes its implementation
and every fallback is the documented model on the documented provider. Standards ACCEPT; Spec ACCEPT."

## Mock sign-off

| Surface              | Mock                                        | Capture                                 | sha256                                                             | Signer | Date       | Verdict                    |
| -------------------- | ------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | -------------------------- |
| Registration form    | `mockups/v2-shell/11-add-member.png`        | `ui/e2e/baseline/member-add.png`        | `c204e606d49c53c8588a69ff8dd88c2b0f67c5016aea52f7fcc69a897c9deead` | owner  | 2026-11-16 | signed (rebuilt, then cut) |
| Contacts (read-only) | `mockups/v2-shell/16-contacts.png`          | `ui/e2e/baseline/contacts-dialog.png`   | `6b154603a77613c2512766a3710a93d02c823538e6804e8eec5f6b7f0388d0e6` | owner  | 2026-11-16 | signed (listview re-cut)   |
| Contacts (editable)  | `mockups/v2-shell/18-contacts-editable.png` | `ui/e2e/baseline/contacts-editable.png` | `b05acd5bce03f626560be80a6e6b8a377af83b29deefbe1949acf555af1d3868` | owner  | 2026-11-16 | signed (listview re-cut)   |

## Mock parity

Mock coverage: claimed 7 · e2e-only 6 · deferred 1 · prose 2

All three states are `signed` with a paired baseline, and each carries `control: "spec"` claim atoms,
so the generator emits them rather than refusing (34 entries in `documents/mock-claims/v2-shell.json`).

## Acceptance

| #   | Criterion                                                                                                                                                  | Evidence                                                                                                                                 | Verdict  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | One `POST /v1/members` carries the three fields as `contacts[]`; blank fields add no row                                                                   | `toCreatePayload`; e2e `postDataJSON()`; DOM case "sends no contacts rows when every contact field is blank"                             | ACCEPTED |
| 2   | A value owned elsewhere returns `409` against that field, naming it, values preserved                                                                      | `contactConflictErrors`; e2e "a contact value another member owns returns 409 against its field and keeps the form"                      | ACCEPTED |
| 3   | The edit form carries no contact fields                                                                                                                    | `toUpdatePayload` guard; DOM case "renders no contact field on the edit form"                                                            | ACCEPTED |
| 4   | Both retired create-form strings are gone                                                                                                                  | create lede, residence note, Contacts note and footer copy replaced; the "normalised by kind" helper removed with two absence assertions | ACCEPTED |
| 5   | The dialog is one flat list (kind order then `displayOrder`), note with one affordance, add row above the list, no add/remove/copy/edit at read-only sites | FR-78/AC-47/AC-53; dialog DOM file (3 cases); e2e "the Contacts action opens the flat contacts dialog"                                   | ACCEPTED |
| 6   | Drawings signed, baselines beside them, ledger `adopt`, all gates green                                                                                    | sign-off table above; `ui-mock-parity.md` ledger; `gate-run 2026-11-16T16:34:13.369Z … 7/7`                                              | ACCEPTED |

## Deviations

- **Stacking.** Round 1 was cut from `96a043b` (PR #190's commit) at the owner's direction; this round
  branches from `9cac2b5` (round 1's squash) now that main carries it.
- **Budget.** `git-seat-budget: 16 verbs`, declared before this round started; round 1 spent seven.
- **The branch was cut by the parent, not the seat.** Rung 2 verified the brief (budget, verb, tree
  hash) and then refused on its own precondition — "`branch`: `git switch -c <branch>` from `main`;
  never from a dirty tree" — because this round's eighteen files are uncommitted by design. It named
  the unblock itself ("have the parent move the tree onto the branch") and the owner authorised it:
  "Parent runs the branch, recorded". The parent ran `git switch -c feat/contacts-authoring` (it moves
  HEAD and touches no file) and verified the result; the remaining verbs — commit, push, pr, merge,
  sync — still go through rung 2, whose staging rules accept a dirty tree because they stage exactly
  the named files.
- **A catalogue entry crossed a round boundary.** `18-contacts-editable`'s entry was written before
  round 1's commit and landed inside it; the state belongs to this round. Recorded rather than hidden.
- **Three spec-review dispatches, not two.** The one-confirmation guidance was exceeded with the
  owner's quoted authorisation ("Authorise a third dispatch"), because pass 1's fix introduced the modal
  contradiction pass 2 caught. Pass 3 returned ACCEPT with no P1, P2 or nits.
- **A Seats time was transposed in a draft of this document.** An earlier version recorded the FR-78
  worker at 15:57 and the accepting spec dispatch at 16:02, which read as building on unreviewed text
  (Tier 2 P1.1). The real order is the one the transcript shows: pass 1 (~15:33) → pass 2 (15:31 clock
  sample) → the owner's answers → pass 3 ACCEPT (~16:02) → the dialog worker (~16:05). Times marked `≈`
  are the dispatch instants read off the session clock; the three exact samples in Seats (15:13, 15:31,
  16:15) are verbatim clock reads.
- **`.prettierignore` is the divergence, not the configs.** The root and `ui` `.prettierrc.json` are
  byte-identical (`fc.exe /B`: "no differences encountered"); the root `.prettierignore` lists `ui/`, so
  the root formatter never examines ui files and reports clean while the ui lane fails. That is what
  bit the dialog DOM file twice.
- **`CE-FAILED-ADD` was deferred, not shipped.** It was an `assert: "image"` + `PRESENT` atom for a
  failed add — something neither signed image draws (grill question 5 kept error states undrawn), so the
  mock side could only ever answer ABSENT/UNVERIFIABLE. AC-53's failed-add clause stays covered by the
  DOM and e2e cases; the atom is removed rather than re-typed into a false verification basis.
- **Known mock/build drift on the signed pairs** (Tier 2 nit 6), recorded rather than silently re-cut —
  a re-cut would void two signatures for copy-level differences: `11-add-member` puts the residence note
  where the build puts a foot note, draws `Enter an address` / `Enter a number` placeholders the build
  does not show, words the 409 footer differently ("keeps this form open" vs "is shown against the
  member-number field") and says ministries are assigned "by code" vs "on the member record"; and
  `18-contacts-editable` draws `Add` enabled on an empty row while the build disables it (behaviour, not
  presentation, so the drawing loses that argument).
- The contacts dialog still has no axe screen of its own; the worker ran an axe WCAG 2.2 AA probe over
  both dialog states during implementation (0 violations) but nothing commits that as a gate — the
  accessibility sweep backlog row stands.
