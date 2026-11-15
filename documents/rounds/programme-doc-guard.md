# Round - programme-doc-guard

|                     |                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                          |
| Tier                | 1 - Plan                                                                                      |
| Mode                | unattended (auto-accept recommendations)                                                      |
| Base                | `93f3695`                                                                                     |
| Review rounds       | 0                                                                                             |
| Gate runs in parent | 2                                                                                             |
| Spec                | `documents/rounds/mvp-local.md` (the release's definition of done); `scripts/check-round.mjs` |
| Workers             | `single`                                                                                      |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (guard, test, programme doc, round doc)          |

## Plan

The release's definition of done had been uncorrectable for weeks: `check-round` treats every changed
`documents/rounds/*.md` as a round doc, so editing `mvp-local.md` demanded a tier, a seat and a
`gate-run` signature it can never have. The backlog carried the row.

That matters now because the definition is stale in three of its seven items — it still names a USSD
Headcount page the consolidation retires, orders the parity builds against screens that no longer exist,
and leaves the runbook's routes unmentioned. A release can pass against a stale definition, which is the
same failure the mock work was correcting one level up.

### Scope

- `scripts/check-round.mjs` - a named programme-doc list, and `isRoundDoc` exported so the exemption is testable.
- `tests/meta/check-round.test.ts` - the programme doc is not a round doc; a real one still is.
- `documents/rounds/mvp-local.md` - items 3, 5 and 7 restated; three `Current state` rows corrected.
- `documents/backlog.md` - the "Programme docs cannot be edited" row closes.

Acceptance criteria:

1. Editing `mvp-local.md` passes `check-round`.
2. A real round doc without a signature still fails it.
3. Item 5 names the consolidated surfaces and the parity scope that is claimable.
4. Item 3 no longer implies an operator headcount page.
5. `npm run verify` passes.

## Verification

| Gate       | Command                                         | Result    |
| ---------- | ----------------------------------------------- | --------- |
| Guard unit | `npx vitest run tests/meta/check-round.test.ts` | 56 passed |
| Full gate  | `npm run verify`                                | 7/7 steps |

gate-run 2026-11-15T14:57:31.820Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

n/a - no mock and no surface changed.

## Mock parity

n/a - no claim changed.

## Acceptance

| #   | Criterion                                                             | Verdict  | Evidence                                                                                                    |
| --- | --------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Editing the programme doc passes the guard                            | ACCEPTED | `check-round --files documents/rounds/mvp-local.md` reports 0 round docs                                    |
| 2   | A real round doc without a signature still fails                      | ACCEPTED | `isRoundDoc` test plus the existing signature rule                                                          |
| 3   | Item 5 names the consolidated surfaces and the claimable parity scope | ACCEPTED | the amended item lists eight surfaces plus the five shell states, and names the nine screens outside parity |
| 4   | Item 3 no longer implies an operator headcount page                   | ACCEPTED | it names the USSD **channel** and the session row                                                           |
| 5   | `npm run verify` passes                                               | ACCEPTED | gate-run signature above                                                                                    |

## Deviations

- Tier 1: a guard exemption, its test and the programme doc. The guard is gate tooling, but the change
  narrows one classifier by name rather than changing a rule, and the new test pins both directions.
- The `@ts-expect-error` on the guard's import moved to a namespace import: Prettier reflowed the
  multi-line destructure and left the directive covering the wrong line, which the typecheck caught.
