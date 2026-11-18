import { useQuery } from '@tanstack/react-query';
import { probeGateway } from '../api/gateway';
import { ApiError } from '../api/errors';
import { useSession } from '../auth/SessionProvider';

/**
 * FR-10: the connection state is the message bar in the page frame, never a
 * header pill (owner, 2026-11-18). The probe still drives that message, so the
 * hook and its error copy live here rather than beside the retired badge.
 */
export function useGatewayHealth() {
  const { baseUrl } = useSession();
  return useQuery({
    queryKey: ['gateway-health', baseUrl],
    queryFn: () => probeGateway(baseUrl, AbortSignal.timeout(5000)),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function connectionErrorDetail(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'The gateway did not answer within five seconds.';
  }
  return 'The gateway did not answer. It may be stopped or the origin may be blocked.';
}
