import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { ConflictError, ImportError, NotFoundError, ValidationError } from './domain-errors.js';

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
}

export function problemBody(
  status: number,
  title: string,
  detail?: string,
  code = `http_${status}`,
): ProblemBody {
  return {
    type: 'about:blank',
    title,
    status,
    ...(detail ? { detail } : {}),
    code,
  };
}

export function sendProblem(
  res: Response,
  status: number,
  title: string,
  detail?: string,
  code?: string,
): void {
  res
    .status(status)
    .type('application/problem+json')
    .json(problemBody(status, title, detail, code));
}

export const notFoundHandler: RequestHandler = (req, res) => {
  sendProblem(res, 404, 'Not Found', `No route for ${req.method} ${req.path}`, 'route_not_found');
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return;

  const errorType = (error as { type?: string })?.type;
  if (errorType === 'entity.parse.failed') {
    sendProblem(res, 400, 'Malformed request body', 'The body is not valid JSON.', 'invalid_json');
    return;
  }

  if (errorType === 'entity.too.large') {
    sendProblem(
      res,
      413,
      'Payload too large',
      'The request body exceeds the 1 MB limit.',
      'payload_too_large',
    );
    return;
  }

  if (error instanceof ZodError) {
    const detail = error.issues
      .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
      .join('; ');
    sendProblem(res, 422, 'Validation failed', detail, 'validation_error');
    return;
  }

  if (error instanceof ImportError) {
    sendProblem(res, 422, 'Import rejected', error.message, 'import_failed');
    return;
  }

  if (error instanceof ValidationError) {
    sendProblem(res, 422, 'Validation failed', error.message, error.code);
    return;
  }

  if (error instanceof NotFoundError) {
    sendProblem(res, 404, 'Not Found', error.message, 'not_found');
    return;
  }

  if (error instanceof ConflictError) {
    sendProblem(res, 409, 'Conflict', error.message, 'conflict');
    return;
  }

  const pgCode = (error as { code?: string }).code;
  if (pgCode === '23503') {
    sendProblem(res, 409, 'Conflict', 'A referenced record does not exist.', 'conflict');
    return;
  }
  if (pgCode === '23514') {
    sendProblem(
      res,
      422,
      'Validation failed',
      'A database constraint rejected the value.',
      'validation_error',
    );
    return;
  }

  console.error('Unhandled error', error);
  sendProblem(res, 500, 'Internal Server Error', undefined, 'internal_error');
};
