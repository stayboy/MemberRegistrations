# Round - claim-register

|                     |                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                              |
| Tier                | 1 - Plan (register, meta guard, catalogue notes, one spec bullet)                                                                                                 |
| Mode                | attended (owner seated)                                                                                                                                           |
| Base                | `9407ff4`                                                                                                                                                         |
| Review rounds       | 0                                                                                                                                                                 |
| Gate runs in parent | 1                                                                                                                                                                 |
| Spec                | `member-registrations-ui.md` OS-21; the 2026-11-16 grill answers (Q3, Q4, Q5)                                                                                     |
| Workers             | `single`                                                                                                                                                          |
| Implementer         | worker ollama-cloud/deepseek-v4.1-flash:1017 (register, guard, catalogue notes, spec bullet); parent opencode/deepseek-v4.1-flash-free (review, gates, round doc) |

## Grill

The 2026-11-16 grill was answered "all as recommended". These are its accepted answers, as they apply here:

1. **Where do the un-claimables live?** One tracked register, machine-checked - a row per item naming what
   is unproven, why it is accepted and what closes it. Cost: a register is a place debt can rest, and a row
   with no owner ages into wallpaper.
2. **Does cutting 8f erode "a mock is a contract"?** No, if the reason is written into the catalogue entry
   rather than left in a round doc: the contract moves with the build. Cost: the design intent that a page
   has one filled primary verb dies quietly, so it has to be written down.
3. **What does the tag certify?** The local Compose stack, with its non-claims in the release note - now
   also stated where scope belongs, in the spec. Cost: a small tag with a long qualifier reads as hedging.

## Plan

Three answers, one round, because each is a sentence that has to exist before the tag.

### Scope

- `documents/parity/unclaimables.md` - seven rows: five surfaces with no signed mock, the USSD simulator,
  and the nine legacy captures, plus a short section for the flaky deep-link assertion, which is a gate
  risk rather than a surface.
- `tests/meta/parity-claim.test.ts` - a second block that fails when the register is missing, a row loses a
  field, a row count falls below the recorded set, or an expected surface disappears.
- `documents/mock-claims/v2-shell.json` - a `note` on the six states whose drawing paints a filled primary
  verb: the build is the decision, and the drawing is behind it.
- `documents/specs/member-registrations-ui.md` - **OS-21**: production is out of scope until 0.3, the MVP
  release certifies the Compose stack, and the two wire items come first. Change log records it.

Acceptance criteria:

1. Every un-claimable names what is unproven, why it is accepted, and what closes it.
2. The guard fails when a row loses a field or an expected surface disappears.
3. The six catalogue entries say why the build, not the drawing, is the decision.
4. The scope sentence lives in the spec, and `npm run verify` passes.

## Verification

| Gate      | Command                                          | Result    |
| --------- | ------------------------------------------------ | --------- |
| Meta      | `npx vitest run tests/meta/parity-claim.test.ts` | 8 passed  |
| Full gate | `npm run verify`                                 | 7/7 steps |

gate-run 2026-11-16T09:52:22.142Z profile=full steps=7/7 lines=7 bytes=1025

## Mock sign-off

n/a - no mock image changed. Six catalogue entries gained a `note` recording the owner's drift cut; their
hashes, coverage and signatures are untouched.

## Mock parity

n/a - no mock change. The 8f difference is now recorded where the catalogue is read, not only in the pack.

## Acceptance

| #   | Criterion                                  | Verdict  | Evidence                                                        |
| --- | ------------------------------------------ | -------- | --------------------------------------------------------------- |
| 1   | Every un-claimable names all three fields  | ACCEPTED | seven rows plus the flake section; the guard asserts four cells |
| 2   | The guard fails on a lost field or surface | ACCEPTED | three assertions over the register, message per failure         |
| 3   | Six catalogue notes carry the reason       | ACCEPTED | `note` on both shell sets and the members state                 |
| 4   | Scope in the spec, gate green              | ACCEPTED | OS-21 plus change log; gate-run signature                       |

## Deviations

- The brief asked for `OS-6`; the worker found the scope list already runs to OS-20 and numbered the bullet
  **OS-21** instead of duplicating an existing id. That is the right call and it is why the worker's
  deviation note matters more than its compliance.
- The owner's new seat instruction - grill through `ollama-cloud/deepseek-v4.1-flash:1017`, and a worker on
  **every** tier rather than Tier 2 and up - is followed in this round but is **not yet in the policy**:
  `documents/agents/orchestrator-policy.md` is protected, so the rule needs its own reviewed round. Until
  that lands it is recorded here and in the reply, which is exactly the failure section 1 warns about; the
  next round fixes it.
