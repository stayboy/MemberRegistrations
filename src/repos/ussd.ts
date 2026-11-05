import type { Db } from '../db/sql.js';
import type { UssdContext } from '../ussd/machine.js';

export interface OwnedMember {
  id: string;
  memberNo: string;
  firstName: string | null;
  lastName: string | null;
}

export interface UssdSessionRow {
  id: string;
  phoneHash: string;
  memberId: string | null;
  anonymous: boolean;
  state: string;
  context: UssdContext;
  lastInputSeq: number;
  expiresAt: string;
}

type SessionDbRow = {
  id: string;
  phone_hash: string;
  member_id: string | null;
  anonymous: boolean;
  state: string;
  context: unknown;
  last_input_seq: number | string;
  expires_at: unknown;
};

export interface TouchSessionInput {
  state: string;
  context: UssdContext;
  lastInputSeq: number;
  expiresAt: string;
}

function contextFrom(value: unknown): UssdContext {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UssdContext;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as UssdContext;
      }
    } catch {
      // A corrupt context restarts the session at the main menu.
    }
  }
  return {};
}

function sessionFromRow(row: SessionDbRow): UssdSessionRow {
  return {
    id: row.id,
    phoneHash: row.phone_hash,
    memberId: row.member_id,
    anonymous: row.anonymous,
    state: row.state,
    context: contextFrom(row.context),
    lastInputSeq: Number(row.last_input_seq),
    expiresAt:
      row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
  };
}

export class UssdRepository {
  constructor(private readonly db: Db) {}

  /**
   * Owned contacts only. A linked-only match is deliberately anonymous: a
   * household number says nothing about which member dialled.
   */
  async findOwnedMember(phoneDigits: string): Promise<OwnedMember | null> {
    const [row] = await this.db.query<{
      id: string;
      member_no: string;
      first_name: string | null;
      last_name: string | null;
    }>(
      `select m.id, m.member_no, m.first_name, m.last_name
         from member_contacts c
         join members m on m.id = c.member_id
        where c.normalized_value = $1
          and c.kind in ('phone', 'whatsapp')
          and m.archived_at is null
          and m.purged_at is null
        order by c.display_order, c.id
        limit 1`,
      [phoneDigits],
    );
    if (!row) return null;
    return {
      id: row.id,
      memberNo: row.member_no,
      firstName: row.first_name,
      lastName: row.last_name,
    };
  }

  async createSession(input: {
    phoneHash: string;
    memberId: string | null;
    anonymous: boolean;
  }): Promise<string> {
    const [row] = await this.db.query<{ id: string }>(
      `insert into ussd_sessions (
         phone_hash, member_id, anonymous, state, context, last_input_seq, expires_at
       ) values ($1, $2, $3, 'main', '{}'::jsonb, 0, now() + interval '3 minutes')
       returning id`,
      [input.phoneHash, input.memberId, input.anonymous],
    );
    return row!.id;
  }

  async loadSession(id: string): Promise<UssdSessionRow | null> {
    const [row] = await this.db.query<SessionDbRow>(
      `select id, phone_hash, member_id, anonymous, state, context, last_input_seq, expires_at
         from ussd_sessions
        where id = $1`,
      [id],
    );
    return row ? sessionFromRow(row) : null;
  }

  async touchSession(id: string, input: TouchSessionInput): Promise<void> {
    await this.db.query(
      `update ussd_sessions
          set state = $2,
              context = $3::jsonb,
              last_input_seq = $4,
              expires_at = $5::timestamptz,
              updated_at = now()
        where id = $1`,
      [id, input.state, JSON.stringify(input.context), input.lastInputSeq, input.expiresAt],
    );
  }

  async resetSession(id: string, input: { lastInputSeq: number }): Promise<void> {
    await this.db.query(
      `update ussd_sessions
          set state = 'main',
              context = '{}'::jsonb,
              last_input_seq = $2,
              expires_at = now() + interval '3 minutes',
              updated_at = now()
        where id = $1`,
      [id, input.lastInputSeq],
    );
  }

  /** False means the nonce was already seen: a replay. */
  async consumeNonce(nonce: string, expiresAt: string): Promise<boolean> {
    const rows = await this.db.query<{ nonce: string }>(
      `insert into ussd_nonces (nonce, expires_at)
       values ($1, $2::timestamptz)
       on conflict (nonce) do nothing
       returning nonce`,
      [nonce, expiresAt],
    );
    await this.db.query(`delete from ussd_nonces where expires_at < now()`);
    return rows.length > 0;
  }

  /** False means the caller is over the fixed-window limit. */
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
}
