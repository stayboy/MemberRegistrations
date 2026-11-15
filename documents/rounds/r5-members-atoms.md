# Round - r5-members-atoms

|                     |                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                        |
| Tier                | 2 - Reviewed                                                                                                                |
| Mode                | unattended (auto-accept recommendations)                                                                                    |
| Base                | `2af4ea2`                                                                                                                   |
| Review rounds       | 1                                                                                                                           |
| Gate runs in parent | 1                                                                                                                           |
| Spec                | `documents/specs/member-registrations-ui.md` FR-20..FR-22, AC-11, AC-33; the triage in `documents/rounds/ui-mock-parity.md` |
| Workers             | `single`                                                                                                                    |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (page, tests, round doc)                                                       |

## Grill

1. **The switch replaces a shipped status dropdown — is that a mock winning over shipped behaviour?**
   Recommendation: yes, and it is a small, visible product change the triage adopted. Cost: one shipped
   control changes shape, so it belongs in "what a reader would notice" rather than a footnote.
2. **What can "Include archived" mean when the register has two views, not an "all" one?**
   Recommendation: the switch is the clearer control for the same binary state — on is the archived view,
   and the route still says which view it is. Cost: it reads as "include" while meaning "show only
   archived", which the label has to carry.
3. **Prev over a forward-only cursor — is that possible without a wire change?**
   Recommendation: yes, a page index over the cursors already fetched; Prev walks back, Next fetches only
   when the index runs out. Cost: the pager knows only the pages this session fetched, so a reload returns
   to the first.
4. **The row's one icon becomes a menu with two items — is that better than one?**
   Recommendation: yes; one item is a menu that should be a button. Cost: Contacts now exists in two
   places on the row, which the roster also does.

## Plan

The last of DoD 5's members surface: the three atoms the triage adopted, built as the signed mock
draws them.

### Scope

- `ui/src/pages/MembersPage.tsx` - the status dropdown becomes an **Include archived** switch; the footer
  gains **Prev** and **Next** over a page index; the row's open icon becomes a **More actions** menu with
  _Open member_ and _Contacts_.
- `ui/e2e/members.spec.ts` - two cases: the switch, the pager and the menu; the switch moving to the
  archived view.

Acceptance criteria:

1. The toolbar shows an **Archived** switch in place of the dropdown, and it moves to the archived view.
2. The footer shows **Prev** (disabled on the first page) and **Next**.
3. A row offers one **More actions** menu holding _Open member_ and _Contacts_.
4. `npm run verify` and `npm run ui:e2e` pass.

## Verification

| Gate      | Command          | Result            |
| --------- | ---------------- | ----------------- |
| e2e       | `npm run ui:e2e` | 64 passed         |
| Full gate | `npm run verify` | see the signature |

gate-run 2026-11-15T19:41:45.415Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

No mock changed; the members list is the screen the signed shell mock carries.

| Surface    | Mock                                           | sha256                                                             | Signer     | Date       | Verdict     |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/members` | `mockups/v2-shell/01-shell-expanded-light.png` | `4bfb188864b316e6df431bf786618896d03783a07f4e082055f1d6851cff3cae` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 4 · e2e-only 5 · deferred 1 · prose 0

## Mock parity

| Surface      | States | Claimed | e2e-only | Deferred | Probe |
| ------------ | ------ | ------- | -------- | -------- | ----- |
| members-list | 5      | 4       | 0        | 0        | full  |

## Review

| Round | Seat                                  | Verdict                                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 3 P1: the footer rendered `Page N` (FR-20/AC-33 forbid a page number) and the doc did not record it; the page index never reset when the search or a filter changed, leaving a phantom index; and "Include archived" inverted the control, since on shows the archived view only |

Fixes: the page number is gone; the index stores the query key beside itself, so a filter change
resets it by derivation rather than by an effect; and the switch reads **Archived**, which is what it
does. The mock still says "Include archived" - it described a third "all" view the register does not
have, so the mock is the stale artefact here and the divergence is recorded rather than copied.

Seat: consistent - the Implementer row names the parent, the reviewer seat stands outside the author,
and the review preceded the merge.

## Acceptance

| #   | Criterion                                                       | Verdict  | Evidence                                              |
| --- | --------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| 1   | The switch replaces the dropdown and moves to the archived view | ACCEPTED | `members.spec.ts` second case asserts the URL change  |
| 2   | Prev and Next in the footer                                     | ACCEPTED | the first case asserts Prev disabled and Next present |
| 3   | One More actions menu per row                                   | ACCEPTED | the first case opens it and finds both items          |
| 4   | Gates pass                                                      | ACCEPTED | 64 e2e, `verify` signature                            |

## Deviations

- **The mock says "Include archived"; the build says "Archived".** The signed members mock draws
  a control that would include archived rows in the active list, and the register has no such view
  (`status` is active or archived). The build follows the data; the mock needs a re-cut when its surface
  is next touched, and the catalogue still claims the old label.
- **One e2e assertion is parked.** The deep-link panel opening passes alone and fails under a parallel
  run; after two attempts it is recorded in the backlog rather than retried a third time.

- Tier 2 parent-authored: one page and its tests.
- The label says "Include archived" while the behaviour shows the archived view only. The label is the
  mock's; the register has no third view, and the route names the truth.
- The pager is per session: a reload returns to the first page, because the cursor is not in the URL.
