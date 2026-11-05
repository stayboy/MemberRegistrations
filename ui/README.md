# Member Registrations UI

The V2 operator interface: React 19, Vite, Fluent UI React v9, TypeScript strict, hash routing.
It is an npm workspace of the repository root; the API stays in `src/`.

## Run

From the repository root:

```powershell
npm ci
npm run ui:dev      # http://localhost:5173/
npm run ui:build    # ui/dist, base /MemberRegistrations/
npm run ui:lint
npm run ui:typecheck
npm run ui:test
```

`VITE_GATEWAY_URL` defaults to `https://member-registrations-mind-logs.vercel.app`; see
`.env.example`. The build has no secret: the gateway holds the API bearer.

## Shell

- `src/shell/AppShell.tsx` renders the header, contextual sidebar and the only scroll container.
  Pages supply a `PageFrame` (breadcrumb, title, actions, body).
- The top-level sections live in `src/shell/navigation.ts`; the sidebar shows only the active
  section's submenus.
- Sidebar width is 260 px expanded / 56 px collapsed. The collapsed state is remembered in
  `localStorage` (`mr.nav.v1`); at ≤ 860 px the sidebar is forced to the icon rail and the top menu
  becomes a `Sections` menu.
- `src/theme/` holds the four accent ramps, the light/dark switch and versioned persistence
  (`mr.theme.v1`). `public/theme-boot.js` restores the scheme before first paint using the same keys.

## Session

- `src/auth/SessionProvider.tsx` verifies a restored session with `GET /auth/me` before protected
  content renders.
- A magic link lands on `#/connect?token=…`; the token is exchanged once, removed from the URL, and
  only the short-lived session credential (`token`, `expiresAt`) is written to `sessionStorage`
  (`mr.session.v1`).
- Requests use `Authorization: Bearer <session>` against the gateway. The UI never sends
  `X-Actor-Id` and never stores the API bearer.
- Sign-out calls `POST /auth/logout`, clears the credential and the TanStack Query cache, then
  returns to the gate.

## Routing

`createHashRouter` keeps GitHub Pages deep links working on a hard refresh (for example
`#/shepherding/roster`). Protected routes render inside `RequireSession`, so an unauthenticated
visit redirects to `#/connect` while the shell stays visible.

Placeholder pages exist for Members, Events, Imports, Shepherding and Admin; their content arrives
with the per-slice tickets. The sign-in gate, Settings and the API connection check are live in this
ticket.

## Deploy

`.github/workflows/deploy-pages.yml` deploys the built UI to GitHub Pages on every push to `main`.

The one-time owner step is **Settings → Pages → Source: GitHub Actions**. Until it is enabled, the
deploy step fails after the build succeeds (the build itself is fine). The production base path is
`/MemberRegistrations/`. No CORS change is needed: the gateway echoes the request origin.
