# Parallel UI and API build — the contract-first workflow

|            |                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | approved 2026-11-22 ("all as recommended"); **binding since 2026-11-23** — `AGENTS.md` §3a names it, reviewed by `0813` in `documents/rounds/workflow-binding.md` |
| Supersedes | nothing; it qualifies the "pipeline, do not overlap" ruling of the same day                                                                                       |
| Relates to | `AGENTS.md` §3a, `documents/agents/orchestrator-policy.md`, the event-parent round                                                                                |

## Problem Statement

The four-round sequence builds the API first and the UI second, so the UI waits for the implementation even when the
shape of every endpoint is already agreed. The waiting is not free: a migration round runs for hours, the UI's screens
and data client sit idle, and when the API lands the UI work starts from a cold contract that may have drifted from the
spec in small ways nobody wrote down.

The owner wants the UI to start as soon as the API is written **as a contract** — the endpoints and their successful
responses — and wants the API's delivery to be judged by its conformance to that contract once the implementation is
complete, not by a single green request.

## Solution

Split "the API is written" from "the API is implemented". The contract is authored from the approved spec before the
backend work starts: every endpoint, request and **successful response** (status and body shape, with one realistic
example). The UI builds against that contract through generated mocks; the backend builds to the same contract. When
the backend completes, the work moves to a **conformance pass** — the implemented API is diffed against the contract,
the examples are exercised against the real server, and the UI's mock for each endpoint is replaced only when its
endpoint conforms.

Parallel development, serialised integration: the UI may be built in parallel, but a screen merges only when the
endpoint it calls is implemented on `main` and conformant. `main` never serves a screen that calls an endpoint that
does not exist.

## User Stories

1. As a UI engineer, I want the endpoint list and its successful response bodies before the backend is built, so that I
   can build screens without waiting for the server.
2. As a UI engineer, I want the mocks generated from the contract rather than hand-written from prose, so that my
   fixtures cannot invent a shape the API will not serve.
3. As a UI engineer, I want a contract change to arrive as a spec amendment, so that I do not have to reverse-engineer a
   backend decision from a failing request.
4. As a backend engineer, I want the contract frozen before I start, so that my work has a definition of done beyond
   "it returns 200 in one test".
5. As a backend engineer, I want the conformance pass to be mechanical — a diff and a set of example requests — so that
   a shape mismatch is found before the UI integrates.
6. As a reviewer, I want the contract diff in the PR, so that I can see whether the implementation changed a shape.
7. As the owner, I want the UI and the API to progress at the same time without `main` ever shipping a screen that
   calls a missing endpoint.
8. As the owner, I want a single place that says what an endpoint returns, so that the spec's prose, the OpenAPI
   document and the implementation cannot quietly disagree.
9. As an operator, I want the screens that ship to be tested against the real API, so that a mock-only pass is never
   mistaken for a working feature.
10. As a maintainer, I want the contract generated from the same schemas the server validates with, so that the
    document cannot drift from the code.
11. As a maintainer, I want the mocks and the fixtures to be generated artefacts, so that adding a field is one edit.
12. As a maintainer, I want the error contract to stay in the spec's problem+json table, so that the success examples
    stay small and the error paths stay tested at the API seam.
13. As a tester, I want a contract-schema test, an example test and a live-vs-mock e2e test, so that conformance is
    checked at three different seams.
14. As a tester, I want the conformance pass to name every endpoint whose mock is still in play, so that no screen
    silently ships on a stale fixture.
15. As the owner, I want the pipeline order (read API → read screens → write API → write screens → capture → import
    panel) preserved inside a parallel build, so that the UI still starts on the most stable contract surface.
16. As a reviewer, I want an endpoint to count as delivered only when its contract entry, its implementation and its
    live e2e case agree, so that "done" is one definition.

## Implementation Decisions

- **The contract is the approved spec, rendered.** For a round, the contract document lists every endpoint the round
  needs, its request, and its **successful** response: status (`200`, `201`, `204`, …) and body shape, plus one
  realistic example per response. Error shapes stay in the spec's problem+json table; the contract is not an
  error-catalogue replacement.
- **The contract is generated from the server's own schemas.** The OpenAPI document is produced from the Zod schemas
  the handlers validate with, so the document and the implementation share one source. A hand-written contract would
  be a second source of truth and is rejected.
- **The frozen artefact is a committed OpenAPI snapshot per round.** The document generated from the server schemas is
  diffed against that snapshot, and the UI's mocks are generated from it. The snapshot is the freeze; the runtime
  document is the candidate.
- **The round opens with a contract-only PR.** Schemas, examples and the snapshot, no handler change, merged before
  either track branches. Without it the contract is not frozen and the tracks are not parallel-eligible.
- **The UI mock is generated from the contract.** The UI's handlers and fixtures are produced from the contract's
  examples (one handler per endpoint), not written from prose. Hand-written mock bodies are rejected because they
  invent shapes.
- **Conformance covers the whole document.** Any drift fails; the round's endpoints are the merge gate, and unrelated
  drift is fixed in the same PR or explicitly baselined with a reason.
- **The live harness is conformance-only.** A seeded server runs the UI's live project only for the conformance job,
  never for every PR, and the endpoint's mock is removed for that run.
- **A UI PR runs conformance for the endpoints in its diff.** After the API PR merges, the UI PR's job starts the
  seeded server and runs the live cases for the endpoints it touches; that result, not a mock-only pass, is the merge
  gate.
- **Errors stay outside the contract.** The contract documents successful responses only; the spec's problem+json
  table keeps the error shapes, and the client's error rendering is tested with hand-written error mocks.
- **The contract is frozen per round.** A shape change is a spec amendment reviewed before either side builds against
  it. Working around a mismatch in the client is rejected.
- **Parallel eligibility.** UI and API tracks are eligible in parallel when they are file-disjoint and the round's
  contract is frozen. This qualifies `AGENTS.md` §3a's "no shared wire contracts": a **frozen** contract is the seam,
  and it counts as settled; an unfrozen one does not. Without a frozen contract, the tracks run serially.
- **Two clocks, one merge gate.** Development runs in parallel; merging is serialised by conformance. A screen merges
  only when every endpoint it calls is implemented on `main` and passes conformance. Before that, the screen lives on
  its branch with the contract mock as its test harness.
- **Conformance is the delivery gate.** An endpoint is delivered when (a) the generated OpenAPI matches the frozen
  contract, (b) the contract's examples pass against the real server, and (c) the UI's live-vs-mock e2e case for that
  endpoint passes with the mock removed. A single 200 in a unit test is not delivery.
- **The focus moves after implementation.** When the backend dispatch completes, the next dispatch is the conformance
  pass, not the next feature. It reports the endpoints conformant, the drift found, and the mocks still in play.
- **The pipeline order survives.** Inside a parallel build the read surface is contracted and implemented first, the
  read screens follow, then the write surface, its screens, then capture and the import panel. Parallelism shortens
  the waits; it does not reorder the risk.
- **The aliases and the capture amendment are contract entries.** The legacy aliases are named in the contract with
  their success shapes and their retirement round, so a screen does not discover them by accident.

## Testing Decisions

Good tests assert external behaviour — a response status and body, a persisted row, a screen's rendered state — never
a handler's internals. The parallel build keeps the existing seams and adds one:

- **Contract-schema test** (API): the generated OpenAPI equals the frozen contract document, and every contract
  example validates against the schema it names. This is the seam that makes drift fail a gate.
- **Example test** (API): each contract example is sent to the running server and its status and body are asserted;
  error paths keep their existing problem+json tests.
- **Client test** (UI): the data client is tested with the generated mocks, asserting the URL and the parsed shape —
  the existing fetch-mock pattern, unchanged.
- **Live-vs-mock e2e** (UI): the Playwright case runs once against the contract mock (while the endpoint is being
  built) and again against the live API (at conformance), with the mock removed for that endpoint. The second run is
  the merge gate.
- **Drift check** (repo): the spec's DTOs, the contract document and the server schema are compared; a change in any
  one fails until the others are updated. This extends the existing ORM-vs-migrations drift check's idea to the wire.

## Out of Scope

- Generating the UI's TypeScript client from OpenAPI. The client stays hand-written; only the mocks and fixtures are
  generated.
- A public API stability promise or versioning scheme.
- Mocking the error catalogue; errors stay in the spec and are tested at the API seam.
- The session-offerings round, which contracts after the event-parent sequence.
- Replacing the four-round staging; this workflow sits inside it.

## Further Notes

- The same-day "pipeline it" ruling (read API → read screens → write API → write screens → capture → import panel)
  remains the order. This workflow lets the UI start on a branch **earlier**, against the read contract, while
  keeping the merge gate on the live read API.
- The first application is round 2b: contract the read surface, start round 3's read screens against it, then contract
  and implement the writes and the capture amendment, with a conformance pass closing each.
- `AGENTS.md` §3a and `documents/agents/orchestrator-policy.md` are protected; the sentence that admits a frozen
  contract as a parallel seam landed with its `0813` review on 2026-11-23 (this round), not silently.
- The issue tracker is not used in this repository (`AGENTS.md` §13), so this spec is published in the repository, not
  as an issue.
