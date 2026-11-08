# 24e: USSD complaints and the admin queue

**Tier:** 2

**Status:** deferred — parked by the owner on 2026-11-07 for a later round; not scheduled

**What to build:** A member-only USSD complaints flow with four types, plus the admin queue that views
and resolves them. The basic V3 features (22–24d and 23) are delivered; the owner parked this ticket
for a later round rather than opening the last V3 round. The shape below is the settled grill record,
still not authorised for build.

- **Menu.** A top-level `Complaints` entry opens `1 Change of Profile`, `2 General Report`,
  `3 Activities` (event / event day) and `4 Offerings`. `8 My complaints` shows the member's last three
  as `reference · type · status · date`, read-only. The anonymous menu is unchanged.
- **Member-only.** Filing requires the identified member; anonymous callers cannot file.
- **Change of Profile.** One free-text request (max 80), for example a name, age or gender correction.
  Nothing auto-applies: the complaint stores the text, and staff apply the change through the existing
  version-guarded member update.
- **General Report.** One free-text report (max 80).
- **Activities.** Pick an event from the last 30 days plus this week (most recent first, five plus
  `0 More`), then pick a session day by number, or press `8` and type `DDMMYYYY` for that event; `0`
  records a whole-event complaint. A typed date must be one of the event's sessions.
- **Offerings.** Pick a recent event (same 30-day window), then one of its offerings. No contribution
  or payment is required; the complaint stores the event and offering.
- **Length.** Every typed complaint field is 1-80 Unicode characters after trimming. The server rejects
  over-length with `422 validation_error`, USSD says "max 80 characters" and re-prompts once without
  truncating; a DB check enforces the same bound.
- **Duplicates.** Same member, same type, same target and same text within 24 hours returns the existing
  reference and creates no second row; different text creates a new complaint.
- **Data.** `complaints`: `id`, `reference` unique (`CMP-000123`), `member_id`, `type`
  (`profile_change`/`general`/`event`/`offering`), nullable `event_instance_id`, `session_date`,
  `offering_id`, `message` (80), `status` (`open`/`in_review`/`resolved`/`rejected`, default `open`),
  `resolution_note` (max 500), `handled_by`, `handled_at`, timestamps. Migration: **the next free number
  when the round starts (expected 0017)**.
- **Admin.** `GET /v1/complaints` (filter by type, status, member, date), `GET /v1/complaints/{id}` and
  `PATCH /v1/complaints/{id}` (status + resolution note). The queue adds the **Complaints** page to the
  24d USSD section with a list, filter, detail and resolve action. The member record is changed only
  through the existing `PATCH /v1/members/{memberNo}`.
- **Gates.** The migration (expected 0017) and the wire-contract additions need their own explicit owner
  authorisation when this round starts; this deferred ticket does not pre-authorise them.

**Blocked by:** nothing outstanding — 22, 24a, 24b, 24c, 24d and 23 are delivered. The ticket waits on
the owner scheduling a later round (and, at that point, naming the migration and wire-route gates).
