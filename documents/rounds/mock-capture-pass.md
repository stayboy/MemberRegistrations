# Round - mock capture pass

|                     |                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                |
| Tier                | 1 - Plan                                                                                                                            |
| Mode                | attended                                                                                                                            |
| Base                | `6965c9d`                                                                                                                           |
| Review rounds       | 0                                                                                                                                   |
| Gate runs in parent | 2                                                                                                                                   |
| Spec                | `AGENTS.md` section 14; `.opencode/skills/mock-build/SKILL.md`                                                                      |
| Workers             | `single`                                                                                                                            |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (briefs, table); worker ollama-cloud/deepseek-v4.1-flash:1017 (mock content, captures) |

## Plan

The pictures were three changes behind the product: FR-9a's action rows, the headcount lanes, and
`mock.css`'s uppercase table header. This pass brings every set with a source up to date and hands the
owner one signing table instead of three.

Scope:

- `mock.css` `th` becomes the design's sentence-case 12px/500 ink-2. The roster's own override stays.
- The headcount states show a **lane table** (mode, count, own `asOf`, recorder) instead of a single
  current; `05-history` shows all four lanes; `12-mixed-service` puts the retired `mixed` observation in
  **history**, which is where the build puts it.
- Four mock states that contradicted their specs are corrected: `03-record-mixed` becomes
  `03-record-presbyters` (HC-9 retires the mode), three dialogs stop offering `Mixed service`, six sets
  lose the pre-FR-9a text `Refresh`, and `mvp-offerings/03-page-actions` is rebuilt as a genuine
  two-verb `Actions` menu - the state whose subject is the menu could not keep a one-item one.
- Every set with a source is re-captured through its recorder.

Acceptance criteria:

1. `shell-check` still reports 19/19.
2. No mock offers or selects the retired `mixed` mode; the retired observation is readable and read-only.
3. No mock draws a one-item `Actions` menu, and `Refresh` is a bare trailing icon wherever it appears.
4. Every catalogued state's file is listed with its new hash, and no catalogue is edited.
5. `npm run verify` passes (no code changed; the round doc is the only tracked file).

## Verification

| Gate        | Command                             | Result                            |
| ----------- | ----------------------------------- | --------------------------------- |
| Shell guard | `node scripts/mock/shell-check.mjs` | 19/19                             |
| Full gate   | `npm run verify`                    | see the signature below           |
| Recorders   | nine scripts                        | every state recorded or unchanged |

gate-run 2026-11-15T05:14:08.855Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

The fourteen signed states were **re-signed by the owner on 2026-11-15**. The table below is the recorded
hash for each; the six `mvp-offerings` **reference** states also moved and had their hashes corrected as a
record fix, since they carry no signature. A hash audit over every catalogue state now reports **0 stale**.

| Surface           | Mock                                     | sha256                                                             | Signer | Date       | Verdict |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/ussd/headcount` | `mockups/headcount/10-capture-state.png` | `6f507845362cf25da3fa3a879c39c4f2e778c0f3f86244b14b4a2413a0687a5d` | owner  | 2026-11-14 | signed  |

Mock coverage: claimed 0 · e2e-only 2 · deferred 0 · prose 1

| Set / state                            | New sha256                                                         |
| -------------------------------------- | ------------------------------------------------------------------ |
| `headcount/live`                       | `6f507845362cf25da3fa3a879c39c4f2e778c0f3f86244b14b4a2413a0687a5d` |
| `headcount/ended`                      | `7e4bda32a6c3335e6894add7a846d7162c787b57560714fa3bafd7faa44fb8dd` |
| `headcount/not-live`                   | `b3adef7f109ec41a3e5f4d3397ffb23f2ec9bfab4a37e743d6e8d76e4548ca51` |
| `mvp-offerings/page-actions`           | `01c1301ac9e640ab71ec6eee6ebffdcc563951862fb78cdcef7413286491236b` |
| `offering-grid/02-grid-blank`          | `dce2bfe1800c623253efb97e4792b666d55b4dd7313118157bbe1b1d3736a81d` |
| `offering-grid/03-grid-filled`         | `e9b520d19c494a063f3e180dd17cfc48b18a029c42fa97547b7aff5de6ed1fc3` |
| `offering-grid/04-grid-invalid`        | `bee2cab57dd043a493ae3220d7d60741ffe5619dd3a92d4001f4b526b2c0a16a` |
| `offering-grid/05-grid-pending`        | `b727e6b2ed8c4309208f3e3d983ad1454b567506bc3560c63ea8474725826fdf` |
| `offering-grid/06-grid-error`          | `813c82d3db832d1512a4e568e439dd57b547f28f2fe490e3efe2c980b0593646` |
| `offering-grid/07-correction-oneoff`   | `e0976b9b5fdc3a76aacde4126544a535f53c3b3f4c897a28d4301ad6c1cda9aa` |
| `offering-grid/08-custom-merge`        | `c3a6cd8591bb5ab8d72b2a8997338374082ca19bb740b88f03ab3513e0979f58` |
| `offering-grid/09-unconfigured`        | `6ec4a2dbb8c77f4382eea1d6a6d62e109c54c743c34c1628dcd118575d5229d8` |
| `offering-grid/10-all-hidden`          | `eefbb5628004e9d060f46b681766449f1e6da50a270f7de718b39078a6be3832` |
| `offering-grid/11-history-hidden-line` | `a0f5e144ec132c04710ee749749a02bcf12f77e5d169c4f72c556f0959084813` |

Unchanged and still matching: `v2-shell/roster` (`2e9b0925...`) and `offering-grid/12-narrow`
(`54330313...`). Six `mvp-offerings` **reference** states also moved; they carry no signature.

## Mock parity

n/a - no spec claim changed; the mocks were brought to the specs, not the other way round.

## Acceptance

| #   | Criterion                                                        | Met | Evidence                                   |
| --- | ---------------------------------------------------------------- | --- | ------------------------------------------ |
| 1   | `shell-check` 19/19                                              | yes | guard output                               |
| 2   | No mock offers `mixed`; the retired observation is read-only     | yes | `03-record-presbyters`, `12-mixed-service` |
| 3   | No one-item menu; `Refresh` is a trailing icon                   | yes | six sets; `03-page-actions` two verbs      |
| 4   | Every catalogued state listed with its hash; no catalogue edited | yes | the table above                            |
| 5   | `npm run verify` passes                                          | yes | gate-run line                              |

## Correction: the bucket breakdown

The owner asked whether the current-lanes grid should show the breakdown, and it should - the v2 design had a
bucket table and the lane rework replaced it with totals, so a figure could not be checked against what the
operator counted. **HC-28** now requires it: a page listing the lanes shows each lane's buckets, labelled from
the mode's reference data, and an all-zero lane shows `0` with none.

- `ui/src/pages/ussd/HeadcountReadFirst.tsx` gains a **Buckets** column between Mode and Count, rendered from
  `row.lines`; an all-zero lane renders a muted em dash.
- The render suite's multi-lane case slices the lane table out of the markup (so the history table's own
  bucket text cannot satisfy it), asserts the header order and the per-lane text, and a new case pins the
  all-zero lane as a row with `0` and `—`.
- The headcount mock gained the same column in the seven lane-bearing states; `headcount.css`'s nowrap
  indices were re-cut, because the new cell inherited `nowrap` from the five-column layout and clipped the
  Recorded column.

## Correction: the utility order, and an invented verb

The owner caught two things in the rebuilt page-actions state.

**The utility renders before the action, not after.** FR-9a had said "at the trailing edge ... beside the
menu", which put the refresh icon to the right of the page's own action. The rule now says the utility
renders **immediately before** the verb or menu, because the action holds the trailing edge and a utility
never sits to its right (owner, 2026-11-15). FR-9a, D12 and AC-50 all carry the order, `PageFrame` renders
utilities first, and the DOM tests assert the order rather than only the presence - which is why the wrong
order had passed them.

**`Import attendance` does not belong on the Members page.** `MembersPage` has exactly `add-member` and
`refresh`; `import-attendance` exists only on the event and series detail pages. The state had invented it to
give the menu two verbs. It is now the **series detail**, where `Import attendance`, `Edit` and
`Archive`/`Restore` are real, with `Back to series` as navigation. The sweep also found the phrase used as
a chip on the imports page's file panel, where the build has no such control; it now names the accepted file
kinds.

## Deviations

- **No catalogue was edited.** A refreshed image must not inherit a signature, so the fourteen signed
  states above are a request, not a record. Until they are signed the catalogues describe the bytes that
  were signed and the files differ.
- **The last five mock states now match FR-9a.** `v2-events/08-event-detail-series` and
  `09-event-detail-cancelled` put the refresh icon before their one verb; `08-series-detail-entry` became a
  real series detail with one `Actions` menu (Import attendance, Edit, separator, Archive) and `Back to
series` as navigation; the refresh icon moved before the verb in `headcount/01-headcount.html` and
  `offering-grid/01-offering-grid.html`.

- **The owner's 2026-11-15 signature was taken too early.** The utility-order correction re-cut eleven
  `offering-grid` states after the signature was recorded, so those hashes are stale again. That is a
  sequencing fault, not a mock fault: a signature should follow the last visual change, never a
  checkpoint in the middle of one. The catalogue keeps the signed hashes and the table below is the
  refreshed request.
- **`03-record-mixed` was renamed** to `03-record-presbyters`, with its archive and `history.json` state
  key following. The old mixed picture survives as `12-mixed-service`, in history where the build puts it.
- **The roster came back byte-identical** after the `th` change, which proves its own override still wins
  over the stylesheet.
- **`mvp-offerings/01-offerings-landing` loading and error moved** because an earlier cut had folded them;
  the counts page did not move, since it carries no refresh control.
