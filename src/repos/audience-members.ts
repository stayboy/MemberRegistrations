import type { DbClient } from '../db/sql.js';
import type { AudienceMember } from '../domain/audience-evaluator.js';
import { parseTextArray } from './row-values.js';

/**
 * The register an audience is evaluated over (A-3), read as of `onOrBefore`:
 * the latest date the caller will evaluate, so one read serves a whole batch of
 * dates while the per-date join test stays in the pure predicate.
 *
 * Only rows that are neither purged nor archived are evaluated. The join date is
 * the recorded `joined_on`, or the creation date when it was never recorded.
 * Ministry codes, the presbyter flag and membership status are current, with no
 * history. Both dates are read as text, so each driver hands back `YYYY-MM-DD`.
 */
const AUDIENCE_MEMBERS_SQL = `
select coalesce(m.joined_on, m.created_at::date)::text as joined_on,
       m.dob::text as dob,
       m.gender,
       m.is_presbyter,
       m.membership_status,
       coalesce(
         array_agg(distinct mi.code) filter (where mi.active),
         '{}'::text[]
       ) as ministry_codes
  from members m
  left join member_ministries mm on mm.member_id = m.id
  left join ministries mi on mi.id = mm.ministry_id
 where m.purged_at is null
   and m.archived_at is null
   and coalesce(m.joined_on, m.created_at::date) <= $1::date
 group by m.id
`;

/** The evaluated members' register, as of `onOrBefore` and no later. */
export async function audienceMembers(db: DbClient, onOrBefore: string): Promise<AudienceMember[]> {
  const rows = await db.query<{
    joined_on: string;
    dob: string | null;
    gender: string;
    is_presbyter: boolean;
    membership_status: string;
    ministry_codes: unknown;
  }>(AUDIENCE_MEMBERS_SQL, [onOrBefore]);

  return rows.map((row) => ({
    joinedOn: row.joined_on,
    dob: row.dob,
    gender: row.gender,
    isPresbyter: row.is_presbyter === true,
    membershipStatus: row.membership_status,
    ministryCodes: parseTextArray(row.ministry_codes),
  }));
}
