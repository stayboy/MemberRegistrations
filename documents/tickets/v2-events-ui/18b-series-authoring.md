# 18b: Series authoring

**Tier:** 2

**What to build:** The authoring half of FR-42 that ticket 18 deliberately left out: create a series,
edit its identity, and archive or restore it. Schedule versions and exceptions already ship in 18.

**Blocked by:** 18 (series list and detail).

**Status:** ready-for-agent

- [ ] A new series is created with a name, optional ministry, timezone, description and first schedule version (`effectiveFrom`, `rrule`, optional `endsOn`), and appears in the list.
- [ ] Editing changes name, ministry, timezone and description; `code`-style identity fields are not offered.
- [ ] Archiving and restoring use the update endpoint's `archived` flag, with confirmation, and the detail becomes read-only while archived.
- [ ] Validation: a required name, a non-empty `rrule`, an `effectiveFrom` on or before `endsOn`, and a timezone from the existing set.
- [ ] Mutations invalidate the series list and detail; no hard delete is offered anywhere.
- [ ] The screens match the local `mockups/v2-events/03-series-list.png` and `04-series-detail.png` at the recorded viewport (git-ignored; regenerate locally).

**Timezone decision:** the timezone `Dropdown` offers a short practical list plus an **Other** free-text
path, so a church outside that list can submit an off-list IANA zone and have it round-trip unchanged.
The create form defaults to the church's local zone (`Africa/Lagos`); the API's default when
`timezone` is omitted is `UTC`.
