# Auto-signed mocks — the second-look sheet

**2026-11-15.** Every state signed in unattended mode, grouped by set, with the hash the catalogue holds.
AGENTS.md section 17: a state here is temporary, and this list is what the reviewer reads when the
unattended work ends. A state the reviewer rejects drops to `target` and is re-cut.

The one-line note beside each set says what moved it out of `target`; the round doc named in the
per-set line carries the full reason.

**32 states** across 4 sets.

What moved each set, in one line:

| Set           | Why it is here                                                                                                                          | Round                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `v2-shell`    | the shell states were rebuilt from the spec on one shared source; the roster gained FR-59a's columns and a pinned actions edge          | `mock-shell-recut`, `roster-eleven-columns`                                    |
| `v2-events`   | the activity detail was cut from the spec (both kinds, the cancelled row, the two dialogs); the events list became one row per activity | `activity-detail-mock`, `activity-dialogs-and-settings`, `phase-c-events-list` |
| `v2-imports`  | the four attendance-capture states were adopted as records and remain the design for the capture states                                 | `mock-catalogues-v2`                                                           |
| `v2-settings` | the settings screen was rebuilt on the shell, then re-cut to the radios and inline preview the build has                                | `activity-dialogs-and-settings`, `mock-recuts-parity`                          |

### v2-events (9)

| State                                    | sha256              |
| ---------------------------------------- | ------------------- |
| `v2-events/03-activity-detail-series`    | `cccb700124cbe07c…` |
| `v2-events/04-activity-detail-event`     | `bcb0c03c6e28bf42…` |
| `v2-events/05-activity-detail-cancelled` | `a7621b8390b22271…` |
| `v2-events/01-events-list`               | `16a6249fb9c59aa8…` |
| `v2-events/02-event-detail`              | `1d2cd1cbb86d437d…` |
| `v2-events/05-offerings-landing`         | `abe8001e2fd7b54c…` |
| `v2-events/07-offering-terms`            | `9e0880d127eb1e2f…` |
| `v2-events/06-record-headcount-dialog`   | `c65614ecf3bba348…` |
| `v2-events/07-import-attendance-panel`   | `24bd2629929219a1…` |

### v2-imports (5)

| State                               | sha256              |
| ----------------------------------- | ------------------- |
| `v2-imports/attendance-live`        | `4abf39a93eaac85f…` |
| `v2-imports/attendance-ended`       | `287aac46b226dd47…` |
| `v2-imports/attendance-past-open`   | `3072ed27e89886a9…` |
| `v2-imports/attendance-not-started` | `64b2e8e9afbf0f15…` |
| `v2-imports/01-members-import`      | `6eaf15676fa6a12e…` |

### v2-settings (3)

| State                              | sha256              |
| ---------------------------------- | ------------------- |
| `v2-settings/date-time-settings`   | `f6b66b7f834175cb…` |
| `v2-settings/02-date-time-sidebar` | `e2d7cb056baaf8ca…` |
| `v2-settings/02b-display-menu`     | `071da92a6e430a93…` |

### v2-shell (15)

| State                               | sha256              |
| ----------------------------------- | ------------------- |
| `v2-shell/roster`                   | `098a2999ccf4e380…` |
| `v2-shell/01-shell-expanded-light`  | `4bfb188864b316e6…` |
| `v2-shell/02-shell-collapsed-light` | `e7b28c8f3d063fc2…` |
| `v2-shell/03-shell-expanded-dark`   | `cf5c356b463cd86d…` |
| `v2-shell/05-meadow-accent`         | `3ca688ee3a6698c0…` |
| `v2-shell/06-mobile`                | `8ab3098bb0561831…` |
| `v2-shell/07-shepherding-officers`  | `f231f0f6e680dba5…` |
| `v2-shell/09-shepherding-report`    | `16f543b0f958eb23…` |
| `v2-shell/10-members-refined`       | `0df0992cdbd8073d…` |
| `v2-shell/11-add-member`            | `f5bfc451462f0e0d…` |
| `v2-shell/12-subscriptions`         | `8438b69d25f87e70…` |
| `v2-shell/13-add-subscription`      | `85b58e377e69b40f…` |
| `v2-shell/14-add-coverage`          | `f1e0dca08ccb0782…` |
| `v2-shell/16-contacts`              | `c398bbf37d6092cb…` |
| `v2-shell/17-find-contact`          | `01a101922ccf495c…` |
