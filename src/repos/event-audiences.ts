import type { DbClient, Row } from '../db/sql.js';
import type { AudienceRule } from '../schemas/audiences.js';
import { parseAudienceRule } from './row-values.js';

/**
 * The event's ordered audience set, `event_audiences` being the only authority
 * for who an event is for (member-registrations-event-audience.md A-2a). The
 * first row is the primary, which orders the set and mirrors into the
 * `events.audience_id` revert shim; it carries no meaning of its own.
 */
export interface EventAudience {
  id: string;
  name: string;
  system: boolean;
  systemKey: string | null;
  rule: AudienceRule;
}

interface EventAudienceRow extends Row {
  event_id: string;
  audience_id: string;
  name: string;
  system: boolean;
  system_key: string | null;
  rule: unknown;
}

const SELECT_BY_EVENT = `
  select ea.event_id, ea.audience_id, a.name, a.system, a.system_key, a.rule
    from event_audiences ea
    join audiences a on a.id = ea.audience_id
   where ea.event_id = any($1::uuid[])
   order by ea.event_id, ea.sort_order, ea.audience_id`;

function toEventAudience(row: EventAudienceRow): EventAudience {
  return {
    id: row.audience_id,
    name: row.name,
    system: row.system === true,
    systemKey: row.system_key,
    rule: parseAudienceRule(row.rule),
  };
}

/** The audience sets of several events at once, ordered; a missing event has none. */
export async function eventAudiencesFor(
  db: DbClient,
  eventIds: readonly string[],
): Promise<Map<string, EventAudience[]>> {
  const ids = [...new Set(eventIds)];
  const result = new Map<string, EventAudience[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return result;

  const rows = await db.query<EventAudienceRow>(SELECT_BY_EVENT, [ids]);
  for (const row of rows) {
    result.get(row.event_id)?.push(toEventAudience(row));
  }
  return result;
}

/** One event's ordered audience set; empty when no writer has written it. */
export async function eventAudiences(db: DbClient, eventId: string): Promise<EventAudience[]> {
  return (await eventAudiencesFor(db, [eventId])).get(eventId) ?? [];
}

/** The rules of an ordered set, in primary-first order; the composition's input. */
export function audienceRules(audiences: readonly EventAudience[]): AudienceRule[] {
  return audiences.map((audience) => audience.rule);
}

/**
 * Replaces an event's audience set inside the caller's transaction. Every
 * writer of an event calls it with the primary first, so `event_audiences` stays
 * the only authority and the primary stays the first row.
 */
export async function replaceEventAudiences(
  db: DbClient,
  eventId: string,
  audienceIds: readonly string[],
): Promise<void> {
  await db.query('delete from event_audiences where event_id = $1', [eventId]);
  const unique = [...new Set(audienceIds)];
  for (const [index, audienceId] of unique.entries()) {
    await db.query(
      `insert into event_audiences (event_id, audience_id, sort_order)
       values ($1,$2,$3)`,
      [eventId, audienceId, index],
    );
  }
}
