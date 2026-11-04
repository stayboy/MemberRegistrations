import { describe, expect, it } from 'vitest';
import { defaultDateWindow, resolveDateWindow, shiftUtcDate } from './date-window';

describe('the shared UTC date window', () => {
  it('defaults to today minus 90 days through today', () => {
    expect(defaultDateWindow('2026-11-04')).toEqual({
      from: '2026-08-06',
      to: '2026-11-04',
    });
  });

  it('crosses a year boundary without a local-time shift', () => {
    expect(defaultDateWindow('2026-01-01')).toEqual({
      from: '2025-10-03',
      to: '2026-01-01',
    });
    expect(shiftUtcDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('prefers valid URL values and falls back on missing, invalid or reversed ones', () => {
    expect(resolveDateWindow('2026-09-01', '2026-10-01', '2026-11-04')).toEqual({
      from: '2026-09-01',
      to: '2026-10-01',
    });
    expect(resolveDateWindow(null, undefined, '2026-11-04')).toEqual({
      from: '2026-08-06',
      to: '2026-11-04',
    });
    expect(resolveDateWindow('2026-02-30', 'not-a-date', '2026-11-04')).toEqual({
      from: '2026-08-06',
      to: '2026-11-04',
    });
    expect(resolveDateWindow('2026-10-01', '2026-09-01', '2026-11-04')).toEqual({
      from: '2026-08-06',
      to: '2026-11-04',
    });
  });
});
