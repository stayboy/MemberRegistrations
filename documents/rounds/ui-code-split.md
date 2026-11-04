# Round - UI route-level code split

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| Status | OPEN                                                               |
| Tier   | 2 - Reviewed                                                       |
| Base   | `61fef63`                                                          |
| Spec   | `documents/specs/member-registrations-ui.md` (NFR-2, NFR-3, AC-25) |
| Ticket | process work (Q121; backlog "route-level code splitting")          |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Q116 accepted "split now, before 15–18"; Q121 fixed the shape: `React.lazy` for the routed pages, one
`Suspense` around the shell's outlet, and one cacheable vendor chunk. The honest framing recorded in the
question stands: Fluent UI dominates the bundle, so this does not shrink today's entry much — it stops
tickets 15–18 from growing one file.

- Lazy: `MembersPage`, `MemberDetailPage`, `MemberFormPage`, `SettingsPage`.
- Eager: `ConnectPage` (sign-in must not wait on a chunk), `NotFoundPage`, `PlaceholderPage`,
  `AppShell`, `RequireSession`.
- One boundary, inside `<main id="main-content">`, so the shell chrome survives a pending route chunk.
- Vendor: one `vendor` group for `node_modules`, via the current rolldown option (not the deprecated
  `rollupOptions`/`manualChunks` path).

A second centred-spinner call site appeared with the fallback, so the component-first trigger fired and
`PageSpinner` was extracted from `RequireSession` and `AppShell` in the same change.

Acceptance criteria:

1. Every route path, element and nesting is unchanged; only the imports became lazy.
2. Exactly one Suspense boundary, inside the content slot; the shell chrome stays visible.
3. The build emits separate page chunks and one vendor chunk; no warning-limit fudge.
4. No duplicated spinner markup and no dead styles or imports.
5. All gates pass.

## Verification

| Gate                    | Command                                  | Result                                  |
| ----------------------- | ---------------------------------------- | --------------------------------------- |
| UI tests                | `npm --prefix ui run test`               | pass - 8 files, 87 tests                |
| Typecheck / lint        | `npm --prefix ui run typecheck` / `lint` | pass                                    |
| Build                   | `npm --prefix ui run build`              | pass - 2224 modules, 10 chunks          |
| Format                  | `npm --prefix ui run format:check`       | pass                                    |
| Root tests (serialized) | `npx vitest run --no-file-parallelism`   | pass - 17 files, 195 passed / 3 skipped |

| Chunk                                               | Before                   | After                                                         |
| --------------------------------------------------- | ------------------------ | ------------------------------------------------------------- |
| entry                                               | 945.9 kB (single bundle) | 39.9 kB                                                       |
| `vendor`                                            | -                        | 846.3 kB (React, Fluent UI + Griffel, router, TanStack Query) |
| `MemberDetailPage`                                  | -                        | 23.3 kB                                                       |
| `MembersPage`                                       | -                        | 12.2 kB                                                       |
| `MemberFormPage`                                    | -                        | 11.1 kB                                                       |
| `SettingsPage`                                      | -                        | 2.4 kB                                                        |
| shared (`ContactsDialog`, `members`, `member-form`) | -                        | 9.5 / 3.2 / 4.0 kB                                            |
| CSS                                                 | 0.89 kB                  | 0.89 kB                                                       |

The >500 kB build warning remains and now names the vendor chunk — expected: one vendor chunk is the
decision, and the entry is cacheable separately from app code.

## Review

`deepseek-v4-pro:0813`: **ACCEPT**, no P1, one P2, two nits.

- **P2 applied.** The vendor split used `build.rollupOptions.output.manualChunks`, which this Vite
  (8.3.5, rolldown 1.2.16) deprecates and auto-converts; the migration guide warns the function form can
  be silently discarded. Migrated to `build.rolldownOptions.output.codeSplitting.groups` with
  `{ name: 'vendor', test: /node_modules[\\/]/ }`, confirmed against the installed rolldown types, and
  re-verified in `dist/assets` (`vendor` holds `FluentProvider`, React internals, `RouterProvider`,
  `QueryClient`; the entry chunk holds none of them).
- **Nit, left as is.** `PageSpinner`'s `role="status"` + `aria-live="polite"` wraps a Fluent `Spinner`
  that already exposes `role="progressbar"`; the double-announcement risk is checked at ticket 19's
  axe/Playwright gate.
- **Nit, no action.** The reviewer corrected the worker's claim that the fallback's minimum height
  changed from 256 px to 40vh: `RequireSession` already used 40vh, so no height changed.

## Acceptance

| #   | Criterion                                                      | Met | Evidence                                                        |
| --- | -------------------------------------------------------------- | --- | --------------------------------------------------------------- |
| 1   | Route paths, elements and nesting unchanged; only imports lazy | yes | review compared the route table against `61fef63` byte-for-byte |
| 2   | One Suspense inside the content slot                           | yes | `ui/src/shell/AppShell.tsx` (boundary around `<Outlet />`)      |
| 3   | Separate page chunks and one vendor chunk, no warning fudge    | yes | chunk table above; `chunkSizeWarningLimit` untouched            |
| 4   | No duplicated spinner markup, dead styles or imports           | yes | `ui/src/components/PageSpinner.tsx` used by both call sites     |
| 5   | All gates pass                                                 | yes | Verification table                                              |

Verdict: **ACCEPTED**.

## Deviations

- **No new test.** This is a refactor with no behaviour change; the existing node-level tests cover
  logic only, and a test pinning the route table would assert internals (AGENTS §8). The meaningful
  guards are build-artifact checks and the browser gate in ticket 19. Recorded here rather than skipped
  silently.
- `PageSpinner` unifies the loading state at 40vh, which is the shape `RequireSession` already had.
- The retired `imports/events` placeholder route stays until ticket 15 removes it (Q118).
