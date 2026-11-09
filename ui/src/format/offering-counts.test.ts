import { describe, expect, it } from 'vitest';
import type { OfferingCount } from '../api/offering-counts';
import {
  addDenomination,
  countPayload,
  countTotalMinor,
  emptyCountRows,
  idempotencyKey,
  lineSummary,
  parseMoneyMinor,
  quickPickVisible,
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
    { denominationMinor: 1000, pieces: 40 },
    { denominationMinor: 2000, pieces: 39 },
  ],
  totalMinor: 118_000,
  recordedAt: '2026-11-01T10:05:00.000Z',
  recordedBy: 'officer-1',
  supersedesId: null,
  supersededBy: null,
};

describe('quick-pick visibility', () => {
  it('shows the GHS quick-pick only for GHS', () => {
    expect(quickPickVisible('GHS')).toBe(true);
    expect(quickPickVisible('USD')).toBe(false);
    expect(quickPickVisible('')).toBe(false);
  });
});

describe('count rows', () => {
  it('creates a row on the first pick and increments it on the next', () => {
    const once = addDenomination(emptyCountRows(), 2000);
    expect(once).toEqual([{ denominationMinor: 2000, pieces: '1' }]);

    const twice = addDenomination(once, 2000);
    expect(twice).toEqual([{ denominationMinor: 2000, pieces: '2' }]);
  });

  it('keeps rows ordered by denomination descending', () => {
    const rows = addDenomination(addDenomination(emptyCountRows(), 1000), 2000);
    expect(rows.map((row) => row.denominationMinor)).toEqual([2000, 1000]);
  });

  it('sets and removes a row without mutating the input', () => {
    const rows = addDenomination(emptyCountRows(), 2000);
    const edited = setPieces(rows, 2000, '39');
    expect(edited[0]?.pieces).toBe('39');
    expect(rows[0]?.pieces).toBe('1');

    expect(removeDenomination(edited, 2000)).toEqual([]);
  });

  it('rebuilds rows from an observation, newest denomination first', () => {
    expect(rowsFromObservation(COUNT)).toEqual([
      { denominationMinor: 2000, pieces: '39' },
      { denominationMinor: 1000, pieces: '40' },
    ]);
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
