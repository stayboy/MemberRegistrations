import type { Request } from 'express';
import { ValidationError } from './errors/domain-errors.js';

/**
 * Writes are attributed even though v1 authenticates with one shared token.
 * A shared token cannot tell two admins apart; the header can.
 */
export function actorOf(req: Request): string {
  const actor = req.header('x-actor-id')?.trim();
  if (!actor) {
    throw new ValidationError('X-Actor-Id is required on write requests');
  }
  if (actor.length > 100) {
    throw new ValidationError('X-Actor-Id must be at most 100 characters');
  }
  return actor;
}
