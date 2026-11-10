# Round — ui-fixed-gateway-origin

|                     |                                                                          |
| ------------------- | ------------------------------------------------------------------------ |
| Status              | OPEN — spec ACCEPTED; awaiting the mock sign-off and the P0 restore      |
| Tier                | 2 (sign-in path, CSP, storage)                                           |
| Mode                | attended (owner answered two grill rounds)                               |
| Base                | `a162faf`                                                                |
| Review rounds       | 0                                                                        |
| Gate runs in parent | 0                                                                        |
| Spec                | `documents/specs/member-registrations-ui.md` FR-12, FR-13, AC-10a, §11.2 |
| Workers             | `worker` implements (Tier 2); separate `code-review` pass                |

### Seats (owner, 2026-11-10)

- **Spec gate:** `ollama-cloud/deepseek-v4-pro:0813` reviews the exact amended text; the 12:00–18:00
  window does not apply.
- **Worker:** `ollama-cloud/deepseek-v4.1-flash:1017`.
- **Git executor:** rung 1 `opencode/beam-free`.

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

- **Hide the origin completely** — no field, no caption, no disclosure (owner, rejecting a muted
  "Server: …" line). Deliberate trade: a failed sign-in is diagnosable only from the network tab.
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

1. One module owns the origin (currently duplicated in `ui/vite.config.ts:4` and
   `ui/src/auth/session.ts:3-4`); `vite.config.ts` generates `connect-src 'self' <origin>` from it.
2. `ConnectPage.tsx`: remove the Gateway URL field, its validation state and its error path; keep the
   email field, the `/health` probe, the sending and sent states, and the expired-session bar.
3. `session.ts`: drop `GATEWAY_STORAGE_KEY`, `readStoredGatewayUrl`, `writeStoredGatewayUrl` and the
   `localStorage` round-trip; keep `normalizeGatewayUrl` as the configured-origin validator.
4. A production build fails when the origin is missing, invalid or not `https://`; `deploy-pages.yml`
   sets `VITE_GATEWAY_URL` explicitly and `vite.config.ts` validates it before building (AC-10b).
5. Tests: unit (origin resolution, dev default, production rejection), render (no URL input, error and
   sent states), e2e (`ui/e2e/*` fixtures stop setting `mr.gateway.v1`), axe light and dark.
6. Spec: FR-12, FR-13, AC-10a and §11.2 (done — awaiting review).

Out of scope: a custom domain, the proxy and single-origin architectures, any change to the gateway,
the magic-link flow, the session credential or CORS.

### Acceptance criteria

1. The connect page has no gateway-origin input, caption or control, and no `localStorage` write.
2. The origin resolves from one module; `connect-src` equals it in the built `index.html`.
3. A production build with a missing, invalid or `http://` origin fails.
4. The `/health` probe still gates the magic-link request, and its failure shows the new copy.
5. A stale `mr.gateway.v1` cannot change the origin (test).
6. `0813` ACCEPT on the amended spec text; mock signed off before the first code commit.
7. Tier 2 `code-review` (Standards + Spec) returns ACCEPT.
8. `npm run verify` green, including `ui` and `ui-e2e`.

## Verification

| Gate             | Command                           | Result             |
| ---------------- | --------------------------------- | ------------------ |
| Spec review      | `0813` exact text                 | ACCEPT (REWORK ×2) |
| Mock sign-off    | `mockups/ui-fixed-gateway-origin` | pending            |
| Format/lint/type | `npm run verify:fast`             | pass (4/4)         |
| UI tests         | `npm run ui:test`                 | pending            |
| Browser gate     | `npm run ui-e2e`                  | pending            |

gate-run 2026-11-10T08:54:19.579Z profile=fast steps=4/4 lines=4 bytes=514

## Review

Spec gate: `ollama-cloud/deepseek-v4-pro:0813` reviewed the exact amended text.

- Round 1: **REWORK** — P1s: FR-19 still allowed persisting the base URL; the 7.1 traceability block
  was stale and omitted AC-10a; FR-13's build-time failure had no AC. P2s: §9.1 and §11.4 still said
  the form may override; `mr.connection.v1` still in the Data Models; the normalisation had no stated
  home; the "missing origin" case was ambiguous; the stale `mr.gateway.v1` and the e2e fixtures were
  unaddressed. Nits: "only origin" overstated; `connect-src` is not equal to the origin; path policy;
  EC-14; the error copy was not in the spec.
- Round 2: all fixed; one new P2 — EC-1 still displayed the base URL.
- Round 3 (EC-1 fixed): **ACCEPT**.

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

Pending.

## Acceptance

| #   | Criterion                                  | Met     | Evidence                            | Verdict  |
| --- | ------------------------------------------ | ------- | ----------------------------------- | -------- |
| 1   | No origin input, caption or storage write  | pending |                                     | PARKED   |
| 2   | One module; `connect-src` equals origin    | pending |                                     | PARKED   |
| 3   | Production build rejects a bad origin      | pending |                                     | PARKED   |
| 4   | Probe gates the link; new failure copy     | pending |                                     | PARKED   |
| 5   | Stale `mr.gateway.v1` cannot change origin | pending |                                     | PARKED   |
| 6   | `0813` ACCEPT; mock signed off             | yes     | spec ACCEPT; mock signed 2026-11-10 | ACCEPTED |
| 7   | Tier 2 code review ACCEPT                  | pending |                                     | PARKED   |
| 8   | `npm run verify` green                     | pending |                                     | PARKED   |

## Deviations

- Implementation parks until the production env names are in (owner, `mvp-release-cutover` P0), so the
  first working sign-in is the simplified page.
