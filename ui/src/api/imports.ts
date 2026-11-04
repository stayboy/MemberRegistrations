import { ApiError, toApiError } from './errors';
import { gatewayRequest } from './gateway';

/** Wire types mirror the UI spec's §9 DTOs and `src/schemas/imports.ts`. */

export type ImportKind = 'members' | 'attendance' | 'events';
export type ImportColumnType = 'text' | 'enum' | 'date' | 'boolean';

export interface ImportFormatColumn {
  readonly name: string;
  readonly required: boolean;
  readonly type: ImportColumnType;
  readonly example: string | boolean;
  readonly notes?: string;
}

export interface ImportFormat {
  readonly kind: Exclude<ImportKind, 'events'>;
  readonly filename: string;
  readonly columns: readonly ImportFormatColumn[];
}

export interface ImportBatch {
  readonly id: string;
  /** `events` stays readable for legacy batches. */
  readonly kind: ImportKind;
  readonly actor: string;
  readonly rowCount: number;
  readonly checksum: string;
  readonly createdAt: string;
  readonly eventInstanceId?: string | null;
  readonly sessionDate?: string | null;
  readonly written?: number | null;
  readonly skipped?: number | null;
}

export type MemberGender = 'male' | 'female' | 'other' | 'undisclosed';

/** Mirrors `memberImportSchema` in `src/schemas/imports.ts`. */
export interface MemberImportRow {
  readonly memberNo: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly otherNames?: string;
  readonly gender?: MemberGender;
  readonly dob?: string;
  readonly joinedOn?: string;
  readonly placeOfResidence?: string;
  readonly addressLine?: string;
  readonly isPresbyter?: boolean;
  readonly phone?: string;
  readonly email?: string;
}

/** The `rows` member of a `422 import_failed` problem body. */
export interface ImportRowProblem {
  readonly row: number;
  readonly message: string;
}

export interface ImportFormatsResponse {
  readonly formats: readonly ImportFormat[];
}

export interface DownloadedTemplate {
  readonly blob: Blob;
  readonly filename: string;
}

const IMPORTS_PATH = '/gateway/v1/imports';

/** `GET /v1/imports/formats`: the single column contract for both imports (FR-41). */
export async function getImportFormats(
  baseUrl: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<ImportFormat[]> {
  const result = await gatewayRequest<ImportFormatsResponse>(baseUrl, `${IMPORTS_PATH}/formats`, {
    sessionToken,
    signal,
  });
  if (!result) throw new ApiError(500, 'The import formats response was empty.');
  return [...result.formats];
}

/**
 * Reads the filename out of `Content-Disposition`, including the RFC 5987
 * `filename*=UTF-8''…` form. Returns null when the header carries none.
 */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;

  const extended = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (extended?.[1]) {
    const raw = extended[1].trim().replace(/^"|"$/g, '');
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];

  const plain = /filename\s*=\s*([^;]+)/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

/**
 * Fetches the Excel template with the session bearer. This is deliberately a
 * fetch-to-Blob rather than a bare link, because a link cannot carry the
 * Authorization header (FR-41).
 */
export async function downloadImportTemplate(
  baseUrl: string,
  sessionToken: string,
  kind: Exclude<ImportKind, 'events'>,
  fallbackFilename = `${kind}-import-template.xlsx`,
  signal?: AbortSignal,
): Promise<DownloadedTemplate> {
  const response = await fetch(`${baseUrl}${IMPORTS_PATH}/templates/${encodeURIComponent(kind)}`, {
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      Authorization: `Bearer ${sessionToken}`,
    },
    signal,
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok) throw await toApiError(response);

  return {
    blob: await response.blob(),
    filename:
      filenameFromContentDisposition(response.headers.get('Content-Disposition')) ??
      fallbackFilename,
  };
}

export async function postMemberImport(
  baseUrl: string,
  sessionToken: string,
  rows: readonly MemberImportRow[],
): Promise<ImportBatch> {
  const batch = await gatewayRequest<ImportBatch>(baseUrl, `${IMPORTS_PATH}/members`, {
    method: 'POST',
    body: { rows },
    sessionToken,
  });
  if (!batch) throw new ApiError(500, 'The import response was empty.');
  return batch;
}

/** `GET /v1/imports/:batchId`; the API has no list endpoint (FR-38). */
export async function getImportBatch(
  baseUrl: string,
  sessionToken: string,
  batchId: string,
  signal?: AbortSignal,
): Promise<ImportBatch> {
  const batch = await gatewayRequest<ImportBatch>(
    baseUrl,
    `${IMPORTS_PATH}/${encodeURIComponent(batchId)}`,
    { sessionToken, signal },
  );
  if (!batch) throw new ApiError(500, 'The import batch response was empty.');
  return batch;
}

/**
 * Extracts the row-level reasons from an `import_failed` problem body so the
 * preview and the API's `422` render the same way (FR-37).
 */
export function importProblemRows(error: unknown): ImportRowProblem[] {
  if (!(error instanceof ApiError) || !error.problem) return [];
  const rows = error.problem.rows;
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const candidate = entry as { row?: unknown; message?: unknown };
    if (typeof candidate.row !== 'number' || typeof candidate.message !== 'string') return [];
    return [{ row: candidate.row, message: candidate.message }];
  });
}
