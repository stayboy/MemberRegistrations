# Round - roster-eleven-columns

|                     |                                                                                  |
| ------------------- | -------------------------------------------------------------------------------- |
| Status              | OPEN                                                                             |
| Tier                | 1 - Plan                                                                         |
| Mode                | unattended (auto-accept recommendations)                                         |
| Base                | `047b6e2`                                                                        |
| Review rounds       | 0                                                                                |
| Gate runs in parent | 1                                                                                |
| Spec                | `member-registrations-ui.md` FR-59, FR-59a, AC-35a; shell 4.2                    |
| Workers             | `single`                                                                         |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (build pin, mock re-cut, round doc) |

## Grill

1. **Does the roster keep all eleven columns or drop two to fit 1440 px?** Recommendation: keep them and
   pin the actions column. Cost: the table scrolls at the design's own frame, and the mock has to show it.
2. **Does the mock gain the columns or does the spec lose them?** Recommendation: the mock gains them -
   FR-59a names `latestFeedback` and `latestIssue`, so the mock was behind the spec. Cost: a re-cut of the
   largest mock in the set.

## Plan

The comparison pack found that the build draws eleven columns and the mock nine, and that the actions
column fell outside the visible area at 1440 px. FR-59a requires the two missing fields, so the build was
right and the drawing was short.

### Scope

- `ui/src/pages/shepherding-styles.ts` - the roster table keeps its 1560 px minimum and pins the trailing
  actions column, so `Log call` and the overflow are reachable without scrolling.
- `mockups/v2-shell/08-shepherding-roster.html` - the two columns, the scroll and the pinned edge.

Acceptance criteria:

1. The roster's actions are visible at 1440 px without scrolling.
2. The mock draws the eleven columns the spec requires.
3. The re-cut state is signed and nothing is stale.
4. `npm run verify` and `npm run ui:capture` pass.

## Verification

| Gate        | Command                                                         | Result                               |
| ----------- | --------------------------------------------------------------- | ------------------------------------ |
| Captures    | `npm run ui:capture`                                            | 21 passed                            |
| Stale audit | `node scripts/mock/sign-unattended.mjs --list <all seven sets>` | 0 to sign, 54 unchanged, **0 stale** |
| Full gate   | `npm run verify`                                                | 7/7 steps                            |

gate-run 2026-11-15T21:59:07.764Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

One state re-cut and **auto-signed**.

| Surface        | Mock                                         | sha256                                                             | Signer     | Date       | Verdict     |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| officer roster | `mockups/v2-shell/08-shepherding-roster.png` | `098a2999ccf4e380b17228e6ce9b984d19887b08cf39e49b013722770b8a0647` | unattended | 2026-11-15 | auto-signed |

| Set / state       | sha256                                                             |
| ----------------- | ------------------------------------------------------------------ |
| `v2-shell/roster` | `098a2999ccf4e380b17228e6ce9b984d19887b08cf39e49b013722770b8a0647` |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

| Row | Finding                                       | Resolution                       |
| --- | --------------------------------------------- | -------------------------------- |
| 13a | actions outside the visible area at 1440 px   | **build pins the column**        |
| 13b | mock draws nine columns, spec requires eleven | **mock re-cut**                  |
| 13c | column order, status header, chip counts      | still open; a reader routes them |

## Acceptance

| #   | Criterion                                 | Verdict  | Evidence                                                    |
| --- | ----------------------------------------- | -------- | ----------------------------------------------------------- |
| 1   | Actions visible at 1440 without scrolling | ACCEPTED | the re-captured baseline shows Log call and the menu pinned |
| 2   | The mock draws eleven columns             | ACCEPTED | the re-cut capture                                          |
| 3   | Signed, nothing stale                     | ACCEPTED | `0 to sign, 54 unchanged, 0 signed-but-stale`               |
| 4   | Gates pass                                | ACCEPTED | 21 captures, `verify` signature                             |

## Deviations

- Tier 1: one style object, one mock re-cut.
- **The mock's re-cut is structural, not finished.** The rows are taller than the design's rhythm and the
  pinned edge has no divider, because the cells were inserted mechanically. It is accurate about the
  columns and the pinning, and it is on the second-look list rather than presented as a finished drawing.
- Column order, the status header and the chip counts remain in the pack as differences for the owner.
