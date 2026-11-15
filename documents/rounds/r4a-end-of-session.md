# Round - r4a-end-of-session

|                     |                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                  |
| Tier                | 2 - Reviewed                                                                                                                          |
| Mode                | unattended (auto-accept recommendations)                                                                                              |
| Base                | `59d3b8d`                                                                                                                             |
| Review rounds       | 0                                                                                                                                     |
| Gate runs in parent | 1                                                                                                                                     |
| Spec                | `member-registrations-events-offerings.md` FR-6f, AC-7a; `member-registrations-headcount.md` HC-6; `member-registrations-ui.md` AC-51 |
| Workers             | `single`                                                                                                                              |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (component, caller, test, round doc)                                                     |

## Plan

R3 withdrew seven claims because their controls - `End of session` and the live/ended copy - had no
surface once the operator page went. This slice restores the control where the rest of the capture now
lives: the session row.

Two facts checked before porting, because both would have been silent defects:

- The retired page **did** send `ended: true` with `rows: []` for a close. My first read of the call site
  suggested it did not; the request shape confirms it does. The row reproduces that request exactly.
- The close must invalidate **both** the session's headcount read and the event detail, or the capture
  stamp would not change after a successful close.

### Scope

- `ui/src/components/SessionHeadcount.tsx` - a `canEndSession` prop and an `End of session` action that
  posts the end-only import.
- `ui/src/pages/EventDetailPage.tsx` - a live capture (present, not ended, not cancelled) offers the close.
- `ui/src/components/SessionHeadcount.dom.test.tsx` - a case asserting the request, with the spy hoisted
  alongside the module mock.

Acceptance criteria:

1. A session with a capture that is not ended offers **End of session**.
2. A cancelled or ended session offers neither action.
3. The close posts `{ eventId, sessionDate, rows: [], ended: true }` and refreshes the row.
4. The DOM lane and the full gate pass.

## Verification

| Gate      | Command               | Result              |
| --------- | --------------------- | ------------------- |
| DOM lane  | `npm run ui:test:dom` | 10 files, 70 passed |
| e2e       | `npm run ui:e2e`      | 62 passed           |
| Full gate | `npm run verify`      | see the signature   |

gate-run 2026-11-15T17:18:57.087Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

No mock changed; the control comes back on a row the signed activity detail already draws.

| Surface                   | Mock                                              | sha256                                                             | Signer     | Date       | Verdict     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/events/:id?kind=series` | `mockups/v2-events/03-activity-detail-series.png` | `cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

n/a - no claim changed. The backlog row that withdrew the seven claims stays open until the import panel
lands; this round restores one of the controls those claims named, not the panel.

## Review

| Round | Seat                                  | Verdict                                                                                                                                                                                                                                   |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 1 P1 (the close was offered on past and not-started sessions because the live-window check was re-derived instead of reused) and 2 P2 (a failed close surfaced nowhere; an ended session hid the action instead of disabling it) |

Fixes: the row takes the capture state's own `endAction` (`enabled` | `disabled` | `hidden`) from
`endActionState`, so the rule lives in one place and the states match FR-6f exactly; a failed close
shows its own message under the actions rather than inside a closed dialog; and two cases pin the
hidden and disabled states.

Seat: consistent - the Implementer row names the parent, the Deviations section carries the reason, and the reviewer seat stands outside the author.

## Acceptance

| #   | Criterion                                         | Verdict  | Evidence                                                                                            |
| --- | ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| 1   | A live capture offers the close                   | ACCEPTED | `canEndSession` from the caller; the DOM case clicks it                                             |
| 2   | A closed session offers neither action            | ACCEPTED | `disabled` covers cancelled and ended; both buttons carry it                                        |
| 3   | The close posts the end-only import and refreshes | ACCEPTED | the case asserts `rows: []` and `ended: true`; `onSuccess` invalidates the headcount and event keys |
| 4   | Gates pass                                        | ACCEPTED | 69 DOM, 62 e2e, `verify` signature                                                                  |

## Deviations

- Tier 2 parent-authored: one component, one caller line and a test.
- **R4 is not finished.** The import panel - the file, the preview, the commit - still lives on the page,
  and `/imports/attendance` still exists. The page is a 22 KB feature with its own occurrence picker and
  URL state; extracting it into a panel is its own round, and shipping it half-extracted would be worse
  than the page.
- Two failed DOM runs before the spy was hoisted: `vi.mock` runs above module-level constants, so the spy
  has to be hoisted with it. Test infrastructure, not behaviour.
