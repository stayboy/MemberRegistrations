import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { sendProblem } from './errors/problem.js';

/** Bearer-token gate for the member routes. */
export function bearerAuth(expectedToken: string): RequestHandler {
  const expected = Buffer.from(expectedToken);

  return (req, res, next) => {
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      sendProblem(res, 401, 'Unauthorized', 'A bearer token is required.', 'unauthorized');
      return;
    }

    const provided = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      sendProblem(res, 401, 'Unauthorized', 'The bearer token is invalid.', 'unauthorized');
      return;
    }

    next();
  };
}
