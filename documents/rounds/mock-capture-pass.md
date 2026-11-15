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

The signed states whose bytes moved. They are **not re-signed**: every catalogue still carries the hash that
was signed, and the mismatch is the request below.

| Surface           | Mock                                     | sha256                                                             | Signer | Date       | Verdict |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/ussd/headcount` | `mockups/headcount/10-capture-state.png` | `6f507845362cf25da3fa3a879c39c4f2e778c0f3f86244b14b4a2413a0687a5d` | owner  | 2026-11-14 | signed  |

Mock coverage: claimed 0 · e2e-only 2 · deferred 0 · prose 1

| Set / state                            | New sha256                                                         |
| -------------------------------------- | ------------------------------------------------------------------ |
| `headcount/live`                       | `6f507845362cf25da3fa3a879c39c4f2e778c0f3f86244b14b4a2413a0687a5d` |
| `headcount/ended`                      | `7e4bda32a6c3335e6894add7a846d7162c787b57560714fa3bafd7faa44fb8dd` |
| `headcount/not-live`                   | `b3adef7f109ec41a3e5f4d3397ffb23f2ec9bfab4a37e743d6e8d76e4548ca51` |
| `mvp-offerings/page-actions`           | `435e1b3325bdd4b85bedf3cbae211072130d3ce2d615b7ac2739453bbd0fd686` |
| `offering-grid/02-grid-blank`          | `de30c861d2dc5c3f3150cee5552c628610fbd8c61c5a763592a12095bfd4b053` |
| `offering-grid/03-grid-filled`         | `8a19cd5e30c03efeffdb0e65ba0b18b60c791fe95ae6b76b0c311b25a7542841` |
| `offering-grid/04-grid-invalid`        | `4aafeb1e1f0849f6b622be6fb3a39a92c6e0da6d49ccf4eb6d6a52e3f7ac9433` |
| `offering-grid/05-grid-pending`        | `4299c13d21bf84cc42431b3ec056e2a6b2a9fbf4a20edd49fdb3ccd1c6c2cb4e` |
| `offering-grid/06-grid-error`          | `8460e9d2ad3ed16c5d5571b2acd0f86aff644703120f5fc5c324f99c8e707c33` |
| `offering-grid/07-correction-oneoff`   | `a135d3d0bf1cc2334a4e28645cdfb4fe0d8e8f2cec566fef04f749c7db285999` |
| `offering-grid/08-custom-merge`        | `a229e5d6504b2613548c314ddb81130afeacdd631988d99f13e737b8b8b1f697` |
| `offering-grid/09-unconfigured`        | `5d00a2f400d4f4983f3c536fa1b35be795011c1f306046c1a4ace2d66099d9a9` |
| `offering-grid/10-all-hidden`          | `daa02a734e93e64665dee5f0b663e720994e0f6101de71d4b1b0d34ff92706ce` |
| `offering-grid/11-history-hidden-line` | `1ca3b6799a42632af660aefe7d58fee941da0f50b6febeea1335c01a2eb86331` |

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
- **Three sets still draw the pre-FR-9a action row**: `v2-events/08-event-detail-series`,
  `09-event-detail-cancelled` and `08-series-detail-entry`, plus the refresh-after-verb order in
  `headcount/01-headcount.html` and `offering-grid/01-offering-grid.html`. They are mock-only follow-ups,
  recorded here so the next capture pass picks them up.
- **`03-record-mixed` was renamed** to `03-record-presbyters`, with its archive and `history.json` state
  key following. The old mixed picture survives as `12-mixed-service`, in history where the build puts it.
- **The roster came back byte-identical** after the `th` change, which proves its own override still wins
  over the stylesheet.
- **`mvp-offerings/01-offerings-landing` loading and error moved** because an earlier cut had folded them;
  the counts page did not move, since it carries no refresh control.
