# Round - mock-catalogues-v2

|                     |                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                             |
| Tier                | 2 - Reviewed                                                                                                     |
| Mode                | unattended (auto-accept recommendations)                                                                         |
| Base                | `314a1e3`                                                                                                        |
| Review rounds       | 0                                                                                                                |
| Gate runs in parent | 1                                                                                                                |
| Spec                | `documents/specs/member-registrations-ui.md` (the ACs the catalogues cite); `AGENTS.md` section 17 for auto-sign |
| Workers             | `single`                                                                                                         |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (catalogues, tool, guard, backlog, round doc)                       |

## Plan

Two of the five sets the parity rounds need had no catalogue, so the
[pre-flight](orchestrator-policy.md) could not be met: `v2-events`, `v2-imports` and `v2-settings`. This
round gives each one a catalogue over the states that still have a **live HTML source**, and makes the
auto-sign tool able to sign a fresh `target`.

### Decisions (auto-accepted, unattended)

| #   | Question                                                                | Decision                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which states does a catalogue pin?                                      | Only those with a live HTML source: 3 events, 4 imports, 1 settings. The other nine PNGs came from the retired prototype and cannot be refreshed, shell-checked or re-cut, so pinning them would be a claim no one can keep                                                                                                 |
| 2   | Can a fresh `target` be auto-signed when its hash already matches?      | Yes - a target has no signature to preserve, so the tool signs it whether or not its bytes moved. A `signed` state is still never rewritten                                                                                                                                                                                 |
| 3   | Does the ABSENCE tripwire fire on "no action" inside "no Actions menu"? | No. That was a substring false positive and it blocked AC-50 - the clause that requires the very absence an image proves. Word boundaries now                                                                                                                                                                               |
| 4   | Which ACs does each surface answer for?                                 | The one-verb rule (AC-50) for every page with a mock, plus the ACs of the **governing** spec the surface answers for - `member-registrations-events-offerings.md` for the two event screens and the capture states, not only the UI spec. Each is disposed by a test that exists or deferred against a named backlog anchor |
| 5   | Is a set with fewer than three ABSENT spec controls acceptable?         | Yes, but only as an **advisory** probe (`--allow-short`). The imports and settings sets say so in this doc rather than inventing absence claims                                                                                                                                                                             |

### Scope

- `documents/mock-claims/v2-events.json` - 2 surfaces, 3 states, 9 entries.
- `documents/mock-claims/v2-imports.json` - 2 surfaces, 4 states, 7 entries.
- `documents/mock-claims/v2-settings.json` - 1 surface, 1 state, 2 entries.
- `scripts/mock/sign-unattended.mjs` - a pure `planSignatures` and the target rule; the CLI is a thin
  applier.
- `scripts/round/mock-claims.mjs` - the absence tripwire matches whole words.
- `tests/meta/sign-unattended.test.ts` - the state machine, one case per transition.
- `tests/meta/mock-claims.test.ts` - the plural case that must not trip.
- `documents/backlog.md` - two rows: the deferred behavioural ACs, and the legacy captures with no source.

Acceptance criteria:

1. Each of the three sets validates against the catalogue schema and the reverse AC inventory.
2. No catalogue state is stale, and every state is `auto-signed` with the unattended basis recorded.
3. A `target` is auto-signed even when its bytes match, and a `signed` state is never rewritten.
4. The absence tripwire fires on "no action" but not on "no Actions menu".
5. The nine legacy PNGs are named as outside parity, with the reason, in the backlog.
6. `npm run verify` passes.

## Verification

| Gate            | Command                                                                         | Result                          |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------- |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`                                 | 77 passed                       |
| Auto-sign tool  | `npx vitest run tests/meta/sign-unattended.test.ts`                             | 8 passed                        |
| Shell guard     | `node scripts/mock/shell-check.mjs`                                             | 19/19 carry the shell           |
| Auto-sign       | `node scripts/mock/sign-unattended.mjs --list v2-events v2-imports v2-settings` | 0 to sign, 8 unchanged, 0 stale |
| Full gate       | `npm run verify`                                                                | see the signature               |

## Mock sign-off

No mock image changed: the eight states below already carried the shell (19/19 by `shell-check`) and the
FR-9a action rows. They moved from `target` to **`auto-signed`** so this round's pre-flight holds, and are
listed here with their hashes for the reviewer's second look (AGENTS.md section 17). `signed` still means
the owner, and nothing here overrides a signature.

| Set / state                         | Mock                                               | sha256                                                             |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| `v2-events/event-detail-series`     | `mockups/v2-events/08-event-detail-series.png`     | `f3eff2fc4187200d4bded78c225b4a9a5d488b3fc352d19d91a7fb7ea00b469e` |
| `v2-events/event-detail-cancelled`  | `mockups/v2-events/09-event-detail-cancelled.png`  | `b2aacb101e87b9ae3686d497d4bf62c3b267bc981dd09e32ce092272cb854422` |
| `v2-events/series-detail`           | `mockups/v2-events/04-series-detail.png`           | `070bbe649d0d19a04d9ba3b439f3b1514442e19ce16bc9c37321ed678a72a40c` |
| `v2-imports/attendance-live`        | `mockups/v2-imports/02-attendance-live.png`        | `4abf39a93eaac85f2f7bf0115f163db551833490325eb1ec65e485117c8b74f5` |
| `v2-imports/attendance-ended`       | `mockups/v2-imports/03-attendance-ended.png`       | `287aac46b226dd47409e25c68e080be3b7e281fb604a852f7f2843c9512b01ce` |
| `v2-imports/attendance-past-open`   | `mockups/v2-imports/04-attendance-past-open.png`   | `3072ed27e89886a9d8f017cc30ed051a0f5197c96bf01eba8102c5ef065963b9` |
| `v2-imports/attendance-not-started` | `mockups/v2-imports/05-attendance-not-started.png` | `64b2e8e9afbf0f1522ea10c7cddb695f044ae08b9abbaa324126509db5c4de6e` |
| `v2-settings/date-time-settings`    | `mockups/v2-settings/01-date-time-settings.png`    | `a438472b5a9954f2ed1b0ba0bf0874ba9f82276c367ad24c5e1bd69f8816d0b3` |

Two of these need the reviewer's eye specifically: `v2-events/series-detail` is `04-series-detail.png`
captured from `08-series-detail-entry.html` (refresh in place, never a duplicate), and `v2-settings` has no
page action row at all, so AC-50 is not claimed for it.

gate-run 2026-11-15T07:22:28.185Z profile=full steps=7/7 lines=7 bytes=1054

## Mock parity

| Set         | Surfaces | States | Entries | Claimed | e2e-only | Deferred | Probe         |
| ----------- | -------- | ------ | ------- | ------- | -------- | -------- | ------------- |
| v2-events   | 2        | 3      | 9       | 2       | 5        | 2        | full          |
| v2-imports  | 2        | 4      | 7       | 1       | 0        | 6        | advisory only |
| v2-settings | 1        | 1      | 2       | 1       | 0        | 1        | advisory only |

No state has a baseline yet, so nothing pairs until each surface's parity round captures one. That is
the parity round's first step, not a gap in the catalogue.

## Review

| Round | Seat                                  | Verdict                                                                                                                                      |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `ollama-cloud/deepseek-v4-pro` (0813) | REWORK - 1 P1 (the events surfaces cited only the UI spec and left the governing events/offerings ACs outside the denominator), 2 P2, 2 nits |

**Standards:** the artifacts follow the tree's shape - JSON validated by the existing guard, no new
dependency, tests that assert the emitted plan rather than internals. **Spec:** the round was sound but
the events catalogue under-declared; the P1 was right and is fixed by citing
`member-registrations-events-offerings.md` and disposing AC-3, AC-4a, AC-5, AC-6, AC-7 and AC-10.

Fixes: the events surfaces now declare both specs and dispose six content ACs; the imports attendance
surface declares the capture-state AC (AC-7a) and AC-18/AC-19 as well; AC-28 was dropped from
series-detail, where the cited test covered only the series half and the ministry half was never
claimed; and the auto-signed re-cut carries a comment tying it to section 17.

Seat: consistent - the Implementer row names the parent for every file, the Deviations section carries
the Tier 2 parent-authored reason, and the reviewer seat stood outside the author.

## Acceptance

| #   | Criterion                                                     | Verdict  | Evidence                                                                      |
| --- | ------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| 1   | Three catalogues validate                                     | ACCEPTED | `tests/meta/mock-claims.test.ts` 77 passed                                    |
| 2   | No stale state; all auto-signed with the basis                | ACCEPTED | `--list` reports `0 · 8 unchanged · 0 stale`; each carries `by: "unattended"` |
| 3   | A target signs at any hash; a signed state is never rewritten | ACCEPTED | `tests/meta/sign-unattended.test.ts` 8 passed                                 |
| 4   | The tripwire fires on the phrase, not the plural              | ACCEPTED | the new plural case in `tests/meta/mock-claims.test.ts`                       |
| 5   | The nine legacy captures are recorded                         | ACCEPTED | `documents/backlog.md` "Legacy v2 mock captures with no live source"          |
| 6   | `npm run verify` passes                                       | ACCEPTED | gate-run signature above                                                      |

## Deviations

- Tier 2 parent-authored: the catalogues are spec-derived authoring where the decision is which AC a
  surface answers for; that judgement came from reading the spec, the mocks and the test tree in this
  session, so the parent wrote it and the reviewer seat stays independent.
- The reviewer's P1 changed the shape of the events catalogue rather than its wording: the two event
  screens answer to `member-registrations-events-offerings.md`, and the first draft had silently
  narrowed them to the UI spec's one-verb rule.
- Nine screens are outside mock parity because their PNGs have no live source. The backlog row names
  each one; rebuilding them is a mock-build round, not a parity round.
- `v2-imports` and `v2-settings` can be probed only with `--allow-short`: neither has three ABSENT
  spec controls that are genuinely visible. Recorded rather than manufactured.
