/** Fixed display widths for dynamic values; a longer value is truncated with `…`. */
export const DISPLAY_WIDTHS = {
  member: 24,
  event: 24,
  offering: 20,
  reference: 16,
  amount: 14,
  date: 12,
} as const;

export type DisplayKind = keyof typeof DISPLAY_WIDTHS;

export function truncate(kind: DisplayKind, value: string): string {
  const width = DISPLAY_WIDTHS[kind];
  if (value.length <= width) return value;
  return `${value.slice(0, width - 1)}…`;
}

/** `GHS 20.00`; minor units only, one currency per offering. */
export function money(minor: number, currency = 'GHS'): string {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `12 Dec 2026` from an ISO date; no timezone shift. */
export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${day} ${MONTHS[month - 1] ?? match[2]} ${year}`;
}

const MAX_AMOUNT_MINOR = 100_000_000; // 1,000,000.00

/**
 * A positive amount with at most two decimals and a 1,000,000.00 ceiling,
 * returned in minor units. Null when the text is not an amount.
 */
export function parseAmount(input: string): number | null {
  const value = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_AMOUNT_MINOR) return null;
  return minor;
}

/**
 * `DDMMYYYY` to an ISO date. The date must exist and not be before today (UTC).
 * Null when it is not a real, current-or-future date.
 */
export function parseUssdDate(
  input: string,
  today = new Date().toISOString().slice(0, 10),
): string | null {
  const value = input.trim();
  if (!/^\d{8}$/.test(value)) return null;
  const day = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const year = Number(value.slice(4, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  const iso = `${value.slice(4, 8)}-${value.slice(2, 4)}-${value.slice(0, 2)}`;
  return iso < today ? null : iso;
}
