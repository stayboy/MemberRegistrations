import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { UnauthorizedError, ValidationError } from '../errors/domain-errors.js';
import type { PaymentGroupRepository } from '../repos/payment-groups.js';
import { paymentCallbackSchema } from '../schemas/payment-groups.js';

function verified(raw: Buffer, signature: string, secret: string): boolean {
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'utf8');
  const provided = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/**
 * The gateway callback is mounted before the bearer gate and before the global
 * JSON parser, so the HMAC covers the exact raw body.
 */
export function paymentsRouter(repo: PaymentGroupRepository, secret: string): Router {
  const router = Router();

  router.post('/callback', async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.header('x-payment-signature');
    if (!signature || !verified(raw, signature, secret)) {
      throw new UnauthorizedError('A valid X-Payment-Signature is required');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new ValidationError('The callback body is not valid JSON');
    }
    const input = paymentCallbackSchema.parse(payload);
    const rawBodyHash = createHash('sha256').update(raw).digest('hex');
    const result = await repo.handleCallback(input, rawBodyHash);

    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  });

  return router;
}
