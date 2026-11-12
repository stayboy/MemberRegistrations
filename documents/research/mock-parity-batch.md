# Mock parity in batches with the decision model (`clef`)

Research note for discussion. Not a rule; nothing here is wired into `verify` or CI. The authoritative
behaviour of the screen is canonical `references/mock-parity.md` plus `documents/agents/orchestrator-policy.md`
("Mock parity").

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
   `headcount/10` -> `headcount-capture.png`. The other seven are `target` stubs with no entries.
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

Decisions 1–9 were reviewed by `deepseek-v4-pro:0813`. **Decision 10 was added after that review,
owner-only, and is outside it.**

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

## Adoption path, if the pilot passes

- Add the batch step to the round's Acceptance routine as an advisory `DM:` line, not a gate.
- Record the calibration rows in the research note; after ≥3 rounds and ≥100 rows with false-pass 0,
  propose the hard gate through a protected-doc round.
- Keep the reviewer confirmation; the screen never writes the verdict.
