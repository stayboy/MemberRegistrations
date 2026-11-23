import type { Db } from '../../src/db/sql.js';

export interface SeedSession {
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  status?: string;
  note?: string | null;
  venueType?: string | null;
}

export interface SeedEventInput {
  /** Reuse an existing parent (for example the id a series route returned). */
  eventId?: string;
  eventNo?: string | null;
  name: string;
  timezone?: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  venueType?: 'auditorium' | 'virtual' | 'hybrid';
  venueName?: string | null;
  status?: 'draft' | 'scheduled' | 'held' | 'cancelled' | 'archived';
  source?: 'series' | 'manual' | 'import';
  ministryCode?: string | null;
  presbyterOnly?: boolean;
  tracksMembers?: boolean;
  sessions: SeedSession[];
  /**
   * Mark the parent as series-backed. The tests that only need the import and
   * member-attendance gates use this instead of driving the series API.
   */
  series?: boolean;
}

export interface SeededEvent {
  eventId: string;
  /** Occurrence id by YYYY-MM-DD. */
  occurrenceIds: Record<string, string>;
}

async function audienceFor(
  db: Db,
  ministryCode: string | null,
  presbyterOnly: boolean,
): Promise<string> {
  if (!ministryCode) {
    const [audience] = await db.query<{ id: string }>(
      'select id from audiences where system_key = $1',
      [presbyterOnly ? 'presbyters' : 'everyone'],
    );
    return audience!.id;
  }

  const [ministry] = await db.query<{ id: string; code: string; name: string }>(
    'select id, code, name from ministries where lower(code) = lower($1)',
    [ministryCode],
  );
  if (!ministry) throw new Error(`No ministry ${ministryCode}`);

  const systemKey = presbyterOnly
    ? `legacy:${ministry.code}:presbyters`
    : `ministry:${ministry.code}`;
  const [existing] = await db.query<{ id: string }>(
    'select id from audiences where system_key = $1',
    [systemKey],
  );
  if (existing) return existing.id;

  const rule = presbyterOnly
    ? {
        operator: 'allOf',
        clauses: [
          { attribute: 'ministry', ministryCode: ministry.code },
          { attribute: 'presbyter', value: true },
        ],
      }
    : {
        operator: 'allOf',
        clauses: [{ attribute: 'ministry', ministryCode: ministry.code }],
      };
  const [created] = await db.query<{ id: string }>(
    `insert into audiences (name, system, system_key, active, rule, created_by, updated_by)
     values ($1,$2,$3,true,$4::jsonb,'seed','seed')
     returning id`,
    [
      presbyterOnly ? `${ministry.name} · Presbyters` : ministry.name,
      !presbyterOnly,
      systemKey,
      JSON.stringify(rule),
    ],
  );
  return created!.id;
}

/**
 * Seed one event parent and its occurrences directly. It mirrors what the
 * repository writes, so a fixture stays a fixture: the route under test still
 * runs its own path.
 */
export async function seedEvent(db: Db, input: SeedEventInput): Promise<SeededEvent> {
  const ministryCode = input.ministryCode ?? null;
  const presbyterOnly = input.presbyterOnly ?? false;
  const [ministry] = ministryCode
    ? await db.query<{ id: string }>('select id from ministries where lower(code) = lower($1)', [
        ministryCode,
      ])
    : [];
  const audienceId = await audienceFor(db, ministryCode, presbyterOnly);
  const archived = input.status === 'archived';
  const draft = input.status === 'draft';
  const parentStatus = draft ? 'draft' : archived ? 'archived' : 'active';

  const [event] = input.eventId
    ? await db.query<{ id: string }>(
        `update events
            set event_no = coalesce($2, event_no),
                name = $3,
                audience_id = $4,
                ministry_id = $5,
                presbyter_only = $6,
                timezone = $7,
                description = $8,
                venue_type = $9,
                venue_name = $10,
                start_time = $11,
                end_time = $12,
                tracks_members = $13,
                status = $14,
                archived_at = $15
          where id = $1
          returning id`,
        [
          input.eventId,
          input.eventNo ?? null,
          input.name,
          audienceId,
          ministry?.id ?? null,
          presbyterOnly,
          input.timezone ?? 'UTC',
          input.description ?? null,
          input.venueType ?? 'auditorium',
          input.venueName ?? null,
          input.startTime ?? null,
          input.endTime ?? null,
          input.tracksMembers ?? true,
          parentStatus,
          archived ? new Date().toISOString() : null,
        ],
      )
    : await db.query<{ id: string }>(
        `insert into events (
           event_no, name, audience_id, ministry_id, presbyter_only, timezone, description,
           venue_type, venue_name, start_time, end_time, tracks_members, status, archived_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         returning id`,
        [
          input.eventNo ?? null,
          input.name,
          audienceId,
          ministry?.id ?? null,
          presbyterOnly,
          input.timezone ?? 'UTC',
          input.description ?? null,
          input.venueType ?? 'auditorium',
          input.venueName ?? null,
          input.startTime ?? null,
          input.endTime ?? null,
          input.tracksMembers ?? true,
          parentStatus,
          archived ? new Date().toISOString() : null,
        ],
      );
  const eventId = event!.id;

  const occurrenceIds: Record<string, string> = {};
  for (const session of input.sessions) {
    const status = draft
      ? 'scheduled'
      : input.status === 'cancelled'
        ? 'cancelled'
        : (session.status ?? 'scheduled');
    const [occurrence] = await db.query<{ id: string }>(
      `insert into event_occurrences (
         event_id, date, start_time, end_time, status, note, venue_type
       ) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (event_id, date) do update
         set start_time = excluded.start_time,
             end_time = excluded.end_time,
             status = excluded.status,
             note = excluded.note,
             venue_type = excluded.venue_type
       returning id`,
      [
        eventId,
        session.date,
        session.startTime ?? input.startTime ?? null,
        session.endTime ?? input.endTime ?? null,
        status,
        session.note ?? null,
        session.venueType ?? null,
      ],
    );
    occurrenceIds[session.date] = occurrence!.id;
  }

  if (input.series) {
    const dates = input.sessions.map((session) => session.date).sort();
    const first = dates[0] ?? input.startDate;
    const last = dates[dates.length - 1] ?? input.endDate;
    await db.query(
      `insert into event_recurrence_versions (
         event_id, effective_from, rrule, ends_on, created_by
       ) values ($1,$2,'FREQ=DAILY',$3,'seed')
       on conflict (event_id, effective_from) do nothing`,
      [eventId, first, last],
    );
  }

  return { eventId, occurrenceIds };
}

/** The occurrence id for an event and date; a fixture helper, not a write path. */
export async function occurrenceId(db: Db, eventId: string, date: string): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    'select id from event_occurrences where event_id = $1 and date = $2',
    [eventId, date],
  );
  if (!row) throw new Error(`Event ${eventId} has no occurrence on ${date}`);
  return row.id;
}
