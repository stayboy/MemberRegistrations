import type { OfferingCount } from '../api/offering-counts';
import { formatMoneyMinor } from './welfare';

/**
 * Pure helpers for the `#/ussd/offerings` operator page. A count row is a
 * denomination value in minor units plus a piece count under edit; the API
 * contract is `{ denominationMinor, pieces }` and the total is derived.
 */

export interface CountRowDraft {
  /** The denomination in minor units; stable and unique within one count. */
  readonly denominationMinor: number;
  readonly pieces: string;
}

/** GHS notes in minor units, largest first (GHS 200 … GHS 1). */
export const GHS_NOTE_MINORS: readonly number[] = [
  20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100,
];

/** GHS coins in minor units, largest first (50p … 5p). */
export const GHS_COIN_MINORS: readonly number[] = [50, 20, 10, 5];

/** The server's bound on one denomination value (`offering-counts.ts`). */
export const MAX_DENOMINATION_MINOR = 10_000_000;
export const MAX_PIECES = 1_000_000;
/** The server caps one count at 50 denomination lines. */
export const MAX_LINES = 50;

export function quickPickVisible(currency: string): boolean {
  return currency === 'GHS';
}

export function denominationLabel(denominationMinor: number, currency: string): string {
  return formatMoneyMinor(denominationMinor, currency);
}

export function emptyCountRows(): CountRowDraft[] {
  return [];
}

function parsePieces(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * Adds one piece of a denomination, creating the row when it is new. A repeated
 * quick-pick therefore increments the visible row instead of duplicating it.
 */
export function addDenomination(
  rows: readonly CountRowDraft[],
  denominationMinor: number,
): CountRowDraft[] {
  const existing = rows.find((row) => row.denominationMinor === denominationMinor);
  if (!existing) {
    if (rows.length >= MAX_LINES) return [...rows];
    return [...rows, { denominationMinor, pieces: '1' }].sort(
      (left, right) => right.denominationMinor - left.denominationMinor,
    );
  }
  const current = parsePieces(existing.pieces) ?? 0;
  return rows.map((row) =>
    row.denominationMinor === denominationMinor
      ? { ...row, pieces: String(Math.min(current + 1, MAX_PIECES)) }
      : row,
  );
}

export function setPieces(
  rows: readonly CountRowDraft[],
  denominationMinor: number,
  pieces: string,
): CountRowDraft[] {
  return rows.map((row) =>
    row.denominationMinor === denominationMinor ? { ...row, pieces } : row,
  );
}

export function removeDenomination(
  rows: readonly CountRowDraft[],
  denominationMinor: number,
): CountRowDraft[] {
  return rows.filter((row) => row.denominationMinor !== denominationMinor);
}

export function rowsFromObservation(count: OfferingCount): CountRowDraft[] {
  return count.lines
    .map((line) => ({ denominationMinor: line.denominationMinor, pieces: String(line.pieces) }))
    .sort((left, right) => right.denominationMinor - left.denominationMinor);
}

/** The live total: blank or invalid rows contribute zero until corrected. */
export function countTotalMinor(rows: readonly CountRowDraft[]): number {
  let total = 0n;
  for (const row of rows) {
    const pieces = parsePieces(row.pieces);
    if (pieces === null) continue;
    total += BigInt(row.denominationMinor) * BigInt(pieces);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(total);
}

export interface CountPayloadResult {
  readonly lines: readonly { readonly denominationMinor: number; readonly pieces: number }[];
}

/**
 * Converts the visible rows into the POST body. Blank and zero rows are
 * omitted; an invalid piece count, an empty set or a zero total returns the
 * message shown inline instead of sending a request the API would reject.
 */
export function countPayload(
  rows: readonly CountRowDraft[],
): CountPayloadResult | { readonly error: string } {
  const lines: { denominationMinor: number; pieces: number }[] = [];
  for (const row of rows) {
    const trimmed = row.pieces.trim();
    if (trimmed === '') continue;
    if (!/^\d+$/.test(trimmed)) {
      return { error: 'Every piece count must be a whole number.' };
    }
    const pieces = Number(trimmed);
    if (pieces > MAX_PIECES) {
      return { error: `A piece count must be ${MAX_PIECES.toLocaleString()} or fewer.` };
    }
    if (pieces === 0) continue;
    lines.push({ denominationMinor: row.denominationMinor, pieces });
  }

  if (lines.length === 0) return { error: 'Add at least one denomination.' };
  if (lines.length > MAX_LINES) {
    return { error: `A count holds at most ${MAX_LINES} denominations.` };
  }
  const total = lines.reduce(
    (sum, line) => sum + BigInt(line.denominationMinor) * BigInt(line.pieces),
    0n,
  );
  if (total <= 0n) return { error: 'The counted total must be positive.' };

  return {
    lines: lines.sort((left, right) => right.denominationMinor - left.denominationMinor),
  };
}

/**
 * Parses a currency amount (`12`, `12.5`, `12.50`) into integer minor units
 * without floating point. Returns null for a non-positive or malformed value.
 */
export function parseMoneyMinor(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  if (minor > MAX_DENOMINATION_MINOR) return null;
  return minor;
}

/** `GHS 20.00 × 39`; the denomination is money and the pieces are a count. */
export function lineSummary(
  line: { readonly denominationMinor: number; readonly pieces: number },
  currency: string,
): string {
  return `${formatMoneyMinor(line.denominationMinor, currency)} × ${line.pieces}`;
}

/** A browser-side key for a retried form submit; the server stores it once. */
export function idempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${random}`;
}
