# V2 shell mockup — review artifact

**Status:** draft, 2026-11-03. **This is a throwaway prototype, not production code.**

The mockup answers one question: what should the shared `MainLayout` / app shell look like before
the V2 UI is built? It is a real Fluent UI React **v9** app (`@fluentui/react-components` 9.75.1,
`@fluentui/react-icons` 2.0.345, React 19, Vite 8), not a static picture. The source is deliberately
kept outside the repo until the layout is approved; the durable record is the spec and these
screenshots.

## What it demonstrates

- Top-level menus (**Members, Attendance, Imports, Shepherding, Admin**) right-aligned over the
  content area, with a brand block on the left.
- A contextual left sidebar that shows the submenus of the active top-level menu.
- Sidebar collapse to a 56 px icon rail, with tooltips on every icon and a collapsed footer.
- Sidebar footer with an accent-theme dropdown and a dark/light switch side by side.
- Fluent UI tokens only; four accent ramps generated with `createLightTheme` / `createDarkTheme`.
- A refined Members landing page: presbyter badge, compact subscription pills with tooltips,
  attendance count/bar with a bare last-attended date, and a `Contacts · n` action instead of raw
  contact values.
- Contacts only through an explicit action: the grid returns a count; a dialog groups phone, email
  and WhatsApp values, with owner/linked status. `Find by contact` is a separate dialog so the value
  never lands in the URL.
- The **Add member** form: identity, contact/residence and church sections, with the 201/Location
  success state and the duplicate/validation notes.
- The **Subscriptions** surface: policies, household coverage, add-subscription, add-coverage, remove
  coverage and end-subscription dialogs.
- A full **Shepherding** surface: church report and officer table, per-officer roster with follow-up
  filters, log-call and reassign dialogs, and the still-in-church distribution.
- Responsive fallback: at ≤ 860 px the top nav becomes a sections menu, the sidebar becomes an icon
  rail, and summary cards stack.

The compact grid is the target design. The API currently returns full contact values in
`GET /v1/members` and has no list-level attendance/subscriptions summary; the spec proposes removing
contacts from the list (`contactCount` + a contacts-only fetch) and adding `include=attendance,
subscriptions` list aggregates. The API's request logger also needs to stop logging raw query strings
before contact search can be considered protected.

## Screenshots

| File                           | State                                                    |
| ------------------------------ | -------------------------------------------------------- |
| `01-shell-expanded-light.png`  | Expanded sidebar, light, Members surface                 |
| `02-shell-collapsed-light.png` | Collapsed icon rail, light                               |
| `03-shell-expanded-dark.png`   | Expanded sidebar, dark                                   |
| `04-imports-placeholder.png`   | Contextual sidebar for the Imports section               |
| `05-meadow-accent.png`         | Accent-theme dropdown applied (Meadow)                   |
| `06-mobile.png`                | 390 × 844 responsive fallback                            |
| `07-shepherding-officers.png`  | Shepherding: coverage, officer table, warning            |
| `08-shepherding-roster.png`    | Shepherding: roster, follow-up filters, log-call actions |
| `09-shepherding-report.png`    | Shepherding: church report and status distribution       |
| `10-members-refined.png`       | Members grid: compact pills, contacts count, bare date   |
| `11-add-member.png`            | Add member form and 201/Location success state           |
| `12-subscriptions.png`         | Subscriptions and household coverage                     |
| `13-add-subscription.png`      | Add-subscription dialog                                  |
| `14-add-coverage.png`          | Add-coverage dialog                                      |
| `16-contacts.png`              | Contacts dialog grouped by kind; no values in the grid   |
| `17-find-contact.png`          | Explicit Find by contact dialog with a sample match      |

## Run it

The prototype lives at `%TEMP%\opencode\v2-shell-mock` during the review:

```powershell
cd $env:TEMP\opencode\v2-shell-mock
npm install
npm run dev
```

Useful review URLs:

- `http://localhost:5173/?theme=light&nav=expanded`
- `http://localhost:5173/?theme=dark&nav=expanded`
- `http://localhost:5173/?theme=light&nav=collapsed`
- `http://localhost:5173/?accent=meadow&theme=light`
- `http://localhost:5173/?section=shepherding&sub=officers`
- `http://localhost:5173/?section=shepherding&sub=roster`
- `http://localhost:5173/?section=shepherding&sub=report`
- `http://localhost:5173/?section=members&sub=add-member`
- `http://localhost:5173/?section=members&sub=all-members&member=M-1001`
- `http://localhost:5173/?section=members&sub=all-members&member=M-1001&dialog=add-subscription`
- `http://localhost:5173/?section=members&sub=all-members&member=M-1001&dialog=coverage`
- `http://localhost:5173/?section=members&sub=all-members&member=M-1001&dialog=contacts`
- `http://localhost:5173/?section=members&sub=all-members&dialog=find-contact`

`theme` accepts `light` or `dark`; `nav` accepts `expanded` or `collapsed`; `accent` accepts
`fluent`, `ocean`, `meadow` or `plum`; `section` accepts a section id such as `imports`; `sub`
selects a submenu such as `roster`; `member` opens a member-scoped mock; `dialog` opens
`add-subscription`, `coverage`, `contacts` or `find-contact`.

## Decisions to confirm

The only open question is **Q2** (credential transport) in **Open Decisions** in
[`documents/specs/member-registrations-ui.md`](../../specs/member-registrations-ui.md). Q13 is settled
as the expanded `include=attendance,subscriptions` aggregate. Do not treat any layout choice here as
settled until the spec is approved.
