import { ValidationError } from '../../errors/domain-errors.js';

/**
 * The closed variable set (member-registrations-event-notifications.md N-7, FR-14).
 *
 * The server substitutes every variable; a browser never does. The set is closed
 * so "first name" cannot mean four different things across four channels, and an
 * unknown name is `422 unknown_variable` rather than a silent empty string.
 *
 * `{{flierUrl}}` is deliberately *not* in the body set: the flier is attached to
 * email and shown as the WhatsApp template header, and no channel body carries it
 * as a link (owner, 2026-11-25). It is available to email's plain-text
 * alternative, which a text-only mail client can read.
 */

export const NOTIFICATION_BODY_VARIABLES = [
  'firstName',
  'fullName',
  'eventName',
  'eventDate',
  'startTime',
  'endTime',
  'venue',
  'periodName',
  'memberNo',
  'churchName',
] as const;

export const NOTIFICATION_FLIER_URL_VARIABLE = 'flierUrl' as const;

export type NotificationBodyVariable = (typeof NOTIFICATION_BODY_VARIABLES)[number];
export type NotificationVariable =
  NotificationBodyVariable | typeof NOTIFICATION_FLIER_URL_VARIABLE;

/** The email plain-text alternative may name the flier URL. */
export const EMAIL_TEXT_VARIABLES: readonly string[] = [
  ...NOTIFICATION_BODY_VARIABLES,
  NOTIFICATION_FLIER_URL_VARIABLE,
];

export interface NotificationValues {
  firstName: string | null;
  fullName: string | null;
  eventName: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  periodName: string | null;
  memberNo: string | null;
  churchName: string | null;
  flierUrl: string | null;
}

const VARIABLE_PATTERN = /\{\{([A-Za-z0-9_]+)\}\}/g;

/** Every `{{name}}` in the text, in order of first appearance. */
export function variablesIn(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) seen.add(match[1]!);
  return [...seen];
}

/**
 * Refuses an unknown variable by name, and — when `allowed` is supplied — a
 * variable this surface may not use (`{{flierUrl}}` outside email text).
 */
export function assertKnownVariables(
  text: string,
  allowed: readonly string[] = NOTIFICATION_BODY_VARIABLES,
): void {
  for (const name of variablesIn(text)) {
    if (!allowed.includes(name)) {
      throw new ValidationError(`unknown variable {{${name}}}`, 'unknown_variable');
    }
  }
}

/**
 * `{{firstName}}` falls back to the full name and then to "friend" (N-7); every
 * other null value renders empty rather than "null" or a placeholder.
 */
export function resolvedValues(values: NotificationValues): NotificationValues {
  const fullName = values.fullName?.trim() || null;
  const firstName = values.firstName?.trim() || fullName || 'friend';
  return { ...values, firstName, fullName };
}

/** HTML escaping for the one rich channel. Text is escaped, never trusted. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function valueOf(values: NotificationValues, name: string): string {
  return (values as unknown as Record<string, string | null>)[name] ?? '';
}

/** Plain-text substitution (SMS, USSD, WhatsApp values, email text). */
export function substitutePlain(
  text: string,
  values: NotificationValues,
  allowed: readonly string[] = NOTIFICATION_BODY_VARIABLES,
): string {
  assertKnownVariables(text, allowed);
  return text.replaceAll(VARIABLE_PATTERN, (_match, name: string) => valueOf(values, name));
}

/** HTML substitution: each value is escaped before it joins the document. */
export function substituteHtml(
  text: string,
  values: NotificationValues,
  allowed: readonly string[] = NOTIFICATION_BODY_VARIABLES,
): string {
  assertKnownVariables(text, allowed);
  return text.replaceAll(VARIABLE_PATTERN, (_match, name: string) =>
    escapeHtml(valueOf(values, name)),
  );
}
