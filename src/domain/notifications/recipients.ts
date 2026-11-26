/**
 * Channel and destination resolution
 * (member-registrations-event-notifications.md N-4, N-5; FR-7, FR-11).
 *
 * The same resolver answers the preview and the fan-out, so the two cannot
 * disagree about who is reachable. A delivery records the contact id and a
 * masked snapshot; the raw value is returned only so the sender can address
 * the message, and it never leaves the delivery path.
 */

export type DeliveryChannel = 'email' | 'sms' | 'whatsapp';

export const DELIVERY_CHANNELS: readonly DeliveryChannel[] = ['email', 'sms', 'whatsapp'];

export const CHANNEL_CONTACT_KIND: Readonly<
  Record<DeliveryChannel, 'email' | 'phone' | 'whatsapp'>
> = {
  email: 'email',
  sms: 'phone',
  whatsapp: 'whatsapp',
};

export interface ContactFact {
  id: string;
  memberId: string;
  kind: 'email' | 'phone' | 'whatsapp';
  value: string;
  displayOrder: number;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface Destination {
  channel: DeliveryChannel;
  contactId: string;
  routedVia: 'own' | 'guardian';
  /** The contact's owning member; the guardian when `routedVia = 'guardian'`. */
  ownerMemberId: string;
  masked: string;
  /** Read to send, never written to a log, an error, a response or a metric. */
  value: string;
}

/**
 * Verified first, then the lowest `display_order`, then the oldest (N-5).
 * `member_contacts_order` already keeps display order unique per member.
 */
export function pickContact(
  contacts: readonly ContactFact[],
  channel: DeliveryChannel,
): ContactFact | undefined {
  const kind = CHANNEL_CONTACT_KIND[channel];
  return contacts
    .filter((contact) => contact.kind === kind)
    .sort((left, right) => {
      const verified = Number(right.verifiedAt !== null) - Number(left.verifiedAt !== null);
      if (verified !== 0) return verified;
      if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
      return left.createdAt.getTime() - right.createdAt.getTime();
    })[0];
}

/** A destination snapshot: never the raw value (FR-11, FR-35). */
export function maskDestination(channel: DeliveryChannel, value: string): string {
  if (channel === 'email') {
    const [local, domain] = value.split('@');
    if (!domain) return '***';
    const initial = local && local.length > 0 ? local[0]! : '*';
    return `${initial}***@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  return `***${digits.slice(-4).padStart(4, '0')}`;
}

/**
 * The member's own contact for the channel first, else the guardian chain of
 * at most three links (MR-40). A guardian who is themselves in the audience is
 * an independent recipient; this function only answers where one member's
 * message is addressed.
 */
export function resolveDestination(
  memberId: string,
  channel: DeliveryChannel,
  ownContacts: readonly ContactFact[],
  guardianContacts: ReadonlyMap<string, readonly ContactFact[]>,
  guardianOf: ReadonlyMap<string, string>,
): Destination | null {
  const own = pickContact(ownContacts, channel);
  if (own) {
    return {
      channel,
      contactId: own.id,
      routedVia: 'own',
      ownerMemberId: memberId,
      masked: maskDestination(channel, own.value),
      value: own.value,
    };
  }

  const seen = new Set<string>([memberId]);
  let current = guardianOf.get(memberId);
  for (let hop = 0; hop < 3 && current; hop += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    const guardian = pickContact(guardianContacts.get(current) ?? [], channel);
    if (guardian) {
      return {
        channel,
        contactId: guardian.id,
        routedVia: 'guardian',
        ownerMemberId: current,
        masked: maskDestination(channel, guardian.value),
        value: guardian.value,
      };
    }
    current = guardianOf.get(current);
  }
  return null;
}
