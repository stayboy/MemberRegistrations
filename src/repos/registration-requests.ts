import type { Db, Row } from '../db/sql.js';
import { todayIn } from '../domain/series.js';
import {
  NotFoundError,
  RegistrationNotPendingError,
  ValidationError,
} from '../errors/domain-errors.js';
import type { MemberRepository } from './members.js';

export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export interface RegistrationRequestItem {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  /** One-way phone hash; the raw phone is never stored or returned. */
  phoneHash: string;
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
  select r.id, r.reference, r.first_name, r.last_name, r.phone_hash,
         r.event_instance_id, r.session_date, r.status, r.created_at,
         r.decided_by, r.decided_at, m.member_no
    from registration_requests r
    left join members m on m.id = r.member_id`;

/**
 * Anonymous registration requests. Approval is the only path that creates a
 * member; rejection leaves no member row.
 */
export class RegistrationRequestRepository {
  constructor(
    private readonly db: Db,
    private readonly members: MemberRepository,
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
   * One transaction: lock the request, re-check `pending`, create the member
   * through the ordinary create path and mark the request approved. Two
   * concurrent approvals therefore cannot both create a member, and a
   * duplicate member number rolls the whole unit back with the request still
   * pending.
   */
  async approve(id: string, memberNo: string, actor: string): Promise<RegistrationRequestItem> {
    await this.db.transaction(async (tx) => {
      const [request] = await tx.query<{
        id: string;
        status: RegistrationStatus;
        first_name: string;
        last_name: string;
      }>(
        `select id, status, first_name, last_name
           from registration_requests
          where id = $1
          for update`,
        [id],
      );
      if (!request) throw new NotFoundError(`Registration request ${id} was not found`);
      if (request.status !== 'pending') throw new RegistrationNotPendingError();

      const memberId = await this.members.createWithin(
        tx,
        {
          memberNo,
          firstName: request.first_name,
          lastName: request.last_name,
          gender: 'undisclosed',
          joinedOn: todayIn('UTC'),
        },
        actor,
      );

      const updated = await tx.query<{ id: string }>(
        `update registration_requests
            set status = 'approved', member_id = $2, decided_by = $3, decided_at = now()
          where id = $1 and status = 'pending'
          returning id`,
        [id, memberId, actor],
      );
      if (updated.length === 0) throw new RegistrationNotPendingError();
    });

    return this.get(id);
  }

  async reject(id: string, reason: string, actor: string): Promise<RegistrationRequestItem> {
    const trimmed = reason.trim();
    if (!trimmed) throw new ValidationError('reason is required');
    await this.requirePending(id);

    const updated = await this.db.query<{ id: string }>(
      `update registration_requests
          set status = 'rejected', reason = $2, decided_by = $3, decided_at = now()
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
      eventId: row.event_instance_id,
      sessionDate: isoDate(row.session_date),
      status: row.status,
      createdAt: isoTimestamp(row.created_at)!,
      decidedBy: row.decided_by,
      decidedAt: isoTimestamp(row.decided_at),
      memberNo: row.member_no,
    };
  }
}
