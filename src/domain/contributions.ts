import { createHmac, randomBytes } from 'node:crypto';
import { normalizeContactValue } from './contacts.js';

/** The reference alphabet: uppercase base32 without the ambiguous characters. */
const REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * The visitor phone is stored only as an HMAC-SHA-256 hash. The pepper is
 * configuration, so rotating it changes every hash.
 */
export function hashVisitorPhone(phone: string, pepper: string): string {
  const digits = normalizeContactValue('phone', phone);
  return createHmac('sha256', pepper).update(digits).digest('hex');
}

/** A server-generated receipt reference: `MR-` plus ten uppercase base32 characters. */
export function generateReference(): string {
  const bytes = randomBytes(10);
  let reference = 'MR-';
  for (const byte of bytes) {
    reference += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return reference;
}
