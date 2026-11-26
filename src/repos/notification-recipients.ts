import type { DbClient, Row } from '../db/sql.js';
import { audienceRegister, type RegisterMember } from './audience-members.js';
import { audienceRules, eventAudiences } from './event-audiences.js';
import { memberMatchesEventAudiences } from '../domain/event-audiences.js';
import type { Cadence } from '../domain/notifications/skip.js';
import {
  DELIVERY_CHANNELS,
  resolveDestination,
  type ContactFact,
  type DeliveryChannel,
  type Destination,
} from '../domain/notifications/recipients.js';

/**
 * The send-side readings (N-4, N-5, N-10): who the audience covers at the
 * instance date, where each member's channels point, and the live preference
 * state. Query building stays here; the pure precedence and masking live in
 * `src/domain/notifications/`.
 */

export interface MemberPreferenceState {
  blocked: Set<DeliveryChannel>;
  eventMuted: boolean;
  periodMuted: boolean;
  cadence: Cadence;
}

interface ContactRow extends Row {
  id: string;
  member_id: string;
  kind: 'email' | 'phone' | 'whatsapp';
  value: string;
  display_order: number;
  verified_at: Date | string | null;
  created_at: Date | string;
}

function toContact(row: ContactRow): ContactFact {
  return {
    id: row.id,
    memberId: row.member_id,
    kind: row.kind,
    value: row.value,
    displayOrder: row.display_order,
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
    createdAt: new Date(row.created_at),
  };
}

/** The event's audience intersection at `at`, deduplicated (N-4, FR-6). */
export async function recipientsAt(
  db: DbClient,
  eventId: string,
  at: string,
): Promise<RegisterMember[]> {
  const rules = audienceRules(await eventAudiences(db, eventId));
  const register = await audienceRegister(db, at);
  const seen = new Set<string>();
  return register.filter((member) => {
    if (seen.has(member.id)) return false;
    if (!memberMatchesEventAudiences(rules, member, at)) return false;
    seen.add(member.id);
    return true;
  });
}

export async function eventPeriodId(db: DbClient, eventId: string): Promise<string | null> {
  const [row] = await db.query<{ period_id: string | null }>(
    'select period_id from events where id = $1',
    [eventId],
  );
  return row?.period_id ?? null;
}

async function contactsFor(
  db: DbClient,
  memberIds: readonly string[],
): Promise<Map<string, ContactFact[]>> {
  const result = new Map<string, ContactFact[]>(memberIds.map((id) => [id, []]));
  if (memberIds.length === 0) return result;
  const rows = await db.query<ContactRow>(
    `select id, member_id, kind, value, display_order, verified_at, created_at
       from member_contacts
      where member_id = any($1::uuid[])`,
    [memberIds],
  );
  for (const row of rows) {
    result.get(row.member_id)?.push(toContact(row));
  }
  return result;
}

interface GuardianEdge extends Row {
  member_id: string;
  related_member_id: string;
}

/**
 * The guardian chain of at most three links (MR-40), with each discovered
 * guardian's contacts loaded. A member's own contacts are not merged into a
 * guardian's; the resolver picks own-first.
 */
async function guardianGraph(
  db: DbClient,
  memberIds: readonly string[],
): Promise<{
  guardianOf: Map<string, string>;
  guardianContacts: Map<string, ContactFact[]>;
}> {
  const guardianOf = new Map<string, string>();
  let frontier = [...new Set(memberIds)];
  const discovered = new Set(frontier);

  for (let hop = 0; hop < 3 && frontier.length > 0; hop += 1) {
    const edges = await db.query<GuardianEdge>(
      `select member_id, related_member_id
         from member_relationships
        where type = 'guardian' and member_id = any($1::uuid[])
        order by created_at, id`,
      [frontier],
    );
    const next: string[] = [];
    for (const edge of edges) {
      if (guardianOf.has(edge.member_id)) continue;
      guardianOf.set(edge.member_id, edge.related_member_id);
      if (!discovered.has(edge.related_member_id)) {
        discovered.add(edge.related_member_id);
        next.push(edge.related_member_id);
      }
    }
    frontier = next;
  }

  const guardians = [...discovered].filter((id) => !memberIds.includes(id));
  return { guardianOf, guardianContacts: await contactsFor(db, guardians) };
}

export interface ResolvedRecipients {
  /** Members who own at least one contact, so they get an inbox row (FR-7). */
  inboxEligible: Set<string>;
  /** member id -> channel -> destination; a missing channel is unreachable. */
  destinations: Map<string, Map<DeliveryChannel, Destination>>;
}

/**
 * The one destination resolver the preview and the fan-out share (N-5,
 * FR-11). Verified first, then lowest display order, then oldest; own contact
 * first, then the guardian chain.
 */
export async function resolveRecipients(
  db: DbClient,
  memberIds: readonly string[],
  now: Date,
): Promise<ResolvedRecipients> {
  void now;
  const ownContacts = await contactsFor(db, memberIds);
  const { guardianOf, guardianContacts } = await guardianGraph(db, memberIds);

  const inboxEligible = new Set<string>();
  const destinations = new Map<string, Map<DeliveryChannel, Destination>>();

  for (const memberId of memberIds) {
    const own = ownContacts.get(memberId) ?? [];
    if (own.length > 0) inboxEligible.add(memberId);
    const perChannel = new Map<DeliveryChannel, Destination>();
    for (const channel of DELIVERY_CHANNELS) {
      const destination = resolveDestination(memberId, channel, own, guardianContacts, guardianOf);
      if (destination) perChannel.set(channel, destination);
    }
    destinations.set(memberId, perChannel);
  }

  return { inboxEligible, destinations };
}

/**
 * Live preference state for the members, evaluated at `now` (N-5, FR-29).
 * An expired or revoked row is invisible even between maintenance sweeps.
 */
export async function preferenceStates(
  db: DbClient,
  memberIds: readonly string[],
  eventId: string,
  periodId: string | null,
  now: Date,
): Promise<Map<string, MemberPreferenceState>> {
  const result = new Map<string, MemberPreferenceState>(
    memberIds.map((id) => [
      id,
      {
        blocked: new Set<DeliveryChannel>(),
        eventMuted: false,
        periodMuted: false,
        cadence: 'all',
      },
    ]),
  );
  if (memberIds.length === 0) return result;

  const blocks = await db.query<{ member_id: string; channel: DeliveryChannel }>(
    `select member_id, channel
       from member_channel_blocks
      where member_id = any($1::uuid[])
        and revoked_at is null
        and expires_at > $2`,
    [memberIds, now],
  );
  for (const block of blocks) result.get(block.member_id)?.blocked.add(block.channel);

  const mutes = await db.query<{
    member_id: string;
    scope_type: 'event' | 'period';
    scope_id: string;
  }>(
    `select member_id, scope_type, scope_id
       from notification_mutes
      where member_id = any($1::uuid[])
        and revoked_at is null
        and expires_at > $2`,
    [memberIds, now],
  );
  for (const mute of mutes) {
    const state = result.get(mute.member_id);
    if (!state) continue;
    if (mute.scope_type === 'event' && mute.scope_id === eventId) state.eventMuted = true;
    if (mute.scope_type === 'period' && periodId !== null && mute.scope_id === periodId) {
      state.periodMuted = true;
    }
  }

  const settings = await db.query<{ member_id: string; cadence: Cadence }>(
    `select member_id, cadence
       from member_notification_settings
      where member_id = any($1::uuid[])`,
    [memberIds],
  );
  for (const setting of settings) {
    const state = result.get(setting.member_id);
    if (state) state.cadence = setting.cadence;
  }

  return result;
}
