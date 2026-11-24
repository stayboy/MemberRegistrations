import type { AudienceClause, AudienceRule } from '../schemas/audiences.js';
import { ageInYears } from './age.js';

/**
 * The one audience predicate (member-registrations-event-audience.md A-3).
 *
 * A rule, the evaluated members and an evaluation date go in; the count of
 * members that match comes out. The roster, the occurrence read and the
 * attendance summary all call this module, so a second copy of the rule is a
 * defect. The module holds no database access: the register is read by
 * `src/repos/audience-members.ts` and passed in, which keeps the rule testable
 * on values alone.
 *
 * A member is evaluated at a date when they joined on or before it. Ministry
 * membership, presbyter status and membership status are current, with no
 * history. Age is the member's completed years at the evaluation date.
 */

export interface AudienceMember {
  /** `joined_on`, or the creation date when it was never recorded. */
  joinedOn: string;
  dob: string | null;
  gender: string;
  isPresbyter: boolean;
  membershipStatus: string;
  ministryCodes: readonly string[];
}

/** A rule "names" a visitor when one clause targets that status. */
function ruleNamesVisitor(rule: AudienceRule): boolean {
  return rule.clauses.some(
    (clause) => clause.attribute === 'membershipStatus' && clause.value === 'visitor',
  );
}

function matchesClause(clause: AudienceClause, member: AudienceMember, date: string): boolean {
  switch (clause.attribute) {
    case 'ministry': {
      const wanted = clause.ministryCode.toLowerCase();
      return member.ministryCodes.some((code) => code.toLowerCase() === wanted);
    }
    case 'presbyter':
      return member.isPresbyter;
    case 'ageBand': {
      const age = ageInYears(member.dob, date);
      if (age === null) return false;
      return age >= clause.minYears && (clause.maxYears === null || age <= clause.maxYears);
    }
    case 'gender':
      return member.gender === clause.value;
    case 'membershipStatus':
      return member.membershipStatus === clause.value;
  }
}

/**
 * A registered visitor is evaluated only when the rule names the `visitor`
 * status; otherwise it matches nothing, whatever other attributes it has
 * (A-3). First-time visitors have no member record and never reach the register.
 *
 * This is the one predicate: the roster counts it, and every member-facing
 * visibility read asks it about one member. A second copy of the rule is a
 * defect (A-3).
 */
export function memberMatchesAudience(
  rule: AudienceRule,
  member: AudienceMember,
  date: string,
): boolean {
  if (member.joinedOn > date) return false;
  if (member.membershipStatus === 'visitor' && !ruleNamesVisitor(rule)) return false;

  const matches = rule.clauses.map((clause) => matchesClause(clause, member, date));
  switch (rule.operator) {
    case 'allOf':
      return matches.every(Boolean);
    case 'anyOf':
      return matches.some(Boolean);
    case 'noneOf':
      return !matches.some(Boolean);
  }
}

/** The count of `members` matching `rule` at each requested date. */
export function evaluateAudienceDates(
  rule: AudienceRule,
  members: readonly AudienceMember[],
  dates: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const date of new Set(dates)) {
    counts.set(date, members.filter((member) => memberMatchesAudience(rule, member, date)).length);
  }
  return counts;
}

/** The count of `members` matching `rule` at one date. */
export function evaluateAudience(
  rule: AudienceRule,
  members: readonly AudienceMember[],
  date: string,
): number {
  return evaluateAudienceDates(rule, members, [date]).get(date) ?? 0;
}
