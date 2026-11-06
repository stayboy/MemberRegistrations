import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { UnauthorizedError, ValidationError } from '../errors/domain-errors.js';
import { sendProblem } from '../errors/problem.js';
import type { UssdRepository, UssdSessionRow } from '../repos/ussd.js';
import {
  advance,
  render,
  type Rendered,
  type UssdOption,
  type UssdServices,
  type UssdSessionInfo,
  type UssdState,
} from '../ussd/machine.js';
import { t } from '../ussd/glossary.js';

export interface UssdConfig {
  enabled: boolean;
  gatewaySecret: string;
  phonePepper: string;
  codePepper: string;
  /** Declared paged-list sizes; 24d's Nalo adapter will declare 2 and 3. */
  pageSize?: { events: number; offerings: number };
}

const NONCE_MIN = 8;
const NONCE_MAX = 128;
const MAX_CLOCK_SKEW_SECONDS = 300;
const SESSION_IDLE_MINUTES = 3;
const NONCE_MINUTES = 10;
const PHONE_LIMIT = 10;
const IP_LIMIT = 30;

const bodySchema = z.object({
  phone: z.string().min(1).max(32),
  sessionId: z.string().uuid().optional(),
  input: z.string().trim().max(64).optional().default(''),
  seq: z.number().int().nonnegative(),
});

function normalizePhone(value: string): string {
  const digits = value.trim().replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 7 || digits.length > 20) {
    throw new ValidationError('phone must contain 7-20 digits');
  }
  return digits;
}

function signatureValid(
  raw: Buffer,
  timestamp: string,
  nonce: string,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(
    createHmac('sha256', secret).update(timestamp).update(nonce).update(raw).digest('hex'),
    'utf8',
  );
  const provided = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function expiresAt(minutes = SESSION_IDLE_MINUTES): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function sessionInfo(
  phone: string,
  phoneHash: string,
  member: Awaited<ReturnType<UssdRepository['findOwnedMember']>>,
  pageSize: { events: number; offerings: number },
): UssdSessionInfo {
  return {
    phone,
    phoneHash,
    member,
    anonymous: member === null,
    pageSize,
  };
}

/**
 * The aggregator entry. Mounted outside `/v1` and before the global JSON
 * parser, so the HMAC covers the exact raw frame.
 */
export function ussdRouter(
  repo: UssdRepository,
  services: UssdServices,
  config: UssdConfig,
): Router {
  const router = Router();

  router.post('/session', async (req, res) => {
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

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const timestamp = req.header('x-ussd-timestamp');
    const nonce = req.header('x-ussd-nonce');
    const signature = req.header('x-ussd-signature');
    if (!timestamp || !nonce || !signature) {
      throw new UnauthorizedError(
        'X-USSD-Timestamp, X-USSD-Nonce and X-USSD-Signature are required',
      );
    }
    if (nonce.length < NONCE_MIN || nonce.length > NONCE_MAX) {
      throw new UnauthorizedError('X-USSD-Nonce must be 8-128 characters');
    }
    const seconds = Number(timestamp);
    if (
      !Number.isInteger(seconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - seconds) > MAX_CLOCK_SKEW_SECONDS
    ) {
      throw new UnauthorizedError('X-USSD-Timestamp is outside the five-minute window');
    }
    if (!signatureValid(raw, timestamp, nonce, signature, config.gatewaySecret)) {
      throw new UnauthorizedError('A valid X-USSD-Signature is required');
    }
    if (!(await repo.consumeNonce(nonce, expiresAt(NONCE_MINUTES)))) {
      throw new UnauthorizedError('X-USSD-Nonce was already used');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new ValidationError('The USSD body is not valid JSON');
    }
    const body = bodySchema.parse(payload);
    const phone = normalizePhone(body.phone);
    const phoneHash = createHmac('sha256', config.phonePepper).update(phone).digest('hex');

    // Fixed-window counters live in Postgres, keyed by the phone hash and the
    // client address; rejecting here writes no session rows.
    if (!(await repo.consumeRateLimit(`ussd:phone:${phoneHash}`, PHONE_LIMIT, 1))) {
      sendProblem(
        res,
        429,
        'Too Many Requests',
        'Too many USSD frames for this phone.',
        'rate_limited',
      );
      return;
    }
    const address = req.ip ?? 'unknown';
    if (!(await repo.consumeRateLimit(`ussd:ip:${address}`, IP_LIMIT, 1))) {
      sendProblem(
        res,
        429,
        'Too Many Requests',
        'Too many USSD frames from this address.',
        'rate_limited',
      );
      return;
    }

    const member = await repo.findOwnedMember(phone);
    const info = sessionInfo(
      phone,
      phoneHash,
      member,
      config.pageSize ?? { events: 3, offerings: 5 },
    );
    const input = body.input.trim();

    let session: UssdSessionRow | null = null;
    let expiredNotice = false;
    if (body.sessionId) {
      const loaded = await repo.loadSession(body.sessionId);
      if (loaded && loaded.phoneHash === phoneHash) {
        if (new Date(loaded.expiresAt).getTime() > Date.now()) {
          session = loaded;
        } else {
          await repo.resetSession(loaded.id, { lastInputSeq: body.seq });
          session = await repo.loadSession(loaded.id);
          expiredNotice = true;
        }
      } else {
        expiredNotice = true;
      }
    }

    if (!session) {
      const id = await repo.createSession({
        phoneHash,
        memberId: member?.id ?? null,
        anonymous: member === null,
      });
      session = await repo.loadSession(id);
    }

    let state = (session!.state as UssdState) ?? 'main';
    let context = session!.context;
    let lastInputSeq = session!.lastInputSeq;
    let rendered: Rendered;
    let done = false;

    if (expiredNotice) {
      const main = render('main', {}, info, services);
      state = 'main';
      context = {};
      lastInputSeq = body.seq;
      rendered = { ...main, text: `${t('error.session_expired')}\n${main.text}` };
    } else if (input === '') {
      // The aggregator's opening frame carries no keypress; render the current
      // screen and do not count it as an invalid choice.
      rendered = render(state, context, info, services);
      if (session!.lastInputSeq === 0) lastInputSeq = body.seq;
    } else if (body.seq <= session!.lastInputSeq) {
      // Aggregator retry: re-render the current prompt and never advance or charge.
      rendered = render(state, context, info, services);
    } else {
      const result = await advance(state, context, input, info, services);
      state = result.state;
      context = result.context;
      lastInputSeq = body.seq;
      done = result.done;
      if (result.text !== undefined) {
        rendered = { state, text: result.text, done, options: [], context };
      } else {
        rendered = render(state, context, info, services);
      }
    }

    done = done || rendered.done;
    await repo.touchSession(session!.id, {
      state,
      context,
      lastInputSeq,
      expiresAt: expiresAt(),
    });

    const options: UssdOption[] = rendered.options;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      sessionId: session!.id,
      text: rendered.text,
      done,
      state,
      options,
    });
  });

  return router;
}
