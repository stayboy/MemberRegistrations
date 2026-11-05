import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  formatCalendarDate,
  formatDateRange,
  formatInstant,
  formatInstantTitle,
  formatWallClockTime,
  parseDateTimePreference,
  type DateTimePreference,
  type DateStyle,
  type TimeCycle,
} from '../format/datetime';

export const DATE_TIME_STORAGE_KEY = 'mr.datetime.v1';

interface DateTimePreferenceContextValue {
  readonly preference: DateTimePreference;
  setPreference(preference: DateTimePreference): void;
  setDateStyle(dateStyle: DateStyle): void;
  setTimeCycle(timeCycle: TimeCycle): void;
}

export interface DateTimeFormatters {
  formatDate(value: string | null | undefined): string;
  formatInstant(value: string | null | undefined): string;
  formatTime(value: string | null | undefined): string;
  formatRange(from: string | null | undefined, to: string | null | undefined): string;
  formatInstantTitle(value: string | null | undefined): string | undefined;
}

const DateTimePreferenceContext = createContext<DateTimePreferenceContextValue | null>(null);

function readStoredPreference(): DateTimePreference {
  try {
    return parseDateTimePreference(window.localStorage.getItem(DATE_TIME_STORAGE_KEY));
  } catch {
    return parseDateTimePreference(null);
  }
}

function persistPreference(preference: DateTimePreference): void {
  try {
    window.localStorage.setItem(DATE_TIME_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // A blocked localStorage only loses persistence; the session still works.
  }
}

export function DateTimeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<DateTimePreference>(() =>
    readStoredPreference(),
  );

  const update = useCallback((next: DateTimePreference) => {
    setPreferenceState(next);
    persistPreference(next);
  }, []);

  const value = useMemo<DateTimePreferenceContextValue>(
    () => ({
      preference,
      setPreference: update,
      setDateStyle: (dateStyle) => update({ ...preference, dateStyle }),
      setTimeCycle: (timeCycle) => update({ ...preference, timeCycle }),
    }),
    [preference, update],
  );

  return (
    <DateTimePreferenceContext.Provider value={value}>
      {children}
    </DateTimePreferenceContext.Provider>
  );
}

export function useDateTimePreference(): DateTimePreferenceContextValue {
  const context = useContext(DateTimePreferenceContext);
  if (!context) {
    throw new Error('useDateTimePreference must be used inside DateTimeProvider.');
  }
  return context;
}

/** Formatters already bound to the current preference; never call `Intl` directly. */
export function useDateTimeFormat(): DateTimeFormatters {
  const { preference } = useDateTimePreference();
  return useMemo<DateTimeFormatters>(
    () => ({
      formatDate: (value) => formatCalendarDate(value, preference),
      formatInstant: (value) => formatInstant(value, preference),
      formatTime: (value) => formatWallClockTime(value, preference),
      formatRange: (from, to) => formatDateRange(from, to, preference),
      formatInstantTitle: (value) => formatInstantTitle(value),
    }),
    [preference],
  );
}
