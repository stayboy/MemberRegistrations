import { audienceRuleSchema, type AudienceRule } from '../schemas/audiences.js';

/**
 * Row-value readers shared by the repositories. A `jsonb` or `text[]` column
 * arrives already parsed on one driver and as a JSON string on another, so each
 * shape has one reader instead of a copy per repository.
 */

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** A `text[]` as `string[]`; a value that is not a string array reads as empty. */
export function parseTextArray(value: unknown): string[] {
  const parsed = typeof value === 'string' ? tryParseJson(value) : value;
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * A stored audience rule, re-checked against the contract it was written with
 * (A-1). A rule that no longer validates is corrupt data rather than a bad
 * request, so it fails loudly instead of evaluating a register from a rule
 * nobody validated.
 */
export function parseAudienceRule(value: unknown): AudienceRule {
  const parsed = typeof value === 'string' ? tryParseJson(value) : value;
  const rule = audienceRuleSchema.safeParse(parsed);
  if (!rule.success) {
    const issue = rule.error.issues[0];
    const detail = issue ? ` (${issue.path.join('.') || 'rule'}: ${issue.message})` : '';
    throw new Error(`A stored audience rule is not valid${detail}`);
  }
  return rule.data;
}
