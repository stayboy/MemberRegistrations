/** Typed domain failures. The HTTP layer maps them to problem+json. */

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, code = 'validation_error') {
    super(message, code);
  }
}

/** A syntactically valid request whose values cannot be used as asked. */
export class BadRequestError extends DomainError {
  constructor(message: string, code = 'bad_request') {
    super(message, code);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, code = 'not_found') {
    super(message, code);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, code = 'conflict') {
    super(message, code);
  }
}

/** The terms body was built from a version that is no longer current. */
export class TermsVersionConflictError extends ConflictError {
  constructor(message: string) {
    super(message, 'terms_version_conflict');
  }
}

/** The offering already has an active attachment on this event or series. */
export class OfferingAlreadyAttachedError extends ConflictError {
  constructor(message: string) {
    super(message, 'offering_already_attached');
  }
}

/** A cancelled, archived, past event or an archived series cannot take attachments. */
export class EventNotActiveError extends ConflictError {
  constructor(message: string) {
    super(message, 'event_not_active');
  }
}

/** An exception date the event or series does not support for that kind. */
export class InvalidExceptionDateError extends ValidationError {
  constructor(message: string) {
    super(message, 'invalid_exception_date');
  }
}

/** A gift's session date is not one of the event's live sessions. */
export class SessionNotInEventError extends ValidationError {
  constructor(message: string) {
    super(message, 'session_not_in_event');
  }
}

/** The offering is not actively attached to the event or its series. */
export class OfferingNotOnEventError extends ValidationError {
  constructor(message: string) {
    super(message, 'offering_not_on_event');
  }
}

/** A gift is dated after the offering's effective expiry for that event. */
export class OfferingExpiredError extends ValidationError {
  constructor(message: string) {
    super(message, 'offering_expired');
  }
}

/** No active presbyter can follow this pledge up. */
export class OfficerRequiredError extends ValidationError {
  constructor(message: string) {
    super(message, 'officer_required');
  }
}

/** A pledge expected date cannot be in the past at creation. */
export class InvalidExpectedDateError extends ValidationError {
  constructor(message: string) {
    super(message, 'invalid_expected_date');
  }
}

/** A manually scheduled reminder cannot be dated in the past. */
export class InvalidReminderDateError extends ValidationError {
  constructor(message: string) {
    super(message, 'invalid_reminder_date');
  }
}

/** An honored or dishonored pledge accepts no further transition. */
export class PledgeAlreadyTerminalError extends ConflictError {
  constructor(message: string) {
    super(message, 'pledge_already_terminal');
  }
}

/** The idempotency key was first used for a different canonical payload. */
export class IdempotencyConflictError extends ConflictError {
  constructor(message: string) {
    super(message, 'idempotency_conflict');
  }
}

/** The gateway could not accept a payment group; the whole commit rolled back. */
export class PaymentFailedError extends DomainError {
  constructor(message: string) {
    super(message, 'payment_failed');
  }
}

/** Missing, invalid, expired or revoked credentials. */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication is required.') {
    super(message, 'unauthorized');
  }
}

/** The member already has a shepherd; the caller must confirm with the current assignment id. */
export interface CurrentAssignment {
  id: string;
  officerMemberNo: string;
  assignedOn: string;
}

export class ReassignmentRequiredError extends ConflictError {
  constructor(
    message: string,
    readonly currentAssignment: CurrentAssignment,
  ) {
    super(message);
  }
}

/** One 1-based data row named by an `import_failed` report. */
export interface ImportRowError {
  row: number;
  message: string;
}

/** A whole-file import failure: nothing was applied. */
export class ImportError extends DomainError {
  constructor(
    message: string,
    readonly rows?: ImportRowError[],
  ) {
    super(message, 'import_failed');
  }
}

/** A one-time code matched no stored hash, or its purpose did not match. */
export class CodeInvalidError extends ValidationError {
  constructor(message = 'The code is not valid for this action') {
    super(message, 'code_invalid');
  }
}

/** A one-time code is past its 15-minute TTL. */
export class CodeExpiredError extends ValidationError {
  constructor(message = 'The code has expired') {
    super(message, 'code_expired');
  }
}

/** A one-time code has already been redeemed. */
export class CodeUsedError extends ConflictError {
  constructor(message = 'The code has already been used') {
    super(message, 'code_used');
  }
}

/** A one-time code was voided before it could be redeemed. */
export class CodeVoidedError extends ValidationError {
  constructor(message = 'The code has been voided') {
    super(message, 'code_voided');
  }
}

/** The code exists but belongs to a different event session. */
export class CodeWrongSessionError extends ValidationError {
  constructor(message = 'The code belongs to a different event session') {
    super(message, 'code_wrong_session');
  }
}

/** Too many code attempts from one phone hash in the fixed window. */
export class TooManyTriesError extends DomainError {
  constructor(message = 'Too many attempts; try again later') {
    super(message, 'too_many_tries');
  }
}

/** The session was closed by an ended capture; no further capture is accepted. */
export class SessionClosedError extends ConflictError {
  constructor(message = 'This session is closed; no further capture is accepted') {
    super(message, 'session_closed');
  }
}

/** The member already has an attendance row for that event session. */ export class AlreadyClockedError extends ConflictError {
  constructor(message = 'Attendance is already recorded for this member and session') {
    super(message, 'already_clocked');
  }
}

/** A registration request is decided once. */
export class RegistrationNotPendingError extends ConflictError {
  constructor(message = 'This registration request has already been decided') {
    super(message, 'registration_not_pending');
  }
}

/** The acting presbyter does not shepherd the member they tried to clock in. */
export class NotShepherdError extends ValidationError {
  constructor(message = 'The member is not actively shepherded by this presbyter') {
    super(message, 'not_shepherd');
  }
}

/** The actor is not a presbyter at all, so clocking authority cannot apply. */
export class NotPresbyterError extends ValidationError {
  constructor(message = 'This action requires a presbyter') {
    super(message, 'not_presbyter');
  }
}

/** Only a ranked senior presbyter may perform this clocking action. */
export class NotSeniorPresbyterError extends ValidationError {
  constructor(message = 'This action requires a senior presbyter') {
    super(message, 'not_senior_presbyter');
  }
}

/** A senior presbyter who is not recorded present must delegate clocking first. */
export class DelegateRequiredError extends ValidationError {
  constructor(message = 'Delegate clocking for this session before clocking members in') {
    super(message, 'delegate_required');
  }
}

/** One active clocking delegation already exists for the event session. */
export class DelegationExistsError extends ConflictError {
  constructor(message = 'A clocking delegation already exists for this event session') {
    super(message, 'delegation_exists');
  }
}

/** A money amount is not a positive integer in minor units. */
export class InvalidAmountError extends ValidationError {
  constructor(message: string) {
    super(message, 'invalid_amount');
  }
}

/** The member does not satisfy a welfare product's eligibility rules. */
export class NotEligibleError extends ValidationError {
  constructor(message: string) {
    super(message, 'not_eligible');
  }
}

/** The subscription has ended and cannot take a renewal, payment or claim. */
export class SubscriptionNotActiveError extends ConflictError {
  constructor(message: string) {
    super(message, 'subscription_not_active');
  }
}

/** The period is still covered, so there is no unpaid period to record. */
export class PeriodAlreadyPaidError extends ConflictError {
  constructor(message: string) {
    super(message, 'period_already_paid');
  }
}

/** The member is not actively covered by the subscription. */
export class NotCoveredError extends NotFoundError {
  constructor(message: string) {
    super(message, 'not_covered');
    this.name = 'NotCoveredError';
  }
}

/** A claim is decided once from pending, and paid once from approved. */
export class ClaimNotPendingError extends ConflictError {
  constructor(message: string) {
    super(message, 'claim_not_pending');
  }
}

/** A membership card number already belongs to another member. */
export class CardInUseError extends ConflictError {
  constructor(message: string) {
    super(message, 'card_in_use');
  }
}
