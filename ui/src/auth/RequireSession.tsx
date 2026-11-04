import { Spinner } from '@fluentui/react-components';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from './SessionProvider';

/**
 * The gate never replaces the shell: the redirect happens inside the content
 * slot, so the header, sidebar and appearance controls stay available (FR-11).
 */
export function RequireSession() {
  const { status, expired } = useSession();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '40vh',
        }}
      >
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  if (status !== 'signed-in') {
    const target = expired ? '/connect?reason=expired' : '/connect';
    return <Navigate to={target} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
