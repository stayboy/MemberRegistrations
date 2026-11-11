# Round — ui-mock-parity

|                     |                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Status              | OPEN — planning and sign-off (no code)                                                             |
| Tier                | 1 (planning, sign-off); each build follows as its own Tier 2 round                                 |
| Mode                | attended (owner grill, 2026-11-10)                                                                 |
| Base                | `f7bcb10`                                                                                          |
| Review rounds       | 0                                                                                                  |
| Gate runs in parent | 0                                                                                                  |
| Spec                | `documents/specs/member-registrations-ui.md` §11.2; mock policy in `documents/rounds/mvp-mocks.md` |
| Workers             | none in this round                                                                                 |

### Decisions (grill, 2026-11-10)

- The mismatch is **triage**, not drift-to-close and not re-mock-everything: adopt what is valuable,
  retire what the data or a later decision forbids, queue what needs a new read.
- Parity becomes **executable**: mock-declared elements are asserted in e2e by role/name, with the
  capture baselines kept for the purely visual residue.
- Shepherding roster is the first surface to rebuild; the shell/nav alignment follows; events after.
- The v2 mocks were **never signed** (see `## Sign-off audit`), so the reduced target for each surface
  is signed before its code round.
- Missing features are queued here and built in a later round, not in this one.
- This work does **not** block the MVP tag.

## Sign-off audit

| Mock set                           | States | Signed? | Evidence                                                                                                                                    |
| ---------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mockups/v2-shell/`                | 15     | **no**  | "reference for structure, states and labels only"; pixel parity deferred to ticket 19 (`member-detail-edit.md:54`, `members-list-ui.md:68`) |
| `mockups/v2-events/`               | 7      | **no**  | no round doc references the directory                                                                                                       |
| `mockups/v2-imports/`              | 1      | **no**  | `imports-ui-shell.md:81` deferred                                                                                                           |
| `mockups/v2-settings/`             | 3      | **no**  | referenced as chrome guidance only (`orchestrator-policy.md:92`)                                                                            |
| `mockups/ussd/`                    | 41     | partial | the headcount and offerings subsets were signed; the rest predate the rule                                                                  |
| `mockups/mvp-offerings/`           | 22     | **no**  | backlog row "MVP offering-capture mocks"                                                                                                    |
| `mockups/headcount/`               | 9      | **yes** | hashes in `mvp-headcount.md`                                                                                                                |
| `mockups/offering-grid/`           | 12     | **yes** | hashes in `mvp-offering-grid.md`                                                                                                            |
| `mockups/ui-fixed-gateway-origin/` | 4      | **yes** | hashes in that round                                                                                                                        |

## Screen index — mock set to implementation

Every mock screen has a shipped counterpart; none is missing outright. This table is the durable answer
to "what did we build from these mocks", and is what ticket 19 calls the mock index.

| Mock set                               | Screens                                                                                                                                       | Implementation                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `v2-shell` (15 states)                 | shell light/dark/collapsed/meadow/mobile; members list; add member; subscriptions tab; add-subscription; add-coverage; contacts; find-contact | `AppShell`; `/members`; `/members/new`; `MemberSubscriptionsTab` (hosts both dialogs); `ContactsDialog`; `FindByContactDialog` |
| `v2-shell` shepherding (3)             | officers; roster; church report                                                                                                               | `/shepherding/officers`, `/shepherding/roster`, `/shepherding/report`                                                          |
| `v2-events` (7)                        | events list; event detail; series list; series detail; offerings landing; attendance rows; offering terms                                     | `/events`; `/events/:id`; `/events/series`; `/events/series/:id`; `/events/offerings`; `EventAttendanceDialog`; `TermsDialog`  |
| `v2-imports` (1) + `old` (3)           | members import; attendance import; preview errors; placeholder                                                                                | `/imports/members`; `/imports/attendance`; `ImportPanel`                                                                       |
| `v2-settings` (3)                      | date/time settings; sidebar menu; display menu                                                                                                | `SettingsPage`; `DateTimeMenu` in the shell                                                                                    |
| `ussd` (41)                            | 8 USSD operator screens                                                                                                                       | `/ussd/*`                                                                                                                      |
| `mvp-offerings` (22)                   | landing and its dialogs                                                                                                                       | `/events/offerings`                                                                                                            |
| `offering-grid` (12) · `headcount` (9) | one page each                                                                                                                                 | `/ussd/offerings`; `/ussd/headcount`                                                                                           |
| `mvp-hardening` (7)                    | active-offerings panel; simulator hidden                                                                                                      | event detail; navigation gate                                                                                                  |
| `ui-fixed-gateway-origin` (4)          | connect                                                                                                                                       | `/connect`                                                                                                                     |

Two caveats: `TermsDialog` has **no capture case**, so it has never been compared; and the screens with
**no mock** — `/imports/attendance`, `/imports/batches`, `/settings`, the subscriptions tab, most of
`/ussd/*` — have no design reference to compare against.

## Screen-level decisions (grill, 2026-11-10, round 2)

- **"Missed" means a missing screen or a missing spec-required atom**, not a different layout. A screen
  that exists and works is not missed; every difference is labelled R or M.
- Screens **without a mock** get one only when they are about to change, not retroactively.
- Where the mock and the build use different interaction patterns (standalone dialog versus a dialog
  hosted inside a tab), the build stands **unless it breaks the read-first rule** that writes open from
  a toolbar, row or header.
- The two R gaps are the next build, ahead of the roster: series summary, then the contextual import
  entry, then the roster.
- `TermsDialog` gets a capture case and is triaged before the first rebuild.
- The release is unaffected: the tag ships with the AC-5 miss recorded.

## Triage — observed so far

### Shepherding roster (`mockups/v2-shell/08-shepherding-roster.png`)

| Mock element                                                                 | Decision   | Why                                                                                    |
| ---------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| Officer identity card + officer selector                                     | **adopt**  | today's officer tabs lose the presbyter context and the assignment counts              |
| Five KPI tiles (Assigned, Attempts, Conversations, Never called, Follow-ups) | **adopt**  | each is a count the roster already computes or can compute from rows in memory         |
| Roster search                                                                | **adopt**  |                                                                                        |
| Show filters All / Never called / Quiet > 30 days                            | **adopt**  | needs `lastCalledOn`; confirm it is on the roster DTO                                  |
| Member avatar + "Never called" / "Quiet 52d" badges                          | **adopt**  |                                                                                        |
| Contact column with phone/email values                                       | **retire** | FR-57/Q157: the roster carries a contact _count_, values go behind the Contacts action |
| Row actions (call, overflow)                                                 | **adopt**  | the call action must open the record-call dialog                                       |
| Footer "7 of 28 assignments shown · sample rows"                             | **adopt**  | the "sample rows" caveat is mock-only text                                             |

### Events list (`mockups/v2-events/01-events-list.png`)

| Mock element                                                   | Decision        | Why                                                                                  |
| -------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Four KPI tiles (Upcoming, Held, Attendance %, Offerings total) | **queue**       | needs window aggregates; `GET /v1/events` returns zeroed `stats` (backlog FR-29 row) |
| Search (event, series, event no)                               | **queue**       | `GET /v1/events` has no `q`                                                          |
| Segmented filter All / Upcoming / Held                         | **adopt**       | derivable client-side from status                                                    |
| Import attendance + New event buttons                          | **adopt**       | both routes exist                                                                    |
| Venue badge + sub-label                                        | **adopt**       |                                                                                      |
| Per-row offerings count + paid amount                          | **queue**       | offering money on the event row needs the stats read                                 |
| Quarter footer + right note                                    | **adopt**       |                                                                                      |
| Ministry column                                                | **keep actual** | the mock omits it; the API returns it and the register needs it                      |

## Method caveat — the baselines are stale

Every comparison below was made against the **committed capture baselines**, not a live build, and those
baselines rot:

| Baseline                 | Committed        | Consequence                                                                                                                                                                  |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imports-members.png`    | 2026-11-05 (#55) | shows **3** expected columns; `IMPORT_FORMATS` (`src/repos/imports.ts:105`) carries **12**, including `placeOfResidence`. The difference is baseline rot, not product drift. |
| `shepherding-roster.png` | 2026-11-05 (#55) | predates the roster's contact-count change and the "Still in church" column                                                                                                  |
| `events-list.png`        | 2026-11-09 (#88) | the newest of the set                                                                                                                                                        |

`ui:capture` writes these files and nothing compares them to anything, so both reference sets — the mocks
and the baselines — drift independently. **Every triage row must be re-confirmed against a capture taken
from this round's base commit before it is signed.** That is now an acceptance criterion.

## Triage — pass 2

### Members list (`v2-shell/10-members-refined.png`)

| Mock element                    | Decision  | Why                                                                                        |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| Import attendance button        | **adopt** | the route exists and is reachable from the member context                                  |
| Include archived switch         | **adopt** | replaces the "Active" status dropdown with a clearer control                               |
| Ministries filter               | **queue** | `GET /v1/members` filters on `q`, `contact` and `status`; a ministries filter needs a read |
| Series filter                   | **adopt** | shipped as "All series"                                                                    |
| Attendance ratio + progress bar | **queue** | needs a per-member attendance aggregate                                                    |
| Status chip                     | **adopt** | shipped as plain text                                                                      |
| Row overflow menu               | **adopt** | the shipped open-link icon is the only action                                              |
| Prev/Next pagination footer     | **adopt** | shipped footer has no paging controls                                                      |

### Event detail (`v2-events/02-event-detail.png`)

| Mock element                                                 | Decision        | Why                                                            |
| ------------------------------------------------------------ | --------------- | -------------------------------------------------------------- |
| KPI tiles (Dates, Attendance %, Offerings, Paid)             | **queue**       | needs the event stats read (FR-29 row)                         |
| Import attendance button                                     | **adopt**       |                                                                |
| Attach offering, disabled                                    | **retire**      | the create flow is out of scope (backlog row)                  |
| Per-date table with Source chips and "View rows"             | **adopt**       | shipped table has the source; the chips and action are missing |
| Offering cards with Paid / Pledged / Pending                 | **queue**       | needs terms and pledge reads                                   |
| Definition grid (number, series, venue, status, description) | **keep actual** | the mock omits it and it is genuinely useful                   |

### Contacts dialog (`v2-shell/16-contacts.png`)

**Adopt as built.** Paragraph, Phone, Email, the "Owned" affordance, Close / Open member — all present.
The shipped dialog adds a linked-contact row (WhatsApp, "Linked · M-1002"), a later feature the mock
predates. No change.

### Imports (`v2-imports/01-members-import.png`)

| Mock element                                        | Decision           | Why                                                   |
| --------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| Sidebar as "SECTION · IMPORTS" with square bullets  | **retire**         | shipped IA uses icons and the standard section header |
| Expected-columns table with all 12 rows and Notes   | **adopt as built** | the app already lists 12; the _baseline_ is stale     |
| Drag-and-drop drop zone                             | **queue**          | shipped control is a Choose-file button only          |
| Preview table with per-row result and Import button | **adopt**          | present after a file is chosen                        |
| "Refresh columns" + template download               | **adopt**          | shipped                                               |

### Shell

| Mock element                                                   | Decision   | Why                                                                                                                    |
| -------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Top nav `Members · Attendance · Imports · Shepherding · Admin` | **retire** | the shipped IA is `Members · Events · Imports · Shepherding · USSD · Admin`; the mock predates Events absorbing Series |
| User chip with initials and name                               | **adopt**  |                                                                                                                        |
| Sidebar locale row                                             | **adopt**  | shipped already                                                                                                        |

## Triage — pass 3 (fresh capture at `f42b6b1`)

`npm run capture` produced 21 screenshots locally; the committed baselines were **not** rewritten. Rows
below are confirmed against that capture, not the stale files.

### Add member (`v2-shell/11-add-member.png`)

| Mock element                                    | Decision        | Why                                                                                                     |
| ----------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| Contact kind + contact value on the create form | **retire**      | the shipped form states contacts are added after creation; the spec moved them behind the member record |
| Ministries multi-select                         | **retire**      | ministries are assigned on the member record, not at creation                                           |
| Success banner and member preview               | **retire**      | mock-only illustration                                                                                  |
| Maiden name and alias fields                    | **keep actual** | the mock omits them; both are captured and shown                                                        |
| One Cancel/Create pair at the foot              | **keep actual** | shipped puts them in the page header                                                                    |

### Series list (`v2-events/03-series-list.png`)

| Mock element                                                                   | Decision        | Why                                                               |
| ------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------- |
| Four KPI tiles (active series, next occurrence, exceptions, standalone events) | **queue**       | needs a series summary read                                       |
| `SER-n` code and area under the name                                           | **adopt**       | the row already has the schedule; the code is a stable identifier |
| Timezone column                                                                | **keep actual** | the mock omits it and it matters for "today"                      |
| Raw RRULE beside the schedule                                                  | **retire**      | developer-facing text; keep the human schedule                    |
| Footer "4 series" + the standalone note                                        | **adopt**       |                                                                   |

### Re-confirmed on the fresh capture

- **Imports**: the current build lists all **12** expected columns. The earlier "3 columns" reading was
  baseline rot, as suspected — the row is `adopt as built`.
- **Contacts**: still indistinguishable from the mock apart from the later linked-contact row.

### No mock exists for

`imports-attendance`, `imports-batches`, `event-attendance-dialog`, `settings`.
Those are baselines without a design reference; they cannot be triaged for parity, only reviewed for
consistency with the pattern.

**Correction (2026-11-11):** `series-detail` was listed here in error. `v2-events/04-series-detail.png`
exists and is triaged in the findings below as **R — FR-6/AC-5 unmet**. The mock is unsigned, so it is
a design reference, not a sign-off.

### Still to compare

`v2-shell/12-subscriptions` (member detail tab), `v2-settings/01-date-time-settings`.

## Queued — needs a read before it can be built

1. **Event window aggregates**: upcoming/held counts, attendance percentage, offerings total — either a
   `stats` block on `GET /v1/events` or the FR-29 row in the backlog. Blocks the Events KPI tiles.
2. **Event search**: `q` on `GET /v1/events` covering name, series and event number.
3. **Offering money per event row**: depends on (1).
4. **Roster "Quiet > N days" filter**: confirm `lastCalledOn` is exposed; if not, a `quietDays` filter.
5. **Roster KPI counts**: confirm they can be computed from the returned rows rather than a new read.
6. **Members ministries filter**: a filter on ministries does not exist on `GET /v1/members`.
7. **Per-member attendance ratio**: the members list has no attendance aggregate.
8. **Drag-and-drop upload**: the imports control is choose-file only; a drop zone is a UI change with no
   read behind it.

## Authority and arbitration

| Kind of atom                                         | Authority                                                                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| events, series, offerings, attendance, terms screens | `documents/specs/member-registrations-events-offerings.md` (FR-1…FR-39, AC-1…AC-12)                                                                            |
| chrome, connect, members, imports, shepherding       | `documents/specs/member-registrations-ui.md`                                                                                                                   |
| method and arbitration                               | `documents/specs/mock-parity-screen.md` — one-way, advisory; a confirmed **spec-required** miss forces `REWORK`, a **mock-only** atom is a recorded correction |
| the gate itself                                      | `documents/tickets/v2-events-ui/19-ui-release-gate.md`, folded into this round                                                                                 |

Every atom is labelled **R** (spec-required) or **M** (mock-only) before it is triaged. This is what
`mock-parity-screen.md` calls the claim split, and it is the reason the series-detail gap is a defect
while the events KPI tiles are merely absent.

## Findings — the v2-events set

All seven mocks have a shipped page; the gaps are features, not pages.

| Mock                   | Implementation          | Verdict                                                            |
| ---------------------- | ----------------------- | ------------------------------------------------------------------ |
| `01-events-list`       | `/events`               | drifted — tiles, search, filters and paid amounts are **M**        |
| `02-event-detail`      | `/events/:id`           | drifted — tiles and money cards are **M**; Attach-offering retired |
| `03-series-list`       | `/events/series`        | drifted — tiles and `SER-n` are **M**                              |
| `04-series-detail`     | `/events/series/:id`    | **R — FR-6/AC-5 unmet**: no attendance/offering summary            |
| `05-offerings-landing` | `/events/offerings`     | **superseded** by the MVP landing                                  |
| `06-attendance-rows`   | dialog on `/events/:id` | superset — adopt; the mock's `Absent` is unrepresentable           |
| `07-offering-terms`    | `TermsDialog`           | implemented, **never captured**, so never triaged                  |

Two further gaps found while checking:

- **FR-8/AC-7 entry point.** The flow exists at `/imports/attendance`, but nothing on an event or series
  opens it; the AC's _Given_ assumes the context. Treated as **R**.
- **`TermsDialog` has no capture case**, so `07-offering-terms` cannot be compared at all.

## Build order under this round

1. `TermsDialog` capture case, so the last untriaged mock enters the set.
2. Series detail attendance/offering summary (**R**), with whatever aggregate read it needs.
3. Contextual Import-attendance entry on event and series detail (**R**).
4. Shepherding roster rebuild, then shell, events, members, imports (adopted **M** items only).
5. Refresh each surface's baseline as it lands; never as a bulk PNG commit.

The tag is **not** blocked by these: `v0.1.0-mvp` ships on the working page, and the AC-5 miss is
recorded in the cutover doc rather than glossed over.

## Plan

1. Finish the triage table for the remaining surfaces: member detail (subscriptions tab), settings,
   series detail, and the two imports screens that have no mock.
2. Owner signs the reduced target per surface (path + sha256 in this doc, as `mvp-headcount` does).
3. One build round per surface in the order above, each with e2e assertions for the adopted elements and
   a capture refresh.
4. Queue items below move to `documents/backlog.md` with a "revisit when" for each.

Out of scope: pixel-perfect parity, the retired elements, and any runtime code in this round.

### Backlog queue — one row per page

| Page               | Adopted **M** items to queue                                                             |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Events list        | KPI tiles, search, All·Upcoming·Held filter, per-row paid amount                         |
| Event detail       | KPI tiles, Paid/Pledged/Pending offering cards                                           |
| Series list        | KPI tiles, `SER-n` code                                                                  |
| Series detail      | attached-offerings card, per-occurrence attendance (after the **R** summary)             |
| Members list       | ministries filter, per-member attendance ratio, Include-archived switch, paging controls |
| Imports            | drag-and-drop upload                                                                     |
| Shepherding roster | officer card, five KPI tiles, roster search, quiet filter, member badges, row actions    |

### Acceptance criteria

1. Every mock state in the four unsigned sets appears in the triage table with adopt / retire / queue.
2. Each queued element has a backlog row and a stated prerequisite read.
3. The owner's sign-off for the first surface (Shepherding roster) is recorded with path + sha256.
4. No code changes in this round.
5. Every triage row is re-confirmed against a capture taken from this round's base commit, because the
   committed baselines are stale.

## Verification

| Gate        | Command                | Result                                                                        |
| ----------- | ---------------------- | ----------------------------------------------------------------------------- |
| Triage      | this document          | in progress                                                                   |
| Sign-off    | owner, path + sha256   | pending                                                                       |
| Format/lint | `npm run format:check` | pass                                                                          |
| Local suite | `npm run test`         | 539 passed, 15 skipped; one Windows worker exit `3221226505` (CI is the gate) |

gate-run 2026-11-10T17:29:55.568Z profile=fast steps=3/4 lines=26 bytes=4200

## Review

n/a — planning document; each build round is reviewed on its own.

## Mock sign-off

Pending — the reduced target for the Shepherding roster is the first to sign.

## Mock parity

Pending — the triage table is the parity record until each surface is rebuilt.

## Acceptance

| #   | Criterion                               | Met     | Evidence                      | Verdict  |
| --- | --------------------------------------- | ------- | ----------------------------- | -------- |
| 1   | All unsigned states triaged             | pending |                               | PARKED   |
| 2   | Queued items have backlog rows          | pending |                               | PARKED   |
| 3   | First surface signed with path + sha256 | pending |                               | PARKED   |
| 4   | No code in this round                   | yes     | planning only                 | ACCEPTED |
| 5   | Triage re-confirmed on a fresh capture  | pending | baselines dated 2026-11-05/09 | PARKED   |

## Deviations

- The v2 mocks are treated as layout references, never signed; this round re-signs a reduced target
  rather than pretending the originals were approved.
- The mock's contact column is retired because a later decision (FR-57/Q157) forbids contact values on
  the roster — the mock is not always the higher authority.
