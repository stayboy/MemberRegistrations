# Spec — MemberRegistrations UI (V2)

**Author:** Solomon Owoo

**Date:** 2026-11-03

**Status:** **Approved 2026-11-03**, amended 2026-11-04 and 2026-11-13. V2 scope frozen: shell and sign-in gate,
members, imports, shepherding, events and series. Q2 keeps the UI on GitHub Pages behind a Vercel session
gateway that holds the API bearer; officers sign in with a magic link, so no bearer is entered by a user
or shipped in the bundle. Offerings and USSD are V3 and are specified in
`member-registrations-events-offerings.md`. The API amendment is in `member-registrations-api.md`;
implementation is gated by tickets 01-24 plus 11a and 15a. **2026-11-13:** page actions move into a single
`Actions` menu beside the breadcrumb (D12, FR-9a); filters, date windows and view switches stay visible.

|            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo       | `MemberRegistrations`, UI as an `ui/` npm workspace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Origin     | Conversational request, 2026-11-03: V2 UI for connect, import and CRUD against the API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Related    | `documents/specs/member-registrations-api.md`, local `mockups/` (git-ignored)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Supersedes | The “V2 UI” line in `documents/backlog.md` once this spec is approved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Change log | 2026-11-03: gateway env names aligned with ticket 11a (`AUTH_*`, `UI_BASE_URL`). 2026-11-04: two imports (member database, attendance registry) plus Excel templates; the event-list import is retired. 2026-11-04: attendance import scoped to a chosen session (FR-36a); OS-7 corrected; retired event-name case replaced. 2026-11-04: FR-59's roster contacts become a contacts action and count, never inline values (Q157, ticket 16). 2026-11-05: date and time display split into calendar dates, instants and wall-clock times; the attendance annotation keeps the FR-76 compact form; see `documents/specs/ui-date-time-formatting.md`. 2026-11-05: Ocean, Meadow and Plum mid-tones darkened to meet FR-49 AA (white-on-brand and dark-scheme brand text); the ramps are now monotonic and guarded by a unit test. 2026-11-05: FR-25a adds the detail-only presbyter rank, membership card and verification fields. 2026-11-05: the V3 USSD operator section (2.5) adds the Headcount panel with correction, the roster label, the activities ordering and the zero-events next-events prompt. 2026-11-06: 24d slice B2 ships that USSD section in the shell - Codes, Registrations, Clocking, Headcount, Activities, Products, Claims and the dev-only Simulator; the navigation map names each route. 2026-11-08: MVP adds the Offerings count page (`#/ussd/offerings`) following the headcount pattern, the counted/variance figures on the landing, and the offerings-count route in the navigation map. 2026-11-09: the shepherding roster DTO carries a contact count (Q5); the main search narrows to name parts/member number (Q6); the production USSD nav hides the Simulator and the other USSD pages carry a "USSD is not live" notice; the event detail gains the read-only Active offerings panel (FR-39). 2026-11-09: the offering count becomes a single-pass denomination grid driven by a per-currency catalogue; an admin reorder/hide setting is specified but parked behind 24e (slice B). 2026-11-10: the connect form collects only the officer's email; the gateway origin is fixed at build, shown nowhere, not user-editable and the only origin the UI contacts; the stored `mr.gateway.v1` key is removed (FR-12, FR-13, AC-10a). 2026-11-11: FR-37 drops the already-imported `409` — a live capture may repeat and each is a new observation — matching the API's removed duplicate error and the new capture model. 2026-11-13: page actions move into one `Actions` menu beside the breadcrumb (D12, FR-9a); filters, date windows and view switches stay visible. 2026-11-13: FR-9a's scope and shape are fixed before the build — a page action is a verb on the page's action row that acts on the page or its collection (create, import, edit, archive/restore, refresh); the MUST is scoped to that row, so body, row and message-bar controls stay put; the row spans the content width; the trigger is a text `Actions` button (not a kebab — the owner could not see it); items keep the replaced button's name, icon and disabling condition; ordering is create-side, edit-side, separator, destructive, `Refresh` last, with `Back` visible left of the menu, filters and view switches on the row's left, and the four misfit verbs placed by function; a form's commit/cancel pair — whatever its labels — is not a page action and such a page renders no menu (owner: "main page action buttons like these do not apply"). 2026-11-13: three clarifying edits to FR-9a after its confirmation review — the trigger is now named as Fluent's `MenuTrigger` over a Fluent `Button`, with `aria-haspopup` and `aria-expanded` supplied by the library (a bespoke menu is a blocking finding under `AGENTS.md` §16); the filters clause is harmonised with D8, so the controls may sit on the action row's left where a page has them there or on their own row below the title where D8's layout does, and are never inside or right of the menu; and the four owner rulings carry their attribution. 2026-11-13: one clarifying clause from the Tier 2 review — when a page renders no menu, its remaining header controls keep the trailing edge of the row, so a control never moves merely because a page has no verbs (the form pages' commit/cancel pair). 2026-11-13: FR-9a's trigger clause corrected to what Fluent actually renders — `aria-haspopup` plus `aria-expanded` **while open**, with the closed state being the attribute's absence, and a hand-set `aria-expanded="false"` explicitly forbidden because it would fight the library's own state. The earlier wording claimed the closed state exposed `"false"`; the implementation review proved it does not, and the test now pins the absence rather than a value the library never sets. 2026-11-14: FR-59a added - the roster's adopted mock-parity elements are specified rather than left to the mock: the officer identity card, five count tiles computed from the single roster read (never a second request), search over member name and number only, the "Never called" / "Quiet {n}d" badges sharing FR-60's exact condition, one row overflow holding Contacts/Reassign/End with Log call still visible, and a footer count. The filter keeps FR-60's "Follow-up" label and the mock's "Quiet > 30 days" label is retired. 2026-11-14: FR-9a amended on the owner's ruling - a page with exactly one verb renders it as a visible control and a page with two or more keeps them in the Actions menu, which reverts the one-item Refresh menus; a Refresh-class control is a surface utility (a bare icon at the trailing edge, never in the menu, never counted), and AC-50 records it. 2026-11-14 also reclassified `New session` from the refresh-class to a create-side verb, because the owner's ruling turned the refresh class into a non-verb utility that renders as a bare icon; it starts a session rather than re-reading the page, so it stays a visible button. |

---

## Context

The register has a complete HTTP API but no user interface. Officers currently need a bearer token,
an HTTP client and the OpenAPI document to look up a member, correct a contact, record attendance or
import a registry. That is not a workflow a ministry leader can run during a meeting, and it makes
the carefully modelled attendance denominator invisible.

V2 adds the missing surface: a browser UI that connects to the existing Vercel API, reads and writes
the register, imports the two source files, and keeps every page visually and behaviourally
consistent. It is a static single-page application, so it can be hosted on GitHub Pages while the API
stays on Vercel.

The first deliverable is the shared **app shell** — the `MainLayout` every page renders inside. It is
mocked locally under `mockups/v2-shell/` (git-ignored) and is the subject of this
review.

## Solution

A **React 19 + Vite + TypeScript** SPA using **Fluent UI React v9** (`@fluentui/react-components`
9.75.x), built into `ui/` as an npm workspace of this repository, deployed to
`https://stayboy.github.io/MemberRegistrations/` by GitHub Actions, and talking to the existing
`https://member-registrations-mind-logs.vercel.app` API.

- **One shell for every page.** A 56 px top bar with the top-level menus right-aligned, a contextual
  collapsible sidebar on the left, and one content slot. No page owns its own global chrome.
- **A contextual sidebar.** The sidebar shows the submenus of the active top-level menu. Switching
  `Members` → `Imports` replaces the sidebar contents and selects that section's first submenu.
- **A real design system.** Fluent UI tokens and components only; four accent ramps plus a
  light/dark switch; both schemes verified for contrast.
- **A sign-in gate, not a baked-in secret.** The static bundle never contains the API bearer. The
  officer enters an email, receives a single-use magic link, and holds a short-lived session
  credential for the tab. A Vercel session gateway holds the bearer and derives `X-Actor-Id`, so the
  awkward step of pasting a church-wide token is gone.
- **Server state is not duplicated.** TanStack Query owns fetching, caching, invalidation and
  mutation state. The API remains the source of truth; the UI stores no PII.
- **Hash routing** (`#/members/...`) so a GitHub Pages deep link never returns a 404, with no need
  for a `404.html` copy of `index.html`.

### 2.1 What the mockup assumes

The cited reference is the **Fluent UI React v9** storybook (`storybooks.fluentui.dev/react`), and
this repository is TypeScript. The mockup therefore assumes React, not Blazor. If the intent was
Blazor WebAssembly with `Microsoft.FluentUI.AspNetCore.Components`, stop before implementation and
answer **Q1** in **Open Decisions (Grill Round)**; the layout translates, but the component APIs do
not.

The mockup is a throwaway prototype: it uses in-memory sample rows and does not call the API. It
exists to settle the shell before the spec is approved. The production UI will be re-scaffolded
under `ui/`, not lifted from the prototype.

### 2.2 Fluent UI references

- Official LLM documentation: <https://storybooks.fluentui.dev/react/llms.txt>; per-component pages
  follow the `llms/components-{name}.txt` pattern.
- Components exercised in the mockup: `FluentProvider`, `Button`, `Menu`, `Dropdown`, `Switch`,
  `Table`, `Badge`, `Avatar`, `ProgressBar`, `SearchBox`, `Tooltip`, `MessageBar`, `Card`.
- Installed skill: `fluentui` from `microsoft/vscode-documentdb`. It targets Fluent UI React v9 and
  points at the same docs. Its webview-specific `Overflow`/`Toolbar` and `MessageBar` notes apply
  only if the table toolbar later needs overflow; the shell itself is plain Fluent UI React v9.

### 2.3 Design decisions already exercised in the mockup

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Status        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| D1  | Header is 56 px; brand block left; top-level menus form a right-aligned cluster; account avatar is the last item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Proposed      |
| D2  | Active top-level menu is brand-coloured with a 2 px underline and `aria-current="page"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Proposed      |
| D3  | Sidebar is 260 px expanded, 56 px collapsed; active submenu has a 3 px brand bar and a selected neutral surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Proposed      |
| D4  | Sidebar is contextual (active section only), not an accordion of every section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Proposed (Q5) |
| D5  | Collapsed footer turns the accent dropdown and dark switch into two icon buttons, stacked, with tooltips                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Proposed      |
| D6  | Theme dropdown selects an **accent** (Fluent, Ocean, Meadow, Plum); the switch selects light/dark                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Proposed (Q4) |
| D7  | Tables use Fluent `Table` primitives for the first pass; `DataGrid` only if column resize/selection is needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Proposed      |
| D8  | The Members page is the reference content page: breadcrumb (with the `Actions` menu at its right edge, per D12), title, filters row, attendance table, cursor footer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Proposed      |
| D9  | Icon-only controls always have an `aria-label`; tooltips are additive, never the only name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Required      |
| D10 | No hard-coded colours outside theme swatch previews; spacing/type/colour come from Fluent tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Required      |
| D11 | Mobile (≤ 860 px) uses a `Sections` menu for top navigation, a 56 px rail for the sidebar, and stacked cards                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D12 | Page **actions** (verbs) live in one `Actions` menu at the right edge of the breadcrumb row. **Filters**, date windows and **view switches** (for example offerings by event / by member) are state, not actions, and stay visible outside the menu. A page with exactly one verb renders it visibly and renders no menu; two or more verbs live in one `Actions` menu. `Refresh` is a surface utility - a bare trailing icon, never a menu item and never counted as a verb. A **page action** is a verb on the page's action row that acts on the page or its collection — create, import, edit, archive/restore. A form's commit/cancel pair — whatever its labels — is not a page action: it is the form's commit control, it stays visible beside the form, and such a page renders no `Actions` menu at all | Proposed      |

### 2.4 V2 scope freeze

- **V2:** shell and connect, members (list, detail, add/edit, contacts, subscriptions, coverage),
  imports, shepherding, events (list, detail, attendance) and series (list, detail, versions,
  exceptions).
- **V3:** offerings, pledges, contributions, the offerings landing and USSD. Screens exist in the
  mock for review; they are not part of V2 delivery.
- The old top-level `Attendance` menu is retired. Recording attendance is an event action, and imports
  stay under `Imports`. Where this spec and `member-registrations-events-offerings.md` disagree about
  events, series, attendance or offerings, that spec governs.

### 2.5 V3 USSD operator section (24d)

The operator app gains one **USSD** top-level section (Codes, Registrations, Clocking, Headcount,
Offerings count, Products, Claims; Complaints after 24e). The **Headcount** panel records the operator's actual counted
attendance per session: a mode selector labelled **Adult service / Children service / Mixed service**, an
`asOf` timestamp defaulting to now, the three-number entry (four in Mixed), the observation history newest
first (superseded observations stay readable and remain valid for their `asOf`), and a **Correct** action
on the current observation that keeps its `asOf` and supersedes it without deleting it. The register-derived
`expected` is shown alongside as **Roster**, never merged with the headcount; headcounts are operator-only
and never appear in member surfaces. The operator's activity list mirrors the USSD eligibility and
ordering: general events, the selected member's active ministries, and presbyter-only events for
presbyters; date → priority tier → start time → event number, three plus `More` (two when the selected
provider caps messages at 120), with the same zero-events-today, two-week next-events prompt and
empty-week state.
The operator session carries no member link, so the Activities page exposes an explicit **Eligibility
view** member selector; with no member selected it is the anonymous general-events view, and the chosen
member's active ministries and presbyter flag drive the same eligibility and ordering.

In a production build the USSD section keeps every item except the Simulator, and each other USSD
page carries a "USSD is not live" notice rendered by `PageFrame` for `sectionId="ussd"`; the
Simulator page keeps its development-only MessageBar instead. A deep link to `#/ussd/simulator` keeps
the existing development-only guard. The notice describes the member dial-in, not the operator pages.

**Offerings count** (`#/ussd/offerings`, MVP) follows the same observation pattern for the counted
cash. The operator picks the event/session, then the offering, and enters every denomination in one
pass on a single grid: one number input per configured denomination, notes before coins and
descending within each group (GHS notes 200, 100, 50, 20, 10, 5, 2 and 1; coins 0.50, 0.20, 0.10 and
0.05), with blank meaning not counted. A free-form add covers a one-off non-standard value and never
joins the catalogue. A currency with no catalogue, or with every denomination hidden,
shows no grid but keeps free-form rows and names which condition applies. An admin can reorder or
hide denominations per currency; the setting narrows the grid only — the API keeps accepting any
positive denomination, so observed lines the current configuration hides or omits still render and
submit when correcting. The page shows the
live total, the current observation, an append-only history newest first (including the current row),
and a **Correct** action that keeps the corrected row's `asOf` and supersedes it without deleting it.
Counts are never merged with member/visitor gifts or pledges. The same page carries the
member-announced gift form (existing `POST /v1/contributions`, `channel: manual`) and the pledge form
(existing `POST /v1/pledges`); pledges stay member-level. The offerings landing shows the recorded
gifts, the counted cash and the variance side by side. On the landing, the by-offering, by-event and
by-member breakdowns are reachable through tabs, and the pledge worklist's officer, next reminder and
reassign details are reachable per row.

## Users and Jobs

| User             | Job to be done                                                                                 | V2 surface                  |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| Administrator    | Find a registration, correct it, archive or purge it                                           | Members, connect, imports   |
| Administrator    | Import the event list and attendance registry without corrupting the register                  | Imports                     |
| Administrator    | Maintain ministries, series, schedules and exceptions                                          | Events, Admin               |
| Ministry leader  | See one member's contacts, ministries, household and attendance at a glance                    | Members detail              |
| Presbyter        | Work the shepherding roster and log a call attempt                                             | Shepherding                 |
| Pastor / auditor | See coverage and call totals, and trust that writes are attributed                             | Shepherding report          |
| Security owner   | Know that PII is behind a revocable session, never cached and never written to browser storage | Sign-in, all pages          |
| Reviewer         | Approve one shell that every future page must use                                              | This spec, the shell mockup |

The gateway authenticates each officer, but V2 still has **no per-officer authorization**: every
authenticated officer can read and write the whole register. Because `X-Actor-Id` is now derived from
the session, audit attribution is trustworthy even though access is not scoped. The UI must not imply
that signing in as a different officer changes what that officer can see or do (**Q2**).

## Shell Contract

### 4.1 Structure

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ brand        (spacer)                    Members Events Imports …  avatar     │ 56 px
├──────────────┬───────────────────────────────────────────────────────────────┤
│ SECTION      │  Members / All members                     [Actions ▾] [↻] │
│ Members      │  Members                                                   │
│              │  [search] [include archived] [find contact] [ministry] [series] │
│ ▎All members │  ┌───────────────────────────────────────────────────────────┐ │
│  Add member  │  │ table: member+presbyter, contacts·n, ministries,           │ │
│  Archived    │  │        subscription pills, attendance+date, status         │ │
│              │  └───────────────────────────────────────────────────────────┘ │
│ ──────────── │                                                               │
│ APPEARANCE   │                                                               │
│ [Fluent ▼] ◉ │                                                               │
└──────────────┴───────────────────────────────────────────────────────────────┘
  260 px / 56 px                     only scroll container
```

### 4.2 Rules

1. The header, sidebar and content slot are rendered once by `AppShell`. A routed page supplies only
   its page header, toolbar, body and footer.
2. The content slot is the only scroll container. The header and sidebar do not scroll with the page.
3. The sidebar is contextual: it shows the active top-level section's submenus. The section label
   (`SECTION / Members`) is visible when expanded and hidden when collapsed.
4. The sidebar toggle sits in the sidebar header. Collapsing keeps focus on the toggle, sets
   `aria-expanded="false"`, and exposes every icon with an accessible name and a tooltip.
5. The sidebar footer is pinned to the bottom. Expanded: accent dropdown and dark switch on one row,
   under an `APPEARANCE` overline. Collapsed: two 34 px icon buttons, stacked, with tooltips.
6. At ≤ 860 px the top-level cluster is replaced by a `Sections` menu button and the sidebar is a
   56 px rail. At ≤ 620 px summary cards stack. The page itself never scrolls horizontally; the table
   card may scroll internally.
7. The theme is applied at the root `FluentProvider`; the shell and every page use the same theme
   object. Theme is restored before first paint to avoid a light flash in dark mode.
8. A page that cannot reach the API still renders the shell; its content slot shows the connection
   state and a link to `#/connect`. The shell is never replaced by a full-screen error.

### 4.3 Navigation map

| Top-level   | Submenu             | Route                                       | Primary API calls                                                                 | V2 slice |
| ----------- | ------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Members     | All members         | `#/members`                                 | `GET /v1/members?status=active&include=attendance&seriesId=…`                     | 1        |
| Members     | Add member          | `#/members/new`                             | `POST /v1/members`                                                                | 1        |
| Members     | Archived            | `#/members/archived`                        | `GET /v1/members?status=archived`                                                 | 1        |
| Events      | Events              | `#/events`                                  | `GET /v1/events`                                                                  | 5        |
| Events      | Series              | `#/events/series`                           | `GET /v1/series`, `GET /v1/series/:id/occurrences`                                | 5        |
| Events      | Offerings           | `#/events/offerings`                        | V3 — not in V2                                                                    | V3       |
| Imports     | Member database     | `#/imports/members`                         | `POST /v1/imports/members`                                                        | 2        |
| Imports     | Attendance registry | `#/imports/attendance`                      | `POST /v1/imports/attendance`                                                     | 2        |
| Imports     | Template + format   | `#/imports/members`, `#/imports/attendance` | `GET /v1/imports/formats`, `GET /v1/imports/templates/{kind}`                     | 2        |
| Imports     | Batch lookup        | `#/imports/batches`                         | `GET /v1/imports/:batchId` (session list + lookup; see FR-38)                     | 2        |
| Shepherding | Officers            | `#/shepherding/officers`                    | `GET /v1/shepherding/report` (totals + per-officer rows)                          | 4        |
| Shepherding | Roster              | `#/shepherding/roster`                      | `GET /v1/shepherding/officers/:memberNo/members`                                  | 4        |
| Shepherding | Church report       | `#/shepherding/report`                      | `GET /v1/shepherding/report`                                                      | 4        |
| USSD        | Codes               | `#/ussd/codes`                              | `GET/POST /v1/events/:id/codes`, `POST /v1/codes/:id/void`                        | 24d B2   |
| USSD        | Registrations       | `#/ussd/registrations`                      | `GET /v1/registration-requests`, approve/reject                                   | 24d B2   |
| USSD        | Clocking            | `#/ussd/clocking`                           | `GET/POST /v1/events/:id/attendance`, delegations                                 | 24d B2   |
| USSD        | Headcount           | `#/ussd/headcount`                          | `GET/POST /v1/events/:id/headcounts`                                              | 24d B2   |
| USSD        | Offerings count     | `#/ussd/offerings`                          | `GET/POST /v1/events/:id/offering-counts`                                         | MVP      |
| USSD        | Activities          | `#/ussd/activities`                         | `GET /v1/events` + the member profile read                                        | 24d B2   |
| USSD        | Products            | `#/ussd/products`                           | `GET/POST/PUT /v1/subscription-products`                                          | 24d B2   |
| USSD        | Claims              | `#/ussd/claims`                             | `GET/POST /v1/subscriptions/:id/claims`                                           | 24d B2   |
| USSD        | Simulator           | `#/ussd/simulator`                          | `POST /dev/ussd/session` (development only; nav item hidden in production builds) | 24d B2   |
| Admin       | Ministries          | `#/admin/ministries`                        | `GET/POST/PUT/DELETE /v1/ministries`                                              | 3        |
| Admin       | API connection      | `#/connect`                                 | `GET /health` + `GET /v1/ministries` (probe)                                      | 0        |
| Admin       | Settings            | `#/settings`                                | local only (appearance, nav, sign out)                                            | 0        |

Slices 0–5 are all in V2: the shell and connect gate (0), Members (1), imports (2), attendance and
reference data (3), shepherding (4), and events with series (5). Offerings is visible only as a V3
placeholder and is not a shipped V2 screen. There is no other "coming next" section in the navigation.
Entity-scoped views — relationships, subscriptions, calls, reassignment — live inside the member or
roster detail, not as global sidebar items.

## Functional Requirements

`MUST` / `MUST NOT` / `SHOULD` / `MAY` are used as defined by RFC 2119.

### 5.1 Shell and navigation

- FR-1: Every page MUST render inside the single `AppShell`; no routed page may render its own
  global header, top navigation or sidebar.
- FR-2: The header MUST show the brand at the left, the top-level menus as a right-aligned
  cluster, and the account menu last. The active top-level menu MUST expose `aria-current="page"` and
  a visible active state that does not rely on colour alone.
- FR-3: Selecting a top-level menu MUST replace the sidebar with that section's submenus and
  select that section's first submenu. Selecting a submenu MUST update the content slot and the
  breadcrumb without a full page reload.
- FR-4: The sidebar MUST expand to 260 px and collapse to 56 px. The collapsed state MUST be
  persisted across reloads.
- FR-5: When collapsed, every submenu item and every footer control MUST remain operable by
  keyboard and MUST have an accessible name. Tooltips MUST NOT be the only accessible name.
- FR-6: Collapsing MUST keep focus on the collapse toggle and MUST set `aria-expanded`
  appropriately. Expanding MUST restore the labels and the full footer row.
- FR-7: The sidebar footer MUST contain an accent dropdown and a light/dark switch. Expanded, they
  MUST sit on one row; collapsed, they MUST remain available as two icon controls with tooltips.
- FR-8: At ≤ 860 px the top-level menus MUST become a single `Sections` menu; the sidebar MUST
  become the icon rail. At ≤ 620 px summary cards MUST stack.
- FR-9: Every page MUST show a `Section / Submenu` breadcrumb above its title.
- FR-9a: Every page's **action-row** verbs MUST be grouped in one `Actions` menu, placed at the right edge of
  the breadcrumb row. The MUST is scoped to that row: body, table-row and message-bar controls are not page
  actions, so a connection-state `Retry` stays where FR-10 puts it. The breadcrumb row spans the content width,
  so the menu never covers the page's title. The menu MUST be Fluent's own `Menu` with a `MenuTrigger`
  wrapping a Fluent `Button`: the trigger MUST be a **text button whose visible label is `Actions`** — the
  label is the name, so an icon-only trigger is not permitted, because a bare kebab is not legible enough to
  find (owner, 2026-11-13) — and it MUST expose `aria-haspopup` and, while open, `aria-expanded`: both are
  supplied by the Fluent trigger rather than hand-wired, and the closed state is that attribute's **absence**,
  which is what Fluent's `MenuTrigger` renders. A hand-set `aria-expanded="false"` is not required and MUST
  NOT be added, because it would fight the library's own state. Every item MUST be a
  Fluent menu item whose
  name, icon and **disabling condition** are the ones the button it replaced had: the spec fixes the condition,
  not the button, so the item's state stays derivable after the button is gone. Items are ordered create-side
  verbs (create, import), then edit-side verbs, then a separator, then destructive verbs. `Refresh` is never an item: it is a utility outside the menu.
  Verbs outside those buckets are placed by function (owner, 2026-11-13): an import with the create-side
  verbs, a contacts action with the edit-side verbs, and `Purge` last in the destructive group, after
  archive/restore; `New session` starts a session rather than re-reading the page, so it is a create-side
  verb and renders visibly rather than as an icon. A `Back` control to the parent list is navigation, not an action: it stays visible, left of the menu
  (owner, 2026-11-13). Filters, date windows and view switches stay visible in the page header — on the left
  of the action row where the page puts them there, and on their own row below the title where D8's layout
  does — so they are read at a glance; they are never inside the menu and never to its right (owner,
  2026-11-13). At 860 px and below the menu stays at the breadcrumb row's right edge; where the row wraps,
  it wraps below the breadcrumb and stays right-aligned, with the trigger's visible label intact (owner,
  2026-11-13).
  Filters, date windows and view switches MUST NOT be moved into that menu: they hold state the operator reads
  at a glance. A page with no verb action MUST NOT render the menu and leaves the slot empty. When a page
  renders no menu, its remaining header controls keep the trailing edge of that row, so a control never moves
  merely because a page has no verbs. **One page verb renders as a visible control; two or more group into
  the menu.** A page with exactly one verb MUST render that verb as a button in the action row rather than
  as a one-item menu, and a page with two or more MUST keep them in one `Actions` menu (owner, 2026-11-14:
  "do not use the actions top menu for a single page action button"). A `Refresh`-class control is not a
  verb but a **surface utility**: it renders as a bare icon button at the trailing edge of that row, alone
  or beside the menu, is never an item in the menu, and is never counted towards the two-or-more rule - so
  a page whose only control is `Refresh` shows the icon and renders no menu. A form's
  commit/cancel pair — whatever its labels — is **not** a page action: it is the form's commit control, it
  stays visible where it is, and a page whose action row holds only those MUST NOT render the menu (owner,
  2026-11-13: "main page action buttons like these do not apply").
- FR-10: The shell MUST render when the API is unavailable, with a non-blocking connection state
  in the content slot and a link to `#/connect`.

### 5.2 Connection and session

- FR-11: With no verified session, every content route MUST redirect to `#/connect`. The shell
  MUST remain visible around the sign-in form.
- FR-12: The connect form MUST collect only the officer's email. The gateway origin MUST be fixed at
  the time the UI is built, MUST NOT be user-editable or displayed, and MUST be the only gateway
  origin the UI contacts. The form MUST NOT have a gateway-URL field, a gateway-origin caption, a
  bearer-token field, an actor-id field or a password field. It MUST verify reachability with the
  gateway health probe before requesting a link, and a failed probe MUST show "The service is
  unreachable. Try again in a moment; if it persists, contact the administrator."
- FR-13: The configured origin MUST be normalised at build time, in `vite.config.ts`, on the same
  value that generates `connect-src`: it is trimmed, a trailing slash is stripped, and a path, a
  query, a fragment and credentials are rejected. It MUST be `https://`, except `http://` for a
  loopback host in a development build, where it defaults to `http://localhost:3000`. A production
  build MUST set `VITE_GATEWAY_URL` explicitly (`deploy-pages.yml` does) and MUST fail when it is
  missing, invalid or not `https://`; the duplicated hard-coded default constants in `vite.config.ts`
  and `src/auth/session.ts` are removed. No runtime value, browser storage entry or user input may
  change the origin (FR-12). `normalizeGatewayUrl`, `readStoredGatewayUrl`,
  `writeStoredGatewayUrl` and `GATEWAY_STORAGE_KEY` are removed, and a stale `mr.gateway.v1` entry is
  cleared on load and never read.
- FR-14: Sign-in MUST be a single-use magic link sent to an active officer. The request MUST return
  the same response and timing shape for a known, unknown or inactive address, so the page cannot be
  used to enumerate officers.
- FR-15: The gateway returns a short-lived, revocable session credential. It MUST be stored in
  `sessionStorage` only, MUST NOT be the API bearer, and MUST NOT be written to `localStorage`,
  IndexedDB, a cookie, the URL, application logs, analytics or the build bundle.
- FR-16: Every data request MUST go to the gateway and send `Authorization: Bearer <session>`. The UI
  MUST NOT send `X-Actor-Id`; the gateway derives it from the session and ignores a client-supplied
  value.
- FR-17: A `401` or `403` from the gateway MUST clear the session and navigate to
  `#/connect?reason=expired` with a visible explanation. Other requests must not be retried with the
  rejected credential.
- FR-18: Sign out MUST call the gateway logout endpoint (revoking the session), clear
  `sessionStorage`, clear the TanStack Query cache and navigate to `#/connect`.
- FR-19: The gateway origin is fixed at build time (FR-12, FR-13) and MUST NOT be prefilled from or
  written to storage. The session credential MUST NOT persist across browser sessions. Reconnecting
  MUST preserve accent, scheme and sidebar preferences.

### 5.3 Members

- FR-20: The member list MUST page through `GET /v1/members` using `q`, `contact`, `status`
  (`active` / `archived` / `all`), `seriesId`, `limit` and `cursor`, and MUST keep the query state in
  the URL so a filtered view can be linked and restored. It MUST use cursor pagination and MUST NOT
  display a total count or page number: the API returns `nextCursor`, not a total.
- FR-21: Search MUST debounce by 300 ms, MUST cancel or ignore stale responses, and MUST show an
  empty state that distinguishes “no matches” from “no data”.
- FR-22: The list MUST show member number, name, **presbyter status**, a `Contacts · n` action (never
  contact values), ministries, **compact subscription pills**, attendance for the selected series
  with a **bare last-attended date**, and active/archived status. The attendance and subscriptions
  summaries MUST be backed by the list aggregates in FR-69/FR-75; the UI MUST NOT issue one request
  per row.
- FR-22a: Every member identity MUST render the shared label `FullName (Gender, Ny)` — for example
  `Ama Mensah (Female, 32y)` — using `firstName + lastName` (the existing `memberName` convention), the
  capitalised gender (`Male`, `Female`, `Other`), and the API's derived `age`. `undisclosed` gender is
  omitted, a null age is omitted, and both missing leaves the name alone: `Name (Male)`, `Name (32y)`,
  `Name`. The label applies to the members list, contact lookup, the detail heading and overview, the
  contacts dialog, member pickers, relationships, the shepherding roster/officers/report and their
  dialogs, event attendance rows and confirmations, subscription policyholder sentences (the current
  member's detail, not the subscription DTO), and archive/end-assignment confirmations. Avatars keep
  plain-name initials, breadcrumbs keep the member number, and Add/Edit keeps its form fields.
  `otherNames`, `alias` and `maidenName` never enter the label. The visible label MUST also be the
  accessible name wherever an action names a member. On the overview the heading carries gender and
  age, so the separate Gender field is removed; the Date of birth field stays. A picker MAY append the
  member number when two options share a name; the number is a tie-breaker, never a second label.
  A picker MAY also use the **compact variant** — member number, then `FullName (code, age)`, for example
  `M-1042 · Adjoa Mensah (M, 12y)` — with one-letter gender codes (`M`, `F`, `O`), a visible `–` where a
  part is unknown, and `Nm` below twelve completed months against `Ny` from twelve. A picker's list exists
  to keep two same-named members distinguishable, and the omission form above would collapse them into
  identical labels; the capitalised, omission form therefore remains the rule everywhere else, and this
  compact variant is a picker-only exception.
- FR-23: Selecting a row MUST open `#/members/:memberNo` with the full detail DTO (identity,
  contacts, ministries, subscriptions, relationships, attendance per series, shepherding summary).
- FR-24: Create MUST collect the fields in `createMemberSchema`, mirror its client-side constraints
  and POST to `/v1/members`. On `201` the UI MUST navigate to the member using the `Location` header
  or the returned `memberNo`.
- FR-25: Edit MUST prefill from the detail DTO and MUST send the read `ETag` as `If-Match` on
  `PUT /v1/members/:memberNo`.
- FR-25a: The member detail/form MUST expose the back-office fields `presbyterRank` (shown only when
  the presbyter flag is on; an integer ≥ 1), `membershipCardNo` (1–32 trimmed characters) and `verified`
  (a checkbox that maps to the API's boolean and shows `verifiedAt` read-only). Clearing the presbyter
  flag MUST clear the rank in the same update. These fields are never shown on the members list.
- FR-26: A `409` on edit MUST NOT overwrite. The UI MUST show a conflict dialog offering “reload
  latest” and “keep my changes” (copy or reopen after reload).
- FR-27: Archive MUST require confirmation, call `DELETE /v1/members/:memberNo`, remove the row
  from active views and show the archived state on the detail page. Restore MUST call the restore
  endpoint and return the member to active views.
- FR-28: Purge MUST require the operator to type the exact member number, MUST display an
  irreversible PII-erasure warning, and MUST call `POST …/purge` with `{ confirm: memberNo }`.
- FR-29: Contacts, ministries, relationships and subscriptions MUST be editable from the detail
  page using their documented endpoints. Relationships and subscriptions MUST live in member-detail
  tabs or a member-scoped route, not in the global sidebar; the sidebar carries only section-level
  views. A successful mutation MUST invalidate the member detail and the relevant list query.
- FR-30: Attendance MUST be shown per series as `attended` / `expected` / `remaining` plus entries.
  Recording attendance MUST send `{ eventId, date }` to the event attendance endpoint; a `422`
  because the date is not one of the event's sessions MUST be shown inline, not as a generic error.
- FR-31: Removing an attendance row MUST confirm, call the delete endpoint, and refresh the series.
  Imported rows are deletable and the API suppresses re-import; the UI MUST NOT imply a hard delete.
- FR-32: The UI MUST NOT offer hard delete for members or any entity whose API preserves history.

### 5.4 Imports

Mock: local `mockups/v2-imports/` (git-ignored; 1440×1150), screens `01-members-import.png`,
`02-attendance-import.png` and `03-import-preview-errors.png`.

- FR-33: V2 MUST accept **CSV** and the downloaded **Excel template** (`.xlsx`) for the member database
  and the attendance registry, parse them client-side into the API's JSON row shapes, and show a
  preview before sending. JSON upload MAY be offered as an advanced option (**Q8**).
- FR-34: The preview MUST show the parsed row count, the first five rows, and row-level validation
  errors. No request may be sent until the operator confirms.
- FR-35: The UI MUST enforce the API limits: at most **10,000 rows** and at most **1,048,576 bytes**
  of serialised JSON per request. Larger files MUST be rejected with guidance to split the file. The
  UI MUST NOT chunk automatically, because chunking breaks the API's all-or-nothing guarantee.
- FR-36: A confirmed import MUST POST to `/v1/imports/members` or `/v1/imports/attendance` and MUST
  show the returned batch id, kind, row count, checksum and created time.
- FR-36a: The attendance import MUST be scoped to **one event session chosen before the upload** — a
  picker on the screen, or a deep link from the event detail that carries the event and date. The chosen
  occurrence MUST be visible before commit, and the file's optional `datetime` column MUST be checked
  against it. The UI MUST NOT offer a per-row event column.
- FR-37: On `import_failed`, the UI MUST show the API message and, when present, the unknown member
  numbers or the row whose `datetime` does not match the selected session, with their row numbers. A
  second capture of the same occurrence and rows is accepted, not reported as a duplicate: live
  captures repeat and each is a new observation. The register MUST remain unchanged when a row fails
  (all-or-nothing).
- FR-38: Batch lookup MUST be a session-scoped list of batch ids created by this browser, plus a
  `batch id` lookup via `GET /v1/imports/:batchId`. The API has no list-batches endpoint; the UI MUST
  NOT claim to show server-side history.
- FR-39: The UI MUST discard file contents and parsed rows after a successful import; only the
  batch id, kind, row count and timestamp may remain in `sessionStorage`.
- FR-40: Import controls MUST disable while a request is in flight and MUST prevent double submit.
- FR-41: Each import screen MUST show its expected columns from `GET /v1/imports/formats` and offer a
  **Download Excel template** action backed by `GET /v1/imports/templates/{kind}`. If the template
  cannot be fetched, the screen MUST show the same column list inline, not a blank or generic error.

### 5.5 Reference data

- FR-41: Ministries MUST be listable, creatable and renameable; `code` MUST be immutable; a `409`
  while referenced MUST be shown with the reference reason.
- FR-42: Series MUST be listable, creatable, editable and archivable, including adding a schedule
  version and adding/removing exceptions. `Events` owns event and series management; `Admin` owns
  ministries and other reference data. The retired `Attendance` screens MUST NOT be duplicated.
- FR-43: Occurrences MUST be requested from `GET /v1/series/:id/occurrences` for a date window; the
  UI MUST NOT recompute RRULEs locally.
- FR-44: An import MUST NOT create or modify series, events, sessions or members — it writes attendance
  against an existing session only. An unknown event, member or session surfaces as an import error
  matching the API contract.

### 5.6 Shepherding

- FR-58: The Shepherding home MUST use `GET /v1/shepherding/report` with the selected `from` / `to`
  window and show church totals (officers, active, assigned, unassigned, attempts, conversations,
  never called), coverage and one row per officer.
- FR-59: Selecting an officer MUST open their roster from
  `GET /v1/shepherding/officers/:memberNo/members` with the same window. The roster MUST show member
  identity, a contacts action and count (never inline contact values), residence, attempts,
  conversations, `lastCalledOn`, `lastOutcome`, `stillInChurch`, `latestFeedback` and `latestIssue`.
- FR-59a: The roster MUST show the officer's **identity card** — name, member number, gender, age — and
  above the table five count tiles: **Assigned** (the active assignments in the roster read), **Attempts**
  and **Conversations** (summed over those assignments, not counted as members with any), **Never called**
  (rows whose `lastCalledOn` is null) and **Follow-ups** (rows never called or quiet more than 30 days —
  exactly FR-60's condition, of which Never called is the null-only subset). All five MUST be computed from
  the one roster read FR-59 requires, over the **full read** rather than the filtered view, and never by a
  second request. While that read is pending the tiles show a skeleton; on failure they are
  suppressed in favour of the roster's error message. A zero count MUST render as `0`, never as a hidden
  tile. The table MUST offer a **search** over member name and member number only — client-side over the
  same read, combined with the active filter as an AND, resetting neither the filter tab nor the date
  window. Contact values MUST NOT be searchable or matched: FR-78/FR-79 keep them off this surface. A row
  MUST show **"Never called"** when `lastCalledOn` is null and **"Quiet {n}d"** when the UTC day difference
  exceeds 30 — the same condition FR-60's filter uses, so badge and filter cannot disagree — and otherwise
  the plain date with no badge. Row actions — Contacts, Reassign and End — MUST sit in one Fluent `Menu`
  overflow on the row, with **Log call** remaining the row's visible primary action; a row control is not a
  page action and MUST NOT enter FR-9a's menu. The footer MUST state how many assignments are **in view** —
  the filtered and searched count, deliberately distinct from the Assigned tile's total. The mock's "sample
  rows" caveat is mock-only text and MUST NOT ship. The filter keeps FR-60's label, **"Follow-up"**; the
  mock's "Quiet > 30 days" label is retired.
- FR-60: Follow-ups MUST be a roster filter (never called, or last called more than 30 days ago).
  A global cross-officer follow-up queue is not exposed by the API and the UI MUST NOT imply one; the
  church report shows aggregate counts only.
- FR-61: "Log call" MUST POST `/v1/shepherding/assignments/{assignmentId}/calls` with `calledOn`,
  `outcome`, `stillInChurch` (required when `outcome = reached`), `feedback` and `issue`. A `201`
  MUST invalidate the roster and report queries.
- FR-62: Calls are append-only. The UI MUST NOT offer edit or delete; a correction is a new call. Two
  attempts on the same day are two rows, and the UI MUST NOT auto-retry a call `POST`.
- FR-63: "Reassign" MUST POST `/v1/shepherding/assignments` with `officerMemberNo`, `memberNo`,
  `replaceAssignmentId` and a `reason` of 3–500 characters. A `409` with a `currentAssignment`
  extension MUST show who currently shepherds the member and require confirmation before retry.
- FR-64: Ending an assignment MUST DELETE `/v1/shepherding/assignments/{assignmentId}` after
  confirmation. The history remains readable; the UI MUST NOT imply deletion of the pastoral record.
- FR-65: The UI MUST refuse an assignment when the member is archived or purged, the officer is not
  an active presbyter, or the member would shepherd themselves; it MUST surface the API `409`/`422`.
- FR-66: Member detail MUST show `GET /v1/members/:memberNo/shepherding`: current shepherd,
  assignment history, recent calls and current `stillInChurch`.
- FR-67: Shepherding date windows and `calledOn` values MUST be UTC dates; `calledOn` MUST NOT be in
  the future or before `assignedOn`. The UI MUST validate this before submitting.

### 5.7 Appearance

- FR-45: The accent dropdown MUST offer Fluent, Ocean, Meadow and Plum. The switch MUST toggle
  light/dark.
- FR-46: On first visit the scheme MUST follow `prefers-color-scheme`; after an explicit choice the
  stored choice MUST win. The scheme MUST be applied before first paint.
- FR-47: Theme and sidebar preferences MUST persist in `localStorage` under versioned keys and MUST
  be restored without a flash of the other scheme.
- FR-48: Every colour, spacing, radius, shadow and type style MUST come from Fluent tokens. The only
  literal colours allowed are the theme-swatch previews.
- FR-49: Both schemes MUST meet WCAG 2.2 AA contrast for body text, large text, controls, focus
  indicators and the active navigation state. The Ocean, Meadow and Plum brand ramps are monotonic
  families (luminance rises with the Fluent index) and every stop Fluent uses as a brand background
  with white text meets 4.5:1 in both schemes; their mid-tones were darkened from the original
  previews because the previous 70/80 stops failed AA. `ui/src/theme/brand.test.ts` enforces both
  properties.
- FR-50: The collapse animation MUST be skipped when `prefers-reduced-motion: reduce` is set.

### 5.8 States and errors

- FR-51: Every asynchronous surface MUST implement loading, empty, error and success states.
- FR-52: `application/problem+json` MUST be parsed for every non-2xx response. Mapping: `401` →
  reconnect; `404` → not-found surface; `409` → conflict dialog; `422` → inline field or import error;
  `5xx` → retryable error with the status and detail.
- FR-53: Errors MUST be announced to assistive technology and MUST NOT expose stack traces, SQL or
  tokens.
- FR-54: Destructive actions MUST confirm; purge MUST require the typed member number (FR-28).
- FR-55: Success toasts MUST auto-dismiss after 5 seconds; error messages MUST persist until
  dismissed.
- FR-56: Optimistic updates MAY be used only when reversible. Writes otherwise wait for the server
  and then invalidate the affected queries.
- FR-57: No PII may appear in a toast, URL, console log or analytics event.
- FR-68: Shepherding MUST ship in V2, not as a deferred "coming next" section, and MUST use the
  API's shepherding contracts as written. The UI MUST NOT compute coverage, current status or call
  totals client-side from partial pages.
- FR-69: The Members attendance column and the separate Archived view MUST be backed by an amended
  `GET /v1/members` (`status=active|archived|all`, `include=attendance`, `seriesId`). Until that
  amendment ships, the UI MUST show an explicit "attendance not available" state and MUST NOT
  fabricate attendance figures or totals.
- FR-70: The grid MUST show a text `Presbyter` badge when `isPresbyter` is true. The badge MUST NOT
  rely on colour alone, and non-presbyters MUST not be marked.
- FR-71: The Add member page MUST collect member number, names, gender, date of birth, contact,
  residence, joined date, presbyter flag and ministries; it MUST submit `POST /v1/members` and
  navigate to the new member using the `Location` header or returned `memberNo` on `201`. A duplicate
  member number (`409`) MUST keep the form open and focus the member-number field.
- FR-72: The member-scoped subscriptions surface MUST list every subscription where the member is
  policyholder or currently covered, showing kind, scope, role, reference, started/ended dates,
  status and coverage count. Ending a subscription MUST call the delete endpoint, which soft-ends it;
  the UI MUST NOT offer a hard delete.
- FR-73: Adding a subscription MUST send `POST /v1/members/:memberNo/subscriptions` with `kind`,
  `scope`, optional `reference`, `startedOn` and, for household scope, `coveredMemberNos`. Individual
  scope MUST NOT accept coverage.
- FR-74: Adding coverage MUST send `POST /v1/subscriptions/:id/coverage` with `{ memberNo }`; removing
  it MUST call `DELETE /v1/subscriptions/:id/coverage/:memberNo`. Coverage is household-only; adding
  a duplicate member is `409`, and removing a member records `removedOn`.
- FR-75: The grid subscriptions summary MUST be backed by `include=subscriptions` on
  `GET /v1/members`, returning a compact `SubscriptionSummary` per row (id, kind, scope, status, role,
  policyholderMemberNo, coveredCount). The UI MUST NOT fetch each member's detail to build the column.
- FR-76: `attendance.lastAttendedOn` MUST be the latest attended date inside the same series window,
  or `null`. The grid MUST show one compact line, `attended/expected (DD-Mon-YY)` (for example
  `4/5 (26-Oct-26)`), and MUST NOT show a separate last-attended line. The tooltip on that line names
  the series and the full date; for `null` it says "No attendance yet". The UI MUST NOT infer a date
  from the imported rows or the current date.
- FR-77: Grid pills MUST be compact. A subscription pill MUST show only the kind (`Life`,
  `Credit union`); the full description (kind, scope, role, policyholder/covered, coverage count,
  ended date) MUST live in a tooltip. At most two pills are visible, with `+N` opening a popover for
  the rest. The attendance cell MUST show one compact line, `attended/expected (DD-Mon-YY)` (for
  example `4/5 (26-Oct-26)`), above the bar; there is no second date line. The tooltip on that line
  names the series and the full last-attended date. No "Attended", "Last attended", "Household",
  "covered by" or similar visible sentence.
- FR-78: `GET /v1/members` MUST NOT return contact values. It MUST return `contactCount`; a new
  `GET /v1/members/:memberNo/contacts` returns the contact list only when the operator opens the
  contacts dialog. The grid MUST show `Contacts · n` (the dot vertically centred) as the explicit
  action; the dialog MUST group by kind, show owner/linked status, and be read-only (no copy or edit).
  The member detail MAY show contacts because opening the member is already an explicit action.
- FR-79: The main search MUST cover name or member number only. Contact lookup MUST be a separate
  `Find by contact` dialog; the entered value MUST NOT be written to the URL, `localStorage`,
  `sessionStorage` or analytics. The API still accepts the `contact` query parameter for that
  explicit search.
- FR-80: API request logging MUST NOT persist raw query strings. `q` and `contact` values MUST NOT
  appear in logs; log the route template/path without the query, or redact the sensitive parameters.
  This is a prerequisite for treating contact search as protected.
- FR-81: Tooltips MUST have an accessible trigger: focusable, `aria-label` or `aria-describedby` with
  the full description, and a click/tap path (popover or equivalent) for touch. A hover-only tooltip
  on a non-focusable span is non-conformant. The presbyter badge keeps its one-word label and gains a
  tooltip for "eligible to hold a shepherding roster".

## Non-Functional Requirements

- **NFR-1 Accessibility** — WCAG 2.2 AA. Full keyboard operation, visible focus, 200 % zoom with no
  loss of function, correct table semantics, reduced-motion support, and accessible names on every
  icon-only control.
- **NFR-2 Performance** - On a mid-tier laptop over 4G, the shell MUST reach LCP ≤ 2.5 s; initial
  route JavaScript SHOULD be ≤ 300 KB gzip; CLS MUST be ≤ 0.1; rendering 100 table rows SHOULD take
  ≤ 100 ms. Routes MUST be code-split; Fluent UI must not be duplicated across chunks. The list
  attendance and subscriptions aggregates MUST be batched queries; a 25-row page MUST NOT issue
  per-row attendance or subscription requests.
- **NFR-3 Security** - No API bearer in the bundle, browser storage or a URL. Only a short-lived
  session credential may sit in `sessionStorage`. Contact values MUST NOT be in the members list
  response; they are fetched only from the contacts endpoint after an explicit action. Query strings
  containing `q` or `contact` MUST NOT be written to logs. No third-party script by default. A meta
  Content-Security-Policy MUST at least restrict `default-src`/`connect-src` to the app and the
  configured gateway; Griffel's injected styles require a documented `style-src` exception.
  Dependencies MUST pass `npm audit` in CI.
- **NFR-4 Privacy** — No member or contact data in `localStorage`, IndexedDB, cookies, analytics or
  logs. Server data lives in memory only; sign-out clears it. Contact values exist only in the
  contacts dialog's in-memory response, are not copied to the clipboard from the landing page, and
  are not persisted. The UI MUST respect the API's `Cache-Control: no-store`.
- **NFR-5 Reliability** - Idempotent GETs MAY retry twice with backoff. Writes MUST NOT auto-retry.
  An expired session, a stale ETag and a validation failure MUST all have a defined recovery path.
- **NFR-6 Responsiveness** — The shell MUST work from 360 px to 1920 px without page-level horizontal
  scrolling. The table MAY scroll inside its card.
- **NFR-7 Browser support** — Current and previous major versions of Edge, Chrome, Firefox and Safari.
  No Internet Explorer.
- **NFR-8 Deployability** — `npm run ui:build` produces a static `dist/` deployable to GitHub Pages
  with no server runtime. Deep links MUST work via hash routing. The build MUST be reproducible from
  a clean `npm ci`.
- **NFR-9 Testability** — Vitest + React Testing Library for components, MSW for the API, and
  Playwright for the shell, connect gate, one CRUD/import path, the shepherding call/reassign flows,
  the contacts dialog, the find-by-contact dialog and the compact tooltip/focus behaviour. Tests MUST
  NOT touch the production API.
- **NFR-10 Observability** — A top-level error boundary MUST catch render failures and offer reload.
  Client error reporting MUST be opt-in via `VITE_SENTRY_DSN`; default builds send nothing.
- **NFR-11 Maintainability** — TypeScript `strict`, ESLint, Prettier and no `any` in application code.
  Wire types SHOULD be generated from `GET /openapi.json` (see Q9).
- **NFR-12 Theme stability** — Restoring the theme MUST NOT flash light mode before dark, and MUST NOT
  cause a layout shift when the accent changes.

## Acceptance Criteria

Each criterion is testable and references at least one requirement.

### AC-1: **Given** any routed page, **When** it renders, **Then** it is inside one header/sidebar/content shell and the page does not render its own global chrome. (FR-1)

### AC-2: **Given** the shell, **When** the viewport is ≥ 861 px, **Then** the top-level menus are a right-aligned cluster with the active item both visually distinct and `aria-current="page"`. (FR-2, NFR-1)

### AC-3: **Given** the `Members` section, **When** the operator selects `Imports`, **Then** the sidebar shows the Imports submenus, the first Imports submenu is selected, and the breadcrumb updates. (FR-3, FR-9)

### AC-4: **Given** the expanded sidebar, **When** the operator collapses it, **Then** it is 56 px, labels are hidden, every icon has an accessible name and tooltip, focus stays on the toggle, and the state survives a reload. (FR-4, FR-5, FR-6, NFR-1)

### AC-5: **Given** the sidebar footer, **When** the operator changes the accent and toggles dark mode, **Then** every surface updates, the preferences survive a reload, and no light flash occurs on a dark reload. (FR-7, FR-45, FR-46, FR-47, NFR-12)

### AC-6: **Given** no session, **When** the operator opens `#/members`, **Then** the app redirects to `#/connect`, keeps the shell visible and does not send data requests. (FR-11)

### AC-7: **Given** the sign-in form, **When** the address is unknown or inactive, **Then** the response is identical to a known address, no session is created, and no field reveals whether the officer exists. (FR-14)

### AC-8: **Given** a valid session, **When** any data request is inspected, **Then** it goes to the gateway with the session credential and no `X-Actor-Id`, and the gateway forwards the derived actor. (FR-16)

### AC-9: **Given** a saved session, **When** any request returns `401` or `403`, **Then** the session is cleared and the operator lands on `#/connect?reason=expired`. (FR-17)

### AC-10: **Given** the production build, **When** the bundle and browser storage are searched, **Then** the API bearer is absent everywhere, no token field exists, and only a short-lived session credential is in `sessionStorage`. (FR-12, FR-15, NFR-3, NFR-4)

### AC-10a: **Given** the production build, **When** the connect page is rendered and the bundle inspected, **Then** there is no gateway-origin input or caption, `connect-src` lists `'self'` and the configured origin, and a `mr.gateway.v1` entry left by an earlier build is cleared and cannot change the origin. (FR-12, FR-13)

### AC-10b: **Given** `npm run ui:build` with `VITE_GATEWAY_URL` unset, not `https://`, or carrying a path, a query, a fragment or credentials, **When** the build runs, **Then** it exits non-zero and no artifact is produced. (FR-13)

### AC-11: **Given** the member list, **When** the operator searches, pages, or toggles archived, **Then** the URL reflects the query and the results come from the API, not a client-side copy of the register. (FR-20, FR-21, FR-22)

### AC-11a: **Given** a member with a known gender and date of birth, **When** any member identity is rendered, **Then** it reads `FullName (Gender, Ny)`; a missing gender or age omits that part without a placeholder, and the overview does not repeat a separate Gender field. (FR-22a)

### AC-12: **Given** a member row, **When** it is opened, **Then** the detail shows contacts, ministries, subscriptions, relationships and attendance per series. (FR-23, FR-30)

### AC-13: **Given** the create form, **When** the member number already exists, **Then** the `409` is shown against the member-number field and no duplicate is created. (FR-24)

### AC-14: **Given** an open edit form, **When** the record changed on the server, **Then** the `409` opens a conflict dialog and the UI does not silently overwrite. (FR-25, FR-26)

### AC-15: **Given** an active member, **When** the operator archives and then restores, **Then** the member leaves and returns to active views and history is preserved. (FR-27, FR-32)

### AC-16: **Given** the purge action, **When** the typed member number does not match, **Then** the purge button stays disabled; a correct match sends `{ confirm }` and navigates away on `204`. (FR-28)

### AC-17: **Given** an event, **When** attendance is recorded for a date that is not one of its sessions, **Then** the API `422` is shown inline and the attendance counts do not change. (FR-30)

### AC-18: **Given** a CSV with 10,001 rows or a serialised body over 1,048,576 bytes, **When** it is selected, **Then** the UI rejects it with split guidance and sends no request. (FR-35)

### AC-19: **Given** a valid member or attendance import, **When** it is confirmed, **Then** the batch id, kind, row count, checksum and created time are shown and the file contents are discarded. (FR-36, FR-39)

### AC-20: **Given** an attendance file whose `datetime` falls on a different date from the selected session, **When** it is imported, **Then** the UI lists the offending rows against the chosen session and the register is unchanged. (FR-36a, FR-37)

### AC-21: **Given** a previous import in this tab, **When** `Batch lookup` is opened, **Then** the batch appears in the session list and its id resolves through `GET /v1/imports/:batchId`. (FR-38)

### AC-22: **Given** a ministry referenced by a member, **When** deletion is attempted, **Then** the `409` is shown and the ministry remains. (FR-41)

### AC-23: **Given** a 360 px viewport, **When** the shell renders, **Then** the top navigation collapses to `Sections`, the sidebar is a rail, summary cards stack, and the page has no horizontal scroll. (FR-8, NFR-6)

### AC-24: **Given** keyboard-only operation, **When** the operator traverses the header, sidebar, toolbar and table, **Then** every action is reachable, focus is visible, and icon-only actions are announced. (NFR-1, FR-5)

### AC-25: **Given** a GitHub Pages deploy, **When** `#/members/M-1001` is opened directly, **Then** the app loads that route without a 404. (NFR-8)

### AC-26: **Given** a successful sign-out, **When** the browser storage and query cache are inspected, **Then** the session credential and member data are gone and the gateway session is revoked. (FR-18, NFR-4)

### AC-27: **Given** a saved session, **When** the tab reloads, **Then** the accent, scheme and sidebar state are restored, the session credential is read only from `sessionStorage`, and the API bearer is nowhere in browser storage. (FR-15, FR-19, FR-47)

### AC-28: **Given** ministries and series, **When** the operator creates a ministry, renames it, creates a series, adds a schedule version and an exception, **Then** the lists reflect the changes and a referenced ministry delete shows `409`. (FR-41, FR-42, FR-43)

### AC-29: **Given** the API is stopped or CORS rejects the origin, **When** the shell loads, **Then** it still renders, the content shows a connection error with a retry and a link to `#/connect`, and the sidebar and theme remain usable. (FR-10, `EC-1`)

### AC-30: **Given** a `422` and a `500`, **When** the operator submits a form or import, **Then** each error is announced, submit cannot double-fire, a success toast auto-dismisses after 5 s, an error persists until dismissed, and no PII appears in a toast, log or URL. (FR-40, FR-51–FR-57)

### AC-31: **Given** a member detail, **When** the operator adds a contact, assigns a ministry, links a relationship and adds a subscription, **Then** each mutation invalidates the detail and list queries, and no surface offers hard delete. (FR-29, FR-31, FR-32)

### AC-32: **Given** the Members list with a selected series, **When** it renders, **Then** each row shows attendance from the list-level aggregate (`include=attendance&seriesId=…`), changing the series refetches once, and no per-row attendance request is issued. (FR-22, FR-69)

### AC-33: **Given** the Archived view, **When** it opens, **Then** it requests `status=archived`, shows archived members, and uses cursor pagination without a total count or page number. (FR-20, FR-69)

### AC-34: **Given** the Shepherding home, **When** it loads or the date window changes, **Then** the church totals, coverage, unassigned count and officer rows match `GET /v1/shepherding/report`. (FR-58)

### AC-35: **Given** an officer row, **When** it is opened, **Then** the roster shows that officer's active assignments with a contacts action and count (never values), counts, last outcome and current status; the follow-up filter narrows to never called or quiet > 30 days. (FR-59, FR-60)

### AC-35a: **Given** an officer's roster whose read has completed, **When** it renders, **Then** the officer card and the five count tiles show the full-read figures (Assigned as the read's active assignments, Attempts and Conversations as sums, Never called as the null-only subset, Follow-ups as FR-60's condition), a search narrows by member name or member number without changing the filter tab or the window, a never-called or quiet row carries its badge while a 30-day row carries none, and the row's one Fluent menu holds Contacts, Reassign and End with Log call still visible. (FR-59a)

### AC-36: **Given** an active assignment, **When** the operator logs a reached call, **Then** `stillInChurch` is required, the `POST` creates a call, the roster and report refresh, and no edit or delete action exists. (FR-61, FR-62, FR-67)

### AC-37: **Given** a member already assigned, **When** the operator reassigns without the current `replaceAssignmentId` or reason, **Then** the API `409` with `currentAssignment` is shown, the current shepherd is named, and a retry requires confirmation. (FR-63, FR-65)

### AC-38: **Given** an active assignment, **When** the operator ends it, **Then** confirmation is required, the `DELETE` succeeds, and the assignment history remains readable. (FR-64)

### AC-39: **Given** a member detail, **When** it opens, **Then** the shepherding tab shows the current shepherd, assignment history, recent calls and current status from `GET /v1/members/:memberNo/shepherding`. (FR-66)

### AC-40: **Given** a call on an ended assignment, a future `calledOn`, or a non-presbyter officer, **When** the operator submits, **Then** the API `409`/`422` is shown inline and nothing is written. (FR-61, FR-65, FR-67)

### AC-41: **Given** the Members grid, **When** it renders, **Then** each presbyter shows a text `Presbyter` badge, the subscriptions column shows the member's policy/coverage summary, and attendance is one line `4/5 (26-Oct-26)` above the bar with no second date line. (FR-22, FR-70, FR-76)

### AC-42: **Given** the Add member page, **When** the operator submits required fields, **Then** `POST /v1/members` succeeds with `201`, the UI navigates using `Location`, and a duplicate member number keeps the form open with a `409` on that field. (FR-71)

### AC-43: **Given** a member with subscriptions, **When** the subscriptions surface opens, **Then** every policy where they are policyholder or covered is listed with kind, scope, role, reference, dates, status and coverage count; ending one soft-ends it and the record remains. (FR-72)

### AC-44: **Given** the Add subscription dialog, **When** household scope is chosen, **Then** the request includes the selected `coveredMemberNos`; individual scope sends no coverage and the dialog does not offer coverage. (FR-73)

### AC-45: **Given** a household policy, **When** coverage is added or removed, **Then** the coverage list updates from the API, a duplicate add shows `409`, a non-household add shows `422`, and removal records `removedOn`. (FR-74)

### AC-46: **Given** a 25-row Members page, **When** the grid loads, **Then** the subscriptions summary comes from one `include=subscriptions` query and no per-member detail request is issued. (FR-75)

### AC-47: **Given** the Members grid, **When** it renders, **Then** no contact value appears; each row shows `Contacts · n` with the dot vertically centred, and opening it groups phone/email/WhatsApp values with owner/linked status. The list response carries `contactCount`, not values. (FR-78)

### AC-48: **Given** the main search, **When** the operator searches, **Then** only name parts (first, last, other names, alias, maiden name) or member number is accepted; contact lookup uses `Find by contact`, and the entered value is absent from the URL, web storage and API request logs. (FR-79, FR-80)

### AC-49: **Given** a subscription pill or attendance cell, **When** it is hovered, focused or tapped, **Then** the full description is available through an accessible tooltip/popover trigger; the visible text is only the kind pill and `attended/expected (DD-Mon-YY)`. The presbyter badge has its tooltip. (FR-77, FR-81)

### AC-50: **Given** a page with exactly one page verb, **When** it renders, **Then** that verb is a visible control in the action row and no Actions menu is rendered; **Given** two or more verbs, **Then** one Actions menu holds them; **Given** a Refresh-class control, **Then** it is a bare icon button at the trailing edge, is never a menu item, and a page whose only control is Refresh renders no menu. (FR-9a)

### 7.1 Requirement traceability

| Requirement | Acceptance criteria | Requirement | Acceptance criteria                     |
| ----------- | ------------------- | ----------- | --------------------------------------- |
| FR-1        | AC-1                | FR-30       | AC-12, AC-17                            |
| FR-2        | AC-2                | FR-31       | AC-31                                   |
| FR-3        | AC-3                | FR-32       | AC-15, AC-31                            |
| FR-4        | AC-4                | FR-33       | AC-18, AC-19                            |
| FR-5        | AC-4, AC-24         | FR-34       | AC-18                                   |
| FR-6        | AC-4                | FR-35       | AC-18                                   |
| FR-7        | AC-5                | FR-36       | AC-19                                   |
| FR-8        | AC-23               | FR-36a      | AC-20                                   |
|             |                     | FR-37       | AC-20                                   |
|             |                     | FR-44       | AC-19, AC-20                            |
| FR-9        | AC-3                | FR-38       | AC-21                                   |
| FR-9a       | AC-50               | FR-39       | AC-19                                   |
| FR-10       | AC-29               | FR-39       | AC-19                                   |
| FR-11       | AC-6                | FR-40       | AC-19, AC-30                            |
| FR-12       | AC-10, AC-10a       | FR-41       | AC-22, AC-28                            |
| FR-13       | AC-10a, AC-10b      | FR-42       | AC-28                                   |
| FR-14       | AC-7                | FR-43       | AC-28                                   |
| FR-15       | AC-10, AC-27        | FR-44       | AC-20                                   |
| FR-16       | AC-8                | FR-45       | AC-5                                    |
| FR-17       | AC-9                | FR-46       | AC-5                                    |
| FR-18       | AC-26               | FR-47       | AC-5, AC-27                             |
| FR-19       | AC-27               | FR-48       | AC-5, AC-24                             |
| FR-20       | AC-11, AC-33        | FR-49       | AC-5, AC-24                             |
| FR-21       | AC-11               | FR-50       | AC-24                                   |
| FR-22       | AC-11, AC-32, AC-41 | FR-51       | AC-30                                   |
| FR-23       | AC-12               | FR-52       | AC-9, AC-13, AC-14, AC-17, AC-20, AC-30 |
| FR-24       | AC-13               | FR-53       | AC-24, AC-30                            |
| FR-25       | AC-14               | FR-54       | AC-16, AC-30                            |
| FR-26       | AC-14               | FR-55       | AC-30                                   |
| FR-27       | AC-15               | FR-56       | AC-30                                   |
| FR-28       | AC-16               | FR-57       | AC-10, AC-26, AC-30                     |
| FR-29       | AC-31               | FR-68       | AC-34, AC-35                            |
| FR-58       | AC-34               | FR-59       | AC-35                                   |
| FR-60       | AC-35               | FR-61       | AC-36                                   |
| FR-62       | AC-36               | FR-63       | AC-37                                   |
| FR-64       | AC-38               | FR-65       | AC-40                                   |
| FR-66       | AC-39               | FR-67       | AC-36, AC-40                            |
| FR-69       | AC-32, AC-33        | FR-70       | AC-41                                   |
| FR-71       | AC-42               | FR-72       | AC-43                                   |
| FR-73       | AC-44               | FR-74       | AC-45                                   |
| FR-75       | AC-46               | FR-76       | AC-41                                   |
| FR-77       | AC-49               | FR-78       | AC-47                                   |
| FR-79       | AC-48               | FR-80       | AC-48                                   |
| FR-81       | AC-49               |             |                                         |

## Edge Cases

- EC-1: API unreachable, DNS failure, TLS failure or CORS rejection: the shell renders, the content
  slot shows a connection error with a retry and a link to `#/connect`; the origin is not displayed
  (FR-12). No spinner forever.
- EC-2: The session expires or is revoked mid-session (401/403): clear the session, preserve unsaved
  form input where possible, and explain before redirecting. The bearer is never re-entered because
  the browser never held it.
- EC-3: Concurrent edit (stale `If-Match` → 409): show the conflict dialog with reload/keep options.
- EC-4: Validation failure (422): map the problem detail to the field when the message identifies
  one; otherwise show a form-level error.
- EC-5: Import exceeds 10,000 rows or 1,048,576 bytes: reject before upload; explain that chunking
  is not automatic because it would break all-or-nothing.
- EC-6: Import contains an unknown `eventname`: list the names and row numbers; no partial write.
- EC-7: Duplicate member number on create (409): keep the form open and focus the member-number
  field.
- EC-8: Direct link to an archived member without `status=archived` or `includeArchived=true`: show
  the archived state with a restore action rather than a bare 404.
- EC-9: Purge confirmation mismatch: button disabled; no request.
- EC-10: `sessionStorage` unavailable (private mode / storage disabled): fall back to in-memory
  session with a warning that a refresh loses the connection.
- EC-11: `prefers-color-scheme` changes while the app is open: only apply it when the stored
  preference is “system” (if that option exists); otherwise keep the explicit choice.
- EC-12: Browser back/forward across hash routes: restore the previous section, submenu, query and
  scroll position.
- EC-13: Double submit or slow network: disable the submit, keep the in-flight state, and do not
  create duplicate writes.
- EC-14: A gateway origin with a trailing slash, a path prefix, a query, a fragment, credentials, or
  `http://` outside a loopback development build: the production build fails; it is never normalised
  into a working runtime value.
- EC-15: CSV with a UTF-8 BOM, CRLF, blank trailing lines, or quoted commas: parse correctly and
  report the logical row number.
- EC-16: CSV with the wrong headers: reject with the expected header list.
- EC-17: Empty file or zero data rows: reject before preview.
- EC-18: A date that is a valid ISO date but not a real calendar date (e.g. `2026-02-30`): flag in
  preview; let the API reject if it slips through.
- EC-19: User navigates away during an import: keep the in-flight mutation state; do not lose the
  batch result silently.
- EC-20: Browser zoom at 200 % and a 360 px width: no clipped controls or overlapping labels.
- EC-21: Reassignment with a missing or stale `replaceAssignmentId` (409): show the current
  assignment named by the problem extension, require explicit confirmation, and retry only with the
  current id and a reason.
- EC-22: Logging a call against an ended assignment (409): the roster refreshes and the call form is
  read-only or closed.
- EC-23: `outcome = reached` without `stillInChurch` (422): keep the form open, announce the field
  error, and write nothing.
- EC-24: Reassignment reason missing or shorter than 3 characters (422): keep the dialog open and
  show the reason error.
- EC-25: Officer is not an active presbyter, the member is archived/purged, or the member would
  shepherd themselves (409/422): show the API detail and do not create the assignment.
- EC-26: `calledOn` in the future or before `assignedOn` (422): inline date error; no request.
- EC-27: A later `unknown` call after a definite `yes`/`no`: the status remains the latest definite
  answer, and the UI does not downgrade it.
- EC-28: Clearing `isPresbyter` or archiving an officer who still holds active assignments (409):
  show the list that must be reassigned first.
- EC-29: The attendance series is archived or the list aggregate is unavailable: the column shows
  "not available" for that series, not a zero or a fabricated count.
- EC-30: Cursor pagination cannot show a page number or total; "Back" uses the client's cursor stack
  and "Next" uses `nextCursor`. A reload starts from the first page.
- EC-31: Duplicate contact value on create (409): keep the form open, focus the contact field, and do
  not create the member.
- EC-32: Subscription creation for an archived or purged member (404/409): close the dialog and
  refresh the member; no subscription is created.
- EC-33: Coverage added to an individual subscription (422): show "coverage is household-only" and
  write nothing.
- EC-34: Coverage added for a member already covered (409): keep the dialog open and select a
  different member.
- EC-35: Ending a subscription that is already ended (404/409): refresh the subscriptions and do not
  show a second "Ended" transition.
- EC-36: Removing coverage that was already removed (404): refresh the coverage list and explain.
- EC-37: Covered member is archived or purged (404/409): remove them from the eligible list and show
  the API detail.
- EC-38: The list subscriptions aggregate is unavailable or a member has no subscriptions: show "—"
  or "None"; never invent a policy or coverage count.
- EC-39: `lastAttendedOn` is null: show "No attendance yet"; do not substitute the current date or the
  last imported date.
- EC-40: The contacts endpoint returns 401/404 while the dialog is open: close the dialog, do not
  cache the value, and follow the normal unauthorized/not-found path.
- EC-41: `contactCount` is 0: show `Contacts · 0` disabled or a plain "No contacts"; the dialog opens
  to an empty state, never a fabricated value.
- EC-42: `Find by contact` returns no match: show an empty result and do not keep the entered value in
  the URL, storage or logs.
- EC-43: More than two subscriptions: show two pills plus `+N`; `+N` opens a popover with the full
  descriptions. Do not hide the additional policies without an affordance.
- EC-44: A tooltip trigger is focused, tapped or hovered: the description must appear via tooltip or
  popover; a hover-only, non-focusable span is not acceptable.
- EC-45: The API logger still writes the raw query string: treat this as a blocking defect; a contact
  search must not appear in logs.

## API Contracts

The API spec remains authoritative for domain behaviour. This section fixes the wire shapes the UI
consumes and the client conventions it must follow.

### 9.1 Conventions

- Base URL: `VITE_GATEWAY_URL`, required for a production build and fixed at build time; no trailing
  slash, path, query or fragment; the connect form cannot change it.
- Headers: `Authorization: Bearer <session>` on every gateway route; the UI does not send
  `X-Actor-Id`; `Content-Type: application/json` on JSON bodies; `If-Match` on member update.
- Response headers the UI uses: `ETag` (member version), `Location` (created member), and the
  `application/problem+json` body for errors.
- Cursor pagination: `nextCursor` is opaque; pass it back as `cursor`.
- Date and time values have three kinds: **calendar dates** (`YYYY-MM-DD`) are formatted without
  shifting the stored day; **instants** convert from UTC to the reader's zone; **wall-clock times**
  stay as scheduled with the event's IANA zone. See `documents/specs/ui-date-time-formatting.md`.
- The first calls implemented are GET /health, GET /v1/members, POST /v1/members,
  GET /v1/members/{memberNo}, PUT /v1/members/{memberNo}, DELETE /v1/members/{memberNo},
  POST /v1/imports/events, POST /v1/imports/attendance, GET /v1/imports/{batchId},
  GET /v1/shepherding/report, GET /v1/shepherding/officers/{memberNo}/members,
  POST /v1/shepherding/assignments/{assignmentId}/calls and GET /v1/members/{memberNo}/shepherding.

### 9.2 Types

```ts
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  /** Reassignment 409 extension. */
  currentAssignment?: {
    id: string;
    officerMemberNo: string;
    assignedOn: string;
  };
}

export type Gender = 'male' | 'female' | 'other' | 'undisclosed';
export type ContactKind = 'phone' | 'email' | 'whatsapp';
export type RelationshipType = 'spouse' | 'parent' | 'child' | 'guardian' | 'other';
export type SubscriptionKind = 'life_insurance' | 'credit_union';
export type CallOutcome = 'reached' | 'no_answer' | 'wrong_number';
export type StillInChurch = 'yes' | 'no' | 'unknown';

export interface Contact {
  id: string;
  kind: ContactKind;
  value: string;
  displayOrder: number;
  ownerMemberNo: string;
  linked: boolean;
}

export interface ContactList {
  items: Contact[];
}

export interface MinistryRef {
  code: string;
  name: string;
}

export interface Ministry extends MinistryRef {
  description: string | null;
  active: boolean;
}

export interface AttendanceSummary {
  seriesId: string;
  seriesName: string;
  attended: number;
  expected: number;
  remaining: number;
  status: 'ongoing' | 'completed' | 'in_progress';
  /** Latest attended date in the same window, or null. */
  lastAttendedOn: string | null;
}

export interface SubscriptionSummary {
  id: string;
  kind: SubscriptionKind;
  scope: 'individual' | 'household';
  status: 'active' | 'ended';
  role: 'policyholder' | 'covered';
  policyholderMemberNo: string;
  coveredCount: number;
}

export interface MemberSummary {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: Gender;
  /** Derived current age, or null when dob is unknown or in the future. */
  age: number | null;
  /** The same derivation in completed months; the picker says `8m` rather than `0y`. */
  ageMonths: number | null;
  placeOfResidence: string | null;
  joinedOn: string | null;
  isPresbyter: boolean;
  archivedAt: string | null;
  /** Count only; the list must not return contact values. */
  contactCount: number;
  ministries: MinistryRef[];
  /** Present only when the list is requested with include=attendance&seriesId=… */
  attendance?: AttendanceSummary | null;
  /** Present only when the list is requested with include=subscriptions. */
  subscriptions?: SubscriptionSummary[];
}

export interface AttendanceEntry {
  id: string;
  date: string;
  source: 'import' | 'manual';
}

export interface AttendanceSeries {
  seriesId: string;
  seriesName: string;
  ministry: string | null;
  attended: number;
  expected: number;
  remaining: number;
  status: 'ongoing' | 'completed' | 'in_progress';
  entries: AttendanceEntry[];
}

export interface Subscription {
  id: string;
  kind: SubscriptionKind;
  scope: 'individual' | 'household';
  status: 'active' | 'ended';
  reference: string | null;
  startedOn: string;
  endedOn: string | null;
  role: 'policyholder' | 'covered';
  policyholderMemberNo: string;
  coveredMemberNos: string[];
}

export interface Relationship {
  id: string;
  type: RelationshipType;
  isDependent: boolean;
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  archived: boolean;
}

export interface MemberDetail extends MemberSummary {
  id: string;
  /** The detail is an explicit navigation, so it may carry the values. */
  contacts: Contact[];
  maidenName: string | null;
  alias: string | null;
  dob: string | null;
  /** Detail-only back-office fields; never on the list. */
  presbyterRank: number | null;
  membershipCardNo: string | null;
  verifiedAt: string | null;
  addressLine: string | null;
  purgedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  subscriptions: Subscription[];
  relationships: Relationship[];
  attendance: AttendanceSeries[];
}

export interface MemberList {
  items: MemberSummary[];
  nextCursor?: string;
}

export interface ImportBatch {
  id: string;
  kind: 'members' | 'attendance' | 'events'; // 'events' stays readable for legacy batches
  actor: string;
  rowCount: number;
  checksum: string;
  createdAt: string;
  /** Attendance batches only: the occurrence the import targeted. */
  eventInstanceId?: string | null;
  sessionDate?: string | null;
  written?: number | null;
  skipped?: number | null;
}

export interface AttendanceImportRow {
  memberNo: string;
  /** The selected session's date, optionally with a wall-clock time; checked against it. */
  datetime?: string;
}

export interface AttendanceImport {
  eventId: string;
  sessionDate: string;
  rows: AttendanceImportRow[];
}

export interface Health {
  status: 'ok';
  uptimeSeconds: number;
}

export interface Officer {
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  assignedMembers: number;
  attempts: number;
  conversations: number;
  lastCalledOn: string | null;
  membersNeverCalled: number;
}

export interface OfficerList {
  items: Officer[];
}

export interface RosterEntry {
  assignmentId: string;
  assignedOn: string;
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  placeOfResidence: string | null;
  /** Count of owned and linked contacts; never contact values. */
  contactCount: number;
  attempts: number;
  conversations: number;
  lastCalledOn: string | null;
  lastOutcome: CallOutcome | null;
  stillInChurch: StillInChurch | null;
  latestFeedback: string | null;
  latestIssue: string | null;
}

export interface Roster {
  officerMemberNo: string;
  from: string | null;
  to: string | null;
  items: RosterEntry[];
}

export interface Assignment {
  id: string;
  officerMemberNo: string;
  officerName: string;
  officerGender: Gender;
  officerAge: number | null;
  memberNo: string;
  memberName: string;
  memberGender: Gender;
  memberAge: number | null;
  assignedOn: string;
  endedOn: string | null;
  reason: string | null;
  endedReason: string | null;
}

export interface AssignmentInput {
  officerMemberNo: string;
  memberNo: string;
  assignedOn?: string;
  replaceAssignmentId?: string;
  reason?: string | null;
}

export interface Call {
  id: string;
  assignmentId: string;
  calledOn: string;
  outcome: CallOutcome;
  stillInChurch: StillInChurch;
  feedback: string | null;
  issue: string | null;
  recordedBy: string;
  createdAt: string;
}

export interface CallInput {
  calledOn?: string;
  outcome: CallOutcome;
  stillInChurch?: StillInChurch;
  feedback?: string | null;
  issue?: string | null;
}

export interface CallList {
  assignmentId: string;
  items: Call[];
}

export interface Report {
  from: string | null;
  to: string | null;
  totals: {
    officers: number;
    activeMembers: number;
    assignedMembers: number;
    unassignedMembers: number;
    attempts: number;
    conversations: number;
    membersNeverCalled: number;
    stillInChurch: {
      yes: number;
      no: number;
      unknown: number;
      neverReported: number;
    };
  };
  officers: Officer[];
}

export interface MemberShepherding {
  memberNo: string;
  name: string;
  gender: Gender;
  age: number | null;
  shepherd: {
    assignmentId: string;
    memberNo: string;
    name: string;
    gender: Gender;
    age: number | null;
    assignedOn: string;
  } | null;
  history: Array<{
    assignmentId: string;
    officerMemberNo: string;
    officerName: string;
    officerGender: Gender;
    officerAge: number | null;
    assignedOn: string;
    endedOn: string | null;
    reason: string | null;
    endedReason: string | null;
  }>;
  calls: {
    attempts: number;
    conversations: number;
    lastCalledOn: string | null;
  };
  stillInChurch: StillInChurch | null;
  latestFeedback: string | null;
  latestIssue: string | null;
  recentCalls: Array<Call & { officerMemberNo: string }>;
}
```

### 9.3 Endpoints used by V2

| Method   | Path                                               | UI use                                           |
| -------- | -------------------------------------------------- | ------------------------------------------------ |
| `GET`    | `/health`                                          | Gateway reachability check (public)              |
| `POST`   | `/auth/magic-link`                                 | Request a single-use sign-in link                |
| `POST`   | `/auth/exchange`                                   | Trade the one-time code for a session            |
| `GET`    | `/auth/me`                                         | Restore/verify session and read derived actor    |
| `POST`   | `/auth/logout`                                     | Revoke the session                               |
| `ALL`    | `/gateway/v1/*`                                    | Proxied data routes; bearer injected server-side |
| `GET`    | `/openapi.json`                                    | Build-time type generation (Q9)                  |
| `GET`    | `/v1/members`                                      | List/search/paging, status, attendance aggregate |
| `POST`   | `/v1/members`                                      | Create                                           |
| `GET`    | `/v1/members/{memberNo}`                           | Detail (explicit navigation; may carry contacts) |
| `GET`    | `/v1/members/{memberNo}/contacts`                  | Contacts only; opened from `Contacts · n`        |
| `PUT`    | `/v1/members/{memberNo}`                           | Edit with `If-Match`                             |
| `DELETE` | `/v1/members/{memberNo}`                           | Archive                                          |
| `POST`   | `/v1/members/{memberNo}/restore`                   | Restore                                          |
| `POST`   | `/v1/members/{memberNo}/purge`                     | Purge (typed confirmation)                       |
| `GET`    | `/v1/members/{memberNo}/attendance`                | Per-series attendance                            |
| `POST`   | `/v1/members/{memberNo}/attendance`                | Record attendance                                |
| `DELETE` | `/v1/members/{memberNo}/attendance/{attendanceId}` | Remove a row                                     |
| `*`      | `/v1/members/{memberNo}/contacts…`                 | Contact CRUD and link/unlink                     |
| `POST`   | `/v1/members/{memberNo}/subscriptions`             | Create subscription                              |
| `DELETE` | `/v1/members/{memberNo}/subscriptions/{id}`        | End subscription (soft)                          |
| `POST`   | `/v1/subscriptions/{id}/coverage`                  | Add covered member                               |
| `DELETE` | `/v1/subscriptions/{id}/coverage/{memberNo}`       | Remove covered member                            |
| `*`      | `/v1/members/{memberNo}/ministries…`               | Assign/unassign                                  |
| `*`      | `/v1/members/{memberNo}/relationships…`            | Relationship CRUD                                |
| `GET`    | `/v1/ministries`, `/v1/series`                     | Reference lists                                  |
| `POST`   | `/v1/imports/events`                               | Event import                                     |
| `POST`   | `/v1/imports/attendance`                           | Attendance import                                |
| `GET`    | `/v1/imports/{batchId}`                            | Batch lookup                                     |
| `GET`    | `/v1/members/{memberNo}/shepherding`               | Current shepherd, history, calls, status         |
| `GET`    | `/v1/shepherding/report`                           | Church totals and per-officer rows               |
| `GET`    | `/v1/shepherding/officers`                         | Officer list (alternative to report)             |
| `GET`    | `/v1/shepherding/officers/{memberNo}/members`      | Officer roster                                   |
| `POST`   | `/v1/shepherding/assignments`                      | Assign / reassign                                |
| `DELETE` | `/v1/shepherding/assignments/{assignmentId}`       | End an assignment                                |
| `POST`   | `/v1/shepherding/assignments/{assignmentId}/calls` | Log a call                                       |
| `GET`    | `/v1/shepherding/assignments/{assignmentId}/calls` | Call history                                     |

### 9.4 Error mapping

| Status | `code`                 | UI response                                          |
| ------ | ---------------------- | ---------------------------------------------------- |
| 401    | `unauthorized`         | Clear session, go to connect with `reason=expired`   |
| 404    | `not_found`            | Not-found surface with back link                     |
| 409    | `conflict`             | Conflict dialog (ETag, duplicate, referenced record) |
| 422    | `validation_error`     | Inline field error or import validation summary      |
| 413    | `payload_too_large`    | Import size guidance                                 |
| 500    | `internal_error`       | Retryable error panel, no stack trace                |
| 503    | `database_unavailable` | Connection/service panel with retry                  |

## Data Models

Only non-PII UI state may be persisted. Server DTOs live in memory.

| Key / store                       | Shape                                                                              | Lifetime      | Contains PII?      |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------- | ------------------ |
| `sessionStorage["mr.session.v1"]` | `{ token, expiresAt }`                                                             | Tab session   | Session credential |
| `sessionStorage["mr.imports.v1"]` | `{ id, kind, rowCount, createdAt }[]` (max 20)                                     | Tab session   | No                 |
| `localStorage["mr.theme.v1"]`     | `{ accent: "fluent" \| "ocean" \| "meadow" \| "plum", scheme: "light" \| "dark" }` | Until cleared | No                 |
| `localStorage["mr.nav.v1"]`       | `{ collapsed: boolean }`                                                           | Until cleared | No                 |
| TanStack Query cache              | Server DTOs                                                                        | Memory only   | Yes                |
| Component state                   | Forms, filters, preview rows                                                       | Memory only   | Yes                |

Rules:

- Never write a member name, contact, address, date of birth or attendance row to web storage.
- Clear `mr.session.v1` and the query cache on sign-out and on 401.
- Version every key; ignore and delete an unknown version rather than guessing.
- `sessionStorage` may be unavailable; fall back to in-memory and warn (EC-10).

## Deployment and Operations

### 11.1 Repository layout

```
ui/
  package.json            # React 19, Vite 8, Fluent UI v9, TanStack Query, React Router
  src/
    main.tsx
    app/                  # router, providers, error boundary
    shell/                # AppShell, TopNav, Sidebar, ThemeControl, ConnectionBadge
    pages/                # members, imports, attendance, shepherding, admin, connect, settings
    api/                  # typed client, problem parsing, query keys, generated types
    theme/                # accent ramps, light/dark themes, persistence
    components/           # shared page frame, data states, confirm dialogs
  tests/                  # Vitest + RTL + MSW; Playwright under tests/e2e
  index.html
  vite.config.ts
```

The root `package.json` gains `"workspaces": ["ui"]` and scripts `ui:dev`, `ui:build`, `ui:test`,
`ui:lint`, `ui:typecheck`. The root `verify` gate adds the UI checks so CI cannot merge a broken UI.
The API's `vercel.json` is unchanged; Vercel continues to build only `src/index.ts`.

### 11.2 GitHub Pages

- Build with `VITE_GATEWAY_URL=https://member-registrations-mind-logs.vercel.app` and
  `base: "/MemberRegistrations/"`. In a development build the origin comes from `VITE_GATEWAY_URL`,
  defaulting to `http://localhost:3000`; the connect page shows no control in either build. A
  production build must set it explicitly — `deploy-pages.yml` does — and fails when it is missing,
  invalid or not `https://` (FR-13).
- The origin is baked and authoritative (2026-11-10 grill). `connect-src 'self' <origin>` is generated
  from the same value, and GitHub Pages cannot set response headers, so a runtime-supplied origin
  could not widen the policy; the page therefore shows no origin field, caption or control, and the
  pre-flight `/health` probe stays. Rejected: a runtime `config.json` on the Pages origin (cannot
  widen a static CSP; it would need `connect-src https://*.vercel.app` or a rebuild anyway), a
  Cloudflare Worker proxy (a second platform and failure surface), moving the UI to Vercel for a
  single origin (retires the Pages pipeline and needs a catch-all rewrite that must not shadow
  `/v1`, `/auth`, `/gateway` or `/health`), and keeping the field behind an allowlist (the CSP
  already made it inoperative in production). A custom domain stays deferred.
- Use `createHashRouter`; deep links are `https://stayboy.github.io/MemberRegistrations/#/members/M-1001`.
- Workflow `.github/workflows/deploy-pages.yml`: on push to `main`, `npm ci`, `npm run ui:build`, upload
  `ui/dist` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`. Permissions:
  `pages: write`, `id-token: write`; environment `github-pages`.
- The Pages origin is **`https://stayboy.github.io`** (origin excludes the repository path).
- The custom domain is deferred. V2 ships on `https://stayboy.github.io/MemberRegistrations/`; this
  app's `sessionStorage` is shared with sibling Pages projects, but the stored value is a short-lived,
  revocable session credential, not the church-wide API bearer. Adding the domain later is a hardening
  step, not a launch blocker.
- No build secret is available to a public Pages artifact. The browser calls the gateway at
  `/auth/*` and `/gateway/v1/*`; the gateway alone holds `API_BEARER_TOKEN`. Do not add a
  `VITE_BEARER_TOKEN` variable or a token field.

### 11.3 API changes required (prerequisite)

The API currently has no CORS middleware, no session gateway, no list-level attendance or
subscriptions aggregate, and returns full contact values in the members list. Before the UI can call it
from Pages and show the compact grid, the API spec and code must add:

**Session gateway (new)**

- The gateway is a router layer in the **same Express app and Vercel function** as the API. It rewrites
  `/gateway/v1/*` internally to `/v1/*`; it is not a second project or an HTTP hop.
- `POST /auth/magic-link` accepts `{ email }` and always returns `202` with the same body and timing
  shape. It emails a single-use, short-TTL link to an active officer only.
- `POST /auth/exchange` trades the one-time code for a short-lived session credential; the credential
  is stored hashed in Postgres, with expiry, revocation support and a last-used timestamp.
- `GET /auth/me` returns `{ officerId, name, email, actorId, expiresAt }`.
- `POST /auth/logout` revokes the current session.
- `ALL /gateway/v1/*` validates the session, injects `Authorization: Bearer $API_BEARER_TOKEN` and
  `X-Actor-Id` from the officer, and rewrites to the matching `/v1/*` handler. A client-supplied
  `X-Actor-Id` is discarded. Only `/v1/*` is reachable.
- The browser sends the session as `Authorization: Bearer <session>` and stores it in
  `sessionStorage`; the gateway sets no authentication cookie.
- The API bearer remains accepted by `/v1/*` for server-to-server callers; it is never returned to a
  browser.
- Officers are seeded and deactivated by CLI; there is no self-service enrolment or domain allowlist.
- Magic links go through a `Mailer` port: Resend in production, console/no-op in development and tests.
- Rate-limit magic-link requests per email and per IP, with counters stored in Postgres; do not reveal
  whether the address is known.

**CORS**

- An allowlist in `CORS_ALLOWED_ORIGINS` (comma-separated) on the gateway routes, defaulting to the
  Pages origin (the custom domain when configured, otherwise `https://stayboy.github.io`),
  `http://localhost:5173` and `http://127.0.0.1:4173`.
- Allowed methods `GET, POST, PUT, DELETE, OPTIONS`.
- Allowed headers `Authorization, Content-Type, If-Match`; `X-Actor-Id` is not accepted from a browser.
- Exposed headers `ETag, Location`.
- `OPTIONS` handled **before** the session gate (preflight carries no `Authorization`).
- `Vary: Origin`; no credentials (bearer header, not cookies; no `Access-Control-Allow-Credentials`).
- `Cache-Control: no-store` preserved on personal-data routes.

**Members list aggregate**

- Add `status=active|archived` to `GET /v1/members`. `active` excludes archived and purged rows;
  `archived` returns archived, non-purged rows only. Keep `includeArchived` for compatibility
  (`status` wins if both are present; `includeArchived=true` means active + archived, never purged);
  the UI uses `status`.
- Add `include=attendance,subscriptions` (comma-separated) to `GET /v1/members`.
- `include=attendance&seriesId=<uuid>` adds an optional `attendance` object to each `MemberSummary`
  (`seriesId`, `seriesName`, `attended`, `expected`, `remaining`, `status`, **`lastAttendedOn`**).
  `lastAttendedOn` is the latest attended date in the same window, or `null`.
- `include=subscriptions` adds an optional `subscriptions: SubscriptionSummary[]` to each
  `MemberSummary`, covering every policy where the member is policyholder or currently covered,
  including ended policies. `SubscriptionSummary` carries `id`, `kind`, `scope`, `status`, `role`,
  `policyholderMemberNo` and `coveredCount`.
- Compute both aggregates for the whole page in batched queries (one occurrence set for the series,
  one attendance query for the page's member ids, one subscriptions query for the page's member ids);
  the UI MUST NOT issue one request per row. `include=attendance` without `seriesId` is a `422`; an
  unknown `include` value is a `422`.
- `GET /v1/members` without `include` keeps its current shape. There is still no `totalCount`; the UI
  uses cursor pagination.
- Add tests that the attendance aggregate matches `GET /v1/members/{memberNo}/attendance` and the
  subscriptions summary matches `GET /v1/members/{memberNo}`, plus a test that a 25-row page issues no
  extra per-member queries.

**Contacts and request logging**

- Remove `contacts` from `memberSummarySchema`; add `contactCount` instead. This is a breaking list
  shape: any client that needs values must use the detail or the contacts endpoint.
- Add `GET /v1/members/{memberNo}/contacts`, returning `{ items: Contact[] }` behind the bearer gate,
  with `Cache-Control: no-store`. The list never carries contact values; the dialog fetches this
  endpoint only after the operator opens it.
- Keep the `contact` query parameter on `GET /v1/members` for the explicit `Find by contact` dialog.
- Change the request logger from `req.originalUrl` to `req.path` or the route template. Query strings
  (`q`, `contact`) must never be written to logs. Where practical, log the route template rather than
  the concrete member number. Add a test that a contact search does not put the value in the log.
- The member detail may still return contacts; opening the member is an explicit navigation.

This is a behaviour change to the API, so `documents/specs/member-registrations-api.md` must be
amended in the same change (repo rule **Spec first**). The API's “UI of any kind” out-of-scope line
is updated when this spec is approved. The shepherding endpoints already exist and are implemented;
they need no amendment.

### 11.4 Environment variables

| Variable                        | Where         | Purpose                                                                              |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| `VITE_GATEWAY_URL`              | UI build      | Gateway origin, required for a production build; the connect form cannot override it |
| `API_BEARER_TOKEN`              | Vercel server | API bearer injected by the gateway; never exposed to the browser                     |
| `CORS_ALLOWED_ORIGINS`          | Vercel server | Gateway allowlist; never `*` in production                                           |
| `AUTH_SESSION_IDLE_MINUTES`     | Vercel server | Idle lifetime; default 480                                                           |
| `AUTH_SESSION_ABSOLUTE_MINUTES` | Vercel server | Absolute cap; default 720, must be ≥ idle                                            |
| `AUTH_MAGIC_LINK_TTL_MINUTES`   | Vercel server | Single-use link lifetime; default 15                                                 |
| `UI_BASE_URL`                   | Vercel server | Magic-link landing page, e.g. the Pages `/#/connect` URL                             |
| `RESEND_API_KEY`                | Vercel server | Resend credentials for the production `Mailer`                                       |
| `MAGIC_LINK_FROM`               | Vercel server | Verified sender address for magic-link mail                                          |
| `VITE_SENTRY_DSN`               | UI build      | Optional; absent by default (NFR-10)                                                 |

### 11.5 Verification

- `npm run verify:fast` (API) + `npm run ui:lint && npm run ui:typecheck && npm run ui:test`.
- `npm run ui:build` must pass in CI before Pages deploy.
- Playwright: shell (expand/collapse, theme, keyboard), sign-in (magic link, unknown address, expired
  session, logout), members (list/aggregates/create/conflict), contacts (dialog/no values in grid),
  find-by-contact (no URL/storage), imports (preview/limit/unknown event), shepherding
  (report/roster/log call/reassign 409).
- API: the attendance aggregate test must prove parity with the per-member endpoint and no N+1; the
  contacts list test must prove `contactCount` only; the log test must prove a contact search does not
  write the value; the gateway test must prove the bearer never reaches the browser and a spoofed
  `X-Actor-Id` is discarded.
- Manual: GitHub Pages deep link, 200 % zoom, dark/light reload, 360 px width, shepherding call and
  reassignment dialogs.

## Open Decisions (Grill Round)

### Decisions settled on 2026-11-03

| ID  | Decision        | Answer                                                                                                                  |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Q1  | Stack           | React 19 + Vite + Fluent UI React v9 in `ui/`.                                                                          |
| Q3  | Scope           | All slices 0–5, including Shepherding and Events. Offerings is V3; no other deferred section.                           |
| Q4  | Theme           | Accent ramp + light/dark switch.                                                                                        |
| Q5  | Sidebar IA      | Contextual sidebar; relationships/subscriptions in member-detail tabs; Events owns series.                              |
| Q6  | Routing         | Project Pages + hash routing.                                                                                           |
| Q7  | Token storage   | `sessionStorage` holds only a short-lived session credential; the gateway origin is fixed at build and never persisted. |
| Q8  | Imports         | CSV only, preview, 10,000 rows / 1 MiB, no automatic chunking.                                                          |
| Q9  | Wire types      | Generate from `/openapi.json` at build time.                                                                            |
| Q10 | Hosting         | `https://stayboy.github.io/MemberRegistrations/`.                                                                       |
| Q11 | Repo topology   | Same repository, `ui/` npm workspace.                                                                                   |
| Q12 | Grid columns    | Keep attendance, last-attended and subscriptions; add the list aggregates in §11.3. No totals.                          |
| Q13 | List aggregates | A: `include=attendance,subscriptions`; `lastAttendedOn` and `SubscriptionSummary`.                                      |

### Settled - Q2 credential transport (A: session gateway)

**Q2 - Credential transport for a public static app (settled 2026-11-03).**

The user should never paste the church-wide bearer. The chosen package keeps the UI on GitHub Pages
and puts a Vercel session gateway in front of the API.

- **A (chosen):** the UI calls `/auth/*` and `/gateway/v1/*` on the Vercel deployment. The gateway is a
  router in the same Express app as the API: it holds `API_BEARER_TOKEN`, authenticates an officer with
  an email magic link delivered by Resend, issues a short-lived revocable Postgres session, derives
  `X-Actor-Id`, and rewrites to `/v1/*`. The browser carries the session as a bearer header; no cookie
  is set.
- **B:** move the UI to Vercel and use an `HttpOnly` cookie. Rejected: it gives up Pages and adds a
  hosting migration for no extra safety over A.
- **C:** keep the token prompt. Rejected: awkward for officers, and a shared long-lived secret in the
  browser.
- **D:** return the bearer after login. Rejected: it puts the church-wide secret back in the page,
  where XSS can read it.

**Chosen:** A. Consequences: a new gateway ticket (11a) blocks the UI shell (12); Resend, domain
verification and an officer CLI become prerequisites; the session is an 8-hour sliding window with a
12-hour absolute cap; logout revokes server-side; a stolen session is revocable without rotating the
API bearer. The custom domain is deferred: V2 ships on the Pages project URL, because the stored value
is a short-lived, revocable session rather than the API bearer.

### Settled — Q13 list aggregate shape (A)

**Q13 — Shape of the list aggregate (settled: A).**

- **A (chosen):** `GET /v1/members?status=…&include=attendance,subscriptions&seriesId=…` returns
  optional `attendance` (including `lastAttendedOn`) and `subscriptions` summaries on each row; one
  request, batched queries. Cost: API schema + queries + tests; the list payload grows by one small
  object per row.
- **B:** separate `GET /v1/attendance/summary` and `GET /v1/subscriptions/summary` bulk endpoints; two
  extra requests, list stays lean.
- **C:** per-row detail requests for attendance and subscriptions. **Rejected:** N+1.

**Chosen:** A. B is rejected because it adds two round-trips per page; C is rejected because it is
N+1 and cannot produce a total.

### Refinement round (settled 2026-11-03)

| ID  | Decision              | Answer                                                                                        |
| --- | --------------------- | --------------------------------------------------------------------------------------------- |
| R1  | Subscription pills    | Kind-only pill; full description in tooltip; max 2 + `+N` popover.                            |
| R2  | Attendance cell       | `4/5 (26-Oct-26)` + bar; no second line; tooltip names series and full last date.             |
| R3  | Presbyter badge       | One-word `Presbyter`; tooltip “eligible to hold a shepherding roster”.                        |
| R4  | Contact privacy       | Wire-level: list returns `contactCount`, not values; contacts-only endpoint; dialog explicit. |
| R5  | Contacts action       | `Contacts · n` in the existing Contacts column; dot vertically centred.                       |
| R6  | Contacts dialog       | Immediate reveal, grouped by kind, owner/linked, read-only, no copy/edit.                     |
| R7  | Contact search        | Separate `Find by contact` dialog; value never in URL, storage or logs.                       |
| R8  | Tooltip accessibility | Focusable trigger, `aria-label`/`aria-describedby`, touch popover.                            |
| R9  | Detail contacts       | Allowed in the member detail; the landing grid remains value-free.                            |
| R10 | Multiple policies     | Max 2 pills + `+N` popover; short tooltips.                                                   |
| R11 | Last attended scope   | Within the selected series; tooltip names the series and date.                                |

Q2 is settled (session gateway, magic link). All other mockup choices are settled; brand, section
names and the generated accent ramps remain working placeholders until launch.

## Out of Scope

- OS-1: OIDC / SSO and per-officer authorization. V2 authenticates by magic link and derives
  `X-Actor-Id`, but every authenticated officer has full access; see Q2.
- OS-2: Per-officer scoping and field-level permissions. The API does not support them.
- OS-3: A server-side audit-log UI. The API has no audit-log endpoint. The mockup's earlier “Audit log”
  item was removed.
- OS-4: A server-side import history list. The API only exposes `GET /v1/imports/:batchId`; V2 keeps a
  session list and lookup (FR-38).
- OS-5: A global attendance analytics dashboard across every member and series. V2 shows the selected
  series in the member list plus per-member attendance detail.
- OS-6: Automatic chunking of imports over the API limit. Rejected because it breaks all-or-nothing.
- OS-7: JSON-only import. CSV and the downloaded Excel template are the supported inputs; a JSON upload
  is at most an advanced option (Q8).
- OS-8: Offline mode, service worker, PWA install and background sync. Not needed for an online admin.
- OS-9: Bulk edit, bulk import of members, and CSV export. Separate specs.
- OS-10: A global cross-officer follow-up queue. The API exposes follow-up data per officer; V2 filters
  within a roster and shows aggregate counts in the church report.
- OS-11: Charts and visual analytics. Text/table summaries first.
- OS-12: Internationalisation and RTL. English only in V2; the layout uses logical properties where
  cheap.
- OS-13: Embedding a token or any secret in the Pages build. Prohibited.
- OS-14: A native mobile app. The responsive web app is the mobile story.
- OS-15: Changing the API's domain behaviour beyond CORS, `status`, the attendance/subscriptions list
  aggregates, contact removal (`contactCount` + contacts endpoint) and query-string log redaction
  (**API changes required (prerequisite)**). The shepherding contracts are already implemented.
- OS-16: Custom domain, CDN, WAF. Deferred (Q10).
- OS-17: A `totalCount` or offset pagination. V2 uses cursor pagination and shows no page numbers.
- OS-18: Displaying contact values (or masked values) directly in the members grid. Values are only in
  the explicit contacts dialog or the member detail.
- OS-19: Copy/export of contact values from the landing dialog. Editing and copying remain in the
  member detail.
- OS-20: Hover-only tooltips without a keyboard/touch path. The tooltip/popover must be accessible.

## Definition of Done

- Q2 answered in writing; the settled decisions in **Open Decisions**, including the refinement round,
  are recorded with rejected options.
- The mockup is reviewed; layout changes are folded into the shell contract.
- The API spec is amended for CORS, `status`, the attendance/subscriptions list aggregates, contact
  removal (`contactCount` + contacts-only endpoint), and query-string log redaction (and the backlog
  line is updated).
- The Members grid shows the presbyter badge, compact subscription pills with accessible tooltips,
  the attendance count/bar with a bare date, and `Contacts · n` with no contact values, all backed by
  list aggregates/endpoints rather than per-row requests.
- Add member, add subscription, add/remove coverage, end subscription and the contacts/find-by-contact
  dialogs are implemented and tested, including the `409`/`422`/401 paths.
- Shepherding is implemented end to end: report, roster, log call, reassign, end assignment, and the
  member-detail shepherding summary.
- Every FR has at least one AC; every AC has a test or a documented manual check.
- The shell is implemented once and used by every route; no page re-implements chrome.
- The API bearer never appears in the bundle, browser storage, a URL, a log or a screenshot; only a
  short-lived session credential is stored, and only in `sessionStorage`.
- `npm run verify` and the UI gates pass; Pages deep link, 360 px, 200 % zoom and dark reload are
  manually verified.
- A round doc at `documents/rounds/v2-ui-shell.md` records plan, verification and acceptance.
