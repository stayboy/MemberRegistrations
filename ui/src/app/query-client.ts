import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';
import { ApiError } from '../api/errors';

const config: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Idempotent GETs may retry twice on a server error; never on a 4xx and
      // never for writes (NFR-5).
      retry: (failureCount, error) =>
        error instanceof ApiError && error.status >= 500 && failureCount < 2,
    },
    mutations: {
      retry: false,
    },
  },
};

export const queryClient = new QueryClient(config);
