# Round - date and time display (18c)

|        |                                              |
| ------ | -------------------------------------------- |
| Status | OPEN                                         |
| Tier   | 2 - Reviewed                                 |
| Mode   | `attended`                                   |
| Base   | `f3aa86f`                                    |
| Spec   | `documents/specs/ui-date-time-formatting.md` |
| Ticket | 18c                                          |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

One formatter for every API date and time value, and a display preference the officer can change.

- **Value kinds.** Instants (`archivedAt`, `createdAt`, `updatedAt`, call and batch timestamps) convert
  from UTC to the reader's zone and carry the UTC instant in a tooltip; calendar dates (`dob`,
  `joinedOn`, session dates, `calledOn`, `assignedOn`, `effectiveFrom`/`endsOn`, exception dates) are
  formatted in UTC at noon and never shift; wall-clock times (`startTime`, `endTime`, `sessionTime`)
  stay as scheduled and are labelled with the event's IANA zone.
- **Preference.** `{ dateStyle, timeCycle }`, default `locale`, persisted under `mr.datetime.v1`,
  validated on read, exposed through one provider and `useDateTimeFormat()`.
- **Surfaces.** One **Date and time** entry in the sidebar footer above Appearance, opening the full
  settings menu (no inline dropdowns); a Settings panel with `RadioGroup`s and a live preview.
- **Audit.** Every render site moves to the bound formatter; `formatTimestamp`, both
  `toLocaleString()` calls and the date-only rendering of `archivedAt` disappear.

## Spec review (skill Procedure step 1b)

`ollama-cloud/deepseek-v4-pro:0813`, separate session, 2026-11-05.

- **First pass: CHANGES REQUIRED.** The spec named the `dmy`/`mdy` order but not the locale pin that
  makes it true; it never reconciled FR-76/AC-41's compact attendance cell with the preference; it
  cited FR-12 (the connect form) instead of FR-76; and the mock-parity table reported below-bar rows as
  firm.
- **Applied:** `dmy` pinned to `en-GB` and `mdy` to `en-US`; the attendance annotation recorded as the
  single documented exception; citations corrected; the parity table marks below-bar rows and the
  narrative confirms them by eye.
- **Second pass: ACCEPT** on the reviewed text, sha256
  `9160c944840f82c44b93e0741943ad992d7aef027a609e08c74d4c5e33136ab0` (taken before the review record
  row was added).

## Verification

| Gate                              | Command                                | Result                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| UI tests                          | `npm --prefix ui run test`             | pass - 24 files, 269 tests              |
| Typecheck / lint / build / format | `npm --prefix ui run ...`              | pass                                    |
| Root tests (serialized)           | `npx vitest run --no-file-parallelism` | pass - 17 files, 206 passed / 3 skipped |

## Code review

`ollama-cloud/deepseek-v4-pro:0813`.

- **First pass: CHANGES REQUIRED.** No P1. Two P2: the event's IANA zone was not attached to the
  wall-clock times, and the UI spec still stated the old "never shifts" rule. Five nits: `iso`
  fallthrough, a missing wall-clock `locale` test, option metadata exported from a component, a dual
  tooltip, controlled `open` with `openOnContext`.
- **Applied:** the Times row and the session headers carry the event zone; `member-registrations-ui.md`
  now states the three kinds with a changelog line; `iso` is explicit; the missing cycle test added;
  the option metadata moved to `format/datetime.ts`.
- **Second pass: ACCEPT.** No P1/P2; two informational nits left — the single-session attendance dialog
  and the import session label show the time without repeating the zone, where the surrounding context
  already establishes it.

## Acceptance

| #   | Criterion                                                                                                           | Met      | Evidence                               |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------- |
| 1   | One module with a function per value kind; calendar dates cannot shift                                              | yes      | `format/datetime.ts`, zone-proof tests |
| 2   | A validated `mr.datetime.v1` preference, one provider and hook; no direct `Intl`/`toLocaleString`                   | yes      | `DateTimeProvider`, audit              |
| 3   | Instants convert and carry the UTC tooltip; dates do not shift; wall-clock times stay scheduled with the zone       | yes      | audit map; event zone labels           |
| 4   | One sidebar entry above Appearance opening the full menu; no inline dropdowns                                       | yes      | `DateTimeMenu`, `Sidebar`              |
| 5   | Settings panel with the same choices and a live preview                                                             | yes      | `SettingsPage`                         |
| 6   | The audit removes `formatTimestamp`, both `toLocaleString()` calls and the date-only `archivedAt`                   | yes      | grep clean                             |
| 7   | Tests pin zones for instants, prove calendar dates zone-proof, cover every style and cycle, and validate the parser | yes      | `datetime.test.ts`                     |
| 8   | Browser behaviour left to ticket 19                                                                                 | deferred | the UI gate owns it                    |

Verdict: **ACCEPTED**.

## Deviations

- **The members-grid attendance annotation is the one documented exception** — it keeps FR-76/AC-41's
  compact `4/5 (26-Oct-26)` and does not follow the preference.
- **Two zone-label nits** remain informational: the attendance dialog and the import session label show
  a time without repeating the zone, where the parent context already names it.
- **Mock parity rows below the 0.80 bar** (c01, c03, c06) are confirmed by eye and marked as such.
- Pixel-level mock parity and browser behaviour stay with ticket 19.
