import type { DbClient, Row } from '../db/sql.js';
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
const REGISTER_COLUMNS = `
  select m.id,
         m.member_no,
         m.first_name,
         m.last_name,
         m.other_names,
         coalesce(m.joined_on, m.created_at::date)::text as joined_on,
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
    left join ministries mi on mi.id = mm.ministry_id`;

const IN_REGISTER = `m.purged_at is null
   and m.archived_at is null
   and coalesce(m.joined_on, m.created_at::date) <= $1::date`;

const AUDIENCE_MEMBERS_SQL = `
${REGISTER_COLUMNS}
 where ${IN_REGISTER}
 group by m.id
`;

/** One member as `$2`; the same register rule and columns as the batch read. */
const AUDIENCE_MEMBER_SQL = `
${REGISTER_COLUMNS}
 where m.id = $2
   and ${IN_REGISTER}
 group by m.id
`;

interface AudienceMemberRow extends Row {
  joined_on: string;
  dob: string | null;
  gender: string;
  is_presbyter: boolean;
  membership_status: string;
  ministry_codes: unknown;
}

function toMember(row: AudienceMemberRow): AudienceMember {
  return {
    joinedOn: row.joined_on,
    dob: row.dob,
    gender: row.gender,
    isPresbyter: row.is_presbyter === true,
    membershipStatus: row.membership_status,
    ministryCodes: parseTextArray(row.ministry_codes),
  };
}

export interface RegisterMember extends AudienceMember {
  id: string;
  memberNo: string;
  firstName: string | null;
  lastName: string | null;
  otherNames: string | null;
}

interface RegisterRow extends Row {
  id: string;
  member_no: string;
  first_name: string | null;
  last_name: string | null;
  other_names: string | null;
  joined_on: string;
  dob: string | null;
  gender: string;
  is_presbyter: boolean;
  membership_status: string;
  ministry_codes: unknown;
}

function toRegisterMember(row: RegisterRow): RegisterMember {
  return {
    ...toMember(row),
    id: row.id,
    memberNo: row.member_no,
    firstName: row.first_name,
    lastName: row.last_name,
    otherNames: row.other_names,
  };
}

/** The evaluated members' register, as of `onOrBefore` and no later. */
export async function audienceMembers(db: DbClient, onOrBefore: string): Promise<AudienceMember[]> {
  const rows = await db.query<RegisterRow>(AUDIENCE_MEMBERS_SQL, [onOrBefore]);
  return rows.map(toMember);
}

/**
 * The same register with the identity a caller needs beside the predicate's
 * inputs: a notification preview renders a sample member's name and member
 * number. The audience rule is still the one in `audience-evaluator.ts`.
 */
export async function audienceRegister(
  db: DbClient,
  onOrBefore: string,
): Promise<RegisterMember[]> {
  const rows = await db.query<RegisterRow>(AUDIENCE_MEMBERS_SQL, [onOrBefore]);
  return rows.map(toRegisterMember);
}

/**
 * One member of the register, or null when they are outside it at `onOrBefore`
 * (purged, archived, or not yet joined). One member-facing read asks about one
 * member; loading the whole register to answer it is the wrong seam.
 */
export async function audienceMember(
  db: DbClient,
  memberId: string,
  onOrBefore: string,
): Promise<AudienceMember | null> {
  const [row] = await db.query<AudienceMemberRow>(AUDIENCE_MEMBER_SQL, [onOrBefore, memberId]);
  return row ? toMember(row) : null;
}
