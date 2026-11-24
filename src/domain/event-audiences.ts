import type { AudienceRule } from '../schemas/audiences.js';
import { memberMatchesAudience, type AudienceMember } from './audience-evaluator.js';

/**
 * Composition across an event's audience set (member-registrations-event-audience.md A-2a).
 *
 * An event carries an ordered set of audiences and a member is in the event
 * when they match **every** audience at the occurrence date. The fold calls the
 * one predicate in `memberMatchesAudience`; there is no second evaluator and no
 * merged rule, because A-1's language is one operator over a flat clause list,
 * so two audiences cannot be folded into one list in general.
 *
 * The visitor gate is per audience and the fold inherits it (A-3): a registered
 * visitor is in the event only when **every** audience names visitors, so
 * `Visitors only` intersected with any visitor-silent audience is empty by
 * construction.
 *
 * An empty set matches nobody. A writer that missed `event_audiences` must not
 * roster the whole register, and the migration refuses to constrain a database
 * that still holds such an event.
 */
export function memberMatchesEventAudiences(
  audiences: readonly AudienceRule[],
  member: AudienceMember,
  date: string,
): boolean {
  if (audiences.length === 0) return false;
  return audiences.every((rule) => memberMatchesAudience(rule, member, date));
}
