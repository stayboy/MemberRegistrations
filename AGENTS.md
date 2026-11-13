# Repo rules — MemberRegistrations

Working agreement for agents in this repository. These are rules, not suggestions. The detailed
procedure lives in the shared `orchestrator` skill (`~/.agents/skills/orchestrator/SKILL.md`); the repo
delta is `documents/agents/orchestrator-policy.md`. This file owns the non-negotiables.

## 1. Spec first

- `documents/specs/member-registrations-api.md` is the source of truth. Any behaviour change updates
  the spec **before** code.
- If code and spec disagree, stop and fix both in the same change. Never leave a decision only in a
  chat transcript.

## 2. Grill before building

- For a non-trivial feature, run the grilling interview: map the design tree, ask the whole frontier
  in one round (numbered questions, each with a recommendation and its cost), and wait for answers.
- Do not write implementation code until the frontier is empty **and the owner has explicitly approved
  the amended spec**. Approval is a separate, explicit step. In an unattended round (§17) the end-of-round
  go-forward grill is auto-accepted, but the spec is still amended and recorded before any code.
- Record every settled decision in the spec, including the ones that were rejected.
- **A behavioural spec is reviewed by a separate higher-model session before the implementer builds
  against it, at every tier; the author's own reading never counts** (owner, 2026-11-05). Procedure:
  the canonical skill's Procedure step 1b. Reviewer model and the Tier 0 record:
  `documents/agents/orchestrator-policy.md`.
- After approval, a behavioural change to a spec needs re-approval. Typo, formatting and clarifying
  edits are allowed with a changelog line in the spec and a note in the ticket or round doc.

## 3. Execution modes

Use the tiered workflow in the shared `orchestrator` skill, narrowed by
`documents/agents/orchestrator-policy.md`. Record the tier in the round doc (Tier 0: in the commit
body).

- **Tier 0 (Solo)** — docs, config, or a contained change the owner explicitly places at Tier 0
  (trivial or no behaviour risk). The parent implements, self-reviews and self-accepts; the commit
  body is the record.
- **Tier 1 (Plan)** — a behavioural change. Approved spec + parent implements + written acceptance.
- **Tier 2 (Reviewed)** — multi-file behaviour, migrations, auth, wire contracts or risk. Tier 1 plus
  a `code-review` pass (Standards + Spec; fallback: the read-only `reviewer` subagent).

At Tier 0–1 the parent implements; at Tier 2+ a worker implements and the reviewer gate is
independent of it (see the policy). If the tier is genuinely ambiguous, put it in the grill round; do
not guess. Tier 3 and a dedicated UI tester stay deferred; the V2 UI gate is the minimal check in
ticket 19.

## 3a. Parallel workers

Parallel work is **opt-in per round**, recorded on round-doc line 1 as `Workers: parallel (tracks: …)`
or `Workers: parallel (slices: …)`. Eligibility is mechanical: the work partitions into file-disjoint
tracks/slices with no shared symbols, wire contracts or call-chain seams; a coupled unit merges into
one. The parent owns git and every shared file (migrations run one at a time); a track that delivers a
shared file owns it and the other tracks must not touch it. Tracks must be similar-sized; an uneven
pair runs serially. Persistent worktree slots are mandatory (a fresh slot pays a full install). Two
building workers by default — the cap is a memory guard, so record the peak RSS; workers run unit/API
tests only, never a browser harness, and the parent's merged pass is the gate. Each round verifies only
its own track; the cross-track integration is a post-merge pass on `main`. Rules live in
`~/.agents/skills/orchestrator/references/parallel-workers.md`; incident evidence, once owner-accepted,
lives in `documents/lessons.md`.

## 4. Date and time

- Backend dates are **UTC calendar dates**. Every default and every "today" uses UTC.
- `series.timezone` is the only override, and only for deciding "today" for that series.
- Clients convert to local time. The API never returns timezone-shifted dates.

## 5. History is append-only

- Never hard-delete a record that has history. End or archive it instead.
- Shepherding calls have no update and no delete. Corrections are new calls.
- The single exception is member purge, which is PII erasure and must be documented as such.

## 6. Security and privacy

- API routes require the bearer token. Browser traffic goes through the session gateway (`/auth/*`,
  `/gateway/v1/*`), which runs in the same Express app and Vercel function as the API and rewrites
  internally to `/v1/*`; it alone holds the bearer.
- The browser holds only a short-lived, revocable session credential, sent as a bearer header and
  stored in `sessionStorage`, never the API bearer and never an auth cookie. The bearer must not appear
  in the bundle, `localStorage`, a URL, a log or a screenshot.
- Sessions, magic links and rate-limit counters live in Postgres; do not rely on per-instance memory.
- Magic links go through a `Mailer` port: Resend in production, console/no-op in development and tests.
  Only active officers seeded by CLI can sign in; there is no self-service or domain allowlist.
- Browser writes carry no `X-Actor-Id`; the gateway derives it from the authenticated officer and
  discards a client-supplied value. For direct server-to-server callers, `X-Actor-Id` remains audit
  attribution, not authentication.
- V2 has no per-officer authorization: every authenticated officer can read and write the whole
  register. Do not imply otherwise in the UI or docs.
- Personal-data responses send `Cache-Control: no-store`.

## 7. Verification

- `npm run verify:fast` = `format:check` + `lint` + `typecheck` + `test`.
- `npm run verify` = `verify:skill` + `verify:fast` + `build`; this is the required gate.
- `npm run verify:skill` checks the installed orchestrator skill (files, hashes, seat ids) and this
  repo's pointer; in CI only the pointer is checked.
- `npm run smoke` builds and exercises the compiled server against PGlite. Run it for migrations,
  auth, wire-contract or cross-cutting changes.
- `.githooks/pre-commit` runs `verify:precommit`; install it with `npm run hooks:install`. It can be
  bypassed with `--no-verify`; this file remains the primary rule.

Durable process rules live in `documents/lessons.md`; `npm run verify` and `verify:fast` print a bounded per-step summary and write full logs to `.gates/`.

## 8. Tests

- Every behavioural change gets a test that fails before it and passes after it.
- A test command that runs zero tests is a failure, never a pass.
- When a suite is flaky: read the total, isolate the failing test, then re-run once. Record the
  outcome in the round doc; do not loop.
- Tests assert external behaviour — responses, persisted rows, computed counts — not internals.

## 9. Commit, push, PR merge

- Spec approval does **not** authorise a commit. Each of commit, push, PR and merge needs its own
  explicit owner instruction — except that "merge" invoked while the work is uncommitted authorises
  the whole chain (commit → push → PR → wait for the checks → squash merge → pull), and "go
  unattended" pre-authorises those four for that round (§17). Every action outside the round still
  needs its own instruction. Verb definitions: `.github/merge-policy.md` (Verb glossary).
- The **git-executor** seat (`.opencode/agents/git-executor.md`, ranked `opencode/beam-free` then
  `ollama-cloud/mimo-v2.6-flash`) may execute the command on a brief that quotes the owner's verb;
  the parent keeps the decision and verifies every result. The seat never infers consent, runs one
  verb per brief, and parks when unavailable. Seat and budget rules: `documents/agents/orchestrator-policy.md`.
- Before committing, show the change set (`git status --short` + `git diff --stat`) unless the owner
  already named it.
- `main` is protected in process: work on `feat/`, `fix/` or `chore/` branches, open a PR, wait for
  the `verify`, `ui` and `ui-e2e` checks, then squash merge and delete the branch.
  `.githooks/pre-push` blocks direct pushes to `main` locally; `--no-verify` is a deliberate bypass,
  not a workflow.
- Never push directly to `main`, force-push, merge with a red/required check, merge a blocked PR, or
  use `--admin` to bypass the ruleset. Fix forward through a PR.
- Full policy: `.github/merge-policy.md`.

## 10. Round docs, lessons and backlog

- Tier 1–2 work gets one `documents/rounds/<slug>.md` with `## Plan`, `## Verification` and
  `## Acceptance`; see `documents/rounds/README.md`. It is committed but ephemeral.
- Durable lessons go to `documents/lessons.md`, newest first. Propose an entry in the reply; write it
  only when the owner accepts it.
- Deferred work goes to `documents/backlog.md`. Never silently descope.

## 10a. Governing documents are review-gated

`AGENTS.md`, `documents/agents/orchestrator-policy.md`, `documents/agents/component-first.md`,
`documents/lessons.md`, `documents/rounds/README.md`, `.github/merge-policy.md`, and every markdown
file in the canonical orchestrator skill (`~/.agents/skills/orchestrator/`) are **protected**: a change
lands only after the reviewer seat has reviewed the exact text — `deepseek-v4-pro` build `0813` outside
the window, and `mimo-v2.6-pro` (the window seat, served by whichever configured provider answers)
between 12:00 and 18:00 local, or when no provider answers with `0813` (credit exhaustion, HTTP 429 and
timeouts count as unavailable; a registry listing does not). The basis is stated in `fallbackReason`.

The record is `documents/agents/protected-doc-reviews.json` — one entry per file with `path`, `sha256`
(of the exact reviewed text: line endings normalised to LF, trailing whitespace trimmed, a leading BOM
dropped), `reviewedBy`, `model`, `build`, `reason` (what changes, why it goes in now, what was
rejected), optional `fallbackReason`, `verdict`, `attestation` and `at`.
`tests/meta/protected-doc-review.test.ts` recomputes each hash and fails when the text moved after the
review, the reviewer is not the first choice, a fallback lacks a reason, an entry is orphaned, a
protected file is missing, or the protected set loses its entry point. **Edit → review → re-record**,
and the amended document, its record entry and any guard change land in **one commit**; there is no
trivial-edit bypass, and an unavailable reviewer parks the change.

The hash is a tripwire, not a signature: it cannot catch a document and its record being edited
together. The review is the control for that — a human reading the diff sees an unexplained hash
change next to a plausible-looking edit, and the recorded reason is the claim that must hold up.

## 11. Style

- TypeScript strict, ESM; Zod schemas are the contract and OpenAPI is generated from them.
- Parameterised SQL behind repository methods; never interpolate values into SQL.
- Match the existing structure and naming; keep routes thin and invariants with their data.

## 12. Data access and the ORM boundary

- The `Db` port (`query`, `exec`, `transaction`) is the transaction seam and the only access path for
  the attendance, occurrence and import engine. Those queries stay raw SQL.
- Drizzle is the chosen ORM for CRUD repositories only. Ticket 02 wires the schema and both drivers as
  the smoke; wider adoption is gated by the Series trial and gate (tickets 03–04). Construction lives
  in `src/db/schema.ts`, `src/db/orm.ts`, `src/db/pglite.ts` and `src/db/pg.ts`; query building stays
  inside `src/repos/`, never in routes, domain, Zod schemas or `src/db/sql.ts`.
- Migrations stay embedded SQL owned by the tracked runner. Drizzle Kit does not own migrations; a
  drift check asserts the ORM schema and the SQL migrations agree.
- Values are bound parameters; never interpolate them into `sql.raw`.
- Repositories map unique, foreign-key and check failures to the existing domain errors. No ORM error
  reaches a route or the problem+json handler.
- Both drivers — `pg` on Neon and PGlite in tests — must pass the same repository tests. A change that
  only works on one is a failure.
- Reverting the ORM must not require a schema change. If a ticket cannot meet that, it is not a
  CRUD-only change.

## 13. Deliberately not adopted

Full Tier 3 and a dedicated UI tester (the V2 gate is the minimal Playwright/axe/live-vs-mock check in
ticket 19), and GitHub issue/triage labels. Revisit when the condition that excluded them changes; do not
reintroduce them silently.

## 14. Mockups

- Visual mockups live in `mockups/` at the repository root, and that folder is **git-ignored**. A mock is
  a local review artifact, not source: never commit it and never cite a versioned path for it.
- The durable record is the spec and the round doc. Regenerate a mock locally when a screen changes;
  `documents/` must not hold mock images.
- Do not put real member data, contact values, bearer tokens or session credentials into a mock or its
  screenshots.

## 15. Component-first reuse (UI)

- In `ui/`, extract a component at the **second** call site; never speculatively. A design- or
  spec-named surface is extracted after the grill and the mock's states. A single call site stays
  inline.
- Compose Fluent UI primitives; do not wrap one to restyle it. Cross-page components live in
  `ui/src/components/`; page-local ones in `ui/src/pages/`.
- A component that fetches data or owns state is a **feature** component (a dialog or a route); a
  presentational component takes props and callbacks only.
- Full policy: `documents/agents/component-first.md`. Procedure: `.opencode/skills/component-first/SKILL.md`.

## 16. Fluent UI first, and the React baseline

- **A Fluent UI component is the first choice, before any raw element.** Reach for the v9 equivalent
  first: `Button`, `Input`, `Textarea`, `Dropdown`/`Combobox`, `Checkbox`/`Switch`/`Radio`,
  `Table`, `Dialog`, `Tooltip`, `Badge`, `Spinner`, `MessageBar`, `Card`, `Divider`, `Text`. A
  hand-rolled `<button>`, `<input>`, `<select>`, `<table>` or `<dialog>` is a defect when Fluent has an
  equivalent; if it genuinely has none, the round doc records why.
- **The Fluent component comes before a rewrite, at every level.** When Fluent provides the control, start
  from it and shape it through its own props, slots, variants and `makeStyles`. A bespoke re-implementation
  of a control Fluent already provides — a hand-built menu, combobox, dialog, table or popover — is a
  defect in the same way a raw element is, and it is a **blocking (P1) review finding**, not a taste note:
  it silently forks the behaviour the library gets right, including focus management, keyboard handling and
  ARIA wiring. Replacing a Fluent component with a rewrite must be argued in the round doc: name the Fluent
  component you tried and cite the limitation that ruled it out — a documented gap with its link, or a
  reproducible blocker. "It was awkward to customise" is not a limitation, and "it did not look right" is
  appearance, which belongs in props, slots and tokens rather than in a rewrite. A mock may hand-draw a
  control to show a look; production code may not.
- **Semantic elements are not controls.** `main`, `section`, `nav`, `form`, real headings, and lists
  stay HTML where semantics require them, styled with `makeStyles` and tokens; use Fluent `Label` for a
  form label. Heading levels are an accessibility contract, not a styling choice. The one other
  exception is an error-boundary fallback: it must not depend on the component tree that just failed.
- **One component library.** Fluent UI v9 is the only one. Never add a second, and never wrap a Fluent
  primitive merely to restyle it (§15).
- **React correctness is `react.dev`'s Rules of React** (`https://react.dev/reference/rules`). The
  Rules of Hooks are enforced mechanically by `eslint-plugin-react-hooks`, already configured in the UI
  workspace, and Strict Mode is enabled; purity and immutability are review obligations. When a rule and
  a habit disagree, the rule wins; when the docs and a blog post disagree, the docs win.
- **Look for an existing skill before inventing a pattern.** The repo's own `.opencode/skills/` and the
  installed skills come first — they are this repo's procedure. For anything they do not cover, start
  the catalogue search at the GitHub `awesome-copilot` skills index
  (`https://github.com/github/awesome-copilot/blob/main/docs/README.skills.md`), then
  `https://github.com/microsoft/skills` for first-party Microsoft guidance. If one covers the task, use
  or install it; if none does, say so and propose the approach. Never substitute an unlisted source
  silently.

## 17. Unattended rounds (owner, 2026-11-04)

- **Standing instruction.** The go-forward `grill-me` round runs when the owner accepts that the next
  round may begin, not automatically at the closing bell; when it runs, its recommendations are accepted
  automatically, so the next round starts without a second wait. The owner may still run a round
  attended by saying so. The consent is this rule, never the owner's silence.
- **Grill-me seat (owner, 2026-11-07).** Every `grill-me` session defaults to
  `ollama-cloud/deepseek-v4.1-flash:1017` — the ollama provider first; if that provider fails, use
  `cline-pass/cline-pass/deepseek-v4.1-flash-1017`. Between 12:00 and 18:00 local the provider preference
  flips: the cline-pass provider is tried first and `ollama-cloud` is the fallback (owner, 2026-11-11). The
  window moves **the grill-me, reviewer-class and worker seats**; every other seat is unclocked (owner,
  2026-11-13).
- **Worker seat (owner, 2026-11-13).** The Tier 2+ implementer follows the window like the seats above:
  between 12:00 and 18:00 local it is `cline-pass/cline-pass/deepseek-v4.1-flash-1017`, and outside the
  window the same model on `ollama-cloud` (`ollama-cloud/deepseek-v4.1-flash:1017`). An explicit owner
  override for a round beats both, and the round doc records it. The parent integrates and commits; at
  Tier 2+ it does not author the implementation.
- **The grill still happens.** An unattended round asks the whole frontier in one numbered round with a
  recommendation per question. Every accepted decision is written into the owning **spec** (§1) and
  recorded in the round doc as `Mode: unattended (auto-accept recommendations)`; the completion report
  repeats them as a table. A decision must never live only in the round doc.
- **What auto-accept does not cover.** A migration, a wire-contract change, security or auth, tenant
  isolation, or deleting a public route still parks for the owner unless they pre-authorised **that
  specific round by name**. "Go unattended" is not that authorisation: it covers the round's mechanics
  and its commit/push/PR/merge, not those gates.
- **The gates are unchanged.** Tier, plan review, spec review, the worker/reviewer split, tests and the
  PR flow all still run. "Unattended" is a modifier on a round, never a tier and never a reason to skip a
  check. The owner cannot see the change set before the commit, so the completion report carries it
  instead (`git show --stat` per commit); §9's "show before committing" applies to attended rounds.
- **Pre-authorisation.** The owner may also pre-authorise a named round's hard gate in advance (for
  example "unattended, and the migration is approved"). That must name the round and the gate.
- `documents/rounds/README.md` owns the round-doc shape; this section owns when the mode applies.
