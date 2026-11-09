# Round — mvp-release-hardening

|                     |                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Status              | OPEN — implementing (owner pre-authorised the round)                                          |
| Tier                | 2                                                                                             |
| Mode                | `unattended (auto-accept recommendations; owner pre-authorised this round)`                   |
| Base                | `33f891b`                                                                                     |
| Review rounds       | 0                                                                                             |
| Gate runs in parent | 1 (mock render + verify:fast)                                                                 |
| Spec                | events-offerings FR-39/AC-3; API roster/search reads; UI §2.5/nav map; USSD production gating |
| Workers             | `single`                                                                                      |

### Seats (owner, 2026-11-09)

- **Reviewer:** `ollama-cloud/deepseek-v4-pro:0813` first choice; between 12:00 and 18:00 local use
  `cline-pass/cline-pass/mimo-v2.6-pro`; also use mimo when the ollama weekly limit hits.
- **Worker:** `ollama-cloud/deepseek-v4.1-flash:1017` first choice; between 12:00 and 18:00 local use
  `cline-pass/cline-pass/deepseek-v4.1-flash-1017`; also use cline-pass when the ollama weekly limit
  hits.
- The 0813 spec review (ACCEPT, Option B) completed before 12:00; the applied spec-diff confirmation
  and the code review use the 12–18 seat (`mimo-v2.6-pro`); the implementation worker uses the
  cline-pass seat. A fallback is recorded with `fallbackReason` when used.
- Owner pre-authorisation for this round (0813 go-forward grill Q14): commit, push, PR and merge for
  `mvp-release-hardening`; Option B approved; Q5/Q6 roster/search narrowing carried into this round.

## Plan

Goal: close the MVP hardening items from the capture round Q16/Q17 — roster-contact read narrowing,
main-search narrowing, the read-only Active offerings panel, the production Simulator-hidden state,
and the production config/backup/alerting/cutover checks — without reopening the offering-capture
semantics.

The two changed UI surfaces need a comparison mock and owner sign-off **before** code:

1. **Active offerings panel** on the event detail (`#/events/event-1`), read-only (FR-39, AC-3,
   capture Q7). It lists every attached offering with its current terms, status and a `View terms`
   action; the full offering catalogue/detail is O1 post-MVP.
2. **Simulator hidden** in production (capture Q4): the USSD nav keeps every other item and drops
   the Simulator; the other USSD pages carry a "USSD is not live" notice. The deep-linked page keeps
   the existing development-only guard.

Pre-authorisations carried from the capture grill (2026-11-08):

- **Q5 roster contacts** — narrow the read so the roster DTO carries a contact count, never contact
  values; the Contacts action continues to read the member contacts route.
- **Q6 main search** — `GET /v1/members?q` matches name or member number only; drop the contact-value
  `exists` branches.

Still owner-named when they open: production config/cutover values, backup/alerting setup, and 24e
(`0018`). The protected-doc mock-policy amendment stays queued for `0813`.

The implementation starts only after the owner signs the two mocks. Tier 2: a worker implements and
the reviewer gate is independent (Standards + Spec), because the roster/search changes touch read
contracts.

### Mocks and states

| Surface                | Route              | States the mock must define            |
| ---------------------- | ------------------ | -------------------------------------- |
| Active offerings panel | `#/events/event-1` | success, empty, loading, error, dark   |
| Simulator hidden       | `#/ussd/codes`     | production (nav hidden + notice), dark |

Deliverables under the git-ignored `mockups/mvp-hardening/`:

- `01-active-offerings.html` + 5 PNGs — event detail with the read-only panel; every attached
  offering (including an expired one), current terms version, `View terms`, empty/loading/error.
- `02-simulator-hidden.html` + 2 PNGs — USSD section with no Simulator nav item and the production
  notice; the other pages stay.
- `hardening.css`, `README.md`, `capture.mjs`.

### Acceptance

1. Both HTML sources render at 1440 without console errors; 7 PNGs captured.
2. The Active offerings panel lists every attached offering with kind, currency, available-until,
   status, terms version and a `View terms` action; expired rows are marked; the panel is read-only;
   empty/loading/error are defined.
3. The production USSD section has no Simulator nav item and carries the "USSD is not live" notice;
   the deep-linked simulator page keeps the existing development-only guard.
4. After sign-off, the roster DTO carries no contact values (a count only), and `GET /v1/members?q`
   no longer matches contact values; tests fail before and pass after.
5. The Active offerings panel is built on the existing event aggregate; no new read.
6. The implementation passes the full gates and the parity screen; any spec-required miss is reworked
   before the commit request.
7. The owner signs the two mocks in `## Mock sign-off`; unsigned means no code.

Out of scope: 24e complaints (`0018`), the offering catalogue/detail (O1), live USSD/payment gateway,
Redis/aggregate materialisation, and the protected-doc amendment.

## Spec review

| Seat                                 | Model                                 | Verdict           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fallback (0813 unavailable that day) | `cline-pass/cline-pass/mimo-v2.6-pro` | REWORK            | P1: the signed Active-offerings panel omits FR-39 fields (default amount, exceptions, stats); no spec-amendment deliverable. P2: title/expired, no-new-read wording, goal scope, Q6 paraphrase, contactCount semantics, notice placement, test breaks.                                                                                                                                                                                                 |
| First choice (available 2026-11-09)  | `ollama-cloud/deepseek-v4-pro:0813`   | ACCEPT (Option B) | Contingent on the FR-39/AC-3 narrowing landing before code. P1: record the narrowing and align the FR-4/FR-9/AC-3 "stats" residue with R8. P2: use a SQL count for `contactCount`; exclude `#/ussd/simulator` from the notice; word the notice as member-dial-in, not operator pages; Q6 includes alias/maiden; keep `(from, to)` on the roster route row; update the roster UI type/tests; state the terms-version source and the `View terms` route. |

| Applied-diff confirmation (12–18 seat) | `cline-pass/cline-pass/mimo-v2.6-pro` | ACCEPT | The applied spec edits match 0813's Option B; one non-blocking narrative persona row still says "offering totals" (jobs table only). |

## Spec amendments (applied, 0813 ACCEPT, Option B)

**`documents/specs/member-registrations-api.md`**

- After FR-31: `FR-31a: The q parameter of GET /v1/members MUST match only member number and name parts (first, last, other names, alias, maiden name), case-insensitively; it MUST NOT match owned or linked contact values. Contact-value lookup is the separate contact filter.`
- Roster prose: `member identity, a contact count (owned and linked; never contact values), ...`
- Route table `GET /v1/shepherding/officers/{memberNo}/members`: `The officer's roster with a contact count (owned and linked, never contact values), counts and latest report.`
- Cross-entity search references: `the cross-entity name search (contact matching is the contact filter)`.
- Changelog: Q5/Q6 narrowing on 2026-11-09.

**`documents/specs/member-registrations-ui.md`**

- `RosterEntry`: replace `contacts: Contact[]` with `contactCount: number` (owned and linked; never values).
- AC-35: `with a contacts action and count (never values), counts, last outcome ...`
- AC-48: `only name parts (first, last, other names, alias, maiden name) or member number is accepted`.
- §2.5 after the section list: `In a production build the USSD section keeps every item except the Simulator and each other USSD page carries a "USSD is not live" notice rendered by PageFrame for section ussd; the Simulator page keeps its development-only MessageBar instead. A deep link to #/ussd/simulator keeps the existing development-only guard.`
- Nav map: `POST /dev/ussd/session (development only; nav item hidden in production builds)`.
- Changelog: the four hardening changes on 2026-11-09.

**`documents/specs/member-registrations-events-offerings.md` — one owner decision**

- **Option A (not chosen):** the panel would also show the default amount and effective exceptions; the signed mock would be extended and re-signed.
- **Option B (chosen and applied, 0813's recommendation):** `Selecting an active event MUST display every offering attached to it in a read-only "Active offerings" panel — active meaning not detached; an expired attachment remains listed and marked — with the resolved name, kind, currency, effective available-until, status, the current terms version and a View terms action. The terms view carries the default amount; the full offering detail, including its per-date exceptions, is O1 post-MVP.` Owner approved 2026-11-09 (go-forward Q14).
- Align the FR-4/FR-9/AC-3 "stats"/"totals" residue with R8: FR-4 says the read-only panel, FR-9 drops "and their totals", AC-3 says the panel columns rather than "with stats".

Additional 0813 edits:

- API: the roster count is a SQL `COUNT` of owned + linked contacts (no value fetch); keep `(from, to)` on the roster route row; the `contact` filter note says it matches owned/linked contacts while `q` does not.
- UI: the production notice is rendered by PageFrame for `sectionId="ussd"` **except** `#/ussd/simulator`, which keeps its development-only MessageBar; the notice says the member dial-in is not live, not that the operator pages are broken.
- UI: the roster type is `contactCount: number`; `ShepherdingRosterPage` and its fixtures/tests move from `entry.contacts.length` to `entry.contactCount`.
- Event detail: the panel's terms-version column reads `EventOffering.terms.version` from the aggregate; `View terms` reuses `GET /v1/offerings/{id}/terms`.

**`documents/specs/member-registrations-ussd.md`** — no change; production gating already covers the notice.

The fallback also recommended: reword the round Goal to drop production config/backup/alerting/cutover (owner-gated; keep in Deferred), state that the panel render uses the event aggregate while `View terms` reuses the existing terms route, align the Q6 wording to include alias/maiden, and key the Simulator filtering to the production build flag so dev/test renders keep it.

## Mock sign-off

| Surface                    | Mock                                                    | sha256                                                             | Signer | Date       | Verdict |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| Active offerings — success | `mockups/mvp-hardening/01-active-offerings.png`         | `179a699ac98ef4e094e664071068b1f072f1033a8868c8e92f56f744078648bd` | Owner  | 2026-11-09 | signed  |
| Active offerings — empty   | `mockups/mvp-hardening/01-active-offerings-empty.png`   | `53ca19305b61b1a83e20abefe36359148b9f87487c43bf826e143eeb2cf4100b` | Owner  | 2026-11-09 | signed  |
| Active offerings — loading | `mockups/mvp-hardening/01-active-offerings-loading.png` | `18ff3275911961636233dc7a035d0f8cb9c8d202c227b0b04a7c8ba84b6eb9a4` | Owner  | 2026-11-09 | signed  |
| Active offerings — error   | `mockups/mvp-hardening/01-active-offerings-error.png`   | `099ba86be254965fdc6c3f5cda12c295fb8e23998ba46ea64f24dbe9b55fceb1` | Owner  | 2026-11-09 | signed  |
| Active offerings — dark    | `mockups/mvp-hardening/01-active-offerings-dark.png`    | `444f4830ecd5bdd5bae05be9c1d0e2dc6fc07fd3ae890b9907226065306e14d9` | Owner  | 2026-11-09 | signed  |
| Simulator hidden           | `mockups/mvp-hardening/02-simulator-hidden.png`         | `2a766b267419c838a2fb63a699509281b6167a9e9e05ab61479453dff4be35cd` | Owner  | 2026-11-09 | signed  |
| Simulator hidden — dark    | `mockups/mvp-hardening/02-simulator-hidden-dark.png`    | `cfd1d4f0838b76c8b252b79f2fe11a755bf0a18cb1098dcaa436f14d9f81286b` | Owner  | 2026-11-09 | signed  |

## Mock parity

Opens after sign-off. The parity pass compares the built event detail and the production USSD nav
against these mocks; any spec-required miss is reworked before the hardening commit. The mock is
advisory until this round is fully signed, per the policy.

## Verification

| Gate        | Command                                  | Result                                                       |
| ----------- | ---------------------------------------- | ------------------------------------------------------------ |
| Mock render | `node mockups/mvp-hardening/capture.mjs` | 7 PNGs captured; no page or console errors                   |
| Heights     | 1440 capture                             | active offerings 900 px; simulator hidden 900 px             |
| Data check  | success panel                            | 3 attached offerings (2 active, 1 expired) on the event meta |

gate-run 2026-11-09T11:20:54.269Z profile=fast steps=4/4 lines=4 bytes=514

## Deferred

- 24e complaints (`0018`) after this round and Headcount's mock.
- The protected-doc mock-policy amendment and the dashboard spec line (`0813` weekly limit).
- The giving trend series, Redis/aggregate materialisation.
- Release config/cutover actions until the owner names the production values and window.
