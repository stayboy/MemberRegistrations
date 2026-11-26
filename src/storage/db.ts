import type { DbClient } from '../db/sql.js';
import type { FlierLocator, FlierStore, FlierWrite } from './flier-store.js';

/**
 * The register adapter: the bytes live in `event_fliers.bytes`, the fallback
 * when no object store is configured (N-9), so a clone with no bucket still
 * serves a flier. Reads go through the table rather than the caller's copy, so
 * the served bytes are the stored ones in both adapters.
 */
export function createDbFlierStore(db: DbClient): FlierStore {
  return {
    storage: 'db',

    async save(_token: string, bytes: Uint8Array): Promise<FlierWrite> {
      // The caller puts these bytes in the row it inserts; the register is the
      // object, so there is nothing outside it to write.
      return { storageKey: null, inlineBytes: bytes };
    },

    async load(locator: FlierLocator): Promise<Uint8Array | null> {
      const [row] = await db.query<{ bytes: Uint8Array | null }>(
        'select bytes from event_fliers where token = $1',
        [locator.token],
      );
      return row?.bytes ?? locator.inlineBytes;
    },

    async discard(): Promise<void> {
      // Deleting the row deletes the bytes; there is no second object.
    },
  };
}
