# Round - mock-recuts-parity

|                     |                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                              |
| Tier                | 1 - Plan                                                                                          |
| Mode                | unattended (auto-accept recommendations)                                                          |
| Base                | `ef91569`                                                                                         |
| Review rounds       | 0                                                                                                 |
| Gate runs in parent | 1                                                                                                 |
| Spec                | `member-registrations-ui.md` 4.2 rule 5, FR-20..22; `member-registrations-headcount.md` HC-1/HC-3 |
| Workers             | `single`                                                                                          |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (three mock re-cuts, one spec amendment, round doc)  |

## Grill

1. **Should the settings mock follow the build or the build follow the mock?** Recommendation: the mock
   follows, because radios expose four formats at once and a three-row preview inside the card is enough.
   Cost: a signed mock is re-cut to justify a build the owner preferred, not one the artefact demanded.
2. **Does the rail's third control need a spec change or a code change?** Recommendation: a spec change -
   rule 5 described the appearance pair, and a support link is a different kind of control. Cost: the
   protected-adjacent spec moves, and the mock gains the icon.
3. **How is "not stale" proven?** Recommendation: the tool's own audit after every re-cut -
   `sign-unattended --list` across all seven sets, which must report `0 would auto-sign, 0 signed-but-stale`.
   Cost: a step per re-cut, and a state that moves without a re-sign is caught then.

## Plan

Three mocks had drifted from the build in ways the comparison pack found, and the owner ruled that a
re-cut must not leave a state stale. Each re-cut below ends with the audit.

### Scope

- `mockups/v2-shell/01-shell-expanded-light.html` - the rail footer gains the **support** control; the
  collapsed and mobile states were re-captured and re-signed.
- `documents/specs/member-registrations-ui.md` - 4.2 rule 5 names the support link, so the spec and the
  build agree about the rail.
- `mockups/v2-settings/01-date-time-settings.html` - the dropdowns become **radio groups** and the preview
  folds into the card, matching the build; the standalone preview card is gone.
- `documents/mock-claims/v2-shell.json`, `v2-settings.json` - the three re-cut hashes.

Acceptance criteria:

1. The rail's spec, mock and build agree that the footer carries a support control.
2. The settings mock draws radios and an inline preview, as the build does.
3. Every re-cut state is signed, and no catalogue state is stale.
4. `npm run verify` passes.

## Verification

| Gate        | Command                                                         | Result                               |
| ----------- | --------------------------------------------------------------- | ------------------------------------ |
| Shell guard | `node scripts/mock/shell-check.mjs`                             | 22/22 carry the shell                |
| Stale audit | `node scripts/mock/sign-unattended.mjs --list <all seven sets>` | 0 to sign, 54 unchanged, **0 stale** |
| Full gate   | `npm run verify`                                                | 7/7 steps                            |

gate-run 2026-11-15T21:47:07.715Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

Three states re-cut and **auto-signed**; listed for the reviewer's second look.

| Set / state                         | sha256                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `v2-shell/02-shell-collapsed-light` | `e7b28c8f3d063fc2d2eda8a92378c615303544c68ae5060ed8186dfb4a39a302` |
| `v2-shell/06-mobile`                | `8ab3098bb056183115d731cc466d7b0dcdafecf004939c8ae905848d3eda79fc` |
| `v2-settings/01-date-time-settings` | `f6b66b7f834175cb372c5f4f90105f99fc4560b994f432f3ca1187b687a971be` |

Mock coverage: claimed 3 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

| Row | Surface        | Finding                                                                      | Resolution                                          |
| --- | -------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| 7   | settings       | dropdowns vs radios; preview placement                                       | **mock re-cut to the build** (owner)                |
| 8a  | collapsed rail | a support control in neither artefact                                        | **spec + mock** gain it (owner)                     |
| 13  | roster         | the build has two columns the mock omits (`Latest feedback`, `Latest issue`) | **owed** - the mock is behind FR-59a, not the build |

## Acceptance

| #   | Criterion                                            | Verdict  | Evidence                                                |
| --- | ---------------------------------------------------- | -------- | ------------------------------------------------------- |
| 1   | Spec, mock and build agree on the rail               | ACCEPTED | rule 5 names the support link; the mock's rail draws it |
| 2   | The settings mock draws radios and an inline preview | ACCEPTED | the re-cut capture                                      |
| 3   | Every re-cut state is signed; nothing stale          | ACCEPTED | `0 to sign, 54 unchanged, 0 signed-but-stale`           |
| 4   | `npm run verify` passes                              | ACCEPTED | gate-run signature                                      |

## Deviations

- Tier 1: mock markup, captures, one spec paragraph and three catalogue hashes. No product code.
- The roster mock is **not** re-cut here. It omits `Latest feedback` and `Latest issue`, which FR-59a
  requires, so the mock is behind the spec rather than the build being ahead of the design - a different
  kind of re-cut, and the next one.
- The settings re-cut went in twice: the first pass added the radios but left the old full-width preview
  card behind, because the removal matched indentation it did not have. The capture showed it; the diff
  did not.
