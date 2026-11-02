import { ValidationError } from '../errors/domain-errors.js';

export const CONTACT_KINDS = ['phone', 'email', 'whatsapp'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(value: string, field = 'date'): string {
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ValidationError(`${field} must be an ISO date (YYYY-MM-DD)`);
  }
  return value;
}

/**
 * One canonical form per value, so "0801 234 5678", "+2348012345678" style
 * duplicates cannot be stored twice. A contact value belongs to exactly one
 * member; sharing is expressed by linking to the owning contact.
 */
export function normalizeContactValue(kind: ContactKind, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError('contact value is required');

  if (kind === 'email') {
    const email = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError(`"${value}" is not a valid email address`);
    }
    return email;
  }

  const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new ValidationError(`"${value}" is not a valid phone number`);
  }
  return digits;
}
