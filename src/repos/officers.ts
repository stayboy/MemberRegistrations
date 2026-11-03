import type { Db } from '../db/sql.js';

export interface OfficerRecord extends Record<string, unknown> {
  email: string;
  name: string;
  actorId: string;
  active: boolean;
}

export interface AddOfficerInput {
  email: string;
  name: string;
  actorId: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(input: AddOfficerInput): AddOfficerInput {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Error(`Invalid email: ${input.email}`);
  if (!input.name.trim()) throw new Error('Name is required');
  if (!input.actorId.trim()) throw new Error('Actor id is required');
  return { email, name: input.name.trim(), actorId: input.actorId.trim() };
}

export class OfficerRepository {
  constructor(private readonly db: Db) {}

  /** Idempotent: re-adding an existing officer updates and reactivates them. */
  async add(input: AddOfficerInput): Promise<{ email: string; reactivated: boolean }> {
    const officer = validate(input);
    const [row] = await this.db.query<{ email: string; reactivated: boolean }>(
      `insert into officers (email, name, actor_id)
       values ($1, $2, $3)
       on conflict (lower(email)) do update
          set name = excluded.name,
              actor_id = excluded.actor_id,
              active = true,
              updated_at = now()
       returning email, (xmax <> 0) as reactivated`,
      [officer.email, officer.name, officer.actorId],
    );
    return { email: row!.email, reactivated: row!.reactivated };
  }

  /** Deactivation also revokes live sessions and unused links. */
  async deactivate(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    await this.db.transaction(async (tx) => {
      const rows = await tx.query<{ id: string }>(
        `update officers
            set active = false, updated_at = now()
          where lower(email) = lower($1) and active
          returning id`,
        [normalized],
      );
      const officer = rows[0];
      if (!officer) throw new Error(`No active officer for ${normalized}`);

      await tx.query(
        `update auth_sessions
            set revoked_at = coalesce(revoked_at, now())
          where officer_id = $1 and revoked_at is null`,
        [officer.id],
      );
      await tx.query(
        `update auth_magic_links
            set used_at = coalesce(used_at, now())
          where officer_id = $1 and used_at is null`,
        [officer.id],
      );
    });
  }

  async list(): Promise<OfficerRecord[]> {
    return this.db.query<OfficerRecord>(
      'select email, name, actor_id as "actorId", active from officers order by email',
    );
  }
}
