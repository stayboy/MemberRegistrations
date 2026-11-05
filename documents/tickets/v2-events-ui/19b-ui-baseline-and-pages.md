# 19b: UI release gate — baseline captures, mock comparison and Pages

**Tier:** 2

**What to build:** Commit a live-build screenshot baseline (distinct from the git-ignored `mockups/`),
compare it with the mock index in the round doc, triage every difference, and add the Pages deploy
workflow.

**Blocked by:** 19a (the harness, fixtures and CI job).

**Status:** ready-for-agent

- [ ] Every screen in the mock index has a live capture at the mock's viewport, produced by the harness and committed under a baseline folder (not `mockups/`).
- [ ] Each capture is compared with its mock in the round doc; every difference is recorded as intentional (with the decision) or a regression (with the fix or a ticket). No unexplained drift.
- [ ] A run regenerates the baseline deterministically (fixed clock, fixed fixtures, animations disabled).
- [ ] A Pages workflow deploys the built UI on `main`, and the repository setting it needs is named in the round doc as the owner's step.
- [ ] The build plus the smoke run in CI on every PR.
