# 19a: UI release gate — browser harness, smoke and axe

**Tier:** 2

**What to build:** A Playwright harness for the built UI, the five smoke flows, the axe contrast checks
and the responsive checks, wired into CI. The baseline captures, the mock-index comparison and the
Pages deploy are 19b.

**Blocked by:** 13-18 (the screens under test).

**Status:** ready-for-agent

- [ ] Playwright runs the production build (`vite preview`) against stubbed gateway routes, with a seeded session in `sessionStorage`; no real API, no magic link, no data leaves the browser.
- [ ] Smoke covers shell navigation, the members list with the contacts dialog, the add-member flow, event detail with the attendance dialog, and series detail.
- [ ] Responsive checks at 360, 768 and 1440: no horizontal scroll on the smoke screens, and the mobile navigation opens and navigates.
- [ ] `@axe-core/playwright` runs the WCAG 2.2 AA rules, contrast included, on the shell, members and events screens in light and dark; each accent is checked on the shell at 1440.
- [ ] A failing accessibility rule fails the run, and the report names the rule and the node.
- [ ] CI runs the suite on every PR (chromium only), with the browser installed from the lockfile version.
- [ ] The suite fails loudly if the preview server or a fixture route is missing; a zero-test run is a failure.
