# Round — capture-contract-truth

|                     |                                                      |
| ------------------- | ---------------------------------------------------- |
| Status              | OPEN                                                 |
| Tier                | 1                                                    |
| Mode                | attended (owner: "all as recommended", 2026-11-11)   |
| Base                | `7b37f1f`                                            |
| Review rounds       | 0 (Tier 1: spec review only)                         |
| Gate runs in parent | 0                                                    |
| Spec                | API §Imports/§Headcounts, UI FR-37, events FR-6f     |
| Workers             | `single`                                             |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (all files) |

## Plan

Three stale claims about the capture model, all contradicted by the build after round B:

1. `DuplicateImportError` has no thrower and no route can answer it, but the class, its
   `problem.ts` mapping, the OpenAPI `409` on the attendance import and the UI spec's FR-37 clause all
   still promise it. A live capture may repeat, so the promise is false.
2. `ui/src/api/events.ts` types `capture` optional although the server always sends it (nullable), so
   every reader writes a fallback that hides a server regression.
3. The headcount page offers **End of session** disabled in every non-live state; the import page hides
   it except when ended. §Headcounts says the headcount follows the import capture, so the page is the
   defect.

Scope: remove the error class, its mapping, the OpenAPI `409` and the FR-37 duplicate clause (with a UI
changelog line); make `capture` required-nullable and fix the fixtures; drive the headcount action from
`endActionState`, drop the "a headcount is recorded" precondition, and state the three action states in
§Headcounts (with a changelog line); add the e2e assertion that the not-live state offers no action.

Acceptance criteria:

1. No `DuplicateImportError` remains in `src/`; the attendance import documents no `409`; the UI spec
   says a repeat capture is accepted; no API test expects the duplicate error.
2. `EventSessionItem.capture` is required-nullable and `ui` typechecks with `capture: null` fixtures.
3. The headcount page offers End only while live, shows it disabled when ended, and hides it otherwise
   — the same three states as the import page (`endActionState`).
4. §Headcounts states those three states and that a close needs no recorded headcount.
5. `verify`, `ui:test` and `ui:e2e` pass.

## Verification

| Gate   | Command           | Result                                                               |
| ------ | ----------------- | -------------------------------------------------------------------- |
| Verify | `npm run verify`  | pass — skill/check-round/format/lint/typecheck/test/build, 7/7 steps |
| UI     | `npm run ui:test` | 417 passed (39 files)                                                |
| E2E    | `npm run ui:e2e`  | 66 passed, including the not-live headcount offers no End action     |

gate-run 2026-11-11T21:16:32.013Z profile=full steps=7/7 lines=7 bytes=789

## Review

Tier 1: no independent code review. The spec review for the §Headcounts sentence is the owner's
accepted grill answer of 2026-11-11; the change is a deletion of dead claims plus one affordance
alignment.

## Mock sign-off

| Surface                                       | Mock                                          | sha256                                                             | Signer                         | Date       | Verdict |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------ | ---------- | ------- |
| Headcount — not live, no End action           | `mockups/headcount/14-headcount-not-live.png` | `aaaeae94ecfe230dd5d731dd3c90c6ee09d55dc6988e1cf33f1e3fddf7ee118c` | owner (auto-accepted: matched) | 2026-11-12 | signed  |
| Headcount — ended, actions disabled (redrawn) | `mockups/headcount/13-headcount-ended.png`    | `02b4cd5060731b4a3bc8ea22cfba73a5d0794ffacffe9f9bc253fe799eabf143` | owner (auto-accepted: matched) | 2026-11-12 | signed  |

Auto-accept basis (owner, 2026-11-12): a mock whose rendered state matches the spec is accepted without a
round-trip; only building a new mock needs the owner. `10` (live) and `11`/`12` are unchanged and keep
their 2026-11-11 hashes.

## Mock parity

n/a — no mock beyond the signed set above; the two rows the import set owns were corrected in
`attendance-capture-model.md` (the `03` redraw).

## Acceptance

| #   | Criterion                                                            | Evidence                                                                       |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | No `DuplicateImportError`; no import `409`; UI spec accepts a repeat | `src/errors/*`, `src/openapi.ts`, `documents/specs/member-registrations-ui.md` |
| 2   | `capture` is required-nullable and the UI typechecks                 | `ui/src/api/events.ts`; `ui` typecheck                                         |
| 3   | Headcount End follows the import's three states                      | `ui/src/pages/ussd/UssdHeadcountPage.tsx` (`endActionState`)                   |
| 4   | §Headcounts states the three states and that no count is required    | `documents/specs/member-registrations-api.md` §Headcounts                      |
| 5   | Gates pass                                                           | 7/7 at 21:16:32.013Z, 417 unit, 66 e2e                                         |

**ACCEPTED** (2026-11-11), pending only the owner's merge verb.

## Deviations

- The UI's defensive `isDuplicateImport` helper stays: it recognises a `409` that can no longer be
  produced and renders a message that will never show. Removing it would widen the diff for no
  behaviour; the spec clause is what changed.
- **Mock ordering deviation.** The mock was due before the first code commit; the commit existed
  locally but was unpushed, and the sitting happened before the push. The rendered states were
  auto-accepted as matched (owner rule, 2026-11-12). Recorded rather than glossed: the policy's order
  was not met, the effect was.
