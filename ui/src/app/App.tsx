import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { SessionProvider } from '../auth/SessionProvider';
import { DateTimeProvider } from '../shell/DateTimeProvider';
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
            <DateTimeProvider>
              <RouterProvider router={router} />
            </DateTimeProvider>
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
