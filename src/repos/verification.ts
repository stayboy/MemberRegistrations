import type { Db, DbClient, Row } from '../db/sql.js';
import type { ContactKind } from '../domain/contacts.js';
import { normalizeContactValue } from '../domain/contacts.js';
import {
  hashDestinationValue,
  maskEmail,
  maskNumber,
  type DeliveryChannel,
  type VerificationDestination,
} from '../domain/verification.js';
import { CodeInvalidError, RateLimitedError } from '../errors/domain-errors.js';
import { sqlConstraint, sqlState } from '../errors/sqlstate.js';
import { loadContacts, type ContactDto } from './contacts.js';

/**
 * The verification aggregate: the member's contacts and their proofs, the
 * officer confirmation audit and the one live code. Every write that decides an
 * outcome lives in a transaction, so consuming a code and setting a proof never
 * half-apply.
 */

export interface LiveCode {
  id: string;
  memberId: string;
  codeHash: string;
  destination: VerificationDestination;
  /** The one contact the code binds to; null when the row is unreadable (MR-26). */
  contactId: string | null;
  /** The chosen value's hash at issue time; `accept` re-checks it (MR-26). */
  destinationValueHash: string;
  tokenHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
}

/** A proven contact as `MemberDetail` carries it. */
export interface VerifiedContact {
  id: string;
  channel: DeliveryChannel;
  masked: string;
  verifiedAt: string;
}

export interface VerificationMember {
  id: string;
  memberNo: string;
  archived: boolean;
  purged: boolean;
  /** Own and linked contacts; the resolver takes the own ones only. */
  contacts: ContactDto[];
  verifiedContacts: VerifiedContact[];
  confirmedAt: string | null;
  live: LiveCode | null;
}

export interface ReplaceLiveCodeInput {
  codeHash: string;
  destination: VerificationDestination;
  /** The one contact the code is bound to (MR-26). */
  contactId: string;
  /** The chosen value's hash, compared again at accept (MR-26). */
  destinationValueHash: string;
  /** Always present: every channel completes on the acceptance page (MR-51). */
  tokenHash: string;
  expiresAt: Date;
}

interface MemberVerificationRow extends Row {
  id: string;
  member_no: string;
  archived_at: Date | string | null;
  purged_at: Date | string | null;
}

interface CodeDbRow extends Row {
  id: string;
  member_id: string;
  code_hash: string;
  destination: unknown;
  contact_id: string | null;
  destination_value_hash: string;
  token_hash: string;
  expires_at: Date | string;
  attempts: number | string;
  created_at: Date | string;
}

const CODE_COLUMNS = `id, member_id, code_hash, destination, contact_id, destination_value_hash,
  token_hash, expires_at, attempts, created_at`;

function isoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * The stored destination, or null when the row is unreadable. A row written by
 * an older shape names no destination the register can trust, so it is treated
 * as no code at all rather than as one aimed at a guessed channel (MR-24).
 */
function destinationFrom(value: unknown): VerificationDestination | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      parsed = null;
    }
  }
  const candidate = parsed as { channel?: unknown; masked?: unknown } | null;
  if (typeof candidate?.channel !== 'string' || typeof candidate?.masked !== 'string') {
    return null;
  }
  return { channel: candidate.channel as DeliveryChannel, masked: candidate.masked };
}

function codeFromRow(row: CodeDbRow): LiveCode | null {
  const destination = destinationFrom(row.destination);
  if (destination === null) return null;
  return {
    id: row.id,
    memberId: row.member_id,
    codeHash: row.code_hash,
    destination,
    contactId: row.contact_id,
    destinationValueHash: row.destination_value_hash,
    tokenHash: row.token_hash,
    expiresAt: isoTimestamp(row.expires_at)!,
    attempts: Number(row.attempts),
    createdAt: isoTimestamp(row.created_at)!,
  };
}

/** The masked form of a proven contact, for `MemberDetail.verifiedContacts`. */
export function maskProof(kind: ContactKind, value: string, countryCode: string): string {
  if (kind === 'email') return maskEmail(value);
  return maskNumber(normalizeContactValue(kind, value), countryCode);
}

/**
 * The proven own contacts, newest proof first. A shared contact's proof belongs
 * to its owner, so only rows this member owns are read.
 */
export async function loadVerifiedContacts(
  db: DbClient,
  memberId: string,
  countryCode: string,
): Promise<VerifiedContact[]> {
  const rows = await db.query<
    Row & { id: string; kind: ContactKind; value: string; verified_at: Date | string }
  >(
    `select id, kind, value, verified_at
       from member_contacts
      where member_id = $1 and verified_at is not null
      order by verified_at desc, display_order, id`,
    [memberId],
  );
  return rows.map((row) => ({
    id: row.id,
    channel: row.kind,
    masked: maskProof(row.kind, row.value, countryCode),
    verifiedAt: isoTimestamp(row.verified_at)!,
  }));
}

/** The latest non-withdrawn officer confirmation, if any (MR-52). */
export async function loadActiveConfirmation(
  db: DbClient,
  memberId: string,
): Promise<string | null> {
  const [row] = await db.query<{ confirmed_at: Date | string }>(
    `select confirmed_at
       from member_confirmations
      where member_id = $1 and withdrawn_at is null
      order by confirmed_at desc, id desc
      limit 1`,
    [memberId],
  );
  return row ? isoTimestamp(row.confirmed_at) : null;
}

export class VerificationRepository {
  constructor(
    private readonly db: Db,
    /** `DEFAULT_COUNTRY_CODE`: how a proven number is masked (MR-24, MR-34). */
    private readonly countryCode: string,
  ) {}

  /**
   * The member as the verification engine sees it, archived or not: the route
   * decides 404, because an archived member must not start a code.
   */
  async verificationFor(memberNo: string): Promise<VerificationMember | null> {
    const [row] = await this.db.query<MemberVerificationRow>(
      `select id, member_no, archived_at, purged_at
         from members
        where lower(member_no) = lower($1)`,
      [memberNo],
    );
    return row ? this.loadMember(row) : null;
  }

  /** The same aggregate addressed by the id a code row carries. */
  async verificationById(memberId: string): Promise<VerificationMember | null> {
    const [row] = await this.db.query<MemberVerificationRow>(
      `select id, member_no, archived_at, purged_at from members where id = $1`,
      [memberId],
    );
    return row ? this.loadMember(row) : null;
  }

  private async loadMember(row: MemberVerificationRow): Promise<VerificationMember> {
    const contacts = (await loadContacts(this.db, [row.id])).get(row.id) ?? [];
    const [verifiedContacts, confirmedAt, live] = await Promise.all([
      loadVerifiedContacts(this.db, row.id, this.countryCode),
      loadActiveConfirmation(this.db, row.id),
      this.liveCode(row.id),
    ]);
    return {
      id: row.id,
      memberNo: row.member_no,
      archived: row.archived_at !== null,
      purged: row.purged_at !== null,
      contacts,
      verifiedContacts,
      confirmedAt,
      live,
    };
  }

  /** The single unconsumed code, if any (the partial unique index guarantees one). */
  async liveCode(memberId: string): Promise<LiveCode | null> {
    const [row] = await this.db.query<CodeDbRow>(
      `select ${CODE_COLUMNS}
         from member_verification_codes
        where member_id = $1 and consumed_at is null
        order by created_at desc
        limit 1`,
      [memberId],
    );
    return row ? codeFromRow(row) : null;
  }

  /** The live acceptance-page code a token names; the token is stored hashed. */
  async liveCodeByToken(tokenHash: string): Promise<LiveCode | null> {
    const [row] = await this.db.query<CodeDbRow>(
      `select ${CODE_COLUMNS}
         from member_verification_codes
        where token_hash = $1 and consumed_at is null
        order by created_at desc
        limit 1`,
      [tokenHash],
    );
    return row ? codeFromRow(row) : null;
  }

  /**
   * Consumes the previous live code and inserts the new hash, destination,
   * bound contact, value hash, token and expiry in one transaction, so a member
   * never holds two live codes.
   *
   * Two concurrent issues can still collide on the partial unique index; that
   * loser answers the same 429 as the throttle rather than a 500, because the
   * caller's other request is already on its way (MR-27).
   */
  async replaceLiveCode(memberId: string, input: ReplaceLiveCodeInput): Promise<LiveCode> {
    return this.db.transaction(async (tx) => {
      await this.consumeLive(tx, memberId);
      try {
        const [row] = await tx.query<CodeDbRow>(
          `insert into member_verification_codes (
             member_id, code_hash, destination, contact_id, destination_value_hash,
             token_hash, expires_at
           ) values ($1, $2, $3::jsonb, $4::uuid, $5, $6, $7::timestamptz)
           returning ${CODE_COLUMNS}`,
          [
            memberId,
            input.codeHash,
            JSON.stringify(input.destination),
            input.contactId,
            input.destinationValueHash,
            input.tokenHash,
            input.expiresAt.toISOString(),
          ],
        );
        const live = codeFromRow(row!);
        if (live === null) throw new Error('The stored code row has no readable destination');
        return live;
      } catch (error) {
        if (
          sqlState(error) === '23505' &&
          (sqlConstraint(error) === undefined ||
            sqlConstraint(error) === 'member_verification_codes_live')
        ) {
          throw new RateLimitedError('Another code was issued for this member at the same time');
        }
        throw error;
      }
    });
  }

  /** Counts one wrong attempt and answers the new count. */
  async recordAttempt(codeId: string): Promise<number> {
    const [row] = await this.db.query<{ attempts: number | string }>(
      `update member_verification_codes
          set attempts = attempts + 1
        where id = $1
        returning attempts`,
      [codeId],
    );
    return Number(row?.attempts ?? 0);
  }

  /** Single use: a consumed code is refused forever (MR-25). */
  async consumeCode(codeId: string): Promise<void> {
    await this.db.query(
      `update member_verification_codes
          set consumed_at = now()
        where id = $1 and consumed_at is null`,
      [codeId],
    );
  }

  /**
   * Sets the one bound contact's proof and consumes the code, in one
   * transaction (MR-26). The contact is locked and its current value re-hashed:
   * a contact edited after issue refuses the code with `code_invalid` and leaves
   * the proof untouched. A code already consumed by a concurrent submission is
   * refused too, so the second entry never succeeds.
   */
  async acceptCode(
    codeId: string,
    contactId: string,
    expectedValueHash: string,
    now: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [contact] = await tx.query<{ kind: ContactKind; value: string }>(
        `select kind, value from member_contacts where id = $1 for update`,
        [contactId],
      );
      if (!contact || hashDestinationValue(contact.kind, contact.value) !== expectedValueHash) {
        throw new CodeInvalidError('That code was sent to a contact that has since changed');
      }

      const consumed = await tx.query<{ id: string }>(
        `update member_verification_codes
            set consumed_at = now()
          where id = $1 and consumed_at is null
          returning id`,
        [codeId],
      );
      if (consumed.length === 0) {
        throw new CodeInvalidError('That code is not valid');
      }

      await tx.query(`update member_contacts set verified_at = $2::timestamptz where id = $1`, [
        contactId,
        now.toISOString(),
      ]);
    });
  }

  /** MR-31/MR-32: clearing a proof is per contact, never the whole history. */
  async setContactVerified(contactId: string, now: Date): Promise<void> {
    await this.db.query(`update member_contacts set verified_at = $2::timestamptz where id = $1`, [
      contactId,
      now.toISOString(),
    ]);
  }

  /** MR-31: withdraw every contact proof; contacts themselves stay. */
  async clearProofs(memberId: string): Promise<void> {
    await this.db.query(
      `update member_contacts
          set verified_at = null
        where member_id = $1 and verified_at is not null`,
      [memberId],
    );
  }

  /** MR-52: append the officer confirmation and answer its instant. */
  async confirm(memberId: string, actor: string, reason: string, now: Date): Promise<string> {
    const [row] = await this.db.query<{ confirmed_at: Date | string }>(
      `insert into member_confirmations (
         member_id, confirmed_by, confirmed_at, reason
       ) values ($1, $2, $3::timestamptz, $4)
       returning confirmed_at`,
      [memberId, actor, now.toISOString(), reason],
    );
    return isoTimestamp(row!.confirmed_at)!;
  }

  /** MR-52: withdraw every active confirmation, audited; append-only history stays. */
  async withdrawConfirmations(memberId: string, actor: string, now: Date): Promise<void> {
    await this.db.query(
      `update member_confirmations
          set withdrawn_at = $2::timestamptz, withdrawn_by = $3
        where member_id = $1 and withdrawn_at is null`,
      [memberId, now.toISOString(), actor],
    );
  }

  /** The latest non-withdrawn officer confirmation (MR-52). */
  async activeConfirmation(memberId: string): Promise<string | null> {
    return loadActiveConfirmation(this.db, memberId);
  }

  /**
   * MR-31: withdraw every contact proof, every active confirmation and any live
   * code in one transaction. Contacts are never touched.
   */
  async revokeAll(memberId: string, actor: string, now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `update member_contacts
            set verified_at = null
          where member_id = $1 and verified_at is not null`,
        [memberId],
      );
      await tx.query(
        `update member_confirmations
            set withdrawn_at = $2::timestamptz, withdrawn_by = $3
          where member_id = $1 and withdrawn_at is null`,
        [memberId, now.toISOString(), actor],
      );
      await this.consumeLive(tx, memberId);
    });
  }

  /**
   * False means the caller is over the fixed window. The counters live in the
   * shared `auth_rate_limits` table, so no instance holds them in memory (MR-27).
   */
  async consumeRateLimit(key: string, limit: number, windowMinutes: number): Promise<boolean> {
    const [row] = await this.db.query<{ count: number }>(
      `insert into auth_rate_limits (key, window_start, count)
       values ($1, now(), 1)
       on conflict (key) do update
          set count = case
                when auth_rate_limits.window_start < now() - make_interval(mins => $2::int)
                  then 1
                else auth_rate_limits.count + 1
              end,
              window_start = case
                when auth_rate_limits.window_start < now() - make_interval(mins => $2::int)
                  then now()
                else auth_rate_limits.window_start
              end
       returning count`,
      [key, windowMinutes],
    );
    return (row?.count ?? 0) <= limit;
  }

  /** Consumes any live code, in the caller's transaction (MR-31). */
  async consumeLive(db: DbClient, memberId: string): Promise<void> {
    await db.query(
      `update member_verification_codes
          set consumed_at = now()
        where member_id = $1 and consumed_at is null`,
      [memberId],
    );
  }
}
