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
  constructor(message: string) {
    super(message, 'validation_error');
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'not_found');
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'conflict');
  }
}

/** A whole-file import failure: nothing was applied. */
export class ImportError extends DomainError {
  constructor(message: string) {
    super(message, 'import_failed');
  }
}
