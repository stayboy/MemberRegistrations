# Round — attendance-capture-model

|                     |                                                                               |
| ------------------- | ----------------------------------------------------------------------------- |
| Status              | OPEN                                                                          |
| Tier                | 2                                                                             |
| Mode                | attended (owner grill, 2026-11-11; "all as recommended")                      |
| Base                | `1f5b995`                                                                     |
| Review rounds       | 0                                                                             |
| Gate runs in parent | 0                                                                             |
| Spec                | events/offerings FR-4b/FR-6f; API §Imports/§Headcounts/§Clocking, AC-32/AC-33 |
| Workers             | `single`                                                                      |
| Migration           | **pre-authorised by name**: `0020_attendance_captures` (owner, 2026-11-11)    |

### Decisions (grill, 2026-11-11)

- **Live is computed**, never stored and never a user choice: a session is live when its date is today in the
  event timezone and the clock falls inside its start/end window. The 1/2 mode menu is dropped.
- Each capture stores `asOf` (the clock) and `ended`; the only user action is **End of session**.
- A capture outside the live window, before any close, is accepted **as** the end capture and closes the
  session.
- **One shared close** per (event, session), derived from any ended capture — per-member or headcount; after
  it every per-member and headcount write answers `409 session_closed`.
- A capture replaces that session's **imported** rows; manual rows and suppressions survive. Live captures
  may repeat; an end capture is once.
- Manual and USSD per-member rows are accepted only for a session dated **today** in the event timezone and
  never after a close; they never carry `ended`.
- The presbyter records male/female/children counts on the headcount page and USSD (roles unchanged); the
  headcount gain the same computed live/end.
- Round C keeps the USSD copy and the date fallback.

## Plan

1. **Spec first.** The API and events amendments are written; a separate
   `ollama-cloud/deepseek-v4-pro:0813` session reviews the exact text before code.
2. **Mock gate.** Signed states in the existing sets: the import page's capture state and End action
   (`mockups/v2-imports/`), the headcount state (`mockups/headcount/`), and the detail line
   (`mockups/v2-events/`). No new folder.
3. **Migration `0020_attendance_captures`.** `import_batches` gains `as_of timestamptz not null default now()`
   and `ended boolean not null default false`; `event_session_headcounts` gains
   `ended boolean not null default false`. No session table: the close is derived from any ended capture.
4. **API.** The attendance import body gains `ended?`; the server stamps `asOf`, computes live, forces `ended`
   outside the window, refuses after a close (`409 session_closed`), and replaces the session's imported rows.
   The headcount route gains `ended?` and the same close check. Manual/USSD writes gain the date-today and
   close checks.
5. **UI.** The import page shows the computed state ("Live · recorded 10:42") with one **End of session**
   action; the headcount page the same; the event detail shows the per-session capture line.
6. **Tests.** Live vs end, repeat live, end once, late end, the shared close across channels, manual
   date/close, replacement vs manual survival.
7. **Gates.** `verify`, `smoke`, `ui:test`, `ui:e2e`; capture refreshes for the import, headcount and event
   detail baselines.

### Acceptance criteria

1. A live capture (session today, inside the window) is accepted, stamped with `asOf`, and does not close
   the session; a second live capture replaces the first's imported rows.
2. An end-of-session capture is accepted once, sets `ended`, and closes the session; any later per-member or
   headcount write answers `409 session_closed`.
3. A capture outside the live window with no close is accepted and treated as the end capture.
4. Manual and USSD per-member writes are accepted only for a session dated today in the event timezone and
   refused after a close; a manual row survives later captures.
5. The event detail shows, per session, the latest capture's time and whether it ended the session, derived
   from `asOf`/`ended` — never from a stored live flag.
6. The migration is `0020_attendance_captures`; no session-close table is added.
7. `verify`, `smoke`, `ui:test` and `ui:e2e` are green.
8. The three capture baselines are refreshed.

## Verification

| Gate  | Command     | Result                                  |
| ----- | ----------- | --------------------------------------- |
| Spec  | 0813 review | ACCEPT — two REWORK rounds, then ACCEPT |
| Mocks | signatures  | pending                                 |
| Gates | `verify`    | pending                                 |

The spec review caught two contract gaps (the headcount body lacked `ended?`, the repeat-`409` text survived)
and the migration number: `0018` stays with 24e and `0019` with the offering denominations, so the capture
model takes **`0020_attendance_captures`**.

gate-run 2026-11-11T12:42:53.971Z profile=fast steps=4/4 lines=4 bytes=514

## Review

Pending — independent Standards + Spec pass after the build.

## Mock sign-off

| Surface                                  | Mock | sha256 | Signer | Date | Verdict |
| ---------------------------------------- | ---- | ------ | ------ | ---- | ------- |
| Import page — capture state + End action | —    | —      | —      | —    | pending |
| Headcount page — capture state + End     | —    | —      | —      | —    | pending |
| Event detail — capture line              | —    | —      | —      | —    | pending |

## Mock parity

| Claim                                        | Type | State   | Answer | Threshold | Confirmed by | Disposition |
| -------------------------------------------- | ---- | ------- | ------ | --------- | ------------ | ----------- |
| Computed live/end state on captures          | R    | pending | FR-6f  | AC-32     | e2e          | PENDING     |
| Per-session capture line on the event detail | R    | pending | FR-4b  | AC-33     | e2e          | PENDING     |

## Acceptance

Pending — filled after verification and review.

## Deviations

- The owner dropped the user-selected live/end mode (2026-11-11) in favour of a computed live state; the
  saved `ended` flag remains the only user input.
