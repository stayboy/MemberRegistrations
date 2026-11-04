import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

/**
 * Top-level render-failure boundary (NFR-10). The fallback uses system colours so
 * it still renders legibly if the Fluent theme itself failed, and it never logs
 * component values or PII.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Reporting is opt-in through VITE_SENTRY_DSN; this build sends nothing and
    // deliberately does not print error contents that could contain member data.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '24px',
            fontFamily: 'system-ui, sans-serif',
            color: 'CanvasText',
            backgroundColor: 'Canvas',
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Something went wrong</h1>
          <p style={{ margin: 0, maxWidth: '52ch' }}>
            The interface hit an unexpected error. Reload the page to start a fresh session view.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', fontSize: '1rem', cursor: 'pointer' }}
          >
            Reload the page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
