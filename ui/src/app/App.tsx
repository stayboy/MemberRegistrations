import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { SessionProvider } from '../auth/SessionProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { queryClient } from './query-client';
import { router } from './router';

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
