/**
 * The fixed skip precedence and the cadence filter
 * (member-registrations-event-notifications.md N-5, N-6; FR-9, FR-10).
 *
 * One pure decision, so two surfaces cannot report different reasons for the
 * same skipped delivery. The precedence is the contract: the first applicable
 * reason is the one recorded, `channel_blocked` always before a mute, a mute
 * before cadence, cadence before a missing destination.
 */

export type Cadence = 'all' | 'essential' | 'minimal';

export type SkipReason =
  'channel_blocked' | 'event_muted' | 'period_muted' | 'cadence_filtered' | 'no_contact';

export type SkipKind = 'announce' | 'reminder' | 'starts' | 'last' | 'change';

export interface OccurrenceCadence {
  /** The occurrence has a `starts` instance in the published plan. */
  hasStarts: boolean;
  /** The occurrence has a `last` instance. */
  hasLast: boolean;
  /** This instance is the occurrence's first by `sendAt`. */
  isFirst: boolean;
  /** This instance is the occurrence's last by `sendAt`. */
  isLast: boolean;
}

/**
 * Cadence is evaluated per occurrence (N-6). `minimal` keeps `starts` and
 * `last`; when the plan has neither, the occurrence's first and last instance
 * stand in, so a member is never silent.
 */
export function cadenceAllows(
  cadence: Cadence,
  kind: SkipKind,
  occurrence: OccurrenceCadence,
): boolean {
  if (cadence === 'all') return true;
  if (cadence === 'essential') return kind !== 'reminder';

  if (kind === 'starts' || kind === 'last') return true;
  if (!occurrence.hasStarts && occurrence.isFirst) return true;
  if (!occurrence.hasLast && occurrence.isLast) return true;
  return false;
}

export interface SkipInput {
  channelBlocked: boolean;
  eventMuted: boolean;
  periodMuted: boolean;
  cadenceAllowed: boolean;
  hasDestination: boolean;
}

/** The first applicable reason, in FR-9's order; null means deliver. */
export function evaluateSkip(input: SkipInput): SkipReason | null {
  if (input.channelBlocked) return 'channel_blocked';
  if (input.eventMuted) return 'event_muted';
  if (input.periodMuted) return 'period_muted';
  if (!input.cadenceAllowed) return 'cadence_filtered';
  if (!input.hasDestination) return 'no_contact';
  return null;
}
