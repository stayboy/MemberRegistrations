# Round — protected documents

|        |                                                             |
| ------ | ----------------------------------------------------------- |
| Status | CLOSED                                                      |
| Tier   | 2 — Reviewed                                                |
| Base   | `0da0c69`                                                   |
| Spec   | `AGENTS.md` §10a, `documents/agents/orchestrator-policy.md` |
| Ticket | process work (governance)                                   |

Provider: `ollama-cloud` (author parent; reviewer `deepseek-v4-pro:0813`).

## Plan

Adopt the School-Collab protected-document review gate for the repo's governing documents.

- **Protected set:** `AGENTS.md`, `documents/agents/orchestrator-policy.md`, `documents/lessons.md`,
  `documents/rounds/README.md`, `.github/merge-policy.md`, and every markdown file in the canonical
  orchestrator skill (`~/.agents/skills/orchestrator/`); the canonical checks skip in CI when the skill
  is absent.
- **Reviewer order:** `deepseek-v4-pro:0813` first; `glm-5.3` only when no provider answers 0813, with
  the unavailability in `fallbackReason`.
- **Record:** `documents/agents/protected-doc-reviews.json` — per file `path`, `sha256`, `reviewedBy`,
  `model`, `build`, `reason` (changes/why/rejected), optional `fallbackReason`, `verdict`,
  `attestation`, `at`.
- **Guard:** `tests/meta/protected-doc-review.test.ts` recomputes the SHA-256 (CRLF→LF, trailing
  whitespace trimmed, BOM dropped) and fails on moved text, a non-first-choice reviewer, a missing
  fallback reason, an orphan, a missing protected file, or a lost entry point.
- **Atomicity:** the amended document, its record entry and any guard change land in one commit; the
  record is written after the review of the final text. The hash cannot catch a document and its record
  edited together — the review is the control.

Acceptance criteria:

1. The protected set is enumerated in `AGENTS.md` §10a and the policy.
2. The record carries a reviewed hash, reviewer, reason and attestation per file.
3. The guard enforces the eight checks.
4. The canonical checks skip in CI; the repo checks run.
5. `AGENTS.md` §13 no longer lists protected-doc hash gates.
6. `npm run verify` passes.

## Verification

| Gate               | Command                                                  | Result                                        |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- |
| Guard (isolated)   | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests                                |
| Tests (serialized) | `npx vitest run --no-file-parallelism`                   | pass — 17 files, 140 passed / 3 skipped (143) |
| Format/lint/types  | `npm run format:check` / `lint` / `typecheck`            | pass                                          |
| Build              | `npm run build`                                          | pass                                          |

The default parallel `vitest run` flaked on this machine (PGlite hook timeouts / the known
`0xC0000409` worker crash); the serialized run is clean, and CI runs the parallel config with more
memory.

## Review

Independent Tier-2 review on `deepseek-v4-pro:0813`: **Standards PASS** (no P1; five P2 notes),
**Spec PASS**. The P2s were applied: the policy's `Protected documents` rule moved out from under
"Deliberately not adopted"; the one-commit atomicity line added; the record field list made explicit;
the entry-point check now asserts each protected file exists; the fallback-reason truthfulness stays
the review's control. Attestation recorded in `protected-doc-reviews.json`.

## Acceptance

| #   | Criterion                                            | Met | Evidence                                          |
| --- | ---------------------------------------------------- | --- | ------------------------------------------------- |
| 1   | Protected set enumerated in AGENTS.md §10a + policy  | yes | `AGENTS.md` §10a; policy `## Protected documents` |
| 2   | Record has hash/reviewer/reason/attestation per file | yes | `documents/agents/protected-doc-reviews.json`     |
| 3   | Guard enforces the eight checks                      | yes | `tests/meta/protected-doc-review.test.ts` (7)     |
| 4   | Canonical skipped in CI; repo checks run             | yes | `canonicalPresent` gate in the guard              |
| 5   | §13 no longer lists protected-doc hash gates         | yes | `AGENTS.md` §13                                   |
| 6   | `npm run verify` passes                              | yes | Verification table                                |

Verdict: **ACCEPTED**.

## Deviations

- The canonical checks are local-only (the skill is not installed in CI), matching `verify:skill`.
- The local parallel-vitest flake is an environment limit; the serialized run is the evidence and CI
  runs the parallel config.
