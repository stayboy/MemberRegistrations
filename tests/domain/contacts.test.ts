import { describe, expect, it } from 'vitest';
import { normalizeContactValue } from '../../src/domain/contacts.js';
import { ValidationError } from '../../src/errors/domain-errors.js';

describe('contact normalisation', () => {
  it('reduces phone numbers to their significant digits', () => {
    expect(normalizeContactValue('phone', '0801 234 5678')).toBe('8012345678');
    expect(normalizeContactValue('phone', '+234 801 234 5678')).toBe('2348012345678');
    expect(normalizeContactValue('whatsapp', '(0801) 234-5678')).toBe('8012345678');
  });

  it('lower-cases email addresses', () => {
    expect(normalizeContactValue('email', ' Ama@Example.COM ')).toBe('ama@example.com');
  });

  it('rejects values that are not valid for the channel', () => {
    expect(() => normalizeContactValue('email', 'not-an-email')).toThrow(ValidationError);
    expect(() => normalizeContactValue('phone', '123')).toThrow(ValidationError);
  });
});
