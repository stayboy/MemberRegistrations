# Mock parity in batches with the decision model (`clef`)

Research note for discussion. The deterministic AC-inventory guard becomes a `verify:fast` step **only
through** the protected-doc edit in Decision 13; the `clef` screen itself stays out of `verify` and CI,
and nothing here is a rule until that edit lands.

## What the decision model is

`clef:27b` / `clef:27b-cloud` is a **scorer, not a chat model**. One call answers a closed list of
questions about a supplied artifact and returns a probability per answer; `output_tokens` is 0, so it
cannot invent prose. The repo's harness is `scripts/round/decision-probe.mjs`:

- `POST {base}/v1/systemone` with `{ model, questions, state?, images? }`.
- `questions`: 1–64 entries, each `choice` (four verdict words: PRESENT / PARTIAL / ABSENT /
  UNVERIFIABLE, each with a fixed criterion) or `noul` (a yes/no with a probability).
- `state`: text (the spec section, the pairing legend, the criteria).
- `images`: **at most 4** PNG/JPEG/WebP, base64.
- Bars: 0.80 on max probability for `choice`, 0.90 for `noul`. A missing or non-numeric probability is
  **NOT ANSWERED** — fail closed, never a pass.
- The claims must be **derived from an external artifact** (the mock, the spec), never invented by the
  author, or the screen grades the author.

## What "in one go" can and cannot mean

The 4-image cap is the constraint. A full sweep of this repo's baseline set (21 PNGs, 19 of them stale
before the refresh) is **not** one call:

| Batch unit                               | Images                 | Calls for 21 screens                |
| ---------------------------------------- | ---------------------- | ----------------------------------- |
| One screen, mock + build                 | 2                      | 21                                  |
| Two screens as pairs                     | 4                      | 11                                  |
| Four build renders with the mock as text | 4 (+1 mock as `state`) | not possible — the mock is an image |

So the batching unit is a **pair**: image A is the signed mock, image B is the built baseline, and the
questions ask about atoms _relative_ to A ("does B show the End action disabled, as A shows it?"). The
`state` string carries the pairing legend, the spec clause cited by the mock, and the four verdict
criteria — the same criteria the harness already sends.

Two pairs per call is the sweet spot: 4 images, 8–16 claims, well inside 64 questions and 64K input
(1440×900 PNGs are ~100–300 KB each, ~2 MB base64 for four).

## Why batch rather than per-screen

- **One record, one cost.** A 21-screen sweep becomes 11 calls and one result table instead of 21
  conversations and 21 hand-written verdicts.
- **Consistent criteria.** The same `state` legend and bars score every pair in the call, so a
  threshold is not re-argued per screen.
- **Comparable rows.** Results land as rows (claim, pair, answer, max probability) that map 1:1 onto
  the round doc's `## Mock parity` table — the table the policy already requires.

## Risks and the honest limits

1. **It scores, it does not judge.** The policy keeps the screen advisory, the reviewer confirms each
   flagged atom with `path:line`, and only confirmed misses on spec-required atoms force REWORK. Batching
   does not change that; it changes the cost of the first pass.
2. **Order and pairing sensitivity.** A pair can be read in either direction; the legend must state
   which image is the mock, and a permuted re-run is the stability check the harness already supports
   (`--permute`).
3. **False passes are the dangerous direction.** A stale mock scored against a matching build returns
   PRESENT and hides the drift. Two real examples from this repo: `03` (absent vs disabled End action)
   and `13` (disabled attribute not visible). Both were caught by a human comparing the spec, not by a
   model scoring mock-vs-build — because both artifacts agreed and the _spec_ disagreed. The batch screen
   must therefore include at least one **spec-derived control claim per pair** whose ground truth comes
   from the requirement, not from the mock.
4. **Calibration is a prerequisite for any gate.** The policy already sets it: a labelled set of ≥100
   rows, false-pass 0, false-rework ≤10%, over ≥3 rounds, then a protected-doc round. Nothing here
   shortens that.

## Proposed pilot (advisory, one round)

1. Take the **nine signed states** in `v2-imports` (4) and `headcount` (5) — the round-B sign-off table
   lists eleven rows across three sets, and the ninth state (`v2-events/09`) has no baseline. Pair each
   state with its committed baseline where one exists: `v2-imports/04` -> `imports-attendance.png` and
   `headcount/14` -> `headcount-capture.png` (the baseline shows the not-live state, which is `14`; `10`
   is live and has no baseline). The other seven are `target` stubs with no entries.
2. Derive 4-6 claims per **pair** from the mock _and one from the spec clause the mock cites_; two pairs
   per call, so one two-pair call exercises the 4-image limit, plus one `--permute` re-run.
3. Run `decision-probe.mjs` twice, second time `--permute`; record every result as `DM:` on the round-doc
   provider line.
4. Score against the round's existing manual parity verdicts as ground truth. Success: the two known
   defects are flagged, no spec-required atom is missed, and the permuted run agrees.
5. Only then extend it to each round's baseline set, still advisory, still confirmed by the reviewer.

Rejected: one call per screen (defeats the batching the owner asked about); a full 21-image call (the
cap forbids it); using the screen's agreement with the mock as evidence _about the spec_ (it cannot see
the requirement unless a claim carries it).

## Decisions (owner, 2026-11-12)

Decisions 1–9 were reviewed by `deepseek-v4-pro:0813`. **Decisions 10–17 were added after that review,
owner-only, and are outside it; Decisions 11–14 passed their own `0813` pass, and 15–17 are pending
theirs.**

1. **Store expectations, not stories.** One observable, one named state, one verdict word; a story is a
   reference container (`id`, actor, so-that) rendered on demand. Claims are selected by set+state,
   never hand-picked.
2. **One tracked file per mock set**, `documents/mock-claims/<set>.json`: `states` (mock path + sha256 +
   state, baseline filename + state, coverage class) and `entries` (`claim`, `expect`, `class`,
   `assert`, `spec {file, anchor, quote}`, `control`). The `anchor` is the spec's stable heading or AC
   id and the `quote` is copied verbatim — `file` + `anchor` + `quote` is the citation triple.
3. **Derived at mock sign-off**, in the same round, by the parent; **audited for completeness by a
   different seat — the round's reviewer seat, named in the round doc**. Edits to `class` or an anchor
   are reviewed edits recorded in the round doc. The JSON is not a protected document.
4. **`scripts/round/mock-claims.mjs`** emits `claims.json` + the `state` legend for a set+state
   selection. It refuses to emit unless each pair has ≥1 `control: spec` and **the call has ≥3
   `expect: ABSENT` controls that are spec-derived**; a call that genuinely cannot reach three records
   `controls: short (<n>)` with the reason and is advisory-only. Mock-only ABSENT claims never count
   toward the floor — they do not test the false-pass direction. The floor applies to **paired** states
   only: a `target` has no baseline image to pair and is never scored.
5. **Content pinning.** `tests/meta/mock-claims.test.ts` (in `verify:fast`) fails on a missing anchor, a
   quote that no longer occurs, duplicate ids or a dangling story. A stale quote marks the entry
   `STALE`; a mock whose sha differs from its sign-off row marks it `UNSIGNED`; the generator refuses
   either. A mock correction updates the sign-off row and the claim file's `states` entry **in the same
   round** — that is the stated regeneration path, so a redraw never deadlocks the catalogue.
6. **Coverage:** signed states when the surface is touched; `signed` / `reference` (no backfill) /
   `target` classes. Baseline-with-no-mock gets no rows; mock-with-no-baseline is a `target` plus one
   capture case as its entry ticket.
7. **Sequence:** `v2-imports` → `headcount` → `v2-events`. Pilot = two set files, 9 signed states,
   ~40 expectations, scored against the 2 pairs that have baselines. It proves derivation and controls,
   not coverage; the capture cases belong to each surface's own round.
8. **The tables are untouched.** `## Mock sign-off` stays the mock authority; `## Mock parity` keeps its
   existing columns and the expectation id rides inside the `Claim` cell (for example
   `HC-ENDED-03 · Close the session — the header shows one End of session action, visibly disabled`).
   The round-doc **template** is a protected document, so it is not edited for this; if a future round
   wants a dedicated column it takes the protected-doc review.
9. **Guards:** quotes copied, never paraphrased; auditor ≠ deriver; no `spec-required` entry without a
   resolving anchor (otherwise a backlog row or `mock-only`); void a pair whose baseline predates the
   round's base; `assert: e2e` for role/name checks so the model is not used for them; per-set
   `auditedBy` + date; retiring a state deletes its entries; `DM: not run` when no endpoint. The tier is
   **Tier 2**: the change adds a `verify:fast` gate and a generator, so it takes the worker + reviewer
   split.
10. **Chrome stays out of the catalogue.** The shell is spec-required (Shell Contract, FR-1…FR-10), so a
    `class: mock-only` shell block would file an FR-4 regression as a mock correction, and a shared block
    per set would leak the shell into a surface call. Chrome coverage is one **shell-geometry e2e case**
    (56 px header, 260/56 px rail, pinned footer, one scroll container) plus the five existing shell
    baselines. No `--include-shell` flag.
11. **The reverse AC-inventory guard is deterministic and it blocks the PR.** It reads the tracked spec
    headings as the denominator and the tracked **catalogue + inventory** as the subject, so it needs no
    model and no git-ignored image. It runs at sign-off for early feedback **and** as a `verify:fast`
    step, and it therefore blocks the merge. The earlier "blocks sign-off, not merge" wording was wrong:
    a step in `verify:fast` cannot stop at sign-off. The model's calibration rule does not apply because
    the guard scores nothing — calibration governs the `clef` screen only.
12. **The inventory owns the dispositions; the catalogue owns the claims.** A per-surface `inventory`
    block lists every AC of the surface's declared spec slice with `claimed | e2e-only | deferred`
    (never absent), the deferral's backlog row, or the e2e test name. Chrome ACs are `e2e-only` **in the
    inventory** while staying out of the catalogue's entries — that resolves the Decision 10 collision
    without either excluding them from the denominator or inventing spec-less claims.
13. **A blocking guard is a rule, so the round carries a protected-doc edit.** The "Mock parity" section
    of `documents/agents/orchestrator-policy.md` gains the guard's rule (denominator, dispositions,
    blocking, and the `assert: e2e` rule for absence/state clauses) and goes through the `0813`
    protected-doc review in the same round. A blocking check cannot live only in a research note that
    says it is not a rule.
14. **Two honest limits.** The surface→AC slice is a **recorded manual assignment** over mechanically
    derived headings (§7.1 maps FR→AC, not surface→AC), and the absence/state word match is a tripwire,
    not a proof: a rephrased clause can slip it, so the reviewer audits the classification and a new AC
    triggers re-derivation recorded in the round doc.
15. **Canonical placement (owner, 2026-11-12).** No new step: `references/mock-parity.md` gains a
    _Coverage guard (deterministic, blocking)_ section; `SKILL.md` gains one clause in 4b (the catalogue
    is derived at sign-off, pre-code) and one in step 3 (the guard is part of verify when a catalogue is
    declared); `references/role-contracts.md` gains the non-deriver audit duty; `CHANGELOG.md` and
    `skill-manifest.json` move with them. The advisory ruling is scoped to the **screen**, not to mock
    parity as a topic — calibration governs the screen because it scores; the guard scores nothing. The
    live step-3 text is "Run the repo's `verify` gate (format, lint, typecheck, tests, build)", so the
    clause attaches without rewording; `orchestrator-policy.md`'s "Parity stays advisory" becomes "the
    screen stays advisory" — the one sentence whose meaning moves.
16. **Tier 0 is not exempt at verify, only at the mock gate.** Tier 0 does not derive a catalogue and owes
    no sign-off; it is not exempt from keeping a declared catalogue true — an AC heading added, removed
    or reworded by a Tier 0 round moves the denominator and must carry a disposition or a recorded
    re-derivation **in that round's record, which at Tier 0 is the commit body** (there is no round doc).
17. **Canonical/repo split (amends 13).** Canonical: the two-instrument framing, denominator = tracked
    spec AC headings, subject = tracked catalogue + per-surface inventory, dispositions never absent,
    derivation at sign-off by the parent and audit by another seat, the guard in verify when a catalogue
    is declared, and the two honest limits. Repo-local: the `documents/mock-claims/` path and fields, set
    order, the chrome-`e2e-only` resolution, the `assert: e2e` clause list, the ≥3-ABSENT control floor,
    the protected-doc record and the `verify:fast` wiring. Both halves go through the **same** `0813`
    pass; the canonical text is parked in the round doc and reviewed as drafted bytes, and applying it
    means **byte-identical text modulo the record's normalisation** (CRLF→LF, trailing whitespace
    trimmed, BOM dropped) — no reformat between parking and applying.
18. **PNG comparison of mock↔build is rejected as a gate (measured, 2026-11-12).** Same-size pairs differ
    on 30–67% of pixels; the best structural correlation of an _intended_ pair is 0.44–0.56 while two
    **different screens** correlate 0.51, so no threshold separates "same atoms, different styling" from
    "different screen". Mock dimensions (1480×1000 fullPage, and 575–834 element shots) do not match the
    baselines (1440×900/1000/1150), and one cited pair is a byte-identical duplicate of another screen.
    Normalisation cannot recover signal: the mock is hand-written CSS with `Segoe UI`, the build is Fluent
    v9 tokens with `Segoe UI Variable`. Pixel diffing survives only as **build↔baseline** drift, where both
    sides come from the same renderer and the documented 6–30 px floor is calibratable.
19. **The blocking half is the DOM, not the image.** Atoms are proved by `assert: dom | e2e | token`
    (roles, names, exact text, `disabled`, computed Fluent token) — deterministic, free per round, already
    CI-capable. The `clef` screen stays for irreducibly visual atoms and stays advisory; the AC inventory
    and hash pins stay blocking. Stated plainly in the policy: **advisory = the screen and human
    classification; blocking = derivation completeness, AC inventory, hash pins and the e2e interpreter.**
20. **Mocks become tracked; that is its own round with its own protected pass.** Canonical gains the
    _tracked artefact set_ claim (source, signed PNG, provenance script, append-only sign-off ledger) and
    drops every repo-local path and git-ignore phrase; `mockups/<set>/`, the ledger file, the capture
    script/manifests, the shared-CSS pre-step and the tranches stay repo-local. Two hashes (`mock.sha256`
    and `htmlSha256`), append-only rows, and a capture `--states` filter are part of that round. It lands
    after the first catalogue, because the catalogue's `states` block is the per-state truth both the
    ledger and the manifest would otherwise re-invent.
21. **"Guaranteed to match the spec" is retired as a phrase (owner, 2026-11-12).** It decomposes into
    naming, nameable rendering, visual rendering, intent and scope; only the first two are mechanisable,
    and visual comparison was measured and rejected in Decision 18. The policy says instead: _a round that
    changes a user-visible surface does not merge until the mock's claims are catalogued and cited, the AC
    inventory is complete, and the owner's sign-off row resolves to that catalogue; the mock-DOM assertion
    runs at sign-off and is attested until mocks are tracked; the check proves naming and declared atoms —
    not intent, styling, or states the prototype does not draw._ Two guarantees exist, not one: spec↔mock
    before code, and build↔spec at acceptance — and only the tracked-catalogue half of the first can block
    a merge today.
22. **One declared atom, two targets.** Each entry declares the atom (role + accessible name, normalised
    text, attribute, count, order) with a per-target locator/normaliser: the mock's raw HTML (`<button
class="btn" disabled>`, separators as `·`) and the built page (Fluent `Button`, separators as `—`) do
    not share a DOM, so "the same locator" is false — the _predicate_ is shared, the mapping is not. It
    runs at sign-off against `mockups/<set>/<state>.html` (the `states[].mock.source` path) and at
    acceptance against the built page.
    Limits, stated: the mocks draw only the states they draw (headcount has live 10, ended 13, not-live
    14 — no "past-open", "no capture" or "cancelled" fixture); styling truth is a proxy (attribute +
    per-target computed-style expectation); mock-invented atoms stay `mock-only`; and separators and
    whitespace are normalised because the same atom is written with `-`, `·` and `—`.
23. **The sign-off gate has four artefacts, and only three can run in CI today.** Catalogue validity in
    `npm test`; **`check-round` R6** — a round touching `ui/src/**` must carry a non-empty `## Mock
sign-off` row naming a set+state that the tracked catalogue marks `coverage: "signed"`, plus the
    `claimed a · e2e-only b · deferred c · prose d` coverage line - in CI, and with a new `--staged` path in the
    pre-commit hook so the first commit fails; and `mock-dom: N/N` from a local `--check-mock` run.
    **What R6 cannot check today:** the sha of the mock file, because `mockups/` is git-ignored and absent
    in CI — the pin is a tripwire over an untracked artefact and is described as one until the tracking
    round. The vacuous `it.skip` goes: no catalogue anywhere stays legal, but a round that declares one
    must not pass because the guard had nothing to read.
24. **The record is a coverage statement, not a claim of equality.** `Mock coverage: <n> states signed ·
<n>/<n> atoms asserted on the mock · <n> ACs dispositioned (… · deferred → backlog) · owner sign-off
<date>` plus a `Not covered:` line (styling truth, states with no baseline, ACs outside `acsMatch`,
    intent). What stays human: the AC reading, `class`, the slice, the `signed` verdict.
25. **The smallest slice is headcount, and three schema defects are fixed with it.** (i) `spec-required`
    must accept a prose anchor — its core action-state requirement is prose in §Headcounts and FR-6f, not
    an AC — but every such entry carries `anchorKind: "ac" | "prose"` and the round reports a **separate**
    prose-coverage counter, so a prose requirement can never leave the denominator silently; an AC-anchored
    entry keeps today's rule. (ii) `e2e-only` and `assert: "e2e"` names must resolve to a real test title
    (`path::title`), not free text. (iii) Build-side assertions must cover live, ended and not-live; a
    state needs a baseline only to be _scored_ by the model pair, never to carry `assert: e2e` entries —
    so `10` and `13` get entries without becoming pairs. The mock-DOM run, verifiable pins, `htmlSha256`
    and the ledger wait for the tracking round.

## Adoption path, if the pilot passes

- Add the batch step to the round's Acceptance routine as an advisory `DM:` line, not a gate.
- Record the calibration rows in the research note; after ≥3 rounds and ≥100 rows with false-pass 0,
  propose the hard gate through a protected-doc round.
- Keep the reviewer confirmation; the screen never writes the verdict.
