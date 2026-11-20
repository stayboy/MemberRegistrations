import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ValidationError } from '../errors/domain-errors.js';

/**
 * The narrow cipher a pending registration's number is retained under (MR-53).
 *
 * AES-256-GCM with a random 96-bit IV per value; the payload is
 * `base64(iv).base64(tag).base64(ciphertext)`. The key is the SHA-256 of
 * `REGISTRATION_PHONE_KEY`, so the configured string may be any length the
 * environment rule allows and still yields the 32 bytes AES-256 needs.
 *
 * The value exists only between the USSD registration and the officer's
 * decision: approval decrypts it into an owned contact, and approve, reject and
 * purge erase the ciphertext. It is never returned to a caller.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export interface PhoneCipher {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
}

export function createPhoneCipher(key: string): PhoneCipher {
  const keyBytes = createHash('sha256').update(key, 'utf8').digest();

  return {
    encrypt(plain: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keyBytes, iv);
      const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [iv, tag, ciphertext].map((part) => part.toString('base64')).join('.');
    },

    decrypt(payload: string): string {
      const [ivPart, tagPart, cipherPart] = payload.split('.');
      if (!ivPart || !tagPart || !cipherPart) {
        throw new ValidationError('The stored number could not be read');
      }
      try {
        const decipher = createDecipheriv(ALGORITHM, keyBytes, Buffer.from(ivPart, 'base64'));
        decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
        return Buffer.concat([
          decipher.update(Buffer.from(cipherPart, 'base64')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // A rotated key or a tampered value is unreadable; never echo the bytes.
        throw new ValidationError('The stored number could not be read');
      }
    },
  };
}
