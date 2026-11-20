import type { Db, Row } from '../db/sql.js';
import { normalizeContactValue } from '../domain/contacts.js';
import type { PhoneCipher } from '../domain/phone-cipher.js';
import { todayIn } from '../domain/series.js';
import { maskNumber } from '../domain/verification.js';
import {
  ContactInUseError,
  NotFoundError,
  RegistrationNotPendingError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlConstraint, sqlState } from '../errors/sqlstate.js';
import type { MemberRepository } from './members.js';

export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const PHONE_OWNERSHIPS = ['own', 'borrowed'] as const;
export type PhoneOwnership = (typeof PHONE_OWNERSHIPS)[number];

export interface RegistrationRequestItem {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  /** One-way phone hash; the raw phone is never stored or returned. */
  phoneHash: string;
  /** The caller's number as the officer may see it; never the raw value (MR-53). */
  phoneMasked: string | null;
  eventId: string;
  sessionDate: string;
  status: RegistrationStatus;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  memberNo: string | null;
}

export interface RegistrationRequestListQuery {
  status?: RegistrationStatus;
  eventId?: string;
  sessionDate?: string;
}

interface RequestRow extends Row {
  id: string;
  reference: string;
  first_name: string;
  last_name: string;
  phone_hash: string;
  phone_encrypted: string | null;
  event_instance_id: string;
  session_date: string | Date;
  status: RegistrationStatus;
  created_at: Date | string;
  decided_by: string | null;
  decided_at: Date | string | null;
  member_no: string | null;
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

const SELECT_REQUEST = `
  select r.id, r.reference, r.first_name, r.last_name, r.phone_hash, r.phone_encrypted,
         r.event_instance_id, r.session_date, r.status, r.created_at,
         r.decided_by, r.decided_at, m.member_no
    from registration_requests r
    left join members m on m.id = r.member_id`;

/**
 * Anonymous registration requests. Approval is the only path that creates a
 * member; rejection leaves no member row.
 *
 * The caller's number is retained AES-256-GCM encrypted and is never returned.
 * The list shows only its mask; approval alone decrypts it, binds it as the
 * member's own phone (or leaves it the guardian's) and erases the ciphertext,
 * as do rejection and purge (MR-53).
 */
export class RegistrationRequestRepository {
  constructor(
    private readonly db: Db,
    private readonly members: MemberRepository,
    private readonly cipher: PhoneCipher,
    private readonly countryCode: string,
  ) {}

  async list(
    query: RegistrationRequestListQuery = {},
  ): Promise<{ items: RegistrationRequestItem[] }> {
    const rows = await this.db.query<RequestRow>(
      `${SELECT_REQUEST}
        where ($1::text is null or r.status = $1::text)
          and ($2::uuid is null or r.event_instance_id = $2::uuid)
          and ($3::date is null or r.session_date = $3::date)
        order by r.created_at desc, r.id desc`,
      [query.status ?? null, query.eventId ?? null, query.sessionDate ?? null],
    );
    return { items: rows.map((row) => this.toItem(row)) };
  }

  async get(id: string): Promise<RegistrationRequestItem> {
    const [row] = await this.db.query<RequestRow>(`${SELECT_REQUEST} where r.id = $1`, [id]);
    if (!row) throw new NotFoundError(`Registration request ${id} was not found`);
    return this.toItem(row);
  }

  /**
   * One transaction: lock the request, re-check `pending`, decrypt the retained
   * number, create the member and its binding, assert reachability and mark the
   * request approved with the ciphertext erased.
   *
   * `own` writes the number as an owned phone contact, so the approved member is
   * identified and can verify on the acceptance page and no guardian is needed.
   * `borrowed` writes no contact: the number is the guardian's, so the guardian
   * is required and validated with MR-40's rules. A number owned by another
   * member is `409 contact_in_use` naming the owner and leaves the request
   * pending. Two concurrent approvals therefore cannot both create a member.
   */
  async approve(
    id: string,
    memberNo: string,
    phoneOwnership: PhoneOwnership,
    guardianMemberNo: string | null,
    actor: string,
  ): Promise<RegistrationRequestItem> {
    try {
      await this.db.transaction(async (tx) => {
        const [request] = await tx.query<{
          id: string;
          status: RegistrationStatus;
          first_name: string;
          last_name: string;
          phone_encrypted: string | null;
        }>(
          `select id, status, first_name, last_name, phone_encrypted
           from registration_requests
          where id = $1
          for update`,
          [id],
        );
        if (!request) throw new NotFoundError(`Registration request ${id} was not found`);
        if (request.status !== 'pending') throw new RegistrationNotPendingError();

        if (phoneOwnership === 'borrowed' && !guardianMemberNo) {
          throw new ValidationError(
            'guardianMemberNo is required when the number is borrowed',
            'validation_error',
          );
        }

        let ownNumber: string | null = null;
        if (phoneOwnership === 'own') {
          if (!request.phone_encrypted) {
            throw new ValidationError('The request carries no number to bind', 'validation_error');
          }
          ownNumber = this.cipher.decrypt(request.phone_encrypted);
          const [owner] = await tx.query<{ member_no: string }>(
            `select m.member_no
             from member_contacts c
             join members m on m.id = c.member_id
            where c.normalized_value = $1`,
            [normalizeContactValue('phone', ownNumber)],
          );
          if (owner) {
            throw new ContactInUseError(`This number already belongs to member ${owner.member_no}`);
          }
        }

        const memberId = await this.members.createWithin(
          tx,
          {
            memberNo,
            firstName: request.first_name,
            lastName: request.last_name,
            gender: 'undisclosed',
            joinedOn: todayIn('UTC'),
            ...(ownNumber === null ? {} : { contacts: [{ kind: 'phone', value: ownNumber }] }),
            ...(phoneOwnership === 'borrowed' ? { guardianMemberNo: guardianMemberNo! } : {}),
          },
          actor,
        );
        // The ordinary `create` wrapper asserts reachability; approval calls
        // `createWithin` directly, so it judges the new aggregate itself.
        await this.members.assertReachable(tx, memberId);

        const updated = await tx.query<{ id: string }>(
          `update registration_requests
            set status = 'approved', member_id = $2, decided_by = $3, decided_at = now(),
                phone_encrypted = null
          where id = $1 and status = 'pending'
          returning id`,
          [id, memberId, actor],
        );
        if (updated.length === 0) throw new RegistrationNotPendingError();
      });

      return await this.get(id);
    } catch (error) {
      // The pre-check above closes the usual window; two approvals of the same
      // number can still collide on `member_contacts_value`. That race maps to
      // the same `409 contact_in_use` (and the transaction rolled back, so the
      // request is still pending with its ciphertext intact), never to a 500 or
      // to the member-number duplicate conflict (MR-53).
      if (sqlState(error) === '23505' && sqlConstraint(error) === 'member_contacts_value') {
        throw new ContactInUseError('This number already belongs to another member');
      }
      throw error;
    }
  }

  async reject(id: string, reason: string, actor: string): Promise<RegistrationRequestItem> {
    const trimmed = reason.trim();
    if (!trimmed) throw new ValidationError('reason is required');
    await this.requirePending(id);

    const updated = await this.db.query<{ id: string }>(
      `update registration_requests
          set status = 'rejected', reason = $2, decided_by = $3, decided_at = now(),
              phone_encrypted = null
        where id = $1 and status = 'pending'
        returning id`,
      [id, trimmed, actor],
    );
    if (updated.length === 0) throw new RegistrationNotPendingError();

    return this.get(id);
  }

  private async requirePending(
    id: string,
  ): Promise<{ id: string; status: RegistrationStatus; first_name: string; last_name: string }> {
    const [row] = await this.db.query<{
      id: string;
      status: RegistrationStatus;
      first_name: string;
      last_name: string;
    }>('select id, status, first_name, last_name from registration_requests where id = $1', [id]);
    if (!row) throw new NotFoundError(`Registration request ${id} was not found`);
    if (row.status !== 'pending') throw new RegistrationNotPendingError();
    return row;
  }

  private toItem(row: RequestRow): RegistrationRequestItem {
    return {
      id: row.id,
      reference: row.reference,
      firstName: row.first_name,
      lastName: row.last_name,
      phoneHash: row.phone_hash,
      phoneMasked: this.maskStored(row.phone_encrypted),
      eventId: row.event_instance_id,
      sessionDate: isoDate(row.session_date),
      status: row.status,
      createdAt: isoTimestamp(row.created_at)!,
      decidedBy: row.decided_by,
      decidedAt: isoTimestamp(row.decided_at),
      memberNo: row.member_no,
    };
  }

  /** The mask is the only reader-facing form; a value that cannot be read is null. */
  private maskStored(payload: string | null): string | null {
    if (!payload) return null;
    try {
      return maskNumber(this.cipher.decrypt(payload), this.countryCode);
    } catch {
      return null;
    }
  }
}
