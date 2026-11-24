import type { AudienceClause, AudienceRule } from '../schemas/audiences.js';

function clauseSentence(clause: AudienceClause): string {
  switch (clause.attribute) {
    case 'ministry':
      return `ministry ${clause.ministryCode}`;
    case 'presbyter':
      return 'presbyter';
    case 'ageBand':
      return clause.maxYears === null
        ? `age ${clause.minYears}+`
        : `age ${clause.minYears}-${clause.maxYears}`;
    case 'gender':
      return `gender ${clause.value}`;
    case 'membershipStatus':
      return `membership status ${clause.value}`;
  }
}

/**
 * The one server-rendered sentence the UI shows. A client never composes or
 * evaluates a rule (A-1), so the sentence lives beside the rule rather than in
 * the browser.
 */
export function renderAudienceSummary(name: string, rule: AudienceRule): string {
  const clauses = rule.clauses.map(clauseSentence);
  const body =
    rule.operator === 'allOf'
      ? `all of ${clauses.join(' and ')}`
      : rule.operator === 'anyOf'
        ? `any of ${clauses.join(' or ')}`
        : `none of ${clauses.join(' or ')}`;
  return `${name} - ${body}`;
}

/** The retired `ministry_id`/`presbyter_only` pair, as a rule projects onto it. */
export interface LegacyAudienceProjection {
  ministryCode: string | null;
  presbyterOnly: boolean;
}

/**
 * The legacy pair is faithful only for an `allOf` over exactly one ministry
 * clause and, optionally, the presbyter clause (A-7). Every other operator or
 * attribute (age, gender, membership status, `anyOf`, `noneOf`) has no legacy
 * expression, so the projection is null/false - which a reader that has not
 * moved reads as "general". It is all-or-nothing: a first-clause reading would
 * write `ministry_id = CHOIR` for `noneOf(ministry CHOIR)`.
 *
 * The write path still stores the pair from this projection, and the readers
 * that have moved take their ministry label and priority tier from it.
 */
export function legacyProjection(rule: AudienceRule): LegacyAudienceProjection {
  if (rule.operator !== 'allOf') return { ministryCode: null, presbyterOnly: false };
  if (
    rule.clauses.some(
      (clause) => clause.attribute !== 'ministry' && clause.attribute !== 'presbyter',
    )
  ) {
    return { ministryCode: null, presbyterOnly: false };
  }
  const ministries = rule.clauses.filter((clause) => clause.attribute === 'ministry');
  if (ministries.length > 1) return { ministryCode: null, presbyterOnly: false };
  const ministryClause = ministries[0];
  return {
    ministryCode:
      ministryClause && ministryClause.attribute === 'ministry'
        ? ministryClause.ministryCode
        : null,
    presbyterOnly: rule.clauses.some((clause) => clause.attribute === 'presbyter'),
  };
}
