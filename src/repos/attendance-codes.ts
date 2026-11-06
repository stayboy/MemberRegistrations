import { createHmac, randomInt, randomBytes } from 'node:crypto';
import type { Db, DbClient, Row } from '../db/sql.js';
import { assertDate } from '../domain/contacts.js';
import {
  AlreadyClockedError,
  CodeExpiredError,
  CodeInvalidError,
  CodeUsedError,
  CodeVoidedError,
  CodeWrongSessionError,
  ConflictError,
  NotFoundError,
  TooManyTriesError,
  ValidationError,
} from '../errors/domain-errors.js';
import { sqlState } from '../errors/sqlstate.js';

export const CODE_PURPOSES = ['attendance_punch', 'registration'] as const;
export type CodePurpose = (typeof CODE_PURPOSES)[number];

export type CodeStatus = 'active' | 'used' | 'expired' | 'voided';

export interface IssuedCode {
  id: string;
  code: string;
  purpose: CodePurpose;
  sessionDate: string;
  expiresAt: string;
}

export interface CodeListItem {
  id: string;
  purpose: CodePurpose;
  sessionDate: string;
  issuedAt: string;
  expiresAt: string;
  status: CodeStatus;
  usedAt: string | null;
  usedByMemberNo: string | null;
  voidedAt: string | null;
}

export interface RedeemAttendanceResult {
  kind: 'attendance';
  attendanceId: string;
  eventId: string;
  sessionDate: string;
}

export interface RedeemRegistrationResult {
  kind: 'registration';
  reference: string;
}

export type RedeemResult = RedeemAttendanceResult | RedeemRegistrationResult;

export interface RedeemInput {
  code: string;
  purpose: CodePurpose;
  phoneHash: string;
  memberId: string | null;
  /** Required for `attendance_punch`; a registration code carries its own session. */
  eventId?: string;
  sessionDate?: string;
  actor: string;
  firstName?: string;
  lastName?: string;
}

const CODE_TTL_MINUTES = 15;
const CODE_ATTEMPT_LIMIT = 5;
const CODE_ATTEMPT_WINDOW_MINUTES = 15;
const REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

interface StoredCodeRow extends Row {
  id: string;
  code_hash: string;
  purpose: CodePurpose;
  event_instance_id: string;
  session_date: string | Date;
  issued_at: Date | string;
  expires_at: Date | string;
  used_at: Date | string | null;
  used_by_member_id: string | null;
  registration_request_id: string | null;
  voided_at: Date | string | null;
}

interface StoredSession {
  date?: unknown;
  status?: string;
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isoTimestamp(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asSession(value: unknown): { date: string; status: string } | null {
  const session = value as StoredSession;
  if (session.date === null || session.date === undefined) return null;
  return {
    date: isoDate(session.date),
    status: typeof session.status === 'string' ? session.status : 'scheduled',
  };
}

/**
 * One-time, six-digit codes bound to a single event session. Only the
 * HMAC-SHA-256 hash under USSD_CODE_PEPPER is stored; the plain value is
 * returned once, by `issue`.
 */
export class AttendanceCodeRepository {
  constructor(
    private readonly db: Db,
    private readonly codePepper: string,
  ) {}

  private hash(code: string): string {
    return createHmac('sha256', this.codePepper).update(code).digest('hex');
  }

  async issue(
    input: { eventId: string; sessionDate: string; purpose: CodePurpose },
    actor: string,
  ): Promise<IssuedCode> {
    const sessionDate = assertDate(input.sessionDate, 'sessionDate');
    await this.requireSession(input.eventId, sessionDate);

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const [row] = await this.db.query<{ id: string; expires_at: Date | string }>(
      `insert into attendance_codes (
         code_hash, purpose, event_instance_id, session_date, issued_by, expires_at
       ) values ($1,$2,$3,$4,$5, now() + make_interval(mins => $6::int))
       returning id, expires_at`,
      [this.hash(code), input.purpose, input.eventId, sessionDate, actor, CODE_TTL_MINUTES],
    );

    return {
      id: row!.id,
      code,
      purpose: input.purpose,
      sessionDate,
      expiresAt: isoTimestamp(row!.expires_at)!,
    };
  }

  async list(
    eventId: string,
    sessionDate: string,
    status?: CodeStatus,
  ): Promise<{ items: CodeListItem[] }> {
    const date = assertDate(sessionDate, 'sessionDate');
    const rows = await this.db.query<StoredCodeRow & { used_by_member_no: string | null }>(
      `select c.id, c.code_hash, c.purpose, c.event_instance_id, c.session_date,
              c.issued_at, c.expires_at, c.used_at, c.used_by_member_id,
              c.registration_request_id, c.voided_at, m.member_no as used_by_member_no
         from attendance_codes c
         left join members m on m.id = c.used_by_member_id
        where c.event_instance_id = $1 and c.session_date = $2
        order by c.issued_at desc, c.id desc`,
      [eventId, date],
    );

    const items = rows
      .map((row) => this.toListItem(row))
      .filter((item) => status === undefined || item.status === status);
    return { items };
  }

  async void(id: string, reason: string | null, actor: string): Promise<CodeListItem> {
    // V3 records the void actor and time; the table has no reason column.
    void reason;

    const updated = await this.db.query<{ id: string }>(
      `update attendance_codes
          set voided_at = now(), voided_by = $2
        where id = $1
          and used_at is null
          and voided_at is null
          and expires_at > now()
        returning id`,
      [id, actor],
    );
    if (updated.length > 0) {
      const [row] = await this.db.query<StoredCodeRow & { used_by_member_no: string | null }>(
        `select c.id, c.code_hash, c.purpose, c.event_instance_id, c.session_date,
                c.issued_at, c.expires_at, c.used_at, c.used_by_member_id,
                c.registration_request_id, c.voided_at,
                m.member_no as used_by_member_no
           from attendance_codes c
           left join members m on m.id = c.used_by_member_id
          where c.id = $1`,
        [id],
      );
      return this.toListItem(row!);
    }

    const [existing] = await this.db.query<StoredCodeRow>(
      `select id, code_hash, purpose, event_instance_id, session_date, issued_at,
              expires_at, used_at, used_by_member_id, registration_request_id, voided_at
         from attendance_codes where id = $1`,
      [id],
    );
    if (!existing) throw new NotFoundError(`Code ${id} was not found`);
    if (existing.voided_at) throw new ConflictError('The code has already been voided');
    if (existing.used_at) throw new ConflictError('The code has already been used');
    throw new ConflictError('The code has expired');
  }

  async redeem(input: RedeemInput): Promise<RedeemResult> {
    if (!(await this.consumeAttempt(input.phoneHash))) {
      throw new TooManyTriesError();
    }

    const sessionDate =
      input.purpose === 'attendance_punch' && input.sessionDate
        ? assertDate(input.sessionDate, 'sessionDate')
        : null;
    const [stored] = await this.db.query<StoredCodeRow>(
      `select id, code_hash, purpose, event_instance_id, session_date, issued_at,
              expires_at, used_at, used_by_member_id, registration_request_id, voided_at
         from attendance_codes where code_hash = $1`,
      [this.hash(input.code.trim())],
    );
    if (!stored || stored.purpose !== input.purpose) throw new CodeInvalidError();

    if (input.purpose === 'attendance_punch') {
      if (!input.eventId || !sessionDate) {
        throw new ValidationError(
          'eventId and sessionDate are required to redeem an attendance code',
        );
      }
      if (
        stored.event_instance_id !== input.eventId ||
        isoDate(stored.session_date) !== sessionDate
      ) {
        throw new CodeWrongSessionError();
      }
    }
    if (stored.voided_at) throw new CodeVoidedError();
    if (stored.used_at) throw new CodeUsedError();
    if (new Date(isoTimestamp(stored.expires_at)!).getTime() <= Date.now()) {
      throw new CodeExpiredError();
    }

    return this.db.transaction(async (tx) => {
      const [code] = await tx.query<StoredCodeRow>(
        `select id, code_hash, purpose, event_instance_id, session_date, issued_at,
                expires_at, used_at, used_by_member_id, registration_request_id, voided_at
           from attendance_codes where id = $1 for update`,
        [stored.id],
      );
      if (!code) throw new CodeInvalidError();
      if (code.voided_at) throw new CodeVoidedError();
      if (code.used_at) throw new CodeUsedError();
      if (new Date(isoTimestamp(code.expires_at)!).getTime() <= Date.now()) {
        throw new CodeExpiredError();
      }

      return input.purpose === 'attendance_punch'
        ? this.redeemAttendance(tx, code, input, sessionDate!)
        : this.redeemRegistration(tx, code, input);
    });
  }

  private async redeemAttendance(
    tx: DbClient,
    code: StoredCodeRow,
    input: RedeemInput,
    sessionDate: string,
  ): Promise<RedeemAttendanceResult> {
    if (!input.memberId) {
      throw new ValidationError('A member is required to redeem an attendance code');
    }

    const [member] = await tx.query<{ id: string; member_no: string }>(
      `select id, member_no from members
        where id = $1 and archived_at is null and purged_at is null`,
      [input.memberId],
    );
    if (!member) throw new NotFoundError('The member was not found');

    const [existing] = await tx.query<{ id: string }>(
      `select id from attendance
        where event_instance_id = $1 and session_date = $2 and member_id = $3`,
      [code.event_instance_id, sessionDate, member.id],
    );
    if (existing) throw new AlreadyClockedError();

    const [attendance] = await tx.query<{ id: string }>(
      `insert into attendance (member_id, event_instance_id, session_date, source, created_by)
       values ($1,$2,$3,'manual',$4)
       returning id`,
      [member.id, code.event_instance_id, sessionDate, input.actor],
    );

    await this.markUsed(tx, code.id, member.id, null);

    return {
      kind: 'attendance',
      attendanceId: attendance!.id,
      eventId: code.event_instance_id,
      sessionDate,
    };
  }

  private async redeemRegistration(
    tx: DbClient,
    code: StoredCodeRow,
    input: RedeemInput,
  ): Promise<RedeemRegistrationResult> {
    const sessionDate = isoDate(code.session_date);
    const firstName = input.firstName?.trim() ?? '';
    const lastName = input.lastName?.trim() ?? '';
    if (!firstName || !lastName) {
      throw new ValidationError(
        'firstName and lastName are required to redeem a registration code',
      );
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bytes = randomBytes(6);
      let reference = 'REG-';
      for (const byte of bytes) reference += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];

      try {
        const [request] = await tx.query<{ id: string }>(
          `insert into registration_requests (
             reference, first_name, last_name, phone_hash, event_instance_id,
             session_date, code_id
           ) values ($1,$2,$3,$4,$5,$6,$7)
           returning id`,
          [
            reference,
            firstName,
            lastName,
            input.phoneHash,
            code.event_instance_id,
            sessionDate,
            code.id,
          ],
        );
        await this.markUsed(tx, code.id, null, request!.id);
        return { kind: 'registration', reference };
      } catch (error) {
        if (sqlState(error) !== '23505') throw error;
      }
    }

    throw new ConflictError('Could not allocate a unique registration reference');
  }

  private async markUsed(
    tx: DbClient,
    codeId: string,
    memberId: string | null,
    requestId: string | null,
  ): Promise<void> {
    const updated = await tx.query<{ id: string }>(
      `update attendance_codes
          set used_at = now(), used_by_member_id = $2, registration_request_id = $3
        where id = $1 and used_at is null and voided_at is null
        returning id`,
      [codeId, memberId, requestId],
    );
    if (updated.length === 0) throw new CodeUsedError();
  }

  private async consumeAttempt(phoneHash: string): Promise<boolean> {
    const [row] = await this.db.query<{ count: number }>(
      `insert into auth_rate_limits (key, window_start, count)
       values ($1, now(), 1)
       on conflict (key) do update
          set count = case
                when auth_rate_limits.window_start <
                  now() - make_interval(mins => $2::int)
                  then 1
                else auth_rate_limits.count + 1
              end,
              window_start = case
                when auth_rate_limits.window_start <
                  now() - make_interval(mins => $2::int)
                  then now()
                else auth_rate_limits.window_start
              end
       returning count`,
      [`ussd:code:${phoneHash}`, CODE_ATTEMPT_WINDOW_MINUTES],
    );
    return (row?.count ?? 0) <= CODE_ATTEMPT_LIMIT;
  }

  private async requireSession(eventId: string, sessionDate: string): Promise<void> {
    const [event] = await this.db.query<{ status: string; sessions: unknown }>(
      'select status, sessions from event_instances where id = $1',
      [eventId],
    );
    if (!event) throw new NotFoundError(`Event ${eventId} was not found`);
    if (event.status === 'cancelled' || event.status === 'archived') {
      throw new ConflictError('A cancelled or archived event is read-only');
    }

    const session = parseJsonArray(event.sessions)
      .map(asSession)
      .find((entry) => entry?.date === sessionDate);
    if (!session) {
      throw new ValidationError(`Event ${eventId} has no session on ${sessionDate}`);
    }
    if (session.status === 'cancelled') {
      throw new ValidationError(`The session on ${sessionDate} is cancelled and read-only`);
    }
  }

  private toListItem(row: StoredCodeRow & { used_by_member_no?: string | null }): CodeListItem {
    const expiresAt = isoTimestamp(row.expires_at)!;
    const status: CodeStatus = row.voided_at
      ? 'voided'
      : row.used_at
        ? 'used'
        : new Date(expiresAt).getTime() <= Date.now()
          ? 'expired'
          : 'active';

    return {
      id: row.id,
      purpose: row.purpose,
      sessionDate: isoDate(row.session_date),
      issuedAt: isoTimestamp(row.issued_at)!,
      expiresAt,
      status,
      usedAt: isoTimestamp(row.used_at),
      usedByMemberNo: row.used_by_member_no ?? null,
      voidedAt: isoTimestamp(row.voided_at),
    };
  }
}
