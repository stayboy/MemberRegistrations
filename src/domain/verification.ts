import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { maskContactValue, normalizeContactValue, type ContactKind } from './contacts.js';
import { AlreadyVerifiedError, NoOwnContactError } from '../errors/domain-errors.js';

/**
 * The one-time code contract (MR-25) and the delivery/masking rules (MR-24).
 *
 * A code is six digits, single-use, valid for ten minutes and limited to five
 * attempts; it is stored only as an HMAC. Proof is per contact: the code sent to
 * one contact sets that contact's `verified_at`. Neither the member nor the
 * officer picks a channel; the register resolves one destination from the
 * member's own contacts.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_HOURLY_LIMIT = 5;

/** The public acceptance endpoint's fixed windows (MR-51). */
export const ACCEPT_TOKEN_LIMIT = 10;
export const ACCEPT_IP_LIMIT = 20;

/** Domain separation, so an OTP hash can never be mistaken for another HMAC. */
const OTP_LABEL = 'otp-code:';

/** The destination channel; every channel completes on the acceptance page. */
export type DeliveryChannel = 'email' | 'whatsapp' | 'phone';

/** What the officer sees and what the row keeps: never the delivery address. */
export interface VerificationDestination {
  channel: DeliveryChannel;
  masked: string;
}

/** A destination the service can send to, with the value a reader may see. */
export interface ResolvedDestination extends VerificationDestination {
  /** The address the sender posts to; never serialised to the wire. */
  to: string;
  /** The one contact the code binds to; `accept` proves only this row (MR-26). */
  contactId: string;
  /** The chosen value's hash, so an edit between issue and accept refuses (MR-26). */
  valueHash: string;
}

/** The contact fields the resolver reads; `ContactDto` is structurally assignable. */
export interface VerificationContact {
  id: string;
  kind: ContactKind;
  value: string;
  linked: boolean;
  /** Set when this contact already carries a proof; a proven contact is skipped (MR-24). */
  verified?: boolean;
}

/** Six digits, zero-padded, from the CSPRNG rather than `Math.random`. */
export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

/** The stored form of a code: never the code itself (MR-25). */
export function hashOtp(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${OTP_LABEL}${code}`).digest('hex');
}

/** Constant-time comparison of a presented code against the stored hash. */
export function otpMatches(code: string, storedHash: string, pepper: string): boolean {
  const presented = Buffer.from(hashOtp(code, pepper), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

/** 32 random bytes as base64url: the acceptance page's opaque token (MR-51). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The stored form of the token: SHA-256 hex, so a leaked row is not a key. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Digits as the register stores a phone or WhatsApp value. */
function digitsOf(value: string): string {
  return value.trim().replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * `+<country code> *** <last two>`: enough to recognise the number, never the
 * whole value (MR-24, MR-34).
 *
 * A number stored longer than ten digits already carries its own country code
 * (MR-24), so the mask shows that code rather than the deployment's default: a
 * UK `4479…` reads `+44 *** 56`, not `+233 *** 56`. A number that starts with
 * the deployment's code keeps it, and a bare national number is masked with it.
 */
export function maskNumber(digits: string, countryCode: string): string {
  const clean = digitsOf(digits);
  const lastTwo = clean.length >= 2 ? clean.slice(-2) : clean;
  return `+${ownCountryCode(clean, countryCode)} *** ${lastTwo}`;
}

/** The country code a stored number carries: its own when long, else the default. */
function ownCountryCode(clean: string, countryCode: string): string {
  if (clean.length <= 10 || clean.startsWith(countryCode)) return countryCode;
  // The register treats a value beyond its ten-digit national form as carrying
  // its own code (MR-24), so the leading digits are that code: one on an
  // eleven-digit number, two on twelve, three on thirteen and above.
  return clean.slice(0, Math.min(3, clean.length - 10));
}

/** An email keeps its first letter and its domain, like a guardian's contact (FR-78). */
export function maskEmail(email: string): string {
  return maskContactValue('email', email);
}

/**
 * The stored form of the value a code was sent to (MR-26): `accept` compares it
 * with the contact's current value, so an edit between issue and accept refuses
 * the code instead of proving a value it was never sent to.
 */
export function hashDestinationValue(channel: DeliveryChannel, value: string): string {
  const normalized =
    channel === 'email' ? value.trim().toLowerCase() : normalizeContactValue(channel, value);
  return createHash('sha256').update(`destination:${channel}:${normalized}`, 'utf8').digest('hex');
}

/**
 * A stored number of at most 10 digits is prefixed with the deployment's
 * country code when it does not already start with it; a longer number is used
 * as stored, because it already carries its own code (MR-24).
 */
export function normaliseNumberForDelivery(digits: string, countryCode: string): string {
  const clean = digitsOf(digits);
  if (clean.length === 0) return clean;
  if (clean.length <= 10 && !clean.startsWith(countryCode)) return `${countryCode}${clean}`;
  return clean;
}

/**
 * MR-24/AC-MR46: one channel from the member's own contacts.
 *
 * The register sends the code to the first **unproven** email, else the first
 * unproven WhatsApp, else the first unproven phone; a linked-only or a proven
 * contact never counts. A member with no own email, WhatsApp or phone at all is
 * refused with `409 no_own_contact`; a member whose every owned contact already
 * carries a proof is refused with `409 already_verified`.
 */
export function resolveDestination(
  contacts: readonly VerificationContact[],
  countryCode: string,
): ResolvedDestination {
  const own = contacts.filter((contact) => !contact.linked);
  if (own.length === 0) throw new NoOwnContactError();

  const unproven = own.filter((contact) => contact.verified !== true);
  if (unproven.length === 0) throw new AlreadyVerifiedError();

  const email = unproven.find((contact) => contact.kind === 'email');
  const whatsapp = unproven.find((contact) => contact.kind === 'whatsapp');
  const phone = unproven.find((contact) => contact.kind === 'phone');

  if (email) {
    return {
      channel: 'email',
      to: email.value.trim(),
      masked: maskEmail(email.value),
      contactId: email.id,
      valueHash: hashDestinationValue('email', email.value),
    };
  }

  if (whatsapp) {
    const digits = normalizeContactValue('whatsapp', whatsapp.value);
    return {
      channel: 'whatsapp',
      to: normaliseNumberForDelivery(digits, countryCode),
      masked: maskNumber(digits, countryCode),
      contactId: whatsapp.id,
      valueHash: hashDestinationValue('whatsapp', whatsapp.value),
    };
  }

  const digits = normalizeContactValue('phone', phone!.value);
  return {
    channel: 'phone',
    to: normaliseNumberForDelivery(digits, countryCode),
    masked: maskNumber(digits, countryCode),
    contactId: phone!.id,
    valueHash: hashDestinationValue('phone', phone!.value),
  };
}
