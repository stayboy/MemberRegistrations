# Round — mockups at the repo root (git-ignored)

|         |                                                                    |
| ------- | ------------------------------------------------------------------ |
| Status  | CLOSED                                                             |
| Tier    | 2 — Reviewed                                                       |
| Base    | `697a863`                                                          |
| Spec    | `AGENTS.md` §14 Mockups, `documents/agents/orchestrator-policy.md` |
| Workers | `single`                                                           |

Provider: `ollama-cloud` (author parent; reviewer `deepseek-v4-pro:0813`).

## Plan

The owner decided that every visual mockup lives in one folder at the repository root, `mockups/`, and
that the folder is **git-ignored**. The durable record is the spec and the round doc.

- Move `documents/mockups/**` to `mockups/**` and delete it from git; add `/mockups/` to `.gitignore`.
- Record the rule in `AGENTS.md` §14: local artifact, never committed, never cited by a versioned path,
  no real data or credentials.
- Point the mock-parity rule and every spec/ticket reference at the local `mockups/` folder.
- Create the missing import mocks: `mockups/v2-imports/` — member database, attendance registry and an
  error state, at 1440×1150.

Acceptance criteria:

1. One root `mockups/` folder holds every mockup and is git-ignored.
2. `AGENTS.md` §14 states the rule; the policy and the UI/events specs and the affected tickets agree.
3. No stale `documents/mockups` reference or broken link remains.
4. The import mocks match the two-import contract (columns, template download, preview/errors).
5. The protected-doc record is re-recorded and the guard passes.

## Verification

| Gate              | Command                                                  | Result                                        |
| ----------------- | -------------------------------------------------------- | --------------------------------------------- |
| Protected guard   | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                                |
| Format/lint/types | `npm run format:check` / `lint` / `typecheck`            | pass                                          |
| Tests             | `npx vitest run --no-file-parallelism`                   | pass — 17 files, 190 passed / 3 skipped (193) |
| Build             | `npm run build`                                          | pass                                          |
| Import mocks      | Chrome headless through Playwright                       | three PNGs at 1440×1150                       |

## Review

Independent protected-doc review on `deepseek-v4-pro:0813`: **Standards PASS**, **Spec PASS**, no P1.
One P2 observation fixed: ticket 19 now distinguishes the committed live-build baseline from the
local, git-ignored design mock.

## Acceptance

| #   | Criterion                                  | Met | Evidence                                   |
| --- | ------------------------------------------ | --- | ------------------------------------------ |
| 1   | One git-ignored root `mockups/` folder     | yes | `.gitignore`; `git check-ignore`           |
| 2   | §14 + policy + specs/tickets agree         | yes | `AGENTS.md` §14; policy; spec/ticket diffs |
| 3   | No stale references or broken links        | yes | repo search                                |
| 4   | Import mocks match the two-import contract | yes | `mockups/v2-imports/` (local)              |
| 5   | Protected record re-recorded; guard passes | yes | `protected-doc-reviews.json`; guard 7/7    |

Verdict: **ACCEPTED**.

## Deviations

- The mockups are intentionally not committed, so a fresh clone has no screenshots; the spec is the
  durable record and the mocks are regenerated locally (see `mockups/v2-imports/README.md`).
- The stale `documents/mockups/v2-shell/04-imports-placeholder.png` is superseded by the new
  `mockups/v2-imports/` screens; the old placeholder remains only in the local folder.
