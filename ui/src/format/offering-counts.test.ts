import { describe, expect, it } from 'vitest';
import type { OfferingCount } from '../api/offering-counts';
import {
  MAX_LINES,
  addDenomination,
  countPayload,
  countTotalMinor,
  customRowCount,
  emptyCountRows,
  gridDenominations,
  hasDenominationCatalogue,
  idempotencyKey,
  lineSummary,
  parseMoneyMinor,
  positiveRowCount,
  removeDenomination,
  rowsFromObservation,
  setPieces,
} from './offering-counts';

const COUNT: OfferingCount = {
  id: 'count-1',
  eventId: 'event-1',
  offeringId: 'offering-1',
  sessionDate: '2026-11-01',
  asOf: '2026-11-01T10:00:00.000Z',
  currency: 'GHS',
  termsVersion: 1,
  lines: [
    { denominationMinor: 2000, pieces: 39 },
    { denominationMinor: 1000, pieces: 40 },
  ],
  totalMinor: 118_000,
  recordedAt: '2026-11-01T10:05:00.000Z',
  recordedBy: 'officer-1',
  supersedesId: null,
  supersededBy: null,
};

describe('denomination catalogue', () => {
  it('orders GHS notes before coins, descending within each group', () => {
    const grid = gridDenominations('GHS');

    expect(grid.map((entry) => entry.denominationMinor)).toEqual([
      20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5,
    ]);
    expect(grid.slice(0, 8).every((entry) => entry.kind === 'note')).toBe(true);
    expect(grid.slice(8).every((entry) => entry.kind === 'coin')).toBe(true);
    expect(grid.some((entry) => entry.denominationMinor === 1)).toBe(false);
  });

  it('returns no grid for a currency with no catalogue', () => {
    expect(gridDenominations('USD')).toEqual([]);
    expect(hasDenominationCatalogue('USD')).toBe(false);
    expect(emptyCountRows('USD')).toEqual([]);
  });

  it('distinguishes an all-hidden catalogue from a missing one', () => {
    const overrides = gridDenominations('GHS').map((entry) => ({
      denominationMinor: entry.denominationMinor,
      enabled: false,
    }));

    expect(gridDenominations('GHS', overrides)).toEqual([]);
    expect(hasDenominationCatalogue('GHS')).toBe(true);
    expect(emptyCountRows('GHS', overrides)).toEqual([]);
  });

  it('honours an override position without mutating the catalogue', () => {
    const reordered = gridDenominations('GHS', [{ denominationMinor: 100, position: -1 }]);

    expect(reordered[0]?.denominationMinor).toBe(100);
    expect(gridDenominations('GHS')[0]?.denominationMinor).toBe(20_000);
  });

  it('creates one blank row per configured denomination', () => {
    const rows = emptyCountRows('GHS');

    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.pieces === '')).toBe(true);
    expect(rows.map((row) => row.denominationMinor)).toEqual(
      gridDenominations('GHS').map((entry) => entry.denominationMinor),
    );
  });
});

describe('count rows', () => {
  it('sums a custom value into a configured row instead of adding a row', () => {
    const blank = emptyCountRows('GHS');

    const once = addDenomination(blank, 2000);
    expect(once.find((row) => row.denominationMinor === 2000)?.pieces).toBe('1');

    const twice = addDenomination(once, 2000);
    expect(twice.find((row) => row.denominationMinor === 2000)?.pieces).toBe('2');
    expect(twice).toHaveLength(blank.length);
  });

  it('appends a one-off row for a value outside the catalogue without changing it', () => {
    const rows = addDenomination(emptyCountRows('GHS'), 2550);
    const oneOff = rows.find((row) => row.denominationMinor === 2550);

    expect(oneOff?.pieces).toBe('1');
    expect(rows).toHaveLength(13);
    expect(customRowCount(rows, 'GHS')).toBe(1);
    expect(gridDenominations('GHS').some((entry) => entry.denominationMinor === 2550)).toBe(
      false,
    );
  });

  it('sums a repeated one-off value into its existing row', () => {
    const once = addDenomination(emptyCountRows('GHS'), 2550);
    const twice = addDenomination(once, 2550);

    expect(twice.filter((row) => row.denominationMinor === 2550)).toHaveLength(1);
    expect(twice.find((row) => row.denominationMinor === 2550)?.pieces).toBe('2');
  });

  it('stops adding new one-off rows at the 50-line payload cap', () => {
    let rows = emptyCountRows('GHS');
    for (let index = 0; index < MAX_LINES; index += 1) {
      rows = addDenomination(rows, 3000 + index);
    }

    expect(customRowCount(rows, 'GHS')).toBe(MAX_LINES);
    expect(rows).toHaveLength(12 + MAX_LINES);
    expect(positiveRowCount(rows)).toBe(MAX_LINES);

    const capped = addDenomination(rows, 9000);
    expect(capped).toHaveLength(rows.length);
    expect(customRowCount(capped, 'GHS')).toBe(MAX_LINES);
  });

  it('allows a new one-off up to the 50th payload line and blocks the 51st', () => {
    let rows = emptyCountRows('GHS').map((row) => ({ ...row, pieces: '1' }));
    expect(positiveRowCount(rows)).toBe(12);

    for (let index = 0; index < MAX_LINES - 12; index += 1) {
      rows = addDenomination(rows, 3000 + index);
    }

    expect(positiveRowCount(rows)).toBe(MAX_LINES);
    expect(rows).toHaveLength(MAX_LINES);

    const capped = addDenomination(rows, 9000);
    expect(positiveRowCount(capped)).toBe(MAX_LINES);
    expect(capped).toHaveLength(MAX_LINES);
  });

  it('counts only rows that would contribute a payload line', () => {
    expect(
      positiveRowCount([
        { denominationMinor: 2000, pieces: '1' },
        { denominationMinor: 1000, pieces: '0' },
        { denominationMinor: 500, pieces: '' },
        { denominationMinor: 200, pieces: '2' },
        { denominationMinor: 100, pieces: 'x' },
      ]),
    ).toBe(2);
  });

  it('sets and removes a row without mutating the input', () => {
    const rows = addDenomination(emptyCountRows('GHS'), 2550);
    const edited = setPieces(rows, 2550, '39');
    expect(edited.find((row) => row.denominationMinor === 2550)?.pieces).toBe('39');
    expect(rows.find((row) => row.denominationMinor === 2550)?.pieces).toBe('1');

    expect(removeDenomination(edited, 2550)).toHaveLength(12);
  });
});

describe('rowsFromObservation', () => {
  it('rebuilds the grid and fills the configured rows', () => {
    const rows = rowsFromObservation(COUNT, 'GHS');

    expect(rows).toHaveLength(12);
    expect(rows.find((row) => row.denominationMinor === 2000)?.pieces).toBe('39');
    expect(rows.find((row) => row.denominationMinor === 1000)?.pieces).toBe('40');
    expect(rows.find((row) => row.denominationMinor === 500)?.pieces).toBe('');
  });

  it('pins an observed line outside the catalogue as a pre-filled one-off', () => {
    const rows = rowsFromObservation(
      {
        ...COUNT,
        lines: [...COUNT.lines, { denominationMinor: 2550, pieces: 2 }],
      },
      'GHS',
    );

    expect(rows).toHaveLength(13);
    expect(rows.at(-1)).toEqual({ denominationMinor: 2550, pieces: '2' });
    expect(customRowCount(rows, 'GHS')).toBe(1);
  });

  it('re-renders a hidden observed line as a one-off', () => {
    const rows = rowsFromObservation(COUNT, 'GHS', [
      { denominationMinor: 2000, enabled: false },
    ]);

    expect(rows.filter((row) => row.denominationMinor === 2000)).toHaveLength(1);
    expect(rows.at(-1)).toEqual({ denominationMinor: 2000, pieces: '39' });
  });

  it('drops a blanked one-off from the payload', () => {
    const rows = rowsFromObservation(
      { ...COUNT, lines: [...COUNT.lines, { denominationMinor: 2550, pieces: 2 }] },
      'GHS',
    );
    const parsed = countPayload(setPieces(rows, 2550, ''));

    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.lines.some((line) => line.denominationMinor === 2550)).toBe(false);
  });
});

describe('countTotalMinor', () => {
  it('sums denomination × pieces and ignores blank or invalid rows', () => {
    expect(
      countTotalMinor([
        { denominationMinor: 2000, pieces: '39' },
        { denominationMinor: 1000, pieces: '40' },
      ]),
    ).toBe(118_000);
    expect(
      countTotalMinor([
        { denominationMinor: 2000, pieces: '' },
        { denominationMinor: 1000, pieces: 'x' },
      ]),
    ).toBe(0);
  });
});

describe('countPayload', () => {
  it('returns sorted positive lines and omits blank and zero rows', () => {
    const result = countPayload([
      { denominationMinor: 1000, pieces: '40' },
      { denominationMinor: 2000, pieces: '39' },
      { denominationMinor: 500, pieces: '' },
      { denominationMinor: 200, pieces: '0' },
    ]);

    expect(result).toEqual({
      lines: [
        { denominationMinor: 2000, pieces: 39 },
        { denominationMinor: 1000, pieces: 40 },
      ],
    });
  });

  it('rejects an empty set, a zero total and an invalid piece count', () => {
    expect(countPayload([])).toEqual({ error: 'Add at least one denomination.' });
    expect(countPayload([{ denominationMinor: 1000, pieces: '0' }])).toEqual({
      error: 'Add at least one denomination.',
    });
    expect(countPayload([{ denominationMinor: 1000, pieces: '2.5' }])).toEqual({
      error: 'Every piece count must be a whole number.',
    });
    expect(countPayload([{ denominationMinor: 1000, pieces: '1000001' }])).toEqual({
      error: 'A piece count must be 1,000,000 or fewer.',
    });
  });
});

describe('parseMoneyMinor', () => {
  it('parses whole and decimal currency amounts without floating point', () => {
    expect(parseMoneyMinor('20')).toBe(2000);
    expect(parseMoneyMinor('20.5')).toBe(2050);
    expect(parseMoneyMinor('20.05')).toBe(2005);
    expect(parseMoneyMinor('0.05')).toBe(5);
    expect(parseMoneyMinor(' 12.50 ')).toBe(1250);
  });

  it('rejects malformed, zero, negative and out-of-range values', () => {
    expect(parseMoneyMinor('')).toBeNull();
    expect(parseMoneyMinor('0')).toBeNull();
    expect(parseMoneyMinor('-1')).toBeNull();
    expect(parseMoneyMinor('1.234')).toBeNull();
    expect(parseMoneyMinor('abc')).toBeNull();
    expect(parseMoneyMinor('100000.01')).toBeNull();
  });
});

describe('lineSummary and idempotencyKey', () => {
  it('renders money × pieces', () => {
    expect(lineSummary({ denominationMinor: 2000, pieces: 39 }, 'GHS')).toContain('× 39');
    expect(lineSummary({ denominationMinor: 2000, pieces: 39 }, 'GHS')).toContain('20.00');
  });

  it('carries a stable prefix and a unique suffix', () => {
    const first = idempotencyKey('manual-gift');
    const second = idempotencyKey('manual-gift');
    expect(first.startsWith('manual-gift-')).toBe(true);
    expect(second.startsWith('manual-gift-')).toBe(true);
    expect(first).not.toBe(second);
  });
});
