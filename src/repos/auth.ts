import type { Db, Row } from '../db/sql.js';

export interface OfficerRow extends Row {
  id: string;
  email: string;
  name: string;
  actor_id: string;
}

export interface MagicLinkRow extends Row {
  id: string;
  officer_id: string;
  email: string;
  name: string;
  actor_id: string;
}

export interface SessionRow extends Row {
  session_id: string;
  expires_at: string;
  absolute_expires_at: string;
  officer_id: string;
  email: string;
  name: string;
  actor_id: string;
}

/**
 * SQL for officers, magic links, sessions and rate limits. The auth service
 * owns the rules; this repository owns the statements.
 */
export class AuthRepository {
  constructor(private readonly db: Db) {}

  async findActiveOfficer(email: string): Promise<OfficerRow | null> {
    const [row] = await this.db.query<OfficerRow>(
      `select id, email, name, actor_id
         from officers
        where lower(email) = lower($1) and active`,
      [email.trim()],
    );
    return row ?? null;
  }

  async createMagicLink(officerId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await this.db.query(
      `insert into auth_magic_links (officer_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [officerId, tokenHash, expiresAt],
    );
  }

  /**
   * Consumes the link and creates the session in one transaction, so a replay
   * cannot slip between the read and the write.
   */
  async exchangeMagicLink(
    linkHash: string,
    sessionTokenHash: string,
    expiresAt: string,
    absoluteExpiresAt: string,
  ): Promise<MagicLinkRow | null> {
    return this.db.transaction(async (tx) => {
      const [link] = await tx.query<MagicLinkRow>(
        `select l.id, l.officer_id, o.email, o.name, o.actor_id
           from auth_magic_links l
           join officers o on o.id = l.officer_id
          where l.token_hash = $1
            and l.used_at is null
            and l.expires_at > now()
            and o.active`,
        [linkHash],
      );
      if (!link) return null;

      const [used] = await tx.query<{ id: string }>(
        `update auth_magic_links
            set used_at = now()
          where id = $1 and used_at is null
          returning id`,
        [link.id],
      );
      if (!used) return null;

      await tx.query(
        `insert into auth_sessions (officer_id, token_hash, expires_at, absolute_expires_at)
         values ($1, $2, $3, $4)`,
        [link.officer_id, sessionTokenHash, expiresAt, absoluteExpiresAt],
      );
      return link;
    });
  }

  async findSession(tokenHash: string): Promise<SessionRow | null> {
    const [row] = await this.db.query<SessionRow>(
      `select s.id as session_id,
              s.expires_at::text as expires_at,
              s.absolute_expires_at::text as absolute_expires_at,
              o.id as officer_id,
              o.email,
              o.name,
              o.actor_id
         from auth_sessions s
         join officers o on o.id = s.officer_id
        where s.token_hash = $1
          and s.revoked_at is null
          and o.active
          and s.expires_at > now()
          and s.absolute_expires_at > now()`,
      [tokenHash],
    );
    return row ?? null;
  }

  async touchSession(sessionId: string, expiresAt: string): Promise<void> {
    await this.db.query(
      `update auth_sessions
          set expires_at = $2::timestamptz, last_used_at = now()
        where id = $1`,
      [sessionId, expiresAt],
    );
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.db.query(
      `update auth_sessions
          set revoked_at = coalesce(revoked_at, now())
        where token_hash = $1`,
      [tokenHash],
    );
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
