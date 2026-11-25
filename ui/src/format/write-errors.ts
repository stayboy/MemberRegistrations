import { problemCode } from '../api/errors';

/**
 * The write-failure banner's text (FR-42g, AC-64). The surface is chosen by the
 * problem+json `code`, never by the message text: several `409`s share a status,
 * so a title keyed on the message would collapse them. The body stays the API's
 * own `detail`, which is the operator-facing sentence.
 *
 * `reason_required` is listed because the API owns the rule even though the
 * dialog also validates it locally; the other codes are the ones the event
 * detail's verbs can return.
 */
const CODE_TITLES: Readonly<Record<string, string>> = {
  event_draft: 'The event is still a draft',
  recurrence: 'This event has no recurrence to change',
  recurrence_locked: 'The schedule cannot change',
  status: 'The API refused this status change',
  reason_required: 'A cancellation reason is required',
};

export interface WriteFailure {
  /** The banner's title: the code's own sentence, or the surface's fallback. */
  readonly title: string;
  /** The API's detail, or a connection sentence when the body carried none. */
  readonly message: string;
}

/** `fallbackTitle` names what the operator was doing when no code is recognised. */
export function writeFailure(error: unknown, fallbackTitle: string): WriteFailure {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Check the API connection and try again.';
  const code = problemCode(error);
  const title = (code ? CODE_TITLES[code] : undefined) ?? fallbackTitle;

  return { title, message };
}
