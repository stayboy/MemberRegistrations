# Round - member-photo

|                        |                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status                 | CLOSED                                                                                                                                                                                                                                                                                                 |
| Tier                   | 2                                                                                                                                                                                                                                                                                                      |
| Mode                   | `unattended (auto-accept recommendations)`                                                                                                                                                                                                                                                             |
| Base                   | `8e68cf7`                                                                                                                                                                                                                                                                                              |
| Review rounds          | 2                                                                                                                                                                                                                                                                                                      |
| Gate runs in parent    | 5                                                                                                                                                                                                                                                                                                      |
| Spec                   | `documents/specs/member-registrations-member-record.md` - Phase 2: MR-14..MR-21; AC-MR12..AC-MR14, AC-MR31, AC-MR34                                                                                                                                                                                    |
| Workers                | `single`                                                                                                                                                                                                                                                                                               |
| Implementer            | `worker cline-pass/cline-pass/deepseek-v4.1-flash-1017 (photo migration, endpoints, avatar, dialog, tests); worker ollama-cloud/deepseek-v4.1-flash:1017 (confirmation-fix camera case and object-URL reset, outside window); parent opencode/deepseek-v4.1-flash-free (spec, mock, captures, record)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                                                                                                                                                                                                |

`git-seat-budget: 7` - 1 branch + 1 commit + 1 push + 1 pr + 1 merge + 1 sync + 1 retry. `publish` is
not in this budget: it is a post-merge seat the owner dispatches explicitly, and the unattended mode
never pre-authorises it.

Two seat briefs were attempted (rung 1 unavailable, rung 2 denied the shell); the parent executed
the chain and the Git writes table records the reason for each parent row.

## Seats

| Seat                        | Picked (local)                                   | Window | Class          | Candidate probed                                 | Basis                            |
| --------------------------- | ------------------------------------------------ | ------ | -------------- | ------------------------------------------------ | -------------------------------- |
| Mock builder                | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | n/a    | `mock-builder` | owner default                                    | any-window class                 |
| Worker (build)              | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | in     | `worker-flash` | `cline-pass/cline-pass/deepseek-v4.1-flash-1017` | inside-window first              |
| Reviewer (build)            | `ollama-cloud/mimo-v2.6-pro`                     | in     | `reviewer-pro` | `ollama-cloud/mimo-v2.6-pro`                     | inside-window first              |
| Worker (confirmation fixes) | `ollama-cloud/deepseek-v4.1-flash:1017`          | out    | `worker-flash` | `ollama-cloud/deepseek-v4.1-flash:1017`          | outside-window first after 18:00 |
| Reviewer (confirmation)     | `ollama-cloud/mimo-v2.6-pro`                     | in     | `reviewer-pro` | `ollama-cloud/mimo-v2.6-pro`                     | inside-window first at 17:58     |

## Gate

Phase 2 is a hard gate: a migration (three nullable `members` columns), a wire endpoint
(`PUT`/`GET`/`DELETE /v1/members/:memberNo/photo`) and PII handling (a member's face). The owner said
"go" on 2026-11-18 after the gate was put to them in those terms, which is recorded here as the
round-and-gate authorisation for this unattended round.

## Grill

The spec's Phase 2 decisions are this round's grill and are auto-accepted under the unattended mode.

1. **Storage.** Recommendation: three nullable `members` columns behind the bearer, no external blob
   store. Cost: heavier rows. Accepted (MR-14).
2. **Endpoints.** Recommendation: `PUT`/`GET`/`DELETE` on `/v1/members/:memberNo/photo`, 2 MiB, magic
   bytes, ETag/304 and `private, max-age=300`. Cost: a raw-body parser on one route. Accepted (MR-16,
   MR-17).
3. **Client pipeline.** Recommendation: centre-crop 512, WebP with a JPEG fallback, 10 MiB source gate,
   no EXIF or filename. Cost: canvas-only in the browser. Accepted (MR-15).
4. **DTO and avatar.** Recommendation: `photoUpdatedAt` on detail/list, an authenticated blob fetch with
   object-URL revoke, one `MemberAvatar` everywhere. Cost: one request per avatar. Accepted (MR-18,
   MR-19).
5. **Camera.** Recommendation: `getUserMedia` in the dialog with a file-input fallback. Cost: the
   granted path is browser-only. Accepted (MR-20).
6. **Form control (owner correction).** Recommendation: the photo on the left of the Identity panel, a
   square sized to the field stack (top first input, bottom last input), one column below 560 px; the
   512 crop stays in the dialog. Accepted (owner, 2026-11-18: "profile photo form size too big", "keep
   at the left side as it was ... size it to fit"). Cost: the desktop square needs a measured field
   stack, and the mobile form is one column.
7. **Privacy.** Recommendation: no filename, EXIF or bytes in a log; the masked avatar only. Cost: none
   beyond the bytea row. Accepted (MR-21).
8. **Mocks.** Recommendation: four states auto-signed under the unattended mode and listed for the
   owner. Cost: the owner reviews the auto-signed list at the end of the round. Accepted.

## Plan

Goal: a member can have one square photograph, uploaded or taken live, stored in the register and shown
wherever a member avatar appears; initials remain the fallback.

Acceptance criteria (the Phase 2 set):

1. The three nullable columns and the additive migration; the Drizzle schema and the SQL migration in
   lockstep with the drift check (MR-14, MR-36).
2. `PUT` raw bytes, WebP/JPEG/PNG by magic bytes, <= 2 MiB, bearer; `GET` with ETag/304 and
   `private, max-age=300`; `DELETE`; 404 when absent (MR-16, MR-17).
3. The client crops to a square, scales to 512, re-encodes WebP/JPEG and rejects a source over 10 MiB
   (MR-15).
4. `MemberDetail` and `MemberListItem` carry `photoUpdatedAt`; the browser fetches the bytes as an
   authenticated blob and revokes the object URL (MR-18).
5. A shared `MemberAvatar` shows the photo or the initials on the header, list, contacts dialog,
   pickers and shepherding rosters (MR-19).
6. The photo dialog offers a file and `getUserMedia`, degrades to the file input, and supports remove
   (MR-20).
7. No filename, EXIF, bytes or data URL in a log or row; the log carries the member number and byte
   length only (MR-21).
8. Unit, DOM and e2e tests green; the full gate; the captures re-cut.

## Verification

- **Gate:** `npm run verify` -> `skill`, `check-round`, `format`, `lint`, `typecheck`, `test`, `build`
  all PASS, 7/7 steps, at 18:08:25Z (the reviewed tree).

```
gate-run 2026-11-18T18:08:25.251Z profile=full steps=7/7 lines=7 bytes=1226
```

- **Migration smoke:** `npm run smoke` PASS - the presbyter fixture now carries a phone contact, because
  the Phase 1 reachability rule refuses a member with neither a contact nor a guardian (the smoke
  predates that rule).
- **Unit + DOM:** UI 504 passed (43 files), DOM 153 (19 files, the camera and hook cases included); root
  874 passed, 10 skipped (63 files).
  One DOM run of `MemberDetailPage.dom.test.tsx` timed out under parallel load; the file passed in
  isolation (17/17) and the full suite re-ran green - the two automatic re-runs of the round, per §8.
  The final DOM run (19 files, 153) and the browser run are on the reviewed tree.
- **Photo endpoint:** 10 PGlite tests (PUT/GET/DELETE, magic bytes, 2 MiB, auth, ETag/304, cache, 404,
  DTO fields, log privacy) plus the pooled `pg` lane (`TEST_DATABASE_URL`, skipped locally) over the
  `bytea` round-trip, the direct `photo` column read, ETag/304 and the clear. The ETag now carries the
  byte length, so two uploads inside one millisecond differ when their lengths differ (MR-17).
- **Client pipeline:** four encoder cases stub the bitmap and the canvas and assert the 1600 x 900
  centre crop to 512 x 512, `image/webp`, the JPEG fallback and the zero-area refusal; the 10 MiB and
  type gates stay covered.
- **Browser:** `npm run ui:e2e` 76 passed, including the new 360 px `/members/new` case (the photo
  column above the full-width field grid, a 96 px square) beside the no-horizontal-scroll cases.
- **Capture:** `npm run ui:capture` 25/25. `member-add` carries the left photo square sized to the field
  stack (top first input, bottom last input); the desktop overlap and the 360 px stretch were found by
  the capture/suite, fixed and re-verified.
- **Mock signature:** the four photo states are `auto-signed` by the unattended seat (form control,
  dialog, camera, list) with their hashes listed below for the owner review at the end of the round.
- **Tier 2 build review:** REWORK on the first pass (two P1, five P2, three nits); all code and test
  findings are fixed and re-gated, and the confirmation review is pending.

## Acceptance

| #   | Criterion                                                             | Verdict | Evidence                                                             |
| --- | --------------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| 1   | Three nullable columns, Drizzle + SQL in lockstep, drift check        | met     | `0024_member_photo`; migration test; gate                            |
| 2   | `PUT`/`GET`/`DELETE` with magic bytes, 2 MiB, ETag/304, private cache | met     | `tests/api/member-photo.test.ts` (10 + `pg` lane); byte-length ETag  |
| 3   | Client crop 512 + re-encode, 10 MiB/type gates                        | met     | `ui/src/format/photo.test.ts` (4 encoder + gate cases)               |
| 4   | `photoUpdatedAt` on detail/list, blob fetch, object URL revoke        | met     | DTO tests; `MemberAvatar` tests; `useObjectUrl` state/effect hook    |
| 5   | Shared avatar on header, list, contacts, pickers, rosters             | met     | component and page tests; picker/form/shepherding caches invalidated |
| 6   | Dialog file/camera/remove, denial fallback                            | met     | `MemberPhotoDialog` DOM tests (granted + denied camera)              |
| 7   | No filename/EXIF/bytes in logs, member number + length only           | met     | endpoint tests + logging path                                        |
| 8   | Gates and captures                                                    | met     | verify 7/7 at 18:08:25Z; e2e 76; capture 25; smoke PASS              |

Verdict: **ACCEPTED** - Phase 2 accepted on 2026-11-18 after two Tier 2 rounds (REWORK, then
ACCEPT on `ollama-cloud/mimo-v2.6-pro`); the two confirmation P2s are folded into the commit and the
full gate, browser suite and capture were re-run on the reviewed tree. The four photo mocks are
auto-signed and listed for the owner review at the end of the unattended work.

## Deviations

- **Raw file and video controls.** Fluent v9 has no file picker or video surface, so the photo dialog
  uses a hidden `input[type=file]` and a `<video>` for the live frame; both are labelled and the dialog
  composes the Fluent surfaces around them. This is the §16 gap record.
- **Auto-signed mocks.** The four photo states are auto-signed by the unattended seat (basis in the
  catalogue) and listed in the sign-off table for the owner review at the end of the unattended work.
- **Smoke fixture.** `scripts/smoke.mjs` gives the presbyter a phone contact because the Phase 1
  reachability rule refuses a create with neither a contact nor a guardian.
- **Dialog and camera captures.** No seeded member has a stored photo, so the dialog and camera
  have no baseline of their own; the states are the auto-signed drawings and both camera paths are
  DOM-tested. The list capture shows the initials fallback; the photo row is the drawing.

## Review

Seat: consistent - the `Implementer` row names the worker for the code and the parent for the spec,
mock and captures; the Tier 2 review runs on `ollama-cloud/mimo-v2.6-pro` (inside window).

**Spec review:** the Phase 2 clauses were accepted with the member-record spec (four passes,
2026-11-18); the gate is recorded above.

**Tier 2 build review (first pass):** REWORK. Accepted findings and their fixes:

- **P1 both drivers.** `tests/api/member-photo.test.ts` gains a `describe.skipIf(!TEST_DATABASE_URL)`
  block over the new `bytea` mapping and the PUT/GET/DELETE contract on `pg` (§12).
- **P1 encoder untested.** Four `encodePhoto` cases stub the bitmap and canvas: the centre crop, 512 x
  512, WebP, the JPEG fallback and the zero-area refusal; the false "covered by the e2e" comment and
  this document's claim were corrected.
- **P2 object URL purity.** `URL.createObjectURL` left `useMemo` for `ui/src/hooks/useObjectUrl.ts`
  (`useState` + `useEffect` keyed on the blob, revoke on cleanup, Strict Mode safe); the handle clears
  when the blob goes null, so a returning identical instance cannot show a revoked URL.
- **P2 avatar caches.** A photo save/remove also invalidates `member-picker`, `member-form` and
  `shepherding`, so pickers, guardian candidates and rosters refresh their avatars.
- **P2 360 px evidence.** A new responsive case asserts the stacked photo/field layout and the 96 px
  square at 360 px; the no-horizontal-scroll cases stay.
- **P2 purge.** The purge test uploads a PNG first, then asserts `photo`, `photo_content_type` and
  `photo_updated_at` are null.
- **Nits.** The ETag folds the byte length (MR-17 amended); the archived read/write asymmetry is
  documented on the write methods; the versionless photo URL keeps `no-store` (recorded, not changed).

**Tier 2 build review (confirmation):** ACCEPT on `ollama-cloud/mimo-v2.6-pro`. All eight findings
verified in the tree (the `pg` lane with a `Buffer` column read, the four encoder cases, the
`useObjectUrl` shape and its single documented exemption, the three cache invalidations, the 360 px
case, the purge columns, the byte-length ETag, the archived comments). The ETag amendment is
recorded as **re-approved**, with the wording parenthetical. Two P2s are folded in before the commit:

- The spec's PUT block said `204` with a body; the route answers `200` with `photoUpdatedAt`. The
  spec now says `200` and carries an amendments note (§1: code and spec fixed together).
- The granted-camera path (`captureFrame` crop to `encodePhoto`) gains a DOM case beside the denial
  case, and `useObjectUrl` resets its handle when the blob clears so a revoked URL cannot reappear.

Nits accepted: the ETag wording is softened to "differ when their lengths differ"; the encoder test
count is four, not five; the versionless photo URL keeps `no-store`.

## Git writes

| Brief | Actor                 | Verb   | Variant                        | Reason                                                                                                            |
| ----- | --------------------- | ------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1     | `git-executor rung 1` | branch | `opencode/beam-free`           | Seat unavailable: "Free usage limit reached"; no write made.                                                      |
| 2     | `git-executor rung 2` | branch | `ollama-cloud/mimo-v2.6-flash` | Rung-1 fallback (`fallbackReason`: free usage limit); seat refused with `shell-permission-denied`; no write made. |
| 3     | `parent`              | branch | n/a                            | Both seat rungs unavailable; created `feat/member-photo` from `8e68cf7`.                                          |
| 4     | `parent`              | commit | n/a                            | Same; one squash commit for the round.                                                                            |
| 5     | `parent`              | push   | n/a                            | Same; branch pushed with upstream.                                                                                |
| 6     | `parent`              | pr     | n/a                            | Same; PR against `main`.                                                                                          |
| 7     | `parent`              | merge  | n/a                            | Same; squash merge after the required checks.                                                                     |
| 8     | `parent`              | sync   | n/a                            | Same; fast-forward `main` after the merge.                                                                        |

## Mock sign-off

| Surface                          | Mock                                          | Capture                                                             | sha256                                                             | Signer     | Date       | Verdict     |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- | ----------- |
| Form photo control               | `mockups/v2-shell/22-member-photo-form.png`   | `ui/e2e/baseline/member-add.png`                                    | `cc92205028d1e2ffaff0c630ff1b96ad73ee41c7e971b44b8f296231899525b1` | unattended | 2026-11-18 | auto-signed |
| Photo dialog                     | `mockups/v2-shell/22-member-photo-dialog.png` | pending (no capture for the dialog)                                 | `46e25789114df7bfd0e83973671ed06cf3535e855d9d2c4619d80fa687d2135d` | unattended | 2026-11-18 | auto-signed |
| Camera dialog                    | `mockups/v2-shell/22-member-photo-camera.png` | pending (no capture for camera mode)                                | `eb4845b0b67ddfb909ba4cc22826383648ed914c7958e46c288d0a9601de5f73` | unattended | 2026-11-18 | auto-signed |
| Members list with a photo avatar | `mockups/v2-shell/22-members-list-photos.png` | `ui/e2e/baseline/members-list.png` (initials row; no fixture photo) | `bf9c4679b38ee6fe9b39231dd00222e4cc650e786dd9e0bb407a1b161b3888b1` | unattended | 2026-11-18 | auto-signed |

## Mock parity

n/a - the four photo states are drawings, not parity claims; the builds are the captures named in the
sign-off table above. The states are auto-signed for this unattended round and listed for the owner
review at its end.
Mock coverage: claimed 4 · e2e-only 0 · deferred 0 · prose 0.
