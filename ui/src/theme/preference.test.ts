import { describe, expect, it } from 'vitest';
import { parseThemePreference } from './preference';

describe('parseThemePreference', () => {
  it('follows the system scheme when nothing is stored', () => {
    expect(parseThemePreference(null, true)).toEqual({ accent: 'fluent', scheme: 'dark' });
    expect(parseThemePreference(null, false)).toEqual({ accent: 'fluent', scheme: 'light' });
  });

  it('lets an explicit stored scheme win over the system', () => {
    expect(parseThemePreference('{"accent":"meadow","scheme":"light"}', true)).toEqual({
      accent: 'meadow',
      scheme: 'light',
    });
  });

  it('ignores corrupt or unknown values without throwing', () => {
    expect(parseThemePreference('not json', true)).toEqual({ accent: 'fluent', scheme: 'dark' });
    expect(parseThemePreference('{"accent":"neon","scheme":"sepia"}', false)).toEqual({
      accent: 'fluent',
      scheme: 'light',
    });
  });
});
