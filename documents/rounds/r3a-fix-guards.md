# Round - r3a-fix-guards

|                     |                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                  |
| Tier                | 2 - Reviewed                                                                          |
| Mode                | unattended (auto-accept recommendations)                                              |
| Base                | `38a8088`                                                                             |
| Review rounds       | 1 - late review of R3a: REWORK, two P1 and four P2; all fixed here                    |
| Gate runs in parent | 1                                                                                     |
| Spec                | `member-registrations-headcount.md` HC-3, HC-6, HC-9, HC-22, HC-28; events FR-4, AC-3 |
| Workers             | `single`                                                                              |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (component, caller, tests, round doc)    |

## Plan

R3a was merged **before its review ran** — the round doc's Review row said `pending`. That is the
breach this round answers: the review was commissioned after the fact, it returned REWORK, and the
findings are fixed forward rather than rewritten.

### The two P1s

| #   | Finding                                                                                                                                                          | Fix                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `disabled` covered a **cancelled** session only, so an **ended** one still offered Record and Correct — HC-6 says a closed capture closes every lane for writing | the caller now disables on `cancelled                                         |     | capture.ended` |
| 2   | a retired **`mixed`** observation was rendered with a Correct action, so history could be superseded — HC-9 says never rewritten or hidden                       | `laneRows` marks a `mixed` row not correctable, and no action is drawn for it |

### The P2s

- **The dialog's running total** was hard-coded `0`; it now sums what has been typed, as the page did.
- **Live validation** was `null`; it now comes from `headcountPayload(mode, values)`, so save is
  disabled and the error is inline before a request is made.
- **A cleared as-of** no longer posts an empty instant (`fromDateTimeLocal(asOf) || undefined`).
- **Tests** now prove the absence of a fresh `asOf` on a correction, that a `mixed` row offers no
  Correct, and that both actions are disabled on a closed session.

Acceptance criteria:

1. An ended session offers neither action.
2. A `mixed` observation is shown and never correctable.
3. A correction posts `supersedesId` and no `asOf`.
4. The dialog shows a live total and blocks an invalid submit.
5. `npm run verify` and `npm run ui:test:dom` pass.

## Verification

| Gate      | Command               | Result              |
| --------- | --------------------- | ------------------- |
| DOM lane  | `npm run ui:test:dom` | 10 files, 68 passed |
| Full gate | `npm run verify`      | see the signature   |

gate-run 2026-11-15T15:48:40.278Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

No mock changed. The row this round guards is the one the signed activity detail draws, so the row
names that mock.

| Surface                   | Mock                                              | sha256                                                             | Signer     | Date       | Verdict     |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| `/events/:id?kind=series` | `mockups/v2-events/03-activity-detail-series.png` | `cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af` | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

n/a - no claim changed.

## Review

| Round | Seat                                  | Verdict                                                                                                         |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK on R3a - two P1 (an ended session still writable; a `mixed` row correctable) and four P2, all fixed here |

Seat: consistent - the Implementer row names the parent, the Deviations section carries the reason, and
the reviewer seat stands outside the author.

## Acceptance

| #   | Criterion                              | Verdict  | Evidence                                                       |
| --- | -------------------------------------- | -------- | -------------------------------------------------------------- |
| 1   | An ended session offers neither action | ACCEPTED | the caller passes `cancelled                                   |     | capture.ended`; the DOM case asserts both buttons disabled |
| 2   | A mixed observation is not correctable | ACCEPTED | the DOM case finds "Mixed (retired)" and no Correct            |
| 3   | A correction posts no asOf             | ACCEPTED | the DOM case asserts the payload has no `asOf` property        |
| 4   | Live total and inline validation       | ACCEPTED | `total={liveTotal}`, `validationError` from `headcountPayload` |
| 5   | Gates pass                             | ACCEPTED | 68 DOM, `verify` signature                                     |

## Deviations

- **The process breach is recorded, not papered over.** R3a merged with its review pending; the review
  ran afterwards and its P1s are fixed forward here. The next round's brief names it so the reviewer can
  judge whether the fix is complete.
- Tier 2 parent-authored: one component, one caller line and three tests.
