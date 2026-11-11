import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  ImportError,
  DuplicateImportError,
  NotFoundError,
  ValidationError,
  type ImportRowError,
} from '../errors/domain-errors.js';
import { assertDate, normalizeContactValue, type ContactKind } from '../domain/contacts.js';
import { GENDERS, type Gender } from './members.js';
import type { Db, DbClient } from '../db/sql.js';

export interface MemberImportRow {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  gender?: Gender;
  dob?: string | null;
  joinedOn?: string | null;
  placeOfResidence?: string | null;
  addressLine?: string | null;
  isPresbyter?: boolean;
  phone?: string | null;
  email?: string | null;
}

export interface AttendanceImportRow {
  memberNo: string;
  /** `YYYY-MM-DD` or a date plus a time; the date MUST match the session. */
  datetime?: string;
}

export interface AttendanceImportRequest {
  eventId: string;
  sessionDate: string;
  rows: AttendanceImportRow[];
}

export type ImportKind = 'members' | 'attendance';

export interface ImportBatchDto {
  id: string;
  /** Legacy event-list batches stay readable. */
  kind: 'members' | 'attendance' | 'events';
  actor: string;
  rowCount: number;
  checksum: string;
  eventInstanceId: string | null;
  sessionDate: string | null;
  written: number | null;
  skipped: number | null;
  createdAt: string;
}

export interface ImportFormatColumn {
  name: string;
  required: boolean;
  type: 'text' | 'enum' | 'date' | 'boolean';
  example: string | boolean;
  notes?: string;
}

export interface ImportFormat {
  kind: ImportKind;
  filename: string;
  columns: ImportFormatColumn[];
}

/**
 * The single source of truth for both `GET /v1/imports/formats` and the Excel
 * templates. The workbook is built from these columns, never a second list.
 */
export const IMPORT_FORMATS: ImportFormat[] = [
  {
    kind: 'members',
    filename: 'members-import-template.xlsx',
    columns: [
      {
        name: 'memberNo',
        required: true,
        type: 'text',
        example: 'M-1001',
        notes: 'The member number. An existing number updates that member.',
      },
      { name: 'firstName', required: true, type: 'text', example: 'Ama' },
      { name: 'lastName', required: true, type: 'text', example: 'Mensah' },
      { name: 'otherNames', required: false, type: 'text', example: 'Adwoa', notes: 'Optional.' },
      {
        name: 'gender',
        required: false,
        type: 'enum',
        example: 'female',
        notes: 'male | female | other | undisclosed',
      },
      { name: 'dob', required: false, type: 'date', example: '1990-05-14', notes: 'YYYY-MM-DD' },
      {
        name: 'joinedOn',
        required: false,
        type: 'date',
        example: '2026-01-04',
        notes: 'YYYY-MM-DD',
      },
      { name: 'placeOfResidence', required: false, type: 'text', example: 'Accra' },
      {
        name: 'addressLine',
        required: false,
        type: 'text',
        example: '12 Independence Avenue',
      },
      {
        name: 'isPresbyter',
        required: false,
        type: 'boolean',
        example: false,
        notes: 'TRUE or FALSE. Omitted leaves the flag unchanged.',
      },
      {
        name: 'phone',
        required: false,
        type: 'text',
        example: '08012345678',
        notes: 'Normalised before storing; one member per number.',
      },
      {
        name: 'email',
        required: false,
        type: 'text',
        example: 'ama@example.com',
        notes: 'Normalised to lower case; one member per address.',
      },
    ],
  },
  {
    kind: 'attendance',
    filename: 'attendance-import-template.xlsx',
    columns: [
      {
        name: 'memberNo',
        required: true,
        type: 'text',
        example: 'M-1001',
        notes: 'The member number from the member import.',
      },
      {
        name: 'datetime',
        required: false,
        type: 'date',
        example: '2026-01-04T09:00',
        notes: "The selected session's date; a time is kept when present.",
      },
    ],
  },
];

export function isImportKind(value: string): value is ImportKind {
  return IMPORT_FORMATS.some((format) => format.kind === value);
}

/** Build the workbook from the same registry that serves the JSON contract. */
export async function buildImportTemplate(
  kind: ImportKind,
): Promise<{ filename: string; buffer: Buffer }> {
  const format = IMPORT_FORMATS.find((entry) => entry.kind === kind)!;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(kind);
  sheet.addRow(format.columns.map((column) => column.name));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(format.columns.map((column) => column.example));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  format.columns.forEach((column, index) => {
    const example = String(column.example);
    sheet.getColumn(index + 1).width = Math.max(14, column.name.length + 2, example.length + 2);
  });

  const notes = workbook.addWorksheet('Notes');
  notes.addRow(['Column', 'Required', 'Type', 'Example', 'Notes']);
  notes.getRow(1).font = { bold: true };
  notes.columns = [{ width: 18 }, { width: 10 }, { width: 10 }, { width: 24 }, { width: 56 }];
  for (const column of format.columns) {
    notes.addRow([
      column.name,
      column.required ? 'Yes' : 'No',
      column.type,
      String(column.example),
      column.notes ?? '',
    ]);
  }
  notes.addRow([]);
  notes.addRow(['Note', 'A blank optional cell leaves the stored value unchanged.']);

  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: format.filename, buffer: Buffer.from(buffer) };
}

const MAX_ROWS = 10_000;

function checksum(rows: unknown): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** `sessions` is JSONB: PGlite returns an array, `pg` may return the raw text. */
function sessionEntries(value: unknown): unknown[] {
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

function sessionDates(value: unknown): string[] {
  return sessionEntries(value).map((entry) => isoDate((entry as { date?: unknown })?.date));
}

/** The listed session's status, or null when the date is not one of the event's sessions. */
function sessionStatus(value: unknown, date: string): string | null {
  for (const entry of sessionEntries(value)) {
    const session = entry as { date?: unknown; status?: unknown };
    if (isoDate(session.date) === date) {
      return typeof session.status === 'string' ? session.status : 'scheduled';
    }
  }
  return null;
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

function textOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** A row-level rejection: the flattened detail stays stable and `rows` names the row. */
function importRowError(row: number, message: string): ImportError {
  return new ImportError(`Row ${row}: ${message}`, [{ row, message }]);
}

/**
 * Runs a field-validation pass over every row and reports all offenders, not just the first.
 * `detail` keeps the first failure's wording; the thrown error carries every rejected row.
 */
function prepareRows<TRow, TPrepared>(
  rows: TRow[],
  prepare: (row: TRow, rowNumber: number) => TPrepared,
): TPrepared[] {
  const prepared: TPrepared[] = [];
  const errors: ImportRowError[] = [];
  let firstMessage: string | null = null;

  for (const [index, row] of rows.entries()) {
    try {
      prepared.push(prepare(row, index + 1));
    } catch (error) {
      if (!(error instanceof ImportError) || !error.rows?.length) throw error;
      firstMessage ??= error.message;
      errors.push(...error.rows);
    }
  }

  if (firstMessage !== null) throw new ImportError(firstMessage, errors);
  return prepared;
}

interface PreparedMemberRow {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: Gender | undefined;
  dob: string | null;
  joinedOn: string | null;
  placeOfResidence: string | null;
  addressLine: string | null;
  isPresbyter: boolean | undefined;
  phone: string | null;
  email: string | null;
  /** 1-based row number for error reports. */
  rowNumber: number;
}

function requiredImportText(value: string | null | undefined, field: string, row: number): string {
  const trimmed = textOrNull(value);
  if (!trimmed) throw importRowError(row, `${field} is required`);
  return trimmed;
}

function importDate(value: string | null | undefined, field: string, row: number): string | null {
  const text = textOrNull(value);
  if (text === null) return null;
  try {
    return assertDate(text, field);
  } catch (error) {
    throw importRowError(row, (error as Error).message);
  }
}

function prepareMemberRow(row: MemberImportRow, rowNumber: number): PreparedMemberRow {
  let gender: Gender | undefined;
  if (row.gender !== undefined) {
    if (!GENDERS.includes(row.gender)) {
      throw importRowError(rowNumber, 'gender is not recognised');
    }
    gender = row.gender;
  }

  return {
    memberNo: requiredImportText(row.memberNo, 'memberNo', rowNumber),
    firstName: requiredImportText(row.firstName, 'firstName', rowNumber),
    lastName: requiredImportText(row.lastName, 'lastName', rowNumber),
    otherNames: textOrNull(row.otherNames),
    gender,
    dob: importDate(row.dob, 'dob', rowNumber),
    joinedOn: importDate(row.joinedOn, 'joinedOn', rowNumber),
    placeOfResidence: textOrNull(row.placeOfResidence),
    addressLine: textOrNull(row.addressLine),
    isPresbyter: row.isPresbyter,
    phone: textOrNull(row.phone),
    email: textOrNull(row.email),
    rowNumber,
  };
}

interface DuplicateMemberNo {
  memberNo: string;
  rows: number[];
}

function duplicateMemberNos(
  rows: Array<{ memberNo: string; rowNumber: number }>,
): DuplicateMemberNo[] {
  const seen = new Map<string, DuplicateMemberNo>();
  for (const row of rows) {
    const key = row.memberNo.toLowerCase();
    const entry = seen.get(key) ?? { memberNo: row.memberNo, rows: [] };
    entry.rows.push(row.rowNumber);
    seen.set(key, entry);
  }

  return [...seen.values()].filter((entry) => entry.rows.length > 1);
}

/** The flattened detail keeps its established wording, including every involved row. */
function duplicateMemberNoDetail(duplicates: DuplicateMemberNo[]): string {
  return duplicates.map((entry) => `${entry.memberNo} (rows ${entry.rows.join(', ')})`).join('; ');
}

/** One entry per involved row; a duplicate spans rows and repeats their shared message. */
function duplicateMemberNoRows(duplicates: DuplicateMemberNo[]): ImportRowError[] {
  return duplicates.flatMap((entry) => {
    const message = `Duplicate memberNo ${entry.memberNo} (rows ${entry.rows.join(', ')})`;
    return entry.rows.map((row) => ({ row, message }));
  });
}

interface PreparedAttendanceRow {
  memberNo: string;
  /** Wall-clock time the register carried, or null when only a date was given. */
  sessionTime: string | null;
  /** 1-based row number for error reports. */
  rowNumber: number;
}

/** `YYYY-MM-DD`, optionally followed by `T`, a lowercase `t`, or a space and `HH:MM[:SS]`. */
const IMPORT_DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parse a row's optional datetime by hand. No timezone conversion: the stored
 * `session_time` is the wall-clock time the register carried, and the date part
 * must be the occurrence the operator selected.
 */
function prepareAttendanceRow(
  row: AttendanceImportRow,
  rowNumber: number,
  sessionDate: string,
): PreparedAttendanceRow {
  const memberNo = requiredImportText(row.memberNo, 'memberNo', rowNumber);
  const raw = textOrNull(row.datetime);
  if (raw === null) return { memberNo, sessionTime: null, rowNumber };

  const match = IMPORT_DATETIME_PATTERN.exec(raw);
  if (!match) {
    throw importRowError(
      rowNumber,
      `datetime "${raw}" must be YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS]`,
    );
  }

  const date = match[1]!;
  try {
    assertDate(date, 'datetime');
  } catch (error) {
    throw importRowError(rowNumber, (error as Error).message);
  }
  if (date !== sessionDate) {
    throw importRowError(
      rowNumber,
      `datetime ${raw} is on ${date}, but the selected session is ${sessionDate}`,
    );
  }

  const hours = match[2];
  if (hours === undefined) return { memberNo, sessionTime: null, rowNumber };

  const minutes = match[3]!;
  const seconds = match[4] ?? '00';
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) {
    throw importRowError(rowNumber, `datetime ${raw} has a time outside 00:00:00-23:59:59`);
  }

  return { memberNo, sessionTime: `${hours}:${minutes}:${seconds}`, rowNumber };
}

type ExistingMember = {
  id: string;
  member_no: string;
  is_presbyter: boolean;
  archived_at: Date | string | null;
  purged_at: Date | string | null;
};

export class ImportRepository {
  constructor(private readonly db: Db) {}

  async importMembers(rows: MemberImportRow[], actor: string): Promise<ImportBatchDto> {
    assertRows(rows, 'rows');

    const prepared = prepareRows(rows, prepareMemberRow);
    const duplicates = duplicateMemberNos(prepared);
    if (duplicates.length > 0) {
      throw new ImportError(
        `Duplicate memberNo in the file: ${duplicateMemberNoDetail(duplicates)}`,
        duplicateMemberNoRows(duplicates),
      );
    }

    return this.db.transaction(async (tx) => {
      const batch = await this.createBatch(tx, 'members', rows, actor);
      const existing = await this.existingMembers(
        tx,
        prepared.map((row) => row.memberNo.toLowerCase()),
      );

      for (const row of prepared) {
        const current = existing.get(row.memberNo.toLowerCase());
        if (current?.purged_at) {
          throw importRowError(
            row.rowNumber,
            `member ${current.member_no} has been purged and cannot be resurrected`,
          );
        }
        if (current?.archived_at) {
          throw importRowError(
            row.rowNumber,
            `member ${current.member_no} is archived; restore it before importing`,
          );
        }

        const memberId = current
          ? await this.updateImportedMember(tx, current, row, actor)
          : await this.insertImportedMember(tx, row, actor);

        await this.importContact(tx, memberId, row, 'phone', row.phone);
        await this.importContact(tx, memberId, row, 'email', row.email);
      }

      return batch;
    });
  }

  async importAttendance(request: AttendanceImportRequest, actor: string): Promise<ImportBatchDto> {
    assertRows(request.rows, 'rows');

    const sessionDate = assertDate(request.sessionDate, 'sessionDate');
    // The checksum covers the targeted occurrence as well as the rows, so the
    // same member list against a different session is a different import.
    const batchChecksum = checksum({
      eventId: request.eventId,
      sessionDate,
      rows: request.rows,
    });

    return this.db.transaction(async (tx) => {
      const [event] = await tx.query<{
        event_no: string | null;
        name: string;
        status: string;
        series_id: string | null;
        sessions: unknown;
      }>('select event_no, name, status, series_id, sessions from event_instances where id = $1', [
        request.eventId,
      ]);
      if (!event) {
        throw new ImportError(`Unknown event id: ${request.eventId}`);
      }
      const eventLabel = event.event_no
        ? `Event ${event.event_no} (${event.name})`
        : `Event ${event.name}`;
      if (event.status === 'cancelled' || event.status === 'archived') {
        throw new ImportError(
          `${eventLabel} is ${event.status} and cannot accept an attendance import`,
        );
      }
      if (!event.series_id) {
        throw new ValidationError(
          'A standalone event cannot accept an attendance import; use a series-backed event',
          'series_required',
        );
      }
      if (!sessionDates(event.sessions).includes(sessionDate)) {
        throw new ImportError(`${eventLabel} has no session on ${sessionDate}`);
      }
      if (sessionStatus(event.sessions, sessionDate) === 'cancelled') {
        throw new ImportError(`The session on ${sessionDate} is cancelled and read-only`);
      }

      const [duplicate] = await tx.query<{ id: string }>(
        "select id from import_batches where kind = 'attendance' and checksum = $1",
        [batchChecksum],
      );
      if (duplicate) {
        throw new DuplicateImportError(
          `This attendance file was already imported (batch ${duplicate.id}).`,
          duplicate.id,
        );
      }

      const prepared = prepareRows(request.rows, (row, rowNumber) =>
        prepareAttendanceRow(row, rowNumber, sessionDate),
      );
      const duplicates = duplicateMemberNos(prepared);
      if (duplicates.length > 0) {
        throw new ImportError(
          `Duplicate memberNo in the file: ${duplicateMemberNoDetail(duplicates)}`,
          duplicateMemberNoRows(duplicates),
        );
      }

      const memberNos = [...new Set(prepared.map((row) => row.memberNo.toLowerCase()))];
      const members = await tx.query<{ id: string; member_no: string }>(
        'select id, member_no from members where lower(member_no) = any($1::text[]) and purged_at is null',
        [memberNos],
      );
      const memberMap = new Map(
        members.map((member) => [member.member_no.toLowerCase(), member.id]),
      );

      const unknownRows = prepared.filter((row) => !memberMap.has(row.memberNo.toLowerCase()));
      if (unknownRows.length > 0) {
        const unknownMembers = [...new Set(unknownRows.map((row) => row.memberNo))].sort();
        throw new ImportError(
          `Unknown member numbers: ${unknownMembers.join(', ')}`,
          unknownRows.map((row) => ({
            row: row.rowNumber,
            message: `Unknown member number ${row.memberNo}`,
          })),
        );
      }

      const [batchRow] = await tx.query<{ id: string; created_at: Date | string }>(
        `insert into import_batches (
           kind, actor, row_count, checksum, event_instance_id, session_date
         )
         values ('attendance',$1,$2,$3,$4,$5) returning id, created_at`,
        [actor, request.rows.length, batchChecksum, request.eventId, sessionDate],
      );
      const batchId = batchRow!.id;

      let written = 0;
      let skipped = 0;
      for (const row of prepared) {
        const memberId = memberMap.get(row.memberNo.toLowerCase())!;
        const inserted = await tx.query<{ id: string }>(
          `insert into attendance (
             member_id, event_instance_id, session_date, session_time,
             source, import_batch_id, created_by
           )
           select $1,$2,$3,$4::time,'import',$5,$6
           where not exists (
             select 1 from attendance_suppressions s
             where s.member_id = $1 and s.event_instance_id = $2 and s.session_date = $3
           )
           on conflict (event_instance_id, session_date, member_id) do update
             set source = 'import',
                 session_time = excluded.session_time,
                 import_batch_id = excluded.import_batch_id,
                 created_by = excluded.created_by
             where attendance.source <> 'manual'
           returning id`,
          [memberId, request.eventId, sessionDate, row.sessionTime, batchId, actor],
        );
        if (inserted.length > 0) written += 1;
        else skipped += 1;
      }

      await tx.query(
        'update import_batches set written_count = $2, skipped_count = $3 where id = $1',
        [batchId, written, skipped],
      );

      return {
        id: batchId,
        kind: 'attendance',
        actor,
        rowCount: request.rows.length,
        checksum: batchChecksum,
        eventInstanceId: request.eventId,
        sessionDate,
        written,
        skipped,
        createdAt: isoTimestamp(batchRow!.created_at),
      };
    });
  }

  async getBatch(id: string): Promise<ImportBatchDto> {
    const [row] = await this.db.query<{
      id: string;
      kind: 'members' | 'attendance' | 'events';
      actor: string;
      row_count: number;
      checksum: string;
      event_instance_id: string | null;
      session_date: Date | string | null;
      written_count: number | null;
      skipped_count: number | null;
      created_at: Date | string;
    }>(
      `select id, kind, actor, row_count, checksum, event_instance_id, session_date,
              written_count, skipped_count, created_at
       from import_batches where id = $1`,
      [id],
    );

    if (!row) throw new NotFoundError(`Import batch ${id} was not found`);

    return {
      id: row.id,
      kind: row.kind,
      actor: row.actor,
      rowCount: row.row_count,
      checksum: row.checksum,
      eventInstanceId: row.event_instance_id,
      sessionDate: row.session_date === null ? null : isoDate(row.session_date),
      written: row.written_count === null ? null : Number(row.written_count),
      skipped: row.skipped_count === null ? null : Number(row.skipped_count),
      createdAt: isoTimestamp(row.created_at),
    };
  }

  private async createBatch(
    tx: DbClient,
    kind: 'members' | 'attendance',
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
      eventInstanceId: null,
      sessionDate: null,
      written: null,
      skipped: null,
      createdAt: isoTimestamp(row!.created_at),
    };
  }

  private async existingMembers(
    tx: DbClient,
    memberNos: string[],
  ): Promise<Map<string, ExistingMember>> {
    const rows = await tx.query<ExistingMember>(
      `select id, member_no, is_presbyter, archived_at, purged_at
       from members where lower(member_no) = any($1::text[])`,
      [memberNos],
    );
    return new Map(rows.map((row) => [row.member_no.toLowerCase(), row]));
  }

  private async insertImportedMember(
    tx: DbClient,
    row: PreparedMemberRow,
    actor: string,
  ): Promise<string> {
    const [inserted] = await tx.query<{ id: string }>(
      `insert into members (
         member_no, first_name, last_name, other_names, gender, dob,
         place_of_residence, address_line, joined_on, is_presbyter, created_by, updated_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [
        row.memberNo,
        row.firstName,
        row.lastName,
        row.otherNames,
        row.gender ?? 'undisclosed',
        row.dob,
        row.placeOfResidence,
        row.addressLine,
        row.joinedOn,
        row.isPresbyter ?? false,
        actor,
        actor,
      ],
    );
    return inserted!.id;
  }

  private async updateImportedMember(
    tx: DbClient,
    current: ExistingMember,
    row: PreparedMemberRow,
    actor: string,
  ): Promise<string> {
    if (row.isPresbyter === false && current.is_presbyter) {
      const [active] = await tx.query<{ count: number | string }>(
        `select count(*)::int as count from shepherding_assignments
         where officer_member_id = $1 and ended_on is null`,
        [current.id],
      );
      const count = Number(active?.count ?? 0);
      if (count > 0) {
        throw importRowError(
          row.rowNumber,
          `member ${current.member_no} still shepherds ${count} member(s); reassign them before clearing the presbyter flag`,
        );
      }
    }

    const params: unknown[] = [current.id, row.firstName, row.lastName, actor];
    const set = [
      'first_name = $2',
      'last_name = $3',
      'version = version + 1',
      'updated_at = now()',
      'updated_by = $4',
    ];

    // A blank optional cell leaves the stored value unchanged; the import is
    // additive rather than a destructive snapshot of a partial file.
    const optional: Array<[string, unknown]> = [
      ['other_names', row.otherNames],
      ['dob', row.dob],
      ['place_of_residence', row.placeOfResidence],
      ['address_line', row.addressLine],
      ['joined_on', row.joinedOn],
      ['gender', row.gender],
      ['is_presbyter', row.isPresbyter],
    ];
    for (const [column, value] of optional) {
      if (value !== undefined && value !== null) {
        params.push(value);
        set.push(`${column} = $${params.length}`);
      }
    }

    await tx.query(`update members set ${set.join(', ')} where id = $1`, params);
    return current.id;
  }

  private async importContact(
    tx: DbClient,
    memberId: string,
    row: PreparedMemberRow,
    kind: ContactKind,
    value: string | null,
  ): Promise<void> {
    if (!value) return;

    let normalized: string;
    try {
      normalized = normalizeContactValue(kind, value);
    } catch (error) {
      throw importRowError(row.rowNumber, (error as Error).message);
    }

    const [existing] = await tx.query<{ id: string; member_id: string }>(
      'select id, member_id from member_contacts where normalized_value = $1',
      [normalized],
    );
    if (existing) {
      if (existing.member_id === memberId) return;
      throw importRowError(
        row.rowNumber,
        `this ${kind} already belongs to another member; correct or remove it`,
      );
    }

    const [next] = await tx.query<{ next: number | string }>(
      `select coalesce(max(display_order), 0) + 1 as next
       from member_contacts where member_id = $1`,
      [memberId],
    );
    await tx.query(
      `insert into member_contacts (member_id, kind, value, normalized_value, display_order)
       values ($1,$2,$3,$4,$5)`,
      [memberId, kind, value.trim(), normalized, Number(next!.next)],
    );
  }
}
