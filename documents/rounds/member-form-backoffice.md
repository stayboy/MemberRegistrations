# Round - member-form-backoffice

|                        |                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                                                                                                                                                                                        |
| Tier                   | 2                                                                                                                                                                                                                                             |
| Mode                   | `attended`                                                                                                                                                                                                                                    |
| Base                   | `3a248e8` (the tree also carries `member-overview-refinements`, CLOSED and uncommitted)                                                                                                                                                       |
| Review rounds          | 0                                                                                                                                                                                                                                             |
| Gate runs in parent    | 0                                                                                                                                                                                                                                             |
| Spec                   | `documents/specs/member-registrations-member-record.md` - Phase 1: MR-1..MR-13, MR-38..MR-42, MR-45, MR-48, MR-49, MR-50; AC-MR1..AC-MR11, AC-MR24..AC-MR27, AC-MR29, AC-MR30, AC-MR33, AC-MR38, AC-MR39, AC-MR40                             |
| Workers                | `single`                                                                                                                                                                                                                                      |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (Phase 1 build, outside window); worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (visual parity, inside window); parent opencode/deepseek-v4.1-flash-free (spec, mock, captures, record)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync, publish`                                                                                                                                                                                              |

`git-seat-budget: 8` - 1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync + 1 publish + 1 retry.

## Seats

| Seat                  | Picked (local)                                   | Window | Class          | Candidate probed                        | Basis                        |
| --------------------- | ------------------------------------------------ | ------ | -------------- | --------------------------------------- | ---------------------------- |
| Worker                | `ollama-cloud/deepseek-v4.1-flash:1017`          | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` | outside-window first         |
| Reviewer              | `ollama-cloud/deepseek-v4-pro:0813`              | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`     | outside-window first         |
| Mock                  | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | n/a    | `mock-builder` | owner default                           | any-window class             |
| Tier 2 reviewer (now) | `ollama-cloud/mimo-v2.6-pro`                     | in     | `reviewer-pro` | `ollama-cloud/mimo-v2.6-pro`            | inside-window first at 12:38 |

**Window note (2026-11-18, 12:38 local).** The round opened outside the 12:00-18:00 window, so the
first worker and the spec reviews used the outside first candidates. The window is now **inside**:
any further dispatch uses the inside first candidates - worker
`cline-pass/cline-pass/deepseek-v4.1-flash-1017`, reviewer `ollama-cloud/mimo-v2.6-pro`. The
worker’s in-flight `h1` alignment is the last outside-bound run; the Tier 2 build review will use
`ollama-cloud/mimo-v2.6-pro`. The mock builder is an any-window class.

Visual-parity pass (12:4x local, inside window): worker `cline-pass/cline-pass/deepseek-v4.1-flash-1017` - step h1 focus ring, footer Cancel, step descriptions.

## Gate

Phase 1 is a wire-contract gate under `AGENTS.md` §17: the titles endpoint, the title create fields,
the guardian eligibility filter and projection, and the reachability refusals on the existing member
and relationship endpoints. The owner approved the spec on 2026-11-18, which names this phase; the
round is authorised on that basis. No migration, no data rewrite.

## Grill

The spec is this round's grill outcome; every owner decision of 2026-11-18 is recorded there. The
Phase 1 rulings this round implements:

1. `Edit` stays a visible primary button; the `Actions` menu holds the page actions and the vital ones.
2. The assembly join date leaves the form; the record keeps the cell.
3. The membership card number and the presbyter title (with its optional date) join both forms.
4. Contacts are read on the edit form and managed through the existing dialog.
5. Ministries are added and removed on the edit form through the existing endpoints.
6. The shepherd is chosen on create and assigned after the member exists; on edit the existing dialog
   reassigns.
7. Reachability replaces age: an own contact or a guardian chain to one; the chain is capped at three
   links; the last guardian of an unreachable member cannot be removed.
8. The form is a step flow (owner, 2026-11-18): `Person and contact`, `Church and involvement`, a
   conditional `Relationships` step, then `Review`. The stepper is horizontal, directly beneath the
   breadcrumb, a semantic `nav` around an ordered list of Fluent `Button`s with `aria-current="step"`,
   visually following the Fluent UI Blazor `Wizard` sample (numbered bubbles, completed checks,
   `Previous`/`Next` bottom-right); Fluent v9.75.1 has no Wizard component.
9. The Identity section drops the separate `Other names` input; the second required field is
   labelled `Other names` and writes `lastName` (owner, 2026-11-18).
10. Phase 2 (photo) and Phase 3 (OTP/USSD) are out of this round and stay parked behind their gates.

## Plan

Goal: the member add/edit form and the record's action row match the owner-approved member-record
spec's Phase 1, with the existing endpoints plus the named wire additions, and no schema change.

Acceptance criteria (the Phase 1 set from the spec):

1. `PageActions` gains a primary kind; the record marks `Edit` primary and the menu carries the page
   and vital actions (AC-MR1..AC-MR3).
2. The form drops the assembly join date and keeps existing values (AC-MR4).
3. The membership card number is on both forms (AC-MR5).
4. The presbyter title and date are on both forms; the picker is filtered by gender; the create
   schema and repository accept them (AC-MR6, AC-MR7).
5. The edit form shows contacts and offers the editable dialog (AC-MR8).
6. Ministries are added and removed on the edit form immediately (AC-MR9).
7. The shepherd is a create-time value assigned after the member exists, and the edit form reassigns
   through the dialog (AC-MR10, AC-MR11).
8. Reachability: contacts are optional; a member with no own contact requires a guardian chain to an
   own contact; the create carries `guardianMemberNo` and writes the member and the link in one
   transaction; the guardian picker excludes the member and its descendants; the detail shows the
   guardian and the resolved contact; the last guardian of an unreachable member is protected
   (AC-MR24..AC-MR27, AC-MR29, AC-MR30).
9. No migration; the drift check passes (AC-MR33).
10. Unit, DOM and e2e tests green; the full gate passes.
11. The add/edit form is a horizontal stepper flow beneath the breadcrumb with `Person and contact`, `Church and involvement`, the
    conditional `Relationships` step and the final `Review`; `Next` validates the current step, `Back`
    does not, and `Save` on `Review` validates all (AC-MR38).
12. The Identity section renders `First name` and one required `Other names` field (which writes
    `lastName`); the separate `otherNames` input is gone (AC-MR39).

## Deviations

- **No Fluent Wizard.** v9.75.1 ships no Wizard or Stepper; the stepper composes a semantic `nav`/ordered
  list of Fluent `Button`s with `aria-current="step"`, `Field` and `Button`, placed
  horizontally beneath the breadcrumb. `TabList` is not used because tab roles would declare peer tabs,
  not a sequence. The visual reference is the Fluent UI Blazor `Wizard` sample; this app is React and
  Fluent v9, so it is a pattern rather than an importable component, and the sample’s own accessibility
  note means the semantic list carries the step semantics. This is the §16 gap record.
- **The flat-form mock cut was superseded** by the step-flow decision; the three flat form states were
  withdrawn from the catalogue before signature. The action-row state stands.

## Verification

- **Gate:** `npm run verify` -> `skill`, `check-round`, `format`, `lint`, `typecheck`, `test`, `build`
  all PASS, 7/7 steps, at 13:25:44Z.

```
gate-run 2026-11-18T13:25:44.106Z profile=full steps=7/7 lines=7 bytes=1026
```

- **Unit + DOM:** `npm --prefix ui run test` 496 passed (42 files); `npm --prefix ui run test:dom` 141
  passed (16 files); `npm test` 865 passed, 9 skipped (62 files).
- **Browser:** `npm run ui:e2e` 75 passed after the 409 test learned the `?step=person` URL and the
  step headings became level 1. The events retirement case flaked once in the first full run and
  passed alone and in the re-run; recorded as one flake.
- **Capture:** `npm run ui:capture` 25/25. `member-add` is 1440 x 1123 (step 1 of the flow); the
  member-detail, overview, empty, narrow and contacts captures were re-cut with the new action row.
- **Root flake:** the first `npm test` run timed out in `tests/db/event-instances.test.ts` (24 s); the
  file passed alone and the re-run passed. One re-run, nothing parked.
- **Mock signature:** the six step states and the action row are at `target`; the flat add/edit mocks
  are archived (`_archive/v2-shell/`), and the old `11-add-member` state is removed from the
  catalogue with its seven probe entries repointed to `21-add-person-contact`.
- **Tier 2 build review:** ACCEPT - see the Review section.

## Acceptance

| #   | Criterion                                                                                  | Verdict | Evidence                                                                        |
| --- | ------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------- |
| 1   | `PageActions` primary; `Edit` visible; menu page + vital actions                           | met     | `PageActions`, `MemberDetailPage` DOM tests                                     |
| 2   | Assembly date out of the form, value preserved                                             | met     | form DOM tests                                                                  |
| 3   | Membership card on both forms                                                              | met     | `members-guardians` API + form DOM                                              |
| 4   | Presbyter title + date, gender filter, clear on change                                     | met     | API + form DOM tests                                                            |
| 5   | Contacts read + `Manage contacts` on edit                                                  | met     | form DOM tests                                                                  |
| 6   | Ministries add/remove immediately on edit                                                  | met     | form DOM tests                                                                  |
| 7   | Shepherd chosen on create, assigned after; change on edit                                  | met     | form DOM + e2e                                                                  |
| 8   | Reachability: contacts or guardian chain, atomic create, last guardian/contact, projection | met     | `tests/api/members-guardians.test.ts` (26)                                      |
| 9   | No migration; drift check                                                                  | met     | gate build + AC-MR33                                                            |
| 10  | Unit, DOM and e2e green; full gate                                                         | met     | 496 / 141 / 75; gate 7/7                                                        |
| 11  | Horizontal stepper, conditional Relationships, Review, per-step validation                 | met     | form DOM tests + capture                                                        |
| 12  | `First name` / `Other names` (writes `lastName`), no separate field                        | met     | form DOM tests                                                                  |
| 13  | Approval requires a guardian, atomic member + link, request pending on refusal             | met     | `tests/api/registration-requests.test.ts`; `UssdRegistrationsPage.dom.test.tsx` |

Verdict: **ACCEPTED** - Tier 2 ACCEPT on 2026-11-18 and the six step mocks plus the action row signed by
the owner the same day. The code is uncommitted; the git chain waits on the owner’s verb.

## Review

Seat: consistent - the `Implementer` row names the worker for the code and the parent for the spec, the
mock and the captures; the Tier 2 review runs on a different candidate.

**Spec review** (`ollama-cloud/deepseek-v4-pro:0813`, outside window; four passes): ACCEPT on
2026-11-18 after the phase maps, the `EmailSender`, the phone-or-WhatsApp identity and the reachability
gates were corrected. Record: "Accept: the MR map assigns all 47 requirements exactly once (MR-21 and
MR-36 shared-only, outside any range) and the AC map assigns all 37 acceptance criteria exactly once
with AC-MR29 in Phase 1 and AC-MR28/32/35/37 in Phase 3; the two maps cross-check cleanly, and the
phone-or-WhatsApp identity is consistent across the normative requirements, binding, DTO and contract -
only idiomatic 'phone' shorthand remains in a few user stories and the self-register sentence, none of
which contradict the rule."

Create-guardian amendment (2026-11-18): ACCEPT - the guardian is atomic across MR-38, MR-42,
AC-MR24 and UI FR-71 (member, contacts and link in one transaction), with the shepherd and the other
post-create steps as best-effort. The amendment exists because a no-contact create could otherwise
fail the reachability rule before its guardian link was written.

Step-flow amendment (2026-11-18): ACCEPT - the rail is a semantic `nav`/ordered list of Fluent
`Button`s with `aria-current="step"` (`TabList` is not used because tab roles would declare peer
tabs), and AC-MR38 covers Back-not-validating, the horizontal stepper beneath the breadcrumb (labels
hide below 600 px), disabled future steps, heading focus, `?step=` restore and the Saved-as-you-go
sections. The round and spec
agree.

Horizontal-stepper amendment (2026-11-18): ACCEPT - the stepper is horizontal directly beneath the
breadcrumb at every width, the labels hide below 600 px, and the numbered bubbles, completed checks
and connectors follow the Fluent UI Blazor Wizard sample visually while the semantic `nav`/`ol`/
`aria-current="step"` rail carries the accessibility; no vertical rail or `TabList` instruction
remains.

Progress reading amendment (2026-11-18): ACCEPT - `ProgressBar` and the `Step n of N` counter are
dropped; the numbered bubbles, completed checks and connector lines carry the progress, matching
the Fluent UI Blazor sample, and MR-48/AC-MR38 still assert them.

**Tier 2 build review** (`ollama-cloud/mimo-v2.6-pro`, inside window): REWORK then ACCEPT. The first pass
found the approval-reachability hole and the silent Review save; both are closed in code and tests. Record:
"Both Tier 2 P1s are closed in code and tests - registration approval now requires and atomically links
a validated guardian with the request left pending on every failure class, and the step form owns its
subscription error on the Church step so the Review save cannot dead-end silently; all P2s landed, and
the deferred candidate-walk N+1 is recorded in `documents/backlog.md`."

## Git writes

| Brief | Actor                 | Verb | Variant                        | Reason |
| ----- | --------------------- | ---- | ------------------------------ | ------ |
| -     | `git-executor rung 2` | -    | `ollama-cloud/mimo-v2.6-flash` | -      |

## Mock sign-off

| Surface                                 | Mock                                         | Capture                                                        | sha256                                                             | Signer | Date       | Verdict |
| --------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| Add member, step 1 (person and contact) | `mockups/v2-shell/21-add-person-contact.png` | `ui/e2e/baseline/member-add.png`                               | `065efebcf438d9d9256771f8f7ac42df92c745f00ef30338a0738e723cd8a9df` | owner  | 2026-11-18 | signed  |
| Add step 2, church and involvement      | `mockups/v2-shell/21-add-church.png`         | pending (no capture for step 2)                                | `85c46f2eb79a071896d3b48256d2fa1022df70394ed0c11aed9f18f9429a831b` | owner  | 2026-11-18 | signed  |
| Add step 3, relationships (guardian)    | `mockups/v2-shell/21-add-relationships.png`  | pending (no capture for step 3)                                | `1f5da2d0a636323e26a578bccc758f11f1147685dc76f5c33b38928b4b9cdb31` | owner  | 2026-11-18 | signed  |
| Add final review                        | `mockups/v2-shell/21-add-review.png`         | pending (no capture for Review)                                | `c7dc188571d5119cd84016e3c7ed5ff3250eb801864ca686e1a1be165a036f26` | owner  | 2026-11-18 | signed  |
| Edit step 2, involvement                | `mockups/v2-shell/21-edit-involvement.png`   | pending (no capture for edit step 2)                           | `1802c25c3cd72f2d8b84cf57eba7c0277338a3c89c546d7b0a3b9c202bd31260` | owner  | 2026-11-18 | signed  |
| Edit final review                       | `mockups/v2-shell/21-edit-review.png`        | pending (no capture for edit Review)                           | `357e82a2df13a1884d5aed34ef6c8053b23376910f1bed85efc2eaeec533746a` | owner  | 2026-11-18 | signed  |
| Member record action row                | `mockups/v2-shell/20-member-actions.png`     | n/a (menu-open state; the header is in member-detail-overview) | `3ce231d24e5f7b368a10e604e3522e2928cc38b49c6ee61daa70b653bd7d0189` | owner  | 2026-11-18 | signed  |

Mock coverage: claimed 7 · e2e-only 0 · deferred 0 · prose 0.
