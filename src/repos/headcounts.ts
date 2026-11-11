import type { Db, Row } from '../db/sql.js';
import { NotFoundError, SessionClosedError, ValidationError } from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import { assertDate } from '../domain/contacts.js';
import { todayIn } from '../domain/series.js';
import { sessionIsClosed } from './captures.js';

export type HeadcountMode = 'adults' | 'children' | 'mixed';

export interface HeadcountBuckets {
  adultMale: number;
  adultFemale: number;
  adultUnspecified: number;
  childMale: number;
  childFemale: number;
  childUnspecified: number;
}

export interface Headcount extends HeadcountBuckets {
  id: string;
  eventId: string;
  sessionDate: string;
  asOf: string;
  /** True when this observation ended the session. */
  ended: boolean;
  mode: HeadcountMode;
  total: number;
  recordedBy: string;
  recordedAt: string;
  supersedesId: string | null;
  /** Derived from the unique row whose supersedesId points at this observation. */
  supersededBy: string | null;
}

export interface HeadcountPage {
  sessionDate: string;
  current: Headcount | null;
  observations: Headcount[];
}

export interface RecordHeadcountInput extends HeadcountBuckets {
  sessionDate: string;
  mode: HeadcountMode;
  asOf?: string;
  supersedesId?: string;
  /** True closes the session; a headcount never ends automatically. */
  ended?: boolean;
}

interface HeadcountRow extends Row {
  id: string;
  event_instance_id: string;
  session_date: unknown;
  as_of: Date | string;
  mode: string;
  adult_male: number;
  adult_female: number;
  adult_unspecified: number;
  child_male: number;
  child_female: number;
  child_unspecified: number;
  total: number;
  ended: boolean;
  recorded_by: string;
  recorded_at: Date | string;
  supersedes_id: string | null;
}

interface StoredSession {
  date?: unknown;
  status?: string;
}

const COLUMNS = `
  id, event_instance_id, session_date, as_of, mode,
  adult_male, adult_female, adult_unspecified,
  child_male, child_female, child_unspecified,
  total, ended, recorded_by, recorded_at, supersedes_id`;

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

/** The calendar date of an instant in the event's timezone. */
function dateInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function assertBucket(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new ValidationError(`${name} must be an integer between 0 and 10000`);
  }
}

function validateBuckets(mode: HeadcountMode, buckets: HeadcountBuckets): number {
  assertBucket('adultMale', buckets.adultMale);
  assertBucket('adultFemale', buckets.adultFemale);
  assertBucket('adultUnspecified', buckets.adultUnspecified);
  assertBucket('childMale', buckets.childMale);
  assertBucket('childFemale', buckets.childFemale);
  assertBucket('childUnspecified', buckets.childUnspecified);

  if (mode === 'adults') {
    if (buckets.childMale !== 0 || buckets.childFemale !== 0 || buckets.adultUnspecified !== 0) {
      throw new ValidationError(
        'Adults mode splits adult male and female; child male, child female and adultUnspecified must be 0',
      );
    }
  } else if (mode === 'children') {
    if (buckets.adultMale !== 0 || buckets.adultFemale !== 0 || buckets.childUnspecified !== 0) {
      throw new ValidationError(
        'Children mode splits child male and female; adult male, adult female and childUnspecified must be 0',
      );
    }
  } else if (buckets.adultUnspecified !== 0 || buckets.childUnspecified !== 0) {
    throw new ValidationError('Mixed mode splits both; both unspecified buckets must be 0');
  }

  const total =
    buckets.adultMale +
    buckets.adultFemale +
    buckets.adultUnspecified +
    buckets.childMale +
    buckets.childFemale +
    buckets.childUnspecified;
  if (total > 30_000) throw new ValidationError('the six buckets must not exceed 30000');
  return total;
}

function toHeadcount(row: HeadcountRow, supersededBy: string | null): Headcount {
  return {
    id: row.id,
    eventId: row.event_instance_id,
    sessionDate: isoDate(row.session_date),
    asOf: isoTimestamp(row.as_of),
    mode: row.mode as HeadcountMode,
    adultMale: row.adult_male,
    adultFemale: row.adult_female,
    adultUnspecified: row.adult_unspecified,
    childMale: row.child_male,
    childFemale: row.child_female,
    childUnspecified: row.child_unspecified,
    total: row.total,
    ended: row.ended,
    recordedBy: row.recorded_by,
    recordedAt: isoTimestamp(row.recorded_at),
    supersedesId: row.supersedes_id,
    supersededBy,
  };
}

/**
 * Append-only operator headcounts. The register-derived `expected` is a
 * different number and never reads from this table.
 */
export class HeadcountRepository {
  constructor(private readonly db: Db) {}

  async get(eventId: string, date: string): Promise<HeadcountPage> {
    const sessionDate = assertDate(date, 'sessionDate');
    await this.requireEventSession(eventId, sessionDate);

    const rows = await this.db.query<HeadcountRow>(
      `select ${COLUMNS}
         from event_session_headcounts
        where event_instance_id = $1 and session_date = $2
        order by as_of desc, recorded_at desc, id desc`,
      [eventId, sessionDate],
    );
    const bySuperseded = new Map<string, string>();
    for (const row of rows) {
      if (row.supersedes_id) bySuperseded.set(row.supersedes_id, row.id);
    }
    const observations = rows.map((row) => toHeadcount(row, bySuperseded.get(row.id) ?? null));
    const current = observations.find((row) => row.supersededBy === null) ?? null;
    return { sessionDate, current, observations };
  }

  async current(eventId: string, date: string): Promise<Headcount | null> {
    return (await this.get(eventId, date)).current;
  }

  /** One observation, scoped to its event; another event's row is invisible. */
  async getById(eventId: string, headcountId: string): Promise<Headcount | null> {
    const [row] = await this.db.query<HeadcountRow>(
      `select ${COLUMNS}
         from event_session_headcounts
        where id = $1 and event_instance_id = $2`,
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
    const total = validateBuckets(input.mode, input);

    let supersedesId: string | null = null;
    let rowAsOf: Date;
    if (input.supersedesId) {
      const [target] = await this.db.query<{
        id: string;
        as_of: Date | string;
      }>(
        `select id, as_of
           from event_session_headcounts
          where id = $1 and event_instance_id = $2 and session_date = $3`,
        [input.supersedesId, eventId, sessionDate],
      );
      if (!target) {
        throw new ValidationError('supersedesId does not name an observation of this session');
      }

      const [current] = await this.db.query<{ id: string }>(
        `select id
           from event_session_headcounts
          where event_instance_id = $1 and session_date = $2 and supersedes_id is null
          order by as_of desc, recorded_at desc, id desc
          limit 1`,
        [eventId, sessionDate],
      );
      if (current?.id !== target.id) {
        throw new ValidationError('supersedesId must name the current, non-superseded observation');
      }
      supersedesId = target.id;
      // A correction keeps the moment counted, not the correction time.
      rowAsOf = target.as_of instanceof Date ? target.as_of : new Date(target.as_of);
    } else {
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

    try {
      const [row] = await this.db.query<HeadcountRow>(
        `insert into event_session_headcounts (
           event_instance_id, session_date, as_of, mode,
           adult_male, adult_female, adult_unspecified,
           child_male, child_female, child_unspecified,
           total, ended, recorded_by, supersedes_id
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         returning ${COLUMNS}`,
        [
          eventId,
          sessionDate,
          rowAsOf.toISOString(),
          input.mode,
          input.adultMale,
          input.adultFemale,
          input.adultUnspecified,
          input.childMale,
          input.childFemale,
          input.childUnspecified,
          total,
          input.ended === true,
          actor,
          supersedesId,
        ],
      );
      return toHeadcount(row!, null);
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ValidationError('This observation has already been superseded');
      }
      throw error;
    }
  }

  private async requireEventSession(
    eventId: string,
    sessionDate: string,
  ): Promise<{ timezone: string }> {
    const [event] = await this.db.query<{ id: string; timezone: string; sessions: unknown }>(
      'select id, timezone, sessions from event_instances where id = $1',
      [eventId],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);

    const session = parseJsonArray(event.sessions)
      .map((entry) => entry as StoredSession)
      .find((entry) => isoDate(entry.date) === sessionDate);
    if (!session) {
      throw new NotFoundError(`Event ${eventId} has no session on ${sessionDate}`);
    }
    return { timezone: event.timezone };
  }
}
