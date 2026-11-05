# Member identity labels

|         |                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status  | ACCEPTED                                                                                                                |
| Tier    | 2                                                                                                                       |
| Mode    | `attended` (worker; parent owns the branch, review and verification)                                                    |
| Base    | `16d3a53`                                                                                                               |
| Spec    | `documents/specs/member-registrations-api.md`, `member-registrations-ui.md`, `member-registrations-events-offerings.md` |
| Workers | `single`                                                                                                                |

## Plan

Render every member identity as the shared `FullName (Gender, Ny)` label, backed by a derived age and
the `gender`/`age` identity parts on the DTOs that already carry a composed name. The API spec change
log entry, the Member `age` row, the relationship/shepherding paragraphs and the UI FR-22a/AC-11a were
reviewed before implementation; no migration is needed because age is derived and never stored.

1. Add `ageInYears(dob, today)` in `src/domain/age.ts`: completed years at today (UTC); a 29 February
   birthday is reached on 1 March in a non-leap year; null for a missing, invalid or future date.
2. `MemberSummary` (and `MemberDetail`) gain `age`; `RelationshipDto` gains `gender`/`age`;
   shepherding DTOs gain the current `gender`/`age` (roster, officer, member shepherding, shepherd,
   history, assignment); `EventAttendanceRow` and `EventAttendanceEntry` gain `gender`/`age`. Mirror
   every field in the Zod schemas; OpenAPI is generated from them, so no hand edit is needed.
3. Add `memberLabel` (and a composed-name adapter) in `ui/src/format/member.ts`: `undisclosed` and a
   null age are omitted, no placeholders, `otherNames`/`alias`/`maidenName` never add a segment, and
   avatar initials keep plain `memberName`.
4. Apply the label to the members list, contact lookup, detail heading/overview, contacts dialog,
   member picker, relationships, subscriptions policyholder sentence, shepherding roster/officers/
   report and their dialogs, event attendance rows/confirmations, and the archive/purge/end-assignment
   confirmations. Signed-in officer/account menu, breadcrumbs and form inputs stay unchanged.
5. Tests: derived-age unit cases; API age and DTO-shape assertions with relative dates; UI
   `memberLabel`/picker cases; Playwright fixtures and exact-label assertions. No migration.

## Verification

| Gate                             | Command                                | Result                                                                                                                                          |
| -------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                        | `npm run typecheck`                    | pass                                                                                                                                            |
| Lint                             | `npm run lint`                         | pass                                                                                                                                            |
| Test (parallel)                  | `npm run test`                         | flaky in this environment: run 1 had 4 PGlite hook timeouts + 1 timeout; retry exited one worker (0xC0000409). 21/22 files passed on the retry. |
| Test (authoritative, sequential) | `npx vitest run --no-file-parallelism` | pass — 22 files, 289 passed, 3 skipped (292)                                                                                                    |
| Build                            | `npm run build`                        | pass                                                                                                                                            |
| Format                           | `npm run format:check`                 | pass                                                                                                                                            |
| UI typecheck                     | `npm --prefix ui run typecheck`        | pass                                                                                                                                            |
| UI tests                         | `npm --prefix ui run test`             | pass — 25 files, 299 passed (299)                                                                                                               |
| UI build                         | `npm --prefix ui run build`            | pass (existing chunk-size warning)                                                                                                              |
| UI end-to-end                    | `npm run ui:e2e`                       | pass — 46 passed (46), Chromium                                                                                                                 |

`tests/api/contacts-subs-shepherding.test.ts` passed on its own (8/8) after the parallel worker crash.
No mock exists for this round; no mock parity table applies.

OpenAPI spot-check: `buildOpenApiDocument()` emits `gender`/`age` on `MemberSummary` (and therefore
`MemberDetail`), `Relationship`, `Officer`, `RosterEntry`, `MemberShepherding`, the assignment officer/
member pairs, the inline `EventAttendance` rows and `EventAttendanceEntry`; `MemberDetail` keeps `dob`.

## Review

Tier 2 Standards + Spec review by `deepseek-v4-pro:0813`: **ACCEPT**, no P1/P2. Two non-blocking nits:
`ContactsDialog` recovers avatar initials by stripping the label's trailing parenthetical instead of
taking a separate plain name, and a nameless member's number can land inside the label through the
pre-existing `name || memberNo` fallback. Neither changes a contract.

## Acceptance

Accepted by the parent on 2026-11-05 after the Tier 2 review; the spec review and code review are both
ACCEPT. Verification is the authoritative serialized API suite plus the UI unit, build and Playwright
gates. No migration; the USSD display glossary remains part of 24a.

Spec review record: "The member-identity label, derived age, name-only DTO additions and USSD display
glossary are approved for implementation; no remaining blocking points. Pro:0813 ACCEPT."

## Interpretations

- The label is `FullName (Gender, Ny)`; a picker keeps the member number as its tie-breaker
  (`M-1001 — Ama Mensah (Female, 32y)`), never as part of the label itself.
- `memberName` still supplies the name (including the `otherNames` fallback when both name parts are
  blank); `otherNames`, `alias` and `maidenName` never add a separate label segment.
- DTOs that carry a composed `name` (relationship, officer, roster, shepherding history) use
  `memberLabelFromName(name, gender, age)`, which delegates to `memberLabel`.
- The subscription policyholder sentence now reads "The policyholder is {label}." The member number
  remains in the page header and breadcrumb.
- `EventAttendanceEntry` (the manual POST response) gains `gender`/`age` as well as the report row;
  it is not rendered by the current UI because the dialog refetches the report.
