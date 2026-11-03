# Repo rules — MemberRegistrations

Working agreement for agents in this repository. These are rules, not suggestions. The detailed
procedure lives in `.opencode/skills/orchestrator/SKILL.md`; this file owns the non-negotiables.

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

Use the tiered workflow in `.opencode/skills/orchestrator/SKILL.md`. Record the tier in the round doc
(Tier 0: in the commit body).

- **Tier 0 (Solo)** — docs, config, or a contained change the owner explicitly places at Tier 0
  (trivial or no behaviour risk). The parent implements, self-reviews and self-accepts; the commit
  body is the record.
- **Tier 1 (Plan)** — a behavioural change. Approved spec + parent implements + written acceptance.
- **Tier 2 (Reviewed)** — multi-file behaviour, migrations, auth, wire contracts or risk. Tier 1 plus
  a `code-review` pass (Standards + Spec; fallback: the read-only `reviewer` subagent).

The parent implements at every tier. If the tier is genuinely ambiguous, put it in the grill round;
do not guess. Tier 3 and a dedicated UI tester stay deferred; the V2 UI gate is the minimal check in
ticket 19.

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
- `npm run verify` = `verify:fast` + `build`; this is the required gate.
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

## 11. Style

- TypeScript strict, ESM; Zod schemas are the contract and OpenAPI is generated from them.
- Parameterised SQL behind repository methods; never interpolate values into SQL.
- Match the existing structure and naming; keep routes thin and invariants with their data.

## 12. Data access and the ORM boundary

- The `Db` port (`query`, `exec`, `transaction`) is the transaction seam and the only access path for
  the attendance, occurrence and import engine. Those queries stay raw SQL.
- Drizzle is the chosen ORM for CRUD repositories only, and only after the Series trial (tickets
  03–04). It is imported inside `src/repos/`, never in routes, domain, schemas or `src/db/sql.ts`.
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
ticket 19), unattended rounds, protected-doc hash gates, parallel workers/worktrees, GitHub
issue/triage labels, and pinned model seats. Revisit when the condition that excluded them changes;
do not reintroduce them silently.
