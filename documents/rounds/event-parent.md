# Round — event as parent (B)

|                        |                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Status                 | CLOSED                                                                                                                                |
| Tier                   | 2 — Reviewed (spec and design; the migration and wire are gates)                                                                      |
| Mode                   | `attended`                                                                                                                            |
| Base                   | `a71a50e`                                                                                                                             |
| Review rounds          | 1                                                                                                                                     |
| Gate runs in parent    | 0                                                                                                                                     |
| Spec                   | `documents/specs/member-registrations-api.md`, `member-registrations-ui.md`, `member-registrations-events-offerings.md`               |
| Workers                | `single`                                                                                                                              |
| Implementer            | `worker ollama-cloud/deepseek-v4.1-flash:1017 (rounds 2-4); parent ollama-cloud/deepseek-v4.1-flash:1017 (spec and migration design)` |
| Verbs this round needs | `branch, commit, push, pr, merge, sync`                                                                                               |

## Grill

Mode: attended. The owner answered 2026-11-22, with Q7 agreed and Q6 made explicit: "event should carry
ministry (optional), presbyter only as series mock shows. all other as recommended."

❓ **Q1 — B's shape:** one `events` parent and one `event_occurrences` child for every date (B1), not the
composed parent (B2).
➡️ B1. Cost: a migration rekeying attendance, headcounts, offering counts, registration requests,
contributions and pledges, and a backfill of every standalone session.

❓ **Q2 — Identity and wire:** the parent carries `eventNo`; an occurrence is `(eventId, date)` with no
number; the per-instance number becomes a legacy alias; the import, USSD, contribution and pledge wires
move.
➡️ Parent `eventNo`. Cost: a wire-contract change (a named gate) across those call sites.

❓ **Q3 — Recurrence and generation:** the parent owns the schedule versions and exceptions; a create with
Repeats generates the first window atomically; `generate` stays a refresh.
➡️ Yes. Cost: the generation path, the first-window length, the idempotency.

❓ **Q4 — One date concept:** the JSONB `sessions` retire in favour of the occurrence rows.
➡️ Yes. Cost: the detail/list/attendance reads and the session backfill.

❓ **Q5 — Status and cancellation:** the parent `active | archived`; an occurrence `scheduled | held |
cancelled` with a note; a cancelled recurrence exception is the rule-level skip.
➡️ Yes. Cost: the list/detail status semantics.

❓ **Q6 — Parent-owned attributes:** ministry (optional), venue, times, `tracksMembers`, `presbyterOnly`.
The owner made the form explicit: the event add shows **Ministry (optional)** and **Presbyter only**, as
`mockups/v2-events/11-series-create.png` shows, and the parent owns them.
➡️ Yes. Cost: the event form gains ministry and presbyter-only; the inheritance copy disappears.

❓ **Q7 — The UI:** one **New event** with **Repeats**, one list row per event, one detail; the series form
and detail retire, their schedule/exceptions moving onto the event.
➡️ Agreed. Cost: the UI round, the mocks, the e2e, AC-51's series routes.

❓ **Q8 — Staging and gates:** four rounds — spec/design; migration/API; UI; downstream — with the
migration and the wire named as hard gates.
➡️ Four staged rounds. Cost: four gates; the owner names the migration and wire by round.

❓ **Q9 — A as fallback:** B is the target; A (one add UX over the split) only on an explicit reversal.
➡️ B. Cost: the split remains under A.

### Audience (second grill, 2026-11-22)

Q1 saved audience groups (not a per-event rule or a one-kind union); Q2 the constraint set — ministry,
presbyter, age band, gender, membership status, with a named list deferred; Q3 allOf/anyOf/noneOf; Q4 an
Admin Audiences page; Q5 the rule evaluated at the occurrence date for age with current ministry/presbyter;
Q6 the USSD visibility and the guardian; Q7 the API; Q8 with B; Q9 the seeds and the age ranges. The Q2
amendment adds **visitor status** and the three person kinds: **anonymous** (name+phone, no record), a
**registered visitor** (a member record with visitor status), and a **full member**. An anonymous giver can
be registered as a visitor and later promoted by an administrator; a visitor is evaluated only when the
rule names `visitor`.

### Offerings (third grill, 2026-11-22)

Q1 the **session offering** is the attachment unit; Q2 the recurrence default set plus per-session rows;
Q3 the terms version pinned per session; Q4 the money rows reference the session offering; Q5 the three
person kinds; Q6 session-first USSD and counts; Q7 the catalogue stays event-agnostic; Q8 the migration;
Q9 a **separate round after B**; Q10 the domain edges. The offerings are not part of this round; their spec
is drafted for that later round.

## Plan

Round 1 delivers the **amended specs and the migration/wire design**, no code.

- **API spec:** replace the `EventSeries` and `Event instance` sections with the event parent, its
  recurrence and its occurrences; rewrite FR-1 to FR-8; the wire table; the generation; the status.
- **UI spec:** one New event with Repeats (ministry optional, presbyter-only), one list row per event, one
  detail; the series form/detail retire; AC-51; AC-55-AC-57.
- **Events/offerings spec:** the list/detail/occurrence FRs; the series-as-activity row retires.
- **Migration and wire design:** the tables, the backfill, the rekey, the eventNo, the legacy aliases, the
  transition.

The path:

1. **Spec and design** (this round) — reviewed by `reviewer-pro:0813`, approved by the owner.
2. **Migration and API** — the schema, backfill and routes; the migration and wire gates executed.
3. **UI** — the one form/list/detail, the signed mocks, the e2e.
4. **Downstream** — the USSD activities, imports, contributions/pledges/offering counts/headcounts and the
   reports; the legacy aliases retire.

### Migration and wire design (round 1 outline)

- **Tables.** `events` (parent): `id, event_no, name, ministry_id?, presbyter_only, timezone, description,
venue_type, venue_name, start_time, end_time, tracks_members, status, archived_at`.
  `event_recurrence_versions` and `event_recurrence_exceptions` (from `series_schedules` and
  `series_exceptions`, keyed to `event_id`). `event_occurrences`: `id, event_id, date, start_time,
end_time, status, note, venue_type?` (from `event_instances`).
- **Identity.** The parent `event_no`; the occurrence has no number. A standalone event's existing
  `event_no` becomes the parent's; a series parent mints one. The old per-instance `event_no` is kept as
  `legacy_event_no` on the occurrence for the transition; the new wire addresses `(eventId, date)`.
- **Backfill.** A series row becomes an `events` parent (reusing the series id, so its links survive) with
  its schedule versions and exceptions as recurrence children; its generated `event_instances` become
  occurrences. A standalone instance becomes an `events` parent (reusing the instance id) and one
  occurrence per JSONB session; the session rows get ids, and the attendance, headcounts, offering counts
  and registration requests are rekeyed from `(event_instance_id, session_date)` to the occurrence id.
- **Contributions and pledges.** `eventId` resolves to the parent; `sessionDate` identifies the
  occurrence. The backfill maps a series occurrence's contribution from the instance id to the parent id.
- **Status.** The parent is `active | archived`; the occurrences carry the dated status; a cancelled
  recurrence exception generates no occurrence. The list's status pill is derived from the parent and its
  occurrences.
- **Wire.** `GET /v1/events` returns parents with their occurrences in the window; `POST /v1/events`
  accepts the parent fields, an optional recurrence and, when there is no recurrence, manual sessions;
  `POST /v1/events/generate` remains a refresh. `/v1/series` retires; `/v1/series/:id` aliases the parent
  read for a transition. The attendance, headcount, offering-count and import routes take the parent and
  the date, or the occurrence id.
- **UI routes.** `/events/series/new` and `/events/series/:id` retire (redirect to `/events/new` and the
  parent detail); `?kind=series` retires.

Acceptance for this round:

1. The three specs carry the decisions above, with no contradiction to the current contract left silent.
2. The migration design names the tables, the backfill, the rekey, the eventNo and the legacy aliases.
3. The spec review (`reviewer-pro:0813`) accepts the exact text.
4. The owner approves the amended spec; no migration or code lands in this round.
5. No user-visible surface in this round; mock sign-off `n/a`.

## Spec review

`deepseek-v4-pro:0813` (first choice; the owner's weekend rule makes Sunday off-peak all day), base
`a71a50e`, the uncommitted working tree. First pass **REWORK**: P1 `Everyone` was both `allOf []`
(vacuously true) and "active members"; P2 the parent/occurrence rekey of headcounts, offering counts and
registration requests was only in this round doc; P2 the three specs disagreed on the session-offering
columns; three nits. Fixed: `Everyone` is `allOf(membershipStatus active)`, every empty operator is `422`,
a visitor is evaluated only when the rule names `visitor`; the rekey is a new API-spec section with a
per-table source→target→index table and AC-39; the data models reconciled; the nits closed. Confirmation
**ACCEPT** with both judgement calls upheld (the visitor rule; the rekey scope). The later same-day
decisions — the first-time visitor rename, the Visitor Mode with the three existing buckets, the headcount
independent of the named attendance, and the standalone import lift — were confirmed by `0813` **ACCEPT**,
with two nits applied (the older change-log entries marked superseded; the Visitor Mode bucket-code
reconcile note).

## Review

The spec review is this round's gate (Tier 2; the code review is the migration round). A separate
`deepseek-v4-pro:0813` session read the exact text: REWORK, fixed, ACCEPT, then a confirmation ACCEPT after
the first-timer, Visitor Mode and standalone-import changes, with both nits applied.

Seat: consistent — spec author parent/worker `ollama-cloud/deepseek-v4.1-flash:1017`; reviewer
`ollama-cloud/deepseek-v4-pro:0813`.

## Verification

| Gate                 | Command                                                  | Result                                                |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Spec review          | `reviewer-pro:0813`                                      | ACCEPT (REWORK→fix→ACCEPT; later confirmation ACCEPT) |
| Format               | `npx prettier --check` on the five spec files            | pass                                                  |
| Mock catalogue guard | `npx vitest run tests/meta/mock-claims.test.ts`          | pass (after the AC alignment)                         |
| Protected-doc guard  | `npx vitest run tests/meta/protected-doc-review.test.ts` | pass — 7 tests, ten hashes                            |
| Fast gate            | `npm run verify:fast`                                    | pass — 4/4                                            |
| Code                 | none this round (spec, design and catalogue metadata)    | n/a                                                   |

gate-run 2026-11-22T19:56:42.621Z profile=fast steps=4/4 lines=4 bytes=703

## Git writes

`git-seat-budget: 12` (this round `1 branch + 2 commits + 1 push + 1 pr + 1 merge + 1 sync = 7 of 12`).

| Brief | Actor                 | Verb     | Variant                        | Reason                                             |
| ----- | --------------------- | -------- | ------------------------------ | -------------------------------------------------- |
| 1     | `git-executor rung 2` | `branch` | `ollama-cloud/mimo-v2.6-flash` | Cut `docs/event-parent` from `main`; rung 1 429    |
| 2     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | The spec round; the round doc is the record        |
| 3     | `git-executor rung 2` | `commit` | `ollama-cloud/mimo-v2.6-flash` | The protected mock-claims set and the 0813 records |
| 4     | `git-executor rung 2` | `push`   | `ollama-cloud/mimo-v2.6-flash` | Feature branch only                                |
| 5     | `git-executor rung 2` | `pr`     | `ollama-cloud/mimo-v2.6-flash` | PR against `main`                                  |
| 6     | `git-executor rung 2` | `merge`  | `ollama-cloud/mimo-v2.6-flash` | Only after `verify`, `ui` and `ui-e2e` are green   |
| 7     | `git-executor rung 2` | `sync`   | `ollama-cloud/mimo-v2.6-flash` | Post-merge pull                                    |

## Mock sign-off

n/a — the spec round; the UI round carries the mocks.

## Mock parity

n/a — no mock in this round.

## Acceptance

| #   | Criterion                                                                                               | Met | Evidence                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------- |
| 1   | The event parent/occurrence/recurrence, the wire and the UI routes are specified                        | yes | `member-registrations-api.md`; `member-registrations-ui.md`; `member-registrations-events-offerings.md` |
| 2   | The audience groups, the visitor status and the three person kinds are specified                        | yes | `member-registrations-event-audience.md`                                                                |
| 3   | The session offering is specified as a separate round after B                                           | yes | `member-registrations-session-offerings.md`                                                             |
| 4   | The migration/backfill/rekey design is in the API spec, with the migration and wire named as hard gates | yes | the API migration section; this round's Plan                                                            |
| 5   | The spec review (`reviewer-pro:0813`) accepts the exact text                                            | yes | `## Spec review` above                                                                                  |
| 6   | The owner approves the amended spec                                                                     | yes | owner approval 2026-11-22                                                                               |
| 7   | No migration, code or mock lands in this round                                                          | yes | `git status` / the diff                                                                                 |

Verdict: **ACCEPTED**.

## Deviations

- **`to-spec` with no issue tracker.** The repo deliberately has no tracker (AGENTS.md §13); the two feature
  specs live under `documents/specs/` with a `Status` line, not a GitHub issue or label.
- **The spec's AC changes renumbered and rewrote the UI/events ACs**, so the tracked mock catalogues were
  aligned in the same round: `v2-events` quotes and slices moved to the current ACs, the retired series
  form's surface/story/entry/state were removed, the standalone-import entry flipped to PRESENT, and the
  pre-change list/form/detail states are now `target` — the owner's signature is void through `target`, and
  the round-3 re-cut is in the backlog. `headcount` narrowed its pattern to the headcount page's own ACs.
- **The mock-claim catalogues are protected (owner, 2026-11-22).** `AGENTS.md` §10a, the policy and the
  guard add `documents/mock-claims/*.json`; the ten hashes are recorded after the `0813` review — ACCEPT,
  with one P2 (the AC-5 e2e test name is stale against the merged detail; the test resolves and the rename
  is the round-3 item) and the gaps recorded: the `reference` coverage value is undocumented; the
  owner-signed coverage versus the reviewer-gated catalogue file should be stated; the glob is JSON-only;
  and the auto-signed states await the reviewer second look at the unattended close.
- **Worker judgement calls, reviewed and upheld:** `Visitors only` as a seed; `Everyone` =
  `allOf(membershipStatus active)` and a visitor evaluated only when the rule names it; `membership_status`
  with `archived` derived; the `visitor_identities(phone_hash → member)` link and the anonymous history
  preserved; the direct guardian edge; gender `male|female`; `startDate`/`endDate` derived, no stored range;
  the legacy `ministry`/`presbyterOnly` read-only projections refused on write; the members list
  active-default; the USSD regularity window unchanged; the session-less pledge redemption rule; the
  `sessions[]` summary addition as a later wire gate; the migration reporting (not re-attributing) a gift
  with no session offering; no migration number reserved; the mock reading of the one Audience picker.
- **Settled by the owner's grill (2026-11-22):** the standalone attendance import is **lifted** — a
  standalone occurrence imports like a recurring one, the audience is the expected and not a gate, a
  registered visitor may hold a row, and a first-time visitor is counted only by the headcount's Visitor
  Mode. The `422 series_required` restriction retires; the change lands with the downstream round.
- **The offerings spec is drafted but is a separate round after B.** The B spec corrects “the offerings
  attach to the parent” to the session model and points at that spec.
