import type { AuthRepository, MagicLinkRow, OfficerRow, SessionRow } from '../repos/auth.js';
import { hashToken, newToken } from './crypto.js';

export interface Officer {
  id: string;
  email: string;
  name: string;
  actorId: string;
}

export interface SessionContext {
  sessionId: string;
  officer: Officer;
  expiresAt: string;
}

export interface MagicLink {
  officer: Officer;
  token: string;
  expiresAt: string;
  expiresInMinutes: number;
}

export interface AuthConfig {
  magicLinkTtlMinutes: number;
  sessionIdleMinutes: number;
  sessionAbsoluteMinutes: number;
  magicLinkBaseUrl: string;
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  magicLinkTtlMinutes: 15,
  sessionIdleMinutes: 480,
  sessionAbsoluteMinutes: 720,
  magicLinkBaseUrl: 'http://localhost:5173/#/connect',
};

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function officerFromRow(row: OfficerRow): Officer {
  return { id: row.id, email: row.email, name: row.name, actorId: row.actor_id };
}

function officerFromLink(row: MagicLinkRow): Officer {
  return { id: row.officer_id, email: row.email, name: row.name, actorId: row.actor_id };
}

function officerFromSession(row: SessionRow): Officer {
  return { id: row.officer_id, email: row.email, name: row.name, actorId: row.actor_id };
}

/**
 * Magic-link and session rules. Every credential is stored as a SHA-256 hash;
 * the plaintext exists only in the response or the email.
 */
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly config: AuthConfig = DEFAULT_AUTH_CONFIG,
  ) {}

  /** Returns a link only for an active, seeded officer. Unknown addresses return null. */
  async requestLink(email: string): Promise<MagicLink | null> {
    const officer = await this.repo.findActiveOfficer(email);
    if (!officer) return null;

    const token = newToken();
    const expiresAt = new Date(Date.now() + this.config.magicLinkTtlMinutes * 60_000);
    await this.repo.createMagicLink(officer.id, hashToken(token), expiresAt.toISOString());

    return {
      officer: officerFromRow(officer),
      token,
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes: this.config.magicLinkTtlMinutes,
    };
  }

  /** Trades a single-use link for a session. Replays and expired links return null. */
  async exchange(
    token: string,
  ): Promise<{ token: string; expiresAt: string; officer: Officer } | null> {
    const sessionToken = newToken();
    const now = Date.now();
    const expiresAt = new Date(now + this.config.sessionIdleMinutes * 60_000);
    const absoluteExpiresAt = new Date(now + this.config.sessionAbsoluteMinutes * 60_000);

    const link = await this.repo.exchangeMagicLink(
      hashToken(token),
      hashToken(sessionToken),
      expiresAt.toISOString(),
      absoluteExpiresAt.toISOString(),
    );
    if (!link) return null;

    return {
      token: sessionToken,
      expiresAt: expiresAt.toISOString(),
      officer: officerFromLink(link),
    };
  }

  /** Validates and slides the idle window, capped by the absolute expiry. */
  async authenticate(token: string): Promise<SessionContext | null> {
    const row = await this.repo.findSession(hashToken(token));
    if (!row) return null;

    const absolute = asDate(row.absolute_expires_at).getTime();
    const nextExpiry = new Date(
      Math.min(Date.now() + this.config.sessionIdleMinutes * 60_000, absolute),
    );
    await this.repo.touchSession(row.session_id, nextExpiry.toISOString());

    return {
      sessionId: row.session_id,
      officer: officerFromSession(row),
      expiresAt: nextExpiry.toISOString(),
    };
  }

  async logout(token: string): Promise<void> {
    await this.repo.revokeSession(hashToken(token));
  }

  /** False means the caller is over the fixed-window limit. */
  async consumeRateLimit(key: string, limit: number, windowMinutes: number): Promise<boolean> {
    return this.repo.consumeRateLimit(key, limit, windowMinutes);
  }

  magicLinkUrl(token: string): string {
    const separator = this.config.magicLinkBaseUrl.includes('?') ? '&' : '?';
    return `${this.config.magicLinkBaseUrl}${separator}token=${encodeURIComponent(token)}`;
  }
}
