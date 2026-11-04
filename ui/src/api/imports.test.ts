import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import {
  downloadImportTemplate,
  filenameFromContentDisposition,
  getImportBatch,
  getImportFormats,
  importProblemRows,
  postMemberImport,
  type ImportBatch,
  type ImportFormat,
} from './imports';

const BASE = 'https://gateway.test';
const TOKEN = 'session-token';

const MEMBER_FORMAT: ImportFormat = {
  kind: 'members',
  filename: 'members-import-template.xlsx',
  columns: [
    { name: 'memberNo', required: true, type: 'text', example: 'M-1001' },
    { name: 'firstName', required: true, type: 'text', example: 'Ama' },
    { name: 'lastName', required: true, type: 'text', example: 'Mensah' },
  ],
};

const BATCH: ImportBatch = {
  id: 'batch-1',
  kind: 'members',
  actor: 'officer-1',
  rowCount: 2,
  checksum: 'abc',
  createdAt: '2026-11-04T10:00:00.000Z',
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestOptions(call: number): RequestInit {
  return (fetchMock.mock.calls[call]?.[1] ?? {}) as RequestInit;
}

describe('getImportFormats', () => {
  it('GETs the formats through the gateway with the session bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ formats: [MEMBER_FORMAT] }));

    const formats = await getImportFormats(BASE, TOKEN);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/imports/formats`);
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(formats).toEqual([MEMBER_FORMAT]);
  });
});

describe('downloadImportTemplate', () => {
  it('fetches the workbook with the bearer and reads the header filename', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Blob(['xlsx']), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="members.xlsx"',
        },
      }),
    );

    const result = await downloadImportTemplate(BASE, TOKEN, 'members');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/imports/templates/members`);
    expect(requestOptions(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(result.filename).toBe('members.xlsx');
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it("falls back to the format's filename when the header carries none", async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['xlsx']), { status: 200 }));

    const result = await downloadImportTemplate(BASE, TOKEN, 'members', MEMBER_FORMAT.filename);

    expect(result.filename).toBe('members-import-template.xlsx');
  });

  it('turns an error response into an ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'not_found', detail: 'Import kind was not found' }, 404),
    );

    await expect(downloadImportTemplate(BASE, TOKEN, 'members')).rejects.toMatchObject({
      status: 404,
      message: 'Import kind was not found',
    });
  });
});

describe('filenameFromContentDisposition', () => {
  it('handles quoted, plain and RFC 5987 filenames', () => {
    expect(filenameFromContentDisposition('attachment; filename="a.xlsx"')).toBe('a.xlsx');
    expect(filenameFromContentDisposition('attachment; filename=a.xlsx')).toBe('a.xlsx');
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''members%20template.xlsx"),
    ).toBe('members template.xlsx');
    expect(filenameFromContentDisposition(null)).toBeNull();
  });
});

describe('postMemberImport', () => {
  it('POSTs the normalised rows as { rows } and returns the batch', async () => {
    fetchMock.mockResolvedValue(jsonResponse(BATCH, 201));
    const rows = [
      { memberNo: 'M-1', firstName: 'Ama', lastName: 'Mensah' },
      { memberNo: 'M-2', firstName: 'Kofi', lastName: 'Appiah' },
    ];

    const batch = await postMemberImport(BASE, TOKEN, rows);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/imports/members`);
    const options = requestOptions(0);
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(JSON.parse(String(options.body))).toEqual({ rows });
    expect(batch).toEqual(BATCH);
  });
});

describe('getImportBatch', () => {
  it('GETs an encoded batch id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(BATCH));

    const batch = await getImportBatch(BASE, TOKEN, 'batch/../1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/gateway/v1/imports/batch%2F..%2F1`);
    expect(batch).toEqual(BATCH);
  });
});

describe('importProblemRows', () => {
  it('reads row-level reasons from a 422 problem body', () => {
    const error = new ApiError(422, 'The import failed.', {
      rows: [
        { row: 2, message: 'firstName is required' },
        { row: 4, message: 'unknown member number M-9' },
        { row: 'nope', message: 'ignored' },
      ],
    });

    expect(importProblemRows(error)).toEqual([
      { row: 2, message: 'firstName is required' },
      { row: 4, message: 'unknown member number M-9' },
    ]);
  });

  it('returns an empty list for other errors', () => {
    expect(importProblemRows(new ApiError(409, 'Already imported.'))).toEqual([]);
    expect(importProblemRows(new Error('nope'))).toEqual([]);
  });
});
