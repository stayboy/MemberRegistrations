import type { DbClient } from '../db/sql.js';

/**
 * The shared session close: one close per (event, session), derived from any
 * ended capture — an import batch or a headcount observation. There is no
 * session-close table; this predicate is the one place both channels read it.
 */
export async function sessionIsClosed(
  db: Pick<DbClient, 'query'>,
  eventId: string,
  sessionDate: string,
): Promise<boolean> {
  const [row] = await db.query<{ closed: boolean }>(
    `select exists (
              select 1 from import_batches
               where kind = 'attendance'
                 and event_instance_id = $1
                 and session_date = $2
                 and ended
            ) or exists (
              select 1 from event_session_headcounts
               where event_instance_id = $1
                 and session_date = $2
                 and ended
            ) as closed`,
    [eventId, sessionDate],
  );
  return row?.closed === true;
}
