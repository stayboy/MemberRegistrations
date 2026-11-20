import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { actorOf } from '../actor.js';
import { CodeExpiredError, CodeInvalidError, TooManyTriesError } from '../errors/domain-errors.js';
import { sendProblem } from '../errors/problem.js';
import { memberNoParamSchema } from '../schemas/common.js';
import type { VerificationService } from '../verification/service.js';

function memberNo(req: Request): string {
  return memberNoParamSchema.parse(req.params.memberNo);
}

const confirmationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const acceptSchema = z.object({
  token: z.string().trim().min(1).max(200),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

/** The officer-facing verification surface (MR-29, MR-31, MR-52). */
export function verificationRouter(service: VerificationService): Router {
  const router = Router();

  router.post('/:memberNo/verification/otp', async (req, res) => {
    const no = memberNo(req);
    const result = await service.issue(no);

    // MR-21: the log carries the member number and the channel only - never the
    // code, a destination value, a token or a hash.
    const logger = req.app.locals.logger as
      { info: (fields: Record<string, unknown>, message: string) => void } | undefined;
    logger?.info(
      { memberNo: no, channel: result.destination.channel },
      'member verification code issued',
    );

    res.setHeader('Cache-Control', 'no-store');
    res.status(202).json(result);
  });

  router.delete('/:memberNo/verification', async (req, res: Response) => {
    await service.revoke(memberNo(req), actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
  });

  router.post('/:memberNo/confirmation', async (req, res) => {
    const { reason } = confirmationSchema.parse(req.body);
    const result = await service.confirm(memberNo(req), reason, actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(result);
  });

  router.delete('/:memberNo/confirmation', async (req, res: Response) => {
    await service.withdrawConfirmation(memberNo(req), actorOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
  });

  return router;
}

/**
 * The public member acceptance page's endpoint (MR-51). Mounted outside `/v1`
 * and before the bearer gate: the single-use token and the six-digit code are
 * its credential, it answers no member data, and it is rate-limited per token
 * and per address.
 *
 * The code failures answer `400` here rather than the USSD code surfaces' `422`,
 * because the page distinguishes "wrong", "expired" and "too many" for a member
 * who has no session and no other feedback channel.
 */
export function publicVerificationRouter(service: VerificationService): Router {
  const router = Router();

  router.post('/verification/accept', async (req, res) => {
    const { token, code } = acceptSchema.parse(req.body);
    try {
      const result = await service.accept(token, code, new Date(), req.ip);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CodeInvalidError) {
        sendProblem(res, 400, 'Bad Request', error.message, 'code_invalid');
        return;
      }
      if (error instanceof CodeExpiredError) {
        sendProblem(res, 400, 'Bad Request', error.message, 'code_expired');
        return;
      }
      if (error instanceof TooManyTriesError) {
        sendProblem(res, 400, 'Bad Request', error.message, 'too_many_tries');
        return;
      }
      throw error;
    }
  });

  return router;
}
