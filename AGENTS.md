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
  the amended spec**. Approval is a separate, explicit step.
- Record every settled decision in the spec, including the ones that were rejected.
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
shared file owns it and the other tracks must not touch it. Two building workers by default (concurrent
full builds/test suites have OOM-killed the process); workers run unit/API tests only, and the parent's
merged pass is the gate. Each round verifies only its own track; the cross-track integration is a
post-merge pass on `main`. Full rules:
`~/.agents/skills/orchestrator/references/parallel-workers.md`.

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
- `.githooks/pre-commit` runs `verify:fast`; install it with `npm run hooks:install`. It can be
  bypassed with `--no-verify`; this file remains the primary rule.

## 8. Tests

- Every behavioural change gets a test that fails before it and passes after it.
- A test command that runs zero tests is a failure, never a pass.
- When a suite is flaky: read the total, isolate the failing test, then re-run once. Record the
  outcome in the round doc; do not loop.
- Tests assert external behaviour — responses, persisted rows, computed counts — not internals.

## 9. Commit, push, PR merge

- Spec approval does **not** authorise a commit. Each of commit, push, PR and merge needs its own
  explicit owner instruction.
- Before committing, show the change set (`git status --short` + `git diff --stat`) unless the owner
  already named it.
- `main` is protected in process: work on `feat/`, `fix/` or `chore/` branches, open a PR, wait for
  the `verify` check, then squash merge and delete the branch. `.githooks/pre-push` blocks direct
  pushes to `main` locally; `--no-verify` is a deliberate bypass, not a workflow.
- Never push directly to `main`, force-push, or merge with a red/required check. Fix forward through
  a PR.
- Full policy: `.github/merge-policy.md`.

## 10. Round docs, lessons and backlog

- Tier 1–2 work gets one `documents/rounds/<slug>.md` with `## Plan`, `## Verification` and
  `## Acceptance`; see `documents/rounds/README.md`. It is committed but ephemeral.
- Durable lessons go to `documents/lessons.md`, newest first. Propose an entry in the reply; write it
  only when the owner accepts it.
- Deferred work goes to `documents/backlog.md`. Never silently descope.

## 10a. Governing documents are review-gated

`AGENTS.md`, `documents/agents/orchestrator-policy.md`, `documents/lessons.md`,
`documents/rounds/README.md`, `.github/merge-policy.md`, and every markdown file in the canonical
orchestrator skill (`~/.agents/skills/orchestrator/`) are **protected**: a change lands only after
`deepseek-v4-pro` build `0813` has reviewed the exact text. `glm-5.3` is admissible only when no
provider answers with that build (credit exhaustion, HTTP 429 and timeouts count as unavailable; a
registry listing does not), and only with the unavailability stated in `fallbackReason`.

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
ticket 19), unattended rounds, and GitHub issue/triage labels. Revisit when
the condition that excluded them changes; do not reintroduce them silently.
