import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AcceptancePage } from './AcceptancePage';

/**
 * The member acceptance page's entry (MR-51).
 *
 * A standalone document at `/v`, outside the officer `#/` router and outside
 * FR-11: it renders no shell, reads no session and shows no member data before
 * acceptance. The token arrives in the URL fragment, so it never reaches a
 * server log; the link alone verifies nothing.
 */

const container = document.getElementById('root');
if (!container) {
  throw new Error('The acceptance page root element is missing.');
}

createRoot(container).render(
  <StrictMode>
    <AcceptancePage />
  </StrictMode>,
);
