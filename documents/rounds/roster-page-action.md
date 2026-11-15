# Round - roster-page-action

|                     |                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                            |
| Tier                | 2 - Reviewed                                                                                                                                                    |
| Mode                | unattended (owner: "go unattended for remaining bit", 2026-11-15)                                                                                               |
| Base                | `be51c85`                                                                                                                                                       |
| Review rounds       | 1 - Tier 2 code review ACCEPTED                                                                                                                                 |
| Gate runs in parent | 2                                                                                                                                                               |
| Spec                | `documents/specs/member-registrations-ui.md` FR-9a, FR-59, FR-63                                                                                                |
| Workers             | `single`                                                                                                                                                        |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (integration, gate, round doc); worker ollama-cloud/deepseek-v4.1-flash:1017 (page action, dialog mode, baselines) |

## Plan

Three closing items from the mock-parity thread.

- **The roster's page-level `Assign member`.** The signed roster mock draws it; the built page had only
  `Refresh`. FR-9a makes this a one-verb page, so the verb is a visible button with the refresh icon before
  it, and no `Actions` menu.
- **The e2e capture baselines.** FR-9a changed every page header, so all 22 were stale.
- **`offering-grid/12-narrow`'s attestation.** The state was `signed` without a `signed` block.

Acceptance criteria:

1. The roster renders `Assign member` as its one visible verb, the refresh icon before it, no menu, and the
   verb is disabled until the officer and roster read have settled.
2. The dialog is the existing `AssignShepherdDialog` in a fixed-officer mode - no second dialog - and it
   still refuses to submit without a member.
3. Row `Reassign` is unchanged.
4. `npm run ui:capture` regenerates all 22 baselines with no hand edit, and a repeat run is pixel-stable.
5. `12-narrow` carries `{ by, at, sha256 }` matching its unchanged hash.
6. `npm run verify`, `ui:test`, `ui:test:dom` and `ui:e2e` pass.

## Verification

| Gate            | Command                                         | Result                                           |
| --------------- | ----------------------------------------------- | ------------------------------------------------ |
| Full gate       | `npm run verify`                                | 7/7 - 58 files, 802 passed, 7 skipped            |
| UI unit         | `npm run ui:test`                               | 41 files, 449 passed                             |
| UI DOM          | `npm run ui:test:dom`                           | 9 files, 60 passed                               |
| e2e             | `npm run ui:e2e`                                | 69 passed, including the 22 regenerated captures |
| Catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts` | 76 passed                                        |

gate-run 2026-11-15T06:38:08.900Z profile=full steps=7/7 lines=7 bytes=854

## Review

Tier 2. The worker (ollama-cloud/deepseek-v4.1-flash:1017) built the page action, the dialog mode and the
baselines; the parent integrated, ran the gates and wrote this doc; the reviewer seat is independent.

**Code review - ACCEPTED**, no blocking findings. It confirmed the page action is a lone verb with the
utility before it and no menu, the verb disabled until the officer and read settle, the dialog reusing
`AssignShepherdDialog` through a `fixedOfficer` prop rather than a second dialog, the member picker
excluding the officer, the Reassign row unchanged, and the baseline regeneration containing no hand edit.

Seat: consistent - the Implementer row matches the split the reviewer read.

## Mock sign-off

| Surface               | Mock                                         | sha256                                                             | Signer | Date       | Verdict |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/shepherding/roster` | `mockups/v2-shell/08-shepherding-roster.png` | `2e9b09252c198aeef1173f6a0852816e102aaecc50dc63a56a3096951ae938df` | owner  | 2026-11-14 | signed  |

This round closes the last gap recorded in the roster round's deviations: the signed mock draws a visible
`Assign member` beside a bare refresh glyph, and the built page now does the same.

Mock coverage: claimed 0 · e2e-only 1 · deferred 0 · prose 0

## Mock parity

n/a - the surfaces were brought to the signed mock; no claim changed.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                                                                   | Met | Evidence                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Assign member` is the one visible verb, refresh before it, no menu, disabled until settled | yes | `renders Assign member as the one visible verb, after the refresh icon, with no Actions menu`; `keeps the page verb disabled until the roster read has settled` |
| 2   | The existing dialog in a fixed-officer mode; no second dialog; no submit without a member   | yes | `assigns the chosen member to the fixed officer in one POST`; `refuses to submit with no member chosen`                                                         |
| 3   | Row `Reassign` unchanged                                                                    | yes | `keeps Log call visible and wires Contacts, Reassign and End in one menu` still passes                                                                          |
| 4   | 22 baselines regenerated, no hand edit, repeat run pixel-stable                             | yes | `npm run ui:capture` 22/22; a repeat run differed by 0 pixels on the four files whose PNG bytes moved                                                           |
| 5   | `12-narrow` carries `{ by, at, sha256 }` matching its hash                                  | yes | the block is in `documents/mock-claims/offering-grid.json`, hash unchanged at `54330313...`                                                                     |
| 6   | `verify`, `ui:test`, `ui:test:dom`, `ui:e2e` pass                                           | yes | the table above                                                                                                                                                 |

## Deviations

- **Every capture baseline moved, not just the roster.** FR-9a changed the header on every page, so all
  22 images differ from row 80 down. The regeneration is deterministic: a repeat run decoded to zero
  differing pixels on the files whose bytes moved, so the byte churn between runs is encoder noise rather
  than layout drift.
- **The dialog gained a fixed-officer mode rather than a second dialog.** `AssignShepherdDialog` takes an
  optional `fixedOfficer`; the officer picker is omitted in that mode and the member picker excludes the
  officer (FR-65), and the POST body is unchanged.
- **One gate attempt crashed workers.** The first `npm run verify` died with API-suite worker crashes
  (51-55 of 58 files, exit 2147483651). The same suite passed at `--maxWorkers=4`, then passed again at
  default parallelism, so it is this machine's PGlite/WASM memory pressure, recorded rather than looped
  (section 8).
