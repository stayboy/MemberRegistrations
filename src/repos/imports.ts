import { createHash } from 'node:crypto';
import { ImportError, NotFoundError, ValidationError } from '../errors/domain-errors.js';
import { assertDate } from '../domain/contacts.js';
import type { Db, DbClient } from '../db/sql.js';

export interface EventImportRow {
  date: string;
  eventno: string;
  eventname: string;
  ministryName?: string | null;
}

export interface AttendanceImportRow {
  memberno: string;
  date: string;
  eventno: string;
}

export interface ImportBatchDto {
  id: string;
  kind: 'events' | 'attendance';
  actor: string;
  rowCount: number;
  checksum: string;
  createdAt: string;
}

const MAX_ROWS = 10_000;

function checksum(rows: unknown): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function assertRows(rows: unknown[], label: string): void {
  if (rows.length === 0) throw new ValidationError(`${label} must contain at least one row`);
  if (rows.length > MAX_ROWS) {
    throw new ValidationError(`${label} exceeds the ${MAX_ROWS} row limit; split the file`);
  }
}

export class ImportRepository {
  constructor(private readonly db: Db) {}

  async importEvents(rows: EventImportRow[], actor: string): Promise<ImportBatchDto> {
    assertRows(rows, 'rows');

    return this.db.transaction(async (tx) => {
      const batch = await this.createBatch(tx, 'events', rows, actor);

      const cache = new Map<string, string | null>();
      const unknown = new Set<string>();

      for (const [index, row] of rows.entries()) {
        const date = assertDate(row.date, `rows[${index}].date`);
        if (!row.eventno?.trim()) throw new ValidationError(`rows[${index}].eventno is required`);
        if (!row.eventname?.trim())
          throw new ValidationError(`rows[${index}].eventname is required`);

        const key = `${row.eventname.trim().toLowerCase()}|${(row.ministryName ?? '').trim().toLowerCase()}`;
        let seriesId = cache.get(key);
        if (seriesId === undefined) {
          seriesId = await this.resolveSeries(tx, row.eventname, row.ministryName ?? null);
          cache.set(key, seriesId);
        }
        if (!seriesId) {
          unknown.add(row.ministryName ? `${row.eventname} (${row.ministryName})` : row.eventname);
          continue;
        }

        await tx.query(
          `insert into event_instances (
             series_id, start_date, end_date, name, timezone, venue_type, status, source, sessions,
             event_no, ministry_name, import_batch_id
           )
           select s.id, $2, $2, s.name, s.timezone, 'auditorium', 'scheduled', 'series',
                  jsonb_build_array(jsonb_build_object('date', $2::date, 'startTime', null, 'endTime', null, 'status', 'scheduled')),
                  $3, $4, $5
           from event_series s where s.id = $1
           on conflict (series_id, start_date) do update
             set event_no = excluded.event_no,
                 ministry_name = excluded.ministry_name,
                 import_batch_id = excluded.import_batch_id,
                 name = excluded.name`,
          [seriesId, date, row.eventno.trim(), row.ministryName ?? null, batch.id],
        );
      }

      if (unknown.size > 0) {
        throw new ImportError(
          `Unknown event series: ${[...unknown].sort().join(', ')}. Create the series first.`,
        );
      }

      return batch;
    });
  }

  async importAttendance(rows: AttendanceImportRow[], actor: string): Promise<ImportBatchDto> {
    assertRows(rows, 'rows');

    return this.db.transaction(async (tx) => {
      const batch = await this.createBatch(tx, 'attendance', rows, actor);

      const eventNos = [...new Set(rows.map((row) => row.eventno.trim()))];
      const events = await tx.query<{ event_no: string; id: string; start_date: string }>(
        'select event_no, id, start_date from event_instances where event_no = any($1::text[])',
        [eventNos],
      );
      const eventMap = new Map(events.map((event) => [event.event_no, event]));

      const memberNos = [...new Set(rows.map((row) => row.memberno.trim().toLowerCase()))];
      const members = await tx.query<{ id: string; member_no: string }>(
        'select id, member_no from members where lower(member_no) = any($1::text[]) and purged_at is null',
        [memberNos],
      );
      const memberMap = new Map(
        members.map((member) => [member.member_no.toLowerCase(), member.id]),
      );

      const unknownEvents = new Set<string>();
      const unknownMembers = new Set<string>();

      for (const row of rows) {
        const event = eventMap.get(row.eventno.trim());
        if (!event) {
          unknownEvents.add(row.eventno);
          continue;
        }
        const memberId = memberMap.get(row.memberno.trim().toLowerCase());
        if (!memberId) {
          unknownMembers.add(row.memberno);
          continue;
        }

        await tx.query(
          `insert into attendance (member_id, event_instance_id, session_date, source, import_batch_id, created_by)
           select $1,$2,$3,'import',$4,$5
           where not exists (
             select 1 from attendance_suppressions s
             where s.member_id = $1 and s.event_instance_id = $2 and s.session_date = $3
           )
           on conflict (event_instance_id, session_date, member_id) do update
             set source = 'import',
                 import_batch_id = excluded.import_batch_id,
                 created_by = excluded.created_by
             where attendance.source <> 'manual'`,
          [memberId, event.id, isoDate(event.start_date), batch.id, actor],
        );
      }

      if (unknownEvents.size > 0) {
        throw new ImportError(`Unknown event numbers: ${[...unknownEvents].sort().join(', ')}`);
      }
      if (unknownMembers.size > 0) {
        throw new ImportError(`Unknown member numbers: ${[...unknownMembers].sort().join(', ')}`);
      }

      return batch;
    });
  }

  async getBatch(id: string): Promise<ImportBatchDto> {
    const [row] = await this.db.query<{
      id: string;
      kind: 'events' | 'attendance';
      actor: string;
      row_count: number;
      checksum: string;
      created_at: Date | string;
    }>(
      'select id, kind, actor, row_count, checksum, created_at from import_batches where id = $1',
      [id],
    );

    if (!row) throw new NotFoundError(`Import batch ${id} was not found`);

    return {
      id: row.id,
      kind: row.kind,
      actor: row.actor,
      rowCount: row.row_count,
      checksum: row.checksum,
      createdAt: isoTimestamp(row.created_at),
    };
  }

  private async createBatch(
    tx: DbClient,
    kind: 'events' | 'attendance',
    rows: unknown[],
    actor: string,
  ): Promise<ImportBatchDto> {
    const [row] = await tx.query<{
      id: string;
      created_at: Date | string;
    }>(
      `insert into import_batches (kind, actor, row_count, checksum)
       values ($1,$2,$3,$4) returning id, created_at`,
      [kind, actor, rows.length, checksum(rows)],
    );

    return {
      id: row!.id,
      kind,
      actor,
      rowCount: rows.length,
      checksum: checksum(rows),
      createdAt: isoTimestamp(row!.created_at),
    };
  }

  /**
   * Series are created by an administrator, never by an import. A name with no
   * ministry matches a church-wide series first, then a unique ministry series.
   */
  private async resolveSeries(
    tx: DbClient,
    eventName: string,
    ministryName: string | null,
  ): Promise<string | null> {
    if (ministryName) {
      const [ministry] = await tx.query<{ id: string }>(
        `select id from ministries where lower(code) = lower($1) or lower(name) = lower($1)`,
        [ministryName],
      );
      if (!ministry) return null;

      const [series] = await tx.query<{ id: string }>(
        `select id from event_series
         where lower(name) = lower($1) and ministry_id = $2 and archived_at is null`,
        [eventName, ministry.id],
      );
      return series?.id ?? null;
    }

    const candidates = await tx.query<{ id: string }>(
      `select id from event_series where lower(name) = lower($1) and archived_at is null
       order by ministry_id nulls first`,
      [eventName],
    );
    if (candidates.length === 0) return null;
    return candidates[0]!.id;
  }
}
