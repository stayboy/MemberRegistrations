import Papa from 'papaparse';
import type { ImportFormatColumn, MemberGender, MemberImportRow } from '../api/imports';

/**
 * Pure import parsing and validation: CSV text or an `.xlsx` matrix becomes the
 * API's JSON row shapes, with cell values normalised before the preview and the
 * commit so both send the same bytes (FR-33, FR-34).
 */

export interface ImportRowError {
  /** 1-based over the data rows, matching the API's `422` body. */
  readonly row: number;
  readonly message: string;
}

export interface ParsedImportRows<Row> {
  readonly rows: readonly Row[];
  readonly errors: readonly ImportRowError[];
}

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 1_048_576;

/** The API's `importMemberNoSchema`. */
export const MEMBER_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

const GENDERS: readonly MemberGender[] = ['male', 'female', 'other', 'undisclosed'];

function requiredNames(columns: readonly ImportFormatColumn[]): Set<string> {
  return new Set(columns.filter((column) => column.required).map((column) => column.name));
}

/**
 * Normalises one cell to the API's string shape: Date to `YYYY-MM-DD` (UTC, never
 * a local-time shift), boolean to `true`/`false`, number to a trimmed string and
 * null/undefined/empty to null so optional columns are omitted.
 */
export function normaliseCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  const text = String(value)
    .replace(/^\uFEFF/, '')
    .trim();
  return text.length > 0 ? text : null;
}

/** True only for a real UTC calendar date in `YYYY-MM-DD` form. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function parseBooleanCell(value: string): boolean | null {
  const text = value.toLowerCase();
  if (text === 'true' || text === 'yes' || text === '1') return true;
  if (text === 'false' || text === 'no' || text === '0') return false;
  return null;
}

/** Maps a header row by column name, case-insensitively and trimmed. */
export function mapHeaderRow(
  headerRow: readonly unknown[],
  expected: readonly string[],
): Map<string, number> {
  const byLowerCase = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const name = normaliseCell(cell)?.toLowerCase();
    if (name && !byLowerCase.has(name)) byLowerCase.set(name, index);
  });

  const index = new Map<string, number>();
  for (const name of expected) {
    const at = byLowerCase.get(name.toLowerCase());
    if (at !== undefined) index.set(name, at);
  }
  return index;
}

function cellAt(
  cells: readonly unknown[],
  headerIndex: ReadonlyMap<string, number>,
  name: string,
): unknown {
  const at = headerIndex.get(name);
  return at === undefined ? undefined : cells[at];
}

interface MemberRowDraft {
  memberNo: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  gender?: MemberGender;
  dob?: string;
  joinedOn?: string;
  placeOfResidence?: string;
  addressLine?: string;
  isPresbyter?: boolean;
  phone?: string;
  email?: string;
}

function buildMemberRow(
  cells: readonly unknown[],
  headerIndex: ReadonlyMap<string, number>,
  row: number,
  required: ReadonlySet<string>,
): { row: MemberImportRow; errors: ImportRowError[] } {
  const errors: ImportRowError[] = [];
  const fail = (message: string): void => {
    errors.push({ row, message });
  };

  const text = (name: string): string | undefined =>
    normaliseCell(cellAt(cells, headerIndex, name)) ?? undefined;

  const requiredText = (name: string): string => {
    const value = text(name);
    if (!value) {
      if (required.has(name)) fail(`${name} is required`);
      return '';
    }
    return value;
  };

  const memberNo = requiredText('memberNo');
  if (memberNo && !MEMBER_NO_PATTERN.test(memberNo)) {
    fail('memberNo must be 1-32 characters using letters, digits, hyphens or underscores');
  }

  const firstName = requiredText('firstName');
  const lastName = requiredText('lastName');

  const genderText = text('gender');
  let gender: MemberGender | undefined;
  if (genderText) {
    const candidate = genderText.toLowerCase();
    if ((GENDERS as readonly string[]).includes(candidate)) {
      gender = candidate as MemberGender;
    } else {
      fail('gender must be male, female, other or undisclosed');
    }
  }

  const date = (name: string): string | undefined => {
    const value = text(name);
    if (!value) return undefined;
    if (!isCalendarDate(value)) {
      fail(`${name} must be a calendar date (YYYY-MM-DD)`);
      return undefined;
    }
    return value;
  };

  const flagText = text('isPresbyter');
  let isPresbyter: boolean | undefined;
  if (flagText) {
    const flag = parseBooleanCell(flagText);
    if (flag === null) {
      fail('isPresbyter must be TRUE or FALSE');
    } else {
      isPresbyter = flag;
    }
  }

  // Required columns beyond the three explicit member fields still follow the
  // API's published contract rather than a second client-side list.
  for (const name of required) {
    if (name === 'memberNo' || name === 'firstName' || name === 'lastName') continue;
    if (text(name) === undefined) fail(`${name} is required`);
  }

  const draft: MemberRowDraft = {
    memberNo,
    firstName,
    lastName,
    otherNames: text('otherNames'),
    gender,
    dob: date('dob'),
    joinedOn: date('joinedOn'),
    placeOfResidence: text('placeOfResidence'),
    addressLine: text('addressLine'),
    isPresbyter,
    phone: text('phone'),
    email: text('email'),
  };

  const defined = Object.fromEntries(
    Object.entries(draft).filter(([, value]) => value !== undefined),
  ) as MemberImportRow;
  return { row: defined, errors };
}

/**
 * Turns a matrix (a CSV's rows or an `.xlsx` sheet) into member import rows.
 * Blank rows are skipped, headers are matched by name and every invalid cell is
 * reported against its 1-based data row.
 */
export function parseMemberMatrix(
  matrix: readonly (readonly unknown[])[],
  columns: readonly ImportFormatColumn[],
): ParsedImportRows<MemberImportRow> {
  const data = matrix.filter((row) => row.some((cell) => normaliseCell(cell) !== null));
  if (data.length === 0) throw new Error('The file has no header row.');

  const headerIndex = mapHeaderRow(
    data[0] ?? [],
    columns.map((column) => column.name),
  );
  const required = requiredNames(columns);
  const missing = [...required].filter((name) => !headerIndex.has(name));
  if (missing.length > 0) {
    throw new Error(`The file is missing required columns: ${missing.join(', ')}.`);
  }

  const rows: MemberImportRow[] = [];
  const errors: ImportRowError[] = [];

  data.slice(1).forEach((cells, index) => {
    const rowNumber = index + 1;
    const built = buildMemberRow(cells, headerIndex, rowNumber, required);
    rows.push(built.row);
    errors.push(...built.errors);
  });

  if (rows.length === 0) throw new Error('The file has a header row but no data rows.');
  return { rows, errors };
}

/** Parses CSV text, including quoted commas, CRLF and a leading BOM. */
export function parseMemberCsv(
  text: string,
  columns: readonly ImportFormatColumn[],
): ParsedImportRows<MemberImportRow> {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy',
  });

  const fatal = result.errors.find((error) => error.type !== 'Delimiter');
  if (fatal) {
    throw new Error(`The CSV could not be read: ${fatal.message}`);
  }

  return parseMemberMatrix(result.data, columns);
}

/**
 * The API's per-request limits (FR-35). Returns a split-guidance message, or
 * null when the rows fit. The UI never chunks automatically.
 */
export function checkImportLimits(rows: readonly unknown[]): string | null {
  if (rows.length === 0) return 'This file has no data rows to import.';
  if (rows.length > MAX_IMPORT_ROWS) {
    return `This file has ${rows.length} rows; an import accepts at most ${MAX_IMPORT_ROWS}. Split the file and import each part separately.`;
  }

  const bytes = new TextEncoder().encode(JSON.stringify({ rows })).byteLength;
  if (bytes > MAX_IMPORT_BYTES) {
    return `The parsed rows are ${bytes} bytes; an import accepts at most ${MAX_IMPORT_BYTES}. Split the file and import each part separately.`;
  }
  return null;
}
