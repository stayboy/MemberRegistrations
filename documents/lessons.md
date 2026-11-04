# Lessons

Durable, owner-accepted lessons, newest first. Each entry names the rule, the evidence and the
trigger that should have caught it. Product rules belong in the spec, not here.

Propose an entry in the reply; it reaches this file only when the owner accepts it.

Owner acceptance is recorded with the entry. The 2026-11-02 entry was accepted with the workflow
adoption on 2026-11-02 (grill Q16: "all as recommended"). The 2026-11-04 entries were accepted in the
Q126 round (2026-11-04, "all as recommended").

---

## 2026-11-04 — A reused component inherits the narrowest capability of its call sites

**Rule.** When a component is extracted because a second call site appeared, the shared version may
only expose the capability every call site is allowed to use. A call site that must not write gets a
read-only branch (and a safe default), not the first call site's full surface.

**Evidence.** Ticket 14 extracted `ContactsDialog` from the members grid and the member detail page.
Both sites wanted the same markup, so the extracted component shipped with add/remove everywhere —
but FR-78 requires the grid dialog to be read-only. The pro review caught it as a P2; the fix was an
`editable` prop defaulting to `false`, with only the detail page opting in.

**Trigger.** Any extraction in which the call sites have the same markup but different permissions,
states or side effects — especially a list surface and a detail surface sharing a dialog.

## 2026-11-04 — A parallel worker verifies with unit and API tests, never a browser harness

**Rule.** In a parallel round, a worker's evidence is its unit/API suite. Browser work — Playwright,
axe, screenshots — belongs to the parent's merged pass, or to the release gate, never to a worker.

**Evidence.** In the parallel pilot (tracks: ticket 09 events-api, ticket 12 ui-workspace) the UI
worker ran a headless-Chrome smoke that left roughly 150 orphan processes and crashed the API track's
Vitest worker with `0xC0000409`. The worker slot does not own the running app, a seeded database or a
session, so a browser result there is not attributable to the track.

**Trigger.** Any brief that offers a worker a UI-verification task, or any plan that treats a worker's
screenshot as acceptance evidence.

## 2026-11-04 — An uneven parallel pair is slower than running serially

**Rule.** Run two tracks in parallel only when they are genuinely size-matched and file-disjoint.
When one track is much larger, run serially: the larger track sets the finish time and the parent
still pays the merge pass.

**Evidence.** The pilot paired the events API (ticket 09) with a much larger UI track (ticket 12). The
UI track dominated wall-clock while the API track finished early, and each fresh worktree also paid a
full `npm ci`. The parent's post-merge pass still covered both tracks.

**Trigger.** A proposed pair whose estimates differ by more than roughly a third, or whose smaller
track could finish while the larger one is still building.

## 2026-11-04 — A fresh worktree or a freshly merged tree needs `npm ci` first

**Rule.** After creating a worktree, or after merging into a tree whose lockfile moved, run `npm ci`
before any build or UI command. A missing install reads as a code failure.

**Evidence.** In the parallel pilot each fresh worktree paid a full `npm ci`, and the post-merge
`ui:build` failed until the root `npm ci` installed the workspace dependencies.
`npm ci` at the root installs the `ui` workspace — a second install under `ui/` is not needed.

**Trigger.** A build or test failure immediately after a worktree is created or a branch is merged,
especially one naming a module that is present in the lockfile.

## 2026-11-02 — A green test run does not prove the Node entrypoint

**Rule.** Before reporting a runtime-affecting change as done, run the compiled artifact
(`npm run build && npm run smoke`), not only the test suite.

**Evidence.** `rrule` ships CommonJS plus a `module` field with no `exports` map. Vitest resolved the
ESM entry, so the named `rrulestr` import passed in tests; `node dist/index.js` failed at startup with
`does not provide an export named 'rrulestr'`. The first live smoke test caught it.

**Trigger.** Any dependency with dual CJS/ESM packaging or a `module` field; any change to the app
entrypoint, imports, or provider wiring.
