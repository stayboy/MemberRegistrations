# Review brief

How a review is asked for, in every tier. The reviewer is chosen per
`documents/agents/orchestrator-policy.md`; this file bounds the exchange.

## One complete delta

Give the reviewer one delta: the changed hunks plus the relevant spec sections, never the whole
repository. A reviewer reconstructing context spends the round on discovery and returns findings about
code that did not change.

## One fix pass, one confirmation

Batch every finding into a single fix pass, then run at most one confirmation round. A second
confirmation re-sends the same files and transcript and mostly relitigates the first; if the fix is
not confirmed, park the round instead of looping.

## The report shape

Report findings as `P1`, `P2` and `Nits`, each with `path:line` evidence, and end with one explicit
`Verdict:` line (`ACCEPT`, `REWORK` or `PARKED`). A finding without a location is a question, not a
verdict.

Two lines come with it:

- `Seat: consistent | contradicted` — the round doc's `Implementer` row against the diff, and whether
  this reviewer is a different model from both recorded authors. A contradicted seat is `REWORK`, not
  a nit.
- **Assert the test assertions.** A tests-only worker must not weaken one to match the implementation;
  an assertion changed without a spec reason is a finding.

## Read-only

Reviewers are read-only: never edit, commit, push, merge or run a mutating gate. They return blocks;
the parent persists them.

## Counters

Record `Review rounds` in the round doc — one review plus at most one confirmation, so `1` or `2`,
never higher — and `Gate runs in parent` for the verification runs the parent paid for.
