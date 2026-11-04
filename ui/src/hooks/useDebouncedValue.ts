import { useEffect, useState } from 'react';

/**
 * Debounces a rapidly changing value. Call sites: MembersPage (grid search) and
 * MemberPicker (member search, 250 ms).
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
