# 12: UI workspace, shell and Pages

**Tier:** 1

**What to build:** A `ui/` workspace (React 19, Vite, Fluent UI v9) that builds and deploys to GitHub
Pages under the project path, with the shared shell: top menu right-aligned over content, contextual
left sidebar that collapses to icons, theme dropdown and dark/light switch, and hash routing with
placeholder pages.

**Blocked by:** 01 (Freeze specs and boundaries), 11a (Session gateway).

**Status:** ready-for-agent

- [ ] The shell builds and is reachable on the GitHub Pages project URL, including a hard refresh on a nested route.
- [ ] An unauthenticated visit lands on the sign-in gate; a magic-link sign-in reaches the shell, and sign-out returns to the gate.
- [ ] The API bearer is absent from the bundle and browser storage; only a short-lived session credential is stored.
- [ ] The top menu sits right-aligned over the content; the sidebar shows the active section's submenus and collapses to icons with the state remembered.
- [ ] The theme dropdown and dark/light switch work with no flash on first paint; accent themes apply.
- [ ] Placeholder pages exist for imports, shepherding and admin.
- [ ] Keyboard navigation reaches the menu, sidebar and theme controls.
