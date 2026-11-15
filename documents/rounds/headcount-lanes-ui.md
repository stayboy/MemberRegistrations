# Round - headcount-lanes-ui

|                     |                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status              | OPEN                                                                                                                                                               |
| Tier                | 2 - Reviewed                                                                                                                                                       |
| Mode                | unattended (auto-accept recommendations)                                                                                                                           |
| Base                | `9990ae2`                                                                                                                                                          |
| Review rounds       | 1 - Tier 2 code review ACCEPTED, then one P2 pass                                                                                                                  |
| Gate runs in parent | 3                                                                                                                                                                  |
| Spec                | `documents/specs/member-registrations-headcount.md` HC-3, HC-8, HC-13, HC-16 to HC-18, HC-26; `member-registrations-ussd.md` headcount block                       |
| Workers             | `single`                                                                                                                                                           |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (integration, gate, round doc, captures); worker ollama-cloud/deepseek-v4.1-flash:1017 (USSD entries, lane UI, tests) |

## Plan

The model has lanes; the surfaces still show one. This round gives the USSD phone its four entries and the
portal its lane rows.

Scope:

- **USSD**: `Visitors` and `Presbyters` become their own entries in the headcount menu (HC-26), each opening
  the count flow for that mode with its three-number line; the two ordinary modes keep the remembered mode.
- **Portal**: `UssdHeadcountPage` renders one row per recorded lane - mode label, count, `asOf`, recorder -
  instead of a single current, and offers `Correct` on every lane.
- **Tests**: USSD machine and glossary cases for the four entries, page render tests for several lanes, and
  e2e for a second lane's Correct.

The mock captures and the deferred grid-header drift are the follow-up pass in this same round, after the
code review.

Acceptance criteria:

1. The phone offers four headcount entries and each opens its own mode's prompt.
2. A session with adults and children shows both rows, each with its own `asOf` and recorder.
3. `Correct` is offered on every recorded lane.
4. A legacy `mixed` observation is readable in the portal history and is not offered on the phone.
5. `npm run verify`, `npm run ui:test` and `npm run ui:e2e` pass.

## Verification

| Gate          | Command                                       | Result                                     |
| ------------- | --------------------------------------------- | ------------------------------------------ |
| USSD unit     | `tests/unit/ussd-headcount.test.ts`           | 4 cases: entries, prompts, memory, buckets |
| API           | `tests/api/ussd-attendance.test.ts`           | 1 added: visitors and presbyters lanes     |
| Portal render | `ui/src/pages/ussd/headcount.render.test.tsx` | 5 added: lanes, absence, mixed read-only   |
| e2e           | `ui/e2e/headcount.spec.ts`                    | 1 added: two lanes, correct the second     |
| Full gate     | `npm run verify`                              | 7/7; 796 passed, 6 skipped, 56 files       |
| UI            | `npm run ui:test` / `npm run ui:e2e`          | 448 / 69                                   |

gate-run 2026-11-14T23:31:11.181Z profile=full steps=7/7 lines=7 bytes=854

## Mock sign-off

| Surface           | Mock                                     | sha256                                                             | Signer | Date       | Verdict |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------ | ------ | ---------- | ------- |
| `/ussd/headcount` | `mockups/headcount/10-capture-state.png` | `c58d01e70e6936e6f0d866931642627c5e6798a1fed5ea902ad190ca9c44f5ba` | owner  | 2026-11-14 | signed  |

The state is signed but **now stale**: this round changes the headcount surface (four entries on the
phone, one row per lane on the portal), so the pictures no longer depict it. The capture pass follows
immediately and the owner re-signs the refreshed hashes; until then the catalogue records what was signed,
not what the surface now shows. That is deliberate - a refreshed image must not inherit a signature.

Mock coverage: claimed 0 · e2e-only 2 · deferred 0 · prose 1

## Mock parity

n/a until the capture pass.

## Review

Tier 2. The worker (`ollama-cloud/deepseek-v4.1-flash:1017`) built the four entries, the lane rows and the
tests; the parent amended the USSD spec, froze the diff and ran the gates; the reviewer seat is independent.

**Code review - ACCEPTED**, no blocking findings. It confirmed the specialised entries are reached only from
the headcount menu with no nested path, the ordinary-mode memory is untouched by them **and tested**, the
bucket map matches the reference codes with no cross-lane posting through the phone, the portal rows come
from the one `current` map rather than a second request, and the e2e case proves lane independence end to
end (it corrects children and asserts the adults `asOf` and count are unchanged).

It raised three P2s, all fixed before landing:

1. HC-8 and HC-13 named the buckets `elders`/`deacons` (plural) while the reference codes are singular;
   the spec tables now use `elder`, `deaconess`, `deacon`.
2. The USSD glossary omitted `prompt.headcount_adults`, `prompt.headcount_children` and
   `label.last_mode`, and still listed the retired `headcount.mixed_service`; the rows are added and the
   retired row removed, matching the code.
3. The phone's saved screen uses reference labels ("Visitor men") where the pre-save confirm uses lay terms
   ("Male, Female, Children"). **Decision: the confirm line keeps lay terms** because it restates what the
   operator typed; the saved screen keeps the reference labels because it is the register's vocabulary. Both
   name the mode, so neither is ambiguous.

Seat: consistent - the Implementer row matches the split the reviewer read.

## Acceptance

**ACCEPTED.**

| #   | Criterion                                                         | Met | Evidence                                                              |
| --- | ----------------------------------------------------------------- | --- | --------------------------------------------------------------------- |
| 1   | The phone offers four entries, each opening its own mode's prompt | yes | `tests/unit/ussd-headcount.test.ts` - entries, prompts, memory        |
| 2   | Two lanes show both rows, each with its own `asOf` and recorder   | yes | `headcount.render.test.tsx`; `ui/e2e/headcount.spec.ts`               |
| 3   | `Correct` is offered on every recorded lane                       | yes | render case; the e2e corrects the second lane                         |
| 4   | Legacy `mixed` readable in the portal, not offered on the phone   | yes | `Mixed (retired)` render case; the menu test asserts no `mixed` entry |
| 5   | `verify`, `ui:test` and `ui:e2e` pass                             | yes | gate-run line above; 448 UI tests; 69 e2e                             |

## Deviations

- **The USSD spec was amended in this round.** It said the screen "shows the current count per mode", which
  reads as a four-row summary; the phone opens a menu and shows one lane at a time, which is what HC-26
  wants. The passage now describes the menu, and records that a specialised entry does not touch the
  ordinary-mode memory.
- **The phone's saved screen uses reference labels, the confirm line lay terms.** Deliberate: the confirm
  restates the typed numbers, the saved screen belongs to the register's vocabulary.
- **The gate found a migration race, and it rides in this round.** CI failed with `relation "pledges" already
exists`: four pooled suites call `migrate()` on one `TEST_DATABASE_URL` in parallel workers, so each
  created the ledger, saw it empty and started from `0001`. `migrate()` now takes a transaction-scoped
  advisory lock per version, re-reads the ledger inside the transaction and skips what another migrator
  applied; the ledger creation is locked too, because two `create table if not exists` calls collide before
  any per-version lock exists. With the race gone a second, older fault surfaced: the pooled suites were
  never isolated, and `series-summary`'s seeded contribution landed inside `offerings-summary`'s window, so
  each pooled suite now owns a scratch database. Two tests were added and both fail against the old
  `migrate()`. Neither fault is the round's subject, but a red required check is fixed forward, not merged
  around.
- **The mock captures follow in the capture pass**, together with the deferred grid-header drift; this round
  changes the surface, so the pictures must be regenerated before they are signed again.
