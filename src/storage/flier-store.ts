/**
 * The flier store port (member-registrations-event-notifications.md N-9).
 *
 * A flier is one object: its bytes, addressed by the token in the public URL.
 * The row in `event_fliers` is the metadata and names the store, so the same
 * code runs against a `bytea` column locally and any S3-compatible target in a
 * hosted deployment. Nothing here knows a vendor's vocabulary, and no bucket is
 * ever exposed: the app streams every download itself.
 *
 * `save` returns what the row must record. The `db` store answers with the bytes
 * themselves (the register is the object), the `s3` store with the key it wrote;
 * that is why the row's shape check permits exactly one of the two.
 */
export interface FlierWrite {
  /** The object key, for a store that keeps bytes outside the register. */
  storageKey: string | null;
  /** The bytes, for the store that keeps them in the register. */
  inlineBytes: Uint8Array | null;
}

/** Where a stored flier is, as the row recorded it. */
export interface FlierLocator {
  token: string;
  storageKey: string | null;
  /** The row's `bytes`, when the `db` store is configured. */
  inlineBytes: Uint8Array | null;
}

export interface FlierStore {
  readonly storage: 'db' | 's3';
  save(token: string, bytes: Uint8Array): Promise<FlierWrite>;
  /** The object's bytes, or null when the store no longer has it. */
  load(locator: FlierLocator): Promise<Uint8Array | null>;
  /** Removes the object; removing one that is already gone is not an error. */
  discard(locator: FlierLocator): Promise<void>;
}

/** The storage key every adapter uses, so a moved flier keeps its address (N-9). */
export function flierStorageKey(token: string): string {
  return `fliers/${token}`;
}
