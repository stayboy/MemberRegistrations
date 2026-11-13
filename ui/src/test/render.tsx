import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { SessionProvider } from '../auth/SessionProvider';
import { SESSION_STORAGE_KEY } from '../auth/session';

/**
 * Every component in this app is mounted under a session and a query cache, so a
 * DOM test that renders a bare element does not test the app — it tests whether the
 * component happens to use neither. One helper, used everywhere, is what makes the
 * DOM lane worth having.
 */
export interface RenderWithProvidersOptions {
  /** Seed a usable session in storage; defaults to true. */
  readonly signedIn?: boolean;
}

export function seedSession(expiresInMinutes = 15): void {
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
  window.sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ token: 'dom-lane-session', expiresAt }),
  );
}

/** A fresh cache per test: no query result can leak between them. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { signedIn = true }: RenderWithProvidersOptions = {},
): RenderResult {
  if (signedIn) seedSession();
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper });
}
