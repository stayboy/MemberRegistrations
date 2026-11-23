import type { DbClient } from '../db/sql.js';

/**
 * The shared session close: one close per occurrence, derived from any ended
 * capture — an import batch or a headcount observation. There is no
 * session-close table; this predicate is the one place both channels read it.
 * The caller still names the event and session date; the occurrence resolves
 * them to the parented child.
 */
export async function sessionIsClosed(
  db: Pick<DbClient, 'query'>,
  eventId: string,
  sessionDate: string,
): Promise<boolean> {
  const [row] = await db.query<{ closed: boolean }>(
    `select exists (
              select 1 from import_batches b
               join event_occurrences o on o.id = b.occurrence_id
               where b.kind = 'attendance'
                 and o.event_id = $1
                 and o.date = $2
                 and b.ended
            ) or exists (
              select 1 from event_session_headcounts h
               join event_occurrences o on o.id = h.occurrence_id
               where o.event_id = $1
                 and o.date = $2
                 and h.ended
            ) as closed`,
    [eventId, sessionDate],
  );
  return row?.closed === true;
}
