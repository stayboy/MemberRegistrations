# Round - parity-close-out

|                     |                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                                             |
| Tier                | 1 - Plan                                                                                                                                                                         |
| Mode                | attended (owner seated; worker override `ollama-cloud/deepseek-v4.1-flash:1017`)                                                                                                 |
| Base                | `a2c5175`                                                                                                                                                                        |
| Review rounds       | 0                                                                                                                                                                                |
| Gate runs in parent | 1                                                                                                                                                                                |
| Spec                | `member-registrations-ui.md` FR-58, FR-59a, FR-69; DoD item 5                                                                                                                    |
| Workers             | `single` - one worker, docs only, parent integrated                                                                                                                              |
| Implementer         | worker ollama-cloud/deepseek-v4.1-flash:1017 (sections 6 and 8-12, backlog row); parent opencode/deepseek-v4.1-flash-free (read the image pairs, merged the sections, round doc) |

## Grill

1. **Do the pack's remaining differences get fixed or accepted?** Recommendation: accepted, with one line
   each - the roster's column order, status header and chip counts, and the officers page's avatars are
   presentation, not requirement. Cost: the pack closes with named differences rather than zero.
2. **Does the church report row open the sitting, or precede it?** Recommendation: precede it - a sitting
   that discovers a tenth of itself is not a sitting. Cost: one more image pair before the owner looks.
3. **The page's single verb is secondary in the build and a filled primary in the mock (8f). Fix now?**
   Recommendation: **no - route it to the hardening round**, because it is one `appearance` prop in
   `PageFrame.tsx` plus a re-capture of every surface with one verb, which is a surface-wide change and not
   a docs edit. Cost: the release ships a page verb that reads as optional until hardening lands.

Decisions 1 and 2 were the owner's answers at the 2026-11-15 grill. Decision 3 is new in this round and is
recorded as routed, not decided.

## Plan

Close the comparison pack: read the last image pairs, state a verdict per row, and record what is left.

### Scope

- `documents/parity/comparison-pack.md` - rows 6 and 8-12 read (import attendance panel, five shell
  states), sections 6, 7 and 8-12 rewritten to their verdicts, the imports row moved after the shepherding
  rows, two table hashes corrected to the re-cut artefacts, and the closing findings restated.
- `documents/backlog.md` - the officers mock is an image-only state with no live source.

Acceptance criteria:

1. Every row in the top table carries a verdict, and no row says `owed`.
2. Each section names what was seen, not what was assumed, and the differences are routed with a line.
3. The findings list matches the rows: five build defects, two spec gaps, one stale mock, one mock
   corrected backwards, one new difference (8f) routed to hardening.
4. `npm run verify` passes.

## Verification

| Gate        | Command                                                                     | Result                               |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------ |
| Round doc   | `node scripts/check-round.mjs --files documents/rounds/parity-close-out.md` | 1 round doc, ok                      |
| Stale audit | `node scripts/mock/sign-unattended.mjs --list <all seven sets>`             | 0 to sign, 54 unchanged, **0 stale** |
| Full gate   | `npm run verify`                                                            | 7/7 steps                            |

gate-run 2026-11-15T23:01:36.583Z profile=full steps=7/7 lines=7 bytes=854

## Acceptance

| #   | Criterion                   | Verdict  | Evidence                                                       |
| --- | --------------------------- | -------- | -------------------------------------------------------------- |
| 1   | No row is owed              | ACCEPTED | eight pairs read this pass; the imports row is outside parity  |
| 2   | Verdicts name what was seen | ACCEPTED | section 6's five regions and the five shell states             |
| 3   | Findings match the rows     | ACCEPTED | five defects, two spec gaps, one stale mock, one 8f difference |
| 4   | `npm run verify` passes     | ACCEPTED | gate-run signature                                             |

## Deviations

- The worker wrote sections 6 and 8-12 as new sections at the end of the file, where sections with the same
  numbers already existed. The parent merged them into the original positions rather than shipping a pack
  with two section 6s. The cause: the brief said "add sections" without saying that sections 6 and 8-12
  already had bodies, which is a brief fault, not a worker fault.
- Section 7 said the owner had to route the settings drift; the owner had already routed it and the mock was
  re-cut. Corrected, and the two table hashes that still named the pre-re-cut artefacts are updated.
- 8f is new and is **not** decided: the page's one verb is a secondary button in the build and a filled
  primary in the mock. It is routed to hardening with the fix named.
