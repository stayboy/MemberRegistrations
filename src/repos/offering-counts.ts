import type { Db, DbClient, Row } from '../db/sql.js';
import { assertDate } from '../domain/contacts.js';
import {
  EventNotActiveError,
  NotFoundError,
  OfferingNotOnEventError,
  SessionNotInEventError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';
import type {
  OfferingCount,
  OfferingCountInput,
  OfferingCountLine,
  OfferingCountList,
} from '../schemas/offering-counts.js';

interface CountRow extends Row {
  id: string;
  event_instance_id: string;
  offering_id: string;
  session_date: unknown;
  currency: string;
  terms_version: number | string;
  as_of: Date | string;
  recorded_by: string;
  recorded_at: Date | string;
  supersedes_id: string | null;
}

interface LineRow extends Row {
  count_id: string;
  denomination_minor: number | string;
  pieces: number | string;
}

interface StoredSession {
  date?: unknown;
  status?: string;
}

type EventRow = {
  id: string;
  status: string;
  timezone: string;
  sessions: unknown;
  series_id: string | null;
};

type OfferingTermsRow = {
  active: boolean;
  currency: string | null;
  version: number | string | null;
};

const COLUMNS = `
  id, event_instance_id, offering_id, session_date, currency, terms_version,
  as_of, recorded_by, recorded_at, supersedes_id`;

const LINE_COLUMNS = 'count_id, denomination_minor, pieces';

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

/**
 * One count's lines with a bigint-safe total. The input is already Zod-checked;
 * this repeats the invariant the database cannot express (a positive total) and
 * keeps the arithmetic off floating point.
 */
function validateLines(lines: readonly OfferingCountLine[]): number {
  if (lines.length === 0) throw new ValidationError('a count requires at least one line');

  const seen = new Set<number>();
  let total = 0n;
  for (const line of lines) {
    if (
      !Number.isInteger(line.denominationMinor) ||
      !Number.isInteger(line.pieces) ||
      line.denominationMinor <= 0 ||
      line.pieces <= 0
    ) {
      throw new ValidationError('each line needs a positive denomination and piece count');
    }
    if (seen.has(line.denominationMinor)) {
      throw new ValidationError('each denomination appears once per count');
    }
    seen.add(line.denominationMinor);
    total += BigInt(line.denominationMinor) * BigInt(line.pieces);
  }

  if (total <= 0n) throw new ValidationError('the counted total must be positive');
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError('the counted total is too large');
  }
  return Number(total);
}

function sortedLines(lines: readonly OfferingCountLine[]): OfferingCountLine[] {
  return [...lines].sort((left, right) => right.denominationMinor - left.denominationMinor);
}

/** Read-path total: the stored rows are already constrained, so never throw here. */
function sumLines(lines: readonly OfferingCountLine[]): number {
  let total = 0n;
  for (const line of lines) {
    total += BigInt(line.denominationMinor) * BigInt(line.pieces);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(total);
}

function toCount(
  row: CountRow,
  lines: readonly OfferingCountLine[],
  supersededBy: string | null,
): OfferingCount {
  return {
    id: row.id,
    eventId: row.event_instance_id,
    offeringId: row.offering_id,
    sessionDate: isoDate(row.session_date),
    asOf: isoTimestamp(row.as_of),
    currency: row.currency,
    termsVersion: Number(row.terms_version),
    lines: sortedLines(lines),
    totalMinor: sumLines(lines),
    recordedAt: isoTimestamp(row.recorded_at),
    recordedBy: row.recorded_by,
    supersedesId: row.supersedes_id,
    supersededBy,
  };
}

/**
 * Append-only operator offering cash counts. One count covers an event,
 * offering and session; a correction supersedes the group's current row and
 * keeps the corrected `asOf`. Money is integer minor units throughout.
 */
export class OfferingCountRepository {
  constructor(private readonly db: Db) {}

  async get(eventId: string, sessionDate: string, offeringId: string): Promise<OfferingCountList> {
    const date = assertDate(sessionDate, 'sessionDate');
    await this.requireEventSession(eventId, date);

    const rows = await this.db.query<CountRow>(
      `select ${COLUMNS}
         from event_session_offering_counts
        where event_instance_id = $1 and offering_id = $2 and session_date = $3
        order by as_of desc, recorded_at desc, id desc`,
      [eventId, offeringId, date],
    );

    const linesByCount = await this.linesFor(
      this.db,
      rows.map((row) => row.id),
    );
    const bySuperseded = new Map<string, string>();
    for (const row of rows) {
      if (row.supersedes_id) bySuperseded.set(row.supersedes_id, row.id);
    }
    const observations = rows.map((row) =>
      toCount(row, linesByCount.get(row.id) ?? [], bySuperseded.get(row.id) ?? null),
    );
    const current = observations.find((row) => row.supersededBy === null) ?? null;
    return { current, observations };
  }

  async record(eventId: string, input: OfferingCountInput, actor: string): Promise<OfferingCount> {
    const sessionDate = assertDate(input.sessionDate, 'sessionDate');
    const event = await this.requireActiveEventSession(eventId, sessionDate);
    const terms = await this.resolveOffering(input.offeringId);
    await this.requireAttachment(event, input.offeringId);

    const currency = input.currency ?? terms.currency;
    if (currency !== terms.currency) {
      throw new ValidationError(
        `currency ${currency} does not match the offering currency ${terms.currency}`,
      );
    }
    validateLines(input.lines);

    let supersedesId: string | null = null;
    let rowAsOf: Date;
    if (input.supersedesId) {
      const [target] = await this.db.query<{ id: string; as_of: Date | string }>(
        `select id, as_of
           from event_session_offering_counts
          where id = $1 and event_instance_id = $2 and offering_id = $3 and session_date = $4`,
        [input.supersedesId, eventId, input.offeringId, sessionDate],
      );
      if (!target) {
        throw new ValidationError(
          'supersedesId does not name an observation of this offering and session',
        );
      }

      const [current] = await this.db.query<{ id: string }>(
        `select c.id
           from event_session_offering_counts c
          where c.event_instance_id = $1 and c.offering_id = $2 and c.session_date = $3
            and not exists (
              select 1 from event_session_offering_counts s where s.supersedes_id = c.id
            )
          order by c.as_of desc, c.recorded_at desc, c.id desc
          limit 1`,
        [eventId, input.offeringId, sessionDate],
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
      return await this.db.transaction(async (tx) => {
        const [row] = await tx.query<CountRow>(
          `insert into event_session_offering_counts (
             event_instance_id, offering_id, session_date, currency, terms_version,
             as_of, recorded_by, supersedes_id
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)
           returning ${COLUMNS}`,
          [
            eventId,
            input.offeringId,
            sessionDate,
            currency,
            terms.version,
            rowAsOf.toISOString(),
            actor,
            supersedesId,
          ],
        );

        await tx.query(
          `insert into event_session_offering_count_lines (count_id, denomination_minor, pieces)
           select $1, * from unnest($2::bigint[], $3::int[])`,
          [
            row!.id,
            input.lines.map((line) => line.denominationMinor),
            input.lines.map((line) => line.pieces),
          ],
        );

        return toCount(row!, input.lines, null);
      });
    } catch (error) {
      if (sqlState(error) === '23505') {
        throw new ValidationError('This observation has already been superseded');
      }
      throw error;
    }
  }

  private async linesFor(
    db: DbClient,
    countIds: readonly string[],
  ): Promise<Map<string, OfferingCountLine[]>> {
    const result = new Map<string, OfferingCountLine[]>();
    if (countIds.length === 0) return result;

    const rows = await db.query<LineRow>(
      `select ${LINE_COLUMNS}
         from event_session_offering_count_lines
        where count_id = any($1::uuid[])
        order by denomination_minor desc`,
      [countIds],
    );
    for (const row of rows) {
      const lines = result.get(row.count_id) ?? [];
      lines.push({
        denominationMinor: Number(row.denomination_minor),
        pieces: Number(row.pieces),
      });
      result.set(row.count_id, lines);
    }
    return result;
  }

  private async requireEventSession(
    eventId: string,
    sessionDate: string,
  ): Promise<{ timezone: string }> {
    const [event] = await this.db.query<EventRow>(
      'select id, status, timezone, sessions, series_id from event_instances where id = $1',
      [eventId],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);

    const session = this.findSession(event.sessions, sessionDate);
    if (!session) {
      throw new NotFoundError(`Event ${eventId} has no session on ${sessionDate}`);
    }
    return { timezone: event.timezone };
  }

  private async requireActiveEventSession(eventId: string, sessionDate: string): Promise<EventRow> {
    const [event] = await this.db.query<EventRow>(
      'select id, status, timezone, sessions, series_id from event_instances where id = $1',
      [eventId],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    if (event.status === 'cancelled' || event.status === 'archived') {
      throw new EventNotActiveError(`Event ${eventId} is ${event.status} and cannot take counts`);
    }

    const session = this.findSession(event.sessions, sessionDate);
    if (!session) {
      throw new SessionNotInEventError(`Event ${eventId} has no session on ${sessionDate}`);
    }
    if (session.status === 'cancelled') {
      throw new EventNotActiveError(
        `The session on ${sessionDate} is cancelled and cannot take counts`,
      );
    }
    return event;
  }

  private findSession(sessions: unknown, sessionDate: string): StoredSession | undefined {
    return parseJsonArray(sessions)
      .map((entry) => entry as StoredSession)
      .find((entry) => isoDate(entry.date) === sessionDate);
  }

  private async resolveOffering(
    offeringId: string,
  ): Promise<{ currency: string; version: number }> {
    const [row] = await this.db.query<OfferingTermsRow>(
      `select o.active, t.currency, t.version
         from offerings o
         left join lateral (
           select currency, version
             from offering_terms t
            where t.offering_id = o.id
            order by t.version desc
            limit 1
         ) t on true
        where o.id = $1`,
      [offeringId],
    );
    if (!row) throw new NotFoundError(`Offering ${offeringId} was not found`);
    if (!row.active) {
      throw new ValidationError(`Offering ${offeringId} is archived and cannot take counts`);
    }
    if (row.currency === null || row.version === null) {
      throw new NotFoundError(`Offering ${offeringId} has no published terms`);
    }
    return { currency: row.currency, version: Number(row.version) };
  }

  private async requireAttachment(event: EventRow, offeringId: string): Promise<void> {
    const [attachment] = await this.db.query<{ id: string }>(
      `select a.id
         from event_instance_offerings a
        where a.offering_id = $1
          and a.detached_on is null
          and (a.event_instance_id = $2 or ($3::uuid is not null and a.series_id = $3::uuid))
        limit 1`,
      [offeringId, event.id, event.series_id],
    );
    if (!attachment) {
      throw new OfferingNotOnEventError(
        `Offering ${offeringId} is not attached to event ${event.id}`,
      );
    }
  }
}
