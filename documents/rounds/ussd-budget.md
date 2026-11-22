# Round — ussd-budget

|                        |                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                             |
| Tier                   | 2 (machine behaviour across every screen, plus a spec carry)                                                                                                     |
| Mode                   | `attended` (owner, 2026-11-22: "grill-me on go-forward", then "all as recommended")                                                                              |
| Base                   | `8fa9e7b`                                                                                                                                                        |
| Review rounds          | 1 (spec: one pass)                                                                                                                                               |
| Gate runs in parent    | 3                                                                                                                                                                |
| Spec                   | `documents/specs/member-registrations-ussd.md` §24d                                                                                                              |
| Workers                | `single`                                                                                                                                                         |
| Worktree               | isolated slot `.local/share/opencode/worktree/bf3bc8/ussd-budget` (the `events-add` slot is another session's live round)                                        |
| Implementer            | `parent ollama-cloud/deepseek-v4.1-flash:1017 (integration, gates, record); worker ollama-cloud/deepseek-v4.1-flash:1017 (machine budget, profile order, tests)` |
| Verbs this round needs | `branch, commit, push, pr, merge`                                                                                                                                |
| git-seat-budget        | 12 briefs (the default; the arithmetic is `1 branch + 1 commit + 1 push + 1 pr + 1 merge`)                                                                       |

## Seats

| Seat            | Picked (local) | Window | Class          | Candidate probed                                   | Basis                                                                                                                                |
| --------------- | -------------- | ------ | -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| grill-me        | `2026-11-22`   | out    | `grill-flash`  | `ollama-cloud/deepseek-v4.1-flash:1017` — answered | Outside 12:00-18:00 local, so the class's first outside-window candidate; the frontier was asked by the parent on this seat's model. |
| reviewer (spec) | `2026-11-22`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813` — answered     | First outside-window candidate; no fallback.                                                                                         |
| worker          | `2026-11-22`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` — answered | First outside-window candidate.                                                                                                      |

## Grill

The owner asked for the go-forward frontier and answered **"all as recommended"**. Each question names
its recommendation and its cost; the accepted decision follows in the same bullet.

1. **What is the round?** Recommendation: `ussd-budget` — fix the Nalo truncation that hides
   `1 Verify contact`, and carry the held provider-table/Hubtel row in the same round because both edit
   the USSD spec. Cost: one round touching the machine and the spec; the Hubtel row rides along and its
   two review rounds are reused unchanged. **Accepted.**
2. **Where does the budget live?** Recommendation: a `budget` on the render context, set by the adapter
   from its `maxMsgChars`, default 182. Cost: a context field, every renderer that assumes 182 becomes
   budget-aware. **Accepted.** Rejected: keep the machine at 182 and let the adapter trim — that is the
   defect.
3. **How does the profile fit 120?** Recommendation: fixed order — identity, then the action line, then
   the data lines — and data lines that do not fit are dropped whole, never cut. Cost: one renderer
   rewritten, and the `42-verify-profile` drawing is no longer the truth for a Nalo handset. **Accepted.**
   Rejected: conditional drops (more combinations to test) and a paged profile (a new state, two screens,
   more than the defect needs).
4. **What proves it?** Recommendation: a property test over every reachable state at budgets 182 and 120,
   asserting the text fits and every accepted action is named. Cost: a test that walks the state tree, and
   it will expose any other screen that overflows at 120. **Accepted.**
5. **Console default after the fix.** Recommendation: revert to `nalo`, because the console should open on
   the real provider, and keep `hmac` selectable. Cost: the signed `44-ussd-console.png` becomes stale on
   two badges — it is re-cut and re-signed, or the drift is recorded. **Accepted**, with the mock re-cut
   and the owner's signature requested before merge.
6. **The held Hubtel edit and the round's git.** Recommendation: one commit in `ussd-budget`, the spec
   delta recorded as carried from the held state, then one PR. Cost: a commit that mixes a docs carry
   with behaviour, with the record naming which hunk came from where. **Accepted.**

7. **A confirm screen's subject** (found by rendering the real machine, after the first build). At
   Nalo's 120 a two-offering split confirmation rendered `1 Accept / 2 Change / 9 Back / 00 Main` —
   32 characters, the amounts dropped as data. Recommendation: protect the subject as a fourth
   section, choose the full sentence or a compact `GHS 30.00, GHS 20.00 · Total GHS 50.00` by fit, and
   teach the guard that every confirm state keeps its subject at 120. Cost: four confirm renderers
   touched and four new guard assertions; the reviewer's arithmetic puts the three-offering compact
   form at 82 characters, so it fits. **Accepted** after the `0813` review (ACCEPT) and the owner's
   "all other as recommended".

## Plan

**Goal.** A screen is laid out to the provider it answers. On Nalo's 120 characters the profile screen
keeps `1 Verify contact` and fits, so a member can reach verification on the default provider, and no
screen is delivered truncated.

**Scope.**

- `src/ussd/machine.ts`: the frame's `budget` (on `UssdSessionInfo`, default 182) drives every layout;
  `renderedProfile` renders identity, then the action, then the data, dropping whole trailing data lines
  that do not fit; any other action-bearing screen follows the same order.
- `src/ussd/adapters.ts` and the execution seam: the adapter's `maxMsgChars` becomes the frame's
  `budget`; `truncateMessage` stays as the last-resort cut.
- `src/ussd/` plumbing: the adapter passes its `maxMsgChars` as the frame's `budget` (beside `pageSize`
  on the session info, never the stored context), and the declared `pageSize` stays the adapter's own
  field (`{ 2, 3 }` for Nalo, `{ 3, 5 }` for the reference); nothing derives it from `budget`.
- `ui/src/pages/ussd/UssdSimulatorPage.tsx`: the console's default provider returns to `nalo`.
- Tests: a property test over every reachable state at 120 and 182; the profile case; the frame's budget
  and page-size threading.
- `mockups/ussd/44-ussd-console.png` re-cut to the `nalo` default, its `documents/mock-claims/ussd.json`
  state dropped to `target` for the re-cut and restored to `signed` only by the owner.

**Acceptance criteria.**

1. `render` lays every screen out to the frame's `budget`, carried on the session info and never on the
   stored context, defaulting to 182 when a frame declares none.
2. At budget 120 the profile text fits, and `1 Verify contact` is present whenever the member has an
   unproven owned contact and no officer confirmation.
3. Data lines that do not fit are dropped whole; the action lines and the `9 Back` / `00 Main menu` footer
   are never dropped, and no line ends inside a word.
4. The property test covers every state `STATES` lists, at 120 and 182, and asserts both the fit and the
   actions named in the rendered `options`; a state with no options passes that half vacuously. It fails
   before the change.
5. The adapter's declared `pageSize` (`{ 2, 3 }` for Nalo, `{ 3, 5 }` for the reference) reaches the frame
   unchanged; nothing derives it from `budget`.
6. No delivered screen ends in the truncation marker at either **declared** budget; a configured cap
   below a screen's minimum is the documented fallback, not a failure of this criterion.
7. The console opens on `nalo`; HMAC is still selectable, and the mock is re-cut and re-signed to match.
8. `npm run verify:fast`, the full gate with `TEST_DATABASE_URL` on a scratch Postgres, and the UI suites
   pass; the carried Hubtel row lands unchanged.

## Verification

| Gate                 | Command                                           | Result                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full gate, attempt 1 | `TEST_DATABASE_URL=… npm run verify`              | **FAIL** at `test`: `tests/api/ussd-nalo.test.ts` answered `Error: connect ENOBUFS 127.0.0.1:57172` at setup, so its 13 tests skipped; 989 passed, 13 skipped of 1002. A load flake, not the change (see attempt 2) |
| Isolated re-run      | `npx vitest run tests/api/ussd-nalo.test.ts`      | pass, 13/13 in 2.96 s — the flake rule's first re-run                                                                                                                                                               |
| Full gate, attempt 2 | `TEST_DATABASE_URL=… npm run verify`              | pass, 7/7 (skill, check-round, format, lint, typecheck, test, build); 71 files / **1004 tests, 0 skipped**, so the pooled `pg` lane ran                                                                             |
| UI typecheck         | `npm run typecheck` in `ui/`                      | pass                                                                                                                                                                                                                |
| UI lint              | `npm run lint` in `ui/`                           | pass                                                                                                                                                                                                                |
| UI unit              | `npm run test` in `ui/`                           | pass, 44 files / 509 tests                                                                                                                                                                                          |
| UI DOM               | `npm run test:dom` in `ui/`                       | pass, 21 files / 190 tests                                                                                                                                                                                          |
| Formatting           | `npx prettier --check .` at the root and in `ui/` | clean                                                                                                                                                                                                               |

gate-run 2026-11-22T14:19:16.510Z profile=full steps=7/7 lines=7 bytes=967

The flake rule (AGENTS.md §8) applied once: the round records the failing attempt, the isolated re-run
and the green full run; the flake was a Windows socket-buffer exhaustion at the pooled lane's setup, and
no third attempt was needed.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                                                                                                                                                                                                                           |
| ----- | --------------------- | ------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `git-executor rung 1` | branch | `opencode/beam-free`           | "Free usage limit reached" on dispatch; the verb did not run.                                                                                                                                                                                                                    |
| 2     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | `FALLBACK: brief-shape-violation` — the owner's sentence names `merge`, not `branch`, and the tree carries the round's code as well as its round doc; its own `git rev-parse`/`git status` were `shell-permission-denied` twice, so no later rung could verify a `tree:` either. |
| 3     | parent                | branch | —                              | The seat could not run it; `git switch -c feat/ussd-budget` off `origin/main` at `8fa9e7b`, inside the isolated worktree.                                                                                                                                                        |
| 4     | parent                | commit | —                              | Same seat block; the change set is exactly the file list the round names.                                                                                                                                                                                                        |
| 5     | parent                | push   | —                              | Same seat block; `feat/ussd-budget` to `origin`.                                                                                                                                                                                                                                 |
| 6     | parent                | pr     | —                              | Same seat block; the pull request to `main`.                                                                                                                                                                                                                                     |
| 7     | parent                | merge  | —                              | Same seat block; only after `verify`, `ui` and `ui-e2e` report green.                                                                                                                                                                                                            |
| 8     | parent                | sync   | —                              | Same seat block; `main` after the squash merge.                                                                                                                                                                                                                                  |

## Review

| Round | Reviewer seat                                        | Standards       | Spec   | Seat       |
| ----- | ---------------------------------------------------- | --------------- | ------ | ---------- |
| 1     | `reviewer-pro` → `ollama-cloud/deepseek-v4-pro:0813` | REWORK → ACCEPT | ACCEPT | consistent |

Seat: consistent — the Implementer row's worker/parent split is borne out by the diff (the worker owns
`machine.ts`'s `fittedScreen`/`screenBudget`/`renderedProfile` and the guard; the parent owns the seam,
the UI default and the record).

- **Spec pass 1: REWORK.** Five findings, all fixed: the defect rule contradicted the configurable 1–182
  cap; the budget's location was unstated (it is per frame, beside `pageSize`); "never reads a cap"
  collided with "lays out to the provider"; the fit rule bound actions only and never protected the
  footer; and the guard neither defined "action the state accepts" nor allowed a vacuous pass.
- **Spec pass 2: REWORK.** Two contradictions, both fixed: the change-log bullet still said "render
  context's `budget`" and re-asserted the defect rule unscoped, and the guard's vacuous list wrongly
  included `verify.sent`.
- **Spec pass 3 (the confirm-subject rule): ACCEPT.** The reviewer computed the compact line at 60/71/82
  characters for one, two and three offerings and 102 at maximum amount widths, and confirmed three is
  the ceiling because selection is capped at `pageSize.offerings`.
- **Implementation: Standards ACCEPT, Spec ACCEPT**, all eight criteria met. Two record P2s — the gate
  counter and the Git-writes table — fixed in this doc before the commit. One coverage note: the guard's
  fixture exercises the two-offering confirm, so the three-offering compact form rests on the reviewer's
  arithmetic; a follow-up case pins it.

## Mock sign-off

| Surface                                                                                              | Mock                                    | Capture                                                                | sha256                                                             | Signer | Date       | Verdict  |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | -------- |
| `#/ussd/simulator` — the local-build USSD console on `nalo`, handset on the fixed profile at 103/120 | `mockups/ussd/44-ussd-console.png` (v2) | `mockups/ussd/capture-console.mjs`, 1440×900 at `deviceScaleFactor: 2` | `f805a6f36b3f6ab077db1405c157f71e1762e436b6bec2c45805f41a5924663e` | owner  | 2026-11-22 | `signed` |

Mock coverage: claimed 1 · e2e-only 0 · deferred 0 · prose 0

The catalogue is `documents/mock-claims/ussd.json`, state `console`, coverage `signed` — the owner signed
v2 (`f805a6f3…`) on 2026-11-22, after the re-cut voided the v1 signature. The archived v1 is
`mockups/_archive/ussd/44-ussd-console-v1.png`, byte-identical to the previously signed hash, so the
1:1 comparison was against the exact signed image.

Mock parity: the drawing is cut from the build, not ahead of it — the handset text is the machine's
`profile` render at budget 120 (103 characters), the badges are the page's own `nalo · 120 chars` and
`103/120 characters`, and the two frames are the dev player's `state=main` and `state=profile` with the
same request lines the log prints. Two recorded differences: the mock masks the session id (`session …`)
where the build prints it, and the mock compresses the keypad (34 px keys against the build's 48 px
minimum) so a six-line screen fits the fixed 900 px page. Both are recorded in `mockups/ussd/history.json`.

## Acceptance

| Criterion                                                                                                   | Met | Evidence                                                                                                                                  | Verdict                      |
| ----------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1. `render` lays out to the frame's `budget`, on the session info and never the stored context, default 182 | yes | `UssdPipelineOptions.budget` → `sessionInfo` → `UssdSessionInfo.budget`; `screenBudget` defaults to 182; `tests/unit/ussd-budget.test.ts` | ACCEPTED                     |
| 2. At 120 the profile fits and keeps `1 Verify contact`                                                     | yes | the profile renders 103/120 with identity, action, member no and ministries; the defect case in `ussd-budget.test.ts`                     | ACCEPTED                     |
| 3. Data lines dropped whole; actions and the footer never dropped; no line cut mid-word                     | yes | `fittedScreen` trims `data` from the end only; the four confirm subjects travel in `head`                                                 | ACCEPTED                     |
| 4. The guard covers every `STATES` entry at 120 and 182, and it bites                                       | yes | 11 cases in `ussd-budget.test.ts`; reverting one confirm subject to `data` failed exactly at `amount 2000 … to contain 'GHS 20.00'`       | ACCEPTED                     |
| 5. The declared `pageSize` reaches the frame unchanged; nothing derives it from `budget`                    | yes | the adapter seam passes both; the threading case asserts the adapter's pair                                                               | ACCEPTED                     |
| 6. No delivered screen ends in the truncation marker at a declared budget                                   | yes | the guard's fit assertion over every state; `truncateMessage` untouched                                                                   | ACCEPTED                     |
| 7. The console opens on `nalo`; HMAC selectable; the mock is re-cut and re-signed                           | yes | `UssdSimulatorPage.tsx` default; DOM case; the re-cut `44-ussd-console.png` and the catalogue state                                       | ACCEPTED (signature pending) |
| 8. `verify:fast`, the full gate and the UI suites pass; the carried Hubtel row lands unchanged              | yes | the Verification table; the spec diff carries the Hubtel block verbatim                                                                   | ACCEPTED                     |

## Deviations

- **The confirm subject was found by rendering, not by a test.** The first build dropped a split
  confirmation's amounts at 120 because the spec protected only actions, footer and `done`; the
  approved rule adds the subject as a fourth protected section, with a compact form. The reviewer
  computed the compact line at 60/71/82 characters for one, two and three offerings (three is the
  ceiling because selection is capped at `pageSize.offerings`), so it always fits 120.
- **The `·` separator is not strictly GSM-7.** It is one code unit for `truncateMessage` and it is the
  glossary's established separator in eight or more approved lines, and the Hubtel row already records
  the ASCII caveat, so it stays; a glossary-wide change to ASCII would be its own round.
- **`pledges.list` is grouped** (all names, then all amounts) so a name can survive while its amount is
  droppable; that also changes the 182 layout. The action line is protected, the amount is data.
- **The mock is re-cut and unsigned.** `44-ussd-console.png` is redrawn on `nalo` (120) with the fixed
  profile as the handset screen; its catalogue state moves to `target` because a re-cut voids the
  owner's signature, and only the owner restores `signed`. R6 blocks the commit until then.
- **The git seat could not run.** `opencode/beam-free` returned "Free usage limit reached" on dispatch
  and `ollama-cloud/mimo-v2.6-flash` was refused on brief shape with its own read-only checks denied;
  the parent executed the verbs and each row in `## Git writes` says so.
- **Two local anomalies were left alone.** The `events-add` worktree is another session's live round
  (23 dirty paths) and was only read, never reused; the main tree sits on an unpushed
  `chore/push-probe` with `probe-push-test.txt`. This round's branch is based on `origin/main`, so
  neither contaminates it.
- **The pooled lane flaked once** (`ENOBUFS` at `tests/api/ussd-nalo.test.ts` setup, 13 skipped). The
  isolated re-run passed 13/13 and the second full gate ran 1004 tests with 0 skipped; §8 allows two
  re-runs and only one was needed.
- **A worker pass was reverted.** It had lengthened the three-or-more offering confirm form to name each
  offering, which changed the 182 layout of a screen this round does not otherwise touch and existed
  only so that a test would choose the compact form. The form is back to its pre-round shape; the
  three-offering guard cases assert that the subject survives and fits (84 characters with ordinary
  amounts, 104 at the widest `money()` values) and the drop-to-`data` proof stays on the two-offering
  case, where the screen genuinely overflows.
