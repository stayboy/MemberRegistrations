import type { OfferingCount } from '../api/offering-counts';
import { formatMoneyMinor } from './welfare';

/**
 * Pure helpers for the `#/ussd/offerings` operator page. A count row is a
 * denomination value in minor units plus a piece count under edit; the API
 * contract is `{ denominationMinor, pieces }` and the total is derived.
 *
 * Slice A renders a single-pass grid from a per-currency catalogue seeded in
 * code. The catalogue is UI-only: the API keeps accepting any positive
 * `denominationMinor`, and a value outside the catalogue is a one-off row.
 */

export interface CountRowDraft {
  /** The denomination in minor units; stable and unique within one count. */
  readonly denominationMinor: number;
  readonly pieces: string;
}

export type DenominationKind = 'note' | 'coin';

/** One configured denomination; slice B overlays the enable/position setting. */
export interface DenominationCatalogueEntry {
  readonly denominationMinor: number;
  readonly kind: DenominationKind;
  readonly defaultOrder: number;
  readonly defaultEnabled: boolean;
}

/**
 * A slice B setting row. The grid helper accepts it now so the all-hidden and
 * reordered branches are testable before the server-backed screen exists.
 */
export interface DenominationOverride {
  readonly denominationMinor: number;
  readonly enabled?: boolean;
  readonly position?: number;
}

/** The server's bound on one denomination value (`offering-counts.ts`). */
export const MAX_DENOMINATION_MINOR = 10_000_000;
export const MAX_PIECES = 1_000_000;
/** The server caps one count at 50 denomination lines. */
export const MAX_LINES = 50;

/**
 * GHS notes in minor units, largest first (GHS 200 … GHS 1). The 1 and 2 cedi
 * coins are folded into the note group. `0.01` is not seeded until the Bank of
 * Ghana set is confirmed.
 */
const GHS_CATALOGUE: readonly DenominationCatalogueEntry[] = [
  { denominationMinor: 20_000, kind: 'note', defaultOrder: 0, defaultEnabled: true },
  { denominationMinor: 10_000, kind: 'note', defaultOrder: 1, defaultEnabled: true },
  { denominationMinor: 5_000, kind: 'note', defaultOrder: 2, defaultEnabled: true },
  { denominationMinor: 2_000, kind: 'note', defaultOrder: 3, defaultEnabled: true },
  { denominationMinor: 1_000, kind: 'note', defaultOrder: 4, defaultEnabled: true },
  { denominationMinor: 500, kind: 'note', defaultOrder: 5, defaultEnabled: true },
  { denominationMinor: 200, kind: 'note', defaultOrder: 6, defaultEnabled: true },
  { denominationMinor: 100, kind: 'note', defaultOrder: 7, defaultEnabled: true },
  { denominationMinor: 50, kind: 'coin', defaultOrder: 8, defaultEnabled: true },
  { denominationMinor: 20, kind: 'coin', defaultOrder: 9, defaultEnabled: true },
  { denominationMinor: 10, kind: 'coin', defaultOrder: 10, defaultEnabled: true },
  { denominationMinor: 5, kind: 'coin', defaultOrder: 11, defaultEnabled: true },
];

const CATALOGUES: Readonly<Record<string, readonly DenominationCatalogueEntry[]>> = {
  GHS: GHS_CATALOGUE,
};

/** The configured catalogue for a currency; `[]` when the currency has none. */
export function denominationCatalogue(currency: string): readonly DenominationCatalogueEntry[] {
  return CATALOGUES[currency] ?? [];
}

/** Distinguishes "no catalogue" from "every configured denomination hidden". */
export function hasDenominationCatalogue(currency: string): boolean {
  return denominationCatalogue(currency).length > 0;
}

/**
 * The ordered, enabled entries for a currency. Overrides model the slice B
 * setting: an omitted field keeps the catalogue default, and an entry is
 * filtered out when disabled. `[]` means either no catalogue or every entry
 * hidden; `hasDenominationCatalogue` tells the two apart.
 */
export function gridDenominations(
  currency: string,
  overrides: readonly DenominationOverride[] = [],
): readonly DenominationCatalogueEntry[] {
  const catalogue = denominationCatalogue(currency);
  if (catalogue.length === 0) return [];

  const overrideByMinor = new Map(overrides.map((entry) => [entry.denominationMinor, entry]));

  return catalogue
    .filter((entry) => {
      const override = overrideByMinor.get(entry.denominationMinor);
      return override?.enabled ?? entry.defaultEnabled;
    })
    .map((entry) => ({
      entry,
      position: overrideByMinor.get(entry.denominationMinor)?.position ?? entry.defaultOrder,
    }))
    .sort((left, right) => left.position - right.position)
    .map(({ entry }) => entry);
}

export function denominationLabel(denominationMinor: number, currency: string): string {
  return formatMoneyMinor(denominationMinor, currency);
}

/** One blank grid row per configured denomination; `[]` for no catalogue. */
export function emptyCountRows(
  currency: string,
  overrides: readonly DenominationOverride[] = [],
): CountRowDraft[] {
  return gridDenominations(currency, overrides).map((entry) => ({
    denominationMinor: entry.denominationMinor,
    pieces: '',
  }));
}

function parsePieces(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** True when a piece count would contribute a payload line. */
export function positivePieces(value: string): boolean {
  const pieces = parsePieces(value);
  return pieces !== null && pieces > 0;
}

/** The rows that would contribute a line to the payload (a positive piece count). */
export function positiveRowCount(rows: readonly CountRowDraft[]): number {
  return rows.filter((row) => positivePieces(row.pieces)).length;
}

function configuredMinors(
  currency: string,
  overrides: readonly DenominationOverride[],
): ReadonlySet<number> {
  return new Set(gridDenominations(currency, overrides).map((entry) => entry.denominationMinor));
}

/**
 * The number of rows outside the configured grid: custom entries and observed
 * lines the current catalogue hides or does not know.
 */
export function customRowCount(
  rows: readonly CountRowDraft[],
  currency: string,
  overrides: readonly DenominationOverride[] = [],
): number {
  const configured = configuredMinors(currency, overrides);
  return rows.filter((row) => !configured.has(row.denominationMinor)).length;
}

/**
 * Adds one piece of a denomination. A configured row (or an existing one-off)
 * sums into its row; any other value appends a one-off row. The catalogue is
 * never changed. A new one-off stops at the 50-line payload cap.
 */
export function addDenomination(
  rows: readonly CountRowDraft[],
  denominationMinor: number,
): CountRowDraft[] {
  const existing = rows.find((row) => row.denominationMinor === denominationMinor);
  if (existing) {
    const current = parsePieces(existing.pieces) ?? 0;
    return rows.map((row) =>
      row.denominationMinor === denominationMinor
        ? { ...row, pieces: String(Math.min(current + 1, MAX_PIECES)) }
        : row,
    );
  }
  if (positiveRowCount(rows) >= MAX_LINES) return [...rows];
  return [...rows, { denominationMinor, pieces: '1' }];
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

/**
 * Builds the correction grid from the catalogue, then pins every observed line
 * outside it (hidden or absent) as a pre-filled one-off. Blanking a one-off
 * omits it from `countPayload`.
 */
export function rowsFromObservation(
  count: OfferingCount,
  currency: string,
  overrides: readonly DenominationOverride[] = [],
): CountRowDraft[] {
  const configured = gridDenominations(currency, overrides);
  const configuredSet = new Set(configured.map((entry) => entry.denominationMinor));
  const observed = new Map(count.lines.map((line) => [line.denominationMinor, line.pieces]));

  const grid = configured.map((entry) => ({
    denominationMinor: entry.denominationMinor,
    pieces: observed.has(entry.denominationMinor)
      ? String(observed.get(entry.denominationMinor))
      : '',
  }));

  const oneOffs = count.lines
    .filter((line) => !configuredSet.has(line.denominationMinor))
    .slice()
    .sort((left, right) => right.denominationMinor - left.denominationMinor)
    .map((line) => ({
      denominationMinor: line.denominationMinor,
      pieces: String(line.pieces),
    }));

  return [...grid, ...oneOffs];
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
