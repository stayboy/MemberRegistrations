# Round - officers-church-totals

|                     |                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                  |
| Tier                | 1 - Plan                                                                                              |
| Mode                | unattended (auto-accept recommendations)                                                              |
| Base                | `1fd47ff`                                                                                             |
| Review rounds       | 0                                                                                                     |
| Gate runs in parent | 1                                                                                                     |
| Spec                | `member-registrations-ui.md` FR-58, AC-34; `member-registrations-api.md` `GET /v1/shepherding/report` |
| Workers             | `single`                                                                                              |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (page, styles, one DOM test, spec paragraph, round doc)  |

## Grill

1. **The officers page is missing FR-58's totals and coverage. Fix now, or with hardening?**
   Recommendation: now - a spec requirement absent from a shipped screen is a release finding.
   Cost: one round before the sitting.
2. **Where do the seven figures FR-58 names live?** Recommendation: five tiles plus an always-present
   coverage line, with `officers` as the row count and `active` in the sentence. Cost: the spec has to
   say what "show" means, or the next reader counts seven tiles and calls the build short.
3. **Is the coverage line conditional on missing coverage?** Recommendation: no - it is written in both
   states, because a line that only appears with bad news cannot be read as a percentage. Cost: a
   success-intent message bar on a healthy screen.
4. **Fix the column collision in the same round?** Recommendation: yes - it is the same table and the
   same capture. Cost: one more style, and the table's fixed layout has to be understood, not guessed.

## Plan

Comparison pack row 14 found three things on the shepherding officers page: FR-58's church totals and
coverage banner were absent, and the `Assigned` value collided with the officer's identity. The mock
drew all three correctly, so this round brings the build to the drawing.

### Scope

- `ui/src/pages/ShepherdingOfficersPage.tsx` - the report read (`getReport`), the five tiles, the
  coverage line, and the officer cell's width.
- `ui/src/pages/shepherding-styles.ts` - the tile strip and the officer column width.
- `ui/src/pages/ShepherdingOfficersPage.dom.test.tsx` - the totals and coverage cases.
- `documents/specs/member-registrations-ui.md` - FR-58 names the five tiles and the always-present
  coverage line, and the change log records it.

Acceptance criteria:

1. The five totals and the coverage line render from `GET /v1/shepherding/report`, not from summing rows.
2. Coverage is written whether or not members are unassigned.
3. The `Assigned` value no longer collides with the officer's identity at 1440 px.
4. `npm run verify` and `npm run ui:capture` pass; the DOM suite covers both coverage states.

## Verification

| Gate      | Command                                                         | Result                               |
| --------- | --------------------------------------------------------------- | ------------------------------------ |
| Captures  | `npm run ui:capture`                                            | 21 passed                            |
| DOM tests | `npm --prefix ui run test:dom`                                  | 74 passed (72 before; 2 new)         |
| Unit      | `npm --prefix ui run test`                                      | 440 passed                           |
| Stale     | `node scripts/mock/sign-unattended.mjs --list <all seven sets>` | 0 to sign, 54 unchanged, **0 stale** |
| Full gate | `npm run verify`                                                | 7/7 steps                            |

gate-run 2026-11-15T22:45:56.935Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

**No mock was re-cut: the build moved to the drawing.** The officers mock draws the five tiles and the
coverage banner, so this round implements it rather than revising it. The state keeps the hash it had,
and the audit confirms nothing is stale.

| Surface              | Mock                                           | sha256                                                             | Signer     | Date       | Verdict                 |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------------------- |
| shepherding officers | `mockups/v2-shell/07-shepherding-officers.png` | `f231f0f6e680dba590dcc1a32a798513f3e29c4087d94cf9147e2333a6da9af3` | unattended | 2026-11-15 | auto-signed (unchanged) |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

| Row | Finding                                                             | Resolution                                                                                       |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 14a | five church totals absent                                           | **build gains the tiles** (FR-58)                                                                |
| 14b | coverage banner absent                                              | **build gains the line, in both states**                                                         |
| 14d | `Assigned` collides with the officer identity                       | **fixed** - the width sits on the header cell, which is what a fixed layout reads                |
| 14e | the mock's nav is the pre-consolidation one (`Attendance`, no USSD) | **owed** - the mock has no live source, so it cannot be re-cut in place; recorded in the backlog |

## Acceptance

| #   | Criterion                                     | Verdict  | Evidence                                                       |
| --- | --------------------------------------------- | -------- | -------------------------------------------------------------- |
| 1   | Totals and coverage come from the report read | ACCEPTED | `getReport` + the DOM case asserting 142/1054 from the fixture |
| 2   | Coverage written in both states               | ACCEPTED | the second DOM case; the capture shows the 100 % sentence      |
| 3   | No collision at 1440 px                       | ACCEPTED | the re-captured baseline                                       |
| 4   | Gates pass, both coverage states covered      | ACCEPTED | 21 captures, 74 DOM, 440 unit, gate-run signature              |

## Deviations

- The first attempt gave the body cell a `minWidth`; nothing changed, because Fluent's table lays out
  fixed and reads the column width from the header row. The capture said so; the typecheck did not.
- The coverage line is a `MessageBar` in both states, `warning` when members are unassigned and
  `success` when none are. That is a judgement call about a healthy screen, recorded here.
- The officers mock's nav remains the pre-consolidation one. It is an image-only state with no live
  source, so it is not re-cut here; the backlog carries it.
- Three unrelated baselines (`members-list`, `shell-mobile`, `shepherding-roster`) moved by a handful of
  bytes on the capture run and were reverted: they are rendering jitter, not change. Only the officers
  capture is committed. Worth a lesson of its own - a capture step that rewrites untouched images makes
  "what changed" a diff-reading exercise rather than a picture-reading one.
