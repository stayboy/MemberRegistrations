import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { AlreadyVerifiedError, NoOwnContactError } from '../../src/errors/domain-errors.js';
import {
  generateOtp,
  generateToken,
  hashDestinationValue,
  hashOtp,
  hashToken,
  maskEmail,
  maskNumber,
  normaliseNumberForDelivery,
  otpMatches,
  OTP_LENGTH,
  resolveDestination,
  type VerificationContact,
} from '../../src/domain/verification.js';

const PEPPER = 'test-otp-pepper-16';

let contactSeq = 0;

function contact(
  kind: VerificationContact['kind'],
  value: string,
  linked = false,
  verified = false,
): VerificationContact {
  contactSeq += 1;
  return { id: `contact-${contactSeq}`, kind, value, linked, verified };
}

describe('one-time codes (MR-25)', () => {
  it('generates six digits, zero-padded', () => {
    for (let index = 0; index < 500; index += 1) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
      expect(code).toHaveLength(OTP_LENGTH);
    }
  });

  it('stores only an HMAC under the pepper and compares in constant time', () => {
    const code = '012345';
    const hash = hashOtp(code, PEPPER);

    expect(hash).not.toContain(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtp(code, PEPPER)).toBe(hash);
    expect(hashOtp(code, 'another-pepper-16')).not.toBe(hash);
    // The label separates this HMAC from a bare HMAC of the same digits.
    expect(hash).not.toBe(createHmac('sha256', PEPPER).update(code).digest('hex'));

    expect(otpMatches(code, hash, PEPPER)).toBe(true);
    expect(otpMatches('012346', hash, PEPPER)).toBe(false);
    expect(otpMatches(code, hash, 'another-pepper-16')).toBe(false);
  });
});

describe('the acceptance-page token (MR-51)', () => {
  it('is random base64url and stored only as a SHA-256 hex', () => {
    const first = generateToken();
    const second = generateToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);

    const hash = hashToken(first);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(first).digest('hex'));
    expect(hash).not.toContain(first);
  });
});

describe('masks and delivery numbers (MR-24, MR-34)', () => {
  it('masks a number as +<country code> *** <last two>', () => {
    expect(maskNumber('8045678901', '233')).toBe('+233 *** 01');
    expect(maskNumber('0804 567 8901', '233')).toBe('+233 *** 01');
    expect(maskNumber('2338045678942', '233')).toBe('+233 *** 42');
  });

  it('masks a long number with its own country code, not the default', () => {
    // A stored number beyond ten digits already carries its own code (MR-24).
    expect(maskNumber('447911123456', '233')).toBe('+44 *** 56');
    expect(maskNumber('12125550123', '233')).toBe('+1 *** 23');
    expect(maskNumber('233 804 567 8901', '1')).toBe('+233 *** 01');
  });

  it('masks an email with its first letter and its domain', () => {
    expect(maskEmail('ama@example.com')).toBe('a***@example.com');
  });

  it('prefixes the country code only for a short number that lacks it', () => {
    expect(normaliseNumberForDelivery('8045678901', '233')).toBe('2338045678901');
    expect(normaliseNumberForDelivery('233 804 567 8901', '233')).toBe('2338045678901');
    // Ten digits that already start with the code are used as stored.
    expect(normaliseNumberForDelivery('2331234567', '233')).toBe('2331234567');
    // A longer number already carries its own code.
    expect(normaliseNumberForDelivery('447911123456', '233')).toBe('447911123456');
  });
});

describe('the accept-time value hash (MR-26)', () => {
  it('hashes the normalised value, so spacing or case does not move it', () => {
    expect(hashDestinationValue('phone', '0804 567 8901')).toBe(
      hashDestinationValue('phone', '8045678901'),
    );
    expect(hashDestinationValue('email', 'Ama@Example.com')).toBe(
      hashDestinationValue('email', ' ama@example.com '),
    );
    // A different value, or the same value on another channel, is a different hash.
    expect(hashDestinationValue('phone', '0804 567 8901')).not.toBe(
      hashDestinationValue('phone', '0804 567 8902'),
    );
    expect(hashDestinationValue('phone', '8045678901')).not.toBe(
      hashDestinationValue('whatsapp', '8045678901'),
    );
    expect(hashDestinationValue('phone', '0804 567 8901')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('one-channel destination resolution (MR-24, MR-43, AC-MR46)', () => {
  it('chooses email first when the member has an owned number too', () => {
    const email = contact('email', 'Ama@Example.com');
    const destination = resolveDestination(
      [contact('phone', '0804 567 8901'), email, contact('whatsapp', '0555 000 111')],
      '233',
    );
    expect(destination).toEqual({
      channel: 'email',
      to: 'Ama@Example.com',
      masked: 'A***@Example.com',
      contactId: email.id,
      valueHash: hashDestinationValue('email', 'Ama@Example.com'),
    });
  });

  it('chooses WhatsApp when there is no email', () => {
    const whatsapp = contact('whatsapp', '0555000111');
    const destination = resolveDestination([whatsapp], '233');
    expect(destination).toEqual({
      channel: 'whatsapp',
      to: '233555000111',
      masked: '+233 *** 11',
      contactId: whatsapp.id,
      valueHash: hashDestinationValue('whatsapp', '0555000111'),
    });
  });

  it('chooses the phone for a phone-only member', () => {
    const phone = contact('phone', '08045678901');
    const destination = resolveDestination([phone], '233');
    expect(destination).toEqual({
      channel: 'phone',
      to: '2338045678901',
      masked: '+233 *** 01',
      contactId: phone.id,
      valueHash: hashDestinationValue('phone', '08045678901'),
    });
  });

  it('resolves an email-only member to email (MR-43)', () => {
    const email = contact('email', 'ama@example.com');
    const destination = resolveDestination([email], '233');
    expect(destination).toEqual({
      channel: 'email',
      to: 'ama@example.com',
      masked: 'a***@example.com',
      contactId: email.id,
      valueHash: hashDestinationValue('email', 'ama@example.com'),
    });
  });

  it('skips a proven contact and takes the first unproven one (MR-24, AC-MR46)', () => {
    const provenEmail = contact('email', 'done@example.com', false, true);
    const whatsapp = contact('whatsapp', '0555 000 222');
    const destination = resolveDestination([provenEmail, whatsapp], '233');
    expect(destination.channel).toBe('whatsapp');
    expect(destination.contactId).toBe(whatsapp.id);

    // A proven WhatsApp is skipped for the unproven phone, even though the
    // WhatsApp sits earlier in the channel order.
    const provenWhatsapp = contact('whatsapp', '0555 000 333', false, true);
    const phone = contact('phone', '0804 567 8902');
    const fallback = resolveDestination([provenWhatsapp, phone], '233');
    expect(fallback.channel).toBe('phone');
    expect(fallback.contactId).toBe(phone.id);
  });

  it('refuses a member whose every owned contact is proven (AC-MR46)', () => {
    expect(() =>
      resolveDestination(
        [
          contact('email', 'done@example.com', false, true),
          contact('phone', '0804 567 8903', false, true),
        ],
        '233',
      ),
    ).toThrow(AlreadyVerifiedError);
  });

  it('refuses a contactless member', () => {
    expect(() => resolveDestination([], '233')).toThrow(NoOwnContactError);
  });

  it('ignores a linked contact and uses the owned email', () => {
    const destination = resolveDestination(
      [contact('whatsapp', '0555000111', true), contact('email', 'ama@example.com')],
      '233',
    );
    expect(destination.channel).toBe('email');
  });

  it('refuses a member whose only contact is another member’s linked number', () => {
    expect(() => resolveDestination([contact('whatsapp', '0555000111', true)], '233')).toThrow(
      NoOwnContactError,
    );
  });
});
