import { isAccentId, type AccentId, type Scheme } from './brand';

export const THEME_STORAGE_KEY = 'mr.theme.v1';

export interface ThemePreference {
  readonly accent: AccentId;
  readonly scheme: Scheme;
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = { accent: 'fluent', scheme: 'light' };

function isScheme(value: unknown): value is Scheme {
  return value === 'light' || value === 'dark';
}

/**
 * Parses the stored preference. A stored, explicit scheme wins; otherwise the
 * caller's system preference is used (FR-46). Corrupt values are ignored.
 */
export function parseThemePreference(
  raw: string | null,
  systemPrefersDark: boolean,
): ThemePreference {
  const systemScheme: Scheme = systemPrefersDark ? 'dark' : 'light';
  if (!raw) return { accent: 'fluent', scheme: systemScheme };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { accent: 'fluent', scheme: systemScheme };
    }

    const candidate = parsed as { accent?: unknown; scheme?: unknown };
    return {
      accent: isAccentId(candidate.accent) ? candidate.accent : 'fluent',
      scheme: isScheme(candidate.scheme) ? candidate.scheme : systemScheme,
    };
  } catch {
    return { accent: 'fluent', scheme: systemScheme };
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(
      window.localStorage.getItem(THEME_STORAGE_KEY),
      systemPrefersDark(),
    );
  } catch {
    return parseThemePreference(null, systemPrefersDark());
  }
}

export function persistThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // A blocked localStorage only loses persistence; the session still works.
  }
}
