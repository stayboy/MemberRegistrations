import { describe, expect, it } from 'vitest';
import { ageInMonths, ageInYears } from '../../src/domain/age.js';

describe('ageInYears', () => {
  it('counts completed years at today', () => {
    expect(ageInYears('1994-06-15', '2026-06-14')).toBe(31);
    expect(ageInYears('1994-06-15', '2026-06-15')).toBe(32);
  });

  it('does not count a birthday that is still a day away', () => {
    expect(ageInYears('1994-11-06', '2026-11-05')).toBe(31);
  });

  it('reaches a 29 February birthday on 1 March in a non-leap year', () => {
    expect(ageInYears('2000-02-29', '2026-02-28')).toBe(25);
    expect(ageInYears('2000-02-29', '2026-03-01')).toBe(26);
  });

  it('reaches a 29 February birthday on 29 February in a leap year', () => {
    expect(ageInYears('2000-02-29', '2028-02-28')).toBe(27);
    expect(ageInYears('2000-02-29', '2028-02-29')).toBe(28);
  });

  it('returns null for a null, invalid or future date', () => {
    expect(ageInYears(null, '2026-11-05')).toBeNull();
    expect(ageInYears('not-a-date', '2026-11-05')).toBeNull();
    expect(ageInYears('2026-02-30', '2026-11-05')).toBeNull();
    expect(ageInYears('2026-11-06', '2026-11-05')).toBeNull();
    expect(ageInYears('2027-01-01', '2026-11-05')).toBeNull();
  });

  it('treats a birthday today as zero completed years', () => {
    expect(ageInYears('2026-11-05', '2026-11-05')).toBe(0);
  });
});

describe('ageInMonths', () => {
  it('counts completed months at today', () => {
    expect(ageInMonths('2026-03-15', '2026-11-14')).toBe(7);
    expect(ageInMonths('2026-03-15', '2026-11-15')).toBe(8);
  });

  it('agrees with ageInYears in completed years', () => {
    expect(ageInMonths('1994-06-15', '2026-06-14')).toBe(383);
    expect(Math.floor(ageInMonths('1994-06-15', '2026-06-15')! / 12)).toBe(32);
  });

  it('returns null for a null, invalid or future date', () => {
    expect(ageInMonths(null, '2026-11-05')).toBeNull();
    expect(ageInMonths('not-a-date', '2026-11-05')).toBeNull();
    expect(ageInMonths('2026-02-30', '2026-11-05')).toBeNull();
    expect(ageInMonths('2026-11-06', '2026-11-05')).toBeNull();
    expect(ageInMonths('2027-01-01', '2026-11-05')).toBeNull();
  });

  it('treats a birthday today as zero completed months', () => {
    expect(ageInMonths('2026-11-05', '2026-11-05')).toBe(0);
  });

  it('reaches a 29 February birthday on 1 March in a non-leap year', () => {
    // 2024 is a leap year; 2025 and 2026 are not. The years rule reaches the birthday on
    // 1 March there, and the months rule must agree, or the label and the age disagree.
    expect(ageInMonths('2024-02-29', '2025-03-01')).toBe(12);
    expect(ageInMonths('2024-02-29', '2025-02-28')).toBe(11);
    expect(Math.floor(ageInMonths('2024-02-29', '2026-03-01')! / 12)).toBe(
      ageInYears('2024-02-29', '2026-03-01'),
    );
  });
});
