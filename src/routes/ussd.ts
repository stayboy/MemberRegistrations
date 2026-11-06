import { Router, type Response } from 'express';
import { sendProblem } from '../errors/problem.js';
import type { UssdAdapter, UssdAdapterRequest } from '../ussd/adapters.js';
import {
  runUssdFrame,
  UssdRateLimitError,
  type UssdPipelineDeps,
  type UssdRender,
} from '../ussd/pipeline.js';

export interface UssdRouteConfig {
  enabled: boolean;
}

export interface UssdAdapterResult {
  render: UssdRender;
  wire: unknown;
}

/**
 * The one adapter execution seam shared by the thin provider routes and the
 * dev-only gateway: authenticate, map to the internal frame, run the untouched
 * session pipeline, map back to the provider wire.
 */
export async function executeUssdAdapter(
  adapter: UssdAdapter,
  request: UssdAdapterRequest,
  deps: UssdPipelineDeps,
): Promise<UssdAdapterResult> {
  await adapter.authenticator(request);
  const frame = await adapter.toFrame(request);
  const render = await runUssdFrame(frame, deps, {
    pageSize: adapter.pageSize,
    ip: request.ip,
  });
  const wire = await adapter.toWire(render, request);
  return { render, wire };
}

/** The fixed-window 429 is provider-neutral; write it exactly as before. */
export function sendUssdRateLimit(res: Response, error: unknown): boolean {
  if (!(error instanceof UssdRateLimitError)) return false;
  sendProblem(res, 429, 'Too Many Requests', error.detail, 'rate_limited');
  return true;
}

/** One thin route per registered adapter, all behind the USSD switch. */
export function ussdRouter(
  adapters: UssdAdapter[],
  deps: UssdPipelineDeps,
  config: UssdRouteConfig,
): Router {
  const router = Router();

  for (const adapter of adapters) {
    router.post(adapter.route, async (req, res) => {
      if (!config.enabled) {
        sendProblem(
          res,
          503,
          'Service Unavailable',
          'USSD is disabled by configuration.',
          'ussd_disabled',
        );
        return;
      }

      const request: UssdAdapterRequest = {
        raw: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
        headers: req.headers,
        ip: req.ip,
      };
      try {
        const { wire } = await executeUssdAdapter(adapter, request, deps);
        res.setHeader('Cache-Control', 'no-store');
        res.json(wire);
      } catch (error) {
        if (!sendUssdRateLimit(res, error)) throw error;
      }
    });
  }

  return router;
}
