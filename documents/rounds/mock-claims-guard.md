# Round — mock-claims-guard

|                     |                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | ACCEPTED                                                                                                                                                                                                                  |
| Tier                | 2                                                                                                                                                                                                                         |
| Mode                | attended (owner: "all as recommended", 2026-11-12)                                                                                                                                                                        |
| Base                | `b726650`                                                                                                                                                                                                                 |
| Review rounds       | 2 — window seat: code REWORK on two P1s, fix pass, ACCEPTED; protected text PASS                                                                                                                                          |
| Gate runs in parent | 9                                                                                                                                                                                                                         |
| Spec                | `documents/research/mock-parity-batch.md` (Decisions 1–25); `orchestrator-policy.md` Mock parity                                                                                                                          |
| Workers             | `single`                                                                                                                                                                                                                  |
| Git seat budget     | `git-seat-budget: 6` (owner, 2026-11-12; rung 1 `opencode/beam-free` is at its free-usage limit)                                                                                                                          |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (catalogues, protected text); worker ollama-cloud/deepseek-v4.1-flash:1017 (generator, guard tests, `check-round` R6 + `--staged`, `gates`/`verify` wiring, e2e spec + fixtures) |

## Plan

Turn the accepted plan into the first working slice: a per-set expectation catalogue, a generator that
emits `clef` claims for a set+state selection, and the deterministic reverse AC-inventory guard.

### Schema — `documents/mock-claims/<set>.json`

```jsonc
{
  "set": "headcount",
  "specs": ["documents/specs/member-registrations-api.md"],   // the set's spec slices
  "surfaces": [
    {
      "id": "ussd-headcount",                                  // unique across files
      "route": "/ussd/headcount",
      "spec": [{ "file": "...", "section": "Acceptance Criteria" }], // declared slice
      "acsMatch": ["headcount"]                                // the recorded manual assignment
    }
  ],
  "states": {
    "not-live": {
      "mock": { "path": "mockups/headcount/14-headcount-not-live.png", "sha256": "aaae…",
                "source": "mockups/headcount/14-headcount-not-live.html" },   // source = derivation target
      "baseline": "headcount-capture.png",                     // or null
      "coverage": "signed" | "reference" | "target"
    }
  },
  "inventory": [
    {
      "surface": "ussd-headcount",
      "acs": [
        { "file": "...", "id": "AC-7a", "disposition": "claimed", "entry": "HC-ENDED-01" },
        { "file": "...", "id": "AC-4a", "disposition": "e2e-only", "test": "headcount capture" },
        { "file": "...", "id": "AC-32", "disposition": "deferred", "backlog": "...", "revisit": "..." }
      ]
    }
  ],
  "stories": [{ "id": "HC-ENDED", "as": "operator", "iWant": "…", "soThat": "…", "spec": { "file": "...", "anchor": "...", "quote": "..." } }],
  "entries": [
    {
      "id": "HC-ENDED-01",
      "story": "HC-ENDED",
      "state": "ended",
      "claim": "The header shows one End of session action, visibly disabled.",
      "expect": "PRESENT",
      "class": "spec-required" | "mock-only",
      "assert": "image" | "dom" | "e2e" | "api",
      "spec": { "file": "...", "anchor": "AC-7a", "quote": "…" },
      "ac": ["AC-7a"],
      "control": "spec" | "absent"                             // optional
    }
  ]
}
```

**Entry additions (Decisions 22 and 25).** `anchorKind: "ac" | "prose"` is required whenever `class` is
`spec-required`; a prose anchor carries no `ac`, is counted in its own coverage line, and can never leave
the denominator silently. An entry with `assert: "dom" | "e2e"` carries `target: { mock: <locator>,
build: <locator> }` — the same atom declared twice, because the mock's raw HTML and the built Fluent tree
do not share a locator; the mock side runs against `states[].mock.source`. An `assert: "e2e"` entry and an
`e2e-only` inventory row name a test as `path::title`, and the guard resolves it against that file. The
coverage line is `claimed a · e2e-only b · deferred c · prose d`.

**Build order and owners.** Parent: the catalogue and the protected text. Worker: the guard additions
(`anchorKind`, prose counter, `target` validation, `path::title` resolution, the four-part coverage line)
**and** `check-round` **R6** (row present, catalogue `signed` state, coverage line) with its `--staged`
path and the `tests/meta/check-round.test.ts` cases. R6 is new code in `scripts/check-round.mjs`; nothing
in it reads a mock file, so it works while `mockups/` stays ignored.

### Rules

- **Schema guard** (`tests/meta/mock-claims.test.ts`, inside `npm test`, therefore inside `verify:fast`):
  every file parses; ids unique across files; every `spec.file` exists; every `anchor` resolves to a
  heading or AC id in that file; every `quote` occurs verbatim in the referenced section; every entry's
  `story` resolves; every `state` resolves; every `ac` id exists in the declared slice; dispositions are
  `claimed | e2e-only | deferred` and never absent; a `deferred` names a backlog anchor; an `e2e-only`
  names a test; every `spec-required` entry carries `anchorKind: "ac" | "prose"`, and an `ac` anchor's ids
  all exist in the declared slice.
- **Reverse AC-inventory guard**: for every surface, every AC heading in its declared slice **that matches
  one of its `acsMatch` patterns** must appear in the inventory exactly once. The patterns are the one
  recorded manual assignment (Decision 14): a spec that lists every AC in one section would otherwise
  demand 30–80 rows per surface. A surface with an empty `acsMatch`, or patterns that select no AC in the
  slice, fails. Failure text prints
  `AC inventory: <surface> (patterns: …) lists N ACs; claimed a · e2e-only b · deferred c · prose d · uncited e` and
  states it proves naming, not rendering.
- **Absence/state rule**: an AC whose clause contains `disabled`, `no action`, `not shown`, `nothing is
written` (tripwire) must not be `claimed` by an `assert: image` entry; it must be `assert: e2e` (entry
  or disposition).
- **Generator** (`scripts/round/mock-claims.mjs`): `--set <name> --states <a,b> [--json]` emits
  `{ claims, state }` for `decision-probe`; refuses (non-zero, no output) when the selection has no paired
  state, when a pair lacks a `control: spec` entry, when the call has fewer than 3 `expect: ABSENT`
  spec-derived controls (or emits `controls: short (<n>)` with `--allow-short`), or when a state is
  `target`.
- **No model in `verify`**: the generator and the guard are deterministic; the `clef` run stays manual
  (`DM:` on the provider line).

### First slice

`documents/mock-claims/headcount.json` only (surface `ussd-headcount`, states `live`/`ended`/`not-live`):
entries for the paired `not-live` state plus `assert: e2e` entries for `live` and `ended`, because a state
needs a baseline only to be _scored_ by the model pair — never to carry a declarative assertion. The
inventory covers AC-33/AC-33a plus the prose-anchored action-state requirement (`anchorKind: "prose"`,
counted in its own line). `v2-imports.json` moves to the next round (Decision 25).

### Protected text in the same round

Reviewed as drafted bytes. The first pass returned REWORK on one overclaim — the draft described the
mock-side DOM run as current while Decision 25 defers it — so three sentences were softened and the
confirmation accepted the softened text; that confirmed text is what landed, and the record entries carry
the hashes of the landed bytes.

> **Policy, Mock parity:** _a round that changes a user-visible surface does not merge until the mock's
> claims are catalogued and cited, the AC inventory is complete, and the owner's sign-off row resolves to
> that catalogue; the built page is asserted at acceptance, and the mock-side run, the verifiable pins and
> the ledger land with the tracking round; the check proves naming and declared atoms - not intent,
> styling, or states the prototype does not draw._
>
> **Canonical `references/mock-parity.md`:** two instruments, one record — the coverage guard (the AC
> inventory, names, blocking; the declared atoms asserted against the built surface) and the parity screen
> (irreducibly visual, advisory) — with the same limits.

Also: "Parity stays advisory" → "the **screen** stays advisory"; `SKILL.md` gains one clause in 4b and one
in step 3; `role-contracts.md` the non-deriver audit; `CHANGELOG.md` + `skill-manifest.json` move with them.

#### Exact canonical text

`references/mock-parity.md`, opening paragraph replaced by:

> # Mock parity — verifying a mock against the spec, and built work against the mock
>
> Two instruments, one record. The **coverage guard** is deterministic and blocking: a tracked catalogue
> of the mock's atoms is checked against the spec's AC headings, and the mock's declared atoms are
> asserted against the built surface at acceptance. The **screen** is advisory, never a gate or an
> acceptance: it measures whether the built surface carries atoms that cannot be named, and a named seat
> confirms each flagged atom. The verdict stays with the author (`SKILL.md` step 5).

New section, after "Claim derivation":

> ## Coverage guard (deterministic, blocking)
>
> - Denominator: the spec's AC headings matched by the surface's recorded pattern list. Subject: the
>   tracked catalogue and its per-surface inventory. Every matched AC is `claimed`, `e2e-only` or
>   `deferred` — never absent; a prose-anchored requirement reports in its own counter.
> - The catalogue is derived at sign-off by the parent and audited by a seat other than the deriver; a
>   `spec-required` entry cites `file`, a resolving anchor and a verbatim quote, and an absence or state
>   clause is asserted with a test, never by an image.
> - A round that changes a user-visible surface records the owner's sign-off row and a coverage line; a
>   round that changes the surface's code fails the repository's round check without one.
> - The guard proves naming and declared atoms. It does not prove intent, styling, or a state the
>   prototype does not draw, and it scores nothing, so the calibration bar below does not apply to it.

`SKILL.md` step 3 — append after "build)." — "When the changed surface has a declared catalogue, the
AC-coverage guard is part of the verify gate."

`SKILL.md` 4b — append after "then runs at Acceptance." — "The catalogue of the mock's atoms is derived at
sign-off, before implementation, and its declared atoms are asserted against the built surface at
acceptance."

`references/role-contracts.md` — under Confirmer — "The catalogue's completeness is audited by a seat other
than its deriver."

`references/mock-parity.md`, calibration — replace "and only via a protected-doc round, because it amends
the 'advisory, never a gate' ruling." with "and only via a protected-doc round, because it amends the
ruling for the **screen**; the coverage guard scores nothing and is not calibration-gated."

Acceptance criteria:

1. `npm test` runs the schema guard and it fails on: a missing quote, a dangling story, a duplicate id,
   an AC not in the inventory, an absence/state AC claimed as `image`, a prose-anchored entry without
   `anchorKind`, and an `e2e`/`e2e-only` name that does not resolve to a real test title.
2. The generator refuses an unpaired state, a missing `control: spec`, and fewer than three ABSENT
   controls; `--allow-short` emits `controls: short (<n>)`.
3. `documents/mock-claims/headcount.json` validates; its inventory covers every pattern-matched AC plus
   the prose requirement, and the coverage line prints `claimed · e2e-only · deferred · prose`.
4. `check-round` **R6**: a round touching `ui/src/**` without a resolving `## Mock sign-off` row fails, in
   CI and via `--staged` in the pre-commit hook. It checks the row, the catalogue's `signed` state and the
   coverage line — **not** the mock's sha, which is untracked today.
5. Build-side e2e asserts live (enabled), ended (disabled) and not-live (absent) for the headcount action.
6. The policy and canonical text land with the window-seat review and refreshed hashes in one commit.
7. `verify` (7 steps), `ui:test` and `ui:e2e` pass; the pilot records `DM:` or `DM: not run` with the
   reason.

## Verification

Parent's numbers (authoritative). The parallel `test` step is flaky **on this machine** and not because of
this diff: six runs died with exit `3221226505` (a Windows fail-fast in the PGlite WASM worker),
**zero failed assertions**, and a different file named each time (`tests/api/ussd.test.ts`, then
`tests/api/ussd-attendance.test.ts`). The named file passes in isolation, and
`npx vitest run --no-file-parallelism` — the same command the `precommit` profile runs — is green over all
741 tests. Per `AGENTS.md` §8 the sequence is recorded, not looped; the parallel `verify` was green at
`17:19:52`, and every later attempt carried only round-doc and test text.

| Gate                                                                         | Result                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                                                             | **7/7** (signature below)                                                                                                                                                                                                           |
| `npm run verify` (flaked attempts)                                           | `17:16:33`, `17:17:29`, `17:18:41`, `17:21:43`, `17:22:45`, `17:39:32` — worker exit `3221226505`, 722–732 of 741 reached, 0 failed, `Errors 1`                                                                                     |
| `npx vitest run --no-file-parallelism`                                       | **741 tests: 735 passed, 6 skipped, 52/52 files**, 100 s — the serial proof the suite is sound                                                                                                                                      |
| `npm run verify:precommit`                                                   | **5/5** at `17:38:44Z` (`check-round --staged` + format + lint + typecheck + serial test) — the gate proof for the final text                                                                                                       |
| `npm run ui:test`                                                            | **417 passed**, 39 files                                                                                                                                                                                                            |
| `npm run ui:e2e`                                                             | **68 passed** (chromium, 44.9 s) — includes the three headcount action-state cases and the axe sweeps                                                                                                                               |
| `npx vitest run tests/meta`                                                  | **138 passed**; `check-round.test.ts` 53 after the last case                                                                                                                                                                        |
| `node scripts/check-round.mjs --files documents/rounds/mock-claims-guard.md` | `check-round: ok`                                                                                                                                                                                                                   |
| `node scripts/round/mock-claims.mjs --set headcount --states not-live`       | refuses by design: _"state not-live is paired but has no `control: spec` entry"_                                                                                                                                                    |
| DM pilot                                                                     | **not run** — every headcount atom is an `assert: e2e` atom, so the pair has no image claim, and the generator refuses a pair without a spec-derived image control. Inventing an image atom to satisfy the tool would be gaming it. |

One defect surfaced only in the e2e run: the first pass added the action-state events to the shared
`GET /gateway/v1/events` list, and `ui/e2e/offerings.spec.ts` failed because the offerings page's USSD
preview selected the new session dated today instead of `Foundation service`. The pair is now opt-in
(`GatewayStub.includeActionStates`), set only by the two headcount action-state tests; the lesson is
`documents/lessons.md` (2026-11-12).

gate-run 2026-11-12T17:19:52.442Z profile=full steps=7/7 lines=7 bytes=789

`verify:skill` is green with the refreshed manifest (`SKILL.md` `c827d8f7`, `role-contracts.md` `9ee486c2`,
`mock-parity.md` `9c552b01`, `CHANGELOG.md` `7414b213`).

The catalogue's own line, recorded here even though this round changes no `ui/src/**` file and so does not
require one:

```
Mock coverage: claimed 0 · e2e-only 2 · deferred 0 · prose 1
```

Two ACs (`AC-33`, `AC-33a`) are `e2e-only`; the prose-anchored action-state requirement is one requirement
claimed by five state entries, which is why the prose counter reads `1` and not `5`.

## Review

Tier 2. The gate is independent of both implementers: parent (`opencode/deepseek-v4.1-flash-free`) wrote
the catalogue and the protected text, worker (`ollama-cloud/deepseek-v4.1-flash:1017`) wrote the
generator, both test suites, R6 + `--staged`, the `gates`/`verify` wiring and the e2e spec + fixtures.

**Seat correction (recorded in Deviations).** The first code and protected reviews ran on `0813` inside the
12:00–18:00 window and were discarded as seat-invalid; both were re-run on the window model. The
`cline-pass/cline-pass/mimo-v2.6-pro` route is refused by the harness as `model not found`, so
`ollama-cloud/mimo-v2.6-pro` served the seat with the basis in `fallbackReason`.

**Code review — window seat (`ollama-cloud/mimo-v2.6-pro`): REWORK**, two P1s:

1. `HC-ACTION-02/03/04` cited `ui/e2e/headcount.spec.ts::the headcount page is read-first…`, which asserted
   none of them — the absence/state rule's e2e proof did not exist where the catalogue said it did.
2. Three R6 branches had no negative test (no png row; a png resolving to no state `mock.path`; a row not
   marked `signed`) and the precommit wiring was unpinned — removing each left the suite green.

P2s recorded: HC-ACTION-06 cited the wrong test; story ids were not checked cross-file; the Tier-1 floor
test had been repointed off `ui/src/**`.

**Fix pass (worker):** the three not-live assertions added to the read-first test (state line, no `Live`,
no `Past session`); three R6 negatives plus a precommit pin; cross-file story-id uniqueness; HC-ACTION-06
repointed to `an ended session shows End of session disabled, not absent`; coverage line now counts prose
**rows**. Parent: the two stale round-doc lines, the `Implementer` row, and the record re-attestation.

**Confirmation — window seat: ACCEPTED.** `P1.1: CLOSED`, `P1.2: CLOSED`, `Seat: consistent`, one P2
(`tests/meta/check-round.test.ts` — no case pinned the `ui/src/**` Tier-1 floor after the repoint). That
P2 was then closed in the same round with `requires Tier 1 for ui/src/** paths`.

**Protected text — window seat: PASS.** One thing said about advisory vs blocking (screen advisory and
calibration-gated; guard deterministic and blocking); every claim true of the code as it stands; the
canonical names no repository layout. Round 1 had returned REWORK on the mock-side DOM run being described
as current, and the softened text is what landed.

Seat: consistent — the round doc's `Implementer` row matches the file split the reviewer read.

## Mock sign-off

n/a — no new visual state; the round reads the signed `headcount/10`, `13`, `14` and `v2-imports/02–05`.

## Mock parity

n/a — the round builds the machinery that will produce parity rows; no surface changed.

## Acceptance

**ACCEPTED.**

| Criterion                                                                                 | Evidence                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Schema guard in `npm test`, failing on each defect                                     | `tests/meta/mock-claims.test.ts` (75 tests: missing quote, dangling story, duplicate id, uncovered AC, absence/state AC as `image`, prose without `anchorKind`, unresolved `path::title`) |
| 2. Generator refuses unpaired state, missing `control: spec`, <3 ABSENT; `--allow-short`  | same suite; live refusal recorded in Verification                                                                                                                                         |
| 3. `headcount.json` validates; inventory complete; four-part coverage line                | tracked-catalogue integration case; `Mock coverage: claimed 0 · e2e-only 2 · deferred 0 · prose 1`                                                                                        |
| 4. R6 fails a `ui/src/**` change without a resolving row, in CI and `--staged`            | `tests/meta/check-round.test.ts` (8 R6 cases + 3 staged + the precommit pin); R6 reads no mock file                                                                                       |
| 5. e2e asserts live enabled, ended disabled, not-live absent                              | `ui/e2e/headcount.spec.ts:41-43`, `:95-105`, `:107-116`; 68 e2e passed                                                                                                                    |
| 6. Policy + canonical land with the window-seat review and refreshed hashes in one commit | five `2026-11-12` record entries on `ollama-cloud/mimo-v2.6-pro` with `fallbackReason`; policy hash `335b0e23…`                                                                           |
| 7. `verify` 7 steps, `ui:test`, `ui:e2e`; pilot records `DM:` or `DM: not run`            | Verification table; `DM: not run` with the structural reason                                                                                                                              |

## Git writes

One verb per brief on the git-executor seat; rung 1 is unavailable (free-usage limit), so rung 2
(`ollama-cloud/mimo-v2.6-flash`) runs inside the owner's budget.

| Verb            | Variant | Result                                                                                                                      |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| branch create   | parent  | `feat/mock-claims-guard` — the seat forbids a branch from a dirty tree, and the round's work is uncommitted by construction |
| commit          | rung 2  | pending                                                                                                                     |
| push            | rung 2  | pending                                                                                                                     |
| PR create       | rung 2  | pending                                                                                                                     |
| squash merge    | rung 2  | pending                                                                                                                     |
| post-merge pull | rung 2  | pending                                                                                                                     |

`fallbackReason`: `opencode/beam-free` answered "Free usage limit reached" twice (a provider-side quota, so
unavailable under `orchestrator-policy.md`); rung 2 is the ranked fallback and runs inside the declared
`git-seat-budget: 6`.

## Deviations

- The catalogues are written by the parent while the generator, tests and R6 are the worker's slice — the
  schema in this doc is the contract both build to.
- The pilot's `clef` calls depend on an endpoint; when it is absent the record says `DM: not run`. For
  `headcount` the refusal is structural rather than environmental: every atom is nameable (`assert: e2e`),
  so the pair has no image claim and the generator refuses a pair without a spec-derived image control.
- **Seat correction.** The first code and protected reviews ran on `0813` at 16:5x, inside the 12:00–18:00
  window; `orchestrator-policy.md:37` makes the window model the seat there, so both verdicts were
  discarded and both reviews were re-run on `ollama-cloud/mimo-v2.6-pro` (the `cline-pass` route refuses
  the id, so the same window model is served by the other provider, with `fallbackReason` recorded). The
  content the discarded review found was still fixed on its evidence, then re-reviewed.
- **Review bound.** The window-seat code review returned REWORK on two P1s (three not-live atoms cited a
  test that did not assert them; three R6 branches had no negative test). One fix pass closed both, and
  the round proceeds on the confirmation below rather than looping.
