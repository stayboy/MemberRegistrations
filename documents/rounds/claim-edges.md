# Round - claim-edges

|                     |                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                        |
| Tier                | 1 - Plan (test coverage, one dev-screen string, harness stubs; no product behaviour)        |
| Mode                | attended (owner seated; no worker)                                                          |
| Base                | `2e239b3`                                                                                   |
| Review rounds       | 0                                                                                           |
| Gate runs in parent | 1                                                                                           |
| Spec                | the go-forward grill (2026-11-16), answers to Q3 and Q4                                     |
| Workers             | `single`                                                                                    |
| Implementer         | parent opencode/deepseek-v4.1-flash-free (axe entry point, harness stubs, formatter, claim) |

## Grill

1. **How does `/connect` enter the accessibility claim?** Recommendation: its own spec, and the claim
   names the routes and states it audits. Cost: a second entry point that can rot out of step with the
   first, and a claim that reads weaker than "the sign-in gate is accessible".
2. **What happens to the simulator's printed origin?** Recommendation: render the path, fill the origin
   at copy time. Cost: one substitution at copy time, and a test that pins it.

The counter-argument on Q2 - that the origin is the page's own, so nothing secret leaks - is right, and the
change is made for the smaller reason: a rendered host is what lands in a screenshot.

## Plan

Two edges of the release claim, neither of which moves a picture.

### Scope

- `ui/e2e/axe.spec.ts` - a second entry point for the **sign-in gate**, auditing idle, link sent and
  expired-session states in light and dark.
- `ui/e2e/fixtures.ts` - the harness answers `/health` (already stubbed) and `POST /auth/magic-link` with a
  JSON 202. A 202 with an empty body is a parse error to `gatewayRequest`, which is why the gate's success
  state was unreachable.
- `ui/src/format/ussd-callback.ts` (+ test) - the signed callback command moves out of the simulator page:
  the rendered command carries `$GATEWAY`, the copied one carries the real base.
- `ui/src/pages/ussd/UssdSimulatorPage.tsx` - imports the pair; renders the placeholder form.
- `documents/rounds/mvp-local.md` - the accessibility claim names its route and state scope.

Acceptance criteria:

1. `/connect` is audited, and the three states it reaches are named.
2. The rendered callback command contains no scheme or host; the copied one is runnable.
3. The release claim lists what the accessibility suite covers and what it does not.
4. `npm run verify` passes.

## Verification

| Gate      | Command                                  | Result                                       |
| --------- | ---------------------------------------- | -------------------------------------------- |
| Axe       | `npx playwright test axe --grep connect` | 2 passed (light and dark, three states each) |
| Unit      | `npm --prefix ui run test`               | 443 passed (440 before; 3 for the formatter) |
| Typecheck | `npm --prefix ui run typecheck`          | clean                                        |
| Full gate | `npm run verify`                         | 7/7 steps                                    |

gate-run 2026-11-16T07:15:44.782Z profile=full steps=7/7 lines=7 bytes=1025

## Mock sign-off

The surface this round changed - the USSD simulator - **has no signed mock**, and no mock depicts it. R6
asks for a row because `ui/src` changed; the row below names the shell capture the page sits in, which this
round did not change. The exclusion is stated here rather than implied by an empty table.

| Surface                             | Mock                                           | Capture                                       | sha256      | Signer     | Date       | Verdict                                                  |
| ----------------------------------- | ---------------------------------------------- | --------------------------------------------- | ----------- | ---------- | ---------- | -------------------------------------------------------- |
| USSD simulator (no mock of its own) | `mockups/v2-shell/01-shell-expanded-light.png` | `ui/e2e/baseline/shell-light.png` (unchanged) | `4bfb1888…` | unattended | 2026-11-16 | auto-signed (unchanged); the simulator is outside parity |

Mock coverage: claimed 1 · e2e-only 0 · deferred 0 · prose 0

## Mock parity

n/a — no mock change. The simulator joins the surfaces the parity claim cannot cover, which
`documents/parity/comparison-pack.md` already names.

## Acceptance

| #   | Criterion                            | Verdict  | Evidence                                                       |
| --- | ------------------------------------ | -------- | -------------------------------------------------------------- |
| 1   | `/connect` audited, its states named | ACCEPTED | the new describe; idle, sent and expired in both schemes       |
| 2   | Rendered command carries no host     | ACCEPTED | `ussd-callback.test.ts` asserts no scheme, no host, `$GATEWAY` |
| 3   | The claim names the scope            | ACCEPTED | the mvp-local paragraph lists routes audited and not audited   |
| 4   | `npm run verify` passes              | ACCEPTED | gate-run signature                                             |

## Deviations

- The gate's success state was unreachable for a real reason, not a test detail: the harness answered
  `POST /auth/magic-link` with an empty 202, and `gatewayRequest` reads JSON for any non-204, so the page
  rendered "the gateway did not answer" on a request that had just succeeded. The stub now carries a body,
  and the comment says why.
- Two `/health` stubs existed for a moment - one was already there - and the duplicate is harmless but the
  episode is worth knowing: the connection badge already answers it.
- `/connect` produced **zero** axe violations in all three states, so nothing was silenced or excluded to
  make it fit.
