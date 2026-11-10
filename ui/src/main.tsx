import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { clearLegacyGatewayUrl } from './auth/session';
import './index.css';

// An earlier build stored a gateway origin the operator could edit. The origin
// is now baked into the bundle, so that entry is deleted rather than read
// (FR-13); doing it before the first render means no component can see it.
clearLegacyGatewayUrl();

const container = document.getElementById('root');
if (!container) {
  throw new Error('The application root element is missing.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
