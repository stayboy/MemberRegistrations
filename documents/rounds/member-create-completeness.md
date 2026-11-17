# Round — member-create-completeness

|                        |                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                           |
| Tier                   | 2                                                                                                                                              |
| Mode                   | `attended`                                                                                                                                     |
| Base                   | `60782f2`                                                                                                                                      |
| Review rounds          | 0                                                                                                                                              |
| Gate runs in parent    | 0                                                                                                                                              |
| Spec                   | `documents/specs/member-registrations-ui.md` (FR-29a, AC-52) and `ui-date-time-formatting.md` (no change)                                      |
| Workers                | `single`                                                                                                                                       |
| Implementer            | `worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (form, menu, tests); parent opencode/deepseek-v4.1-flash-free (spec, round doc, gates)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                        |

`git-seat-budget: 10` — 1 branch + 3 commits + 1 push + 1 pr + 1 merge + 1 sync + 2 retries.

## Seats

| Seat        | Picked (local)   | Window | Class          | Candidate probed                                                 | Basis                                                         |
| ----------- | ---------------- | ------ | -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Spec review | 2026-11-17 15:0x | in     | `reviewer-pro` | `ollama-cloud/mimo-v2.6-pro` — REWORK then ACCEPT                | in-window first candidate; two P1s closed (payload, ordering) |
| Worker      | pending          | in     | `worker-flash` | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` — probe pending | in-window first candidate                                     |

## Grill

Four questions, answered "all as recommended" (owner, 2026-11-17).

1. **Scope.** One round for the date defect, ministries and subscriptions. **Cost:** one round's ceremony
   rather than two.
2. **Ministries control.** A Fluent multi-select `Combobox` listing ministries by code, selection shown as
   chips. **Cost:** the page must fetch `/v1/ministries` before the form is usable.
3. **Subscriptions.** Two calls - create, then `POST …/subscriptions` - with a partial-failure message.
   **Cost:** can leave a member created without its subscription; the atomic alternative was a wire change
   and was declined.
4. **Spec first.** FR-29a gains ministries and the subscription behaviour; AC-52 is extended; the
   date/time formatting spec needs no change because it already says the menu opens by click or
   right-click. **Cost:** a spec review before any code.

## Plan

Goal: the create form captures the whole registration in one sitting, and the sidebar's date menu works
by click as its spec says.

Scope:

- `ui/src/pages/MemberFormPage.tsx` - ministries control in the Church section; the subscription field and
  its follow-up call; the partial-failure message.
- `ui/src/format/member-form.ts` - `ministries[]` in the create payload; the subscription draft.
- `ui/src/components/DateTimeMenu.tsx` - an explicit click handler on both trigger variants, keeping
  right-click.
- Tests: a DOM case per behaviour, an e2e case for the create-with-ministries-and-subscription path, and
  a case for the date menu's click.
- Spec and this document.

Acceptance criteria:

1. Ministries chosen on the create form ride the same `POST` as `ministries[]`, and the detail shows them.
2. A subscription chosen on the create form is created by a second call after the member; on success the
   member's Subscriptions view shows it.
3. When that second call fails, the member still exists, the form says the subscription was not added,
   links to the record, and does not claim the registration failed.
4. The sidebar's Date and time entry opens its menu on a left click as well as a right click.
5. The edit form still carries no contact or ministry fields; gates green.

## Verification

| Gate                         | Command       | Result     |
| ---------------------------- | ------------- | ---------- |
| Full gate (spec-only commit) | pm run verify | pass - 7/7 |

gate-run 2026-11-17T15:47:39.329Z profile=full steps=7/7 lines=7 bytes=1025

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason |
| ----- | --------------------- | ------ | ------------------------------ | ------ |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | -      |

## Mock sign-off

n/a — no drawing changes; the form's new controls are spec-derived and the surface already has a signed
drawing that does not include them. Recorded rather than skipped.

## Mock parity

No mock is involved. The signed `11-add-member` drawing predates ministries and the subscription field;
this round does not re-cut it (owner: "no more signing") and records the drift here instead.

## Acceptance

Pending.

## Review

Seat: consistent - the `Implementer` row names the worker for the form and menu work and the parent for
the spec and record; the Tier 2 review will run on a different class candidate.

Standards and Spec verdicts: pending.

## Deviations

Pending.
