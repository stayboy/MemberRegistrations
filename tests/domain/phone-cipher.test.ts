import { describe, expect, it } from 'vitest';
import { createPhoneCipher } from '../../src/domain/phone-cipher.js';

/**
 * MR-53: a pending registration's number is retained AES-256-GCM under
 * `REGISTRATION_PHONE_KEY`, base64 `iv.tag.ciphertext`, and is readable only
 * with the same key.
 */
describe('the registration phone cipher', () => {
  const cipher = createPhoneCipher('test-registration-phone-key');

  it('round-trips a caller number', () => {
    const payload = cipher.encrypt('8041000201');
    expect(payload).not.toContain('8041000201');
    expect(payload.split('.')).toHaveLength(3);
    expect(cipher.decrypt(payload)).toBe('8041000201');
  });

  it('uses a fresh IV, so the same number encrypts differently', () => {
    expect(cipher.encrypt('8041000201')).not.toBe(cipher.encrypt('8041000201'));
  });

  it('refuses a payload under another key or a tampered value', () => {
    const payload = cipher.encrypt('8041000201');
    const other = createPhoneCipher('another-registration-phone-key');
    expect(() => other.decrypt(payload)).toThrow(/could not be read/);
    expect(() => cipher.decrypt('not-a-payload')).toThrow(/could not be read/);

    const [iv, tag, ciphertext] = payload.split('.');
    const tampered = `${iv}.${tag}.${ciphertext!.slice(0, -2)}AA`;
    expect(() => cipher.decrypt(tampered)).toThrow(/could not be read/);
  });
});
