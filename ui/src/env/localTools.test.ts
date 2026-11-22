import { describe, expect, it } from 'vitest';
import { isLocalTools } from './localTools';

describe('isLocalTools', () => {
  it('is true in the Vite dev server even without the flag', () => {
    expect(isLocalTools(true, undefined)).toBe(true);
    expect(isLocalTools(true, '')).toBe(true);
  });

  it('is true in the local Compose build, where DEV is false and the flag is set', () => {
    expect(isLocalTools(false, 'true')).toBe(true);
  });

  it('is false for a deployed build without the flag', () => {
    expect(isLocalTools(false, undefined)).toBe(false);
    expect(isLocalTools(false, '')).toBe(false);
  });

  it('accepts only the exact string true, never 1 or TRUE', () => {
    expect(isLocalTools(false, '1')).toBe(false);
    expect(isLocalTools(false, 'TRUE')).toBe(false);
    expect(isLocalTools(false, 'True')).toBe(false);
  });
});
