import { FluentProvider, type Theme } from '@fluentui/react-components';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { themeFor, type AccentId, type Scheme } from './brand';
import { persistThemePreference, readThemePreference, type ThemePreference } from './preference';

interface ThemeContextValue extends ThemePreference {
  readonly theme: Theme;
  setAccent(accent: AccentId): void;
  setScheme(scheme: Scheme): void;
  toggleScheme(): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference());
  const theme = useMemo(
    () => themeFor(preference.accent, preference.scheme),
    [preference.accent, preference.scheme],
  );

  // Keep the pre-paint boot values in step with React state after a change.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scheme = preference.scheme;
    root.style.colorScheme = preference.scheme;
    root.style.backgroundColor = theme.colorNeutralBackground1;
  }, [preference.scheme, theme]);

  const update = useCallback((next: ThemePreference) => {
    setPreference(next);
    persistThemePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...preference,
      theme,
      setAccent: (accent) => update({ ...preference, accent }),
      setScheme: (scheme) => update({ ...preference, scheme }),
      toggleScheme: () =>
        update({ ...preference, scheme: preference.scheme === 'dark' ? 'light' : 'dark' }),
    }),
    [preference, theme, update],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* The provider's className is inherited by Fluent portal nodes; keep the
          viewport background on a child so tooltips and menus stay transparent. */}
      <FluentProvider theme={theme}>
        <div className="mr-app-root">{children}</div>
      </FluentProvider>
    </ThemeContext.Provider>
  );
}

export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreference must be used inside ThemeProvider.');
  }
  return context;
}
