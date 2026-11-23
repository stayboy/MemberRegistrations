import type { Db, DbClient, Row } from '../db/sql.js';
import { NotFoundError, SessionClosedError, ValidationError } from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import { assertDate } from '../domain/contacts.js';
import { todayIn } from '../domain/series.js';
import { sessionIsClosed } from './captures.js';

/** A lane that accepts a new observation. `mixed` is retired and read-only. */
export const HEADCOUNT_MODES = ['adults', 'children', 'visitors', 'presbyters'] as const;
export type HeadcountMode = (typeof HEADCOUNT_MODES)[number];

/** A lane that can be read, including the retired `mixed` lane for legacy rows. */
export const HEADCOUNT_READ_MODES = [...HEADCOUNT_MODES, 'mixed'] as const;
export type HeadcountReadMode = (typeof HEADCOUNT_READ_MODES)[number];

export interface HeadcountLine {
  code: string;
  /** Joined from the mode's bucket reference row. */
  label: string;
  count: number;
}

export interface Headcount {
  id: string;
  eventId: string;
  sessionDate: string;
  asOf: string;
  mode: HeadcountReadMode;
  total: number;
  /** True when this observation ended the session for every lane. */
  ended: boolean;
  recordedBy: string;
  recordedAt: string;
  supersedesId: string | null;
  /** Derived from the unique row whose supersedesId points at this observation. */
  supersededBy: string | null;
  /** The non-zero buckets of this observation, in the mode's declared order. */
  lines: HeadcountLine[];
}

/** The current observation per lane; `mixed` appears only when the session has legacy rows. */
export type HeadcountCurrent = Partial<Record<HeadcountReadMode, Headcount | null>>;

export interface HeadcountPage {
  sessionDate: string;
  current: HeadcountCurrent;
  observations: Headcount[];
}

export interface HeadcountLineInput {
  code: string;
  count: number;
}

export interface RecordHeadcountInput {
  sessionDate: string;
  mode: HeadcountMode;
  /** A subset of the mode's buckets; an all-zero or empty set writes no lines. */
  lines: HeadcountLineInput[];
  asOf?: string;
  supersedesId?: string;
  /** True closes the session; a headcount never ends automatically. */
  ended?: boolean;
}

interface HeadcountRow extends Row {
  id: string;
  event_id: string;
  occurrence_id: string;
  session_date: unknown;
  as_of: Date | string;
  mode: string;
  total: number;
  ended: boolean;
  recorded_by: string;
  recorded_at: Date | string;
  supersedes_id: string | null;
  lines: unknown;
}

interface BucketRow extends Row {
  code: string;
  label: string;
  sort_order: number;
}

const COLUMNS = `h.id, o.event_id, h.occurrence_id, h.session_date, h.as_of, h.mode,
  h.total, h.ended, h.recorded_by, h.recorded_at, h.supersedes_id,
  coalesce((
    select jsonb_agg(
             jsonb_build_object('code', l.bucket_code, 'label', b.label, 'count', l.count)
             order by b.sort_order, l.bucket_code
           )
      from headcount_lines l
      join headcount_buckets b on b.mode_code = l.mode_code and b.code = l.bucket_code
     where l.headcount_id = h.id
  ), '[]'::jsonb) as lines`;

const FROM_OCCURRENCE =
  'from event_session_headcounts h join event_occurrences o on o.id = h.occurrence_id';

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseLines(value: unknown): HeadcountLine[] {
  return parseJsonArray(value)
    .map((entry) => entry as Partial<HeadcountLine>)
    .filter(
      (line): line is HeadcountLine =>
        typeof line.code === 'string' &&
        typeof line.label === 'string' &&
        typeof line.count === 'number',
    );
}

/** The calendar date of an instant in the event's timezone. */
function dateInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function assertCount(code: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new ValidationError(`${code} must be an integer between 0 and 10000`);
  }
}

/**
 * The lanes a write must lock before it resolves a tip. A plain count locks its
 * own lane; a mode-moving correction locks both, in a stable order so two
 * movers cannot deadlock each other (HC-2, HC-25).
 */
function laneLockOrder(mode: string, supersededMode?: string): string[] {
  const lanes = supersededMode && supersededMode !== mode ? [mode, supersededMode] : [mode];
  return [...new Set(lanes)].sort();
}

/**
 * Serialise one lane for the rest of the transaction. A row lock cannot do this:
 * a lane's first count matches no row and locks nothing, so two concurrent
 * first counts would both resolve no tip and both insert a current row. The
 * advisory lock is keyed on the lane itself, so it also guards an empty lane
 * (HC-2).
 */
async function lockLane(
  tx: Pick<DbClient, 'query'>,
  eventId: string,
  sessionDate: string,
  mode: string,
): Promise<void> {
  await tx.query(
    `select pg_advisory_xact_lock(
       hashtextextended($1::text || ':' || $2::text || ':' || $3::text, 0)
     )`,
    [eventId, sessionDate, mode],
  );
}

function toHeadcount(row: HeadcountRow, supersededBy: string | null): Headcount {
  return {
    id: row.id,
    eventId: row.event_id,
    sessionDate: isoDate(row.session_date),
    asOf: isoTimestamp(row.as_of),
    mode: row.mode as HeadcountReadMode,
    total: row.total,
    ended: row.ended,
    recordedBy: row.recorded_by,
    recordedAt: isoTimestamp(row.recorded_at),
    supersedesId: row.supersedes_id,
    supersededBy,
    lines: parseLines(row.lines),
  };
}

/**
 * Append-only operator headcounts, one chain per mode. A lane's current
 * observation is the row no other row supersedes - not the row whose own
 * `supersedes_id` is null, because a superseded root keeps that column null.
 * The write path resolves that tip inside its transaction under an advisory
 * lock that serialises the lane even when it is empty; no index claims a unique
 * tip, and legacy data may hold several, so a read takes the newest by `asOf`,
 * then `recordedAt`, then id (HC-2, HC-27). The register-derived `expected` is a
 * different number and never reads this table.
 */
export class HeadcountRepository {
  constructor(private readonly db: Db) {}

  /**
   * One session's lanes. Without a mode filter `current` carries the four live
   * lanes plus `mixed` when the session holds legacy rows; with a filter it
   * carries that lane alone and `observations` is limited to it (HC-16).
   */
  async get(eventId: string, date: string, mode?: HeadcountReadMode): Promise<HeadcountPage> {
    const sessionDate = assertDate(date, 'sessionDate');
    await this.requireEventSession(eventId, sessionDate);

    const rows = await this.db.query<HeadcountRow>(
      `select ${COLUMNS}
         ${FROM_OCCURRENCE}
        where o.event_id = $1 and o.date = $2
        order by h.as_of desc, h.recorded_at desc, h.id desc`,
      [eventId, sessionDate],
    );
    const bySuperseded = new Map<string, string>();
    for (const row of rows) {
      if (row.supersedes_id) bySuperseded.set(row.supersedes_id, row.id);
    }
    const all = rows.map((row) => toHeadcount(row, bySuperseded.get(row.id) ?? null));

    // A supersession can cross lanes (a mode-changing correction), so the
    // successor is resolved over the whole session before any lane filter.
    const observations = mode ? all.filter((row) => row.mode === mode) : all;
    const lanes: HeadcountReadMode[] = mode
      ? [mode]
      : all.some((row) => row.mode === 'mixed')
        ? [...HEADCOUNT_READ_MODES]
        : [...HEADCOUNT_MODES];
    const current: HeadcountCurrent = {};
    for (const lane of lanes) {
      // The rows arrive newest first, so the first tip is "the" current when a
      // lane holds several (HC-27): asOf, then recordedAt, then id.
      current[lane] = all.find((row) => row.mode === lane && row.supersededBy === null) ?? null;
    }
    return { sessionDate, current, observations };
  }

  /** A single lane's tip, or null when that lane has no current observation. */
  async current(eventId: string, date: string, mode: HeadcountReadMode): Promise<Headcount | null> {
    return (await this.get(eventId, date, mode)).current[mode] ?? null;
  }

  /** One observation, scoped to its event; another event's row is invisible. */
  async getById(eventId: string, headcountId: string): Promise<Headcount | null> {
    const [row] = await this.db.query<HeadcountRow>(
      `select ${COLUMNS}
         ${FROM_OCCURRENCE}
        where h.id = $1 and o.event_id = $2`,
      [headcountId, eventId],
    );
    if (!row) return null;

    const [successor] = await this.db.query<{ id: string }>(
      'select id from event_session_headcounts where supersedes_id = $1',
      [headcountId],
    );
    return toHeadcount(row, successor?.id ?? null);
  }

  async record(eventId: string, input: RecordHeadcountInput, actor: string): Promise<Headcount> {
    const sessionDate = assertDate(input.sessionDate, 'sessionDate');
    const event = await this.requireEventSession(eventId, sessionDate);
    // The close is checked before the calendar-day rule: a session a late
    // import already closed answers `session_closed`, not a date refusal.
    if (await sessionIsClosed(this.db, eventId, sessionDate)) {
      throw new SessionClosedError(
        `The session on ${sessionDate} is closed; no further headcount is accepted`,
      );
    }
    if (sessionDate < todayIn(event.timezone)) {
      throw new ValidationError(
        `Headcounts are not accepted for a session dated before today (${sessionDate})`,
      );
    }

    const mode = await this.requireMode(input.mode);
    const buckets = await this.requireBuckets(mode);
    const lines = this.validateLines(mode, input, buckets);
    const total = lines.reduce((sum, line) => sum + line.count, 0);
    // HC-5: the sum is the observation's total and stays inside the column's
    // check. The wire refines this too, but a direct caller must not reach the
    // database's raw check violation.
    if (total > 30_000) {
      throw new ValidationError('the lines must not exceed 30000');
    }

    try {
      return await this.db.transaction(async (tx) => {
        const target = input.supersedesId
          ? await this.requireCorrectionTarget(tx, event.occurrenceId, input.supersedesId)
          : null;

        // HC-2: the tip is resolved inside the write transaction under a lock
        // that serialises the lane even when it holds no rows - a lane's first
        // count has no row to lock. A mode-moving correction touches two lanes;
        // the advisory locks are taken in a stable order, so two movers cannot
        // deadlock each other. The row lock below is kept as belt and braces.
        for (const lane of laneLockOrder(mode, target?.mode)) {
          await lockLane(tx, eventId, sessionDate, lane);
          await tx.query(
            `select id from event_session_headcounts
              where occurrence_id = $1 and mode = $2
              for update`,
            [event.occurrenceId, lane],
          );
        }

        let supersedesId: string | null;
        let rowAsOf: Date;
        if (target) {
          const tip = await this.currentOf(tx, event.occurrenceId, target.mode);
          if (tip?.id !== target.id) {
            throw new ValidationError(
              'supersedesId must name the current, non-superseded observation',
            );
          }
          // HC-25: a correction may move into another lane only while that lane
          // has no current observation; the operator gets the named error.
          if (target.mode !== mode) {
            const destination = await this.currentOf(tx, event.occurrenceId, mode);
            if (destination) {
              throw new ValidationError(
                `The ${mode} lane already has a current observation; a correction cannot move into it`,
              );
            }
          }
          supersedesId = target.id;
          // A correction keeps the moment counted, not the correction time.
          rowAsOf = target.as_of instanceof Date ? target.as_of : new Date(target.as_of);
        } else {
          // A plain new count supersedes its lane's newest tip and takes asOf
          // now; older tips left by legacy data stay as the history they are
          // (HC-2, HC-27).
          const tip = await this.currentOf(tx, event.occurrenceId, mode);
          supersedesId = tip?.id ?? null;
          rowAsOf = input.asOf ? new Date(input.asOf) : new Date();
          if (Number.isNaN(rowAsOf.getTime())) {
            throw new ValidationError('asOf must be a valid timestamp');
          }
        }
        if (dateInZone(rowAsOf, event.timezone) !== sessionDate) {
          throw new ValidationError(
            `asOf must fall within the session day ${sessionDate} in ${event.timezone}`,
          );
        }

        const [row] = await tx.query<{ id: string }>(
          `insert into event_session_headcounts (
             occurrence_id, session_date, as_of, mode,
             total, ended, recorded_by, supersedes_id
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)
           returning id`,
          [
            event.occurrenceId,
            sessionDate,
            rowAsOf.toISOString(),
            mode,
            total,
            input.ended === true,
            actor,
            supersedesId,
          ],
        );
        // Lines are written in the mode's declared order and never for a zero
        // bucket, so an all-zero count carries no lines (HC-19, AC-H13).
        for (const line of lines) {
          await tx.query(
            `insert into headcount_lines (headcount_id, mode_code, bucket_code, count)
             values ($1,$2,$3,$4)`,
            [row!.id, mode, line.code, line.count],
          );
        }
        const [stored] = await tx.query<HeadcountRow>(
          `select ${COLUMNS}
             ${FROM_OCCURRENCE}
            where h.id = $1`,
          [row!.id],
        );
        return toHeadcount(stored!, null);
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ValidationError(
          'The observation being corrected was superseded concurrently; retry the correction',
        );
      }
      // Backstop for the column's 0-30000 check: a direct caller that somehow
      // bypasses the guard above still gets a domain error, never a raw
      // constraint violation (HC-5).
      if (sqlState(error) === '23514') {
        throw new ValidationError('The headcount total must be between 0 and 30000');
      }
      throw error;
    }
  }

  /**
   * The lane's current observation: the row in that mode that no other row
   * supersedes. This is not the row whose own `supersedes_id` is null — a
   * superseded root keeps that column null — so the query follows the chain.
   * Legacy data may leave several tips in one lane; the newest is "the" current
   * (HC-27). `db` is the transaction client on the write path.
   */
  private async currentOf(
    db: Pick<DbClient, 'query'>,
    occurrenceId: string,
    mode: string,
  ): Promise<{ id: string; as_of: Date | string } | undefined> {
    const [row] = await db.query<{ id: string; as_of: Date | string }>(
      `select h.id, h.as_of
         from event_session_headcounts h
        where h.occurrence_id = $1 and h.mode = $2
          and not exists (
            select 1 from event_session_headcounts s where s.supersedes_id = h.id
          )
        order by h.as_of desc, h.recorded_at desc, h.id desc
        limit 1`,
      [occurrenceId, mode],
    );
    return row;
  }

  /**
   * The row a correction names, scoped to its occurrence. Another session's or
   * event's observation is refused with a validation error.
   */
  private async requireCorrectionTarget(
    db: Pick<DbClient, 'query'>,
    occurrenceId: string,
    headcountId: string,
  ): Promise<{ id: string; mode: string; as_of: Date | string }> {
    const [target] = await db.query<{ id: string; mode: string; as_of: Date | string }>(
      `select id, mode, as_of
         from event_session_headcounts
        where id = $1 and occurrence_id = $2`,
      [headcountId, occurrenceId],
    );
    if (!target) {
      throw new ValidationError('supersedesId does not name an observation of this session');
    }
    return target;
  }

  /** The mode must exist and must not be retired; `mixed` answers here. */
  private async requireMode(mode: string): Promise<HeadcountMode> {
    const [row] = await this.db.query<{ code: string; retired: boolean }>(
      'select code, retired from headcount_modes where code = $1',
      [mode],
    );
    if (!row) throw new ValidationError(`Unknown headcount mode ${mode}`);
    if (row.retired) throw new ValidationError(`The ${mode} headcount mode is retired`);
    return row.code as HeadcountMode;
  }

  /** The mode's buckets, in entry order; what defines the lane's entry line. */
  private async requireBuckets(mode: HeadcountMode): Promise<BucketRow[]> {
    return this.db.query<BucketRow>(
      `select code, label, sort_order
         from headcount_buckets
        where mode_code = $1
        order by sort_order, code`,
      [mode],
    );
  }

  /**
   * A line is a bucket of this mode, at most once, with a count in range. The
   * response keeps the mode's declared order and drops zero buckets.
   */
  private validateLines(
    mode: HeadcountMode,
    input: RecordHeadcountInput,
    buckets: readonly BucketRow[],
  ): HeadcountLine[] {
    const ordered = new Map(buckets.map((bucket) => [bucket.code, bucket]));
    const counts = new Map<string, number>();
    for (const line of input.lines) {
      const bucket = ordered.get(line.code);
      if (!bucket) {
        throw new ValidationError(`${line.code} is not a bucket of the ${mode} lane`);
      }
      if (counts.has(line.code)) {
        throw new ValidationError(`the ${line.code} bucket appears more than once`);
      }
      assertCount(line.code, line.count);
      counts.set(line.code, line.count);
    }
    return buckets
      .filter((bucket) => (counts.get(bucket.code) ?? 0) > 0)
      .map((bucket) => ({
        code: bucket.code,
        label: bucket.label,
        count: counts.get(bucket.code)!,
      }));
  }

  private async requireEventSession(
    eventId: string,
    sessionDate: string,
  ): Promise<{ timezone: string; occurrenceId: string }> {
    const [event] = await this.db.query<{
      id: string;
      timezone: string;
      occurrence_id: string | null;
    }>(
      `select e.id, e.timezone, o.id as occurrence_id
         from events e
         left join event_occurrences o on o.event_id = e.id and o.date = $2
        where e.id = $1`,
      [eventId, sessionDate],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    if (!event.occurrence_id) {
      throw new NotFoundError(`Event ${eventId} has no session on ${sessionDate}`);
    }
    return { timezone: event.timezone, occurrenceId: event.occurrence_id };
  }
}
