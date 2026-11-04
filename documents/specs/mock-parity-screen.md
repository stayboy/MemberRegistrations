# Mock parity screen

|        |                                                          |
| ------ | -------------------------------------------------------- |
| Status | ADOPTED 2026-11-03 — advisory; the hard gate is PROPOSED |
| Tier   | process/tooling (no runtime behaviour)                   |
| Owner  | owner                                                    |

## 1. Problem

Verifying built UI work against a proposed mock is currently informal: a parent reads the page and the
mock and reaches a holistic judgement that is unrecorded and hard to reproduce. The decision-model
investigation in School-Collab showed that a classifier can answer a closed list of atom-level claims
with probabilities, and also showed the limits: it does not chat or read files, it is weak on holistic
questions (ANLI 69.8 vs CLINC 97.4), and a probability is not provenance.

## 2. The screen (settled)

A **one-way screen**, never a gate or an acceptance.

- The decision model (`clef:27b`, optional) answers a closed claim list; the reviewer — or the UI
  tester where one is enabled — confirms each flagged atom with `path:line`.
- Only a confirmed miss on a **spec-required** atom forces `REWORK`. A **mock-only** atom is a recorded
  **mock correction** (the spec beats the mock). The screen never writes `ACCEPTED`; the author owns
  the verdict.
- Claims are derived **mechanically** from the mock's structure (every visible label, column, field,
  route or row) and audited against a checklist before the pass.
- Thresholds: `choice` ≥ 0.80 max probability, `noul` ≥ 0.90; a missing probability is **not** a pass;
  `confidence` is never thresholded; ≥ 3 known-absent controls; re-run unstable rows with a permuted
  order (and a crop for images), recording `unstable`.
- Payloads: rendered DOM for implementation atoms, a screenshot for atomic visual presence, source
  text for structural atoms; capture per section (a whole-page dump exceeds the 64K cap).
- Record: a `## Mock parity` table plus `DM:` on the provider line when the classifier ran.

## 3. Calibration — the "true reflection" bar

The screen stays advisory until it is calibrated on a labeled set:

- ≥ 100 atom rows across text, image and rendered DOM, including ≥ 20 mock-only atoms and ≥ 10
  known-absent controls.
- Measure the confusion matrix: **false-pass** (the dangerous direction) and **false-rework**.
- A hard gate may be proposed only when false-pass = 0 on the set and false-rework ≤ 10 %, after ≥ 3
  rounds have run the screen. A false-pass resets the window.
- A hard gate amends the advisory ruling and needs its own protected-doc round.

## 4. Decisions (settled)

| #   | Decision            | Settled as                                                          | Rejected alternative                                |
| --- | ------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| Q33 | Authority           | One-way screen: may force `REWORK`, never write `ACCEPTED`          | A full accept/rework gate now                       |
| Q34 | Claim ownership     | Parent derives, a different actor audits completeness               | Author-invented, unaudited claims                   |
| Q35 | Thresholds          | 0.80 / 0.90, fail closed, ≥3 absent controls, stability re-run      | A 0.90 bar with no evidence                         |
| Q36 | Failure semantics   | Flag → confirm → rework; only a confirmed spec-required miss blocks | Strict conjunction (≈65 % false-rework at 40 atoms) |
| Q37 | Calibration         | ≥100 rows, false-pass 0, false-rework ≤10 %, ≥3 rounds              | 3–5 spot-check rows (statistically vacuous)         |
| Q38 | Arbitration         | Spec-required → `REWORK`; mock-only → mock correction               | Every mock atom blocks                              |
| Q39 | Location/precedence | Canonical reference + MR policy; School-Collab deferred             | Vendored skill overriding the spec                  |
| Q40 | Authority detail    | Screen now; hard gate after calibration + a protected round         | Amending the spec now                               |
| Q41 | Calibration set     | Labeled confusion matrix                                            | A spot-check                                        |
| Q42 | Tolerance           | Recorded, never silent                                              | An unrecorded tolerance                             |
| Q43 | Claim split         | Spec-required blocks; mock-only advisory                            | All mock atoms blocking                             |
| Q44 | Completeness        | Mechanical derivation + checklist audit                             | Free-form claims                                    |
| Q45 | Precedence          | MR policy + canonical; School-Collab its own spec/skill             | A vendored skill over the spec                      |
| Q46 | Calibration bar     | The numbers in §3                                                   | A looser bar                                        |
| Q47 | Record              | `## Mock parity` table + `DM:`                                      | Free-form narration                                 |

## 5. Evidence

- School-Collab `documents/specs/decision-model-seat.md` §2–§6, §10, §11.
- `documents/rounds/round-decision-model-spike.md` — 13/13 text, 6/6 image, 13/13 rendered DOM, all
  above threshold, ~$0.0045.
- `documents/rounds/round-assignment-view-page.md:538` — the spec-beats-the-mock arbitration ruling.
- Verified live: `POST https://ollama.com/v1/systemone` works here under `clef`, `clef:27b-cloud` and
  `clef:cloud`; a mock-vs-built demo flagged a missing atom at 0.9722 for ~430 tokens.

## 6. Boundaries and deferred

- The screen is advisory; `clef:27b` is optional; the probe is not wired into `verify`/CI.
- The labeled calibration set is backlogged.
- School-Collab adoption is its own spec + protected repo-skill round.
- `DM:` is not a seat and not a child run.

## Changelog

- **2026-11-03** — Adopted the advisory screen; the hard gate is proposed pending the labeled
  calibration set.
