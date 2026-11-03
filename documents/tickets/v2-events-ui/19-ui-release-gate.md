# 19: UI release gate and live-vs-mock probe

**Tier:** 2

**What to build:** Harden the UI for release and compare the live build with the approved mock. For
every mapped screen, capture the live build at the mock's viewport and compare it side by side with the
committed screenshot. Where the runnable prototype still exists, probe the same route, viewport and
seed data. Triage every difference as intentional or a regression; fix or ticket it. No unexplained
drift ships.

**Blocked by:** 13 (Members list UI), 14 (Member edit, subscriptions and coverage), 15 (Imports UI), 16 (Shepherding UI), 17 (Events UI), 18 (Series UI).

**Status:** ready-for-agent

- [ ] Responsive at 360, 768 and 1440 px; the mobile navigation is usable.
- [ ] Dark/light and each accent theme pass an axe contrast check on the shell, members and events screens.
- [ ] Playwright smoke covers shell navigation, members list plus contacts, add member, event detail and series detail.
- [ ] Every screen in the mock index has a live capture at the mock's viewport, compared in the round doc against `documents/mockups/`.
- [ ] Each difference is recorded as intentional (with the decision) or regression (with the fix or ticket); there is no unexplained drift.
- [ ] A screenshot baseline is committed, and the build plus smoke run in CI.
