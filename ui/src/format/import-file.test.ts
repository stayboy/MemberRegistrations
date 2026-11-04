import { describe, expect, it } from 'vitest';
import type { ImportFormatColumn } from '../api/imports';
import {
  checkImportLimits,
  isCalendarDate,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  normaliseCell,
  parseMemberCsv,
  parseMemberMatrix,
} from './import-file';

/** The member contract as `GET /v1/imports/formats` publishes it. */
const MEMBER_COLUMNS: readonly ImportFormatColumn[] = [
  { name: 'memberNo', required: true, type: 'text', example: 'M-1001' },
  { name: 'firstName', required: true, type: 'text', example: 'Ama' },
  { name: 'lastName', required: true, type: 'text', example: 'Mensah' },
  { name: 'otherNames', required: false, type: 'text', example: 'Adwoa' },
  { name: 'gender', required: false, type: 'enum', example: 'female' },
  { name: 'dob', required: false, type: 'date', example: '1990-05-14' },
  { name: 'joinedOn', required: false, type: 'date', example: '2026-01-04' },
  { name: 'placeOfResidence', required: false, type: 'text', example: 'Accra' },
  { name: 'addressLine', required: false, type: 'text', example: '12 Independence Avenue' },
  { name: 'isPresbyter', required: false, type: 'boolean', example: false },
  { name: 'phone', required: false, type: 'text', example: '08012345678' },
  { name: 'email', required: false, type: 'text', example: 'ama@example.com' },
];

describe('cell normalisation', () => {
  it('formats a Date as a UTC calendar date', () => {
    expect(normaliseCell(new Date(Date.UTC(1990, 4, 14)))).toBe('1990-05-14');
  });

  it('normalises booleans, numbers and blank values', () => {
    expect(normaliseCell(true)).toBe('true');
    expect(normaliseCell(false)).toBe('false');
    expect(normaliseCell(42)).toBe('42');
    expect(normaliseCell('  42  ')).toBe('42');
    expect(normaliseCell('')).toBeNull();
    expect(normaliseCell('   ')).toBeNull();
    expect(normaliseCell(null)).toBeNull();
    expect(normaliseCell(undefined)).toBeNull();
  });

  it('validates only real calendar dates', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('26-02-28')).toBe(false);
    expect(isCalendarDate('2026-02-28T09:00')).toBe(false);
  });
});

describe('CSV parsing', () => {
  it('keeps quoted commas inside one cell', () => {
    const parsed = parseMemberCsv(
      'memberNo,firstName,lastName,otherNames,addressLine\n' +
        'M-1,Ama,Mensah,"Adwoa, Jr.","12 Independence Avenue, Accra"\n',
      MEMBER_COLUMNS,
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      memberNo: 'M-1',
      otherNames: 'Adwoa, Jr.',
      addressLine: '12 Independence Avenue, Accra',
    });
  });

  it('accepts CRLF, a BOM, blank lines and trimmed headers of any case', () => {
    const csv =
      '\uFEFF MemberNo , FIRSTNAME ,lastname\r\n' +
      'M-1,Ama,Mensah\r\n' +
      '\r\n' +
      '   \r\n' +
      'M-2,Kofi,Appiah\r\n';

    const parsed = parseMemberCsv(csv, MEMBER_COLUMNS);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((row) => row.memberNo)).toEqual(['M-1', 'M-2']);
    expect(parsed.rows[1]?.lastName).toBe('Appiah');
  });

  it('omits optional cells that are blank', () => {
    const parsed = parseMemberCsv(
      'memberNo,firstName,lastName,phone,dob\nM-1,Ama,Mensah,,\n',
      MEMBER_COLUMNS,
    );
    const row = parsed.rows[0]!;

    expect(row).not.toHaveProperty('phone');
    expect(row).not.toHaveProperty('dob');
  });

  it('reports missing required headers as a parse failure', () => {
    expect(() => parseMemberCsv('memberNo,firstName\nM-1,Ama\n', MEMBER_COLUMNS)).toThrow(
      /missing required columns: lastName/,
    );
  });

  it('follows the published required flags rather than a second client list', () => {
    const optionalLastName = MEMBER_COLUMNS.map((column) =>
      column.name === 'lastName' ? { ...column, required: false } : column,
    );

    const parsed = parseMemberCsv('memberNo,firstName\nM-1,Ama\n', optionalLastName);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.memberNo).toBe('M-1');
  });
});

describe('matrix parsing', () => {
  it('normalises Date, boolean and number cells into API shapes', () => {
    const parsed = parseMemberMatrix(
      [
        ['memberNo', 'firstName', 'lastName', 'dob', 'isPresbyter', 'phone'],
        ['M-1', 'Ama', 'Mensah', new Date(Date.UTC(1990, 4, 14)), true, 8012345678],
      ],
      MEMBER_COLUMNS,
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual({
      memberNo: 'M-1',
      firstName: 'Ama',
      lastName: 'Mensah',
      dob: '1990-05-14',
      isPresbyter: true,
      phone: '8012345678',
    });
  });

  it('reports row numbers and reasons for invalid required, pattern and date cells', () => {
    const parsed = parseMemberMatrix(
      [
        ['memberNo', 'firstName', 'lastName', 'dob'],
        ['M-1', '', 'Mensah', '1990-05-14'],
        ['M 2', 'Kofi', 'Appiah', '14/05/1990'],
      ],
      MEMBER_COLUMNS,
    );

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.errors).toEqual([
      { row: 1, message: 'firstName is required' },
      {
        row: 2,
        message: 'memberNo must be 1-32 characters using letters, digits, hyphens or underscores',
      },
      { row: 2, message: 'dob must be a calendar date (YYYY-MM-DD)' },
    ]);
  });

  it('rejects an unknown gender and boolean flag', () => {
    const parsed = parseMemberMatrix(
      [
        ['memberNo', 'firstName', 'lastName', 'gender', 'isPresbyter'],
        ['M-1', 'Ama', 'Mensah', 'girl', 'sometimes'],
      ],
      MEMBER_COLUMNS,
    );

    expect(parsed.errors).toEqual([
      { row: 1, message: 'gender must be male, female, other or undisclosed' },
      { row: 1, message: 'isPresbyter must be TRUE or FALSE' },
    ]);
  });
});

describe('import limits', () => {
  it('accepts exactly 10,000 rows', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, index) => ({
      memberNo: `M-${index}`,
      firstName: 'Ama',
      lastName: 'Mensah',
    }));

    expect(checkImportLimits(rows)).toBeNull();
  });

  it('rejects 10,001 rows with split guidance', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({}));
    const message = checkImportLimits(rows);

    expect(message).toContain('10001 rows');
    expect(message).toContain('at most 10000');
    expect(message).toContain('Split the file');
  });

  it('rejects serialised rows over 1,048,576 bytes with split guidance', () => {
    const rows = [{ memberNo: 'M-1', note: 'x'.repeat(MAX_IMPORT_BYTES) }];
    const message = checkImportLimits(rows);

    expect(message).toContain(`${MAX_IMPORT_BYTES}`);
    expect(message).toContain('Split the file');
  });

  it('rejects an empty file', () => {
    expect(checkImportLimits([])).toMatch(/no data rows/);
  });
});
