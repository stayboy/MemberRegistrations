import type { ImportKind } from '../api/imports';

/**
 * The session-scoped batch list from FR-38. Only metadata is kept: never rows,
 * file contents or personal data. `sessionStorage` is passed in at the call site
 * so this module stays pure and testable.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredImportBatch {
  readonly id: string;
  readonly kind: ImportKind;
  readonly rowCount: number;
  readonly createdAt: string;
}

export const IMPORT_BATCHES_KEY = 'mr.imports.v1';
export const MAX_STORED_BATCHES = 20;

function isStoredBatch(value: unknown): value is StoredImportBatch {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    (candidate.kind === 'members' ||
      candidate.kind === 'attendance' ||
      candidate.kind === 'events') &&
    typeof candidate.rowCount === 'number' &&
    typeof candidate.createdAt === 'string'
  );
}

function dedupe(batches: readonly StoredImportBatch[]): StoredImportBatch[] {
  const seen = new Set<string>();
  return batches.filter((batch) => {
    if (seen.has(batch.id)) return false;
    seen.add(batch.id);
    return true;
  });
}

/** Newest first; a malformed or missing entry yields an empty list. */
export function readBatches(storage: StorageLike): StoredImportBatch[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.getItem(IMPORT_BATCHES_KEY) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return dedupe(parsed.filter(isStoredBatch)).slice(0, MAX_STORED_BATCHES);
}

/** Dedupes by id, puts the new batch first and caps the list at 20 entries. */
export function recordBatch(storage: StorageLike, batch: StoredImportBatch): StoredImportBatch[] {
  const next = dedupe([
    batch,
    ...readBatches(storage).filter((entry) => entry.id !== batch.id),
  ]).slice(0, MAX_STORED_BATCHES);

  try {
    storage.setItem(IMPORT_BATCHES_KEY, JSON.stringify(next));
  } catch {
    // A full or unavailable store must not turn a successful import into a
    // failure; the batch still exists on the server and its id is on screen.
  }
  return next;
}

export function clearBatches(storage: StorageLike): void {
  storage.removeItem(IMPORT_BATCHES_KEY);
}
