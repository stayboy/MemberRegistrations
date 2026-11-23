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
