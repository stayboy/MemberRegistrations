# Round - r4b-i-extract-workspace

|                     |                                                                                 |
| ------------------- | ------------------------------------------------------------------------------- |
| Status              | OPEN                                                                            |
| Tier                | 1 - Plan                                                                        |
| Mode                | unattended (auto-accept recommendations)                                        |
| Base                | `68cde77`                                                                       |
| Review rounds       | 1 - read as part of the R4b-ii brief                                            |
| Gate runs in parent | 1                                                                               |
| Spec                | `member-registrations-ui.md` FR-33..FR-41 (the import contract)                 |
| Workers             | `single`                                                                        |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (move, import rewiring, round doc) |

## Plan

R4b-i is a **move, not a redesign**. The attendance workspace leaves `pages/` for
`ui/src/features/attendance-import/`, so the page and (next) the session-row panel can both mount it.
The page still renders it, every test is unchanged, and no behaviour moves.

That is deliberate: the last two reviews both found a ported control that recomputed a rule instead of
calling it. A move whose diff is a move is one a reviewer can check by comparing rather than by judging.

### Scope

- `ui/src/features/attendance-import/AttendanceWorkspace.tsx` - new: the workspace, its props, its styles
  hook, and the three helpers the page still needs (`KIND`, `EVENT_LIMIT`, `errorMessage`) exported.
- `ui/src/pages/ImportsAttendancePage.tsx` - keeps its queries, its `PageFrame` and its route; imports the
  workspace instead of owning it.

Acceptance criteria:

1. No behaviour changes: the same tests pass, with the same counts.
2. The page still renders the import flow, picker included.
3. The feature module owns the styles hook, so there is one copy.
4. `npm run verify` and `npm run ui:e2e` pass.

## Verification

| Gate      | Command           | Result               |
| --------- | ----------------- | -------------------- |
| UI unit   | `npm run ui:test` | 41 files, 440 passed |
| e2e       | `npm run ui:e2e`  | 62 passed            |
| Full gate | `npm run verify`  | see the signature    |

gate-run 2026-11-15T17:38:51.535Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

No mock changed; the import flow this move relocates is exercised by the same tests, and the surface it will be mounted on is the signed activity detail.

| Surface                 | Mock                                            | sha256                                                           | Signer     | Date       | Verdict     |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------- | ---------- | ---------- | ----------- |
| /events/:id?kind=series | mockups/v2-events/03-activity-detail-series.png | cccb700124cbe07ce8ae62e7b2425d58fb7167121f6bc3a82a135b3d1e1af2af | unattended | 2026-11-15 | auto-signed |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

n/a - no claim changed.

## Review

| Round | Seat                                  | Verdict                                                                                                                       |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | read with R4b-ii - a move cannot be judged apart from the mount that follows it, and the brief for that round names this diff |

Seat: consistent - the Implementer row names the parent, and the reviewer reads the move and the mount as
one delta in R4b-ii.

## Acceptance

| #   | Criterion                       | Verdict  | Evidence                                                         |
| --- | ------------------------------- | -------- | ---------------------------------------------------------------- |
| 1   | No behaviour changes            | ACCEPTED | 440 unit and 62 e2e, the same counts as before the move          |
| 2   | The page still renders the flow | ACCEPTED | the page imports `AttendanceWorkspace` and passes the same props |
| 3   | One styles hook                 | ACCEPTED | `useStyles` lives in the feature and is exported                 |
| 4   | Gates pass                      | ACCEPTED | `verify` signature                                               |

## Deviations

- Tier 1: a move with import rewiring, no behaviour. The reviewer reads it with R4b-ii rather than in
  isolation, because the value of the move is only visible in what mounts it.
- The move needed three passes to narrow the two import blocks; TypeScript's unused-import errors drove
  each pass, and no logic changed in any of them.
