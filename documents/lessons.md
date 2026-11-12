# Lessons

Durable, owner-accepted lessons, newest first. Each entry names the rule, the evidence and the
trigger that should have caught it. Product rules belong in the spec, not here.

Propose an entry in the reply; it reaches this file only when the owner accepts it.

Owner acceptance is recorded with the entry. The 2026-11-02 entry was accepted with the workflow
adoption on 2026-11-02 (grill Q16: "all as recommended"). The 2026-11-04 entries were accepted in the
Q126 round (2026-11-04, "all as recommended"); the workspace-gate entry was accepted there on condition
that it be written only once the UI CI job landed, which it did the same day. The 2026-11-05 capture
and accent-ramp entries were accepted in the Q200 round (2026-11-05, "all as recommended"). The
2026-11-06 process entries were accepted in the `quiet-gates-and-lessons` round (2026-11-06, "all as
recommended"). The 2026-11-10 entries were accepted in reply to the session that proposed them
(2026-11-10, "accept lessons"). The 2026-11-11 entry was accepted in the `series-detail-summary` close
round (2026-11-11, "all as recommended", with the Q6 rephrase). The two 2026-11-11 seat entries were
accepted with the seat-enforcement grill (2026-11-11, "all as recommended"). The 2026-11-12 fixture entry
and the 2026-11-10 serial-run amendment were accepted in the `mock-claims-guard` close (2026-11-12,
"merge. review lessons with `deepseek-v4.1-flash-1017` if they are durable enough to keep"): the durability
review returned KEEP for the fixture rule and MERGE-INTO the existing worker-crash entry.

---

## 2026-11-12 — A fixture row on a shared list route is another screen's dependency

**Rule.** In the e2e harness a row added for one test is served to every screen that reads the same list
route, and a screen that derives "the next" or "the current" item from that list silently selects the new
row instead of its own. Add such a row behind an opt-in on the stub — a flag defaulting `false`, set by the
tests that need it — and build the list in a function rather than appending to a shared array. The
dangerous rows are the ones whose date comes from the wall clock, because they sort ahead of pinned data;
gate their membership even when the data itself is legitimate.

**Evidence.** `ui/e2e/fixtures.ts` appended `event-live` and `event-ended` (the action-state pair, both
dated today by `dateInZone(new Date(), 'UTC')`) to the shared `GET /gateway/v1/events` list, so the
offerings page's USSD preview picked the live session ahead of `Foundation service` (2999) and
`ui/e2e/offerings.spec.ts` failed in a round that touched no offerings code — recorded in
`documents/rounds/mock-claims-guard.md`. `buildRoutes` now takes `actionStatesEnabled`, driven by
`GatewayStub.includeActionStates` (default `false`) and set only by the two headcount action-state tests;
the flag gates list membership and the event-detail route, which both read `currentEvents()`, while the
attendance route resolves the pair either way. The offerings assertion is the tripwire, so no new check is
owed.

**Trigger.** Any new row in `ui/e2e/fixtures.ts`, and any e2e failure in a spec whose page the round did
not touch.

---

## 2026-11-11 — A rule with no failing artefact is a preference

**Rule.** A workflow rule earns its place only with the check that fails when it is skipped. Name that
check when the rule is written; if none exists, write the check in the same round, or stop citing the
rule. A rule that only lives in prose will be skipped by the agent that is in a hurry, and nothing will
notice.

**Evidence.** `AGENTS.md` §3 required a worker at Tier 2; the `attendance-capture-model` round declared
parent authorship in a hand-written field, nothing failed, and the round merged. Only in #113 did
`check-round` gain R1/R2 — after which the same class of omission fails CI.

**Trigger.** Writing or citing a process rule: ask which artefact fails, not whether the rule is clear.

---

## 2026-11-11 — The repo's record wins over a canonical sentence

**Rule.** A canonical orchestrator-skill sentence can be wrong about this repository (it was verified on
another day, or on another machine). When it disagrees with `AGENTS.md` or
`documents/agents/orchestrator-policy.md`, the repo's record is the rule: follow it, record the divergence
in `documents/backlog.md`, and fix the canonical file in its own protected-doc round with the manifest
hash refreshed. Never let a catalogue sentence veto a seat the repo's own policy names.

**Evidence.** Canonical `references/models.md` said no `cline-pass` provider existed and "do not
dispatch", while §17 seated `cline-pass/cline-pass/deepseek-v4.1-flash-1017` inside the window; the
stale text survived two rounds until a dispatch proved the seat live.

**Trigger.** Before dispatching any seat, or when a reviewer reports that a canonical file contradicts the
repo: resolve by dispatch and let the repo's record decide.

---

## 2026-11-11 — Grill the next round only when the owner accepts that it may begin

**Rule.** A round that completes successfully — acceptance `ACCEPTED` and its PR merged — ends there.
Do not plan, mock, branch or write the next round on your own, and do not run a go-forward `grill-me`
at the closing bell. When the owner accepts that the next round may begin, run the `grill-me` round on
that round's scope before any branch, mock, spec edit or code; the backlog is input, not a queue that
executes itself. In an unattended round §17 still auto-accepts the recommendations, but the next build
starts only on an explicit go, unless that same instruction names the round. A pure typo or formatting
round may skip the grill with the reason recorded. This replaced §17's end-of-round grill in the
`seat-enforcement` round (2026-11-11).

**Evidence.** The `series-detail-summary` round closed and merged (#107, `e9303f5`); the agent had
already framed the next step as a post-round ritual, and the owner asked for the grill to be gated on
their consent to begin instead.

**Trigger.** The end of any round that leaves a buildable next step, and the start of every new round.

---

## 2026-11-10 — The reviewer seat is chosen by the clock, not by the model you prefer

**Rule.** `documents/agents/orchestrator-policy.md` (Seats) makes the reviewer, plan-gate, spec-review
and acceptance seat `cline-pass/cline-pass/mimo-v2.6-pro` between 12:00 and 18:00 local; outside that
window the ranked pro seat applies. Read the clock and the table before dispatching, and name the seat
in the round doc. A review dispatched on the wrong seat is no verdict until it is re-run on the right
one — or on the ranked fallback, with the reason recorded, because a provider that refuses a model is a
fallback, not a second seat. `AGENTS.md` §10a still words the protected-document gate as a review by
`0813`; the Seats ruling (owner, 2026-11-09) applies inside the window, and harmonising that sentence is
queued in `documents/backlog.md`.

**Evidence.** The #101 code review (13:24) sat on `deepseek-v4-pro` `0813` inside the window, and so did
the ruleset round's merge-policy review (14:41); the owner caught both. The code review was re-run as
round 3 on the window model, and the merge-policy text was re-reviewed on it later that day when the
verb glossary changed it.

**Trigger.** Dispatching any review: spec, code, plan gate or protected document.

---

## 2026-11-10 — `gh pr merge --auto` is not a gate on this repository

**Rule.** Check `enablePullRequestAutoMerge` before reading `--auto` as "merge when green". It is
disabled here, so the flag never arms a gate: it errors, and a plain `gh pr merge` is gated by nothing
except the ruleset. The wait is explicit — `gh pr checks <n> --watch`, then merge on green.

**Evidence.** PR #101 merged at 13:38:37 with `verify` still running; no ruleset existed and nothing
refused the merge. After the ruleset was created on 2026-11-10 at 14:41, a merge attempt on #102 was
refused with "the base branch policy prohibits the merge" while its checks ran, and `gh pr merge --auto`
on that pull request returned "Auto merge is not allowed for this repository".

**Trigger.** Any merge command, and any policy text that treats `--auto` as a gate.

---

## 2026-11-10 — A Windows Vitest worker crash is an environment failure, not a test failure

**Rule.** Exit `3221226505` from a Vitest worker is a Node fail-fast on Windows, not an assertion. Read
the total, isolate the file that crashed, run it alone, and re-run the gate once. When the retry dies the
same way — a different file named each time and no failed assertion — the file passing alone does not clear
the gate: run the whole suite serially and bare, `npx vitest run --no-file-parallelism` (the step the
`precommit` profile itself runs in `scripts/gates.mjs`), and record that run in the round. That bare run is
evidence, not another gate retry: no gate counts as passed until it is green. The crash is not confined to
the `precommit` profile — the `full` profile's `test` step is the parallel one, so `verify` dies this way
too — and the failure belongs to the environment rather than the diff only once the serial suite is green.
Bypassing the hook
does not fix it — "A hook that cannot pass is a hook people bypass" (2026-11-06) still stands, and the
deterministic fix is queued in `documents/backlog.md`. A bypass is a recorded exception for a docs-only
change, never a habit, and the required CI check stays the authority.

**Evidence.** Two consecutive pre-commit runs crashed with `3221226505` on different files
(`tests/api/ussd.test.ts`, then `tests/api/events-presbytery.test.ts`); the second passed 10/10 alone
and the full suite passed 48/48 in the same session. CI `verify` on Ubuntu then passed in 3m38s. The
docs-only commit that used `--no-verify` records the bypass in its body, and
`documents/rounds/ui-fixed-gateway-origin.md` carries both runs and both files under Deviations.

**Trigger.** A gate exits non-zero with a worker exit code and no failing assertion.

---

## 2026-11-06 — Output is re-read, so bound it at the source

**Rule.** A tool's output is not paid for once: it re-enters the conversation on every later turn. A
gate must print a bounded verdict and write the detail to a log, so a long round never re-sends the
same transcript.

**Evidence.** `npm run verify` printed the full Vitest transcript per run; across a long round the
same lines were re-sent dozens of times, while the same gates run inside a worker cost the parent one
line.

**Trigger.** Any command whose output can exceed ~20 lines and whose result is a verdict.

---

## 2026-11-06 — A heavy gate belongs in the worker or CI, not in the orchestrator

**Rule.** Run a full suite, build or smoke in a worker or CI and return the counts. The orchestrator
keeps the verdict, never the transcript.

**Evidence.** The 24c/24d builds, 500-test suites and smoke runs cost the parent nothing when
executed by a subagent, which returns only counts.

**Trigger.** Any full suite, build or smoke.

---

## 2026-11-06 — A reviewer gets one complete delta and at most one confirmation round

**Rule.** Send one complete delta per review — the changed hunks plus the relevant spec sections,
never the whole repository. Batch every finding into one fix pass, then run at most one confirmation
round.

**Evidence.** The headcount-entry spec review took three confirmation rounds that re-sent the same
files and the same transcript.

**Trigger.** A review that produces findings.

---

## 2026-11-06 — A hook that cannot pass is a hook people bypass

**Rule.** A hook must be able to pass in the environment it runs in. An environmental failure is a
hook defect, fixed by making the gate deterministic, not by bypassing it.

**Evidence.** The pre-commit `verify:fast` crashed repeatedly in the Windows fork pool, so commits
were made with the recorded `--no-verify` bypass; the hook now runs the serialized `verify:precommit`
profile.

**Trigger.** Any hook or gate that fails for environmental reasons.

---

## 2026-11-06 — Remove a Git worktree before the squash merge deletes its branch

**Rule.** Before a squash merge deletes a branch, remove every worktree checked out on it. A deleted
branch leaves the worktree directory behind with no `.git` and a stale dependency tree.

**Evidence.** The docker-stack worktree was left checked out on its branch when the PR was
squash-merged and the branch deleted, leaving an orphaned directory with no `.git` and a stale
node_modules tree.

**Trigger.** Merging a PR whose branch has a live worktree.

---

## 2026-11-06 — A local-only artefact must still fail closed

**Rule.** An image, container or configuration built for local use still defaults to the safe
production posture and opts into development explicitly. A bare run must refuse to start rather than
silently run the wrong environment.

**Evidence.** The local `api` image baked `NODE_ENV=development`, so a bare `docker run` would have
started a console-mailer server; it now defaults to `production` and refuses to start without
production configuration, while compose overrides to `development`.

**Trigger.** Any image, container or config whose default could run the wrong environment silently.

---

## 2026-11-05 — A screenshot baseline must pin the clock

**Rule.** A committed screenshot baseline fixes the browser clock as well as the data, the locale, the
timezone and the motion. Any screen that derives a date from "today" — a default joined date, a
next-occurrence window — drifts on the next capture run, and the artifact stops proving what the build
looks like.

**Evidence.** Ticket 19b's first capture used real time: `member-add.png` showed the run's date in
"Joined on", and `series-list.png` asked the API for a window starting on it, so a regenerated baseline
differed in content, not only in pixels. `page.clock.setFixedTime(new Date('2026-01-05T12:00:00Z'))`
before every navigation made both screens byte-identical across runs.

**Trigger.** Any capture or visual test whose screen renders a date derived from the current clock.

---

## 2026-11-05 — A contrast fix must keep the Fluent ramp monotonic

**Rule.** Fix a failing accent contrast by re-deriving the whole ramp, never by patching the stops the
audit named. Fluent derives hover and pressed tokens from a stop's position in the ramp, so a stop that
is darker than its neighbour inverts those states and can create new failures while the audited stop
passes. Guard the ramp with a unit test that asserts monotonic luminance and the white-text ratio on
every background stop.

**Evidence.** Ticket 19a's first fix darkened only the failing stops (Ocean 70/80, Meadow 70, Plum 100);
Ocean 70 became darker than 60, so the derived hover and pressed tokens inverted. The re-review caught
it. The ramps were re-derived as monotonic families with white at ≥4.5:1, and `ui/src/theme/brand.test.ts`
now fails on a dip or a low-contrast background stop.

**Trigger.** Any edit to a theme's colour stops, especially a fix aimed at one failing axe rule.

---

## 2026-11-05 — Screen a proposed mock against the approved one before asking for approval

**Rule.** When a UI mock must be approved against an existing approved mock, run the mock-parity
screen (`documents/specs/mock-parity-screen.md`; `scripts/round/decision-probe.mjs`) on the pair, with a
closed claim list derived from the approved artifact. Treat a flagged atom as a question to confirm,
not a verdict: only a confirmed missing spec-required atom forces rework, and a mock-only difference is
a recorded mock correction. Put the `## Mock parity` table and `DM:` in the round doc, never in the
git-ignored `mockups/`.

**Evidence.** 2026-11-05, the settings mock: screening the first hand-drawn mock against
`v2-shell/01-shell-expanded-light.png` flagged an extra header control (0.911), an un-pinned footer
(PARTIAL 0.828), no members toolbar, and no date/time block in the sidebar (0.868). Rebuilding the mock
from the same prototype that produced the approved screenshot flipped the load-bearing atoms (toolbar
PRESENT 0.890, date/time block PRESENT 0.801, header control ABSENT). One transport detail: the probe
accepts `--images` on its own, but the hosted endpoint refused an image-only request with
`400 state must be a nonempty string`; a short `state` describing the two images fixed it.

**Trigger.** Any atomic claim about whether a proposed mock or built screenshot matches an approved
mock — a label, a region, a control, a column. Not a holistic "does this feel like the mock?"
judgement, which the screen is weak at.

---

## 2026-11-04 — A gate that does not name the workspace is not a gate

**Rule.** A verification gate must name every workspace it claims to cover. A root command that
silently excludes a workspace proves nothing about it, and a green run is not evidence for the part of
the tree the command never reached.

**Evidence.** Root `npm run verify` excluded `ui/**` from ESLint and the root tsconfig and never ran the
UI's tests: 87 UI tests existed while CI covered none of them, and the entry bundle was never built in
CI. The gap was invisible because the required check was green. Fixed by a separate `ui` job running
`ui:lint`, `ui:typecheck`, `ui:test` and `ui:build` (`chore/ui-ci-gate`, 2026-11-04).

**Trigger.** A repo with a workspace or sub-project carrying its own lint, tsconfig or test config; any
"the build is green" claim about code the gate does not name.

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
