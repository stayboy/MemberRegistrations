import { createHmac, randomUUID } from 'node:crypto';
import { Router, json, type Response } from 'express';
import { z } from 'zod';
import { sendProblem } from '../errors/problem.js';
import type { UssdAdapter, UssdAdapterRequest } from '../ussd/adapters.js';
import type { UssdPipelineDeps } from '../ussd/pipeline.js';
import { executeUssdAdapter, sendUssdRateLimit } from './ussd.js';

export interface DevUssdConfig {
  enabled: boolean;
  gatewaySecret: string;
  naloUserId: string;
}

const devBodySchema = z.object({
  provider: z.enum(['nalo', 'hmac']),
  phone: z.string().min(1).max(32),
  sessionId: z.string().min(1).max(128).optional(),
  input: z.string().trim().max(64).optional().default(''),
  seq: z.number().int().nonnegative().optional(),
});

function notInProduction(res: Response): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  sendProblem(
    res,
    404,
    'Not Found',
    'The USSD simulator is not available in production.',
    'not_found',
  );
  return true;
}

function disabled(res: Response, enabled: boolean): boolean {
  if (enabled) return false;
  sendProblem(
    res,
    503,
    'Service Unavailable',
    'USSD is disabled by configuration.',
    'ussd_disabled',
  );
  return true;
}

/**
 * The dev-only gateway player. It builds the provider wire server-side so no
 * gateway secret or `USSD_NALO_USER_ID` ever reaches a browser, then runs the
 * same adapter and session pipeline as the provider route.
 */
export function devUssdRouter(
  adapters: UssdAdapter[],
  deps: UssdPipelineDeps,
  config: DevUssdConfig,
): Router {
  const router = Router();

  router.post(
    '/dev/ussd/session',
    (req, res, next) => {
      if (notInProduction(res)) return;
      if (disabled(res, config.enabled)) return;
      next();
    },
    // Parsed after the guards so a production boot answers 404 even for a
    // malformed body.
    json({ limit: '64kb' }),
    async (req, res) => {
      const body = devBodySchema.parse(req.body);
      const adapter = adapters.find((candidate) => candidate.id === body.provider);
      if (!adapter) {
        sendProblem(
          res,
          422,
          'Validation failed',
          'Unsupported USSD provider.',
          'validation_error',
        );
        return;
      }

      const ip = req.ip;
      let request: UssdAdapterRequest;
      let sessionId: string;

      if (body.provider === 'hmac') {
        const session = body.sessionId ? await deps.repo.loadSession(body.sessionId) : null;
        const seq = body.seq ?? (session ? session.lastInputSeq + 1 : 1);
        const frame = {
          phone: body.phone,
          ...(body.sessionId ? { sessionId: body.sessionId } : {}),
          input: body.input,
          seq,
        };
        const raw = Buffer.from(JSON.stringify(frame));
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = `dev-${randomUUID()}`;
        const signature = createHmac('sha256', config.gatewaySecret)
          .update(`${timestamp}${nonce}${raw.toString('utf8')}`)
          .digest('hex');
        request = {
          raw,
          headers: {
            'x-ussd-timestamp': timestamp,
            'x-ussd-nonce': nonce,
            'x-ussd-signature': signature,
          },
          ip,
        };
        sessionId = body.sessionId ?? '';
      } else {
        const externalId = body.sessionId ?? `devnalo-${randomUUID()}`;
        const raw = Buffer.from(
          JSON.stringify({
            USERID: config.naloUserId,
            MSISDN: body.phone,
            USERDATA: body.input,
            MSGTYPE: body.sessionId === undefined,
            NETWORK: 'dev',
            SESSIONID: externalId,
          }),
        );
        request = { raw, headers: { 'content-type': 'application/json' }, ip };
        sessionId = externalId;
      }

      try {
        const { render, wire } = await executeUssdAdapter(adapter, request, deps);
        if (body.provider === 'hmac') sessionId = render.sessionId;
        const text =
          body.provider === 'nalo'
            ? ((wire as { MSG: string }).MSG ?? render.text)
            : ((wire as { text: string }).text ?? render.text);
        res.setHeader('Cache-Control', 'no-store');
        res.json({
          provider: body.provider,
          sessionId,
          text,
          done: render.done,
          state: render.state,
          wire,
        });
      } catch (error) {
        if (!sendUssdRateLimit(res, error)) throw error;
      }
    },
  );

  return router;
}
