/**
 * The signed callback command the USSD simulator offers.
 *
 * The rendered command names no host: the gateway base is filled in when the command is copied, so a
 * screenshot of this development screen never carries an origin into a ticket, a demo or a log. The
 * copy stays runnable, which is the whole point of offering it.
 */
export function callbackCurl(payload: string): string {
  const singleQuoted = payload.replace(/'/g, `'\\''`);
  return [
    `raw='${singleQuoted}'`,
    `sig=$(printf '%s' "$raw" | openssl dgst -sha256 -hmac "$PAYMENT_GATEWAY_SECRET" | sed 's/^.* //')`,
    `curl -X POST "$GATEWAY/v1/payments/callback" \\`,
    `  -H 'Content-Type: application/json' -H "X-Payment-Signature: $sig" \\`,
    '  --data-raw "$raw"',
  ].join('\n');
}

/** The command as copied: the placeholder takes the real gateway base, which is never painted. */
export function runnableCurl(payload: string, baseUrl: string): string {
  return callbackCurl(payload).replace('$GATEWAY', baseUrl);
}
