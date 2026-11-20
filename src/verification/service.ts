import {
  AlreadyVerifiedError,
  CodeExpiredError,
  CodeInvalidError,
  DeliveryUnavailableError,
  NotFoundError,
  RateLimitedError,
  TooManyTriesError,
  ValidationError,
} from '../errors/domain-errors.js';
import {
  ACCEPT_IP_LIMIT,
  ACCEPT_TOKEN_LIMIT,
  generateOtp,
  generateToken,
  hashDestinationValue,
  hashOtp,
  hashToken,
  otpMatches,
  OTP_HOURLY_LIMIT,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MS,
  OTP_TTL_MS,
  resolveDestination,
  type DeliveryChannel,
  type ResolvedDestination,
  type VerificationDestination,
} from '../domain/verification.js';
import type { Senders } from '../messaging/senders.js';
import type {
  LiveCode,
  VerificationMember,
  VerificationRepository,
} from '../repos/verification.js';

export interface VerificationServiceOptions {
  /** Hashes every stored code (MR-25). */
  otpPepper: string;
  /** `DEFAULT_COUNTRY_CODE`: prefixes a bare number for delivery and masking. */
  countryCode: string;
  /** The member acceptance page; the SMS appends `#t=<token>` (MR-51). */
  linkBase: string;
  /** A channel with no sender is refused before anything is generated (MR-35). */
  senders: Senders;
}

/** The wire shape of `POST /v1/members/:memberNo/verification/otp`. */
export interface IssueResult {
  destination: VerificationDestination;
  expiresAt: string;
}

/** The public acceptance page's answer: the masked destination and nothing else. */
export interface AcceptResult {
  channel: DeliveryChannel;
  masked: string;
}

const EMAIL_SUBJECT = 'Verify your membership';

/**
 * The verification engine: issue a code, accept it, confirm or revoke.
 *
 * `issue` resolves the one destination from the member's own contacts, proves
 * the channel can send, throttles, generates one code and one acceptance-page
 * token, stores only their hashes and sends the code and the link to that one
 * channel. `accept` is the only completion path: the page's token and code set
 * the destination contact's proof.
 */
export class VerificationService {
  constructor(
    private readonly repo: VerificationRepository,
    private readonly options: VerificationServiceOptions,
  ) {}

  async issue(memberNo: string, now: Date = new Date()): Promise<IssueResult> {
    const member = await this.requireActiveMember(memberNo);

    // MR-24/AC-MR46: the resolver skips a proven contact and takes the first
    // unproven one, email then WhatsApp then phone. No own contact at all is
    // `409 no_own_contact`; every own contact proven is `409 already_verified`.
    const proven = new Set(member.verifiedContacts.map((contact) => contact.id));
    const destination = resolveDestination(
      member.contacts.map((contact) => ({
        id: contact.id,
        kind: contact.kind,
        value: contact.value,
        linked: contact.linked,
        verified: proven.has(contact.id),
      })),
      this.options.countryCode,
    );

    // AC-MR46: an officer-confirmed member has nothing left to prove, so a
    // direct issue is refused the same way the action is hidden.
    if (member.confirmedAt !== null) throw new AlreadyVerifiedError();

    // MR-35: the channel must have a sender before anything else happens, so a
    // 503 on a misconfigured deployment consumes no window and stores nothing.
    this.assertDeliverable(destination);

    // MR-27: at most one send per 60 seconds and five per hour, officer sends
    // included; both counters live in Postgres. The two windows answer
    // distinguishable refusals so the USSD notice can name the wait or the cap.
    const withinMinute = await this.repo.consumeRateLimit(
      `verify:member:${member.id}:minute`,
      1,
      Math.max(1, Math.round(OTP_RESEND_MS / 60_000)),
    );
    if (!withinMinute) {
      throw new RateLimitedError('A code was sent less than a minute ago', 'minute');
    }
    if (
      !(await this.repo.consumeRateLimit(`verify:member:${member.id}:hour`, OTP_HOURLY_LIMIT, 60))
    ) {
      throw new RateLimitedError('Five codes were sent in the last hour', 'hour');
    }

    const code = generateOtp();
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    const minutes = Math.round(OTP_TTL_MS / 60_000);

    // Store first, so a delivered code always has the hash (and token hash) it
    // will be checked against, and the contact it binds to (MR-26). A
    // stored-but-unsent row is harmless: the next issue consumes it, and a
    // transport failure is still a 503.
    const live = await this.repo.replaceLiveCode(member.id, {
      codeHash: hashOtp(code, this.options.otpPepper),
      destination: { channel: destination.channel, masked: destination.masked },
      contactId: destination.contactId,
      destinationValueHash: destination.valueHash,
      tokenHash: hashToken(token),
      expiresAt,
    });

    // Every channel completes on the member acceptance page (owner, 2026-11-19):
    // the message carries the six digits and the single-use link.
    const body = `Your member verification code is ${code}. Open ${this.options.linkBase}#t=${token} and enter it. It expires in ${minutes} minutes. If you did not ask for it, ignore this message.`;

    await this.send(destination, body);

    return {
      destination: live.destination,
      expiresAt: live.expiresAt,
    };
  }

  /**
   * MR-51: the public acceptance page, the only completion path. The token names
   * the live code whatever channel it was sent to; the code sets that contact's
   * proof and consumes both. The rate limit comes first, per token and per
   * address, then the five-attempt cap.
   */
  async accept(
    token: string,
    code: string,
    now: Date = new Date(),
    address?: string,
  ): Promise<AcceptResult> {
    const tokenHash = hashToken(token.trim());

    const withinRate =
      (await this.repo.consumeRateLimit(`verify:token:${tokenHash}`, ACCEPT_TOKEN_LIMIT, 1)) &&
      (address === undefined ||
        (await this.repo.consumeRateLimit(`verify:ip:${address}`, ACCEPT_IP_LIMIT, 1)));
    if (!withinRate) throw new RateLimitedError();

    const live = await this.repo.liveCodeByToken(tokenHash);
    if (!live) throw new CodeInvalidError('That code is not valid');

    const member = await this.repo.verificationById(live.memberId);
    if (!member || member.purged) throw new CodeInvalidError('That code is no longer valid');
    // MR-26: the code is bound to the one contact it was sent to. A contact
    // removed or edited after issue is refused, and the proof (if any) stays
    // untouched, because a hash of the value at issue time no longer matches.
    const contact =
      live.contactId === null
        ? null
        : (member.contacts.find((entry) => entry.id === live.contactId && !entry.linked) ?? null);
    if (!contact) throw new CodeInvalidError('That code is no longer valid');
    if (
      hashDestinationValue(contact.kind, contact.value) !== live.destinationValueHash ||
      contact.kind !== live.destination.channel
    ) {
      throw new CodeInvalidError('That code was sent to a contact that has since changed');
    }

    await this.assertLiveCode(live, code, now);

    await this.repo.acceptCode(live.id, contact.id, live.destinationValueHash, now);
    return { channel: live.destination.channel, masked: live.destination.masked };
  }

  /**
   * MR-52's 404 asymmetry: confirming requires an active member (an archived
   * record is read-only), while {@link withdrawConfirmation} and {@link revoke}
   * accept an archived record because withdrawing a stale attestation or proof is
   * cleanup, not a write to the member. A purged member is 404 on all three.
   *
   * MR-52: an audited officer confirmation with a required reason.
   */
  async confirm(
    memberNo: string,
    reason: string,
    actor: string,
    now: Date = new Date(),
  ): Promise<{ confirmedAt: string }> {
    const trimmed = reason.trim();
    if (!trimmed) throw new ValidationError('reason is required');
    const member = await this.requireActiveMember(memberNo);
    const confirmedAt = await this.repo.confirm(member.id, actor, trimmed, now);
    return { confirmedAt };
  }

  /** MR-52: withdraw the confirmation alone, audited; contact proofs stay. */
  async withdrawConfirmation(
    memberNo: string,
    actor: string,
    now: Date = new Date(),
  ): Promise<void> {
    const member = await requireMember(this.repo, memberNo);
    await this.repo.withdrawConfirmations(member.id, actor, now);
  }

  /** MR-31: withdraw every contact proof and the confirmation; never a contact. */
  async revoke(memberNo: string, actor: string, now: Date = new Date()): Promise<void> {
    // Revoking an archived record is a legitimate cleanup; only an unknown or
    // purged member is a 404 (a purge has already erased the history).
    const member = await requireMember(this.repo, memberNo);
    await this.repo.revokeAll(member.id, actor, now);
  }

  /** An unknown, archived or purged member is a 404 on the officer surfaces. */
  private async requireActiveMember(memberNo: string): Promise<VerificationMember> {
    const member = await this.repo.verificationFor(memberNo);
    if (!member || member.archived || member.purged) {
      throw new NotFoundError(`Member ${memberNo} was not found`);
    }
    return member;
  }

  /**
   * The shared attempt/expiry check. A wrong code counts one attempt; the fifth
   * ends the code with `too_many_tries` (MR-25, MR-26).
   */
  private async assertLiveCode(live: LiveCode, code: string, now: Date): Promise<void> {
    if (Date.parse(live.expiresAt) <= now.getTime()) {
      throw new CodeExpiredError('That code has expired; request a new one');
    }
    if (live.attempts >= OTP_MAX_ATTEMPTS) {
      await this.repo.consumeCode(live.id);
      throw new TooManyTriesError();
    }
    if (!otpMatches(code.trim(), live.codeHash, this.options.otpPepper)) {
      const attempts = await this.repo.recordAttempt(live.id);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.repo.consumeCode(live.id);
        throw new TooManyTriesError();
      }
      const remaining = OTP_MAX_ATTEMPTS - attempts;
      throw new CodeInvalidError(
        `That code is not valid; ${remaining} attempt${remaining === 1 ? '' : 's'} remain`,
      );
    }
  }

  private assertDeliverable(destination: ResolvedDestination): void {
    const sender =
      destination.channel === 'email'
        ? this.options.senders.email
        : destination.channel === 'whatsapp'
          ? this.options.senders.whatsapp
          : this.options.senders.sms;
    if (!sender) {
      throw new DeliveryUnavailableError(
        `No ${destination.channel} sender is configured, so the code was not sent`,
      );
    }
  }

  private async send(destination: ResolvedDestination, body: string): Promise<void> {
    if (destination.channel === 'email') {
      const sender = this.options.senders.email;
      if (!sender) throw new DeliveryUnavailableError();
      await sender.send(destination.to, EMAIL_SUBJECT, body);
      return;
    }
    const sender =
      destination.channel === 'whatsapp' ? this.options.senders.whatsapp : this.options.senders.sms;
    if (!sender) throw new DeliveryUnavailableError();
    await sender.send(destination.to, body);
  }
}

/** The member the confirmation and revoke paths see; unknown or purged is a 404. */
async function requireMember(
  repo: VerificationRepository,
  memberNo: string,
): Promise<VerificationMember> {
  const member = await repo.verificationFor(memberNo);
  if (!member || member.purged) {
    throw new NotFoundError(`Member ${memberNo} was not found`);
  }
  return member;
}
