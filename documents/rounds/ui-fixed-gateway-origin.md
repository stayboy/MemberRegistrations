# Round - ui-fixed-gateway-origin

|                     |                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Status              | CLOSED - merged in #101 at `476f842`; branch deleted                                       |
| Tier                | 2 (sign-in path, CSP, storage)                                                             |
| Mode                | attended (owner answered two grill rounds)                                                 |
| Base                | `bd3ed08`                                                                                  |
| Review rounds       | 2 before the merge (REWORK, ACCEPT) plus 1 post-hoc seat-valid review (ACCEPT; see Review) |
| Gate runs in parent | 4 (`ui:test` twice, `ui-e2e`, one full gate on `main`; see Verification)                   |
| Spec                | `documents/specs/member-registrations-ui.md` FR-12, FR-13, AC-10a, 11.2                    |
| Workers             | single - the implementing session; the Tier 2 review ran in a read-only reviewer subagent  |

### Seats (owner, 2026-11-10)

- **Spec gate:** `ollama-cloud/deepseek-v4-pro:0813` reviewed the exact amended text. It ran before
  12:00 local (`gate-run 2026-11-10T08:54:19.579Z`), so the window seat did not apply.
- **Worker:** `ollama-cloud/deepseek-v4.1-flash:1017`.
- **Code review:** the pre-merge review sat on `0813`, which is **not** the reviewer seat inside the
  12:00-18:00 local window; the window seat is `mimo-v2.6-pro`. The change was re-reviewed after the
  merge on the window model (round 3 below) so the round carries a seat-valid verdict.
- **Git executor:** unavailable - `opencode/beam-free` is over its free usage limit and
  `git-seat-budget: 0` parks rung 2, so the owner authorised the executing session (2026-11-10).

`git-seat-budget: 0 (rung 1 only; rung 2 parked)`

### Decisions (grill, 2026-11-10)

Round 1:

- **Architecture: bake one origin at build, delete the field, keep the strict CSP.** The 2026-11-09
  finding drove this: the field is already inoperative in production, because `connect-src` admits only
  the baked origin, so any other host fails at `probeGateway` and the page says "Check the gateway URL
  and try again."
- Rejected: runtime `config.json` on the Pages origin (a static CSP cannot be widened, and Pages sets
  no response headers, so it would need `connect-src https://*.vercel.app` or a rebuild anyway); a
  Cloudflare Worker/Pages Function proxy (a second platform and failure surface); moving the UI to
  Vercel for a single origin (retires the Pages pipeline and needs a catch-all rewrite that must not
  shadow `/v1`, `/auth`, `/gateway` or `/health`); keeping the field behind an allowlist.
- No custom domain; the free `*.vercel.app` name is permanent for now, and a rename is a UI rebuild.
- Separate round immediately after the P0 restore, so the first working sign-in is the simplified page.
- Tier 2, with an independent `code-review` after implementation.

Round 2:

- **Hide the origin completely** - no field, no caption, no disclosure (owner, rejecting a muted
  "Server: ." line). Deliberate trade: a failed sign-in is diagnosable only from the network tab.
- Dev uses `VITE_GATEWAY_URL`, defaulting to `http://localhost:3000` in a development build.
- Delete `mr.gateway.v1`, `readStoredGatewayUrl` and `writeStoredGatewayUrl`; a stale entry cannot
  change the origin.
- The unreachable copy becomes "The service is unreachable. Try again in a moment; if it persists,
  contact the administrator."
- The pre-flight `/health` probe stays (FR-12).

## Plan

Goal: the connect page collects only the officer's email, and the gateway origin is a single
build-time value that no user, storage entry or runtime file can change.

In scope:

1. One module owns the origin - `ui/src/auth/gatewayOrigin.ts` - replacing the duplicate defaults in
   `ui/vite.config.ts` and `ui/src/auth/session.ts`; `vite.config.ts` generates
   `connect-src 'self' <origin>` from it.
2. `ConnectPage.tsx`: remove the Gateway URL field, its validation state and its error path; keep the
   email field, the `/health` probe, the sending and sent states, and the expired-session bar. The
   unreachable copy becomes "The service is unreachable. Try again in a moment; if it persists,
   contact the administrator."
3. `session.ts`: drop `GATEWAY_STORAGE_KEY`, `readStoredGatewayUrl`, `writeStoredGatewayUrl`,
   `normalizeGatewayUrl` and the `localStorage` round-trip. The configured origin is validated once,
   at build time, in `vite.config.ts` (FR-13); a stale `mr.gateway.v1` is cleared and never read.
4. A production build fails when the origin is missing, invalid or not `https://`; `deploy-pages.yml`
   sets `VITE_GATEWAY_URL` explicitly and `vite.config.ts` validates it before building (AC-10b).
5. Tests: unit (origin resolution, dev default, production rejection), render (no URL input, error and
   sent states), e2e (`ui/e2e/fixtures.ts` stops setting `mr.gateway.v1`; `ui/e2e/connect.spec.ts`),
   axe light and dark.
6. Spec: FR-12, FR-13, AC-10a, AC-10b and 11.2 - **merged** in #98 (`335ae67`), reviewed ACCEPT.

Out of scope: a custom domain, the proxy and single-origin architectures, any change to the gateway,
the magic-link flow, the session credential or CORS.

### Acceptance criteria

1. The connect page has no gateway-origin input, caption or control, and no `localStorage` write.
2. The origin resolves from one module; the built `index.html` lists `'self'` and that origin in
   `connect-src`.
3. A production build with a missing, invalid or `http://` origin fails.
4. The `/health` probe still gates the magic-link request, and its failure shows the new copy.
5. A stale `mr.gateway.v1` cannot change the origin (test).
6. `0813` ACCEPT on the amended spec text; mock signed off before the first code commit.
7. Tier 2 `code-review` (Standards + Spec) returns ACCEPT.
8. `npm run verify` green, including `ui` and `ui-e2e`.

## Verification

| Gate                   | Command                                         | Result                                                                          |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Spec review            | `0813` exact text                               | ACCEPT (REWORK x2)                                                              |
| Mock sign-off          | `mockups/ui-fixed-gateway-origin`               | signed 2026-11-10                                                               |
| Format/lint/type       | `npm run verify:fast`                           | pass (4/4, spec commit)                                                         |
| UI unit/render         | `npm run ui:test`                               | pass, 403 tests (re-run after the format fix)                                   |
| Browser gate           | `npm run ui-e2e`                                | pass, 62 tests                                                                  |
| API suite              | `npm test -- --no-file-parallelism`             | pass, 48 files, 581 tests, 5 skipped (2026-11-10 on `main`)                     |
| CI on the merge commit | `verify`, `ui`, `ui-e2e`, `deploy` on `476f842` | all `success` (check-runs API)                                                  |
| Live CSP               | Pages build                                     | `connect-src` carries `'self'` and the baked origin; no origin text on the page |

The parent's full gate on `main` failed its test step on the known Windows PGlite/worker flake -
`PGlite is closed`, 20 s hook timeouts, 13 suites - not on a code failure. The gate already isolates
files, so this is not a parallelism setting. Re-run once: 48 files, 581 passed, 5 skipped. The same
class of flake recurred once in the pre-commit gate as a `3221226505` worker exit on
`tests/api/ussd.test.ts`. Both signatures, verbatim:

gate-run 2026-11-10T16:41:59.176Z profile=full steps=4/6 lines=33 bytes=19408
gate-run 2026-11-10T08:54:19.579Z profile=fast steps=4/4 lines=4 bytes=514

## Review

### Spec gate `0813`

- Round 1: **REWORK** - P1s: FR-19 still allowed persisting the base URL; the 7.1 traceability block
  was stale and omitted AC-10a; FR-13's build-time failure had no AC. P2s: 9.1 and 11.4 still said
  the form may override; `mr.connection.v1` still in the Data Models; the normalisation had no stated
  home; the "missing origin" case was ambiguous; the stale `mr.gateway.v1` and the e2e fixtures were
  unaddressed. Nits: "only origin" overstated; `connect-src` is not equal to the origin; path policy;
  EC-14; the error copy was not in the spec.
- Round 2: all fixed; one new P2 - EC-1 still displayed the base URL.
- Round 3 (EC-1 fixed): **ACCEPT**.

### Code review (Tier 2, independent)

- Round 1: **REWORK** on both axes, from one P1 claim - that `loadEnv` and `import.meta.env` ignore
  `process.env`, so the CI/Playwright value would never reach the resolver. **Refuted with evidence:**
  with no `.env` file present, a build whose only source was the process environment
  (`VITE_GATEWAY_URL=https://review-proof.example.net npx vite build`) emitted
  `connect-src 'self' https://review-proof.example.net` and the same string in the bundle; Vite's
  `loadEnv` merges prefix-matching `process.env` entries (the prefix here is `''`) and
  `import.meta.env` carries `VITE_*` from the process.
- Accepted from round 1: **P2** `ui/README.md` still claimed the production default - corrected to the
  build-time rule and the `http://localhost:3000` dev default; `ui/.env.example` annotated so it is
  not copied into a local `.env`.
- Round 2: **ACCEPT** on both axes.
- **Seat correction:** both of those rounds sat on `0813` inside the 12:00-18:00 local window, where
  the reviewer seat is `mimo-v2.6-pro` (`documents/agents/orchestrator-policy.md`, Seats). Their
  verdict is seat-invalid, so round 3 re-ran the same frozen change on the window model.
- Round 3 (post-hoc, seat-valid, `mimo-v2.6-pro`): **ACCEPT** on both axes, **no P1**. It concurred
  with the round-1 refutation and added a structural proof of it: the e2e harness supplies
  `VITE_GATEWAY_URL` only through `webServer.env` (`ui/playwright.config.ts:43-46`) and every page
  would fail at module init (`ui/src/auth/gatewayOrigin.ts:34-39`) if the value did not reach
  `session.ts:13`. Its P2s and their disposition:
  1. `ui/src/auth/session.ts:13` was 104 columns against the UI `printWidth` of 100 - **fixed** in the
     follow-up commit that normalised this record (the `ui` workspace is in the root
     `.prettierignore`, so nothing gated it; backlog row added).
  2. AC-10b's build seam has no committed test; the "three AC-10b build probes" were manual
     `vite build` runs that exited 1 each - **recorded as a deviation**, backlog row added rather than
     adding three builds to every CI run.
  3. This record still showed the UI gates "pending" and the acceptance rows "PARKED" after the merge
     - **fixed** by this rewrite.
- Nits from round 3, accepted and recorded under Deviations: `mode !== 'production'` treats any
  non-production mode as development; the origin literal appears in six places; the resolver's error
  message echoes the configured value into a build log.
- Recorded, not changed (round 1): keying the gate on `mode` rather than `command` is deliberate - the
  Docker image builds `vite build --mode development` and must be allowed a loopback origin, which is
  exactly the spec's "development build" wording (FR-13). `DEV_GATEWAY_URL` ships in the production
  bundle; it is a public default, not a secret.

## Mock sign-off

Signed by the owner 2026-11-10 ("signed and commit and push to pr for auto mere"); the sign-off covers
both HTML mocks and the three renders at the hashes below. The mock is HTML (a PNG alone is not a
mock), rendered locally, and git-ignored:

| Artifact                                                  | sha256                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `mockups/ui-fixed-gateway-origin/connect-comparison.html` | `839993eda91468c7fcec8d20dd8871832c234c44713e701dc1229c134b664791` |
| `mockups/ui-fixed-gateway-origin/connect-narrow.html`     | `744b27f61ac87d4c77c5939d679b5d5345ed41d1296e9e980e7b017df5799a96` |
| `01-comparison-1440.png`                                  | `e652ccbe6ae9876c6892d8afac0ac2b25c87ed8ac36fa1690e7e32dec6091ce3` |
| `02-narrow-860.png`                                       | `8f33c9e471f37064260a0af81d19cd90d8cd9ff44dbab8e1f3390ea227b816c9` |
| `03-narrow-390.png`                                       | `c40db638c670b57437d2a52d47bf9bed70f9d6953503df991e202798367d17a0` |

States: current vs proposed (light), proposed error, proposed sent, current vs proposed (dark),
proposed at 860 px and 390 px. The "current" panels reproduce the field being removed; the proposed
panels show no origin anywhere, including the error state.

## Mock parity

| Claim                                                      | Type        | State     | Answer (max prob) | Threshold | Confirmed by                                                                      | Disposition |
| ---------------------------------------------------------- | ----------- | --------- | ----------------- | --------- | --------------------------------------------------------------------------------- | ----------- |
| One email field; no origin control, caption or origin text | structural  | confirmed | -                 | -         | `ui/e2e/connect.spec.ts:10-18` (one textbox, no `Gateway URL` label, host absent) | met         |
| The unreachable state shows the spec copy and no origin    | visual      | confirmed | -                 | -         | `ui/src/pages/ConnectPage.tsx:22-23,165-176`; `ui/e2e/connect.spec.ts:20-35`      | met         |
| The shell error state (EC-1) shows no origin               | visual      | confirmed | -                 | -         | `ui/src/components/PageFrame.tsx:144-159`; detail strings only                    | met         |
| A stale `mr.gateway.v1` is cleared before the first render | behavioural | confirmed | -                 | -         | `ui/e2e/connect.spec.ts:37-46`; `ui/src/main.tsx:7-10`                            | met         |

Pixel-level comparison is deferred to the V2 UI gate (ticket 19) under the accepted deferral; the
claims above are structural and behavioural, confirmed by the e2e suite rather than by a screenshot
diff.

## Acceptance

| #   | Criterion                                    | Met | Evidence                                                                                                      | Verdict  |
| --- | -------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | No origin input, caption or storage write    | yes | `ui/e2e/connect.spec.ts:10-18`; `ui/src/pages/ConnectPage.tsx:261-290`; `ui/src/auth/session.ts:98-108`       | ACCEPTED |
| 2   | One module; `connect-src` carries the origin | yes | `ui/src/auth/gatewayOrigin.ts:30-71` is the only resolver; `ui/vite.config.ts:23,42`                          | ACCEPTED |
| 3   | Production build rejects a bad origin        | yes | `ui/vite.config.ts:42` throws before output; `ui/src/auth/gatewayOrigin.test.ts:14-37`; manual probes exit 1  | ACCEPTED |
| 4   | Probe gates the link; new failure copy       | yes | `ui/src/pages/ConnectPage.tsx:165-176`, copy `:22-23`; `ui/e2e/connect.spec.ts:20-35`                         | ACCEPTED |
| 5   | Stale `mr.gateway.v1` cannot change origin   | yes | `ui/e2e/connect.spec.ts:37-46`; `ui/src/auth/session.test.ts` (removes the entry, tolerates a blocked store)  | ACCEPTED |
| 6   | `0813` ACCEPT; mock signed off               | yes | spec gate round 3 ACCEPT; mock signed 2026-11-10                                                              | ACCEPTED |
| 7   | Tier 2 code review ACCEPT                    | yes | round 3, seat-valid `mimo-v2.6-pro`: ACCEPT on both axes, no P1                                               | ACCEPTED |
| 8   | `npm run verify` green                       | yes | CI on `476f842`: `verify`, `ui`, `ui-e2e`, `deploy` all `success`; local suite 48/48, 581 passed (sequential) | ACCEPTED |

## Deviations

- **The shared working tree is resolved.** #101 squash-merged at `476f842` and the branch is deleted;
  the record was normalised afterwards, in a separate commit, from the state actually on `main`.
- The production P0 (three env names) no longer blocks the code, but it still blocks the first real
  sign-in from Pages.
- The origin is deliberately shown nowhere, including the error state (owner, round 2): a failed
  sign-in is diagnosable only from the network tab.
- **Seat deviation on the pre-merge review.** It ran on `0813` inside the 12:00-18:00 window, where the
  reviewer seat is `mimo-v2.6-pro`. Round 3 re-ran the same frozen change on the window model;
  `cline-pass/cline-pass/mimo-v2.6-pro` was refused by the harness as unavailable and
  `ollama-cloud/mimo-v2.6-pro` served the same model, which is the recorded `fallbackReason`.
- **Plan drift, accepted.** The RTL render tests for the error and sent states and an axe pass over
  `/connect` did not ship; `ui/e2e/connect.spec.ts` covers the behaviour, so AGENTS.md section 8 is
  met. Backlog: add `/connect` to `ui/e2e/axe.spec.ts` `SCREENS` (it needs a shape without a table).
- **AC-10b's build seam has no committed test.** The three probes were manual `vite build` runs (exit
  1 each), not `tests/` or `scripts/` artifacts. Backlog: a committed build-seam test.
- **`ui` formatting is ungated** - the root `.prettierignore` lists `ui/` - so one over-width line
  merged. Fixed in the follow-up commit; backlog: run `ui:format:check` in the `ui` CI job.
- Nits accepted without change: any non-`production` mode is treated as development (no repo path
  builds another mode); the origin literal appears in six places by design (a rename is a UI rebuild);
  the resolver's error message echoes the configured value, reachable only in a build log.
