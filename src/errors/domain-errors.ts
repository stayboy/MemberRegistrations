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

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'not_found');
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

/** The same occurrence and rows were already imported; nothing was applied. */
export class DuplicateImportError extends ConflictError {
  constructor(
    message: string,
    readonly batchId: string,
  ) {
    super(message);
  }
}
