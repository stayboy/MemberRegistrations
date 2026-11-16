import { describe, expect, it } from 'vitest';
import { callbackCurl, runnableCurl } from './ussd-callback';

const PAYLOAD = '{"reference":"REF-1","amount":"200.00"}';

describe('the signed callback command', () => {
  it('names no host in what the page renders', () => {
    const rendered = callbackCurl(PAYLOAD);

    expect(rendered).toContain('$GATEWAY/v1/payments/callback');
    // A rendered origin is the artefact that outlives the reason it was printed: it lands in a
    // screenshot, a ticket or a demo. Only the copied command may carry a real base.
    expect(rendered).not.toMatch(/https?:\/\//);
    expect(rendered).not.toContain('GATEWAY=');
  });

  it('copies a runnable command with the real base', () => {
    const copied = runnableCurl(PAYLOAD, 'http://localhost:3000');

    expect(copied).toContain('curl -X POST "http://localhost:3000/v1/payments/callback"');
    expect(copied).not.toContain('$GATEWAY');
  });

  it('quotes a payload that carries a single quote', () => {
    expect(callbackCurl(`{"note":"it's"}`)).toContain(`it'\\''s`);
  });
});
