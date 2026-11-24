# Round - events-mock-rebuild

|                        |                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Status                 | OPEN                                                                                                               |
| Tier                   | 2                                                                                                                  |
| Mode                   | `unattended (auto-accept recommendations)` - standing consent to the milestone                                     |
| Base                   | `c4b2fad`                                                                                                          |
| Review rounds          | 0                                                                                                                  |
| Gate runs in parent    | 0                                                                                                                  |
| Spec                   | `documents/mock-claims/v2-events.json` (protected), `documents/specs/member-registrations-ui.md` (FR-42, AC-55-58) |
| Workers                | `single`                                                                                                           |
| Implementer            | worker ollama-cloud/deepseek-v4.1-flash:1017                                                                       |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                            |

## Seats

| Seat     | Picked (local) | Window | Class          | Candidate probed                                           | Basis                       |
| -------- | -------------- | ------ | -------------- | ---------------------------------------------------------- | --------------------------- |
| Worker   | `2026-11-24`   | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`                    | outside-window order        |
| Reviewer | `2026-11-24`   | out    | `reviewer-pro` | `ollama-cloud/deepseek-v4-pro:0813`                        | first choice outside window |
| Git seat | `2026-11-24`   | out    | `git-executor` | `opencode/beam-free` - 429; `ollama-cloud/mimo-v2.6-flash` | rung 1 unavailable          |

## Grill

1. **Does this round rebuild `02-event-detail` or defer it again?** It has **no HTML source** - it is a legacy capture -
   and its drawing predates the write round's verbs. **Recommendation:** rebuild it on the shared shell, because it is
   the only `target` state that needs design judgement rather than a re-cut, and every later parity claim hangs on it.
   **Cost:** real design work, and a protected catalogue review. Owner answered "all as recommended" (2026-11-24).
2. **Does the picker dialog get its own state?** The audience picker's inline create dialog exists in the build and in
   no drawing. **Recommendation:** draw it as a state of this set and give it an entry in the catalogue.
   **Cost:** one more state to sign, and the Admin page will reuse it, so the drawing must survive that page's shape.
   Owner answered "all as recommended".
3. **Does `10-event-create` need a redraw?** Its drawing already matches the shipped header (verified). **Recommendation:**
   no redraw; it is re-signed on the existing image. **Cost:** an owner signature restored over an image nobody changed.
   Owner answered "all as recommended".
4. **Does this round touch `ui/src/`?** **Recommendation:** no. It draws what ships; a production change here would drag
   R6 into a mock round. **Cost:** a defect the drawing reveals becomes a backlog row rather than a fix.

## Plan

Goal: the three unsigned states become drawable and signed, with no production change.

- Rebuild `02-event-detail` on the shared shell: the four summary tiles, the occurrence table with its row verbs, the
  recurrence panel, and the archived read-only state.
- Draw the audience picker and its inline create dialog as a state with a catalogue entry.
- Re-sign `10-event-create` on its existing image (`auto-signed`, basis recorded).
- Update `ui/e2e/baseline/README.md` where the drawing references change.

Out of scope: `ui/src/`, `src/**`, any migration, the downstream round (parked), and the retired series states (a
separate pruning pass).

Acceptance criteria:

1. `02-event-detail` is drawn from a live HTML source and matches the shipped detail on the tiles, the row verbs and the
   archived state.
2. The picker dialog has a drawing and a catalogue entry that resolves.
3. `10-event-create` is `auto-signed` with a basis that names the verified match and the void owner signature.
4. No `ui/src/` file changes; `git diff --name-only` shows only mock-claim, baseline and documentation paths.

## Verification

| Gate                  | Command               | Result     |
| --------------------- | --------------------- | ---------- |
| Fast gate (round doc) | `npm run verify:fast` | pass — 4/4 |

gate-run 2026-11-24T05:59:38.891Z profile=fast steps=4/4 lines=4 bytes=849

## Review

Seat: consistent - worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer `ollama-cloud/deepseek-v4-pro:0813`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                               |
| ----- | --------------------- | ------ | ------------------------------ | -------------------------------------------------------------------- |
| 1     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Cut `feat/events-mock-rebuild` at `main` with this doc               |
| 2     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | This round doc                                                       |
| 3     | `git-executor rung 2` | commit | `ollama-cloud/mimo-v2.6-flash` | The catalogue entries, the baseline README and the drawings' records |
| 4     | `git-executor rung 2` | push   | `ollama-cloud/mimo-v2.6-flash` | Branch only                                                          |
| 5     | `git-executor rung 2` | pr     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                                    |
| 6     | `git-executor rung 2` | merge  | `ollama-cloud/mimo-v2.6-flash` | The PR, after the checks                                             |
| 7     | `parent`              | sync   | -                              | Main is held by the `ussd-budget` worktree                           |

`git-seat-budget: 8` = `1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync`, one brief held. The drawings live in
`mockups/`, which is git-ignored, so the commits carry the catalogue, the README and this doc.

## Mock sign-off

| Surface         | Mock                                       | Capture                            | Signer       | Date       | Verdict                                                                            |
| --------------- | ------------------------------------------ | ---------------------------------- | ------------ | ---------- | ---------------------------------------------------------------------------------- |
| Event detail    | `mockups/v2-events/02-event-detail.png`    | `ui/e2e/baseline/event-detail.png` | `unattended` | 2026-11-24 | auto-signed - rebuilt on the shared shell; the owner signs at the milestone close  |
| New event form  | `mockups/v2-events/10-event-create.png`    | `ui/e2e/baseline/events-new.png`   | `unattended` | 2026-11-24 | auto-signed - re-signed on the verified image; the 2026-11-22 signature stays void |
| Audience dialog | `mockups/v2-events/12-audience-dialog.png` | `ui/e2e/baseline/events-new.png`   | `unattended` | 2026-11-24 | auto-signed - new state for the picker's inline create                             |

## Mock parity

No probe runs: the rebuild produces the drawings that make a probe possible. Parity is claimed for no state until the
owner's milestone look.

Mock coverage: claimed 12 · e2e-only 1 · deferred 1 · prose 0

## Acceptance

| #   | Criterion | Met | Evidence |
| --- | --------- | --- | -------- |

## Deviations

None yet.
