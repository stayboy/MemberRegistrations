# Round - period-inline-layout

|                        |                                                                            |
| ---------------------- | -------------------------------------------------------------------------- |
| Status                 | OPEN                                                                       |
| Tier                   | 1                                                                          |
| Mode                   | `attended` (the owner directed the layout and signed both drawings)        |
| Base                   | `c88c5c9`                                                                  |
| Review rounds          | 1                                                                          |
| Gate runs in parent    | 0                                                                          |
| Spec                   | `documents/specs/member-registrations-ui.md` (FR-42f, AC-63a)              |
| Workers                | `single`                                                                   |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (period controls, captures)` |
| Verbs this round needs | `branch, commit, push, pr, merge`                                          |

## Plan

The owner's layout for the period mode, matched to two signed drawings, plus the build's picture of it.

- the `Named period` field stretches and the arm's field sits inline beside it (`Cycle month` for one cycle, `Day inside the period` for monthly, the single-date explanation where there is no control);
- directly beneath, one inline row: the visible `Frequency` label, an info glyph in a `Tooltip`, then a horizontal `RadioGroup` of `One cycle` / `Monthly` - the old field label and the per-radio sub-labels are gone;
- the day field's explanation moves into a tooltip of its own;
- the create form's period arm gains a **capture** for each arm, and the stale `events-new.png` (pre-#236) is replaced.

Acceptance criteria:

1. `10-event-create-period` matches the drawing: named period + cycle month on one row, the frequency row inline beneath.
2. `21-event-create-period-recurring` matches the drawing: same row with the day field, its explanation in a tooltip and no hint line.
3. One `Named period` select exists on the form - the shared field is never rendered twice.
4. Both arms have a build capture (`events-new-period.png`, `events-new-period-monthly.png`), and `events-new.png` shows the current form.
5. The gates pass, and a locked or read-only period keeps the inline stored value with no radiogroup.

## Verification

| Gate               | Command                                            | Result                       |
| ------------------ | -------------------------------------------------- | ---------------------------- |
| build + API + unit | `npm run verify:fast`                              | pass 4/4 (1245 tests)        |
| UI unit + DOM      | `npm run ui:test` / `npm --prefix ui run test:dom` | 567 / 258                    |
| browser pass       | `npm run ui:e2e`                                   | 93 passed                    |
| captures           | `npm run ui:capture`                               | 31 passed, two new baselines |

gate-run 2026-11-25T19:10:49.643Z profile=fast steps=4/4 lines=4 bytes=717

## Git writes

| Brief | Actor | Verb | Variant | Reason |
| ----- | ----- | ---- | ------- | ------ |

## Mock sign-off

| Surface                  | Mock                                                     | Capture                                         | sha256     | Signer | Date       | Verdict |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------- | ---------- | ------ | ---------- | ------- |
| period create, one cycle | `mockups/v2-events/10-event-create-period.png`           | `ui/e2e/baseline/events-new-period.png`         | `3f0c3c2e` | owner  | 2026-11-25 | signed  |
| period create, monthly   | `mockups/v2-events/21-event-create-period-recurring.png` | `ui/e2e/baseline/events-new-period-monthly.png` | `702e883c` | owner  | 2026-11-25 | signed  |

Mock coverage: claimed 10 · e2e-only 1 · deferred 1 · prose 0

## Mock parity

| Claim                         | Type          | State                              | Answer (max prob) | Threshold | Confirmed by   | Disposition       |
| ----------------------------- | ------------- | ---------------------------------- | ----------------- | --------- | -------------- | ----------------- |
| `EVP-PREVIEW-ONE`             | spec-required | `10-event-create-period`           | -                 | -         | parent (image) | present, as drawn |
| `EVP-NO-INLINE-TABLE-ONE`     | spec-required | `10-event-create-period`           | -                 | -         | parent (image) | absent, as drawn  |
| `EVP-PREVIEW-MONTHLY`         | spec-required | `21-event-create-period-recurring` | -                 | -         | parent (image) | present, as drawn |
| `EVP-NO-INLINE-TABLE-MONTHLY` | spec-required | `21-event-create-period-recurring` | -                 | -         | parent (image) | absent, as drawn  |

## Acceptance

| Criterion | Met | Evidence | Verdict |
| --------- | --- | -------- | ------- |

## Deviations

- **The one-cycle capture shows an unresolved preview** ("No dates resolve in the next 90 days"): the gateway stub deliberately returns no occurrences rather than re-implementing the resolver. The drawing shows the resolved dates; the capture proves the layout, not the resolver, and the baseline README states the limit. The monthly capture resolves because its data comes from the fixture's own day.
- **Two baselines were left at `HEAD`**: `shell-mobile.png` and `shepherding-officers.png` moved by antialiasing on the capture run and are outside this round's surface.
