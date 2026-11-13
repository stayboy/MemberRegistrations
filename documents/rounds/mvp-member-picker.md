# Round — mvp-member-picker

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tier                | 2                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Mode                | attended (owner: "all as recommended" to the six-question grill, 2026-11-13)                                                                                                                                                                                                                                                                                                                                                    |
| Base                | `b5fc05f`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Review rounds       | 0                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Gate runs in parent | 0                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Spec                | `member-registrations-events-offerings.md` FR-26a (new); `member-registrations-ui.md` D12/FR-9a are round 2's                                                                                                                                                                                                                                                                                                                   |
| Workers             | `parallel` — slice A: the two forms + their component tests + the catalogue; slice B: `ageMonths` across the API and the picker label. Both on worker `ollama-cloud/deepseek-v4.1-flash:1017` in separate contexts; the slices are file-disjoint (A owns `ui/src/pages/ussd/`, the forms' test and `documents/mock-claims/mvp-offerings.json`; B owns `src/`, `ui/src/api/members.ts`, `ui/src/format/` and `MemberPicker.tsx`) |
| Implementer         | worker ollama-cloud/deepseek-v4.1-flash:1017 (this session, the ranked worker seat: forms, tests, catalogue, mock)                                                                                                                                                                                                                                                                                                              |

## Plan

Recording an announced offertory or a pledge today asks the operator to **type a member number** into a plain
`Input` (`ui/src/pages/ussd/OfferingGivingForms.tsx:106` and `:248`), validates only that it is non-empty, and
lets the API answer `404 Member … was not found` after the fact. The pledge dialog repeats the defect for its
follow-up officer (`:281`). The owner's ruling: the operator must pick the member, not recall a number.

A reusable `MemberPicker` already exists (`ui/src/components/MemberPicker.tsx`), is a Fluent `Combobox` over
`GET /v1/members?q=` (member number and name parts, never contact values), debounces 300 ms, and has nine call
sites including four USSD pages. The giving payloads already carry `memberNo`, so the forms themselves need no
wire change — but the identity label did: the member summary gains `ageMonths`, a nullable derived integer, so
`src/schemas/members.ts`, `src/repos/members.ts`, `src/domain/age.ts`, the OpenAPI document and the API tests
move with it, and `member-registrations-api.md` is amended (2026-11-13).

### Spec first

`member-registrations-events-offerings.md` gains **FR-26a**: the operator identifies the member with the shared
picker for a contribution, a pledge and the pledge's follow-up officer; a free-typed number must not be the only
way. The amendment is reviewed by the pro seat before any code, per `AGENTS.md` §1–2.

### Mock first

The parity policy requires a comparison mock and an owner sign-off **before the first code commit**. The
`mockups/mvp-offerings/` set already draws this surface (`02-offerings-count-dialog`, `-offertory`, `-pledge`),
so the mocks are updated to show the picker in place of the number input and presented for sign-off:

1. Redraw `mockups/mvp-offerings/02-offerings-count.html` with the member field as a picker showing a selected
   member's name.
2. Capture `02-offerings-count-offertory.png` and `02-offerings-count-pledge.png`, record their sha256.
3. Owner sign-off recorded in `## Mock sign-off` with the `Mock coverage:` line.

### Catalogue (R6 prerequisite)

`ui/src/**` changes, so R6 needs `documents/mock-claims/mvp-offerings.json`: a `ussd-offerings` surface with
its `acsMatch`, states `offertory` and `pledge` marked `coverage: "signed"` pointing at the redrawn PNGs, and an
inventory over the offering/pledge ACs (FR-24, FR-25, FR-26 plus the offering-count ACs), dispositions
`claimed | e2e-only | deferred`, never absent.

### Code

- `AnnouncedOffertoryForm` and `PledgeForm`: `MemberPicker` (required selection, `validationState`) in place of
  the number `Input`; the pledge's follow-up officer becomes the same picker.
- The selected member's name is visible in the dialog, so the operator can confirm they picked the right person.
- Existing tests that type a member number are updated to select from the picker; the server's `404` stays as
  the backstop and keeps its test.

### Not in this round

- The shared `Actions` menu (D12/FR-9a) — round 2, with the shell catalogue and the test churn.
- The presbyter filter on the officer picker (backlog row 26): the picker will offer any member, and the API
  validates. Named here so it is not mistaken for a regression.

## Verification

gate-run 2026-11-13T11:29:03.433Z profile=full steps=7/7 lines=7 bytes=854

| Gate                                            | Result                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `npm run verify`                                | **7/7** (signature above)                                          |
| `npm --prefix ui run test` (node lane)          | **426 passed / 40 files**                                          |
| `npm --prefix ui run test:dom` (DOM lane)       | **2 passed / 1 file**                                              |
| `npx vitest run tests/domain/age.test.ts`       | **11 passed**, including the 29 February case the review asked for |
| `npx vitest run tests/meta/mock-claims.test.ts` | **76 passed**                                                      |
| `npm --prefix ui run typecheck`                 | clean                                                              |

## Review

Tier 2, independent seat `ollama-cloud/deepseek-v4-pro:0813` (11:2x local, outside the window).

**Verdict: ACCEPTED.** `Standards: PASS` (three P2s), `Spec: PASS` (FR-26a and FR-22a delivered), `Seat: consistent`.

P2 dispositions:

| P2                                                                               | Disposition                                                                                                                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The round doc claimed "UI-only, no wire contract, no schema, no repository edit" | corrected: the label needed `ageMonths`, so the round also changes the wire, and the Plan now says so                                          |
| `ageInMonths` had no 29 February test                                            | added, and it asserts the months/years agreement on a leap birthday                                                                            |
| The catalogue cited the unit test for `assert: e2e` entries                      | `MP-MEMBER-01` now cites the e2e spec that drives the combobox; `MP-MEMBER-02`/`03` are `assert: dom`, which is where they are actually proven |

Grill findings (the owner rule that a review also names absences):

| #   | Finding                                                                                                | Disposition                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The picker's empty and error states were unspecified                                                   | applied: FR-26a now names "No matching members" and the unavailable-search state                                                  |
| 2   | "Only a picked option sets the number" was implicit                                                    | applied: stated in FR-26a                                                                                                         |
| 3   | The inactive-shepherd path is unnamed — a pledge with no active shepherd forces a 422 with no guidance | **parked for the owner**: it changes what the operator must do, not how the picker looks                                          |
| 4   | e2e evidence was thinner than the catalogue claimed                                                    | applied by re-scoping 02/03 to `dom`; the e2e drives the offertory picker to a real selection and that is what MP-MEMBER-01 cites |

Seat: consistent — the flash worker seat implemented in two recorded, file-disjoint slices, and the pro seat
reviewed without authoring.

## Mock sign-off

| Surface           | State                             | Mock                                                     | sha256                                                             | Signer | Date       | Verdict |
| ----------------- | --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/ussd/offerings` | offertory (member picker)         | `mockups/mvp-offerings/02-offerings-count-offertory.png` | `b422f3d9a96ff57681e0fef1befb75a52acadc0893142c62265534c41fe980b5` | owner  | 2026-11-13 | signed  |
| `/ussd/offerings` | pledge (member + officer pickers) | `mockups/mvp-offerings/02-offerings-count-pledge.png`    | `fdfde7eafd4bd524801cd6993ccd7f5cdcaf5692698431b90567b8a825caaa37` | owner  | 2026-11-13 | signed  |

These supersede the pair signed an hour earlier (`5d258ea8…`, `3451fffd…`) when the option label gained the
`(M, 12y)` identity. The older hashes describe pictures that no longer exist.

Mock coverage: claimed 0 · e2e-only 11 · deferred 1 · prose 1

## Mock parity

n/a — the parity screen is advisory and this round changes a dialog's controls, not its atoms.

## Acceptance

TBD

## Deviations

TBD
