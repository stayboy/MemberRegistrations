# V2 events, series and offerings mockup

**Status:** draft, 2026-11-03. **This is a throwaway prototype, not production code.**

The reference event is **Strategic Conference**: a standalone three-day event, Tuesday 13 to Thursday
15 October 2026, starting at **17:30**, in the **Main Auditorium**. It has three dated sessions,
attendance per date, and three offerings attached. The same screen also shows a Hybrid event, a
Virtual event and series-generated events, so the venue field is visible in context.

## What it demonstrates

- **Events** as a first-class dated instance, separate from the recurring `EventSeries` template.
  One event can span several dates; each date has its own attendance.
- **Venue** per event: `Auditorium`, `Virtual` or `Hybrid`, plus a venue name.
- **Series** with schedule versions, exceptions, occurrences and a per-series attendance/offering
  summary. Schedule edits add a version; exceptions are cancelled/extra dates.
- **Event detail** with per-date attendance, source (`import`/`manual`), attached offerings and stats.
- **Offerings** with kinds, optional custom names, expiry with the event or a later date, and pending
  pledges that survive expiry.
- **Offerings landing** with church totals, member totals, pledges, follow-up officers, reminders,
  visitors and a compact USSD preview.
- **Terms of reference** with a gateway payload preview; the payment gateway is future work.

## Screenshots

| File                       | State                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `01-events-list.png`       | Events across standalone and series-generated dates, venue badges, attendance, offerings |
| `02-event-detail.png`      | Strategic Conference: three dates, attendance per date, three offerings, stats           |
| `03-series-list.png`       | Recurring series with schedule, next occurrence, exceptions, status                      |
| `04-series-detail.png`     | Schedule versions, exceptions, occurrences, attendance/offering summary                  |
| `05-offerings-landing.png` | Church totals by member, pledges, reminders, USSD, visitors                              |
| `06-attendance-rows.png`   | Attendance rows for one event date, import/manual source                                 |
| `07-offering-terms.png`    | Offering terms of reference and gateway payload preview                                  |

## Run it

The prototype lives at `%TEMP%\opencode\v2-shell-mock`:

```powershell
cd $env:TEMP\opencode\v2-shell-mock
npm install
npm run dev
```

Useful review URLs:

- `http://localhost:5173/?section=events&sub=events`
- `http://localhost:5173/?section=events&sub=events&event=evt-2026-014`
- `http://localhost:5173/?section=events&sub=series`
- `http://localhost:5173/?section=events&sub=series&series=SER-1`
- `http://localhost:5173/?section=events&sub=offerings`
- `http://localhost:5173/?section=events&sub=events&event=evt-2026-014&dialog=attendance&date=2026-10-14`
- `http://localhost:5173/?section=events&sub=events&event=evt-2026-014&dialog=terms&offering=off-pledge`

## Decisions recorded

- Event = first-class dated instance with optional `seriesId`; `EventSeries` remains the recurring
  template. A standalone multi-day conference does not create a dummy series.
- Event fields include `eventNo`, name, `seriesId?`, ministry, timezone, start/end date, start/end
  time, **venue type (`auditorium`/`virtual`/`hybrid`)**, venue name, status and description.
- Storage is `event_instances` + `event_instance_dates`; the REST resource remains `/v1/events`.
  `event_instance_dates` carries each dated session; attendance is imported per event date.
- Attendance report is per event/date; the summary cannot be derived from the current per-member API
  alone.
- Visitors may give with name + phone and receive a receipt; no member record.
- Pledges require one active presbyter; USSD falls back to the member's shepherd, then the offering's
  default officer, and an admin can reassign.
- An offering can expire with the event or at a later date; expiry blocks new gifts, not honoring a
  pending pledge.
- USSD shows the current/next active event and a short offering list, not a long catalogue.
- Financial totals stay behind the connect gate; visitors are aggregated separately.

The spec is [`documents/specs/member-registrations-events-offerings.md`](../../specs/member-registrations-events-offerings.md).
The existing series/occurrence/import endpoints are implemented; the event aggregate and the offerings
API are proposed.
