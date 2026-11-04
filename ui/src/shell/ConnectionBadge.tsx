import { Badge } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { probeGateway } from '../api/gateway';
import { ApiError } from '../api/errors';
import { useSession } from '../auth/SessionProvider';

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

export function ConnectionBadge() {
  const health = useGatewayHealth();

  if (health.isPending) {
    return (
      <Badge appearance="tint" color="informative" size="small" role="status">
        Checking API
      </Badge>
    );
  }

  if (health.isError) {
    return (
      <Badge appearance="tint" color="danger" size="small" role="status">
        API unavailable
      </Badge>
    );
  }

  return (
    <Badge appearance="tint" color="success" size="small" role="status">
      API connected
    </Badge>
  );
}
