# Round - members-atoms-and-adoption

|                     |                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Status              | OPEN                                                                                                                         |
| Tier                | 1 - Plan                                                                                                                     |
| Mode                | unattended (auto-accept recommendations)                                                                                     |
| Base                | `4237415`                                                                                                                    |
| Review rounds       | 0                                                                                                                            |
| Gate runs in parent | 1                                                                                                                            |
| Spec                | `documents/specs/member-registrations-ui.md` AC-11a, AC-41, AC-47, AC-50; the triage in `documents/rounds/ui-mock-parity.md` |
| Workers             | `single`                                                                                                                     |
| Implementer         | parent ollama-cloud/deepseek-v4.1-flash:1017 (mock markup, capture, catalogues, round doc)                                   |

## Plan

Two corrections the owner's rulings forced.

**The four atoms.** The previous round rebuilt the Members mock from the build and dropped four atoms
the triage had adjudicated. The amended rule - _an atom leaves a mock only through a recorded `retire`_ -
puts them back, and the one atom that genuinely retires names its evidence.

| Atom                    | Disposition | Evidence                                                                                                                                  |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Import attendance       | **retire**  | the verb id exists only in `EventDetailPage.tsx:122` and `SeriesDetailPage.tsx:218`; the Members page declares `add-member` and `refresh` |
| Include archived switch | adopt       | triage: "replaces the Active status dropdown"                                                                                             |
| Ministries filter       | queue       | triage: needs a filter on `GET /v1/members`                                                                                               |
| Prev/Next paging        | adopt       | triage: "shipped footer has no paging controls"                                                                                           |
| Row overflow menu       | adopt       | triage: "the shipped open-link icon is the only action"                                                                                   |
| Identity `(F, 34y)`     | adopt       | AC-11a, and the owner's "adopt identity"                                                                                                  |

**The eighteen adopted captures.** Screens with no HTML source were invisible to the catalogue, which
is how their atoms could vanish unnoticed. On the owner's ruling they are now registered as design
records: the features are expected, some were built conversationally, and a round doc may carry the
evidence.

### Scope

- `documents/mock-claims/v2-shell.json` - a `members-list` surface (AC-11a, AC-41, AC-47, AC-50), four
  spec-required entries, four `mock-only` entries for the adopted atoms, and nine adopted states.
- `documents/mock-claims/v2-events.json`, `v2-imports.json`, `v2-settings.json` - nine adopted states.
- `mockups/v2-shell/01-shell-expanded-light.html` - the toolbar switch and ministries filter, the Prev
  control, and the row overflow menu.

Acceptance criteria:

1. The Members grid shows `FullName (F, 34y)` per AC-11a.
2. The four adopted atoms are drawn and recorded as `mock-only`, so parity does not demand the build
   match them yet.
3. `Import attendance` is absent, and the reason is a specification rather than a lesson.
4. Every adopted capture is a catalogue state with its hash and a signature.
5. The catalogue validates; no state is stale.
6. `npm run verify` passes.

## Verification

| Gate             | Command                                                         | Result                                            |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Shell guard      | `node scripts/mock/shell-check.mjs`                             | 20/20 carry the shell                             |
| Catalogue guard  | `npx vitest run tests/meta/mock-claims.test.ts`                 | 77 passed                                         |
| Auto-sign        | `node scripts/mock/sign-unattended.mjs --list <all seven sets>` | 0 to sign, 54 unchanged, 0 stale                  |
| Catalogue census | `states 54 · signed 15 · auto-signed 32 · other 7`              | every state carries a signature or is a reference |

gate-run 2026-11-15T12:47:09.887Z profile=full steps=7/7 lines=7 bytes=1054

## Mock sign-off

All auto-signed for this unattended stretch (AGENTS.md section 17), listed for the reviewer's second
look. The five Members states were re-cut after the previous signature; the eighteen are adopted
captures that carried no catalogue entry at all until now.

| Set / state                                                                                                                                                                                        | sha256                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `v2-shell/01-shell-expanded-light`                                                                                                                                                                 | `4bfb188864b316e6df431bf786618896d03783a07f4e082055f1d6851cff3cae` |
| `v2-shell/02-shell-collapsed-light`                                                                                                                                                                | `bebed85e8f90cc3d333701cff3e30764ed216c89600b3ecea0a66cb59ddeaf24` |
| `v2-shell/03-shell-expanded-dark`                                                                                                                                                                  | `cf5c356b463cd86dd3385c5620015743cedb187d8a9c907ad2258a71e18e3f05` |
| `v2-shell/05-meadow-accent`                                                                                                                                                                        | `3ca688ee3a6698c0c23a89433f1df8782c8fb0a86b7804017888a8581161cb16` |
| `v2-shell/06-mobile`                                                                                                                                                                               | `6e51a14153eb55e5befe961375610d174e87dc48f745fc7fd819de5794252190` |
| `v2-shell/07-shepherding-officers`, `09-shepherding-report`, `10-members-refined`, `11-add-member`, `12-subscriptions`, `13-add-subscription`, `14-add-coverage`, `16-contacts`, `17-find-contact` | adopted; hashes in `v2-shell.json`                                 |
| `v2-events/01-events-list`, `02-event-detail`, `03-series-list`, `05-offerings-landing`, `06-attendance-rows`, `07-offering-terms`                                                                 | adopted; hashes in `v2-events.json`                                |
| `v2-imports/01-members-import`                                                                                                                                                                     | adopted; hash in `v2-imports.json`                                 |
| `v2-settings/02-date-time-sidebar`, `02b-display-menu`                                                                                                                                             | adopted; hashes in `v2-settings.json`                              |

Mock coverage: claimed 4 · e2e-only 5 · deferred 1 · prose 0 (Members list and shell surfaces).

The adopted captures carry **no claims yet**: they are recorded so they can be triaged and re-cut, not
so parity can pass against them. None has an HTML source, so none can be shell-checked or refreshed
until it is rebuilt - which is the next round's work.

## Mock parity

| Surface            | States | Claimed | e2e-only | Deferred | Probe    |
| ------------------ | ------ | ------- | -------- | -------- | -------- |
| shell              | 5      | 1       | 5        | 1        | advisory |
| members-list       | 5      | 4       | 0        | 0        | full     |
| shepherding-roster | 1      | 0       | 1        | 0        | n/a      |

## Acceptance

| #   | Criterion                                    | Verdict  | Evidence                                                                 |
| --- | -------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| 1   | Identity reads `FullName (F, 34y)`           | ACCEPTED | the captured grid; `ML-IDENTITY` claims it against AC-11a                |
| 2   | Four atoms drawn and labelled mock-only      | ACCEPTED | `ML-ARCHIVED-SWITCH`, `ML-MINISTRIES-FILTER`, `ML-PAGING`, `ML-ROW-MENU` |
| 3   | `Import attendance` absent, on spec evidence | ACCEPTED | the verb grep in the table above                                         |
| 4   | Every adopted capture is a signed state      | ACCEPTED | `auto-signed: 18 · unchanged: 14 · 0 stale`                              |
| 5   | Catalogue validates, nothing stale           | ACCEPTED | 77 passed; `0 to sign, 54 unchanged, 0 stale`                            |
| 6   | `npm run verify` passes                      | ACCEPTED | gate-run signature above                                                 |

## Deviations

- Tier 1: mock markup, capture and catalogue data; no `src/` or `ui/src/` change.
- The adopted captures are signed but unverified: they have no source and no claims. That is the point
  of adopting them - they are now visible debt rather than invisible design.
- The four adopted atoms are `mock-only`, so the parity probe does not ask the build to match them. When
  one is built, its entry moves to `spec-required` in the round that builds it.
