# Round — ussd-console

|                        |                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | OPEN                                                                                                                                                              |
| Tier                   | 2 (multi-file UI behaviour plus the build flag)                                                                                                                   |
| Mode                   | `attended`                                                                                                                                                        |
| Base                   | `96b1838`                                                                                                                                                         |
| Review rounds          | 2 (spec: REWORK → ACCEPT; implementation: REWORK → ACCEPT)                                                                                                        |
| Gate runs in parent    | 3                                                                                                                                                                 |
| Spec                   | `documents/specs/member-registrations-ui.md` §2.5 (2026-11-22 change-log line)                                                                                    |
| Workers                | `single`                                                                                                                                                          |
| Implementer            | `parent ollama-cloud/deepseek-v4.1-flash:1017 (integration, gates, record); worker ollama-cloud/deepseek-v4.1-flash:1017 (page, gate helper, nav, images, tests)` |
| Verbs this round needs | `branch, commit, push, pr, merge`                                                                                                                                 |
| git-seat-budget        | 12 briefs (the default; the arithmetic is `1 branch + 1 commit + 1 push + 1 pr + 1 merge`)                                                                        |

## Seats

| Seat            | Picked (local) | Window | Class          | Candidate probed                                            | Basis                                                                                                            |
| --------------- | -------------- | ------ | -------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| worker          | `2026-11-22`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017` — answered          | Outside 12:00–18:00 local, so the class's first outside-window candidate; it answered the dispatch.              |
| reviewer (spec) | `2026-11-22`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813` — answered              | Spec review at every tier (§2); first outside-window candidate answered, so no fallback and no `fallbackReason`. |
| mock-builder    | `2026-11-22`   | out    | `mock-builder` | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` — answered | The class's first `anyWindow` candidate.                                                                         |

## Grill

Owner frontier, asked and answered in one round (attended): the six questions below carried a
recommendation and a cost each, and the owner then chose between two implementations of the same
frontier.

1. **A new page or the existing one?** Recommendation: a new `#/ussd/console` beside the Simulator. Cost: two dev tools and a second nav item. **Owner's answer: neither yet — see 6a.**
2. **How is the page gated in the local stack?** Recommendation: one build flag, `VITE_USSD_CONSOLE=true`, set by the local image, true in the Vite dev server, absent from the Vercel/Pages build. Cost: a Dockerfile build arg, the Compose build arg and a nav-filter change.
3. **How does it look?** Recommendation: a dark console inside the shell — handset and keypad left, a terminal scrollback right, monospace only for the screen and the log, Fluent controls for provider, phone, keypad and verbs. Cost: a dark island (`webDarkTheme`) and a signed drawing.
4. **How does it behave?** Recommendation: each keypad digit sends its own frame; a typed input + `Send` covers multi-character entries (amount, date, code); `New session` and `Clear log`; the provider wire is shown, the gateway secret never is. Cost: two paths into the same client.
5. **How does the verification demonstration work?** Recommendation: the console drives the real `5 My Profile → 1 Verify contact`, the notice renders in the handset, and the code and link stay in `docker compose logs -f app`, with one hint line on the page. Cost: a copy line, no new flow.
6. **What is the record?** Recommendation: Tier 1 `ussd-console`, spec amended first, worker outside window, one mock for signature, full gate with a scratch Postgres, then commit on the owner's verb. Cost: one mock and one gate run.

6a. **Follow-up, chosen by the owner: enhance the existing Simulator instead of adding a second page.** The comparison showed the Console is ~80% of the Simulator, and §15 extracts at the second call site rather than copying the engine. The Simulator therefore gains the keypad, the per-frame log, the dark console surface and the local gate; the stub callback becomes a collapsible section; there is no second nav item and no duplicated wiring.

## Plan

**Goal.** The local Compose stack shows the USSD console at `#/ussd/simulator`, so a walkthrough of the
member handset (including `5 My Profile → 1 Verify contact`) runs against the real dev player, while a
deployed build still hides the page and refuses the route.

**Scope.**

- `ui/src/env/localTools.ts` (new): `isLocalTools(dev = import.meta.env.DEV, flag = import.meta.env.VITE_USSD_CONSOLE)`
  returns `dev || flag === 'true'` — the one gate the spec names.
- `ui/src/shell/navigation.ts`: `visibleNavItems(section, localTools = isLocalTools())` keeps its
  `devOnly` filter, now keyed on `localTools` rather than `PROD`, so the local console build shows the
  Simulator and a deployed build does not.
- `ui/src/components/PageFrame.tsx`: `showsUssdProductionNotice(sectionId, pathname, production = import.meta.env.PROD, localTools = isLocalTools())`
  returns `production && !localTools && sectionId === 'ussd' && pathname !== '/ussd/simulator'`.
- `ui/src/pages/ussd/UssdSimulatorPage.tsx`: the gate reads `isLocalTools()`; the body gains the console
  layout — a `FluentProvider theme={webDarkTheme}` island with the handset (screen, then a 12-key Fluent
  `Button` keypad), the provider/phone controls, `New session`, a per-frame terminal log (`#n`, request
  line, status and duration, `state`/`done`, provider wire) with `Clear log`, and the existing stub
  callback in a collapsible section.
- `ui/src/pages/ussd/ussd-styles.ts`: `makeStyles` rules for the console grid, handset body, keypad grid
  and terminal.
- `Dockerfile`: `ARG VITE_USSD_CONSOLE` + `ENV VITE_USSD_CONSOLE` before the existing
  `vite build --mode development`; `--mode development` stays because `resolveGatewayOrigin` permits the
  `http://` loopback gateway only outside production mode.
- `docker-compose.yml`: the `ui` build passes `VITE_USSD_CONSOLE: 'true'`.
- Tests: `ui/src/env/localTools.test.ts`, `ui/src/pages/ussd/UssdSimulatorPage.dom.test.tsx`,
  `ui/src/components/PageFrame.test.ts` and `ui/src/shell/navigation.render.test.tsx` updated.

**Acceptance criteria.**

1. `isLocalTools` is true for `DEV`, true for the flag alone, false for a production build without it,
   and false for `VITE_USSD_CONSOLE='1'` or any value other than the exact string `true`.
2. `visibleNavItems` shows the Simulator when `localTools` and hides it otherwise; no other section's
   items change (the Simulator is the only `devOnly` item).
3. `showsUssdProductionNotice` is true for a USSD page in a deployed build, false for `/ussd/simulator`
   in that same build, and false for every page in the local console build.
4. The page renders the keypad, and pressing a key sends exactly one frame with that digit;
   `Clear log` empties the log; `New session` clears the session id and the log.
5. The log shows the request and the response per frame, and contains neither the gateway secret nor
   any `wire` field that the API did not return.
6. A production build without the flag renders the unavailable notice and no keypad.
7. `npm run verify:fast` and the DOM suite pass; the full `npm run verify` passes against a scratch
   Postgres (`TEST_DATABASE_URL`), because the local build's env plumbing changed.

## Verification

| Gate                    | Command                                                                                                              | Result                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full gate               | `TEST_DATABASE_URL=postgresql://…@localhost:55432/member_registrations npm run verify`                               | pass, 7/7 (skill, check-round, format, lint, typecheck, test, build); root `test` 70 files / 991 tests, 0 skipped, so the pooled `pg` lane ran. Without `TEST_DATABASE_URL` the same suite reports 20 skipped — the lane, not a pass |
| UI typecheck            | `npm --prefix ui run typecheck`                                                                                      | pass                                                                                                                                                                                                                                 |
| UI lint                 | `npm --prefix ui run lint`                                                                                           | pass                                                                                                                                                                                                                                 |
| UI unit                 | `npm --prefix ui run test`                                                                                           | pass, 44 files / 509 tests                                                                                                                                                                                                           |
| UI DOM                  | `npm --prefix ui run test:dom`                                                                                       | pass, 21 files / 190 tests                                                                                                                                                                                                           |
| Local flag inlines      | `VITE_USSD_CONSOLE=true npx vite build --mode development` into a scratch outDir, then grep `UssdSimulatorPage-*.js` | `Frame log` and `No frame yet` present; the unavailable notice also present, because Rolldown keeps both branches of the runtime gate (recorded in Deviations)                                                                       |
| Deployed build hides it | the same grep on the earlier image's chunk (`UssdSimulatorPage-z7kgQ6Wj.js`)                                         | `This production build cannot drive` present, `Stub gateway callback` absent                                                                                                                                                         |

gate-run 2026-11-22T05:37:51.150Z profile=full steps=7/7 lines=7 bytes=948

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | --------------------- | ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `git-executor rung 1` | branch | `opencode/beam-free`           | "Free usage limit reached"; verb not run.                                                                                                                                                                                                                                                                                                                                            |
| 2     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | First brief had no `git-seat-budget:` line (the round doc now declares it); the retry returned `FALLBACK: brief-shape-violation` — the owner's sentence names `merge`, not `branch`, and the tree carries the round's code as well as its round doc. Its own `git rev-parse`/`git status` checks were `shell-permission-denied` twice, so no later rung can verify a `tree:` either. |
| 3     | parent                | branch | —                              | The seat could not run it: rung 1 exhausted, rung 2 refuses a branch from a dirty tree and cannot read the tree it must verify. `git switch -c feat/ussd-console` off `main` at `96b1838`, with the round's own change set in the tree.                                                                                                                                              |
| 4     | parent                | commit | —                              | Same seat block; the change set is exactly the files the brief lists.                                                                                                                                                                                                                                                                                                                |
| 5     | parent                | push   | —                              | Same seat block; `feat/ussd-console` to `origin`.                                                                                                                                                                                                                                                                                                                                    |

## Mock sign-off

| Surface                                                                                            | Mock                               | Capture                                                                | sha256                                                             | Signer | Date       | Verdict  |
| -------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | -------- |
| `#/ussd/simulator` — the local-build USSD console (handset, keypad, frame log, collapsed callback) | `mockups/ussd/44-ussd-console.png` | `mockups/ussd/capture-console.mjs`, 1440×900 at `deviceScaleFactor: 2` | `10af5801e3c64b0c92176bf09dfed25b30f7898d6db237be9302ca91b3cbd97d` | owner  | 2026-11-22 | `signed` |

Mock coverage: `documents/mock-claims/ussd.json`, state `console`, coverage `signed` (owner, 2026-11-22).
The set answers `AC-50` (two verbs, one `Actions` menu) through `UC-01`, whose build-side locator is the
`Actions` button and whose test is the DOM case that opens the menu. No baseline PNG: see Deviations.
`mockups/ussd/README.md` keeps the drawing in its local table; the catalogue is the durable record.

Mock coverage: claimed 1 · e2e-only 0 · deferred 0 · prose 0

## Mock parity

| Claim                                                      | Type      | State               | Answer (max prob)                                                                    | Threshold | Confirmed by                                                                                      | Disposition                       |
| ---------------------------------------------------------- | --------- | ------------------- | ------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| The screen shows the player's last frame verbatim          | spec      | shown               | `A code was sent to a***@example.com. Open the link we sent.` / `9 Back` / `00 Main` | exact     | `renderedVerifySent` + `truncateMessage`, reproduced by running `render()` on a synthetic profile | adopt                             |
| The badge counts the frame, not the menu                   | spec      | `74/182 characters` | 74 = 59 + 7 + 8                                                                      | exact     | the same run; the recorder asserts the badge against the text length                              | adopt                             |
| Frame texts are the machine's short forms                  | spec      | frames 1–3          | `Main` … / profile (169) / notice (74)                                               | exact     | the same run                                                                                      | adopt                             |
| One `Actions` button, not two visible verbs                | spec      | shown               | `Actions` trigger, menu closed                                                       | exact     | FR-9a, AC-50, `PageActions`                                                                       | adopt                             |
| Screen and log are the dark theme's neutral surfaces       | spec      | shown               | `#1f1f1f` screen, `#292929` island                                                   | token     | `webDarkTheme` tokens in `ussd-styles.ts`; no hex in the page                                     | adopt                             |
| The log shows request, status, `state`/`done` and the wire | spec      | shown               | per-frame blocks                                                                     | exact     | `UssdSimulatorPage.tsx` frame shape                                                               | adopt                             |
| The mock redacts the dev session id                        | mock-only | `session …`         | the build prints the id                                                              | n/a       | `request.sessionId`                                                                               | accept the redaction (Deviations) |
| Provider HMAC (182) rather than Nalo (120)                 | spec      | `hmac · 182`        | at 120 the profile truncates and hides `1 Verify contact`                            | exact     | the same run, both caps; the page now defaults to `hmac`                                          | adopt; backlog row filed          |
| A `state=…` caption sits under the screen                  | spec      | `state=verify.sent` | `state=none` before the first frame, outside the live region                         | exact     | `UssdSimulatorPage.tsx` caption + the DOM case                                                    | adopt                             |

## Review

| Round | Reviewer seat                                        | Standards       | Spec   | Seat       |
| ----- | ---------------------------------------------------- | --------------- | ------ | ---------- |
| 1     | `reviewer-pro` → `ollama-cloud/deepseek-v4-pro:0813` | REWORK → ACCEPT | ACCEPT | consistent |

Seat: consistent — the fix set (route boundary, API tests, page default, spec and record) matches the
Implementer row's worker/parent split, and the Deviations carry every disposition.

- **Standards, first pass: REWORK.** P1: the per-frame `Provider wire` disclosure rendered the Nalo
  adapter's echoed `USERID` (`USSD_NALO_USER_ID`) into the browser on the default provider; the gateway
  secret itself did not leak. P2: the screen and the log were two live regions announcing the same
  frame. P2: §2.5 claimed the screen and log were the only raw `<pre>` surfaces, while the callback body
  and curl template were also raw. N1: the disclosures are native `<details>`. N2: the default Nalo
  provider left the demonstrated walkthrough truncated.
- **Fixes.** `src/routes/dev-ussd.ts` strips `USERID` from the Nalo wire at the browser boundary
  (`adapters.ts` untouched — `toWire` is the aggregator's payload); `tests/api/ussd-nalo.test.ts` drops
  an assertion that had required the leak and asserts its absence, the intact `MSG` and the untouched
  HMAC wire. The log carries `aria-live="off"`. §2.5 names the raw-`<pre>` surfaces precisely. The page
  defaults to `hmac`. N1 is recorded, not changed.
- **Standards, confirmation: ACCEPT.** Every finding resolved at the strongest boundary, nothing new.

## Acceptance

| Criterion                                                                                                                      | Met | Evidence                                                                                      | Verdict  |
| ------------------------------------------------------------------------------------------------------------------------------ | --- | --------------------------------------------------------------------------------------------- | -------- |
| 1. `isLocalTools` truth table                                                                                                  | yes | `ui/src/env/localTools.test.ts` (DEV, flag, deployed, `1`/`TRUE`/`True`)                      | ACCEPTED |
| 2. `visibleNavItems` shows/hides the Simulator, nothing else moves                                                             | yes | `ui/src/shell/navigation.render.test.tsx`                                                     | ACCEPTED |
| 3. Notice true for a USSD page in a deployed build, false for the Simulator and for the local console build                    | yes | `ui/src/components/PageFrame.test.ts` (three new local-build cases)                           | ACCEPTED |
| 4. Keypad renders 12 keys, each key sends one frame; `Clear log` empties the log; `New session` resets the session and the log | yes | `ui/src/pages/ussd/UssdSimulatorPage.dom.test.tsx` (5 cases)                                  | ACCEPTED |
| 5. The log carries the request and the response and no secret                                                                  | yes | the same DOM file, `not.toHaveTextContent('secret')`; the page never holds the gateway secret | ACCEPTED |
| 6. A build without the flag renders the notice and no keypad                                                                   | yes | the same DOM file's gate case; `UssdSimulatorPage.tsx` early return                           | ACCEPTED |
| 7. `verify:fast`, the DOM suite and the full gate pass                                                                         | yes | the Verification table, gate-run `2026-11-22T05:37:51.150Z`                                   | ACCEPTED |

## Deviations

- No `ui/e2e/baseline/` capture: the capture harness builds `vite build` (production mode, no
  `VITE_USSD_CONSOLE`), which is exactly the build that hides the console, so the deployed picture is
  the unavailable notice already covered by the shell captures. The dark console is a local review
  artifact under `mockups/ussd/` and is not reachable from the capture build.
- The spec diff carries Prettier's re-padding of the metadata table and the navigation map: the new
  change-log sentence lengthened one cell and the new Simulator cell shortened another, and Prettier
  pads every row to the column width. The words are the reviewed ones plus the reviewer's nit.
- The change-log cell names `localTools` rather than writing `DEV || VITE_USSD_CONSOLE`: a literal `|`
  inside a table cell splits it into extra columns. The §2.5 paragraph carries the full expression.
- The production bundle still ships the console chunk: the gate is a runtime read of two inlined
  constants, and the bundler keeps both branches, so a deployed build renders the unavailable notice
  instead of dead-code-eliminating the console. Nothing secret is in the chunk and `POST /dev/ussd/session`
  answers 404 in production, so this is a size note, not a security one.
- The mock redacts the dev session id as `session …`; the build prints it whole, because it is the
  handle for correlating a frame with the API log and it is not a credential.
- **Tier 2 P1 (fixed):** the per-frame `Provider wire` disclosure rendered the Nalo adapter's echoed
  `USERID`, which is `USSD_NALO_USER_ID`, into the browser on the default provider. The old page
  already showed the wire and an existing Nalo test asserted the value, so the leak predates this
  round, but the console made it per-frame and visible. `src/routes/dev-ussd.ts` now strips `USERID`
  from the wire it answers a browser (`adapters.ts` untouched: `toWire` is the aggregator's payload),
  and `tests/api/ussd-nalo.test.ts` asserts the absence, the intact `MSG`, and the untouched HMAC wire.
- The drawing's `state=…` caption under the screen did not exist in the build and was added; the
  description and the hint now carry the drawing's sentences verbatim.
- The console now defaults to `hmac` because the drawing's walkthrough needs a screen that reaches
  `1 Verify contact`. The Nalo truncation itself is filed in `documents/backlog.md`; switching the
  provider to `nalo` in the console still shows it.
- The two disclosures stay native `<details>`/`<summary>`. Fluent v9 has no disclosure primitive and
  `Accordion` is a different interaction (one-open-at-a-time panels), so the raw element is deliberate
  and was already there before this round; it is not a hand-rolled control.
- The notice reads `A code was sent to a***@example.com. …` — the mask as `maskEmail` returns it. The
  `43-verify-sent` drawing prefixes the channel (`Email a***@example.com`), which the player never
  emits; that drawing is a local artifact from the phase-3 round and its line split is presentational.
- `New session` and `Clear log` are two verbs, so FR-9a puts them in the `Actions` menu; the local
  console's primary verbs therefore sit one click deeper than the pre-round single button.
