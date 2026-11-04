import { describe, expect, it } from 'vitest';
import {
  clearBatches,
  IMPORT_BATCHES_KEY,
  MAX_STORED_BATCHES,
  readBatches,
  recordBatch,
  type StorageLike,
} from './import-batches';

class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function batch(id: string, rowCount = 2) {
  return {
    id,
    kind: 'members' as const,
    rowCount,
    createdAt: '2026-11-04T10:00:00.000Z',
  };
}

describe('session batch list', () => {
  it('uses the repo session-storage namespace', () => {
    expect(IMPORT_BATCHES_KEY).toBe('mr.imports.v1');
  });

  it('records newest first and only metadata', () => {
    const storage = new FakeStorage();

    recordBatch(storage, batch('batch-1', 2));
    recordBatch(storage, batch('batch-2', 5));

    expect(readBatches(storage).map((entry) => entry.id)).toEqual(['batch-2', 'batch-1']);
    const stored = JSON.parse(storage.getItem(IMPORT_BATCHES_KEY) ?? '[]') as unknown[];
    expect(stored[0]).toEqual(batch('batch-2', 5));
    expect(JSON.stringify(stored)).not.toContain('rows');
  });

  it('dedupes by id and keeps the newest copy', () => {
    const storage = new FakeStorage();

    recordBatch(storage, batch('batch-1', 2));
    recordBatch(storage, batch('batch-2', 3));
    recordBatch(storage, batch('batch-1', 9));

    expect(readBatches(storage)).toEqual([batch('batch-1', 9), batch('batch-2', 3)]);
  });

  it(`caps the list at ${MAX_STORED_BATCHES} entries`, () => {
    const storage = new FakeStorage();

    for (let index = 0; index < MAX_STORED_BATCHES + 5; index += 1) {
      recordBatch(storage, batch(`batch-${index}`));
    }

    const entries = readBatches(storage);
    expect(entries).toHaveLength(MAX_STORED_BATCHES);
    expect(entries[0]?.id).toBe(`batch-${MAX_STORED_BATCHES + 4}`);
    expect(entries.at(-1)?.id).toBe('batch-5');
  });

  it('reads an empty list from malformed or missing storage', () => {
    const storage = new FakeStorage();
    expect(readBatches(storage)).toEqual([]);

    storage.setItem(IMPORT_BATCHES_KEY, 'not json');
    expect(readBatches(storage)).toEqual([]);

    storage.setItem(IMPORT_BATCHES_KEY, JSON.stringify([{ id: 'x' }]));
    expect(readBatches(storage)).toEqual([]);
  });

  it('does not let a failing store break the import', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
    };

    expect(recordBatch(storage, batch('batch-1'))).toEqual([batch('batch-1')]);
  });

  it('clears the list', () => {
    const storage = new FakeStorage();
    recordBatch(storage, batch('batch-1'));

    clearBatches(storage);

    expect(readBatches(storage)).toEqual([]);
    expect(storage.getItem(IMPORT_BATCHES_KEY)).toBeNull();
  });
});
